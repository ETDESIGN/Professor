// BoardUnitIntro — the UNIT intro slide (slide 0 of every flow, type
// INTRO_SPLASH). Shows the unit's generated cover art (units.cover_image via
// activeUnit.coverImage) full-bleed with the unit title — replacing the team
// battle splash that used to render here (owner decision 2026-09-04: the
// team screen belongs to team-game starts, not unit intros; it now lives
// under the TEAM_SPLASH type, untouched, and is insertable from PlanComposer).
//
// Data contract (all optional — every field falls back to the active unit):
//   data.title    — unit title (orchestrated flows put it here)
//   data.subtitle — topic / lesson summary
//   data.theme    — unit theme chip (PlanComposer autoBuild sets it)
// The cover is read at RENDER time from the session's activeUnit so cover
// re-generation propagates without re-orchestrating the flow. Units without
// cover art (illustration backfill pending) get the gradient + monogram
// fallback.

import React from 'react';
import { BookOpen } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

const BoardUnitIntro = ({ data }: { data: any }) => {
  const { state } = useSession();
  const unit: any = state.activeUnit;

  const cover = typeof unit?.coverImage === 'string' && /^https?:/.test(unit.coverImage)
    ? unit.coverImage
    : (typeof data?.cover_url === 'string' ? data.cover_url : '');
  const title = data?.title || unit?.title || 'Lesson';
  const subtitle = data?.subtitle || unit?.topic || '';
  const theme = data?.theme || '';
  const monogram = (title || 'L').trim().charAt(0).toUpperCase();

  return (
    <div className="h-full w-full relative overflow-hidden bg-slate-950 text-white font-display">
      {/* Cover layer */}
      {cover ? (
        <>
          <img
            src={cover}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover animate-scale-in"
            draggable={false}
          />
          {/* Scrims: keep the text legible over any artwork */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/25"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-transparent"></div>
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-black">
          {/* No cover yet (illustration backfill pending): branded fallback */}
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-duo-pink opacity-10 blur-[150px] animate-pulse-slow"></div>
          <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-duo-blue opacity-10 blur-[150px] animate-pulse-slow delay-1000"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[28rem] h-[28rem] rounded-full border-4 border-white/10 flex items-center justify-center">
              <span className="text-[12rem] font-fun font-bold bg-clip-text text-transparent bg-gradient-to-b from-white/80 to-white/20 animate-scale-in">
                {monogram}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Title block */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-16 flex flex-col items-start gap-5 animate-slide-up">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur px-4 py-1.5 rounded-full border border-white/15 text-sm font-bold uppercase tracking-[0.3em] text-indigo-200">
            <BookOpen size={14} /> Unit
          </div>
          {theme && (
            <div className="bg-duo-pink/20 backdrop-blur px-4 py-1.5 rounded-full border border-pink-400/30 text-sm font-bold uppercase tracking-widest text-pink-200">
              {theme}
            </div>
          )}
        </div>

        <h1 className="text-[7rem] leading-[0.95] font-fun font-bold drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] animate-slide-down max-w-[90%] truncate">
          {title}
        </h1>

        {subtitle && (
          <p className="text-3xl text-white/70 font-medium max-w-4xl line-clamp-2 drop-shadow-lg">
            {subtitle}
          </p>
        )}
      </div>

      <style>{`
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1); opacity: 0.1; }
          50% { transform: scale(1.1); opacity: 0.2; }
        }
        .animate-pulse-slow { animation: pulse-slow 8s infinite; }
        .animate-slide-down { animation: unitIntroSlideDown 0.9s ease-out; }
        .animate-slide-up { animation: unitIntroSlideUp 0.9s ease-out; }
        .animate-scale-in { animation: unitIntroScaleIn 0.7s ease-out; }
        @keyframes unitIntroSlideDown { from { transform: translateY(-40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes unitIntroSlideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes unitIntroScaleIn { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
};

export default BoardUnitIntro;
