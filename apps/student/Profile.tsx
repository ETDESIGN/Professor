
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Settings, Camera, Flame, Zap, Gem } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';
import { XP_LEVELS } from '../../constants/gamification';
import { useMyAvatar } from '../../hooks/useQueries';
import Avatar from '../../components/shared/Avatar';

interface ProfileProps {
   onBack: () => void;
   onCustomize?: () => void;
   onSettings?: () => void;
   stats?: {
      streak: number;
      gems: number;
      xp: number;
      level: number;
   };
}

const Profile: React.FC<ProfileProps> = ({ onBack, onCustomize, onSettings, stats = { streak: 0, gems: 0, xp: 0, level: 1 } }) => {
   const { userProfile } = useAppStore();
  const { t } = useTranslation();
  const { data: myAvatar } = useMyAvatar();
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
            <button onClick={onSettings} className="p-2 -mr-2 text-slate-400 hover:text-slate-600">
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
                  <div className="rounded-full border-4 border-white shadow-lg overflow-hidden hover:border-duo-pink transition-colors">
                     {/* Rendered composite (config is the source of truth on the server) */}
                     <Avatar src={myAvatar?.url || null} name={displayName} size={128} idle />
                  </div>
                  <button className="absolute bottom-0 right-0 w-10 h-10 bg-white rounded-full border border-slate-200 shadow-md flex items-center justify-center text-slate-600 group-hover:text-duo-pink group-hover:scale-110 transition-all">
                     <Camera size={20} />
                  </button>
               </div>

               <h1 className="text-2xl font-bold text-slate-800 mb-1">{displayName}</h1>
               <div className="bg-duo-pink/10 text-duo-pink-dark px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide mb-6">
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
               className="w-full bg-duo-pink hover:bg-duo-pink-dark text-white font-bold py-3 px-4 rounded-xl shadow-[0_4px_0_0_#be185d] active:shadow-none active:translate-y-1 transition-all"
            >
               {t('student.customizeAvatar', 'Customize Avatar')}
            </button>

            {/* Learning Badges Showcase (Recent Achievements from Stitch 3) */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.2 }}
               className="bg-white rounded-2xl border border-slate-200 p-4 shadow-[0_4px_0_0_#e2e8f0] space-y-3"
            >
               <div className="flex items-center justify-between pb-1">
                  <div className="flex items-center gap-2">
                     <span className="text-base">🏆</span>
                     <h3 className="font-wa-display font-bold text-base text-slate-800">{t('student.recentBadges', 'Recent Badges')}</h3>
                  </div>
                  <span className="text-[11px] font-bold text-wa-muted bg-wa-mist px-2.5 py-0.5 rounded-full border border-wa-border">
                     {t('student.unlockedCount', '3 Unlocked')}
                  </span>
               </div>

               <div className="space-y-2.5">
                  <div className="flex items-center p-2.5 rounded-xl bg-wa-mist border border-wa-border gap-3">
                     <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-400 to-amber-200 border border-white shadow-sm flex items-center justify-center text-xl shrink-0">
                        🏅
                     </div>
                     <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                           <h4 className="font-wa-display font-bold text-sm text-wa-ink truncate">{t('student.badge7Day', '7-Day Streak')}</h4>
                           <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Unlocked</span>
                        </div>
                        <p className="text-[11px] font-semibold text-wa-muted mt-0.5">{t('student.badge7DayDesc', 'Completed lessons 7 days in a row')}</p>
                     </div>
                  </div>

                  <div className="flex items-center p-2.5 rounded-xl bg-wa-mist border border-wa-border gap-3">
                     <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-400 to-sky-200 border border-white shadow-sm flex items-center justify-center text-xl shrink-0">
                        📖
                     </div>
                     <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                           <h4 className="font-wa-display font-bold text-sm text-wa-ink truncate">{t('student.badgeVocab', 'Vocab Master')}</h4>
                           <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">Level 3</span>
                        </div>
                        <p className="text-[11px] font-semibold text-wa-muted mt-0.5">{t('student.badgeVocabDesc', 'Mastered 100+ English vocabulary words')}</p>
                     </div>
                  </div>

                  <div className="flex items-center p-2.5 rounded-xl bg-wa-mist border border-wa-border gap-3">
                     <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-400 to-emerald-200 border border-white shadow-sm flex items-center justify-center text-xl shrink-0">
                        🎙️
                     </div>
                     <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                           <h4 className="font-wa-display font-bold text-sm text-wa-ink truncate">{t('student.badgeTalker', 'Fast Talker')}</h4>
                           <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Unlocked</span>
                        </div>
                        <p className="text-[11px] font-semibold text-wa-muted mt-0.5">{t('student.badgeTalkerDesc', 'High accuracy in speaking practice mode')}</p>
                     </div>
                  </div>
               </div>
            </motion.div>

            {/* Current Unit Progress Card (Stitch 3) */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.3 }}
               className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-[0_4px_0_0_#e2e8f0] flex items-center justify-between"
            >
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-wa-teal/10 border border-wa-teal/20 flex items-center justify-center text-xl">
                     🎒
                  </div>
                  <div>
                     <span className="text-[10px] font-extrabold text-wa-muted uppercase tracking-wider">{t('student.currentUnit', 'CURRENT UNIT')}</span>
                     <h4 className="font-wa-display font-bold text-sm text-wa-ink">Unit 3: City Adventures</h4>
                  </div>
               </div>
               <div className="text-right">
                  <span className="font-wa-display font-bold text-sm text-wa-teal">85% Done</span>
                  <div className="w-16 h-2 bg-slate-100 rounded-full mt-1 overflow-hidden">
                     <div className="bg-wa-teal h-full rounded-full" style={{ width: '85%' }} />
                  </div>
               </div>
            </motion.div>

            {/* Student Passport Card (Stitch 3) */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.4 }}
               className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-[0_4px_0_0_#e2e8f0] flex items-center justify-between"
            >
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-xl">
                     🏫
                  </div>
                  <div>
                     <h4 className="font-wa-display font-bold text-sm text-wa-ink">Student Passport • Grade 5</h4>
                     <p className="text-[11px] font-semibold text-wa-muted mt-0.5">Connected to Class • Solo Practice Active</p>
                  </div>
               </div>
               <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                  Active ✓
               </span>
            </motion.div>

         </div>
      </div>
   );
};

export default Profile;
