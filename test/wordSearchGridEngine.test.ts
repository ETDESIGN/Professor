import { describe, it, expect } from 'vitest';
import {
  buildGrid,
  gridSizeFor,
  hashString,
  lineBetween,
  lettersAlong,
  matchSegment,
  mulberry32,
  normalizeWord,
  snapLine,
  DIRECTIONS_EASY,
  type GridWord,
} from '../apps/board/templates/wordSearch/gridEngine';

const WORDS: GridWord[] = [
  { id: 'w-cat', letters: 'CAT' },
  { id: 'w-dancer', letters: 'DANCER' },
  { id: 'w-musician', letters: 'MUSICIAN' },
  { id: 'w-pilot', letters: 'PILOT' },
  { id: 'w-nurse', letters: 'NURSE' },
];

describe('normalizeWord', () => {
  it('strips to uppercase A-Z', () => {
    expect(normalizeWord('Ice-Cream')).toBe('ICECREAM');
    expect(normalizeWord("don't")).toBe('DONT');
    expect(normalizeWord('  café ')).toBe('CAF'); // é is non A-Z
  });
});

describe('gridSizeFor', () => {
  it('is at least 8 and at most 10', () => {
    expect(gridSizeFor(WORDS)).toBe(8); // longest is MUSICIAN (7) → floor 8
    expect(gridSizeFor([{ id: 'x', letters: 'ASTRONAUT' }])).toBe(9);
    expect(gridSizeFor([{ id: 'x', letters: 'CONVERSATION' }])).toBe(10);
  });
});

describe('mulberry32 / hashString', () => {
  it('is deterministic per seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });
  it('hashString is stable and differs across keys', () => {
    expect(hashString('unit|1')).toBe(hashString('unit|1'));
    expect(hashString('unit|1')).not.toBe(hashString('unit|2'));
  });
});

describe('lineBetween', () => {
  it('walks rows, columns and diagonals', () => {
    expect(lineBetween({ row: 0, col: 0 }, { row: 0, col: 3 })).toHaveLength(4);
    expect(lineBetween({ row: 1, col: 2 }, { row: 4, col: 2 })).toHaveLength(4);
    expect(lineBetween({ row: 0, col: 0 }, { row: 2, col: 2 })).toHaveLength(3);
    expect(lineBetween({ row: 2, col: 0 }, { row: 0, col: 2 })).toHaveLength(3);
  });
  it('rejects non-straight pairs and returns [a] for a===b', () => {
    expect(lineBetween({ row: 0, col: 0 }, { row: 1, col: 3 })).toBeNull();
    expect(lineBetween({ row: 3, col: 3 }, { row: 3, col: 3 })).toEqual([{ row: 3, col: 3 }]);
  });
});

describe('snapLine', () => {
  it('projects a drifted target onto the nearest valid direction', () => {
    // Drag aimed right but 1 row low → snaps to the horizontal line.
    const cells = snapLine({ row: 2, col: 1 }, { row: 3, col: 4 }, 8);
    expect(cells).toEqual([
      { row: 2, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 },
    ]);
  });
  it('clamps inside the grid', () => {
    const cells = snapLine({ row: 0, col: 0 }, { row: -5, col: -5 }, 8);
    expect(cells.every((c) => c.row >= 0 && c.col >= 0)).toBe(true);
  });
});

describe('buildGrid', () => {
  it('places every word findable on the board', () => {
    const grid = buildGrid(WORDS, { seed: 1234 });
    expect(grid.unplaced).toEqual([]);
    expect(grid.size).toBe(8);
    for (const p of grid.placements) {
      const spelled = lettersAlong(p.cells, grid);
      expect(spelled).toBe(p.letters.join(''));
    }
  });

  it('fills every cell with a letter', () => {
    const grid = buildGrid(WORDS, { seed: 99 });
    for (let r = 0; r < grid.size; r++) {
      for (let c = 0; c < grid.size; c++) {
        expect(grid.cells[r][c]).toMatch(/^[A-Z]$/);
      }
    }
  });

  it('is deterministic for the same seed and input order', () => {
    const a = buildGrid(WORDS, { seed: 7 });
    const b = buildGrid(WORDS, { seed: 7 });
    expect(a.cells).toEqual(b.cells);
    expect(a.placements).toEqual(b.placements);
  });

  it('never conflicts: overlapping cells always share the same letter', () => {
    const grid = buildGrid(WORDS, { seed: 555 });
    const byCell = new Map<string, string[]>();
    for (const p of grid.placements) {
      p.cells.forEach((cell, i) => {
        const key = `${cell.row},${cell.col}`;
        const list = byCell.get(key) || [];
        list.push(p.letters[i]);
        byCell.set(key, list);
      });
    }
    for (const list of byCell.values()) {
      expect(new Set(list).size).toBe(1);
    }
  });

  it('places at least the words when restricted to easy directions', () => {
    const grid = buildGrid(WORDS, { seed: 21, directions: DIRECTIONS_EASY });
    // With a 8x8 grid and 5 short words, every word should still fit.
    expect(grid.placements).toHaveLength(WORDS.length);
    // All placements run right or down only.
    for (const p of grid.placements) {
      const [a, b] = [p.cells[0], p.cells[p.cells.length - 1]];
      const down = b.row > a.row && b.col === a.col;
      const right = b.col > a.col && b.row === a.row;
      expect(down || right).toBe(true);
    }
  });

  it('never places out of bounds', () => {
    const grid = buildGrid(WORDS, { seed: 31337 });
    for (const p of grid.placements) {
      for (const cell of p.cells) {
        expect(cell.row).toBeGreaterThanOrEqual(0);
        expect(cell.row).toBeLessThan(grid.size);
        expect(cell.col).toBeGreaterThanOrEqual(0);
        expect(cell.col).toBeLessThan(grid.size);
      }
    }
  });
});

describe('matchSegment', () => {
  const grid = buildGrid(WORDS, { seed: 1234 });
  const candidates = WORDS.filter((w) => grid.placements.some((p) => p.wordId === w.id));

  it('matches a word selected forwards', () => {
    const placement = grid.placements[0];
    const hit = matchSegment(placement.cells, grid, candidates);
    expect(hit?.id).toBe(placement.wordId);
  });

  it('matches the same word selected backwards', () => {
    const placement = grid.placements[1];
    const hit = matchSegment([...placement.cells].reverse(), grid, candidates);
    expect(hit?.id).toBe(placement.wordId);
  });

  it('rejects segments shorter than 3 cells', () => {
    expect(matchSegment([grid.placements[0].cells[0]], grid, candidates)).toBeNull();
    expect(matchSegment(grid.placements[0].cells.slice(0, 2), grid, candidates)).toBeNull();
  });

  it('rejects non-word segments', () => {
    // A deliberately wrong 3-cell horizontal line: take a placement's first
    // two cells then veer off (or just assert some junk line is not a match).
    const junk = [
      { row: 0, col: 0 },
      { row: 1, col: 1 },
      { row: 2, col: 2 },
      { row: 3, col: 3 },
    ];
    const spelled = lettersAlong(junk, grid);
    const isAWord = candidates.some((c) =>
      c.letters === spelled || c.letters === spelled.split('').reverse().join(''));
    if (!isAWord) {
      expect(matchSegment(junk, grid, candidates)).toBeNull();
    }
  });

  it('ignores already-found words when they are excluded from candidates', () => {
    const placement = grid.placements[0];
    const rest = candidates.filter((c) => c.id !== placement.wordId);
    expect(matchSegment(placement.cells, grid, rest)).toBeNull();
  });
});
