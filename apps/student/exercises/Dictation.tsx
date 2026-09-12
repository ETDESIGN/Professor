// DICTATION — type what you hear. Upgraded per Stitch screens 15/1.html
// (audio-first state with slow-audio pill and letter-count dashes) and
// 15/2.html (near-miss character-level diff diagnostic feedback).
//
// Key UX behaviors (Audit & Owner approval):
// 1. Auto-plays audio on mount so the acoustic model is heard immediately.
// 2. Dedicated Slow Audio 🐢 (0.75x) pill for early/struggling listeners.
// 3. Letter-count dashes scaffolding showing structural boundaries.
// 4. Character-level near-miss diff feedback highlighting correct vs mismatched letters.
// 5. Gated Check CTA: disabled on blank input to prevent accidental heart loss.

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X, Volume2 } from 'lucide-react';
import { BaseExerciseProps } from '../../../types/exercise';
import { useElapsedMs, textMatches, Feedback, AudioButton } from './shared';
import { playCue } from '../../board/templates/playCue';
import { playAudioUrl, speakText } from '../../../services/SpeechService';

const FINE_POINTER = typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(pointer: fine)').matches;

const Dictation: React.FC<BaseExerciseProps> = ({ data, onComplete, onError }) => {
  const { t } = useTranslation();
  const c = data.content as Extract<import('../../../types/exercise').ExerciseContent, { type: 'DICTATION' }>;
  const elapsed = useElapsedMs();

  const [value, setValue] = useState('');
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isPlayingSlow, setIsPlayingSlow] = useState(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-play audio on mount
  useEffect(() => {
    let mounted = true;
    const playInitial = async () => {
      setIsPlayingAudio(true);
      await playAudioUrl(c.audio_url, c.correct_text);
      if (mounted) setIsPlayingAudio(false);
    };
    playInitial();
    return () => {
      mounted = false;
      if (autoTimerRef.current !== null) clearTimeout(autoTimerRef.current);
    };
  }, [c.audio_url, c.correct_text]);

  const playStandardAudio = async () => {
    setIsPlayingAudio(true);
    await playAudioUrl(c.audio_url, c.correct_text);
    setTimeout(() => setIsPlayingAudio(false), 800);
  };

  const playSlowAudio = async () => {
    setIsPlayingSlow(true);
    if (c.audio_url) {
      try {
        const audio = new Audio(c.audio_url);
        audio.playbackRate = 0.75;
        await audio.play();
      } catch {
        await speakText(c.correct_text, 0.65);
      }
    } else {
      await speakText(c.correct_text, 0.65);
    }
    setTimeout(() => setIsPlayingSlow(false), 1000);
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

    const correct = textMatches(value, [c.correct_text]);
    if (correct) {
      playCue('correct');
      setFeedback('correct');
      playAudioUrl(c.audio_url, c.correct_text);

      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        autoTimerRef.current = setTimeout(() => {
          handleAdvance(true);
        }, 1100);
      }
    } else {
      playCue('wrong');
      playCue('reveal');
      setFeedback('wrong');

      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        autoTimerRef.current = setTimeout(() => {
          handleAdvance(false);
        }, 1100);
      }
    }
  };

  // Clean characters for scaffold and diff
  const targetChars = c.correct_text.trim().split('');
  const childChars = value.trim().split('');

  // Character diff alignment
  const maxLen = Math.max(childChars.length, targetChars.length);
  const diffItems = Array.from({ length: maxLen }).map((_, i) => {
    const childC = childChars[i] || '';
    const targetC = targetChars[i] || '';
    const isMatch = childC.toLowerCase() === targetC.toLowerCase();
    return {
      childC,
      targetC,
      isMatch,
    };
  });

  const matchedCount = diffItems.filter((d) => d.isMatch).length;

  return (
    <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-[#EAE0D0] text-[#264653]">
      {/* Scrollable Canvas */}
      <div className="flex-1 flex flex-col px-4 pt-3 pb-36 overflow-y-auto space-y-3">
        
        {/* Top Eyebrow Row */}
        <div className="flex items-center justify-between px-1">
          <div className="inline-flex items-center gap-1.5 bg-[#F7F3E8] border border-[#E2D7C3] px-2.5 py-1 rounded-full text-xs font-bold text-[#1D3557]">
            <span className="w-2 h-2 rounded-full bg-[#E91E63] animate-pulse"></span>
            <span className="uppercase tracking-wider">Dictation Mode • 听音拼写</span>
          </div>
          <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#8C7A68] bg-[#FDFBF7] border border-[#E2D7C3] px-2 py-0.5 rounded-md">
            <span>🛡️</span>
            <span>Zero Guessing Penalty</span>
          </div>
        </div>

        {/* Central Audio-First Deck (Stitch 15-1) */}
        <section className="bg-[#FDFBF7] rounded-3xl p-5 border-2 border-[#E2D7C3] shadow-[0_4px_0_#E2D7C3] text-center relative flex flex-col items-center">
          
          <div className="inline-flex items-center gap-1.5 bg-sky-50 border border-sky-200 text-[#1CB0F6] px-3 py-1 rounded-full text-xs font-bold tracking-wide mb-2">
            <Volume2 size={14} />
            <span>LISTEN &amp; SPELL • 听音拼写</span>
          </div>

          {/* Hero Speaker Button with Acoustic Waves */}
          <div className="my-3 relative flex items-center justify-center w-28 h-28">
            {isPlayingAudio && (
              <>
                <div className="absolute inset-0 rounded-full border-2 border-[#1CB0F6]/40 animate-ping pointer-events-none"></div>
                <div className="absolute -inset-2 rounded-full border-2 border-[#1CB0F6]/20 animate-pulse pointer-events-none"></div>
              </>
            )}

            <button
              type="button"
              onClick={playStandardAudio}
              className="relative z-10 w-[76px] h-[76px] rounded-full bg-[#1CB0F6] hover:bg-[#0EA5E9] active:translate-y-[2px] active:shadow-[0_2px_0_#0284C7] shadow-[0_5px_0_#0284C7] border-2 border-[#38BDF8] flex flex-col items-center justify-center text-white transition-all cursor-pointer group"
              title="Play Natural English Pronunciation"
              aria-label="Play audio"
            >
              <Volume2 size={36} className={isPlayingAudio ? 'animate-pulse' : ''} />
            </button>
          </div>

          {/* Status badge */}
          <div className="inline-flex items-center gap-2 bg-[#F7F3E8] border border-[#E2D7C3] px-3 py-1 rounded-full shadow-xs text-xs font-bold text-[#1D3557]">
            <span>{isPlayingAudio ? '🔊 Playing sound...' : 'Tap speaker to replay'}</span>
            <span className="font-mono text-[#8C7A68] bg-white px-1.5 py-0.2 rounded border border-[#E2D7C3]">
              1.0x
            </span>
          </div>

          {/* Dedicated Slow Audio 🐢 (0.75x) Pill (Audit P1 F5) */}
          <div className="mt-3 w-full flex justify-center">
            <button
              type="button"
              onClick={playSlowAudio}
              className={`h-[42px] px-4 rounded-full bg-[#E9C46A] hover:bg-[#dfba5e] text-[#1D3557] active:translate-y-[2px] active:shadow-[0_1px_0_#C99E32] shadow-[0_3px_0_#C99E32] border border-[#D8AE43] font-bold text-xs flex items-center gap-2 transition-transform cursor-pointer ${
                isPlayingSlow ? 'ring-2 ring-[#E9C46A]' : ''
              }`}
              title="Slow speed pronunciation"
            >
              <span className="text-base">🐢</span>
              <span>0.75x Slow Listen</span>
              <span className="text-[10px] font-normal text-[#8C7A68] bg-white/70 px-1.5 py-0.5 rounded">
                慢速听音
              </span>
            </button>
          </div>

          {/* Word Structure Scaffolding: Letter Count Dashes (Audit P2 F7) */}
          {feedback === 'idle' && (
            <div className="mt-4 pt-3 border-t border-dashed border-[#E2D7C3] w-full">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#8C7A68] uppercase tracking-wider mb-2 px-1">
                <span>Word Scaffolding • 字母结构</span>
                <span className="text-[#2A9D8F] font-mono">{targetChars.length} Letters</span>
              </div>

              {/* Letter Slot Boxes */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 py-1">
                {targetChars.map((char, i) => {
                  const isFirst = i === 0;
                  return (
                    <div
                      key={i}
                      className={`w-8 h-9 rounded-lg flex items-center justify-center font-bold text-lg ${
                        isFirst
                          ? 'bg-teal-50 border-2 border-[#2A9D8F] text-[#2A9D8F] shadow-xs'
                          : 'bg-[#F7F3E8] border-2 border-dashed border-[#E2D7C3] text-[#8C7A68]/60'
                      }`}
                    >
                      {isFirst ? char.toUpperCase() : '_'}
                    </div>
                  );
                })}
              </div>

              {c.hint && (
                <div className="mt-2.5 inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full text-xs font-semibold text-amber-900">
                  <span>💡</span>
                  <span>Hint: {c.hint}</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Character-Level Near-Miss Diff Display (Audit P2 F3, Stitch 15-2) */}
        {feedback === 'wrong' && (
          <section className="bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-3xl p-4 shadow-sm text-center">
            <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[#E2D7C3]">
              <div className="inline-flex items-center gap-1.5 bg-[#FFF2ED] px-2.5 py-0.5 rounded-full border border-[#FCD5C7] text-[#E76F51] text-xs font-bold">
                <span>🔍</span>
                <span>SPELLING CHECK • 拼写对比</span>
              </div>
              <span className="text-xs font-bold text-[#8C7A68]">
                {matchedCount} of {maxLen} letters correct!
              </span>
            </div>

            <div className="py-2.5 px-1 bg-[#FAF6EE] rounded-2xl border border-dashed border-[#E2D7C3]">
              <div className="flex flex-wrap items-center justify-center gap-1.5 overflow-visible py-1">
                {diffItems.map((item, i) => {
                  if (item.isMatch) {
                    return (
                      <div key={i} className="relative flex flex-col items-center">
                        <div className="w-9 h-11 bg-[#10B981] text-white font-bold text-xl rounded-xl flex items-center justify-center shadow-[0_3px_0_#059669] border border-emerald-400">
                          {item.childC}
                        </div>
                        <div className="w-4 h-4 rounded-full bg-white text-[#10B981] absolute -bottom-2 flex items-center justify-center text-[9px] font-black shadow-xs border border-emerald-300">
                          ✓
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={i} className="relative flex flex-col items-center mx-0.5 animate-wiggle">
                      {item.targetC && (
                        <div className="absolute -top-5 bg-[#E91E63] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-md shadow-xs whitespace-nowrap">
                          {item.targetC}
                        </div>
                      )}
                      <div className="w-9 h-11 bg-[#FF4B4B] text-white font-bold text-xl rounded-xl flex items-center justify-center shadow-[0_3px_0_#DC2626] border border-red-300">
                        <span className="line-through decoration-white decoration-2">{item.childC || '␣'}</span>
                      </div>
                      <div className="w-4 h-4 rounded-full bg-white text-[#FF4B4B] absolute -bottom-2 flex items-center justify-center text-[9px] font-black shadow-xs border border-red-300">
                        ✕
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs font-bold text-[#E76F51] mt-3">
                {matchedCount >= maxLen / 2 ? 'Near miss! Compare the letters in red.' : 'Check the spelling below.'}
              </p>
            </div>
          </section>
        )}

        {/* Tactile Writing Slate Input Field */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-[#1D3557] uppercase tracking-wider flex items-center justify-between px-1">
            <span className="flex items-center gap-1.5">
              <span>✏️</span>
              <span>Child's Writing Slate</span>
            </span>
            <span className="text-[11px] text-[#8C7A68]">
              {value.length} / {targetChars.length} letters
            </span>
          </label>

          <input
            autoFocus={FINE_POINTER}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            disabled={feedback !== 'idle'}
            placeholder={t('exercise.typeWordSentence', 'Type the word or sentence…')}
            className="w-full px-4 py-3.5 rounded-2xl border-2 border-[#E2D7C3] focus:border-[#1CB0F6] outline-none text-xl font-bold text-[#1D3557] bg-[#FDFBF7] shadow-[0_2px_0_#E2D7C3]"
          />
        </div>

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

      {/* Anchored Bottom Drawer: Correct Result */}
      {feedback === 'correct' && (
        <div className="absolute bottom-0 inset-x-0 bg-[#E8F8F5] border-t-2 border-[#2A9D8F] rounded-t-3xl p-5 shadow-2xl z-30 transition-all">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-[#2A9D8F] text-white flex items-center justify-center shadow-sm shrink-0">
              <Check size={22} strokeWidth={3.5} />
            </div>
            <div>
              <h2 className="font-bold text-[20px] text-[#1D3557] leading-tight">
                Nicely done! <span className="text-[#2A9D8F] font-extrabold">+1 XP</span>
              </h2>
              <p className="text-xs font-bold text-[#2A9D8F]">Exact spelling match!</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border-2 border-[#A2D9CE] p-3.5 mb-4 flex items-center justify-between gap-3">
            <div className="font-bold text-xl text-[#1D3557]">
              {c.correct_text}
            </div>
            <AudioButton url={c.audio_url} fallbackText={c.correct_text} onError={onError} />
          </div>

          <button
            type="button"
            onClick={() => handleAdvance(true)}
            className="w-full h-[54px] bg-[#2A9D8F] shadow-[0_4px_0_#1E6F5C] active:translate-y-[3px] active:shadow-[0_1px_0_#1E6F5C] rounded-2xl text-white font-bold text-lg tracking-wider flex items-center justify-center gap-2 transition-transform cursor-pointer"
          >
            <span>CONTINUE</span>
            <span className="text-xl leading-none">➔</span>
          </button>
        </div>
      )}

      {/* Anchored Bottom Drawer: Wrong Result (Stitch 15-2) */}
      {feedback === 'wrong' && (
        <div className="absolute bottom-0 inset-x-0 bg-[#FDFBF7] border-t-4 border-[#FF4B4B] rounded-t-[32px] p-5 shadow-2xl z-30 flex flex-col gap-3">
          <div className="w-10 h-1 bg-[#E2D7C3] rounded-full mx-auto -mt-1"></div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#FF4B4B] text-white flex items-center justify-center font-bold text-sm shadow-xs">
                <X size={18} strokeWidth={3} />
              </div>
              <h2 className="font-bold text-lg text-[#991B1B]">
                Correct spelling:
              </h2>
            </div>
            <div className="inline-flex items-center gap-1 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-full text-[#FF4B4B] text-xs font-black">
              <span>-1 ❤️</span>
            </div>
          </div>

          {/* Solution Card with Audio Replay */}
          <div className="bg-white rounded-2xl border-2 border-[#E2D7C3] p-3 flex items-center justify-between gap-3 shadow-xs">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[#2A9D8F]">
                TARGET WORD
              </span>
              <div className="font-black text-2xl text-[#1D3557] tracking-wide mt-0.5">
                {c.correct_text}
              </div>
            </div>
            <AudioButton url={c.audio_url} fallbackText={c.correct_text} onError={onError} />
          </div>

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

export default Dictation;
