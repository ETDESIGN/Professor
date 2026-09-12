import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Home, Trophy, BookOpen, User, ShoppingBag, Users, X, FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { RouteErrorBoundary } from '../../components/shared/RouteErrorBoundary';
import CodeInput from './atlas/CodeInput';
import HomeMap from './HomeMap';
import LessonSession, { ActivityType } from './LessonSession';
import { Engine } from '../../services/SupabaseService';
import { supabase } from '../../services/supabaseClient';
import { useSoloSession } from '../../store/SoloSessionContext';
import { joinClassByCode } from '../../services/DataService';
import { useStudentClasses, useStudentAssignments, useSubmitAssignment, useMyAvatar } from '../../hooks/useQueries';
import { useQueryClient } from '@tanstack/react-query';
import { GamificationService } from '../../services/GamificationService';
import { GEM_REWARDS, XP_REWARDS, QUEST_TYPES } from '../../constants/gamification';
import { createClientLogger } from '../../services/logger';
import Avatar from '../../components/shared/Avatar';
import { useMainScrollRestore } from './useMainScrollRestore';

// Feature flag: dubbing is a mock (audit P1-5). Default OFF.
const dubbingEnabled = import.meta.env.VITE_ENABLE_DUBBING === 'true';

const DubbingStudio = lazy(() => import('./DubbingStudio'));
const ClassDubs = lazy(() => import('./ClassDubs'));
const Profile = lazy(() => import('./Profile'));
const Settings = lazy(() => import('./Settings'));
const HelpCenter = lazy(() => import('./HelpCenter'));
const PronunciationCoach = lazy(() => import('./PronunciationCoach'));
const Leaderboard = lazy(() => import('./Leaderboard'));
const Quests = lazy(() => import('./Quests'));
const AvatarBuilder = lazy(() => import('./AvatarBuilder'));
const PracticeMenu = lazy(() => import('./PracticeMenu'));
const ReadingReader = lazy(() => import('./ReadingReader'));
const Shop = lazy(() => import('./Shop'));
const LessonComplete = lazy(() => import('./LessonComplete'));
const PhonicsPhlyer = lazy(() => import('./PhonicsPhlyer'));
const SpacedRepetition = lazy(() => import('./SpacedRepetition'));
const SoloLessonPlayer = lazy(() => import('./SoloLessonPlayer'));
const FastVocabGame = lazy(() => import('./FastVocabGame'));
const SpellingBeeGame = lazy(() => import('./SpellingBeeGame'));

const PageLoader = () => (
  <div className="flex items-center justify-center h-full">
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wa-teal" />
  </div>
);

const log = createClientLogger('StudentApp');

/**
 * Dubbing flow container (studio ↔ class gallery). State-based switch inside
 * the single /student/dubbing mount — keeps the flag gate and onBack behavior
 * unchanged (no sub-routes introduced).
 */
const DubbingFlow: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [view, setView] = useState<'studio' | 'gallery'>('studio');
  return (
    <Suspense fallback={<PageLoader />}>
      {view === 'studio' ? (
        <DubbingStudio onBack={onBack} onOpenGallery={() => setView('gallery')} />
      ) : (
        <ClassDubs onBack={() => setView('studio')} onGoStudio={() => setView('studio')} />
      )}
    </Suspense>
  );
};


interface StudentAppProps {
  onSignOut?: () => void;
}

const StudentApp: React.FC<StudentAppProps> = ({ onSignOut }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { state, setActiveUnit } = useSoloSession();

  // The main layout (incl. its scroll container) unmounts for lessons and
  // other full-screen routes — save the map's scroll and restore it on return.
  const isMainScreen = location.pathname === '/student';
  const { containerRef: mainScrollRef, handleContainerScroll } = useMainScrollRestore(isMainScreen);

  const [userId, setUserId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const { data: enrolledClasses = [] } = useStudentClasses(userId);
  const { data: assignments = [], isLoading: loadingAssignments } = useStudentAssignments(userId);
  const submitAssignment = useSubmitAssignment();
  // Avatar v2: config + rendered URL come from the server (source of truth).
  const { data: myAvatar } = useMyAvatar();

  // Gamification State
  const [userStats, setUserStats] = useState({
    streak: 0,
    gems: 0,
    xp: 0,
    level: 1
  });

  // Track selected unit for lesson
  const [, setSelectedUnitId] = useState<string | null>(null);

  useEffect(() => {
    const fetchProgress = async () => {
      const progress = await Engine.getStudentProgress();
      setUserStats(prev => ({
        ...prev,
        streak: progress.streak,
        gems: progress.gems ?? 0,
        xp: progress.xp,
        level: Math.floor(progress.xp / 100) + 1
      }));
    };
    fetchProgress();
    GamificationService.checkAndUpdateStreak().then(({ streak }) => {
      setUserStats(prev => ({ ...prev, streak }));
    });
  }, []);

  // Live-class "CELEBRATE" confetti listener removed (2026-08-17): student
  // devices have no classroom_live subscription (LIVE_GAME_LIFECYCLE.md §9),
  // so teacher broadcasts could never reach this lastAction — dead code.

  const handleMarkAsDone = async (assignmentId: string) => {
    try {
      await submitAssignment.mutateAsync({ assignmentId, studentId: userId! });
      toast.success(t('student.assignmentSubmitted'), { icon: '✅' });
    } catch (error) {
      log.warn('error_updating_assignment', { error: error instanceof Error ? error.message : String(error) });
      toast.error(t('student.failedSubmit'));
    }
  };

  // Temp storage for lesson results to pass to the Complete screen
  const [sessionResults, setSessionResults] = useState({ xp: 0, accuracy: 0, time: '0:00', stars: 3 });

  // Class enrollment state
  const [showJoinClassModal, setShowJoinClassModal] = useState(false);
  const [classCodeInput, setClassCodeInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Get the lesson playlist from the active unit's flow, or return empty.
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

  // Avatar v2: the Builder persists via equip RPCs + compose-avatar itself;
  // the react-query cache (invalidated by those mutations) is the live state.
  const handleAvatarSave = (_config: unknown, _url: string | null) => {
    navigate('/student/profile');
  };

  const handleLessonComplete = (results: { xp: number, accuracy: number, time: string, stars?: number }) => {
    setSessionResults({ xp: results.xp, accuracy: results.accuracy, time: results.time, stars: results.stars ?? 3 });
    navigate('/student/lesson-complete');
  };

  const finalizeLesson = async () => {
    const xpResult = await GamificationService.awardXP(
      sessionResults.xp || XP_REWARDS.LESSON_COMPLETE,
      'lesson_complete'
    );
    // Perfect-lesson gems are gated on 5 stars (the mini-games already gate
    // this way — the unconditional award here made every lesson "perfect").
    const perfect = (sessionResults.stars ?? 0) === 5;
    const newGems = perfect
      ? await GamificationService.awardGems(GEM_REWARDS.PERFECT_LESSON, 'lesson_complete')
      : userStats.gems;

    await GamificationService.updateQuestProgress(QUEST_TYPES.COMPLETE_LESSONS, 1);
    await GamificationService.updateQuestProgress(QUEST_TYPES.EARN_XP, sessionResults.xp || XP_REWARDS.LESSON_COMPLETE);

    setUserStats(prev => ({
      ...prev,
      xp: xpResult.newXP,
      gems: newGems,
      level: xpResult.newLevel,
    }));
    navigate('/student');
  };

  // Navigate to solo lesson session. With a stageId, only that student-path
  // node's blocks play (Duolingo-style step); without it, the full flow.
  const startLesson = async (unitId?: string, stageId?: string) => {
    if (unitId) {
      setSelectedUnitId(unitId);
      await setActiveUnit(unitId, stageId);
    }
    navigate('/student/solo-lesson');
  };

  // The Main Lesson Runner (live class mode)
  if (location.pathname === '/student/lesson') {
    return <LessonSession playlist={lessonPlaylist} onComplete={handleLessonComplete} onExit={() => navigate('/student')} />;
  }

  // Solo Lesson Player (independent study mode)
  if (location.pathname === '/student/solo-lesson') {
    return <Suspense fallback={<PageLoader />}><SoloLessonPlayer onComplete={handleLessonComplete} onExit={() => navigate('/student')} /></Suspense>;
  }

  // Full screen standalone apps
  if (dubbingEnabled && location.pathname === '/student/dubbing') return <DubbingFlow onBack={() => handleLessonComplete({ xp: 5, accuracy: 95, time: '2:30' })} />;
  // Real stats (Phase 4): the practice apps report their own attempts/quiz
  // results via onSessionEnd — the old hardcoded xp/accuracy values are gone.
  // Phonics + SRS run through ExerciseRunner, which already awards XP per
  // correct answer — their exits no longer re-award a second time.
  if (location.pathname === '/student/pronounce') return <Suspense fallback={<PageLoader />}><PronunciationCoach onBack={() => navigate('/student')} onSessionEnd={(s) => { if (s.total > 0 && s.correct === s.total) GamificationService.updateQuestProgress(QUEST_TYPES.PERFECT_SPEAKING, 1); handleLessonComplete({ xp: Math.max(1, s.correct * XP_REWARDS.CORRECT_ANSWER), accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0, time: '—' }); }} /></Suspense>;
  if (location.pathname === '/student/reading') return <Suspense fallback={<PageLoader />}><ReadingReader onBack={() => navigate('/student')} onSessionEnd={(s) => { handleLessonComplete({ xp: Math.max(1, s.correct * XP_REWARDS.CORRECT_ANSWER), accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 100, time: '—' }); }} /></Suspense>;
  if (location.pathname === '/student/phonics') return <Suspense fallback={<PageLoader />}><PhonicsPhlyer onBack={() => navigate('/student')} /></Suspense>;
  if (location.pathname === '/student/srs') return <Suspense fallback={<PageLoader />}><SpacedRepetition onBack={() => navigate('/student/practice')} onComplete={() => navigate('/student')} /></Suspense>;
  if (location.pathname === '/student/fast-vocab') return <Suspense fallback={<PageLoader />}><FastVocabGame onBack={() => navigate('/student/practice')} /></Suspense>;
  if (location.pathname === '/student/spelling-bee') return <Suspense fallback={<PageLoader />}><SpellingBeeGame onBack={() => navigate('/student/practice')} /></Suspense>;

  // The Reward Interstitial
  if (location.pathname === '/student/lesson-complete') return <Suspense fallback={<PageLoader />}><LessonComplete onContinue={finalizeLesson} stats={sessionResults} /></Suspense>;

  // Secondary Screens that don't show the bottom nav
  if (location.pathname === '/student/avatar') return <Suspense fallback={<PageLoader />}><AvatarBuilder onBack={() => navigate('/student/profile')} onSave={handleAvatarSave} initialConfig={myAvatar?.config || null} /></Suspense>;
  if (location.pathname === '/student/settings') return <Suspense fallback={<PageLoader />}><Settings onBack={() => navigate('/student/profile')} onSignOut={onSignOut} /></Suspense>;
  if (location.pathname === '/student/help') return <Suspense fallback={<PageLoader />}><HelpCenter onBack={() => navigate('/student/settings')} /></Suspense>;
  if (location.pathname === '/student/practice') return <Suspense fallback={<PageLoader />}><PracticeMenu onBack={() => navigate('/student')} onNavigate={(view) => navigate(`/student/${view}`)} /></Suspense>;

  // Tab views (map, leaderboard, quests, shop, profile) share the main layout with bottom nav
  return (
    <div className="h-full bg-wa-cream font-wa-body max-w-md mx-auto shadow-xl border-x border-wa-border flex flex-col pb-20 overflow-hidden">

      {/* Header (Only for Map view, others have their own) */}
      {location.pathname === '/student' && (
        <header className="sticky top-0 bg-wa-paper/90 backdrop-blur z-20 border-b border-wa-border px-4 py-3 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            {/* Stitch screen_1: rounded profile avatar + level badge (replaces the flag chip) */}
            <div className="relative">
              <Avatar src={myAvatar?.url ?? null} name="Me" size={36} className="border-2 border-wa-teal" />
              <div className="absolute -bottom-1 -right-1 bg-wa-ink text-white font-wa-body font-black text-[10px] px-1.5 rounded-full border border-white">
                L{userStats.level}
              </div>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setShowJoinClassModal(true)}
              className="flex items-center gap-1 text-white text-sm font-wa-display font-bold bg-wa-teal px-3 py-1.5 rounded-full shadow-wa-btn-teal active:translate-y-0.5 active:shadow-none transition-all"
            >
              <Users size={15} />
              <span>{t('student.joinClass')}</span>
            </button>
            <div className="flex items-center gap-1 text-wa-terra font-bold bg-wa-terra/10 px-2.5 py-1.5 rounded-full">
              <span className="text-lg">🔥</span> {userStats.streak}
            </div>
            <div className="flex items-center gap-1 text-wa-teal font-bold bg-wa-teal/10 px-2.5 py-1.5 rounded-full">
              <span className="text-lg">💎</span> {userStats.gems}
            </div>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <div ref={mainScrollRef} onScroll={handleContainerScroll} className="flex-1 overflow-y-auto relative">
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
              <Route path="/student" element={
                <>
                  {/* Pending Assignments Section */}
                  <div className="mx-4 mt-4 mb-2">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText size={20} className="text-wa-terra" />
                      <h2 className="font-bold text-wa-ink">{t('student.pendingHomework')}</h2>
                      {assignments.filter(a => a.student_status === 'pending').length > 0 && (
                        <span className="bg-wa-terra/15 text-wa-terra text-xs font-bold px-2 py-0.5 rounded-full">
                          {assignments.filter(a => a.student_status === 'pending').length}
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {loadingAssignments ? (
                        <div className="bg-wa-paper rounded-wa-tile p-4 text-center text-wa-muted">
                          {t('common.loading')}
                        </div>
                      ) : assignments.filter(a => a.student_status === 'pending').length === 0 ? (
                        <div className="bg-wa-paper rounded-wa-card p-6 text-center border border-wa-border">
                          <div className="w-16 h-16 bg-wa-successBg rounded-full flex items-center justify-center mx-auto mb-3">
                            <CheckCircle size={32} className="text-wa-teal" />
                          </div>
                          <h3 className="font-bold text-wa-ink mb-1">{t('student.allCaughtUp')}</h3>
                          <p className="text-sm text-wa-muted">{t('student.noPendingHomework')}</p>
                        </div>
                      ) : (
                        assignments
                          .filter(a => a.student_status === 'pending')
                          .slice(0, 3)
                          .map((assignment) => (
                            <div
                              key={assignment.id}
                              className="bg-wa-paper rounded-wa-card p-4 shadow-wa-card border border-wa-border"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h3 className="font-bold text-wa-ink text-sm">{assignment.title}</h3>
                                  {assignment.class_name && (
                                    <p className="text-xs text-wa-muted mt-1">{assignment.class_name}</p>
                                  )}
                                  {assignment.due_date && (
                                    <div className="flex items-center gap-1 mt-2 text-xs text-wa-terra">
                                      <Clock size={12} />
                                      <span>Due: {new Date(assignment.due_date).toLocaleDateString()}</span>
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleMarkAsDone(assignment.id)}
                                  className="ml-2 px-3 py-1.5 bg-wa-teal text-white text-xs font-wa-display font-bold rounded-full shadow-wa-btn-teal active:translate-y-0.5 active:shadow-none transition-all"
                                >
                                  {t('student.markDone')}
                                </button>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>

                  <HomeMap onJoinClass={() => setShowJoinClassModal(true)} onNavigate={(view, unitId, stageId) => {
                    if (view === 'lesson' || view === 'listen' || view === 'scramble') {
                      startLesson(unitId, stageId);
                    } else {
                      navigate(`/student/${view}`);
                    }
                  }} />
                </>
              } />
              <Route path="/student/leaderboard" element={<RouteErrorBoundary name="leaderboard"><Leaderboard onBack={() => navigate('/student')} /></RouteErrorBoundary>} />
              <Route path="/student/quests" element={<RouteErrorBoundary name="quests"><Quests onBack={() => navigate('/student')} /></RouteErrorBoundary>} />
              <Route path="/student/shop" element={<RouteErrorBoundary name="shop"><Shop onBack={() => navigate('/student')} onOpenStudio={() => navigate('/student/avatar')} /></RouteErrorBoundary>} />
              <Route path="/student/profile" element={<RouteErrorBoundary name="profile"><Profile onBack={() => navigate('/student')} onCustomize={() => navigate('/student/avatar')} stats={userStats} /></RouteErrorBoundary>} />
              <Route path="*" element={<Navigate to="/student" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 w-full max-w-md bg-wa-paper border-t border-wa-border pb-safe grid grid-cols-5 z-50">
        <button
          onClick={() => navigate('/student')}
          className={`flex flex-col items-center p-3 transition-colors ${location.pathname === '/student' ? 'text-wa-teal border-t-2 border-wa-teal bg-wa-teal/10' : 'text-wa-muted hover:text-wa-ink'}`}
        >
          <Home size={24} />
          <span className="text-[10px] font-bold mt-1 uppercase font-wa-display font-bold">{t('nav.learn')}</span>
        </button>
        <button
          onClick={() => navigate('/student/leaderboard')}
          className={`flex flex-col items-center p-3 transition-colors ${location.pathname === '/student/leaderboard' ? 'text-wa-teal border-t-2 border-wa-teal bg-wa-teal/10' : 'text-wa-muted hover:text-wa-ink'}`}
        >
          <Trophy size={24} />
          <span className="text-[10px] font-bold mt-1 uppercase font-wa-display font-bold">{t('nav.rank')}</span>
        </button>
        <button
          onClick={() => navigate('/student/quests')}
          className={`flex flex-col items-center p-3 transition-colors ${location.pathname === '/student/quests' ? 'text-wa-teal border-t-2 border-wa-teal bg-wa-teal/10' : 'text-wa-muted hover:text-wa-ink'}`}
        >
          <BookOpen size={24} />
          <span className="text-[10px] font-bold mt-1 uppercase font-wa-display font-bold">{t('nav.quests')}</span>
        </button>
        <button
          onClick={() => navigate('/student/shop')}
          className={`flex flex-col items-center p-3 transition-colors ${location.pathname === '/student/shop' ? 'text-wa-teal border-t-2 border-wa-teal bg-wa-teal/10' : 'text-wa-muted hover:text-wa-ink'}`}
        >
          <ShoppingBag size={24} />
          <span className="text-[10px] font-bold mt-1 uppercase font-wa-display font-bold">{t('nav.shop')}</span>
        </button>
        <button
          onClick={() => navigate('/student/profile')}
          className={`flex flex-col items-center p-3 transition-colors ${location.pathname === '/student/profile' ? 'text-wa-teal border-t-2 border-wa-teal bg-wa-teal/10' : 'text-wa-muted hover:text-wa-ink'}`}
        >
          <User size={24} />
          <span className="text-[10px] font-bold mt-1 uppercase font-wa-display font-bold">{t('nav.profile')}</span>
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
              className="bg-wa-paper rounded-wa-card p-6 w-full max-w-sm shadow-xl border border-wa-border"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-wa-display font-bold text-wa-ink">{t('student.joinClass')}</h2>
                <button
                  onClick={() => setShowJoinClassModal(false)}
                  className="text-wa-muted hover:text-wa-ink"
                >
                  <X size={24} />
                </button>
              </div>

              <p className="text-wa-muted mb-4">{t('student.enterCode')}</p>

              <CodeInput
                value={classCodeInput}
                onChange={(v) => { setClassCodeInput(v); setJoinError(''); }}
              />

              {joinError && (
                <p className="text-wa-terra text-sm mb-3">{joinError}</p>
              )}

              {enrolledClasses.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-bold text-wa-muted uppercase mb-2">{t('student.yourClasses')}</p>
                  <div className="flex flex-wrap gap-2">
                    {enrolledClasses.map((cls) => (
                      <span key={cls.id} className="bg-wa-teal/10 text-wa-teal px-3 py-1 rounded-full text-sm font-medium">
                        {cls.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={async () => {
                  if (classCodeInput.length !== 6) {
                    setJoinError(t('student.codeRequired'));
                    return;
                  }
                  setIsJoining(true);
                  setJoinError('');
                  try {
                    const joined = await joinClassByCode(classCodeInput);
                    if (!joined) {
                      setJoinError(t('student.classNotFound'));
                      setIsJoining(false);
                      return;
                    }
                    if (joined.already_enrolled) {
                      setJoinError(t('student.alreadyEnrolled'));
                      setIsJoining(false);
                      return;
                    }
                    toast.success(`Welcome to ${joined.name}!`, { icon: '🎉' });
                    setShowJoinClassModal(false);
                    setClassCodeInput('');
                    await queryClient.invalidateQueries({ queryKey: ['studentClasses'] });
                  } catch (error: any) {
                    setJoinError(t('student.joinFailed'));
                  } finally {
                    setIsJoining(false);
                  }
                }}
                disabled={isJoining || classCodeInput.length !== 6}
                className="w-full bg-wa-teal text-white font-wa-display font-bold py-3 rounded-2xl shadow-wa-btn-teal active:translate-y-0.5 active:shadow-none hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isJoining ? t('common.loading') : t('student.joinClass')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StudentApp;
