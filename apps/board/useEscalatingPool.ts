// useEscalatingPool — the React binding to lessonDirector (architecture §2.3).
//
// A thin wrapper around useBoardPool that, per round, computes WHICH objectives
// to pull, at WHICH rung, for WHICH exercise types — via lessonDirector.buildRound
// + classWeakObjectives. Shells call this instead of useBoardPool directly so
// they get mastery-gated escalation for free.
//
// IMPORTANT: useBoardPool's `exerciseTypes` deps include `exerciseTypes?.join(',')`
// (useBoardPool.ts:70), so passing a new array per round re-fetches as needed.
// No change to useBoardPool's contract was required.

import { useEffect, useMemo, useState } from 'react';
import { useBoardPool } from './useBoardPool';
import { classWeakObjectives } from '../../services/boardLearner';
import { supabase } from '../../services/supabaseClient';
import {
  buildRound,
  nextRungForObjective,
  type ObjectiveType,
  type Phase,
  type RungSrsState,
} from './lessonDirector';
import type { PoolItem } from '../../types/exercise';

export interface UseEscalatingPoolInput {
  unitId: string;
  /** The shell requesting content (reads SHELL_CAPABILITIES[shellType]). */
  shellType: string;
  /** The current slide's phase (reads PHASE_ENVELOPE[phase]). */
  phase: Phase;
  /** Roster student ids (for class-weak ordering + SRS aggregation). */
  roster: string[];
  /** 1-based round index within this slide. */
  roundIndex: number;
  /** Total rounds this slide will run. */
  totalRounds: number;
  /** Max items to select this round. */
  roundSize?: number;
}

export interface UseEscalatingPoolOutput {
  /** Pool items for this round (already filtered to the round's rung + types
   *  via buildRound + useBoardPool). */
  items: PoolItem[];
  loading: boolean;
  /** Objective → target rung for the selected objectives this round. */
  rungByObjective: Record<string, number>;
  /** Objective ids selected this round, weakest-first. */
  selectedObjectiveIds: string[];
}

/**
 * Pull mastery-gated, escalating pool content for one round of a shell.
 *
 * Flow:
 *   1. Load the unit's objectives (id + type) — cached per unitId.
 *   2. Load class-weak ordering + per-objective SRS state — cached per
 *      (unitId, roster). This is the expensive call (classWeakObjectives).
 *   3. buildRound(...) → {selectedObjectiveIds, rungByObjective, exerciseTypes}.
 *   4. useBoardPool({unitId, exerciseTypes, classWeak: true, roster}) → items.
 *   5. Filter items to selectedObjectiveIds (buildRound chose the objectives;
 *      useBoardPool returns items for those types — intersect).
 */
export function useEscalatingPool(input: UseEscalatingPoolInput): UseEscalatingPoolOutput {
  const { unitId, shellType, phase, roster, roundIndex, totalRounds, roundSize = 6 } = input;

  // ── 1. Objectives for this unit (id + type), cached per unitId. ────────
  const [objectives, setObjectives] = useState<{ id: string; type: ObjectiveType }[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!unitId) { setObjectives([]); return; }
    (async () => {
      const { data, error } = await supabase
        .from('objectives')
        .select('id, type')
        .eq('unit_id', unitId);
      if (cancelled) return;
      if (error || !data) { setObjectives([]); return; }
      // Narrow type to the ObjectiveType union; unknown types fall back to 'vocabulary'.
      setObjectives(data.map((o: any) => ({
        id: String(o.id),
        type: (['vocabulary','grammar','story','dialogue','phonics'].includes(o.type) ? o.type : 'vocabulary') as ObjectiveType,
      })));
    })();
    return () => { cancelled = true; };
  }, [unitId]);

  // ── 2. Class-weak ordering + SRS state, cached per (unitId, roster). ───
  // classWeakObjectives returns [{objective_id, retrievability, states: ObjectiveState[]}].
  // Each state carries mastery_state — that's what nextRungForObjective reads.
  const rosterKey = roster.join(',');
  const [weakOrder, setWeakOrder] = useState<string[]>([]);
  const [srsByObjective, setSrsByObjective] = useState<Record<string, RungSrsState | null>>({});
  useEffect(() => {
    let cancelled = false;
    if (!unitId || roster.length === 0) { setWeakOrder([]); setSrsByObjective({}); return; }
    (async () => {
      const weak = await classWeakObjectives(roster, unitId);
      if (cancelled) return;
      setWeakOrder(weak.map((w) => w.objective_id));
      // Aggregate per-objective mastery_state across the roster: take the WORST
      // (lowest) mastery the class has, so escalation respects the weakest
      // student who matters. States not present = null (unseen).
      const order = ['new','learning','familiar','mastered','decaying'] as const;
      const rank = (s: string) => order.indexOf(s as any);
      const srsMap: Record<string, RungSrsState | null> = {};
      for (const w of weak) {
        if (!w.states || w.states.length === 0) { srsMap[w.objective_id] = null; continue; }
        // Worst mastery = lowest in the order above, but 'decaying' (last in
        // array) means "knew it, forgetting" — treat as rung 3 not rung 1, which
        // rawMasteryToRung already does. So pick the min by rawMasteryToRung output.
        let worst: RungSrsState = w.states[0];
        let worstRung = nextRungForObjective('vocabulary', worst);
        for (const s of w.states) {
          const r = nextRungForObjective('vocabulary', s);
          if (r < worstRung) { worst = s; worstRung = r; }
        }
        srsMap[w.objective_id] = worst;
      }
      setSrsByObjective(srsMap);
    })();
    return () => { cancelled = true; };
  }, [unitId, rosterKey]);

  // ── 3. buildRound — the pure selection. Recomputed when any input changes. ──
  const round = useMemo(() => {
    if (objectives.length === 0) {
      return { selectedObjectiveIds: [], rungByObjective: {}, exerciseTypes: [] as string[] };
    }
    const objectiveTypeById: Record<string, ObjectiveType> = {};
    for (const o of objectives) objectiveTypeById[o.id] = o.type;
    return buildRound({
      roundIndex,
      totalRounds,
      objectiveIds: objectives.map((o) => o.id),
      objectiveTypeById,
      srsByObjective,
      weakOrder,
      shellType,
      phase,
      roundSize,
    });
  }, [objectives, srsByObjective, weakOrder, roundIndex, totalRounds, shellType, phase, roundSize]);

  // ── 4. useBoardPool — fetch items for the round's exercise types. ──────
  // Passing a new exerciseTypes array per round re-fetches (deps include join).
  const { items, loading } = useBoardPool({
    unitId,
    exerciseTypes: round.exerciseTypes,
    classWeak: true,
    roster,
    limit: roundSize * 3, // over-pull so filtering to selectedObjectiveIds still yields enough
  });

  // ── 5. Filter items to the round's selected objectives + memoize per round. ──
  const selectedSet = useMemo(() => new Set(round.selectedObjectiveIds), [round.selectedObjectiveIds.join(',')]);
  const filteredItems = useMemo(
    () => items.filter((it) => selectedSet.has(it.objective_id)),
    [items, selectedSet],
  );

  return {
    items: filteredItems,
    loading: loading && filteredItems.length === 0,
    rungByObjective: round.rungByObjective,
    selectedObjectiveIds: round.selectedObjectiveIds,
  };
}
