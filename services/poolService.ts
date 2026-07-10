// Pool selection — drives the Lesson (weakest-first, mastery-escalated) and
// Practice (due + weak across units) runtimes. Both select pool_items ordered
// by the LearnerState so SRS finally feeds back into WHAT is practised (audit
// G6). Selection rules (Locked Decision #5):
//   new / weak -> receptive (IMAGE_SELECT, LISTEN_SELECT, MEANING_MATCH, ...)
//   familiar   -> constrained (WORD_BANK_BUILD, SPELL_CLOZE, ERROR_SPOT, ...)
//   mastered   -> free production (TYPE_TRANSLATE, SPEAK_SENTENCE, DICTATION)
// Failure drops a level + re-queues (handled by recordAttempt lowering mastery).

import { supabase } from './supabaseClient';
import { createClientLogger } from './logger';
import { PoolItem, toPoolItem } from '../types/exercise';
import { getLearnerState, rankWeakestFirst, ObjectiveState } from './learnerState';
import { retrievability, elapsedDays, isDue, effectiveMasteryState } from './fsrs';

const log = createClientLogger('PoolService');

// Difficulty buckets for selection (a pedagogical axis, distinct from the
// receptive/productive MODALITY axis used for hearts). Together these cover all
// 12 Core-v1 types so nothing the generator emits is unreachable.
const RECEPTIVE = ['IMAGE_SELECT', 'LISTEN_SELECT', 'MEANING_MATCH', 'AUDIO_L1_SELECT', 'SPELL_CLOZE'];
const CONSTRAINED = ['WORD_BANK_BUILD', 'ERROR_SPOT', 'TRANSFORM', 'MINIMAL_PAIR_SWIPE'];
const FREE = ['TYPE_TRANSLATE', 'SPEAK_SENTENCE', 'DICTATION'];
const ALL_TYPES = [...RECEPTIVE, ...CONSTRAINED, ...FREE];
const CRACK_THRESHOLD = 0.85;

/** Pick the single best pool item for an objective given its mastery state. */
export function pickForObjective(state: ObjectiveState | undefined, items: PoolItem[]): PoolItem | null {
  if (items.length === 0) return null;
  const m = state?.effective_mastery ?? 'new';
  let preferred: string[];
  if (m === 'mastered') preferred = FREE;
  else if (m === 'familiar') preferred = CONSTRAINED.concat(FREE);
  else preferred = RECEPTIVE; // new / learning / decaying

  const byType = (types: string[]) => items.find((it) => types.includes(it.exercise_type));
  return byType(preferred) || byType(ALL_TYPES) || items[0];
}

/**
 * Lesson selection: rank the unit's objectives weakest-first (lowest
 * retrievability), then pick one mastery-appropriate item per objective.
 * Two-phase: rank on lightweight columns, fetch full content only for the
 * chosen items (avoids transferring the whole unit's content JSONB). Caps at
 * `count` (~12-16).
 */
export async function selectLessonItems(unitId: string, studentId: string, count = 14): Promise<PoolItem[]> {
  try {
    // Phase 1: lightweight columns only (rank + dedupe by objective).
    const { data: rows, error } = await supabase
      .from('pool_items')
      .select('id, objective_id, exercise_type')
      .eq('unit_id', unitId);
    if (error || !rows || rows.length === 0) return [];

    const objectives = Array.from(new Set(rows.map((r) => r.objective_id).filter(Boolean) as string[]));
    const states = await getLearnerState(studentId, objectives);
    const ranked = rankWeakestFirst(states);
    const unseen = objectives.filter((id) => !states.has(id));
    const order = unseen.concat(ranked);

    // Determine the chosen (objective, type) pairs without loading content.
    const byObjectiveType = new Map<string, { id: string; exercise_type: string }[]>();
    for (const r of rows) {
      const arr = byObjectiveType.get(r.objective_id) || [];
      arr.push({ id: r.id, exercise_type: r.exercise_type });
      byObjectiveType.set(r.objective_id, arr);
    }

    const chosenIds: string[] = [];
    for (const oid of order) {
      if (chosenIds.length >= count) break;
      const opts = (byObjectiveType.get(oid) || []).map((o) => ({ ...o } as unknown as PoolItem));
      const picked = pickForObjective(states.get(oid), opts);
      if (picked) chosenIds.push((picked as any).id);
    }
    if (chosenIds.length === 0) return [];

    // Phase 2: fetch full content only for the chosen items.
    const { data: full, error: fullErr } = await supabase
      .from('pool_items')
      .select('*')
      .in('id', chosenIds);
    if (fullErr || !full) return [];
    const byId = new Map(full.map((r) => [r.id, r]));
    // Preserve the (weakest-first) selection order.
    return chosenIds.map((id) => toPoolItem(byId.get(id))).filter((p): p is PoolItem => p !== null);
  } catch (err) {
    log.warn('select_lesson_items_error', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

/**
 * Practice selection: due (next_review <= now) + weak (R < 0.85) items across
 * ALL the student's units, one mastery-appropriate item per objective, mixed
 * types. Uses the STORED mastery_state (with compute-on-read decay) so the full
 * escalation ladder applies — not just two buckets. Bounded server-side by due
 * date. Caps at `count` (~15-20). Replaces the siloed SpacedRepetition queue.
 */
export async function selectPracticeItems(studentId: string, count = 18): Promise<PoolItem[]> {
  try {
    const now = new Date();
    // Bound the fetch: primarily due items (next_review <= now), capped.
    const { data: srs, error } = await supabase
      .from('srs_items')
      .select('id, objective_id, stability, last_review, next_review, mastery_state')
      .eq('student_id', studentId)
      .not('objective_id', 'is', null)
      .or(`next_review.is.null,next_review.lte.${now.toISOString()}`)
      .order('next_review', { ascending: true, nullsFirst: true })
      .limit(200);

    if (error || !srs || srs.length === 0) return [];

    // Keep due items + weak items (R < threshold); compute effective mastery.
    const candidates = srs
      .filter((r) => r.objective_id)
      .map((r) => {
        const r_val = retrievability(Number(r.stability) || 0, elapsedDays(r.last_review, now));
        const stored = (r.mastery_state as ObjectiveState['mastery_state']) || 'new';
        return {
          objective_id: r.objective_id as string,
          r: r_val,
          effective: effectiveMasteryState(stored, r_val, CRACK_THRESHOLD),
          due: isDue(r.next_review, now),
          next_review: r.next_review,
        };
      })
      .filter((c) => c.due || c.r < CRACK_THRESHOLD)
      .sort((a, b) => a.r - b.r || String(a.next_review || '').localeCompare(String(b.next_review || '')));

    if (candidates.length === 0) return [];

    const objectiveIds = candidates.map((c) => c.objective_id);
    const { data: poolRows } = await supabase.from('pool_items').select('*').in('objective_id', objectiveIds);
    if (!poolRows || poolRows.length === 0) return [];

    const byObjective = new Map<string, PoolItem[]>();
    for (const r of poolRows) {
      const item = toPoolItem(r);
      if (!item) continue;
      const arr = byObjective.get(item.objective_id) || [];
      arr.push(item);
      byObjective.set(item.objective_id, arr);
    }

    // Real effective mastery (with compute-on-read decay) drives the ladder.
    const states = new Map<string, ObjectiveState>();
    for (const c of candidates) {
      states.set(c.objective_id, {
        objective_id: c.objective_id,
        srs_item_id: null,
        stability: 0, difficulty: 0, reps: 0, lapses: 0,
        mastery_state: c.effective, effective_mastery: c.effective,
        retrievability: c.r, last_review: null, next_review: c.next_review, is_due: c.due,
      });
    }

    const out: PoolItem[] = [];
    const seen = new Set<string>();
    for (const c of candidates) {
      if (out.length >= count) break;
      if (seen.has(c.objective_id)) continue;
      seen.add(c.objective_id);
      const picked = pickForObjective(states.get(c.objective_id), byObjective.get(c.objective_id) || []);
      if (picked) out.push(picked);
    }
    return out;
  } catch (err) {
    log.warn('select_practice_items_error', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

/** Ensure the student has LearnerState rows for a unit's objectives before play. */
export async function prepareUnitForStudent(unitId: string, studentId: string): Promise<void> {
  const { ensureStudentLearnerState } = await import('./learnerState');
  await ensureStudentLearnerState(unitId, studentId);
}
