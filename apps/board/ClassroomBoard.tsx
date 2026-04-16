
import React from 'react';
import { useSession } from '../../store/SessionContext';
import { Clock, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Shared Effects
import ConfettiSystem from '../../components/effects/ConfettiSystem';
import DrawingLayer from '../../components/shared/DrawingLayer';

// Import enhanced templates
import BoardMediaPlayer from './templates/BoardMediaPlayer';
import BoardFocusCards from './templates/BoardFocusCards';
import BoardStoryStage from './templates/BoardStoryStage';
import BoardGrammarSandbox from './templates/BoardGrammarSandbox';
import BoardTeamBattle from './templates/BoardTeamBattle';
import BoardIntroSplash from './templates/BoardIntroSplash';
import BoardUnscramble from './templates/BoardUnscramble';
import BoardWhatsMissing from './templates/BoardWhatsMissing';
import BoardSpeedQuiz from './templates/BoardSpeedQuiz';
import BoardStorySequencing from './templates/BoardStorySequencing';
import BoardISayYouSay from './templates/BoardISayYouSay';
import BoardLiveClassWarmup from './templates/BoardLiveClassWarmup';
import BoardMagicEyes from './templates/BoardMagicEyes';
import BoardUnitSelection from './templates/BoardUnitSelection';
import BoardPoll from './templates/BoardPoll';
import BoardWheelOfDestiny from './templates/BoardWheelOfDestiny';
import BoardOverlayLayer from './templates/BoardOverlayLayer';

const ClassroomBoard: React.FC = () => {
  const { state } = useSession();

  // CRITICAL FIX: Use state.activeSlideData instead of MOCK_LESSON_FLOW
  // This ensures the board displays what is currently selected in the session
  const currentStep = state.activeSlideData;

  if (!state.isConnected) {
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
        <p className="mt-8 text-slate-600 font-mono text-sm">Room ID: 304-B</p>
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

  return (
    <div className="h-screen w-screen overflow-hidden bg-black flex items-center justify-center relative">
      {/* 16:9 Container - Ensures consistent layout on all projectors */}
      <div className="aspect-video w-full max-h-screen relative bg-slate-900 shadow-2xl overflow-hidden">

        {/* Global Effects Layer */}
        <ConfettiSystem />

        {/* Global Drawing Layer (Display Only) */}
        <DrawingLayer isInteractive={false} className="pointer-events-none z-[60]" />

        {/* Global Quick Wheel Overlay */}
        <BoardOverlayLayer />

        {/* Persistent Overlay (Time & Status) */}
        <div className="absolute top-6 right-6 z-50 flex gap-4 pointer-events-none">
          <div className="bg-black/40 backdrop-blur-md text-white px-6 py-3 rounded-2xl font-mono text-2xl flex items-center gap-3 shadow-lg border border-white/10">
            <Clock size={24} className="text-duo-green" />
            10:45 AM
          </div>
        </div>

        {/* Live Snap Overlay */}
        {state.liveSnapImage && (
          <div className="absolute inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-12 animate-fade-in">
            <div className="absolute top-8 left-8 flex items-center gap-4 text-white">
              <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse"></div>
              <span className="font-bold tracking-widest uppercase">Live Camera Feed</span>
            </div>
            <div className="relative w-full max-w-5xl aspect-video bg-black rounded-[2rem] shadow-2xl overflow-hidden border-8 border-white/20 transform rotate-1 transition-transform">
              <img src={state.liveSnapImage} className="w-full h-full object-contain" alt="Live Snap" />
            </div>
            <div className="mt-8 text-white/50 text-xl font-mono animate-bounce">
              Projecting from Teacher's Device...
            </div>
          </div>
        )}

        {/* Render Active Template with Cinematic Transition */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentStep.type}-${state.currentStepIndex}`}
            className="absolute inset-0 h-full w-full"
            initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 1.02, filter: 'blur(10px)' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            {currentStep.type === 'INTRO_SPLASH' && <BoardIntroSplash data={currentStep.data} />}
            {currentStep.type === 'MEDIA_PLAYER' && <BoardMediaPlayer data={currentStep.data} />}
            {currentStep.type === 'LIVE_WARMUP' && <BoardLiveClassWarmup data={currentStep.data} />}
            {currentStep.type === 'FOCUS_CARDS' && <BoardFocusCards data={currentStep.data} />}
            {currentStep.type === 'GAME_ARENA' && <BoardSpeedQuiz data={currentStep.data} />}
            {currentStep.type === 'STORY_STAGE' && <BoardStoryStage data={currentStep.data} />}
            {currentStep.type === 'GRAMMAR_SANDBOX' && <BoardGrammarSandbox data={currentStep.data} />}
            {currentStep.type === 'TEAM_BATTLE' && <BoardTeamBattle data={currentStep.data} />}
            {currentStep.type === 'UNSCRAMBLE' && <BoardUnscramble data={currentStep.data} />}
            {currentStep.type === 'WHATS_MISSING' && <BoardWhatsMissing data={currentStep.data} />}
            {currentStep.type === 'SPEED_QUIZ' && <BoardSpeedQuiz data={currentStep.data} />}
            {currentStep.type === 'STORY_SEQUENCING' && <BoardStorySequencing data={currentStep.data} />}
            {currentStep.type === 'I_SAY_YOU_SAY' && <BoardISayYouSay data={currentStep.data} />}
            {currentStep.type === 'MAGIC_EYES' && <BoardMagicEyes data={currentStep.data} />}
            {currentStep.type === 'POLL' && <BoardPoll data={currentStep.data} />}
            {currentStep.type === 'WHEEL_OF_DESTINY' && <BoardWheelOfDestiny data={currentStep.data} />}
            {currentStep.type === 'UNIT_SELECTION' && <BoardUnitSelection />}
          </motion.div>
        </AnimatePresence>

        {/* Cinematic Progress Bar */}
        {currentStep.type !== 'UNIT_SELECTION' && (
          <div className="absolute bottom-0 left-0 w-full h-2 bg-white/10 z-50">
            <div
              className="h-full bg-gradient-to-r from-duo-green to-duo-blue shadow-[0_0_10px_rgba(88,204,2,0.8)] transition-all duration-700 ease-out"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClassroomBoard;
