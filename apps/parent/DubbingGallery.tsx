
import React, { useState } from 'react';
import { ChevronLeft, Share2, Download, MoreHorizontal, Play, Star, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DubbingGalleryProps {
  onBack: () => void;
}

const DubbingGallery: React.FC<DubbingGalleryProps> = ({ onBack }) => {
  const [selectedVideo, setSelectedVideo] = useState<number | null>(null);

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    alert('Sharing video link copied!');
  };

  return (
    <div className="h-full bg-slate-50 flex flex-col relative">
      {/* Sticky Header */}
      <header className="bg-white px-4 py-3 sticky top-0 z-20 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
           <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full">
             <ChevronLeft size={24} className="text-slate-600" />
           </button>
           <h1 className="font-bold text-lg text-slate-800">Leo's Studio</h1>
        </div>
        <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border border-slate-100">
           <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Leo" alt="Leo" />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
         {/* Stats Card */}
         <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex divide-x divide-slate-100"
         >
            <div className="flex-1 text-center">
               <div className="text-2xl font-bold text-slate-800">12</div>
               <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Videos Created</div>
            </div>
            <div className="flex-1 text-center">
               <div className="text-2xl font-bold text-slate-800 flex items-center justify-center gap-1">
                 4.8 <Star size={16} className="fill-yellow-400 text-yellow-400" />
               </div>
               <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Avg Score</div>
            </div>
         </motion.div>

         {/* Filter Chips */}
         <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
         >
            {['Recent', 'Best Score', 'Level 1', 'Level 2'].map((filter, i) => (
              <button 
                key={filter} 
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${i === 0 ? 'bg-cyan-500 text-white shadow-md shadow-cyan-200' : 'bg-white border border-slate-200 text-slate-500'}`}
              >
                {filter}
              </button>
            ))}
         </motion.div>

         {/* Video Grid */}
         <div className="grid grid-cols-2 gap-4">
            {['1', '2', '3', '4', '5', '6'].map((i, idx) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + (idx * 0.05) }}
                className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100 group cursor-pointer"
                onClick={() => setSelectedVideo(Number(i))}
              >
                 {/* Thumbnail */}
                 <div className="aspect-[4/5] bg-slate-800 relative">
                    <img 
                      src={`https://source.unsplash.com/random/400x500?cartoon,kids&sig=${i}`} 
                      className="w-full h-full object-cover opacity-80" 
                      alt="Thumbnail" 
                    />
                    <div className="absolute top-2 right-2 bg-black/50 backdrop-blur text-white text-[10px] font-bold px-2 py-1 rounded-full border border-white/20 flex items-center gap-1">
                       <Star size={10} className="fill-yellow-400 text-yellow-400" />
                       {90 + Number(i)}/100
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                       <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Play size={20} className="text-white ml-1" fill="white" />
                       </div>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent"></div>
                 </div>

                 {/* Meta */}
                 <div className="p-3">
                    <h3 className="font-bold text-slate-800 text-sm mb-1 truncate">The Lost Hat</h3>
                    <div className="text-[10px] text-slate-400 mb-3">Oct 2{i} • Level 1</div>
                    
                    <div className="flex justify-between border-t border-slate-100 pt-2">
                       <button onClick={handleShare} className="text-slate-400 hover:text-cyan-500 transition-colors"><Share2 size={16} /></button>
                       <button className="text-slate-400 hover:text-cyan-500 transition-colors"><Download size={16} /></button>
                       <button className="text-slate-400 hover:text-cyan-500 transition-colors"><MoreHorizontal size={16} /></button>
                    </div>
                 </div>
              </motion.div>
            ))}
         </div>
      </div>

      {/* Video Player Modal */}
      <AnimatePresence>
        {selectedVideo !== null && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
          >
             <motion.div 
               initial={{ scale: 0.9, y: 20 }}
               animate={{ scale: 1, y: 0 }}
               exit={{ scale: 0.9, y: 20 }}
               className="w-full max-w-lg bg-black rounded-3xl overflow-hidden relative shadow-2xl"
             >
                <div className="aspect-[4/5] relative">
                   <img 
                     src={`https://source.unsplash.com/random/400x500?cartoon,kids&sig=${selectedVideo}`} 
                     className="w-full h-full object-cover opacity-60" 
                     alt="Playing" 
                   />
                   <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-20 h-20 bg-white/20 backdrop-blur rounded-full flex items-center justify-center animate-pulse">
                         <Play size={32} className="text-white ml-1" fill="white" />
                      </div>
                   </div>
                   {/* Fake Progress */}
                   <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black to-transparent">
                      <div className="h-1 bg-white/30 rounded-full overflow-hidden">
                         <div className="h-full w-1/3 bg-cyan-500"></div>
                      </div>
                      <div className="flex justify-between text-white/80 text-xs font-mono mt-2">
                         <span>0:12</span>
                         <span>0:45</span>
                      </div>
                   </div>
                </div>
                
                <div className="p-4 bg-slate-900 flex justify-between items-center text-white">
                   <div>
                      <h3 className="font-bold">The Lost Hat</h3>
                      <div className="text-xs text-slate-400">Recorded by Leo</div>
                   </div>
                   <div className="flex gap-4">
                      <button className="p-2 bg-white/10 rounded-full hover:bg-white/20"><Share2 size={20} /></button>
                      <button className="p-2 bg-white/10 rounded-full hover:bg-white/20"><Download size={20} /></button>
                   </div>
                </div>

                <button 
                  onClick={() => setSelectedVideo(null)}
                  className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white backdrop-blur-sm"
                >
                   <X size={24} />
                </button>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DubbingGallery;
