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
import { mulberry32, seededShuffle } from './seededRandom';

const log = createClientLogger('PoolService');

// Difficulty buckets for selection (a pedagogical axis, distinct from the
// receptive/productive MODALITY axis used for hearts). Together these cover all
// 12 Core-v1 types so nothing the generator emits is unreachable.
const RECEPTIVE = ['IMAGE_SELECT', 'LISTEN_SELECT', 'MEANING_MATCH', 'AUDIO_L1_SELECT', 'SPELL_CLOZE'];
const CONSTRAINED = ['WORD_BANK_BUILD', 'ERROR_SPOT', 'TRANSFORM', 'MINIMAL_PAIR_SWIPE'];
const FREE = ['TYPE_TRANSLATE', 'SPEAK_SENTENCE', 'DICTATION'];

/** Loop-stage rank: 0 recognize → 1 recall → 2 produce (P-C round sequencer). */
export function loopStageRank(type: string): number {
  if (RECEPTIVE.includes(type)) return 0;
  if (CONSTRAINED.includes(type)) return 1;
  return 2;
}

/**
 * Order a session's items into the teach→recognize→recall→produce ARC so a round
 * never asks for production before recognition. Primary key = stage (receptive,
 * constrained, free); secondary = weakest-first (lowest retrievability; unseen
 * words count as 0 so brand-new vocabulary leads each stage). P-C.
 */
function sortByLoopStage(items: PoolItem[], rByObj: Map<string, number>): PoolItem[] {
  return items.slice().sort(
    (a, b) =>
      loopStageRank(a.exercise_type) - loopStageRank(b.exercise_type) ||
      (rByObj.get(a.objective_id) ?? 0) - (rByObj.get(b.objective_id) ?? 0),
  );
}
export { sortByLoopStage };

/**
 * Shuffle within each loop-stage run (recognize → recall → produce) so replays
 * vary while the pedagogical arc is preserved. Pure + seeded — the player rolls
 * a fresh seed per battery mount (solo variety, audit 2026-09-10 F1); tests
 * pass fixed seeds for determinism.
 */
export function variateWithinStages<T extends { exercise_type: string }>(items: readonly T[], seed: number): T[] {
  const rng = mulberry32(seed >>> 0);
  const out: T[] = [];
  let run: T[] = [];
  const flush = () => { out.push(...seededShuffle(run, rng)); run = []; };
  let prevStage = -1;
  for (const it of items) {
    const st = loopStageRank(it.exercise_type);
    if (run.length > 0 && st !== prevStage) flush();
    run.push(it);
    prevStage = st;
  }
  flush();
  return out;
}

/** A game family thinner than this relaxes to all types (never a starved battery). */
export const MIN_FAMILY_ITEMS = 3;

/**
 * Restrict candidate rows to a game's exercise-type family. Qualifies on ITEM
 * count alone (v2, 2026-09-10): the v1 objectives guard wrongly relaxed
 * single-objective families (8 story-comprehension MCQs on 1 objective) into
 * the generic mixed battery — the fill pass in selectLessonItems now handles
 * thin-objective families instead. Falls back to the unfiltered rows when the
 * family is too thin to serve a session at all. Pure; exported for tests.
 */
export function applyFamilyFilter(
  rows: readonly { objective_id: string | null; exercise_type: string }[],
  types: readonly string[] | undefined,
): { rows: typeof rows; relaxed: boolean } {
  if (!types || types.length === 0) return { rows, relaxed: false };
  const family = new Set(types);
  const inFamily = rows.filter((r) => family.has(r.exercise_type));
  if (inFamily.length >= MIN_FAMILY_ITEMS) {
    return { rows: inFamily, relaxed: false };
  }
  return { rows, relaxed: true };
}

/**
 * Signature-first ordering (v2): pull the game's signature exercise types to
 * the front (in signature order) so a battery OPENS on the game's own
 * mechanic; everything else keeps its arc order behind them. Pure.
 */
export function orderFamily<T extends { exercise_type: string }>(
  items: readonly T[],
  signature: readonly string[],
): T[] {
  if (signature.length === 0) return items.slice();
  const rank = new Map(signature.map((t, i) => [t, i]));
  const sig = items
    .filter((it) => rank.has(it.exercise_type))
    .sort((a, b) => (rank.get(a.exercise_type) ?? 0) - (rank.get(b.exercise_type) ?? 0));
  const rest = items.filter((it) => !rank.has(it.exercise_type));
  return [...sig, ...rest];
}

/**
 * The selection core as a pure function (shared by selectLessonItems and the
 * real-data family tests): one mastery-appropriate item per objective, then —
 * in family mode — repeat fill passes (max `maxPerObjective` per objective)
 * so families concentrated on few objectives still fill a battery. When a
 * seed is supplied, each objective's options are shuffled first: DB order is
 * alphabetical by type, which would otherwise make every battery of a family
 * serve the SAME type wall-to-wall.
 */
export interface BatteryPick {
  id: string;
  objective_id: string | null;
  exercise_type: string;
}

export function buildBatteryIds(
  candidateRows: readonly BatteryPick[],
  states: ReadonlyMap<string, ObjectiveState>,
  order: readonly string[],
  count: number,
  opts?: { family?: boolean; seed?: number; maxPerObjective?: number },
): string[] {
  const byObjectiveType = new Map<string, BatteryPick[]>();
  for (const r of candidateRows) {
    const oid = r.objective_id ?? '';
    const arr = byObjectiveType.get(oid) || [];
    arr.push(r);
    byObjectiveType.set(oid, arr);
  }
  if (opts?.seed !== undefined) {
    const rng = mulberry32(opts.seed >>> 0);
    for (const arr of byObjectiveType.values()) {
      const shuffled = seededShuffle(arr, rng);
      arr.length = 0;
      arr.push(...shuffled);
    }
  }

  const chosenIds: string[] = [];
  const perObjective = new Map<string, number>();
  for (const oid of order) {
    if (chosenIds.length >= count) break;
    const picked = pickForObjective(states.get(oid), (byObjectiveType.get(oid) || []) as any);
    if (picked) { chosenIds.push(picked.id); perObjective.set(oid, 1); }
  }
  if (opts?.family) {
    const cap = Math.max(1, opts?.maxPerObjective ?? 3);
    let progress = true;
    while (progress && chosenIds.length < count) {
      progress = false;
      for (const oid of order) {
        if (chosenIds.length >= count) break;
        if ((perObjective.get(oid) ?? 0) >= cap) continue;
        const remaining = (byObjectiveType.get(oid) || []).filter((o) => !chosenIds.includes(o.id));
        if (remaining.length === 0) continue;
        const picked = pickForObjective(states.get(oid), remaining as any);
        if (picked) {
          chosenIds.push(picked.id);
          perObjective.set(oid, (perObjective.get(oid) ?? 0) + 1);
          progress = true;
        }
      }
    }
  }
  return chosenIds;
}

/**
 * Round-robin across the recognize/recall/produce stages (v2): used by the
 * mixed Unit Review battery so consecutive screens alternate modality instead
 * of running all MCQs first. Pure.
 */
export function interleaveStages<T extends { exercise_type: string }>(items: readonly T[]): T[] {
  const buckets: T[][] = [[], [], []];
  for (const it of items) buckets[loopStageRank(it.exercise_type)].push(it);
  const out: T[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const b of buckets) {
      const next = b.shift();
      if (next) { out.push(next); added = true; }
    }
  }
  return out;
}

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

export interface SelectLessonOptions {
  /** Restrict the battery to a game's exercise-type family (see gameRouting). */
  types?: readonly string[];
  /** Seed for within-stage shuffle variety; omit for the deterministic order. */
  seed?: number;
  /** Signature types lead the battery (the game's opening mechanic). */
  signature?: readonly string[];
  /** Round-robin the stage arc (mixed review batteries). */
  interleave?: boolean;
}

/**
 * Lesson selection: rank the unit's objectives weakest-first (lowest
 * retrievability), then pick one mastery-appropriate item per objective.
 * Two-phase: rank on lightweight columns, fetch full content only for the
 * chosen items (avoids transferring the whole unit's content JSONB). Caps at
 * `count` (~12-16). `opts.types` scopes the battery to one game's exercise
 * family (thin families relax to all types); `opts.seed` shuffles within the
 * recognize→recall→produce arc for replay variety.
 */
export async function selectLessonItems(
  unitId: string,
  studentId: string,
  count = 14,
  opts?: SelectLessonOptions,
): Promise<PoolItem[]> {
  try {
    // Phase 1: lightweight columns only (rank + dedupe by objective).
    const { data: rows, error } = await supabase
      .from('pool_items')
      .select('id, objective_id, exercise_type')
      .eq('unit_id', unitId);
    if (error || !rows || rows.length === 0) return [];

    // Game-family scoping (audit 2026-09-10 F1): the tapped game decides which
    // exercise types belong in its battery; a too-thin family relaxes to all.
    const family = applyFamilyFilter(rows, opts?.types);
    if (family.relaxed) {
      log.info('lesson_items_family_relaxed', { metadata: { unitId, familySize: family.rows.length } });
    }

    // FIXPLAN I (#5): a lesson serves only RELEASED objectives (all of them
    // when the unit has no class plans — the RPC handles that). Fail-open.
    // Scope WITHIN the family rows (v2 fix: this previously re-widened the
    // selection to all types whenever a class plan existed).
    let candidateRows = family.rows as { id: string; objective_id: string | null; exercise_type: string }[];
    const { getReleasedObjectiveIds } = await import('./learnerState');
    const released = await getReleasedObjectiveIds(unitId);
    if (released) {
      const allowed = new Set(released);
      candidateRows = candidateRows.filter((r) => allowed.has(r.objective_id));
      if (candidateRows.length === 0) return [];
    }

    const objectives = Array.from(new Set(candidateRows.map((r) => r.objective_id).filter(Boolean) as string[]));
    const states = await getLearnerState(studentId, objectives);
    const ranked = rankWeakestFirst(states);
    const unseen = objectives.filter((id) => !states.has(id));
    const order = unseen.concat(ranked);

    // Selection core (pure, shared with the real-data family tests). Family
    // batteries fill up to 3 items per objective so a family concentrated on
    // few objectives (8 story MCQs on one) still yields a full battery.
    const familyApplied = !family.relaxed && Boolean(opts?.types && opts.types.length > 0);
    const chosenIds = buildBatteryIds(candidateRows, states, order, count, {
      family: familyApplied,
      seed: opts?.seed,
      maxPerObjective: familyApplied ? 3 : 1,
    });
    if (chosenIds.length === 0) return [];

    // Phase 2: fetch full content only for the chosen items.
    const { data: full, error: fullErr } = await supabase
      .from('pool_items')
      .select('*')
      .in('id', chosenIds);
    if (fullErr || !full) return [];
    const byId = new Map(full.map((r) => [r.id, r]));
    const picked = chosenIds.map((id) => toPoolItem(byId.get(id))).filter((p): p is PoolItem => p !== null);
    // P-C: order the session recognize → recall → produce (weakest-first within
    // each). Unseen objectives (absent from `states`) sort as weakest (0).
    const rByObj = new Map<string, number>(objectives.map((oid) => [oid, states.get(oid)?.retrievability ?? 0]));
    let ordered = sortByLoopStage(picked, rByObj);
    if (opts?.seed !== undefined) ordered = variateWithinStages(ordered, opts.seed);
    // v2: the game's signature types open the battery; review interleaves the
    // arc so consecutive screens alternate modality.
    if (opts?.signature && opts.signature.length > 0) ordered = orderFamily(ordered, opts.signature);
    if (opts?.interleave) ordered = interleaveStages(ordered);
    return ordered;
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
    // P-C: order the session recognize → recall → produce (weakest-first within each).
    const rByObj = new Map<string, number>(candidates.map((c) => [c.objective_id, c.r]));
    return sortByLoopStage(out, rByObj);
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
