// BoardShell — the persistent projector-screen frame for the Live Board.
// Built from the Hermes prototype (01-shell.html). Contains:
//   • Phase Arc Rail (top): visual timeline of the lesson phases.
//   • Team Score Rail (left): Red vs Blue live scores + round info.
//   • Center Stage: {children} — the current game/template renders here.
//   • Leaderboard Rail (right): top 5 students by unified points.
//   • Whose-Turn Banner (bottom): the picked student + round-mode badge.
//
// The Shell is DISPLAY-ONLY (no teacher controls). The teacher operates from
// the Commander/Remote. Students see only this visual + the game content.

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSession, TEAM_COLORS } from '../../store/SessionContext';

// ── Phase configuration (label, Chinese, icon, colors) ──────────────────
const PHASE_CONFIG: Record<string, { label: string; cn: string; icon: string; dot: string; text: string; glow: string }> = {
  WARMUP: { label: 'Warm-up', cn: '热身', icon: '☀️', dot: 'bg-amber-400 border-amber-400', text: 'text-amber-400', glow: 'shadow-amber-500/30' },
  INPUT: { label: 'Input', cn: '输入', icon: '📖', dot: 'bg-blue-500 border-blue-400', text: 'text-blue-400', glow: 'shadow-blue-500/35' },
  OUTPUT: { label: 'Story', cn: '故事', icon: '🎭', dot: 'bg-amber-600 border-amber-500', text: 'text-amber-300', glow: 'shadow-amber-600/30' },
  PRACTICE: { label: 'Practice', cn: '练习', icon: '🎯', dot: 'bg-green-500 border-green-400', text: 'text-green-300', glow: 'shadow-green-500/30' },
  ASSESS: { label: 'Assess', cn: '评估', icon: '🏆', dot: 'bg-red-500 border-red-400', text: 'text-red-400', glow: 'shadow-red-500/35' },
  WRAPUP: { label: 'Wrap', cn: '总结', icon: '🎉', dot: 'bg-purple-500 border-purple-400', text: 'text-purple-300', glow: 'shadow-purple-500/35' },
};

const LEADERBOARD_GRADIENTS = [
  'linear-gradient(135deg,#F472B6,#A855F7)',
  'linear-gradient(135deg,#F97316,#EF4444)',
  'linear-gradient(135deg,#3B82F6,#6366F1)',
  'linear-gradient(135deg,#22C55E,#14B8A6)',
  'linear-gradient(135deg,#FBBF24,#F97316)',
];

interface BoardShellProps {
  children: React.ReactNode;
}

const BoardShell: React.FC<BoardShellProps> = ({ children }) => {
  const { state } = useSession();
  const flow = state.activeUnit?.flow || [];
  const currentStep = flow[state.currentStepIndex];
  const currentPhase = (currentStep as any)?.phase || 'WARMUP';

  // ── Phase Arc: unique phases in order + completed/active/future ────────
  const phases = useMemo(() => {
    const seen: string[] = [];
    for (const step of flow) {
      const ph = (step as any)?.phase;
      if (ph && !seen.includes(ph)) seen.push(ph);
    }
    if (seen.length === 0) seen.push('WARMUP', 'INPUT', 'PRACTICE', 'ASSESS', 'WRAPUP');
    const currentIdx = seen.indexOf(currentPhase);
    return seen.map((ph, i) => ({
      phase: ph,
      cfg: PHASE_CONFIG[ph] || PHASE_CONFIG.WARMUP,
      status: i < currentIdx ? 'completed' : i === currentIdx ? 'active' : 'future',
    }));
  }, [flow, currentPhase]);

  // ── Team scores ────────────────────────────────────────────────────────
  const teamsAssigned = state.students.some(s => s.team);
  const redScore = state.students.filter(s => s.team === 'red').reduce((a, s) => a + (s.points || 0), 0);
  const blueScore = state.students.filter(s => s.team === 'blue').reduce((a, s) => a + (s.points || 0), 0);

  // ── Leaderboard (top 5) ───────────────────────────────────────────────
  const leaderboard = useMemo(
    () => [...state.students].sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 5),
    [state.students],
  );

  // ── Whose turn ────────────────────────────────────────────────────────
  const turnStudent = state.students.find(s => s.id === state.quickWheelWinner);
  const roundMode = state.quickWheelWinner ? 'INDIVIDUAL' : teamsAssigned ? 'TEAM' : 'CHORAL';

  // ── Active phase color (theming the center stage border) ──────────────
  const activeCfg = PHASE_CONFIG[currentPhase] || PHASE_CONFIG.WARMUP;

  return (
    <div className="h-full w-full bg-gradient-to-br from-slate-900 to-slate-950 font-body text-slate-50 select-none overflow-hidden relative">
      {/* ═══ PHASE ARC RAIL (header) ═══ */}
      <header className="absolute top-0 left-0 right-0 h-20 flex items-center justify-center px-24 z-10">
        <div className="flex items-center">
          {phases.map((p, i) => (
            <React.Fragment key={p.phase}>
              <div className="flex flex-col items-center z-10 shrink-0">
                {p.status === 'active' ? (
                  <>
                    <motion.div
                      className={`w-[34px] h-[34px] rounded-full ${p.cfg.dot} border-2 flex items-center justify-center mb-1.5 text-sm`}
                      animate={{ scale: [1, 1.06, 1] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      {p.cfg.icon}
                    </motion.div>
                    <span className={`font-display text-[17px] font-semibold ${p.cfg.text}`}>{p.cfg.label}</span>
                    <span className="font-cn text-[12px] text-slate-300/65">{p.cfg.cn}</span>
                  </>
                ) : p.status === 'completed' ? (
                  <>
                    <div className={`w-[22px] h-[22px] rounded-full border-[2.5px] ${p.cfg.dot} opacity-70 flex items-center justify-center mb-1.5`}>
                      <span className="text-slate-900 font-bold text-[11px]">✓</span>
                    </div>
                    <span className="font-display text-[13px] font-semibold text-slate-300/65">{p.cfg.label}</span>
                    <span className="font-cn text-[10px] text-slate-400/40">{p.cfg.cn}</span>
                  </>
                ) : (
                  <>
                    <div className="w-[22px] h-[22px] rounded-full border-[2.5px] border-slate-500/40 opacity-40 mb-1.5" />
                    <span className="font-display text-[13px] font-semibold text-slate-300/65">{p.cfg.label}</span>
                    <span className="font-cn text-[10px] text-slate-400/40">{p.cfg.cn}</span>
                  </>
                )}
              </div>
              {i < phases.length - 1 && (
                <div
                  className={`w-[70px] h-[3px] rounded-full self-start mt-[30px] ${
                    p.status === 'completed' ? `${p.cfg.dot} opacity-55` :
                    p.status === 'active' ? `bg-gradient-to-r from-${p.cfg.text.replace('text-','')} to-slate-600` :
                    'bg-white/8'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="absolute top-4 right-8 font-body text-[15px] text-slate-400/40 tabular-nums">
          {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
        </div>
      </header>

      {/* ═══ MAIN GRID (3 columns) ═══ */}
      <main className="absolute top-20 left-0 right-0 bottom-0 grid grid-cols-[260px_1fr_240px] gap-4 px-6 pb-[108px] pt-4">
        {/* ── LEFT: Team Scores ── */}
        <aside className="flex flex-col gap-4 pt-3">
          {teamsAssigned && (
            <>
              {/* Team Red */}
              <div className="relative overflow-hidden rounded-[20px] border border-red-500/25 bg-white/[.06] p-5 backdrop-blur-sm">
                <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 20% 20%,rgba(239,68,68,.3),transparent 70%)' }} />
                <div className="relative flex items-center gap-2.5 mb-2">
                  <div className="w-4 h-4 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,.3)]" />
                  <span className="font-display text-[17px] font-semibold">Team Red</span>
                </div>
                <div className="relative font-display text-[56px] font-bold tabular-nums leading-none text-red-300">{redScore}</div>
              </div>
              {/* Team Blue */}
              <div className="relative overflow-hidden rounded-[20px] border border-blue-500/25 bg-white/[.06] p-5 backdrop-blur-sm">
                <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 20% 20%,rgba(59,130,246,.3),transparent 70%)' }} />
                <div className="relative flex items-center gap-2.5 mb-2">
                  <div className="w-4 h-4 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,.3)]" />
                  <span className="font-display text-[17px] font-semibold">Team Blue</span>
                </div>
                <div className="relative font-display text-[56px] font-bold tabular-nums leading-none text-blue-300">{blueScore}</div>
              </div>
            </>
          )}
          {/* Round info */}
          <div className="bg-white/[.06] border border-white/8 rounded-2xl px-[18px] py-4 text-center mt-auto">
            <div className="text-[11px] text-slate-400/40 uppercase tracking-widest mb-1.5">Step</div>
            <div className="font-display text-[28px] font-bold text-amber-400">
              {state.currentStepIndex + 1} / {flow.length || 1}
            </div>
          </div>
        </aside>

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

        {/* ── RIGHT: Leaderboard ── */}
        <aside>
          <div className="bg-white/[.06] border border-white/8 rounded-[20px] px-[18px] py-5 flex flex-col gap-1.5 backdrop-blur-sm">
            <div className="font-display text-[15px] font-semibold text-slate-300/65 mb-2 uppercase tracking-wider">🏆 Leaderboard</div>
            {leaderboard.map((s, i) => (
              <div key={s.id} className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl ${i === 0 ? 'bg-amber-400/10' : ''}`}>
                <span className="font-display text-base font-bold text-amber-400 w-6 text-center">{i + 1}</span>
                <div className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[17px] shrink-0" style={{ background: LEADERBOARD_GRADIENTS[i % LEADERBOARD_GRADIENTS.length] }}>
                  {s.avatar || '👤'}
                </div>
                <span className="font-display text-lg font-semibold flex-1 truncate">{s.name}</span>
                <span className="font-display text-xl font-bold text-blue-400 tabular-nums">{s.points || 0}</span>
              </div>
            ))}
            {leaderboard.length === 0 && <p className="text-slate-500 text-sm text-center py-4">No students yet</p>}
          </div>
        </aside>
      </main>

      {/* ═══ WHOSE-TURN BANNER (footer) ═══ */}
      <footer className="absolute bottom-0 left-0 right-0 h-[100px] flex items-center justify-center px-[270px] pb-[18px] z-10">
        {/* Round-mode badge */}
        <div className="absolute left-[274px] flex items-center gap-2 bg-white/[.06] border border-white/8 rounded-full px-5 py-2 backdrop-blur-sm">
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
              {turnStudent.avatar || '👤'}
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
