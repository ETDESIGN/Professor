import React, { useState, useEffect, useMemo } from 'react';
import { Eye, EyeOff, HelpCircle } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useBoardPool } from '../useBoardPool';

interface MemoryCard { image: string; name: string; }

const BoardWhatsMissing = ({ data }: { data: any }) => {
  const { state } = useSession();
  const unitId = state.activeUnit?.id || '';
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);
  const [phase, setPhase] = useState<'memorize' | 'hidden' | 'reveal'>('memorize');
  const [timer, setTimer] = useState(10);
  const [missingIndex, setMissingIndex] = useState<number | null>(null);

  // Pool fallback: when the frozen flow has no items, build the memorize grid from
  // IMAGE_SELECT pool items (class-weak-first) — one card per objective's image.
  // Stable reference for the frozen source (avoids per-render recompute of the
  // derived `items` memo). See BoardFlashMatch for the same pattern.
  const frozenItems: MemoryCard[] = useMemo(
    () => (Array.isArray(data?.items) ? data.items.slice(0, 8) : []),
    [data?.items],
  );
  const { items: poolItems, loading } = useBoardPool({
    unitId,
    exerciseTypes: ['IMAGE_SELECT'],
    classWeak: true,
    roster,
    limit: 8,
  });

  const items: MemoryCard[] = useMemo(() => {
    if (frozenItems.length > 0) return frozenItems.slice(0, 8);
    const seen = new Set<string>();
    const cards: MemoryCard[] = [];
    for (const it of poolItems) {
      if (seen.has(it.objective_id)) continue;
      seen.add(it.objective_id);
      const c: any = it.content;
      const correct = c?.options?.[c.correct_index];
      const word = c?.prompt || correct?.label || '';
      const image = correct?.image_url || '';
      if (image && word) cards.push({ image, name: word });
      if (cards.length >= 6) break;
    }
    return cards;
  }, [frozenItems, poolItems]);

  // Listen for remote events
  useEffect(() => {
    if (state.lastAction?.type === 'REVEAL') {
      setPhase('reveal');
    } else if (state.lastAction?.type === 'START_MEMORIZE') {
      setTimer(10);
      setPhase('memorize');
      setMissingIndex(null);
    }
  }, [state.lastAction]);

  useEffect(() => {
    let interval: any;
    // Only run the memorize countdown once we have enough cards to play.
    if (phase === 'memorize' && items.length >= 3 && timer > 0) {
      interval = setInterval(() => setTimer(t => t - 1), 1000);
    } else if (phase === 'memorize' && items.length >= 3 && timer === 0) {
      startRecall();
    }
    return () => clearInterval(interval);
  }, [phase, timer, items.length]);

  const startRecall = () => {
    const idx = Math.floor(Math.random() * items.length);
    setMissingIndex(idx);
    setPhase('hidden');
  };

  const reveal = () => {
    setPhase('reveal');
  };

  if (loading || items.length < 3) {
    return (
      <div className="h-full bg-indigo-950 flex flex-col items-center justify-center text-white text-center px-8">
        <h1 className="text-4xl font-display font-bold text-indigo-300 mb-2">What's Missing?</h1>
        <p className="text-indigo-400 text-xl">
          {loading ? 'Loading…' : 'Not enough images to play. Generate the exercise pool for this unit.'}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full bg-indigo-950 flex flex-col relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-indigo-800/50 to-transparent"></div>

      {/* Header */}
      <div className="relative z-10 p-8 flex justify-between items-center">
         <div className="flex items-center gap-4">
            <div className={`p-4 rounded-2xl ${phase === 'memorize' ? 'bg-emerald-500' : 'bg-indigo-600'} text-white shadow-lg transition-colors duration-500`}>
               {phase === 'memorize' ? <Eye size={32} /> : <EyeOff size={32} />}
            </div>
            <div>
               <h1 className="text-4xl font-display font-bold text-white">
                  {phase === 'memorize' ? 'Memorize!' : phase === 'hidden' ? 'What\'s Missing?' : 'Revealed!'}
               </h1>
               <div className="h-2 w-48 bg-white/10 rounded-full mt-2 overflow-hidden">
                  <div 
                     className={`h-full transition-all duration-1000 linear ${phase === 'memorize' ? 'bg-emerald-400' : 'bg-transparent'}`}
                     style={{ width: phase === 'memorize' ? `${(timer / 10) * 100}%` : '0%' }}
                  ></div>
               </div>
            </div>
         </div>

         {phase === 'hidden' && (
            <button 
               onClick={reveal}
               className="px-8 py-4 bg-yellow-400 text-yellow-900 font-bold text-2xl rounded-2xl shadow-lg hover:scale-105 transition-transform animate-pulse"
            >
               Reveal Answer
            </button>
         )}
      </div>

      {/* Grid */}
      <div className="flex-1 relative z-10 p-8 flex items-center justify-center">
         <div className="grid grid-cols-4 gap-8 w-full max-w-7xl">
            {items.map((item: any, i: number) => {
               const isMissing = i === missingIndex && phase !== 'memorize';
               const isRevealed = i === missingIndex && phase === 'reveal';

               return (
                  <div 
                     key={i} 
                     className={`
                        aspect-[4/3] rounded-3xl shadow-2xl transition-all duration-500 relative group perspective-1000
                        ${isMissing && !isRevealed ? 'bg-indigo-900/50 border-4 border-dashed border-indigo-500/50' : 'bg-white transform hover:scale-105 hover:-translate-y-2'}
                     `}
                  >
                     {/* Normal Card Content */}
                     <div className={`w-full h-full p-6 flex flex-col items-center justify-center transition-opacity duration-300 ${isMissing && !isRevealed ? 'opacity-0' : 'opacity-100'}`}>
                        <img src={item.image} alt={item.name} className="h-2/3 object-contain drop-shadow-md mb-4" />
                        <h3 className="text-3xl font-display font-bold text-slate-800">{item.name}</h3>
                     </div>

                     {/* Hidden State */}
                     {isMissing && !isRevealed && (
                        <div className="absolute inset-0 flex items-center justify-center">
                           <HelpCircle size={80} className="text-indigo-500/50 animate-bounce" />
                        </div>
                     )}

                     {/* Reveal Highlight */}
                     {isRevealed && (
                        <div className="absolute inset-0 rounded-3xl border-8 border-yellow-400 pointer-events-none animate-ping opacity-50"></div>
                     )}
                  </div>
               );
            })}
         </div>
      </div>
    </div>
  );
};

export default BoardWhatsMissing;