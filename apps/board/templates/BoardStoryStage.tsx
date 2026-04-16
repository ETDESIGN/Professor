import React, { useState, useEffect } from 'react';
import { ChevronRight, BookOpen } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

const BoardStoryStage = ({ data }: { data: any }) => {
  const { state } = useSession();
  const [activePanel, setActivePanel] = useState(0);
  const pages = data.pages || [];
  const characters = data.characters || [];
  const current = pages[activePanel];

  useEffect(() => {
    if (state.lastAction?.type === 'NEXT_PANEL' || state.lastAction?.type === 'NEXT_CARD') {
      setActivePanel(p => Math.min(p + 1, pages.length - 1));
    } else if (state.lastAction?.type === 'PREV_PANEL' || state.lastAction?.type === 'PREV_CARD') {
      setActivePanel(p => Math.max(p - 1, 0));
    } else if (state.lastAction?.type === 'RESET_GAME') {
      setActivePanel(0);
    }
  }, [state.lastAction]);

  if (pages.length === 0) {
    return (
      <div className="h-full bg-slate-900 flex items-center justify-center text-white font-display">
        <div className="text-center">
          <BookOpen size={64} className="text-amber-400 mx-auto mb-4 opacity-50" />
          <h2 className="text-4xl font-bold mb-2">Story Stage</h2>
          <p className="text-slate-400 text-xl">No story pages available for this lesson.</p>
        </div>
      </div>
    );
  }

  const currentSpeaker = characters.find((c: any) => c.name === current?.speaker) || characters[activePanel % characters.length] || null;

  return (
    <div className="h-full w-full bg-slate-900 relative overflow-hidden">

      {/* Cinematic Background */}
      <div className="absolute inset-0 z-0">
        {current?.imageUrl ? (
          <img
            src={current.imageUrl}
            className="w-full h-full object-cover filter blur-xl scale-110 opacity-40 transition-all duration-1000"
            alt=""
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800" />
        )}
      </div>

      {/* Main Viewport */}
      <div className="absolute inset-x-12 inset-y-24 z-10 flex gap-8">

        {/* Previous Panel (Faded) */}
        <div className="w-48 h-full bg-black/40 rounded-3xl border-4 border-white/10 transform scale-90 opacity-40 origin-right overflow-hidden">
          {activePanel > 0 && pages[activePanel - 1]?.imageUrl && (
            <img src={pages[activePanel - 1].imageUrl} className="w-full h-full object-cover" alt="" />
          )}
        </div>

        {/* Active Panel */}
        <div className="flex-1 bg-white rounded-[2rem] shadow-2xl overflow-hidden relative border-[12px] border-white group">
          {current?.imageUrl ? (
            <img
              src={current.imageUrl}
              className="w-full h-full object-cover transform transition-transform duration-[20s] ease-linear scale-100 group-hover:scale-110"
              alt=""
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center">
              <span className="text-[200px] opacity-20">{currentSpeaker?.emoji || '\uD83D\uDCD6'}</span>
            </div>
          )}

          {/* Dialogue Overlay */}
          <div className="absolute bottom-12 left-12 right-12">
            <div className="bg-white/95 backdrop-blur-xl p-8 rounded-[2rem] shadow-xl border-l-[16px] border-duo-green flex items-start gap-8 animate-slide-up">

              {/* Speaker Avatar */}
              {currentSpeaker && (
                <div className="relative -mt-16 flex-shrink-0">
                  <div className="w-32 h-32 bg-duo-green rounded-full border-8 border-white shadow-lg flex items-center justify-center">
                    <span className="text-6xl">{currentSpeaker.emoji}</span>
                  </div>
                  <div className="absolute bottom-0 right-0 bg-duo-green text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border-2 border-white">
                    {currentSpeaker.role || 'Character'}
                  </div>
                </div>
              )}

              {/* Text */}
              <div className="flex-1">
                {currentSpeaker && (
                  <h3 className="text-slate-400 font-bold uppercase tracking-widest text-sm mb-2">{currentSpeaker.name}</h3>
                )}
                <p className="text-5xl font-fun text-slate-800 leading-tight">
                  "{current?.text || ""}"
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Next Panel (Faded + Clickable) */}
        <div
          onClick={() => setActivePanel(p => Math.min(p + 1, pages.length - 1))}
          className="w-48 h-full bg-white rounded-3xl border-4 border-white/50 transform scale-90 opacity-60 origin-left cursor-pointer hover:opacity-100 hover:scale-95 transition-all overflow-hidden"
        >
          {activePanel < pages.length - 1 && pages[activePanel + 1]?.imageUrl ? (
            <img src={pages[activePanel + 1].imageUrl} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full bg-slate-200 flex items-center justify-center">
              <ChevronRight size={48} className="text-slate-400" />
            </div>
          )}
        </div>
      </div>

      {/* Header Info */}
      <div className="absolute top-0 left-0 w-full p-8 flex justify-between items-center z-20">
        <div className="bg-black/40 backdrop-blur px-6 py-3 rounded-full text-white font-bold border border-white/10 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
          {data.title || 'Story Time'}
        </div>
        <div className="flex items-center gap-4">
          {data.setting && (
            <div className="bg-black/30 backdrop-blur px-4 py-2 rounded-full text-white/70 text-sm border border-white/10">
              {data.setting}
            </div>
          )}
          <div className="flex items-center gap-2 text-white/60 font-mono">
            Panel {activePanel + 1} / {pages.length}
          </div>
        </div>
      </div>

      {/* Character Strip */}
      {characters.length > 0 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
          {characters.map((char: any, i: number) => (
            <div
              key={i}
              className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 transition-all ${currentSpeaker?.name === char.name ? 'bg-duo-green text-white scale-110' : 'bg-white/20 text-white/60'}`}
            >
              <span>{char.emoji}</span> {char.name}
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up { animation: slide-up 0.5s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default BoardStoryStage;
