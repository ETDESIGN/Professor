// coverageStore — session-scoped memory of which objectives have been dealt
// to the live board, powering the sequential-deal rotation in
// lessonDirector.buildRound (the pool-coverage fix: without it, every round
// re-selected the same weakest-N words and most of the unit's vocabulary was
// never shown).
//
// Scope: (sessionId, unitId) — session-scoped by the classroom_sessions row
// id, so concurrent sessions on the same unit keep independent deal orders.
// Module-level, so it survives slide changes and template remounts within one
// classroom session (the projector/teacher page is a single page load). It is
// memory-only: persistence is the DB ledger (Task 8), which hydrates back in
// via hydrateUnit on refresh / late-join.

const store = new Map<string, Set<string>>();

const scopedKey = (sessionId: string, unitId: string) => `${sessionId}:${unitId}`;

/** Objective ids already dealt for this (session, unit) (insertion order). */
export function servedFor(sessionId: string, unitId: string): string[] {
  return Array.from(store.get(scopedKey(sessionId, unitId)) ?? []);
}

/** Record objectives as dealt. Idempotent. */
export function markServed(sessionId: string, unitId: string, objectiveIds: string[]): void {
  if (!sessionId || !unitId || objectiveIds.length === 0) return;
  const key = scopedKey(sessionId, unitId);
  let set = store.get(key);
  if (!set) {
    set = new Set<string>();
    store.set(key, set);
  }
  for (const id of objectiveIds) set.add(id);
}

/** Union-merge a DB ledger snapshot into memory (refresh/late-join
 *  hydration; never discards optimistic local marks). Idempotent. */
export function hydrateUnit(sessionId: string, unitId: string, objectiveIds: readonly string[]): void {
  markServed(sessionId, unitId, objectiveIds as string[]);
}

/** Forget the (session, unit)'s dealt history (e.g. teacher restarts a unit). */
export function resetUnit(sessionId: string, unitId: string): void {
  store.delete(scopedKey(sessionId, unitId));
}
