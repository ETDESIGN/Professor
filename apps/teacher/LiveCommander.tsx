import React, { useState } from 'react';
import { useSession } from '../../store/SessionContext';
import {
   ChevronLeft, ChevronRight, Play, RotateCw, Volume2,
   Monitor, Clock, LogOut, PenTool, Eraser,
   Star, Activity, LayoutGrid, Zap, Bell,
   Plus, Minus, X, List, Sparkles
} from 'lucide-react';
import DrawingLayer from '../../components/shared/DrawingLayer';
import { ErrorBoundary } from '../../components/shared/ErrorBoundary';
import { BoardRenderer } from './live/panels/BoardRenderer';
import { renderContextualControls } from './live/panels/ContextualControls';
import { SidebarPanel } from './live/sidebar/SidebarPanel';
import { useTimer } from './live/hooks/useTimer';
import { useNoiseDetection } from './live/hooks/useNoiseDetection';
import { useAISuggestion } from './live/hooks/useAISuggestion';

interface LiveCommanderProps {
   onExit?: () => void;
}

type SidebarTab = 'notes' | 'wheel' | 'sounds' | 'groups' | 'analytics';

const LiveCommander: React.FC<LiveCommanderProps> = ({ onExit }) => {
   const {
      state, nextSlide, prevSlide, goToSlide, addPoints, triggerAction, deductAllPoints,
      clearDrawings, selectNextStudent, setSelectionMode, closeOverlay,
      setQuietMode, updateNoiseLevel, endSession
   } = useSession();

   const currentStep = state.activeSlideData;
   const activeFlow = state.activeUnit?.flow || [];
   const nextStep = activeFlow[state.currentStepIndex + 1];

   if (!currentStep) return <div className="text-white p-8 bg-slate-900 h-screen flex items-center justify-center">Loading Session...</div>;

   const { elapsedTime, formatTime } = useTimer();
   const { quietTimer, toggleQuietMode } = useNoiseDetection(state.quietModeActive, setQuietMode, updateNoiseLevel, deductAllPoints);
   const { showAiSuggestion, aiSuggestionText, isGenerating, handleGenerate, dismissSuggestion } = useAISuggestion();

   const [isDrawingMode, setIsDrawingMode] = useState(false);
   const [drawingColor, setDrawingColor] = useState('#ef4444');
   const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>('notes');
   const [showLessonNav, setShowLessonNav] = useState(false);
   const [activePointStudentId, setActivePointStudentId] = useState<string | null>(null);
   const [tooltipLeft, setTooltipLeft] = useState<number>(0);
   const [isSpinning, setIsSpinning] = useState(false);
   const [groupCount, setGroupCount] = useState(2);
   const [generatedGroups, setGeneratedGroups] = useState<any[][]>([]);

   const handleSpin = () => {
      setIsSpinning(true);
      selectNextStudent(undefined, true);
      setTimeout(() => setIsSpinning(false), 2000);
   };

   const activePointStudent = state.students.find((s: any) => s.id === activePointStudentId);

   return (
      <div className="h-screen bg-slate-950 text-white flex flex-col font-sans overflow-hidden">

         {/* Header */}
         <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 z-30">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20"><Monitor size={16} className="text-white" /></div>
               <div>
                  <h1 className="font-bold text-sm leading-tight text-slate-200">Live Commander</h1>
                  <div className="flex items-center gap-2 text-[10px] text-indigo-400 font-mono">
                     <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>ROOM-304
                  </div>
               </div>
            </div>
            <div className="flex items-center gap-4">
               {state.quietModeActive && (
                  <div className="flex items-center gap-2 bg-red-900/50 px-3 py-1.5 rounded-full border border-red-500 animate-pulse">
                     <Bell size={14} className="text-red-400" />
                     <span className="font-bold text-sm text-red-200 uppercase tracking-widest">Quiet: {quietTimer}s</span>
                     <div className="w-12 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full transition-all ${state.noiseLevel > 40 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${state.noiseLevel}%` }}></div>
                     </div>
                  </div>
               )}
               <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
                  <Clock size={14} className="text-slate-400" />
                  <span className="font-mono font-bold text-sm text-slate-200">{formatTime(elapsedTime)}</span>
               </div>
               <button onClick={() => { endSession(); if (onExit) onExit(); }} className="text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-colors" title="End Session"><LogOut size={18} /></button>
            </div>
         </header>

         {/* Main Workspace */}
         <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

            {/* Lesson Nav Sidebar */}
            <div className={`absolute top-0 bottom-0 left-0 w-72 bg-slate-900 border-r border-slate-800 z-50 transform transition-transform duration-300 ${showLessonNav ? 'translate-x-0' : '-translate-x-full'}`}>
               <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                  <span className="font-bold text-slate-300 uppercase text-xs tracking-wider">Lesson Roadmap</span>
                  <button onClick={() => setShowLessonNav(false)} className="text-slate-500 hover:text-white"><X size={16} /></button>
               </div>
               <div className="overflow-y-auto h-full pb-20">
                  {activeFlow.map((step: any, idx: number) => (
                     <button key={step.id || idx} onClick={() => { goToSlide(idx); setShowLessonNav(false); }}
                        className={`w-full text-left p-4 border-b border-slate-800 flex items-center gap-3 hover:bg-slate-800 transition-colors ${state.currentStepIndex === idx ? 'bg-slate-800 border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'}`}>
                        <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${state.currentStepIndex === idx ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'}`}>{idx + 1}</div>
                        <div className="flex-1 min-w-0">
                           <div className={`text-sm font-bold truncate ${state.currentStepIndex === idx ? 'text-white' : 'text-slate-400'}`}>{step.title}</div>
                           <div className="text-[10px] text-slate-600 uppercase font-bold">{step.type.replace('_', ' ')}</div>
                        </div>
                        {state.currentStepIndex === idx && <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>}
                     </button>
                  ))}
               </div>
            </div>

            {/* Left: Preview Monitor */}
            <div className="hidden md:flex flex-1 flex-col bg-black/20 relative">
               <div className="flex-1 p-6 flex flex-col items-center justify-center relative">

                  {showAiSuggestion && (
                     <div className="absolute top-6 right-6 z-50 animate-slide-down max-w-sm">
                        <div className="bg-indigo-900/90 backdrop-blur-md border border-indigo-500/50 rounded-2xl p-4 shadow-2xl shadow-indigo-900/50 flex gap-4 items-start">
                           <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0"><Sparkles size={20} className="text-indigo-300" /></div>
                           <div className="flex-1">
                              <h4 className="text-indigo-300 font-bold text-xs uppercase tracking-wider mb-1 flex items-center gap-2">AI Co-Pilot<span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span></h4>
                              <p className="text-white text-sm leading-snug mb-3">{aiSuggestionText}</p>
                              <div className="flex gap-2">
                                 <button onClick={handleGenerate} disabled={isGenerating} className="flex-1 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors disabled:opacity-50">{isGenerating ? "Generating..." : "Generate"}</button>
                                 <button onClick={dismissSuggestion} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors">Dismiss</button>
                              </div>
                           </div>
                        </div>
                     </div>
                  )}

                  <div className="w-full max-w-5xl aspect-video bg-black rounded-xl shadow-2xl border border-slate-800 relative overflow-hidden group">
                     <DrawingLayer isInteractive={isDrawingMode} color={drawingColor} className="z-20" />
                     <div className="absolute inset-0 overflow-hidden z-10 pointer-events-auto select-none">
                        <div className="w-[200%] h-[200%] origin-top-left transform scale-50">
                           <ErrorBoundary>
                              <BoardRenderer currentStep={currentStep} />
                           </ErrorBoundary>
                        </div>
                     </div>
                     <div className="absolute top-3 left-3 flex gap-2 pointer-events-none z-30">
                        <div className="bg-red-600/90 backdrop-blur px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm flex items-center gap-1"><div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div> LIVE</div>
                        {isDrawingMode && <div className="bg-indigo-600/90 backdrop-blur px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm">PEN ACTIVE</div>}
                     </div>
                     <div className="absolute top-3 right-3 flex flex-col gap-2 z-30">
                        <button onClick={() => setIsDrawingMode(!isDrawingMode)} className={`p-2 rounded-lg transition-colors shadow-lg ${isDrawingMode ? 'bg-white text-indigo-600' : 'bg-black/50 text-white hover:bg-black/70'}`}><PenTool size={16} /></button>
                        {isDrawingMode && (
                           <div className="bg-black/80 backdrop-blur p-2 rounded-lg border border-white/10 flex flex-col gap-2 animate-slide-down">
                              {['#ef4444', '#3b82f6', '#10b981', '#f59e0b'].map(c => (
                                 <button key={c} onClick={() => setDrawingColor(c)} className={`w-6 h-6 rounded-full border-2 ${drawingColor === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                              ))}
                              <div className="h-px bg-white/20 w-full my-1"></div>
                              <button onClick={clearDrawings} className="p-1 text-slate-400 hover:text-red-400"><Eraser size={16} /></button>
                           </div>
                        )}
                     </div>
                  </div>

                  <div className="mt-6 flex items-center gap-4 bg-slate-800/80 p-2 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
                     {renderContextualControls(currentStep, triggerAction, selectNextStudent)}
                  </div>
               </div>
            </div>

            {/* Right: Sidebar */}
            <div className="w-full md:w-80 bg-slate-900 border-l border-slate-800 flex flex-col flex-1 md:flex-none">
               <SidebarPanel
                  activeTab={activeSidebarTab} state={state} currentStep={currentStep}
                  isSpinning={isSpinning} groupCount={groupCount} generatedGroups={generatedGroups}
                  handleSpin={handleSpin} addPoints={addPoints} triggerAction={triggerAction}
                  closeOverlay={closeOverlay} setSelectionMode={setSelectionMode}
                  setGroupCount={setGroupCount} setGeneratedGroups={setGeneratedGroups}
               />
            </div>
         </div>

         {/* Point Tooltip Modal */}
         {activePointStudent && (
            <div className="fixed bottom-24 z-[100]" style={{ left: tooltipLeft, transform: 'translateX(-50%)' }}>
               <div className="animate-slide-up">
                  <div className="bg-white rounded-2xl shadow-2xl p-4 flex flex-col items-center gap-3 w-64 border-4 border-indigo-500/20 relative">
                     <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45"></div>
                     <div className="flex items-center justify-between w-full pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2"><div className="text-2xl">{activePointStudent.avatar}</div><span className="font-bold text-slate-800">{activePointStudent.name}</span></div>
                        <button onClick={() => setActivePointStudentId(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                     </div>
                     <div className="flex items-center gap-2 w-full justify-between">
                        <button onClick={() => addPoints(activePointStudent.id, -5)} className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-bold hover:bg-red-200 active:scale-95 transition-all">-5</button>
                        <button onClick={() => addPoints(activePointStudent.id, -1)} className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold hover:bg-slate-200 active:scale-95 transition-all">-1</button>
                        <div className="w-px h-8 bg-slate-200"></div>
                        <button onClick={() => addPoints(activePointStudent.id, 1)} className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold hover:bg-blue-200 active:scale-95 transition-all">+1</button>
                        <button onClick={() => addPoints(activePointStudent.id, 5)} className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center font-bold hover:bg-green-200 active:scale-95 transition-all">+5</button>
                     </div>
                     <button onClick={() => addPoints(activePointStudent.id, 10)} className="w-full py-2 bg-yellow-400 text-yellow-900 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-yellow-300 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2"><Star size={14} fill="currentColor" /> Super Star (+10)</button>
                  </div>
               </div>
            </div>
         )}

         {/* Bottom Command Deck */}
         <div className="h-auto md:h-24 bg-slate-900 border-t border-slate-800 flex flex-col md:flex-row items-center px-2 md:px-6 py-2 md:py-0 shadow-2xl relative z-40 gap-2 md:gap-4">
            <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto justify-between md:justify-start">
               <button onClick={() => setShowLessonNav(!showLessonNav)} className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center border transition-all active:scale-95 ${showLessonNav ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'}`}><List size={20} className="md:w-6 md:h-6" /></button>
               <div className="flex items-center gap-1 md:gap-3">
                  <button onClick={prevSlide} disabled={state.currentStepIndex === 0} className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-slate-200 border border-slate-700 transition-all active:scale-95"><ChevronLeft size={24} className="md:w-7 md:h-7" /></button>
                  <button onClick={nextSlide} disabled={!nextStep} className="w-16 h-12 md:w-20 md:h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 flex items-center justify-center text-white shadow-lg shadow-indigo-900/30 transition-all active:scale-95"><ChevronRight size={28} className="md:w-8 md:h-8" /></button>
               </div>
            </div>

            <div className="flex-1 w-full px-0 md:px-4 overflow-x-auto no-scrollbar py-1 md:py-0">
               <div className="flex items-center gap-2 md:gap-3 min-w-min mx-auto">
                  {state.students.map((student: any) => (
                     <button key={student.id} onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setTooltipLeft(rect.left + rect.width / 2); setActivePointStudentId(activePointStudentId === student.id ? null : student.id); }}
                        className={`group flex flex-col items-center gap-1 min-w-[50px] md:min-w-[60px] p-1 md:p-2 rounded-xl transition-all active:scale-95 ${activePointStudentId === student.id ? 'bg-indigo-900/50 ring-2 ring-indigo-500' : 'hover:bg-slate-800'}`}>
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-base md:text-lg shadow-sm group-hover:border-green-500/50 group-hover:shadow-[0_0_10px_rgba(34,197,94,0.2)] transition-all relative">
                           {student.avatar}
                           <div className="absolute -top-1 -right-1 w-3 h-3 md:w-4 md:h-4 bg-slate-700 rounded-full flex items-center justify-center text-[6px] md:text-[8px] font-bold text-slate-300 border border-slate-600">{student.points}</div>
                        </div>
                        <span className={`text-[9px] md:text-[10px] font-bold truncate w-full text-center ${activePointStudentId === student.id ? 'text-indigo-300' : 'text-slate-500 group-hover:text-green-400'}`}>{student.name}</span>
                     </button>
                  ))}
               </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3 pl-0 md:pl-4 border-t md:border-t-0 md:border-l border-slate-800 w-full md:w-auto overflow-x-auto pt-2 md:pt-0 justify-between md:justify-start">
               <button onClick={() => setActiveSidebarTab(activeSidebarTab === 'analytics' ? 'notes' : 'analytics')} className={`flex flex-col items-center justify-center w-12 h-10 md:w-16 md:h-14 rounded-xl border transition-all active:scale-95 shrink-0 ${activeSidebarTab === 'analytics' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-emerald-400 hover:bg-slate-700'}`}><Activity size={16} className="md:w-5 md:h-5" /><span className="text-[8px] md:text-[10px] font-bold mt-1">Stats</span></button>
               <button onClick={() => setActiveSidebarTab(activeSidebarTab === 'sounds' ? 'notes' : 'sounds')} className={`flex flex-col items-center justify-center w-12 h-10 md:w-16 md:h-14 rounded-xl border transition-all active:scale-95 shrink-0 ${activeSidebarTab === 'sounds' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-blue-400 hover:bg-slate-700'}`}><Volume2 size={16} className="md:w-5 md:h-5" /><span className="text-[8px] md:text-[9px] font-bold uppercase mt-1">Sound</span></button>
               <button onClick={() => setActiveSidebarTab(activeSidebarTab === 'wheel' ? 'notes' : 'wheel')} className={`flex flex-col items-center justify-center w-12 h-10 md:w-16 md:h-14 rounded-xl border transition-all active:scale-95 shrink-0 ${activeSidebarTab === 'wheel' ? 'bg-yellow-500 border-yellow-400 text-black' : 'bg-slate-800 border-slate-700 text-yellow-400 hover:bg-slate-700'}`}><Zap size={16} className="md:w-5 md:h-5" /><span className="text-[8px] md:text-[9px] font-bold uppercase mt-1">Wheel</span></button>
               <button onClick={() => setActiveSidebarTab(activeSidebarTab === 'groups' ? 'notes' : 'groups')} className={`flex flex-col items-center justify-center w-12 h-10 md:w-16 md:h-14 rounded-xl border transition-all active:scale-95 shrink-0 ${activeSidebarTab === 'groups' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-slate-800 border-slate-700 text-purple-400 hover:bg-slate-700'}`}><LayoutGrid size={16} className="md:w-5 md:h-5" /><span className="text-[8px] md:text-[9px] font-bold uppercase mt-1">Group</span></button>
               <button onClick={toggleQuietMode} className={`flex flex-col items-center justify-center w-12 h-10 md:w-16 md:h-14 rounded-xl border transition-all active:scale-95 shrink-0 ${state.quietModeActive ? 'bg-red-500 text-white border-red-400 animate-pulse' : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border-rose-500/20'}`}>
                  {state.quietModeActive ? <Activity size={16} className="animate-bounce md:w-5 md:h-5" /> : <Bell size={16} className="md:w-5 md:h-5" />}
                  <span className="text-[8px] md:text-[9px] font-bold uppercase mt-1">{state.quietModeActive ? 'Active' : 'Quiet'}</span>
               </button>
            </div>
         </div>
      </div>
   );
};

export default LiveCommander;
