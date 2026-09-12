// DIALOGUE_ROLEPLAY — perform a dialogue line by line. Upgraded per Stitch screens
// 19/1.html (chat-stream transcript with avatars) and 19/2.html (current-line pinned mic dock).
//
// Key UX behaviors (Audit & Owner approval):
// 1. Pinned bottom mic dock: recording controls permanently visible above phone fold.
// 2. Chat-stream transcript: speaker avatars, speech bubbles, and auto-scroll of active line.
// 3. 3-dot attempt budget: visual progress ("Attempt 1 of 3") per line, advances after 3 tries.
// 4. Skip line link ("Skip line (practice only) ➔"): kid-alone safety bypass.
// 5. Data-write discipline: client-graded speech pass keeps record: false rule untouched.

import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, MicOff, Check, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { BaseExerciseProps } from '../../../types/exercise';
import {
  startPronunciationCheck,
  isSpeechRecognitionSupported,
  playAudioUrl,
} from '../../../services/SpeechService';
import { useElapsedMs, AudioButton } from './shared';
import { playCue } from '../../board/templates/playCue';

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
  const [interimTranscript, setInterimTranscript] = useState('');

  const clientGradedPassRef = useRef(false);
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  const line = lines[current];
  const isLastLine = current >= lines.length - 1;

  // Auto-scroll active line into view
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [current]);

  const finish = (ok: boolean, attempts: number, record = true) => {
    setTimeout(() => onComplete({ success: ok, time_taken_ms: elapsed(), attempts, record }), 700);
  };

  const advance = (justPassed: boolean, attemptsSoFar: number) => {
    if (justPassed) {
      setPassed((prev) => new Set(prev).add(current));
    }
    if (isLastLine) {
      const passedTotal = passed.size + (justPassed ? 1 : 0);
      const ok = passedTotal >= Math.max(1, Math.ceil(lines.length / 2));
      finish(ok, attemptsSoFar, !clientGradedPassRef.current);
    } else {
      setCurrent((c) => c + 1);
      setLineAttempts(0);
      setInterimTranscript('');
    }
  };

  const handleMic = () => {
    if (!supported || listening || !line) return;
    setListening(true);
    setInterimTranscript('');

    startPronunciationCheck(
      line.text,
      (result) => {
        setListening(false);
        const attempts = totalAttempts + 1;
        setTotalAttempts(attempts);

        if (result.isCorrect) {
          playCue('correct');
          if (result.client_graded) clientGradedPassRef.current = true;
          toast.success(t('exercise.greatLine', 'Great line! 🎭'));
          advance(true, attempts);
        } else if (result.similarity >= 0.4 && lineAttempts + 1 < MAX_ATTEMPTS_PER_LINE) {
          playCue('wrong');
          setLineAttempts((a) => a + 1);
          toast(t('exercise.almostRetry', 'Almost! Try once more 🎤'), { icon: '🤏' });
        } else if (lineAttempts + 1 < MAX_ATTEMPTS_PER_LINE) {
          playCue('wrong');
          setLineAttempts((a) => a + 1);
          toast(t('exercise.listenAgain', 'Listen again, then try 🎧'), { icon: '🔁' });
          playAudioUrl(undefined, line.text);
        } else {
          // Line exhausted its attempts — advance without pass (never stuck)
          playCue('reveal');
          toast(t('exercise.nextLine', 'Let’s try the next line!'), { icon: '➡️' });
          advance(false, attempts);
        }
      },
      (msg) => {
        setListening(false);
        onError?.(msg);
        toast.error(msg);
      },
      (interim) => {
        setInterimTranscript(interim);
      },
      PASS_THRESHOLD,
    );
  };

  const handleSkipLine = () => {
    if (listening) return;
    clientGradedPassRef.current = true;
    const attempts = totalAttempts + 1;
    setTotalAttempts(attempts);
    advance(false, attempts);
  };

  const skipAsUnsupported = () => {
    onError?.('Speech recognition unavailable');
    finish(true, 1, false);
  };

  if (!line) {
    return <div className="p-6 text-[#8C7A68]">{t('exercise.noDialogue', 'No dialogue content for this activity.')}</div>;
  }

  return (
    <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-[#EAE0D0] text-[#264653]">
      {/* Top Header Summary */}
      <div className="px-4 pt-2.5 pb-1 flex items-center justify-between border-b border-[#E2D7C3] bg-[#FDFBF7] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-[#E76F51] bg-[#FFF4F0] px-2 py-0.5 rounded-full border border-[#FCD9CF]">
            ROLEPLAY • 对话演练
          </span>
          <span className="text-xs font-bold text-[#1D3557]">
            Line {current + 1} of {lines.length}
          </span>
        </div>
        <span className="text-[11px] font-bold text-[#2A9D8F] bg-[#E6F4F1] px-2 py-0.5 rounded-full">
          ⭐ {passed.size} / {lines.length} Passed
        </span>
      </div>

      {/* Illustrated Messaging Chat Stream (Stitch 19-1) */}
      <div className="flex-1 px-3.5 py-2.5 space-y-3 overflow-y-auto">
        {lines.map((l, i) => {
          const isCurrent = i === current;
          const isDone = i < current || passed.has(i);
          const isTeacher = (l.speaker || '').toLowerCase().includes('teacher') || (l.speaker || '').toLowerCase().includes('owl') || i % 2 === 0;

          return (
            <div
              key={i}
              ref={isCurrent ? activeLineRef : undefined}
              className={`flex items-start gap-2.5 transition-all ${
                isTeacher ? 'justify-start' : 'justify-end'
              }`}
            >
              {/* Teacher Avatar */}
              {isTeacher && (
                <div className="w-10 h-10 rounded-full bg-[#FEF3C7] border-2 border-[#E9C46A] shrink-0 flex items-center justify-center text-lg shadow-xs relative">
                  🦉
                  {isDone && (
                    <span className="absolute -bottom-1 -right-0.5 text-[9px] bg-[#10B981] text-white rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
                      ✓
                    </span>
                  )}
                </div>
              )}

              {/* Speech Bubble */}
              <div className={`max-w-[285px] flex flex-col ${isTeacher ? 'items-start' : 'items-end'}`}>
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <span className="text-[11px] font-bold text-[#1D3557]">
                    {l.speaker}
                  </span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                    isTeacher ? 'bg-[#EAE0D0] text-[#8C7A68]' : 'bg-[#E6F4F1] text-[#2A9D8F]'
                  }`}>
                    {isTeacher ? 'Partner' : 'You'}
                  </span>
                </div>

                <div className={`p-3 rounded-2xl shadow-xs border-2 ${
                  isCurrent
                    ? 'bg-[#FDFBF7] border-[#1CB0F6] ring-2 ring-[#1CB0F6]/20'
                    : isDone
                      ? 'bg-[#FDFBF7] border-[#E2D7C3] opacity-80'
                      : 'bg-[#FAF7F0] border-[#E2D7C3]/60 opacity-60'
                } ${isTeacher ? 'rounded-tl-none' : 'rounded-tr-none'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm leading-snug ${isCurrent ? 'font-bold text-[#1D3557]' : 'text-[#264653]'}`}>
                      “{l.text}”
                    </p>
                    <button
                      type="button"
                      onClick={() => playAudioUrl(undefined, l.text)}
                      className="w-7 h-7 rounded-lg bg-[#1CB0F6] text-white flex items-center justify-center shrink-0 hover:bg-[#0EA5E9] shadow-xs cursor-pointer"
                      title="Listen"
                    >
                      <Volume2 size={14} />
                    </button>
                  </div>

                  {l.translation && (
                    <div className="mt-1.5 text-[11px] text-[#8C7A68] border-t border-[#E2D7C3]/60 pt-1">
                      {l.translation}
                    </div>
                  )}
                </div>
              </div>

              {/* Student Avatar */}
              {!isTeacher && (
                <div className="w-10 h-10 rounded-full bg-[#E8F8F5] border-2 border-[#2A9D8F] shrink-0 flex items-center justify-center text-lg shadow-xs relative">
                  👦
                  {isDone && (
                    <span className="absolute -bottom-1 -right-0.5 text-[9px] bg-[#10B981] text-white rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
                      ✓
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pinned Bottom Recording Console Dock (Stitch 19-2) */}
      <section className="bg-[#FDFBF7] rounded-t-[32px] border-t-2 border-[#E2D7C3] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] px-4 pt-3.5 pb-4 flex flex-col gap-2.5 relative z-30 shrink-0">
        
        {/* Role & Audio Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#E91E63]/15 border-2 border-[#E91E63] flex items-center justify-center text-xs shadow-xs">
              👦
            </div>
            <div>
              <span className="text-xs font-bold text-[#E91E63] leading-none block">
                Your Turn • {line.speaker}
              </span>
              <span className="text-[10px] text-[#8C7A68]">Speak into your microphone</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => playAudioUrl(undefined, line.text)}
            className="h-8 px-3 rounded-full bg-[#1CB0F6] text-white font-bold text-xs flex items-center gap-1.5 shadow-[0_2px_0_#0284C7] active:translate-y-[1px] hover:brightness-105 cursor-pointer"
          >
            <Volume2 size={13} />
            <span>Hear Line</span>
          </button>
        </div>

        {/* Target Line Prompt Card */}
        <div className="bg-[#F7F3E8] rounded-2xl border-2 border-[#E2D7C3] p-3 shadow-inner">
          <span className="text-[10px] font-bold uppercase text-[#8C7A68] tracking-wider block mb-0.5">
            Target English Line:
          </span>
          <h2 className="font-bold text-[18px] text-[#1D3557] leading-tight">
            “{line.text}”
          </h2>
          {line.translation && (
            <p className="text-xs font-semibold text-[#8C7A68] mt-1 flex items-center gap-1">
              <span className="text-[#E9C46A]">💡</span>
              <span>{line.translation}</span>
            </p>
          )}
        </div>

        {/* 3-Dot Attempt Budget Bar (Audit P2 F4) */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-xs font-bold text-[#1D3557]">
            <span>Attempt:</span>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map((dot) => (
                <span
                  key={dot}
                  className={`w-3 h-3 rounded-full border ${
                    lineAttempts + 1 >= dot
                      ? 'bg-[#E91E63] border-[#BE185D]'
                      : 'bg-[#FDFBF7] border-[#E2D7C3]'
                  }`}
                  title={`Attempt ${dot}`}
                />
              ))}
            </div>
            <span className="text-[11px] text-[#8C7A68]">
              {lineAttempts + 1} of {MAX_ATTEMPTS_PER_LINE}
            </span>
          </div>

          <span className="text-[10px] font-bold text-[#2A9D8F] bg-[#E8F8F5] px-2 py-0.5 rounded-full border border-[#A7D7CD]">
            🛡️ Never stuck guarantee!
          </span>
        </div>

        {/* Recording Mic Button Area */}
        {supported ? (
          <div className="flex flex-col items-center justify-center my-1 relative">
            {listening && (
              <div className="absolute w-24 h-24 rounded-full bg-[#E91E63]/25 animate-ping pointer-events-none"></div>
            )}

            <button
              type="button"
              onClick={handleMic}
              disabled={listening}
              className={`w-[72px] h-[72px] rounded-full text-white flex flex-col items-center justify-center shadow-[0_5px_0_#BE185D] active:translate-y-[2px] active:shadow-[0_2px_0_#BE185D] transition-all cursor-pointer ${
                listening
                  ? 'bg-[#FF4B4B] shadow-[0_5px_0_#DC2626] animate-pulse'
                  : 'bg-[#E91E63] hover:brightness-105'
              }`}
              aria-label="Record line"
            >
              {listening ? <MicOff size={30} /> : <Mic size={30} />}
              <span className="text-[9px] font-black uppercase tracking-wider mt-0.5">
                {listening ? 'Listening' : 'Tap Mic'}
              </span>
            </button>

            {/* Live Transcript Stream (Audit F4) */}
            <div className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs text-[#1D3557] bg-[#F7F3E8] py-1.5 px-3 rounded-xl border border-[#E2D7C3]">
              <span className="font-bold text-[#E91E63] uppercase text-[10px]">
                {listening ? 'Hearing:' : 'Ready:'}
              </span>
              <span className="font-bold truncate">
                {interimTranscript ? `“${interimTranscript}”` : (listening ? 'Speak clearly now...' : 'Tap the pink mic to start')}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-xs text-[#8C7A68] mb-2">Speech recognition unavailable.</p>
            <button
              type="button"
              onClick={skipAsUnsupported}
              className="bg-[#2A9D8F] text-white font-bold px-4 py-2 rounded-xl text-xs"
            >
              Continue
            </button>
          </div>
        )}

        {/* Skip / Bypass Link (Kid-alone failure mode protection) */}
        <div className="flex items-center justify-between pt-1 border-t border-[#E2D7C3]/60 text-xs">
          <button
            type="button"
            onClick={() => playAudioUrl(undefined, line.text)}
            className="text-[11px] font-bold text-[#8C7A68] hover:text-[#1D3557] flex items-center gap-1 cursor-pointer"
          >
            <span>🔊 Re-listen line</span>
          </button>

          <button
            type="button"
            onClick={handleSkipLine}
            className="text-[11px] font-bold text-[#8C7A68] hover:text-[#E76F51] flex items-center gap-1 transition-colors cursor-pointer"
            title="Advances line without penalty if child is stuck"
          >
            <span>Skip line (practice only)</span>
            <span>➔</span>
          </button>
        </div>

      </section>
    </div>
  );
};

export default DialogueRoleplay;
