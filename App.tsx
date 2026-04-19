
import React, { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { SessionProvider } from './store/SessionContext';
import { Toaster } from 'sonner';
import Hub from './apps/Hub';
import Login from './apps/Login';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { useAppStore } from './store/useAppStore';
import { getCurrentUser } from './services/AuthService';
import { supabase } from './services/supabaseClient';
import { initErrorReporting, setupGlobalErrorHandler, setCurrentUser } from './services/errorReporting';
import { startMetricsCollection, stopMetricsCollection } from './services/perfMonitor';

const ClassroomBoard = lazy(() => import('./apps/board/ClassroomBoard'));
const TeacherRemote = lazy(() => import('./apps/remote/TeacherRemote'));
const StudentApp = lazy(() => import('./apps/student/StudentApp'));
const TeacherDashboard = lazy(() => import('./apps/teacher/TeacherDashboard'));
const LessonStudio = lazy(() => import('./apps/teacher/LessonStudio'));
const ParentApp = lazy(() => import('./apps/parent/ParentApp'));
const LiveCommander = lazy(() => import('./apps/teacher/LiveCommander'));
const DistrictAdminDashboard = lazy(() => import('./apps/admin/DistrictAdminDashboard'));
const TeacherOnboarding = lazy(() => import('./apps/teacher/TeacherOnboarding'));
const StudentOnboarding = lazy(() => import('./apps/student/StudentOnboarding'));
const ParentOnboarding = lazy(() => import('./apps/parent/ParentOnboarding'));

const PageLoader = () => (
  <div className="flex items-center justify-center h-screen bg-slate-50">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700" />
  </div>
);

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUserProfile, clearUserProfile, userProfile } = useAppStore();

  useEffect(() => {
    initErrorReporting({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
    });
    setupGlobalErrorHandler();
    startMetricsCollection();
    return () => stopMetricsCollection();
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const user = await getCurrentUser();
        if (user) {
          // Always fetch fresh profile from database to avoid stale mock data
          setUserProfile(user);
        } else {
          // Clear any stale profile data if no session exists or profile failed
          clearUserProfile();
          // Redirect to login if not on login or hub page
          if (location.pathname !== '/login' && location.pathname !== '/') {
            navigate('/login');
          }
        }
      } catch (error) {
        console.error('Error checking session:', error);
        // Clear profile on error to prevent stale data
        clearUserProfile();
        // Redirect to login if not on login or hub page
        if (location.pathname !== '/login' && location.pathname !== '/') {
          navigate('/login');
        }
      }
    };
    checkSession();
  }, [setUserProfile, clearUserProfile, location.pathname, navigate]);

  useEffect(() => {
    setCurrentUser(userProfile ? { id: userProfile.id, role: userProfile.role as string | undefined } : null);
  }, [userProfile]);

  const handleLogin = (role: 'district_admin' | 'teacher' | 'student' | 'parent') => {
    // The actual user data is set in Login.tsx after successful auth
    if (role === 'district_admin') navigate('/admin');
    if (role === 'teacher') navigate('/teacher');
    if (role === 'student') navigate('/student');
    if (role === 'parent') navigate('/parent');
  };

  const isHubOrLogin = location.pathname === '/' || location.pathname === '/login';

  return (
    <SessionProvider>
      <ErrorBoundary>
        <Toaster position="top-center" richColors />

      <Routes>
        <Route path="/" element={<Hub onSelectApp={(app) => {
          if (app === 'onboarding-teacher') navigate('/onboarding/teacher');
          if (app === 'onboarding-student') navigate('/onboarding/student');
          if (app === 'onboarding-parent') navigate('/onboarding/parent');
          if (app === 'admin-portal') navigate('/admin');
          if (app === 'teacher-studio') navigate('/teacher');
          if (app === 'teacher-live-commander') navigate('/teacher/live');
          if (app === 'student-app') navigate('/student');
          if (app === 'parent-app') navigate('/parent');
          if (app === 'classroom-board') navigate('/board');
          if (app === 'teacher-remote') navigate('/remote');
        }} />} />
        <Route path="/login" element={<Login onLogin={handleLogin} />} />

        <Route path="/onboarding/teacher" element={<Suspense fallback={<PageLoader />}><TeacherOnboarding /></Suspense>} />
        <Route path="/onboarding/student" element={<Suspense fallback={<PageLoader />}><StudentOnboarding /></Suspense>} />
        <Route path="/onboarding/parent" element={<Suspense fallback={<PageLoader />}><ParentOnboarding /></Suspense>} />

        <Route path="/admin/*" element={<Suspense fallback={<PageLoader />}><DistrictAdminDashboard /></Suspense>} />

        <Route path="/teacher/*" element={<Suspense fallback={<PageLoader />}><TeacherDashboard /></Suspense>} />
        <Route path="/teacher/studio" element={<Suspense fallback={<PageLoader />}>
          <div className="relative">
            <button
              onClick={() => navigate('/teacher')}
              className="fixed top-4 left-4 z-50 bg-white shadow-md p-2 rounded-full hover:bg-slate-100 border border-slate-200"
              title="Back to Dashboard"
            >
              ←
            </button>
            <LessonStudio onLaunchLive={() => navigate('/teacher/live')} />
          </div>
        </Suspense>} />
        <Route path="/teacher/live" element={<Suspense fallback={<PageLoader />}><LiveCommander onExit={() => navigate('/teacher/studio')} /></Suspense>} />

        <Route path="/board" element={<Suspense fallback={<PageLoader />}><ClassroomBoard /></Suspense>} />
        <Route path="/remote" element={<Suspense fallback={<PageLoader />}><TeacherRemote /></Suspense>} />
        <Route path="/student/*" element={<Suspense fallback={<PageLoader />}><StudentApp onSignOut={async () => {
          await supabase.auth.signOut();
          useAppStore.getState().clearUserProfile();
          window.location.assign(window.location.origin);
        }} /></Suspense>} />
        <Route path="/parent/*" element={<Suspense fallback={<PageLoader />}><ParentApp onSignOut={async () => {
          await supabase.auth.signOut();
          useAppStore.getState().clearUserProfile();
          window.location.assign(window.location.origin);
        }} /></Suspense>} />
      </Routes>

      {/* Global "Exit Prototype" button to return to Hub */}
      {!isHubOrLogin && (
        <button
          onClick={() => navigate('/')}
          className="fixed bottom-4 left-4 z-[100] bg-slate-800 text-white px-3 py-1 rounded text-xs opacity-50 hover:opacity-100 transition-opacity font-mono pointer-events-auto"
        >
          Exit to Hub
        </button>
      )}
      </ErrorBoundary>
    </SessionProvider>
  );
};

export default App;
