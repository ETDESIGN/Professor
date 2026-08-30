// TYPE_TRANSLATE — type the L2 (English) for an L1 (Simplified Chinese) prompt.
// Free production; case/punctuation insensitive. Level-gated in the runner
// (ages 6-8 fall back to a word bank variant — handled by selection).

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BaseExerciseProps } from '../../../types/exercise';
import { FeedbackBanner, useElapsedMs, textMatches, Feedback } from './shared';

// Don't pop the on-screen keyboard over the exercise on touch devices.
const FINE_POINTER = typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(pointer: fine)').matches;

const TypeTranslate: React.FC<BaseExerciseProps> = ({ data, onComplete }) => {
  const { t } = useTranslation();
  const c = data.content as Extract<import('../../../types/exercise').ExerciseContent, { type: 'TYPE_TRANSLATE' }>;
  const elapsed = useElapsedMs();
  const [value, setValue] = useState('');
  const [feedback, setFeedback] = useState<Feedback>('idle');

  const submit = () => {
    if (feedback !== 'idle' || !value.trim()) return;
    const correct = textMatches(value, c.accepted || []);
    setFeedback(correct ? 'correct' : 'wrong');
    setTimeout(() => onComplete({ success: correct, time_taken_ms: elapsed(), attempts: 1 }), 1200);
  };

  return (
    <div className="flex-1 flex flex-col p-6 max-w-lg mx-auto w-full">
      <p className="text-duo-blue font-bold mb-1">{t('exercise.translateToEnglish', 'Translate to English')}</p>
      <h2 className="text-3xl font-black text-slate-800 mb-4">{c.prompt_l1}</h2>

      <input
        autoFocus={FINE_POINTER}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        disabled={feedback !== 'idle'}
        placeholder={t('exercise.typeEnglish', 'Type the English…')}
        className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200 focus:border-duo-blue outline-none text-lg font-medium text-slate-800 bg-white"
      />
      {c.hint && <p className="text-sm text-slate-400 mt-2">{t('exercise.hint', 'Hint')}: {c.hint}</p>}

      {feedback === 'idle' ? (
        <button
          onClick={submit}
          disabled={!value.trim()}
          className="mt-4 w-full bg-duo-pink text-white font-bold py-3 rounded-2xl shadow-lg active:scale-[0.98] disabled:opacity-40"
        >
          Check
        </button>
      ) : (
        <>
          <p className={`mt-3 text-center font-bold ${feedback === 'correct' ? 'text-green-600' : 'text-red-500'}`}>
            {feedback === 'correct' ? (c.accepted?.[0] || '') : `Answer: ${c.accepted?.[0] || ''}`}
          </p>
          <FeedbackBanner feedback={feedback} />
        </>
      )}
    </div>
  );
};

export default TypeTranslate;
