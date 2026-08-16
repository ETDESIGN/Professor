import React, { Suspense, lazy, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './src/index.css';
import { SessionProvider } from './store/SessionContext';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { MockModeBanner } from './components/shared/MockModeBanner';
import { UpdatePrompt } from './components/shared/UpdatePrompt';
import { AppProviders } from './components/shared/AppProviders';
import { AuthGate } from './components/shared/AuthGate';
import { initErrorReporting, setupGlobalErrorHandler } from './services/errorReporting';
import { startMetricsCollection, stopMetricsCollection } from './services/perfMonitor';
import './services/i18n';

const AdminPortal = lazy(() => import('./apps/admin/AdminPortal'));

const PageLoader = () => (
    <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700" />
    </div>
);

const AdminEntry = () => {
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
                <Suspense fallback={<PageLoader />}>
                    <AdminPortal />
                </Suspense>
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
                    <AuthGate portal="admin">
                        <AdminEntry />
                    </AuthGate>
                </BrowserRouter>
            </SessionProvider>
            </AppProviders>
        </ErrorBoundary>
    );
}
