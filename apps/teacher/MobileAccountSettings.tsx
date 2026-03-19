
import React from 'react';
import { ChevronLeft, Camera, Lock, User, Trash2, Check, CheckCircle2 } from 'lucide-react';

interface MobileAccountSettingsProps {
  onBack: () => void;
}

const MobileAccountSettings: React.FC<MobileAccountSettingsProps> = ({ onBack }) => {
  return (
    <div className="flex-1 flex flex-col bg-slate-50 font-sans h-full">
      {/* Top App Bar */}
      <header className="bg-white/80 backdrop-blur border-b border-slate-200 px-4 py-3 sticky top-0 z-20 flex justify-between items-center">
         <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full">
            <ChevronLeft size={24} />
         </button>
         <h1 className="font-bold text-lg text-slate-800">Account Settings</h1>
         <button className="text-blue-600 font-bold text-sm">Save</button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-8">
         {/* Profile Header */}
         <div className="flex flex-col items-center">
            <div className="relative mb-4 group cursor-pointer">
               <div className="w-28 h-28 rounded-full bg-slate-200 border-4 border-white shadow-lg overflow-hidden">
                  <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Teacher" alt="Profile" />
               </div>
               <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="text-white" size={24} />
               </div>
               <button className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full border-2 border-white shadow-sm">
                  <Camera size={16} />
               </button>
            </div>
            <button className="text-blue-600 text-sm font-bold">Edit Profile Photo</button>
         </div>

         {/* Inputs */}
         <div className="space-y-4">
            <div>
               <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Full Name</label>
               <div className="relative">
                  <input 
                     type="text" 
                     defaultValue="Mrs. Davis" 
                     className="w-full p-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-medium text-slate-800"
                  />
                  <User className="absolute right-4 top-1/2 -translate-x-1/2 text-slate-400" size={20} />
               </div>
            </div>
            <div>
               <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Email Address</label>
               <div className="relative">
                  <input 
                     type="email" 
                     defaultValue="s.davis@school.edu" 
                     className="w-full p-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-medium text-slate-800 pr-12"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500 bg-green-50 p-1 rounded-full">
                     <CheckCircle2 size={16} />
                  </div>
               </div>
            </div>
         </div>

         {/* Security */}
         <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 ml-1">Security & Privacy</h3>
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
               <button className="w-full p-4 flex items-center justify-between hover:bg-slate-50 border-b border-slate-50 text-left">
                  <div className="flex items-center gap-3">
                     <div className="p-2 bg-slate-100 text-slate-600 rounded-lg">
                        <Lock size={18} />
                     </div>
                     <span className="font-bold text-slate-700">Change Password</span>
                  </div>
                  <ChevronLeft size={20} className="text-slate-300 rotate-180" />
               </button>
               <button className="w-full p-4 flex items-center justify-between hover:bg-slate-50 text-left">
                  <div className="flex items-center gap-3">
                     <div className="p-2 bg-slate-100 text-slate-600 rounded-lg">
                        <User size={18} />
                     </div>
                     <span className="font-bold text-slate-700">Linked Accounts</span>
                  </div>
                  <ChevronLeft size={20} className="text-slate-300 rotate-180" />
               </button>
            </div>
         </div>

         {/* Danger Zone */}
         <div>
            <h3 className="text-xs font-bold text-red-400 uppercase mb-3 ml-1">Danger Zone</h3>
            <button className="w-full p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 font-bold hover:bg-red-100 transition-colors">
               <Trash2 size={20} />
               Delete Account
            </button>
            <p className="text-xs text-slate-400 mt-2 ml-1">This action cannot be undone. All data will be lost.</p>
         </div>
      </div>
    </div>
  );
};

export default MobileAccountSettings;
        