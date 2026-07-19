// BoardSpeedQuiz — timed assessment (ASSESS phase).
// Redesigned from Hermes prototype 05-speed-quiz-question.html.
// Circular SVG countdown timer + 2×2 answer tiles + red ASSESS theme + results.

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Trophy, Check, X } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useBoardPool } from '../useBoardPool';
import { gradeStudent } from '../../../services/boardLearner';

interface QuizQuestion { id: string; word?: string; text: string; options: string[]; correct: string; }

const BoardSpeedQuiz = ({ data }: { data: any }) => {
  const { state } = useSession();
  const unitId = state.activeUnit?.id || '';
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [isRevealed, setIsRevealed] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  const frozenQuestions: QuizQuestion[] = useMemo(() => (Array.isArray(data?.questions) ? data.questions : []), [data?.questions]);
  const { items: poolItems, loading } = useBoardPool({ unitId, exerciseTypes: ['MEANING_MATCH'], classWeak: true, roster, limit: 8 });

  const questions: QuizQuestion[] = useMemo(() => {
    if (frozenQuestions.length > 0) return frozenQuestions;
    return poolItems.map(it => {
      const c: any = it.content;
      const correct = c?.options?.[c.correct_index];
      return { id: it.id, word: c?.prompt, text: `What does "${c?.prompt}" mean?`, options: c?.options || [], correct };
    }).filter(q => q.options.length > 1 && q.correct);
  }, [frozenQuestions, poolItems]);

  const totalQuestions = questions.length;
  const currentQuestion = questions[currentIndex];
  const timePerQuestion = data?.timer || 15;

  // Timer.
  useEffect(() => {
    if (isComplete || isRevealed || !currentQuestion) return;
    if (timeLeft <= 0) { setIsRevealed(true); return; }
    const t = setTimeout(() => setTimeLeft(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, isRevealed, isComplete, currentQuestion]);

  // Reset per question.
  useEffect(() => {
    if (currentQuestion) { setTimeLeft(timePerQuestion); setIsRevealed(false); setSelectedOption(null); }
  }, [currentIndex]); // eslint-disable-line

  const goToNext = () => {
    if (currentIndex + 1 >= totalQuestions) setIsComplete(true);
    else setCurrentIndex(p => p + 1);
  };

  const handleOptionSelect = (option: string) => {
    if (isRevealed) return;
    setSelectedOption(option);
    const isCorrect = option === currentQuestion.correct;
    if (isCorrect) setScore(p => p + 1);
    setIsRevealed(true);
    const selected = state.quickWheelWinner;
    if (selected && unitId && currentQuestion.word) {
      try { gradeStudent(selected, unitId, currentQuestion.word, isCorrect); } catch { /* non-fatal */ }
    }
  };

  // RULES OF HOOKS: all hooks above; returns below.
  if (loading || totalQuestions === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <Zap size={56} className="text-red-500/50 mb-4" />
        <p className="font-display text-3xl font-bold">{loading ? 'Loading…' : 'No questions available'}</p>
      </div>
    );
  }

  // ═══ RESULTS SCREEN ═══
  if (isComplete) {
    const pct = Math.round((score / totalQuestions) * 100);
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-green-600 to-emerald-700 text-white">
        <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring' }}>
          <Trophy size={80} className="text-yellow-300 drop-shadow-lg mb-4" />
        </motion.div>
        <h2 className="text-6xl font-display font-black mb-3">Quiz Complete!</h2>
        <div className="bg-white/20 backdrop-blur-md rounded-3xl px-12 py-6 border border-white/20">
          <div className="text-7xl font-black mb-1">{score}/{totalQuestions}</div>
          <div className="text-xl text-white/80">Correct · 正确率 {pct}%</div>
        </div>
        <div className="mt-4 text-3xl">
          {pct >= 80 ? '⭐⭐⭐' : pct >= 50 ? '⭐⭐' : '⭐'}
        </div>
      </div>
    );
  }

  if (!currentQuestion) return null;

  // Timer ring values.
  const timerPct = (timeLeft / timePerQuestion);
  const circumference = 2 * Math.PI * 45;
  const dashOffset = circumference * (1 - timerPct);
  const timerColor = timeLeft <= 3 ? '#EF4444' : timeLeft <= 7 ? '#F97316' : '#22C55E';

  // ═══ QUESTION SCREEN ═══
  return (
    <div className="h-full flex flex-col items-center justify-start p-8 pt-10">
      {/* Question counter */}
      <div className="absolute top-4 right-6 flex items-center gap-2 bg-white/[.06] border border-white/8 rounded-full px-4 py-1.5 z-10">
        <span className="text-base">📝</span>
        <span className="font-display text-sm font-semibold text-slate-300">Q</span>
        <span className="font-display text-sm font-bold text-red-400 tabular-nums">{currentIndex + 1} / {totalQuestions}</span>
      </div>

      {/* Circular timer */}
      <div className="relative mb-4" style={{ width: 160, height: 160 }}>
        <svg width="160" height="160" viewBox="0 0 100 100" className="-rotate-90">
          <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="6" />
          <circle
            cx="50" cy="50" r="45" fill="none" stroke={timerColor} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display text-7xl font-black tabular-nums leading-none" style={{ color: timerColor }}>
            {String(timeLeft).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Question */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-4">
        <p className="font-display text-4xl font-bold text-slate-200">{currentQuestion.text}</p>
      </motion.div>

      {/* Buzz prompt */}
      {!isRevealed && (
        <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="mb-4">
          <span className="font-display text-xl font-bold text-red-400 uppercase tracking-widest">🔔 Tap to answer</span>
        </motion.div>
      )}

      {/* Answer tiles (2×2) */}
      <div className="grid grid-cols-2 gap-4">
        {currentQuestion.options.map((opt, i) => {
          const isCorrectAnswer = opt === currentQuestion.correct;
          const isSelected = selectedOption === opt;
          return (
            <motion.button
              key={i}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => handleOptionSelect(opt)}
              disabled={isRevealed}
              className={`group w-[260px] h-[140px] rounded-2xl border-2 flex items-center justify-center gap-4 px-5 transition-all duration-200 ${
                isRevealed && isCorrectAnswer ? 'border-green-400 bg-green-500/20 scale-105 shadow-[0_0_20px_rgba(34,197,94,.4)]' :
                isRevealed && isSelected ? 'border-red-400 bg-red-500/15 opacity-70' :
                'border-white/10 bg-white/5 hover:border-red-400 hover:bg-red-500/10 hover:scale-105'
              }`}
            >
              <span className="font-display text-2xl font-bold">{opt}</span>
              {isRevealed && isCorrectAnswer && <Check size={24} className="text-green-400" strokeWidth={4} />}
              {isRevealed && isSelected && !isCorrectAnswer && <X size={24} className="text-red-400" strokeWidth={4} />}
            </motion.button>
          );
        })}
      </div>

      {/* Reveal feedback + Next */}
      <AnimatePresence>
        {isRevealed && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-5 flex items-center gap-4">
            <div className={`px-6 py-2 rounded-full font-display text-lg font-bold ${selectedOption === currentQuestion.correct ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
              {selectedOption === currentQuestion.correct ? '✓ Correct!' : `Answer: ${currentQuestion.correct}`}
            </div>
            <button onClick={goToNext} className="bg-white/10 hover:bg-white/20 px-6 py-2 rounded-full font-bold text-slate-200 transition-colors">
              {currentIndex + 1 >= totalQuestions ? 'See Results →' : 'Next →'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BoardSpeedQuiz;
