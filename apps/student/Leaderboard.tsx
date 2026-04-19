import React, { useState, useEffect } from 'react';
import { ChevronLeft, Shield, ArrowUp, ArrowDown, Minus, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { GamificationService } from '../../services/GamificationService';
import { supabase } from '../../services/supabaseClient';

interface LeaderboardProps {
   onBack: () => void;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ onBack }) => {
   const [students, setStudents] = useState<any[]>([]);
   const [isLoading, setIsLoading] = useState(true);
   const [myId, setMyId] = useState<string>('');

   useEffect(() => {
      const load = async () => {
         setIsLoading(true);
         const { data: { user } } = await supabase.auth.getUser();
         if (user) setMyId(user.id);
         const data = await GamificationService.getLeaderboard();
         setStudents(data);
         setIsLoading(false);
      };
      load();
   }, []);

   if (isLoading) {
      return (
         <div className="h-full bg-slate-50 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
         </div>
      );
   }

   const topThree = students.slice(0, 3);
   const rest = students.slice(3);

   const timeLeft = () => {
      const now = new Date();
      const endOfWeek = new Date(now);
      endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
      endOfWeek.setHours(23, 59, 59, 999);
      const diff = endOfWeek.getTime() - now.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      return `${days}d ${hours}h`;
   };

   return (
      <div className="h-full bg-slate-50 flex flex-col font-sans">
         <header className="bg-purple-600 text-white p-6 pb-12 rounded-b-[3rem] shadow-lg z-10 relative">
            <div className="flex items-center justify-between mb-6">
               <button onClick={onBack} className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors">
                  <ChevronLeft size={24} />
               </button>
               <h1 className="font-bold text-lg uppercase tracking-widest">Diamond League</h1>
               <button className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors">
                  <Shield size={24} />
               </button>
            </div>
            <div className="text-center">
               <div className="text-purple-200 text-xs font-bold uppercase mb-1">Time Left</div>
               <div className="text-2xl font-black font-mono">{timeLeft()}</div>
            </div>
         </header>

         <div className="-mt-10 px-6 mb-4 relative z-20 flex justify-center items-end gap-4">
            {topThree[1] && (
               <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-slate-200 border-4 border-white shadow-md flex items-center justify-center text-3xl relative mb-2">
                     {topThree[1].avatar ? <img src={topThree[1].avatar} className="w-full h-full rounded-full object-cover" /> : <span>🥈</span>}
                     <div className="absolute -bottom-2 bg-slate-500 text-white text-[10px] font-bold px-2 rounded-full border border-white">2</div>
                  </div>
                  <div className="bg-white/80 backdrop-blur rounded-t-xl w-20 h-24 flex flex-col items-center justify-center shadow-sm">
                     <span className="font-bold text-slate-700 text-sm truncate w-full text-center px-1">{topThree[1].name}</span>
                     <span className="text-purple-600 font-bold text-xs">{topThree[1].xp} XP</span>
                  </div>
               </motion.div>
            )}

            {topThree[0] && (
               <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="flex flex-col items-center relative z-10 -mb-2">
                  <div className="absolute -top-8 text-yellow-400 animate-bounce"><div className="w-8 h-8">👑</div></div>
                  <div className="w-20 h-20 rounded-full bg-yellow-100 border-4 border-yellow-400 shadow-xl flex items-center justify-center text-4xl relative mb-2">
                     {topThree[0].avatar ? <img src={topThree[0].avatar} className="w-full h-full rounded-full object-cover" /> : <span>🥇</span>}
                     <div className="absolute -bottom-2 bg-yellow-500 text-white text-xs font-bold px-2 py-0.5 rounded-full border-2 border-white">1</div>
                  </div>
                  <div className="bg-gradient-to-b from-yellow-50 to-white rounded-t-2xl w-24 h-32 flex flex-col items-center justify-center shadow-md border-t border-yellow-200">
                     <span className="font-bold text-slate-800 truncate w-full text-center px-1">{topThree[0].name}</span>
                     <span className="text-yellow-600 font-black text-lg">{topThree[0].xp} XP</span>
                  </div>
               </motion.div>
            )}

            {topThree[2] && (
               <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-orange-100 border-4 border-white shadow-md flex items-center justify-center text-3xl relative mb-2">
                     {topThree[2].avatar ? <img src={topThree[2].avatar} className="w-full h-full rounded-full object-cover" /> : <span>🥉</span>}
                     <div className="absolute -bottom-2 bg-orange-500 text-white text-[10px] font-bold px-2 rounded-full border border-white">3</div>
                  </div>
                  <div className="bg-white/80 backdrop-blur rounded-t-xl w-20 h-20 flex flex-col items-center justify-center shadow-sm">
                     <span className="font-bold text-slate-700 text-sm truncate w-full text-center px-1">{topThree[2].name}</span>
                     <span className="text-orange-600 font-bold text-xs">{topThree[2].xp} XP</span>
                  </div>
               </motion.div>
            )}
         </div>

         <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pl-2">Rankings</div>
            {rest.map((student, index) => {
               const isMe = student.id === myId;
               return (
                  <motion.div key={student.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + index * 0.05 }}
                     className={`flex items-center gap-4 p-3 rounded-xl border-2 transition-all ${isMe ? 'bg-purple-50 border-purple-200' : 'bg-white border-slate-100'}`}>
                     <div className="w-6 text-center font-bold text-slate-400 text-sm">{index + 4}</div>
                     <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xl overflow-hidden">
                        {student.avatar ? <img src={student.avatar} className="w-full h-full object-cover" /> : '👤'}
                     </div>
                     <div className="flex-1"><div className={`font-bold text-sm ${isMe ? 'text-purple-700' : 'text-slate-700'}`}>{student.name} {isMe && '(You)'}</div></div>
                     <div className="font-mono font-bold text-slate-600">{student.xp} XP</div>
                     <div className="text-xs">{index === 0 ? <ArrowUp size={16} className="text-green-500" /> : index > 3 ? <ArrowDown size={16} className="text-red-400" /> : <Minus size={16} className="text-slate-300" />}</div>
                  </motion.div>
               );
            })}
         </div>
      </div>
   );
};

export default Leaderboard;
