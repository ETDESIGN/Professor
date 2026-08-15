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

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = state.students?.map((s: any) => s.id).filter(Boolean) || [];

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

  // Timer countdown — pure state update only. Side effects must NEVER live
  // inside the updater: React may double-invoke updaters (StrictMode), which
  // used to call handleTimeUp twice → double penalty + double analytics +
  // skipped question.
  useEffect(() => {
    if (phase !== 'question' || !currentQuestion) return;

    const timer = setInterval(() => {
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
      setPhase('complete');
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
      setTimeout(() => advanceToNext(), 900);
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
        // for a beat, then advance (no loop).
        playCue('reveal');
        setRevealCorrect(true);
        setTimeout(() => advanceToNext(), 2200);
      }
    }
  };

  const handleTimeUp = () => {
    if (timeoutHandledRef.current || phase !== 'question' || revealCorrect) return;
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
    setTimeout(() => advanceToNext(), 2200);
  };

  // MARK_CORRECT (teacher override): score the current item as a clean correct
  // (mistakesRef preserved), then advance.
  const handleForceCorrect = () => {
    if (!currentQuestion || phase !== 'question' || awardedRef.current || revealCorrect || timeoutHandledRef.current) {
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
    setTimeout(() => advanceToNext(), 900);
  };

  const advanceToNext = () => {
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
              {/* Timer bar */}
              <div className="mb-6">
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
                {bet === 2 && ' (2x bet!)'}
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
