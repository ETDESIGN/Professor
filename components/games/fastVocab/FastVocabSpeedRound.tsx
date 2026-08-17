// FastVocabSpeedRound — the Phase-2 surface: one large prompt card (the
// word's image in image mode, its L1 meaning in meaning mode) and three word
// choices. Single-shot under the shared timer; the turn controller owns the
// state machine, this component renders it and emits onChoose.

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Zap } from 'lucide-react';
import type { FastVocabMode, FastVocabSpeedQ } from './types';

export interface FastVocabSpeedRoundProps {
  question: FastVocabSpeedQ;
  mode: FastVocabMode;
  qIndex: number;
  qTotal: number;
  selectedChoice: number | null;
  revealCorrect: boolean;
  wrongChoice: number | null;
  eliminatedChoices: number[];
  /** Disable choosing (during transitions). */
  locked?: boolean;
  onChoose: (idx: number) => void;
  /** Compact variant for the student app. */
  compact?: boolean;
}

const FastVocabSpeedRound: React.FC<FastVocabSpeedRoundProps> = ({
  question,
  mode,
  qIndex,
  qTotal,
  selectedChoice,
  revealCorrect,
  wrongChoice,
  eliminatedChoices,
  locked = false,
  onChoose,
  compact = false,
}) => {
  const choiceState = (idx: number) => {
    if (revealCorrect) {
      if (idx === question.correctIndex) return 'correct';
      if (idx === wrongChoice) return 'wrong';
      return 'gone';
    }
    if (idx === wrongChoice) return 'wrong';
    if (eliminatedChoices.includes(idx)) return 'eliminated';
    if (selectedChoice === idx) return 'selected';
    return 'idle';
  };

  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-5 select-none">
      {/* Prompt card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={question.id}
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -60 }}
          transition={{ duration: 0.25 }}
          className={`relative bg-white rounded-[2rem] border-4 border-amber-300 shadow-xl shadow-amber-500/10 overflow-hidden
            ${compact ? 'w-48 h-48' : 'w-56 h-56 md:w-64 md:h-64'} flex items-center justify-center`}
        >
          {mode === 'image' && question.imageUrl ? (
            <img src={question.imageUrl} alt="" draggable={false} className="w-full h-full object-contain p-3" />
          ) : (
            <span className={`${compact ? 'text-2xl' : 'text-3xl md:text-4xl'} font-black text-slate-800 text-center px-4`}>
              {question.meaning || question.correctWord}
            </span>
          )}
          <span className="absolute top-2 left-3 text-xs font-black text-amber-500 uppercase tracking-widest flex items-center gap-1">
            <Zap size={12} /> {qIndex + 1}/{qTotal}
          </span>
        </motion.div>
      </AnimatePresence>

      {/* Choices */}
      <div className={`flex ${compact ? 'flex-col' : 'flex-row flex-wrap'} justify-center gap-3 max-w-3xl`}>
        {question.choices.map((word, idx) => {
          const state = choiceState(idx);
          const cls =
            state === 'correct'
              ? 'bg-emerald-500 border-emerald-300 text-white scale-105 shadow-lg shadow-emerald-500/40'
              : state === 'wrong'
                ? 'bg-slate-800 border-red-500 text-white animate-fv-shake'
                : state === 'gone'
                  ? 'bg-slate-800/40 border-slate-700 text-slate-600 opacity-40'
                  : state === 'eliminated'
                    ? 'bg-slate-800/50 border-slate-700 text-slate-500 line-through opacity-50 cursor-not-allowed'
                    : state === 'selected'
                      ? 'bg-indigo-600 border-indigo-300 text-white scale-105'
                      : 'bg-slate-800 border-slate-600 text-white hover:border-amber-300 hover:-translate-y-0.5 cursor-pointer';
          const disabled = locked || state === 'eliminated' || state === 'gone' || selectedChoice !== null;
          return (
            <button
              key={`${question.id}-${idx}`}
              type="button"
              disabled={disabled}
              onClick={() => onChoose(idx)}
              className={`relative rounded-2xl border-4 transition-all duration-200 font-black
                ${compact ? 'w-full px-5 py-3.5 text-lg' : 'px-7 py-4 text-xl md:text-2xl min-w-36'} ${cls}`}
            >
              {word}
              {state === 'correct' && (
                <span className="absolute -top-2.5 -right-2.5 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow">
                  <Check size={16} strokeWidth={4} className="text-emerald-500" />
                </span>
              )}
              {state === 'wrong' && (
                <span className="absolute -top-2.5 -right-2.5 w-7 h-7 bg-red-500 rounded-full flex items-center justify-center shadow">
                  <X size={16} strokeWidth={4} className="text-white" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default FastVocabSpeedRound;
