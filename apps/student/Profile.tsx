
import React from 'react';
import { ChevronLeft, Settings, Camera, Flame, Zap, Trophy, Mic, Play, Share2, Unlock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSession } from '../../store/SessionContext';
import { useAppStore } from '../../store/useAppStore';

interface ProfileProps {
   onBack: () => void;
   onCustomize?: () => void;
   avatarConfig?: any;
   stats?: {
      streak: number;
      gems: number;
      xp: number;
      level: number;
   };
}

const Profile: React.FC<ProfileProps> = ({ onBack, onCustomize, avatarConfig, stats = { streak: 0, gems: 0, xp: 0, level: 1 } }) => {
   const { unlockNextLevel, state } = useSession();
   const { userProfile } = useAppStore();
   const displayName = userProfile?.full_name || userProfile?.email || 'Student';

   const handleDebugComplete = () => {
      // Unlock next level after current one
      const currentId = state.units.find(u => u.status === 'Active')?.id || 'u1';
      unlockNextLevel(currentId);
      alert("Debug: Next Level Unlocked!");
   };

   return (
      <div className="h-full bg-slate-50 flex flex-col font-sans">
         {/* Header */}
         <header className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-20 flex justify-between items-center">
            <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full">
               <ChevronLeft size={24} />
            </button>
            <span className="font-bold text-slate-800">My Profile</span>
            <button className="p-2 -mr-2 text-slate-400 hover:text-slate-600">
               <Settings size={24} />
            </button>
         </header>

         {/* Main Content */}
         <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">

            {/* Profile Info Section */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               className="flex flex-col items-center"
            >
               <div className="relative mb-4 group cursor-pointer" onClick={onCustomize}>
                  <div className="w-32 h-32 bg-white rounded-full border-4 border-white shadow-lg flex items-center justify-center text-7xl overflow-hidden hover:border-duo-green transition-colors">
                     {/* Render Avatar based on config if exists, else default */}
                     {avatarConfig ? (
                        <div style={{ backgroundColor: avatarConfig.skinColor }} className="w-full h-full flex items-center justify-center">
                           <span className="text-4xl">😎</span>
                        </div>
                     ) : (
                        '🦁'
                     )}
                  </div>
                  <button className="absolute bottom-0 right-0 w-10 h-10 bg-white rounded-full border border-slate-200 shadow-md flex items-center justify-center text-slate-600 group-hover:text-duo-green group-hover:scale-110 transition-all">
                     <Camera size={20} />
                  </button>
               </div>

               <h1 className="text-2xl font-bold text-slate-800 mb-1">{displayName}</h1>
               <div className="bg-duo-green/10 text-duo-green-dark px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide mb-6">
                  Level {stats.level}: Intermediate
               </div>

               {/* Stats Row */}
               <div className="grid grid-cols-3 gap-3 w-full">
                  <motion.div
                     initial={{ scale: 0.8, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     transition={{ delay: 0.1 }}
                     className="bg-white p-3 rounded-xl border border-slate-200 shadow-[0_4px_0_0_#e2e8f0] flex flex-col items-center gap-1"
                  >
                     <Flame className="text-orange-500 fill-orange-500" size={24} />
                     <span className="font-bold text-slate-800 text-lg">{stats.streak}</span>
                     <span className="text-[10px] font-bold text-slate-400 uppercase">Days</span>
                  </motion.div>
                  <motion.div
                     initial={{ scale: 0.8, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     transition={{ delay: 0.2 }}
                     className="bg-white p-3 rounded-xl border border-slate-200 shadow-[0_4px_0_0_#e2e8f0] flex flex-col items-center gap-1"
                  >
                     <Zap className="text-yellow-400 fill-yellow-400" size={24} />
                     <span className="font-bold text-slate-800 text-lg">{stats.xp}</span>
                     <span className="text-[10px] font-bold text-slate-400 uppercase">Total XP</span>
                  </motion.div>
                  <motion.div
                     initial={{ scale: 0.8, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     transition={{ delay: 0.3 }}
                     className="bg-white p-3 rounded-xl border border-slate-200 shadow-[0_4px_0_0_#e2e8f0] flex flex-col items-center gap-1"
                  >
                     <Trophy className="text-purple-500 fill-purple-500" size={24} />
                     <span className="font-bold text-slate-800 text-lg">#4</span>
                     <span className="text-[10px] font-bold text-slate-400 uppercase">League</span>
                  </motion.div>
               </div>
            </motion.div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-4">
               <button
                  onClick={onCustomize}
                  className="bg-duo-green hover:bg-duo-green-dark text-white font-bold py-3 px-4 rounded-xl shadow-[0_4px_0_0_#46a302] active:shadow-none active:translate-y-1 transition-all"
               >
                  Customize Avatar
               </button>
               <button className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-3 px-4 rounded-xl shadow-[0_4px_0_0_#e2e8f0] active:shadow-none active:translate-y-1 transition-all">
                  View Report
               </button>
            </div>

            <div className="h-px bg-slate-200 w-full my-4"></div>

            {/* Dubbing Studio Section */}
            <div>
               <div className="flex justify-between items-center mb-4">
                  <h2 className="font-bold text-slate-800 text-lg">My Studio</h2>
                  <button className="text-duo-blue font-bold text-sm">See all</button>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  {/* New Record Card */}
                  <button className="aspect-[4/5] rounded-xl border-2 border-dashed border-slate-300 hover:border-duo-green hover:bg-green-50 flex flex-col items-center justify-center gap-2 group transition-colors">
                     <div className="w-12 h-12 rounded-full bg-slate-100 group-hover:bg-duo-green text-slate-400 group-hover:text-white flex items-center justify-center transition-colors">
                        <Mic size={24} />
                     </div>
                     <span className="text-sm font-bold text-slate-500 group-hover:text-duo-green">Record New</span>
                  </button>

                  {/* Video Card */}
                  <div className="aspect-[4/5] bg-slate-800 rounded-xl overflow-hidden relative group">
                     <img src="https://source.unsplash.com/random/400x500?cartoon,kids&sig=99" className="w-full h-full object-cover opacity-80" alt="Video" />
                     <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-3">
                        <h3 className="text-white font-bold text-sm truncate">The Lost Hat</h3>
                        <div className="text-xs text-white/60 mb-2">Oct 24 • Level 1</div>
                        <div className="flex gap-2">
                           <button className="w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white hover:bg-white/40">
                              <Play size={14} fill="white" />
                           </button>
                           <button className="w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white hover:bg-white/40">
                              <Share2 size={14} />
                           </button>
                        </div>
                     </div>
                  </div>
               </div>
            </div>

            {/* Learning Path Promo */}
            <div className="bg-gradient-to-r from-cyan-400 to-blue-500 rounded-2xl p-5 text-white relative overflow-hidden shadow-lg">
               <div className="absolute right-0 top-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-10 -mt-10"></div>
               <div className="relative z-10">
                  <div className="text-xs font-bold uppercase opacity-80 mb-1">Up Next</div>
                  <h3 className="text-xl font-bold mb-1">Unit 4 Review</h3>
                  <p className="text-sm opacity-90 mb-4">Keep your streak alive!</p>
                  <button className="bg-white text-blue-600 font-bold px-6 py-2 rounded-lg shadow-sm active:scale-95 transition-transform">
                     Start Now
                  </button>
               </div>
            </div>

            {/* DEBUG: Unlocker */}
            <div className="mt-8 p-4 border-2 border-dashed border-red-200 rounded-xl bg-red-50 text-center">
               <p className="text-xs font-bold text-red-400 uppercase mb-2">Developer Tools</p>
               <button
                  onClick={handleDebugComplete}
                  className="bg-white border border-red-300 text-red-500 text-xs font-bold px-4 py-2 rounded-lg hover:bg-red-100 flex items-center justify-center gap-2 mx-auto"
               >
                  <Unlock size={14} /> Instant Complete Level
               </button>
            </div>

         </div>
      </div>
   );
};

export default Profile;
