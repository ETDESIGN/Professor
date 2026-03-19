import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { SessionProvider } from './store/SessionContext';
import { Toaster } from 'sonner';
import TeacherDashboard from './apps/teacher/TeacherDashboard';
import LessonStudio from './apps/teacher/LessonStudio';
import LiveCommander from './apps/teacher/LiveCommander';

const TeacherRouter = () => {
    const navigate = useNavigate();
    return (
        <Routes>
            <Route path="/*" element={<TeacherDashboard />} />
            <Route path="/studio" element={
                <div className="relative">
                    <button onClick={() => navigate('/')} className="fixed top-4 left-4 z-50 bg-white shadow-md p-2 rounded-full hover:bg-slate-100 border border-slate-200" title="Back to Dashboard">←</button>
                    <LessonStudio onLaunchLive={() => navigate('/live')} />
                </div>
            } />
            <Route path="/live" element={<LiveCommander onExit={() => navigate('/studio')} />} />
        </Routes>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <SessionProvider>
            <Toaster position="top-center" richColors />
            <BrowserRouter basename="/teacher">
                <TeacherRouter />
            </BrowserRouter>
        </SessionProvider>
    );
}
