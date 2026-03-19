import React, { useState, useEffect } from 'react';
import { Zap, Clock, Volume2, HelpCircle } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

const BoardSpeedQuiz = ({ data }: { data: any }) => {
  const { state } = useSession();
  const [timeLeft, setTimeLeft] = useState(data.timer || 10);
  const [isRevealed, setIsRevealed] = useState(false);

  // Listen for remote events
  useEffect(() => {
    if (state.lastAction?.type === 'REVEAL_ANSWER') {
      setIsRevealed(true);
    } else if (state.lastAction?.type === 'RESET_TIMER') {
      setIsRevealed(false);
      setTimeLeft(data.timer || 10);
    }
  }, [state.lastAction, data.timer]);

  useEffect(() => {
    if (timeLeft > 0 && !isRevealed) {
      const timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0) {
      setIsRevealed(true);
    }
  }, [timeLeft, isRevealed]);

  return (
    <div className="h-full bg-slate-900 flex flex-col font-display text-white relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 to-black"></div>
      
      {/* Header */}
      <div className="relative z-10 p-8 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-duo-blue rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Zap size={32} className="text-white" />
          </div>
          <div>
            <div className="text-blue-400 font-bold uppercase tracking-widest text-sm mb-1">Speed Quiz</div>
            <h1 className="text-3xl font-bold">Round 1</h1>
          </div>
        </div>
        
        {/* Circular Timer */}
        <div className="relative w-24 h-24 flex items-center justify-center">
           <svg className="w-full h-full transform -rotate-90">
             <circle cx="48" cy="48" r="40" stroke="rgba(255,255,255,0.1)" strokeWidth="8" fill="none" />
             <circle 
               cx="48" cy="48" r="40" 
               stroke={timeLeft < 4 ? '#ef4444' : '#3b82f6'} 
               strokeWidth="8" 
               fill="none" 
               strokeDasharray={251} 
               strokeDashoffset={251 - (251 * timeLeft) / (data.timer || 10)}
               className="transition-all duration-1000 ease-linear"
             />
           </svg>
           <span className={`absolute text-3xl font-black font-mono ${timeLeft < 4 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
             {timeLeft}
           </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative z-10 flex flex-col items-center justify-center p-12">
         {/* Question */}
         <h2 className="text-6xl font-bold text-center mb-12 drop-shadow-lg leading-tight max-w-5xl">
           {data.question}
         </h2>

         {/* Image/Answer Card */}
         <div className="relative w-full max-w-3xl aspect-video bg-white rounded-3xl shadow-2xl overflow-hidden group perspective-1000">
            {/* Front: Image */}
            <div className={`absolute inset-0 transition-all duration-700 backface-hidden ${isRevealed ? 'opacity-0 scale-110' : 'opacity-100 scale-100'}`}>
               <img src={data.image} alt="Quiz" className="w-full h-full object-cover" />
               <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-8">
                  <div className="bg-black/40 backdrop-blur px-6 py-3 rounded-xl border border-white/20 text-white/80 font-bold flex items-center gap-3">
                     <HelpCircle size={24} /> What is this?
                  </div>
               </div>
            </div>

            {/* Back: Answer Reveal */}
            <div className={`absolute inset-0 bg-duo-green flex flex-col items-center justify-center transition-all duration-500 transform ${isRevealed ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}>
               <div className="text-white/80 font-bold uppercase tracking-widest mb-4">Correct Answer</div>
               <div className="text-8xl font-black text-white drop-shadow-md mb-8">{data.answer}</div>
               {data.pronunciation && (
                 <div className="bg-white/20 backdrop-blur px-8 py-4 rounded-full flex items-center gap-4 text-3xl font-mono">
                    <Volume2 size={32} /> {data.pronunciation}
                 </div>
               )}
            </div>
         </div>
      </div>

      {/* Footer Progress */}
      <div className="h-2 bg-white/10 w-full">
         <div className="h-full bg-duo-blue w-1/5"></div>
      </div>
    </div>
  );
};

export default BoardSpeedQuiz;