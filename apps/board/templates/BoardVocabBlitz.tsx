// BoardVocabBlitz — Reformed speed quiz game (NEW GEN)
//
// Replaces: BoardSpeedQuiz (anxiety-inducing 15s one-shot)
//
// Pedagogical Loop:
//   1. SHOW question with adaptive timer (15s recognition, 25s production)
//   2. STUDENT answers (one retry allowed - 50% points on retry)
//   3. INSTANT feedback with correct answer highlighted
//   4. STREAK BONUS if consecutive correct
//   5. "Bet" mechanic for metacognition (1x or 2x before question)
//   6. Final Blitz round as closer
//
// Zero teacher typing. All tap-driven. Full lifecycle compliance.
//
// 2026-08-17 steal mechanic: STEAL_OFFER lands at the REVEAL moment — i.e.
// when revealCorrect is true (the retry was exhausted by a 2nd miss, OR the
// timeout fired — both reveal). A 1st miss does NOT open the window (the
// student's own retry is still live); the tap is a no-op there. On offer:
// the reveal→advance timer is cancelled, the countdown pauses, and the
// per-turn reset is suppressed so the stealer pick's NEW_TURN can't wipe the
// question. The picked stealer re-answers the SAME question UNTIMED for half
// of base (bets ignored on steals), one steal per question (latched).

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Flame, TrendingUp, TrendingDown, Trophy, Zap } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useBoardPool } from '../useBoardPool';
import { scoreForAttempt, MISTAKE_PENALTY, MAX_QUESTION_POINTS } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { logAttempt } from './scoreAttempt';
import { playCue } from './playCue';
import type { PoolItem } from '../../../types/exercise';

/** MCQ option — IMAGE_SELECT rows carry {image_url, label?} objects. */
interface QuizOption {
  label: string;
  imageUrl?: string;
}

interface QuizQuestion {
  poolItem: PoolItem;
  prompt: string;
  options: QuizOption[];
  correctIndex: number;
  /** Teaching text for the reveal beat (ERROR_SPOT/GRAMMAR_FILL carry one). */
  explanation?: string;
}

/** MCQ-only pool → single recognition timing (25s production tier removed). */
const QUESTION_TIME_LIMIT = 15;

/** Steal banner render state (STEAL_OFFER flow). Null = no steal live. */
type StealBanner =
  | { kind: 'offer' }
  | { kind: 'active'; name: string }
  | { kind: 'stolen'; name: string; points: number };

const BoardVocabBlitz = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation, triggerAction, triggerConfetti } = useSession();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);

  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [phase, setPhase] = useState<'bet' | 'question' | 'feedback' | 'complete'>('bet');
  const [bet, setBet] = useState<1 | 2>(1);
  const [timeRemaining, setTimeRemaining] = useState(QUESTION_TIME_LIMIT);
  const [streak, setStreak] = useState(0);
  const [retryUsed, setRetryUsed] = useState(false);
  const [lastAward, setLastAward] = useState(0);
  const [revealCorrect, setRevealCorrect] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const streakRef = useRef(0);
  // Guards the zero-dispatch effect against double-firing (StrictMode
  // double-invocation / repeated renders at timeRemaining === 0).
  const timeoutHandledRef = useRef(false);
  /** Steal phase: null = none live; 'pending' = STEAL_OFFER accepted, waiting
   *  for the teacher to pick the stealer; 'active' = stealer answering the
   *  SAME question. One steal per question — latched until it advances. Kept
   *  in a ref (not state) because handlers/effects must read it synchronously,
   *  most critically the turnId reset effect, which must be a no-op while a
   *  steal is live (the stealer pick's NEW_TURN must not wipe the question). */
  const stealPhaseRef = useRef<'pending' | 'active' | null>(null);
  const stealerIdRef = useRef<string | null>(null);
  const preStealWinnerRef = useRef<string | null>(null);
  const [stealBanner, setStealBanner] = useState<StealBanner | null>(null);
  /** Pending auto-advance (reveal hold / feedback hold / stolen celebration).
   *  STEAL_OFFER must be able to cancel it or the question would slide on
   *  mid-steal. */
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = state.students?.map((s: any) => s.id).filter(Boolean) || [];

  // ── Steal plumbing (STEAL_OFFER → pick → half-of-base steal) ────────────
  /** Schedule the auto-advance through the cancellable ref so a steal (or a
   *  remote SKIP/RESET racing a hold) can kill it. The callback nulls the ref
   *  BEFORE running, so a self-fired advance can never clear a live timer. */
  const scheduleAdvance = (fn: () => void, ms: number) => {
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null;
      fn();
    }, ms);
  };
  const cancelAdvance = () => {
    if (advanceTimerRef.current !== null) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  };
  /** Full steal teardown — every advance/reset/completion path calls this, so
   *  a steal never leaks across questions, turns, or a RESET_GAME. */
  const clearSteal = () => {
    cancelAdvance();
    stealPhaseRef.current = null;
    stealerIdRef.current = null;
    preStealWinnerRef.current = null;
    setStealBanner(null);
  };
  const resolveName = (id: string | null): string => {
    const s = (state.students || []).find((st: any) => st.id === id);
    return s?.name || s?.full_name || s?.display_name || 'Student';
  };
  const beginStealPending = () => {
    // CRITICAL: kill the reveal hold's pending advance so the question STAYS.
    cancelAdvance();
    stealPhaseRef.current = 'pending';
    preStealWinnerRef.current = state.quickWheelWinner;
    stealerIdRef.current = null;
    setStealBanner({ kind: 'offer' });
  };

  // Pull quiz items — no limit: the fetch must see the whole pool (a DB-side
  // limit returned only the first-inserted words; see useBoardPool).
  const { items: poolItems, loading } = useBoardPool({
    unitId,
    exerciseTypes: ['MEANING_MATCH', 'IMAGE_SELECT', 'SPELL_CLOZE', 'ERROR_SPOT'],
  });

  // Normalize pool items into quiz questions — ONE per word (objective), so a
  // 10-15-word pool yields 10-15 distinct questions instead of 4 variations
  // each of the first few words. The pool shuffle decides which exercise type
  // represents each word.
  const questions: QuizQuestion[] = React.useMemo(() => {
    const seenObjectives = new Set<string>();
    const out: QuizQuestion[] = [];
    for (const pi of poolItems) {
      if (seenObjectives.has(pi.objective_id)) continue;
      const content = pi.content as any;
      // IMAGE_SELECT options are {image_url, label?} objects — keep the image
      // so they render as image cards, never a stringified "[object Object]".
      const options: QuizOption[] = (content.options || []).map((o: any) =>
        typeof o === 'string'
          ? { label: o }
          : { label: o?.label || o?.text || o?.image_url || '', imageUrl: o?.image_url },
      );

      seenObjectives.add(pi.objective_id);
      out.push({
        poolItem: pi,
        prompt: content.sentence || content.prompt || content.sentence_with_blank || '',
        options,
        correctIndex: content.correct_index || 0,
        explanation: content.explanation,
      });
    }
    return out;
  }, [poolItems]);

  const currentQuestion = questions[currentQIdx];

  // Reset on new turn
  useEffect(() => {
    if (turnId === null) return;
    // STEAL FREEZE: picking the stealer is a normal pick, which broadcasts
    // SPIN_WHEEL + NEW_TURN — the NEW_TURN turnId change would normally wipe
    // the board back to question 0. While a steal is pending or active the
    // stolen question is frozen in place; the steal refs are cleared on the
    // question's advance/reset instead, after which normal per-pick resets
    // resume.
    if (stealPhaseRef.current !== null) return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    streakRef.current = 0;
    timeoutHandledRef.current = false;
    // currentQIdx is deliberately NOT reset here (pool-coverage fix): every
    // resolved question already advances via the advanceToNext funnel, so
    // keeping the index gives the new student a fresh question. Resetting to 0
    // replayed the earliest questions for every student, so the quiz tail was
    // never seen. A full RESET_GAME still restarts from q0.
    setSelectedOption(null);
    setPhase(state.quickWheelWinner ? 'bet' : 'question');
    setBet(1);
    setTimeRemaining(QUESTION_TIME_LIMIT);
    setStreak(0);
    setRetryUsed(false);
    setRevealCorrect(false);
    setTimedOut(false);
  }, [turnId, state.quickWheelWinner]);

  // Choral mode: when no student is picked (quickWheelWinner is null/empty),
  // automatically set bet = 1 and advance directly to 'question' phase so
  // choral rounds are never softlocked or blank at the individual confidence gate.
  useEffect(() => {
    if (!state.quickWheelWinner && phase === 'bet') {
      setBet(1);
      setPhase('question');
    }
  }, [state.quickWheelWinner, phase]);

  // ── Steal lock-in: convert the stealer pick into an active steal ────────
  // A pick broadcasts SPIN_WHEEL (quickWheelWinner changes NOW) and NEW_TURN
  // (currentTurnId changes ~2.5s later, after the wheel animation). The turnId
  // effect above is frozen while the steal is live, so neither half of the
  // pick can wipe the question; THIS effect is what locks the pick in. It only
  // acts while a steal is pending — quickWheelWinner changes at any other
  // time (a fresh turn after the steal resolved) are ignored here.
  useEffect(() => {
    if (stealPhaseRef.current !== 'pending') return;
    const winner = state.quickWheelWinner;
    if (!winner || winner === preStealWinnerRef.current) return; // same kid re-picked → keep waiting
    stealPhaseRef.current = 'active';
    stealerIdRef.current = winner;
    // Re-present the SAME question, answerable by the stealer: clear the
    // amber reveal ring and wipe the first student's wrong pick. The clock
    // stays frozen (the steal attempt itself is untimed) and the bet is
    // ignored (half of base only).
    setRevealCorrect(false);
    setSelectedOption(null);
    setStealBanner({ kind: 'active', name: resolveName(winner) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.quickWheelWinner]);

  // Timer countdown — pure state update only. Side effects must NEVER live
  // inside the updater: React may double-invoke updaters (StrictMode), which
  // used to call handleTimeUp twice → double penalty + double analytics +
  // skipped question.
  useEffect(() => {
    if (phase !== 'question' || !currentQuestion) return;

    const timer = setInterval(() => {
      // Steal freeze: while a steal is pending/active the countdown is
      // PAUSED — the clock must not eat the steal, and the stealer's attempt
      // is untimed (no restart for them).
      if (stealPhaseRef.current !== null) return;
      setTimeRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, currentQIdx]);

  // Timeout dispatch — driven from state; handleTimeUp guards itself against
  // re-entry.
  useEffect(() => {
    if (phase === 'question' && currentQuestion && timeRemaining === 0) {
      handleTimeUp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRemaining, phase, currentQIdx]);

  // Listen for remote controls
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;

    if (type === 'RESET_GAME') {
      clearSteal();
      mistakesRef.current = 0;
      awardedRef.current = false;
      streakRef.current = 0;
      timeoutHandledRef.current = false;
      setCurrentQIdx(0);
      setSelectedOption(null);
      setPhase('bet');
      setBet(1);
      setTimeRemaining(QUESTION_TIME_LIMIT);
      setStreak(0);
      setRetryUsed(false);
      setRevealCorrect(false);
      setTimedOut(false);
    } else if (type === 'SKIP_ITEM') {
      advanceToNext();
    } else if (type === 'MARK_CORRECT') {
      handleForceCorrect();
    } else if (type === 'SLIDE_COMPLETE') {
      // Forced end from the teacher — settle into the complete state.
      clearSteal(); // tear down any live steal + kill pending hold timers
      setPhase('complete');
    } else if (type === 'STEAL_OFFER') {
      // Steal window = the REVEAL moment: revealCorrect is true after the
      // retry is exhausted by a 2nd miss, OR after the timeout (both reveal).
      // A 1st miss does NOT open the window (the student's own retry is still
      // live); everywhere else the tap is a harmless no-op. While pending,
      // revealCorrect stays true, so neither student can sneak an answer
      // before the stealer is picked.
      if (phase === 'question' && revealCorrect && stealPhaseRef.current === null) {
        beginStealPending();
      }
    }
  }, [state.lastAction]);

  const handleBetSelect = (b: 1 | 2) => {
    setBet(b);
    timeoutHandledRef.current = false;
    setTimedOut(false);
    setPhase('question');
    setTimeRemaining(QUESTION_TIME_LIMIT);
  };

  const handleOptionSelect = (idx: number) => {
    if (!currentQuestion || phase !== 'question' || revealCorrect) return;
    const correct = currentQuestion.correctIndex;
    const difficulty = currentQuestion.poolItem.difficulty || 1;

    setSelectedOption(idx);

    if (stealPhaseRef.current === 'active') {
      // Stealer answers through the same UI: half of base or the reveal.
      if (idx === correct) handleStealCorrect();
      else handleStealWrong();
      return;
    }

    if (idx === correct) {
      // Correct - award points (50% ratio when won on the retry; streak
      // multiplier kicks in at 3/5 consecutive).
      const newStreak = streakRef.current + 1;
      streakRef.current = newStreak;
      setStreak(newStreak);
      if (newStreak === 3 || newStreak === 5) {
        playCue('streak');
        triggerConfetti();
      } else {
        playCue('correct');
      }
      const picked = state.quickWheelWinner;
      const basePoints = scoreForAttempt(mistakesRef.current, difficulty, retryUsed ? 0.5 : 1.0, newStreak);
      // games-v3 audit F2: the ×2 bet was applied AFTER scoreForAttempt's
      // cap, so 2× awards reached 10 — contradicting scoringDefaults' own
      // documented contract that MAX_QUESTION_POINTS covers the bet.
      const points = Math.min(MAX_QUESTION_POINTS, basePoints * bet);
      if (picked && !awardedRef.current) {
        awardedRef.current = true;
        if (points > 0) addPoints(picked, points);
        logAttempt({
          state,
          picked,
          unitId,
          objectiveId: currentQuestion.poolItem.objective_id,
          exerciseType: currentQuestion.poolItem.exercise_type,
          difficulty,
          correctness: retryUsed ? 'partial' : 'correct',
          modality: 'receptive',
          pushToRemediation,
        });
      }
      setLastAward(points);
      setPhase('feedback');
      scheduleAdvance(() => advanceToNext(), 900);
    } else {
      // Wrong - real bet downside: a 2x miss costs 2 × MISTAKE_PENALTY,
      // a 1x miss the usual 1 ×. Streak resets either way.
      mistakesRef.current += 1;
      streakRef.current = 0;
      setStreak(0);
      playCue('wrong');
      const picked = state.quickWheelWinner;
      if (picked) {
        addPoints(picked, -MISTAKE_PENALTY * bet);
      }
      logAttempt({
        state,
        picked: picked || '',
        unitId,
        objectiveId: currentQuestion.poolItem.objective_id,
        exerciseType: currentQuestion.poolItem.exercise_type,
        difficulty,
        correctness: 'incorrect',
        correct: false,
        modality: 'receptive',
        pushToRemediation,
      });

      if (!retryUsed) {
        // One retry allowed (50% points).
        setTimeout(() => {
          setSelectedOption(null);
          setRetryUsed(true);
        }, 800);
      } else {
        // Retry exhausted — reveal the correct answer + explanation, teach
        // for a beat, then advance (no loop). Scheduled via the cancellable
        // ref: a STEAL_OFFER landing inside this hold must be able to cancel
        // the advance so the question stays up for the stealer.
        playCue('reveal');
        setRevealCorrect(true);
        scheduleAdvance(() => advanceToNext(), 2200);
      }
    }
  };

  // ── Steal resolution ─────────────────────────────────────────────────────
  // Stealer CORRECT: HALF of base via the ratio arg (the halving mechanism).
  // Bets are IGNORED on steals (no ×bet) and no streak multiplier — steals
  // never count toward streaks. Awarded to the LATCHED stealer id
  // (quickWheelWinner already points at them after the pick, but the latch is
  // authoritative even if another pick sneaks in).
  const handleStealCorrect = () => {
    if (!currentQuestion || phase !== 'question' || revealCorrect || awardedRef.current) return;
    const stealer = stealerIdRef.current;
    if (!stealer) return;
    playCue('correct');
    const difficulty = currentQuestion.poolItem.difficulty || 1;
    const points = scoreForAttempt(mistakesRef.current, difficulty, 0.5);
    awardedRef.current = true;
    if (points > 0) addPoints(stealer, points);
    logAttempt({
      state,
      picked: stealer,
      unitId,
      objectiveId: currentQuestion.poolItem.objective_id,
      exerciseType: currentQuestion.poolItem.exercise_type,
      difficulty,
      correctness: 'correct',
      modality: 'receptive',
      pushToRemediation,
    });
    setLastAward(points);
    setSelectedOption(currentQuestion.correctIndex);
    setPhase('feedback');
    setStealBanner({ kind: 'stolen', name: resolveName(stealer), points });
    scheduleAdvance(() => advanceToNext(), 1200);
  };

  // Stealer WRONG: one shot only — wrong cue, then the standard reveal path
  // (answer + explanation, ~2.2s teaching hold) and advance. No penalty /
  // attempt logged against the stealer (the original student already paid
  // for the miss/timeout), and NO second steal — stealPhaseRef stays latched
  // until the advance clears it, so a repeat STEAL_OFFER is rejected.
  const handleStealWrong = () => {
    if (!currentQuestion || phase !== 'question' || revealCorrect) return;
    playCue('wrong');
    setStealBanner(null);
    playCue('reveal');
    setRevealCorrect(true);
    scheduleAdvance(() => advanceToNext(), 2200);
  };

  const handleTimeUp = () => {
    if (timeoutHandledRef.current || phase !== 'question' || revealCorrect) return;
    if (stealPhaseRef.current !== null) return; // steal live → the clock is frozen
    timeoutHandledRef.current = true;
    // Timeout = teaching moment, not punishment: NO raw −5 penalty (6–12
    // year-olds shouldn't be docked for clock anxiety). The miss is still
    // recorded in analytics + FSRS via logAttempt.
    if (currentQuestion) {
      logAttempt({
        state,
        picked: state.quickWheelWinner || '',
        unitId,
        objectiveId: currentQuestion.poolItem.objective_id,
        exerciseType: currentQuestion.poolItem.exercise_type,
        difficulty: currentQuestion.poolItem.difficulty || 1,
        correctness: 'incorrect',
        correct: false,
        modality: 'receptive',
        pushToRemediation,
      });
    }
    streakRef.current = 0;
    setStreak(0);
    setTimedOut(true);
    playCue('reveal');
    setRevealCorrect(true);
    // Cancellable: a STEAL_OFFER landing inside this hold must keep the
    // question up for the stealer (the timeout is one of the two reveal
    // moments that open the steal window).
    scheduleAdvance(() => advanceToNext(), 2200);
  };

  // MARK_CORRECT (teacher override): score the current item as a clean correct
  // (mistakesRef preserved), then advance.
  const handleForceCorrect = () => {
    if (!currentQuestion || phase !== 'question') return;
    // MARK_CORRECT during a live steal resolves the STEAL — half of base to
    // the stealer — never a full-price override. Checked BEFORE the
    // timeout/reveal guards: a timeout-born steal already latched
    // timeoutHandledRef, which would otherwise swallow the override.
    if (stealPhaseRef.current === 'active') {
      handleStealCorrect();
      return;
    }
    if (awardedRef.current || revealCorrect || timeoutHandledRef.current) {
      return;
    }
    timeoutHandledRef.current = true; // stop the timeout path from racing
    const newStreak = streakRef.current + 1;
    streakRef.current = newStreak;
    setStreak(newStreak);
    if (newStreak === 3 || newStreak === 5) {
      playCue('streak');
      triggerConfetti();
    } else {
      playCue('correct');
    }
    const picked = state.quickWheelWinner;
    const points = Math.min(MAX_QUESTION_POINTS, scoreForAttempt(mistakesRef.current, currentQuestion.poolItem.difficulty || 1, 1.0, newStreak) * bet);
    awardedRef.current = true;
    if (picked) {
      if (points > 0) addPoints(picked, points);
      logAttempt({
        state,
        picked,
        unitId,
        objectiveId: currentQuestion.poolItem.objective_id,
        exerciseType: currentQuestion.poolItem.exercise_type,
        difficulty: currentQuestion.poolItem.difficulty || 1,
        correctness: 'correct',
        modality: 'receptive',
        pushToRemediation,
      });
    }
    setLastAward(points);
    setSelectedOption(currentQuestion.correctIndex);
    setPhase('feedback');
    scheduleAdvance(() => advanceToNext(), 900);
  };

  const advanceToNext = () => {
    // A steal lives within the current question ONLY — every advance path
    // (answer, reveal, steal resolution, SKIP_ITEM escape hatch) lands here,
    // so this is the single funnel that retires the steal. cancelAdvance
    // inside clearSteal also kills any straggling hold timer, fixing the
    // latent double-advance when SKIP races a reveal/feedback hold.
    clearSteal();
    if (currentQIdx < questions.length - 1) {
      // Per-question attempt reset.
      mistakesRef.current = 0;
      awardedRef.current = false;
      timeoutHandledRef.current = false;
      setCurrentQIdx((prev) => prev + 1);
      setSelectedOption(null);
      setPhase(state.quickWheelWinner ? 'bet' : 'question');
      setBet(1);
      setRetryUsed(false);
      setRevealCorrect(false);
      setTimedOut(false);
    } else {
      setPhase('complete');
      playCue('win');
      triggerAction('SLIDE_COMPLETE', { forced: false });
    }
  };

  // ── Render pieces (v3 per stitch/32-vocab-blitz) ────────────────────────
  const bet2 = bet === 2;

  const header = (
    <header className="w-full flex items-center justify-between gap-3 pr-1 pl-32 lg:pl-48 h-12 lg:h-14 [@media(max-height:450px)]:h-8 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 px-2.5 py-1 [@media(max-height:450px)]:py-0.5 rounded-xl bg-[#FF2E79]/15 border border-[#FF2E79]/50 shrink-0">
          <Zap size={14} className="text-[#FF2E79]" />
          <span className="vb-mono text-[10px] lg:text-xs font-black tracking-widest text-[#FF2E79] whitespace-nowrap">VOCAB BLITZ</span>
        </div>
        <span className="vb-mono text-[10px] lg:text-xs text-slate-400 font-bold whitespace-nowrap">
          {phase === 'bet' ? (state.quickWheelWinner ? 'Confidence gate' : 'Class Blitz') : `Q ${currentQIdx + 1}/${questions.length}`}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {phase === 'question' && bet2 && stealBanner?.kind !== 'active' && (
          <span className="flex items-center gap-1.5 px-3 py-1 [@media(max-height:450px)]:hidden rounded-full bg-orange-500/15 border-2 border-orange-500 animate-pulse whitespace-nowrap">
            <span className="vb-mono text-[10px] lg:text-xs font-black text-orange-400">2X LOCKED</span>
          </span>
        )}
        {streak > 1 && (
          <span className="flex items-center gap-1 px-3 py-1 [@media(max-height:450px)]:px-2 [@media(max-height:450px)]:py-0.5 rounded-full bg-[#FF2E79]/10 border border-[#FF2E79]/40 whitespace-nowrap">
            <Flame size={12} className="text-[#FF2E79]" />
            <span className="vb-mono text-[10px] lg:text-xs [@media(max-height:450px)]:text-[9px] font-black text-[#FF2E79]">{streak} IN A ROW</span>
          </span>
        )}
      </div>
    </header>
  );

  // Stadium radial countdown (design #2): SVG ring, sky → amber → rose as time drains.
  const timeFrac = timeRemaining / QUESTION_TIME_LIMIT;
  const ringColor = timeFrac > 0.33 ? '#38BDF8' : timeFrac > 0.2 ? '#F59E0B' : '#F43F5E';

  const renderOption = (option: QuizOption, idx: number) => {
    const isSelected = selectedOption === idx;
    const isCorrect = idx === currentQuestion.correctIndex;
    const solved = phase === 'feedback' || (isSelected && isCorrect);
    const wrongPick = isSelected && !isCorrect && !revealCorrect;
    return (
      <motion.button
        key={idx}
        initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: idx * 0.06, duration: 0.25 }}
        whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.98 }}
        onClick={() => handleOptionSelect(idx)}
        className={`relative rounded-2xl border-2 min-h-0 flex flex-col overflow-hidden transition-colors
          ${solved && isCorrect ? 'border-emerald-400 bg-emerald-950/40 vb-glow-correct'
            : wrongPick ? 'border-rose-400 bg-rose-950/30 vb-shake'
            : revealCorrect && isCorrect ? 'border-amber-400 bg-amber-950/30 vb-pulse-hint'
            : isSelected ? 'border-[#38BDF8] bg-[#38BDF8]/10'
            : 'border-slate-700 bg-[#111C3D] hover:border-[#38BDF8]/70'}`}>
        {option.imageUrl ? (
          <>
            <div className="relative flex-1 min-h-0">
              <img src={option.imageUrl} alt={option.label || `Option ${idx + 1}`}
                className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B132B] to-transparent" />
            </div>
            {option.label && (
              <span className={`shrink-0 h-7 lg:h-11 px-3 flex items-center vb-mono font-bold text-xs lg:text-base border-t
                ${solved && isCorrect ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                  : isSelected ? 'bg-[#38BDF8]/10 border-[#38BDF8]/40 text-[#7DD3FC]' : 'bg-[#111C3D] border-slate-700/60 text-white'}`}>
                {option.label}
              </span>
            )}
          </>
        ) : (
          <span className={`flex-1 min-h-0 flex items-center justify-center px-3 py-1.5 lg:px-4 lg:py-3 text-center font-bold
            ${currentQuestion.options.length > 2 ? 'text-base lg:text-2xl [@media(max-height:450px)]:text-xs' : 'text-xl lg:text-3xl [@media(max-height:450px)]:text-sm'}
            ${solved && isCorrect ? 'text-emerald-300' : revealCorrect && isCorrect ? 'text-amber-300' : isSelected ? 'text-[#7DD3FC]' : 'text-white'}`}>
            {option.label}
          </span>
        )}
        {solved && isCorrect && (
          <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }}
            className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500 text-slate-950 vb-mono text-[8px] lg:text-[9px] font-black tracking-wider uppercase">
            <Check size={11} strokeWidth={4} /> Correct
          </motion.span>
        )}
        {wrongPick && (
          <span className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-lg bg-rose-500 text-white flex items-center justify-center">
            <X size={13} strokeWidth={4} />
          </span>
        )}
      </motion.button>
    );
  };

  return (
    <div className="vb-root h-full w-full flex flex-col gap-1.5 lg:gap-2.5 p-2 lg:p-4 [@media(max-height:450px)]:gap-1 [@media(max-height:450px)]:p-1 bg-[#070C18] relative overflow-hidden">
      <style>{`
        .vb-root { font-family: 'Fredoka', 'Baloo 2', ui-rounded, 'Segoe UI', system-ui, sans-serif; }
        .vb-mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
        .vb-glow-correct { box-shadow: 0 0 30px -4px rgba(16,185,129,0.55), inset 0 0 24px rgba(16,185,129,0.1); }
        @keyframes vb-shake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-7px); } 40%, 80% { transform: translateX(7px); } }
        .vb-shake { animation: vb-shake 0.4s ease-in-out; }
        @keyframes vb-pulse-hint { 0%, 100% { box-shadow: 0 0 8px -2px rgba(245,158,11,0.4); } 50% { box-shadow: 0 0 26px -2px rgba(245,158,11,0.75); } }
        .vb-pulse-hint { animation: vb-pulse-hint 0.8s ease-in-out infinite; }
        @keyframes vb-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .vb-rise { animation: vb-rise 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
      `}</style>

      {header}

      {/* Steal banner (STEAL_OFFER → pick → half-of-base steal) */}
      <AnimatePresence>
        {stealBanner && (
          <motion.div
            key={stealBanner.kind}
            initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}
            className={`shrink-0 mx-auto px-6 py-2 rounded-2xl text-center border-2 ${
              stealBanner.kind === 'stolen' ? 'bg-emerald-950/70 border-emerald-400/70' : 'bg-purple-950/70 border-purple-400/70'
            }`}>
            {stealBanner.kind === 'offer' && (
              <span className="text-lg lg:text-2xl font-black text-purple-200 animate-pulse">STEAL CHANCE! Pick the stealer!</span>
            )}
            {stealBanner.kind === 'active' && (
              <span className="text-lg lg:text-2xl font-black text-purple-200">
                {stealBanner.name} — steal for <span className="text-amber-300">HALF</span> points!
              </span>
            )}
            {stealBanner.kind === 'stolen' && (
              <span className="text-xl lg:text-3xl font-black text-emerald-300">STOLEN! {stealBanner.name} +{stealBanner.points}</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {/* ═══ CONFIDENCE GATE (design #1): two pods + OR divider ═══ */}
        {phase === 'bet' && currentQuestion && (
          !state.quickWheelWinner ? (
            <motion.div key="choral-start" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 lg:gap-4 text-center">
              <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-full bg-sky-500/20 border-2 border-sky-400 flex items-center justify-center shadow-[0_0_24px_-4px_rgba(56,189,248,0.5)]">
                <Zap size={36} className="text-sky-400" />
              </div>
              <div>
                <h2 className="text-2xl lg:text-4xl font-black text-white">Class Choral Blitz</h2>
                <p className="text-slate-400 text-xs lg:text-base mt-1">Whole class answers together!</p>
              </div>
              <button onClick={() => { setBet(1); setPhase('question'); }}
                className="px-8 py-2.5 lg:py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-base lg:text-lg transition-all active:scale-95 shadow-[0_0_20px_-4px_rgba(56,189,248,0.6)]">
                Start Blitz
              </button>
            </motion.div>
          ) : (
            <motion.div key="bet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 min-h-0 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 lg:gap-7 [@media(max-height:450px)]:gap-1.5">
              {([
                { b: 1 as const, label: 'SAFE PLAY', mult: '1x', tone: 'sky', tag: 'Standard sprint · steady climb',
                  reward: 'Standard points per correct answer', risk: `−${MISTAKE_PENALTY} pts on a miss` },
                { b: 2 as const, label: 'HIGH ROLLER', mult: '2x', tone: 'pink', tag: 'High stakes · jackpot mode',
                  reward: 'DOUBLE points if correct', risk: `−${MISTAKE_PENALTY * 2} pts if wrong` },
              ] as const).map((pod) => (
                <section key={pod.b} onClick={() => handleBetSelect(pod.b)}
                  className={`relative rounded-2xl border-2 p-2.5 lg:p-6 [@media(max-height:450px)]:p-1.5 flex flex-col justify-between min-h-0 cursor-pointer overflow-hidden transition-all active:scale-[0.99]
                    ${pod.tone === 'pink' ? 'border-[#FF2E79]/60 bg-[#111C3D]' : 'border-[#38BDF8]/50 bg-[#111C3D]'} hover:shadow-[0_0_30px_-6px_${pod.tone === 'pink' ? 'rgba(255,46,121,0.5)' : 'rgba(56,189,248,0.5)'}]`}>
                  <div className={`absolute -top-14 ${pod.tone === 'pink' ? '-right-14' : '-left-14'} w-36 h-36 rounded-full blur-3xl pointer-events-none ${pod.tone === 'pink' ? 'bg-[#FF2E79]/15' : 'bg-[#38BDF8]/15'}`} />
                  <div className="relative z-10 flex items-center justify-between gap-2">
                    <span className={`px-2 py-0.5 rounded-full border vb-mono text-[8px] lg:text-[10px] font-bold uppercase tracking-widest truncate
                      ${pod.tone === 'pink' ? 'bg-[#FF2E79]/10 border-[#FF2E79]/50 text-[#FF2E79]' : 'bg-[#38BDF8]/10 border-[#38BDF8]/50 text-[#7DD3FC]'}`}>
                      {pod.tag}
                    </span>
                    <span className={`vb-mono text-[9px] lg:text-xs font-bold ${pod.tone === 'pink' ? 'text-[#FF2E79]' : 'text-[#38BDF8]'} shrink-0`}>
                      KEY {pod.b}
                    </span>
                  </div>
                  <div className="relative z-10 text-center my-0.5 lg:my-3">
                    <div className={`font-black tracking-tighter leading-none ${pod.tone === 'pink' ? 'text-[#FF2E79]' : 'text-[#38BDF8]'}
                      text-4xl lg:text-8xl [@media(max-height:450px)]:text-3xl`}>
                      {pod.mult}
                    </div>
                    <h2 className="text-base lg:text-3xl font-extrabold text-white tracking-tight [@media(max-height:450px)]:text-sm">{pod.label}</h2>
                  </div>
                  <div className="relative z-10 flex flex-col gap-1 lg:gap-2.5">
                    <div className="flex items-center gap-2 px-2.5 lg:px-4 py-1 lg:py-2 rounded-xl bg-slate-800/60 border border-slate-700 [@media(max-height:450px)]:hidden">
                      <TrendingUp size={14} className={pod.tone === 'pink' ? 'text-[#FF2E79]' : 'text-[#38BDF8]'} />
                      <span className="text-xs lg:text-base font-bold text-white truncate">{pod.reward}</span>
                    </div>
                    <div className="flex items-center gap-2 px-2.5 lg:px-4 py-1 lg:py-2 rounded-xl bg-slate-800/60 border border-slate-700 [@media(max-height:450px)]:hidden">
                      <TrendingDown size={14} className="text-slate-400" />
                      <span className="text-xs lg:text-base font-bold text-slate-300 truncate">{pod.risk}</span>
                    </div>
                    <button className={`w-full py-2 lg:py-4 [@media(max-height:450px)]:py-1.5 rounded-xl border-2 font-extrabold text-sm lg:text-xl tracking-wide uppercase transition-all active:scale-95
                      ${pod.tone === 'pink'
                        ? 'bg-slate-800 hover:bg-[#FF2E79] border-[#FF2E79] text-[#FF2E79] hover:text-white'
                        : 'bg-slate-800 hover:bg-[#38BDF8] border-[#38BDF8] text-[#7DD3FC] hover:text-slate-900'}`}>
                      Select {pod.label} ({pod.mult})
                    </button>
                  </div>
                </section>
              ))}
              {/* OR divider */}
              <div className="relative flex flex-col items-center justify-center py-2">
                <div className="w-0.5 flex-1 bg-gradient-to-b from-transparent via-slate-600 to-transparent" />
                <div className="w-9 h-9 lg:w-14 lg:h-14 my-1 rounded-full bg-[#111C3D] border-2 border-amber-400/80 flex items-center justify-center shadow-[0_0_20px_-4px_rgba(245,158,11,0.6)] shrink-0">
                  <span className="font-black text-amber-300 text-xs lg:text-lg">OR</span>
                </div>
                <div className="w-0.5 flex-1 bg-gradient-to-b from-transparent via-slate-600 to-transparent" />
              </div>
            </motion.div>
          )
        )}

        {/* ═══ SPRINT (design #2): radial clock + prompt + answer grid ═══ */}
        {phase === 'question' && (
          <motion.div key={`q-${currentQIdx}`} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            className="flex-1 min-h-0 flex flex-col gap-1.5 lg:gap-3 [@media(max-height:450px)]:gap-1">
            {/* Clock strip */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-3 lg:px-4 py-1.5 [@media(max-height:450px)]:py-0.5 rounded-2xl bg-[#0B132B]/90 border border-slate-700/70">
              {stealBanner?.kind === 'active' ? (
                <span className="vb-mono text-sm lg:text-lg font-black text-purple-300 animate-pulse">STEAL — untimed!</span>
              ) : (
                <div className="flex items-center gap-2.5">
                  <div className="relative w-8 h-8 lg:w-11 lg:h-11 flex items-center justify-center">
                    <svg className="w-8 h-8 lg:w-11 lg:h-11 -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" fill="none" r="15.5" stroke="#1e293b" strokeWidth="3.5" />
                      <circle cx="18" cy="18" fill="none" r="15.5" stroke={ringColor}
                        strokeDasharray="97.4" strokeDashoffset={97.4 * (1 - timeFrac)} strokeLinecap="round" strokeWidth="3.5"
                        style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }} />
                    </svg>
                    <span className="absolute vb-mono text-[10px] lg:text-sm font-black" style={{ color: ringColor }}>
                      {timeRemaining}s
                    </span>
                  </div>
                  <span className="vb-mono text-[9px] lg:text-[10px] uppercase tracking-widest text-slate-500 font-bold hidden sm:block">Speed clock</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                {retryUsed && stealBanner?.kind !== 'active' && (
                  <span className="vb-mono text-[9px] lg:text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-950/50 border border-amber-500/40 px-2.5 py-0.5 rounded-full">
                    Retry · 50% points
                  </span>
                )}
                {bet2 && (
                  <span className="vb-mono text-[9px] lg:text-[10px] font-black uppercase tracking-wider text-orange-400 bg-orange-950/50 border border-orange-500/50 px-2.5 py-0.5 rounded-full">
                    2x multiplier locked
                  </span>
                )}
              </div>
            </div>

            {/* Prompt plate */}
            <div className="shrink-0 rounded-2xl bg-[#0B132B]/90 border border-slate-700/70 px-4 lg:px-6 py-2 lg:py-4 [@media(max-height:450px)]:py-1 flex items-center justify-center min-h-9 lg:min-h-16">
              <p className="text-base lg:text-2xl [@media(max-height:450px)]:text-sm font-bold text-white text-center">{currentQuestion.prompt}</p>
            </div>

            {/* Answer grid (landscape) */}
            <div className={`flex-1 min-h-0 grid gap-2 lg:gap-4 [@media(max-height:450px)]:gap-1.5 ${currentQuestion.options.length > 2 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-2'}`}>
              {currentQuestion.options.map((option, idx) => renderOption(option, idx))}
            </div>

            {/* Reveal beat */}
            {revealCorrect && (
              <div className="shrink-0 text-center pb-0.5">
                <div className="text-sm lg:text-xl font-bold text-amber-400">
                  {timedOut ? "Time's up! The answer was:" : 'The answer was:'}
                </div>
                {currentQuestion.explanation && (
                  <div className="text-xs lg:text-sm text-slate-400 mt-0.5">{currentQuestion.explanation}</div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ FEEDBACK ═══ */}
        {phase === 'feedback' && (
          <motion.div key="feedback" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="flex-1 flex flex-col items-center justify-center gap-3">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}
              className="w-20 h-20 lg:w-28 lg:h-28 rounded-full bg-emerald-500/15 border-2 border-emerald-400 flex items-center justify-center vb-glow-correct">
              <Check size={44} className="text-emerald-400" strokeWidth={3} />
            </motion.div>
            <h2 className="text-2xl lg:text-4xl font-black text-white">
              {pickedStudent ? `${pickedStudent.name} nailed it!` : 'Excellent!'}
            </h2>
            <div className="flex items-center gap-2">
              <span className="px-4 py-1.5 rounded-full bg-emerald-950/70 border border-emerald-400/60 vb-mono font-black text-emerald-300 text-lg lg:text-2xl">
                +{lastAward} pts
              </span>
              {bet2 && stealBanner?.kind !== 'stolen' && (
                <span className="px-3 py-1.5 rounded-full bg-orange-950/60 border border-orange-500/50 vb-mono font-black text-orange-300 text-sm lg:text-lg">
                  2x bet
                </span>
              )}
            </div>
          </motion.div>
        )}

        {/* ═══ COMPLETE ═══ */}
        {phase === 'complete' && (
          <motion.div key="complete" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-24 h-24 lg:w-28 lg:h-28 rounded-full bg-amber-500/15 border-2 border-amber-400 flex items-center justify-center shadow-[0_0_30px_-6px_rgba(245,158,11,0.6)]">
              <Trophy size={48} className="text-amber-400" />
            </div>
            <h2 className="text-3xl lg:text-5xl font-black text-white">Vocab Blitz Complete!</h2>
            <div className="flex items-center gap-2 px-5 py-2 rounded-full bg-[#FF2E79]/10 border border-[#FF2E79]/40">
              <Flame size={18} className="text-[#FF2E79]" />
              <span className="text-lg font-bold text-[#FF2E79]">Final streak: {streak}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BoardVocabBlitz;