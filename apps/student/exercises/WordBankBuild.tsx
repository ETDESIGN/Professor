// WORD_BANK_BUILD — assemble the target sentence by tapping word-bank tiles in
// order (the upgraded SentenceScramble). Constrained production; single check.

import React, { useMemo, useState } from 'react';
import { BaseExerciseProps } from '../../../types/exercise';
import { AudioButton, FeedbackBanner, useElapsedMs, normalizeForCompare, Feedback } from './shared';

const stripPunct = (s: string) => s.replace(/[.,!?;:"']/g, '');

const WordBankBuild: React.FC<BaseExerciseProps> = ({ data, onComplete, onError }) => {
  const c = data.content as Extract<import('../../../types/exercise').ExerciseContent, { type: 'WORD_BANK_BUILD' }>;
  const elapsed = useElapsedMs();
  const targetTokens = useMemo(() => (c.target_sentence || '').split(/\s+/).filter(Boolean), [c.target_sentence]);

  // Each bank tile: unique id (same word can repeat).
  const bank = useMemo(() => {
    return (c.word_bank || []).map((w, i) => ({ id: `${i}`, text: w }));
  }, [c.word_bank]);

  const [placed, setPlaced] = useState<{ id: string; text: string }[]>([]);
  const [feedback, setFeedback] = useState<Feedback>('idle');

  const remaining = bank.filter((b) => !placed.some((p) => p.id === b.id));

  const place = (tile: { id: string; text: string }) => {
    if (feedback !== 'idle') return;
    setPlaced((prev) => [...prev, tile]);
  };
  const unplace = (idx: number) => {
    if (feedback !== 'idle') return;
    setPlaced((prev) => prev.filter((_, i) => i !== idx));
  };

  const check = () => {
    if (feedback !== 'idle' || placed.length === 0) return;
    const built = placed.map((p) => normalizeForCompare(stripPunct(p.text)));
    const target = targetTokens.map((t) => normalizeForCompare(stripPunct(t)));
    const correct = built.length === target.length && built.every((w, i) => w === target[i]);
    setFeedback(correct ? 'correct' : 'wrong');
    setTimeout(() => onComplete({ success: correct, time_taken_ms: elapsed(), attempts: 1 }), 1100);
  };

  return (
    <div className="flex-1 flex flex-col p-6 max-w-lg mx-auto w-full">
      {c.translation && <p className="text-slate-500 font-bold mb-2">{c.translation}</p>}
      {c.audio_url && <AudioButton url={c.audio_url} fallbackText={c.target_sentence} onError={onError} />}

      {/* Build area */}
      <div className="min-h-[96px] rounded-2xl border-2 border-dashed border-slate-200 p-3 flex flex-wrap gap-2 mb-4 bg-white">
        {placed.length === 0 && <span className="text-slate-300 self-center px-2">Tap words to build the sentence</span>}
        {placed.map((p, i) => (
          <button
            key={p.id}
            onClick={() => unplace(i)}
            className="px-3 py-2 rounded-xl bg-duo-blue text-white font-bold shadow-sm active:scale-95"
          >
            {p.text}
          </button>
        ))}
      </div>

      {/* Word bank */}
      <div className="flex flex-wrap gap-2 flex-1 content-start">
        {remaining.map((tile) => (
          <button
            key={tile.id}
            onClick={() => place(tile)}
            disabled={feedback !== 'idle'}
            className="px-3 py-2 rounded-xl bg-white border-2 border-slate-200 text-slate-800 font-bold shadow-sm active:scale-95 disabled:opacity-40"
          >
            {tile.text}
          </button>
        ))}
      </div>

      {feedback === 'idle' ? (
        <button
          onClick={check}
          disabled={placed.length === 0}
          className="mt-4 w-full bg-duo-green text-white font-bold py-3 rounded-2xl shadow-lg active:scale-[0.98] disabled:opacity-40"
        >
          Check
        </button>
      ) : (
        <>
          <p className={`mt-3 text-center font-bold ${feedback === 'correct' ? 'text-green-600' : 'text-red-500'}`}>
            {feedback === 'correct' ? c.target_sentence : `Answer: ${c.target_sentence}`}
          </p>
          <FeedbackBanner feedback={feedback} />
        </>
      )}
    </div>
  );
};

export default WordBankBuild;
