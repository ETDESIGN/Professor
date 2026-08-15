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
import type { PoolItem } from '../../../types/exercise';

interface QuizQuestion {
  poolItem: PoolItem;
  prompt: string;
  options: string[];
  correctIndex: number;
  timeLimit: number;
  type: 'recognition' | 'production';
}

const BoardVocabBlitz = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation } = useSession();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);

  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [phase, setPhase] = useState<'bet' | 'question' | 'feedback' | 'complete'>('bet');
  const [bet, setBet] = useState<1 | 2>(1);
  const [timeRemaining, setTimeRemaining] = useState(15);
  const [streak, setStreak] = useState(0);
  const [retryUsed, setRetryUsed] = useState(false);
  const [lastAward, setLastAward] = useState(0);
  const [revealCorrect, setRevealCorrect] = useState(false);

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
      const isProduction = ['WORD_BANK_BUILD', 'TRANSFORM'].includes(pi.exercise_type);
      const timeLimit = isProduction ? 25 : 15;

      return {
        poolItem: pi,
        prompt: content.sentence || content.prompt || content.sentence_with_blank || '',
        options: content.options || [],
        correctIndex: content.correct_index || 0,
        timeLimit,
        type: isProduction ? 'production' : 'recognition',
      };
    });
  }, [poolItems]);

  const currentQuestion = questions[currentQIdx];

  // Reset on new turn
  useEffect(() => {
    if (turnId === null) return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    setCurrentQIdx(0);
    setSelectedOption(null);
    setPhase('bet');
    setBet(1);
    setTimeRemaining(15);
    setStreak(0);
    setRetryUsed(false);
    setRevealCorrect(false);
  }, [turnId]);

  // Timer countdown
  useEffect(() => {
    if (phase !== 'question' || !currentQuestion) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, currentQIdx]);

  // Listen for remote controls
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;

    if (type === 'RESET_GAME') {
      mistakesRef.current = 0;
      awardedRef.current = false;
      setCurrentQIdx(0);
      setSelectedOption(null);
      setPhase('bet');
      setBet(1);
      setTimeRemaining(15);
      setStreak(0);
      setRetryUsed(false);
      setRevealCorrect(false);
    } else if (type === 'SKIP_ITEM') {
      advanceToNext();
    }
  }, [state.lastAction]);

  const handleBetSelect = (b: 1 | 2) => {
    setBet(b);
    setPhase('question');
    setTimeRemaining(currentQuestion?.timeLimit || 15);
  };

  const handleOptionSelect = (idx: number) => {
    if (!currentQuestion || phase !== 'question') return;
    const correct = currentQuestion.correctIndex;
    const difficulty = currentQuestion.poolItem.difficulty || 1;

    setSelectedOption(idx);

    if (idx === correct) {
      // Correct - award points (50% ratio when won on the retry).
      const picked = state.quickWheelWinner;
      const basePoints = scoreForAttempt(mistakesRef.current, difficulty, retryUsed ? 0.5 : 1.0);
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
      setStreak((prev) => prev + 1);
      setPhase('feedback');
      setTimeout(() => advanceToNext(), 2000);
    } else {
      // Wrong - penalty + analytics
      const picked = state.quickWheelWinner;
      if (picked) {
        mistakesRef.current += 1;
        addPoints(picked, -MISTAKE_PENALTY);
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
      setStreak(0);

      if (!retryUsed) {
        // One retry allowed (50% points).
        setTimeout(() => {
          setSelectedOption(null);
          setRetryUsed(true);
        }, 1000);
      } else {
        // Retry exhausted — reveal the correct answer, then advance (no loop).
        setRevealCorrect(true);
        setTimeout(() => advanceToNext(), 1600);
      }
    }
  };

  const handleTimeUp = () => {
    const picked = state.quickWheelWinner;
    if (picked) {
      mistakesRef.current += 1;
      addPoints(picked, -MISTAKE_PENALTY);
    }
    if (currentQuestion) {
      logAttempt({
        state,
        picked: picked || '',
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
    setStreak(0);
    advanceToNext();
  };

  const advanceToNext = () => {
    if (currentQIdx < questions.length - 1) {
      // Per-question attempt reset.
      mistakesRef.current = 0;
      awardedRef.current = false;
      setCurrentQIdx((prev) => prev + 1);
      setSelectedOption(null);
      setPhase('bet');
      setBet(1);
      setRetryUsed(false);
      setRevealCorrect(false);
    } else {
      setPhase('complete');
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
                Higher bet = more points if correct, but same penalty if wrong
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
                    animate={{ width: `${(timeRemaining / currentQuestion.timeLimit) * 100}%` }}
                    transition={{ duration: 0.1 }}
                  />
                </div>
              </div>

              {/* Question */}
              <div className="text-center mb-8">
                <div className="text-2xl text-gray-800 mb-4">{currentQuestion.prompt}</div>
                <div className="text-sm text-gray-500">
                  Type: {currentQuestion.type === 'production' ? 'Production (25s)' : 'Recognition (15s)'}
                </div>
              </div>

              {/* Options */}
              <div className="grid grid-cols-2 gap-4">
                {currentQuestion.options.map((option, idx) => (
                  <motion.button
                    key={idx}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleOptionSelect(idx)}
                    className={`p-6 rounded-xl text-xl font-semibold transition-all ${
                      selectedOption === idx
                        ? idx === currentQuestion.correctIndex
                          ? 'bg-green-500 text-white'
                          : 'bg-red-500 text-white'
                        : revealCorrect && idx === currentQuestion.correctIndex
                        ? 'bg-green-500 text-white ring-4 ring-green-300'
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border-2 border-gray-200'
                    }`}
                  >
                    {option}
                  </motion.button>
                ))}
              </div>
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
