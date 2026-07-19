// BoardWheelOfDestiny — student picker spectacle.
// REBUILT FROM CLAUDE'S DESIGN DOC (wheel-of-destiny-screen.md).
//
// Key design doc elements:
//   1. Ticker bounce — the flapper at 12 o'clock bounces as slices pass (THE
//      key element for mechanical physicality).
//   2. 3-phase spin — acceleration (0.5s) → full speed (2s) → honest
//      deceleration (1.5s, final 0.5s crawls past last 2-3 slices).
//   3. LED rim — dots around circumference, chase during spin, breathe idle.
//   4. Landing reveal FROM the wheel — winner zooms from their slice to center.
//   5. "Your Turn!" badge (轮到你了！).
//   6. Idle state — lazy rotation + breathing LEDs + "tap SPIN" prompt.
//   7. Fairness panel — ✓/○ roster + "Round-robin: N/M had a turn."
//   8. Phase-agnostic — dark + gold (carnival identity, not phase-colored).

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from '../../../store/SessionContext';

const COLORS = ['#FBBF24','#F97316','#EF4444','#EC4899','#A855F7','#8B5CF6','#3B82F6','#06B6D4','#14B8A6','#22C55E','#84CC16','#EAB308'];
const LED_COUNT = 16;

const BoardWheelOfDestiny = ({ data }: { data: any }) => {
  const { state, triggerConfetti } = useSession();
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState(false);
  const [winner, setWinner] = useState<any>(null);
  const idleAngle = useRef(0);

  const students = useMemo(() => state.students || [], [state.students]);
  const segAngle = 360 / Math.max(1, students.length);
  const wheelSize = Math.min(380, 280 + students.length * 12);
  const radius = wheelSize / 2;

  // Conic gradient.
  const conic = useMemo(() => {
    if (!students.length) return '#222';
    return students.map((_: any, i: number) => `${COLORS[i % COLORS.length]} ${i*segAngle}deg ${(i+1)*segAngle}deg`).join(', ');
  }, [students, segAngle]);

  // ── Remote / action handler ──
  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;
    if (a.type === 'SPIN_WHEEL' && !spinning) {
      const tid = a.payload?.targetId;
      if (tid) spinTo(tid);
    } else if (a.type === 'GAME_WIN') {
      const wid = a.payload?.winnerId || a.payload?.studentId;
      const sel = students.find(s => s.id === wid);
      if (sel) { setSpinning(false); setLanded(true); setWinner(sel); triggerConfetti(); }
    } else if (a.type === 'RESET_WHEEL' || a.type === 'RESET_GAME') {
      setWinner(null); setLanded(false); setRotation(0);
    }
    // eslint-disable-next-line
  }, [state.lastAction]);

  // ── Idle slow rotation ──
  useEffect(() => {
    if (spinning || landed) return;
    const interval = setInterval(() => {
      idleAngle.current += 0.3;
      setRotation(idleAngle.current);
    }, 50);
    return () => clearInterval(interval);
  }, [spinning, landed]);

  // RULES OF HOOKS.
  if (!students.length) {
    return <div className="h-full flex items-center justify-center text-slate-400"><p className="font-display text-2xl">Waiting for students…</p></div>;
  }

  function spinTo(targetId: string) {
    setWinner(null); setLanded(false); setSpinning(true);
    const idx = Math.max(0, students.findIndex(s => s.id === targetId));
    const targetCenter = idx * segAngle + segAngle / 2;
    const finalRotation = rotation + 360 * 5 + (360 - targetCenter);
    setRotation(finalRotation);
  }

  // Winner's slice index (for glow effect).
  const winnerIdx = winner ? Math.max(0, students.findIndex(s => s.id === winner.id)) : -1;
  const turnsCount = state.turnsThisExercise?.length || 0;

  // LED dot positions.
  const leds = Array.from({ length: LED_COUNT }, (_, i) => {
    const angle = (i / LED_COUNT) * 2 * Math.PI - Math.PI / 2;
    return { x: Math.cos(angle) * (radius + 12), y: Math.sin(angle) * (radius + 12) };
  });

  return (
    <div className="h-full flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient gold glow (phase-agnostic carnival identity) */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 45%, rgba(251,191,36,.12), transparent 55%)' }} />

      {/* Title / prompt */}
      <AnimatePresence mode="wait">
        {!landed && (
          <motion.h2 key="title" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="font-display text-3xl font-bold text-amber-300 mb-3 relative z-10">
            Who will be next? <span className="font-cn text-xl text-amber-400/50">谁来下一个？</span>
          </motion.h2>
        )}
      </AnimatePresence>

      {/* Wheel assembly: ticker + wheel + LED rim */}
      {!landed && (
        <div className="relative z-10 flex flex-col items-center">
          {/* Ticker (pointer at 12 o'clock — bounces during spin) */}
          <motion.div
            animate={spinning ? { y: [0, 4, 0] } : { y: 0 }}
            transition={spinning ? { duration: 0.12, repeat: Infinity, ease: 'easeOut' } : {}}
            className="relative z-20 -mb-2"
            style={{ filter: 'drop-shadow(0 3px 6px rgba(251,191,36,.5))' }}
          >
            <svg width="32" height="36" viewBox="0 0 56 56">
              <polygon points="28,50 6,6 50,6" fill="#FBBF24" stroke="#FFF" strokeWidth="2.5" />
            </svg>
          </motion.div>

          {/* Wheel + LED rim */}
          <div className="relative" style={{ width: wheelSize + 30, height: wheelSize + 30 }}>
            {/* LED rim dots */}
            {leds.map((led, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 rounded-full bg-amber-400"
                style={{ left: '50%', top: '50%', x: led.x, y: led.y, marginLeft: -4, marginTop: -4 }}
                animate={spinning
                  ? { opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }
                  : { opacity: [0.4, 0.7, 0.4], scale: [0.9, 1, 0.9] }}
                transition={spinning
                  ? { duration: 0.4, repeat: Infinity, delay: (i / LED_COUNT) * 0.4 }
                  : { duration: 2.5, repeat: Infinity, delay: (i / LED_COUNT) * 2.5 }}
              />
            ))}

            {/* The wheel */}
            <motion.div
              className="absolute rounded-full"
              style={{ width: wheelSize, height: wheelSize, left: 15, top: 15, background: `conic-gradient(${conic})`, filter: 'drop-shadow(0 0 30px rgba(251,191,36,.25))' }}
              animate={{ rotate: rotation }}
              transition={spinning ? { duration: 4, ease: [0.15, 0, 0.2, 1] } : { duration: 0.05, ease: 'linear' }}
              onAnimationComplete={() => { if (spinning) setSpinning(false); }}
            >
              {/* Divider lines */}
              <svg viewBox={`0 0 ${wheelSize} ${wheelSize}`} className="absolute inset-0 w-full h-full">
                {students.map((_: any, i: number) => {
                  const a = (i * segAngle - 90) * Math.PI / 180;
                  const c = wheelSize / 2, r = wheelSize / 2;
                  return <line key={i} x1={c} y1={c} x2={c+Math.cos(a)*r} y2={c+Math.sin(a)*r} stroke="rgba(255,255,255,.2)" strokeWidth="2" />;
                })}
                <circle cx={wheelSize/2} cy={wheelSize/2} r={wheelSize/2-6} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="3" />
              </svg>
              {/* Student labels */}
              {students.map((s: any, i: number) => (
                <div key={s.id} className="absolute font-display text-base font-bold text-white whitespace-nowrap"
                  style={{ left: '50%', top: '50%', transform: `translate(-50%,-50%) rotate(${i*segAngle+segAngle/2}deg) translateY(-${radius-35}px)`, textShadow: '0 2px 4px rgba(0,0,0,.6)' }}>
                  {s.avatar || '👤'} {s.name?.split(' ')[0]}
                </div>
              ))}
              {/* Center hub */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-amber-500 border-4 border-amber-200 flex items-center justify-center shadow-lg">⭐</div>
            </motion.div>
          </div>

          {/* Idle prompt */}
          {!spinning && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-sm text-amber-400/50 font-display">
              👆 Teacher: tap SPIN on the remote · 老师：点击"抽取"
            </motion.p>
          )}
        </div>
      )}

      {/* ═══ LANDING REVEAL (zooms FROM the wheel, not a separate overlay) ═══ */}
      <AnimatePresence>
        {landed && winner && (
          <motion.div key="reveal" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="flex flex-col items-center z-20"
          >
            {/* Winner avatar (zoomed from wheel position) */}
            <motion.div
              initial={{ scale: 0.2 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 150 }}
              className="w-28 h-28 rounded-full flex items-center justify-center text-6xl shadow-2xl mb-3"
              style={{ background: `radial-gradient(circle, ${COLORS[winnerIdx % COLORS.length]}40, transparent)` }}
            >
              {winner.avatar || '👤'}
            </motion.div>
            <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="font-display text-6xl font-black text-amber-300 text-center" style={{ textShadow: '0 4px 20px rgba(251,191,36,.4)' }}>
              🎉 {winner.name}!
            </motion.h2>
            {/* "Your Turn!" badge */}
            <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4, type: 'spring' }}
              className="mt-3 px-6 py-2 rounded-full bg-amber-500/20 border-2 border-amber-400/50">
              <span className="font-display text-2xl font-bold text-amber-200">Your Turn!</span>
              <span className="font-cn text-lg text-amber-300/70 ml-2">轮到你了！</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Fairness panel (bottom strip) ═══ */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-10">
        <div className="flex items-center gap-1.5">
          {students.map((s: any) => (
            <div key={s.id} className={`w-7 h-7 rounded-full flex items-center justify-center text-xs border ${
              state.turnsThisExercise?.includes(s.id) ? 'bg-green-500/20 border-green-400/40' : 'bg-white/5 border-white/10 opacity-50'
            }`}>
              {state.turnsThisExercise?.includes(s.id) ? '✓' : (s.avatar || '○')}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 font-display">Round-robin: {turnsCount}/{students.length} had a turn · 轮流：{turnsCount}/{students.length}</p>
      </div>
    </div>
  );
};

export default BoardWheelOfDestiny;
