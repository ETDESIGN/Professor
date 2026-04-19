import React, { useState, useEffect } from 'react';
import { ChevronLeft, Gift, Lock, Zap, Check, BookOpen, Mic, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { GamificationService } from '../../services/GamificationService';

interface QuestsProps {
  onBack: () => void;
}

const QUEST_ICONS: Record<string, React.FC<any>> = {
  earn_xp: Zap,
  complete_lessons: BookOpen,
  perfect_speaking: Mic,
  review_words: BookOpen,
  dubbing_take: Mic,
};

const QUEST_COLORS: Record<string, { color: string; bg: string }> = {
  earn_xp: { color: 'text-yellow-500', bg: 'bg-yellow-100' },
  complete_lessons: { color: 'text-blue-500', bg: 'bg-blue-100' },
  perfect_speaking: { color: 'text-purple-500', bg: 'bg-purple-100' },
  review_words: { color: 'text-green-500', bg: 'bg-green-100' },
  dubbing_take: { color: 'text-pink-500', bg: 'bg-pink-100' },
};

const Quests: React.FC<QuestsProps> = ({ onBack }) => {
  const [quests, setQuests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadQuests();
  }, []);

  const loadQuests = async () => {
    setIsLoading(true);
    const data = await GamificationService.getDailyQuests();
    setQuests(data.length > 0 ? data : [
      { id: '1', title: 'Earn 50 XP', current: 35, target: 50, reward_gems: 10, quest_type: 'earn_xp', claimed: false },
      { id: '2', title: 'Complete 2 Lessons', current: 1, target: 2, reward_gems: 10, quest_type: 'complete_lessons', claimed: false },
      { id: '3', title: 'Score Perfect in Speaking', current: 0, target: 1, reward_gems: 10, quest_type: 'perfect_speaking', claimed: false },
    ]);
    setIsLoading(false);
  };

  const handleClaim = async (questId: string) => {
    const result = await GamificationService.claimQuestReward(questId);
    if (result) {
      toast.success(`+${result.xp} XP, +${result.gems} Gems!`);
      loadQuests();
    }
  };

  if (isLoading) {
    return (
      <div className="h-full bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const completedCount = quests.filter(q => q.current >= q.target).length;
  const claimedCount = quests.filter(q => q.claimed).length;
  const progressPercent = (claimedCount / quests.length) * 100;

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans">
      <header className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-20 flex items-center justify-between">
        <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full">
           <ChevronLeft size={24} />
        </button>
        <span className="font-bold text-slate-800">Daily Quests</span>
        <div className="w-10"></div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 pb-24">
         <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="mb-8 relative overflow-hidden bg-gradient-to-b from-blue-500 to-blue-600 rounded-3xl p-6 text-white shadow-lg"
         >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-10 -mt-10"></div>
            <div className="flex justify-between items-start mb-4 relative z-10">
               <div>
                  <h2 className="text-xl font-black italic uppercase tracking-wide">Daily Goal</h2>
                  <p className="text-blue-100 text-sm font-medium">Complete quests to open the chest!</p>
               </div>
               <div className="bg-white/20 backdrop-blur rounded-lg px-3 py-1 font-bold text-sm border border-white/20">
                  {claimedCount} / {quests.length}
               </div>
            </div>

            <div className="flex items-end justify-center h-32 mb-2 relative z-10">
               {progressPercent === 100 ? (
                  <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}>
                     <Gift size={80} className="text-yellow-300 drop-shadow-lg" strokeWidth={1.5} />
                  </motion.div>
               ) : (
                  <div className="relative">
                     <Gift size={80} className="text-blue-300 opacity-50" strokeWidth={1.5} />
                     <div className="absolute inset-0 flex items-center justify-center"><Lock size={32} className="text-blue-200" /></div>
                  </div>
               )}
            </div>

            <div className="h-4 bg-black/20 rounded-full overflow-hidden border border-white/10 relative z-10">
               <div className="h-full bg-yellow-400 shadow-[0_2px_0_rgba(0,0,0,0.1)_inset] transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%` }}>
                  <div className="w-full h-1/2 bg-white/30"></div>
               </div>
            </div>
         </motion.div>

         <div className="space-y-4">
            {quests.map((quest, index) => {
               const isComplete = quest.current >= quest.target;
               const progress = Math.min((quest.current / quest.target) * 100, 100);
               const colors = QUEST_COLORS[quest.quest_type] || { color: 'text-blue-500', bg: 'bg-blue-100' };
               const Icon = QUEST_ICONS[quest.quest_type] || Zap;

               return (
                  <motion.div key={quest.id || index} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + index * 0.1 }}
                     className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm flex items-center gap-4">
                     <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${colors.bg} ${colors.color}`}>
                        <Icon size={28} />
                     </div>
                     <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                           <h3 className="font-bold text-slate-800 text-sm truncate">{quest.title}</h3>
                           <div className="text-xs font-bold text-slate-400">{quest.current}/{quest.target}</div>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                           <div className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-green-500' : 'bg-duo-blue'}`} style={{ width: `${progress}%` }}></div>
                        </div>
                     </div>
                     <div className="shrink-0">
                        {quest.claimed ? (
                           <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white shadow-md">
                              <Check size={20} strokeWidth={4} />
                           </div>
                        ) : isComplete ? (
                           <button onClick={() => handleClaim(quest.id)} className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center text-white shadow-md hover:bg-yellow-300 transition-colors">
                              <Gift size={18} />
                           </button>
                        ) : (
                           <div className="flex flex-col items-center justify-center w-10">
                              <div className="text-amber-500 font-black text-sm">+{quest.reward_gems}</div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase">Gems</div>
                           </div>
                        )}
                     </div>
                  </motion.div>
               );
            })}
         </div>

         <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 0.8, y: 0 }} transition={{ delay: 0.5 }}
            className="mt-8 bg-purple-50 border-2 border-dashed border-purple-200 rounded-2xl p-6 text-center grayscale">
            <h3 className="font-bold text-purple-800 uppercase tracking-widest text-sm mb-2">Weekly Challenge</h3>
            <p className="text-purple-600 text-xs mb-4">Unlocks in 2 days</p>
            <div className="flex justify-center gap-2">
               {[1,2,3].map(i => (
                  <div key={i} className="w-10 h-10 bg-white rounded-lg border-2 border-purple-100 flex items-center justify-center">
                     <Lock size={16} className="text-purple-200" />
                  </div>
               ))}
            </div>
         </motion.div>
      </div>
    </div>
  );
};

export default Quests;
