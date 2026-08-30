// turnDeal.test.ts — per-turn deal order (the "same questions for every
// kid" regression, 2026-08-30). Locks down:
//   1. Determinism: same seed parts → identical arrangement (cross-tab).
//   2. Variety: a different turnToken OR resetCount → different arrangement.
//   3. Variant rotation: a group with multiple items leads with a different
//      variant per turn (kid 1 cloze, kid 2 image-select).
//   4. Interleave: a word's variants are spread apart, not back-to-back.
//   5. Word selection is NOT dealForTurn's business — it only reorders the
//      items it is given (selection stays buildRound's job).
import { describe, it, expect } from 'vitest';
import { dealForTurn } from '../apps/board/turnDeal';

interface Item { id: string; objective_id: string; }
const mk = (obj: string, n: number): Item => ({ id: `${obj}-${n}`, objective_id: obj });

const words = ['tractor', 'leaf', 'mountain', 'river', 'rock', 'field', 'forest', 'grass'];
// One variant per word (single-item groups).
const singleVariant: Item[] = words.map((w) => mk(w, 1));
// tractor + leaf get a second variant.
const multiVariant: Item[] = [...singleVariant, mk('tractor', 2), mk('leaf', 2)];

const seed = (turn: string | number, reset: string | number) =>
  ['sess-1', 'unit-1', 'FLASH_MATCH', 1, turn, reset];

describe('dealForTurn — determinism (cross-tab agreement)', () => {
  it('same seed parts → identical arrangement', () => {
    const a = dealForTurn(singleVariant, seed('t1', 0), (i) => i.objective_id);
    const b = dealForTurn(singleVariant, seed('t1', 0), (i) => i.objective_id);
    expect(a).toEqual(b);
  });

  it('is a permutation — no items lost or duplicated', () => {
    const out = dealForTurn(multiVariant, seed('t2', 0), (i) => i.objective_id);
    expect(out.length).toBe(multiVariant.length);
    expect(new Set(out.map((i) => i.id)).size).toBe(multiVariant.length);
  });
});

describe('dealForTurn — per-turn and per-reset variety', () => {
  it('different turnToken → different arrangement', () => {
    const a = dealForTurn(singleVariant, seed('t1', 0), (i) => i.objective_id);
    const b = dealForTurn(singleVariant, seed('t2', 0), (i) => i.objective_id);
    expect(a).not.toEqual(b);
  });

  it('same turn, different resetCount → different arrangement (Reset re-deals)', () => {
    const a = dealForTurn(singleVariant, seed('t1', 0), (i) => i.objective_id);
    const b = dealForTurn(singleVariant, seed('t1', 1), (i) => i.objective_id);
    expect(a).not.toEqual(b);
  });

  it('varyies across a classroom of 10 kids (not two alternating orders)', () => {
    const orders = new Set<string>();
    for (let kid = 1; kid <= 10; kid++) {
      const out = dealForTurn(singleVariant, seed(`turn-${kid}`, 0), (i) => i.objective_id);
      orders.add(out.map((i) => i.id).join(','));
    }
    expect(orders.size).toBeGreaterThanOrEqual(8);
  });
});

describe('dealForTurn — variant rotation + interleave', () => {
  it('rotates which variant of a word leads, per turn', () => {
    const firstsOf = (turn: string) =>
      dealForTurn(multiVariant, seed(turn, 0), (i) => i.objective_id)
        .filter((i) => i.objective_id === 'tractor')
        .map((i) => i.id);
    const leadVariants = new Set<string>();
    for (let kid = 1; kid <= 8; kid++) leadVariants.add(firstsOf(`t${kid}`)[0]);
    // Across 8 kids, tractor must lead with BOTH of its variants at least once.
    expect(leadVariants.has('tractor-1')).toBe(true);
    expect(leadVariants.has('tractor-2')).toBe(true);
  });

  it('interleaves: a word with 2 variants does not sit back-to-back (8+ words in play)', () => {
    const out = dealForTurn(multiVariant, seed('t3', 0), (i) => i.objective_id);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].objective_id).not.toBe(out[i - 1].objective_id);
    }
  });
});

describe('dealForTurn — degenerate inputs', () => {
  it('returns [] for []', () => {
    expect(dealForTurn([], seed('t1', 0), (i: Item) => i.objective_id)).toEqual([]);
  });
  it('returns single items unchanged in kind', () => {
    const out = dealForTurn([mk('tractor', 1)], seed('t1', 0), (i) => i.objective_id);
    expect(out.map((i) => i.id)).toEqual(['tractor-1']);
  });
});
