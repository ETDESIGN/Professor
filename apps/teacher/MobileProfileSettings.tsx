
import React, { useState } from 'react';
import { ChevronRight, User, Lock, Bell, Moon, HelpCircle, Bug, LogOut, X } from 'lucide-react';
import MobileAccountSettings from './MobileAccountSettings';
import { useAppStore } from '../../store/useAppStore';

interface MobileProfileSettingsProps {
   onBack: () => void;
}

const MobileProfileSettings: React.FC<MobileProfileSettingsProps> = ({ onBack }) => {
   const [showAccount, setShowAccount] = useState(false);
   const { userProfile } = useAppStore();
   const displayName = userProfile?.full_name || userProfile?.email || 'Teacher';

   if (showAccount) {
      return <MobileAccountSettings onBack={() => setShowAccount(false)} />;
   }

   return (
      <div className="flex-1 flex flex-col bg-slate-50 font-sans h-full">
         {/* Top App Bar */}
         <header className="bg-white/80 backdrop-blur border-b border-slate-200 px-4 py-3 sticky top-0 z-20 flex justify-between items-center">
            <h1 className="font-bold text-lg text-slate-800">Profile</h1>
            <button onClick={onBack} className="p-2 -mr-2 text-slate-400 hover:text-slate-600">
               <X size={24} />
            </button>
         </header>

         <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Profile Header */}
            <div className="flex flex-col items-center pt-4">
               <div className="relative mb-4">
                  <div className="w-24 h-24 rounded-full bg-slate-200 border-4 border-white shadow-lg overflow-hidden">
                     <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Teacher" alt="Profile" />
                  </div>
                  <button className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full border-2 border-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all">
                     <User size={14} />
                  </button>
               </div>
               <h2 className="text-xl font-bold text-slate-800">{displayName}</h2>
               <div className="flex items-center gap-2 mt-1">
                  <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Teacher</span>
                  <span className="text-slate-500 text-sm">{userProfile?.email || ''}</span>
               </div>
            </div>

            {/* Account Settings */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
               <button
                  onClick={() => setShowAccount(true)}
                  className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors border-b border-slate-50"
               >
                  <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <User size={18} />
                     </div>
                     <div className="text-left">
                        <div className="text-sm font-bold text-slate-700">Edit Profile</div>
                        <div className="text-xs text-slate-400">Name, photo, contact</div>
                     </div>
                  </div>
                  <ChevronRight size={18} className="text-slate-300" />
               </button>
               <button className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                        <Lock size={18} />
                     </div>
                     <div className="text-left">
                        <div className="text-sm font-bold text-slate-700">Change Password</div>
                     </div>
                  </div>
                  <ChevronRight size={18} className="text-slate-300" />
               </button>
            </div>

            {/* Preferences */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
               <button className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors border-b border-slate-50">
                  <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                        <Bell size={18} />
                     </div>
                     <div className="text-left">
                        <div className="text-sm font-bold text-slate-700">Notifications</div>
                     </div>
                  </div>
                  <ChevronRight size={18} className="text-slate-300" />
               </button>
               <div className="w-full p-4 flex items-center justify-between border-b border-slate-50">
                  <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                        <Moon size={18} />
                     </div>
                     <div className="text-left">
                        <div className="text-sm font-bold text-slate-700">Dark Mode</div>
                     </div>
                  </div>
                  <div className="w-12 h-6 bg-slate-200 rounded-full relative cursor-pointer">
                     <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all"></div>
                  </div>
               </div>
            </div>

            {/* Support */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
               <button className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors border-b border-slate-50">
                  <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                        <HelpCircle size={18} />
                     </div>
                     <div className="text-left">
                        <div className="text-sm font-bold text-slate-700">Help Center</div>
                     </div>
                  </div>
                  <ChevronRight size={18} className="text-slate-300" />
               </button>
               <button className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                        <Bug size={18} />
                     </div>
                     <div className="text-left">
                        <div className="text-sm font-bold text-slate-700">Report Issue</div>
                     </div>
                  </div>
                  <ChevronRight size={18} className="text-slate-300" />
               </button>
            </div>

            <button className="w-full bg-red-50 text-red-600 font-bold py-4 rounded-2xl border border-red-100 flex items-center justify-center gap-2 hover:bg-red-100 transition-colors">
               <LogOut size={18} /> Sign Out
            </button>

            <div className="text-center text-xs text-slate-400 font-medium pb-8">
               Teacher App v2.4.0 (Build 512)
            </div>
         </div>
      </div>
   );
};

export default MobileProfileSettings;
