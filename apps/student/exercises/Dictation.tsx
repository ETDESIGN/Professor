// DICTATION — type what you hear. Free-input production; case/punctuation
// insensitive. Audio plays via the real audio_url (fixes mock playAudio).

import React, { useState } from 'react';
import { BaseExerciseProps } from '../../../types/exercise';
import { AudioButton, FeedbackBanner, useElapsedMs, textMatches, Feedback } from './shared';

const Dictation: React.FC<BaseExerciseProps> = ({ data, onComplete, onError }) => {
  const c = data.content as Extract<import('../../../types/exercise').ExerciseContent, { type: 'DICTATION' }>;
  const elapsed = useElapsedMs();
  const [value, setValue] = useState('');
  const [feedback, setFeedback] = useState<Feedback>('idle');

  const submit = () => {
    if (feedback !== 'idle' || !value.trim()) return;
    const correct = textMatches(value, [c.correct_text]);
    setFeedback(correct ? 'correct' : 'wrong');
    setTimeout(() => onComplete({ success: correct, time_taken_ms: elapsed(), attempts: 1 }), 1200);
  };

  return (
    <div className="flex-1 flex flex-col p-6 max-w-lg mx-auto w-full">
      <p className="text-slate-500 font-bold mb-3">Type what you hear</p>
      <div className="flex items-center gap-4 mb-4">
        <AudioButton url={c.audio_url} fallbackText={c.correct_text} large onError={onError} />
        <span className="text-slate-400 text-sm">Tap to listen, then type</span>
      </div>

      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        disabled={feedback !== 'idle'}
        placeholder="Type the word or sentence…"
        className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200 focus:border-duo-blue outline-none text-lg font-medium text-slate-800 bg-white"
      />
      {c.hint && feedback !== 'idle' && <p className="text-sm text-slate-500 mt-2">Hint: {c.hint}</p>}

      {feedback === 'idle' ? (
        <button
          onClick={submit}
          disabled={!value.trim()}
          className="mt-4 w-full bg-duo-green text-white font-bold py-3 rounded-2xl shadow-lg active:scale-[0.98] disabled:opacity-40"
        >
          Check
        </button>
      ) : (
        <>
          <p className={`mt-3 text-center font-bold ${feedback === 'correct' ? 'text-green-600' : 'text-red-500'}`}>
            {feedback === 'correct' ? c.correct_text : `Answer: ${c.correct_text}`}
          </p>
          <FeedbackBanner feedback={feedback} />
        </>
      )}
    </div>
  );
};

export default Dictation;
