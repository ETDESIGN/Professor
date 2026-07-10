// SPEAK_SENTENCE — pronounce the target sentence. Uses Web Speech recognition
// + the SpeechService Levenshtein pronunciation scorer. The upgraded
// PronunciationCoach. Success threshold 0.8 similarity; degrades gracefully to
// "tap to hear" when speech recognition is unavailable.

import React, { useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';
import { BaseExerciseProps } from '../../../types/exercise';
import {
  startPronunciationCheck,
  isSpeechRecognitionSupported,
  generateFeedback,
} from '../../../services/SpeechService';
import { AudioButton, FeedbackBanner, useElapsedMs, Feedback } from './shared';

const SpeakSentence: React.FC<BaseExerciseProps> = ({ data, onComplete, onError }) => {
  const c = data.content as Extract<import('../../../types/exercise').ExerciseContent, { type: 'SPEAK_SENTENCE' }>;
  const elapsed = useElapsedMs();
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const [listening, setListening] = useState(false);
  const supported = isSpeechRecognitionSupported();

  const handleMic = () => {
    if (!supported || feedback !== 'idle') return;
    setListening(true);
    startPronunciationCheck(
      c.target_sentence,
      (result) => {
        setListening(false);
        const correct = result.isCorrect;
        setFeedback(correct ? 'correct' : 'wrong');
        toast(correct ? generateFeedback(result.similarity, c.target_sentence) : 'Try again next time');
        setTimeout(() => onComplete({ success: correct, time_taken_ms: elapsed(), attempts: 1 }), 1200);
      },
      (msg) => {
        setListening(false);
        onError?.(msg);
        toast.error(msg);
      },
    );
  };

  const skipAsUnsupported = () => {
    if (feedback !== 'idle') return;
    onError?.('Speech recognition unavailable');
    setFeedback('correct');
    // No microphone: advance the runner as engagement-only. `record: false`
    // means the runner writes NO learner state / hearts / XP — never a free
    // productive success.
    setTimeout(() => onComplete({ success: true, time_taken_ms: elapsed(), attempts: 1, record: false }), 800);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-lg mx-auto w-full text-center">
      <p className="text-duo-blue font-bold mb-2">Say it out loud</p>
      <h2 className="text-2xl font-black text-slate-800 mb-4">{c.target_sentence}</h2>

      <div className="flex items-center gap-3 mb-6">
        <AudioButton url={c.target_audio} fallbackText={c.target_sentence} onError={onError} />
        <span className="text-slate-400 text-sm">Hear it first</span>
      </div>

      {supported ? (
        <button
          onClick={handleMic}
          disabled={feedback !== 'idle'}
          className={`w-24 h-24 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform ${
            listening ? 'bg-duo-red animate-pulse' : 'bg-duo-blue'
          }`}
        >
          {listening ? <MicOff size={40} /> : <Mic size={40} />}
        </button>
      ) : (
        <div className="text-center">
          <p className="text-slate-400 text-sm mb-3">Speech recognition isn't supported on this device.</p>
          <button
            onClick={skipAsUnsupported}
            className="bg-duo-blue text-white font-bold px-6 py-3 rounded-2xl shadow-lg active:scale-[0.98]"
          >
            Continue
          </button>
        </div>
      )}

      <FeedbackBanner feedback={feedback} />
    </div>
  );
};

export default SpeakSentence;
