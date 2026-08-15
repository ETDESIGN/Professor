// ─────────────────────────────────────────────────────────────────────
// Per-pick scoring model (architecture §3.1 — the unified model).
//
// The legacy CORRECT_ANSWER_POINTS map + pointsForCorrect helper were retired
// in Phase 1f (2026-08-06). BoardTeamBattle was the sole caller and has been
// migrated to scoreForAttempt below. The per-template calibration values live
// now in the unified model's DIFFICULTY_MULTIPLIER + the pool item's own
// difficulty field, not in a per-shell map.
//
// One scored exercise per picked responder:
//   • A CLEAN success (no mistakes during that turn) = CLEAN_SCORE_BASE × DIFFICULTY_MULTIPLIER.
//   • Each wrong attempt during the turn = −MISTAKE_PENALTY (−5 pts).
//   • On success the student earns max(0, base − mistakes × MISTAKE_PENALTY) × partialCreditRatio.
//   • Wrong attempts ALSO deduct immediately via addPoints(id, −MISTAKE_PENALTY)
//     so the running leaderboard reflects the cost in real time.
//
// pool_items.difficulty already encodes 1=receptive / 2=constrained /
// 3=free-production (audit §D) — the same axis as receptive/productive
// modality. So the DIFFICULTY_MULTIPLIER is modality-aware scoring for free;
// no separate modality lookup is needed (architecture §3.1).
//
// Partial credit (partialCreditRatio) applies only where "almost right" is
// coherent — WORD_BANK_BUILD/TRANSFORM via LCS, ERROR_SPOT multi-pick via
// fraction-correct, DICTATION via Levenshtein. Pure MCQ types pass 1.0.
//
// Net for a 2-mistake clean success at difficulty 1 = −5 −5 +30 = +20.
// Net for a 1-mistake partial (ratio 0.7) success at difficulty 2 =
//   −5 + round(max(0, 42 − 5) × 0.7) = −5 + round(25.9) = −5 + 26 = +21.
//
// TeamBattle migrates onto this model (Phase 1f); the Baton's manual
// Correct/Wrong and the SidebarPanel +10/+50 stay as teacher escape hatches.
// ─────────────────────────────────────────────────────────────────────

export const CLEAN_SCORE_BASE = 30;
export const MISTAKE_PENALTY = 5;

/** Difficulty multiplier — receptive (1.0) / constrained (1.4) / free-production (2.0).
 *  Matches pool_items.difficulty semantics (audit §D). */
export const DIFFICULTY_MULTIPLIER: Record<number, number> = {
  1: 1.0,
  2: 1.4,
  3: 2.0,
};

export type Difficulty = 1 | 2 | 3;

/** Streak multiplier — ≥3 consecutive correct answers earns a bonus (NEWGEN_AUDIT
 *  Tier 1 #10: streak badges existed but had zero mechanical effect). Applied
 *  AFTER the mistake deduction, so a streak never rescues a fumbled turn. */
export const STREAK_MULTIPLIER: Record<number, number> = {
  3: 1.25, // 3-streak: +25%
  5: 1.5,  // 5-streak: +50%
};

/** Resolve the multiplier for a streak length (largest threshold reached). */
export function streakMultiplier(streak: number): number {
  if (streak >= 5) return STREAK_MULTIPLIER[5];
  if (streak >= 3) return STREAK_MULTIPLIER[3];
  return 1.0;
}

/**
 * The success award for a turn (unified model, architecture §3.1).
 *
 * @param mistakes wrong attempts during this turn (already deducted live).
 * @param difficulty pool_items.difficulty (1/2/3). Defaults to 1 (receptive).
 * @param partialCreditRatio 0..1 — 1.0 for clean correct, <1.0 for "almost
 *   right" (LCS / Levenshtein / fraction-correct). Defaults to 1.0. Pure MCQ
 *   types always pass 1.0 (no meaningful partial answer to a 4-option MCQ).
 * @param streak consecutive correct answers INCLUDING this one (optional,
 *   default 0 = no streak bonus). Games that don't track streaks are unaffected.
 * @returns non-negative integer points.
 */
export function scoreForAttempt(
  mistakes: number,
  difficulty: Difficulty | number = 1,
  partialCreditRatio: number = 1.0,
  streak: number = 0,
): number {
  const mult = DIFFICULTY_MULTIPLIER[difficulty] ?? 1.0;
  const base = CLEAN_SCORE_BASE * mult;
  const raw = Math.max(0, base - mistakes * MISTAKE_PENALTY);
  return Math.round(raw * partialCreditRatio * streakMultiplier(streak));
}
