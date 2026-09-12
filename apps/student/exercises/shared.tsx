// Shared helpers for the Core-v1 exercise components. Keeps the 12 components
// thin + consistent: one-tap decisions, immediate feedback, self-completing via
// onComplete(result). Resolves the audit's "single-interaction, immediate
// feedback" Duolingo contract (replaces the parent-Check-button pattern).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, Check, X } from 'lucide-react';
import { playAudioUrl } from '../../../services/SpeechService';

export type Feedback = 'idle' | 'correct' | 'wrong';

/** Hook: track elapsed time from mount (for ExerciseResult.time_taken_ms). */
export function useElapsedMs(): () => number {
  const startedAt = useRef(Date.now());
  useEffect(() => { startedAt.current = Date.now(); }, []);
  return useCallback(() => Date.now() - startedAt.current, []);
}

/** Case/punctuation-insensitive comparison for free-typing exercises. */
export function normalizeForCompare(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/['`’]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function textMatches(input: string, accepted: string[]): boolean {
  const n = normalizeForCompare(input);
  if (!n) return false;
  return accepted.some((a) => normalizeForCompare(a) === n);
}

/** A speaker button that plays an audio_url (or a text fallback via TTS). Snapped to #1CB0F6. */
export const AudioButton: React.FC<{
  url?: string;
  fallbackText?: string;
  large?: boolean;
  onError?: (msg: string) => void;
}> = ({ url, fallbackText, large, onError }) => {
  const [playing, setPlaying] = useState(false);
  const handle = async () => {
    setPlaying(true);
    const ok = await playAudioUrl(url, fallbackText);
    if (!ok) onError?.('Audio unavailable');
    setTimeout(() => setPlaying(false), 600);
  };
  return (
    <button
      type="button"
      onClick={handle}
      className={`flex items-center justify-center rounded-2xl bg-[#1CB0F6] text-white shadow-[0_4px_0_#0284C7] active:translate-y-[2px] active:shadow-[0_2px_0_#0284C7] transition-transform cursor-pointer shrink-0 ${
        large ? 'w-[72px] h-[72px] shadow-[0_5px_0_#0284C7]' : 'w-12 h-12'
      }`}
      aria-label="Play audio"
    >
      <Volume2 size={large ? 36 : 22} className={playing ? 'animate-pulse' : ''} />
    </button>
  );
};

/** Immediate feedback banner shown after a submit (used by non-redesigned exercises). */
export const FeedbackBanner: React.FC<{ feedback: Feedback }> = ({ feedback }) => {
  if (feedback === 'idle') return null;
  const correct = feedback === 'correct';
  return (
    <div
      className={`mt-4 rounded-2xl p-4 flex items-center gap-3 border ${
        correct
          ? 'bg-[#E6F4F1] border-[#2A9D8F] text-[#1D3557]'
          : 'bg-[#FEF2F2] border-[#FF4B4B] text-[#991B1B]'
      }`}
    >
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center text-white ${
          correct ? 'bg-[#2A9D8F]' : 'bg-[#FF4B4B]'
        }`}
      >
        {correct ? <Check size={20} strokeWidth={3.5} /> : <X size={20} strokeWidth={3} />}
      </div>
      <span className="font-bold text-lg">{correct ? 'Nicely done!' : 'Try again next time'}</span>
    </div>
  );
};

/** Option button base styling with Wonder Atlas × Duolingo correct/wrong reveal states. */
export function optionClasses(
  index: number,
  selected: number | null,
  correctIndex: number | null,
  revealed: boolean,
): string {
  if (!revealed) {
    return index === selected
      ? 'bg-[#E6F4F1] border-2 border-[#2A9D8F] shadow-[0_4px_0_#1E6F5C] text-[#1D3557]'
      : 'bg-[#FDFBF7] border-2 border-[#E2D7C3] shadow-[0_4px_0_#E2D7C3] text-[#264653] hover:brightness-[1.02] active:translate-y-[2px] active:shadow-[0_2px_0_#E2D7C3]';
  }
  if (index === correctIndex) return 'bg-[#E6F4F1] border-2 border-[#2A9D8F] shadow-[0_4px_0_#1E6F5C] text-[#1D3557] ring-1 ring-[#2A9D8F]/30';
  if (index === selected) return 'bg-[#FEF2F2] border-2 border-[#FF4B4B] shadow-[0_4px_0_#DC2626] text-[#991B1B]';
  return 'bg-[#FDFBF7] border-2 border-[#E2D7C3] shadow-[0_4px_0_#E2D7C3] text-[#264653] opacity-40 cursor-not-allowed';
}
