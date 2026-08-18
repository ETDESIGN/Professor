import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Check, ArrowRight, Trophy, Gem } from 'lucide-react';
import { motion } from 'framer-motion';
import { GEM_REWARDS } from '../../constants/gamification';

interface LessonCompleteProps {
  onContinue: () => void;
  stats?: {
    xp: number;
    accuracy: number;
    time: string;
    /** Stars earned this run (student-path nodes); defaults to 3 (legacy full lesson). */
    stars?: number;
  };
}

const LessonComplete: React.FC<LessonCompleteProps> = ({ onContinue, stats = { xp: 5, accuracy: 92, time: '2:15' } }) => {
  const [stars, setStars] = useState(0);
  const [xp, setXp] = useState(0);
  const { t } = useTranslation();
  const totalStars = Math.max(1, Math.min(3, stats.stars ?? 3));

  useEffect(() => {
    // Animate stars
    const t1 = setTimeout(() => setStars(prev => Math.min(1, totalStars)), 500);
    const t2 = setTimeout(() => setStars(prev => Math.min(2, totalStars)), 1000);
    const t3 = setTimeout(() => setStars(totalStars), 1500);

    // Animate XP
    const interval = setInterval(() => {
      setXp(prev => {
        if (prev >= stats.xp) {
          clearInterval(interval);
          return stats.xp;
        }
        return prev + 1;
      });
    }, 20);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearInterval(interval);
    };
  }, [stats.xp, totalStars]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center p-6 font-sans overflow-y-auto">
      {/* Background Burst */}
      <div className="absolute inset-0 z-0 opacity-20">
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[conic-gradient(var(--tw-gradient-stops))] from-yellow-500 via-transparent to-transparent animate-spin-slow rounded-full blur-3xl"></div>
      </div>

      {/* Confetti (Simulated with simple dots for now) */}
      {[...Array(20)].map((_, i) => (
         <div 
            key={i} 
            className="absolute w-2 h-2 rounded-full animate-bounce-subtle"
            style={{
               top: `${Math.random() * 100}%`,
               left: `${Math.random() * 100}%`,
               backgroundColor: ['#ef4444', '#3b82f6', '#eab308', '#22c55e'][Math.floor(Math.random() * 4)],
               animationDelay: `${Math.random() * 2}s`,
               opacity: 0.6
            }}
         ></div>
      ))}

      <div className="relative z-10 w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl animate-scale-in text-center">
         {/* Stars Header */}
         <div className="flex justify-center gap-4 mb-8 -mt-16">
            {[1, 2, 3].map((i) => (
               <div key={i} className={`transform transition-all duration-500 ${stars >= i ? 'scale-100 rotate-0' : i > totalStars ? 'scale-100' : 'scale-0 rotate-180'}`}>
                  <Star
                     size={64}
                     className={i <= totalStars ? 'text-yellow-400 fill-yellow-400 drop-shadow-lg' : 'text-slate-200 fill-slate-200'}
                     strokeWidth={3}
                     stroke={i <= totalStars ? '#b45309' : '#cbd5e1'}
                  />
               </div>
            ))}
         </div>

         <h1 className="text-3xl font-black text-slate-800 mb-2 uppercase tracking-wide">{t('student.lessonComplete', 'Lesson Complete!')}</h1>
         <p className="text-slate-500 font-bold mb-8">{t('student.amazingJob', 'You did an amazing job!')}</p>

         {/* Stats Grid */}
         <div className="grid grid-cols-2 gap-4 mb-8">
            <motion.div 
               initial={{ scale: 0.8, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               transition={{ delay: 0.5 }}
               className="bg-orange-50 p-4 rounded-2xl border-2 border-orange-100 flex flex-col items-center"
            >
               <div className="text-orange-500 font-bold text-xs uppercase mb-1">{t('student.totalXp', 'Total XP')}</div>
               <div className="text-3xl font-black text-orange-600 flex items-center gap-1">
                  <span className="text-2xl">⚡</span> {xp}
               </div>
            </motion.div>
            <motion.div 
               initial={{ scale: 0.8, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               transition={{ delay: 0.7 }}
               className="bg-blue-50 p-4 rounded-2xl border-2 border-blue-100 flex flex-col items-center"
            >
               <div className="text-blue-500 font-bold text-xs uppercase mb-1">{t('student.accuracy', 'Accuracy')}</div>
               <div className="text-3xl font-black text-blue-600">{stats.accuracy}%</div>
            </motion.div>
            <motion.div 
               initial={{ scale: 0.8, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               transition={{ delay: 0.9 }}
               className="col-span-2 bg-emerald-50 p-4 rounded-2xl border-2 border-emerald-100 flex items-center justify-between px-8"
            >
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-emerald-500">
                     <Gem size={20} />
                  </div>
                  <div className="text-left">
                     <div className="text-emerald-600 font-bold text-xs uppercase">{t('student.rewards', 'Rewards')}</div>
                     <div className="text-emerald-800 font-black">+{GEM_REWARDS.PERFECT_LESSON} Gems</div>
                  </div>
               </div>
               <div className="text-emerald-400"><Check size={24} /></div>
            </motion.div>
         </div>

         {/* Actions */}
         <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1 }}
            className="space-y-3"
         >
            <button
               onClick={onContinue}
               className="w-full bg-duo-green hover:bg-duo-green-dark text-white font-bold text-lg py-4 rounded-xl shadow-[0_4px_0_0_#46a302] active:translate-y-1 active:shadow-none transition-all uppercase tracking-wide flex items-center justify-center gap-2"
            >
               {t('student.continue', 'Continue')} <ArrowRight size={24} />
            </button>
         </motion.div>
      </div>

      <style>{`
         .animate-spin-slow { animation: spin 10s linear infinite; }
         @keyframes spin { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default LessonComplete;