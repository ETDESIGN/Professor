// Board LearnerState integration (Track A). Live board games are teacher-graded:
// the teacher selects a student (Wheel/tap) and taps Correct/Wrong on the
// remote. This service writes that grade to the SAME LearnerState as the async
// app (audit A4: one learner model, two tracks), so a board round updates the
// student's FSRS/mastery state. Choral/all-play rounds write nothing per the
// locked decision (engagement only).

import { supabase } from './supabaseClient';
import { createClientLogger } from './logger';
import { recordAttempt, averageRetrievability, ObjectiveState } from './learnerState';
import { retrievability, effectiveMasteryState, isDue, type Grade } from './fsrs';

const log = createClientLogger('BoardLearner');

/** Map a Correct/Wrong teacher grade to the FSRS 4-grade. */
export function teacherGradeToFsrs(correct: boolean): Grade {
  return correct ? 'good' : 'again';
}

/** Resolve a vocabulary word to its objective id within a unit (case-insensitive). */
async function resolveObjectiveId(unitId: string, word: string): Promise<string | null> {
  if (!unitId || !word) return null;
  try {
    const { data, error } = await supabase
      .from('objectives')
      .select('id')
      .eq('unit_id', unitId)
      .eq('type', 'vocabulary')
      .ilike('target_value', word.trim())
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return data[0].id;
  } catch (err) {
    log.warn('resolve_objective_failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Verify the calling teacher owns the unit AND the student is enrolled in one
 * of the teacher's classes. Prevents cross-tenant mutation (a teacher must not
 * be able to grade students outside their roster / units they don't own).
 */
async function assertTeacherMayGrade(studentId: string, unitId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  // Unit ownership: teacher owns it OR is an admin.
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isAdmin = profile?.role === 'admin';
  if (!isAdmin) {
    const { data: unit } = await supabase.from('units').select('teacher_id').eq('id', unitId).maybeSingle();
    if (!unit || !unit.teacher_id || unit.teacher_id !== user.id) return false;
  }

  // Student enrollment: the student is in one of the teacher's classes (admins bypass).
  if (!isAdmin) {
    const { data: enrolled, error } = await supabase
      .from('class_enrollments')
      .select('student_id, classes!inner(teacher_id)')
      .eq('student_id', studentId)
      .eq('classes.teacher_id', user.id)
      .limit(1);
    if (error || !enrolled || enrolled.length === 0) return false;
  }
  return true;
}

/**
 * Per-student board capture (generic): record a teacher's Correct/Wrong grade
 * for the selected student on a known objective id. Used by grammar/phonics
 * board practice (whose objective target is a rule/sound, not a vocab word).
 * Verifies the teacher owns the unit + the student is on their roster first.
 */
export async function gradeObjective(
  studentId: string,
  unitId: string,
  objectiveId: string,
  correct: boolean,
  modality: 'receptive' | 'productive' = 'productive',
): Promise<boolean> {
  const allowed = await assertTeacherMayGrade(studentId, unitId);
  if (!allowed) {
    log.warn('grade_objective_unauthorized', { metadata: { studentId, unitId } });
    return false;
  }
  if (!objectiveId) return false;
  const res = await recordAttempt(studentId, objectiveId, teacherGradeToFsrs(correct), { modality });
  return res !== null;
}

/**
 * Per-student board capture: record a teacher's Correct/Wrong grade for the
 * selected student on a vocab item. Choral rounds should NOT call this.
 * Verifies the teacher owns the unit and the student is on their roster first.
 */
export async function gradeStudent(
  studentId: string,
  unitId: string,
  word: string,
  correct: boolean,
): Promise<boolean> {
  const allowed = await assertTeacherMayGrade(studentId, unitId);
  if (!allowed) {
    log.warn('grade_student_unauthorized', { metadata: { studentId, unitId } });
    return false;
  }
  const objectiveId = await resolveObjectiveId(unitId, word);
  if (!objectiveId) {
    log.warn('grade_student_no_objective', { metadata: { unitId, word } });
    return false;
  }
  const res = await recordAttempt(studentId, objectiveId, teacherGradeToFsrs(correct), {
    // Board vocab grading is treated as receptive recognition.
    modality: 'receptive',
  });
  return res !== null;
}

/**
 * Class-weak aggregation (Locked Decision #7 / plan 3.4): average retrievability
 * of a unit's vocabulary objectives across a roster. Returns objective ids sorted
 * weakest-first so board games can prioritise the words the class struggles with.
 */
export async function classWeakObjectives(
  studentIds: string[],
  unitId: string,
): Promise<{ objective_id: string; retrievability: number; states: ObjectiveState[] }[]> {
  if (studentIds.length === 0) return [];
  try {
    const now = new Date();
    const { data: objectives, error } = await supabase
      .from('objectives')
      .select('id')
      .eq('unit_id', unitId)
      .eq('type', 'vocabulary');
    if (error || !objectives || objectives.length === 0) return [];

    const objectiveIds = objectives.map((o) => o.id);

    // ONE batched query across the whole roster (idx_srs_items_student_objective),
    // bucketed by objective in memory — avoids an N+1 of per-student fetches.
    const { data: rows, error: rErr } = await supabase
      .from('srs_items')
      .select('id, objective_id, stability, difficulty, reps, lapses, mastery_state, last_review, next_review')
      .in('student_id', studentIds)
      .in('objective_id', objectiveIds);
    if (rErr || !rows) return [];

    const byObjective = new Map<string, ObjectiveState[]>();
    for (const r of rows) {
      if (!r.objective_id) continue;
      const elapsed = r.last_review ? (now.getTime() - new Date(r.last_review).getTime()) / (24 * 60 * 60 * 1000) : 0;
      const r_val = retrievability(Number(r.stability) || 0, elapsed);
      const stored = (r.mastery_state as ObjectiveState['mastery_state']) || 'new';
      const arr = byObjective.get(r.objective_id) || [];
      arr.push({
        objective_id: r.objective_id, srs_item_id: r.id,
        stability: Number(r.stability) || 0, difficulty: Number(r.difficulty) || 0,
        reps: Number(r.reps) || 0, lapses: Number(r.lapses) || 0,
        mastery_state: stored, effective_mastery: effectiveMasteryState(stored, r_val),
        retrievability: r_val, last_review: r.last_review, next_review: r.next_review,
        is_due: isDue(r.next_review, now),
      });
      byObjective.set(r.objective_id, arr);
    }

    const out = objectiveIds.map((objective_id) => {
      const states = byObjective.get(objective_id) || [];
      // Objectives unseen by the roster count as weakest (R = 0).
      const r = states.length > 0 ? averageRetrievability(states) : 0;
      return { objective_id, retrievability: r, states };
    });
    out.sort((a, b) => a.retrievability - b.retrievability);
    return out;
  } catch (err) {
    log.warn('class_weak_error', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}
