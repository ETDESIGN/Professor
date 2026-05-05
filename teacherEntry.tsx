import React, { Suspense, lazy, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import './src/index.css';
import { SessionProvider } from './store/SessionContext';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { MockModeBanner } from './components/shared/MockModeBanner';
import { AppProviders } from './components/shared/AppProviders';
import { initErrorReporting, setupGlobalErrorHandler } from './services/errorReporting';
import { startMetricsCollection, stopMetricsCollection } from './services/perfMonitor';
import './services/i18n';

const TeacherDashboard = lazy(() => import('./apps/teacher/TeacherDashboard'));
const LessonStudio = lazy(() => import('./apps/teacher/LessonStudio'));
const LiveCommander = lazy(() => import('./apps/teacher/LiveCommander'));

const PageLoader = () => (
    <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700" />
    </div>
);

const TeacherRouter = () => {
    const navigate = useNavigate();

    useEffect(() => {
        initErrorReporting({
            dsn: import.meta.env.VITE_SENTRY_DSN,
            environment: import.meta.env.MODE,
        });
        setupGlobalErrorHandler();
        startMetricsCollection();
        return () => stopMetricsCollection();
    }, []);

    return (
        <Routes>
            <Route path="/*" element={
                <Suspense fallback={<PageLoader />}><TeacherDashboard /></Suspense>
            } />
            <Route path="/studio" element={
                <Suspense fallback={<PageLoader />}>
                    <div className="relative">
                        <button onClick={() => navigate('/')} className="fixed top-4 left-4 z-50 bg-white shadow-md p-2 rounded-full hover:bg-slate-100 border border-slate-200" title="Back to Dashboard">←</button>
                        <LessonStudio onLaunchLive={() => navigate('/live')} />
                    </div>
                </Suspense>
            } />
            <Route path="/live" element={
                <Suspense fallback={<PageLoader />}><LiveCommander onExit={() => navigate('/studio')} /></Suspense>
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
            <SessionProvider>
                <Toaster position="top-center" richColors />
                <BrowserRouter basename="/teacher">
                    <TeacherRouter />
                </BrowserRouter>
            </SessionProvider>
            </AppProviders>
        </ErrorBoundary>
    );
}
