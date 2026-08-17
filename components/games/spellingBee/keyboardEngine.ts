// Spelling Bee keyboard engine — pure, deterministic, no React / no I/O.
//
// Owns the letter-slot layout and the adaptive distractor-elimination plan
// (the original game's "Remove letters" scaffolding): as the clock burns and
// mistakes mount, non-essential keys drop off the on-screen QWERTY keyboard
// until only the letters still needed remain. Everything takes an explicit
// rng/seed so a (unitId, wordId) pair always rebuilds the identical removal
// order on every board tab and across re-renders.
//
// Guarantees (unit-tested):
//   • a letter still needed by the word is NEVER removed;
//   • removals are monotonic within a word (budget only grows, and the
//     needed-set only shrinks as letters get typed);
//   • the same seed always yields the same removal order.

// ── Deterministic RNG (same contract as wordSearch/gridEngine) ─────────────

/** mulberry32 — small, fast, deterministic. 0 <= next() < 1. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable string → 32-bit seed (FNV-1a) for seeding from unitId/wordId keys. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ── Word normalization ─────────────────────────────────────────────────────

/** Uppercase A-Z only ("Ice-Cream" → "ICECREAM"). */
export function normalizeWord(word: string): string {
  return String(word || '').toUpperCase().replace(/[^A-Z]/g, '');
}

export const MIN_WORD_LENGTH = 3;
export const MAX_WORD_LENGTH = 12;
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const QWERTY_ROWS: readonly string[][] = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

// ── Letter-slot layout ─────────────────────────────────────────────────────

/** One cell of the input bar: a typeable letter or a pre-filled separator. */
export interface Slot {
  /** Display character (uppercase letter, or the separator itself). */
  char: string;
  /** Index into the normalized letters ("ICECREAM"); -1 for separators. */
  letterIndex: number;
}

/**
 * Layout of the input bar for a display word: separators (spaces, hyphens)
 * are pre-filled and skipped by the cursor; letters are typed in order.
 * ["ice", "cream"] would give I C E ␣ C R E A M with the space pre-filled.
 */
export function slotLayout(word: string): Slot[] {
  const out: Slot[] = [];
  let li = 0;
  for (const ch of String(word || '')) {
    const up = ch.toUpperCase();
    if (up >= 'A' && up <= 'Z') {
      out.push({ char: up, letterIndex: li });
      li += 1;
    } else if (ch === ' ' || ch === '-' || ch === "'") {
      out.push({ char: ch === ' ' ? ' ' : ch, letterIndex: -1 });
    }
    // Other characters never reach here (words are filtered upstream), but be
    // defensive and skip anything unexpected rather than break the bar.
  }
  return out;
}

// ── Adaptive distractor elimination ────────────────────────────────────────

/**
 * Letters still required to finish the word from `typedCount` letters typed
 * (the original's Ltarget).
 */
export function neededLetters(letters: string, typedCount: number): string[] {
  const remaining = letters.slice(Math.max(0, typedCount));
  return [...new Set(remaining.split(''))];
}

/**
 * How many distractor keys should be hidden right now. Cadence (owner
 * decision): one per wrong letter + one per quarter of the clock burned.
 * Hint presses (REVEAL_HINT) add a flat bonus each.
 */
export function removalBudget(
  mistakes: number,
  elapsedRatio: number,
  hintBonus: number,
): number {
  const elapsed = Number.isFinite(elapsedRatio) ? Math.max(0, Math.min(1, elapsedRatio)) : 0;
  return Math.max(0, mistakes + Math.floor(elapsed * 4) + hintBonus * 3);
}

/**
 * The set of keys hidden from the keyboard, given the word's state.
 * Deterministic per rng: the rng MUST be freshly seeded per word (seed from
 * hashString(`${unitId}|${wordId}`) upstream) so every tab agrees.
 */
export function computeRemovedKeys(
  letters: string,
  typedCount: number,
  mistakes: number,
  elapsedRatio: number,
  hintBonus: number,
  rng: () => number,
): Set<string> {
  const needed = new Set(neededLetters(letters, typedCount));
  const budget = removalBudget(mistakes, elapsedRatio, hintBonus);
  if (budget <= 0) return new Set();

  // Fisher–Yates over the alphabet with the injected rng.
  const perm = ALPHABET.split('');
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }

  const removed = new Set<string>();
  for (const ch of perm) {
    if (removed.size >= budget) break;
    if (needed.has(ch)) continue; // a still-needed letter never drops
    removed.add(ch);
  }
  return removed;
}

/**
 * REVEAL_HINT when the keyboard is already narrow: the next letter to type,
 * for the key pulse (null when the keyboard still has distractors to shed —
 * the narrowing itself is the hint in that regime).
 */
export function hintKeyFor(letters: string, typedCount: number, removed: ReadonlySet<string>): string | null {
  const needed = new Set(neededLetters(letters, typedCount));
  const distractors = ALPHABET.split('').filter((ch) => !removed.has(ch) && !needed.has(ch));
  if (distractors.length > 2) return null;
  return letters[typedCount] ?? null;
}
