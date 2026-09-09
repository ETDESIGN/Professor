import React from 'react';
import { Play, Crown } from 'lucide-react';
import type { TerritoryTheme } from './territory';

// "New Territory" hero shown above the focus unit's path (Stitch screen_17):
// mascot glyph, territory name, tagline, lesson/crown chips, START button.
export function TerritoryIntro({ unit, theme, lessonsCount, crowns, isLocked, onStart }: {
  unit: { title: string; topic?: string };
  theme: TerritoryTheme;
  lessonsCount: number;
  crowns?: { current: number; total: number };
  isLocked?: boolean;
  onStart: () => void;
}) {
  return (
    <div className="mx-4 mt-4 rounded-wa-card bg-wa-paper border border-wa-border shadow-wa-card p-5">
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-2xl bg-wa-mist flex items-center justify-center text-4xl shrink-0">
          {theme.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-wa-display font-bold uppercase tracking-widest text-wa-teal">
            New Territory
          </span>
          <h2 className="font-wa-display font-bold text-xl text-wa-ink leading-tight">{unit.title}</h2>
          <p className="text-sm text-wa-muted mt-1">{theme.tagline}</p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs font-bold text-wa-ink bg-wa-mist px-2.5 py-1 rounded-full">
              📖 {lessonsCount} {lessonsCount === 1 ? 'lesson' : 'lessons'}
            </span>
            {crowns && crowns.total > 0 && (
              <span className="text-xs font-bold text-wa-inkDeep bg-wa-sand/25 px-2.5 py-1 rounded-full flex items-center gap-1">
                <Crown size={12} className="text-wa-sandDeep" /> {crowns.current}/{crowns.total}
              </span>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={onStart}
        disabled={isLocked}
        className="mt-4 w-full bg-wa-teal text-white font-wa-display font-bold py-3 rounded-2xl shadow-wa-btn-teal active:translate-y-0.5 active:shadow-none hover:brightness-105 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
      >
        <Play size={18} fill="currentColor" /> START!
      </button>
    </div>
  );
}

export default TerritoryIntro;
