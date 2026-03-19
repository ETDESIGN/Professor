
import React, { useState, useEffect } from 'react';
import { ChevronLeft, Shield, ArrowUp, ArrowDown, Minus, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Engine } from '../../services/SupabaseService';

interface LeaderboardProps {
   onBack: () => void;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ onBack }) => {
   const [students, setStudents] = useState<any[]>([]);
   const [isLoading, setIsLoading] = useState(true);

   useEffect(() => {
      const loadStudents = async () => {
         setIsLoading(true);
         const data = await Engine.fetchStudents();
         // Sort students by points descending
         const sorted = [...data].sort((a, b) => b.points - a.points);
         setStudents(sorted);
         setIsLoading(false);
      };
      loadStudents();
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

   return (
      <div className="h-full bg-slate-50 flex flex-col font-sans">
         {/* Header */}
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
               <div className="text-2xl font-black font-mono">2d 14h 30m</div>
            </div>
         </header>

         {/* Podium */}
         <div className="-mt-10 px-6 mb-4 relative z-20 flex justify-center items-end gap-4">
            {/* 2nd Place */}
            {topThree[1] && (
               <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="flex flex-col items-center"
               >
                  <div className="w-16 h-16 rounded-full bg-slate-200 border-4 border-white shadow-md flex items-center justify-center text-3xl relative mb-2">
                     {topThree[1].avatar}
                     <div className="absolute -bottom-2 bg-slate-500 text-white text-[10px] font-bold px-2 rounded-full border border-white">2</div>
                  </div>
                  <div className="bg-white/80 backdrop-blur rounded-t-xl w-20 h-24 flex flex-col items-center justify-center shadow-sm">
                     <span className="font-bold text-slate-700 text-sm truncate w-full text-center px-1">{topThree[1].name}</span>
                     <span className="text-purple-600 font-bold text-xs">{topThree[1].points} XP</span>
                  </div>
               </motion.div>
            )}

            {/* 1st Place */}
            {topThree[0] && (
               <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="flex flex-col items-center relative z-10 -mb-2"
               >
                  <div className="absolute -top-8 text-yellow-400 animate-bounce">
                     <div className="w-8 h-8">👑</div>
                  </div>
                  <div className="w-20 h-20 rounded-full bg-yellow-100 border-4 border-yellow-400 shadow-xl flex items-center justify-center text-4xl relative mb-2">
                     {topThree[0].avatar}
                     <div className="absolute -bottom-2 bg-yellow-500 text-white text-xs font-bold px-2 py-0.5 rounded-full border-2 border-white">1</div>
                  </div>
                  <div className="bg-gradient-to-b from-yellow-50 to-white rounded-t-2xl w-24 h-32 flex flex-col items-center justify-center shadow-md border-t border-yellow-200">
                     <span className="font-bold text-slate-800 truncate w-full text-center px-1">{topThree[0].name}</span>
                     <span className="text-yellow-600 font-black text-lg">{topThree[0].points} XP</span>
                  </div>
               </motion.div>
            )}

            {/* 3rd Place */}
            {topThree[2] && (
               <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="flex flex-col items-center"
               >
                  <div className="w-16 h-16 rounded-full bg-orange-100 border-4 border-white shadow-md flex items-center justify-center text-3xl relative mb-2">
                     {topThree[2].avatar}
                     <div className="absolute -bottom-2 bg-orange-500 text-white text-[10px] font-bold px-2 rounded-full border border-white">3</div>
                  </div>
                  <div className="bg-white/80 backdrop-blur rounded-t-xl w-20 h-20 flex flex-col items-center justify-center shadow-sm">
                     <span className="font-bold text-slate-700 text-sm truncate w-full text-center px-1">{topThree[2].name}</span>
                     <span className="text-orange-600 font-bold text-xs">{topThree[2].points} XP</span>
                  </div>
               </motion.div>
            )}
         </div>

         {/* List */}
         <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pl-2">Promotion Zone</div>
            {rest.map((student, index) => {
               const rank = index + 4;
               const isMe = student.id === 's1'; // Mock "me"

               return (
                  <motion.div
                     key={student.id}
                     initial={{ opacity: 0, x: -20 }}
                     animate={{ opacity: 1, x: 0 }}
                     transition={{ delay: 0.4 + index * 0.05 }}
                     className={`flex items-center gap-4 p-3 rounded-xl border-2 transition-all ${isMe ? 'bg-purple-50 border-purple-200' : 'bg-white border-slate-100'}`}
                  >
                     <div className="w-6 text-center font-bold text-slate-400 text-sm">{rank}</div>
                     <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xl">
                        {student.avatar}
                     </div>
                     <div className="flex-1">
                        <div className={`font-bold text-sm ${isMe ? 'text-purple-700' : 'text-slate-700'}`}>{student.name} {isMe && '(You)'}</div>
                     </div>
                     <div className="font-mono font-bold text-slate-600">{student.points} XP</div>
                     <div className="text-xs">
                        {index === 0 ? <ArrowUp size={16} className="text-green-500" /> : index > 3 ? <ArrowDown size={16} className="text-red-400" /> : <Minus size={16} className="text-slate-300" />}
                     </div>
                  </motion.div>
               );
            })}
         </div>
      </div>
   );
};

export default Leaderboard;
