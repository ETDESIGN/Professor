// useBoardPool — the board-track pool hook. Lets competitive board games pull
// fresh items from the shared pool_items table (instead of the frozen flow data
// that caused Bug #11: a single vocab[0] per activity). Optionally orders items
// class-weak-first (using the roster's LearnerState) so a game surfaces the words
// the class struggles with most.

import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { PoolItem, toPoolItem } from '../../types/exercise';
import { classWeakObjectives } from '../../services/boardLearner';
import { useSession } from '../../store/SessionContext';
import { makeRng, seededShuffle } from '../../services/seededRandom';
import { denseWeakRanks } from './lessonDirector';

interface Options {
  unitId: string;
  exerciseTypes?: string[];
  /** When true with a roster, order objectives class-weak-first (lowest avg R). */
  classWeak?: boolean;
  roster?: string[];
  /** Cap the number of items returned (applied client-side, AFTER the
   * shuffle — see below). */
  limit?: number;
  /** Changing this value forces a refetch (retry button). */
  refreshKey?: number;
}

export interface BoardPoolState {
  items: PoolItem[];
  loading: boolean;
  /** True when the last fetch FAILED (transient network/RLS error) — lets the
   * shell say "couldn't load, retry" instead of the misleading "no content". */
  error: boolean;
  /** Objective ids ordered weakest-first (when classWeak requested). */
  weakOrder: string[];
}

export function useBoardPool({ unitId, exerciseTypes, classWeak, roster, limit, refreshKey }: Options): BoardPoolState {
  const [items, setItems] = useState<PoolItem[]>([]);
  const [weakOrder, setWeakOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // FIXPLAN E1.3: seed the pool deal from the shared session scope. The
  // commander preview and the projector each run this hook — Math.random dealt
  // DIFFERENT pool orders per tab ("different content on screens"). Seeded by
  // (sessionId, unitId) both tabs deal identically; games add turn/round parts
  // on top via makeRng when they reshuffle per pick.
  const { state } = useSession();
  const sessionId = state.sessionId ?? 'local';
  // FIXPLAN I (#8): a class session serves ONLY the current class's material.
  // The active class plan's resolved objective ids scope the pull; a whole-
  // unit session (no plan) keeps today's behavior.
  const scopeObjectiveIds: string[] | null = (() => {
    const ids = state.activeClassPlan?.content_index?.objective_ids;
    return Array.isArray(ids) && ids.length > 0 ? ids : null;
  })();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!unitId) { setLoading(false); return; }
      setLoading(true);
      setError(false);

      let weakRankMap: Record<string, number> = {};
      if (classWeak && roster && roster.length > 0) {
        const weak = await classWeakObjectives(roster, unitId);
        weakRankMap = denseWeakRanks(weak);
        if (!cancelled) setWeakOrder(Object.keys(weakRankMap));
      }

      // Fetch the whole unit pool for the requested types (bounded: ~15 words
      // × ~10 types per unit), with only a generous safety cap. The caller's
      // `limit` must NOT be applied at the DB: generate-exercises inserts rows
      // grouped word-by-word in vocab order and PostgREST applies .limit()
      // before any client ordering — a DB-side limit always returned the FIRST
      // words' items, so later words were structurally unreachable ("zoo every
      // round, the rest of the pool never used"). The caller's cap is applied
      // client-side AFTER the shuffle below.
      let query = supabase.from('pool_items').select('*').eq('unit_id', unitId).limit(500);
      if (exerciseTypes && exerciseTypes.length > 0) query = query.in('exercise_type', exerciseTypes);
      if (scopeObjectiveIds) query = query.in('objective_id', scopeObjectiveIds);
      const { data, error: queryError } = await query;
      if (cancelled) return;
      if (queryError || !data) { setItems([]); setError(true); setLoading(false); return; }

      let pool = data.map(toPoolItem).filter((p): p is PoolItem => p !== null);

      // Session variety (NEWGEN_AUDIT §3.7): the DB returns insertion order and
      // the weak-rank sort below is stable — without a shuffle, every session
      // served the same first-N items in the same order ("same items repeating").
      // Shuffle first, THEN stable-sort by weak rank, so weak-first ordering is
      // preserved but order within equal ranks varies.
      // FIXPLAN E1.3: the shuffle is SEEDED on (sessionId, unitId) — identical
      // on every tab of one session (cross-tab deal agreement), and the weak-rank
      // ordering still drives which objectives surface first.
      // Dense ranks, not positional (2026-08-30): ties — equal retrievability —
      // share a rank and keep the seeded shuffle order, so a fresh class (every
      // word at R = 0) doesn't freeze the same first words forever.
      pool = seededShuffle(pool, makeRng(sessionId, unitId));
      if (Object.keys(weakRankMap).length > 0) {
        const rankValues = Object.values(weakRankMap);
        const fallbackRank = rankValues.length > 0 ? Math.max(...rankValues) + 1 : 0;
        const rank = (oid: string) => weakRankMap[oid] ?? fallbackRank;
        pool = pool.slice().sort((a, b) => rank(a.objective_id) - rank(b.objective_id));
      }

      // Caller's cap applies AFTER the shuffle/weak-rank ordering, so it keeps
      // a random (or weak-first) cross-section of the WHOLE pool instead of
      // the DB's first-inserted words.
      if (limit && limit > 0) pool = pool.slice(0, limit);

      if (!cancelled) { setItems(pool); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [unitId, sessionId, scopeObjectiveIds?.join(','), exerciseTypes?.join(','), classWeak, roster?.join(','), limit, refreshKey]);

  return { items, loading, error, weakOrder };
}
