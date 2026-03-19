
import React, { useState, useEffect } from 'react';
import { Star, Shield, Sword, RotateCw } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

const BoardGameArena = ({ data }: { data: any }) => {
  const { state, triggerAction } = useSession(); 
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winner, setWinner] = useState<any>(null);

  const students = state.students;
  const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  // Listen for remote events
  useEffect(() => {
    if (state.lastAction?.type === 'SPIN_WHEEL' && !isSpinning) {
      // Use targetId provided by SessionContext (acting as Server)
      const targetId = state.lastAction.payload?.targetId;
      if (targetId) {
         handleSpinToTarget(targetId);
      }
    } else if (state.lastAction?.type === 'GAME_WIN') {
      const winnerId = state.lastAction.payload?.winnerId;
      if (winnerId) {
        const selectedStudent = students.find(s => s.id === winnerId);
        if (selectedStudent) {
          setIsSpinning(false);
          setWinner(selectedStudent);
        }
      }
    } else if (state.lastAction?.type === 'RESET_ROUND' || state.lastAction?.type === 'RESET_WHEEL') {
      setWinner(null);
      setRotation(0);
      setIsSpinning(false);
    }
  }, [state.lastAction]);

  const handleSpinToTarget = (targetId: string) => {
    if (isSpinning) return;
    setWinner(null);
    setIsSpinning(true);

    const winnerIndex = students.findIndex(s => s.id === targetId);
    // Fallback
    const safeIndex = winnerIndex >= 0 ? winnerIndex : 0;
    const selectedStudent = students[safeIndex];

    // Calculate rotation to land on this student
    const sliceAngle = 360 / students.length;
    
    // We want the wheel to end such that the winning segment is at -90deg (top).
    // Standard rotation 0 is at 3 o'clock.
    const startAngle = safeIndex * sliceAngle;
    const centerAngle = startAngle + (sliceAngle / 2);
    const targetBase = 270 - centerAngle;
    
    // Add extra spins
    const extraSpins = 360 * (5 + Math.floor(Math.random() * 3));
    
    // Calculate final rotation
    // Ensure we start from current rotation to avoid jumping
    // We need (current + extra + delta) % 360 == targetBase
    let nextRotation = rotation + extraSpins;
    const currentMod = nextRotation % 360;
    const diff = targetBase - currentMod;
    
    // Add jitter for realism
    const randomOffset = (Math.random() - 0.5) * (sliceAngle * 0.8);
    nextRotation += diff + randomOffset;

    setRotation(nextRotation);
    
    // GAME_WIN is now triggered by SessionContext after 4000ms
  };

  // SVG Path Generator for Slices
  const getCoordinatesForPercent = (percent: number) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <div className="h-full bg-slate-900 flex relative overflow-hidden font-display">
       {/* Background Grid */}
       <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

       {/* Left Team (Red) */}
       <div className="w-80 h-full bg-gradient-to-r from-red-900/50 to-transparent border-r border-white/5 flex flex-col p-8 pt-24 relative z-10">
          <div className="absolute top-0 left-0 w-full h-2 bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]"></div>
          <div className="text-red-400 mb-2 font-bold uppercase tracking-widest flex items-center gap-2">
             <Sword size={20} /> Team Red
          </div>
          <div className="text-8xl font-black text-white mb-8 tracking-tighter">
             {state.students.filter(s => s.team === 'red').reduce((acc, s) => acc + s.points, 0)}
          </div>
          
          <div className="space-y-4">
             {state.students.filter(s => s.team === 'red').map(s => (
               <div key={s.id} className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="text-2xl">{s.avatar}</div>
                  <div className="text-white font-bold text-lg">{s.name}</div>
                  <div className="ml-auto text-red-400 font-mono font-bold">{s.points}</div>
               </div>
             ))}
          </div>
       </div>

       {/* Center Stage (Wheel) */}
       <div className="flex-1 flex flex-col items-center justify-center relative z-20">
          <div className="mb-12 text-center">
             <h2 className="text-6xl font-fun text-white mb-4 drop-shadow-[0_4px_0_rgba(0,0,0,0.5)]">
               <span className="text-duo-yellow">Wheel</span> of Destiny
             </h2>
             <div className="inline-block bg-white/10 px-6 py-2 rounded-full text-white/80 backdrop-blur border border-white/10">
               Next Challenge: <span className="font-bold text-white">Speed Translate</span>
             </div>
          </div>

          <div className="relative">
             {/* Pointer */}
             <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-16 h-16 z-30 filter drop-shadow-xl">
               <div className="w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-t-[40px] border-t-white"></div>
             </div>

             {/* The Wheel */}
             <div 
               className="w-[600px] h-[600px] rounded-full border-8 border-slate-800 shadow-2xl relative transition-transform cubic-bezier(0.2, 0.8, 0.2, 1)"
               style={{ 
                  transform: `rotate(${rotation}deg)`,
                  transitionDuration: '4000ms'
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

                   return (
                     <g key={student.id}>
                        <path d={pathData} fill={colors[i % colors.length]} />
                        {/* Text Label - rotated to center of slice */}
                        <text 
                           x={0.6} 
                           y={0} 
                           fill="white" 
                           fontSize="0.08" 
                           fontWeight="bold" 
                           textAnchor="middle" 
                           transform={`rotate(${(startAngle + endAngle) / 2 * 360})`}
                           style={{ textTransform: 'uppercase' }}
                        >
                           {student.name}
                        </text>
                     </g>
                   );
                 })}
               </svg>

               {/* Hub */}
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-xl z-20 border-4 border-slate-200">
                  <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center">
                     <Star className="text-yellow-400 fill-yellow-400 animate-pulse" size={32} />
                  </div>
               </div>
             </div>
          </div>

          {!isSpinning && !winner && (
             <div className="mt-12 animate-bounce">
                <span className="text-white/60 font-mono text-xl">Waiting for Teacher to Spin...</span>
             </div>
          )}
       </div>

       {/* Right Team (Blue) */}
       <div className="w-80 h-full bg-gradient-to-l from-blue-900/50 to-transparent border-l border-white/5 flex flex-col p-8 pt-24 relative z-10 text-right">
          <div className="absolute top-0 right-0 w-full h-2 bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)]"></div>
          <div className="text-blue-400 mb-2 font-bold uppercase tracking-widest flex items-center justify-end gap-2">
             Team Blue <Shield size={20} />
          </div>
          <div className="text-8xl font-black text-white mb-8 tracking-tighter">
             {state.students.filter(s => s.team === 'blue').reduce((acc, s) => acc + s.points, 0)}
          </div>
          
          <div className="space-y-4">
             {state.students.filter(s => s.team === 'blue').map(s => (
               <div key={s.id} className="flex flex-row-reverse items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="text-2xl">{s.avatar}</div>
                  <div className="text-white font-bold text-lg">{s.name}</div>
                  <div className="mr-auto text-blue-400 font-mono font-bold">{s.points}</div>
               </div>
             ))}
          </div>
       </div>

       {/* Winner Overlay */}
       {winner && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center animate-fade-in">
             <div className="bg-gradient-to-b from-yellow-400 to-orange-500 p-1 rounded-[3rem] shadow-2xl animate-bounce-subtle">
               <div className="bg-slate-900 rounded-[2.8rem] p-16 flex flex-col items-center text-center border-4 border-white/20">
                  <div className="text-yellow-400 text-3xl font-bold uppercase tracking-[0.5em] mb-8">Winner!</div>
                  <div className="w-64 h-64 bg-white rounded-full mb-8 flex items-center justify-center text-9xl border-8 border-white/20 shadow-[0_0_60px_rgba(255,255,255,0.3)]">
                     {winner.avatar}
                  </div>
                  <h2 className="text-9xl font-fun text-white mb-4">{winner.name}</h2>
                  <div className="text-4xl text-white/60 font-mono">+50 XP Bonus</div>
               </div>
             </div>
          </div>
       )}
    </div>
  );
};

export default BoardGameArena;
