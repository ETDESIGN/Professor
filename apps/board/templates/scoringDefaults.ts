/**
 * Per-template default point awards for a correct answer in a live game.
 *
 * Why this exists (workstream B2): game templates were calling gradeStudent()
 * (cognitive capture, claimed-only) but never addPoints(), so the live
 * leaderboard only moved when the teacher manually tapped +10/+50. Game
 * outcomes never scored. These defaults wire scoring in with sensible values
 * per activity; a teacher can still override at runtime via the existing
 * +10/+50 controls in the remote/commander.
 *
 * Pedagogical calibration:
 *  - SpeedQuiz  +10  (timed buzz, single answer)
 *  - TeamBattle +15  (team-based, slightly higher to feel like a "win")
 *  - ListenTap   +5  (quick-fire, lower stakes)
 *  - FlashMatch   +8  (pattern match, moderate)
 *  - Unscramble  +10  (production task)
 *  - StorySeq    +10  (production task)
 *  - Grammar     +10  (production task)
 *
 * Wrong answers grade cognition (FSRS) but do NOT deduct points by default —
 * the teacher keeps manual control of penalties (different pedagogical styles).
 * The manual deduct button (MASS_PENALTY) is still available.
 */
export const CORRECT_ANSWER_POINTS: Record<string, number> = {
  SPEED_QUIZ: 10,
  TEAM_BATTLE: 15,
  LISTEN_TAP: 5,
  FLASH_MATCH: 8,
  UNSCRAMBLE: 10,
  STORY_SEQUENCING: 10,
  GRAMMAR_PRACTICE: 10,
};

/**
 * Resolve the award for a step type, falling back to 10 if unset.
 * Inline so callers don't have to handle `undefined`.
 */
export function pointsForCorrect(stepType: string | undefined): number {
  if (!stepType) return 10;
  return CORRECT_ANSWER_POINTS[stepType] ?? 10;
}

// ─────────────────────────────────────────────────────────────────────
// Per-pick scoring model (workstream: pick → reset → score → next).
//
// One scored exercise per picked responder:
//   • A CLEAN success (no mistakes during that turn) = CLEAN_SCORE (30 pts).
//   • Each wrong attempt during the turn = −MISTAKE_PENALTY (−5 pts).
//   • On success the student earns max(0, CLEAN_SCORE − mistakes × MISTAKE_PENALTY).
//   • Wrong attempts ALSO deduct immediately via addPoints(id, −MISTAKE_PENALTY)
//     so the running leaderboard reflects the cost in real time. The success
//     award is then the CLEAN_SCORE (the deductions already happened turn-live).
//
// Why both: real-time deduction gives instant feedback (kid sees their score
// drop on a mistake); the final CLEAN award on success rewards completion.
// Net for a 2-mistake success = −5 −5 +30 = +20.
//
// TeamBattle is EXCLUDED (team-vs-team model, separate scoring).
// The Baton's manual Correct/Wrong and the SidebarPanel +10/+50 are kept as
// teacher escape hatches and bypass this model.
// ─────────────────────────────────────────────────────────────────────

export const CLEAN_SCORE = 30;
export const MISTAKE_PENALTY = 5;

/**
 * The success award for a turn, given how many mistakes were made during it.
 * Used by game templates on the SUCCESS resolution (correct match / sequence /
 * answer / etc.). Mistakes have already been deducted live; this is the
 * completion bonus. Never negative.
 */
export function scoreForAttempt(mistakes: number): number {
  return Math.max(0, CLEAN_SCORE - mistakes * MISTAKE_PENALTY);
}

