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
import { Sword, Shield, Zap, Check, X, Trophy, Star, Volume2, Flame, AlertTriangle, RefreshCw, RotateCw, Flag } from 'lucide-react';
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

type Phase = 'pregame' | 'question' | 'choose_cell' | 'steal' | 'word_bank' | 'victory';
type Team = 'red' | 'blue';

const WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const TILE_SHAPES = [
  { bg: 'bg-rose-500 hover:bg-rose-600', shape: '▲', label: 'A' },
  { bg: 'bg-blue-500 hover:bg-blue-600', shape: '◆', label: 'B' },
  { bg: 'bg-amber-400 hover:bg-amber-500 text-slate-900', shape: '●', label: 'C' },
  { bg: 'bg-emerald-500 hover:bg-emerald-600', shape: '■', label: 'D' },
];

const GRADIENTS = ['linear-gradient(135deg,#F97316,#EF4444)','linear-gradient(135deg,#F472B6,#A855F7)','linear-gradient(135deg,#FBBF24,#F97316)','linear-gradient(135deg,#3B82F6,#6366F1)','linear-gradient(135deg,#22C55E,#14B8A6)','linear-gradient(135deg,#06B6D4,#3B82F6)','linear-gradient(135deg,#A855F7,#6366F1)','linear-gradient(135deg,#64748B,#475569)'];

function checkWin(grid: (string|null)[]): { team: Team; line: number[] } | null {
  for (const line of WIN_LINES) {
    const [a,b,c] = line;
    if (grid[a] && grid[a] === grid[b] && grid[a] === grid[c]) return { team: grid[a] as Team, line };
  }
  return null;
}

function checkThreat(grid: (string | null)[]): { team: Team; threatIndex: number } | null {
  for (const t of ['red', 'blue'] as Team[]) {
    for (const line of WIN_LINES) {
      const [a, b, c] = line;
      const vals = [grid[a], grid[b], grid[c]];
      const countT = vals.filter(v => v === t).length;
      const countNull = vals.filter(v => v === null).length;
      if (countT === 2 && countNull === 1) {
        const threatIndex = [a, b, c].find(i => grid[i] === null);
        if (threatIndex !== undefined) {
          return { team: t, threatIndex };
        }
      }
    }
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
  const [winResult, setWinResult] = useState<{ team: Team | 'draw'; line: number[] } | null>(null);
  const [teamTurnTracker, setTeamTurnTracker] = useState<Record<Team, string[]>>({ red: [], blue: [] });
  const [teamStreak, setTeamStreak] = useState<Record<Team, number>>({ red: 0, blue: 0 });

  // Turn-based Word Bank challenge state (F3: replaces broken multi-touch race)
  const [placedWords, setPlacedWords] = useState<string[]>([]);

  const stealRef = useRef(false);
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  const advanceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const redMembers = (state.students || []).filter(s => s.team === 'red');
  const blueMembers = (state.students || []).filter(s => s.team === 'blue');
  const teamsReady = redMembers.length > 0 && blueMembers.length > 0;

  const currentQ = questions[qIndex % Math.max(1, questions.length)];
  const isWordBankCell = currentQ?.exerciseType === 'WORD_BANK_BUILD';
  const content = currentQ?.item?.content as any;
  const isListenSelect = currentQ?.exerciseType === 'LISTEN_SELECT';

  // Threat analysis for match points
  const activeThreat = useMemo(() => checkThreat(grid), [grid]);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  // ── Pregame countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'pregame') return;
    if (countdown <= 0) {
      setPhase(isWordBankCell ? 'word_bank' : 'question');
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 800);
    return () => clearTimeout(t);
  }, [phase, countdown, isWordBankCell]);

  // ── Timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'question' && phase !== 'steal' && phase !== 'word_bank') return;
    if (answerRevealed) return;
    if (timeLeft <= 0) {
      if (isWordBankCell) {
        handleCheckSentence();
      } else {
        handleAnswer(-1);
      }
      return;
    }
    const t = setTimeout(() => setTimeLeft(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, phase, answerRevealed, isWordBankCell]);

  // ── Auto-play audio for LISTEN_SELECT ────────────────────────────────
  useEffect(() => {
    if ((phase === 'question' || phase === 'steal') && isListenSelect) {
      const audioUrl = content?.audio_url;
      if (audioUrl) playAudioUrl(audioUrl).catch(() => {});
    }
  }, [phase, qIndex, isListenSelect, content]);

  const handledActionRef = useRef<any>(null);

  // ── Remote Action Listener (F1 / F2 parity) ──────────────────────────
  useEffect(() => {
    const a = state.lastAction;
    if (!a || a === handledActionRef.current) return;
    handledActionRef.current = a;

    if (a.type === 'RESET_GAME') {
      resetGame();
    } else if (a.type === 'REVEAL_ANSWER' && !answerRevealed && (phase === 'question' || phase === 'steal' || phase === 'word_bank')) {
      handleAnswer(-1);
    } else if (a.type === 'SWITCH_TURN' && (phase === 'question' || phase === 'steal' || phase === 'word_bank')) {
      stealRef.current = false;
      awardedRef.current = false;
      mistakesRef.current = 0;
      setActiveTeam(t => t === 'red' ? 'blue' : 'red');
      setSelectedTile(null);
      setAnswerRevealed(false);
      setTimeLeft(15);
      setPlacedWords([]);
      setPhase(isWordBankCell ? 'word_bank' : 'question');
    } else if (a.type === 'RESET_TIMER' && (phase === 'question' || phase === 'steal' || phase === 'word_bank')) {
      setTimeLeft(15);
    } else if (a.type === 'MARK_CORRECT' && (phase === 'question' || phase === 'steal' || phase === 'word_bank')) {
      handleForceCorrect();
    } else if (a.type === 'STEAL_TURN' && (phase === 'question' || phase === 'word_bank') && !stealRef.current) {
      handleTriggerSteal();
    } else if (a.type === 'CLAIM_CELL' && phase === 'choose_cell' && typeof a.payload?.cellIndex === 'number') {
      handleCellClaim(a.payload.cellIndex);
    }
  }, [state.lastAction, phase, answerRevealed, isWordBankCell]);

  // ── Lifecycle contract: NEW_TURN full battle reset ───────────────────
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return;
    resetGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((phase === 'question' || phase === 'steal') && !answerRevealed && !isWordBankCell) {
        if (e.key === '1' || e.key === 'a' || e.key === 'A') handleAnswer(0);
        else if (e.key === '2' || e.key === 'b' || e.key === 'B') handleAnswer(1);
        else if (e.key === '3' || e.key === 'c' || e.key === 'C') handleAnswer(2);
        else if (e.key === '4' || e.key === 'd' || e.key === 'D') handleAnswer(3);
        else if (e.key === ' ' && isListenSelect && content?.audio_url) {
          e.preventDefault();
          playAudioUrl(content.audio_url).catch(() => {});
        }
      } else if (phase === 'choose_cell') {
        const num = parseInt(e.key, 10);
        if (!isNaN(num) && num >= 1 && num <= 9) {
          handleCellClaim(num - 1);
        }
      } else if (phase === 'word_bank' && !answerRevealed) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleCheckSentence();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, answerRevealed, isWordBankCell, isListenSelect, content]);

  // ── Dual-write helper ────────────────────────────────────────────────
  const doDualWrite = useCallback((q: QuizQuestion, respondingStudent: any, correctness: 'correct' | 'partial' | 'incorrect', points: number) => {
    if (!respondingStudent) return;
    const student = (state.students || []).find((s: any) => s.id === respondingStudent);
    if (points !== 0) addPoints(respondingStudent, points);
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
    if (answerRevealed || awardedRef.current || !currentQ || isWordBankCell) return;
    awardedRef.current = true;
    const isCorrect = tileIdx === (currentQ.item.content as any)?.correct_index;
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
        if (tileIdx === -1) playCue('reveal');
        else playCue('wrong');
        mistakesRef.current += 1;
        setTeamStreak(prev => ({ ...prev, [activeTeam]: 0 }));
        doDualWrite(currentQ, picked.id, 'incorrect', -MISTAKE_PENALTY);
      }
    }

    advanceTimerRef.current = setTimeout(() => {
      if (isCorrect) {
        setPhase('choose_cell');
      } else if (phase === 'question' && !stealRef.current) {
        handleTriggerSteal();
      } else {
        stealRef.current = false;
        setActiveTeam(t => t === 'red' ? 'blue' : 'red');
        nextRound();
      }
    }, 1800);
  }

  // ── Steal Handler ────────────────────────────────────────────────────
  function handleTriggerSteal() {
    stealRef.current = true;
    awardedRef.current = false;
    mistakesRef.current = 0;
    setActiveTeam(t => t === 'red' ? 'blue' : 'red');
    setPhase(isWordBankCell ? 'word_bank' : 'steal');
    setSelectedTile(null);
    setAnswerRevealed(false);
    setTimeLeft(15);
  }

  // ── MARK_CORRECT (teacher override) ──────────────────────────────────
  function handleForceCorrect() {
    if ((phase !== 'question' && phase !== 'steal' && phase !== 'word_bank') || answerRevealed || awardedRef.current || !currentQ) return;
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

    if (!isWordBankCell) {
      setSelectedTile((currentQ.item.content as any)?.correct_index);
    }
    setAnswerRevealed(true);
    advanceTimerRef.current = setTimeout(() => setPhase('choose_cell'), 1600);
  }

  // ── Turn-based Word Bank handlers (F3: no impossible multi-touch) ─────
  function handleWordPlace(word: string) {
    if (phase !== 'word_bank' || answerRevealed) return;
    setPlacedWords(prev => [...prev, word]);
  }

  function handleWordRemove(idx: number) {
    if (phase !== 'word_bank' || answerRevealed) return;
    setPlacedWords(prev => prev.filter((_, i) => i !== idx));
  }

  function handleCheckSentence() {
    if (phase !== 'word_bank' || answerRevealed || awardedRef.current || !currentQ) return;
    awardedRef.current = true;
    setAnswerRevealed(true);

    const targetSentence = content?.target_sentence || '';
    const targetTiles = targetSentence.split(/\s+/).filter(Boolean);
    const strip = (s: string) => s.replace(/[.,!?;:]/g, '').toLowerCase();

    const ratio = computeLCSPartialCredit(placedWords.map(strip), targetTiles.map(strip));
    const isSuccess = ratio >= 0.5;

    const picked = pickStudent(activeTeam);
    if (picked) {
      setTeamTurnTracker(prev => ({ ...prev, [activeTeam]: [...new Set([...prev[activeTeam], picked.id])] }));
      const nextStreak = isSuccess ? teamStreak[activeTeam] + 1 : 0;
      setTeamStreak(prev => ({ ...prev, [activeTeam]: nextStreak }));
      if (isSuccess) {
        if (nextStreak === 3 || nextStreak === 5) playCue('streak');
        else playCue('correct');
        const points = scoreForAttempt(mistakesRef.current, currentQ.difficulty, ratio, nextStreak);
        doDualWrite(currentQ, picked.id, ratio >= 1 ? 'correct' : 'partial', points);
      } else {
        playCue('wrong');
        mistakesRef.current += 1;
        doDualWrite(currentQ, picked.id, 'incorrect', -MISTAKE_PENALTY);
      }
    }

    advanceTimerRef.current = setTimeout(() => {
      if (isSuccess) {
        setPhase('choose_cell');
      } else if (!stealRef.current) {
        handleTriggerSteal();
      } else {
        stealRef.current = false;
        setActiveTeam(t => t === 'red' ? 'blue' : 'red');
        nextRound();
      }
    }, 1800);
  }

  // ── Handle cell claim ────────────────────────────────────────────────
  function handleCellClaim(idx: number) {
    if (grid[idx] !== null || phase !== 'choose_cell') return;
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
      // Grid full — fair tiebreak resolution (F6)
      const redCount = newGrid.filter(c => c === 'red').length;
      const blueCount = newGrid.filter(c => c === 'blue').length;
      let winnerTeam: Team | 'draw' = 'draw';
      if (redCount > blueCount) winnerTeam = 'red';
      else if (blueCount > redCount) winnerTeam = 'blue';
      else {
        // Tiebreak by total team score points
        const redTotal = redScore + (activeTeam === 'red' ? 100 : 0);
        const blueTotal = blueScore + (activeTeam === 'blue' ? 100 : 0);
        if (redTotal > blueTotal) winnerTeam = 'red';
        else if (blueTotal > redTotal) winnerTeam = 'blue';
        else winnerTeam = 'draw';
      }
      setWinResult({ team: winnerTeam, line: [] });
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
    setQIndex(i => {
      const nextI = i + 1;
      const nextQ = questions[nextI % Math.max(1, questions.length)];
      setPhase(nextQ?.exerciseType === 'WORD_BANK_BUILD' ? 'word_bank' : 'question');
      return nextI;
    });
    setSelectedTile(null);
    setAnswerRevealed(false);
    setTimeLeft(15);
    setPlacedWords([]);
    awardedRef.current = false;
    mistakesRef.current = 0;
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
    setPlacedWords([]);
    stealRef.current = false;
    mistakesRef.current = 0;
    awardedRef.current = false;
    setCountdown(3);
    setPhase('pregame');
  }

  const redScore = grid.filter(c => c === 'red').length * 100;
  const blueScore = grid.filter(c => c === 'blue').length * 100;
  const activeStudent = pickStudent(activeTeam);
  const waitingTeam: Team = activeTeam === 'red' ? 'blue' : 'red';

  // ── Render helpers ───────────────────────────────────────────────────
  const getPromptText = (q: QuizQuestion) => {
    const c = q?.item?.content as any;
    if (!c) return 'Question:';
    switch (q.exerciseType) {
      case 'MEANING_MATCH': return `What does "${c.prompt}" mean?`;
      case 'SPELL_CLOZE': return c.sentence_with_blank || 'Fill in the blank:';
      case 'LISTEN_SELECT': return 'Listen and select the correct image:';
      case 'ERROR_SPOT': return `Find the error: "${c.sentence}"`;
      case 'STORY_COMPREHENSION': return c.prompt || 'Story question:';
      case 'WORD_BANK_BUILD': return `Build the sentence: "${c.target_sentence}"`;
      default: return 'Question:';
    }
  };

  if (!teamsReady) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center bg-slate-950">
        <Sword size={56} className="text-red-500/40 mb-4 animate-bounce" />
        <h2 className="font-display text-3xl font-bold text-white">Team Battle</h2>
        <p className="text-lg mt-2 text-slate-300">Form teams first (Baton → Teams button).</p>
        <p className="text-sm text-slate-500 mt-1 font-cn">先分组再对战</p>
      </div>
    );
  }

  if (loading || questions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 bg-slate-950">
        <p className="font-display text-2xl font-bold">{loading ? 'Loading questions…' : 'No questions found.'}</p>
      </div>
    );
  }

  return (
    <div className="tb-container h-full flex flex-col p-3 sm:p-5 relative overflow-hidden bg-[#070b16] select-none text-white">
      {/* ── Responsive Reflow Styles (700×320 Phone Floor, F5) ── */}
      <style>{`
        @media (max-height: 450px) {
          .tb-container { padding: 4px !important; gap: 4px !important; }
          .tb-roster-col { width: 95px !important; padding: 4px !important; }
          .tb-roster-list { display: none !important; }
          .tb-tactical-grid { width: 140px !important; gap: 3px !important; }
          .tb-cell { width: 42px !important; height: 42px !important; font-size: 16px !important; }
          .tb-timer-ring { width: 46px !important; height: 46px !important; margin-bottom: 2px !important; }
          .tb-timer-svg { width: 46px !important; height: 46px !important; }
          .tb-timer-text { font-size: 16px !important; }
          .tb-prompt-text { font-size: 15px !important; margin-bottom: 4px !important; line-height: 1.15 !important; }
          .tb-option-btn { width: 120px !important; height: 44px !important; padding: 4px 6px !important; font-size: 12px !important; }
          .tb-header-bar { margin-bottom: 2px !important; }
          .tb-wb-runway { min-height: 42px !important; padding: 4px !important; }
          .tb-wb-word { font-size: 13px !important; padding: 3px 8px !important; }
        }
      `}</style>

      {/* ── Top Header / Status Bar (Overscan cleared) ── */}
      <div className="tb-header-bar pl-28 lg:pl-44 pr-4 py-1.5 flex items-center justify-between border-b border-white/10 shrink-0 mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-900/80 px-3 py-1 rounded-full border border-slate-700/60 text-xs font-bold text-slate-300">
            <Flag size={14} className="text-amber-400" />
            <span>Round {Math.floor(qIndex / 2) + 1}</span>
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
            {currentQ?.exerciseType?.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Threat Alert: Match Point (P2) */}
        {activeThreat && phase !== 'victory' && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: [1, 1.05, 1], opacity: 1 }}
            transition={{ repeat: Infinity, duration: 1.2 }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider shadow-lg ${
              activeThreat.team === 'red'
                ? 'bg-red-500/20 text-red-300 border border-red-500/50 shadow-red-500/20'
                : 'bg-blue-500/20 text-blue-300 border border-blue-500/50 shadow-blue-500/20'
            }`}
          >
            <AlertTriangle size={14} className="text-amber-400 animate-pulse" />
            <span>⚠️ {activeThreat.team === 'red' ? 'RED' : 'BLUE'} TEAM MATCH POINT!</span>
          </motion.div>
        )}

        {/* Active turn badge */}
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${activeTeam === 'red' ? 'bg-red-500 animate-ping' : 'bg-blue-500 animate-ping'}`} />
          <span className={`font-display text-sm font-black ${activeTeam === 'red' ? 'text-red-400' : 'text-blue-400'}`}>
            {activeTeam === 'red' ? 'RED' : 'BLUE'} TEAM TURN
          </span>
        </div>
      </div>

      {/* ── Main Arena: Persistent 3-Column Split-Screen (F4) ── */}
      <div className="flex-1 flex items-stretch gap-3 sm:gap-4 min-h-0">
        {/* Left Column: Red Team Roster & Score */}
        <TeamRosterColumn
          team="red"
          members={redMembers}
          score={redScore}
          active={activeTeam === 'red'}
          streak={teamStreak.red}
          activeStudent={activeTeam === 'red' ? activeStudent : null}
          winResult={winResult?.team === 'red'}
        />

        {/* Center Stage: Challenge Zone */}
        <div className="flex-1 flex flex-col items-center justify-center min-w-0 bg-slate-900/40 rounded-2xl border border-white/5 p-3 relative overflow-hidden shadow-inner">
          {/* Pregame countdown */}
          {phase === 'pregame' && (
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="flex flex-col items-center text-center">
              <p className="font-display text-2xl sm:text-3xl font-black text-amber-300 mb-2 uppercase tracking-widest">
                Arena Clash! 准备对战!
              </p>
              <p className="text-slate-400 text-sm mb-4">First team to get 3-in-a-row claims victory!</p>
              <motion.div
                key={countdown}
                initial={{ scale: 1.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-8xl sm:text-9xl font-black text-red-500 drop-shadow-[0_0_35px_rgba(239,68,68,0.6)]"
              >
                {countdown > 0 ? countdown : 'GO!'}
              </motion.div>
            </motion.div>
          )}

          {/* Standard Question (MCQ / Cloze / Listen / Story) */}
          {(phase === 'question' || phase === 'steal') && currentQ && !isWordBankCell && (
            <div className="flex flex-col items-center w-full max-w-xl">
              {/* Steal Opportunity Banner */}
              {phase === 'steal' && (
                <motion.div
                  initial={{ y: -10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="mb-3 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/60 shadow-[0_0_15px_rgba(245,158,11,0.3)] flex items-center gap-2"
                >
                  <Zap size={18} className="text-amber-400 animate-bounce" />
                  <span className="font-display text-sm font-bold text-amber-300 uppercase tracking-wide">
                    ⚡ STEAL! {activeTeam === 'red' ? 'Red' : 'Blue'} Team can claim the cell!
                  </span>
                </motion.div>
              )}

              {/* Timer Ring */}
              <div className="tb-timer-ring relative mb-3" style={{ width: 68, height: 68 }}>
                <svg width="68" height="68" viewBox="0 0 100 100" className="tb-timer-svg -rotate-90">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="44" fill="none"
                    stroke={timeLeft <= 5 ? '#EF4444' : timeLeft <= 10 ? '#F97316' : '#10B981'}
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 44}
                    strokeDashoffset={2 * Math.PI * 44 * (1 - timeLeft / 15)}
                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className="tb-timer-text font-display text-2xl font-black tabular-nums"
                    style={{ color: timeLeft <= 5 ? '#EF4444' : '#fff' }}
                  >
                    {timeLeft}
                  </span>
                </div>
              </div>

              {/* Question Prompt */}
              <h2 className="tb-prompt-text font-display text-xl sm:text-2xl font-bold text-slate-100 mb-4 text-center px-2 leading-snug">
                {getPromptText(currentQ)}
              </h2>

              {/* Audio replay for LISTEN_SELECT */}
              {isListenSelect && content?.audio_url && (
                <button
                  onClick={() => playAudioUrl(content.audio_url).catch(() => {})}
                  className="mb-3 flex items-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/40 rounded-full px-4 py-1.5 transition-colors"
                >
                  <Volume2 size={18} className="text-blue-300" />
                  <span className="font-display text-xs font-bold text-blue-200">Tap to replay audio [SPACE]</span>
                </button>
              )}

              {/* 4 Option Buttons (▲, ◆, ●, ■) */}
              {content?.options && (
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  {content.options.map((opt: any, i: number) => {
                    const isCorrect = i === content.correct_index;
                    const isSelected = selectedTile === i;
                    const shape = TILE_SHAPES[i % 4];
                    const optText = isListenSelect ? opt?.label || opt?.image_url : opt;

                    return (
                      <motion.button
                        key={i}
                        whileHover={!answerRevealed ? { scale: 1.03 } : {}}
                        whileTap={!answerRevealed ? { scale: 0.97 } : {}}
                        onClick={() => handleAnswer(i)}
                        disabled={answerRevealed}
                        className={`tb-option-btn w-40 sm:w-56 h-16 sm:h-20 rounded-xl border-2 flex items-center justify-between px-3 sm:px-4 transition-all shadow-md ${
                          answerRevealed && isCorrect
                            ? 'border-emerald-400 bg-emerald-500/30 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.4)] scale-105'
                            : answerRevealed && isSelected
                            ? 'border-red-400 bg-red-500/20 text-red-200'
                            : `${shape.bg} border-transparent text-white`
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xl sm:text-2xl opacity-90">{shape.shape}</span>
                          {isListenSelect && opt?.image_url ? (
                            <img src={opt.image_url} alt="" className="w-10 h-10 object-contain rounded" />
                          ) : (
                            <span className="font-display text-sm sm:text-base font-bold truncate text-left">
                              {optText}
                            </span>
                          )}
                        </div>
                        {answerRevealed && isCorrect && (
                          <Check size={20} className="text-emerald-300 shrink-0" strokeWidth={3} />
                        )}
                        <span className="text-[10px] font-mono opacity-60 ml-1">[{shape.label}]</span>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Turn-Based Word Bank Challenge (F3: Replaces broken simultaneous race) */}
          {phase === 'word_bank' && currentQ && isWordBankCell && (
            <div className="flex flex-col items-center w-full max-w-xl">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-xs font-bold text-indigo-300">
                  Sentence Assembly Challenge
                </span>
                {stealRef.current && (
                  <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-xs font-bold text-amber-300">
                    ⚡ STEAL CHANCE
                  </span>
                )}
              </div>

              <h2 className="tb-prompt-text font-display text-lg sm:text-xl font-bold text-slate-100 mb-2 text-center">
                Build: "{content?.target_sentence}"
              </h2>

              {/* Timer */}
              <div className="tb-timer-ring relative mb-2" style={{ width: 56, height: 56 }}>
                <svg width="56" height="56" viewBox="0 0 100 100" className="tb-timer-svg -rotate-90">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="44" fill="none"
                    stroke={timeLeft <= 5 ? '#EF4444' : '#10B981'}
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 44}
                    strokeDashoffset={2 * Math.PI * 44 * (1 - timeLeft / 15)}
                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="tb-timer-text font-display text-xl font-black tabular-nums">{timeLeft}</span>
                </div>
              </div>

              {/* Placed Words Runway */}
              <div className={`tb-wb-runway w-full min-h-[56px] rounded-xl border-2 p-2 flex flex-wrap gap-2 items-center justify-center mb-3 transition-all ${
                activeTeam === 'red' ? 'bg-red-500/10 border-red-500/30' : 'bg-blue-500/10 border-blue-500/30'
              }`}>
                {placedWords.length === 0 ? (
                  <span className="text-xs text-slate-500 italic">Tap words below to assemble the sentence</span>
                ) : (
                  placedWords.map((word, i) => (
                    <button
                      key={i}
                      onClick={() => handleWordRemove(i)}
                      className="tb-wb-word bg-white text-slate-900 font-bold px-3 py-1.5 rounded-lg text-sm shadow hover:bg-rose-100 active:scale-95 transition-all"
                      title="Tap to return word"
                    >
                      {word} ✕
                    </button>
                  ))
                )}
              </div>

              {/* Word Bank Pool */}
              <div className="flex flex-wrap justify-center gap-2 mb-3">
                {(content?.word_bank || []).map((word: string, i: number) => {
                  const usedCount = placedWords.filter(w => w === word).length;
                  const totalCount = (content.word_bank as string[]).filter(w => w === word).length;
                  const disabled = usedCount >= totalCount || answerRevealed;

                  return (
                    <button
                      key={i}
                      onClick={() => handleWordPlace(word)}
                      disabled={disabled}
                      className={`tb-wb-word px-3.5 py-1.5 rounded-xl font-bold text-sm transition-all shadow ${
                        disabled
                          ? 'opacity-30 bg-slate-800 text-slate-500 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95'
                      }`}
                    >
                      {word}
                    </button>
                  );
                })}
              </div>

              {/* Check Answer Button */}
              <button
                onClick={handleCheckSentence}
                disabled={placedWords.length === 0 || answerRevealed}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-all text-sm"
              >
                <Check size={18} /> Check Sentence [ENTER]
              </button>
            </div>
          )}

          {/* Choose Cell Phase (Tactical Call to Action) */}
          {phase === 'choose_cell' && (
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center text-center p-4">
              <div className={`p-4 rounded-full mb-3 shadow-lg ${activeTeam === 'red' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
                <Trophy size={48} className="animate-bounce" />
              </div>
              <h2 className={`font-display text-3xl sm:text-4xl font-black mb-1 ${activeTeam === 'red' ? 'text-red-300' : 'text-blue-300'}`}>
                {activeTeam === 'red' ? '🔴 RED' : '🔵 BLUE'} TEAM!
              </h2>
              <p className="font-display text-xl font-bold text-amber-300 mb-1">
                Claim Your Cell! 选一个格子!
              </p>
              <p className="text-xs text-slate-400 max-w-sm">
                Tap an open square on the Tactical Arena to the right to place your mark.
              </p>
            </motion.div>
          )}

          {/* Victory / Game Over */}
          {phase === 'victory' && winResult && (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center text-center p-4">
              <Trophy
                size={64}
                className={winResult.team === 'red' ? 'text-red-400 mb-2' : winResult.team === 'blue' ? 'text-blue-400 mb-2' : 'text-amber-400 mb-2'}
              />
              <h2
                className={`font-display text-4xl sm:text-5xl font-black mb-1 ${
                  winResult.team === 'red' ? 'text-red-300' : winResult.team === 'blue' ? 'text-blue-300' : 'text-amber-300'
                }`}
              >
                {winResult.team === 'red'
                  ? '🟥 Red Team Wins!'
                  : winResult.team === 'blue'
                  ? '🟦 Blue Team Wins!'
                  : '🤝 Epic Battle Draw!'}
              </h2>
              <p className="font-cn text-lg text-slate-400 mb-4">
                {winResult.team === 'red' ? '红队获胜！' : winResult.team === 'blue' ? '蓝队获胜！' : '平局！双方势均力敌！'}
              </p>

              {/* Final score compare */}
              <div className="flex gap-8 bg-slate-950/60 px-6 py-3 rounded-2xl border border-white/10 mb-4">
                <div className="text-center">
                  <div className="text-2xl sm:text-3xl font-black text-red-400">{redScore}</div>
                  <div className="text-xs text-slate-500 font-bold uppercase">Red Cells</div>
                </div>
                <div className="w-px bg-white/10" />
                <div className="text-center">
                  <div className="text-2xl sm:text-3xl font-black text-blue-400">{blueScore}</div>
                  <div className="text-xs text-slate-500 font-bold uppercase">Blue Cells</div>
                </div>
              </div>

              <button
                onClick={resetGame}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-full font-bold text-slate-200 transition-all active:scale-95"
              >
                <RotateCw size={18} /> Play Again
              </button>
            </motion.div>
          )}
        </div>

        {/* Right Wing: Permanent 3×3 Tactical Tic-Tac-Toe Arena (F4) + Blue Team Column */}
        <div className="flex items-stretch gap-3 shrink-0">
          {/* Tactical 3×3 Grid */}
          <div className="tb-tactical-grid w-48 sm:w-60 bg-slate-900/60 rounded-2xl border border-white/10 p-2 sm:p-3 flex flex-col items-center justify-between">
            <div className="flex items-center gap-1.5 mb-1 text-center">
              <Shield size={14} className="text-amber-400" />
              <span className="font-display text-xs font-bold uppercase tracking-wider text-slate-300">
                Tactical 3×3 Arena
              </span>
            </div>

            {/* 3×3 Grid Cells */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 my-auto">
              {grid.map((cell, i) => {
                const isThreatCell = activeThreat?.threatIndex === i;
                const isWinningCell = winResult?.line?.includes(i);
                const isClaimable = phase === 'choose_cell' && cell === null;

                return (
                  <motion.button
                    key={i}
                    onClick={() => handleCellClaim(i)}
                    disabled={cell !== null || phase !== 'choose_cell'}
                    whileHover={isClaimable ? { scale: 1.08 } : {}}
                    whileTap={isClaimable ? { scale: 0.95 } : {}}
                    className={`tb-cell w-14 h-14 sm:w-16 sm:h-16 rounded-xl border-2 flex flex-col items-center justify-center font-black relative transition-all ${
                      cell === 'red'
                        ? 'bg-red-500/30 border-red-500 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                        : cell === 'blue'
                        ? 'bg-blue-500/30 border-blue-500 text-blue-200 shadow-[0_0_15px_rgba(59,130,246,0.4)]'
                        : isClaimable
                        ? 'border-amber-400 bg-amber-400/20 text-amber-300 animate-pulse cursor-pointer shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                        : isThreatCell
                        ? 'border-amber-500/60 bg-slate-800/80 text-slate-500 animate-pulse'
                        : 'border-white/10 bg-slate-900/40 text-slate-600'
                    } ${isWinningCell ? 'ring-4 ring-amber-400 animate-bounce' : ''}`}
                  >
                    {cell === 'red' ? (
                      <span className="text-2xl">🔴</span>
                    ) : cell === 'blue' ? (
                      <span className="text-2xl">🔵</span>
                    ) : isClaimable ? (
                      <span className="text-xs font-bold text-amber-300">CLAIM</span>
                    ) : (
                      <span className="text-[10px] font-mono opacity-40">{i + 1}</span>
                    )}
                  </motion.button>
                );
              })}
            </div>

            <div className="text-[10px] text-slate-500 font-mono text-center">
              {phase === 'choose_cell' ? 'Tap an open cell' : '3 in a row wins'}
            </div>
          </div>

          {/* Blue Team Column */}
          <TeamRosterColumn
            team="blue"
            members={blueMembers}
            score={blueScore}
            active={activeTeam === 'blue'}
            streak={teamStreak.blue}
            activeStudent={activeTeam === 'blue' ? activeStudent : null}
            winResult={winResult?.team === 'blue'}
          />
        </div>
      </div>

      {/* ── Footer / Instructor Hint ── */}
      <div className="mt-2 flex items-center justify-center gap-3 text-xs text-slate-500 shrink-0">
        <span>Team Battle ASSESS</span>
        <span>·</span>
        <span className="font-cn">老师提问，团队协同作答，争夺九宫格</span>
      </div>
    </div>
  );
};

// ── Team Roster Column Component ─────────────────────────────────────────
const TEAM_RAIL_STYLES: Record<'red' | 'blue', { rail: string; railIdle: string; dot: string; label: string; score: string }> = {
  red: {
    rail: 'border-red-500 bg-red-500/5 shadow-[0_0_20px_rgba(239,68,68,0.25)]',
    railIdle: 'border-red-500/30 bg-slate-900/40 opacity-80',
    dot: 'bg-red-500',
    label: 'text-red-400',
    score: 'text-red-300',
  },
  blue: {
    rail: 'border-blue-500 bg-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.25)]',
    railIdle: 'border-blue-500/30 bg-slate-900/40 opacity-80',
    dot: 'bg-blue-500',
    label: 'text-blue-400',
    score: 'text-blue-300',
  },
};

const TeamRosterColumn: React.FC<{
  team: Team;
  members: any[];
  score: number;
  active: boolean;
  streak: number;
  activeStudent?: any;
  winResult: boolean;
}> = ({ team, members, score, active, streak, activeStudent, winResult }) => {
  const styles = team === 'red' ? TEAM_RAIL_STYLES.red : TEAM_RAIL_STYLES.blue;

  return (
    <div
      className={`tb-roster-col w-32 sm:w-36 shrink-0 rounded-2xl border-2 p-3 flex flex-col justify-between transition-all ${
        active ? styles.rail : styles.railIdle
      } ${winResult ? 'ring-4 ring-amber-400' : ''}`}
    >
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${styles.dot}`} />
            <span className={`font-display text-xs font-bold uppercase tracking-wider ${styles.label}`}>
              {team === 'red' ? 'Red Team' : 'Blue Team'}
            </span>
          </div>
          {streak >= 2 && (
            <div className="flex items-center gap-0.5 text-[10px] font-bold text-amber-400">
              <Flame size={12} className="fill-amber-400" />
              <span>{streak}</span>
            </div>
          )}
        </div>

        <div className={`font-display text-3xl font-black tabular-nums ${styles.score} leading-tight mb-2`}>
          {score}
        </div>

        {/* Active Challenger Callout */}
        {active && activeStudent && (
          <div className="mb-2 p-1.5 rounded-xl bg-white/10 border border-white/20 flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0">
              <Avatar src={activeStudent.avatar} rosterId={activeStudent.id} name={activeStudent.name} size={24} />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-mono uppercase text-amber-300 font-bold leading-none">Challenger</div>
              <div className="font-display text-xs font-bold text-white truncate">{activeStudent.name?.split(' ')[0]}</div>
            </div>
          </div>
        )}

        {/* Student Roster List */}
        <div className="tb-roster-list flex flex-col gap-1 overflow-y-auto max-h-48">
          {members.map((s: any, i: number) => {
            const isRep = active && activeStudent?.id === s.id;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1 transition-all ${
                  isRep ? 'bg-amber-400/20 border border-amber-400/40 text-amber-200' : 'bg-white/5 text-slate-300'
                }`}
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 overflow-hidden"
                  style={{ background: GRADIENTS[i % GRADIENTS.length] }}
                >
                  <Avatar src={s.avatar} rosterId={s.id} name={s.name} size={20} />
                </div>
                <span className="font-display text-xs font-bold truncate">{s.name?.split(' ')[0]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {active && (
        <div className="text-[10px] text-center font-bold text-amber-400 mt-2 py-1 bg-amber-400/10 rounded-md border border-amber-400/20">
          ● ACTIVE
        </div>
      )}
    </div>
  );
};

export default BoardTeamBattle;
