import React, { useState, useEffect } from 'react';
import { Mic, Volume2, User, Users } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

const BoardISayYouSay = ({ data }: { data: any }) => {
  const { state } = useSession();
  const [phase, setPhase] = useState<'listen' | 'repeat'>('listen');
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  
  const items = data.items || [
    { text: "The cat is on the mat.", emphasis: "on" },
    { text: "The dog is under the table.", emphasis: "under" },
    { text: "The bird is in the tree.", emphasis: "in" }
  ];
  
  const currentItem = items[activeItemIndex];

  // Listen for remote events
  useEffect(() => {
    if (state.lastAction?.type === 'TOGGLE_PHASE') {
       setPhase(prev => prev === 'listen' ? 'repeat' : 'listen');
    } else if (state.lastAction?.type === 'NEXT_ITEM') {
       setPhase('listen');
       setActiveItemIndex(prev => (prev + 1) % items.length);
    } else if (state.lastAction?.type === 'PREV_ITEM') {
       setPhase('listen');
       setActiveItemIndex(prev => (prev - 1 + items.length) % items.length);
    }
  }, [state.lastAction, items.length]);

  return (
    <div className={`h-full flex flex-col font-display relative overflow-hidden transition-colors duration-500 ${phase === 'listen' ? 'bg-blue-900' : 'bg-emerald-900'}`}>
       {/* Background Effect */}
       <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/10 to-transparent opacity-50"></div>
       
       {/* Turn Indicator (Huge) */}
       <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full border-[3px] border-white/10 flex items-center justify-center animate-pulse-slow">
          <div className="w-[600px] h-[600px] rounded-full border-[3px] border-white/20"></div>
       </div>

       {/* Header */}
       <div className="relative z-10 p-8 flex justify-between items-center">
          <div className="bg-white/10 backdrop-blur px-6 py-3 rounded-2xl border border-white/20 text-white font-bold flex items-center gap-3">
             <div className="w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
             I Say, You Say
          </div>
          <div className="text-white/60 font-mono text-xl">
             {activeItemIndex + 1} / {items.length}
          </div>
       </div>

       {/* Main Stage */}
       <div className="flex-1 relative z-20 flex flex-col items-center justify-center">
          
          {/* Phase Icon */}
          <div className={`
             mb-12 w-32 h-32 rounded-full flex items-center justify-center text-white shadow-2xl transition-all duration-500 transform
             ${phase === 'listen' ? 'bg-blue-500 scale-100' : 'bg-emerald-500 scale-110'}
          `}>
             {phase === 'listen' ? <Volume2 size={64} /> : <Mic size={64} className="animate-bounce" />}
          </div>

          {/* Prompt Text */}
          <div className="text-center max-w-5xl px-8">
             <div className={`text-4xl font-bold uppercase tracking-[0.2em] mb-8 transition-colors ${phase === 'listen' ? 'text-blue-300' : 'text-emerald-300'}`}>
                {phase === 'listen' ? 'Listen to Teacher' : 'Your Turn!'}
             </div>
             
             <h1 className="text-8xl font-black text-white leading-tight drop-shadow-lg transition-all duration-300">
                {currentItem.text.split(' ').map((word: string, i: number) => {
                   // Simple emphasis logic: removing punctuation for check
                   const cleanWord = word.replace(/[^a-zA-Z]/g, '');
                   const isEmphasized = cleanWord.toLowerCase() === currentItem.emphasis.toLowerCase();
                   
                   return (
                      <span key={i} className={`inline-block mx-2 ${isEmphasized ? 'text-yellow-400 scale-110 transform' : ''}`}>
                         {word}
                      </span>
                   );
                })}
             </h1>
          </div>

          {/* Visual Waveform (Fake) */}
          {phase === 'repeat' && (
             <div className="mt-16 flex items-end gap-2 h-16">
                {[...Array(20)].map((_, i) => (
                   <div 
                      key={i} 
                      className="w-3 bg-white/50 rounded-full animate-pulse"
                      style={{ 
                         height: `${Math.random() * 100}%`,
                         animationDelay: `${i * 0.05}s`
                      }}
                   ></div>
                ))}
             </div>
          )}
       </div>

       {/* Footer Footer */}
       <div className="relative z-10 p-8 flex justify-center gap-16 text-white/50 font-bold uppercase tracking-widest text-sm">
          <div className={`flex items-center gap-2 ${phase === 'listen' ? 'text-white opacity-100' : 'opacity-50'}`}>
             <User size={20} /> Teacher
          </div>
          <div className={`flex items-center gap-2 ${phase === 'repeat' ? 'text-white opacity-100' : 'opacity-50'}`}>
             <Users size={20} /> Students
          </div>
       </div>
    </div>
  );
};

export default BoardISayYouSay;