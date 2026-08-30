// turnDeal.ts — per-turn arrangement of a round's pool items (2026-08-30,
// "same questions for every kid" fix).
//
// The round's WORD SELECTION stays buildRound's job and is untouched here —
// every student works the same words. What dealForTurn changes is the
// ARRANGEMENT those items are played in, as a pure function of the shared
// seed parts plus the turn token and reset count:
//
//   • groups items by key (objective id) and shuffles the group order
//     (per-turn question order),
//   • rotates each group's internal order (variant rotation: kid 1 meets
//     "tractor" as its first pool variant, kid 2 as its second — cloze vs
//     image-select when both are in play),
//   • interleaves groups round-robin so a word's variants are spread across
//     the run instead of sitting back-to-back.
//
// Deterministic per seed parts — every classroom tab (commander / projector /
// remote) computes the identical arrangement; a new turnToken (wheel pick) or
// resetCount (Reset button) re-deals a different one. Choral/practice mode
// passes a stable 'practice' token so the presentation board stays put.

import { makeRng } from '../../services/seededRandom';

export function dealForTurn<T>(
  items: readonly T[],
  seedParts: (string | number | null | undefined)[],
  keyOf: (item: T) => string,
): T[] {
  if (items.length === 0) return [];

  // Group by key, preserving original order within each group.
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const key = keyOf(it);
    const arr = groups.get(key);
    if (arr) arr.push(it);
    else groups.set(key, [it]);
  }
  const groupList = Array.from(groups.values());

  // One rng, two phases: group order, then per-group rotation offsets.
  const rng = makeRng('turnDeal', ...seedParts);
  for (let i = groupList.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [groupList[i], groupList[j]] = [groupList[j], groupList[i]];
  }
  const rotated = groupList.map((g) => {
    if (g.length < 2) return g;
    const offset = Math.floor(rng() * g.length);
    return [...g.slice(offset), ...g.slice(0, offset)];
  });

  // Round-robin interleave: one item per group per cycle.
  const out: T[] = [];
  let remaining = rotated.filter((g) => g.length > 0);
  while (remaining.length > 0) {
    for (const g of remaining) out.push(g.shift()!);
    remaining = remaining.filter((g) => g.length > 0);
  }
  return out;
}
