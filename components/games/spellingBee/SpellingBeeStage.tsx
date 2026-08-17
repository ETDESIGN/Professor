// SpellingBeeStage — the shared play surface for both Spelling Bee surfaces:
// word card (image, or the speaker fallback when media is missing), the
// letter-slot input bar, and the on-screen QWERTY keyboard with the adaptive
// key-drop animation. Purely presentational — all state lives in
// useSpellingBeeTurn and the surface wrappers.
//
// There is no <input> anywhere: touch devices use the on-screen keys, and a
// window keydown listener in the turn controller covers physical keyboards
// (so the native keyboard never pops up on tablets).

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Volume2 } from 'lucide-react';
import type { SpellingBeeWord } from './types';
import type { SpellingBeeStatus } from './useSpellingBeeTurn';
import { QWERTY_ROWS, slotLayout } from './keyboardEngine';

export interface SpellingBeeStageProps {
  word: SpellingBeeWord;
  typedCount: number;
  wrongLetter: string | null;
  removedKeys: ReadonlySet<string>;
  hintKey: string | null;
  status: SpellingBeeStatus;
  onType: (letter: string) => void;
  onReplayAudio: () => void;
  /** Compact variant for the student app. */
  compact?: boolean;
}

const SpellingBeeStage: React.FC<SpellingBeeStageProps> = ({
  word,
  typedCount,
  wrongLetter,
  removedKeys,
  hintKey,
  status,
  onType,
  onReplayAudio,
  compact = false,
}) => {
  const slots = React.useMemo(() => slotLayout(word.word), [word.word]);
  const typing = status === 'typing';
  const solved = status === 'solved';
  const revealed = status === 'revealed';

  const cardH = compact ? 'h-28 sm:h-32' : 'h-36 lg:h-44';
  const keyMin = compact ? 'min-w-[9.5vw] max-w-12 min-h-11' : 'min-w-10 lg:min-w-12 min-h-11 lg:min-h-14';

  return (
    <div className="flex flex-col items-center gap-3 sm:gap-4 w-full max-w-3xl mx-auto select-none">
      {/* ── Word card ── */}
      <motion.button
        layout
        type="button"
        onClick={onReplayAudio}
        aria-label="Hear the word"
        className={`relative bg-white rounded-2xl border-4 shadow-xl overflow-hidden flex items-center justify-center transition-colors w-full ${cardH} ${
          solved ? 'border-amber-400' : 'border-slate-200'
        }`}
      >
        {word.imageUrl ? (
          <img src={word.imageUrl} alt="" className="w-full h-full object-cover" draggable={false} />
        ) : (
          // Defensive fallback only — production units are enriched with
          // word + image + audio at creation time; this keeps the game
          // playable (listen-and-spell) when an image is missing anyway.
          <span className="flex flex-col items-center justify-center gap-1.5 text-sky-500">
            <Volume2 size={compact ? 40 : 56} strokeWidth={1.8} />
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">tap to hear</span>
          </span>
        )}
        {solved && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className="absolute -top-1 -right-1 w-9 h-9 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg"
          >
            <Check size={20} strokeWidth={3.5} />
          </motion.span>
        )}
      </motion.button>

      {/* ── Input bar: letter slots + replay ── */}
      <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
        <AnimatePresence mode="popLayout">
          {slots.map((slot, i) => {
            if (slot.letterIndex < 0) {
              // Pre-filled separator (space / hyphen / apostrophe).
              return (
                <span key={i} className="inline-block w-2 sm:w-3" aria-hidden>
                  {slot.char === ' ' ? '' : <span className="text-slate-500 font-black">{slot.char}</span>}
                </span>
              );
            }
            const filled = slot.letterIndex < typedCount;
            const isCursor = typing && slot.letterIndex === typedCount;
            const showLetter = filled || revealed;
            return (
              <motion.span
                key={i}
                layout
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`flex items-center justify-center font-black rounded-xl border-2 transition-colors ${
                  compact ? 'w-8 h-11 text-xl' : 'w-9 h-12 sm:w-11 sm:h-14 text-2xl sm:text-3xl'
                } ${
                  solved
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : revealed
                      ? filled
                        ? 'bg-slate-800 border-slate-600 text-white'
                        : 'bg-amber-500/15 border-amber-400 text-amber-300'
                      : filled
                        ? 'bg-slate-800 border-slate-600 text-white'
                        : isCursor
                          ? 'bg-slate-800/60 border-sky-400 text-transparent animate-pulse-soft-border'
                          : 'bg-slate-800/60 border-slate-700 text-transparent'
                }`}
              >
                {showLetter ? slot.char : ''}
              </motion.span>
            );
          })}
        </AnimatePresence>
        <button
          type="button"
          onClick={onReplayAudio}
          aria-label="Play the word again"
          className={`ml-1 rounded-full bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center active:scale-95 transition-all ${
            compact ? 'w-10 h-10' : 'w-12 h-12'
          }`}
        >
          <Volume2 size={compact ? 18 : 22} />
        </button>
      </div>

      {/* ── On-screen QWERTY ── */}
      <div className="w-full flex flex-col items-center gap-1.5 sm:gap-2">
        {QWERTY_ROWS.map((row, rowIdx) => (
          <div key={rowIdx} className="flex justify-center gap-1 sm:gap-1.5 w-full">
            <AnimatePresence>
              {row.map((letter) => {
                if (removedKeys.has(letter)) return null; // shed keys drop away
                const isWrong = wrongLetter === letter;
                const isHint = hintKey === letter;
                return (
                  <motion.button
                    key={letter}
                    type="button"
                    layout
                    initial={{ opacity: 0, y: -12 }}
                    animate={{
                      opacity: typing ? 1 : 0.45,
                      y: 0,
                      scale: isWrong ? 1.08 : 1,
                    }}
                    exit={{ opacity: 0, y: 48, transition: { duration: 0.35 } }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    whileTap={typing ? { scale: 0.9 } : undefined}
                    onClick={() => typing && onType(letter)}
                    disabled={!typing}
                    className={`flex-1 sm:flex-none ${keyMin} rounded-xl border-b-4 font-black uppercase transition-colors ${
                      compact ? 'text-base' : 'text-lg lg:text-2xl'
                    } ${
                      isWrong
                        ? 'bg-rose-500 border-rose-700 text-white'
                        : isHint
                          ? 'bg-amber-400 border-amber-600 text-amber-950 ring-4 ring-amber-300/60'
                          : 'bg-slate-200 border-slate-400 text-slate-800 hover:bg-white'
                    } ${isWrong ? 'animate-sb-shake' : ''}`}
                  >
                    {letter}
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes sb-shake {
          0%, 100% { transform: translateX(0); }
          25%, 75% { transform: translateX(-5px); }
          50% { transform: translateX(5px); }
        }
        .animate-sb-shake { animation: sb-shake 0.35s ease-in-out; }
        @keyframes sb-pulse-border {
          0%, 100% { border-color: #38bdf8; }
          50% { border-color: #0ea5e9; box-shadow: 0 0 0 4px rgba(56,189,248,0.25); }
        }
        .animate-pulse-soft-border { animation: sb-pulse-border 1.2s ease-in-out infinite; }
      `}</style>
    </div>
  );
};

export default SpellingBeeStage;
