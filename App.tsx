
import React, { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { SessionProvider } from './store/SessionContext';
import { SoloSessionProvider } from './store/SoloSessionContext';
import { Toaster } from 'sonner';
import Hub from './apps/Hub';
import Login from './apps/Login';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { RouteErrorBoundary } from './components/shared/RouteErrorBoundary';
import { MockModeBanner } from './components/shared/MockModeBanner';
import { AppProviders } from './components/shared/AppProviders';
import { useAppStore } from './store/useAppStore';
import { getCurrentUser, hasAccessToPortal } from './services/AuthService';
import { supabase } from './services/supabaseClient';
import { initErrorReporting, setupGlobalErrorHandler, setCurrentUser } from './services/errorReporting';
import { startMetricsCollection, stopMetricsCollection } from './services/perfMonitor';
import { createClientLogger } from './services/logger';

const log = createClientLogger('App');

const ClassroomBoard = lazy(() => import('./apps/board/ClassroomBoard'));
const TeacherRemote = lazy(() => import('./apps/remote/TeacherRemote'));
const StudentApp = lazy(() => import('./apps/student/StudentApp'));
const TeacherDashboard = lazy(() => import('./apps/teacher/TeacherDashboard'));
const LessonStudio = lazy(() => import('./apps/teacher/LessonStudio'));
const ParentApp = lazy(() => import('./apps/parent/ParentApp'));
const LiveCommander = lazy(() => import('./apps/teacher/LiveCommander'));
const AdminPortal = lazy(() => import('./apps/admin/AdminPortal'));
const TeacherOnboarding = lazy(() => import('./apps/teacher/TeacherOnboarding'));
const StudentOnboarding = lazy(() => import('./apps/student/StudentOnboarding'));
const ParentOnboarding = lazy(() => import('./apps/parent/ParentOnboarding'));
const ClaimStudent = lazy(() => import('./apps/ClaimStudent'));

const PageLoader = () => (
  <div className="flex items-center justify-center h-screen bg-slate-50">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700" />
  </div>
);

const NotFound = () => (
  <div className="flex flex-col items-center justify-center h-screen bg-slate-50 text-slate-700">
    <h1 className="text-6xl font-bold mb-4">404</h1>
    <p className="text-xl mb-6">Page not found</p>
    <button onClick={() => window.location.assign('/')} className="px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-700">Back to Hub</button>
  </div>
);

type Portal = 'teacher' | 'student' | 'parent' | 'admin';

function portalFromPath(pathname: string): Portal | null {
  if (pathname.startsWith('/teacher')) return 'teacher';
  if (pathname.startsWith('/student')) return 'student';
  if (pathname.startsWith('/parent')) return 'parent';
  if (pathname.startsWith('/admin')) return 'admin';
  return null;
}

function homePathForRole(role: string | undefined): string {
  if (role === 'teacher') return '/teacher';
  if (role === 'parent') return '/parent';
  if (role === 'admin' || role === 'manager') return '/admin';
  return '/student';
}

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
          // Portal access guard: prevent a user from opening a portal that
          // doesn't match their DB role (e.g. a student opening /parent).
          const portal = portalFromPath(location.pathname);
          if (portal && !hasAccessToPortal(user.role, portal)) {
            navigate(homePathForRole(user.role));
          }
        } else {
          // Clear any stale profile data if no session exists or profile failed
          clearUserProfile();
          // Redirect to login unless on a public path (login, hub, or a deep
          // link like /claim?t=... whose own gate will send the user to login
          // and preserve the return destination).
          const isPublic = location.pathname === '/login'
            || location.pathname === '/'
            || location.pathname.startsWith('/claim');
          if (!isPublic) {
            navigate('/login');
          }
        }
      } catch (error) {
        log.warn('error_checking_session', { error: error instanceof Error ? error.message : String(error) });
        // Clear profile on error to prevent stale data
        clearUserProfile();
        if (location.pathname !== '/login' && location.pathname !== '/') {
          navigate('/login');
        }
      }
    };
    checkSession();
  }, [setUserProfile, clearUserProfile, location.pathname, navigate]);

  // React to auth state changes (sign-out in another tab, token refresh, role
  // updated by an admin) so the cached profile stays correct.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearUserProfile();
        if (location.pathname !== '/login' && location.pathname !== '/') navigate('/login');
      } else if (event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        getCurrentUser().then((u) => {
          if (u) setUserProfile(u);
          else clearUserProfile();
        });
      }
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setCurrentUser(userProfile ? { id: userProfile.id, role: userProfile.role as string | undefined } : null);
  }, [userProfile]);

  const handleLogin = (role: 'district_admin' | 'teacher' | 'student' | 'parent') => {
    // Honor a pending redirect (e.g. a /claim?t=... deep link that required login).
    const pending = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pendingRedirect') : null;
    if (pending) {
      sessionStorage.removeItem('pendingRedirect');
      navigate(pending);
      return;
    }
    // The actual user data is set in Login.tsx after successful auth
    if (role === 'district_admin') navigate('/admin');
    if (role === 'teacher') navigate('/teacher');
    if (role === 'student') navigate('/student');
    if (role === 'parent') navigate('/parent');
  };

  const isHubOrLogin = location.pathname === '/' || location.pathname === '/login';

  return (
    <SessionProvider>
      <AppProviders>
      <ErrorBoundary>
        <MockModeBanner />
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

        <Route path="/onboarding/teacher" element={<RouteErrorBoundary name="onboarding-teacher"><Suspense fallback={<PageLoader />}><TeacherOnboarding /></Suspense></RouteErrorBoundary>} />
        <Route path="/onboarding/student" element={<RouteErrorBoundary name="onboarding-student"><Suspense fallback={<PageLoader />}><StudentOnboarding /></Suspense></RouteErrorBoundary>} />
        <Route path="/onboarding/parent" element={<RouteErrorBoundary name="onboarding-parent"><Suspense fallback={<PageLoader />}><ParentOnboarding /></Suspense></RouteErrorBoundary>} />

        <Route path="/claim" element={<RouteErrorBoundary name="claim"><Suspense fallback={<PageLoader />}><ClaimStudent /></Suspense></RouteErrorBoundary>} />

        <Route path="/admin/*" element={<RouteErrorBoundary name="admin"><Suspense fallback={<PageLoader />}><AdminPortal /></Suspense></RouteErrorBoundary>} />

        <Route path="/teacher/*" element={<RouteErrorBoundary name="teacher"><Suspense fallback={<PageLoader />}><TeacherDashboard /></Suspense></RouteErrorBoundary>} />
        <Route path="/teacher/studio" element={<RouteErrorBoundary name="lesson-studio"><Suspense fallback={<PageLoader />}>
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
        </Suspense></RouteErrorBoundary>} />
        <Route path="/teacher/live" element={<RouteErrorBoundary name="live-commander"><Suspense fallback={<PageLoader />}><LiveCommander onExit={() => navigate('/teacher/studio')} /></Suspense></RouteErrorBoundary>} />

        <Route path="/board" element={<RouteErrorBoundary name="classroom-board"><Suspense fallback={<PageLoader />}><ClassroomBoard /></Suspense></RouteErrorBoundary>} />
        <Route path="/remote" element={<RouteErrorBoundary name="teacher-remote"><Suspense fallback={<PageLoader />}><TeacherRemote /></Suspense></RouteErrorBoundary>} />
        <Route path="/student/*" element={<RouteErrorBoundary name="student"><Suspense fallback={<PageLoader />}><SoloSessionProvider><StudentApp onSignOut={async () => {
          await supabase.auth.signOut();
          useAppStore.getState().clearUserProfile();
          window.location.assign(window.location.origin);
        }} /></SoloSessionProvider></Suspense></RouteErrorBoundary>} />
        <Route path="/parent/*" element={<RouteErrorBoundary name="parent"><Suspense fallback={<PageLoader />}><ParentApp onSignOut={async () => {
          await supabase.auth.signOut();
          useAppStore.getState().clearUserProfile();
          window.location.assign(window.location.origin);
        }} /></Suspense></RouteErrorBoundary>} />
        <Route path="*" element={<NotFound />} />
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
      </AppProviders>
    </SessionProvider>
  );
};

export default App;
