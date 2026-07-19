// BoardTeamBattle — Team tic-tac-toe + quiz game (ASSESS phase).
// REBUILT FROM CLAUDE'S DESIGN DOC (team-battle-screen.md).
//
// Full game: pre-game countdown → question+timer → correct=claim cell /
// wrong=steal → 3-in-a-row=victory. Split-screen rosters + grid + VS.
//
// State machine: PREGAME → QUESTION → CHOOSE_CELL → (next round or VICTORY)
//                           ↘ STEAL → CHOOSE_CELL ↗

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sword, Shield, Zap, Check, X, Trophy, Star } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useBoardPool } from '../useBoardPool';
import { gradeStudent } from '../../../services/boardLearner';
import { toPoolItem } from '../../../types/exercise';

type Phase = 'pregame' | 'question' | 'choose_cell' | 'steal' | 'victory';
type Team = 'red' | 'blue';

const WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const TILE_SHAPES = [
  { bg: 'bg-rose-500', shape: '▲', label: 'A' },
  { bg: 'bg-blue-500', shape: '◆', label: 'B' },
  { bg: 'bg-amber-400 text-slate-900', shape: '●', label: 'C' },
  { bg: 'bg-green-500', shape: '■', label: 'D' },
];

const GRADIENTS = ['linear-gradient(135deg,#F97316,#EF4444)','linear-gradient(135deg,#F472B6,#A855F7)','linear-gradient(135deg,#FBBF24,#F97316)','linear-gradient(135deg,#3B82F6,#6366F1)','linear-gradient(135deg,#22C55E,#14B8A6)','linear-gradient(135deg,#06B6D4,#3B82F6)','linear-gradient(135deg,#A855F7,#6366F1)','linear-gradient(135deg,#64748B,#475569)'];

function checkWin(grid: (string|null)[]): { team: Team; line: number[] } | null {
  for (const line of WIN_LINES) {
    const [a,b,c] = line;
    if (grid[a] && grid[a] === grid[b] && grid[a] === grid[c]) return { team: grid[a] as Team, line };
  }
  return null;
}

const BoardTeamBattle = ({ data }: { data: any }) => {
  const { state, triggerConfetti } = useSession();
  const unitId = state.activeUnit?.id || '';
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);

  // Pool (MEANING_MATCH, class-weak).
  const { items: poolItems, loading } = useBoardPool({ unitId, exerciseTypes: ['MEANING_MATCH'], classWeak: true, roster, limit: 12 });
  const frozenQs = useMemo(() => (Array.isArray(data?.questions) ? data.questions : []), [data?.questions]);

  const questions = useMemo(() => {
    if (frozenQs.length > 0) return frozenQs;
    return poolItems.map(it => {
      const c: any = it.content;
      return { word: c?.prompt, text: `What does "${c?.prompt}" mean?`, options: c?.options || [], correct: c?.options?.[c.correct_index], correctIdx: c.correct_index };
    }).filter(q => q.options.length > 1);
  }, [frozenQs, poolItems]);

  // ── Game state ─────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('pregame');
  const [countdown, setCountdown] = useState(3);
  const [grid, setGrid] = useState<(string|null)[]>(Array(9).fill(null));
  const [activeTeam, setActiveTeam] = useState<Team>('red');
  const [qIndex, setQIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [winResult, setWinResult] = useState<{ team: Team; line: number[] } | null>(null);
  const [teamTurnTracker, setTeamTurnTracker] = useState<Record<Team, string[]>>({ red: [], blue: [] });
  const stealRef = useRef(false);

  const redMembers = state.students.filter(s => s.team === 'red');
  const blueMembers = state.students.filter(s => s.team === 'blue');
  const teamsReady = redMembers.length > 0 && blueMembers.length > 0;

  const currentQ = questions[qIndex % Math.max(1, questions.length)];

  // ── Pregame countdown ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'pregame') return;
    if (countdown <= 0) { setPhase('question'); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 800);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // ── Timer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'question' && phase !== 'steal') return;
    if (answerRevealed) return;
    if (timeLeft <= 0) { handleAnswer(-1); return; }
    const t = setTimeout(() => setTimeLeft(p => p - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [timeLeft, phase, answerRevealed]);

  // ── Remote ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;
    if (a.type === 'RESET_GAME') { resetGame(); }
    else if (a.type === 'REVEAL_ANSWER' && !answerRevealed && (phase === 'question' || phase === 'steal')) {
      handleAnswer(-1); // force reveal
    }
    // eslint-disable-next-line
  }, [state.lastAction]);

  // RULES OF HOOKS: all hooks above.
  if (!teamsReady) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
        <Sword size={56} className="text-red-500/40 mb-4" />
        <h2 className="font-display text-3xl font-bold">Team Battle</h2>
        <p className="text-lg mt-2">Form teams first (Baton → Teams button).</p>
        <p className="text-sm text-slate-500 mt-1 font-cn">先分组再对战</p>
      </div>
    );
  }

  if (loading || questions.length === 0) {
    return <div className="h-full flex items-center justify-center text-slate-400"><p className="font-display text-2xl">{loading ? 'Loading…' : 'No questions.'}</p></div>;
  }

  // ── Pick student from active team (round-robin within team) ────────────
  const pickStudent = (team: Team) => {
    const members = team === 'red' ? redMembers : blueMembers;
    const gone = teamTurnTracker[team];
    const remaining = members.filter(m => !gone.includes(m.id));
    const pool = remaining.length > 0 ? remaining : members;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  // ── Handle answer ──────────────────────────────────────────────────────
  function handleAnswer(tileIdx: number) {
    if (answerRevealed) return;
    const isCorrect = tileIdx === currentQ.correctIdx;
    setSelectedTile(tileIdx);
    setAnswerRevealed(true);

    // Grade the picked student.
    const picked = state.quickWheelWinner;
    if (picked && unitId && currentQ.word) gradeStudent(picked, unitId, currentQ.word, isCorrect).catch(() => {});

    // Track turn.
    if (picked) setTeamTurnTracker(prev => ({ ...prev, [activeTeam]: [...new Set([...prev[activeTeam], picked])] }));

    setTimeout(() => {
      if (isCorrect) {
        setPhase('choose_cell');
      } else if (phase === 'question' && !stealRef.current) {
        // Steal!
        stealRef.current = true;
        setActiveTeam(t => t === 'red' ? 'blue' : 'red');
        setPhase('steal');
        setSelectedTile(null);
        setAnswerRevealed(false);
        setTimeLeft(15);
      } else {
        // Both wrong or steal failed — round ends.
        stealRef.current = false;
        setActiveTeam(t => t === 'red' ? 'blue' : 'red');
        nextRound();
      }
    }, 2000);
  }

  // ── Handle cell claim ──────────────────────────────────────────────────
  function handleCellClaim(idx: number) {
    if (grid[idx] !== null) return;
    const newGrid = [...grid];
    newGrid[idx] = activeTeam;
    setGrid(newGrid);

    const win = checkWin(newGrid);
    if (win) {
      setWinResult(win);
      setPhase('victory');
      triggerConfetti();
    } else if (newGrid.every(c => c !== null)) {
      // Grid full — draw, whoever has more cells wins.
      const redCount = newGrid.filter(c => c === 'red').length;
      const blueCount = newGrid.filter(c => c === 'blue').length;
      const winnerTeam = redCount >= blueCount ? 'red' : 'blue';
      setWinResult({ team: winnerTeam as Team, line: [] });
      setPhase('victory');
      triggerConfetti();
    } else {
      stealRef.current = false;
      setActiveTeam(t => t === 'red' ? 'blue' : 'red');
      nextRound();
    }
  }

  function nextRound() {
    setQIndex(i => i + 1);
    setSelectedTile(null);
    setAnswerRevealed(false);
    setTimeLeft(15);
    setPhase('question');
  }

  function resetGame() {
    setGrid(Array(9).fill(null));
    setActiveTeam('red');
    setQIndex(0);
    setTimeLeft(15);
    setSelectedTile(null);
    setAnswerRevealed(false);
    setWinResult(null);
    setTeamTurnTracker({ red: [], blue: [] });
    stealRef.current = false;
    setCountdown(3);
    setPhase('pregame');
  }

  const redScore = grid.filter(c => c === 'red').length * 100;
  const blueScore = grid.filter(c => c === 'blue').length * 100;
  const activeMembers = activeTeam === 'red' ? redMembers : blueMembers;
  const waitingTeam = activeTeam === 'red' ? 'blue' : 'red';

  // ═══ RENDER ═══
  return (
    <div className="h-full flex flex-col p-4 pt-6 relative overflow-hidden">
      {/* ── Split-screen rosters + grid ── */}
      <div className="flex-1 flex items-stretch gap-3 min-h-0">
        {/* Red roster */}
        <TeamRosterColumn team="red" members={redMembers} score={redScore} active={activeTeam === 'red'} winResult={winResult?.team === 'red'} />

        {/* Center: grid OR question */}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 min-w-0">
          {/* Pregame countdown */}
          {phase === 'pregame' && (
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="flex flex-col items-center">
              <p className="font-display text-2xl font-bold text-slate-300 mb-2">Battle Start!</p>
              <motion.div key={countdown} initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-9xl font-black text-red-500">
                {countdown > 0 ? countdown : 'GO!'}
              </motion.div>
            </motion.div>
          )}

          {/* Question + tiles */}
          {(phase === 'question' || phase === 'steal') && currentQ && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center w-full">
              {/* Steal banner */}
              {phase === 'steal' && (
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="mb-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/40">
                  <span className="font-display text-sm font-bold text-amber-300">🔁 {waitingTeam === 'red' ? 'Red' : 'Blue'} Team — Steal the chance!</span>
                </motion.div>
              )}

              {/* Timer ring */}
              <div className="relative mb-2" style={{ width: 80, height: 80 }}>
                <svg width="80" height="80" viewBox="0 0 100 100" className="-rotate-90">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="8" />
                  <circle cx="50" cy="50" r="45" fill="none" stroke={timeLeft <= 5 ? '#EF4444' : timeLeft <= 10 ? '#F97316' : '#22C55E'} strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={2*Math.PI*45} strokeDashoffset={2*Math.PI*45*(1-timeLeft/15)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-display text-3xl font-black tabular-nums" style={{ color: timeLeft <= 5 ? '#EF4444' : '#fff' }}>{timeLeft}</span>
                </div>
              </div>

              {/* Question */}
              <p className="font-display text-2xl font-bold text-slate-200 mb-3 text-center">{currentQ.text}</p>

              {/* Answer tiles */}
              <div className="grid grid-cols-2 gap-3">
                {currentQ.options.map((opt: string, i: number) => {
                  const isCorrect = i === currentQ.correctIdx;
                  const isSelected = selectedTile === i;
                  const shape = TILE_SHAPES[i % 4];
                  return (
                    <motion.button key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                      onClick={() => handleAnswer(i)} disabled={answerRevealed}
                      className={`w-[150px] h-[80px] rounded-xl border-2 flex items-center justify-center gap-2 px-3 transition-all ${
                        answerRevealed && isCorrect ? 'border-green-400 bg-green-500/20 scale-105' :
                        answerRevealed && isSelected ? 'border-red-400 bg-red-500/10' :
                        `${shape.bg} border-transparent text-white hover:scale-105`
                      }`}>
                      <span className="text-2xl">{shape.shape}</span>
                      <span className="font-display text-base font-bold">{opt}</span>
                      {answerRevealed && isCorrect && <Check size={18} className="text-green-400" strokeWidth={4} />}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Choose cell */}
          {phase === 'choose_cell' && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center">
              <p className="font-display text-xl font-bold text-amber-300 mb-3">Choose your cell! 选一个格子!</p>
              <div className="grid grid-cols-3 gap-2">
                {grid.map((cell, i) => (
                  <motion.button key={i}
                    onClick={() => handleCellClaim(i)}
                    disabled={cell !== null}
                    whileHover={cell === null ? { scale: 1.08 } : {}}
                    whileTap={cell === null ? { scale: 0.95 } : {}}
                    className={`w-[80px] h-[80px] rounded-xl border-2 flex items-center justify-center text-3xl transition-all ${
                      cell === 'red' ? 'bg-red-500/30 border-red-400 shadow-[0_0_15px_rgba(239,68,68,.3)]' :
                      cell === 'blue' ? 'bg-blue-500/30 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,.3)]' :
                      'border-white/10 bg-white/5 hover:border-amber-400 animate-pulse'
                    }`}>
                    {cell === 'red' ? '🔴' : cell === 'blue' ? '🔵' : ''}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Victory */}
          {phase === 'victory' && winResult && (
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center text-center">
              <Trophy size={64} className={winResult.team === 'red' ? 'text-red-400 mb-3' : 'text-blue-400 mb-3'} />
              <h2 className={`font-display text-5xl font-black mb-2 ${winResult.team === 'red' ? 'text-red-300' : 'text-blue-300'}`}>
                {winResult.team === 'red' ? '🟥 Red' : '🟦 Blue'} Team Wins!
              </h2>
              <p className="font-cn text-xl text-slate-400">{winResult.team === 'red' ? '红队获胜！' : '蓝队获胜！'}</p>
              {/* Score comparison */}
              <div className="flex gap-6 mt-4">
                <div className="text-center"><div className="text-3xl font-black text-red-300">{redScore}</div><div className="text-xs text-slate-500">Red</div></div>
                <div className="text-center"><div className="text-3xl font-black text-blue-300">{blueScore}</div><div className="text-xs text-slate-500">Blue</div></div>
              </div>
              <button onClick={resetGame} className="mt-4 bg-white/10 hover:bg-white/20 px-6 py-2 rounded-full font-bold text-slate-200">Play Again</button>
            </motion.div>
          )}
        </div>

        {/* Blue roster */}
        <TeamRosterColumn team="blue" members={blueMembers} score={blueScore} active={activeTeam === 'blue'} winResult={winResult?.team === 'blue'} />
      </div>

      {/* Footer: round info */}
      <div className="mt-2 flex items-center justify-center gap-3 text-xs text-slate-400/50">
        <span>Round {Math.floor(qIndex / 2) + 1}</span>
        <span>·</span>
        <span className="font-cn">老师提问，团队作答</span>
      </div>
    </div>
  );
};

// ── Team roster column component ─────────────────────────────────────────
const TeamRosterColumn: React.FC<{ team: Team; members: any[]; score: number; active: boolean; winResult: boolean }> = ({ team, members, score, active, winResult }) => {
  const color = team === 'red' ? 'red' : 'blue';
  return (
    <div className={`w-[140px] shrink-0 rounded-2xl border-2 p-3 flex flex-col gap-2 transition-all ${
      active ? `border-${color}-500 shadow-[0_0_20px_rgba(${color==='red'?'239,68,68':'59,130,246'},.2)]` : `border-${color}-500/30`
    } ${winResult ? 'ring-2 ring-amber-400' : ''}`}>
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full bg-${color}-500`} />
        <span className={`font-display text-sm font-bold text-${color}-400`}>Team ${color === 'red' ? 'Red' : 'Blue'}</span>
      </div>
      <div className={`font-display text-3xl font-black tabular-nums text-${color}-300 leading-none`}>{score}</div>
      <div className="flex flex-col gap-1 overflow-y-auto">
        {members.map((s: any, i: number) => (
          <div key={s.id} className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2 py-1">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0" style={{ background: GRADIENTS[i % GRADIENTS.length] }}>{s.avatar || '👤'}</div>
            <span className="font-display text-xs font-bold truncate">{s.name?.split(' ')[0]}</span>
          </div>
        ))}
      </div>
      {active && <div className="text-[10px] text-center font-bold text-amber-400 mt-auto">● ACTIVE</div>}
    </div>
  );
};

export default BoardTeamBattle;
