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
import { Timer } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useBoardPool } from '../useBoardPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
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

  // Pull quiz items
  const { items: poolItems, loading } = useBoardPool({
    unitId,
    exerciseTypes: ['MEANING_MATCH', 'IMAGE_SELECT', 'SPELL_CLOZE', 'ERROR_SPOT'],
    limit: 10,
  });

  // Normalize pool items into quiz questions
  const questions: QuizQuestion[] = React.useMemo(() => {
    return poolItems.map((pi) => {
      const content = pi.content as any;
      // IMAGE_SELECT options are {image_url, label?} objects — keep the image
      // so they render as image cards, never a stringified "[object Object]".
      const options: QuizOption[] = (content.options || []).map((o: any) =>
        typeof o === 'string'
          ? { label: o }
          : { label: o?.label || o?.text || o?.image_url || '', imageUrl: o?.image_url },
      );

      return {
        poolItem: pi,
        prompt: content.sentence || content.prompt || content.sentence_with_blank || '',
        options,
        correctIndex: content.correct_index || 0,
        explanation: content.explanation,
      };
    });
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
    setCurrentQIdx(0);
    setSelectedOption(null);
    setPhase('bet');
    setBet(1);
    setTimeRemaining(QUESTION_TIME_LIMIT);
    setStreak(0);
    setRetryUsed(false);
    setRevealCorrect(false);
    setTimedOut(false);
  }, [turnId]);

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
      const points = basePoints * bet;
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
    const points = scoreForAttempt(mistakesRef.current, currentQuestion.poolItem.difficulty || 1, 1.0, newStreak) * bet;
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
      setPhase('bet');
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-yellow-50 to-orange-50">
        <div className="text-2xl text-gray-400">Loading quiz questions…</div>
      </div>
    );
  }
  if (!currentQuestion) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-yellow-50 to-orange-50 p-8 text-center">
        <div className="text-7xl mb-6">⚡</div>
        <h2 className="text-4xl font-bold text-yellow-900 mb-3">Vocab Blitz</h2>
        <div className="text-xl text-gray-500 max-w-xl">
          No quiz items ready for this unit yet. Run the exercise generator for this unit, or skip
          to the next slide.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-yellow-50 to-orange-50 p-8">
      {/* Header */}
      <div className="text-center mb-6">
        <motion.h1
          key={currentQIdx}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold text-yellow-900 mb-2"
        >
          Vocab Blitz
        </motion.h1>
        <div className="flex items-center justify-center gap-4">
          <div className="text-sm text-gray-500">
            Question {currentQIdx + 1} of {questions.length}
          </div>
          {streak > 1 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-full font-bold"
            >
              🔥 Streak x{streak}
            </motion.div>
          )}
        </div>
      </div>

      {/* Steal banner (STEAL_OFFER → pick → half-of-base steal) */}
      <AnimatePresence>
        {stealBanner && (
          <motion.div
            key={stealBanner.kind}
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -24, opacity: 0 }}
            className={`mb-4 mx-auto w-fit px-8 py-3 rounded-2xl text-center text-white shadow-2xl ${
              stealBanner.kind === 'stolen' ? 'bg-green-600' : 'bg-purple-600'
            }`}
          >
            {stealBanner.kind === 'offer' && (
              <div className="text-2xl font-black animate-pulse">🆚 STEAL CHANCE! Pick the stealer!</div>
            )}
            {stealBanner.kind === 'active' && (
              <div className="text-2xl font-black">
                🆚 {stealBanner.name} — steal for <span className="text-yellow-300">HALF</span> points!
              </div>
            )}
            {stealBanner.kind === 'stolen' && (
              <div className="text-3xl font-black">⚡ STOLEN! {stealBanner.name} +{stealBanner.points}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <AnimatePresence mode="wait">
        {phase === 'bet' && (
          <motion.div
            key="bet"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex-1 flex items-center justify-center"
          >
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-xl w-full text-center">
              <div className="text-2xl text-gray-800 mb-6">How confident are you?</div>
              <div className="flex gap-4 justify-center">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleBetSelect(1)}
                  className="px-8 py-6 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-2xl font-bold"
                >
                  1x Bet
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleBetSelect(2)}
                  className="px-8 py-6 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-2xl font-bold"
                >
                  2x Bet
                </motion.button>
              </div>
              <div className="text-sm text-gray-500 mt-4">
                2x bet = double points if correct, but double penalty if wrong
              </div>
            </div>
          </motion.div>
        )}

        {phase === 'question' && (
          <motion.div
            key="question"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="flex-1 flex flex-col items-center justify-center"
          >
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-3xl w-full">
              {/* Timer bar — replaced by the untimed steal strip while the
                  stealer answers (the countdown is frozen from the steal
                  offer onward and never restarts for them). */}
              <div className="mb-6">
                {stealBanner?.kind === 'active' ? (
                  <div className="flex items-center justify-center py-1 text-purple-600">
                    <span className="text-2xl font-black">⚡ STEAL — untimed!</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Timer size={20} />
                        <span className="text-2xl font-bold">{timeRemaining}s</span>
                      </div>
                      {retryUsed && <div className="text-sm text-orange-500">Retry used (50% points)</div>}
                    </div>
                    <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full ${timeRemaining > 5 ? 'bg-green-500' : timeRemaining > 3 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        initial={{ width: '100%' }}
                        animate={{ width: `${(timeRemaining / QUESTION_TIME_LIMIT) * 100}%` }}
                        transition={{ duration: 0.1 }}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Question */}
              <div className="text-center mb-8">
                <div className="text-2xl text-gray-800 mb-4">{currentQuestion.prompt}</div>
              </div>

              {/* Options — image cards for IMAGE_SELECT, text otherwise */}
              <div className="grid grid-cols-2 gap-4">
                {currentQuestion.options.map((option, idx) => (
                  <motion.button
                    key={idx}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleOptionSelect(idx)}
                    className={`rounded-xl text-xl font-semibold transition-all ${
                      option.imageUrl ? 'aspect-square p-2 border-4 overflow-hidden' : 'p-6 border-2'
                    } ${
                      selectedOption === idx
                        ? idx === currentQuestion.correctIndex
                          ? 'bg-green-500 text-white border-green-600'
                          : 'bg-red-500 text-white border-red-600'
                        : revealCorrect && idx === currentQuestion.correctIndex
                        ? 'bg-amber-100 text-gray-800 border-amber-400 ring-4 ring-amber-400'
                        : option.imageUrl
                        ? 'bg-gray-50 border-gray-200 hover:border-yellow-400'
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border-gray-200'
                    }`}
                  >
                    {option.imageUrl ? (
                      <span className="w-full h-full flex flex-col items-center justify-center gap-2">
                        <img
                          src={option.imageUrl}
                          alt={option.label || `Option ${idx + 1}`}
                          className="flex-1 min-h-0 w-full object-cover rounded-lg"
                        />
                        {option.label && <span className="text-sm text-gray-700">{option.label}</span>}
                      </span>
                    ) : (
                      option.label
                    )}
                  </motion.button>
                ))}
              </div>

              {/* Reveal beat (timeout / exhausted retry): the answer + the why. */}
              {revealCorrect && (
                <div className="mt-6 text-center">
                  <div className="text-xl font-bold text-amber-600">
                    {timedOut ? "Time's up! The answer was:" : 'The answer was:'}
                  </div>
                  {currentQuestion.explanation && (
                    <div className="text-base text-gray-500 mt-2">{currentQuestion.explanation}</div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {phase === 'feedback' && (
          <motion.div
            key="feedback"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex-1 flex items-center justify-center"
          >
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="text-8xl mb-6"
              >
                🎉
              </motion.div>
              <h2 className="text-4xl font-bold text-green-600 mb-4">
                {pickedStudent ? `${pickedStudent.name} nailed it!` : 'Excellent!'}
              </h2>
              <div className="text-2xl text-gray-600">
                +{lastAward} points
                {bet === 2 && stealBanner?.kind !== 'stolen' && ' (2x bet!)'}
              </div>
            </div>
          </motion.div>
        )}

        {phase === 'complete' && (
          <motion.div
            key="complete"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex items-center justify-center"
          >
            <div className="text-center">
              <div className="text-8xl mb-6">🏆</div>
              <h2 className="text-5xl font-bold text-yellow-900 mb-4">Vocab Blitz Complete!</h2>
              <div className="text-2xl text-gray-600">Final streak: {streak} 🔥</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Turn footer */}
      {pickedStudent && phase !== 'complete' && (
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-3 bg-white rounded-full px-6 py-3 shadow-lg">
            <div className="w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center text-white font-bold">
              {pickedStudent.name[0]}
            </div>
            <div className="text-xl font-semibold text-gray-800">{pickedStudent.name}'s turn</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoardVocabBlitz;
