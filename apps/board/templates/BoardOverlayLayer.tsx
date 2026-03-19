
import React, { useState, useEffect } from 'react';
import { RotateCw, Star, AlertTriangle, MicOff, VolumeX, ThumbsUp, Zap, Sparkles } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

const BoardOverlayLayer = () => {
  const { state, triggerConfetti } = useSession();
  const [rotation, setRotation] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [winner, setWinner] = useState<any>(null);
  
  // Point Popup State
  const [pointPopup, setPointPopup] = useState<{ id: string; amount: number; studentId: string; sticker: string } | null>(null);
  // Mass Penalty Popup
  const [penaltyPopup, setPenaltyPopup] = useState<{ id: string; amount: number } | null>(null);

  const students = state.students;
  const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

  const positiveStickers = ["Awesome!", "Great Job!", "On Fire!", "Super!", "Amazing!", "Wow!"];
  const negativeStickers = ["Oops!", "Focus!", "Try Again", "Careful"];

  const getRandomSticker = (isPositive: boolean) => {
     const list = isPositive ? positiveStickers : negativeStickers;
     return list[Math.floor(Math.random() * list.length)];
  };

  // Handle Wheel Logic
  useEffect(() => {
    if (state.activeOverlay === 'QUICK_WHEEL') {
       setIsVisible(true);
       if (state.quickWheelWinner) {
          handleSpin(state.quickWheelWinner);
       }
    } else {
       setIsVisible(false);
       setWinner(null);
       setRotation(0);
    }
  }, [state.activeOverlay, state.quickWheelWinner]);

  // Handle Point Awards Logic
  useEffect(() => {
     if (state.lastAction?.type === 'POINTS_AWARDED') {
        const { studentId, amount } = state.lastAction.payload;
        // Show point popup
        setPointPopup({ 
           id: Date.now().toString(), 
           amount, 
           studentId,
           sticker: getRandomSticker(amount > 0)
        });
        
        if (amount > 0) triggerConfetti();
        
        // Auto hide after animation
        setTimeout(() => setPointPopup(null), 3000);
     } else if (state.lastAction?.type === 'MASS_PENALTY') {
        const { amount } = state.lastAction.payload;
        setPenaltyPopup({ id: Date.now().toString(), amount });
        
        // Shake screen logic handled by CSS class on root usually, 
        // but here we just show the popup.
        setTimeout(() => setPenaltyPopup(null), 1500);
     }
  }, [state.lastAction]);

  const handleSpin = (winnerId: string) => {
    const winnerIndex = students.findIndex(s => s.id === winnerId);
    if (winnerIndex === -1) return;

    const segmentAngle = 360 / students.length;
    const randomOffset = Math.floor(Math.random() * (segmentAngle - 2)) - (segmentAngle / 2) + 1;
    const targetRotation = rotation + (360 * 5) + (360 - (winnerIndex * segmentAngle)) + randomOffset;

    setRotation(targetRotation);

    setTimeout(() => {
       setWinner(students[winnerIndex]);
    }, 2000); 
  };

  const getCoordinatesForPercent = (percent: number) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  const getStudent = (id: string) => students.find(s => s.id === id);

  return (
    <div className={`absolute inset-0 z-[70] pointer-events-none ${penaltyPopup ? 'animate-shake' : ''}`}>
       
       {/* 1. Point Popup Layer */}
       {pointPopup && (
          <div className="absolute inset-0 flex items-center justify-center z-[100]">
             <div className="animate-float-up flex flex-col items-center relative">
                
                {/* Encouragement Sticker */}
                <div className={`
                   absolute -top-16 -right-12 rotate-12 px-6 py-2 rounded-xl font-black text-2xl uppercase tracking-widest text-white shadow-lg border-4 border-white animate-bounce-subtle
                   ${pointPopup.amount > 0 ? 'bg-yellow-400' : 'bg-red-500'}
                `}>
                   {pointPopup.sticker}
                </div>

                {/* Avatar Circle */}
                <div className={`
                   w-40 h-40 rounded-full border-8 shadow-2xl flex items-center justify-center bg-white text-8xl relative z-10 mb-4
                   ${pointPopup.amount > 0 ? 'border-green-400' : 'border-red-400'}
                `}>
                   {getStudent(pointPopup.studentId)?.avatar}
                   <div className={`
                      absolute -bottom-4 bg-white px-6 py-1 rounded-full font-bold text-lg text-slate-800 shadow-md border-2
                      ${pointPopup.amount > 0 ? 'border-green-400' : 'border-red-400'}
                   `}>
                      {getStudent(pointPopup.studentId)?.name}
                   </div>
                </div>

                {/* Points Text */}
                <div 
                   className={`text-[10rem] leading-none font-black drop-shadow-[0_8px_0_rgba(0,0,0,0.3)] stroke-black
                   ${pointPopup.amount > 0 ? 'text-yellow-400' : 'text-red-500'}
                   `} 
                   style={{ textShadow: pointPopup.amount > 0 ? '0 0 40px gold' : '0 0 40px red' }}
                >
                   {pointPopup.amount > 0 ? '+' : ''}{pointPopup.amount}
                </div>
             </div>
          </div>
       )}

       {/* 2. Mass Penalty Popup */}
       {penaltyPopup && (
          <div className="absolute inset-0 flex items-center justify-center z-[100]">
             <div className="flex flex-col items-center animate-ping-once">
                <div className="text-[10rem] font-black text-red-500 drop-shadow-[0_4px_0_rgba(0,0,0,0.8)]" style={{ textShadow: '0 0 40px red' }}>
                   -{penaltyPopup.amount}
                </div>
                <div className="text-4xl font-bold text-white bg-red-600 px-8 py-2 rounded-full">
                   TOO LOUD!
                </div>
             </div>
          </div>
       )}

       {/* 3. Quiet Mode Overlay */}
       {state.quietModeActive && (
          <div className="absolute inset-0 z-[80] flex flex-col items-center justify-center bg-red-900/40 backdrop-blur-sm animate-pulse-danger">
             {/* Vignette */}
             <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(220,38,38,0.5)_100%)]"></div>
             
             {/* Hazard Stripes */}
             <div className="absolute top-0 left-0 w-full h-8 bg-warning-stripes"></div>
             <div className="absolute bottom-0 left-0 w-full h-8 bg-warning-stripes"></div>

             <div className="relative z-10 flex flex-col items-center">
                
                {/* Warning Text */}
                <div className="mb-12 text-center animate-bounce-subtle">
                   <div className="flex items-center justify-center gap-4 text-red-500 mb-2">
                      <AlertTriangle size={64} fill="currentColor" className="animate-ping" />
                   </div>
                   <h1 className="text-8xl font-black text-white tracking-tighter drop-shadow-xl uppercase" style={{ textShadow: '0 0 20px red' }}>
                      Silence Required
                   </h1>
                   <p className="text-2xl text-red-200 font-mono tracking-[0.5em] mt-2">CLASSROOM LOCKDOWN</p>
                </div>

                {/* Decibel Gauge */}
                <div className="relative w-[500px] h-[250px] overflow-hidden mb-12">
                   {/* Gauge Arc */}
                   <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[480px] h-[240px] bg-slate-900 rounded-t-full border-[20px] border-b-0 border-slate-700 overflow-hidden">
                      {/* Gradient Fill based on noise */}
                      <div className="absolute bottom-0 left-0 w-full h-full origin-bottom transform transition-transform duration-100" 
                           style={{ 
                              background: 'conic-gradient(from 180deg, #22c55e 0deg, #eab308 90deg, #ef4444 180deg)',
                              opacity: 0.8
                           }}
                      ></div>
                   </div>
                   
                   {/* Ticks */}
                   <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[420px] h-[210px] rounded-t-full border-[2px] border-dashed border-white/20"></div>

                   {/* Needle */}
                   <div className="absolute bottom-0 left-1/2 w-full flex justify-center">
                      <div 
                         className="w-2 h-[220px] bg-white origin-bottom rounded-full shadow-xl transition-transform duration-300 ease-out"
                         style={{ transform: `rotate(${(state.noiseLevel / 100) * 180 - 90}deg)` }}
                      >
                         <div className="w-6 h-6 bg-red-500 rounded-full absolute -top-2 -left-2 shadow-lg"></div>
                      </div>
                   </div>
                   
                   {/* Base Hub */}
                   <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-16 bg-slate-800 rounded-t-full border-t-4 border-slate-600 flex items-center justify-center">
                      <div className="text-4xl font-mono font-bold text-white mt-4">{state.noiseLevel}dB</div>
                   </div>
                </div>

             </div>
          </div>
       )}

       {/* 4. Wheel Overlay Layer */}
       {isVisible && (
          <div className="absolute inset-0 flex items-end justify-center pb-12 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300">
             <div className="relative z-80 bg-white p-6 rounded-[3rem] shadow-2xl border-4 border-white/50 animate-slide-up flex gap-8 items-center max-w-4xl mx-auto">
                
                {winner ? (
                   <div className="flex items-center gap-8 px-8 py-4 animate-scale-in">
                      <div className="w-48 h-48 bg-yellow-100 rounded-full border-8 border-yellow-400 shadow-lg flex items-center justify-center text-8xl animate-bounce-subtle">
                         {winner.avatar}
                      </div>
                      <div>
                         <div className="text-slate-400 font-bold uppercase tracking-widest text-lg mb-2">Selected Student</div>
                         <h2 className="text-7xl font-black text-slate-800 leading-none">{winner.name}</h2>
                      </div>
                      <div className="h-32 w-px bg-slate-200 mx-4"></div>
                      <div className="flex flex-col items-center gap-2">
                         <div className="text-6xl font-black text-yellow-500 animate-pulse">+?</div>
                         <div className="text-slate-400 font-bold uppercase tracking-wider text-sm">XP Waiting...</div>
                      </div>
                   </div>
                ) : (
                   <div className="flex items-center gap-8">
                      <div className="relative w-48 h-48">
                         <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20 filter drop-shadow-md">
                            <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[20px] border-t-slate-800"></div>
                         </div>
                         <div 
                            className="w-full h-full rounded-full border-4 border-white shadow-lg overflow-hidden transition-transform cubic-bezier(0.2, 0.8, 0.2, 1)"
                            style={{ 
                               transform: `rotate(${rotation}deg)`,
                               transitionDuration: '2000ms'
                            }}
                         >
                            <svg viewBox="-1 -1 2 2" style={{ transform: 'rotate(-90deg)' }}>
                              {students.map((student, i) => {
                                const sliceSize = 1 / students.length;
                                const startAngle = i * sliceSize;
                                const endAngle = (i + 1) * sliceSize;
                                const [startX, startY] = getCoordinatesForPercent(startAngle);
                                const [endX, endY] = getCoordinatesForPercent(endAngle);
                                const largeArcFlag = sliceSize > 0.5 ? 1 : 0;
                                const pathData = `M 0 0 L ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY} L 0 0`;
                                return <path key={student.id} d={pathData} fill={colors[i % colors.length]} stroke="white" strokeWidth="0.05" />;
                              })}
                            </svg>
                         </div>
                         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-md z-10 border-2 border-slate-100">
                            <RotateCw size={20} className="text-slate-400 animate-spin" />
                         </div>
                      </div>
                      
                      <div className="px-4">
                         <h3 className="text-4xl font-bold text-slate-800 mb-2">Picking...</h3>
                         <div className="h-3 w-48 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 w-full animate-shimmer"></div>
                         </div>
                      </div>
                   </div>
                )}
             </div>
          </div>
       )}

       <style>{`
          @keyframes float-up {
             0% { transform: translateY(20px) scale(0.5); opacity: 0; }
             20% { transform: translateY(0) scale(1.2); opacity: 1; }
             80% { transform: translateY(-50px) scale(1); opacity: 1; }
             100% { transform: translateY(-100px) scale(0.8); opacity: 0; }
          }
          .animate-float-up { animation: float-up 3s ease-out forwards; }
          
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-10px); }
            75% { transform: translateX(10px); }
          }
          .animate-shake { animation: shake 0.2s ease-in-out infinite; }

          @keyframes pulse-danger {
             0%, 100% { background-color: rgba(127, 29, 29, 0.4); }
             50% { background-color: rgba(185, 28, 28, 0.6); }
          }
          .animate-pulse-danger { animation: pulse-danger 2s infinite; }

          .bg-warning-stripes {
             background: repeating-linear-gradient(
                45deg,
                #eab308,
                #eab308 20px,
                #000 20px,
                #000 40px
             );
          }
          
          @keyframes ping-once {
             0% { transform: scale(0.5); opacity: 0; }
             50% { transform: scale(1.2); opacity: 1; }
             100% { transform: scale(1); opacity: 0; }
          }
          .animate-ping-once { animation: ping-once 1s ease-out forwards; }
       `}</style>
    </div>
  );
};

export default BoardOverlayLayer;
