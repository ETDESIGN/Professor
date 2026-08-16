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
import { playCue } from './playCue';
import { playAudioUrl } from '../../../services/SpeechService';
import { recordChoralReview } from '../../../services/boardLearner';
import type { PoolItem } from '../../../types/exercise';

/** MCQ option — IMAGE_SELECT rows carry {image_url, label?} objects. */
interface RallyOption {
  label: string;
  imageUrl?: string;
}

interface RallyQuestion {
  poolItem: PoolItem;
  prompt: string;
  options: RallyOption[];
  correctIndex: number;
  audioUrl?: string;
  /** Teaching text for the reveal beat (ERROR_SPOT etc. carry one). */
  explanation?: string;
}

const TARGET_CORRECT = 12; // class goal: 12 correct answers fill the bar
const MILESTONES = [0.25, 0.5, 0.75, 1];

const BoardClassRally = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation, triggerAction, triggerConfetti } = useSession();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);

  const [questionIdx, setQuestionIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [phase, setPhase] = useState<'question' | 'choral' | 'feedback' | 'victory'>('question');
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [lastMilestone, setLastMilestone] = useState(0);
  const [showMilestone, setShowMilestone] = useState<number | null>(null);
  // Reveal-on-wrong: latched on the 2nd consecutive miss — the correct option
  // gets the amber ring, the explanation shows, and the question advances
  // after the teaching hold. No further attempts.
  const [revealedIdx, setRevealedIdx] = useState<number | null>(null);
  // Personal (per picked student) consecutive-correct streaks. Like the rally
  // bar these persist across picks within the slide; no scoring multiplier —
  // the bar is collective — just the 3/5 cue + confetti moments.
  const studentStreaksRef = useRef<Record<string, number>>({});
  // Choral mode (Tier 2, NEWGEN_AUDIT Part 4 #12): the whole class answers
  // together — no individual points, the bar fills on a strong class answer
  // and the FSRS signal is the roster-wide recordChoralReview write. Latched
  // per question so a double remote tap can't double-fill.
  const choralResolvedRef = useRef(false);

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
      // Keep image_url — IMAGE_SELECT renders image cards, never a
      // stringified "[object Object]".
      const options: RallyOption[] = Array.isArray(content.options)
        ? content.options
            .map((o: any) =>
              typeof o === 'string' ? { label: o } : { label: o?.label || o?.text || '', imageUrl: o?.image_url },
            )
            .filter((o: RallyOption) => o.label || o.imageUrl)
        : [];
      if (options.length < 2 || typeof content.correct_index !== 'number') continue;
      qs.push({
        poolItem: pi,
        prompt: content.sentence || content.prompt || content.sentence_with_blank || content.prompt_text || '',
        options,
        correctIndex: content.correct_index,
        audioUrl: content.audio_url || content.prompt_audio,
        explanation: content.explanation,
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
    choralResolvedRef.current = false;
    setSelectedOption(null);
    setRevealedIdx(null);
    setPhase('question');
  }, [turnId]);

  // ── Remote controls ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;
    if (type === 'RESET_GAME') {
      mistakesRef.current = 0;
      awardedRef.current = false;
      choralResolvedRef.current = false;
      studentStreaksRef.current = {};
      setQuestionIdx(0);
      setSelectedOption(null);
      setRevealedIdx(null);
      setPhase('question');
      setTotalCorrect(0);
      setLastMilestone(0);
      setShowMilestone(null);
    } else if (type === 'SKIP_ITEM') {
      if (phase === 'choral') {
        // During choral mode Skip doubles as the "class struggled" mark.
        resolveChoral(false);
      } else {
        advanceQuestion();
      }
    } else if (type === 'MARK_CORRECT') {
      if (phase === 'choral') {
        // During choral mode Correct doubles as the "class nailed it" mark.
        resolveChoral(true);
      } else {
        handleForceCorrect();
      }
    } else if (type === 'CHORAL_ROUND') {
      // Enter choral mode from the question phase (remote "ALL ANSWER").
      if (phase === 'question' && !awardedRef.current && revealedIdx === null) {
        choralResolvedRef.current = false;
        setSelectedOption(null);
        setPhase('choral');
      }
    } else if (type === 'SLIDE_COMPLETE') {
      // Forced end from the teacher — settle into the complete state.
      setPhase('victory');
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
      // Dead-time compression: celebration overlay ≤900ms (was 2500ms).
      setTimeout(() => setShowMilestone(null), 900);
    }
  };

  // Shared correct-resolution — used by a real correct pick AND MARK_CORRECT
  // (teacher override, mistakesRef preserved).
  const resolveCorrect = () => {
    if (!currentQuestion) return;
    const picked = state.quickWheelWinner;
    const difficulty = currentQuestion.poolItem.difficulty || 1;
    const points = scoreForAttempt(mistakesRef.current, difficulty, 1.0);
    if (picked && !awardedRef.current) {
      awardedRef.current = true;
      if (points > 0) addPoints(picked, points);
      // The picked student's personal streak (no scoring multiplier — the bar
      // is collective): cue + confetti at 3 and 5.
      const s = (studentStreaksRef.current[picked] || 0) + 1;
      studentStreaksRef.current[picked] = s;
      if (s === 3 || s === 5) {
        playCue('streak');
        triggerConfetti();
      } else {
        playCue('correct');
      }
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
    } else if (!picked) {
      playCue('correct');
    }
    // Class progress: every correct fills the bar (choral mode also fills).
    const newTotal = totalCorrect + 1;
    setTotalCorrect(newTotal);
    checkMilestone(newTotal);
    setPhase('feedback');
    // Dead-time compression: celebration beat ≤900ms (was 1800ms).
    setTimeout(() => {
      if (newTotal >= TARGET_CORRECT) {
        setPhase('victory');
        playCue('win');
        if (typeof triggerConfetti === 'function') triggerConfetti();
        triggerAction('SLIDE_COMPLETE', { forced: false });
      } else {
        advanceQuestion();
      }
    }, 900);
  };

  // MARK_CORRECT (teacher override): score the current item as a clean correct
  // (mistakesRef preserved) and advance through the normal correct flow.
  const handleForceCorrect = () => {
    if (!currentQuestion || phase !== 'question' || awardedRef.current || revealedIdx !== null) return;
    setSelectedOption(currentQuestion.correctIndex);
    resolveCorrect();
  };

  // Choral resolution (Tier 2): the CLASS answers together — no individual
  // points; a strong answer fills the bar, the FSRS signal is the roster-wide
  // recordChoralReview write (Tier 3, same as LiveClassWarmup). Marked from
  // the board's two big buttons or the remote (Correct = strong, Skip = weak).
  const resolveChoral = (strong: boolean) => {
    if (!currentQuestion || phase !== 'choral' || choralResolvedRef.current) return;
    choralResolvedRef.current = true;
    const objectiveId = currentQuestion.poolItem.objective_id;
    recordChoralReview(objectiveId, roster, strong ? 'strong' : 'weak').catch(() => {});

    if (strong) {
      playCue('correct');
      triggerConfetti();
      setSelectedOption(currentQuestion.correctIndex);
      const newTotal = totalCorrect + 1;
      setTotalCorrect(newTotal);
      checkMilestone(newTotal);
      setPhase('feedback');
      setTimeout(() => {
        if (newTotal >= TARGET_CORRECT) {
          setPhase('victory');
          playCue('win');
          if (typeof triggerConfetti === 'function') triggerConfetti();
          triggerAction('SLIDE_COMPLETE', { forced: false });
        } else {
          advanceQuestion();
        }
      }, 900);
    } else {
      // Weak choral answer: reveal + teach, no bar change, then move on.
      playCue('reveal');
      setRevealedIdx(currentQuestion.correctIndex);
      setTimeout(() => advanceQuestion(), 2200);
    }
  };

  const handleOptionSelect = (idx: number) => {
    if (!currentQuestion || phase !== 'question' || revealedIdx !== null) return;
    const correct = currentQuestion.correctIndex;
    const difficulty = currentQuestion.poolItem.difficulty || 1;

    setSelectedOption(idx);

    if (idx === correct) {
      resolveCorrect();
    } else {
      // Wrong: individual penalty + analytics, but the CLASS bar never drops.
      mistakesRef.current += 1;
      playCue('wrong');
      const picked = state.quickWheelWinner;
      if (picked) {
        studentStreaksRef.current[picked] = 0;
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

      if (mistakesRef.current >= 2) {
        // Second consecutive miss — reveal the correct option (amber ring +
        // explanation), teach for a beat, then move on. No further attempts.
        playCue('reveal');
        setRevealedIdx(correct);
        setTimeout(() => advanceQuestion(), 2200);
      } else {
        setTimeout(() => setSelectedOption(null), 800);
      }
    }
  };

  const advanceQuestion = () => {
    mistakesRef.current = 0;
    awardedRef.current = false;
    choralResolvedRef.current = false;
    setSelectedOption(null);
    setRevealedIdx(null);
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
        {phase === 'choral' && (
          <motion.div
            key={`choral-${questionIdx}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex-1 flex flex-col items-center justify-center"
          >
            <motion.div
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="mb-4 px-10 py-3 bg-gradient-to-r from-fuchsia-600 to-purple-600 rounded-full text-white text-4xl font-black tracking-widest shadow-xl"
            >
              📣 EVERYONE!
            </motion.div>
            <div className="text-xl text-fuchsia-800 font-bold mb-4">The whole class answers together!</div>
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-3xl w-full mb-6">
              <div className="text-center text-3xl text-gray-800 mb-4">{currentQuestion.prompt}</div>
              {currentQuestion.audioUrl && (
                <div className="text-center">
                  <button
                    onClick={playAudio}
                    className="px-6 py-3 bg-fuchsia-500 hover:bg-fuchsia-600 text-white rounded-xl font-bold inline-flex items-center gap-2"
                  >
                    <Volume2 size={20} /> Listen again
                  </button>
                </div>
              )}
            </div>
            {revealedIdx === null ? (
              <div className="flex gap-6">
                <motion.button
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={() => resolveChoral(true)}
                  className="px-10 py-6 bg-green-500 hover:bg-green-600 text-white rounded-2xl text-2xl font-black shadow-lg"
                >
                  ✓ CLASS NAILED IT
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={() => resolveChoral(false)}
                  className="px-10 py-6 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-2xl font-black shadow-lg"
                >
                  ✗ NEEDS PRACTICE
                </motion.button>
              </div>
            ) : (
              <div className="text-2xl font-bold text-amber-700">
                The answer was: {currentQuestion.options[currentQuestion.correctIndex]?.label}
              </div>
            )}
            {currentQuestion.explanation && revealedIdx !== null && (
              <div className="mt-3 p-3 bg-amber-50 border-2 border-amber-200 rounded-xl text-amber-900 max-w-2xl text-center">
                {currentQuestion.explanation}
              </div>
            )}
            {/* Options visible so the class can read them while answering together */}
            <div className="mt-6 grid grid-cols-2 gap-3 opacity-80 pointer-events-none">
              {currentQuestion.options.map((option, idx) => (
                <div
                  key={`choral-${idx}`}
                  className={`rounded-xl p-4 border-2 text-lg font-semibold ${
                    revealedIdx === idx
                      ? 'bg-amber-100 border-amber-400 ring-4 ring-amber-400'
                      : 'bg-white border-gray-200 text-gray-800'
                  }`}
                >
                  {option.imageUrl ? (
                    <span className="flex items-center gap-3">
                      <img src={option.imageUrl} alt={option.label || ''} className="w-14 h-14 object-cover rounded-lg" />
                      {option.label && <span>{option.label}</span>}
                    </span>
                  ) : (
                    option.label
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
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
              {/* Options — image cards for IMAGE_SELECT, text otherwise */}
              <div className="grid grid-cols-2 gap-4">
                {currentQuestion.options.map((option, idx) => (
                  <motion.button
                    key={`${questionIdx}-${idx}`}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleOptionSelect(idx)}
                    className={`rounded-xl text-xl font-semibold transition-all ${
                      option.imageUrl ? 'aspect-square p-2 border-4 overflow-hidden' : 'p-5 border-2'
                    } ${
                      selectedOption === idx
                        ? idx === currentQuestion.correctIndex
                          ? 'bg-green-500 text-white border-green-600'
                          : 'bg-red-500 text-white border-red-600'
                        : revealedIdx === idx
                        ? 'bg-amber-100 text-gray-800 border-amber-400 ring-4 ring-amber-400'
                        : option.imageUrl
                        ? 'bg-gray-50 border-gray-200 hover:border-fuchsia-400'
                        : 'bg-gray-50 hover:bg-fuchsia-50 text-gray-800 border-gray-200'
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

              {/* Reveal-on-wrong teaching beat: the why behind the answer. */}
              {revealedIdx !== null && currentQuestion.explanation && (
                <div className="mt-4 p-3 bg-amber-50 border-2 border-amber-200 rounded-xl text-center text-base text-amber-900">
                  {currentQuestion.explanation}
                </div>
              )}
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
