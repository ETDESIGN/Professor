// Spaced-repetition helpers (pure / testable).
//
// Phase 3 (audit P0-3 remainder): when a teacher re-orchestrates a unit, the
// vocabulary can change. ensureStudentSRSItems must RECONCILE a student's deck
// (add new words) instead of cloning only when the student has zero items
// (which left existing students with stale decks forever). Existing items keep
// their SM-2 state; this helper computes only the words still missing.

export const SRS_DEFAULTS = Object.freeze({
  interval: 0,
  repetition: 0,
  efactor: 2.5,
});

/**
 * Return the template words a student does NOT yet have an SRS item for.
 * Used to propagate re-orchestration changes without clobbering progress.
 * Deduplicates by word (case-insensitive on the lookup).
 */
export function diffMissingSRSWords(
  templates: { word: string }[],
  existing: { word: string }[],
): { word: string }[] {
  const have = new Set(
    existing
      .map((e) => (e?.word ?? '').toString().trim().toLowerCase())
      .filter(Boolean),
  );
  const seen = new Set<string>();
  const missing: { word: string }[] = [];
  for (const t of templates) {
    const w = (t?.word ?? '').toString().trim();
    if (!w) continue;
    const key = w.toLowerCase();
    if (have.has(key) || seen.has(key)) continue;
    seen.add(key);
    missing.push({ word: w });
  }
  return missing;
}
