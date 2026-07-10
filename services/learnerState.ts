// =====================================================================
// LearnerState service — the per-student, per-objective memory model.
// ---------------------------------------------------------------------
// Extends `Engine` (SupabaseService) with the FSRS-driven read/write seam:
//   - getLearnerState: read srs_items for a student+objectives, computing
//     retrievability (R) and EFFECTIVE mastery (crack-on-read) on the fly.
//   - recordAttempt: advance one objective's FSRS state + mastery ladder on a
//     graded exercise result. This is the single write path that closes the
//     "SRS feeds back into selection" loop (audit G6) for BOTH tracks.
//   - hearts: compute-on-read economy (no cron).
//   - selectors: weakest-first (Lesson) and due+weak (Practice).
//
// R is NEVER stored; mastery 'decaying' is COMPUTED ON READ; hearts regenerate
// on read. All three keep a single source of truth without a scheduler job.
// =====================================================================

import { supabase } from './supabaseClient';
import { createClientLogger } from './logger';
import {
  Grade,
  FsrsState,
  MasteryState,
  MasteryMeta,
  schedule,
  recordMastery,
  retrievability,
  elapsedDays,
  effectiveMasteryState,
  isDue,
  GRADE_RATING,
} from './fsrs';
import type { ExerciseType, Modality } from '../types/exercise';
import { modalityOf } from '../types/exercise';

const log = createClientLogger('LearnerState');

export const HEARTS_MAX = 5;
const HEART_REGEN_MS = 4 * 60 * 60 * 1000; // 1 heart per 4h
const CRACK_THRESHOLD = 0.85;

export interface ObjectiveState {
  objective_id: string;
  srs_item_id: string | null;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  /** Stored mastery state (may still be 'mastered' even if currently decaying). */
  mastery_state: MasteryState;
  /** Mastery after compute-on-read crack: 'mastered'→'decaying' when R<0.85. */
  effective_mastery: MasteryState;
  /** Probability of recall right now (computed, never stored). */
  retrievability: number;
  last_review: string | null;
  next_review: string | null;
  is_due: boolean;
}

export interface HeartsState {
  current: number;
  max: number;
  stored: number;
  next_heart_ms: number | null;
}

function rowToState(row: any): ObjectiveState {
  const now = new Date();
  const elapsed = elapsedDays(row?.last_review ?? null, now);
  const stability = Number(row?.stability) || 0;
  const r = retrievability(stability, elapsed);
  const stored = (row?.mastery_state as MasteryState) || 'new';
  const effective = effectiveMasteryState(stored, r, CRACK_THRESHOLD);
  return {
    objective_id: row?.objective_id ?? '',
    srs_item_id: row?.id ?? null,
    stability,
    difficulty: Number(row?.difficulty) || 0,
    reps: Number(row?.reps) || 0,
    lapses: Number(row?.lapses) || 0,
    mastery_state: stored,
    effective_mastery: effective,
    retrievability: r,
    last_review: row?.last_review ?? null,
    next_review: row?.next_review ?? null,
    is_due: isDue(row?.next_review ?? null, now),
  };
}

/**
 * Read the FSRS/learner state for a student across the given objectives.
 * Returns a Map keyed by objective_id. Missing objectives are absent from the
 * map (caller treats absence as a cold 'new' state with R unknown).
 */
export async function getLearnerState(
  studentId: string,
  objectiveIds: string[],
): Promise<Map<string, ObjectiveState>> {
  const out = new Map<string, ObjectiveState>();
  if (!studentId || objectiveIds.length === 0) return out;
  try {
    const { data, error } = await supabase
      .from('srs_items')
      .select('id, objective_id, stability, difficulty, reps, lapses, mastery_state, last_review, next_review')
      .eq('student_id', studentId)
      .in('objective_id', objectiveIds);
    if (error) {
      log.warn('get_learner_state_failed', { error: error.message });
      return out;
    }
    for (const row of data || []) {
      if (row.objective_id) out.set(row.objective_id, rowToState(row));
    }
  } catch (err) {
    log.warn('get_learner_state_error', { error: err instanceof Error ? err.message : String(err) });
  }
  return out;
}

/** Average retrievability across a roster for one objective (class-weak metric). */
export function averageRetrievability(states: ObjectiveState[]): number {
  if (states.length === 0) return 1;
  return states.reduce((sum, s) => sum + s.retrievability, 0) / states.length;
}

/**
 * Resolve the authenticated student id (fallback to auth.uid() when omitted).
 */
async function resolveStudentId(studentId?: string): Promise<string | null> {
  if (studentId) return studentId;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Record one graded attempt on an objective: advance FSRS memory state and the
 * mastery ladder, persist, and return the updated state. Creates the student's
 * srs_item row if none exists yet (objective must already be linked).
 *
 * `modality` is derived from `exerciseType` when omitted (receptive vs
 * productive) — it controls which rung of the mastery ladder this attempt can
 * advance (receptive -> learning; productive -> familiar/mastered).
 */
export async function recordAttempt(
  studentId: string | undefined,
  objectiveId: string,
  grade: Grade,
  opts: { exerciseType?: ExerciseType; modality?: Modality } = {},
): Promise<ObjectiveState | null> {
  const sid = await resolveStudentId(studentId);
  if (!sid || !objectiveId) return null;
  const modality: Modality = opts.modality ?? (opts.exerciseType ? modalityOf(opts.exerciseType) : 'receptive');
  const now = new Date();

  // Fetch existing student row for this objective.
  const { data: existing } = await supabase
    .from('srs_items')
    .select('*')
    .eq('student_id', sid)
    .eq('objective_id', objectiveId)
    .maybeSingle();

  const prev: Partial<FsrsState> = existing
    ? {
        stability: Number(existing.stability) || 0,
        difficulty: Number(existing.difficulty) || 0,
        reps: Number(existing.reps) || 0,
        lapses: Number(existing.lapses) || 0,
        last_review: existing.last_review ?? null,
      }
    : {};

  const next = schedule(prev, grade, now);
  const metaIn: MasteryMeta = (existing?.mastery_meta && typeof existing.mastery_meta === 'object'
    ? existing.mastery_meta
    : {}) as MasteryMeta;
  const mastery = recordMastery({
    state: (existing?.mastery_state as MasteryState) || 'new',
    meta: metaIn,
    grade,
    modality,
    now,
  });

  const patch = {
    stability: next.stability,
    difficulty: next.difficulty,
    reps: next.reps,
    lapses: next.lapses,
    last_review: next.last_review,
    next_review: next.next_review,
    mastery_state: mastery.state,
    mastery_meta: mastery.meta,
  };

  let rowId: string | null = existing?.id ?? null;

  try {
    // Atomic upsert on (student_id, objective_id) — closes the read-then-insert
    // race that could create duplicate srs_items rows for concurrent attempts.
    // (Requires the unique constraint added in the srs_items evolution; the
    // prior-state SELECT above still drives the FSRS computation.)
    const { data: upserted, error } = await supabase
      .from('srs_items')
      .upsert({ student_id: sid, objective_id: objectiveId, ...patch }, { onConflict: 'student_id,objective_id' })
      .select('id')
      .single();
    if (error) {
      log.warn('record_attempt_upsert_failed', { error: error.message });
      return null;
    }
    // NOTE: do NOT mutate `existing` (it is null on a cold start). Track the row
    // id locally so the returned ObjectiveState is correct for new items too.
    rowId = upserted?.id ?? existing?.id ?? null;
  } catch (err) {
    log.warn('record_attempt_error', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }

  return rowToState({
    id: rowId,
    objective_id: objectiveId,
    ...patch,
  });
}

/**
 * Reconcile a student's deck against a unit's objective-linked templates: add
 * student-scoped srs_items for any objective the student is missing (non-
 * destructive; preserves existing progress). Evolves ensureStudentSRSItems to
 * the objective model.
 */
export async function ensureStudentLearnerState(unitId: string, studentId: string): Promise<void> {
  if (!unitId || !studentId) return;
  try {
    const { data: objectives, error: oErr } = await supabase
      .from('objectives')
      .select('id, type, target_value')
      .eq('unit_id', unitId);
    if (oErr || !objectives || objectives.length === 0) return;

    const { data: have } = await supabase
      .from('srs_items')
      .select('objective_id')
      .eq('student_id', studentId)
      .in('objective_id', objectives.map((o) => o.id));

    const haveSet = new Set((have || []).map((r) => r.objective_id).filter(Boolean));
    const missing = objectives.filter((o) => !haveSet.has(o.id));
    if (missing.length === 0) return;

    const rows = missing.map((o) => ({
      student_id: studentId,
      unit_id: unitId,
      objective_id: o.id,
      word: o.target_value,
      mastery_state: 'new' as const,
      next_review: new Date().toISOString(),
    }));
    const { error } = await supabase.from('srs_items').insert(rows);
    if (error) log.warn('ensure_learner_state_insert_failed', { error: error.message });
  } catch (err) {
    log.warn('ensure_learner_state_error', { error: err instanceof Error ? err.message : String(err) });
  }
}

// ---------------------------------------------------------------------
// Hearts — compute-on-read economy (audit Bug #9). No cron.
//   displayed = min(HEARTS_MAX, stored + floor(elapsed/4h))
// ---------------------------------------------------------------------

export async function getHearts(studentId?: string): Promise<HeartsState> {
  const sid = await resolveStudentId(studentId);
  if (!sid) return { current: HEARTS_MAX, max: HEARTS_MAX, stored: HEARTS_MAX, next_heart_ms: null };
  const { data } = await supabase
    .from('student_progress')
    .select('hearts, hearts_updated_at')
    .eq('student_id', sid)
    .maybeSingle();
  const stored = Number(data?.hearts ?? HEARTS_MAX);
  const updatedAt = data?.hearts_updated_at ? new Date(data.hearts_updated_at).getTime() : Date.now();
  return computeHeartsState(stored, updatedAt, Date.now());
}

/** Pure hearts computation (extracted for unit testing). No I/O. */
export function computeHeartsState(
  stored: number,
  updatedAtMs: number,
  nowMs: number,
  max = HEARTS_MAX,
  regenMs = HEART_REGEN_MS,
): HeartsState {
  const elapsed = Math.max(0, nowMs - updatedAtMs);
  const regen = Math.floor(elapsed / regenMs);
  const current = Math.min(max, Math.max(0, stored) + regen);
  const nextHeartMs = current >= max ? null : regenMs - (elapsed % regenMs);
  return { current, max, stored: Math.max(0, Math.min(max, stored)), next_heart_ms: nextHeartMs };
}

async function writeHearts(studentId: string, newStored: number): Promise<HeartsState> {
  const stored = Math.max(0, Math.min(HEARTS_MAX, newStored));
  await supabase
    .from('student_progress')
    .update({ hearts: stored, hearts_updated_at: new Date().toISOString() })
    .eq('student_id', studentId);
  return { current: stored, max: HEARTS_MAX, stored, next_heart_ms: HEART_REGEN_MS };
}

/** Lose a heart on a productive error (receptive errors only warn). */
export async function loseHeart(studentId: string, isProductive: boolean): Promise<HeartsState> {
  if (!isProductive) return getHearts(studentId);
  const h = await getHearts(studentId);
  if (h.current <= 0) return h;
  return writeHearts(studentId, h.current - 1);
}

/** Restore a heart (e.g. completing a review session). */
export async function restoreHeart(studentId: string): Promise<HeartsState> {
  const h = await getHearts(studentId);
  if (h.current >= HEARTS_MAX) return h;
  return writeHearts(studentId, h.current + 1);
}

// ---------------------------------------------------------------------
// Selection helpers — drive Lesson (weakest-first) + Practice (due+weak).
// ---------------------------------------------------------------------

/**
 * Rank objective ids weakest-first (lowest retrievability first; ties broken
 * by due-soonest). Used by the Lesson selector to prioritise fragile skills.
 */
export function rankWeakestFirst(states: Map<string, ObjectiveState>): string[] {
  return Array.from(states.values())
    .sort((a, b) => a.retrievability - b.retrievability || (a.next_review ?? '').localeCompare(b.next_review ?? ''))
    .map((s) => s.objective_id);
}

/** Map a graded exercise result to the 4-grade rating (escalation ladder aware). */
export function gradeFromResult(result: { success: boolean; time_taken_ms: number; attempts: number }): Grade {
  if (!result.success) return 'again';
  if (result.attempts <= 1 && result.time_taken_ms < 4000) return 'easy';
  if (result.attempts > 1) return 'hard';
  return 'good';
}

// ---------------------------------------------------------------------
// Mastery summary (Phase 4) — crowns, cracked nodes, unit completion.
//   crowns        : objectives at familiar or mastered (a crown-piece each),
//                   full crown once mastered.
//   crackedCount  : mastered objectives whose computed R fell below the crack
//                   threshold (compute-on-read; the unit needs a review lesson).
//   isComplete    : every objective is mastered (unit completion = 100% crowns,
//                   not an XP threshold — Locked Decision #6 / audit A6).
// ---------------------------------------------------------------------

export interface UnitMasterySummary {
  total: number;
  new: number;
  learning: number;
  familiar: number;
  mastered: number;
  decaying: number;
  crowns: number;
  crackedCount: number;
  completion: number; // 0..1 share of objectives mastered
  isComplete: boolean;
}

/**
 * Summarise a student's mastery over a unit's objectives (crowns + cracks +
 * completion). Reads the LearnerState; never mutates. Empty/missing unit -> an
 * all-zero summary (clean empty state, never fabricated progress).
 */
export async function getUnitMasterySummary(studentId: string, unitId: string): Promise<UnitMasterySummary> {
  const empty: UnitMasterySummary = {
    total: 0, new: 0, learning: 0, familiar: 0, mastered: 0, decaying: 0,
    crowns: 0, crackedCount: 0, completion: 0, isComplete: false,
  };
  if (!studentId || !unitId) return empty;
  try {
    const { data: objectives, error } = await supabase
      .from('objectives')
      .select('id')
      .eq('unit_id', unitId);
    if (error || !objectives || objectives.length === 0) return empty;

    const ids = objectives.map((o) => o.id);
    const states = await getLearnerState(studentId, ids);

    const summary: UnitMasterySummary = { ...empty, total: ids.length };
    for (const id of ids) {
      const st = states.get(id);
      const effective = st?.effective_mastery ?? 'new';
      if (effective === 'new') summary.new += 1;
      else if (effective === 'learning') summary.learning += 1;
      else if (effective === 'familiar') summary.familiar += 1;
      else if (effective === 'mastered') summary.mastered += 1;
      else if (effective === 'decaying') { summary.decaying += 1; summary.crackedCount += 1; }
      // Crown = familiar or mastered (acquired); full crown at mastered.
      if (effective === 'familiar' || effective === 'mastered') summary.crowns += 1;
    }
    summary.completion = summary.total > 0 ? summary.mastered / summary.total : 0;
    summary.isComplete = summary.total > 0 && summary.mastered === summary.total;
    return summary;
  } catch (err) {
    log.warn('mastery_summary_error', { error: err instanceof Error ? err.message : String(err) });
    return empty;
  }
}

// ---------------------------------------------------------------------
// Roster mastery aggregation (plan 4.5 dashboards). One batched query over the
// roster's srs_items, counted in memory — real per-student mastery counts to
// replace XP-only analytics in teacher Reports/Dashboard.
// ---------------------------------------------------------------------

export interface StudentMasteryCount {
  mastered: number;     // familiar + mastered (acquired skills)
  fullMastered: number; // mastered only
  cracked: number;      // stored mastered whose R fell below the crack threshold
  total: number;        // srs_items with an objective link
}

export async function getClassMasteryCounts(
  studentIds: string[],
  now: Date = new Date(),
): Promise<Map<string, StudentMasteryCount>> {
  const out = new Map<string, StudentMasteryCount>();
  if (!studentIds || studentIds.length === 0) return out;
  try {
    const { data, error } = await supabase
      .from('srs_items')
      .select('student_id, mastery_state, stability, last_review')
      .in('student_id', studentIds)
      .not('objective_id', 'is', null);
    if (error || !data) return out;
    for (const r of data) {
      const sid = r.student_id as string;
      if (!sid) continue;
      const stored = (r.mastery_state as MasteryState) || 'new';
      // Compute-on-read crack: a stored 'mastered' item whose R < threshold counts
      // as cracked (needs review), matching the HomeMap cracked-node logic.
      const rVal = retrievability(Number(r.stability) || 0, elapsedDays(r.last_review, now));
      const effective = effectiveMasteryState(stored, rVal);
      const c = out.get(sid) || { mastered: 0, fullMastered: 0, cracked: 0, total: 0 };
      c.total += 1;
      if (effective === 'familiar' || effective === 'mastered') c.mastered += 1;
      if (effective === 'mastered') c.fullMastered += 1;
      if (effective === 'decaying') c.cracked += 1;
      out.set(sid, c);
    }
    return out;
  } catch (err) {
    log.warn('class_mastery_counts_error', { error: err instanceof Error ? err.message : String(err) });
    return out;
  }
}

export { GRADE_RATING };
