// scoreAttempt.ts — the unified triple-write for every scored board event.
//
// Architecture contract (LIVE_GAME_LIFECYCLE §5 + attemptsLog §4.4): every
// scored attempt must write THREE things:
//   1. addPoints(id, delta)     — the live leaderboard (caller does this)
//   2. recordAttempt(...)       — per-attempt analytics row (Class Accuracy)
//   3. gradeObjective(...)      — FSRS mastery ladder write
// plus, on a miss:
//   4. pushToRemediation(...)   — same-session remediation queue
//
// New-gen shells call this helper instead of hand-rolling the writes, so the
// analytics/FSRS paths can never drift from the reference shells
// (BoardUnscramble v2 pattern).

import { recordAttempt, type AttemptCorrectness } from '../../../services/attemptsLog';
import { gradeObjective } from '../../../services/boardLearner';

export interface AttemptContext {
  /** SessionContext state (reads students, activeClassId). */
  state: any;
  /** roster_students.id of the picked responder. */
  picked: string;
  /** Active unit id (FSRS write target). */
  unitId: string;
  /** The pool objective being attempted (undefined = frozen/manifest data). */
  objectiveId?: string;
  exerciseType?: string;
  difficulty?: number;
  /** 'correct' | 'incorrect' | 'partial' — the analytics verdict. */
  correctness: AttemptCorrectness;
  /** FSRS verdict (defaults to correctness === 'correct'). */
  correct?: boolean;
  /** Receptive (MCQ/listen) vs productive (build/speak) FSRS modality. */
  modality?: 'receptive' | 'productive';
  /** SessionContext.pushToRemediation — called on incorrect when provided. */
  pushToRemediation?: (objectiveId: string, studentId: string) => void;
}

/**
 * Fire the analytics + FSRS (+ remediation) writes for one attempt.
 * Non-blocking: every write is fire-and-forget with its own catch — a missed
 * analytics row must never break live gameplay.
 */
export function logAttempt(ctx: AttemptContext): void {
  const { state, picked, unitId, objectiveId, exerciseType, difficulty, correctness } = ctx;
  if (!picked) return;

  const student = (state.students || []).find((s: any) => s.id === picked);

  recordAttempt({
    rosterId: picked,
    classId: state.activeClassId,
    profileId: student?.claimed_profile_id ?? null,
    correctness,
    objectiveId,
    exerciseType,
    difficulty,
  }).catch(() => {});

  const passed = ctx.correct ?? correctness === 'correct';
  if (objectiveId && unitId) {
    gradeObjective(picked, unitId, objectiveId, passed, ctx.modality ?? 'productive').catch(() => {});
    if (!passed && ctx.pushToRemediation) {
      ctx.pushToRemediation(objectiveId, picked);
    }
  }
}
