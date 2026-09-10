// BoardShell — the persistent projector-screen frame for the Live Board.
// Layout (2026-09-09 owner round — top phase arc + left step rail removed):
//   • Center Stage (enlarged): {children} — the current game/template renders here.
//   • Leaderboard Rail (right): ALL students by unified points (scrolls when the
//     class is long), with a compact Red/Blue team score card pinned below it
//     (rendered only when teams are assigned).
//   • Whose-Turn Banner (bottom): the picked student + round-mode badge.
//
// The Shell is DISPLAY-ONLY (no teacher controls). The teacher operates from
// the Commander/Remote. Students see only this visual + the game content.

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from '../../store/SessionContext';
import BoardSoundLayer from './templates/BoardSoundLayer';
import Avatar from '../../components/shared/Avatar';

// ── Phase configuration (label, Chinese, icon, colors) ──────────────────
const PHASE_CONFIG: Record<string, { label: string; cn: string; icon: string; dot: string; text: string; glow: string }> = {
  WARMUP: { label: 'Warm-up', cn: '热身', icon: '☀️', dot: 'bg-amber-400 border-amber-400', text: 'text-amber-400', glow: 'shadow-amber-500/30' },
  INPUT: { label: 'Input', cn: '输入', icon: '📖', dot: 'bg-blue-500 border-blue-400', text: 'text-blue-400', glow: 'shadow-blue-500/35' },
  OUTPUT: { label: 'Story', cn: '故事', icon: '🎭', dot: 'bg-amber-600 border-amber-500', text: 'text-amber-300', glow: 'shadow-amber-600/30' },
  PRACTICE: { label: 'Practice', cn: '练习', icon: '🎯', dot: 'bg-green-500 border-green-400', text: 'text-green-300', glow: 'shadow-green-500/30' },
  ASSESS: { label: 'Assess', cn: '评估', icon: '🏆', dot: 'bg-red-500 border-red-400', text: 'text-red-400', glow: 'shadow-red-500/35' },
  WRAPUP: { label: 'Wrap', cn: '总结', icon: '🎉', dot: 'bg-purple-500 border-purple-400', text: 'text-purple-300', glow: 'shadow-purple-500/35' },
};

// ── Phase background washes (B2 from Claude's design doc) ──────────────
// Each phase owns a dark background gradient — color-blind-safe (differs in
// both hue AND lightness). Cross-fades on phase change (600ms CSS transition).
const PHASE_WASHES: Record<string, string> = {
  WARMUP: 'linear-gradient(135deg, #2A1B0F, #1A1208)',
  INPUT: 'linear-gradient(135deg, #0F1B2E, #0A1422)',
  OUTPUT: 'linear-gradient(135deg, #1E1B0E, #15120A)',
  PRACTICE: 'linear-gradient(135deg, #0F2419, #0A1A12)',
  ASSESS: 'linear-gradient(135deg, #2E0F14, #1F0A0E)',
  WRAPUP: 'linear-gradient(135deg, #2E1B2E, #1F1320)',
};

// Full-bleed step types (rails auto-retract per B5).
const FULL_BLEED_TYPES = new Set(['STORY_STAGE', 'STORY_STAGE_AG', 'DIALOGUE_STAGE', 'MEDIA_PLAYER', 'INTRO_SPLASH', 'TEAM_SPLASH', 'LIVE_WARMUP', 'FOCUS_CARDS']); // FOCUS_CARDS added 2026-09-10 (games-v3 audit 4.a: the 0-point leaderboard is distraction + width theft during non-scored presentation)

interface BoardShellProps {
  children: React.ReactNode;
}

const BoardShell: React.FC<BoardShellProps> = ({ children }) => {
  const { state } = useSession();
  const flow = state.activeUnit?.flow || [];
  const currentStep = flow[state.currentStepIndex];
  const currentPhase = (currentStep as any)?.phase || 'WARMUP';
  const currentType = (currentStep as any)?.type || '';
  const fullBleed = FULL_BLEED_TYPES.has(currentType);

  // ── Team scores (with bounce on change) ────────────────────────────────
  const teamsAssigned = state.students.some(s => s.team);
  const redScore = state.students.filter(s => s.team === 'red').reduce((a, s) => a + (s.points || 0), 0);
  const blueScore = state.students.filter(s => s.team === 'blue').reduce((a, s) => a + (s.points || 0), 0);
  const prevRed = useRef(redScore);
  const prevBlue = useRef(blueScore);
  const [redBounce, setRedBounce] = useState(false);
  const [blueBounce, setBlueBounce] = useState(false);
  const [redDelta, setRedDelta] = useState<number | null>(null);
  const [blueDelta, setBlueDelta] = useState<number | null>(null);

  useEffect(() => {
    if (redScore !== prevRed.current) {
      const delta = redScore - prevRed.current;
      setRedDelta(delta);
      setRedBounce(true);
      const t = setTimeout(() => { setRedBounce(false); setRedDelta(null); }, 2000);
      prevRed.current = redScore;
      return () => clearTimeout(t);
    }
  }, [redScore]);

  useEffect(() => {
    if (blueScore !== prevBlue.current) {
      const delta = blueScore - prevBlue.current;
      setBlueDelta(delta);
      setBlueBounce(true);
      const t = setTimeout(() => { setBlueBounce(false); setBlueDelta(null); }, 2000);
      prevBlue.current = blueScore;
      return () => clearTimeout(t);
    }
  }, [blueScore]);

  // ── Leaderboard (all students, sorted by points) ─────────────────────
  const leaderboard = useMemo(
    () => [...state.students].sort((a, b) => (b.points || 0) - (a.points || 0)),
    [state.students],
  );

  // ── Whose turn ────────────────────────────────────────────────────────
  const turnStudent = state.students.find(s => s.id === state.quickWheelWinner);
  const roundMode = state.quickWheelWinner ? 'INDIVIDUAL' : teamsAssigned ? 'TEAM' : 'CHORAL';

  // ── Active phase color (theming the center stage border) ──────────────
  const activeCfg = PHASE_CONFIG[currentPhase] || PHASE_CONFIG.WARMUP;

  return (
    <div
      className="h-full w-full font-body text-slate-50 select-none overflow-hidden relative"
      style={{ background: PHASE_WASHES[currentPhase] || PHASE_WASHES.WARMUP, transition: 'background 600ms ease-in-out' }}
    >
      {/* B3.1: board-side audio receiver for the teacher Sound Board. */}
      <BoardSoundLayer />

      {/* ═══ MAIN GRID (stage + leaderboard rail) ═══ */}
      <main
        className="absolute top-0 left-0 right-0 bottom-0 grid gap-4 px-6 pb-[108px] pt-6 transition-all duration-500"
        style={{ gridTemplateColumns: fullBleed ? '1fr 0px' : '1fr 240px' }}
      >
        {/* ── CENTER: Content Stage (children) ── */}
        <section className={`relative overflow-hidden rounded-[28px] border-2 ${activeCfg.dot.split(' ')[0]} bg-white/[.06] flex flex-col shadow-[0_0_30px_rgba(59,130,246,.15)]`}>
          {/* Phase badge (corner) */}
          <div className={`absolute top-5 left-6 flex items-center gap-2 ${activeCfg.dot.split(' ')[0].replace('bg-', 'bg-')}/12 border ${activeCfg.text.replace('text-', 'border-')}/25 rounded-full px-4 py-1.5 z-10`}>
            <div className={`w-2.5 h-2.5 rounded-full ${activeCfg.dot.split(' ')[0]}`} />
            <span className={`font-display text-sm font-semibold ${activeCfg.text} uppercase tracking-wider`}>{activeCfg.label}</span>
          </div>
          {/* The actual game/template renders here */}
          <div className="flex-1 overflow-hidden">{children}</div>
        </section>

        {/* ── RIGHT: Leaderboard (ALL students, scrolls) + Team scores (auto-retract during full-bleed content) ── */}
        <aside className={`flex flex-col gap-4 overflow-hidden transition-all duration-500 ${fullBleed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <div className="flex-1 min-h-0 bg-white/[.06] border border-white/8 rounded-[20px] px-[18px] py-5 flex flex-col backdrop-blur-sm">
            <div className="font-display text-[15px] font-semibold text-slate-300/65 mb-2 uppercase tracking-wider shrink-0">🏆 Leaderboard</div>
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 pr-1
              [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full">
              {leaderboard.map((s, i) => (
                <div key={s.id} className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl ${i === 0 ? 'bg-amber-400/10' : ''} ${s.isPresent === false ? 'opacity-40 grayscale' : ''}`}>
                  <span className="font-display text-base font-bold text-amber-400 w-6 text-center">{i + 1}</span>
                  <Avatar src={s.avatar} rosterId={s.id} name={s.name} size={32} />
                  <span className="font-display text-lg font-semibold flex-1 truncate">{s.name}</span>
                  <span className="font-display text-xl font-bold text-blue-400 tabular-nums">{s.points || 0}</span>
                </div>
              ))}
              {leaderboard.length === 0 && <p className="text-slate-500 text-sm text-center py-4">No students yet</p>}
            </div>
          </div>
          {teamsAssigned && (
            <div className="shrink-0 bg-white/[.06] border border-white/8 rounded-[20px] px-[18px] py-4 flex flex-col gap-3 backdrop-blur-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,.3)]" />
                <span className="font-display text-[15px] font-semibold flex-1">Team Red</span>
                <motion.div
                  animate={redBounce ? { scale: [1, 1.15, 1] } : {}} transition={{ duration: 0.25 }}
                  className="relative font-display text-[30px] font-bold tabular-nums leading-none text-red-300"
                >
                  {redScore}
                  <AnimatePresence>
                    {redDelta !== null && (
                      <motion.span initial={{ opacity: 0.9, y: 0 }} animate={{ opacity: 0, y: -24 }} exit={{ opacity: 0 }}
                        transition={{ duration: 2 }} className="absolute top-0 right-0 font-display text-base font-bold text-amber-400">
                        {redDelta > 0 ? `+${redDelta}` : redDelta}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>
              <div className="h-px bg-white/8" />
              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,.3)]" />
                <span className="font-display text-[15px] font-semibold flex-1">Team Blue</span>
                <motion.div
                  animate={blueBounce ? { scale: [1, 1.15, 1] } : {}} transition={{ duration: 0.25 }}
                  className="relative font-display text-[30px] font-bold tabular-nums leading-none text-blue-300"
                >
                  {blueScore}
                  <AnimatePresence>
                    {blueDelta !== null && (
                      <motion.span initial={{ opacity: 0.9, y: 0 }} animate={{ opacity: 0, y: -24 }} exit={{ opacity: 0 }}
                        transition={{ duration: 2 }} className="absolute top-0 right-0 font-display text-base font-bold text-amber-400">
                        {blueDelta > 0 ? `+${blueDelta}` : blueDelta}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>
            </div>
          )}
        </aside>
      </main>

      {/* ═══ WHOSE-TURN BANNER (footer) ═══ */}
      <footer className={`absolute bottom-0 left-0 right-0 h-[100px] flex items-center justify-center pb-[18px] z-10 ${fullBleed ? 'px-6' : 'pl-6 pr-[280px]'}`}>
        {/* Round-mode badge */}
        <div className="absolute left-6 flex items-center gap-2 bg-white/[.06] border border-white/8 rounded-full px-5 py-2 backdrop-blur-sm">
          <span className="text-xl">{roundMode === 'INDIVIDUAL' ? '🙋' : roundMode === 'TEAM' ? '👥' : '📣'}</span>
          <span className="font-display text-lg font-bold tracking-wide">{roundMode}</span>
        </div>
        {/* Whose-turn pill */}
        {turnStudent ? (
          <motion.div
            className="relative flex items-center gap-[18px] bg-white/10 border-2 border-white/15 rounded-full p-[10px] pr-11 pl-4 backdrop-blur-md"
            animate={{ boxShadow: ['0 0 20px rgba(239,68,68,.15)', '0 0 30px rgba(239,68,68,.25)', '0 0 20px rgba(239,68,68,.15)'] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          >
            <div className="absolute inset-[-3px] rounded-full" style={{ background: 'conic-gradient(from 0deg,transparent 0%,rgba(239,68,68,.15) 15%,transparent 30%)', zIndex: -1, animation: 'spin 5s linear infinite' }} />
            <motion.div
              className="w-[62px] h-[62px] rounded-full flex items-center justify-center text-[34px] shrink-0"
              style={{ background: turnStudent.team === 'blue' ? 'linear-gradient(135deg,#3B82F6,#6366F1)' : 'linear-gradient(135deg,#F97316,#EF4444)' }}
              animate={{ boxShadow: ['0 0 16px rgba(239,68,68,.4)', '0 0 24px rgba(239,68,68,.6)', '0 0 16px rgba(239,68,68,.4)'] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Avatar src={turnStudent.avatar} rosterId={turnStudent.id} name={turnStudent.name} size={56} idle />
            </motion.div>
            <div className="flex flex-col">
              <span className="font-display text-base text-slate-300/65 font-medium">Now up</span>
              <span className="font-display text-[36px] font-bold leading-tight">{turnStudent.name}</span>
            </div>
          </motion.div>
        ) : (
          <div className="bg-white/[.06] border border-white/8 rounded-full px-8 py-3 backdrop-blur-sm">
            <span className="font-display text-xl text-slate-400/50">Whole class — choral round 📣</span>
          </div>
        )}
      </footer>

      {/* Spotlight keyframe (for the conic gradient sweep) */}
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default BoardShell;
