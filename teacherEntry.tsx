import React, { Suspense, lazy, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import './src/index.css';
import { SessionProvider, useSession } from './store/SessionContext';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { MockModeBanner } from './components/shared/MockModeBanner';
import { UpdatePrompt } from './components/shared/UpdatePrompt';
import { AppProviders } from './components/shared/AppProviders';
import { AuthGate } from './components/shared/AuthGate';
import { initErrorReporting, setupGlobalErrorHandler } from './services/errorReporting';
import { startMetricsCollection, stopMetricsCollection } from './services/perfMonitor';
import './services/i18n';

const TeacherDashboard = lazy(() => import('./apps/teacher/TeacherDashboard'));
const LiveCommander = lazy(() => import('./apps/teacher/LiveCommander'));

const PageLoader = () => (
    <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700" />
    </div>
);

const TeacherRouter = () => {
    const navigate = useNavigate();
    const { state } = useSession();

    useEffect(() => {
        initErrorReporting({
            dsn: import.meta.env.VITE_SENTRY_DSN,
            environment: import.meta.env.MODE,
        });
        setupGlobalErrorHandler();
        startMetricsCollection();
        return () => stopMetricsCollection();
    }, []);

    // Prefetch the live-session chunk after first paint so entering / exiting
    // a session never falls back to the full-screen loader. Vite dedupes
    // dynamic imports — this primes the same module the lazy() uses.
    useEffect(() => {
        const prefetch = () => { void import('./apps/teacher/LiveCommander'); };
        if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(prefetch);
        else window.setTimeout(prefetch, 150);
    }, []);

    return (
        <Routes>
            <Route path="/*" element={
                <Suspense fallback={<PageLoader />}><TeacherDashboard /></Suspense>
            } />
            <Route path="/teacher/live" element={
                <Suspense fallback={<PageLoader />}><LiveCommander onExit={() => {
                    // Exit lands on the taught unit's BOOK page (the units list
                    // of its book) — not the studio and not a bare shelf that
                    // then redirects. endSession() has run but keeps activeUnit.
                    const bookId = state.activeUnit?.book_id;
                    navigate(bookId ? `/teacher/units?book=${bookId}` : '/teacher/units');
                }} /></Suspense>
            } />
        </Routes>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <ErrorBoundary>
            <AppProviders>
            <MockModeBanner />
            <UpdatePrompt />
            <SessionProvider>
                <Toaster position="top-center" richColors />
                <BrowserRouter>
                    <AuthGate portal="teacher">
                        <TeacherRouter />
                    </AuthGate>
                </BrowserRouter>
            </SessionProvider>
            </AppProviders>
        </ErrorBoundary>
    );
}
