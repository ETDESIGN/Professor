// BoardTeamBattle v2 — Team tic-tac-toe + multi-type quiz (ASSESS phase).
//
// Rewritten per speedquiz-teambattle-v2-spec.md Part C:
//   • Dual-ledger: team aggregate (drives tic-tac-toe win) + individual
//     addPoints/recordAttempt/gradeObjective (spec C1).
//   • WORD_BANK_BUILD cells become Race Cells (both teams' reps assemble
//     simultaneously, higher LCS ratio wins) — spec C2.
//   • Stealing doesn't claw back the previous owner's points (spec C1).
//   • SLIDE_COMPLETE on tic-tac-toe win / draw / forced end.
//   • Consumes 6 exercise types via useQuizComposition.

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sword, Shield, Zap, Check, X, Trophy, Star, Volume2 } from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { makeRng } from '../../../services/seededRandom';
import { useQuizComposition, type QuizQuestion } from '../quizEngine';
import { computeLCSPartialCredit } from './BoardUnscramble';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { playCue } from './playCue';
import { recordAttempt } from '../../../services/attemptsLog';
import { gradeObjective } from '../../../services/boardLearner';
import { playAudioUrl } from '../../../services/SpeechService';
import type { PoolItem } from '../../../types/exercise';
import Avatar from '../../../components/shared/Avatar';

type Phase = 'pregame' | 'question' | 'choose_cell' | 'steal' | 'race' | 'victory';
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
  const { state, triggerConfetti, addPoints, pushToRemediation, triggerAction } = useSession();
  // FIXPLAN E1.5 — seeded team pick so tabs with matching game state pick the
  // same responder (TeamBattle's team machine is otherwise per-tab, §9).
  const seedBase = useSeedBase();
  const unitId = state.activeUnit?.id || '';
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);

  // ── Quiz composition (multi-type, mastery-weighted) ──────────────────
  const TOTAL_Q = 12;
  const { questions, loading } = useQuizComposition(unitId, TOTAL_Q, roster);

  // ── Game state ───────────────────────────────────────────────────────
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
  // Per-team consecutive-correct streak → scoreForAttempt 4th arg (no confetti
  // at team milestones — confetti is reserved for victory).
  const [teamStreak, setTeamStreak] = useState<Record<Team, number>>({ red: 0, blue: 0 });
  const stealRef = useRef(false);
  // Lifecycle trio (Aug-6 audit): wrong answers per question feed
  // scoreForAttempt's mistake deduction; awardedRef latches per attempt so a
  // question can only be scored once (double remote taps, timer-vs-answer
  // races). Both reset in nextRound (question advance) and on the steal re-arm
  // — the steal is a NEW attempt by the other team.
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);

  // Race cell state (WORD_BANK_BUILD)
  const [redPlacedTiles, setRedPlacedTiles] = useState<string[]>([]);
  const [bluePlacedTiles, setBluePlacedTiles] = useState<string[]>([]);
  const [raceComplete, setRaceComplete] = useState(false);

  const redMembers = state.students.filter(s => s.team === 'red');
  const blueMembers = state.students.filter(s => s.team === 'blue');
  const teamsReady = redMembers.length > 0 && blueMembers.length > 0;

  const currentQ = questions[qIndex % Math.max(1, questions.length)];
  const isRaceCell = currentQ?.exerciseType === 'WORD_BANK_BUILD';

  // ── Pregame countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'pregame') return;
    if (countdown <= 0) { setPhase('question'); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 800);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // ── Timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'question' && phase !== 'steal' && phase !== 'race') return;
    if (answerRevealed || raceComplete) return;
    if (timeLeft <= 0) {
      if (isRaceCell && phase === 'race') {
        handleRaceTimeout();
      } else {
        handleAnswer(-1);
      }
      return;
    }
    const t = setTimeout(() => setTimeLeft(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, phase, answerRevealed, raceComplete]);

  // ── Auto-play audio for LISTEN_SELECT ────────────────────────────────
  useEffect(() => {
    if ((phase === 'question' || phase === 'steal') && currentQ?.exerciseType === 'LISTEN_SELECT') {
      const audioUrl = (currentQ.item.content as any)?.audio_url;
      if (audioUrl) playAudioUrl(audioUrl).catch(() => {});
    }
  }, [phase, qIndex, currentQ]);

  // ── Remote ───────────────────────────────────────────────────────────
  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;
    if (a.type === 'RESET_GAME') { resetGame(); }
    else if (a.type === 'REVEAL_ANSWER' && !answerRevealed && (phase === 'question' || phase === 'steal')) {
      handleAnswer(-1);
    }
    else if (a.type === 'SWITCH_TURN' && (phase === 'question' || phase === 'steal')) {
      stealRef.current = false;
      // Manual hand-over = fresh attempt for the incoming team (otherwise the
      // stale awardedRef latch would dead-lock the new team's answer buttons).
      awardedRef.current = false;
      mistakesRef.current = 0;
      setActiveTeam(t => t === 'red' ? 'blue' : 'red');
      setSelectedTile(null);
      setAnswerRevealed(false);
      setTimeLeft(15);
      setPhase('question');
    }
    else if (a.type === 'RESET_TIMER' && (phase === 'question' || phase === 'steal')) {
      setTimeLeft(15);
    }
    else if (a.type === 'MARK_CORRECT' && (phase === 'question' || phase === 'steal')) {
      handleForceCorrect();
    }
  }, [state.lastAction]);

  // ── Game-lifecycle: new turn (NEW_TURN) — full battle reset ──────────
  // The last unfixed Aug-6 audit finding: without this, a newly picked
  // student inherited the previous battle's grid, turn tracker, phase and
  // steal state.
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return;
    resetGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId]);

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

  // ── Dual-write helper ────────────────────────────────────────────────
  const doDualWrite = useCallback((q: QuizQuestion, respondingStudent: any, correctness: 'correct' | 'partial' | 'incorrect', points: number) => {
    if (!respondingStudent) return;
    const student = (state.students || []).find((s: any) => s.id === respondingStudent);
    // Ledger 1: team aggregate (addPoints to the team's score)
    if (points !== 0) addPoints(respondingStudent, points);
    // Ledger 2: individual analytics + FSRS
    recordAttempt({
      rosterId: respondingStudent,
      classId: state.activeClassId,
      profileId: student?.claimed_profile_id ?? null,
      correctness,
      objectiveId: q.objectiveId,
      exerciseType: q.exerciseType,
      difficulty: q.difficulty,
    }).catch(() => {});
    if (unitId && !q.objectiveId.startsWith('frozen')) {
      const passed = correctness === 'correct' || correctness === 'partial';
      gradeObjective(respondingStudent, unitId, q.objectiveId, passed, 'receptive').catch(() => {});
    }
    // Remediation queue
    if (correctness === 'incorrect' || correctness === 'partial') {
      pushToRemediation(q.objectiveId, respondingStudent);
    }
  }, [state.students, state.activeClassId, addPoints, unitId, pushToRemediation]);

  // ── Pick student from active team (round-robin within team) ──────────
  const pickStudent = (team: Team) => {
    const members = team === 'red' ? redMembers : blueMembers;
    const gone = teamTurnTracker[team];
    const remaining = members.filter(m => !gone.includes(m.id));
    const pool = remaining.length > 0 ? remaining : members;
    const draw = makeRng(seedBase, team, gone.length, 'pick')();
    return pool[Math.floor(draw * pool.length)];
  };

  // ── Handle MCQ answer ────────────────────────────────────────────────
  function handleAnswer(tileIdx: number) {
    if (answerRevealed || awardedRef.current || !currentQ || isRaceCell) return;
    awardedRef.current = true;
    const isCorrect = tileIdx === (currentQ.item.content as any).correct_index;
    setSelectedTile(tileIdx);
    setAnswerRevealed(true);

    const picked = pickStudent(activeTeam);
    if (picked) {
      setTeamTurnTracker(prev => ({ ...prev, [activeTeam]: [...new Set([...prev[activeTeam], picked.id])] }));
      if (isCorrect) {
        const nextStreak = teamStreak[activeTeam] + 1;
        setTeamStreak(prev => ({ ...prev, [activeTeam]: nextStreak }));
        if (nextStreak === 3 || nextStreak === 5) playCue('streak');
        else playCue('correct');
        const points = scoreForAttempt(mistakesRef.current, currentQ.difficulty, 1.0, nextStreak);
        doDualWrite(currentQ, picked.id, 'correct', points);
      } else {
        // tileIdx -1 = timer expiry / forced REVEAL_ANSWER — no student tap,
        // the board reveals the answer: cue the reveal beat, not "wrong".
        if (tileIdx === -1) playCue('reveal');
        else playCue('wrong');
        mistakesRef.current += 1;
        setTeamStreak(prev => ({ ...prev, [activeTeam]: 0 }));
        doDualWrite(currentQ, picked.id, 'incorrect', -MISTAKE_PENALTY);
      }
    }

    setTimeout(() => {
      if (isCorrect) {
        setPhase('choose_cell');
      } else if (phase === 'question' && !stealRef.current) {
        // Steal! The steal is a NEW attempt by the other team — hand them a
        // fresh awardedRef + mistakesRef so their answer scores cleanly.
        stealRef.current = true;
        awardedRef.current = false;
        mistakesRef.current = 0;
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

  // ── MARK_CORRECT (teacher override): force-correct the current question
  // for the ACTIVE team — points go to the current pickStudent result and the
  // tic-tac-toe flow advances like a correct answer (choose a cell). The
  // awardedRef latch (reset per question / per steal) blocks double taps.
  function handleForceCorrect() {
    if ((phase !== 'question' && phase !== 'steal') || answerRevealed || awardedRef.current || !currentQ || isRaceCell) return;
    awardedRef.current = true;

    const picked = pickStudent(activeTeam);
    if (picked) {
      setTeamTurnTracker(prev => ({ ...prev, [activeTeam]: [...new Set([...prev[activeTeam], picked.id])] }));
      const nextStreak = teamStreak[activeTeam] + 1;
      setTeamStreak(prev => ({ ...prev, [activeTeam]: nextStreak }));
      if (nextStreak === 3 || nextStreak === 5) playCue('streak');
      else playCue('correct');
      const points = scoreForAttempt(mistakesRef.current, currentQ.difficulty, 1.0, nextStreak);
      doDualWrite(currentQ, picked.id, 'correct', points);
    }

    setSelectedTile((currentQ.item.content as any).correct_index);
    setAnswerRevealed(true);
    setTimeout(() => setPhase('choose_cell'), 2000);
  }

  // ── Handle Race Cell (WORD_BANK_BUILD) ───────────────────────────────
  function startRaceCell() {
    setRedPlacedTiles([]);
    setBluePlacedTiles([]);
    setRaceComplete(false);
    setPhase('race');
    setTimeLeft(15);
  }

  function handleRaceTilePlace(team: Team, word: string) {
    if (phase !== 'race' || raceComplete) return;
    if (team === 'red') {
      setRedPlacedTiles(prev => [...prev, word]);
    } else {
      setBluePlacedTiles(prev => [...prev, word]);
    }
  }

  function handleRaceTileRemove(team: Team, idx: number) {
    if (phase !== 'race' || raceComplete) return;
    if (team === 'red') {
      setRedPlacedTiles(prev => prev.filter((_, i) => i !== idx));
    } else {
      setBluePlacedTiles(prev => prev.filter((_, i) => i !== idx));
    }
  }

  function handleRaceTimeout() {
    if (raceComplete || !currentQ) return;
    setRaceComplete(true);

    const targetSentence = (currentQ.item.content as any)?.target_sentence || '';
    const targetTiles = targetSentence.split(/\s+/).filter(Boolean);
    const strip = (s: string) => s.replace(/[.,!?;:]/g, '');

    const redRatio = computeLCSPartialCredit(redPlacedTiles.map(strip), targetTiles.map(strip));
    const blueRatio = computeLCSPartialCredit(bluePlacedTiles.map(strip), targetTiles.map(strip));

    // Determine winner (ties favor red who placed first)
    const winnerTeam: Team = redRatio >= blueRatio ? 'red' : 'blue';
    const winnerRatio = winnerTeam === 'red' ? redRatio : blueRatio;

    // Score the winner
    const picked = pickStudent(winnerTeam);
    if (picked) {
      setTeamTurnTracker(prev => ({ ...prev, [winnerTeam]: [...new Set([...prev[winnerTeam], picked.id])] }));
      const correctness = winnerRatio >= 1 ? 'correct' : winnerRatio >= 0.5 ? 'partial' : 'incorrect';
      // Race win = success for the winner (streak extends when the assembly
      // was at least half right); the losing team's attempt failed → reset.
      const success = winnerRatio >= 0.5;
      const loserTeam: Team = winnerTeam === 'red' ? 'blue' : 'red';
      const nextStreak = success ? teamStreak[winnerTeam] + 1 : 0;
      setTeamStreak(prev => ({ ...prev, [winnerTeam]: nextStreak, [loserTeam]: 0 }));
      if (nextStreak === 3 || nextStreak === 5) playCue('streak');
      else playCue('win');
      const points = scoreForAttempt(0, currentQ.difficulty, winnerRatio, nextStreak);
      doDualWrite(currentQ, picked.id, correctness as any, points);
    }

    setTimeout(() => {
      setPhase('choose_cell');
    }, 2000);
  }

  // ── Handle cell claim ────────────────────────────────────────────────
  function handleCellClaim(idx: number) {
    if (grid[idx] !== null) return;
    const newGrid = [...grid];
    newGrid[idx] = activeTeam;
    setGrid(newGrid);

    const win = checkWin(newGrid);
    if (win) {
      setWinResult(win);
      setPhase('victory');
      playCue('win');
      triggerConfetti();
      triggerAction('SLIDE_COMPLETE', { forced: false });
    } else if (newGrid.every(c => c !== null)) {
      // Grid full — draw, whoever has more cells wins.
      const redCount = newGrid.filter(c => c === 'red').length;
      const blueCount = newGrid.filter(c => c === 'blue').length;
      const winnerTeam = redCount >= blueCount ? 'red' : 'blue';
      setWinResult({ team: winnerTeam as Team, line: [] });
      setPhase('victory');
      playCue('win');
      triggerConfetti();
      triggerAction('SLIDE_COMPLETE', { forced: false });
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
    // Question-advance path: fresh attempt latches for the next question.
    awardedRef.current = false;
    mistakesRef.current = 0;
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
    setTeamStreak({ red: 0, blue: 0 });
    setRedPlacedTiles([]);
    setBluePlacedTiles([]);
    setRaceComplete(false);
    stealRef.current = false;
    mistakesRef.current = 0;
    awardedRef.current = false;
    setCountdown(3);
    setPhase('pregame');
  }

  const redScore = grid.filter(c => c === 'red').length * 100;
  const blueScore = grid.filter(c => c === 'blue').length * 100;
  const activeMembers = activeTeam === 'red' ? redMembers : blueMembers;
  const waitingTeam = activeTeam === 'red' ? 'blue' : 'red';

  // ── Render helpers ───────────────────────────────────────────────────
  const getPromptText = (q: QuizQuestion) => {
    const c = q.item.content as any;
    switch (q.exerciseType) {
      case 'MEANING_MATCH': return `What does "${c.prompt}" mean?`;
      case 'SPELL_CLOZE': return c.sentence_with_blank || 'Fill in the blank:';
      case 'LISTEN_SELECT': return 'Listen and select the correct image:';
      case 'ERROR_SPOT': return `Find the error: "${c.sentence}"`;
      case 'STORY_COMPREHENSION': return c.prompt || 'Story question:';
      case 'WORD_BANK_BUILD': return `Build: "${c.target_sentence}"`;
      default: return 'Question:';
    }
  };

  const content = currentQ?.item.content as any;
  const isListenSelect = currentQ?.exerciseType === 'LISTEN_SELECT';

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

          {/* Question + tiles (MCQ) */}
          {(phase === 'question' || phase === 'steal') && currentQ && !isRaceCell && (
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
              <p className="font-display text-2xl font-bold text-slate-200 mb-3 text-center">{getPromptText(currentQ)}</p>

              {/* Audio play button for LISTEN_SELECT */}
              {isListenSelect && content?.audio_url && (
                <button onClick={() => playAudioUrl(content.audio_url).catch(() => {})} className="mb-2 flex items-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/40 rounded-full px-4 py-2">
                  <Volume2 size={20} className="text-blue-300" />
                  <span className="font-display text-sm font-bold text-blue-200">Tap to replay</span>
                </button>
              )}

              {/* Answer tiles */}
              {content?.options && (
                <div className="grid grid-cols-2 gap-3">
                  {content.options.map((opt: any, i: number) => {
                    const isCorrect = i === content.correct_index;
                    const isSelected = selectedTile === i;
                    const shape = TILE_SHAPES[i % 4];
                    const optText = isListenSelect ? opt?.label || opt?.image_url : opt;
                    return (
                      <motion.button key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                        onClick={() => handleAnswer(i)} disabled={answerRevealed}
                        className={`w-[150px] h-[80px] rounded-xl border-2 flex items-center justify-center gap-2 px-3 transition-all ${
                          answerRevealed && isCorrect ? 'border-green-400 bg-green-500/20 scale-105' :
                          answerRevealed && isSelected ? 'border-red-400 bg-red-500/10' :
                          `${shape.bg} border-transparent text-white hover:scale-105`
                        }`}>
                        <span className="text-2xl">{shape.shape}</span>
                        {isListenSelect && opt?.image_url ? (
                          <img src={opt.image_url} alt="" className="w-12 h-12 object-contain" />
                        ) : (
                          <span className="font-display text-base font-bold">{optText}</span>
                        )}
                        {answerRevealed && isCorrect && <Check size={18} className="text-green-400" strokeWidth={4} />}
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* Race Cell (WORD_BANK_BUILD) */}
          {phase === 'race' && currentQ && isRaceCell && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center w-full">
              <p className="font-display text-xl font-bold text-amber-300 mb-2">🏁 RACE CELL! Both teams build simultaneously!</p>
              <p className="font-display text-lg text-slate-300 mb-3">Build: "{content.target_sentence}"</p>

              {/* Timer */}
              <div className="relative mb-2" style={{ width: 60, height: 60 }}>
                <svg width="60" height="60" viewBox="0 0 100 100" className="-rotate-90">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="8" />
                  <circle cx="50" cy="50" r="45" fill="none" stroke={timeLeft <= 5 ? '#EF4444' : '#22C55E'} strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={2*Math.PI*45} strokeDashoffset={2*Math.PI*45*(1-timeLeft/15)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-display text-2xl font-black tabular-nums" style={{ color: timeLeft <= 5 ? '#EF4444' : '#fff' }}>{timeLeft}</span>
                </div>
              </div>

              {/* Red team's build */}
              <div className="flex gap-4 mb-3">
                <div className="flex-1">
                  <p className="text-sm font-bold text-red-400 mb-1">Red Team</p>
                  <div className="min-h-[60px] bg-red-500/10 border-2 border-red-500/30 rounded-xl p-2 flex flex-wrap gap-2">
                    {redPlacedTiles.map((w, i) => (
                      <button key={i} onClick={() => handleRaceTileRemove('red', i)} className="bg-white text-slate-900 text-lg font-bold px-3 py-1 rounded-lg">{w}</button>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-blue-400 mb-1">Blue Team</p>
                  <div className="min-h-[60px] bg-blue-500/10 border-2 border-blue-500/30 rounded-xl p-2 flex flex-wrap gap-2">
                    {bluePlacedTiles.map((w, i) => (
                      <button key={i} onClick={() => handleRaceTileRemove('blue', i)} className="bg-white text-slate-900 text-lg font-bold px-3 py-1 rounded-lg">{w}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Word bank */}
              <div className="flex flex-wrap justify-center gap-2">
                {(content.word_bank || []).map((word: string, i: number) => (
                  <button key={i} onClick={() => { handleRaceTilePlace(activeTeam, word); }}
                    className="bg-blue-500 hover:bg-blue-400 text-white text-lg font-bold px-4 py-2 rounded-xl shadow-[0_4px_0_0_#0b5cb5] transition-all">
                    {word}
                  </button>
                ))}
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
// Static Tailwind class maps (audit P1 fix): the previous `border-${color}-500`
// interpolations never survived JIT purging, so the team rails rendered with
// no color/border/glow. Static strings are scannable and always emitted.
const TEAM_RAIL_STYLES: Record<'red' | 'blue', { rail: string; railIdle: string; dot: string; label: string; score: string }> = {
  red: {
    rail: 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,.2)]',
    railIdle: 'border-red-500/30',
    dot: 'bg-red-500',
    label: 'text-red-400',
    score: 'text-red-300',
  },
  blue: {
    rail: 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,.2)]',
    railIdle: 'border-blue-500/30',
    dot: 'bg-blue-500',
    label: 'text-blue-400',
    score: 'text-blue-300',
  },
};

const TeamRosterColumn: React.FC<{ team: Team; members: any[]; score: number; active: boolean; winResult: boolean }> = ({ team, members, score, active, winResult }) => {
  const styles = team === 'red' ? TEAM_RAIL_STYLES.red : TEAM_RAIL_STYLES.blue;
  return (
    <div className={`w-[140px] shrink-0 rounded-2xl border-2 p-3 flex flex-col gap-2 transition-all ${
      active ? styles.rail : styles.railIdle
    } ${winResult ? 'ring-2 ring-amber-400' : ''}`}>
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${styles.dot}`} />
        <span className={`font-display text-sm font-bold ${styles.label}`}>Team {team === 'red' ? 'Red' : 'Blue'}</span>
      </div>
      <div className={`font-display text-3xl font-black tabular-nums ${styles.score} leading-none`}>{score}</div>
      <div className="flex flex-col gap-1 overflow-y-auto">
        {members.map((s: any, i: number) => (
          <div key={s.id} className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2 py-1">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0" style={{ background: GRADIENTS[i % GRADIENTS.length] }}><Avatar src={s.avatar} rosterId={s.id} name={s.name} size={24} /></div>
            <span className="font-display text-xs font-bold truncate">{s.name?.split(' ')[0]}</span>
          </div>
        ))}
      </div>
      {active && <div className="text-[10px] text-center font-bold text-amber-400 mt-auto">● ACTIVE</div>}
    </div>
  );
};

export default BoardTeamBattle;
