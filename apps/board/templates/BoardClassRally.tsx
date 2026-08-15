// BoardClassRally — Collaborative class game (NEW GEN)
//
// Entirely new concept (MASTER_ROADMAP.md Game 9): the FIRST cooperative game.
// The whole class works toward a shared goal instead of competing.
//
// Pedagogical loop:
//   SHARED RALLY BAR (class goal = N correct answers) → picked student answers a
//   mixed question → CORRECT fills the bar (+1) & individual points → WRONG
//   never penalizes the class (just doesn't fill) → MILESTONES at 25/50/75%
//   celebrate → 100% = class victory + bonus XP for the answering streak.
//
// Lifecycle: NEW_TURN reset on currentTurnId (per-question attempt refs),
// remote controls via state.lastAction (RESET_GAME / SKIP_ITEM).
// Zero teacher typing.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2 } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useBoardPool } from '../useBoardPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { logAttempt } from './scoreAttempt';
import { playAudioUrl } from '../../../services/SpeechService';
import type { PoolItem } from '../../../types/exercise';

interface RallyQuestion {
  poolItem: PoolItem;
  prompt: string;
  options: string[];
  correctIndex: number;
  audioUrl?: string;
}

const TARGET_CORRECT = 12; // class goal: 12 correct answers fill the bar
const MILESTONES = [0.25, 0.5, 0.75, 1];

const BoardClassRally = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation, triggerConfetti } = useSession();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);

  const [questionIdx, setQuestionIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [phase, setPhase] = useState<'question' | 'feedback' | 'victory'>('question');
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [lastMilestone, setLastMilestone] = useState(0);
  const [showMilestone, setShowMilestone] = useState<number | null>(null);

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id).filter(Boolean), [state.students]);

  // ── Content: mixed MCQ types, class-weak-first ───────────────────────────
  const { items: poolItems, loading } = useBoardPool({
    unitId,
    exerciseTypes: ['MEANING_MATCH', 'IMAGE_SELECT', 'SPELL_CLOZE', 'LISTEN_SELECT', 'ERROR_SPOT', 'STORY_COMPREHENSION'],
    classWeak: true,
    roster,
    limit: 24,
  });

  const questions: RallyQuestion[] = useMemo(() => {
    const qs: RallyQuestion[] = [];
    for (const pi of poolItems) {
      const content = pi.content as any;
      const options: string[] = Array.isArray(content.options)
        ? content.options.map((o: any) => (typeof o === 'string' ? o : o?.label || o?.text || '')).filter(Boolean)
        : [];
      if (options.length < 2 || typeof content.correct_index !== 'number') continue;
      qs.push({
        poolItem: pi,
        prompt: content.sentence || content.prompt || content.sentence_with_blank || content.prompt_text || '',
        options,
        correctIndex: content.correct_index,
        audioUrl: content.audio_url || content.prompt_audio,
      });
    }
    return qs;
  }, [poolItems]);

  const currentQuestion = questions.length > 0 ? questions[questionIdx % questions.length] : undefined;

  // ── Lifecycle: per-turn reset (question attempt refs only — the rally bar
  //    is CLASS progress and persists across picks within the slide). ───────
  useEffect(() => {
    if (turnId === null) return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    setSelectedOption(null);
    setPhase('question');
  }, [turnId]);

  // ── Remote controls ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;
    if (type === 'RESET_GAME') {
      mistakesRef.current = 0;
      awardedRef.current = false;
      setQuestionIdx(0);
      setSelectedOption(null);
      setPhase('question');
      setTotalCorrect(0);
      setLastMilestone(0);
      setShowMilestone(null);
    } else if (type === 'SKIP_ITEM') {
      advanceQuestion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  const progress = Math.min(1, totalCorrect / TARGET_CORRECT);

  const checkMilestone = (newTotal: number) => {
    const ratio = newTotal / TARGET_CORRECT;
    const hit = MILESTONES.filter((m) => ratio >= m && m > lastMilestone);
    if (hit.length > 0) {
      const top = hit[hit.length - 1];
      setLastMilestone(top);
      setShowMilestone(top);
      if (typeof triggerConfetti === 'function') triggerConfetti();
      setTimeout(() => setShowMilestone(null), 2500);
    }
  };

  const handleOptionSelect = (idx: number) => {
    if (!currentQuestion || phase !== 'question') return;
    const correct = currentQuestion.correctIndex;
    const difficulty = currentQuestion.poolItem.difficulty || 1;

    setSelectedOption(idx);

    if (idx === correct) {
      const picked = state.quickWheelWinner;
      const points = scoreForAttempt(mistakesRef.current, difficulty, 1.0);
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
          correctness: 'correct',
          modality: 'receptive',
          pushToRemediation,
        });
      }
      // Class progress: every correct fills the bar (choral mode also fills).
      const newTotal = totalCorrect + 1;
      setTotalCorrect(newTotal);
      checkMilestone(newTotal);
      setPhase('feedback');
      setTimeout(() => {
        if (newTotal >= TARGET_CORRECT) {
          setPhase('victory');
          if (typeof triggerConfetti === 'function') triggerConfetti();
        } else {
          advanceQuestion();
        }
      }, 1800);
    } else {
      // Wrong: individual penalty + analytics, but the CLASS bar never drops.
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
      setTimeout(() => setSelectedOption(null), 800);
    }
  };

  const advanceQuestion = () => {
    mistakesRef.current = 0;
    awardedRef.current = false;
    setSelectedOption(null);
    setPhase('question');
    setQuestionIdx((prev) => prev + 1);
  };

  const playAudio = () => {
    if (currentQuestion?.audioUrl) playAudioUrl(currentQuestion.audioUrl).catch(() => {});
  };

  // ── Loading / empty states ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-fuchsia-50 to-purple-50">
        <div className="text-2xl text-gray-400">Loading rally questions…</div>
      </div>
    );
  }
  if (!currentQuestion) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-fuchsia-50 to-purple-50 p-8 text-center">
        <div className="text-7xl mb-6">🤝</div>
        <h2 className="text-4xl font-bold text-fuchsia-900 mb-3">Class Rally</h2>
        <div className="text-xl text-gray-500 max-w-xl">
          No rally questions ready for this unit yet. Run the exercise generator for this unit, or
          skip to the next slide.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-fuchsia-50 to-purple-50 p-8">
      {/* Header */}
      <div className="text-center mb-4">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold text-fuchsia-900 mb-1"
        >
          Class Rally
        </motion.h1>
        <div className="text-sm text-gray-500">
          Work together — fill the bar as a class! {totalCorrect} / {TARGET_CORRECT}
        </div>
      </div>

      {/* Rally bar with milestone nodes */}
      <div className="mb-6 max-w-4xl w-full mx-auto">
        <div className="relative h-10 bg-white/70 rounded-full border-2 border-fuchsia-200 overflow-visible">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-purple-500"
            animate={{ width: `${progress * 100}%` }}
            transition={{ type: 'spring', stiffness: 80, damping: 18 }}
          />
          {MILESTONES.map((m) => (
            <div
              key={m}
              className={`absolute top-1/2 -translate-y-1/2 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                progress >= m ? 'bg-yellow-400 border-yellow-500 text-yellow-900' : 'bg-gray-100 border-gray-300 text-gray-400'
              }`}
              style={{ left: `calc(${m * 100}% - 14px)` }}
            >
              {progress >= m ? '★' : '☆'}
            </div>
          ))}
        </div>
      </div>

      {/* Milestone celebration overlay */}
      <AnimatePresence>
        {showMilestone !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="bg-white rounded-3xl shadow-2xl px-12 py-8 text-center border-4 border-yellow-400">
              <div className="text-6xl mb-2">🎊</div>
              <div className="text-3xl font-bold text-fuchsia-800">
                {showMilestone >= 1 ? 'RALLY COMPLETE!' : `${Math.round(showMilestone * 100)}% milestone!`}
              </div>
              <div className="text-lg text-gray-500">Great teamwork, class!</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {phase === 'question' && (
          <motion.div
            key={`q-${questionIdx}`}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            className="flex-1 flex flex-col items-center justify-center"
          >
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-3xl w-full">
              <div className="text-center mb-6">
                <div className="text-2xl text-gray-800 mb-3">{currentQuestion.prompt}</div>
                {currentQuestion.audioUrl && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={playAudio}
                    className="px-6 py-3 bg-fuchsia-500 hover:bg-fuchsia-600 text-white rounded-xl font-bold inline-flex items-center gap-2"
                  >
                    <Volume2 size={20} /> Listen
                  </motion.button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {currentQuestion.options.map((option, idx) => (
                  <motion.button
                    key={`${questionIdx}-${idx}`}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleOptionSelect(idx)}
                    className={`p-5 rounded-xl text-xl font-semibold transition-all ${
                      selectedOption === idx
                        ? idx === currentQuestion.correctIndex
                          ? 'bg-green-500 text-white'
                          : 'bg-red-500 text-white'
                        : 'bg-gray-50 hover:bg-fuchsia-50 text-gray-800 border-2 border-gray-200'
                    }`}
                  >
                    {option}
                  </motion.button>
                ))}
              </div>
              <div className="text-center text-sm text-gray-400 mt-4">
                Wrong answers never shrink the bar — keep trying, team!
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
                className="text-8xl mb-4"
              >
                💪
              </motion.div>
              <h2 className="text-4xl font-bold text-green-600 mb-2">
                {pickedStudent ? `${pickedStudent.name} filled the bar!` : 'The class filled the bar!'}
              </h2>
              <div className="text-2xl text-gray-600">{totalCorrect} / {TARGET_CORRECT} — keep going!</div>
            </div>
          </motion.div>
        )}

        {phase === 'victory' && (
          <motion.div key="victory" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-8xl mb-6">🏆</div>
              <h2 className="text-5xl font-bold text-fuchsia-900 mb-4">RALLY COMPLETE!</h2>
              <div className="text-2xl text-gray-600">
                The whole class hit {TARGET_CORRECT} correct answers together! 🎉
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Turn footer */}
      {pickedStudent && phase === 'question' && (
        <div className="mt-4 text-center">
          <div className="inline-flex items-center gap-3 bg-white rounded-full px-6 py-3 shadow-lg">
            <div className="w-10 h-10 rounded-full bg-fuchsia-500 flex items-center justify-center text-white font-bold">
              {pickedStudent.name[0]}
            </div>
            <div className="text-xl font-semibold text-gray-800">{pickedStudent.name}'s turn</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoardClassRally;
