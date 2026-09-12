// MINIMAL_PAIR_SWIPE — distinguish confusable minimal pairs (e.g. ship vs sheep).
// Upgraded per Stitch screens 17/1.html (auto-play listen state with replay meter)
// and 17/2.html (picked state, phoneme-contrast highlight, and Hear-Both drawer).
//
// Key UX behaviors (Audit & Owner approval):
// 1. Auto-play audio on mount so the acoustic contrast is heard immediately.
// 2. Listen-gated options during playback so the child listens before guessing.
// 3. Phoneme-contrast highlight: identifies and color-codes differing vowels/phonemes.
// 4. "Hear Both" auditory comparison console in feedback drawer allows side-by-side replay.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X, Volume2 } from 'lucide-react';
import { BaseExerciseProps } from '../../../types/exercise';
import { useElapsedMs, Feedback } from './shared';
import { playCue } from '../../board/templates/playCue';
import { playAudioUrl } from '../../../services/SpeechService';

// Helper: isolate contrasting phoneme segments between two words
function getPhonemeParts(word: string, otherWord: string) {
  const w1 = word.toLowerCase();
  const w2 = otherWord.toLowerCase();

  let prefixLen = 0;
  while (prefixLen < w1.length && prefixLen < w2.length && w1[prefixLen] === w2[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < (w1.length - prefixLen) &&
    suffixLen < (w2.length - prefixLen) &&
    w1[w1.length - 1 - suffixLen] === w2[w2.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const prefix = word.slice(0, prefixLen);
  const diff = word.slice(prefixLen, word.length - suffixLen);
  const suffix = word.slice(word.length - suffixLen);

  return { prefix, diff, suffix };
}

const MinimalPairSwipe: React.FC<BaseExerciseProps> = ({ data, onComplete, onError }) => {
  const { t } = useTranslation();
  const c = data.content as Extract<import('../../../types/exercise').ExerciseContent, { type: 'MINIMAL_PAIR_SWIPE' }>;
  const elapsed = useElapsedMs();

  const options = useMemo(() => {
    return c.options?.length ? c.options : (c.pair || []).map((w) => ({ text: w }));
  }, [c.options, c.pair]);

  const correctIndex = typeof c.correct_index === 'number' ? c.correct_index : 0;
  const targetWord = options[correctIndex]?.text || '';
  const otherWord = options[1 - correctIndex]?.text || '';

  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isListenGated, setIsListenGated] = useState(true);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-play audio on mount + gate options for 1.2s
  useEffect(() => {
    let mounted = true;
    const playInitial = async () => {
      setIsPlayingAudio(true);
      await playAudioUrl(c.audio_url, targetWord);
      if (mounted) {
        setIsPlayingAudio(false);
        setTimeout(() => {
          if (mounted) setIsListenGated(false);
        }, 300);
      }
    };
    playInitial();

    return () => {
      mounted = false;
      if (autoTimerRef.current !== null) clearTimeout(autoTimerRef.current);
    };
  }, [c.audio_url, targetWord]);

  const handlePlayPrompt = async () => {
    setIsPlayingAudio(true);
    await playAudioUrl(c.audio_url, targetWord);
    setTimeout(() => setIsPlayingAudio(false), 800);
  };

  const handleAdvance = (success: boolean) => {
    if (autoTimerRef.current !== null) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    onComplete({ success, time_taken_ms: elapsed(), attempts: 1 });
  };

  const handleSelect = (i: number) => {
    if (feedback !== 'idle' || isListenGated) return;
    setSelected(i);
    const correct = i === correctIndex;
    playCue(correct ? 'correct' : 'wrong');
    setFeedback(correct ? 'correct' : 'wrong');

    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      autoTimerRef.current = setTimeout(() => {
        handleAdvance(correct);
      }, 1100);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-[#EAE0D0] text-[#264653]">
      {/* Scrollable Canvas */}
      <div className="flex-1 flex flex-col px-4 pt-3 pb-36 overflow-y-auto space-y-3.5">
        
        {/* Central Sound Deck (Stitch 17-1) */}
        <section className="bg-[#FDFBF7] rounded-[26px] p-4 border-2 border-[#E2D7C3] shadow-[0_4px_0_#E2D7C3] text-center relative flex flex-col items-center">
          
          {/* Eyebrow & Status Row */}
          <div className="w-full flex items-center justify-between mb-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F7FE] border border-[#BAE6FD] text-[#1CB0F6] text-[11px] font-bold tracking-wide">
              <Volume2 size={13} />
              <span>PHONICS EAR TRAINING • 听音辨词</span>
            </div>

            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
              {isPlayingAudio ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                  <span>PLAYING</span>
                </>
              ) : (
                <span>READY</span>
              )}
            </div>
          </div>

          <h1 className="font-bold text-[22px] text-[#1D3557] mt-0.5 mb-1">
            {c.prompt || t('exercise.whichWordHeard', 'Which word did you hear?')}
          </h1>
          <p className="text-xs text-[#8C7A68] mb-2 font-semibold">
            仔细辨听元音差异 • Focus on the vowel sound
          </p>

          {/* Hero Speaker Button with Ripples */}
          <div className="relative w-36 h-36 flex items-center justify-center my-0.5">
            {isPlayingAudio && (
              <>
                <div className="absolute inset-0 rounded-full border-2 border-[#1CB0F6]/40 animate-ping pointer-events-none"></div>
                <div className="absolute -inset-2 rounded-full border-2 border-[#1CB0F6]/20 animate-pulse pointer-events-none"></div>
              </>
            )}

            <button
              type="button"
              onClick={handlePlayPrompt}
              className="relative z-10 w-20 h-20 rounded-full bg-[#1CB0F6] shadow-[0_5px_0_#0284C7] active:translate-y-[2px] active:shadow-[0_2px_0_#0284C7] flex items-center justify-center text-white cursor-pointer transition-transform"
              title="Play target sound"
              aria-label="Play audio"
            >
              <Volume2 size={38} className={isPlayingAudio ? 'animate-pulse' : ''} />
            </button>
          </div>

          {/* Replay Meter Pill (Audit F1) */}
          <div className="mt-1 w-full bg-[#F7F3E8] border border-[#E2D7C3] rounded-2xl py-2 px-3 flex items-center justify-between text-xs text-[#8C7A68] font-bold">
            <div className="flex items-center gap-1.5">
              <span>🎧</span>
              <span>Tap speaker to hear again</span>
            </div>
            {isListenGated && (
              <span className="text-[10px] font-extrabold text-[#E76F51] bg-[#FFF2ED] px-2 py-0.5 rounded-full border border-[#FCD5C7] animate-pulse">
                Listening...
              </span>
            )}
          </div>
        </section>

        {/* Phoneme Contrast Pair Cards Stage */}
        <section className="flex flex-col gap-3" aria-label="Option cards">
          {options.map((opt, i) => {
            const isSelected = selected === i;
            const isCorrect = i === correctIndex;
            const otherOpt = options[1 - i] || { text: '' };
            const { prefix, diff, suffix } = getPhonemeParts(opt.text, otherOpt.text);
            const badgeLetter = String.fromCharCode(65 + i);

            let cardClasses = 'bg-[#FDFBF7] border-2 border-[#E2D7C3] shadow-[0_4px_0_#E2D7C3]';
            if (feedback !== 'idle') {
              if (isCorrect) {
                cardClasses = 'bg-[#E6F4F1] border-[3px] border-[#2A9D8F] shadow-[0_4px_0_#1E6F5C] -translate-y-0.5';
              } else if (isSelected) {
                cardClasses = 'bg-[#FEF2F2] border-[3px] border-[#FF4B4B] shadow-[0_4px_0_#DC2626]';
              } else {
                cardClasses = 'bg-[#FDFBF7] border-2 border-[#E2D7C3] opacity-50';
              }
            } else if (isListenGated) {
              cardClasses = 'bg-[#FDFBF7] border-2 border-[#E2D7C3] opacity-80 cursor-wait';
            }

            return (
              <button
                key={i}
                type="button"
                onClick={() => handleSelect(i)}
                disabled={feedback !== 'idle' || isListenGated}
                className={`w-full rounded-2xl p-4 flex items-center justify-between text-left transition-all relative ${cardClasses}`}
              >
                {/* Status Badges */}
                {feedback !== 'idle' && isCorrect && (
                  <div className="absolute -top-2.5 -right-2 bg-[#2A9D8F] text-white rounded-full p-1 border-2 border-[#FDFBF7] shadow-md flex items-center justify-center w-7 h-7">
                    <Check size={16} strokeWidth={3.5} />
                  </div>
                )}
                {feedback !== 'idle' && isSelected && !isCorrect && (
                  <div className="absolute -top-2.5 -right-2 bg-[#FF4B4B] text-white rounded-full p-1 border-2 border-[#FDFBF7] shadow-md flex items-center justify-center w-7 h-7">
                    <X size={16} strokeWidth={3.5} />
                  </div>
                )}

                <div className="flex items-center gap-3.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shadow-xs ${
                    feedback !== 'idle' && isCorrect
                      ? 'bg-[#2A9D8F] text-white'
                      : 'bg-[#F7F3E8] border border-[#E2D7C3] text-[#8C7A68]'
                  }`}>
                    {badgeLetter}
                  </div>

                  <div>
                    {/* Headword with Phoneme Contrast Highlighting (Audit F3) */}
                    <div className="text-2xl font-bold tracking-wide flex items-baseline">
                      <span className="text-[#1D3557]">{prefix}</span>
                      {diff ? (
                        <span className={`px-1 rounded mx-0.5 font-black underline decoration-[3px] underline-offset-4 ${
                          isCorrect
                            ? 'text-[#E76F51] bg-[#E76F51]/10 decoration-[#E76F51]'
                            : 'text-amber-700 bg-[#E9C46A]/25 decoration-amber-500'
                        }`}>
                          {diff}
                        </span>
                      ) : null}
                      <span className="text-[#1D3557]">{suffix}</span>
                    </div>

                    <div className="text-xs font-semibold text-[#8C7A68] mt-0.5">
                      {isCorrect && feedback !== 'idle' ? 'Correct Sound Match' : `Option ${badgeLetter}`}
                    </div>
                  </div>
                </div>

                <div className="w-8 h-8 rounded-xl bg-[#F7F3E8] border border-[#E2D7C3] flex items-center justify-center text-[#8C7A68]">
                  <Volume2 size={16} />
                </div>
              </button>
            );
          })}
        </section>

      </div>

      {/* "HEAR BOTH" AUDITORY COMPARISON CONSOLE DRAWER (Audit P1 F5, Stitch 17-2) */}
      {feedback !== 'idle' && (
        <div className="absolute bottom-0 inset-x-0 bg-[#FDFBF7] rounded-t-[30px] border-t-2 border-[#2A9D8F] px-4 pt-3.5 pb-5 shadow-2xl z-30 flex flex-col gap-2.5">
          <div className="w-10 h-1 bg-[#E2D7C3] rounded-full mx-auto -mt-1 opacity-70"></div>

          {/* Professor Owl's Ear Tip */}
          <div className="flex items-start gap-2.5 bg-[#F7F3E8] p-2.5 rounded-2xl border border-[#E2D7C3]">
            <div className="w-9 h-9 rounded-full bg-[#FEF3C7] border border-[#E9C46A] flex items-center justify-center text-lg shrink-0 shadow-xs">
              🦉
            </div>
            <div className="flex-1 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-[#1D3557]">
                <span>PROFESSOR OWL'S EAR TIP</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#E9C46A] text-[#1D3557] font-bold">
                  ACOUSTIC
                </span>
              </div>
              <p className="text-[#264653] leading-snug mt-0.5">
                Notice the difference? Tap each button below to contrast the sounds!
              </p>
            </div>
          </div>

          {/* Dual Replay Audio Comparison Pills */}
          <div className="grid grid-cols-2 gap-2">
            {options.map((opt, i) => {
              const isOptCorrect = i === correctIndex;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => playAudioUrl(isOptCorrect ? c.audio_url : undefined, opt.text)}
                  className={`w-full py-2.5 px-2 rounded-2xl border flex flex-col items-center justify-center shadow-sm active:scale-95 transition-transform ${
                    isOptCorrect
                      ? 'bg-[#E8F8F5] border-[#2A9D8F]/50 text-[#2A9D8F]'
                      : 'bg-[#F7F3E8] border-[#E2D7C3] text-[#1D3557]'
                  }`}
                >
                  <div className="flex items-center gap-1 text-xs font-bold">
                    <span>🔊</span>
                    <span>Hear ‘{opt.text}’</span>
                  </div>
                  <span className="text-[10px] font-semibold text-[#8C7A68] mt-0.5">
                    {isOptCorrect ? 'Target Sound' : 'Foil Sound'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Primary Action CTA */}
          <button
            type="button"
            onClick={() => handleAdvance(feedback === 'correct')}
            className="w-full h-[52px] bg-[#2A9D8F] hover:bg-[#24897D] text-white font-bold text-base tracking-wide rounded-2xl shadow-[0_4px_0_#1E6F5C] active:translate-y-[2px] active:shadow-[0_1px_0_#1E6F5C] flex items-center justify-center gap-2 transition-transform cursor-pointer"
          >
            <span>CONTINUE (NEXT PAIR)</span>
            <span className="text-lg leading-none">➔</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default MinimalPairSwipe;
