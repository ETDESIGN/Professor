import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Mic } from 'lucide-react';
import { useSoloSession } from '../../store/SoloSessionContext';
import { supabase } from '../../services/supabaseClient';
import { toPoolItem } from '../../types/exercise';
import ExerciseRunner, { RunnerResult } from './exercises/ExerciseRunner';

interface PhonicsPhlyerProps {
  onBack: () => void;
}

// Phonics practice — now POOL-DRIVEN via the MINIMAL_PAIR_SWIPE engine (real
// minimal-pair audio + pronunciation scoring). Replaces the hardcoded "sh"
// flying-word demo (audit Bug #2): no pedagogical content is hardcoded; if the
// unit has no confusable/minimal-pair items, a clean empty state is shown.
const PhonicsPhlyer: React.FC<PhonicsPhlyerProps> = ({ onBack }) => {
  const { state } = useSoloSession();
  const unitId = state.activeUnit?.id || '';
  const [studentId, setStudentId] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setStudentId(user.id); }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!unitId) { setLoading(false); return; }
      const { data, error } = await supabase
        .from('pool_items')
        .select('*')
        .eq('unit_id', unitId)
        .eq('exercise_type', 'MINIMAL_PAIR_SWIPE');
      if (cancelled) return;
      if (!error && data) setItems(data.map(toPoolItem).filter((p) => p !== null));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [unitId]);

  const title = useMemo(() => state.activeUnit?.title || 'Phonics', [state.activeUnit]);

  if (!studentId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="animate-spin mb-3" size={28} />
        Signing you in…
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="animate-spin mb-3" size={28} /> Loading phonics…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-duo-blue/10 rounded-3xl flex items-center justify-center mb-5">
          <Mic size={40} className="text-duo-blue" />
        </div>
        <h2 className="text-2xl font-bold text-slate-700 mb-2">Phonics practice</h2>
        <p className="text-slate-400 max-w-sm mb-6">
          {unitId
            ? `No minimal-pair drills for "${title}" yet. Confusable words are generated during enrichment.`
            : 'Open a unit from the map to practise its phonics minimal pairs.'}
        </p>
        <button onClick={onBack} className="bg-duo-blue text-white font-bold px-6 py-3 rounded-xl">Back</button>
      </div>
    );
  }

  const handleDone = (_r: RunnerResult) => onBack();

  return (
    <div className="h-full bg-slate-50">
      <ExerciseRunner items={items} studentId={studentId} unitId={unitId} title="Phonics — Minimal Pairs" onExit={onBack} onDone={handleDone} />
    </div>
  );
};

export default PhonicsPhlyer;
