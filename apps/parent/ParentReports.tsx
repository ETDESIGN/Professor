
import React from 'react';
import { ChevronLeft, Share2, TrendingUp, Mic, Book, Headphones, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';

interface ParentReportsProps {
   onBack: () => void;
}

const ParentReports: React.FC<ParentReportsProps> = ({ onBack }) => {
   const { userProfile } = useAppStore();
   const teacherName = userProfile?.full_name || userProfile?.email || 'Teacher';
   const handleShare = () => {
      alert("Report link copied to clipboard!");
   };

   return (
      <div className="h-full bg-slate-50 flex flex-col">
         {/* Sticky Header */}
         <header className="bg-white px-4 py-3 sticky top-0 z-20 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
               <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full">
                  <ChevronLeft size={24} className="text-slate-600" />
               </button>
               <h1 className="font-bold text-lg text-slate-800">Progress Report</h1>
            </div>
            <button onClick={handleShare} className="p-2 text-cyan-500 hover:bg-cyan-50 rounded-full">
               <Share2 size={20} />
            </button>
         </header>

         {/* Main Content */}
         <div className="flex-1 overflow-y-auto p-4 space-y-6">

            {/* Skills Radar (Mock) */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.1 }}
               className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm"
            >
               <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <TrendingUp className="text-cyan-500" size={20} /> Skills Breakdown
               </h3>
               <div className="relative aspect-square max-w-[200px] mx-auto">
                  {/* Decorative Radar Chart */}
                  <div className="absolute inset-0 rounded-full border border-slate-100"></div>
                  <div className="absolute inset-8 rounded-full border border-slate-100"></div>
                  <div className="absolute inset-16 rounded-full border border-slate-100"></div>
                  <div className="absolute inset-0 bg-cyan-500/10 clip-path-radar"></div>

                  {/* Labels */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-6 flex flex-col items-center">
                     <Mic size={16} className="text-cyan-600" />
                     <span className="text-[10px] font-bold text-slate-500 uppercase">Speaking</span>
                     <span className="text-xs font-bold text-slate-800">85%</span>
                  </div>
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-6 flex flex-col items-center">
                     <span className="text-xs font-bold text-slate-800">92%</span>
                     <span className="text-[10px] font-bold text-slate-500 uppercase">Reading</span>
                     <Book size={16} className="text-purple-500" />
                  </div>
                  <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 pr-2 flex flex-col items-end">
                     <Headphones size={16} className="text-blue-500" />
                     <span className="text-[10px] font-bold text-slate-500 uppercase">Listening</span>
                     <span className="text-xs font-bold text-slate-800">78%</span>
                  </div>
                  <div className="absolute right-0 top-1/2 translate-x-full -translate-y-1/2 pl-2 flex flex-col items-start">
                     <MessageCircle size={16} className="text-green-500" />
                     <span className="text-[10px] font-bold text-slate-500 uppercase">Grammar</span>
                     <span className="text-xs font-bold text-slate-800">88%</span>
                  </div>
               </div>
            </motion.div>

            {/* Weekly Word Cloud */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.2 }}
               className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm"
            >
               <h3 className="font-bold text-slate-800 mb-4">Vocabulary Mastered</h3>
               <div className="flex flex-wrap gap-2 justify-center">
                  {['Elephant', 'Passport', 'Airport', 'Ticket', 'Suitcase', 'Giraffe', 'Lion', 'Zebra', 'Boarding'].map((word, i) => (
                     <motion.span
                        key={word}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.3 + (i * 0.05), type: 'spring' }}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium ${i % 2 === 0 ? 'bg-cyan-50 text-cyan-700' : 'bg-purple-50 text-purple-700'} ${i % 3 === 0 ? 'text-lg font-bold' : ''}`}
                     >
                        {word}
                     </motion.span>
                  ))}
               </div>
            </motion.div>

            {/* Teacher Note */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.4 }}
               className="bg-yellow-50 border border-yellow-100 p-5 rounded-2xl relative"
            >
               <div className="absolute -top-3 -right-3 rotate-12 bg-white p-1 shadow-sm rounded-lg border border-slate-100">
                  <span className="text-2xl">📝</span>
               </div>
               <h3 className="font-bold text-yellow-800 mb-2">Teacher's Note</h3>
               <p className="text-sm text-yellow-900/80 leading-relaxed italic">
                  "Leo has shown great improvement in his pronunciation this week, especially with the 'th' sound! He is very active during the team games."
               </p>
               <div className="mt-4 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-slate-200 overflow-hidden">
                     <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Teacher" alt="Teacher" />
                  </div>
                  <span className="text-xs font-bold text-slate-500">{teacherName} • Oct 24</span>
               </div>
            </motion.div>

         </div>

         <style>{`
         .clip-path-radar {
            clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
            background: conic-gradient(from 0deg, #06b6d4 0%, #3b82f6 100%);
            opacity: 0.2;
            transform: scale(0.8);
            border-radius: 50%;
         }
      `}</style>
      </div>
   );
};

export default ParentReports;
