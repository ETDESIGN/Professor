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
  /** Cap the number of items fetched (the full content JSONB is only needed for
   * the items actually played; capped consumers pass this to avoid over-fetch). */
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

      let query = supabase.from('pool_items').select('*').eq('unit_id', unitId);
      if (exerciseTypes && exerciseTypes.length > 0) query = query.in('exercise_type', exerciseTypes);
      if (limit && limit > 0) query = query.limit(limit);
      const { data, error } = await query;
      if (cancelled) return;
      if (error || !data) { setItems([]); setLoading(false); return; }

      let pool = data.map(toPoolItem).filter((p): p is PoolItem => p !== null);

      // Order by class-weak objective order when available (objectives not in the
      // order sink to the end, preserving their natural order).
      if (order.length > 0) {
        const rank = (oid: string) => {
          const i = order.indexOf(oid);
          return i === -1 ? order.length : i;
        };
        pool = pool.slice().sort((a, b) => rank(a.objective_id) - rank(b.objective_id));
      }

      if (!cancelled) { setItems(pool); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [unitId, exerciseTypes?.join(','), classWeak, roster?.join(','), limit]);

  return { items, loading, weakOrder };
}
