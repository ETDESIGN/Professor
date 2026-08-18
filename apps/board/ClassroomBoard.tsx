
import React, { useState, useEffect } from 'react';
import { useSession } from '../../store/SessionContext';
import { Clock, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Shared Effects
import ConfettiSystem from '../../components/effects/ConfettiSystem';
import DrawingLayer from '../../components/shared/DrawingLayer';

// FIXPLAN P3.8: the step-type → template map is SHARED with the commander's
// BoardRenderer (apps/teacher/live/panels/BoardRenderer.tsx) — one place to
// register templates. The two hand-mirrored switches had already drifted
// once (commit a44e1bb: 6 unregistered types + GAME_ARENA mislabeled).
import { BOARD_MAP } from './templates/boardMap';
import BoardOverlayLayer from './templates/BoardOverlayLayer';
import ClassWeakBanner from './ClassWeakBanner';
import ClassLeaderboard from './ClassLeaderboard';
import BoardShell from './BoardShell';

const ClassroomBoard: React.FC = () => {
  const { state } = useSession();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentStep = state.activeSlideData;

  const timeString = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  // FIXPLAN E1.8: the gate now requires BOTH channels — the broadcast bus
  // (isConnected) AND the classroom_sessions postgres_changes channel that
  // actually carries slide position (sessionSyncHealthy). Previously a dead
  // channel B left the board "connected" but permanently behind the teacher.
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

  // Safety check if no slide is active
  if (!currentStep) {
    return (
      <div className="h-screen w-screen bg-slate-900 flex items-center justify-center text-white font-mono">
        Initializing Session...
      </div>
    );
  }

  // Calculate progress based on the current unit's flow length
  const totalSlides = state.activeUnit?.flow?.length || 1;
  const progressPercent = ((state.currentStepIndex + 1) / totalSlides) * 100;

  // Phase-aware timeline (audit A1/G8): surface the step's pedagogical phase so
  // the teacher sees where they are in the Warm-up -> Input -> Practice ->
  // Output -> Assess -> Wrap-up flow.
  const phase: string = (currentStep as any)?.phase || '';
  const PHASE_META: Record<string, { label: string; color: string }> = {
    WARMUP: { label: 'Warm-up', color: 'bg-amber-500' },
    INPUT: { label: 'Input', color: 'bg-sky-500' },
    PRACTICE: { label: 'Practice', color: 'bg-duo-green' },
    OUTPUT: { label: 'Output', color: 'bg-purple-500' },
    ASSESS: { label: 'Assess', color: 'bg-rose-500' },
    WRAPUP: { label: 'Wrap-up', color: 'bg-slate-500' },
    REVIEW: { label: 'Review', color: 'bg-indigo-500' },
  };
  const phaseMeta = phase ? PHASE_META[phase] : null;

  return (
    <div className="h-screen w-screen overflow-hidden bg-black flex items-center justify-center relative">
      <div className="aspect-video w-full max-h-screen relative shadow-2xl overflow-hidden">

        {/* Global Overlays (on top of the Shell) */}
        <ConfettiSystem />
        <DrawingLayer isInteractive={false} className="pointer-events-none z-[60]" />
        <BoardOverlayLayer />
        {(phase === 'PRACTICE' || phase === 'ASSESS') && <ClassWeakBanner />}
        {state.activeOverlay === 'LEADERBOARD' && <ClassLeaderboard />}

        {/* Live Snap Overlay */}
        {state.liveSnapImage && (
          <div className="absolute inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-12 animate-fade-in">
            <div className="absolute top-8 left-8 flex items-center gap-4 text-white">
              <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse"></div>
              <span className="font-bold tracking-widest uppercase">Live Camera Feed</span>
            </div>
            <div className="relative w-full max-w-5xl aspect-video bg-black rounded-[2rem] shadow-2xl overflow-hidden border-8 border-white/20">
              <img src={state.liveSnapImage} className="w-full h-full object-contain" alt="Live Snap" />
            </div>
          </div>
        )}

        {/* ═══ BoardShell: persistent frame (phase arc + team rails + leaderboard + whose-turn) ═══ */}
        <BoardShell>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${currentStep.type}-${state.currentStepIndex}`}
              className="h-full w-full"
              initial={{ opacity: 0, scale: 0.98, filter: 'blur(8px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 1.02, filter: 'blur(8px)' }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              {(() => {
                // FIXPLAN P3.8 — the shared BOARD_MAP replaces the 32-line
                // hand-mirrored conditional chain (drift hazard, a44e1bb).
                const BoardComponent = BOARD_MAP[currentStep.type];
                if (!BoardComponent) return null; // unknown type: shell frame still renders
                if (currentStep.type === 'UNIT_SELECTION') return <BoardComponent />;
                return <BoardComponent data={currentStep.data} />;
              })()}
            </motion.div>
          </AnimatePresence>
        </BoardShell>

      </div>
    </div>
  );
};

export default ClassroomBoard;
