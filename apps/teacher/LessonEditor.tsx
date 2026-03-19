
import React from 'react';
import { ChevronLeft, MoreVertical, Music, Image as ImageIcon, FileText, CheckCircle, AlertCircle, Loader2, Camera, Plus } from 'lucide-react';
import { motion } from 'framer-motion';

interface LessonEditorProps {
  onBack?: () => void;
}

const LessonEditor: React.FC<LessonEditorProps> = ({ onBack }) => {
  // Mock timeline data
  const items = [
    { id: 1, type: 'audio', title: 'Warm Up Song', duration: '5m', status: 'ready' },
    { id: 2, type: 'text', title: 'Vocab Introduction', duration: '10m', status: 'review' },
    { id: 3, type: 'image', title: 'Flashcards', duration: '10m', status: 'processing' },
    { id: 4, type: 'game', title: 'Team Battle', duration: '15m', status: 'ready' },
  ];

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans max-w-md mx-auto shadow-xl border-x border-slate-200">
      {/* Sticky Header */}
      <header className="bg-white/90 backdrop-blur px-4 py-3 sticky top-0 z-20 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
           <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full">
             <ChevronLeft size={24} />
           </button>
           <div>
              <h1 className="font-bold text-slate-800 text-sm">Unit 1: The Zoo</h1>
              <p className="text-xs text-slate-500">Lesson 3 • 45 min</p>
           </div>
        </div>
        <button className="text-blue-600 font-bold text-sm">Save</button>
      </header>

      {/* Timeline Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
         <div className="pl-4 border-l-2 border-slate-200 space-y-6 py-2 relative">
            
            {items.map((item, index) => (
               <motion.div 
                 key={item.id} 
                 initial={{ opacity: 0, x: -20 }}
                 animate={{ opacity: 1, x: 0 }}
                 transition={{ delay: index * 0.1 }}
                 className="relative pl-6"
               >
                  {/* Icon Indicator */}
                  <div className={`
                     absolute -left-[9px] top-4 w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center
                     ${item.status === 'ready' ? 'border-green-500' : item.status === 'review' ? 'border-yellow-500' : 'border-slate-300'}
                  `}></div>

                  {/* Card */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 active:scale-[0.98] transition-transform">
                     <div className="flex items-start gap-3">
                        <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                           {item.status === 'processing' ? (
                              <Loader2 size={20} className="text-slate-400 animate-spin" />
                           ) : item.type === 'audio' ? (
                              <Music size={20} className="text-blue-500" />
                           ) : item.type === 'image' ? (
                              <ImageIcon size={20} className="text-purple-500" />
                           ) : (
                              <FileText size={20} className="text-slate-500" />
                           )}
                        </div>
                        <div className="flex-1 min-w-0">
                           <div className="flex justify-between items-start">
                              <h3 className="font-bold text-slate-800 text-sm truncate">{item.title}</h3>
                              <button className="text-slate-300"><MoreVertical size={16} /></button>
                           </div>
                           <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{item.duration}</span>
                              {item.status === 'ready' && (
                                 <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <CheckCircle size={10} /> Ready
                                 </span>
                              )}
                              {item.status === 'review' && (
                                 <span className="text-[10px] font-bold text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <AlertCircle size={10} /> Review
                                 </span>
                              )}
                           </div>
                        </div>
                     </div>
                  </div>
               </motion.div>
            ))}

            {/* Add New Placeholder */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: items.length * 0.1 }}
              className="relative pl-6"
            >
               <div className="absolute -left-[5px] top-6 w-2 h-2 rounded-full bg-slate-300"></div>
               <button className="w-full h-20 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 gap-1 hover:bg-slate-50 hover:border-slate-400 transition-colors">
                  <Plus size={24} />
                  <span className="text-xs font-bold">Add Activity</span>
               </button>
            </motion.div>

         </div>
      </div>

      {/* FAB */}
      <motion.button 
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", damping: 15, stiffness: 200, delay: 0.5 }}
        className="absolute bottom-6 right-6 w-14 h-14 bg-blue-600 rounded-full shadow-lg shadow-blue-500/30 flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all"
      >
         <Camera size={24} />
      </motion.button>
    </div>
  );
};

export default LessonEditor;
    