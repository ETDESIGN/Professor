
import React, { useState } from 'react';
import { ChevronLeft, Volume2, Mic, Lock, Users, Bell, LogOut, ChevronRight, Moon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';

interface SettingsProps {
   onBack: () => void;
   onSignOut?: () => void;
}

const Settings: React.FC<SettingsProps> = ({ onBack, onSignOut }) => {
   const [toggles, setToggles] = useState({
      sound: true,
      speaking: true,
      notifications: true,
      darkMode: false,
   });
   const { userProfile } = useAppStore();
   const displayName = userProfile?.full_name || userProfile?.email || 'Student';

   const toggle = (key: keyof typeof toggles) => {
      setToggles(prev => ({ ...prev, [key]: !prev[key] }));
   };

   return (
      <div className="h-full bg-slate-50 flex flex-col font-sans">
         {/* Header */}
         <header className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-20 flex items-center justify-between">
            <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full">
               <ChevronLeft size={24} />
            </button>
            <span className="font-bold text-slate-800">Settings</span>
            <div className="w-10"></div>
         </header>

         {/* Content */}
         <div className="flex-1 overflow-y-auto p-4 space-y-6">

            {/* Profile Stub */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm"
            >
               <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-4xl border-2 border-white shadow-md relative">
                  🦁
                  <div className="absolute bottom-0 right-0 w-6 h-6 bg-slate-800 rounded-full flex items-center justify-center border-2 border-white">
                     <span className="text-white text-[10px]">✎</span>
                  </div>
               </div>
               <div>
                  <h2 className="font-bold text-slate-800 text-lg">{displayName}</h2>
                  <p className="text-slate-500 text-xs font-bold uppercase">Level 5 • 12 Day Streak</p>
               </div>
            </motion.div>

            {/* Audio Group */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.1 }}
               className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
            >
               <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Audio Preferences
               </div>
               <div className="divide-y divide-slate-100">
                  <div className="p-4 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Volume2 size={20} /></div>
                        <span className="font-bold text-slate-700">Sound Effects</span>
                     </div>
                     <button
                        onClick={() => toggle('sound')}
                        className={`w-12 h-7 rounded-full transition-colors relative ${toggles.sound ? 'bg-duo-green' : 'bg-slate-200'}`}
                     >
                        <div className={`w-5 h-5 bg-white rounded-full shadow-sm absolute top-1 transition-all ${toggles.sound ? 'left-6' : 'left-1'}`}></div>
                     </button>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><Mic size={20} /></div>
                        <span className="font-bold text-slate-700">Speaking Exercises</span>
                     </div>
                     <button
                        onClick={() => toggle('speaking')}
                        className={`w-12 h-7 rounded-full transition-colors relative ${toggles.speaking ? 'bg-duo-green' : 'bg-slate-200'}`}
                     >
                        <div className={`w-5 h-5 bg-white rounded-full shadow-sm absolute top-1 transition-all ${toggles.speaking ? 'left-6' : 'left-1'}`}></div>
                     </button>
                  </div>
               </div>
            </motion.div>

            {/* Account Group */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.2 }}
               className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
            >
               <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Account
               </div>
               <div className="divide-y divide-slate-100">
                  <button className="w-full p-4 flex items-center justify-between hover:bg-slate-50">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-yellow-100 text-yellow-600 rounded-lg"><Lock size={20} /></div>
                        <span className="font-bold text-slate-700">Change PIN</span>
                     </div>
                     <ChevronRight size={20} className="text-slate-300" />
                  </button>
                  <button className="w-full p-4 flex items-center justify-between hover:bg-slate-50">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-pink-100 text-pink-600 rounded-lg"><Users size={20} /></div>
                        <span className="font-bold text-slate-700">Parent Dashboard</span>
                     </div>
                     <ChevronRight size={20} className="text-slate-300" />
                  </button>
               </div>
            </motion.div>

            {/* Notifications Group */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.3 }}
               className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
            >
               <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Notifications
               </div>
               <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     <div className="p-2 bg-orange-100 text-orange-600 rounded-lg"><Bell size={20} /></div>
                     <div>
                        <div className="font-bold text-slate-700">Daily Reminder</div>
                        <div className="text-xs text-slate-400">18:00 PM</div>
                     </div>
                  </div>
                  <button
                     onClick={() => toggle('notifications')}
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
               <LogOut size={20} /> Sign Out
            </motion.button>

            <div className="text-center text-xs text-slate-400 font-medium pb-8">
               Student App v1.2.0 (Build 402)
            </div>
         </div>
      </div>
   );
};

export default Settings;
