// BoardClassRally v3 — Collaborative class game (PRACTICE)
// Rebuilt from Stitch designs:
//   • stitch/24-class-rally/1-rally.html (co-op neon arena rally state)
//   • stitch/24-class-rally/2-milestone.html (milestone & rally complete state)
//
// Key enhancements (fixing §3 F1-F8, §4 co-work audit, §2 owner comments):
//   1. Strip visible word labels from image option cards (F1, §2) — pure recall on IMAGE_SELECT
//   2. Glowing high-voltage arcade rally bar with leading-edge flame glyph & milestone star nodes (P2, §4.a)
//   3. Flat cyberpunk surfaces (#070C18, #141422), eliminating double-nested white card structures (P2, §4.a)
//   4. Robust fallback prompts for audio-led questions (F3, §4.c)
//   5. Landscape-ratio option plates with A/B/C/D letter badges (F2, §4.d)
//   6. Whole-class choral round ("ALL ANSWER") with high-energy megaphone banner & dual teacher hotplates
//   7. Preserves owner's animated 🏆 trophy celebration on completion
//   8. Header starts with pl-40 lg:pl-48 clearance for BoardShell phase pill
//   9. Full lifecycle, remote action handlers (RESET_GAME, SKIP_ITEM, MARK_CORRECT, CHORAL_ROUND), and scoring verbatim.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Volume2,
  Flame,
  Star,
  CheckCircle2,
  RotateCcw,
  Megaphone,
  Sparkles,
} from 'lucide-react';
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
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const BoardClassRally = ({ data }: { data?: any }) => {
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
      // Keep image_url — IMAGE_SELECT renders image cards, never a stringified "[object Object]".
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
        // Fallback prompt guards against audio-led questions with no text (F3)
        prompt:
          content.sentence ||
          content.prompt ||
          content.sentence_with_blank ||
          content.prompt_text ||
          (content.audio_url || content.prompt_audio
            ? 'Listen and choose the matching card 🎧'
            : 'Choose the correct answer:'),
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
      // Dead-time compression: celebration overlay ≤900ms.
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
    // Dead-time compression: celebration beat ≤900ms.
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
      <div className="flex items-center justify-center h-full bg-[#070C18]">
        <div className="text-2xl font-bold text-[#00FFCC] animate-pulse">Loading rally questions…</div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#070C18] p-8 text-center select-none">
        <motion.div
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 14 }}
          className="text-8xl mb-6 drop-shadow-[0_8px_20px_rgba(0,255,204,0.3)]"
        >
          🤝
        </motion.div>
        <h2 className="text-4xl font-headline font-black text-[#00FFCC] drop-shadow-[0_0_12px_rgba(0,255,204,0.6)] mb-3">
          Class Rally
        </h2>
        <div className="text-lg text-[#A098B0] max-w-xl">
          No rally questions ready for this unit yet. Run the exercise generator for this unit, or
          skip to the next slide.
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full w-full bg-[#070C18] text-[#E8E0F0] select-none overflow-hidden">
      <style>{`
        @media (max-height: 450px) {
          .rally-compact-hide { display: none !important; }
          .rally-compact-pad { padding: 4px 8px !important; }
          .rally-compact-h { height: 75px !important; }
        }
      `}</style>

      {/* ═══ TOP APP BAR (Shared Anchor with pl-40 lg:pl-48 Clearance) ═══ */}
      <header className="w-full flex items-center justify-between pl-40 lg:pl-48 pr-4 sm:pr-8 py-2 bg-[#0A0A12]/95 border-b border-[#302840] shrink-0 z-20 shadow-[0_0_16px_rgba(255,45,120,0.15)]">
        {/* Left: Brand & Phase Pill */}
        <div className="flex items-center gap-3 sm:gap-4">
          <span className="font-headline text-lg sm:text-xl font-black tracking-widest text-[#00FFCC] drop-shadow-[0_0_8px_rgba(0,255,204,0.6)]">
            NEON ARENA
          </span>
          <div className="flex items-center gap-2 px-3 py-0.5 bg-[#141422] rounded-full border border-[#00FFCC]/40 shadow-[0_0_10px_rgba(0,255,204,0.2)]">
            <span className="w-2 h-2 rounded-full bg-[#00FFCC] animate-ping" />
            <span className="font-label font-bold text-xs uppercase tracking-wider text-[#00FFCC]">
              PHASE: CLASS RALLY · CO-OP
            </span>
          </div>
          {pickedStudent && (studentStreaksRef.current[pickedStudent.id] || 0) >= 3 && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-0.5 bg-[#1E1E30] rounded-full border border-[#FFE04A]/50 text-[#FFE04A]">
              <Flame className="w-3.5 h-3.5 fill-[#FFE04A]" />
              <span className="font-label font-bold text-xs tracking-wider">
                STREAK: {studentStreaksRef.current[pickedStudent.id]} IN A ROW
              </span>
            </div>
          )}
        </div>

        {/* Right: Target Score Summary & Active Student */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#141422] px-3 py-1 rounded-xl border border-[#00FFCC]/30">
            <span className="font-label text-xs uppercase tracking-widest text-[#A098B0] font-bold">TARGET:</span>
            <span className="font-headline text-base sm:text-lg font-black text-[#00FFCC]">
              {totalCorrect} / {TARGET_CORRECT}
            </span>
            <span className="font-label text-xs text-[#FFE04A] font-bold ml-1">+{totalCorrect * 10} PTS</span>
          </div>
          {pickedStudent && (
            <div className="flex items-center gap-2.5 pl-3 border-l border-[#302840]">
              <div className="text-right hidden sm:block">
                <div className="font-headline font-bold text-xs text-[#E8E0F0] leading-tight">
                  {pickedStudent.name}
                </div>
                <div className="font-label text-[10px] text-[#00FFCC] font-bold tracking-wider">
                  RESPONDER
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-[#1E1E30] border-2 border-[#FF2D78] overflow-hidden flex items-center justify-center relative shadow-[0_0_8px_rgba(255,45,120,0.4)] text-sm font-bold text-[#FF2D78]">
                {pickedStudent.avatar || pickedStudent.name[0]}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ═══ HERO RALLY BAR (Big energetic thick power bar with leading-edge flame) ═══ */}
      <section className="w-full max-w-5xl mx-auto px-4 sm:px-8 pt-2.5 pb-1.5 shrink-0">
        <div className="flex items-center justify-between gap-4 mb-1.5">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-0.5 rounded bg-[#FF2D78] text-[#1A0010] font-label font-bold text-[11px] sm:text-xs tracking-wider">
              COLLECTIVE ENERGY
            </span>
            <h2 className="font-headline text-xs sm:text-sm font-extrabold text-[#E8E0F0] tracking-tight">
              {totalCorrect >= TARGET_CORRECT ? (
                <span className="text-[#00FFCC] drop-shadow-[0_0_8px_rgba(0,255,204,0.7)]">
                  CLASSROOM JACKPOT UNLOCKED! 🔥
                </span>
              ) : (
                <>
                  RALLY LEVEL 1:{' '}
                  <span className="text-[#00FFCC] drop-shadow-[0_0_8px_rgba(0,255,204,0.7)]">
                    {TARGET_CORRECT - totalCorrect} MORE WORDS
                  </span>{' '}
                  TO UNLOCK JACKPOT!
                </>
              )}
            </h2>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-label font-bold text-[#A098B0]">
            <span>CLASS GOAL:</span>
            <span className="text-[#00FFCC]">{TARGET_CORRECT} CORRECT</span>
          </div>
        </div>

        {/* Progress Fill Track */}
        <div className="relative w-full h-8 sm:h-10 bg-[#0A0A12] rounded-full p-1 border border-[#302840] overflow-visible flex items-center shadow-[inset_0_0_12px_rgba(0,0,0,0.8)]">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[#00FFCC] via-[#00E6B8] to-[#FF2D78] relative transition-all shadow-[0_0_16px_rgba(0,255,204,0.5)]"
            animate={{ width: `${Math.max(progress * 100, 2)}%` }}
            transition={{ type: 'spring', stiffness: 80, damping: 18 }}
          >
            {/* Flame Glyph Riding The Edge */}
            {progress > 0 && progress < 1 && (
              <div className="absolute -right-4 sm:-right-5 -top-2.5 sm:-top-3.5 z-20 flex items-center justify-center">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-[#0A0A12] border-2 border-[#FF2D78] flex items-center justify-center shadow-[0_0_15px_rgba(255,45,120,0.8)] animate-pulse">
                  <Flame className="w-5 h-5 sm:w-6 sm:h-6 text-[#FFE04A] fill-[#FFE04A]" />
                </div>
              </div>
            )}
          </motion.div>

          {/* Milestone Star Nodes on Track */}
          {MILESTONES.map((m) => {
            const reached = progress >= m;
            return (
              <div
                key={m}
                className={`absolute top-1/2 -translate-y-1/2 -ml-3 sm:-ml-3.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 flex items-center justify-center transition-all duration-300 z-10 ${
                  reached
                    ? 'bg-[#FFE04A] border-[#FFF0C0] text-[#1A1000] shadow-[0_0_12px_rgba(255,224,74,0.8)] scale-110'
                    : 'bg-[#141422] border-[#5A5068] text-[#5A5068]'
                }`}
                style={{ left: `${m * 100}%` }}
              >
                <Star className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${reached ? 'fill-current' : ''}`} />
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══ MILESTONE CELEBRATION OVERLAY (≤900ms) ═══ */}
      <AnimatePresence>
        {showMilestone !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4"
          >
            <div className="bg-[#141422]/95 backdrop-blur-xl rounded-3xl shadow-[0_0_50px_rgba(0,255,204,0.4)] px-8 sm:px-14 py-6 sm:py-8 text-center border-4 border-[#00FFCC] max-w-lg">
              <div className="text-6xl sm:text-7xl mb-2">
                {showMilestone >= 1 ? '🏆' : showMilestone >= 0.75 ? '🚀' : showMilestone >= 0.5 ? '🔥' : '⚡'}
              </div>
              <div className="text-2xl sm:text-3xl font-headline font-black text-[#00FFCC] drop-shadow-[0_0_12px_rgba(0,255,204,0.7)] mb-1 uppercase tracking-wide">
                {showMilestone >= 1
                  ? 'RALLY COMPLETE!'
                  : showMilestone >= 0.75
                  ? '75% SUPERCHARGE!'
                  : showMilestone >= 0.5
                  ? '50% HALFWAY POWER SURGE!'
                  : '25% POWER SURGE!'}
              </div>
              <div className="text-base sm:text-lg font-bold text-[#E8E0F0]">
                Great teamwork, class! Keep charging!
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ MAIN STAGE AREA ═══ */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-8 py-2 flex flex-col justify-between min-h-0 overflow-hidden">
        <AnimatePresence>
          {/* ── 1. CHORAL MODE ("ALL ANSWER") ── */}
          {phase === 'choral' && (
            <motion.div
              key={`choral-${questionIdx}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex-1 flex flex-col items-center justify-center w-full min-h-0"
            >
              {/* Golden Megaphone Banner */}
              <motion.div
                animate={{ scale: [1, 1.04, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="mb-2 px-6 sm:px-8 py-2 bg-gradient-to-r from-[#FF2D78] via-purple-600 to-[#00FFCC] rounded-full text-white text-xl sm:text-2xl font-black tracking-widest shadow-[0_0_24px_rgba(255,45,120,0.4)] flex items-center gap-2.5"
              >
                <Megaphone className="w-6 h-6" />
                <span>📣 EVERYONE!</span>
              </motion.div>
              <div className="text-sm sm:text-base text-[#00FFCC] font-bold mb-3 tracking-wide">
                The whole class answers together!
              </div>

              {/* Prompt Card */}
              <div className="bg-[#141422] rounded-2xl border border-[#00FFCC]/40 p-4 sm:p-6 w-full max-w-3xl mb-3 shadow-[0_0_24px_rgba(0,255,204,0.1)] text-center">
                <div className="text-2xl sm:text-3xl font-extrabold text-[#E8E0F0] mb-2 leading-snug">
                  {currentQuestion.prompt}
                </div>
                {currentQuestion.audioUrl && (
                  <button
                    onClick={playAudio}
                    className="px-4 py-2 bg-[#1E1E30] hover:bg-[#28283E] border border-[#00FFCC]/50 text-[#00FFCC] rounded-xl font-bold inline-flex items-center gap-2 transition-colors shadow-md text-sm active:scale-95"
                  >
                    <Volume2 className="w-4 h-4" /> Listen again
                  </button>
                )}
              </div>

              {/* Teacher Validation Buttons */}
              {revealedIdx === null ? (
                <div className="flex flex-wrap items-center justify-center gap-4 my-2">
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => resolveChoral(true)}
                    className="px-6 sm:px-8 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-headline font-black text-lg sm:text-xl shadow-[0_0_20px_rgba(16,185,129,0.4)] flex items-center gap-2.5 transition-all"
                  >
                    <CheckCircle2 className="w-6 h-6" />
                    <span>✓ CLASS NAILED IT (+1 Bar)</span>
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => resolveChoral(false)}
                    className="px-5 sm:px-7 py-3 rounded-2xl bg-[#1E1E30] hover:bg-[#28283E] border-2 border-amber-500/60 text-amber-300 font-headline font-bold text-base sm:text-lg shadow-[0_0_16px_rgba(245,158,11,0.2)] flex items-center gap-2.5 transition-all"
                  >
                    <RotateCcw className="w-5 h-5" />
                    <span>✗ NEEDS PRACTICE</span>
                  </motion.button>
                </div>
              ) : (
                <div className="text-lg sm:text-xl font-bold text-amber-300 my-2">
                  The answer was: {currentQuestion.options[currentQuestion.correctIndex]?.label}
                </div>
              )}

              {/* Reveal explanation */}
              {currentQuestion.explanation && revealedIdx !== null && (
                <div className="mt-2 p-2.5 bg-amber-950/70 border-2 border-amber-400/80 rounded-xl text-amber-200 text-xs sm:text-sm max-w-2xl text-center">
                  {currentQuestion.explanation}
                </div>
              )}

              {/* Non-interactive Options Preview (IMAGE ONLY for image cards) */}
              <div className="mt-3 grid grid-cols-2 gap-2.5 w-full max-w-3xl opacity-85 pointer-events-none">
                {currentQuestion.options.map((option, idx) => (
                  <div
                    key={`choral-${idx}`}
                    className={`rounded-xl p-2.5 border-2 text-center text-sm sm:text-base font-semibold flex items-center justify-center ${
                      revealedIdx === idx
                        ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400 text-amber-200'
                        : 'bg-[#141422] border-[#302840] text-[#E8E0F0]'
                    }`}
                  >
                    {option.imageUrl ? (
                      <div className="h-14 sm:h-16 w-full flex items-center justify-center p-1">
                        <img
                          src={option.imageUrl}
                          alt={option.label || `Option ${OPTION_LETTERS[idx] || idx + 1}`}
                          className="h-full max-w-full object-contain rounded-lg"
                        />
                      </div>
                    ) : (
                      option.label
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── 2. QUESTION MODE (Individual Picked Student Turn) ── */}
          {phase === 'question' && (
            <motion.div
              key={`q-${questionIdx}`}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="flex-1 flex flex-col justify-between min-h-0 w-full max-w-4xl mx-auto"
            >
              {/* Question Card Header */}
              <div className="bg-[#141422] rounded-2xl border border-[#302840] p-4 sm:p-5 shadow-[0_0_24px_rgba(0,255,204,0.06)] shrink-0 mb-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-lg sm:text-2xl font-extrabold text-[#E8E0F0] leading-snug">
                    {currentQuestion.prompt}
                  </div>
                  {currentQuestion.audioUrl && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={playAudio}
                      className="px-4 py-2 rounded-xl bg-[#1E1E30] border border-[#302840] hover:border-[#00FFCC] text-[#00FFCC] font-bold text-sm flex items-center gap-2 shrink-0 transition-colors shadow-[0_0_12px_rgba(0,255,204,0.15)]"
                    >
                      <Volume2 className="w-4 h-4" />
                      <span>Listen</span>
                    </motion.button>
                  )}
                </div>
              </div>

              {/* 2×2 Options Grid (IMAGE ONLY for IMAGE_SELECT — F1, §2) */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4 my-auto flex-1 min-h-0 items-stretch">
                {currentQuestion.options.map((option, idx) => {
                  const isSelected = selectedOption === idx;
                  const isCorrect = idx === currentQuestion.correctIndex;
                  const isRevealed = revealedIdx === idx;
                  const letter = OPTION_LETTERS[idx] || String(idx + 1);

                  let borderAndBg =
                    'bg-[#141422] border-[#302840] hover:border-[#00FFCC]/60 hover:bg-[#1E1E30] text-[#E8E0F0]';
                  if (isSelected) {
                    if (isCorrect) {
                      borderAndBg =
                        'bg-emerald-500/20 text-emerald-300 border-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.5)]';
                    } else {
                      borderAndBg =
                        'bg-rose-500/20 text-rose-300 border-rose-400 shadow-[0_0_16px_rgba(244,63,94,0.5)]';
                    }
                  } else if (isRevealed) {
                    borderAndBg =
                      'bg-amber-500/20 text-amber-300 border-amber-400 ring-2 ring-amber-400/80 shadow-[0_0_16px_rgba(245,158,11,0.5)]';
                  }

                  return (
                    <motion.button
                      key={`${questionIdx}-${idx}`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleOptionSelect(idx)}
                      className={`relative rounded-xl border-2 transition-all flex items-center justify-center overflow-hidden rally-compact-h ${
                        option.imageUrl ? 'h-32 sm:h-40 md:h-44' : 'p-4 sm:p-5 min-h-[3.5rem] sm:min-h-[4.5rem]'
                      } ${borderAndBg}`}
                    >
                      {/* Option Letter Badge */}
                      <span className="absolute top-2 left-2 z-10 w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[#0A0A12]/90 border border-[#302840] text-[#00FFCC] font-black text-xs flex items-center justify-center shadow-md">
                        {letter}
                      </span>

                      {/* Content: Image ONLY (F1) or Text Label */}
                      {option.imageUrl ? (
                        <div className="w-full h-full flex items-center justify-center p-2">
                          <img
                            src={option.imageUrl}
                            alt={option.label || `Option ${letter}`}
                            className="w-full h-full object-contain rounded-lg"
                          />
                        </div>
                      ) : (
                        <span className="text-base sm:text-xl font-bold text-center px-6">
                          {option.label}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* Reveal-on-wrong teaching explanation */}
              {revealedIdx !== null && currentQuestion.explanation && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 p-2.5 bg-amber-950/70 border-2 border-amber-400/80 rounded-xl text-center text-xs sm:text-sm text-amber-200 shrink-0"
                >
                  {currentQuestion.explanation}
                </motion.div>
              )}

              {/* Non-punitive co-op reminder */}
              <div className="text-center text-xs text-[#A098B0] mt-2 shrink-0 rally-compact-hide">
                Wrong answers never shrink the bar — keep trying, team!
              </div>
            </motion.div>
          )}

          {/* ── 3. FEEDBACK BURST (≤900ms) ── */}
          {phase === 'feedback' && (
            <motion.div
              key="feedback"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex-1 flex items-center justify-center select-none"
            >
              <div className="text-center bg-[#141422] border border-[#00FFCC]/40 rounded-3xl p-6 sm:p-10 shadow-[0_0_36px_rgba(0,255,204,0.2)] max-w-md">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200 }}
                  className="text-6xl sm:text-7xl mb-3"
                >
                  💪
                </motion.div>
                <h2 className="text-xl sm:text-3xl font-headline font-black text-[#00FFCC] drop-shadow-[0_0_12px_rgba(0,255,204,0.5)] mb-2">
                  {pickedStudent ? `${pickedStudent.name} filled the bar!` : 'The class filled the bar!'}
                </h2>
                <div className="text-base sm:text-xl font-bold text-[#E8E0F0]">
                  {totalCorrect} / {TARGET_CORRECT} — keep going!
                </div>
              </div>
            </motion.div>
          )}

          {/* ── 4. VICTORY CELEBRATION (Preserves owner's animated 🏆 trophy) ── */}
          {phase === 'victory' && (
            <motion.div
              key="victory"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex-1 flex items-center justify-center select-none p-4"
            >
              <div className="text-center max-w-2xl">
                {/* Owner's committed trophy animation preserved verbatim */}
                <motion.div
                  initial={{ scale: 0, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 14 }}
                  className="text-[8rem] sm:text-[11rem] leading-none mb-4 drop-shadow-[0_12px_32px_rgba(255,45,120,0.4)]"
                >
                  🏆
                </motion.div>
                <motion.h2
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-3xl sm:text-6xl font-headline font-black text-[#00FFCC] drop-shadow-[0_0_16px_rgba(0,255,204,0.6)] mb-2 uppercase tracking-wider"
                >
                  RALLY COMPLETE!
                </motion.h2>
                <div className="text-lg sm:text-2xl font-bold text-[#E8E0F0] mb-3">
                  The whole class hit {TARGET_CORRECT} correct answers together! 🎉
                </div>
                <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#1E1E30] border border-[#FFE04A]/50 text-[#FFE04A] font-bold text-sm sm:text-base shadow-[0_0_16px_rgba(255,224,74,0.25)]">
                  <Sparkles className="w-5 h-5 text-[#FFE04A]" />
                  <span>Class Team Bonus: +{totalCorrect * 10} XP</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ═══ TURN FOOTER (Question Phase Only) ═══ */}
      {pickedStudent && phase === 'question' && (
        <footer className="shrink-0 text-center pb-2.5 pt-1 z-10">
          <div className="inline-flex items-center gap-3 bg-[#141422] border border-[#302840] rounded-full px-5 py-1.5 shadow-lg">
            <div className="w-7 h-7 rounded-full bg-[#FF2D78] text-[#1A0010] flex items-center justify-center font-bold text-xs">
              {pickedStudent.avatar || pickedStudent.name[0]}
            </div>
            <div className="text-xs sm:text-sm font-bold text-[#E8E0F0]">
              <span className="text-[#00FFCC]">{pickedStudent.name}'s</span> turn — Choose the right card!
            </div>
            {(studentStreaksRef.current[pickedStudent.id] || 0) >= 2 && (
              <span className="px-2 py-0.5 rounded-full bg-[#FFE04A]/20 border border-[#FFE04A]/50 text-[#FFE04A] text-xs font-bold flex items-center gap-1">
                <Flame className="w-3 h-3 fill-current" />
                Streak: {studentStreaksRef.current[pickedStudent.id]}
              </span>
            )}
          </div>
        </footer>
      )}
    </div>
  );
};

export default BoardClassRally;
