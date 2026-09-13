import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, PenLine, Loader2 } from 'lucide-react';
import { useSoloSession } from '../../store/SoloSessionContext';
import { supabase } from '../../services/supabaseClient';
import { toPoolItem } from '../../types/exercise';
import ExerciseRunner from './exercises/ExerciseRunner';

interface GrammarPracticeProps {
  onBack: () => void;
}

// Grammar practice — the construction family (GRAMMAR_FILL / TRANSFORM /
// ERROR_SPOT) of the ACTIVE unit's pool via the shared ExerciseRunner.
// Cold-launch safe unit lobby (same pattern as Listening/Phonics).
const GrammarPractice: React.FC<GrammarPracticeProps> = ({ onBack }) => {
  const { state } = useSoloSession();
  const [studentId, setStudentId] = useState('');
  const [unitId, setUnitId] = useState(state.activeUnit?.id || '');
  const [unitTitle, setUnitTitle] = useState(state.activeUnit?.title || '');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setStudentId(user.id); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!unitId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('pool_items')
        .select('*')
        .eq('unit_id', unitId)
        .in('exercise_type', ['GRAMMAR_FILL', 'TRANSFORM', 'ERROR_SPOT']);
      if (!cancelled) {
        setItems(!error && data ? data.map(toPoolItem).filter((p) => p !== null) : []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [unitId]);

  const units = state.units || [];
  const pickTitle = useMemo(() => unitTitle || 'Grammar', [unitTitle]);

  if (!studentId) {
    return <div className="h-full flex items-center justify-center text-[#8C7A68]"><Loader2 className="animate-spin" size={28} /></div>;
  }

  if (!unitId) {
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col max-w-md mx-auto">
        <header className="p-4 flex items-center gap-3 shrink-0">
          <button onClick={onBack} className="p-2 bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-full active:translate-y-[2px]" aria-label="Back">
            <ChevronLeft size={22} className="text-[#1D3557]" />
          </button>
          <div>
            <p className="font-bold text-[#1D3557] leading-tight">Grammar Practice</p>
            <p className="text-xs text-[#8C7A68] font-semibold">Pick a unit · 语法练习</p>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {units.map((u) => (
            <button
              key={u.id}
              onClick={() => { setUnitId(u.id); setUnitTitle(u.title); }}
              className="w-full flex items-center gap-3 p-4 bg-[#FDFBF7] rounded-3xl border-2 border-[#E2D7C3] shadow-[0_4px_0_#E2D7C3] active:translate-y-[2px] text-left"
            >
              <div className="w-11 h-11 rounded-2xl bg-[#2A9D8F]/15 border border-[#2A9D8F]/40 flex items-center justify-center shrink-0">
                <PenLine size={20} className="text-[#2A9D8F]" />
              </div>
              <div className="font-bold text-sm text-[#1D3557] truncate">{u.title}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="h-full flex items-center justify-center text-[#8C7A68]"><Loader2 className="animate-spin mb-2" size={28} /></div>;
  }

  if (items.length === 0) {
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-3xl flex items-center justify-center mb-4">
          <PenLine size={28} className="text-[#2A9D8F]" />
        </div>
        <h2 className="font-bold text-lg text-[#1D3557] mb-1">No grammar drills yet</h2>
        <p className="text-sm text-[#8C7A68] mb-5">“{pickTitle}” has no grammar items — try another unit.</p>
        <button onClick={() => setUnitId('')} className="px-5 py-3 bg-[#2A9D8F] text-white rounded-2xl font-bold text-sm shadow-[0_4px_0_#1E6F5C] active:translate-y-[2px]">
          Pick another unit
        </button>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#EAE0D0]">
      <ExerciseRunner items={items} studentId={studentId} unitId={unitId} title="Grammar Workshop" onExit={onBack} onDone={() => onBack()} />
    </div>
  );
};

export default GrammarPractice;
