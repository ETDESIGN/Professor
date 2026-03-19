
import React from 'react';
import { X, Clock, BookOpen, Layers, Play, Edit3, ArrowRight, Video, Mic, LayoutGrid, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface UnitPreviewModalProps {
   unit: any;
   onClose: () => void;
   onLaunch: () => void;
   onEdit: () => void;
}

const UnitPreviewModal: React.FC<UnitPreviewModalProps> = ({ unit, onClose, onLaunch, onEdit }) => {
   const timeline = unit.manifest?.timeline || unit.flow || [];

   const getIconForType = (type: string) => {
      switch (type) {
         case 'MEDIA_PLAYER': return { icon: Music, color: 'bg-blue-100 text-blue-600' };
         case 'FOCUS_CARDS': return { icon: BookOpen, color: 'bg-emerald-100 text-emerald-600' };
         case 'GAME_ARENA': return { icon: LayoutGrid, color: 'bg-purple-100 text-purple-600' };
         case 'GRAMMAR_BOARD': return { icon: Layers, color: 'bg-orange-100 text-orange-600' };
         default: return { icon: BookOpen, color: 'bg-slate-100 text-slate-600' };
      }
   };

   const steps = timeline.length > 0 ? timeline.map((item: any) => ({
      type: item.type,
      title: item.title,
      duration: `${item.duration || 5}m`,
      ...getIconForType(item.type)
   })) : [
      { type: 'media', title: 'Warm Up: Jungle Song', duration: '5m', icon: Music, color: 'bg-blue-100 text-blue-600' },
      { type: 'core', title: 'Vocab: Animals', duration: '10m', icon: BookOpen, color: 'bg-emerald-100 text-emerald-600' },
      { type: 'game', title: 'Game: Whats Missing', duration: '10m', icon: LayoutGrid, color: 'bg-purple-100 text-purple-600' },
      { type: 'core', title: 'Grammar: Present Continuous', duration: '15m', icon: Layers, color: 'bg-orange-100 text-orange-600' },
      { type: 'game', title: 'Team Battle', duration: '10m', icon: TrophyIcon, color: 'bg-red-100 text-red-600' },
   ];

   return (
      <AnimatePresence>
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="absolute inset-0 bg-black/60 backdrop-blur-sm"
               onClick={onClose}
            />
            <motion.div
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               transition={{ type: 'spring', damping: 25, stiffness: 300 }}
               className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]"
            >

               {/* Header Image */}
               <div className="h-48 bg-slate-100 relative">
                  <img
                     src={`https://api.dicebear.com/7.x/shapes/svg?seed=${unit.id}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
                     className="w-full h-full object-cover"
                     alt="Cover"
                     referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                  <button
                     onClick={onClose}
                     className="absolute top-4 right-4 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full backdrop-blur-sm transition-colors"
                  >
                     <X size={20} />
                  </button>
                  <div className="absolute bottom-6 left-6 text-white">
                     <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 rounded bg-white/20 backdrop-blur text-xs font-bold uppercase border border-white/30">
                           {unit.level}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-green-500/80 backdrop-blur text-xs font-bold uppercase">
                           Ready to Teach
                        </span>
                     </div>
                     <h2 className="text-3xl font-display font-bold">{unit.title}</h2>
                  </div>
               </div>

               {/* Stats Bar */}
               <div className="flex divide-x divide-slate-100 border-b border-slate-100">
                  <div className="flex-1 p-4 flex flex-col items-center">
                     <span className="text-xs font-bold text-slate-400 uppercase">Duration</span>
                     <span className="font-bold text-slate-700 flex items-center gap-1"><Clock size={16} /> {timeline.reduce((acc: number, item: any) => acc + (item.duration || 5), 0)} min</span>
                  </div>
                  <div className="flex-1 p-4 flex flex-col items-center">
                     <span className="text-xs font-bold text-slate-400 uppercase">Slides</span>
                     <span className="font-bold text-slate-700 flex items-center gap-1"><Layers size={16} /> {timeline.length || 24}</span>
                  </div>
                  <div className="flex-1 p-4 flex flex-col items-center">
                     <span className="text-xs font-bold text-slate-400 uppercase">Activities</span>
                     <span className="font-bold text-slate-700 flex items-center gap-1"><LayoutGrid size={16} /> {timeline.filter((t: any) => t.type === 'GAME_ARENA').length || 6}</span>
                  </div>
               </div>

               {/* Timeline Preview */}
               <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                     <div className="w-1 h-4 bg-teacher-primary rounded-full"></div>
                     Lesson Flow
                  </h3>
                  <div className="space-y-3">
                     {steps.map((step, i) => (
                        <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 flex items-center gap-4 shadow-sm">
                           <div className="text-slate-400 font-mono font-bold text-sm w-6 text-center">{i + 1}</div>
                           <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${step.color}`}>
                              <step.icon size={20} />
                           </div>
                           <div className="flex-1">
                              <div className="font-bold text-slate-700 text-sm">{step.title}</div>
                              <div className="text-xs text-slate-400">{step.type.toUpperCase()} • {step.duration}</div>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>

               {/* Footer Actions */}
               <div className="p-4 bg-white border-t border-slate-200 flex gap-3">
                  <button
                     onClick={onEdit}
                     className="flex-1 py-3 px-4 rounded-xl border-2 border-slate-200 font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-2"
                  >
                     <Edit3 size={18} /> Edit Plan
                  </button>
                  <button
                     onClick={onLaunch}
                     className="flex-[2] py-3 px-4 rounded-xl bg-teacher-primary text-white font-bold hover:bg-emerald-500 shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 transform active:scale-[0.98]"
                  >
                     <Play size={20} fill="currentColor" /> Launch Live Session
                  </button>
               </div>

            </motion.div>
         </div>
      </AnimatePresence>
   );
};

const TrophyIcon = (props: any) => (
   <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>
);

export default UnitPreviewModal;
