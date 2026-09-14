import React, { useState, useEffect } from 'react';
import { useSession } from '../../store/SessionContext';
import { WifiOff } from 'lucide-react';
import BoardStage from '../../components/shared/BoardStage';
import BoardCanvas from './BoardCanvas';

const ClassroomBoard: React.FC = () => {
  const { state } = useSession();

  // Portrait phones/tablets: the 16:9 stage letterboxes into a thin strip.
  // Nudge the teacher to rotate (dismissible — the stage still renders).
  const [portrait, setPortrait] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia('(orientation: portrait)').matches,
  );
  const [hintDismissed, setHintDismissed] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    const onChange = (e: MediaQueryListEvent) => setPortrait(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // FIXPLAN E1.8: the gate requires BOTH channels — the broadcast bus
  // (isConnected) AND the classroom_sessions postgres_changes channel that
  // actually carries slide position (sessionSyncHealthy).
  if (!state.isConnected || !state.sessionSyncHealthy) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping"></div>
          <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center border-4 border-red-500/50 relative z-10">
            <WifiOff size={40} className="text-red-500" />
          </div>
        </div>
        <h1 className="text-6xl font-mono tracking-tighter mb-4 font-bold text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-500">NO SIGNAL</h1>
        <div className="bg-slate-900 px-6 py-3 rounded-xl border border-slate-800 font-mono text-xl text-slate-400">
          Waiting for Teacher Connection...
        </div>
        <p className="mt-8 text-slate-600 font-mono text-sm">Waiting for connection...</p>
      </div>
    );
  }

  if (!state.activeSlideData) {
    return (
      <div className="h-screen w-screen bg-slate-900 flex items-center justify-center text-white font-mono">
        Initializing Session...
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-black relative">
      <BoardStage>
        <BoardCanvas />
      </BoardStage>
      {portrait && !hintDismissed && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[110] bg-slate-900/90 backdrop-blur border border-white/15 rounded-full px-5 py-2.5 flex items-center gap-3 text-white text-sm font-semibold shadow-2xl">
          <span className="inline-block animate-pulse">⟳</span>
          Rotate for the big classroom view
          <button onClick={() => setHintDismissed(true)} className="text-slate-400 hover:text-white font-bold" aria-label="Dismiss">✕</button>
        </div>
      )}
    </div>
  );
};

export default ClassroomBoard;
