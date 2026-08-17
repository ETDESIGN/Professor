// FastVocabHud — the shared chrome for both Fast Vocab surfaces: score pill,
// combo/streak pill meter, progress label + bar, and the circular timer ring.
// Purely presentational — all state lives in the turn controller / wrappers.

import React from 'react';
import { Flame } from 'lucide-react';

export interface FastVocabHudProps {
  /** Running score to display (omit to hide the pill). */
  score?: number;
  /** Consecutive correct answers (fills the combo pills, 🔥 at 3+). */
  streak: number;
  /** Max pills in the combo meter (default 5). */
  comboMax?: number;
  /** e.g. "Wave 2/4 · Match" or "Question 1/2". */
  progressLabel: string;
  /** 0..1 progress along the whole surface's arc. */
  progress: number;
  /** Countdown seconds left (omit to hide the ring). */
  timeRemaining?: number;
  /** Countdown length in seconds — drives the ring fraction + urgency color. */
  timeLimit?: number;
  /** Compact variant for the student app. */
  compact?: boolean;
}

const FastVocabHud: React.FC<FastVocabHudProps> = ({
  score,
  streak,
  comboMax = 5,
  progressLabel,
  progress,
  timeRemaining,
  timeLimit,
  compact = false,
}) => {
  const pill = compact ? 'w-5 h-2.5' : 'w-8 h-4';
  const ring = compact ? 36 : 56;
  const strokeWidth = compact ? 4 : 6;
  const r = (ring - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const frac = timeLimit && timeRemaining != null ? Math.max(0, Math.min(1, timeRemaining / timeLimit)) : 0;
  const urgent = timeRemaining != null && timeRemaining <= 3;
  const ringColor = urgent ? '#ef4444' : frac > 0.5 ? '#34d399' : '#fbbf24';

  return (
    <div className={`flex items-center gap-3 ${compact ? 'text-xs' : 'text-base'}`}>
      {score != null && (
        <div
          className={`${compact ? 'px-3 py-1 text-sm' : 'px-5 py-2.5 text-xl'} bg-slate-800/90 border border-slate-700 rounded-2xl font-black text-white tabular-nums`}
        >
          {score}
        </div>
      )}

      {/* Combo meter */}
      <div className={`${compact ? 'px-2.5 py-1.5' : 'px-4 py-2.5'} bg-slate-800/90 border border-slate-700 rounded-2xl flex items-center gap-2`}>
        <Flame size={compact ? 14 : 20} className={streak >= 3 ? 'text-orange-400' : 'text-slate-500'} />
        <div className="flex gap-1">
          {Array.from({ length: comboMax }, (_, i) => (
            <span
              key={i}
              className={`${pill} rounded-full transition-colors duration-200 ${
                i < streak
                  ? streak >= 3
                    ? 'bg-orange-400'
                    : 'bg-amber-300'
                  : 'bg-slate-700'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Progress */}
      <div className="flex-1 min-w-0">
        <div className={`${compact ? 'text-[10px]' : 'text-xs'} font-bold text-slate-400 uppercase tracking-wider truncate`}>
          {progressLabel}
        </div>
        <div className={`${compact ? 'h-1.5' : 'h-2.5'} w-full bg-slate-800 rounded-full overflow-hidden mt-1`}>
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 rounded-full transition-all duration-500"
            style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }}
          />
        </div>
      </div>

      {/* Timer ring */}
      {timeRemaining != null && timeLimit != null && (
        <div className="relative shrink-0" style={{ width: ring, height: ring }}>
          <svg width={ring} height={ring} className="-rotate-90">
            <circle cx={ring / 2} cy={ring / 2} r={r} fill="none" stroke="#1e293b" strokeWidth={strokeWidth} />
            <circle
              cx={ring / 2}
              cy={ring / 2}
              r={r}
              fill="none"
              stroke={ringColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - frac)}
              className="transition-all duration-1000 ease-linear"
            />
          </svg>
          <span
            className={`absolute inset-0 flex items-center justify-center font-black tabular-nums ${
              compact ? 'text-xs' : 'text-lg'
            } ${urgent ? 'text-red-400 animate-pulse' : 'text-white'}`}
          >
            {timeRemaining}
          </span>
        </div>
      )}
    </div>
  );
};

export default FastVocabHud;
