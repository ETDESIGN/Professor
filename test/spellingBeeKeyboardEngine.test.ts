import { describe, it, expect } from 'vitest';
import {
  ALPHABET,
  computeRemovedKeys,
  hashString,
  hintKeyFor,
  mulberry32,
  neededLetters,
  normalizeWord,
  QWERTY_ROWS,
  removalBudget,
  slotLayout,
} from '../components/games/spellingBee/keyboardEngine';

describe('normalizeWord', () => {
  it('strips to uppercase A-Z', () => {
    expect(normalizeWord('Ice-Cream')).toBe('ICECREAM');
    expect(normalizeWord("don't")).toBe('DONT');
    expect(normalizeWord('  café ')).toBe('CAF'); // é is non A-Z
  });
});

describe('slotLayout', () => {
  it('maps letters to indexes and pre-fills separators', () => {
    const slots = slotLayout('ice cream');
    expect(slots.map((s) => s.char).join('')).toBe('ICE CREAM');
    expect(slots.filter((s) => s.letterIndex >= 0)).toHaveLength(8);
    const space = slots.find((s) => s.char === ' ')!;
    expect(space.letterIndex).toBe(-1);
    // Letter indexes are consecutive across the separator.
    expect(slots.map((s) => s.letterIndex)).toEqual([0, 1, 2, -1, 3, 4, 5, 6, 7]);
  });

  it('matches the normalized letters by construction', () => {
    const word = 'ice-cream';
    const slots = slotLayout(word).filter((s) => s.letterIndex >= 0);
    expect(slots.map((s) => s.char).join('')).toBe(normalizeWord(word));
  });
});

describe('QWERTY_ROWS', () => {
  it('covers all 26 letters exactly once', () => {
    const all = QWERTY_ROWS.flat();
    expect(all).toHaveLength(26);
    expect(new Set(all)).toEqual(new Set(ALPHABET.split('')));
  });
});

describe('neededLetters', () => {
  it('returns the distinct letters still required', () => {
    expect(neededLetters('BANANA', 0).sort()).toEqual(['A', 'B', 'N']);
    expect(neededLetters('BANANA', 1).sort()).toEqual(['A', 'N']);
    expect(neededLetters('BANANA', 6)).toEqual([]);
  });
});

describe('removalBudget', () => {
  it('grows one per mistake and one per quarter of the clock', () => {
    expect(removalBudget(0, 0, 0)).toBe(0);
    expect(removalBudget(1, 0, 0)).toBe(1);
    expect(removalBudget(0, 0.24, 0)).toBe(0);
    expect(removalBudget(0, 0.25, 0)).toBe(1);
    expect(removalBudget(0, 1, 0)).toBe(4);
    expect(removalBudget(2, 0.5, 0)).toBe(4);
  });

  it('adds a flat bonus per hint press', () => {
    expect(removalBudget(0, 0, 1)).toBe(3);
    expect(removalBudget(1, 0.25, 2)).toBe(8);
  });

  it('clamps a bogus elapsed ratio', () => {
    expect(removalBudget(1, -3, 0)).toBe(1);
    expect(removalBudget(1, 7, 0)).toBe(5);
    expect(removalBudget(1, Number.NaN, 0)).toBe(1);
  });
});

describe('computeRemovedKeys', () => {
  const LETTERS = 'HELICOPTER';
  const seedFor = (k: string) => mulberry32(hashString(k));

  it('never removes a letter the word still needs', () => {
    for (let typed = 0; typed < LETTERS.length; typed++) {
      for (let mistakes = 0; mistakes <= 25; mistakes++) {
        const removed = computeRemovedKeys(LETTERS, typed, mistakes, 1, 5, seedFor(`x|${typed}|${mistakes}`));
        for (const need of neededLetters(LETTERS, typed)) {
          expect(removed.has(need)).toBe(false);
        }
      }
    }
  });

  it('removes at most budget distractors and can strip down to only needed letters', () => {
    // 25 mistakes + full clock + hints = budget ≥ 23 > 23 distractors of a
    // 3-distinct-letter word → everything not needed is gone.
    const removed = computeRemovedKeys(LETTERS, 5, 25, 1, 5, seedFor('full'));
    const needed = new Set(neededLetters(LETTERS, 5));
    const visible = ALPHABET.split('').filter((c) => !removed.has(c));
    expect(visible.every((c) => needed.has(c))).toBe(true);
  });

  it('is deterministic per seed', () => {
    const a = computeRemovedKeys(LETTERS, 0, 3, 0.5, 0, seedFor('word1'));
    const b = computeRemovedKeys(LETTERS, 0, 3, 0.5, 0, seedFor('word1'));
    expect(a).toEqual(b);
    const c = computeRemovedKeys(LETTERS, 0, 3, 0.5, 0, seedFor('word2'));
    expect([...a].join('')).not.toBe([...c].join('')); // different seed reshuffles
  });

  it('is monotonic as pressure grows within a word', () => {
    let prev = new Set<string>();
    for (let pressure = 0; pressure <= 30; pressure++) {
      const next = computeRemovedKeys(LETTERS, 2, pressure, 0, 0, seedFor('mono'));
      for (const k of prev) expect(next.has(k)).toBe(true);
      prev = next;
    }
  });

  it('returns nothing with zero budget', () => {
    expect(computeRemovedKeys(LETTERS, 0, 0, 0, 0, seedFor('z'))).toEqual(new Set());
  });
});

describe('hintKeyFor', () => {
  it('is null while the keyboard still has distractors to shed', () => {
    // TRUCK from 0 typed needs T,R,U,C,K — 21 possible distractors, none removed.
    expect(hintKeyFor('TRUCK', 0, new Set())).toBe(null);
  });

  it('pulses the next letter once only needed letters remain (± a couple)', () => {
    const needed = new Set(['T', 'R', 'U', 'C', 'K']);
    const removed = new Set(ALPHABET.split('').filter((c) => !needed.has(c)));
    expect(hintKeyFor('TRUCK', 1, removed)).toBe('R');
    expect(hintKeyFor('TRUCK', 5, removed)).toBe(null); // word finished
  });
});
