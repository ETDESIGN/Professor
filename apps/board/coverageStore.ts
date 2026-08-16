// coverageStore — session-scoped memory of which objectives have been dealt
// to the live board, powering the sequential-deal rotation in
// lessonDirector.buildRound (the pool-coverage fix: without it, every round
// re-selected the same weakest-N words and most of the unit's vocabulary was
// never shown).
//
// Scope: module-level, so it survives slide changes and template remounts
// within one classroom session (the projector/teacher page is a single page
// load). It resets on refresh — acceptable for v1; DB persistence is a
// documented follow-up.

const store = new Map<string, Set<string>>();

/** Objective ids already dealt for this unit (in first-dealt order). */
export function servedFor(unitId: string): string[] {
  return Array.from(store.get(unitId) ?? []);
}

/** Record objectives as dealt. Idempotent. */
export function markServed(unitId: string, objectiveIds: string[]): void {
  if (!unitId || objectiveIds.length === 0) return;
  let set = store.get(unitId);
  if (!set) {
    set = new Set<string>();
    store.set(unitId, set);
  }
  for (const id of objectiveIds) set.add(id);
}

/** Forget the unit's dealt history (e.g. the teacher explicitly restarts a unit). */
export function resetUnit(unitId: string): void {
  store.delete(unitId);
}
