// ─────────────────────────────────────────────────────────────────────
// stageProgressService — the Student Path engine.
//
// Responsibilities:
//   • resolveUnitPath / deriveDefaultPath — every unit has a playable path:
//     the teacher-saved units.student_path, or a mechanically derived one
//     (existing units work on day one, zero backfill).
//   • computeNodeStates — the ONE unlock evaluator shared by the student
//     map and the player: sequential auto-unlock (Duolingo default) with
//     per-node teacher overrides ('locked' forces closed, 'open' forces
//     playable).
//   • getStageProgress / completeStage — persistence in
//     student_stage_progress (best stars kept, attempts counted, replays
//     allowed).
// ─────────────────────────────────────────────────────────────────────

import { supabase } from './supabaseClient';
import { createClientLogger } from './logger';
import {
  StudentStage,
  StageBlock,
  LEAD_IN_TYPES,
  ICON_FOR_TYPE,
} from '../types/stage';

const log = createClientLogger('stageProgress');

// ── stars ─────────────────────────────────────────────────────────────

export const starsForAccuracy = (accuracy: number): number =>
  accuracy >= 90 ? 3 : accuracy >= 70 ? 2 : 1;

// ── progress rows ─────────────────────────────────────────────────────

export interface StageProgressRow {
  stage_id: string;
  unit_id: string;
  status: 'in_progress' | 'completed';
  stars: number;
  best_accuracy: number;
  attempts: number;
  completed_at: string | null;
}

export type StageProgressMap = Record<string, StageProgressRow>;

/** All stage progress of one student, keyed by stage id. One query. */
export const getAllStageProgress = async (studentId: string): Promise<StageProgressMap> => {
  const { data, error } = await supabase
    .from('student_stage_progress')
    .select('stage_id,unit_id,status,stars,best_accuracy,attempts,completed_at')
    .eq('student_id', studentId);
  if (error) {
    log.warn('error_loading_stage_progress', { error: error.message });
    return {};
  }
  const out: StageProgressMap = {};
  for (const row of data || []) out[row.stage_id] = row as StageProgressRow;
  return out;
};

/**
 * Record a stage completion (upsert). Keeps the BEST stars/accuracy across
 * replays and counts every attempt.
 */
export const completeStage = async (
  studentId: string,
  unitId: string,
  stageId: string,
  accuracy: number,
): Promise<void> => {
  const { data: existing, error: fetchErr } = await supabase
    .from('student_stage_progress')
    .select('stars,best_accuracy,attempts')
    .eq('student_id', studentId)
    .eq('stage_id', stageId)
    .maybeSingle();
  if (fetchErr) log.warn('error_reading_stage_progress', { error: fetchErr.message });

  const prev = (existing || {}) as { stars?: number; best_accuracy?: number; attempts?: number };
  const stars = starsForAccuracy(accuracy);
  const { error } = await supabase
    .from('student_stage_progress')
    .upsert(
      {
        student_id: studentId,
        unit_id: unitId,
        stage_id: stageId,
        status: 'completed',
        stars: Math.max(stars, prev.stars ?? 0),
        best_accuracy: Math.max(Math.round(accuracy), prev.best_accuracy ?? 0),
        attempts: (prev.attempts ?? 0) + 1,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,stage_id' },
    );
  if (error) throw error;
};

// ── the unlock evaluator ──────────────────────────────────────────────

export type NodeVisualState = 'locked' | 'active' | 'completed';

export interface NodeStatus {
  stage: StudentStage;
  state: NodeVisualState;
  /** Best stars earned (0 when not completed). */
  stars: number;
  /** Active or completed — the node may be launched. */
  playable: boolean;
}

/**
 * Sequential unlock with teacher override:
 *   • completed beats everything (it is a fact, and stays replayable);
 *   • 'locked' forces the node closed even if the sequence reached it;
 *   • 'open' forces the node playable (skip ahead);
 *   • 'auto' (default) plays only when the PREVIOUS stage is completed —
 *     an 'open' node does not complete the sequence for the nodes after it.
 * Invisible stages (visible === false) are SKIPPED: they are not returned,
 * do not render in the student app, and do not gate the chain — the node
 * after a hidden one inherits the last visible predecessor's completion.
 */
export const computeNodeStates = (
  path: StudentStage[],
  progress: StageProgressMap,
): NodeStatus[] => {
  const out: NodeStatus[] = [];
  let prevCompleted = true; // the first node has no predecessor
  for (const stage of path) {
    if (stage.visible === false) continue;
    const row = progress[stage.id];
    const completed = row?.status === 'completed';
    let state: NodeVisualState;
    if (completed) {
      state = 'completed';
    } else if (stage.lock === 'locked') {
      state = 'locked';
    } else if (stage.lock === 'open' || prevCompleted) {
      state = 'active';
    } else {
      state = 'locked';
    }
    out.push({ stage, state, stars: row?.stars ?? 0, playable: state !== 'locked' });
    prevCompleted = completed;
  }
  return out;
};

/** True when every stage of the path is completed (the chest condition). */
export const isPathComplete = (nodes: NodeStatus[]): boolean =>
  nodes.length > 0 && nodes.every((n) => n.state === 'completed');

// ── path resolution ───────────────────────────────────────────────────

/**
 * Deterministic 128-bit id (FNV-1a x4, formatted as a UUID) so a DERIVED
 * path yields the same stage ids on every render/session — progress rows
 * written against a derived node keep matching it. Teacher-saved paths use
 * crypto.randomUUID() instead; these two id spaces never need to collide.
 */
const deterministicId = (...parts: (string | number)[]): string => {
  const seeds = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  const hashes = seeds.map((seed) => {
    let h = seed >>> 0;
    for (const part of parts.join('|')) {
      h ^= part.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  });
  const hex = hashes.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const toBlock = (step: any, i: number): StageBlock => ({
  id: step?.id || `step_${i}`,
  type: step?.type || 'GAME_ARENA',
  title: step?.title || step?.type || 'Activity',
  duration: step?.duration ?? 300,
  data: step?.data || {},
  phase: step?.phase,
});

/**
 * Mechanically split a unit's flow into stages: presentation blocks
 * (INTRO_SPLASH / MEDIA_PLAYER / FOCUS_CARDS) attach as lead-ins to the
 * next scored block, each scored block becomes one node, and a final
 * unit-review node is appended. Deterministic ids (see deterministicId).
 */
export const deriveDefaultPath = (unit: { id: string; flow?: any[] }): StudentStage[] => {
  const flow = Array.isArray(unit.flow) ? unit.flow : [];
  const stages: StudentStage[] = [];
  let pending: StageBlock[] = [];

  const flushTrailing = () => {
    if (pending.length === 0) return;
    const last = pending[pending.length - 1];
    stages.push({
      id: deterministicId(unit.id, 'tail', last.id),
      title: last.title,
      icon: ICON_FOR_TYPE[last.type] || 'star',
      kind: 'lesson',
      lock: 'auto',
      xpReward: 10,
      blocks: [...pending],
    });
    pending = [];
  };

  flow.forEach((step: any, i: number) => {
    const block = toBlock(step, i);
    if (LEAD_IN_TYPES.has(block.type)) {
      pending.push(block);
      return;
    }
    stages.push({
      id: deterministicId(unit.id, stages.length, block.id, block.type),
      title: block.title,
      icon: ICON_FOR_TYPE[block.type] || 'star',
      kind: 'lesson',
      lock: 'auto',
      xpReward: 10,
      blocks: [...pending, block],
    });
    pending = [];
  });
  flushTrailing();

  // The unit review node: a mixed battery across the whole unit's pool
  // (the solo player's ExerciseRunner already selects weakest-first).
  stages.push({
    id: deterministicId(unit.id, 'review'),
    title: 'Unit Review',
    icon: 'trophy',
    kind: 'review',
    lock: 'auto',
    xpReward: 15,
    blocks: [
      {
        id: deterministicId(unit.id, 'review', 'block'),
        type: 'UNIT_REVIEW',
        title: 'Unit Review',
        duration: 420,
        data: { poolDriven: true, review: true },
        phase: 'ASSESS',
      },
    ],
  });

  return stages;
};

/** Coerce stored JSON into StudentStage, dropping unusable entries. */
const normalizeStage = (raw: any): StudentStage | null => {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  return {
    id: String(raw.id),
    title: raw.title || 'Lesson',
    icon: raw.icon || 'star',
    kind: raw.kind === 'review' ? 'review' : 'lesson',
    lock: raw.lock === 'locked' || raw.lock === 'open' ? raw.lock : 'auto',
    visible: raw.visible !== false,
    xpReward: typeof raw.xpReward === 'number' ? raw.xpReward : 10,
    blocks: Array.isArray(raw.blocks) ? raw.blocks.map(toBlock) : [],
  };
};

/**
 * The playable path of a unit: the teacher-saved student_path when present,
 * otherwise the mechanically derived default (never empty — review node
 * always exists so the path is always playable).
 */
export const resolveUnitPath = (unit: {
  id: string;
  flow?: any[];
  studentPath?: StudentStage[] | any[];
}): StudentStage[] => {
  const saved = Array.isArray(unit.studentPath)
    ? unit.studentPath.map(normalizeStage).filter((s: StudentStage | null): s is StudentStage => s !== null)
    : [];
  if (saved.length > 0) return saved;
  return deriveDefaultPath(unit);
};
