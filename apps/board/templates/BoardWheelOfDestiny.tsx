
import React, { useState, useEffect, useMemo } from 'react';
import { RotateCw, Users, Trophy, Settings, Volume2, MapPin } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

const BoardWheelOfDestiny = ({ data }: { data: any }) => {
  const { state, triggerAction, triggerConfetti } = useSession();
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winner, setWinner] = useState<any>(null);

  // Filter valid students and ensure we have data
  const students = useMemo(() => state.students.length > 0 ? state.students : [
    { id: '1', name: 'Student 1', avatar: '🙂' },
    { id: '2', name: 'Student 2', avatar: '😎' },
    { id: '3', name: 'Student 3', avatar: '🤠' }
  ], [state.students]);

  const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  // Listen for remote events
  useEffect(() => {
    if (state.lastAction?.type === 'SPIN_WHEEL' && !isSpinning) {
      // The payload MUST contain the targetId decided by the SessionContext engine
      const targetId = state.lastAction.payload?.targetId;
      if (targetId) {
         handleSpinToTarget(targetId);
      }
    } else if (state.lastAction?.type === 'GAME_WIN') {
      const winnerId = state.lastAction.payload?.winnerId || state.lastAction.payload?.studentId;
      if (winnerId) {
        const selectedStudent = students.find(s => s.id === winnerId);
        if (selectedStudent) {
          setIsSpinning(false);
          setWinner(selectedStudent);
          triggerConfetti();
        }
      }
    } else if (state.lastAction?.type === 'RESET_WHEEL') {
      setWinner(null);
    }
  }, [state.lastAction]);

  const handleSpinToTarget = (targetId: string) => {
    if (isSpinning) return;
    setWinner(null);
    setIsSpinning(true);

    // 1. Find the target index
    const winnerIndex = students.findIndex(s => s.id === targetId);
    // Fallback if ID not found (safety)
    const safeIndex = winnerIndex >= 0 ? winnerIndex : 0;
    const selectedStudent = students[safeIndex];

    // 2. Calculate the math to land on this student
    // The pointer is at -90deg (top). 
    // We want the CENTER of the winner's slice to align with -90deg.
    
    const sliceAngle = 360 / students.length;
    
    // The visual angle where the slice STARTS (assuming 0 is 3 o'clock in SVG)
    const sliceStartAngle = safeIndex * sliceAngle;
    const sliceCenterAngle = sliceStartAngle + (sliceAngle / 2);

    // Target Rotation Logic:
    // We want to rotate the CONTAINER so that 'sliceCenterAngle' ends up at -90 (or 270).
    const targetBase = 270 - sliceCenterAngle;
    
    // Add multiple full spins (5 to 8)
    const extraSpins = 360 * (5 + Math.floor(Math.random() * 3));
    
    // Calculate the delta needed from current rotation
    // We want to land on (targetBase + extraSpins), but properly offset from current `rotation`
    let nextRotation = rotation + extraSpins;
    
    // Adjust nextRotation so it aligns with targetBase % 360
    const currentMod = nextRotation % 360;
    const diff = targetBase - currentMod;
    
    // Apply the difference so the final modulo matches targetBase
    nextRotation += diff;

    // Add a tiny random jitter within the slice (safely inside 80% of the slice) so it doesn't always land dead center
    const jitter = (Math.random() - 0.5) * (sliceAngle * 0.8);
    nextRotation += jitter;

    // 3. Execute Spin
    setRotation(nextRotation);

    // 4. Wait for animation to finish
    // GAME_WIN is now triggered by SessionContext after 4000ms
  };

  // Helper for SVG Arcs
  const getCoordinatesForPercent = (percent: number) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <div className="h-full bg-slate-900 flex overflow-hidden font-display relative">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(#ffffff 2px, transparent 2px)', backgroundSize: '30px 30px' }}></div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 p-8">
         <div className="mb-8 text-center">
            <h1 className="text-6xl font-fun text-white mb-2 drop-shadow-lg flex items-center gap-4 justify-center">
               <RotateCw className={`text-duo-green ${isSpinning ? 'animate-spin' : ''}`} size={64} />
               Wheel of Destiny
            </h1>
            <p className="text-slate-400 text-xl font-bold uppercase tracking-widest">Random Student Selector</p>
         </div>

         {/* Wheel Container */}
         <div className="relative">
            {/* Pointer (The Ticker) */}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-30 drop-shadow-2xl">
               {/* Rigid body of pointer */}
               <div className="w-4 h-8 bg-slate-200 mx-auto rounded-t-lg"></div>
               {/* Flapper */}
               <div className={`w-0 h-0 border-l-[25px] border-l-transparent border-r-[25px] border-r-transparent border-t-[50px] border-t-red-500 origin-top ${isSpinning ? 'animate-ticker' : ''}`}></div>
            </div>

            {/* The Wheel */}
            <div 
               className="w-[600px] h-[600px] rounded-full border-[12px] border-slate-800 shadow-2xl relative overflow-hidden transition-transform cubic-bezier(0.15, 0, 0.20, 1)"
               style={{ 
                  transform: `rotate(${rotation}deg)`,
                  transitionDuration: '4000ms'
               }}
            >
               {/* SVG Layer for Slices */}
               <svg viewBox="-1 -1 2 2" className="w-full h-full transform -rotate-0">
                 {students.map((student, i) => {
                   const count = students.length;
                   const sliceSize = 1 / count;
                   const startAngle = i * sliceSize;
                   const endAngle = (i + 1) * sliceSize;
                   
                   const [startX, startY] = getCoordinatesForPercent(startAngle);
                   const [endX, endY] = getCoordinatesForPercent(endAngle);
                   
                   const largeArcFlag = sliceSize > 0.5 ? 1 : 0;
                   const pathData = `M 0 0 L ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY} L 0 0`;

                   // Calculate mid-angle for text rotation
                   const midAngle = startAngle + (sliceSize / 2);
                   const midDegree = midAngle * 360;

                   return (
                     <g key={student.id}>
                        <path d={pathData} fill={colors[i % colors.length]} stroke="white" strokeWidth="0.01" />
                        
                        {/* Text Group - Pushed out to edge */}
                        <g transform={`rotate(${midDegree}) translate(0.6, 0)`}>
                           <text 
                              x="0" 
                              y="0" 
                              fill="white" 
                              fontSize="0.08" 
                              fontWeight="bold" 
                              textAnchor="middle" 
                              alignmentBaseline="middle"
                              transform="rotate(90)" /* Rotate text to be perpendicular to radius */
                              style={{ textTransform: 'uppercase', textShadow: '0px 2px 2px rgba(0,0,0,0.3)' }}
                           >
                              {student.name}
                           </text>
                        </g>
                     </g>
                   );
                 })}
               </svg>

               {/* Pegs Layer (Visual dots around the rim) */}
               {students.map((_, i) => (
                  <div 
                     key={i}
                     className="absolute w-3 h-3 bg-white rounded-full shadow-md z-10"
                     style={{
                        top: '50%',
                        left: '50%',
                        transform: `rotate(${i * (360 / students.length)}deg) translate(280px) rotate(-${i * (360 / students.length)}deg)`
                     }}
                  ></div>
               ))}
               
               {/* Center Hub */}
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 bg-white rounded-full flex items-center justify-center shadow-xl z-20 border-8 border-slate-200">
                  <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center">
                     <StarIcon className="text-yellow-400" size={40} fill="currentColor" />
                  </div>
               </div>
            </div>
         </div>

         {/* Hint */}
         {!isSpinning && !winner && (
            <div className="mt-12 bg-white/10 border border-white/20 px-8 py-4 rounded-full animate-bounce">
               <span className="text-white font-bold text-lg">Waiting for Teacher to Spin...</span>
            </div>
         )}
      </div>

      {/* Side Panel (Class List) */}
      <div className="w-80 bg-slate-800 border-l border-white/10 flex flex-col relative z-20 shadow-2xl">
         <div className="p-6 border-b border-white/10 flex justify-between items-center">
            <h2 className="text-white font-bold text-xl flex items-center gap-3">
               <Users className="text-duo-blue" /> Class List
            </h2>
            <div className="flex gap-2">
               <button className="p-2 bg-white/5 rounded-lg text-white/60 hover:text-white"><Volume2 size={20} /></button>
               <button className="p-2 bg-white/5 rounded-lg text-white/60 hover:text-white"><Settings size={20} /></button>
            </div>
         </div>
         <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {students.map((student) => (
               <div key={student.id} className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center text-xl">
                     {student.avatar}
                  </div>
                  <div className="font-bold text-white">{student.name}</div>
                  {student.id === winner?.id && (
                     <div className="ml-auto text-yellow-400 animate-pulse">
                        <Trophy size={20} />
                     </div>
                  )}
               </div>
            ))}
         </div>
      </div>

      {/* Winner Modal Overlay */}
      {winner && (
         <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
            <div className="relative transform animate-scale-in">
               {/* Radiating Glow */}
               <div className="absolute inset-0 bg-yellow-500 blur-[100px] opacity-20 animate-pulse"></div>
               
               <div className="bg-gradient-to-b from-yellow-400 to-orange-600 p-1.5 rounded-[3rem] shadow-2xl max-w-2xl w-full mx-4">
                  <div className="bg-slate-900 rounded-[2.8rem] p-16 flex flex-col items-center text-center border-4 border-white/10 relative overflow-hidden">
                     
                     {/* Background Beams */}
                     <div className="absolute inset-0 opacity-10 animate-spin-slow" style={{ backgroundImage: 'conic-gradient(from 0deg, transparent 0 20deg, white 20deg 40deg, transparent 40deg 360deg)' }}></div>

                     <div className="relative z-10">
                        <div className="text-yellow-300 font-bold uppercase tracking-[0.5em] mb-8 text-xl text-shadow">The Chosen One</div>
                        
                        <div className="w-64 h-64 bg-white rounded-full mb-8 flex items-center justify-center text-9xl border-8 border-white/20 shadow-[0_0_60px_rgba(255,255,255,0.3)] animate-bounce-subtle">
                           {winner.avatar}
                        </div>
                        
                        <h2 className="text-8xl font-fun text-white mb-4 drop-shadow-md">{winner.name}</h2>
                        
                        <div className="flex gap-4 justify-center mt-8">
                           <div className="bg-white/10 backdrop-blur px-6 py-2 rounded-full border border-white/20 text-white font-mono text-xl">
                              +50 XP
                           </div>
                           <div className="bg-white/10 backdrop-blur px-6 py-2 rounded-full border border-white/20 text-white font-mono text-xl">
                              Turn Active
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      )}

      <style>{`
         @keyframes ticker {
            0% { transform: rotate(0deg); }
            25% { transform: rotate(-20deg); }
            50% { transform: rotate(0deg); }
            75% { transform: rotate(-10deg); }
            100% { transform: rotate(0deg); }
         }
         .animate-ticker {
            animation: ticker 0.1s infinite;
         }
         .text-shadow {
            text-shadow: 0 4px 0 rgba(0,0,0,0.5);
         }
         .animate-spin-slow {
            animation: spin 20s linear infinite;
         }
         @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
         }
      `}</style>
    </div>
  );
};

const StarIcon = (props: any) => (
   <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
);

export default BoardWheelOfDestiny;
