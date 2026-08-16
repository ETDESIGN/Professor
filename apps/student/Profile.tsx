
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Settings, Camera, Flame, Zap, Gem } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';
import { XP_LEVELS } from '../../constants/gamification';

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
   const { userProfile } = useAppStore();
  const { t } = useTranslation();
   const displayName = userProfile?.full_name || userProfile?.email || 'Student';

   const levelLabel = XP_LEVELS.getTitleForLevel(stats.level);

   return (
      <div className="h-full bg-slate-50 flex flex-col font-sans">
         {/* Header */}
         <header className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-20 flex justify-between items-center">
            <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full">
               <ChevronLeft size={24} />
            </button>
            <span className="font-bold text-slate-800">{t('student.myProfile', 'My Profile')}</span>
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
                  Level {stats.level}: {levelLabel}
               </div>

               {/* Stats Row — real data only (fake "#4 League" card removed
                   along with the mock "My Studio" and "Unit 4 Review" promo,
                   audit 2026-08-17). */}
               <div className="grid grid-cols-3 gap-3 w-full">
                  <motion.div
                     initial={{ scale: 0.8, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     transition={{ delay: 0.1 }}
                     className="bg-white p-3 rounded-xl border border-slate-200 shadow-[0_4px_0_0_#e2e8f0] flex flex-col items-center gap-1"
                  >
                     <Flame className="text-orange-500 fill-orange-500" size={24} />
                     <span className="font-bold text-slate-800 text-lg">{stats.streak}</span>
                     <span className="text-[10px] font-bold text-slate-400 uppercase">{t('student.days', 'Days')}</span>
                  </motion.div>
                  <motion.div
                     initial={{ scale: 0.8, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     transition={{ delay: 0.2 }}
                     className="bg-white p-3 rounded-xl border border-slate-200 shadow-[0_4px_0_0_#e2e8f0] flex flex-col items-center gap-1"
                  >
                     <Zap className="text-yellow-400 fill-yellow-400" size={24} />
                     <span className="font-bold text-slate-800 text-lg">{stats.xp}</span>
                     <span className="text-[10px] font-bold text-slate-400 uppercase">{t('student.totalXp', 'Total XP')}</span>
                  </motion.div>
                  <motion.div
                     initial={{ scale: 0.8, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     transition={{ delay: 0.3 }}
                     className="bg-white p-3 rounded-xl border border-slate-200 shadow-[0_4px_0_0_#e2e8f0] flex flex-col items-center gap-1"
                  >
                     <Gem className="text-blue-500 fill-blue-500" size={24} />
                     <span className="font-bold text-slate-800 text-lg">{stats.gems}</span>
                     <span className="text-[10px] font-bold text-slate-400 uppercase">{t('student.gems', 'Gems')}</span>
                  </motion.div>
               </div>
            </motion.div>

            {/* Action Buttons */}
            <button
               onClick={onCustomize}
               className="w-full bg-duo-green hover:bg-duo-green-dark text-white font-bold py-3 px-4 rounded-xl shadow-[0_4px_0_0_#46a302] active:shadow-none active:translate-y-1 transition-all"
            >
               {t('student.customizeAvatar', 'Customize Avatar')}
            </button>

         </div>
      </div>
   );
};

export default Profile;
