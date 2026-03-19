
import React, { useState, useEffect } from 'react';
import { Play, Pause, Volume2, RotateCcw } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

const BoardLiveClassWarmup = ({ data }: { data: any }) => {
  const { state } = useSession();
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  // Auto-play simulation
  useEffect(() => {
    if (isPlaying) {
      const interval = setInterval(() => {
        setProgress(p => (p >= 100 ? 0 : p + 0.2));
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isPlaying]);

  // Listen for remote events
  useEffect(() => {
    if (state.lastAction?.type === 'PLAY_PAUSE') {
      setIsPlaying(prev => !prev);
    }
  }, [state.lastAction]);

  const vocab = data.vocab || [];

  return (
    <div className="h-full bg-slate-950 flex flex-col font-sans overflow-hidden relative">
      {/* Header */}
      <div className="h-24 px-8 flex items-center justify-between border-b border-white/10 bg-slate-900/50 backdrop-blur z-20">
         <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center text-white font-bold animate-pulse">
               LIVE
            </div>
            <div>
               <h1 className="text-3xl font-display font-bold text-white">Warm Up Phase</h1>
               <p className="text-slate-400">Unit 1: Jungle Safari</p>
            </div>
         </div>
         <div className="text-6xl font-black text-white/10 tracking-widest">
            05:00
         </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-8 gap-8 relative z-10">
         
         {/* Video Player */}
         <div className="flex-1 bg-black rounded-[2rem] overflow-hidden relative group shadow-2xl border-4 border-slate-800">
            <img 
               src={data.videoThumbnail || "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1920"} 
               className="w-full h-full object-cover opacity-80" 
               alt="Warmup"
            />
            
            {/* Overlay UI */}
            <div className="absolute inset-0 flex flex-col justify-between p-8">
               <div className="self-end bg-black/60 backdrop-blur px-4 py-2 rounded-lg text-white font-mono text-sm">
                  Video: The Jungle Song
               </div>

               <div className="flex justify-center">
                  {!isPlaying && (
                     <button 
                        onClick={() => setIsPlaying(true)}
                        className="w-24 h-24 bg-white/20 backdrop-blur rounded-full flex items-center justify-center hover:scale-110 transition-transform cursor-pointer border-4 border-white/50"
                     >
                        <Play size={48} fill="white" className="ml-2 text-white" />
                     </button>
                  )}
               </div>

               {/* Controls */}
               <div className="bg-black/60 backdrop-blur rounded-2xl p-4 flex items-center gap-4 border border-white/10">
                  <button onClick={() => setIsPlaying(!isPlaying)} className="text-white hover:text-green-400">
                     {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                  </button>
                  <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
                     <div className="h-full bg-red-500" style={{ width: `${progress}%` }}></div>
                  </div>
                  <div className="text-white font-mono text-sm">01:45 / 03:20</div>
                  <button className="text-white hover:text-blue-400"><Volume2 size={24} /></button>
               </div>
            </div>
         </div>

         {/* Vocab Scroller */}
         <div className="h-32 relative">
            <div className="absolute -left-8 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-950 to-transparent z-10"></div>
            <div className="absolute -right-8 top-0 bottom-0 w-24 bg-gradient-to-l from-slate-950 to-transparent z-10"></div>
            
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
               {vocab.map((item: any, i: number) => (
                  <div 
                     key={i} 
                     className="min-w-[200px] bg-slate-800/80 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 hover:bg-slate-700/80 hover:scale-105 transition-all snap-center cursor-default"
                  >
                     <div className="text-4xl">{item.icon}</div>
                     <div className="font-bold text-white text-lg">{item.text}</div>
                  </div>
               ))}
            </div>
         </div>

      </div>
    </div>
  );
};

export default BoardLiveClassWarmup;
