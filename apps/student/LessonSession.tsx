import React, { useState } from 'react';
import { X, Heart, Check, AlertCircle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import ListenTap from './ListenTap';
import SentenceScramble from './SentenceScramble';
import PronunciationCoach from './PronunciationCoach';
import FlashMatch from './FlashMatch';
import { useSoloSession } from '../../store/SoloSessionContext';

export type ActivityType = 'LISTEN_TAP' | 'SCRAMBLE' | 'SPEAKING' | 'FLASH_MATCH';

interface LessonActivity {
  type: ActivityType;
  id: string;
  data?: any;
}

interface LessonSessionProps {
  playlist: LessonActivity[];
  onComplete: (results: { xp: number, accuracy: number, time: string }) => void;
  onExit: () => void;
}

const LessonSession: React.FC<LessonSessionProps> = ({ playlist, onComplete, onExit }) => {
  const { state, addPoints } = useSoloSession();
  const isLive = state.status === 'LIVE';
  
  const [localIndex, setLocalIndex] = useState(0);
  const currentIndex = isLive ? state.currentStepIndex : localIndex;
  
  const [lives, setLives] = useState(5);
  const [lessonStatus, setLessonStatus] = useState<'idle' | 'checking' | 'correct' | 'wrong'>('idle');
  
  // This state holds the user's answer from the child component
  // It allows the parent (this component) to control the "Check" button
  const [isAnswerReady, setIsAnswerReady] = useState(false);
  
  // A trigger to tell the child component to validate itself
  const [validateTrigger, setValidateTrigger] = useState(0);

  // Find the current student based on some logic, or just assume the first student for demo purposes if not logged in
  // In a real app, you'd have the logged-in user's ID. For this demo, let's use 's1' (Leo)
  const currentStudentId = 's1';

  // In live mode, we might not have a playlist, we use the teacher's flow
  const currentActivity = isLive && state.activeSlideData ? 
    { 
      type: (state.activeSlideData.type === 'FOCUS_CARDS' || state.activeSlideData.type === 'vocab') ? 'LISTEN_TAP' : 'SCRAMBLE', 
      id: state.activeSlideData.id,
      data: state.activeSlideData.data
    } : 
    playlist[currentIndex] || playlist[0];
    
  const totalSlides = isLive && state.activeUnit ? state.activeUnit.flow.length : playlist.length;
  const progress = ((currentIndex) / totalSlides) * 100;

  // Reset status when slide changes (e.g., teacher moves to next slide)
  React.useEffect(() => {
    setLessonStatus('idle');
    setIsAnswerReady(false);
  }, [currentIndex]);

  const handleCheck = () => {
    // 1. Tell child to validate and return result
    setLessonStatus('checking');
    setValidateTrigger(v => v + 1);
  };

  const handleChildResult = (isCorrect: boolean) => {
    if (isCorrect) {
      setLessonStatus('correct');
      addPoints(currentStudentId, 10); // Award 10 points for correct answer
      toast.success('+10 XP!', {
        icon: '🌟',
        style: { background: '#22c55e', color: 'white', border: 'none' }
      });
      // Play success sound
    } else {
      setLessonStatus('wrong');
      setLives(l => Math.max(0, l - 1));
      // Play error sound
      // Vibrate
      if (navigator.vibrate) navigator.vibrate(200);
    }
  };

  const handleContinue = () => {
    if (lives === 0 && !isLive) {
      // Game Over
      toast.error('Out of hearts! Try again later.', { icon: '💔' });
      onExit();
      return;
    }

    if (isLive) {
       // In live mode, just reset status and wait for teacher
       setLessonStatus('idle');
       setIsAnswerReady(false);
       toast('Waiting for teacher to continue...', { icon: '⏳' });
    } else {
      if (currentIndex < playlist.length - 1) {
        // Next slide
        setLocalIndex(prev => prev + 1);
        setLessonStatus('idle');
        setIsAnswerReady(false);
      } else {
        // Finish Lesson
        onComplete({ xp: 50, accuracy: (lives / 5) * 100, time: '2:30' });
      }
    }
  };

  // Render the specific activity component based on type
  const renderActivity = () => {
    const commonProps = {
      mode: 'embedded' as const,
      onReady: (ready: boolean) => setIsAnswerReady(ready),
      validateTrigger: validateTrigger,
      onResult: handleChildResult
    };

    switch (currentActivity.type) {
      case 'LISTEN_TAP':
        return <ListenTap {...commonProps} data={currentActivity.data} onBack={() => {}} />;
      case 'SCRAMBLE':
        return <SentenceScramble {...commonProps} data={currentActivity.data} onBack={() => {}} />;
      case 'SPEAKING':
        return <PronunciationCoach {...commonProps} data={currentActivity.data} onBack={() => {}} />;
      case 'FLASH_MATCH':
        return <FlashMatch {...commonProps} data={currentActivity.data} onBack={() => {}} />;
      default:
        return <div>Unknown Activity</div>;
    }
  };

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans relative overflow-hidden">
      {/* 1. Unified Header */}
      <header className="px-4 py-4 flex items-center justify-between z-10 shrink-0 bg-white border-b border-slate-100">
        <button onClick={onExit} className="text-slate-400 hover:text-slate-600 p-2 -ml-2">
          <X size={24} />
        </button>
        
        {/* Progress Bar */}
        <div className="flex-1 mx-4 h-4 bg-slate-200 rounded-full overflow-hidden relative">
           <div 
             className="h-full bg-duo-green rounded-full transition-all duration-500 ease-out"
             style={{ width: `${progress}%` }}
           >
             <div className="absolute inset-0 bg-white/20 w-full h-full animate-shimmer"></div>
           </div>
        </div>

        <div className="flex items-center gap-1 text-red-500 font-bold animate-pulse-slow">
          <Heart fill="currentColor" size={24} /> 
          <span>{lives}</span>
        </div>
      </header>

      {/* 2. Activity Content Area */}
      <div className="flex-1 overflow-y-auto relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentActivity.id}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
            className="h-full w-full absolute inset-0"
          >
            {renderActivity()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 3. Unified Footer / Feedback Sheet */}
      <div className="z-20">
        {lessonStatus === 'idle' || lessonStatus === 'checking' ? (
          <div className="p-4 border-t border-slate-200 bg-white">
             <button 
                onClick={handleCheck}
                disabled={!isAnswerReady || lessonStatus === 'checking'}
                className="w-full bg-duo-green hover:bg-duo-green-dark disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-4 rounded-2xl text-lg shadow-[0_4px_0_0_#46a302] active:shadow-none active:translate-y-1 transition-all uppercase tracking-wide"
             >
                {lessonStatus === 'checking' ? 'Checking...' : 'Check'}
             </button>
          </div>
        ) : (
          <div className={`p-6 border-t-2 animate-slide-up ${lessonStatus === 'correct' ? 'bg-green-100 border-green-200' : 'bg-red-100 border-red-200'}`}>
             <div className="max-w-md mx-auto">
                <div className="flex items-center gap-4 mb-6">
                   <div className={`w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm ${lessonStatus === 'correct' ? 'text-green-500' : 'text-red-500'}`}>
                      {lessonStatus === 'correct' ? <Check size={40} strokeWidth={4} /> : <X size={40} strokeWidth={4} />}
                   </div>
                   <div>
                      <h2 className={`text-2xl font-bold mb-1 ${lessonStatus === 'correct' ? 'text-green-700' : 'text-red-700'}`}>
                        {lessonStatus === 'correct' ? 'Excellent!' : 'Incorrect'}
                      </h2>
                      {lessonStatus === 'wrong' && (
                        <p className="text-red-600 font-medium">The correct answer is shown above.</p>
                      )}
                   </div>
                </div>
                <button 
                   onClick={handleContinue}
                   className={`w-full font-bold py-4 rounded-2xl text-lg shadow-lg active:shadow-none active:translate-y-1 transition-all uppercase tracking-wide flex items-center justify-center gap-2
                     ${lessonStatus === 'correct' 
                        ? 'bg-duo-green text-white shadow-[0_4px_0_0_#46a302]' 
                        : 'bg-red-500 text-white shadow-[0_4px_0_0_#b91c1c]'
                     }
                   `}
                >
                   Continue <ArrowRight size={24} />
                </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LessonSession;