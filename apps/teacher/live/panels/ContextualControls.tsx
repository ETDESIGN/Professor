import React from 'react';
import {
  ChevronLeft, ChevronRight, Play, RotateCw, Volume2,
  Monitor, Clock, LogOut, SkipForward, Zap, PenTool, Eraser,
  Eye, RefreshCw, Check, BarChart2, ArrowLeft, ArrowRight,
  Bell, LayoutGrid, MessageSquare, Lightbulb, FileText,
  Star, Shuffle, Scale, CheckCircle, XCircle, Music, Activity,
  Plus, Minus, X, List, Sparkles, Trophy
} from 'lucide-react';

export const renderContextualControls = (
  currentStep: any,
  triggerAction: (type: string, payload?: any) => void,
  selectNextStudent: (filterTeam?: string, useOverlay?: boolean) => void,
) => {
  switch (currentStep.type) {
    case 'MEDIA_PLAYER':
    case 'LIVE_WARMUP':
      return (
        <button onClick={() => triggerAction('PLAY_PAUSE')} className="h-12 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/20 active:scale-95 transition-all">
          <Play size={20} /> Play / Pause
        </button>
      );
    case 'GAME_ARENA':
    case 'WHEEL_OF_DESTINY':
      return (
        <button onClick={() => selectNextStudent(undefined, false)} className="h-12 px-6 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-yellow-900/20 active:scale-95 transition-all">
          <RotateCw size={20} /> Spin Wheel
        </button>
      );
    case 'FOCUS_CARDS':
      return (
        <div className="flex gap-2">
          <button onClick={() => triggerAction('PREV_CARD')} className="h-12 w-12 flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-white rounded-xl active:scale-95"><ArrowLeft size={20} /></button>
          <button onClick={() => triggerAction('FLIP_CARD')} className="h-12 px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-indigo-900/50 active:scale-95">Flip Card</button>
          <button onClick={() => triggerAction('NEXT_CARD')} className="h-12 w-12 flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-white rounded-xl active:scale-95"><ArrowRight size={20} /></button>
        </div>
      );
    case 'SPEED_QUIZ':
      // B3.4: BoardSpeedQuiz.tsx listens for REVEAL_ANSWER (not REVEAL).
      // Reset → NEXT_ROUND advances a revealed question; RESET_GAME resets at results.
      return (
        <div className="flex gap-2">
          <button onClick={() => triggerAction('REVEAL_ANSWER')} className="h-12 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg active:scale-95"><Eye size={20} /> Reveal</button>
          <button onClick={() => triggerAction('NEXT_ROUND')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><RefreshCw size={20} /> Next</button>
          <button onClick={() => triggerAction('RESET_GAME')} className="h-12 w-12 flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-white rounded-xl active:scale-95" title="Reset quiz"><RotateCw size={20} /></button>
        </div>
      );
    case 'WHATS_MISSING':
      // B3.4: BoardWhatsMissing.tsx listens for REVEAL + START_MEMORIZE (not RESTART).
      return (
        <div className="flex gap-2">
          <button onClick={() => triggerAction('REVEAL')} className="h-12 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg active:scale-95"><Eye size={20} /> Reveal</button>
          <button onClick={() => triggerAction('START_MEMORIZE')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><RefreshCw size={20} /> Restart</button>
        </div>
      );
    case 'MAGIC_EYES':
      // BoardMagicEyes.tsx listens for REVEAL + RESTART — already correct.
      return (
        <div className="flex gap-2">
          <button onClick={() => triggerAction('REVEAL')} className="h-12 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg active:scale-95"><Eye size={20} /> Reveal</button>
          <button onClick={() => triggerAction('RESTART')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><RefreshCw size={20} /> Reset</button>
        </div>
      );
    case 'UNSCRAMBLE':
    case 'STORY_SEQUENCING':
      return (
        <div className="flex gap-2">
          <button onClick={() => triggerAction('CHECK_ANSWER')} className="h-12 px-6 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg active:scale-95"><Check size={20} /> Check Answer</button>
          <button onClick={() => triggerAction('RESET_GAME')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><RefreshCw size={20} /> Reset</button>
        </div>
      );
    default:
      return (
        <div className="text-slate-500 text-sm font-bold flex items-center gap-2 bg-slate-800/50 px-4 py-2 rounded-lg border border-slate-700">
          <Monitor size={16} /> Presenter Mode Active
        </div>
      );
  }
};
