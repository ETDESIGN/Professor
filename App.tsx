
import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { SessionProvider } from './store/SessionContext';
import { Toaster } from 'sonner';
import Hub from './apps/Hub';
import ClassroomBoard from './apps/board/ClassroomBoard';
import TeacherRemote from './apps/remote/TeacherRemote';
import StudentApp from './apps/student/StudentApp';
import TeacherDashboard from './apps/teacher/TeacherDashboard';
import LessonStudio from './apps/teacher/LessonStudio';
import ParentApp from './apps/parent/ParentApp';
import LiveCommander from './apps/teacher/LiveCommander';
import Login from './apps/Login';
import DistrictAdminDashboard from './apps/admin/DistrictAdminDashboard';
import TeacherOnboarding from './apps/teacher/TeacherOnboarding';
import StudentOnboarding from './apps/student/StudentOnboarding';
import ParentOnboarding from './apps/parent/ParentOnboarding';
import { APP_NAME } from './constants';

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = (role: 'district_admin' | 'teacher' | 'student' | 'parent') => {
    if (role === 'district_admin') navigate('/admin');
    if (role === 'teacher') navigate('/onboarding/teacher');
    if (role === 'student') navigate('/onboarding/student');
    if (role === 'parent') navigate('/onboarding/parent');
  };

  const isHubOrLogin = location.pathname === '/' || location.pathname === '/login';

  return (
    <SessionProvider>
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

        {/* Onboarding Routes */}
        <Route path="/onboarding/teacher" element={<TeacherOnboarding />} />
        <Route path="/onboarding/student" element={<StudentOnboarding />} />
        <Route path="/onboarding/parent" element={<ParentOnboarding />} />

        {/* Admin Routes */}
        <Route path="/admin/*" element={<DistrictAdminDashboard />} />

        {/* Teacher Routes */}
        <Route path="/teacher/*" element={<TeacherDashboard />} />
        <Route path="/teacher/studio" element={
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
        } />
        <Route path="/teacher/live" element={<LiveCommander onExit={() => navigate('/teacher/studio')} />} />

        {/* Other Apps */}
        <Route path="/board" element={<ClassroomBoard />} />
        <Route path="/remote" element={<TeacherRemote />} />
        <Route path="/student/*" element={<StudentApp onSignOut={() => navigate('/login')} />} />
        <Route path="/parent/*" element={<ParentApp onSignOut={() => navigate('/login')} />} />
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
    </SessionProvider>
  );
};

export default App;
