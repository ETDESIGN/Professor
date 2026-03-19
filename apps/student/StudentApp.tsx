import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Home, Trophy, BookOpen, User, ShoppingBag } from 'lucide-react';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import DubbingStudio from './DubbingStudio';
import Profile from './Profile';
import Settings from './Settings';
import HelpCenter from './HelpCenter';
import PronunciationCoach from './PronunciationCoach';
import Login from './Login';
import HomeMap from './HomeMap';
import Leaderboard from './Leaderboard';
import Quests from './Quests';
import AvatarBuilder from './AvatarBuilder';
import PracticeMenu from './PracticeMenu';
import ReadingReader from './ReadingReader';
import Shop from './Shop';
import LessonComplete from './LessonComplete';
import PhonicsPhlyer from './PhonicsPhlyer';
import SpacedRepetition from './SpacedRepetition';
import LessonSession, { ActivityType } from './LessonSession';
import { Engine } from '../../services/SupabaseService';
import { useSession } from '../../store/SessionContext';

interface StudentAppProps {
  onSignOut?: () => void;
}

const StudentApp: React.FC<StudentAppProps> = ({ onSignOut }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useSession();

  // Gamification State
  const [userStats, setUserStats] = useState({
    streak: 12,
    gems: 450,
    xp: 1250,
    level: 5
  });

  useEffect(() => {
    const fetchProgress = async () => {
      const progress = await Engine.getStudentProgress();
      setUserStats(prev => ({
        ...prev,
        streak: progress.streak,
        xp: progress.xp,
        level: Math.floor(progress.xp / 1000) + 1
      }));
    };
    fetchProgress();
  }, []);

  // Listen for global celebration action
  useEffect(() => {
    if (state.lastAction?.type === 'CELEBRATE') {
      const duration = 3000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff']
        });
        confetti({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff']
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();
    }
  }, [state.lastAction]);

  // Handle teacher ending the live session
  useEffect(() => {
    if (location.pathname === '/student/lesson' && state.status === 'IDLE') {
      navigate('/student');
      toast.info('Live class has ended.', { icon: '👋' });
    }
  }, [state.status, location.pathname, navigate]);

  // Local state for avatar customization
  const [avatarConfig, setAvatarConfig] = useState<any>(null);

  // Temp storage for lesson results to pass to the Complete screen
  const [sessionResults, setSessionResults] = useState({ xp: 0, accuracy: 0, time: '0:00' });

  // Define the playlist for the main lesson
  const lessonPlaylist: { type: ActivityType, id: string, data?: any }[] = [
    {
      type: 'LISTEN_TAP',
      id: '1',
      data: {
        instruction: 'Listen and select the correct image',
        options: [
          { id: 1, img: 'https://img.freepik.com/free-vector/cute-lion-cartoon-character_1308-106575.jpg', label: 'Lion' },
          { id: 2, img: 'https://img.freepik.com/free-vector/cute-elephant-sitting-cartoon-vector-icon-illustration_138676-2220.jpg', label: 'Elephant', correct: true },
          { id: 3, img: 'https://img.freepik.com/free-vector/cute-giraffe-cartoon-vector-icon-illustration_138676-2222.jpg', label: 'Giraffe' },
          { id: 4, img: 'https://img.freepik.com/free-vector/cute-zebra-sitting-cartoon-vector-icon-illustration_138676-2223.jpg', label: 'Zebra' },
        ]
      }
    },
    {
      type: 'SCRAMBLE',
      id: '2',
      data: {
        targetSentence: { en: "The cat is sleeping on the mat", translation: "El gato está durmiendo en la alfombra" },
        wordBank: [
          { id: 'w1', text: 'is' },
          { id: 'w2', text: 'sleeping' },
          { id: 'w3', text: 'mat' },
          { id: 'w4', text: 'on' },
          { id: 'w5', text: 'the' },
          { id: 'w6', text: 'The' },
          { id: 'w7', text: 'cat' },
          { id: 'w8', text: 'dog' }, // Distractor
        ]
      }
    },
    {
      type: 'SPEAKING',
      id: '3',
      data: {
        targetSentence: "The quick brown fox jumps"
      }
    },
    {
      type: 'FLASH_MATCH',
      id: '4',
      data: {
        pairs: [
          { id: '1', left: 'Apple', right: 'Manzana' },
          { id: '2', left: 'Dog', right: 'Perro' },
          { id: '3', left: 'Cat', right: 'Gato' },
          { id: '4', left: 'House', right: 'Casa' },
        ]
      }
    }
  ];

  const handleAvatarSave = (config: any) => {
    setAvatarConfig(config);
    navigate('/student/profile');
  };

  const handleLessonComplete = (results: { xp: number, accuracy: number, time: string }) => {
    setSessionResults(results);
    navigate('/student/lesson-complete');
  };

  const finalizeLesson = async () => {
    // Commit the rewards
    const newXp = userStats.xp + sessionResults.xp;
    const newGems = userStats.gems + 20; // Mock reward

    await Engine.updateStudentProgress({ xp: newXp });

    setUserStats(prev => ({
      ...prev,
      xp: newXp,
      gems: newGems,
      level: Math.floor(newXp / 1000) + 1
    }));
    navigate('/student');
  };

  // Navigate to lesson session
  const startLesson = () => {
    navigate('/student/lesson');
  };

  // Check if current path is a full screen app
  const isFullScreenApp = ['/student/login', '/student/lesson', '/student/dubbing', '/student/pronounce', '/student/reading', '/student/phonics', '/student/srs', '/student/lesson-complete', '/student/avatar', '/student/settings', '/student/help', '/student/practice'].includes(location.pathname);

  if (location.pathname === '/student/login') return <Login onLogin={() => navigate('/student')} />;

  // The Main Lesson Runner
  if (location.pathname === '/student/lesson') {
    return <LessonSession playlist={lessonPlaylist} onComplete={handleLessonComplete} onExit={() => navigate('/student')} />;
  }

  // Full screen standalone apps
  if (location.pathname === '/student/dubbing') return <DubbingStudio onBack={() => handleLessonComplete({ xp: 50, accuracy: 95, time: '2:30' })} />;
  if (location.pathname === '/student/pronounce') return <PronunciationCoach onBack={() => handleLessonComplete({ xp: 45, accuracy: 85, time: '3:00' })} />;
  if (location.pathname === '/student/reading') return <ReadingReader onBack={() => handleLessonComplete({ xp: 60, accuracy: 100, time: '4:20' })} />;
  if (location.pathname === '/student/phonics') return <PhonicsPhlyer onBack={() => handleLessonComplete({ xp: 40, accuracy: 92, time: '1:45' })} />;
  if (location.pathname === '/student/srs') return <SpacedRepetition onBack={() => navigate('/student/practice')} onComplete={handleLessonComplete} />;

  // The Reward Interstitial
  if (location.pathname === '/student/lesson-complete') return <LessonComplete onContinue={finalizeLesson} stats={sessionResults} />;

  // Secondary Screens that don't show the bottom nav
  if (location.pathname === '/student/avatar') return <AvatarBuilder onBack={() => navigate('/student/profile')} onSave={handleAvatarSave} initialConfig={avatarConfig} />;
  if (location.pathname === '/student/settings') return <Settings onBack={() => navigate('/student/profile')} onSignOut={onSignOut} />;
  if (location.pathname === '/student/help') return <HelpCenter onBack={() => navigate('/student/settings')} />;
  if (location.pathname === '/student/practice') return <PracticeMenu onBack={() => navigate('/student')} onNavigate={(view) => navigate(`/student/${view}`)} />;

  // Tab views (map, leaderboard, quests, shop, profile) share the main layout with bottom nav
  return (
    <div className="h-full bg-slate-50 font-sans max-w-md mx-auto shadow-xl border-x border-slate-200 flex flex-col pb-20 overflow-hidden">

      {/* Header (Only for Map view, others have their own) */}
      {location.pathname === '/student' && (
        <header className="sticky top-0 bg-white/90 backdrop-blur z-20 border-b border-slate-200 px-4 py-3 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-6 rounded overflow-hidden relative border border-slate-200 shadow-sm">
              {/* Mock Flag */}
              <div className="absolute inset-0 bg-white">
                <div className="w-full h-1/3 bg-blue-500"></div>
                <div className="w-full h-1/3 bg-white top-1/3 absolute"></div>
                <div className="w-full h-1/3 bg-red-500 bottom-0 absolute"></div>
              </div>
            </div>
            <span className="font-bold text-slate-700">English</span>
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-1 text-orange-500 font-bold bg-orange-50 px-2 py-1 rounded-lg">
              <span className="text-lg">🔥</span> {userStats.streak}
            </div>
            <div className="flex items-center gap-1 text-blue-500 font-bold bg-blue-50 px-2 py-1 rounded-lg">
              <span className="text-lg">💎</span> {userStats.gems}
            </div>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="h-full w-full absolute inset-0"
          >
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={
                <>
                  {state.status === 'LIVE' && (
                    <div className="bg-duo-green text-white p-4 m-4 rounded-2xl shadow-lg flex items-center justify-between animate-bounce cursor-pointer" onClick={startLesson}>
                      <div>
                        <h3 className="font-bold text-lg">Live Class Started!</h3>
                        <p className="text-sm opacity-90">Your teacher is waiting for you.</p>
                      </div>
                      <button className="bg-white text-duo-green px-4 py-2 rounded-xl font-bold hover:bg-green-50 transition-colors">
                        Join Now
                      </button>
                    </div>
                  )}
                  <HomeMap onNavigate={(view) => {
                    if (view === 'listen' || view === 'scramble') {
                      startLesson();
                    } else {
                      navigate(`/student/${view}`);
                    }
                  }} />
                </>
              } />
              <Route path="/leaderboard" element={<Leaderboard onBack={() => navigate('/student')} />} />
              <Route path="/quests" element={<Quests onBack={() => navigate('/student')} />} />
              <Route path="/shop" element={<Shop onBack={() => navigate('/student')} gemCount={userStats.gems} />} />
              <Route path="/profile" element={<Profile onBack={() => navigate('/student')} onCustomize={() => navigate('/student/avatar')} avatarConfig={avatarConfig} stats={userStats} />} />
              <Route path="*" element={<Navigate to="/student" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-slate-200 pb-safe grid grid-cols-5 z-50">
        <button
          onClick={() => navigate('/student')}
          className={`flex flex-col items-center p-3 transition-colors ${location.pathname === '/student' ? 'text-duo-green border-t-2 border-duo-green bg-green-50' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Home size={24} />
          <span className="text-[10px] font-bold mt-1 uppercase">Learn</span>
        </button>
        <button
          onClick={() => navigate('/student/leaderboard')}
          className={`flex flex-col items-center p-3 transition-colors ${location.pathname === '/student/leaderboard' ? 'text-duo-green border-t-2 border-duo-green bg-green-50' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Trophy size={24} />
          <span className="text-[10px] font-bold mt-1 uppercase">Rank</span>
        </button>
        <button
          onClick={() => navigate('/student/quests')}
          className={`flex flex-col items-center p-3 transition-colors ${location.pathname === '/student/quests' ? 'text-duo-green border-t-2 border-duo-green bg-green-50' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <BookOpen size={24} />
          <span className="text-[10px] font-bold mt-1 uppercase">Quests</span>
        </button>
        <button
          onClick={() => navigate('/student/shop')}
          className={`flex flex-col items-center p-3 transition-colors ${location.pathname === '/student/shop' ? 'text-duo-green border-t-2 border-duo-green bg-green-50' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <ShoppingBag size={24} />
          <span className="text-[10px] font-bold mt-1 uppercase">Shop</span>
        </button>
        <button
          onClick={() => navigate('/student/profile')}
          className={`flex flex-col items-center p-3 transition-colors ${location.pathname === '/student/profile' ? 'text-duo-green border-t-2 border-duo-green bg-green-50' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <User size={24} />
          <span className="text-[10px] font-bold mt-1 uppercase">Profile</span>
        </button>
      </nav>
    </div>
  );
};

export default StudentApp;
