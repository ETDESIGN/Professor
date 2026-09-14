// BoardCanvas — the board's entire content tree (overlays + BoardShell +
// current game), rendered inside a BoardStage by BOTH consumers: /board
// (ClassroomBoard) and the Commander preview. One tree ⇒ the Commander
// preview is a true replica of the projector at identical 1280×720 scale.

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from '../../store/SessionContext';
import ConfettiSystem from '../../components/effects/ConfettiSystem';
import DrawingLayer from '../../components/shared/DrawingLayer';
import { BOARD_MAP } from './templates/boardMap';
import BoardOverlayLayer from './templates/BoardOverlayLayer';
import ClassWeakBanner from './ClassWeakBanner';
import ClassLeaderboard from './ClassLeaderboard';
import BoardShell from './BoardShell';

const BoardCanvas: React.FC = () => {
  const { state } = useSession();
  const currentStep = state.activeSlideData;
  const phase = (currentStep as any)?.phase || '';

  return (
    <div className="absolute inset-0 overflow-hidden">
      <ConfettiSystem />
      <DrawingLayer isInteractive={false} className="pointer-events-none z-[60]" />
      <BoardOverlayLayer />
      {(phase === 'PRACTICE' || phase === 'ASSESS') && <ClassWeakBanner />}
      {state.activeOverlay === 'LEADERBOARD' && <ClassLeaderboard />}

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

      <BoardShell>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentStep?.type}-${state.currentStepIndex}`}
            className="h-full w-full"
            initial={{ opacity: 0, scale: 0.98, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 1.02, filter: 'blur(8px)' }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            {(() => {
              if (!currentStep) return null;
              const BoardComponent = BOARD_MAP[currentStep.type];
              if (!BoardComponent) return null;
              if (currentStep.type === 'UNIT_SELECTION') return <BoardComponent />;
              return <BoardComponent data={currentStep.data} />;
            })()}
          </motion.div>
        </AnimatePresence>
      </BoardShell>
    </div>
  );
};

export default BoardCanvas;
