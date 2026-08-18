// Word Search grid engine — pure, deterministic, no React / no I/O.
//
// Placement, line math and segment matching for BoardWordSearch. Everything
// takes an explicit rng/seed so a (unitId, roundIndex) pair always rebuilds
// the identical grid on every board tab and across React re-renders
// (BoardUnscramble's buildSigRef pattern depends on this).
//
// Difficulty escalation (round ramp):
//   round 1 → DIRECTIONS_EASY   (right, down)
//   round 2 → DIRECTIONS_MEDIUM (+ left, up, ↘, ↖)
//   round 3 → DIRECTIONS_ALL    (all 8 vectors)

export interface Cell {
  row: number;
  col: number;
}

export interface WordPlacement {
  wordId: string;
  /** Normalized A-Z letters, start → end order. */
  letters: string[];
  /** Cells in the same order as letters. */
  cells: Cell[];
}

export interface SearchGrid {
  size: number;
  /** cells[row][col] = uppercase letter. */
  cells: string[][];
  placements: WordPlacement[];
  /** Word ids that could not be placed (defensive — should stay empty). */
  unplaced: string[];
}

/** A word as the engine needs it: a stable id + its normalized letters. */
export interface GridWord {
  id: string;
  letters: string;
}

// ── Deterministic RNG ──────────────────────────────────────────────────────
// Promoted to the shared util (FIXPLAN E1.1) so every live template seeds from
// the same primitives; re-exported here so existing WordSearch imports keep
// working unchanged.
import { mulberry32, hashString } from '../../../../services/seededRandom';
export { mulberry32, hashString };

// ── Word / grid sizing ─────────────────────────────────────────────────────

/** Uppercase A-Z only ("Ice-Cream" → "ICECREAM"). */
export function normalizeWord(word: string): string {
  return String(word || '').toUpperCase().replace(/[^A-Z]/g, '');
}

export const MIN_WORD_LENGTH = 3;
export const MIN_GRID = 8;
export const MAX_GRID = 10;

/** Adaptive square grid size: 8 floor, grows to the longest word, capped 10. */
export function gridSizeFor(words: readonly GridWord[]): number {
  let longest = MIN_WORD_LENGTH;
  for (const w of words) longest = Math.max(longest, w.letters.length);
  return Math.max(MIN_GRID, Math.min(MAX_GRID, longest));
}

// ── Directions ─────────────────────────────────────────────────────────────

export type Vec = readonly [number, number]; // [dr, dc]

export const DIRECTIONS_EASY: readonly Vec[] = [
  [0, 1], [1, 0],
];
export const DIRECTIONS_MEDIUM: readonly Vec[] = [
  [0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1],
];
export const DIRECTIONS_ALL: readonly Vec[] = [
  [0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1],
];

const ALL_VECTORS: readonly Vec[] = DIRECTIONS_ALL;

function inBounds(size: number, row: number, col: number): boolean {
  return row >= 0 && row < size && col >= 0 && col < size;
}

// ── Line math ──────────────────────────────────────────────────────────────

/**
 * The straight-line cells from a to b (inclusive) when they share a row,
 * column or perfect diagonal; null otherwise. a === b → [a].
 */
export function lineBetween(a: Cell, b: Cell): Cell[] | null {
  const dr = b.row - a.row;
  const dc = b.col - a.col;
  if (dr === 0 && dc === 0) return [{ ...a }];
  const straight =
    dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
  if (!straight) return null;
  const steps = Math.max(Math.abs(dr), Math.abs(dc));
  const sr = Math.sign(dr);
  const sc = Math.sign(dc);
  const cells: Cell[] = [];
  for (let i = 0; i <= steps; i++) {
    cells.push({ row: a.row + sr * i, col: a.col + sc * i });
  }
  return cells;
}

/**
 * Drag-friendly snapping: project (anchor → target) onto the nearest of the 8
 * directions and return that line's cells (length ≥ 1). This is how classic
 * word searches feel forgiving when the finger/mouse drifts off-axis.
 */
export function snapLine(anchor: Cell, target: Cell, size: number): Cell[] {
  const dr = target.row - anchor.row;
  const dc = target.col - anchor.col;
  if (dr === 0 && dc === 0) return [{ ...anchor }];

  let best: { cells: Cell[]; dist: number } | null = null;
  for (const [vr, vc] of ALL_VECTORS) {
    // Scalar projection of (dr,dc) onto the unit vector (vr,vc).
    const proj = dr * vr + dc * vc;
    if (proj <= 0) continue;
    const steps = Math.round(proj);
    const endRow = anchor.row + vr * steps;
    const endCol = anchor.col + vc * steps;
    if (!inBounds(size, endRow, endCol)) continue;
    // Perpendicular distance from target to this candidate end point.
    const er = endRow - target.row;
    const ec = endCol - target.col;
    const dist = er * er + ec * ec;
    if (!best || dist < best.dist) {
      const cells: Cell[] = [];
      for (let i = 0; i <= steps; i++) cells.push({ row: anchor.row + vr * i, col: anchor.col + vc * i });
      best = { cells, dist };
    }
  }
  if (best) return best.cells;
  return [{ ...anchor }];
}

// ── Grid construction ──────────────────────────────────────────────────────

export interface BuildGridOptions {
  /** Grid edge length; defaults to gridSizeFor(words). */
  size?: number;
  /** Allowed placement vectors for this difficulty. Defaults to all 8. */
  directions?: readonly Vec[];
  /** Deterministic seed (hashString of the round key upstream). */
  seed: number;
  /**
   * When true, filler letters are drawn from the placed words' own letter
   * pool ~45% of the time — decoys that look like real words (round 2+).
   */
  fillBias?: boolean;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PLACE_ATTEMPTS = 90;

/**
 * Place every word and fill the rest with random letters. Longest words place
 * first (classic heuristic — they're the hardest to fit). A word that fails
 * with the supplied directions gets one retry with all 8 before it is
 * surrendered to `unplaced` (callers drop those from the round).
 */
export function buildGrid(words: readonly GridWord[], opts: BuildGridOptions): SearchGrid {
  const size = opts.size ?? gridSizeFor(words);
  const directions = opts.directions && opts.directions.length > 0 ? opts.directions : DIRECTIONS_ALL;
  const rng = mulberry32(opts.seed);

  const cells: string[][] = Array.from({ length: size }, () => Array<string>(size).fill(''));
  const placements: WordPlacement[] = [];
  const unplaced: string[] = [];

  const usable = words
    .filter((w) => w.letters.length >= MIN_WORD_LENGTH && w.letters.length <= size)
    // Longest first; alphabetical tiebreak keeps identical inputs stable.
    .sort((a, b) => b.letters.length - a.letters.length || a.letters.localeCompare(b.letters));

  const tryPlace = (letters: string, dirs: readonly Vec[]): Cell[] | null => {
    for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
      const [vr, vc] = dirs[Math.floor(rng() * dirs.length)];
      const len = letters.length;
      // Random start whose end stays inside the grid.
      const startRow = Math.floor(rng() * size);
      const startCol = Math.floor(rng() * size);
      const endRow = startRow + vr * (len - 1);
      const endCol = startCol + vc * (len - 1);
      if (!inBounds(size, endRow, endCol)) continue;

      let fits = true;
      for (let i = 0; i < len; i++) {
        const r = startRow + vr * i;
        const c = startCol + vc * i;
        const existing = cells[r][c];
        // Shared letters may overlap (crossing words); conflicts reject.
        if (existing && existing !== letters[i]) { fits = false; break; }
      }
      if (!fits) continue;

      const path: Cell[] = [];
      for (let i = 0; i < len; i++) {
        const r = startRow + vr * i;
        const c = startCol + vc * i;
        cells[r][c] = letters[i];
        path.push({ row: r, col: c });
      }
      return path;
    }
    return null;
  };

  for (const w of usable) {
    let path = tryPlace(w.letters, directions);
    if (!path && directions !== DIRECTIONS_ALL) path = tryPlace(w.letters, ALL_VECTORS);
    if (path) placements.push({ wordId: w.id, letters: w.letters.split(''), cells: path });
    else unplaced.push(w.id);
  }

  // Filler letters: uniform A-Z, optionally biased toward the words' letters.
  const letterPool = placements.flatMap((p) => p.letters);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (cells[r][c]) continue;
      if (opts.fillBias && letterPool.length > 0 && rng() < 0.45) {
        cells[r][c] = letterPool[Math.floor(rng() * letterPool.length)];
      } else {
        cells[r][c] = ALPHABET[Math.floor(rng() * ALPHABET.length)];
      }
    }
  }

  return { size, cells, placements, unplaced };
}

// ── Segment matching ───────────────────────────────────────────────────────

/** The letters along a cell path (out-of-bounds cells read as ''). */
export function lettersAlong(path: readonly Cell[], grid: SearchGrid): string {
  let out = '';
  for (const { row, col } of path) {
    out += inBounds(grid.size, row, col) ? grid.cells[row][col] : '';
  }
  return out;
}

/**
 * Does this path spell one of the candidate (unfound) words — reading the
 * selected cells forwards OR backwards? Matching is by spelling, not by
 * placement coordinates: the segment is the ground truth the player can see,
 * and this stays correct even if filler letters coincidentally duplicate a
 * word elsewhere on the board.
 */
export function matchSegment(
  path: readonly Cell[],
  grid: SearchGrid,
  candidates: readonly GridWord[],
): GridWord | null {
  if (path.length < MIN_WORD_LENGTH) return null;
  const selected = lettersAlong(path, grid);
  if (selected.length !== path.length) return null;
  const reversed = selected.split('').reverse().join('');
  for (const cand of candidates) {
    if (cand.letters === selected || cand.letters === reversed) return cand;
  }
  return null;
}
