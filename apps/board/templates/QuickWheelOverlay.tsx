// QuickWheelOverlay — the QUICK_WHEEL full-screen carnival picker spectacle.
// Visual contract: Google Stitch screens in `stitch redesign wheel/` (spin +
// winner reveal) and the Carnival Quest Stage design system. Choreography:
// docs/superpowers/specs/2026-09-09-carnival-wheel-choreography-design.md
//
//   pick ──SPIN_MS──▶ landAt ──REVEAL_HOLD_MS──▶ revealAt (E2.4 dismisses)
//
// The spin phase is sampled from wall-clock against landAt (derived from the
// authoritative live_state.revealAt), so every tab — including one refreshed
// mid-spin — shows the same phase and lands on the same angle (stop-jitter is
// seeded from the turn token). Rotation is written directly to the DOM from a
// rAF loop: no per-frame React state, so 30-avatar wheels stay smooth.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Volume2, VolumeX, Zap } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { filterPresent } from '../../../services/attendanceLogic';
import { makeRng } from '../../../services/seededRandom';
import { SPIN_MS, REVEAL_HOLD_MS, landAtFor, spinAngle } from '../../../services/wheelChoreography';
import { playTick, playLandFanfare, isWheelMuted, setWheelMuted } from '../wheelSound';
import Avatar from '../../../components/shared/Avatar';

// Carnival Quest Stage palette (Stitch DESIGN.md + spin screen markup).
const WEDGE_COLORS = ['#e11d48', '#0ea5e9', '#10b981', '#eab308', '#a855f7', '#ec4899', '#6366f1', '#f97316'];
const WEDGE_COLOR_NAMES = ['RED', 'BLUE', 'GREEN', 'AMBER', 'PURPLE', 'PINK', 'INDIGO', 'ORANGE'];
const LED_COUNT = 16;

const bulbPositions = Array.from({ length: LED_COUNT }, (_, i) => {
  const a = (i / LED_COUNT) * Math.PI * 2 - Math.PI / 2;
  return { left: `${50 + 47 * Math.cos(a)}%`, top: `${50 + 47 * Math.sin(a)}%`, white: i % 2 === 0 };
});

/** Wedge path in a 0..100 viewBox, spanning [startDeg, endDeg) clockwise from 12 o'clock. */
function wedgePath(startDeg: number, endDeg: number): string {
  const pt = (deg: number) => {
    const r = (deg * Math.PI) / 180;
    return `${(50 + 50 * Math.sin(r)).toFixed(2)},${(50 - 50 * Math.cos(r)).toFixed(2)}`;
  };
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M50,50 L${pt(startDeg)} A50,50 0 ${largeArc} 1 ${pt(endDeg)} Z`;
}

const QuickWheelOverlay: React.FC = () => {
  const { state, skipWheelReveal } = useSession();
  const students = useMemo(() => filterPresent(state.students || []), [state.students]);
  const winner = state.quickWheelWinner ? students.find((s: any) => s.id === state.quickWheelWinner) : null;

  const revealAt = state.turnRevealAt;
  const token = state.pendingTurnToken ?? state.currentTurnId ?? state.quickWheelWinner ?? '';
  const landAt = revealAt !== null ? landAtFor(revealAt) : null;

  const [phase, setPhase] = useState<'spin' | 'landed'>('spin');
  const [muted, setMuted] = useState(() => isWheelMuted());
  // Ratchet: within one turn, once landed we never fall back to 'spin' (a
  // turnRevealAt re-stamp from realtime must not resurrect the spinning view).
  const landedTokenRef = useRef<string | null>(null);

  const wheelRef = useRef<HTMLDivElement>(null);
  const flapperRef = useRef<HTMLDivElement>(null);
  const celebratedRef = useRef(false);

  // ── Wheel geometry (per turn) ──
  const seg = students.length > 0 ? 360 / students.length : 360;
  const winnerIndex = winner ? Math.max(0, students.findIndex((s: any) => s.id === winner.id)) : 0;
  const geometry = useMemo(() => {
    // Settle overshoot scales with the winner's segment so the flapper never
    // wiggles across a divider into a neighbour's slice.
    const overshootDeg = Math.min(11, Math.max(2, seg * 0.25));
    const jitterRoom = Math.max(0, seg / 2 - overshootDeg - 2);
    // Deterministic stop-jitter: every tab (and a late-mounting board) lands
    // on the identical angle for this turn.
    const rng = makeRng('wheel-stop', token);
    const jitter = jitterRoom > 0 ? (rng() * 2 - 1) * jitterRoom * 0.8 : 0;
    const targetCenter = winnerIndex * seg + seg / 2;
    const travel = 360 * 5 + (360 - targetCenter) + jitter;
    return { travel, overshootDeg };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seg, winnerIndex, token]);
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;
  const segRef = useRef(seg);
  segRef.current = seg;

  // ── Phase machine: wall-clock against landAt ──
  useEffect(() => {
    if (landAt === null) return;
    if (Date.now() >= landAt || landedTokenRef.current === token) {
      landedTokenRef.current = token;
      setPhase('landed');
      return;
    }
    setPhase('spin');
  }, [landAt, token]);

  useEffect(() => {
    if (phase !== 'spin' || landAt === null) return;
    const timer = setTimeout(() => {
      landedTokenRef.current = token;
      setPhase('landed');
      if (!celebratedRef.current) {
        celebratedRef.current = true;
        playLandFanfare();
      }
    }, Math.max(0, landAt - Date.now()));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, landAt, token]);

  // ── rAF spin engine (direct DOM writes; ticks + flapper kicks) ──
  useEffect(() => {
    if (phase !== 'spin' || landAt === null || students.length === 0) return;
    const spinStart = landAt - SPIN_MS;
    const { travel, overshootDeg } = geometryRef.current;
    const overshootFrac = travel > 0 ? overshootDeg / travel : 0;
    let lastWedge = -1;
    let lastTickAt = 0;
    let raf = 0;

    const step = () => {
      const now = Date.now();
      const t = Math.min(1, Math.max(0, (now - spinStart) / SPIN_MS));
      const angle = travel * spinAngle(t, { overshoot: overshootFrac });
      if (wheelRef.current) wheelRef.current.style.transform = `rotate(${angle.toFixed(2)}deg)`;

      const s = segRef.current;
      const wedgeAtTop = Math.floor((((360 - (angle % 360)) % 360) / s) % students.length);
      if (wedgeAtTop !== lastWedge) {
        lastWedge = wedgeAtTop;
        // Flapper kick (Web Animations API — no re-render; absent in jsdom).
        const flapper = flapperRef.current as (HTMLDivElement & { animate?: (kf: Keyframe[], opts: KeyframeAnimationOptions) => unknown }) | null;
        if (flapper && typeof flapper.animate === 'function') {
          flapper.animate(
            [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-16deg)' }, { transform: 'rotate(8deg)' }, { transform: 'rotate(0deg)' }],
            { duration: 110, easing: 'ease-out' },
          );
        }
        if (now - lastTickAt > 45) {
          lastTickAt = now;
          playTick();
        }
      }

      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, landAt, token]);

  // Snap the wheel to its final angle whenever we're landed (normal landing,
  // late mount inside the hold, or a mid-spin skip).
  useEffect(() => {
    if (phase !== 'landed') return;
    const el = wheelRef.current;
    if (!el) return;
    el.style.transition = 'transform 260ms ease-out';
    el.style.transform = `rotate(${geometryRef.current.travel.toFixed(2)}deg)`;
  }, [phase]);

  if (!winner || students.length === 0) return null;

  // ── Adaptive label density ──
  const n = students.length;
  const avatarSize = n <= 8 ? 46 : n <= 12 ? 38 : n <= 16 ? 32 : n <= 24 ? 26 : 22;
  const showNames = n <= 12;
  const winnerColor = WEDGE_COLORS[winnerIndex % WEDGE_COLORS.length];
  const landed = phase === 'landed';

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !muted;
    setMuted(next);
    setWheelMuted(next);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.3 }}
      onClick={skipWheelReveal}
      className="absolute inset-0 z-[70] flex items-center justify-center overflow-hidden font-rubik select-none cursor-pointer pointer-events-auto"
      style={{ background: 'radial-gradient(circle at 50% 42%, #131939 0%, #0a1030 62%)' }}
    >
      {/* Ambient glow blobs (Stitch spin screen) */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-36 -left-36 w-[450px] h-[450px] bg-[#1cb0f6]/20 rounded-full blur-[110px]" />
        <div className="absolute -bottom-36 -right-36 w-[480px] h-[480px] bg-[#ea9f00]/25 rounded-full blur-[130px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[850px] bg-[#ffbd58]/10 rounded-full blur-[150px]" />
      </div>

      {/* Floating ambient confetti (Stitch vectors, float-subtle) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[14%] left-[10%] -rotate-45 wheel-float"><svg width="42" height="42" viewBox="0 0 24 24" fill="none"><path d="M2 4C8 2 12 12 18 10C21 9 22 4 22 4" stroke="#88ceff" strokeWidth="4" strokeLinecap="round" /></svg></div>
        <div className="absolute top-[18%] right-[11%] rotate-12 wheel-float" style={{ animationDelay: '0.9s' }}><svg width="44" height="44" viewBox="0 0 24 24" fill="none"><path d="M3 20C9 18 13 8 19 10C22 11 23 16 23 16" stroke="#ffbd58" strokeWidth="5" strokeLinecap="round" /></svg></div>
        <div className="absolute top-[34%] left-[6%] wheel-float" style={{ animationDelay: '1.4s' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6be026" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
        </div>
        <div className="absolute bottom-[24%] right-[12%] rotate-45 wheel-float" style={{ animationDelay: '0.4s' }}><svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M2 18C7 16 11 6 16 8C20 9 21 14 21 14" stroke="#c084fc" strokeWidth="4" strokeLinecap="round" /></svg></div>
        <div className="absolute top-[12%] left-[26%] w-4 h-4 rounded-full bg-[#ffbd58]" />
        <div className="absolute top-[22%] left-[18%] w-3 h-3 rounded-full bg-[#6be026]" />
        <div className="absolute top-[13%] right-[24%] w-4 h-4 rounded-full bg-[#ff5376]" />
        <div className="absolute bottom-[16%] left-[16%] w-4 h-4 rounded-full bg-[#1cb0f6]" />
        <div className="absolute bottom-[14%] right-[22%] w-5 h-5 rounded-full bg-[#87fe45]" />
      </div>

      {/* Mute chip */}
      <button
        onClick={toggleMute}
        className="absolute top-4 right-4 z-40 p-2.5 rounded-full bg-[#171d3d]/90 border-2 border-[#ffbd58]/60 text-[#ffbd58] hover:bg-[#222848] active:scale-95 transition-all"
        title={muted ? 'Unmute wheel sounds' : 'Mute wheel sounds'}
      >
        {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>

      {/* ── The carnival card (wheel assembly) — dims/shrinks behind the winner modal.
             Plain wrapper carries the landed transition (framer's inline transform
             on the child would otherwise override Tailwind's scale/opacity). ── */}
      <div className={`relative z-10 transition-all duration-700 ${landed ? 'opacity-40 blur-[3px] scale-[0.65]' : ''}`}>
        <motion.div
          initial={{ scale: 0.7, opacity: 0, y: 40 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
          className="relative w-[min(94vw,860px)] rounded-[32px] flex flex-col items-center px-6 py-5 overflow-hidden"
          style={{
            background: 'linear-gradient(to bottom, #19224d, #101738)',
            border: '6px solid #ffbd58',
            boxShadow: '0 20px 60px -10px rgba(0,0,0,0.85), 0 0 45px 0 rgba(255,189,88,0.4), inset 0 0 25px rgba(255,189,88,0.12)',
          }}
        >
        {/* Faint sunburst behind the card content */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.12] overflow-hidden -z-0">
          <svg className="w-[900px] h-[900px] wheel-spin-slow text-[#ffbd58]" viewBox="0 0 500 500">
            <g fill="currentColor">
              <polygon points="250,250 200,0 250,0" /><polygon points="250,250 330,20 365,55" />
              <polygon points="250,250 445,135 480,170" /><polygon points="250,250 500,250 500,290" />
              <polygon points="250,250 480,365 445,400" /><polygon points="250,250 365,480 330,500" />
              <polygon points="250,250 250,500 210,500" /><polygon points="250,250 135,480 100,445" />
              <polygon points="250,250 20,365 0,330" /><polygon points="250,250 0,250 0,210" />
              <polygon points="250,250 20,135 55,100" /><polygon points="250,250 100,55 135,20" />
            </g>
          </svg>
        </div>

        {/* Badge + headline */}
        <div className="relative z-10 flex flex-col items-center text-center mb-2">
          <div className="inline-flex items-center gap-2 px-5 py-1.5 rounded-full bg-[#ffbd58]/20 border-2 border-[#ffbd58]">
            <span className="text-base">{landed ? '🎉' : '🎡'}</span>
            <span className="text-[#ffbd58] uppercase font-black tracking-[0.14em] text-xs md:text-sm">
              {landed ? 'We have a winner! • 我们有胜者！' : "Who's next? • 谁来下一个？"}
            </span>
            <span className="text-base">{landed ? '🎉' : '✨'}</span>
          </div>
          {!landed && (
            <h1 className="text-white text-xl md:text-2xl font-extrabold tracking-wide mt-1.5" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
              The Carnival Wheel is Ready to Spin!
            </h1>
          )}
        </div>

        {/* ── Wheel assembly: flapper + rim + rotating body + hub ── */}
        <div className="relative flex items-center justify-center my-1" style={{ width: 'min(56vmin, 480px)', height: 'min(56vmin, 480px)' }}>
          {/* 12 o'clock gold flapper */}
          <div ref={flapperRef} className="absolute -top-5 left-1/2 -translate-x-1/2 z-30 origin-top" style={{ filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.6))' }}>
            <svg width="44" height="52" viewBox="0 0 56 64" fill="none">
              <circle cx="28" cy="14" r="12" fill="#624000" />
              <circle cx="28" cy="12" r="11" fill="#FFBD58" stroke="#FFFFFF" strokeWidth="3" />
              <circle cx="28" cy="12" r="4.5" fill="#FFFFFF" />
              <path d="M14 16 L42 16 L31 58 C29.5 62 26.5 62 25 58 Z" fill="#E69D00" />
              <path d="M16 16 L40 16 L30 56 C29 59 27 59 26 56 Z" fill="#FFBD58" stroke="#FFFFFF" strokeWidth="3" />
              <path d="M22 20 L30 20 L27 46 Z" fill="rgba(255,255,255,0.4)" />
            </svg>
          </div>

          {/* Polished gold rim with LED bulbs */}
          <div
            className="relative w-full h-full rounded-full"
            style={{
              padding: 16,
              background: 'linear-gradient(to bottom, #FFBD58, #E69D00, #805300)',
              border: '4px solid white',
              filter: 'drop-shadow(0 14px 22px rgba(5,11,43,0.95)) drop-shadow(0 0 35px rgba(255,189,88,0.25))',
            }}
          >
            <div className="absolute inset-0 pointer-events-none rounded-full">
              {bulbPositions.map((b, i) => (
                <div
                  key={i}
                  className={`absolute w-3.5 h-3.5 rounded-full border ${b.white ? 'bg-white border-amber-200' : 'bg-[#FF8600] border-amber-100'}`}
                  style={{
                    left: b.left,
                    top: b.top,
                    transform: 'translate(-50%, -50%)',
                    boxShadow: b.white ? '0 0 8px #ffffff' : '0 0 7px #FF8600',
                    ...(landed ? {} : { animation: `bulbChase 0.5s linear infinite`, animationDelay: `${(i / LED_COUNT) * 0.5}s` }),
                  }}
                />
              ))}
            </div>

            {/* Rotating wheel body (rAF writes its transform) */}
            <div
              ref={wheelRef}
              className="relative w-full h-full rounded-full overflow-hidden bg-[#0a1030]"
            >
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
                {students.map((s: any, i: number) => {
                  const start = i * seg;
                  const end = (i + 1) * seg;
                  return <path key={s.id} d={wedgePath(start, end)} fill={WEDGE_COLORS[i % WEDGE_COLORS.length]} stroke="#FFFFFF" strokeWidth={n > 20 ? 1 : n > 12 ? 1.5 : 2.5} />;
                })}
                <circle cx="50" cy="50" r="49" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              </svg>

              {/* Student labels: avatar toward the rim, first name inside it */}
              {students.map((s: any, i: number) => {
                const mid = i * seg + seg / 2;
                const rad = (mid * Math.PI) / 180;
                return (
                  <div
                    key={s.id}
                    className="absolute flex flex-col items-center gap-0.5"
                    style={{
                      left: `${50 + 33 * Math.sin(rad)}%`,
                      top: `${50 - 33 * Math.cos(rad)}%`,
                      transform: `translate(-50%, -50%) rotate(${mid}deg)`,
                    }}
                  >
                    <div className="rounded-full bg-white/95 flex items-center justify-center" style={{ width: avatarSize + 6, height: avatarSize + 6, boxShadow: '0 2px 6px rgba(5,11,43,0.55)' }}>
                      <Avatar src={s.avatar} rosterId={s.id} name={s.name} size={avatarSize} />
                    </div>
                    {showNames && (
                      <span
                        className="text-white font-black leading-tight whitespace-nowrap"
                        style={{ fontSize: n <= 8 ? 15 : 12, textShadow: '0 2px 3px rgba(5,11,43,0.85)' }}
                      >
                        {s.name?.split(' ')[0]}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Center hub: layered gold medallion + star */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-[19%] h-[19%] rounded-full flex items-center justify-center pointer-events-none"
                style={{ background: 'linear-gradient(to bottom, #FFBD58, #E69D00, #805300)', border: '3px solid white', boxShadow: '0 4px 10px rgba(0,0,0,0.6)' }}>
                <div className="w-[78%] h-[78%] rounded-full bg-[#FFBD58] border-2 border-[#FFE082] flex items-center justify-center">
                  <svg className="w-[62%] h-[62%] text-white fill-current" viewBox="0 0 24 24" style={{ filter: 'drop-shadow(0 2px 0 #9e6600)' }}>
                    <polygon points="12,2 15,9 23,9 17,14 19,21 12,17 5,21 7,14 1,9 9,9" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Status hint while spinning (the board doesn't own the spin trigger — the remote does) */}
        {!landed && (
          <div className="relative z-10 mt-1 mb-1 inline-flex items-center gap-2 px-4 py-1 rounded-full bg-[#222848]/80 border border-[#3e4850]/60 text-xs md:text-sm text-[#8fb8cc] font-semibold font-nunito">
            <span className="w-2 h-2 rounded-full bg-[#6be026] animate-pulse" />
            Spinning… <span className="text-white/60">tap anywhere to skip</span>
          </div>
        )}
        </motion.div>
      </div>

      {/* ── Winner reveal modal (at landAt) ── */}
      {landed && (
        <>
          {/* Vignette for foreground dominance */}
          <div className="absolute inset-0 z-20 bg-[#0a1030]/60 backdrop-blur-[2px] pointer-events-none" />

          <motion.div
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 240, damping: 18 }}
            className="relative z-30 flex flex-col items-center max-w-[92vw]"
          >
            {/* Modal card with radiating sunburst */}
            <div
              className="relative w-[min(92vw,720px)] rounded-3xl px-6 py-7 md:p-9 flex flex-col items-center overflow-hidden"
              style={{
                background: 'linear-gradient(to bottom, #19224d, #101738)',
                border: '6px solid #ffbd58',
                boxShadow: '0 25px 60px -10px rgba(0,0,0,0.8), 0 0 40px 0 rgba(255,189,88,0.25)',
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25 overflow-hidden">
                <svg className="w-[800px] h-[800px] wheel-spin-slower text-[#ffbd58]" viewBox="0 0 500 500">
                  <g fill="currentColor">
                    <polygon points="250,250 200,0 250,0" /><polygon points="250,250 330,20 365,55" />
                    <polygon points="250,250 445,135 480,170" /><polygon points="250,250 500,250 500,290" />
                    <polygon points="250,250 480,365 445,400" /><polygon points="250,250 365,480 330,500" />
                    <polygon points="250,250 250,500 210,500" /><polygon points="250,250 135,480 100,445" />
                    <polygon points="250,250 20,365 0,330" /><polygon points="250,250 0,250 0,210" />
                    <polygon points="250,250 20,135 55,100" /><polygon points="250,250 100,55 135,20" />
                  </g>
                </svg>
              </div>

              <div className="relative z-10 flex flex-col items-center mb-2">
                <div className="inline-flex items-center gap-2 px-5 py-1.5 rounded-full bg-[#ffbd58]/20 border-2 border-[#ffbd58]">
                  <span className="text-base">🎉</span>
                  <span className="font-rubik text-[#ffbd58] uppercase font-black tracking-[0.14em] text-xs md:text-sm">We have a winner!</span>
                  <span className="text-base">🎉</span>
                </div>
                <h1 className="text-white text-xl md:text-2xl font-extrabold tracking-wide mt-1.5 font-rubik text-center">The Carnival Wheel has spoken!</h1>
              </div>

              {/* Crown badge */}
              <motion.div
                initial={{ y: -50, opacity: 0, rotate: -20 }}
                animate={{ y: 0, opacity: 1, rotate: -6 }}
                transition={{ delay: 0.05, type: 'spring', stiffness: 300, damping: 14 }}
                className="relative z-20 -mb-5"
              >
                <div className="wheel-bounce bg-[#ffbd58] text-[#050b2b] border-2 border-white px-3 py-1 rounded-xl shadow-lg flex items-center gap-1.5">
                  <span className="text-xl">👑</span>
                  <span className="font-black text-xs uppercase tracking-wider text-[#442b00] font-rubik">Selected!</span>
                </div>
              </motion.div>

              {/* Winner portrait in gold bulb-riveted ring */}
              <motion.div
                initial={{ scale: 0.2, rotate: -180, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 14 }}
                className="relative z-10 my-3 w-40 h-40 md:w-48 md:h-48 rounded-full p-2.5 flex items-center justify-center"
                style={{
                  background: 'linear-gradient(to top right, #ea9f00, #ffbd58, #fff4cf)',
                  border: '4px solid #050b2b',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.6), 0 0 35px rgba(255,189,88,0.35)',
                }}
              >
                {[
                  { top: '-6px', left: '50%' }, { bottom: '-6px', left: '50%' },
                  { top: '50%', left: '-6px' }, { top: '50%', right: '-6px' },
                ].map((pos, i) => (
                  <div key={i} className="absolute w-3 h-3 rounded-full bg-white" style={{ ...pos, transform: 'translate(-50%,-50%)', boxShadow: '0 0 8px #ffffff' }} />
                ))}
                <div className="w-full h-full rounded-full overflow-hidden border-4 flex items-center justify-center relative"
                  style={{ background: winnerColor, borderColor: 'rgba(255,255,255,0.35)' }}>
                  <Avatar src={winner.avatar} rosterId={winner.id} name={winner.name} size={132} celebrate />
                </div>
                {/* Segment corner badge */}
                <div className="absolute -bottom-1 -right-1 border-2 border-white px-2 py-0.5 rounded-full shadow-md flex items-center gap-1" style={{ background: winnerColor }}>
                  <span className="w-2 h-2 rounded-full bg-white" />
                  <span className="text-[11px] font-black text-white font-rubik tracking-tight">
                    #{winnerIndex + 1} {WEDGE_COLOR_NAMES[winnerIndex % WEDGE_COLOR_NAMES.length]}
                  </span>
                </div>
              </motion.div>

              {/* Name slam */}
              <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.6 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.22, duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
                className="relative z-10 flex flex-col items-center mt-2"
              >
                <div style={{ transform: 'rotate(-2.5deg)' }}>
                  <h2
                    className="font-rubik text-4xl md:text-6xl font-black tracking-tight uppercase whitespace-nowrap"
                    style={{
                      color: '#ffffff',
                      WebkitTextStroke: '3px #ea9f00',
                      paintOrder: 'stroke fill',
                      filter: 'drop-shadow(0 6px 0 #92400e)',
                    }}
                  >
                    ⭐ {winner.name?.split(' ')[0]} ⭐
                  </h2>
                </div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4, type: 'spring', stiffness: 320, damping: 16 }}
                  className="flex flex-col items-center mt-4"
                >
                  <div className="px-5 py-1.5 rounded-full bg-[#ffbd58] text-[#050b2b] font-black text-sm md:text-base tracking-wider uppercase shadow-md flex items-center gap-1.5 border-2 border-white font-rubik">
                    <Zap size={17} strokeWidth={2.75} />
                    Your Turn!
                  </div>
                  <span className="mt-2 text-[#ffbd58]/90 font-bold text-base md:text-lg">轮到你了！</span>
                </motion.div>
              </motion.div>
            </div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              className="mt-3 text-[#8fb8cc]/70 text-xs font-semibold tracking-wide"
            >
              tap anywhere to continue
            </motion.p>
          </motion.div>
        </>
      )}

      <style>{`
        @keyframes wheelFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-7px) rotate(2deg); }
        }
        .wheel-float { animation: wheelFloat 4.5s ease-in-out infinite; }

        @keyframes wheelSpinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .wheel-spin-slow { animation: wheelSpinSlow 50s linear infinite; }
        .wheel-spin-slower { animation: wheelSpinSlow 40s linear infinite; }

        @keyframes bulbChase {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 1; }
        }

        @keyframes wheelBounce {
          0%, 100% { transform: translateY(0) rotate(-6deg); }
          50% { transform: translateY(-7px) rotate(-2deg); }
        }
        .wheel-bounce { animation: wheelBounce 2.5s ease-in-out infinite; }
      `}</style>
    </motion.div>
  );
};

export default QuickWheelOverlay;
