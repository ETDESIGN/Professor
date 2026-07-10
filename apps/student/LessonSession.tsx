import React, { useEffect, useState } from 'react';
import { X, Heart, Check, ArrowRight, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import ListenTap from './ListenTap';
import SentenceScramble from './SentenceScramble';
import PronunciationCoach from './PronunciationCoach';
import FlashMatch from './FlashMatch';
import ExerciseRunner, { RunnerResult } from './exercises/ExerciseRunner';
import { useSoloSession } from '../../store/SoloSessionContext';
import { supabase } from '../../services/supabaseClient';
import { selectLessonItems, prepareUnitForStudent } from '../../services/poolService';

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
  const [isAnswerReady, setIsAnswerReady] = useState(false);
  const [validateTrigger, setValidateTrigger] = useState(0);

  // Bug #6 fix: use the REAL authenticated student id, never a phantom 's1'.
  const [currentStudentId, setCurrentStudentId] = useState('');
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setCurrentStudentId(user.id); }).catch(() => {});
  }, []);

  const liveStep = isLive ? state.activeSlideData : null;
  const isLivePoolStep = Boolean(
    liveStep && (liveStep.data?.poolDriven || liveStep.phase === 'PRACTICE' || liveStep.phase === 'ASSESS'),
  );

  // Pool-driven battery for the live step (loaded when entering a practice/assess
  // step so the student practises the SAME skills the board is presenting, with
  // real audio + the shared LearnerState — instead of the old mock LISTEN_TAP).
  const [liveItems, setLiveItems] = useState<any[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveBatteryDone, setLiveBatteryDone] = useState(false);
  const liveUnitId = state.activeUnit?.id || '';

  useEffect(() => {
    setLiveBatteryDone(false);
    if (!isLive || !isLivePoolStep || !liveUnitId || !currentStudentId) { setLiveItems([]); return; }
    let cancelled = false;
    setLiveLoading(true);
    (async () => {
      await prepareUnitForStudent(liveUnitId, currentStudentId);
      const items = await selectLessonItems(liveUnitId, currentStudentId, 12);
      if (!cancelled) { setLiveItems(items); setLiveLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, isLivePoolStep, liveUnitId, currentStudentId, currentIndex]);

  // In live mode the student follows the teacher's flow; in playlist mode they
  // step a local playlist. No more forcing every activity to LISTEN_TAP/SCRAMBLE.
  const currentActivity: LessonActivity = isLive && liveStep
    ? { type: (liveStep.type as ActivityType) || 'LISTEN_TAP', id: String(liveStep.id ?? currentIndex), data: liveStep.data }
    : playlist[currentIndex] || playlist[0];

  const totalSlides = isLive && state.activeUnit ? state.activeUnit.flow.length : playlist.length;
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
      if (currentStudentId) addPoints(currentStudentId, 10);
      toast.success('+10 XP!', { icon: '🌟', style: { background: '#22c55e', color: 'white', border: 'none' } });
    } else {
      setLessonStatus('wrong');
      setLives(l => Math.max(0, l - 1));
      if (navigator.vibrate) navigator.vibrate(200);
    }
  };

  const handleLiveBatteryDone = (result: RunnerResult) => {
    setLiveBatteryDone(true);
    toast(`Practised ${result.correct}/${result.total} — waiting for teacher…`, { icon: '⏳' });
  };

  const handleContinue = () => {
    if (lives === 0 && !isLive) {
      toast.error('Out of hearts! Try again later.', { icon: '💔' });
      onExit();
      return;
    }

    if (isLive) {
      setLessonStatus('idle');
      setIsAnswerReady(false);
      toast('Waiting for teacher to continue...', { icon: '⏳' });
    } else {
      if (currentIndex < playlist.length - 1) {
        setLocalIndex(prev => prev + 1);
        setLessonStatus('idle');
        setIsAnswerReady(false);
      } else {
        onComplete({ xp: 50, accuracy: (lives / 5) * 100, time: '2:30' });
      }
    }
  };

  // Playlist (async) mode: render the activity components. They now have empty-
  // state guards, so missing data shows a clean message instead of Spanish mocks.
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
      default: return <div className="p-6 text-slate-400">Unknown activity.</div>;
    }
  };

  // --- Live mode rendering ---
  if (isLive) {
    return (
      <div className="h-full bg-slate-50 flex flex-col font-sans relative overflow-hidden">
        <header className="px-4 py-4 flex items-center justify-between z-10 shrink-0 bg-white border-b border-slate-100">
          <button onClick={onExit} className="text-slate-400 hover:text-slate-600 p-2 -ml-2"><X size={24} /></button>
          <div className="flex-1 mx-4 h-4 bg-slate-200 rounded-full overflow-hidden relative">
            <div className="h-full bg-duo-green rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center gap-1 text-red-500 font-bold"><Heart fill="currentColor" size={24} /><span>{lives}</span></div>
        </header>

        <div className="flex-1 overflow-y-auto relative">
          {isLivePoolStep ? (
            currentStudentId ? (
              liveBatteryDone ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                  <Check size={48} className="text-duo-green mb-3" />
                  <p className="text-slate-600 font-bold mb-1">Nice work!</p>
                  <p className="text-slate-400">Waiting for your teacher to continue…</p>
                </div>
              ) : liveLoading ? (
                <div className="h-full flex items-center justify-center text-slate-400 font-bold">Preparing exercises…</div>
              ) : (
                <ExerciseRunner
                  items={liveItems}
                  studentId={currentStudentId}
                  unitId={liveUnitId}
                  onExit={onExit}
                  onDone={handleLiveBatteryDone}
                />
              )
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">Signing you in…</div>
            )
          ) : (
            // Passive step: the board presents (vocab cards / story / grammar /
            // media); the student follows along. No more broken mock games here.
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <div className="w-20 h-20 bg-duo-blue/10 rounded-3xl flex items-center justify-center mb-5">
                <Eye size={40} className="text-duo-blue" />
              </div>
              <h2 className="text-2xl font-bold text-slate-700 mb-2">Follow along on the big screen</h2>
              <p className="text-slate-400 max-w-sm">Your teacher is presenting this part of the lesson. Get ready — practice is coming up!</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Playlist (async) mode ---
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
                  {lessonStatus === 'wrong' && <p className="text-red-600 font-medium">The correct answer is shown above.</p>}
                </div>
              </div>
              <button
                onClick={handleContinue}
                className={`w-full font-bold py-4 rounded-2xl text-lg shadow-lg active:shadow-none active:translate-y-1 transition-all uppercase tracking-wide flex items-center justify-center gap-2 ${lessonStatus === 'correct' ? 'bg-duo-green text-white shadow-[0_4px_0_0_#46a302]' : 'bg-red-500 text-white shadow-[0_4px_0_0_#b91c1c]'}`}
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
