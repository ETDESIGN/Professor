// ── Deterministic RNG for cross-tab content selection (FIXPLAN E1.1) ────────
// The commander preview and the projector board mount SEPARATE instances of
// every game template. Any content selection that uses Math.random() deals
// DIFFERENT content on each tab for the same round ("different content on
// screens"). Every randomness site that changes which content a tab shows must
// instead draw from a seeded rng built from shared state (session | unit |
// step | turn/round scope), so all tabs compute the identical deal.
// Session variety is preserved by including the sessionId in the seed: a new
// class deals differently, tabs within one class agree.
// Cosmetic randomness (confetti, wheel spin offset, praise stickers) and
// single-writer randomness whose RESULT is broadcast (student picks) stay on
// Math.random — see docs/FIXPLAN_E_LIVE_SYNC.md "Randomness inventory".

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

/** Stable string → 32-bit seed (FNV-1a) for seeding from session/unit keys. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Build a deterministic rng from arbitrary scope parts (session id, unit id,
 * step index, turn token, reset count, …). Null/undefined/empty parts are
 * skipped so callers can pass optional scopes directly. Same parts → same
 * sequence on every tab; any differing part → a different sequence.
 */
export function makeRng(...parts: (string | number | null | undefined)[]): () => number {
  const key = parts.filter((p) => p !== null && p !== undefined && p !== '').join('|');
  return mulberry32(hashString(key));
}

/**
 * Fisher-Yates shuffle driven by a seeded rng (pass `makeRng(...)`). Returns a
 * new array; the input is not mutated. Deterministic given the same rng state.
 */
export function seededShuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
