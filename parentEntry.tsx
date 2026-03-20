import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './src/index.css';
import { SessionProvider } from './store/SessionContext';
import { Toaster } from 'sonner';
import ParentApp from './apps/parent/ParentApp';

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <SessionProvider>
            <Toaster position="top-center" richColors />
            <BrowserRouter basename="/parent">
                <Routes>
                    <Route path="/*" element={<ParentApp onSignOut={() => window.location.href = '/login'} />} />
                </Routes>
            </BrowserRouter>
        </SessionProvider>
    );
}
