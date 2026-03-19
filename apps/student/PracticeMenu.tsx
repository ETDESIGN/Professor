
import React, { useState, useEffect } from 'react';
import { ChevronLeft, Volume2, Mic, Puzzle, BookOpen, Dumbbell, Feather, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';
import { Engine } from '../../services/SupabaseService';

interface PracticeMenuProps {
   onBack: () => void;
   onNavigate: (view: string) => void;
}

const PracticeMenu: React.FC<PracticeMenuProps> = ({ onBack, onNavigate }) => {
   const [srsCount, setSrsCount] = useState(0);

   useEffect(() => {
      const fetchSrs = async () => {
         const items = await Engine.fetchSRSItems();
         setSrsCount(items.length);
      };
      fetchSrs();
   }, []);

   return (
      <div className="h-full bg-slate-50 flex flex-col font-sans">
         {/* Header */}
         <header className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-20 flex items-center gap-4">
            <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full">
               <ChevronLeft size={24} />
            </button>
            <span className="font-bold text-slate-800">Practice Arena</span>
         </header>

         {/* Content */}
         <div className="flex-1 overflow-y-auto p-6">
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               className="text-center mb-8"
            >
               <div className="w-16 h-16 bg-orange-100 text-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border-2 border-orange-200">
                  <Dumbbell size={32} />
               </div>
               <h1 className="text-2xl font-bold text-slate-800">Train your skills</h1>
               <p className="text-slate-500">Select a category to practice.</p>
            </motion.div>

            <motion.div
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               transition={{ staggerChildren: 0.1 }}
               className="grid grid-cols-2 gap-4"
            >
               <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onNavigate('listen')}
                  className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm hover:border-blue-400 hover:shadow-md transition-all group flex flex-col items-center gap-4"
               >
                  <div className="w-14 h-14 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                     <Volume2 size={24} />
                  </div>
                  <span className="font-bold text-slate-700">Listening</span>
               </motion.button>

               <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onNavigate('pronounce')}
                  className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm hover:border-purple-400 hover:shadow-md transition-all group flex flex-col items-center gap-4"
               >
                  <div className="w-14 h-14 bg-purple-50 text-purple-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                     <Mic size={24} />
                  </div>
                  <span className="font-bold text-slate-700">Speaking</span>
               </motion.button>

               <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onNavigate('scramble')}
                  className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm hover:border-green-400 hover:shadow-md transition-all group flex flex-col items-center gap-4"
               >
                  <div className="w-14 h-14 bg-green-50 text-green-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                     <Puzzle size={24} />
                  </div>
                  <span className="font-bold text-slate-700">Grammar</span>
               </motion.button>

               <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onNavigate('reading')}
                  className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm hover:border-yellow-400 hover:shadow-md transition-all group flex flex-col items-center gap-4"
               >
                  <div className="w-14 h-14 bg-yellow-50 text-yellow-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                     <BookOpen size={24} />
                  </div>
                  <span className="font-bold text-slate-700">Reading</span>
               </motion.button>

               <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onNavigate('phonics')}
                  className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm hover:border-sky-400 hover:shadow-md transition-all group flex flex-col items-center gap-4"
               >
                  <div className="w-14 h-14 bg-sky-50 text-sky-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                     <Feather size={24} />
                  </div>
                  <span className="font-bold text-slate-700">Phonics Fly</span>
               </motion.button>

               <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onNavigate('srs')}
                  className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm hover:border-orange-400 hover:shadow-md transition-all group flex flex-col items-center gap-4 relative"
               >
                  {srsCount > 0 && (
                     <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md animate-pulse">
                        {srsCount}
                     </div>
                  )}
                  <div className="w-14 h-14 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                     <RotateCcw size={24} />
                  </div>
                  <span className="font-bold text-slate-700">SRS Review</span>
               </motion.button>
            </motion.div>

            <motion.div
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               transition={{ delay: 0.5 }}
               className="mt-8 bg-slate-100 p-4 rounded-xl text-center"
            >
               <p className="text-xs text-slate-500 font-medium">More practice modes coming soon!</p>
            </motion.div>
         </div>
      </div>
   );
};

export default PracticeMenu;
