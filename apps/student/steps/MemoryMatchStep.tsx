// MemoryMatchStep — the in-lesson surface of the memory pair game for
// MEMORY_LAB (and legacy FLASH_MATCH) blocks on the Student Path. Embeds the
// FlashMatch engine (mode:'embedded'), which self-validates pair taps
// and reports completion via onReady(isComplete). Pairs come from the active
// unit's vocabulary (cross-modal word ↔ image / L1 meaning) — see memoryPairs.ts.
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
    const built = buildMemoryPairs(vocab, 4);
    setPairs(built);
    setScreen(built.length >= 2 ? 'play' : 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeUnit?.id, round]);

  const flashData = useMemo(() => ({ pairs }), [pairs]);

  // Memoized: FlashMatch's onReady effect re-fires whenever the callback
  // identity changes, so an unstable closure would repeatedly record answers.
  const handleReady = React.useCallback((isComplete: boolean) => {
    if (!isComplete || screen !== 'play') return;
    playCue('win');
    // One correct per pair (see header note — FlashMatch reports completion only).
    for (let i = 0; i < pairs.length; i++) recordAnswer(true);
    setTimeout(() => setScreen('done'), 500);
  }, [screen, pairs, recordAnswer]);

  if (screen === 'loading') {
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center text-[#8C7A68] font-sans p-6 select-none">
        <div className="bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-3xl p-8 shadow-md flex flex-col items-center">
          <Loader2 className="animate-spin mb-3 text-[#2A9D8F]" size={36} />
          <p className="font-bold text-[#1D3557] text-base">Preparing cards…</p>
        </div>
      </div>
    );
  }

  if (screen === 'error') {
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center text-[#264653] font-sans p-6 select-none">
        <div className="bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-3xl p-6 shadow-md max-w-sm text-center w-full">
          <div className="w-16 h-16 bg-[#F7F3E8] border-2 border-[#E2D7C3] text-[#E76F51] rounded-2xl flex items-center justify-center mb-4 mx-auto shadow-xs">
            <Layers size={32} />
          </div>
          <p className="text-lg font-bold text-[#1D3557] mb-1">No vocabulary to match yet</p>
          <p className="text-[#8C7A68] text-sm mb-6">This game needs vocabulary — continue with the lesson for now.</p>
          <button
            onClick={onDone}
            className="w-full py-3 bg-[#2A9D8F] hover:brightness-105 text-white font-bold rounded-2xl shadow-[0_4px_0_#1E6F5C] active:translate-y-0.5 active:shadow-none transition-all"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'done') {
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center text-[#264653] font-sans p-6 relative overflow-y-auto select-none">
        <div className="bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-3xl p-6 shadow-xl max-w-sm text-center w-full">
          <motion.h1
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            className="text-3xl font-black text-[#1D3557] mb-1 font-fredoka"
          >
            All Matched! 🎉
          </motion.h1>
          <p className="text-[#8C7A68] text-sm mb-5 font-semibold">{unitTitle}</p>

          <div className="flex justify-center gap-2 mb-8">
            {Array.from({ length: 3 }, (_, i) => (
              <motion.span
                key={i}
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2 + i * 0.18, type: 'spring', stiffness: 300, damping: 14 }}
              >
                <Star size={42} className="text-[#E9C46A] drop-shadow-sm" fill="currentColor" />
              </motion.span>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setRound((r) => r + 1);
                setScreen('loading');
              }}
              className="flex-1 py-3 bg-[#F7F3E8] hover:bg-white text-[#264653] border-2 border-[#E2D7C3] shadow-[0_3px_0_#D5C7B0] active:translate-y-0.5 active:shadow-none rounded-2xl font-bold transition-all text-sm"
            >
              Play again
            </button>
            <button
              onClick={onDone}
              className="flex-1 py-3 bg-[#2A9D8F] hover:brightness-105 text-white shadow-[0_4px_0_#1E6F5C] active:translate-y-0.5 active:shadow-none rounded-2xl font-bold transition-all text-sm"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#EAE0D0] flex flex-col font-sans relative overflow-hidden select-none">
      {/* Universal light header */}
      <header className="h-16 px-4 bg-[#FDFBF7] border-b-2 border-[#E2D7C3] flex items-center justify-between shrink-0 z-20">
        <button
          onClick={onExit}
          className="w-10 h-10 rounded-2xl bg-[#F7F3E8] border-2 border-[#E2D7C3] flex items-center justify-center text-[#8C7A68] hover:text-[#264653] active:translate-y-0.5 transition-all shadow-[0_2px_0_#D5C7B0]"
          title="Exit Lesson"
        >
          <ChevronLeft size={22} />
        </button>

        <div className="flex items-center gap-2">
          {/* Terracotta Step Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E76F51] text-white text-xs font-bold shadow-xs">
            <span>🧩</span>
            <span>MEMORY MATCH • {pairs.length} PAIRS</span>
          </div>
        </div>

        <div className="px-3 py-1.5 bg-[#F7F3E8] border border-[#E2D7C3] rounded-xl font-black text-[#2A9D8F] tabular-nums text-sm shrink-0 shadow-xs">
          2×4 Grid
        </div>
      </header>

      {/* Subheader banner */}
      <div className="px-4 pt-2 pb-1 shrink-0">
        <div className="bg-[#FDFBF7]/90 border border-[#E2D7C3] rounded-2xl px-3.5 py-1.5 flex items-center justify-between shadow-xs">
          <p className="text-xs text-[#1D3557] font-bold leading-tight flex items-center gap-1">
            <span className="text-[#2A9D8F]">✦</span> Find matching word &amp; picture cards!
            <span className="text-[11px] text-[#8C7A68] font-normal ml-1">匹配单词与图片</span>
          </p>
          <span className="text-[10px] font-mono text-[#8C7A68] bg-[#F7F3E8] border border-[#E2D7C3] px-2 py-0.5 rounded-full">
            Solo
          </span>
        </div>
      </div>

      {/* Embedded FlashMatch 2x4 Stage */}
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
