
import React, { useState, useRef } from 'react';
import { useSession } from '../../store/SessionContext';
import { ChevronLeft, ChevronRight, Wifi, Mic, VolumeX, Star, Zap, MonitorPlay, Camera, X, FileText, Play, Eye, RotateCw, RefreshCw, Clock, ArrowRight, ArrowLeft, Check, Volume2, BarChart2, PenTool, Eraser, LogOut } from 'lucide-react';
import StudentSelectorModal from '../teacher/StudentSelectorModal';
import RemoteConnect from './RemoteConnect';
import SoundBoardModal from './SoundBoardModal';
import VoiceCommandModal from './VoiceCommandModal';
import QuickSpinModal from './QuickSpinModal';
import DrawingLayer from '../../components/shared/DrawingLayer';

const TeacherRemote: React.FC = () => {
  const { state, nextSlide, prevSlide, addPoints, toggleConnection, setLiveSnap, triggerAction, clearDrawings, selectNextStudent, magicSelectStudent } = useSession();
  
  // CRITICAL FIX: Use state.activeSlideData instead of MOCK_LESSON_FLOW
  const currentStep = state.activeSlideData;
  
  // Calculate next step safely
  const activeFlow = state.activeUnit?.flow || [];
  const nextStep = activeFlow[state.currentStepIndex + 1];
  
  const [hasConnected, setHasConnected] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showPointSelector, setShowPointSelector] = useState(false);
  const [showSoundBoard, setShowSoundBoard] = useState(false);
  const [showVoiceCommand, setShowVoiceCommand] = useState(false);
  const [showQuickSpin, setShowQuickSpin] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isDrawingMode, setIsDrawingMode] = useState(false); // Drawing State
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!hasConnected) {
    return <RemoteConnect onConnect={() => setHasConnected(true)} />;
  }

  // Safety Check
  if (!currentStep) return <div className="text-white p-8">Loading Session...</div>;

  const handleDisconnect = () => {
    setHasConnected(false);
  };

  const startCamera = async () => {
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (e) {
      console.error("Camera error:", e);
      setLiveSnap('https://images.unsplash.com/photo-1503676260728-1c00da094a0b?q=80&w=1000'); 
      setIsCameraActive(false); 
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg');
      setLiveSnap(dataUrl);
      
      const stream = videoRef.current.srcObject as MediaStream;
      stream?.getTracks().forEach(t => t.stop());
      setIsCameraActive(false);
    }
  };

  const cancelCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
    }
    setIsCameraActive(false);
    setLiveSnap(null);
  };

  const handleAwardPoints = (studentIds: string[], amount: number) => {
    studentIds.forEach(id => addPoints(id, amount));
    setShowPointSelector(false);
  };

  const handleMagicSelect = (studentId: string) => {
    magicSelectStudent(studentId);
    setShowPointSelector(false);
  };

  // Dynamic Activity Controls based on Step Type
  const renderActivityControls = () => {
    switch (currentStep.type) {
      case 'GAME_ARENA':
      case 'WHEEL_OF_DESTINY':
        return (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button 
                // When we are ON the wheel slide, we spin the slide's wheel (useOverlay=false)
                onClick={() => selectNextStudent(undefined, false)} 
                className="bg-yellow-500 text-black p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform"
            >
              <RotateCw size={24} /> SPIN
            </button>
            <button onClick={() => triggerAction(currentStep.type === 'WHEEL_OF_DESTINY' ? 'RESET_WHEEL' : 'RESET_ROUND')} className="bg-slate-700 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
              <RefreshCw size={24} /> Reset
            </button>
          </div>
        );
      case 'SPEED_QUIZ':
        return (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button onClick={() => triggerAction('REVEAL_ANSWER')} className="bg-blue-600 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
              <Eye size={24} /> Reveal
            </button>
            <button onClick={() => triggerAction('RESET_TIMER')} className="bg-slate-700 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
              <RefreshCw size={24} /> Reset Timer
            </button>
          </div>
        );
      case 'WHATS_MISSING':
        return (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button onClick={() => triggerAction('REVEAL')} className="bg-purple-600 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
              <Eye size={24} /> Reveal Missing
            </button>
            <button onClick={() => triggerAction('START_MEMORIZE')} className="bg-slate-700 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
              <RefreshCw size={24} /> Restart
            </button>
          </div>
        );
      case 'MAGIC_EYES':
        return (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button onClick={() => triggerAction('REVEAL')} className="bg-green-600 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
              <Eye size={24} /> Reveal
            </button>
            <button onClick={() => triggerAction('RESTART')} className="bg-slate-700 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
              <RefreshCw size={24} /> Flash Image
            </button>
          </div>
        );
      case 'MEDIA_PLAYER':
      case 'LIVE_WARMUP':
        return (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button onClick={() => triggerAction('PLAY_PAUSE')} className="bg-green-600 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
              <Play size={24} /> Play / Pause
            </button>
            <button onClick={() => triggerAction('RESTART')} className="bg-slate-700 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
              <RefreshCw size={24} /> Restart
            </button>
          </div>
        );
      case 'TEAM_BATTLE':
        return (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button onClick={() => triggerAction('SWITCH_TURN')} className="bg-orange-500 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
              <RefreshCw size={24} /> Switch Turn
            </button>
            <button onClick={() => triggerAction('RESET_TIMER')} className="bg-slate-700 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
              <Clock size={24} /> Reset Timer
            </button>
          </div>
        );
      case 'STORY_STAGE':
        return (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button onClick={() => triggerAction('PREV_PANEL')} className="bg-slate-700 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
              <ChevronLeft size={24} /> Prev Panel
            </button>
            <button onClick={() => triggerAction('NEXT_PANEL')} className="bg-blue-600 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
              Next Panel <ChevronRight size={24} />
            </button>
          </div>
        );
      case 'FOCUS_CARDS':
        return (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <button onClick={() => triggerAction('PREV_CARD')} className="bg-slate-700 text-white p-3 rounded-xl font-bold flex items-center justify-center shadow-lg active:scale-95">
              <ArrowLeft size={24} />
            </button>
            <button onClick={() => triggerAction('FLIP_CARD')} className="bg-blue-600 text-white p-3 rounded-xl font-bold flex items-center justify-center shadow-lg active:scale-95 uppercase tracking-wider text-sm">
              Flip
            </button>
            <button onClick={() => triggerAction('NEXT_CARD')} className="bg-slate-700 text-white p-3 rounded-xl font-bold flex items-center justify-center shadow-lg active:scale-95">
              <ArrowRight size={24} />
            </button>
          </div>
        );
      case 'UNSCRAMBLE':
      case 'STORY_SEQUENCING':
        return (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button onClick={() => triggerAction('CHECK_ANSWER')} className="bg-green-600 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
              <Check size={24} /> Check
            </button>
            <button onClick={() => triggerAction('RESET_GAME')} className="bg-slate-700 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
              <RefreshCw size={24} /> Reset
            </button>
          </div>
        );
      case 'GRAMMAR_SANDBOX':
        return (
          <div className="grid grid-cols-1 gap-3 mb-4">
            <button onClick={() => triggerAction('RESET_GAME')} className="bg-slate-700 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
              <RefreshCw size={24} /> Reset Level
            </button>
          </div>
        );
      case 'I_SAY_YOU_SAY':
        return (
          <div className="grid grid-cols-2 gap-3 mb-4">
             <button onClick={() => triggerAction('TOGGLE_PHASE')} className="bg-purple-600 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform col-span-2">
                <Mic size={24} /> Toggle Phase (Listen/Speak)
             </button>
             <button onClick={() => triggerAction('PREV_ITEM')} className="bg-slate-700 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
                <ChevronLeft size={24} /> Previous
             </button>
             <button onClick={() => triggerAction('NEXT_ITEM')} className="bg-blue-600 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
                Next <ChevronRight size={24} />
             </button>
          </div>
        );
      case 'POLL':
        return (
          <div className="grid grid-cols-2 gap-3 mb-4">
             <button onClick={() => triggerAction('RESET_TIMER')} className="bg-indigo-600 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
                <Clock size={24} /> Reset 30s
             </button>
             <button onClick={() => triggerAction('SHOW_RESULTS')} className="bg-slate-700 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
                <BarChart2 size={24} /> Reveal
             </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-screen bg-slate-900 text-white flex flex-col font-sans max-w-md mx-auto shadow-2xl overflow-hidden border-x border-slate-700 relative">
      {/* Header */}
      <header className="bg-slate-800 p-4 flex justify-between items-center border-b border-slate-700 shrink-0">
        <div>
          <h1 className="font-bold text-lg">Room 304</h1>
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 ${!state.isConnected ? 'hidden' : ''}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${state.isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
            </span>
            {state.isConnected ? 'Live Connected' : 'Offline'}
          </div>
        </div>
        <div className="flex gap-2">
           <button onClick={handleDisconnect} className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30">
             <LogOut size={20} />
           </button>
           <button 
             onClick={() => setShowNotes(!showNotes)} 
             className={`p-2 rounded-lg ${showNotes ? 'bg-yellow-500 text-slate-900' : 'bg-slate-700 text-slate-400'}`}
           >
             <FileText size={20} />
           </button>
        </div>
      </header>

      {/* Main Scrollable Area */}
      <div className="flex-1 overflow-y-auto p-4 pb-20">
        {/* Now Playing Monitor */}
        <div className="bg-slate-800 rounded-2xl p-4 shadow-lg border border-slate-700 relative overflow-hidden group mb-6">
          <div className="absolute top-0 right-0 p-2 bg-blue-600 rounded-bl-xl text-xs font-bold uppercase tracking-wider">
            On Air
          </div>
          <div className="flex items-center gap-3 mb-2 opacity-50 text-xs uppercase tracking-widest">
            <MonitorPlay size={12} />
            {currentStep.type.replace('_', ' ')}
          </div>
          <h2 className="text-xl font-bold leading-tight mb-4">{currentStep.title}</h2>
          
          {nextStep && (
             <div className="bg-slate-900/50 rounded-lg p-3 flex items-center justify-between mt-2 border border-slate-700/50">
               <div className="flex flex-col">
                 <span className="text-[10px] uppercase text-slate-400">Up Next</span>
                 <span className="text-sm font-medium truncate w-40">{nextStep.title}</span>
               </div>
               <button onClick={nextSlide} className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300">Skip</button>
             </div>
          )}
        </div>

        {/* Dynamic Activity Controls */}
        {renderActivityControls()}

        {/* Main Navigation Pad */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <button 
            onClick={prevSlide}
            disabled={state.currentStepIndex === 0}
            className="bg-slate-800 aspect-square rounded-2xl flex items-center justify-center active:scale-95 transition-all border border-slate-700 disabled:opacity-30"
          >
            <ChevronLeft size={32} />
          </button>
          
          <button className="bg-blue-600 aspect-square rounded-2xl flex flex-col items-center justify-center active:scale-95 transition-all shadow-lg shadow-blue-900/50 col-span-1 border-b-4 border-blue-800">
            <span className="text-xs uppercase font-bold tracking-widest mb-1 opacity-80">Action</span>
            <div className="w-10 h-10 rounded-full border-2 border-white flex items-center justify-center">
              <div className="w-6 h-6 bg-white rounded-full"></div>
            </div>
          </button>

          <button 
            onClick={nextSlide}
            disabled={!nextStep}
            className="bg-slate-800 aspect-square rounded-2xl flex items-center justify-center active:scale-95 transition-all border border-slate-700 disabled:opacity-30"
          >
            <ChevronRight size={32} />
          </button>
        </div>

        {/* God Mode Tools */}
        <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 ml-1">Tools</h3>
        <div className="grid grid-cols-4 gap-3 mb-6">
          <button 
            onClick={state.liveSnapImage ? () => setLiveSnap(null) : startCamera}
            className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-1 active:scale-95 transition-all border ${state.liveSnapImage ? 'bg-red-500 border-red-600' : 'bg-slate-800 border-slate-700'}`}
          >
            {state.liveSnapImage ? <X size={24} /> : <Camera size={24} className="text-purple-400" />}
            <span className="text-[10px]">{state.liveSnapImage ? 'Stop' : 'Snap'}</span>
          </button>
          <button onClick={() => setShowQuickSpin(true)} className="aspect-square bg-slate-800 rounded-xl flex flex-col items-center justify-center gap-1 active:scale-95 transition-all border border-slate-700">
            <Zap size={24} className="text-yellow-400" />
            <span className="text-[10px]">Spin</span>
          </button>
          <button 
            onClick={() => setShowPointSelector(true)} 
            className="aspect-square bg-slate-800 rounded-xl flex flex-col items-center justify-center gap-1 active:scale-95 transition-all border border-slate-700"
          >
            <Star size={24} className="text-emerald-400" />
            <span className="text-[10px]">Points</span>
          </button>
          <button 
            onClick={() => setShowSoundBoard(true)}
            className="aspect-square bg-blue-900/30 rounded-xl flex flex-col items-center justify-center gap-1 active:scale-95 transition-all border border-blue-900/50"
          >
            <Volume2 size={24} className="text-blue-400" />
            <span className="text-[10px] text-blue-200">Sounds</span>
          </button>
          <button 
            onClick={() => setIsDrawingMode(true)}
            className="aspect-square bg-slate-800 rounded-xl flex flex-col items-center justify-center gap-1 active:scale-95 transition-all border border-slate-700"
          >
            <PenTool size={24} className="text-rose-400" />
            <span className="text-[10px]">Pen</span>
          </button>
          <button 
            onClick={() => setShowVoiceCommand(true)}
            className="aspect-square bg-slate-800 rounded-xl flex flex-col items-center justify-center gap-1 active:scale-95 transition-all border border-slate-700"
          >
            <Mic size={24} className="text-white" />
            <span className="text-[10px]">Voice</span>
          </button>
        </div>
      </div>

      {/* Bottom Nav */}
      <div className="bg-slate-900/90 backdrop-blur border-t border-slate-800 p-2 grid grid-cols-3 shrink-0">
        <button className="flex flex-col items-center p-2 text-blue-400">
          <MonitorPlay size={20} />
          <span className="text-[10px] mt-1">Class</span>
        </button>
        <button onClick={() => setShowPointSelector(true)} className="flex flex-col items-center p-2 text-slate-500 hover:text-white">
          <Star size={20} />
          <span className="text-[10px] mt-1">Students</span>
        </button>
        <button className="flex flex-col items-center p-2 text-slate-500 hover:text-white">
          <Wifi size={20} />
          <span className="text-[10px] mt-1">Settings</span>
        </button>
      </div>

      {/* Teacher Notes Drawer */}
      {showNotes && (
         <div className="absolute inset-x-0 bottom-0 top-20 bg-slate-800 rounded-t-3xl shadow-2xl p-6 z-30 animate-slide-up border-t border-white/10 overflow-y-auto">
            <div className="w-12 h-1 bg-slate-600 rounded-full mx-auto mb-6 shrink-0"></div>
            <h3 className="text-xl font-bold text-yellow-400 mb-4">Teacher Notes</h3>
            <div className="prose prose-invert prose-sm">
               {currentStep.teacherGuide ? (
                  <>
                     <p>{currentStep.teacherGuide.instruction}</p>
                     <p className="italic">"{currentStep.teacherGuide.script}"</p>
                  </>
               ) : (
                  <p>No notes for this slide.</p>
               )}
            </div>
            <button 
               onClick={() => setShowNotes(false)}
               className="absolute top-4 right-4 p-2 bg-slate-700 rounded-full"
            >
               <X size={20} />
            </button>
         </div>
      )}

      {/* Drawing Overlay */}
      {isDrawingMode && (
         <div className="absolute inset-0 bg-black/80 z-[60] flex flex-col">
            <div className="flex-1 bg-white relative">
               <DrawingLayer isInteractive={true} color="#ef4444" />
               <div className="absolute top-4 left-4 text-slate-400 text-xs font-bold uppercase tracking-widest pointer-events-none">
                  Annotate Mode
               </div>
            </div>
            <div className="h-24 bg-slate-800 border-t border-slate-700 flex items-center justify-between px-6">
               <div className="flex items-center gap-4">
                  <button onClick={clearDrawings} className="p-3 bg-slate-700 rounded-full text-slate-400 hover:text-white">
                     <Eraser size={24} />
                  </button>
                  <div className="w-px h-8 bg-slate-700"></div>
                  <div className="text-white text-sm font-bold">Drawing active on Board</div>
               </div>
               <button 
                  onClick={() => setIsDrawingMode(false)} 
                  className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold"
               >
                  Done
               </button>
            </div>
         </div>
      )}

      {/* Camera Overlay */}
      {isCameraActive && (
         <div className="absolute inset-0 bg-black z-50 flex flex-col">
            <video ref={videoRef} autoPlay playsInline className="flex-1 object-cover" />
            <div className="h-32 bg-black/50 backdrop-blur absolute bottom-0 w-full flex items-center justify-around pb-8">
               <button onClick={cancelCamera} className="text-white p-4">Cancel</button>
               <button 
                  onClick={capturePhoto}
                  className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center"
               >
                  <div className="w-16 h-16 bg-white rounded-full active:scale-90 transition-transform"></div>
               </button>
               <button className="text-white p-4">Flip</button>
            </div>
         </div>
      )}

      {/* Quick Spin Modal */}
      {showQuickSpin && (
        <QuickSpinModal onClose={() => setShowQuickSpin(false)} />
      )}

      {/* Student Point Selector Modal */}
      {showPointSelector && (
        <StudentSelectorModal 
          onClose={() => setShowPointSelector(false)} 
          onAward={handleAwardPoints}
          onMagicSelect={handleMagicSelect}
        />
      )}

      {/* Sound Board Modal */}
      {showSoundBoard && (
        <SoundBoardModal onClose={() => setShowSoundBoard(false)} />
      )}

      {/* Voice Command Modal */}
      {showVoiceCommand && (
        <VoiceCommandModal onClose={() => setShowVoiceCommand(false)} />
      )}
    </div>
  );
};

export default TeacherRemote;
