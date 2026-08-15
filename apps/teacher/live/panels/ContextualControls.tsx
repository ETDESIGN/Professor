import React from 'react';
import {
  ChevronLeft, ChevronRight, Play, RotateCw, Volume2,
  Monitor, Clock, LogOut, SkipForward, Zap, PenTool, Eraser,
  Eye, RefreshCw, Check, BarChart2, ArrowLeft, ArrowRight,
  Bell, LayoutGrid, MessageSquare, Lightbulb, FileText,
  Star, Shuffle, Scale, CheckCircle, XCircle, Music, Activity,
  Plus, Minus, X, List, Sparkles, Trophy, Users
} from 'lucide-react';

// Produce-mode answer input for BoardWhatsMissing v2 (whatsmissing-v2-spec §2):
// the teacher types what the picked student says; the board scores it via
// Levenshtein against content.prompt. Broadcasts WM_SUBMIT_ANSWER.
const WhatsMissingProduceInput: React.FC<{ triggerAction: (type: string, payload?: any) => void }> = ({ triggerAction }) => {
  const [text, setText] = React.useState('');
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    triggerAction('WM_SUBMIT_ANSWER', { text: t });
    setText('');
  };
  return (
    <div className="flex gap-2 items-center">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="Type the word they said…"
        className="h-12 w-52 px-4 bg-slate-800 border border-slate-600 text-white rounded-xl text-sm font-bold placeholder:text-slate-500 focus:outline-none focus:border-fuchsia-400"
      />
      <button onClick={submit} className="h-12 px-5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-all">
        <Check size={20} /> Submit
      </button>
    </div>
  );
};

// Shared control bar for BoardWhatsMissing v2 + BoardUnscramble v2 +
// BoardStorySequencing v2 (architecture §4.1 ContextualControlsSpec — Skip /
// Reveal Hint / Force-Correct / Next Round / End Slide). The board templates
// listen for these action types; see each template's exported CONTROLS spec.
const ScoredShellControls: React.FC<{
  triggerAction: (type: string, payload?: any) => void;
  opts?: { keepCheck?: boolean; replay?: boolean };
}> = ({ triggerAction, opts }) => (
  <div className="flex gap-2 flex-wrap items-center">
    {opts?.keepCheck && (
      <button onClick={() => triggerAction('CHECK_ANSWER')} className="h-12 px-6 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-all">
        <Check size={20} /> Check Answer
      </button>
    )}
    {opts?.replay && (
      <button onClick={() => triggerAction('SHOW_AGAIN')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95" title="Re-run the memorize/flash beat">
        <RefreshCw size={20} /> Show Again
      </button>
    )}
    <button onClick={() => triggerAction('REVEAL_HINT')} className="h-12 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-all" title="Narrowed hint (eliminate a candidate / highlight a tile)">
      <Lightbulb size={20} /> Hint
    </button>
    <button onClick={() => triggerAction('MARK_CORRECT')} className="h-12 px-4 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-all" title="Teacher override for defensible oral answers">
      <CheckCircle size={20} /> Mark Correct
    </button>
    <button onClick={() => triggerAction('SKIP_ROUND')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95" title="Skip this round (no penalty)">
      <SkipForward size={20} /> Skip
    </button>
    <button onClick={() => triggerAction('NEXT_ROUND')} className="h-12 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-all">
      Next <ChevronRight size={20} />
    </button>
    <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })} className="h-12 px-4 bg-rose-700 hover:bg-rose-600 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-all" title="End this slide">
      <X size={20} /> End
    </button>
  </div>
);

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
      // BoardWhatsMissing v2 (absorbed MagicEyes): recognize = tap a candidate
      // tile on the board; produce = type the student's word below (broadcast
      // WM_SUBMIT_ANSWER). Controls per WHATS_MISSING_CONTROLS spec.
      return (
        <div className="flex flex-col gap-2">
          <ScoredShellControls triggerAction={triggerAction} opts={{ replay: true }} />
          <WhatsMissingProduceInput triggerAction={triggerAction} />
        </div>
      );
    case 'MAGIC_EYES':
      // Consolidated into BoardWhatsMissing mode='magic_eyes' (architecture
      // §6.2) — recognition-only, same control bar without the produce input.
      return <ScoredShellControls triggerAction={triggerAction} opts={{ replay: true }} />;
    case 'UNSCRAMBLE':
    case 'SCRAMBLE':
    case 'STORY_SEQUENCING':
      // BoardUnscramble v2 (LCS partial credit) + BoardStorySequencing v2
      // (sequence → comprehend): Check stays, plus the full spec control set.
      return <ScoredShellControls triggerAction={triggerAction} opts={{ keepCheck: true }} />;
    case 'FLASH_MATCH':
      return (
        <div className="flex gap-2">
          <button onClick={() => triggerAction('SKIP_PAIR')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><SkipForward size={18} /> Skip</button>
          <button onClick={() => triggerAction('REVEAL_HINT')} className="h-12 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Lightbulb size={18} /> Hint</button>
          <button onClick={() => triggerAction('MARK_CORRECT')} className="h-12 px-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Check size={18} /> Correct</button>
          <button onClick={() => triggerAction('NEXT_ROUND')} className="h-12 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><RefreshCw size={18} /> Next Round</button>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })} className="h-12 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><X size={18} /> End</button>
        </div>
      );
    case 'LISTEN_TAP':
      return (
        <div className="flex gap-2">
          <button onClick={() => triggerAction('SKIP')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><SkipForward size={18} /> Skip</button>
          <button onClick={() => triggerAction('REVEAL_HINT')} className="h-12 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Lightbulb size={18} /> Hint</button>
          <button onClick={() => triggerAction('MARK_CORRECT')} className="h-12 px-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Check size={18} /> Correct</button>
          <button onClick={() => triggerAction('NEXT_ROUND')} className="h-12 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><RefreshCw size={18} /> Next</button>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })} className="h-12 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><X size={18} /> End</button>
        </div>
      );
    case 'GRAMMAR_LAB':
      return (
        <div className="flex gap-2">
          <button onClick={() => triggerAction('SKIP_ITEM')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><SkipForward size={18} /> Skip</button>
          <button onClick={() => triggerAction('REVEAL_HINT')} className="h-12 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Lightbulb size={18} /> Hint</button>
          <button onClick={() => triggerAction('MARK_CORRECT')} className="h-12 px-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Check size={18} /> Correct</button>
          <button onClick={() => triggerAction('RESET_GAME')} className="h-12 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><RefreshCw size={18} /> Redo</button>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })} className="h-12 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><X size={18} /> End</button>
        </div>
      );
    case 'WORD_DETECTIVE':
      return (
        <div className="flex gap-2">
          <button onClick={() => triggerAction('SKIP_ITEM')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><SkipForward size={18} /> Skip</button>
          <button onClick={() => triggerAction('REVEAL_HINT')} className="h-12 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Lightbulb size={18} /> Hint</button>
          <button onClick={() => triggerAction('MARK_CORRECT')} className="h-12 px-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Check size={18} /> Correct</button>
          <button onClick={() => triggerAction('RESET_GAME')} className="h-12 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><RefreshCw size={18} /> Redo</button>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })} className="h-12 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><X size={18} /> End</button>
        </div>
      );
    case 'SOUND_LAB':
      return (
        <div className="flex gap-2">
          <button onClick={() => triggerAction('SKIP_PHASE')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><SkipForward size={18} /> Skip Phase</button>
          <button onClick={() => triggerAction('MARK_CORRECT')} className="h-12 px-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Check size={18} /> Correct</button>
          <button onClick={() => triggerAction('RESET_GAME')} className="h-12 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><RefreshCw size={18} /> Redo</button>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })} className="h-12 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><X size={18} /> End</button>
        </div>
      );
    case 'STORY_QUEST':
      return (
        <div className="flex gap-2">
          <button onClick={() => triggerAction('NEXT_PANEL')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><SkipForward size={18} /> Next Page</button>
          <button onClick={() => triggerAction('REVEAL_HINT')} className="h-12 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Lightbulb size={18} /> Hint</button>
          <button onClick={() => triggerAction('MARK_CORRECT')} className="h-12 px-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Check size={18} /> Correct</button>
          <button onClick={() => triggerAction('RESET_GAME')} className="h-12 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><RefreshCw size={18} /> Redo</button>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })} className="h-12 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><X size={18} /> End</button>
        </div>
      );
    case 'SENTENCE_LAB':
      return (
        <div className="flex gap-2">
          <button onClick={() => triggerAction('SKIP_ITEM')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><SkipForward size={18} /> Skip</button>
          <button onClick={() => triggerAction('REVEAL_HINT')} className="h-12 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Lightbulb size={18} /> Hint</button>
          <button onClick={() => triggerAction('CHECK_ANSWER')} className="h-12 px-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Check size={18} /> Check</button>
          <button onClick={() => triggerAction('MARK_CORRECT')} className="h-12 px-4 bg-green-700 hover:bg-green-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Check size={18} /> Force ✓</button>
          <button onClick={() => triggerAction('RESET_GAME')} className="h-12 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><RefreshCw size={18} /> Redo</button>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })} className="h-12 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><X size={18} /> End</button>
        </div>
      );
    case 'PHONICS_ARENA':
      return (
        <div className="flex gap-2">
          <button onClick={() => triggerAction('NEXT_ITEM')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><SkipForward size={18} /> Next</button>
          <button onClick={() => triggerAction('MARK_CORRECT')} className="h-12 px-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Check size={18} /> Correct</button>
          <button onClick={() => triggerAction('RESET_GAME')} className="h-12 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><RefreshCw size={18} /> Redo</button>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })} className="h-12 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><X size={18} /> End</button>
        </div>
      );
    case 'VOCAB_BLITZ':
      return (
        <div className="flex gap-2">
          <button onClick={() => triggerAction('SKIP_ITEM')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><SkipForward size={18} /> Skip</button>
          <button onClick={() => triggerAction('MARK_CORRECT')} className="h-12 px-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Check size={18} /> Correct</button>
          <button onClick={() => triggerAction('RESET_GAME')} className="h-12 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><RefreshCw size={18} /> Redo</button>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })} className="h-12 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><X size={18} /> End</button>
        </div>
      );
    case 'MEMORY_LAB':
      return (
        <div className="flex gap-2">
          <button onClick={() => triggerAction('SKIP_ITEM')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><SkipForward size={18} /> Skip Round</button>
          <button onClick={() => triggerAction('MARK_CORRECT')} className="h-12 px-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Check size={18} /> Correct</button>
          <button onClick={() => triggerAction('RESET_GAME')} className="h-12 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><RefreshCw size={18} /> Redo</button>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })} className="h-12 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><X size={18} /> End</button>
        </div>
      );
    case 'CLASS_RALLY':
      return (
        <div className="flex gap-2">
          <button onClick={() => triggerAction('SKIP_ITEM')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><SkipForward size={18} /> Next</button>
          <button onClick={() => triggerAction('MARK_CORRECT')} className="h-12 px-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Check size={18} /> Correct</button>
          <button onClick={() => triggerAction('RESET_GAME')} className="h-12 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><RefreshCw size={18} /> Reset Rally</button>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })} className="h-12 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><X size={18} /> End</button>
        </div>
      );
    case 'STORY_STAGE':
      // BoardStoryStage v2: read-through + scored comprehension MCQs.
      // Controls: Hint (eliminate distractor) / Mark Correct / Skip / End.
      return (
        <div className="flex gap-2">
          <button onClick={() => triggerAction('NEXT_PANEL')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><ChevronRight size={18} /> Next Page</button>
          <button onClick={() => triggerAction('REVEAL_HINT')} className="h-12 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Lightbulb size={18} /> Hint</button>
          <button onClick={() => triggerAction('MARK_CORRECT')} className="h-12 px-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Check size={18} /> Correct</button>
          <button onClick={() => triggerAction('SKIP_ROUND')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><SkipForward size={18} /> Skip</button>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })} className="h-12 px-4 bg-rose-700 hover:bg-rose-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><X size={18} /> End</button>
        </div>
      );
    case 'DIALOGUE_STAGE':
      // BoardDialogueStage v2: read-along → role-read → WHO_SAID_IT.
      // Controls: Next (advance line/stage) / Toggle Mode (choral/picked) /
      // Reassign Roles / Hint / Mark Correct / Skip / End.
      return (
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={() => triggerAction('NEXT_PANEL')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><ChevronRight size={18} /> Next</button>
          <button onClick={() => triggerAction('TOGGLE_SCORING_MODE')} className="h-12 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><RefreshCw size={18} /> Choral/Picked</button>
          <button onClick={() => triggerAction('REASSIGN_ROLES')} className="h-12 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Users size={18} /> Reassign</button>
          <button onClick={() => triggerAction('REVEAL_HINT')} className="h-12 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Lightbulb size={18} /> Hint</button>
          <button onClick={() => triggerAction('MARK_CORRECT')} className="h-12 px-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Check size={18} /> Correct</button>
          <button onClick={() => triggerAction('SKIP_ROUND')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><SkipForward size={18} /> Skip</button>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })} className="h-12 px-4 bg-rose-700 hover:bg-rose-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><X size={18} /> End</button>
        </div>
      );
    case 'GRAMMAR_PRACTICE':
      // BoardGrammarForge v2: ERROR_SPOT MCQ → TRANSFORM tiles → PRODUCE 3-way rating.
      // Controls cover all 3 rungs: Reveal/Check (per rung), Mark Correct (override),
      // Rate (rung 4 only), Choral/Picked toggle (rung 4 only), Skip/Next/End.
      return (
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={() => triggerAction('REVEAL_ANSWER')} className="h-12 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Eye size={18} /> Reveal</button>
          <button onClick={() => triggerAction('CHECK_ANSWER')} className="h-12 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Check size={18} /> Check</button>
          <button onClick={() => triggerAction('MARK_CORRECT')} className="h-12 px-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Check size={18} /> Mark Correct</button>
          <button onClick={() => triggerAction('TOGGLE_SCORING_MODE')} className="h-12 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><RefreshCw size={18} /> Choral/Picked</button>
          {/* Rung 4 (PRODUCE) — 3-way rating */}
          <button onClick={() => triggerAction('RATE_INCORRECT')} className="h-12 px-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95">✗</button>
          <button onClick={() => triggerAction('RATE_PARTIAL')} className="h-12 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95">~</button>
          <button onClick={() => triggerAction('RATE_CORRECT')} className="h-12 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95">✓</button>
          <button onClick={() => triggerAction('SKIP_ROUND')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><SkipForward size={18} /> Skip</button>
          <button onClick={() => triggerAction('NEXT_ROUND')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><ChevronRight size={18} /> Next</button>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })} className="h-12 px-4 bg-rose-700 hover:bg-rose-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><X size={18} /> End</button>
        </div>
      );
    case 'I_SAY_YOU_SAY':
    case 'SPEAKING':
      // BoardISayYouSay v2: discrimination (scored) → choral (unscored).
      return (
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={() => triggerAction('MARK_CORRECT')} className="h-12 px-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><Check size={18} /> Mark Correct</button>
          <button onClick={() => triggerAction('FLIP_CARD')} className="h-12 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><RefreshCw size={18} /> Replay</button>
          <button onClick={() => triggerAction('SKIP_PAIR')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><SkipForward size={18} /> Skip</button>
          <button onClick={() => triggerAction('NEXT_ITEM')} className="h-12 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><ChevronRight size={18} /> Next</button>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })} className="h-12 px-4 bg-rose-700 hover:bg-rose-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95"><X size={18} /> End</button>
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
