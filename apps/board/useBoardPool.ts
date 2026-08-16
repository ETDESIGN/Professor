// useBoardPool — the board-track pool hook. Lets competitive board games pull
// fresh items from the shared pool_items table (instead of the frozen flow data
// that caused Bug #11: a single vocab[0] per activity). Optionally orders items
// class-weak-first (using the roster's LearnerState) so a game surfaces the words
// the class struggles with most.

import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { PoolItem, toPoolItem } from '../../types/exercise';
import { classWeakObjectives } from '../../services/boardLearner';

interface Options {
  unitId: string;
  exerciseTypes?: string[];
  /** When true with a roster, order objectives class-weak-first (lowest avg R). */
  classWeak?: boolean;
  roster?: string[];
  /** Cap the number of items returned (applied client-side, AFTER the
   * shuffle — see below). */
  limit?: number;
}

export interface BoardPoolState {
  items: PoolItem[];
  loading: boolean;
  /** Objective ids ordered weakest-first (when classWeak requested). */
  weakOrder: string[];
}

export function useBoardPool({ unitId, exerciseTypes, classWeak, roster, limit }: Options): BoardPoolState {
  const [items, setItems] = useState<PoolItem[]>([]);
  const [weakOrder, setWeakOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!unitId) { setLoading(false); return; }
      setLoading(true);

      let order: string[] = [];
      if (classWeak && roster && roster.length > 0) {
        const weak = await classWeakObjectives(roster, unitId);
        order = weak.map((w) => w.objective_id);
        if (!cancelled) setWeakOrder(order);
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
      const { data, error } = await query;
      if (cancelled) return;
      if (error || !data) { setItems([]); setLoading(false); return; }

      let pool = data.map(toPoolItem).filter((p): p is PoolItem => p !== null);

      // Session variety (NEWGEN_AUDIT §3.7): the DB returns insertion order and
      // the weak-rank sort below is stable — without a shuffle, every session
      // served the same first-N items in the same order ("same items repeating").
      // Shuffle first, THEN stable-sort by weak rank, so weak-first ordering is
      // preserved but order within equal ranks is random per session.
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      if (order.length > 0) {
        const rank = (oid: string) => {
          const i = order.indexOf(oid);
          return i === -1 ? order.length : i;
        };
        pool = pool.slice().sort((a, b) => rank(a.objective_id) - rank(b.objective_id));
      }

      // Caller's cap applies AFTER the shuffle/weak-rank ordering, so it keeps
      // a random (or weak-first) cross-section of the WHOLE pool instead of
      // the DB's first-inserted words.
      if (limit && limit > 0) pool = pool.slice(0, limit);

      if (!cancelled) { setItems(pool); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [unitId, exerciseTypes?.join(','), classWeak, roster?.join(','), limit]);

  return { items, loading, weakOrder };
}
