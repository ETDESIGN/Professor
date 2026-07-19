// BoardWheelOfDestiny — conic-gradient student picker wheel (Hermes 07).
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSession } from '../../../store/SessionContext';

const COLORS = ['#8B5CF6','#D946EF','#EC4899','#F43F5E','#EF4444','#F97316','#F59E0B','#FBBF24','#22C55E','#14B8A6','#06B6D4','#3B82F6'];

const BoardWheelOfDestiny = ({ data }: { data: any }) => {
  const { state, triggerConfetti } = useSession();
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState<any>(null);

  const students = useMemo(() => state.students || [], [state.students]);
  const segAngle = 360 / Math.max(1, students.length);

  const conic = useMemo(() => {
    if (!students.length) return '#333';
    return students.map((_: any, i: number) => {
      const c = COLORS[i % COLORS.length];
      return `${c} ${i * segAngle}deg ${(i + 1) * segAngle}deg`;
    }).join(', ');
  }, [students, segAngle]);

  useEffect(() => {
    if (state.lastAction?.type === 'SPIN_WHEEL' && !isSpinning) {
      const tid = state.lastAction.payload?.targetId;
      if (tid) { setWinner(null); setIsSpinning(true);
        const idx = Math.max(0, students.findIndex(s => s.id === tid));
        const center = idx * segAngle + segAngle / 2;
        setRotation(360 * 5 + (360 - center));
      }
    } else if (state.lastAction?.type === 'GAME_WIN') {
      const wid = state.lastAction.payload?.winnerId || state.lastAction.payload?.studentId;
      const sel = students.find(s => s.id === wid);
      if (sel) { setIsSpinning(false); setWinner(sel); triggerConfetti(); }
    } else if (state.lastAction?.type === 'RESET_WHEEL' || state.lastAction?.type === 'RESET_GAME') {
      setWinner(null); setRotation(0);
    }
    // eslint-disable-next-line
  }, [state.lastAction]);

  if (!students.length) return <div className="h-full flex items-center justify-center text-slate-400"><p className="font-display text-3xl">Waiting for students...</p></div>;

  const size = Math.min(420, 300 + students.length * 15);

  return (
    <div className="h-full flex flex-col items-center justify-center p-4 relative">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 55%,rgba(168,85,247,.15),transparent 55%)' }} />
      <h2 className={`font-display text-4xl font-bold mb-3 relative z-10 ${winner ? 'text-amber-300' : 'text-purple-300'}`}>
        {winner ? `${winner.name} ${winner.avatar || ''}` : 'Who will be next?'}
      </h2>
      <div className="relative z-10 flex flex-col items-center">
        <svg width="36" height="36" viewBox="0 0 56 56" className="relative z-20 -mb-3" style={{ filter: 'drop-shadow(0 4px 8px rgba(168,85,247,.6))' }}>
          <polygon points="28,52 4,4 52,4" fill="#D8B4FE" stroke="#FFF" strokeWidth="2" />
        </svg>
        <motion.div animate={{ rotate: rotation }} transition={{ duration: 4, ease: [0.15, 0, 0.2, 1] }}
          onAnimationComplete={() => isSpinning && setIsSpinning(false)}
          style={{ filter: 'drop-shadow(0 0 30px rgba(168,85,247,.3))' }}>
          <div className="rounded-full relative" style={{ width: size, height: size, background: `conic-gradient(${conic})` }}>
            <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 w-full h-full">
              {students.map((_: any, i: number) => {
                const a = (i * segAngle - 90) * Math.PI / 180;
                const c = size / 2, r = size / 2;
                return <line key={i} x1={c} y1={c} x2={c + Math.cos(a) * r} y2={c + Math.sin(a) * r} stroke="rgba(255,255,255,.2)" strokeWidth="2" />;
              })}
              <circle cx={size/2} cy={size/2} r={size/2-8} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="3" />
              <circle cx={size/2} cy={size/2} r="70" fill="rgba(15,23,42,.8)" stroke="rgba(255,255,255,.1)" strokeWidth="2" />
            </svg>
            {students.map((s: any, i: number) => (
              <div key={s.id} className="absolute font-display text-lg font-bold text-white whitespace-nowrap"
                style={{ left: '50%', top: '50%', transform: `translate(-50%,-50%) rotate(${i * segAngle + segAngle/2}deg) translateY(-${size/2-50}px)`, textShadow: '0 2px 4px rgba(0,0,0,.5)' }}>
                {s.avatar || '👤'} {s.name?.split(' ')[0]}
              </div>
            ))}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-purple-600 border-4 border-purple-300 flex items-center justify-center text-xl">🎡</div>
          </div>
        </motion.div>
      </div>
      {/* Fairness roster */}
      <div className="mt-4 flex gap-1.5 relative z-10">
        {students.map((s: any) => (
          <div key={s.id} className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${state.turnsThisExercise?.includes(s.id) ? 'bg-green-500/30 border border-green-400/40' : 'bg-white/5 border border-white/10 opacity-50'}`}>
            {s.avatar || '👤'}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BoardWheelOfDestiny;
