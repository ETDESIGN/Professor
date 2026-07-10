// MINIMAL_PAIR_SWIPE — distinguish a confusable (e.g. ship vs sheep). A 2-option
// phonics choice driven by the confusable pair + audio of the correct member.

import React, { useState } from 'react';
import { BaseExerciseProps } from '../../../types/exercise';
import { AudioButton, FeedbackBanner, useElapsedMs, optionClasses, Feedback } from './shared';

const MinimalPairSwipe: React.FC<BaseExerciseProps> = ({ data, onComplete, onError }) => {
  const c = data.content as Extract<import('../../../types/exercise').ExerciseContent, { type: 'MINIMAL_PAIR_SWIPE' }>;
  const elapsed = useElapsedMs();
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback>('idle');

  const options = c.options?.length ? c.options : c.pair.map((w) => ({ text: w }));
  const correctIndex = typeof c.correct_index === 'number' ? c.correct_index : 0;

  const handleSelect = (i: number) => {
    if (feedback !== 'idle') return;
    setSelected(i);
    const correct = i === correctIndex;
    setFeedback(correct ? 'correct' : 'wrong');
    setTimeout(() => onComplete({ success: correct, time_taken_ms: elapsed(), attempts: 1 }), 1100);
  };

  return (
    <div className="flex-1 flex flex-col p-6 max-w-lg mx-auto w-full">
      <p className="text-slate-500 font-bold mb-3">{c.prompt || 'Which word did you hear?'}</p>
      <div className="flex items-center gap-4 mb-6">
        <AudioButton url={c.audio_url} fallbackText={options[correctIndex]?.text} large onError={onError} />
        <span className="text-slate-400 text-sm">Tap to listen</span>
      </div>

      <div className="grid grid-cols-2 gap-3 flex-1 content-start">
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => handleSelect(i)}
            disabled={feedback !== 'idle'}
            className={`rounded-2xl font-black text-2xl p-6 transition-all ${optionClasses(i, selected, correctIndex, feedback !== 'idle')}`}
          >
            {opt.text}
          </button>
        ))}
      </div>

      <FeedbackBanner feedback={feedback} />
    </div>
  );
};

export default MinimalPairSwipe;
