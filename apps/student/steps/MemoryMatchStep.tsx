// MemoryMatchStep — the in-lesson surface of the memory pair game for
// MEMORY_LAB (and legacy FLASH_MATCH) blocks on the Student Path. Embeds the
// existing FlashMatch engine (mode:'embedded'), which self-validates pair taps
// and reports completion via onReady(isComplete). Pairs come from the active
// unit's vocabulary (word ↔ L1 meaning) — see memoryPairs.ts (pure, tested).
//
// Contract mirrors FastVocabStep/SpellingBeeStep: self-sufficient given the
// active unit, its Continue button calls onDone → the lesson pipeline awards
// XP exactly once. FlashMatch exposes no per-attempt signal (mismatches are
// internal), so session accuracy records one correct answer per matched pair
// — a deliberate, documented simplification: finishing the memory game means
// every pair was ultimately matched.

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Layers, Loader2, Star } from 'lucide-react';
import { useSoloSession } from '../../../store/SoloSessionContext';
import { getVocabulary } from '../../../services/manifest';
import { playCue } from '../../board/templates/playCue';
import FlashMatch from '../FlashMatch';
import { buildMemoryPairs, type MemoryPair } from './memoryPairs';

interface MemoryMatchStepProps {
  unitTitle: string;
  onDone: () => void;
  onExit: () => void;
}

type Screen = 'loading' | 'play' | 'done' | 'error';

const MemoryMatchStep: React.FC<MemoryMatchStepProps> = ({ unitTitle, onDone, onExit }) => {
  const { recordAnswer, state } = useSoloSession();

  const [screen, setScreen] = useState<Screen>('loading');
  const [pairs, setPairs] = useState<MemoryPair[]>([]);
  const [round, setRound] = useState(0); // remount key for Play again

  useEffect(() => {
    const vocab = getVocabulary(state.activeUnit?.manifest);
    const built = buildMemoryPairs(vocab);
    setPairs(built);
    setScreen(built.length >= 2 ? 'play' : 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeUnit?.id, round]);

  const flashData = useMemo(() => ({ pairs: pairs.map(({ id, left, right }) => ({ id, left, right })) }), [pairs]);

  // Memoized: FlashMatch's onReady effect re-fires whenever the callback
  // identity changes, so an unstable closure would repeatedly record answers.
  const handleReady = React.useCallback((isComplete: boolean) => {
    if (!isComplete || screen !== 'play') return;
    playCue('correct');
    // One correct per pair (see header note — FlashMatch reports completion only).
    for (let i = 0; i < pairs.length; i++) recordAnswer(true);
    setTimeout(() => setScreen('done'), 500);
  }, [screen, pairs, recordAnswer]);

  if (screen === 'loading') {
    return (
      <div className="h-full bg-slate-50 flex flex-col items-center justify-center text-slate-400 font-sans">
        <Loader2 className="animate-spin mb-3" size={28} />
        Preparing cards…
      </div>
    );
  }

  if (screen === 'error') {
    return (
      <div className="h-full bg-slate-50 flex flex-col items-center justify-center text-slate-600 font-sans p-6">
        <div className="w-16 h-16 bg-white border border-slate-200 text-cyan-500 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
          <Layers size={30} />
        </div>
        <p className="text-lg font-bold mb-1">No vocabulary to match yet</p>
        <p className="text-slate-400 text-sm mb-6 text-center">This game needs translated words — continue with the lesson for now.</p>
        <button onClick={onDone} className="px-8 py-3 bg-cyan-500 hover:bg-cyan-400 text-white font-bold rounded-2xl">
          Continue
        </button>
      </div>
    );
  }

  if (screen === 'done') {
    return (
      <div className="h-full bg-slate-50 flex flex-col items-center justify-center text-slate-700 font-sans p-6">
        <motion.h1
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          className="text-4xl font-black mb-1"
        >
          All Matched!
        </motion.h1>
        <p className="text-slate-400 mb-6">{unitTitle}</p>
        <div className="flex gap-2 mb-8">
          {Array.from({ length: 3 }, (_, i) => (
            <Star key={i} size={40} className="text-cyan-500" fill="currentColor" />
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={() => { setRound((r) => r + 1); setScreen('loading'); }} className="px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-2xl font-bold">
            Play again
          </button>
          <button onClick={onDone} className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-white rounded-2xl font-bold">
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans relative overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center gap-3 shrink-0">
        <button onClick={onExit} className="p-2 -ml-2 text-slate-400 hover:text-slate-600 rounded-full shrink-0">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800 leading-tight truncate">Memory Lab</p>
          <p className="text-slate-400 text-xs truncate">{unitTitle}</p>
        </div>
        <div className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-black text-cyan-600 tabular-nums text-sm shrink-0">
          {pairs.length} pairs
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <FlashMatch
          key={round}
          onBack={onExit}
          mode="embedded"
          data={flashData}
          onReady={handleReady}
        />
      </div>
    </div>
  );
};

export default MemoryMatchStep;
