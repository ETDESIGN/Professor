import React, { useState, useEffect } from 'react';
import { Play, Pause, ChevronRight } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

const BoardStoryStage = ({ data }: { data: any }) => {
  const { state } = useSession();
  const [activePanel, setActivePanel] = useState(0);
  const pages = data.pages || [];
  const current = pages[activePanel];

  // Listen for remote events
  useEffect(() => {
    if (state.lastAction?.type === 'NEXT_PANEL') {
       setActivePanel(p => (p + 1) % pages.length);
    } else if (state.lastAction?.type === 'PREV_PANEL') {
       setActivePanel(p => (p - 1 + pages.length) % pages.length);
    }
  }, [state.lastAction]);

  // Mock comic images for prototype
  const bgImages = [
     'https://img.freepik.com/free-vector/cartoon-nature-landscape-with-trees-bushes_107791-2092.jpg',
     'https://img.freepik.com/free-vector/jungle-landscape-background_1308-49033.jpg'
  ];

  return (
    <div className="h-full w-full bg-slate-900 relative overflow-hidden">
       {/* Cinematic Background (Blurred) */}
       <div className="absolute inset-0 z-0">
          <img 
            src={bgImages[activePanel % bgImages.length]} 
            className="w-full h-full object-cover filter blur-xl scale-110 opacity-50 transition-all duration-1000"
            alt="Blur BG" 
          />
       </div>

       {/* Main Viewport (Zoomed Panel) */}
       <div className="absolute inset-x-12 inset-y-24 z-10 flex gap-8">
          {/* Previous Panel (Faded) */}
          <div className="w-48 h-full bg-black/40 rounded-3xl border-4 border-white/10 transform scale-90 opacity-40 origin-right"></div>
          
          {/* Active Panel */}
          <div className="flex-1 bg-white rounded-[2rem] shadow-2xl overflow-hidden relative border-[12px] border-white group">
             <img 
               src={bgImages[activePanel % bgImages.length]} 
               className="w-full h-full object-cover transform transition-transform duration-[20s] ease-linear scale-100 group-hover:scale-110"
               alt="Active Panel"
             />
             
             {/* Dialogue Overlay */}
             <div className="absolute bottom-12 left-12 right-12">
               <div className="bg-white/95 backdrop-blur-xl p-8 rounded-[2rem] shadow-xl border-l-[16px] border-duo-green flex items-start gap-8 animate-slide-up">
                  {/* Speaker Avatar */}
                  <div className="relative -mt-16">
                     <div className="w-32 h-32 bg-duo-green rounded-full border-8 border-white shadow-lg overflow-hidden">
                        <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=Rocky${activePanel}`} alt="Speaker" className="w-full h-full" />
                     </div>
                     <div className="absolute bottom-0 right-0 bg-duo-green text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border-2 border-white">
                       Speaking
                     </div>
                  </div>
                  
                  {/* Text */}
                  <div className="flex-1">
                     <h3 className="text-slate-400 font-bold uppercase tracking-widest text-sm mb-2">Rocky the Robot</h3>
                     <p className="text-5xl font-fun text-slate-800 leading-tight">
                       "{current.text}"
                     </p>
                  </div>
               </div>
             </div>
          </div>

          {/* Next Panel (Faded) */}
          <div 
             onClick={() => setActivePanel((p) => (p + 1) % pages.length)}
             className="w-48 h-full bg-white rounded-3xl border-4 border-white/50 transform scale-90 opacity-60 origin-left cursor-pointer hover:opacity-100 hover:scale-95 transition-all overflow-hidden"
          >
             <img src={bgImages[(activePanel + 1) % bgImages.length]} className="w-full h-full object-cover" />
          </div>
       </div>

       {/* Header Info */}
       <div className="absolute top-0 left-0 w-full p-8 flex justify-between items-center z-20">
          <div className="bg-black/40 backdrop-blur px-6 py-3 rounded-full text-white font-bold border border-white/10 flex items-center gap-3">
             <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
             Chapter 3: The Reaction
          </div>
          <div className="flex items-center gap-2 text-white/60 font-mono">
             Panel {activePanel + 1} / {pages.length}
          </div>
       </div>

       <style>{`
         @keyframes slide-up {
           from { transform: translateY(20px); opacity: 0; }
           to { transform: translateY(0); opacity: 1; }
         }
         .animate-slide-up { animation: slide-up 0.5s ease-out forwards; }
       `}</style>
    </div>
  );
};

export default BoardStoryStage;