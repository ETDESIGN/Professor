// ─────────────────────────────────────────────────────────────────────
// Per-pick scoring model (architecture §3.1 — the unified model).
//
// Rescaled 2026-08-17 to a 1–5 integer scale (owner decision): a normal
// question earns 1, harder 2, hardest 3, and nothing can exceed
// MAX_QUESTION_POINTS (5) for a single question.
//
// One scored exercise per picked responder:
//   • A CLEAN success (no mistakes during that turn) = CLEAN_SCORE_BASE × DIFFICULTY_MULTIPLIER
//     → 1 / 2 / 3 points for difficulty 1 / 2 / 3.
//   • Each wrong attempt during the turn costs −MISTAKE_PENALTY (−1 pt),
//     deducted immediately via addPoints(id, −MISTAKE_PENALTY) so the running
//     leaderboard reflects the cost in real time. This live deduction is the
//     ONLY mistake cost — scoreForAttempt no longer reduces the award for
//     prior mistakes (on a 1–3 base the old double penalty was brutal).
//   • Streaks add a flat bonus AFTER the base: +1 at ≥3 consecutive correct,
//     +2 at ≥5. Difficulty 3 with a 5-streak = 5 (the "very special" max).
//   • The final award is capped at MAX_QUESTION_POINTS (5) — this also caps
//     BoardVocabBlitz's double-or-nothing ×2 bet (3 × 2 → 5, not 6).
//   • Any successful answer earns at least 1 point (partial credit ratios
//     round up to a minimum of 1, never 0).
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
// Net for a 2-mistake clean success at difficulty 1 = −1 −1 +1 = −1 (clamped at 0
// on the student total). Net for a 1-mistake clean success at difficulty 3 =
//   −1 +3 = +2.
//
// TeamBattle migrates onto this model (Phase 1f); the Baton's manual
// Correct/Wrong and the SidebarPanel +10/+50 stay as teacher escape hatches.
// ─────────────────────────────────────────────────────────────────────

export const CLEAN_SCORE_BASE = 1;
export const MISTAKE_PENALTY = 1;

/** Hard cap for a single question's award — nothing may exceed 5 points. */
export const MAX_QUESTION_POINTS = 5;

/** Difficulty value in points — receptive (1) / constrained (2) / free-production (3).
 *  Matches pool_items.difficulty semantics (audit §D). */
export const DIFFICULTY_MULTIPLIER: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
};

export type Difficulty = 1 | 2 | 3;

/** Streak bonus — ≥3 consecutive correct answers earns +1, ≥5 earns +2 (NEWGEN_AUDIT
 *  Tier 1 #10: streak badges existed but had zero mechanical effect). Applied
 *  AFTER the base, so difficulty 3 + 5-streak = 5 (the max). */
export const STREAK_BONUS: Record<number, number> = {
  3: 1, // 3-streak: +1
  5: 2, // 5-streak: +2
};

/** Resolve the bonus for a streak length (largest threshold reached). */
export function streakBonus(streak: number): number {
  if (streak >= 5) return STREAK_BONUS[5];
  if (streak >= 3) return STREAK_BONUS[3];
  return 0;
}

/**
 * The success award for a turn (unified model, architecture §3.1).
 *
 * @param mistakes wrong attempts during this turn — retained for API
 *   compatibility with the 21 Board templates, but NO longer reduces the
 *   award: the mistake cost is charged live via addPoints(id, −MISTAKE_PENALTY)
 *   at the moment of each wrong attempt.
 * @param difficulty pool_items.difficulty (1/2/3). Defaults to 1 (receptive).
 * @param partialCreditRatio 0..1 — 1.0 for clean correct, <1.0 for "almost
 *   right" (LCS / Levenshtein / fraction-correct). Defaults to 1.0. Pure MCQ
 *   types always pass 1.0 (no meaningful partial answer to a 4-option MCQ).
 * @param streak consecutive correct answers INCLUDING this one (optional,
 *   default 0 = no streak bonus). Games that don't track streaks are unaffected.
 * @returns integer points: at least 1 for any success, at most MAX_QUESTION_POINTS.
 */
export function scoreForAttempt(
  mistakes: number,
  difficulty: Difficulty | number = 1,
  partialCreditRatio: number = 1.0,
  streak: number = 0,
): number {
  void mistakes; // mistake cost is charged live (−MISTAKE_PENALTY), not here
  const mult = DIFFICULTY_MULTIPLIER[difficulty] ?? 1;
  const base = CLEAN_SCORE_BASE * mult + streakBonus(streak);
  const raw = Math.round(base * partialCreditRatio);
  return Math.min(MAX_QUESTION_POINTS, Math.max(1, raw));
}
