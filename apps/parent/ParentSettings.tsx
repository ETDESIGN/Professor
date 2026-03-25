
import React, { useState } from 'react';
import { ChevronLeft, User, Bell, Mail, CreditCard, HelpCircle, LogOut, ChevronRight, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import ParentConnect from './ParentConnect';
import { useAppStore } from '../../store/useAppStore';

interface ParentSettingsProps {
   onBack: () => void;
   onSignOut?: () => void;
}

const ParentSettings: React.FC<ParentSettingsProps> = ({ onBack, onSignOut }) => {
   const [notifications, setNotifications] = useState(true);
   const [emailDigest, setEmailDigest] = useState(true);
   const [showConnect, setShowConnect] = useState(false);
   const { userProfile } = useAppStore();
   const displayName = userProfile?.full_name || userProfile?.email || 'Parent';

   if (showConnect) {
      return <ParentConnect onBack={() => setShowConnect(false)} />;
   }

   return (
      <div className="h-full bg-slate-50 flex flex-col font-sans">
         {/* Header */}
         <header className="px-4 py-3 bg-white border-b border-slate-100 sticky top-0 z-20 flex items-center justify-between">
            <div className="flex items-center gap-2">
               <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full -ml-2">
                  <ChevronLeft size={24} className="text-slate-600" />
               </button>
               <h1 className="font-bold text-lg text-slate-800">Settings</h1>
            </div>
         </header>

         {/* Content */}
         <div className="flex-1 overflow-y-auto p-4 space-y-6">

            {/* Profile */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.1 }}
               className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm"
            >
               <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-slate-200 overflow-hidden border-2 border-white shadow-sm">
                     <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Parent" alt="Parent" />
                  </div>
                  <button className="absolute bottom-0 right-0 bg-cyan-500 text-white p-1 rounded-full border-2 border-white shadow-sm">
                     <User size={12} />
                  </button>
               </div>
               <div className="flex-1">
                  <h2 className="font-bold text-slate-800 text-lg">{displayName}</h2>
                  <p className="text-slate-500 text-xs">{userProfile?.email || ''}</p>
               </div>
               <button className="text-cyan-600 text-sm font-bold">Edit</button>
            </motion.div>

            {/* Children */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.2 }}
            >
               <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-2">Children</h3>
               <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                  <div className="p-4 flex items-center justify-between border-b border-slate-50">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                           <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Leo" alt="Leo" />
                        </div>
                        <div>
                           <div className="font-bold text-slate-700">Leo</div>
                           <div className="text-xs text-slate-400">Class 3B • Level 5</div>
                        </div>
                     </div>
                     <ChevronRight size={20} className="text-slate-300" />
                  </div>
                  <button
                     onClick={() => setShowConnect(true)}
                     className="w-full p-4 flex items-center gap-3 text-cyan-600 font-bold hover:bg-slate-50 transition-colors"
                  >
                     <div className="w-10 h-10 rounded-full border-2 border-dashed border-cyan-300 flex items-center justify-center">
                        <Plus size={20} />
                     </div>
                     Add Child
                  </button>
               </div>
            </motion.div>

            {/* Preferences */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.3 }}
            >
               <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-2">Preferences</h3>
               <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                  <div className="p-4 flex items-center justify-between border-b border-slate-50">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-100 text-orange-600 rounded-lg"><Bell size={18} /></div>
                        <span className="font-bold text-slate-700">Push Notifications</span>
                     </div>
                     <button
                        onClick={() => setNotifications(!notifications)}
                        className={`w-12 h-7 rounded-full transition-colors relative ${notifications ? 'bg-cyan-500' : 'bg-slate-200'}`}
                     >
                        <div className={`w-5 h-5 bg-white rounded-full shadow-sm absolute top-1 transition-all ${notifications ? 'left-6' : 'left-1'}`}></div>
                     </button>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><Mail size={18} /></div>
                        <span className="font-bold text-slate-700">Weekly Email Digest</span>
                     </div>
                     <button
                        onClick={() => setEmailDigest(!emailDigest)}
                        className={`w-12 h-7 rounded-full transition-colors relative ${emailDigest ? 'bg-cyan-500' : 'bg-slate-200'}`}
                     >
                        <div className={`w-5 h-5 bg-white rounded-full shadow-sm absolute top-1 transition-all ${emailDigest ? 'left-6' : 'left-1'}`}></div>
                     </button>
                  </div>
               </div>
            </motion.div>

            {/* Subscription */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.4 }}
            >
               <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-2">Subscription</h3>
               <div className="bg-gradient-to-r from-cyan-500 to-blue-500 rounded-2xl p-4 text-white shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-white opacity-10 rounded-full -mr-8 -mt-8"></div>
                  <div className="flex items-center gap-3 mb-4 relative z-10">
                     <div className="p-2 bg-white/20 rounded-lg"><CreditCard size={20} /></div>
                     <div>
                        <div className="font-bold">Premium Family</div>
                        <div className="text-xs text-cyan-100">Next billing: Nov 24, 2023</div>
                     </div>
                  </div>
                  <button className="w-full py-2 bg-white/20 rounded-lg font-bold text-sm hover:bg-white/30 transition-colors">
                     Manage Subscription
                  </button>
               </div>
            </motion.div>

            {/* Support */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.5 }}
               className="bg-white rounded-2xl border border-slate-100 overflow-hidden"
            >
               <button className="w-full p-4 flex items-center justify-between hover:bg-slate-50 border-b border-slate-50">
                  <div className="flex items-center gap-3">
                     <div className="p-2 bg-slate-100 text-slate-600 rounded-lg"><HelpCircle size={18} /></div>
                     <span className="font-bold text-slate-700">Help Center</span>
                  </div>
                  <ChevronRight size={20} className="text-slate-300" />
               </button>
               <button
                  onClick={onSignOut}
                  className="w-full p-4 flex items-center justify-between hover:bg-slate-50 text-red-500"
               >
                  <div className="flex items-center gap-3">
                     <div className="p-2 bg-red-50 text-red-500 rounded-lg"><LogOut size={18} /></div>
                     <span className="font-bold">Sign Out</span>
                  </div>
               </button>
            </motion.div>

            <div className="text-center text-xs text-slate-400 font-medium pb-8">
               Parent App v1.0.4
            </div>
         </div>
      </div>
   );
};

export default ParentSettings;
