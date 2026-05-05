import React, { Suspense, lazy, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './src/index.css';
import { SessionProvider } from './store/SessionContext';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { MockModeBanner } from './components/shared/MockModeBanner';
import { AppProviders } from './components/shared/AppProviders';
import { initErrorReporting, setupGlobalErrorHandler } from './services/errorReporting';
import { startMetricsCollection, stopMetricsCollection } from './services/perfMonitor';
import './services/i18n';

const ParentApp = lazy(() => import('./apps/parent/ParentApp'));

const PageLoader = () => (
    <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700" />
    </div>
);

const ParentEntry = () => {
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
                    <ParentApp onSignOut={() => window.location.href = '/login'} />
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
            <SessionProvider>
                <Toaster position="top-center" richColors />
                <BrowserRouter basename="/parent">
                    <ParentEntry />
                </BrowserRouter>
            </SessionProvider>
            </AppProviders>
        </ErrorBoundary>
    );
}
