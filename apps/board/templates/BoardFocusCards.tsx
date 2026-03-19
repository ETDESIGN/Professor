
import React, { useState, useEffect } from 'react';
import { Volume2, ArrowRight, ArrowLeft } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

const BoardFocusCards = ({ data }: { data: any }) => {
  const { state } = useSession();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const cards = data.cards || [];
  const activeCard = cards[activeIndex];

  // Listen for remote events
  useEffect(() => {
    if (state.lastAction?.type === 'NEXT_CARD') {
      handleNext();
    } else if (state.lastAction?.type === 'PREV_CARD') {
      handlePrev();
    } else if (state.lastAction?.type === 'FLIP_CARD') {
      setIsFlipped(prev => !prev);
    }
  }, [state.lastAction]);

  const handleNext = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % cards.length);
    }, 200);
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setActiveIndex((prev) => (prev - 1 + cards.length) % cards.length);
    }, 200);
  };

  return (
    <div className="h-full bg-slate-100 flex flex-col p-12 overflow-hidden relative">
      {/* Background Decor */}
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#3b82f6 2px, transparent 2px)', backgroundSize: '40px 40px' }}></div>

      {/* Header */}
      <div className="flex justify-between items-center mb-8 relative z-10">
         <h2 className="text-5xl font-display font-bold text-slate-800 flex items-center gap-4">
           <span className="bg-duo-blue text-white w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg">Aa</span>
           {data.title}
         </h2>
         <div className="text-4xl font-mono text-slate-400 font-bold tracking-widest bg-white px-6 py-2 rounded-xl shadow-sm border border-slate-200">
            {activeIndex + 1} / {cards.length}
         </div>
      </div>

      {/* 3D Stage */}
      <div className="flex-1 flex items-center justify-center perspective-[2500px]">
        
        {/* Navigation Indicators (Visual Only) */}
        <div className="absolute left-12 top-1/2 -translate-y-1/2 text-slate-300 animate-pulse">
          <ArrowLeft size={64} />
        </div>
        <div className="absolute right-12 top-1/2 -translate-y-1/2 text-slate-300 animate-pulse">
          <ArrowRight size={64} />
        </div>

        {/* Stack Depth Effect */}
        <div className="absolute w-[600px] h-[750px] bg-white rounded-[3rem] shadow-sm border border-slate-200 transform translate-x-4 translate-y-4 -z-10 rotate-2"></div>
        <div className="absolute w-[600px] h-[750px] bg-white rounded-[3rem] shadow-sm border border-slate-200 transform -translate-x-4 translate-y-2 -z-20 -rotate-2"></div>

        {/* The Card */}
        <div 
          className={`relative w-[600px] h-[750px] transition-transform duration-700 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}
        >
           {/* Front Face */}
           <div className="absolute inset-0 backface-hidden bg-white rounded-[3rem] shadow-2xl border-b-[24px] border-slate-100 flex flex-col items-center justify-center p-12 overflow-hidden border-2 border-t-white border-x-white">
              {/* Image Container */}
              <div className="flex-1 w-full flex items-center justify-center relative">
                 <div className="absolute inset-0 bg-blue-50 rounded-full scale-90 opacity-50 blur-3xl"></div>
                 <div className="text-[250px] leading-none filter drop-shadow-2xl relative z-10 transform hover:scale-110 transition-transform duration-500">
                    {activeCard.front}
                 </div>
              </div>
              <div className="h-12 flex items-end">
                 <span className="text-slate-300 font-bold uppercase tracking-[0.5em] text-sm animate-pulse">Waiting to Flip...</span>
              </div>
           </div>

           {/* Back Face */}
           <div className="absolute inset-0 backface-hidden bg-gradient-to-br from-blue-500 to-blue-600 rounded-[3rem] shadow-2xl border-b-[24px] border-blue-800 rotate-y-180 flex flex-col items-center justify-center p-12 text-white border-2 border-t-white/20 border-x-white/20">
              <div className="flex-1 flex flex-col items-center justify-center w-full">
                 <h3 className="text-9xl font-display font-bold mb-8 tracking-tight drop-shadow-md">{activeCard.back}</h3>
                 
                 <div className="bg-white/20 backdrop-blur-md px-10 py-5 rounded-full flex items-center gap-6 text-4xl font-mono shadow-inner border border-white/20">
                    <Volume2 size={48} className="text-yellow-300" />
                    {activeCard.pronunciation}
                 </div>
              </div>
              
              <div className="w-full bg-black/20 p-6 rounded-2xl text-center backdrop-blur-sm border border-white/10">
                 <p className="opacity-90 text-2xl font-medium">
                    "The <span className="font-bold text-yellow-300 underline decoration-4 underline-offset-4">{activeCard.back.toLowerCase()}</span> lives in the jungle."
                 </p>
              </div>
           </div>
        </div>

      </div>

      <style>{`
        .perspective-[2500px] { perspective: 2500px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
};

export default BoardFocusCards;
