
import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Clock, Sparkles } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

const BoardMagicEyes = ({ data }: { data: any }) => {
  const { state } = useSession();
  const [phase, setPhase] = useState<'flash' | 'recall' | 'reveal'>('flash');
  const [timeLeft, setTimeLeft] = useState(data.timer || 5);

  // Listen for remote events
  useEffect(() => {
    if (state.lastAction?.type === 'REVEAL') {
      setPhase('reveal');
    } else if (state.lastAction?.type === 'RESTART') {
      setPhase('flash');
      setTimeLeft(data.timer || 5);
    }
  }, [state.lastAction, data.timer]);

  useEffect(() => {
    let interval: any;
    if (phase === 'flash' && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (phase === 'flash' && timeLeft === 0) {
      setPhase('recall');
    }
    return () => clearInterval(interval);
  }, [phase, timeLeft]);

  return (
    <div className="h-full bg-slate-900 flex flex-col font-display relative overflow-hidden">
      {/* HUD */}
      <div className="absolute top-0 left-0 w-full p-8 z-30 flex justify-between items-center pointer-events-none">
         <div className="bg-black/40 backdrop-blur px-6 py-3 rounded-2xl border border-white/20 flex items-center gap-4 text-white">
            <div className={`p-2 rounded-xl ${phase === 'flash' ? 'bg-blue-500' : 'bg-purple-600'} transition-colors`}>
               {phase === 'flash' ? <Eye size={24} /> : <EyeOff size={24} />}
            </div>
            <div>
               <h1 className="text-2xl font-bold">Magic Eyes</h1>
               <p className="text-white/60 text-sm font-sans">{phase === 'flash' ? 'Memorize the details!' : phase === 'recall' ? 'What did you see?' : 'Did you get it?'}</p>
            </div>
         </div>

         {phase === 'flash' && (
            <div className="bg-black/40 backdrop-blur px-6 py-3 rounded-2xl border border-white/20 text-white font-mono text-4xl font-bold flex items-center gap-4">
               <Clock className="text-blue-400" size={32} />
               {timeLeft}s
            </div>
         )}
      </div>

      {/* Main Content */}
      <div className="flex-1 relative flex items-center justify-center bg-black">
         {/* The Image */}
         <img 
            src={data.image} 
            alt="Magic Eyes Target" 
            className={`
               w-full h-full object-cover transition-all duration-1000
               ${phase === 'recall' ? 'blur-[100px] opacity-30 scale-110' : 'blur-0 opacity-100 scale-100'}
            `} 
         />

         {/* Recall Overlay */}
         {phase === 'recall' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-20 animate-fade-in">
               <div className="w-32 h-32 rounded-full bg-purple-600/20 flex items-center justify-center mb-8 border-4 border-purple-500/50 animate-pulse">
                  <Sparkles size={64} className="text-purple-300" />
               </div>
               <h2 className="text-6xl font-black text-white drop-shadow-[0_4px_20px_rgba(168,85,247,0.5)] text-center max-w-4xl leading-tight">
                  {data.question || "What color was the car?"}
               </h2>
            </div>
         )}

         {/* Reveal Overlay */}
         {phase === 'reveal' && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-green-500 text-white px-12 py-6 rounded-3xl shadow-2xl animate-bounce-subtle z-30 flex items-center gap-6">
               <div className="text-xl font-bold uppercase tracking-widest bg-green-600 px-3 py-1 rounded-lg">Answer</div>
               <div className="text-4xl font-black">{data.answer}</div>
            </div>
         )}
      </div>
    </div>
  );
};

export default BoardMagicEyes;
        