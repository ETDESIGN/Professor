
import React, { useState, useEffect, useRef } from 'react';
import { useSession } from '../../store/SessionContext';
import {
   ChevronLeft, ChevronRight, Play, RotateCw, Volume2,
   Monitor, Clock, LogOut, SkipForward, Zap, PenTool, Eraser,
   Eye, RefreshCw, Check, BarChart2, ArrowLeft, ArrowRight,
   Bell, LayoutGrid, MessageSquare, Lightbulb, FileText,
   Star, Shuffle, Scale, CheckCircle, XCircle, Music, Activity,
   Plus, Minus, X, List, Sparkles, Trophy
} from 'lucide-react';
import DrawingLayer from '../../components/shared/DrawingLayer';

// Board Templates for Live Preview
import BoardMediaPlayer from '../board/templates/BoardMediaPlayer';
import BoardFocusCards from '../board/templates/BoardFocusCards';
import BoardStoryStage from '../board/templates/BoardStoryStage';
import BoardGameArena from '../board/templates/BoardGameArena';
import BoardGrammarSandbox from '../board/templates/BoardGrammarSandbox';
import BoardTeamBattle from '../board/templates/BoardTeamBattle';
import BoardIntroSplash from '../board/templates/BoardIntroSplash';
import BoardUnscramble from '../board/templates/BoardUnscramble';
import BoardWhatsMissing from '../board/templates/BoardWhatsMissing';
import BoardSpeedQuiz from '../board/templates/BoardSpeedQuiz';
import BoardStorySequencing from '../board/templates/BoardStorySequencing';
import BoardISayYouSay from '../board/templates/BoardISayYouSay';
import BoardLiveClassWarmup from '../board/templates/BoardLiveClassWarmup';
import BoardMagicEyes from '../board/templates/BoardMagicEyes';
import BoardUnitSelection from '../board/templates/BoardUnitSelection';
import BoardPoll from '../board/templates/BoardPoll';
import BoardWheelOfDestiny from '../board/templates/BoardWheelOfDestiny';

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

   // CRITICAL FIX: Use state.activeSlideData instead of MOCK_LESSON_FLOW
   const currentStep = state.activeSlideData;
   const activeFlow = state.activeUnit?.flow || [];
   const nextStep = activeFlow[state.currentStepIndex + 1];

   // Safety check
   if (!currentStep) return <div className="text-white p-8 bg-slate-900 h-screen flex items-center justify-center">Loading Session...</div>;

   const guide = currentStep.teacherGuide;

   const [elapsedTime, setElapsedTime] = useState(0);
   const [isDrawingMode, setIsDrawingMode] = useState(false);
   const [drawingColor, setDrawingColor] = useState('#ef4444');

   // Sidebar State
   const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>('notes');
   const [showLessonNav, setShowLessonNav] = useState(false);

   // Point Tooltip State
   const [activePointStudentId, setActivePointStudentId] = useState<string | null>(null);
   const [tooltipLeft, setTooltipLeft] = useState<number>(0);

   // Local states for sub-features
   const [isSpinning, setIsSpinning] = useState(false);
   const [groupCount, setGroupCount] = useState(2);
   const [generatedGroups, setGeneratedGroups] = useState<any[][]>([]);

   // Quiet Mode Logic Hooks
   const audioContextRef = useRef<AudioContext | null>(null);
   const analyserRef = useRef<AnalyserNode | null>(null);
   const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
   const rafRef = useRef<number | null>(null);
   const penaltyTimerRef = useRef<any>(null);

   // Config
   const NOISE_THRESHOLD = 40; // 0-100 scale
   const GRACE_PERIOD = 10000; // 10 seconds before penalties start
   const [quietTimer, setQuietTimer] = useState(GRACE_PERIOD / 1000);

   // AI Intervention State
   const [showAiSuggestion, setShowAiSuggestion] = useState(false);
   const [aiSuggestionText, setAiSuggestionText] = useState("");

   useEffect(() => {
      const timer = setInterval(() => setElapsedTime(t => t + 1), 1000);
      return () => clearInterval(timer);
   }, []);

   // Simulate AI Intervention Trigger
   useEffect(() => {
      const aiTimer = setTimeout(() => {
         setAiSuggestionText("4 students are struggling with 'Orbit'. Generate a quick review slide?");
         setShowAiSuggestion(true);
      }, 15000); // Trigger after 15 seconds

      return () => clearTimeout(aiTimer);
   }, []);

   const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
   };

   // --- Quiet Mode Handling ---

   const startQuietMode = async () => {
      try {
         const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
         audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
         analyserRef.current = audioContextRef.current.createAnalyser();
         microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream);

         microphoneRef.current.connect(analyserRef.current);
         analyserRef.current.fftSize = 256;

         setQuietMode(true);
         setQuietTimer(GRACE_PERIOD / 1000);

         const bufferLength = analyserRef.current.frequencyBinCount;
         const dataArray = new Uint8Array(bufferLength);

         const updateLoop = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);

            // Calculate average volume
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
               sum += dataArray[i];
            }
            const average = sum / bufferLength;
            const normalized = Math.min(100, Math.round((average / 255) * 100 * 2.5)); // Boost sensitivity

            updateNoiseLevel(normalized);
            rafRef.current = requestAnimationFrame(updateLoop);
         };

         updateLoop();

         // Start Countdown / Penalty Logic
         let timeLeft = GRACE_PERIOD / 1000;
         penaltyTimerRef.current = setInterval(() => {
            // Decrease timer
            if (timeLeft > 0) {
               timeLeft -= 1;
               setQuietTimer(timeLeft);
            }
         }, 1000);

         // Separate Penalty Checker (Runs more frequently)
         const penaltyCheck = setInterval(() => {
            if (timeLeft <= 0) {
               // We need the current noise level. We can't get it from state easily in interval closure.
               // Let's use the Analyser directly if possible.
               if (analyserRef.current) {
                  const bLen = analyserRef.current.frequencyBinCount;
                  const dArr = new Uint8Array(bLen);
                  analyserRef.current.getByteFrequencyData(dArr);
                  let s = 0;
                  for (let i = 0; i < bLen; i++) s += dArr[i];
                  const avg = s / bLen;
                  const lvl = Math.min(100, Math.round((avg / 255) * 100 * 2.5));

                  if (lvl > NOISE_THRESHOLD) {
                     deductAllPoints(5); // Lose 5 XP
                  }
               }
            }
         }, 2000);

         // Store interval ID to clear later (hacky for prototype to store on window or ref)
         (window as any).quietPenaltyInterval = penaltyCheck;

      } catch (err) {
         console.error("Mic Error", err);
         alert("Microphone access required for Quiet Mode.");
      }
   };

   const stopQuietMode = () => {
      setQuietMode(false);
      updateNoiseLevel(0);

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (penaltyTimerRef.current) clearInterval(penaltyTimerRef.current);
      if ((window as any).quietPenaltyInterval) clearInterval((window as any).quietPenaltyInterval);

      if (audioContextRef.current) audioContextRef.current.close();
      audioContextRef.current = null;
   };

   const toggleQuietMode = () => {
      if (state.quietModeActive) {
         stopQuietMode();
      } else {
         startQuietMode();
      }
   };

   // Wheel Logic
   const handleSpin = () => {
      setIsSpinning(true);
      selectNextStudent(undefined, true); // Use overlay
      // Simulate spin time to match board
      setTimeout(() => {
         setIsSpinning(false);
      }, 2000);
   };

   // Group Logic
   const generateGroups = () => {
      const shuffled = [...(state.students || [])].sort(() => Math.random() - 0.5);
      const newGroups: any[][] = Array.from({ length: groupCount }, () => []);
      shuffled.forEach((student, index) => {
         newGroups[index % groupCount].push(student);
      });
      setGeneratedGroups(newGroups);
      triggerAction('GROUPS_UPDATED', { groups: newGroups });
   };

   // Render the actual board component for preview
   const renderLiveBoard = () => {
      const data = currentStep.data;
      switch (currentStep.type) {
         case 'INTRO_SPLASH': return <BoardIntroSplash data={data} />;
         case 'MEDIA_PLAYER': return <BoardMediaPlayer data={data} />;
         case 'LIVE_WARMUP': return <BoardLiveClassWarmup data={data} />;
         case 'FOCUS_CARDS': return <BoardFocusCards data={data} />;
         case 'GAME_ARENA': return <BoardGameArena data={data} />;
         case 'STORY_STAGE': return <BoardStoryStage data={data} />;
         case 'GRAMMAR_SANDBOX': return <BoardGrammarSandbox data={data} />;
         case 'TEAM_BATTLE': return <BoardTeamBattle data={data} />;
         case 'UNSCRAMBLE': return <BoardUnscramble data={data} />;
         case 'WHATS_MISSING': return <BoardWhatsMissing data={data} />;
         case 'SPEED_QUIZ': return <BoardSpeedQuiz data={data} />;
         case 'STORY_SEQUENCING': return <BoardStorySequencing data={data} />;
         case 'I_SAY_YOU_SAY': return <BoardISayYouSay data={data} />;
         case 'MAGIC_EYES': return <BoardMagicEyes data={data} />;
         case 'POLL': return <BoardPoll data={data} />;
         case 'WHEEL_OF_DESTINY': return <BoardWheelOfDestiny data={data} />;
         case 'UNIT_SELECTION': return <BoardUnitSelection />;
         default: return (
            <div className="flex flex-col items-center justify-center h-full text-white bg-slate-900">
               <div className="text-2xl font-bold mb-2">Unknown Slide Type</div>
               <div className="font-mono text-slate-500">{currentStep.type}</div>
            </div>
         );
      }
   };

   // Dynamic Actions based on current slide type
   const renderContextualControls = () => {
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
               <button
                  onClick={() => selectNextStudent(undefined, false)}
                  className="h-12 px-6 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-yellow-900/20 active:scale-95 transition-all"
               >
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
         case 'WHATS_MISSING':
         case 'MAGIC_EYES':
            return (
               <div className="flex gap-2">
                  <button onClick={() => triggerAction('REVEAL')} className="h-12 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg active:scale-95">
                     <Eye size={20} /> Reveal
                  </button>
                  <button onClick={() => triggerAction('RESTART')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95">
                     <RefreshCw size={20} /> Reset
                  </button>
               </div>
            );
         case 'POLL':
            return (
               <div className="flex gap-2">
                  <button onClick={() => triggerAction('SHOW_RESULTS')} className="h-12 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg active:scale-95">
                     <BarChart2 size={20} /> Show Results
                  </button>
                  <button onClick={() => triggerAction('RESET_TIMER')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95">
                     <Clock size={20} /> Reset
                  </button>
               </div>
            );
         case 'UNSCRAMBLE':
         case 'STORY_SEQUENCING':
            return (
               <div className="flex gap-2">
                  <button onClick={() => triggerAction('CHECK_ANSWER')} className="h-12 px-6 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg active:scale-95">
                     <Check size={20} /> Check Answer
                  </button>
                  <button onClick={() => triggerAction('RESET_GAME')} className="h-12 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center gap-2 active:scale-95">
                     <RefreshCw size={20} /> Reset
                  </button>
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

   const renderSidebarContent = () => {
      switch (activeSidebarTab) {
         case 'wheel': {
            const winner = state.quickWheelWinner ? state.students.find(s => s.id === state.quickWheelWinner) : null;
            return (
               <div className="flex flex-col h-full p-5">
                  <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
                     <RotateCw className="text-yellow-400" /> Quick Picker
                  </h3>

                  {/* Controls */}
                  <div className="flex bg-slate-800 p-1 rounded-xl mb-6">
                     <button
                        onClick={() => setSelectionMode('FAIR')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${state.selectionMode === 'FAIR' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400'}`}
                     >
                        <Scale size={14} /> Fair
                     </button>
                     <button
                        onClick={() => setSelectionMode('RANDOM')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${state.selectionMode === 'RANDOM' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400'}`}
                     >
                        <RefreshCw size={14} /> Random
                     </button>
                  </div>

                  {/* Main Area */}
                  <div className="flex-1 flex flex-col items-center justify-center mb-6">
                     {winner && !isSpinning ? (
                        <div className="flex flex-col items-center animate-slide-up">
                           <div className="w-24 h-24 rounded-full border-4 border-yellow-400 shadow-xl flex items-center justify-center text-5xl bg-slate-800 mb-4">
                              {winner.avatar}
                           </div>
                           <h3 className="text-2xl font-bold text-white mb-6">{winner.name}</h3>
                           <div className="grid grid-cols-2 gap-3 w-full">
                              <button
                                 onClick={() => addPoints(winner.id, 10)}
                                 className="bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
                              >
                                 <Star size={16} fill="currentColor" /> +10
                              </button>
                              <button
                                 onClick={() => addPoints(winner.id, 50)}
                                 className="bg-yellow-600 hover:bg-yellow-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
                              >
                                 <Zap size={16} fill="currentColor" /> +50
                              </button>
                           </div>
                        </div>
                     ) : (
                        <button
                           onClick={handleSpin}
                           disabled={isSpinning}
                           className={`
                         w-40 h-40 rounded-full border-8 border-slate-700 flex flex-col items-center justify-center shadow-xl transition-all active:scale-95
                         ${isSpinning ? 'animate-spin border-t-yellow-400' : 'bg-gradient-to-br from-yellow-500 to-orange-600 hover:scale-105 text-white'}
                      `}
                        >
                           {isSpinning ? <span className="text-2xl">🎲</span> : <span className="font-black text-xl tracking-widest">SPIN</span>}
                        </button>
                     )}
                  </div>

                  {winner && !isSpinning && (
                     <button onClick={closeOverlay} className="w-full bg-slate-800 text-slate-400 font-bold py-3 rounded-xl hover:bg-slate-700">
                        Close Overlay
                     </button>
                  )}
               </div>
            );
         }

         case 'sounds':
            return (
               <div className="flex flex-col h-full p-5">
                  <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
                     <Volume2 className="text-blue-400" /> Sound Board
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                     {[
                        { label: 'Correct', icon: CheckCircle, color: 'text-green-400', action: 'SOUND_CORRECT' },
                        { label: 'Wrong', icon: XCircle, color: 'text-red-400', action: 'SOUND_WRONG' },
                        { label: 'Ding', icon: Bell, color: 'text-yellow-400', action: 'SOUND_DING' },
                        { label: 'Drumroll', icon: Music, color: 'text-purple-400', action: 'SOUND_DRUMROLL' },
                        { label: 'Win', icon: Star, color: 'text-blue-400', action: 'SOUND_WIN' },
                        { label: 'Zap', icon: Zap, color: 'text-orange-400', action: 'SOUND_ZAP' },
                     ].map((sound, i) => (
                        <button
                           key={i}
                           onClick={() => triggerAction(sound.action)}
                           className="aspect-square bg-slate-800 rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-slate-700 active:scale-95 transition-all border border-slate-700 hover:border-slate-600"
                        >
                           <sound.icon size={24} className={sound.color} />
                           <span className="text-xs font-bold text-slate-300">{sound.label}</span>
                        </button>
                     ))}
                  </div>

                  <div className="mt-8 pt-6 border-t border-slate-800 space-y-3">
                     <button
                        onClick={() => triggerAction('CELEBRATE')}
                        className="w-full bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 hover:from-pink-400 hover:via-purple-400 hover:to-indigo-400 text-white font-bold py-4 rounded-xl shadow-lg shadow-purple-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                     >
                        <Sparkles size={20} /> Trigger Celebration
                     </button>
                     <button
                        onClick={() => {
                           state.students.forEach(s => addPoints(s.id, 5));
                           triggerAction('CELEBRATE');
                        }}
                        className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                     >
                        <Trophy size={20} /> +5 XP to Everyone
                     </button>
                  </div>
               </div>
            );

         case 'groups':
            return (
               <div className="flex flex-col h-full p-5">
                  <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
                     <LayoutGrid className="text-purple-400" /> Group Maker
                  </h3>

                  <div className="flex items-center justify-between mb-6 bg-slate-800 p-2 rounded-xl">
                     <span className="text-sm font-bold text-slate-300 px-2">Groups:</span>
                     <div className="flex gap-1">
                        {[2, 3, 4, 5, 6].map(num => (
                           <button
                              key={num}
                              onClick={() => setGroupCount(num)}
                              className={`w-8 h-8 rounded-lg font-bold text-sm ${groupCount === num ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                           >
                              {num}
                           </button>
                        ))}
                     </div>
                  </div>

                  <button
                     onClick={generateGroups}
                     className="w-full bg-white text-purple-900 font-bold py-3 rounded-xl mb-6 flex items-center justify-center gap-2 hover:bg-purple-50 active:scale-95 transition-all"
                  >
                     <Shuffle size={16} /> Shuffle & Project
                  </button>

                  <div className="flex-1 overflow-y-auto space-y-3">
                     {generatedGroups.map((group, i) => (
                        <div key={i} className="bg-slate-800 rounded-xl p-3 border border-slate-700">
                           <div className="text-xs font-bold text-slate-500 uppercase mb-2 flex justify-between">
                              <span>Group {i + 1}</span>
                              <span className="bg-slate-700 px-1.5 rounded text-white">{group.length}</span>
                           </div>
                           <div className="flex flex-wrap gap-2">
                              {group.map((s: any) => (
                                 <span key={s.id} className="text-sm text-slate-300 bg-slate-700/50 px-2 py-1 rounded">
                                    {s.avatar} {s.name}
                                 </span>
                              ))}
                           </div>
                        </div>
                     ))}
                     {generatedGroups.length === 0 && (
                        <div className="text-center text-slate-600 text-sm py-8">
                           Tap shuffle to create groups
                        </div>
                     )}
                  </div>
               </div>
            );

         case 'analytics':
            return (
               <div className="flex flex-col h-full p-5">
                  <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
                     <Activity className="text-emerald-400" /> Live Analytics
                  </h3>
                  <div className="flex-1 overflow-y-auto space-y-4">
                     <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                        <div className="text-xs font-bold text-slate-400 uppercase mb-2">Class Accuracy</div>
                        <div className="text-3xl font-bold text-white mb-2">85%</div>
                        <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                           <div className="h-full bg-emerald-500 w-[85%]"></div>
                        </div>
                     </div>

                     <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                        <div className="text-xs font-bold text-slate-400 uppercase mb-3">Struggling Students</div>
                        <div className="space-y-2">
                           {state.students.filter(s => s.points < 50).map(s => (
                              <div key={s.id} className="flex items-center justify-between text-sm">
                                 <div className="flex items-center gap-2">
                                    <span>{s.avatar}</span>
                                    <span className="text-slate-300">{s.name}</span>
                                 </div>
                                 <span className="text-red-400 font-bold">{s.points} pts</span>
                              </div>
                           ))}
                           {state.students.filter(s => s.points < 50).length === 0 && (
                              <div className="text-slate-500 text-sm">No students currently struggling.</div>
                           )}
                        </div>
                     </div>

                     <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                        <div className="text-xs font-bold text-slate-400 uppercase mb-3">Vocabulary Mastery</div>
                        <div className="space-y-3">
                           <div>
                              <div className="flex justify-between text-xs mb-1">
                                 <span className="text-slate-300">Astronaut</span>
                                 <span className="text-emerald-400">92%</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                 <div className="h-full bg-emerald-500 w-[92%]"></div>
                              </div>
                           </div>
                           <div>
                              <div className="flex justify-between text-xs mb-1">
                                 <span className="text-slate-300">Gravity</span>
                                 <span className="text-yellow-400">65%</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                 <div className="h-full bg-yellow-500 w-[65%]"></div>
                              </div>
                           </div>
                           <div>
                              <div className="flex justify-between text-xs mb-1">
                                 <span className="text-slate-300">Orbit</span>
                                 <span className="text-red-400">40%</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                 <div className="h-full bg-red-500 w-[40%]"></div>
                              </div>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
            );

         case 'notes':
         default:
            return (
               <div className="flex flex-col h-full">
                  <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                     <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <MessageSquare size={14} /> Teacher Notes
                     </span>
                     <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded">Private</span>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5">
                     {/* Slide Info */}
                     <div className="mb-6">
                        <h3 className="text-white font-bold text-lg leading-tight mb-1">{currentStep.title}</h3>
                        <div className="text-slate-500 text-xs">Est. Duration: {Math.round(currentStep.duration / 60)} min</div>
                     </div>

                     {/* Dynamic Guide */}
                     {guide ? (
                        <div className="space-y-6">
                           <div className="bg-indigo-900/20 p-4 rounded-xl border border-indigo-500/30">
                              <h4 className="text-indigo-400 font-bold text-xs uppercase mb-2 flex items-center gap-2">
                                 <Monitor size={14} /> Instructions
                              </h4>
                              <p className="text-slate-300 text-sm leading-relaxed">{guide.instruction}</p>
                           </div>

                           <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                              <h4 className="text-white font-bold text-xs uppercase mb-2 flex items-center gap-2">
                                 <FileText size={14} /> Script
                              </h4>
                              <p className="text-slate-300 text-sm italic border-l-2 border-slate-600 pl-3">"{guide.script}"</p>
                           </div>

                           {guide.answerKey && (
                              <div className="bg-emerald-900/20 p-4 rounded-xl border border-emerald-500/30">
                                 <h4 className="text-emerald-400 font-bold text-xs uppercase mb-2 flex items-center gap-2">
                                    <Check size={14} /> Answer Key
                                 </h4>
                                 <div className="font-mono text-sm text-emerald-200">{guide.answerKey}</div>
                              </div>
                           )}
                        </div>
                     ) : (
                        <div className="text-center text-slate-500 py-8 text-sm">
                           No notes available.
                        </div>
                     )}
                  </div>
               </div>
            );
      }
   };

   const activePointStudent = state.students.find(s => s.id === activePointStudentId);

   return (
      <div className="h-screen bg-slate-950 text-white flex flex-col font-sans overflow-hidden">

         {/* 1. Header Bar */}
         <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 z-30">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Monitor size={16} className="text-white" />
               </div>
               <div>
                  <h1 className="font-bold text-sm leading-tight text-slate-200">Live Commander</h1>
                  <div className="flex items-center gap-2 text-[10px] text-indigo-400 font-mono">
                     <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                     ROOM-304
                  </div>
               </div>
            </div>

            <div className="flex items-center gap-4">
               {/* Quiet Mode Indicator (On Preview) */}
               {state.quietModeActive && (
                  <div className="flex items-center gap-2 bg-red-900/50 px-3 py-1.5 rounded-full border border-red-500 animate-pulse">
                     <Bell size={14} className="text-red-400" />
                     <span className="font-bold text-sm text-red-200 uppercase tracking-widest">Quiet: {quietTimer}s</span>
                     {/* Mini Meter */}
                     <div className="w-12 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full transition-all ${state.noiseLevel > 40 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${state.noiseLevel}%` }}></div>
                     </div>
                  </div>
               )}

               <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
                  <Clock size={14} className="text-slate-400" />
                  <span className="font-mono font-bold text-sm text-slate-200">{formatTime(elapsedTime)}</span>
               </div>

               <button
                  onClick={() => {
                     endSession();
                     if (onExit) onExit();
                  }}
                  className="text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-colors"
                  title="End Session"
               >
                  <LogOut size={18} />
               </button>
            </div>
         </header>

         {/* 2. Main Workspace (Split View) */}
         <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

            {/* New: Lesson Navigation Sidebar */}
            <div className={`absolute top-0 bottom-0 left-0 w-72 bg-slate-900 border-r border-slate-800 z-50 transform transition-transform duration-300 ${showLessonNav ? 'translate-x-0' : '-translate-x-full'}`}>
               <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                  <span className="font-bold text-slate-300 uppercase text-xs tracking-wider">Lesson Roadmap</span>
                  <button onClick={() => setShowLessonNav(false)} className="text-slate-500 hover:text-white"><X size={16} /></button>
               </div>
               <div className="overflow-y-auto h-full pb-20">
                  {activeFlow.map((step: any, idx: number) => (
                     <button
                        key={step.id || idx}
                        onClick={() => { goToSlide(idx); setShowLessonNav(false); }}
                        className={`w-full text-left p-4 border-b border-slate-800 flex items-center gap-3 hover:bg-slate-800 transition-colors ${state.currentStepIndex === idx ? 'bg-slate-800 border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'}`}
                     >
                        <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${state.currentStepIndex === idx ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                           {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                           <div className={`text-sm font-bold truncate ${state.currentStepIndex === idx ? 'text-white' : 'text-slate-400'}`}>{step.title}</div>
                           <div className="text-[10px] text-slate-600 uppercase font-bold">{step.type.replace('_', ' ')}</div>
                        </div>
                        {state.currentStepIndex === idx && <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>}
                     </button>
                  ))}
               </div>
            </div>

            {/* Left: Preview Monitor (Hidden on mobile) */}
            <div className="hidden md:flex flex-1 flex-col bg-black/20 relative">
               <div className="flex-1 p-6 flex flex-col items-center justify-center relative">

                  {/* AI Suggestion Toast */}
                  {showAiSuggestion && (
                     <div className="absolute top-6 right-6 z-50 animate-slide-down max-w-sm">
                        <div className="bg-indigo-900/90 backdrop-blur-md border border-indigo-500/50 rounded-2xl p-4 shadow-2xl shadow-indigo-900/50 flex gap-4 items-start">
                           <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                              <Sparkles size={20} className="text-indigo-300" />
                           </div>
                           <div className="flex-1">
                              <h4 className="text-indigo-300 font-bold text-xs uppercase tracking-wider mb-1 flex items-center gap-2">
                                 AI Co-Pilot
                                 <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
                              </h4>
                              <p className="text-white text-sm leading-snug mb-3">
                                 {aiSuggestionText}
                              </p>
                              <div className="flex gap-2">
                                 <button
                                    onClick={() => {
                                       setShowAiSuggestion(false);
                                       // In a real app, this would trigger a slide generation
                                       alert("Generating review slide...");
                                    }}
                                    className="flex-1 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors"
                                 >
                                    Generate
                                 </button>
                                 <button
                                    onClick={() => setShowAiSuggestion(false)}
                                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
                                 >
                                    Dismiss
                                 </button>
                              </div>
                           </div>
                        </div>
                     </div>
                  )}

                  {/* 16:9 Preview Container */}
                  <div className="w-full max-w-5xl aspect-video bg-black rounded-xl shadow-2xl border border-slate-800 relative overflow-hidden group">

                     {/* Drawing Layer */}
                     <DrawingLayer
                        isInteractive={isDrawingMode}
                        color={drawingColor}
                        className="z-20"
                     />

                     {/* Real-time Slide Content Mirror */}
                     <div className="absolute inset-0 overflow-hidden z-10 pointer-events-auto select-none">
                        <div className="w-[200%] h-[200%] origin-top-left transform scale-50">
                           {renderLiveBoard()}
                        </div>
                     </div>

                     {/* Status Overlay */}
                     <div className="absolute top-3 left-3 flex gap-2 pointer-events-none z-30">
                        <div className="bg-red-600/90 backdrop-blur px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm flex items-center gap-1">
                           <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div> LIVE
                        </div>
                        {isDrawingMode && (
                           <div className="bg-indigo-600/90 backdrop-blur px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm">
                              PEN ACTIVE
                           </div>
                        )}
                     </div>

                     {/* Pen Tools (Floating in Preview) */}
                     <div className="absolute top-3 right-3 flex flex-col gap-2 z-30">
                        <button
                           onClick={() => setIsDrawingMode(!isDrawingMode)}
                           className={`p-2 rounded-lg transition-colors shadow-lg ${isDrawingMode ? 'bg-white text-indigo-600' : 'bg-black/50 text-white hover:bg-black/70'}`}
                        >
                           <PenTool size={16} />
                        </button>
                        {isDrawingMode && (
                           <div className="bg-black/80 backdrop-blur p-2 rounded-lg border border-white/10 flex flex-col gap-2 animate-slide-down">
                              {['#ef4444', '#3b82f6', '#10b981', '#f59e0b'].map(c => (
                                 <button
                                    key={c}
                                    onClick={() => setDrawingColor(c)}
                                    className={`w-6 h-6 rounded-full border-2 ${drawingColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                                    style={{ backgroundColor: c }}
                                 />
                              ))}
                              <div className="h-px bg-white/20 w-full my-1"></div>
                              <button onClick={clearDrawings} className="p-1 text-slate-400 hover:text-red-400">
                                 <Eraser size={16} />
                              </button>
                           </div>
                        )}
                     </div>
                  </div>

                  {/* Action Bar (Contextual) */}
                  <div className="mt-6 flex items-center gap-4 bg-slate-800/80 p-2 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
                     {renderContextualControls()}
                  </div>

               </div>
            </div>

            {/* Right: The Sidebar Tab System (Full width on mobile) */}
            <div className="w-full md:w-80 bg-slate-900 border-l border-slate-800 flex flex-col flex-1 md:flex-none">
               {renderSidebarContent()}
            </div>
         </div>

         {/* Point Tooltip Modal (Fixed Positioning above bottom bar) */}
         {activePointStudent && (
            <div
               className="fixed bottom-24 z-[100]"
               style={{ left: tooltipLeft, transform: 'translateX(-50%)' }} // Positioning Wrapper
            >
               <div className="animate-slide-up"> {/* Animation Wrapper */}
                  <div className="bg-white rounded-2xl shadow-2xl p-4 flex flex-col items-center gap-3 w-64 border-4 border-indigo-500/20 relative">
                     {/* Arrow */}
                     <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45"></div>

                     {/* Header */}
                     <div className="flex items-center justify-between w-full pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                           <div className="text-2xl">{activePointStudent.avatar}</div>
                           <span className="font-bold text-slate-800">{activePointStudent.name}</span>
                        </div>
                        <button onClick={() => setActivePointStudentId(null)} className="text-slate-400 hover:text-slate-600">
                           <X size={16} />
                        </button>
                     </div>

                     {/* Controls */}
                     <div className="flex items-center gap-2 w-full justify-between">
                        <button
                           onClick={() => addPoints(activePointStudent.id, -5)}
                           className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-bold hover:bg-red-200 active:scale-95 transition-all"
                        >
                           -5
                        </button>
                        <button
                           onClick={() => addPoints(activePointStudent.id, -1)}
                           className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold hover:bg-slate-200 active:scale-95 transition-all"
                        >
                           -1
                        </button>
                        <div className="w-px h-8 bg-slate-200"></div>
                        <button
                           onClick={() => addPoints(activePointStudent.id, 1)}
                           className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold hover:bg-blue-200 active:scale-95 transition-all"
                        >
                           +1
                        </button>
                        <button
                           onClick={() => addPoints(activePointStudent.id, 5)}
                           className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center font-bold hover:bg-green-200 active:scale-95 transition-all"
                        >
                           +5
                        </button>
                     </div>

                     <button
                        onClick={() => addPoints(activePointStudent.id, 10)}
                        className="w-full py-2 bg-yellow-400 text-yellow-900 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-yellow-300 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2"
                     >
                        <Star size={14} fill="currentColor" /> Super Star (+10)
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* 3. Bottom Command Deck */}
         <div className="h-auto md:h-24 bg-slate-900 border-t border-slate-800 flex flex-col md:flex-row items-center px-2 md:px-6 py-2 md:py-0 shadow-2xl relative z-40 gap-2 md:gap-4">

            {/* Transport */}
            <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto justify-between md:justify-start">
               <button
                  onClick={() => setShowLessonNav(!showLessonNav)}
                  className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center border transition-all active:scale-95 ${showLessonNav ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
               >
                  <List size={20} className="md:w-6 md:h-6" />
               </button>
               <div className="flex items-center gap-1 md:gap-3">
                  <button
                     onClick={prevSlide}
                     disabled={state.currentStepIndex === 0}
                     className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-slate-200 border border-slate-700 transition-all active:scale-95"
                  >
                     <ChevronLeft size={24} className="md:w-7 md:h-7" />
                  </button>
                  <button
                     onClick={nextSlide}
                     disabled={!nextStep}
                     className="w-16 h-12 md:w-20 md:h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 flex items-center justify-center text-white shadow-lg shadow-indigo-900/30 transition-all active:scale-95"
                  >
                     <ChevronRight size={28} className="md:w-8 md:h-8" />
                  </button>
               </div>
            </div>

            {/* Center: Point Pad (Student Quick List) */}
            <div className="flex-1 w-full px-0 md:px-4 overflow-x-auto no-scrollbar py-1 md:py-0">
               <div className="flex items-center gap-2 md:gap-3 min-w-min mx-auto">
                  {state.students.map((student) => (
                     <button
                        key={student.id}
                        onClick={(e) => {
                           // Capture button position for tooltip
                           const rect = e.currentTarget.getBoundingClientRect();
                           setTooltipLeft(rect.left + rect.width / 2);
                           setActivePointStudentId(activePointStudentId === student.id ? null : student.id);
                        }}
                        className={`group flex flex-col items-center gap-1 min-w-[50px] md:min-w-[60px] p-1 md:p-2 rounded-xl transition-all active:scale-95 ${activePointStudentId === student.id ? 'bg-indigo-900/50 ring-2 ring-indigo-500' : 'hover:bg-slate-800'}`}
                     >
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-base md:text-lg shadow-sm group-hover:border-green-500/50 group-hover:shadow-[0_0_10px_rgba(34,197,94,0.2)] transition-all relative">
                           {student.avatar}
                           <div className="absolute -top-1 -right-1 w-3 h-3 md:w-4 md:h-4 bg-slate-700 rounded-full flex items-center justify-center text-[6px] md:text-[8px] font-bold text-slate-300 border border-slate-600">
                              {student.points}
                           </div>
                           {state.lastAction?.type === 'MASS_PENALTY' && (
                              <div className="absolute inset-0 flex items-center justify-center text-red-500 font-black text-[10px] md:text-xs animate-ping">
                                 -5
                              </div>
                           )}
                        </div>
                        <span className={`text-[9px] md:text-[10px] font-bold truncate w-full text-center ${activePointStudentId === student.id ? 'text-indigo-300' : 'text-slate-500 group-hover:text-green-400'}`}>
                           {student.name}
                        </span>
                     </button>
                  ))}
               </div>
            </div>

            {/* Right: God Tools (Now Switch Tabs) */}
            <div className="flex items-center gap-2 md:gap-3 pl-0 md:pl-4 border-t md:border-t-0 md:border-l border-slate-800 w-full md:w-auto overflow-x-auto pt-2 md:pt-0 justify-between md:justify-start">
               <button
                  onClick={() => setActiveSidebarTab(activeSidebarTab === 'analytics' ? 'notes' : 'analytics')}
                  className={`flex flex-col items-center justify-center w-12 h-10 md:w-16 md:h-14 rounded-xl border transition-all active:scale-95 shrink-0 ${activeSidebarTab === 'analytics' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-emerald-400 hover:bg-slate-700'}`}
               >
                  <Activity size={16} className="md:w-5 md:h-5" />
                  <span className="text-[8px] md:text-[10px] font-bold mt-1">Stats</span>
               </button>
               <button
                  onClick={() => setActiveSidebarTab(activeSidebarTab === 'sounds' ? 'notes' : 'sounds')}
                  className={`flex flex-col items-center justify-center w-12 h-10 md:w-16 md:h-14 rounded-xl border transition-all active:scale-95 shrink-0 ${activeSidebarTab === 'sounds' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-blue-400 hover:bg-slate-700'}`}
               >
                  <Volume2 size={16} className="md:w-5 md:h-5" />
                  <span className="text-[8px] md:text-[9px] font-bold uppercase mt-1">Sound</span>
               </button>
               <button
                  onClick={() => setActiveSidebarTab(activeSidebarTab === 'wheel' ? 'notes' : 'wheel')}
                  className={`flex flex-col items-center justify-center w-12 h-10 md:w-16 md:h-14 rounded-xl border transition-all active:scale-95 shrink-0 ${activeSidebarTab === 'wheel' ? 'bg-yellow-500 border-yellow-400 text-black' : 'bg-slate-800 border-slate-700 text-yellow-400 hover:bg-slate-700'}`}
               >
                  <Zap size={16} className="md:w-5 md:h-5" />
                  <span className="text-[8px] md:text-[9px] font-bold uppercase mt-1">Wheel</span>
               </button>
               <button
                  onClick={() => setActiveSidebarTab(activeSidebarTab === 'groups' ? 'notes' : 'groups')}
                  className={`flex flex-col items-center justify-center w-12 h-10 md:w-16 md:h-14 rounded-xl border transition-all active:scale-95 shrink-0 ${activeSidebarTab === 'groups' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-slate-800 border-slate-700 text-purple-400 hover:bg-slate-700'}`}
               >
                  <LayoutGrid size={16} className="md:w-5 md:h-5" />
                  <span className="text-[8px] md:text-[9px] font-bold uppercase mt-1">Group</span>
               </button>
               <button
                  onClick={toggleQuietMode}
                  className={`
                  flex flex-col items-center justify-center w-12 h-10 md:w-16 md:h-14 rounded-xl border transition-all active:scale-95 shrink-0
                  ${state.quietModeActive ? 'bg-red-500 text-white border-red-400 animate-pulse' : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border-rose-500/20'}
               `}
               >
                  {state.quietModeActive ? <Activity size={16} className="animate-bounce md:w-5 md:h-5" /> : <Bell size={16} className="md:w-5 md:h-5" />}
                  <span className="text-[8px] md:text-[9px] font-bold uppercase mt-1">{state.quietModeActive ? 'Active' : 'Quiet'}</span>
               </button>
            </div>

         </div>
      </div>
   );
};

export default LiveCommander;
