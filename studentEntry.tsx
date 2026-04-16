import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './src/index.css';
import { SoloSessionProvider } from './store/SoloSessionContext';
import { Toaster } from 'sonner';
import StudentApp from './apps/student/StudentApp';

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <SoloSessionProvider>
            <Toaster position="top-center" richColors />
            <BrowserRouter basename="/student">
                <Routes>
                    <Route path="/*" element={<StudentApp onSignOut={() => window.location.href = '/login'} />} />
                </Routes>
            </BrowserRouter>
        </SoloSessionProvider>
    );
}
