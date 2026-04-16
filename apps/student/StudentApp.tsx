import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Home, Trophy, BookOpen, User, ShoppingBag, Users, X, FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react';
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
import SoloLessonPlayer from './SoloLessonPlayer';
import { Engine } from '../../services/SupabaseService';
import { supabase } from '../../services/supabaseClient';
import { useSession } from '../../store/SessionContext';
import { findClassByCode, enrollStudent, getStudentClasses, ClassData, getStudentAssignments, updateStudentAssignmentStatus, AssignmentWithDetails } from '../../services/DataService';

interface StudentAppProps {
  onSignOut?: () => void;
}

const StudentApp: React.FC<StudentAppProps> = ({ onSignOut }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, setActiveUnit } = useSession();

  // Gamification State
  const [userStats, setUserStats] = useState({
    streak: 0,
    gems: 0,
    xp: 0,
    level: 1
  });

  // Track selected unit for lesson
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  useEffect(() => {
    const fetchProgress = async () => {
      const progress = await Engine.getStudentProgress();
      setUserStats(prev => ({
        ...prev,
        streak: progress.streak,
        xp: progress.xp,
        level: Math.floor(progress.xp / 1000) + 1
      }));

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('avatar_url')
            .eq('id', user.id)
            .single();
          if (profile?.avatar_url) {
            try {
              setAvatarConfig(JSON.parse(profile.avatar_url));
            } catch { /* avatar_url might not be JSON */ }
          }
        }
      } catch (error) {
        console.error('Error loading avatar:', error);
      }
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

  // Fetch enrolled classes on mount
  useEffect(() => {
    const fetchEnrolledClasses = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          const classes = await getStudentClasses(user.id);
          setEnrolledClasses(classes);
        }
      } catch (error) {
        console.error('Error fetching enrolled classes:', error);
      }
    };
    fetchEnrolledClasses();
  }, []);

  // Fetch student assignments
  useEffect(() => {
    const fetchAssignments = async () => {
      try {
        setLoadingAssignments(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          const studentAssignments = await getStudentAssignments(user.id);
          setAssignments(studentAssignments);
        }
      } catch (error) {
        console.error('Error fetching assignments:', error);
      } finally {
        setLoadingAssignments(false);
      }
    };
    fetchAssignments();
  }, []);

  // Handle marking assignment as done
  const handleMarkAsDone = async (assignmentId: string) => {
    try {
      await updateStudentAssignmentStatus(assignmentId, 'submitted');
      // Refresh assignments
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const studentAssignments = await getStudentAssignments(user.id);
        setAssignments(studentAssignments);
      }
      toast.success('Assignment submitted!', { icon: '✅' });
    } catch (error) {
      console.error('Error updating assignment:', error);
      toast.error('Failed to submit assignment');
    }
  };

  // Local state for avatar customization
  const [avatarConfig, setAvatarConfig] = useState<any>(null);

  // Temp storage for lesson results to pass to the Complete screen
  const [sessionResults, setSessionResults] = useState({ xp: 0, accuracy: 0, time: '0:00' });

  // Class enrollment state
  const [showJoinClassModal, setShowJoinClassModal] = useState(false);
  const [classCodeInput, setClassCodeInput] = useState('');
  const [enrolledClasses, setEnrolledClasses] = useState<ClassData[]>([]);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Assignments state
  const [assignments, setAssignments] = useState<AssignmentWithDetails[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  // Get the lesson playlist from the active unit's flow, or fall back to mock data
  const getLessonPlaylist = (): { type: ActivityType, id: string, data?: any }[] => {
    // If we have an active unit with flow, use it
    if (state.activeUnit?.flow && state.activeUnit.flow.length > 0) {
      return state.activeUnit.flow.map((step: any) => ({
        type: step.type as ActivityType,
        id: step.id,
        data: step.data
      }));
    }

    // No fallback, return empty state if no active unit or flow
    return [];
  };

  const lessonPlaylist = getLessonPlaylist();

  const handleAvatarSave = async (config: any) => {
    setAvatarConfig(config);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ avatar_url: JSON.stringify(config) })
          .eq('id', user.id);
      }
    } catch (error) {
      console.error('Error saving avatar:', error);
    }
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

  // Navigate to solo lesson session
  const startLesson = async (unitId?: string) => {
    if (unitId) {
      setSelectedUnitId(unitId);
      await setActiveUnit(unitId);
    }
    navigate('/student/solo-lesson');
  };

  // Handle live class banner click (uses live lesson mode)
  const handleLiveClassClick = () => {
    navigate('/student/lesson');
  };

  // Check if current path is a full screen app
  const isFullScreenApp = ['/student/login', '/student/lesson', '/student/solo-lesson', '/student/dubbing', '/student/pronounce', '/student/reading', '/student/phonics', '/student/srs', '/student/lesson-complete', '/student/avatar', '/student/settings', '/student/help', '/student/practice'].includes(location.pathname);

  if (location.pathname === '/student/login') return <Login onLogin={() => navigate('/student')} />;

  // The Main Lesson Runner (live class mode)
  if (location.pathname === '/student/lesson') {
    return <LessonSession playlist={lessonPlaylist} onComplete={handleLessonComplete} onExit={() => navigate('/student')} />;
  }

  // Solo Lesson Player (independent study mode)
  if (location.pathname === '/student/solo-lesson') {
    return <SoloLessonPlayer onComplete={handleLessonComplete} onExit={() => navigate('/student')} />;
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
          <div className="flex gap-4 items-center">
            <button
              onClick={() => setShowJoinClassModal(true)}
              className="flex items-center gap-1 text-purple-600 font-bold bg-purple-50 px-2 py-1 rounded-lg hover:bg-purple-100 transition-colors"
            >
              <Users size={16} />
              <span className="text-sm">Join Class</span>
            </button>
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
                    <div className="bg-duo-green text-white p-4 m-4 rounded-2xl shadow-lg flex items-center justify-between animate-bounce cursor-pointer" onClick={handleLiveClassClick}>
                      <div>
                        <h3 className="font-bold text-lg">Live Class Started!</h3>
                        <p className="text-sm opacity-90">Your teacher is waiting for you.</p>
                      </div>
                      <button className="bg-white text-duo-green px-4 py-2 rounded-xl font-bold hover:bg-green-50 transition-colors">
                        Join Now
                      </button>
                    </div>
                  )}
                  {/* Pending Assignments Section */}
                  <div className="mx-4 mt-4 mb-2">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText size={20} className="text-orange-500" />
                      <h2 className="font-bold text-slate-800">Pending Homework</h2>
                      {assignments.filter(a => a.student_status === 'pending').length > 0 && (
                        <span className="bg-orange-100 text-orange-600 text-xs font-bold px-2 py-0.5 rounded-full">
                          {assignments.filter(a => a.student_status === 'pending').length}
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {loadingAssignments ? (
                        <div className="bg-white rounded-xl p-4 text-center text-slate-500">
                          Loading assignments...
                        </div>
                      ) : assignments.filter(a => a.student_status === 'pending').length === 0 ? (
                        <div className="bg-white rounded-xl p-6 text-center border border-slate-100">
                          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <CheckCircle size={32} className="text-green-500" />
                          </div>
                          <h3 className="font-bold text-slate-800 mb-1">All caught up!</h3>
                          <p className="text-sm text-slate-500">No pending homework. Great job!</p>
                        </div>
                      ) : (
                        assignments
                          .filter(a => a.student_status === 'pending')
                          .slice(0, 3)
                          .map((assignment) => (
                            <div
                              key={assignment.id}
                              className="bg-white rounded-xl p-4 shadow-sm border border-slate-100"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h3 className="font-bold text-slate-800 text-sm">{assignment.title}</h3>
                                  {assignment.class_name && (
                                    <p className="text-xs text-slate-500 mt-1">{assignment.class_name}</p>
                                  )}
                                  {assignment.due_date && (
                                    <div className="flex items-center gap-1 mt-2 text-xs text-orange-600">
                                      <Clock size={12} />
                                      <span>Due: {new Date(assignment.due_date).toLocaleDateString()}</span>
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleMarkAsDone(assignment.id)}
                                  className="ml-2 px-3 py-1.5 bg-green-500 text-white text-xs font-bold rounded-lg hover:bg-green-600 transition-colors"
                                >
                                  Mark Done
                                </button>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>

                  <HomeMap onNavigate={(view, unitId) => {
                    if (view === 'listen' || view === 'scramble') {
                      startLesson(unitId);
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

      {/* Join Class Modal */}
      <AnimatePresence>
        {showJoinClassModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowJoinClassModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-slate-800">Join a Class</h2>
                <button
                  onClick={() => setShowJoinClassModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={24} />
                </button>
              </div>

              <p className="text-slate-600 mb-4">Enter the 6-character code from your teacher to join their class.</p>

              <input
                type="text"
                value={classCodeInput}
                onChange={(e) => {
                  setClassCodeInput(e.target.value.toUpperCase().slice(0, 6));
                  setJoinError('');
                }}
                placeholder="ABCD12"
                className="w-full px-4 py-3 text-center text-2xl font-mono font-bold border-2 border-slate-200 rounded-xl focus:border-purple-500 focus:outline-none uppercase tracking-widest mb-2"
                maxLength={6}
              />

              {joinError && (
                <p className="text-red-500 text-sm mb-3">{joinError}</p>
              )}

              {enrolledClasses.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-2">Your Classes</p>
                  <div className="flex flex-wrap gap-2">
                    {enrolledClasses.map((cls) => (
                      <span key={cls.id} className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-medium">
                        {cls.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={async () => {
                  if (classCodeInput.length !== 6) {
                    setJoinError('Please enter a 6-character code');
                    return;
                  }
                  setIsJoining(true);
                  setJoinError('');
                  try {
                    const classData = await findClassByCode(classCodeInput);
                    if (!classData) {
                      setJoinError('Class not found. Check the code and try again.');
                      setIsJoining(false);
                      return;
                    }
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) {
                      setJoinError('Please sign in to join a class');
                      setIsJoining(false);
                      return;
                    }
                    await enrollStudent(classData.id, user.id);
                    toast.success(`Welcome to ${classData.name}!`, { icon: '🎉' });
                    setShowJoinClassModal(false);
                    setClassCodeInput('');
                    // Refresh enrolled classes
                    const classes = await getStudentClasses(user.id);
                    setEnrolledClasses(classes);
                  } catch (error: any) {
                    if (error.code === '23505') {
                      setJoinError('You are already in this class!');
                    } else {
                      setJoinError('Failed to join class. Please try again.');
                    }
                  } finally {
                    setIsJoining(false);
                  }
                }}
                disabled={isJoining || classCodeInput.length !== 6}
                className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isJoining ? 'Joining...' : 'Join Class'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StudentApp;
