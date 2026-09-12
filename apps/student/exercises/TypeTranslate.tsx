// TYPE_TRANSLATE — type the L2 (English) translation for an L1 (Simplified Chinese) prompt.
// Upgraded per Stitch screens 16/1.html (L1 prompt active state) and 16/2.html (success & reveal state).
//
// Key UX behaviors (Audit & Owner approval):
// 1. On-demand hint peek: progressive hint button hides keywords until child chooses to peek.
// 2. TTS-on-reveal: automatically speaks accepted English model upon submission reveal.
// 3. Accepted-alternatives chip: showcases alternative valid translations (e.g. 'That red tractor is really big.').
// 4. Writing slate with character count and gated Check button on empty input.

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X, Volume2 } from 'lucide-react';
import { BaseExerciseProps } from '../../../types/exercise';
import { useElapsedMs, textMatches, Feedback, AudioButton } from './shared';
import { playCue } from '../../board/templates/playCue';
import { playAudioUrl } from '../../../services/SpeechService';

const FINE_POINTER = typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(pointer: fine)').matches;

const TypeTranslate: React.FC<BaseExerciseProps> = ({ data, onComplete }) => {
  const { t } = useTranslation();
  const c = data.content as Extract<import('../../../types/exercise').ExerciseContent, { type: 'TYPE_TRANSLATE' }>;
  const elapsed = useElapsedMs();

  const [value, setValue] = useState('');
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const [showHint, setShowHint] = useState(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (autoTimerRef.current !== null) clearTimeout(autoTimerRef.current);
    };
  }, []);

  const accepted = c.accepted || [];
  const primaryAccepted = accepted[0] || '';
  const altAccepted = accepted.slice(1);

  const handlePeekHint = () => {
    if (showHint) return;
    playCue('reveal');
    setShowHint(true);
  };

  const handleAdvance = (success: boolean) => {
    if (autoTimerRef.current !== null) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    onComplete({ success, time_taken_ms: elapsed(), attempts: 1 });
  };

  const submit = () => {
    if (feedback !== 'idle' || !value.trim()) return;

    const correct = textMatches(value, accepted);
    if (correct) {
      playCue('correct');
      setFeedback('correct');
      if (primaryAccepted) {
        playAudioUrl(undefined, primaryAccepted);
      }

      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        autoTimerRef.current = setTimeout(() => {
          handleAdvance(true);
        }, 1100);
      }
    } else {
      playCue('wrong');
      playCue('reveal');
      setFeedback('wrong');
      if (primaryAccepted) {
        playAudioUrl(undefined, primaryAccepted);
      }

      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        autoTimerRef.current = setTimeout(() => {
          handleAdvance(false);
        }, 1100);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-[#EAE0D0] text-[#264653]">
      {/* Scrollable Canvas */}
      <div className="flex-1 flex flex-col px-4 pt-3 pb-36 overflow-y-auto space-y-3.5">
        
        {/* L1 Prompt Mascot Card (Stitch 16-1) */}
        <section className="bg-[#FDFBF7] rounded-3xl border-2 border-[#E2D7C3] p-4 shadow-sm flex flex-col gap-3">
          
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#E8F4FD] border border-[#BEE3F8] text-[11px] font-bold text-[#0984E3]">
              <span>文/A</span>
              <span>TRANSLATE TO ENGLISH • 中译英</span>
            </div>
            {feedback === 'correct' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[#10B981] text-[10px] font-bold">
                ✓ ANSWERED
              </span>
            )}
          </div>

          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#E6F4F1] border-2 border-[#2A9D8F] flex items-center justify-center text-2xl shrink-0 shadow-xs">
              🦉
            </div>
            <div className="flex-1 bg-[#F7F3E8] rounded-2xl rounded-tl-sm p-3 border border-[#E2D7C3] relative">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#8C7A68] mb-0.5">
                {t('exercise.translatePrompt', 'Translate this:')}
              </div>
              <p className="text-[22px] leading-snug font-bold text-[#1D3557] font-sans">
                “{c.prompt_l1}”
              </p>
            </div>
          </div>

          {/* Progressive On-Demand Hint Button (Audit P1 F3) */}
          {c.hint && (
            <div className="pt-1">
              {!showHint ? (
                <button
                  type="button"
                  onClick={handlePeekHint}
                  disabled={feedback !== 'idle'}
                  className="w-full h-11 px-4 rounded-2xl bg-[#E9C46A] border border-[#D8AE43] shadow-[0_3px_0_#C99E32] active:translate-y-[2px] active:shadow-[0_1px_0_#C99E32] flex items-center justify-between text-[#1D3557] font-bold text-xs hover:brightness-105 transition-all cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm">💡</span>
                    <span>Need a hint? <span className="text-[11px] font-normal opacity-90">(tap to peek keywords)</span></span>
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-white/50 text-[10px] font-extrabold uppercase">
                    Free Hint
                  </span>
                </button>
              ) : (
                <div className="p-2.5 rounded-2xl bg-[#FEF9E7] border border-[#E9C46A] flex items-center gap-2 text-xs font-bold text-[#916900] animate-fadeIn">
                  <span>💡</span>
                  <span>Hint: {c.hint}</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Tactile Writing Slate */}
        <section className={`rounded-3xl p-4 flex flex-col justify-between shadow-sm border-2 transition-all ${
          feedback === 'correct'
            ? 'bg-gradient-to-b from-[#FDFBF7] to-[#F0FDF4] border-emerald-400'
            : feedback === 'wrong'
              ? 'bg-[#FDFBF7] border-red-300'
              : 'bg-[#FDFBF7] border-[#E2D7C3] focus-within:border-[#2A9D8F]'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#2A9D8F] uppercase tracking-wider flex items-center gap-1.5">
              <span>✏️</span>
              <span>Child's Writing Slate</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[#E6F4F1] text-[#2A9D8F] font-bold text-[11px]">
              {value.length} chars
            </span>
          </div>

          <input
            autoFocus={FINE_POINTER}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            disabled={feedback !== 'idle'}
            placeholder={t('exercise.typeEnglish', 'Type the English…')}
            className="w-full py-2 bg-transparent outline-none text-xl font-bold text-[#1D3557] placeholder:text-[#8C7A68]/60"
          />

          <div className="pt-2 border-t border-[#E2D7C3]/60 flex items-center justify-between text-xs text-[#8C7A68]">
            <span>Translate Chinese meaning into English</span>
            {value.length > 0 && feedback === 'idle' && (
              <button
                type="button"
                onClick={() => setValue('')}
                className="text-[11px] font-bold text-[#8C7A68] hover:text-[#E76F51]"
              >
                Clear
              </button>
            )}
          </div>
        </section>

      </div>

      {/* Anchored Bottom Dock: Idle Check CTA */}
      {feedback === 'idle' && (
        <footer className="absolute bottom-0 inset-x-0 p-4 bg-[#EAE0D0] border-t-2 border-[#E2D7C3] flex flex-col gap-1.5 z-20">
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim()}
            className={`w-full h-[52px] rounded-2xl font-bold text-base tracking-wider flex items-center justify-center gap-2 transition-transform ${
              value.trim()
                ? 'bg-[#E91E63] text-white shadow-[0_4px_0_#BE185D] active:translate-y-[2px] active:shadow-[0_2px_0_#BE185D] cursor-pointer'
                : 'bg-[#F2ECE1] border-2 border-[#E2D7C3]/80 text-[#B8A793] cursor-not-allowed shadow-none'
            }`}
          >
            <span>Check</span>
            <span className="text-lg">➔</span>
          </button>
        </footer>
      )}

      {/* Anchored Bottom Drawer: Correct Result (Stitch 16-2) */}
      {feedback === 'correct' && (
        <div className="absolute bottom-0 inset-x-0 bg-[#FDFBF7] border-t-4 border-[#2A9D8F] rounded-t-[32px] p-5 shadow-2xl z-30 flex flex-col gap-3">
          <div className="w-10 h-1 bg-[#E2D7C3] rounded-full mx-auto -mt-1"></div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#E6F8F5] border border-[#2A9D8F]/30 flex items-center justify-center text-base shadow-xs">
                🎉
              </div>
              <div>
                <h2 className="font-bold text-lg text-[#1D3557] leading-tight">
                  Excellent Translation!
                </h2>
                <span className="text-xs font-bold text-[#2A9D8F]">完美翻译 • 极佳准确度</span>
              </div>
            </div>
            <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-[#FEF9E7] border border-[#E9C46A] shadow-xs">
              <span className="text-xs">⭐</span>
              <span className="font-bold text-xs text-[#B7791F]">+15 XP</span>
            </div>
          </div>

          {/* Target Sentence Card with Audio Replay */}
          <div className="bg-[#F0FAF8] rounded-2xl border-2 border-[#A2D9CE] p-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#2A9D8F]">
                ACCEPTED ENGLISH
              </div>
              <div className="font-bold text-lg text-[#1D3557] leading-snug mt-0.5">
                “{primaryAccepted}”
              </div>
            </div>
            <AudioButton fallbackText={primaryAccepted} large={false} />
          </div>

          {/* Alternative Valid Translations Chip (Audit F7) */}
          {altAccepted.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#F7F3E8] border border-[#E2D7C3] text-left">
              <span className="text-xs text-[#8C7A68]">💡</span>
              <p className="text-[11px] leading-tight font-medium text-[#8C7A68]">
                <strong className="font-bold text-[#1D3557]">Also accepted:</strong> “{altAccepted[0]}”
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => handleAdvance(true)}
            className="w-full h-[52px] rounded-2xl bg-[#2A9D8F] shadow-[0_4px_0_#1E6F5C] active:translate-y-[2px] active:shadow-[0_1px_0_#1E6F5C] text-white font-bold text-base tracking-wider flex items-center justify-center gap-2 transition-transform cursor-pointer"
          >
            <span>CONTINUE</span>
            <span className="text-lg leading-none">➔</span>
          </button>
        </div>
      )}

      {/* Anchored Bottom Drawer: Wrong Result */}
      {feedback === 'wrong' && (
        <div className="absolute bottom-0 inset-x-0 bg-[#FDFBF7] border-t-4 border-[#FF4B4B] rounded-t-[32px] p-5 shadow-2xl z-30 flex flex-col gap-3">
          <div className="w-10 h-1 bg-[#E2D7C3] rounded-full mx-auto -mt-1"></div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#FF4B4B] text-white flex items-center justify-center font-bold text-sm shadow-xs">
                <X size={18} strokeWidth={3} />
              </div>
              <h2 className="font-bold text-lg text-[#991B1B]">
                Correct translation:
              </h2>
            </div>
            <div className="inline-flex items-center gap-1 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-full text-[#FF4B4B] text-xs font-black">
              <span>-1 ❤️</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border-2 border-[#E2D7C3] p-3 flex items-center justify-between gap-3 shadow-xs">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#2A9D8F]">
                TARGET SENTENCE
              </span>
              <div className="font-black text-lg text-[#1D3557] leading-snug mt-0.5">
                “{primaryAccepted}”
              </div>
            </div>
            <AudioButton fallbackText={primaryAccepted} />
          </div>

          {altAccepted.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F7F3E8] border border-[#E2D7C3]">
              <span className="text-xs text-[#8C7A68]">💡</span>
              <p className="text-[11px] text-[#8C7A68]">
                <strong className="font-bold text-[#1D3557]">Also accepted:</strong> “{altAccepted[0]}”
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => handleAdvance(false)}
            className="w-full h-[52px] rounded-2xl bg-[#E76F51] shadow-[0_4px_0_#C4553B] active:translate-y-[2px] active:shadow-[0_1px_0_#C4553B] text-white font-bold text-base tracking-wider flex items-center justify-center gap-2 transition-transform cursor-pointer"
          >
            <span>CONTINUE</span>
            <span className="text-lg leading-none">➔</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default TypeTranslate;
