
import React from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Bell, Home, BarChart2, Video, Settings, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DubbingGallery from './DubbingGallery';
import ParentReports from './ParentReports';
import ParentDashboard from './ParentDashboard';
import ParentSettings from './ParentSettings';
import ParentMessages from './ParentMessages';
import ConfettiSystem from '../../components/effects/ConfettiSystem';
import { useAppStore } from '../../store/useAppStore';

interface ParentAppProps {
  onSignOut?: () => void;
}

const ParentApp: React.FC<ParentAppProps> = ({ onSignOut }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userProfile } = useAppStore();

  return (
    <div className="h-full bg-slate-50 font-sans max-w-md mx-auto shadow-xl border-x border-slate-200 flex flex-col pb-20 relative overflow-hidden">
      {/* Shared Effects */}
      <ConfettiSystem />

      {/* Top Nav - Persistent across some views, but extracted in Dashboard */}
      {location.pathname !== '/parent' ? null : (
        <header className="bg-white px-6 py-4 flex justify-between items-center sticky top-0 z-20 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border-2 border-white shadow-sm">
              <img src={userProfile?.avatar_url || "https://api.dicebear.com/7.x/avataaars/svg?seed=Parent"} alt="Parent" />
            </div>
            <span className="font-bold text-slate-700">{userProfile?.full_name || 'Parent'}</span>
          </div>
          <button className="relative p-2 text-slate-400 hover:text-slate-600">
            <Bell size={24} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
          </button>
        </header>
      )}

      {/* Main Content Router */}
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="flex-1 overflow-hidden flex flex-col"
        >
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<ParentDashboard onNavigate={(path) => navigate(`/parent/${path}`)} />} />
            <Route path="/messages" element={<ParentMessages onBack={() => navigate('/parent')} />} />
            <Route path="/gallery" element={<DubbingGallery onBack={() => navigate('/parent')} />} />
            <Route path="/reports" element={<ParentReports onBack={() => navigate('/parent')} />} />
            <Route path="/settings" element={<ParentSettings onBack={() => navigate('/parent')} onSignOut={onSignOut} />} />
            <Route path="*" element={<Navigate to="/parent" replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>

      <BottomNav />
    </div>
  );
};

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const getActiveTab = () => {
    if (location.pathname === '/parent') return 'home';
    if (location.pathname.startsWith('/parent/reports')) return 'reports';
    if (location.pathname.startsWith('/parent/gallery')) return 'gallery';
    if (location.pathname.startsWith('/parent/settings')) return 'settings';
    return 'home';
  };

  const activeTab = getActiveTab();

  return (
    <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-slate-200 pb-safe grid grid-cols-5 z-50">
      {[
        { id: 'home', path: '/parent', icon: Home, label: 'Home' },
        { id: 'messages', path: '/parent/messages', icon: MessageCircle, label: 'Messages' },
        { id: 'reports', path: '/parent/reports', icon: BarChart2, label: 'Reports' },
        { id: 'gallery', path: '/parent/gallery', icon: Video, label: 'Gallery' },
        { id: 'settings', path: '/parent/settings', icon: Settings, label: 'Settings' }
      ].map(tab => (
        <button
          key={tab.id}
          onClick={() => navigate(tab.path)}
          className={`flex flex-col items-center p-3 transition-colors relative ${activeTab === tab.id ? 'text-cyan-500' : 'text-slate-400'}`}
        >
          {activeTab === tab.id && (
            <motion.div
              layoutId="parent-nav-indicator"
              className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-cyan-500 rounded-b-full"
            />
          )}
          <tab.icon size={24} />
          <span className="text-[10px] font-bold mt-1 uppercase">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default ParentApp;
