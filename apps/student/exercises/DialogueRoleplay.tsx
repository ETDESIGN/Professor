// DIALOGUE_ROLEPLAY — perform a dialogue line by line (Phase 3). Follows the
// SPEAK_SENTENCE pattern: lenient tiered speech scoring for young learners
// (≥0.6 = pass, 0.4–0.6 = almost/retry, <0.4 = replay the model + retry), a
// "hear it first" TTS affordance per line, and a graceful engagement-only
// fallback (record: false) when speech recognition is unavailable. After 3
// failed attempts a line is marked attempted-and-moved-on so nobody gets
// stuck; the exercise completes when every line has been attempted.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, MicOff, Check } from 'lucide-react';
import { toast } from 'sonner';
import { BaseExerciseProps } from '../../../types/exercise';
import {
  startPronunciationCheck,
  isSpeechRecognitionSupported,
  playAudioUrl,
} from '../../../services/SpeechService';
import { AudioButton, useElapsedMs } from './shared';

type DialogueContent = Extract<
  import('../../../types/exercise').ExerciseContent,
  { type: 'DIALOGUE_ROLEPLAY' }
>;

const PASS_THRESHOLD = 0.6;
const MAX_ATTEMPTS_PER_LINE = 3;

const DialogueRoleplay: React.FC<BaseExerciseProps> = ({ data, onComplete, onError }) => {
  const c = data.content as DialogueContent;
  const elapsed = useElapsedMs();
  const { t } = useTranslation();
  const lines = c.lines || [];
  const supported = isSpeechRecognitionSupported();

  const [current, setCurrent] = useState(0);
  const [passed, setPassed] = useState<Set<number>>(new Set());
  const [listening, setListening] = useState(false);
  const [lineAttempts, setLineAttempts] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);

  const line = lines[current];
  const isLastLine = current >= lines.length - 1;

  const finish = (ok: boolean, attempts: number, record = true) => {
    setTimeout(() => onComplete({ success: ok, time_taken_ms: elapsed(), attempts, record }), 700);
  };

  const advance = (justPassed: boolean, attemptsSoFar: number) => {
    if (justPassed) {
      setPassed(prev => new Set(prev).add(current));
    }
    if (isLastLine) {
      const passedTotal = passed.size + (justPassed ? 1 : 0);
      const ok = passedTotal >= Math.max(1, Math.ceil(lines.length / 2));
      finish(ok, attemptsSoFar);
    } else {
      setCurrent(current + 1);
      setLineAttempts(0);
    }
  };

  const handleMic = () => {
    if (!supported || listening || !line) return;
    setListening(true);
    startPronunciationCheck(
      line.text,
      (result) => {
        setListening(false);
        const attempts = totalAttempts + 1;
        setTotalAttempts(attempts);
        if (result.isCorrect) {
          // Pass (≥0.6, lenient for kids).
          toast.success(t('exercise.greatLine', 'Great line! 🎭'));
          advance(true, attempts);
        } else if (result.similarity >= 0.4 && lineAttempts + 1 < MAX_ATTEMPTS_PER_LINE) {
          // Almost — let them try again (no fail).
          setLineAttempts(lineAttempts + 1);
          toast(t('exercise.almostRetry', 'Almost! Try once more 🎤'), { icon: '🤏' });
        } else if (lineAttempts + 1 < MAX_ATTEMPTS_PER_LINE) {
          // Way off — replay the model, then retry.
          setLineAttempts(lineAttempts + 1);
          toast(t('exercise.listenAgain', 'Listen again, then try 🎧'), { icon: '🔁' });
          playAudioUrl(undefined, line.text);
        } else {
          // Line exhausted its attempts — move on without a pass (never stuck).
          toast(t('exercise.nextLine', 'Let’s try the next line!'), { icon: '➡️' });
          advance(false, attempts);
        }
      },
      (msg) => {
        setListening(false);
        onError?.(msg);
        toast.error(msg);
      },
      undefined,
      PASS_THRESHOLD,
    );
  };

  const skipAsUnsupported = () => {
    onError?.('Speech recognition unavailable');
    // No microphone: advance the runner as engagement-only. `record: false`
    // means the runner writes NO learner state / hearts / XP.
    finish(true, 1, false);
  };

  if (!line) {
    return <div className="p-6 text-slate-400">{t('exercise.noDialogue', 'No dialogue content for this activity.')}</div>;
  }

  return (
    <div className="flex-1 flex flex-col p-6 max-w-lg mx-auto w-full">
      <p className="text-duo-blue font-bold mb-1">{t('exercise.actItOut', { defaultValue: 'Act it out — line {{n}} of {{total}}', n: current + 1, total: lines.length })}</p>
      <p className="text-slate-400 text-xs mb-4 uppercase tracking-wide font-bold">{t('exercise.dialogueRoleplay', 'Dialogue role-play')}</p>

      {/* Dialogue transcript: past lines dimmed with a check, current highlighted. */}
      <div className="flex-1 space-y-2 overflow-y-auto mb-4">
        {lines.map((l, i) => {
          const isCurrent = i === current;
          const isDone = i < current || passed.has(i);
          return (
            <div
              key={i}
              className={`rounded-2xl p-3 border-2 transition-all ${
                isCurrent
                  ? 'bg-duo-blue/5 border-duo-blue'
                  : isDone
                    ? 'bg-slate-50 border-slate-100 opacity-60'
                    : 'bg-white border-slate-100 opacity-50'
              }`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                {isDone && <Check size={14} className="text-green-500 shrink-0" strokeWidth={3} />}
                <span className={`text-xs font-bold uppercase tracking-wide ${isCurrent ? 'text-duo-blue' : 'text-slate-400'}`}>
                  {l.speaker}
                </span>
              </div>
              <p className={`text-sm leading-relaxed ${isCurrent ? 'text-slate-800 font-bold' : 'text-slate-500'}`}>
                {l.text}
              </p>
              {isCurrent && l.translation && (
                <p className="text-xs text-slate-400 mt-1">{l.translation}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Current-line controls: hear the model, then speak. */}
      {supported ? (
        <div className="flex items-center justify-center gap-6 py-2">
          <div className="flex flex-col items-center gap-1">
            <AudioButton url={undefined} fallbackText={line.text} onError={onError} />
            <span className="text-slate-400 text-xs">{t('exercise.hearIt', 'Hear it')}</span>
          </div>
          <button
            onClick={handleMic}
            disabled={listening}
            className={`w-20 h-20 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform ${
              listening ? 'bg-duo-red animate-pulse' : 'bg-duo-blue'
            }`}
          >
            {listening ? <MicOff size={32} /> : <Mic size={32} />}
          </button>
        </div>
      ) : (
        <div className="text-center py-2">
          <p className="text-slate-400 text-sm mb-3">{t('exercise.speechUnsupported', 'Speech recognition isn\'t supported on this device.')}</p>
          <button
            onClick={skipAsUnsupported}
            className="bg-duo-blue text-white font-bold px-6 py-3 rounded-2xl shadow-lg active:scale-[0.98]"
          >
            {t('student.continue', 'Continue')}
          </button>
        </div>
      )}
    </div>
  );
};

export default DialogueRoleplay;
