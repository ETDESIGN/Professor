import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Heart, Check, ArrowRight, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import ListenTap from './ListenTap';
import SentenceScramble from './SentenceScramble';
import PronunciationCoach from './PronunciationCoach';
import FlashMatch from './FlashMatch';
import { useSoloSession } from '../../store/SoloSessionContext';
import { supabase } from '../../services/supabaseClient';

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

// Playlist-only lesson runner. Live-class "follow the teacher" mode was removed
// (2026-08-17): the classroom model is projector + teacher-remote only
// (LIVE_GAME_LIFECYCLE.md §9) and students have no realtime subscription, so
// that branch was unreachable dead code.
const LessonSession: React.FC<LessonSessionProps> = ({ playlist, onComplete, onExit }) => {
  const { addPoints } = useSoloSession();
  const { t } = useTranslation();

  const [localIndex, setLocalIndex] = useState(0);
  const currentIndex = localIndex;

  const [lives, setLives] = useState(5);
  const [lessonStatus, setLessonStatus] = useState<'idle' | 'checking' | 'correct' | 'wrong'>('idle');
  const [isAnswerReady, setIsAnswerReady] = useState(false);
  const [validateTrigger, setValidateTrigger] = useState(0);

  // Bug #6 fix: use the REAL authenticated student id, never a phantom 's1'.
  const [currentStudentId, setCurrentStudentId] = useState('');
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setCurrentStudentId(user.id); }).catch(() => {});
  }, []);

  const currentActivity: LessonActivity | undefined = playlist[currentIndex];
  const totalSlides = playlist.length;
  const progress = (currentIndex / Math.max(1, totalSlides)) * 100;

  useEffect(() => {
    setLessonStatus('idle');
    setIsAnswerReady(false);
  }, [currentIndex]);

  const handleCheck = () => {
    setLessonStatus('checking');
    setValidateTrigger(v => v + 1);
  };

  const handleChildResult = (isCorrect: boolean) => {
    if (isCorrect) {
      setLessonStatus('correct');
      if (currentStudentId) addPoints(currentStudentId, 1);
      toast.success('+1 XP!', { icon: '🌟', style: { background: '#22c55e', color: 'white', border: 'none' } });
    } else {
      setLessonStatus('wrong');
      setLives(l => Math.max(0, l - 1));
      if (navigator.vibrate) navigator.vibrate(200);
    }
  };

  const handleContinue = () => {
    if (lives === 0) {
      toast.error(t('student.outOfHearts', 'Out of hearts! Try again later.'), { icon: '💔' });
      onExit();
      return;
    }

    if (currentIndex < playlist.length - 1) {
      setLocalIndex(prev => prev + 1);
      setLessonStatus('idle');
      setIsAnswerReady(false);
    } else {
      onComplete({ xp: 5, accuracy: (lives / 5) * 100, time: '2:30' });
    }
  };

  // Empty or out-of-range playlist: clean exit instead of a crash on
  // currentActivity.type (audit P0-5).
  if (!currentActivity) {
    return (
      <div className="h-full bg-slate-50 flex flex-col items-center justify-center p-8 text-center font-sans">
        <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mb-5">
          <AlertCircle size={40} className="text-slate-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-700 mb-2">{t('student.noActivities', 'No activities available')}</h2>
        <p className="text-slate-400 max-w-sm mb-6">{t('student.noActivitiesHint', 'This lesson doesn\'t have any activities yet. Try again later or pick another lesson.')}</p>
        <button
          onClick={onExit}
          className="px-6 py-3 bg-duo-green text-white font-bold rounded-2xl shadow-[0_4px_0_0_#46a302] active:shadow-none active:translate-y-1 transition-all uppercase tracking-wide"
        >
          {t('common.back', 'Go back')}
        </button>
      </div>
    );
  }

  // Playlist (async) mode: render the activity components. They have empty-
  // state guards, so missing data shows a clean message instead of mocks.
  const renderPlaylistActivity = () => {
    const commonProps = {
      mode: 'embedded' as const,
      onReady: (ready: boolean) => setIsAnswerReady(ready),
      validateTrigger,
      onResult: handleChildResult,
    };
    switch (currentActivity.type) {
      case 'LISTEN_TAP': return <ListenTap {...commonProps} data={currentActivity.data} onBack={() => {}} />;
      case 'SCRAMBLE': return <SentenceScramble {...commonProps} data={currentActivity.data} onBack={() => {}} />;
      case 'SPEAKING': return <PronunciationCoach {...commonProps} data={currentActivity.data} onBack={() => {}} />;
      case 'FLASH_MATCH': return <FlashMatch {...commonProps} data={currentActivity.data} onBack={() => {}} />;
      default: return <div className="p-6 text-slate-400">{t('student.unknownActivity', 'Unknown activity.')}</div>;
    }
  };

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans relative overflow-hidden">
      <header className="px-4 py-4 flex items-center justify-between z-10 shrink-0 bg-white border-b border-slate-100">
        <button onClick={onExit} className="text-slate-400 hover:text-slate-600 p-2 -ml-2"><X size={24} /></button>
        <div className="flex-1 mx-4 h-4 bg-slate-200 rounded-full overflow-hidden relative">
          <div className="h-full bg-duo-green rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }}>
            <div className="absolute inset-0 bg-white/20 w-full h-full animate-shimmer"></div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-red-500 font-bold animate-pulse-slow"><Heart fill="currentColor" size={24} /><span>{lives}</span></div>
      </header>

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
            {renderPlaylistActivity()}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="z-20">
        {lessonStatus === 'idle' || lessonStatus === 'checking' ? (
          <div className="p-4 border-t border-slate-200 bg-white">
            <button
              onClick={handleCheck}
              disabled={!isAnswerReady || lessonStatus === 'checking'}
              className="w-full bg-duo-green hover:bg-duo-green-dark disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-4 rounded-2xl text-lg shadow-[0_4px_0_0_#46a302] active:shadow-none active:translate-y-1 transition-all uppercase tracking-wide"
            >
              {lessonStatus === 'checking' ? t('student.checking', 'Checking...') : t('student.check', 'Check')}
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
                    {lessonStatus === 'correct' ? t('student.excellent', 'Excellent!') : t('student.incorrect', 'Incorrect')}
                  </h2>
                  {lessonStatus === 'wrong' && <p className="text-red-600 font-medium">{t('student.correctAnswerAbove', 'The correct answer is shown above.')}</p>}
                </div>
              </div>
              <button
                onClick={handleContinue}
                className={`w-full font-bold py-4 rounded-2xl text-lg shadow-lg active:shadow-none active:translate-y-1 transition-all uppercase tracking-wide flex items-center justify-center gap-2 ${lessonStatus === 'correct' ? 'bg-duo-green text-white shadow-[0_4px_0_0_#46a302]' : 'bg-red-500 text-white shadow-[0_4px_0_0_#b91c1c]'}`}
              >
                {t('student.continue', 'Continue')} <ArrowRight size={24} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LessonSession;
