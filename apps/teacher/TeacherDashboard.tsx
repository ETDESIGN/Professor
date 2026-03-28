
import React, { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, BookOpen, Settings, LogOut, Menu, X, Calendar, Folder, FileText, BarChart3, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import UnitList from './UnitList';
import UploadTextbook from './UploadTextbook';
import ClassManagement from './ClassManagement';
import DashboardHome from './DashboardHome';
import TeacherSettings from './TeacherSettings';
import LessonTimelineBuilder from './LessonTimelineBuilder';
import AIAssetEnrichment from './AIAssetEnrichment';
import MobileProfileSettings from './MobileProfileSettings';
import ResourceLibrary from './ResourceLibrary';
import LessonEditor from './LessonEditor';
import Assignments from './Assignments';
import Reports from './Reports';
import TeacherMessages from './TeacherMessages';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../services/supabaseClient';

interface TeacherDashboardProps {
  onNavigateToStudio?: () => void;
  onLaunchLive?: () => void;
  onSignOut?: () => void;
}

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onNavigateToStudio, onLaunchLive, onSignOut }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { userProfile, setUnits } = useAppStore();

  // Hydrate real units on mount
  React.useEffect(() => {
    const loadUnits = async () => {
      try {
        const { Engine } = await import('../../services/SupabaseService');
        const units = await Engine.getUnits();
        setUnits(units);
      } catch (error) {
        console.error('Failed to fetch real units:', error);
      }
    };
    if (userProfile) {
      loadUnits();
    }
  }, [userProfile, setUnits]);

  // Helper to determine active state for nav items
  const isActive = (path: string) => {
    if (path === '/teacher' && location.pathname === '/teacher') return true;
    if (path !== '/teacher' && location.pathname.startsWith(path)) return true;
    return false;
  };

  const handleNav = (path: string) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  const handlePlanLesson = () => {
    if (window.innerWidth < 768) {
      handleNav('/teacher/mobile-editor');
    } else {
      handleNav('/teacher/timeline-builder');
    }
  };

  return (
    <div className="h-screen bg-slate-50 flex font-sans overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 w-full bg-white border-b border-slate-200 z-40 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-teacher-primary rounded-lg flex items-center justify-center">
            <BookOpen className="text-white" size={20} />
          </div>
          <span className="font-bold text-slate-800">Orchestrator</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-slate-600">
          <Menu size={24} />
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute right-0 top-0 w-64 h-full bg-white shadow-2xl p-6 flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-8">
                <span className="font-bold text-lg text-slate-800">Menu</span>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-slate-400">
                  <X size={24} />
                </button>
              </div>
              <nav className="space-y-2 flex-1">
                <button onClick={() => handleNav('/teacher')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg font-medium ${isActive('/teacher') && location.pathname === '/teacher' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600'}`}>
                  <LayoutDashboard size={20} /> Dashboard
                </button>
                <button onClick={() => handleNav('/teacher/mobile-editor')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg font-medium ${isActive('/teacher/mobile-editor') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600'}`}>
                  <Calendar size={20} /> Plan Lesson
                </button>
                <button onClick={() => handleNav('/teacher/units')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg font-medium ${isActive('/teacher/units') || isActive('/teacher/upload') || isActive('/teacher/timeline-builder') || isActive('/teacher/enrichment') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600'}`}>
                  <BookOpen size={20} /> Curriculum
                </button>
                <button onClick={() => handleNav('/teacher/assignments')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg font-medium ${isActive('/teacher/assignments') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600'}`}>
                  <FileText size={20} /> Assignments
                </button>
                <button onClick={() => handleNav('/teacher/messages')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg font-medium ${isActive('/teacher/messages') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600'}`}>
                  <MessageCircle size={20} /> Messages
                </button>
                <button onClick={() => handleNav('/teacher/reports')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg font-medium ${isActive('/teacher/reports') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600'}`}>
                  <BarChart3 size={20} /> Reports
                </button>
                <button onClick={() => handleNav('/teacher/students')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg font-medium ${isActive('/teacher/students') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600'}`}>
                  <Users size={20} /> Students
                </button>
                <button onClick={() => handleNav('/teacher/library')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg font-medium ${isActive('/teacher/library') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600'}`}>
                  <Folder size={20} /> Library
                </button>
                <button onClick={() => handleNav('/teacher/mobile-profile')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg font-medium ${isActive('/teacher/mobile-profile') || isActive('/teacher/settings') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600'}`}>
                  <Settings size={20} /> Settings
                </button>
              </nav>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  useAppStore.getState().clearUserProfile();
                  window.location.assign(window.location.origin);
                }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg font-medium text-red-500 hover:bg-red-50 mt-auto"
              >
                <LogOut size={20} /> Sign Out
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden md:flex flex-col shrink-0">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-8 h-8 bg-teacher-primary rounded-lg flex items-center justify-center shadow-md shadow-emerald-200">
              <BookOpen className="text-white" size={20} />
            </div>
            <span className="font-bold text-slate-800 text-lg tracking-tight">Orchestrator</span>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => handleNav('/teacher')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${isActive('/teacher') && location.pathname === '/teacher' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <LayoutDashboard size={20} /> Dashboard
            </button>
            <button
              onClick={() => handleNav('/teacher/units')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${isActive('/teacher/units') || isActive('/teacher/upload') || isActive('/teacher/timeline-builder') || isActive('/teacher/enrichment') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <BookOpen size={20} /> Curriculum
            </button>
            <button
              onClick={() => handleNav('/teacher/assignments')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${isActive('/teacher/assignments') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <FileText size={20} /> Assignments
            </button>
            <button
              onClick={() => handleNav('/teacher/messages')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${isActive('/teacher/messages') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <MessageCircle size={20} /> Messages
            </button>
            <button
              onClick={() => handleNav('/teacher/reports')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${isActive('/teacher/reports') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <BarChart3 size={20} /> Reports
            </button>
            <button
              onClick={() => handleNav('/teacher/students')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${isActive('/teacher/students') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Users size={20} /> Students
            </button>
            <button
              onClick={() => handleNav('/teacher/library')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${isActive('/teacher/library') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Folder size={20} /> Library
            </button>
            <button
              onClick={() => handleNav('/teacher/settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${isActive('/teacher/settings') || isActive('/teacher/mobile-profile') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Settings size={20} /> Settings
            </button>
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden">
              <img src={userProfile?.avatar_url || "https://api.dicebear.com/7.x/avataaars/svg?seed=Teacher"} alt="Teacher" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-slate-800 truncate">{userProfile?.full_name || 'Teacher'}</div>
              <div className="text-xs text-slate-500 truncate">Teacher • 3rd Grade</div>
            </div>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              useAppStore.getState().clearUserProfile();
              window.location.assign(window.location.origin);
            }}
            className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-red-500 text-sm font-medium transition-colors"
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden pt-16 md:pt-0 bg-slate-50 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full flex flex-col"
          >
            <Routes location={location}>
              <Route path="" element={<DashboardHome onLaunchLive={() => navigate('/teacher/live')} />} />
              <Route path="upload" element={<UploadTextbook onFinish={() => navigate('/teacher/enrichment')} />} />
              <Route path="enrichment" element={<AIAssetEnrichment onBack={() => navigate('/teacher/upload')} onFinish={() => navigate('/teacher/units')} />} />
              <Route path="timeline-builder" element={<LessonTimelineBuilder onBack={() => navigate('/teacher/units')} />} />
              <Route path="mobile-editor" element={<LessonEditor onBack={() => navigate('/teacher/units')} />} />
              <Route path="students" element={<ClassManagement />} />
              <Route path="assignments" element={<Assignments />} />
              <Route path="messages" element={<TeacherMessages onBack={() => navigate('/teacher')} />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<TeacherSettings />} />
              <Route path="mobile-profile" element={<MobileProfileSettings onBack={() => navigate('/teacher')} />} />
              <Route path="library" element={<ResourceLibrary />} />
              <Route path="units" element={<UnitList onNewUnit={() => navigate('/teacher/upload')} onPlanLesson={handlePlanLesson} onEditUnit={() => navigate('/teacher/studio')} onLaunchLesson={() => navigate('/teacher/live')} />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default TeacherDashboard;
