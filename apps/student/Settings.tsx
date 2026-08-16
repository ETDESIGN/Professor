
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Volume2, Mic, Bell, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';

interface SettingsProps {
   onBack: () => void;
   onSignOut?: () => void;
}

const PREFS_KEY = 'student-settings';

interface StudentPrefs {
   sound: boolean;
   speaking: boolean;
   notifications: boolean;
}

const DEFAULT_PREFS: StudentPrefs = { sound: true, speaking: true, notifications: true };

const loadPrefs = (): StudentPrefs => {
   try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
   } catch { /* corrupted prefs fall back to defaults */ }
   return DEFAULT_PREFS;
};

const Settings: React.FC<SettingsProps> = ({ onBack, onSignOut }) => {
   const [toggles, setToggles] = useState<StudentPrefs>(loadPrefs);
  const { t } = useTranslation();
   const { userProfile } = useAppStore();
   const displayName = userProfile?.full_name || userProfile?.email || 'Student';

   useEffect(() => {
      try {
         localStorage.setItem(PREFS_KEY, JSON.stringify(toggles));
      } catch { /* storage full/blocked — prefs just won't persist */ }
   }, [toggles]);

   const toggle = (key: keyof StudentPrefs) => {
      setToggles(prev => ({ ...prev, [key]: !prev[key] }));
   };

   return (
      <div className="h-full bg-slate-50 flex flex-col font-sans">
         {/* Header */}
         <header className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-20 flex items-center justify-between">
            <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full">
               <ChevronLeft size={24} />
            </button>
            <span className="font-bold text-slate-800">{t('student.settings', 'Settings')}</span>
            <div className="w-10"></div>
         </header>

         {/* Content */}
         <div className="flex-1 overflow-y-auto p-4 space-y-6">

            {/* Profile */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm"
            >
               <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-4xl border-2 border-white shadow-md">
                  🦁
               </div>
               <div>
                  <h2 className="font-bold text-slate-800 text-lg">{displayName}</h2>
                  <p className="text-slate-500 text-xs font-bold uppercase">{t('student.studentAccount', 'Student account')}</p>
               </div>
            </motion.div>

            {/* Preferences — persisted on this device. The fake "Level 5 • 12
                Day Streak" line, the non-persisting toggles and the dead
                Change PIN / Parent Dashboard buttons were removed (audit
                2026-08-17). */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.1 }}
               className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
            >
               <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {t('student.audioPrefs', 'Audio Preferences')}
               </div>
               <div className="divide-y divide-slate-100">
                  <div className="p-4 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Volume2 size={20} /></div>
                        <span className="font-bold text-slate-700">{t('student.soundEffects', 'Sound Effects')}</span>
                     </div>
                     <button
                        onClick={() => toggle('sound')}
                        aria-pressed={toggles.sound}
                        className={`w-12 h-7 rounded-full transition-colors relative ${toggles.sound ? 'bg-duo-green' : 'bg-slate-200'}`}
                     >
                        <div className={`w-5 h-5 bg-white rounded-full shadow-sm absolute top-1 transition-all ${toggles.sound ? 'left-6' : 'left-1'}`}></div>
                     </button>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><Mic size={20} /></div>
                        <span className="font-bold text-slate-700">{t('student.speakingExercises', 'Speaking Exercises')}</span>
                     </div>
                     <button
                        onClick={() => toggle('speaking')}
                        aria-pressed={toggles.speaking}
                        className={`w-12 h-7 rounded-full transition-colors relative ${toggles.speaking ? 'bg-duo-green' : 'bg-slate-200'}`}
                     >
                        <div className={`w-5 h-5 bg-white rounded-full shadow-sm absolute top-1 transition-all ${toggles.speaking ? 'left-6' : 'left-1'}`}></div>
                     </button>
                  </div>
               </div>
            </motion.div>

            {/* Notifications */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.3 }}
               className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
            >
               <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {t('student.notifications', 'Notifications')}
               </div>
               <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     <div className="p-2 bg-orange-100 text-orange-600 rounded-lg"><Bell size={20} /></div>
                     <div>
                        <div className="font-bold text-slate-700">{t('student.dailyReminder', 'Daily Reminder')}</div>
                        <div className="text-xs text-slate-400">{t('student.savedOnDevice', 'Saved on this device')}</div>
                     </div>
                  </div>
                  <button
                     onClick={() => toggle('notifications')}
                     aria-pressed={toggles.notifications}
                     className={`w-12 h-7 rounded-full transition-colors relative ${toggles.notifications ? 'bg-duo-green' : 'bg-slate-200'}`}
                  >
                     <div className={`w-5 h-5 bg-white rounded-full shadow-sm absolute top-1 transition-all ${toggles.notifications ? 'left-6' : 'left-1'}`}></div>
                  </button>
               </div>
            </motion.div>

            <motion.button
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.4 }}
               onClick={onSignOut}
               className="w-full py-4 rounded-2xl border-2 border-slate-200 text-red-500 font-bold uppercase tracking-wider hover:bg-red-50 hover:border-red-100 transition-colors flex items-center justify-center gap-2"
            >
               <LogOut size={20} /> {t('auth.logout', 'Sign Out')}
            </motion.button>

            <div className="text-center text-xs text-slate-400 font-medium pb-8">
               {t('student.appName', 'Professor Student')}
            </div>
         </div>
      </div>
   );
};

export default Settings;
