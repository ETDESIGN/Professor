// ClassWeakBanner — surfaces the roster's weakest vocabulary (lowest average
// retrievability) so the teacher can prioritise it during practice (plan 3.4:
// "surface 'review these' suggestions"). One classWeak aggregation + one
// objectives lookup on mount. Dismissible; only renders when there are weak
// words (R below the threshold) AND a roster + unit are present.

import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useSession } from '../../store/SessionContext';
import { classWeakObjectives } from '../../services/boardLearner';
import { supabase } from '../../services/supabaseClient';

const WEAK_THRESHOLD = 0.7; // show a word if the class average recall is below this

const ClassWeakBanner: React.FC = () => {
  const { state } = useSession();
  const unitId = state.activeUnit?.id || '';
  const roster = (state.students || []).map((s: any) => s.id).filter(Boolean);
  const [weak, setWeak] = useState<{ word: string; r: number }[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
    if (!unitId || roster.length === 0) { setWeak([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const [ranked, { data: objs }] = await Promise.all([
          classWeakObjectives(roster, unitId),
          supabase.from('objectives').select('id, target_value').eq('unit_id', unitId).eq('type', 'vocabulary'),
        ]);
        if (cancelled) return;
        const nameById = new Map<string, string>(
          (objs || []).map((o: any) => [o.id, o.target_value as string]),
        );
        const top = ranked
          .filter((w) => w.retrievability < WEAK_THRESHOLD)
          .slice(0, 3)
          .map((w) => ({ word: nameById.get(w.objective_id) || '', r: w.retrievability }))
          .filter((w) => w.word);
        if (!cancelled) setWeak(top);
      } catch {
        if (!cancelled) setWeak([]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, roster.join(',')]);

  if (dismissed || weak.length === 0) return null;

  return (
    <div className="absolute top-6 left-6 z-40 max-w-md bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 shadow-lg flex items-start gap-3 pointer-events-auto">
      <AlertTriangle size={22} className="text-amber-500 mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="font-bold text-amber-900 text-sm">Class needs review</div>
        <div className="text-amber-800 text-lg font-bold leading-snug">{weak.map((w) => w.word).join('  ·  ')}</div>
        <div className="text-amber-600 text-xs mt-0.5">Prioritise these in this round.</div>
      </div>
      <button onClick={() => setDismissed(true)} className="text-amber-400 hover:text-amber-600 -mt-1 -mr-1 p-1" aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  );
};

export default ClassWeakBanner;
