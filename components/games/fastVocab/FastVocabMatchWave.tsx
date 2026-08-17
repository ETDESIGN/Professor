// FastVocabMatchWave — the Phase-1 surface: source pods (images in image
// mode, English words in meaning mode) above, target pods (words / L1
// meanings) below. Supports the hybrid interaction from useTapDragPairing:
// tap-a-pod-then-tap-its-match AND press-drag-release-over-the-match.
//
// Presentational + interaction only — correctness/scoring live in the turn
// controller (it receives matchedPairIds / hintPairId / revealPair /
// wrongPairId and emits onPairAttempt).

import React, { useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Lightbulb } from 'lucide-react';
import type { FastVocabMode, FastVocabPair } from './types';
import { useTapDragPairing } from './useTapDragPairing';

export interface FastVocabMatchWaveProps {
  pairs: FastVocabPair[];
  mode: FastVocabMode;
  matchedPairIds: string[];
  hintPairId?: string | null;
  revealPair?: FastVocabPair | null;
  wrongPairId?: string | null;
  /** Disable interaction (during transitions). */
  locked?: boolean;
  onPairAttempt: (sourcePairId: string, targetPairId: string) => void;
}

const srcPodId = (pairId: string) => `src-${pairId}`;
const tgtPodId = (pairId: string) => `tgt-${pairId}`;

const FastVocabMatchWave: React.FC<FastVocabMatchWaveProps> = ({
  pairs,
  mode,
  matchedPairIds,
  hintPairId = null,
  revealPair = null,
  wrongPairId = null,
  locked = false,
  onPairAttempt,
}) => {
  const handlePairAttempt = useCallback(
    (aPod: string, bPod: string) => {
      const aPair = aPod.startsWith('src-') ? aPod.slice(4) : aPod.startsWith('tgt-') ? aPod.slice(4) : '';
      const bPair = bPod.startsWith('src-') ? bPod.slice(4) : bPod.startsWith('tgt-') ? bPod.slice(4) : '';
      const source = aPod.startsWith('src-') ? aPair : bPair;
      const target = aPod.startsWith('src-') ? bPair : aPair;
      if (source && target) onPairAttempt(source, target);
    },
    [onPairAttempt],
  );

  const { selected, ghost, podProps } = useTapDragPairing({
    onPairAttempt: handlePairAttempt,
    isEnabled: () => !locked,
  });

  const matchedSet = useMemo(() => new Set(matchedPairIds), [matchedPairIds]);

  // Target pods keep a stable shuffle per wave (pairs identity) so pairs
  // aren't vertically aligned.
  const targets = useMemo(() => {
    const arr = pairs.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs.map((p) => p.id).join('|')]);

  const selectedSrc = selected?.side === 'source' ? selected.podId : null;
  const selectedTgt = selected?.side === 'target' ? selected.podId : null;

  const podClasses = (matched: boolean, isSelected: boolean, hinted: boolean, wrong: boolean) =>
    matched
      ? 'bg-emerald-500/15 border-emerald-400/50 opacity-60 cursor-default'
      : wrong
        ? 'bg-slate-800 border-red-500 animate-fv-shake'
        : isSelected
          ? 'bg-indigo-600 border-indigo-300 scale-105 shadow-lg shadow-indigo-500/40 z-10'
          : hinted
            ? 'bg-amber-400/15 border-amber-300 animate-pulse shadow-lg shadow-amber-400/30'
            : 'bg-slate-800 border-slate-600 hover:border-indigo-400 cursor-pointer';

  const ghostPod = ghost
    ? pairs.find((p) =>
        ghost.side === 'source' ? srcPodId(p.id) === ghost.podId : tgtPodId(p.id) === ghost.podId,
      )
    : null;

  return (
    <div className="relative h-full w-full flex flex-col items-center justify-center gap-6 select-none">
      {/* Source pods (top row) */}
      <div className={`flex gap-4 md:gap-8 justify-center flex-wrap ${mode === 'image' ? '' : 'flex-row-reverse'}`}>
        {pairs.map((p) => {
          const matched = matchedSet.has(p.id);
          const id = srcPodId(p.id);
          const hinted = hintPairId === p.id;
          return (
            <div
              key={id}
              {...(matched ? {} : podProps(id, 'source'))}
              className={`relative rounded-3xl border-4 transition-all duration-200 flex items-center justify-center overflow-hidden
                ${mode === 'image' ? 'w-32 h-32 md:w-40 md:h-40 bg-white' : 'px-6 py-4 min-w-32 min-h-20'}
                ${podClasses(matched, selectedSrc === id, hinted, false)}
                ${ghost?.podId === id ? 'opacity-30' : ''}`}
            >
              {mode === 'image' && p.imageUrl ? (
                <img src={p.imageUrl} alt="" draggable={false} className="w-full h-full object-contain p-1.5 pointer-events-none" />
              ) : (
                <span className="text-xl md:text-2xl font-black text-white text-center pointer-events-none px-2">{p.word}</span>
              )}
              {matched && (
                <span className="absolute top-1.5 right-1.5 w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center shadow">
                  <Check size={16} strokeWidth={4} className="text-white" />
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Divider arrow rail */}
      <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-widest">
        <span className="h-px w-16 bg-slate-700" />
        match
        <span className="h-px w-16 bg-slate-700" />
      </div>

      {/* Target pods (bottom row, shuffled) */}
      <div className="flex gap-4 md:gap-8 justify-center flex-wrap">
        {targets.map((p) => {
          const matched = matchedSet.has(p.id);
          const id = tgtPodId(p.id);
          const hinted = hintPairId === p.id;
          const wrong = wrongPairId === p.id;
          return (
            <div
              key={id}
              {...(matched ? {} : podProps(id, 'target'))}
              className={`relative rounded-3xl border-4 transition-all duration-200 flex items-center justify-center
                ${mode === 'image' ? 'px-6 py-4 min-w-32 min-h-20' : 'px-6 py-4 min-w-32 min-h-20'}
                ${podClasses(matched, selectedTgt === id, hinted, wrong)}
                ${ghost?.podId === id ? 'ring-4 ring-indigo-400/60' : ''}`}
            >
              <span className="text-xl md:text-2xl font-black text-white text-center pointer-events-none px-2">
                {mode === 'image' ? p.word : p.meaning || p.word}
              </span>
              {matched && (
                <span className="absolute top-1.5 right-1.5 w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center shadow">
                  <Check size={16} strokeWidth={4} className="text-white" />
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Drag ghost — fixed, follows the pointer, above everything */}
      {ghost && ghostPod && (
        <div
          className="fixed z-50 pointer-events-none scale-110 drop-shadow-2xl"
          style={{ left: ghost.x, top: ghost.y, transform: 'translate(-50%, -50%) scale(1.15)' }}
        >
          <div
            className={`rounded-3xl border-4 border-indigo-300 bg-indigo-600 shadow-2xl shadow-indigo-500/50 flex items-center justify-center overflow-hidden ${
              mode === 'image' && ghost.side === 'source' ? 'w-32 h-32 bg-white' : 'px-6 py-4'
            }`}
          >
            {mode === 'image' && ghost.side === 'source' && ghostPod.imageUrl ? (
              <img src={ghostPod.imageUrl} alt="" draggable={false} className="w-full h-full object-contain p-1.5" />
            ) : (
              <span className="text-xl font-black text-white text-center px-2">
                {ghost.side === 'target' && mode === 'meaning' ? ghostPod.meaning || ghostPod.word : ghostPod.word}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Micro-explanation overlay (2nd-miss escalation) */}
      <AnimatePresence>
        {revealPair && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-md"
            >
              <Lightbulb size={40} className="text-amber-500 mb-3" />
              <p className="text-3xl font-black text-slate-800">{revealPair.word}</p>
              {revealPair.imageUrl && (
                <img src={revealPair.imageUrl} alt="" className="w-28 h-28 object-contain mt-3" />
              )}
              {revealPair.meaning && <p className="text-xl text-slate-500 mt-2">{revealPair.meaning}</p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FastVocabMatchWave;
