// SPEAK_SENTENCE — pronounce the target sentence. Uses Web Speech recognition +
// the SpeechService Levenshtein scorer. P-F: LENIENT TIERED scoring for young
// learners — ≥0.6 = Great (pass), 0.4–0.6 = Almost (retry), <0.4 = Listen-again
// (replay model + retry). No harsh single-fail; affect stays low (Krashen).
// Degrades to "tap to hear" when speech recognition is unavailable.

import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';
import { BaseExerciseProps } from '../../../types/exercise';
import {
  startPronunciationCheck,
  isSpeechRecognitionSupported,
  generateFeedback,
} from '../../../services/SpeechService';
import { playAudioUrl } from '../../../services/SpeechService';
import { AudioButton, FeedbackBanner, useElapsedMs, Feedback } from './shared';

const SpeakSentence: React.FC<BaseExerciseProps> = ({ data, onComplete, onError }) => {
  const c = data.content as Extract<import('../../../types/exercise').ExerciseContent, { type: 'SPEAK_SENTENCE' }>;
  const elapsed = useElapsedMs();
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const [listening, setListening] = useState(false);
  const attemptsRef = useRef(0);
  const supported = isSpeechRecognitionSupported();

  const handleMic = () => {
    if (!supported || listening || feedback !== 'idle') return;
    setListening(true);
    startPronunciationCheck(
      c.target_sentence,
      (result) => {
        setListening(false);
        const sim = result.similarity;
        attemptsRef.current += 1;
        if (result.isCorrect) {
          // Pass (≥0.6, lenient for kids). Keep the green UX/advance, but a
          // client-graded score (browser Web Speech transcript, no server STT
          // verification) is practice-only — `record: false` makes the runner
          // skip learner-state/hearts/XP (FIXPLAN H1: audit 2026-08-28).
          setFeedback('correct');
          toast.success(generateFeedback(sim, c.target_sentence));
          setTimeout(() => onComplete({
            success: true,
            time_taken_ms: elapsed(),
            attempts: attemptsRef.current,
            record: !result.client_graded,
          }), 900);
        } else if (sim >= 0.4) {
          // Almost — let them try again (no fail).
          setFeedback('wrong');
          toast(t('exercise.almostRetry', 'Almost! Try once more 🎤'), { icon: '🤏' });
          setTimeout(() => setFeedback('idle'), 1400);
        } else {
          // Way off — replay the model, then retry.
          setFeedback('wrong');
          toast(t('exercise.listenAgain', 'Listen again, then try 🎧'), { icon: '🔁' });
          playAudioUrl(c.target_audio, c.target_sentence);
          setTimeout(() => setFeedback('idle'), 1600);
        }
      },
      (msg) => {
        setListening(false);
        onError?.(msg);
        toast.error(msg);
      },
      undefined,
      0.6, // lenient pass threshold (was 0.8)
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
      <p className="text-duo-blue font-bold mb-2">{t('exercise.sayItLoud', 'Say it out loud')}</p>
      <h2 className="text-2xl font-black text-slate-800 mb-4">{c.target_sentence}</h2>

      <div className="flex items-center gap-3 mb-6">
        <AudioButton url={c.target_audio} fallbackText={c.target_sentence} onError={onError} />
        <span className="text-slate-400 text-sm">{t('exercise.hearItFirst', 'Hear it first')}</span>
      </div>

      {supported ? (
        <button
          onClick={handleMic}
          disabled={listening || feedback !== 'idle'}
          className={`w-24 h-24 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform ${
            listening ? 'bg-duo-red animate-pulse' : 'bg-duo-blue'
          }`}
        >
          {listening ? <MicOff size={40} /> : <Mic size={40} />}
        </button>
      ) : (
        <div className="text-center">
          <p className="text-slate-400 text-sm mb-3">{t('exercise.speechUnsupported', 'Speech recognition isn\'t supported on this device.')}</p>
          <button
            onClick={skipAsUnsupported}
            className="bg-duo-blue text-white font-bold px-6 py-3 rounded-2xl shadow-lg active:scale-[0.98]"
          >
            {t('student.continue', 'Continue')}
          </button>
        </div>
      )}

      <FeedbackBanner feedback={feedback} />
    </div>
  );
};

export default SpeakSentence;
