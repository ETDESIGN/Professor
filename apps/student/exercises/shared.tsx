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

/** A speaker button that plays an audio_url (or a text fallback via TTS). */
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
      className={`flex items-center justify-center rounded-2xl bg-duo-blue text-white shadow-md active:scale-95 transition-transform ${
        large ? 'w-20 h-20' : 'w-12 h-12'
      }`}
      aria-label="Play audio"
    >
      <Volume2 size={large ? 36 : 22} className={playing ? 'animate-pulse' : ''} />
    </button>
  );
};

/** Immediate feedback banner shown after a submit. */
export const FeedbackBanner: React.FC<{ feedback: Feedback }> = ({ feedback }) => {
  if (feedback === 'idle') return null;
  const correct = feedback === 'correct';
  return (
    <div
      className={`mt-4 rounded-2xl p-4 flex items-center gap-3 ${
        correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
      }`}
    >
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center text-white ${
          correct ? 'bg-green-500' : 'bg-red-500'
        }`}
      >
        {correct ? <Check size={20} strokeWidth={4} /> : <X size={20} strokeWidth={4} />}
      </div>
      <span className="font-bold text-lg">{correct ? 'Correct!' : 'Try again next time'}</span>
    </div>
  );
};

/** Option button base styling with correct/wrong reveal states. */
export function optionClasses(
  index: number,
  selected: number | null,
  correctIndex: number | null,
  revealed: boolean,
): string {
  if (!revealed) {
    return index === selected
      ? 'bg-duo-blue/20 border-2 border-duo-blue text-slate-800'
      : 'bg-white border-2 border-slate-200 text-slate-800 hover:border-duo-blue/60';
  }
  if (index === correctIndex) return 'bg-green-100 border-2 border-green-400 text-green-800';
  if (index === selected) return 'bg-red-100 border-2 border-red-300 text-red-700';
  return 'bg-slate-50 border-2 border-slate-200 text-slate-400';
}
