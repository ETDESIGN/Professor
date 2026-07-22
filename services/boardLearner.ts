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

/** Resolve a board identity (roster_students.id) to a profile id for FSRS writes. */
async function resolveGradingProfileId(studentOrRosterId: string): Promise<string | null> {
  if (!studentOrRosterId) return null;
  const { data: roster } = await supabase
    .from('roster_students')
    .select('claimed_profile_id')
    .eq('id', studentOrRosterId)
    .maybeSingle();
  if (roster) return roster.claimed_profile_id ?? null;
  return studentOrRosterId;
}

/** Map roster ids (or legacy profile ids) to claimed profile ids for SRS aggregation. */
export async function profileIdsForClassWeak(studentOrRosterIds: string[]): Promise<string[]> {
  if (studentOrRosterIds.length === 0) return [];
  const { data: rosterRows } = await supabase
    .from('roster_students')
    .select('id, claimed_profile_id')
    .in('id', studentOrRosterIds);
  const rosterMap = new Map((rosterRows || []).map((r) => [r.id, r.claimed_profile_id]));
  const profileIds = new Set<string>();
  for (const id of studentOrRosterIds) {
    if (rosterMap.has(id)) {
      const claimed = rosterMap.get(id);
      if (claimed) profileIds.add(claimed);
    } else {
      profileIds.add(id);
    }
  }
  return [...profileIds];
}

/**
 * Verify the calling teacher owns the unit AND the student is on their roster
 * (roster_students.id) or legacy enrollment (profiles.id). Returns the profile
 * id to write FSRS data to, or null when the student is unclaimed (points only).
 */
async function assertTeacherMayGrade(
  studentOrRosterId: string,
  unitId: string,
): Promise<{ allowed: boolean; profileId: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { allowed: false, profileId: null };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isAdmin = profile?.role === 'admin';
  if (!isAdmin) {
    const { data: unit } = await supabase.from('units').select('teacher_id').eq('id', unitId).maybeSingle();
    if (!unit?.teacher_id || unit.teacher_id !== user.id) return { allowed: false, profileId: null };
  }

  if (isAdmin) {
    const profileId = await resolveGradingProfileId(studentOrRosterId);
    return { allowed: true, profileId };
  }

  const { data: roster } = await supabase
    .from('roster_students')
    .select('claimed_profile_id, classes!inner(teacher_id)')
    .eq('id', studentOrRosterId)
    .maybeSingle();

  if (roster) {
    // roster_students.classes is a many-to-one join — at runtime a single row,
    // but TS infers it as an array, so cast through unknown.
    const teacherId = (roster.classes as unknown as { teacher_id: string }).teacher_id;
    if (teacherId !== user.id) return { allowed: false, profileId: null };
    return { allowed: true, profileId: roster.claimed_profile_id ?? null };
  }

  const { data: enrolled, error } = await supabase
    .from('class_enrollments')
    .select('student_id, classes!inner(teacher_id)')
    .eq('student_id', studentOrRosterId)
    .eq('classes.teacher_id', user.id)
    .limit(1);
  if (error || !enrolled?.length) return { allowed: false, profileId: null };
  return { allowed: true, profileId: studentOrRosterId };
}

/**
 * Per-student board capture (generic): record a teacher's Correct/Wrong grade
 * for the selected student on a known objective id. Used by grammar/phonics
 * board practice (whose objective target is a rule/sound, not a vocab word).
 * Verifies the teacher owns the unit + the student is on their roster first.
 */
/**
 * Teacher Baton manual grade: credit the selected student on THEIR weakest
 * objective in the unit (lowest retrievability). Used when the teacher elicits
 * orally (no board-game auto-capture) and marks the responder Correct/Wrong.
 * For a brand-new student (no srs_items yet) grades the first vocab objective.
 */
export async function gradeStudentWeakest(
  studentId: string,
  unitId: string,
  correct: boolean,
): Promise<boolean> {
  const { allowed, profileId } = await assertTeacherMayGrade(studentId, unitId);
  if (!allowed) {
    log.warn('grade_weakest_unauthorized', { metadata: { studentId, unitId } });
    return false;
  }
  if (!profileId) return false;
  let objectiveId: string | null = null;
  try {
    const { data: objs } = await supabase.from('objectives').select('id').eq('unit_id', unitId).eq('type', 'vocabulary');
    if (!objs || objs.length === 0) return false;
    const ids = objs.map((o) => o.id);
    const { data: srs } = await supabase
      .from('srs_items')
      .select('id, objective_id, stability, last_review')
      .eq('student_id', profileId)
      .in('objective_id', ids);
    if (srs && srs.length > 0) {
      // weakest = lowest retrievability now.
      let worst = { id: ids[0], r: 2 };
      for (const r of srs) {
        const elapsed = r.last_review ? (Date.now() - new Date(r.last_review).getTime()) / 86400000 : 0;
        const rv = retrievability(Number(r.stability) || 0, elapsed);
        if (rv < worst.r) worst = { id: r.objective_id as string, r: rv };
      }
      objectiveId = worst.id;
    } else {
      objectiveId = ids[0];
    }
  } catch (err) {
    log.warn('grade_weakest_resolve_error', { error: err instanceof Error ? err.message : String(err) });
    return false;
  }
  if (!objectiveId) return false;
  const res = await recordAttempt(profileId, objectiveId, teacherGradeToFsrs(correct), {
    modality: 'receptive',
  });
  return res !== null;
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
  const { allowed, profileId } = await assertTeacherMayGrade(studentId, unitId);
  if (!allowed) {
    log.warn('grade_objective_unauthorized', { metadata: { studentId, unitId } });
    return false;
  }
  if (!profileId || !objectiveId) return false;
  const res = await recordAttempt(profileId, objectiveId, teacherGradeToFsrs(correct), { modality });
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
  const { allowed, profileId } = await assertTeacherMayGrade(studentId, unitId);
  if (!allowed) {
    log.warn('grade_student_unauthorized', { metadata: { studentId, unitId } });
    return false;
  }
  if (!profileId) return false;
  const objectiveId = await resolveObjectiveId(unitId, word);
  if (!objectiveId) {
    log.warn('grade_student_no_objective', { metadata: { unitId, word } });
    return false;
  }
  const res = await recordAttempt(profileId, objectiveId, teacherGradeToFsrs(correct), {
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
  const profileIds = await profileIdsForClassWeak(studentIds);
  if (profileIds.length === 0) return [];
  try {
    const now = new Date();
    const { data: objectives, error } = await supabase
      .from('objectives')
      .select('id')
      .eq('unit_id', unitId)
      .eq('type', 'vocabulary');
    if (error || !objectives || objectives.length === 0) return [];

    const objectiveIds = objectives.map((o) => o.id);

    const { data: rows, error: rErr } = await supabase
      .from('srs_items')
      .select('id, objective_id, stability, difficulty, reps, lapses, mastery_state, last_review, next_review')
      .in('student_id', profileIds)
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
