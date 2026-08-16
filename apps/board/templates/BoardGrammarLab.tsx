// BoardGrammarLab — Interactive grammar game (NEW GEN, audited rewrite 2026-08-07)
//
// Replaces: BoardGrammarSandbox (passive presentation) + BoardGrammarForge
// (teacher-typing Rung 4) + BoardGrammarPractice (legacy).
//
// Pedagogical loop (per item, per MASTER_ROADMAP.md):
//   SHOW pattern/instruction (2s) → STUDENT answers the item in its own rung
//   shape → INSTANT visual feedback → triple-write (points + attempt analytics
//   + FSRS) → next item.
//
// Rung shapes follow the REAL exercise contract (types/exercise.ts):
//   ERROR_SPOT   → sentence shown; MCQ over the correction options (rung 2, receptive)
//   TRANSFORM    → prompt + instruction; tile-assembly of the target with LCS
//                  partial credit (rung 3, productive)
//   GRAMMAR_FILL → sentence-with-blank; MCQ "which sentence is correct?" (rung 4, receptive)
//
// Lifecycle: NEW_TURN reset on currentTurnId, mistakesRef + awardedRef reset
// PER ITEM (multi-item slide — each item is its own scored attempt), remote
// controls via state.lastAction (RESET_GAME / REVEAL_HINT / SKIP_ITEM /
// MARK_CORRECT teacher override). Zero teacher typing.
//
// 2026-08-16 audit fixes: 3 escalating rounds played from a per-round item
// snapshot (no refetch flicker), reveal-on-wrong teaching beat (2nd miss →
// amber ring + explanation, ~2.2s hold), streak bonuses passed to
// scoreForAttempt (+ confetti at 3/5), sound cues on every result branch,
// MARK_CORRECT phase guard, MCQ hint now ELIMINATES a wrong option instead of
// painting the answer yellow, TRANSFORM bank carries real distractors,
// pure-updater advance, SLIDE_COMPLETE broadcast + inbound handling.
//
// 2026-08-17 steal mechanic: STEAL_OFFER landing during the 2nd-miss reveal
// hold cancels the reveal→advance timer and freezes the question (the turnId
// reset effect is suppressed while a steal is live, so the stealer pick's
// NEW_TURN can't wipe the item). The picked stealer re-answers the SAME item
// for HALF points (the ratio arg does the halving — no streak multiplier on
// steals), one steal per question (latched until the item advances).

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2 } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useEscalatingPool } from '../useEscalatingPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { computeLCSPartialCredit, PARTIAL_PASS_THRESHOLD, shuffle } from './scoringUtils';
import { logAttempt } from './scoreAttempt';
import { playCue } from './playCue';
import { playAudioUrl } from '../../../services/SpeechService';
import type { PoolItem, ErrorSpotContent, TransformContent, GrammarFillContent } from '../../../types/exercise';

type RungShape = 'error_spot' | 'transform' | 'fill_blank';

interface GrammarItem {
  poolItem: PoolItem;
  shape: RungShape;
  ruleName: string;
}

// 3 real rounds: buildRound escalates the exercise types/rungs per roundIndex,
// so round 3 pulls the higher-rung shapes via the engine.
const TOTAL_ROUNDS = 3;

/** Steal banner render state (STEAL_OFFER flow). Null = no steal live. */
type StealBanner =
  | { kind: 'offer' }
  | { kind: 'active'; name: string }
  | { kind: 'stolen'; name: string; points: number };

const BoardGrammarLab = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation, triggerAction, triggerConfetti } = useSession();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  /** Per-item resolve latch (success / reveal / MARK_CORRECT) — an item can
   *  only resolve once; blocks double remote taps and post-reveal input. */
  const resolvedRef = useRef(false);
  /** Completion latch — makes the SLIDE_COMPLETE broadcast idempotent. */
  const completeRef = useRef(false);
  /** Steal phase: null = none live; 'pending' = STEAL_OFFER accepted, waiting
   *  for the teacher to pick the stealer; 'active' = stealer answering the
   *  SAME item. One steal per item — latched until the item advances. Kept in
   *  a ref (not state) because handlers/effects must read it synchronously,
   *  most critically the turnId reset effect, which must be a no-op while a
   *  steal is live (the stealer pick's NEW_TURN must not wipe the item). */
  const stealPhaseRef = useRef<'pending' | 'active' | null>(null);
  const stealerIdRef = useRef<string | null>(null);
  const preStealWinnerRef = useRef<string | null>(null);
  const [stealBanner, setStealBanner] = useState<StealBanner | null>(null);
  /** Pending auto-advance (reveal hold / feedback hold / stolen celebration).
   *  STEAL_OFFER must be able to cancel it or the question would slide on
   *  mid-steal. */
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentItemIdx, setCurrentItemIdx] = useState(0);
  const [phase, setPhase] = useState<'pattern' | 'answer' | 'feedback' | 'complete' | 'empty'>('pattern');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [buildTiles, setBuildTiles] = useState<string[]>([]);
  const [showHint, setShowHint] = useState(false);
  /** MCQ hint: indices of WRONG options the hint has eliminated so far. */
  const [eliminated, setEliminated] = useState<number[]>([]);
  const [lastAward, setLastAward] = useState(0);
  const [streak, setStreak] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [roundIndex, setRoundIndex] = useState(1);

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id).filter(Boolean), [state.students]);

  // ── Steal plumbing (STEAL_OFFER → pick → half-points steal) ──────────────
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
   *  a steal never leaks across items, turns, or a RESET_GAME. */
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

  // ── Content: ERROR_SPOT / TRANSFORM / GRAMMAR_FILL via the director ────
  const { items: poolItems, loading } = useEscalatingPool({
    unitId,
    shellType: 'GRAMMAR_LAB',
    phase: 'PRACTICE',
    roster,
    roundIndex,
    totalRounds: TOTAL_ROUNDS,
    roundSize: 2,
  });

  // Snapshot: play from the last resolved round's items so a refetch can't
  // blank the board mid-item. roundTransition covers the gap between rounds;
  // fetchStartedRef separates the real settle from the pre-fetch stale frame
  // (useBoardPool's loading flag flips one effect-pass after roundIndex does).
  const [roundItems, setRoundItems] = useState<PoolItem[]>([]);
  const [roundTransition, setRoundTransition] = useState(false);
  const fetchStartedRef = useRef(true);
  useEffect(() => {
    if (roundTransition) {
      if (loading) {
        fetchStartedRef.current = true;
        return;
      }
      if (!fetchStartedRef.current) return; // stale pre-fetch frame
      // Settled: adopt the new round, or end the slide if the higher rung
      // has no content for this unit yet.
      setRoundTransition(false);
      if (poolItems.length > 0) setRoundItems(poolItems);
      else completeGame();
      return;
    }
    if (!loading && poolItems.length > 0) setRoundItems(poolItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, poolItems, roundIndex, roundTransition]);

  const grammarItems: GrammarItem[] = useMemo(() => {
    const items: GrammarItem[] = [];
    for (const pi of roundItems) {
      const content = pi.content as any;
      const ruleName = content.rule_name || content.instruction || 'Grammar Rule';
      if (pi.exercise_type === 'ERROR_SPOT') items.push({ poolItem: pi, shape: 'error_spot', ruleName });
      else if (pi.exercise_type === 'TRANSFORM') items.push({ poolItem: pi, shape: 'transform', ruleName });
      else if (pi.exercise_type === 'GRAMMAR_FILL') items.push({ poolItem: pi, shape: 'fill_blank', ruleName });
    }
    return items;
  }, [roundItems]);

  const currentItem = grammarItems[currentItemIdx];

  // TRANSFORM tile bank — shuffled ONCE per item (not per render). Carries
  // 2-3 real distractors drawn from the item's OTHER options so building is a
  // choice, not an anagram (audit fix — it used to be the target reshuffled).
  const transformBank = useMemo(() => {
    if (!currentItem || currentItem.shape !== 'transform') return [];
    const content = currentItem.poolItem.content as TransformContent;
    const options = content.options || [];
    const targetWords = (options[content.correct_index] || '').split(' ');
    const targetSet = new Set(targetWords);
    const distractorPool: string[] = [];
    options.forEach((opt, i) => {
      if (i === content.correct_index) return;
      for (const w of (opt || '').split(' ')) {
        if (!targetSet.has(w) && !distractorPool.includes(w)) distractorPool.push(w);
      }
    });
    return shuffle([...targetWords, ...shuffle(distractorPool).slice(0, 3)]);
  }, [currentItemIdx, currentItem]);

  // ── Lifecycle: reset everything on a NEW picked student ─────────────────
  useEffect(() => {
    if (turnId === null) return;
    // STEAL FREEZE: picking the stealer is a normal pick, which broadcasts
    // SPIN_WHEEL + NEW_TURN — the NEW_TURN turnId change would normally wipe
    // the board back to round 1 / item 0. While a steal is pending or active
    // the stolen item is frozen in place; the steal refs are cleared on the
    // item's advance/reset instead, after which normal per-pick resets resume.
    if (stealPhaseRef.current !== null) return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    resolvedRef.current = false;
    completeRef.current = false;
    fetchStartedRef.current = true;
    setCurrentItemIdx(0);
    setPhase('pattern');
    setSelectedOption(null);
    setBuildTiles([]);
    setShowHint(false);
    setEliminated([]);
    setStreak(0);
    setRevealed(false);
    setRoundIndex(1);
    setRoundItems([]);
    setRoundTransition(false);
  }, [turnId]);

  // ── Steal lock-in: convert the stealer pick into an active steal ────────
  // A pick broadcasts SPIN_WHEEL (quickWheelWinner changes NOW) and NEW_TURN
  // (currentTurnId changes ~2.5s later, after the wheel animation). The turnId
  // effect above is frozen while the steal is live, so neither half of the
  // pick can wipe the item; THIS effect is what locks the pick in. It only
  // acts while a steal is pending — quickWheelWinner changes at any other
  // time (a fresh turn after the steal resolved) are ignored here.
  useEffect(() => {
    if (stealPhaseRef.current !== 'pending') return;
    const winner = state.quickWheelWinner;
    if (!winner || winner === preStealWinnerRef.current) return; // same kid re-picked → keep waiting
    stealPhaseRef.current = 'active';
    stealerIdRef.current = winner;
    // Re-present the SAME item, answerable by the stealer: clear the amber
    // reveal ring, un-latch the resolve guard (it blocked input during the
    // reveal hold / steal-pending), wipe the first student's wrong
    // selection/tiles so the stealer gets a clean board.
    resolvedRef.current = false;
    setRevealed(false);
    setSelectedOption(null);
    setBuildTiles([]);
    setStealBanner({ kind: 'active', name: resolveName(winner) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.quickWheelWinner]);

  // ── Empty state once the pool resolves with nothing usable ─────────────
  useEffect(() => {
    if (!loading && !roundTransition && grammarItems.length === 0 && !completeRef.current) setPhase('empty');
  }, [loading, roundTransition, grammarItems.length]);

  // ── Remote controls ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;
    if (type === 'RESET_GAME') {
      clearSteal();
      mistakesRef.current = 0;
      awardedRef.current = false;
      resolvedRef.current = false;
      completeRef.current = false;
      fetchStartedRef.current = true;
      setCurrentItemIdx(0);
      setPhase('pattern');
      setSelectedOption(null);
      setBuildTiles([]);
      setShowHint(false);
      setEliminated([]);
      setStreak(0);
      setRevealed(false);
      setRoundIndex(1);
      setRoundItems([]);
      setRoundTransition(false);
    } else if (type === 'REVEAL_HINT') {
      // Audit fix: the hint used to paint the CORRECT option yellow (a total
      // giveaway). MCQ shapes now ELIMINATE one wrong option (dim/strike)
      // instead; the TRANSFORM assembly keeps the next-needed-tile scaffold.
      setShowHint(true);
      if (currentItem && currentItem.shape !== 'transform' && phase === 'answer') {
        const content = currentItem.poolItem.content as any;
        const wrongs = (content.options || [])
          .map((_: string, i: number) => i)
          .filter((i: number) => i !== content.correct_index && !eliminated.includes(i));
        // Always leave the answer plus at least one live wrong option.
        if (wrongs.length > 1) setEliminated((prev) => [...prev, wrongs[0]]);
      }
    } else if (type === 'SKIP_ITEM') {
      advanceToNext();
    } else if (type === 'MARK_CORRECT') {
      // Teacher override for a defensible oral answer: force success.
      // handleSuccess's phase + resolvedRef guards keep this from
      // double-advancing during feedback/pattern (audit fix).
      if (currentItem && currentItem.shape !== 'transform' && phase === 'answer') {
        setSelectedOption((currentItem.poolItem.content as any).correct_index);
      }
      handleSuccess(1.0, true);
    } else if (type === 'SLIDE_COMPLETE') {
      // Forced End from the remote/commander → jump to the complete state.
      // completeRef stops us echoing our own broadcast back (our own
      // optimistic lastAction update re-enters this listener).
      completeGame(false);
    } else if (type === 'STEAL_OFFER') {
      // Steal window: ONLY while the 2nd-miss reveal hold is on screen
      // (phase 'answer' + revealed — the only moment `revealed` is true).
      // Everywhere else (1st miss, pattern/feedback/complete) the tap is a
      // harmless no-op. resolvedRef is still latched here, so the original
      // student cannot sneak an answer while the steal waits for the pick.
      if (phase === 'answer' && revealed && !completeRef.current && stealPhaseRef.current === null) {
        beginStealPending();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // ── Pattern beat: 2s read-time, then the item's interaction ────────────
  useEffect(() => {
    if (phase !== 'pattern' || !currentItem) return;
    const timer = setTimeout(() => setPhase('answer'), 2000);
    return () => clearTimeout(timer);
  }, [phase, currentItemIdx, currentItem]);

  // ── Scoring helpers (per-item attempt lifecycle) ────────────────────────
  const handleSuccess = (partialCreditRatio: number, forced = false) => {
    if (!currentItem || resolvedRef.current || phase !== 'answer') return;
    // MARK_CORRECT (or any success routing) during a live steal resolves the
    // STEAL — half points to the stealer — never a full-price override.
    if (stealPhaseRef.current === 'active') {
      handleStealCorrect();
      return;
    }
    resolvedRef.current = true;
    playCue('correct');
    const nextStreak = streak + 1;
    setStreak(nextStreak);
    if (nextStreak === 3 || nextStreak === 5) {
      playCue('streak');
      triggerConfetti();
    }
    const picked = state.quickWheelWinner;
    const difficulty = currentItem.poolItem.difficulty || 2;
    const points = scoreForAttempt(
      mistakesRef.current,
      difficulty,
      forced ? 1.0 : partialCreditRatio,
      nextStreak,
    );

    if (picked && !awardedRef.current) {
      awardedRef.current = true;
      if (points > 0) addPoints(picked, points);
      logAttempt({
        state,
        picked,
        unitId,
        objectiveId: currentItem.poolItem.objective_id,
        exerciseType: currentItem.poolItem.exercise_type,
        difficulty,
        correctness: partialCreditRatio >= 1 ? 'correct' : 'partial',
        modality: currentItem.shape === 'transform' ? 'productive' : 'receptive',
        pushToRemediation,
      });
    }
    setLastAward(points);
    setPhase('feedback');
    // Dead-time compression: pure celebration holds ≤900ms (audit fix).
    scheduleAdvance(() => advanceToNext(), 900);
  };

  const handleMiss = () => {
    if (!currentItem || resolvedRef.current) return;
    playCue('wrong');
    setStreak(0);
    const picked = state.quickWheelWinner;
    if (picked) {
      mistakesRef.current += 1;
      addPoints(picked, -MISTAKE_PENALTY);
    }
    logAttempt({
      state,
      picked: picked || '',
      unitId,
      objectiveId: currentItem.poolItem.objective_id,
      exerciseType: currentItem.poolItem.exercise_type,
      difficulty: currentItem.poolItem.difficulty || 2,
      correctness: 'incorrect',
      correct: false,
      modality: currentItem.shape === 'transform' ? 'productive' : 'receptive',
      pushToRemediation,
    });
  };

  // Reveal-on-wrong: 2nd consecutive miss on an item → amber-ring the correct
  // option/tiles, show the explanation when present, hold ~2.2s (a TEACHING
  // hold), then advance — no further attempts on that item. Reset per item.
  const revealAnswer = (advance: () => void) => {
    playCue('reveal');
    resolvedRef.current = true;
    setRevealed(true);
    scheduleAdvance(() => {
      setRevealed(false);
      advance();
    }, 2200);
  };

  // ── Steal resolution ─────────────────────────────────────────────────────
  // Stealer CORRECT: HALF points via the ratio arg (the halving mechanism),
  // no streak multiplier — steals never count toward streaks. Awarded to the
  // LATCHED stealer id (quickWheelWinner already points at them after the
  // pick, but the latch is authoritative even if another pick sneaks in).
  const handleStealCorrect = () => {
    if (!currentItem || resolvedRef.current || phase !== 'answer') return;
    const stealer = stealerIdRef.current;
    if (!stealer) return;
    resolvedRef.current = true;
    playCue('correct');
    const difficulty = currentItem.poolItem.difficulty || 2;
    const points = scoreForAttempt(mistakesRef.current, difficulty, 0.5);
    if (!awardedRef.current) {
      awardedRef.current = true;
      if (points > 0) addPoints(stealer, points);
      logAttempt({
        state,
        picked: stealer,
        unitId,
        objectiveId: currentItem.poolItem.objective_id,
        exerciseType: currentItem.poolItem.exercise_type,
        difficulty,
        correctness: 'correct',
        modality: currentItem.shape === 'transform' ? 'productive' : 'receptive',
        pushToRemediation,
      });
    }
    setLastAward(points);
    setPhase('feedback');
    setStealBanner({ kind: 'stolen', name: resolveName(stealer), points });
    scheduleAdvance(() => advanceToNext(), 1200);
  };

  // Stealer WRONG: one shot only — wrong cue, then the standard reveal path
  // (answer + explanation, ~2.2s teaching hold) and advance. No penalty /
  // attempt logged against the stealer (the original student already paid
  // for the misses), and NO second steal — stealPhaseRef stays latched until
  // the advance clears it, so a repeat STEAL_OFFER is rejected.
  const handleStealWrong = () => {
    if (!currentItem || resolvedRef.current || phase !== 'answer') return;
    playCue('wrong');
    setStealBanner(null);
    revealAnswer(() => advanceToNext());
  };

  // Natural completion → terminal card + SLIDE_COMPLETE broadcast. The ref
  // makes it idempotent across the optimistic lastAction echo and the remote's
  // forced End both landing here.
  const completeGame = (broadcast = true) => {
    if (completeRef.current) return;
    completeRef.current = true;
    clearSteal(); // forced End during a steal: tear it down + kill pending holds
    playCue('win');
    setPhase('complete');
    if (broadcast) triggerAction('SLIDE_COMPLETE', { forced: false });
  };

  // ── MCQ (ERROR_SPOT corrections / GRAMMAR_FILL sentences) ──────────────
  const handleMcqSelect = (idx: number) => {
    if (!currentItem || phase !== 'answer' || resolvedRef.current) return;
    if (eliminated.includes(idx)) return;
    const content = currentItem.poolItem.content as ErrorSpotContent | GrammarFillContent;
    setSelectedOption(idx);
    if (stealPhaseRef.current === 'active') {
      // Stealer answers through the same UI: half points or the reveal.
      if (idx === content.correct_index) handleStealCorrect();
      else handleStealWrong();
      return;
    }
    if (idx === content.correct_index) {
      handleSuccess(1.0);
    } else {
      handleMiss();
      if (mistakesRef.current >= 2) revealAnswer(() => advanceToNext());
      else setTimeout(() => setSelectedOption(null), 700);
    }
  };

  // ── Tile assembly (TRANSFORM) ───────────────────────────────────────────
  const handleTileTap = (tile: string) => {
    if (phase !== 'answer' || resolvedRef.current) return;
    setBuildTiles((prev) => [...prev, tile]);
  };
  const handleRemoveTile = (idx: number) => {
    if (phase !== 'answer' || resolvedRef.current) return;
    setBuildTiles((prev) => prev.filter((_, i) => i !== idx));
  };
  const handleCheckAssembly = () => {
    if (!currentItem || currentItem.shape !== 'transform' || phase !== 'answer' || resolvedRef.current) return;
    const content = currentItem.poolItem.content as TransformContent;
    const target = (content.options?.[content.correct_index] || '').split(' ');
    const ratio = computeLCSPartialCredit(buildTiles, target);
    if (stealPhaseRef.current === 'active') {
      // Steal attempts are flat half-of-base — the 0.5 ratio in
      // handleStealCorrect does the halving, so LCS partials don't stack.
      if (ratio >= PARTIAL_PASS_THRESHOLD) handleStealCorrect();
      else handleStealWrong();
      return;
    }
    if (ratio >= PARTIAL_PASS_THRESHOLD) {
      handleSuccess(ratio);
    } else {
      handleMiss();
      if (mistakesRef.current >= 2) revealAnswer(() => advanceToNext());
      else setTimeout(() => setBuildTiles([]), 700);
    }
  };

  // Audit fix: this used to be an impure state UPDATER (setPhase + ref resets
  // INSIDE setCurrentItemIdx's callback — side effects that can fire twice
  // under StrictMode and interleave with React's replayed updates). All side
  // effects now live here, in the calling callback.
  const advanceToNext = () => {
    if (completeRef.current) return;
    // A steal lives within the current item ONLY — every advance path
    // (answer, reveal, steal resolution, SKIP_ITEM escape hatch) lands here,
    // so this is the single funnel that retires the steal. cancelAdvance
    // inside clearSteal also kills any straggling hold timer, fixing the
    // latent double-advance when SKIP races a reveal/feedback hold.
    clearSteal();
    const resetItemState = () => {
      // Per-item attempt reset — each item is its own scored attempt.
      mistakesRef.current = 0;
      awardedRef.current = false;
      resolvedRef.current = false;
      setSelectedOption(null);
      setBuildTiles([]);
      setShowHint(false);
      setEliminated([]);
      setRevealed(false);
    };
    if (currentItemIdx < grammarItems.length - 1) {
      resetItemState();
      setPhase('pattern');
      setCurrentItemIdx(currentItemIdx + 1);
    } else if (roundIndex < TOTAL_ROUNDS) {
      // Round done → escalate. Clear the snapshot + raise the transition flag
      // so the "level up" interstitial shows until the higher-rung items land.
      resetItemState();
      setPhase('pattern');
      setCurrentItemIdx(0);
      setRoundItems([]);
      fetchStartedRef.current = false;
      setRoundTransition(true);
      setRoundIndex((r) => r + 1);
    } else {
      completeGame();
    }
  };

  // ── Interstitial / loading / empty states (never a forever spinner) ─────
  if (roundTransition) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-indigo-50 to-purple-50">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className="text-7xl mb-4">⚡</div>
          <h2 className="text-4xl font-bold text-indigo-900">Round {roundIndex} — Level up!</h2>
          <div className="text-lg text-gray-500 mt-2">Harder items coming…</div>
        </motion.div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-indigo-50 to-purple-50">
        <div className="text-2xl text-gray-400">Loading grammar items…</div>
      </div>
    );
  }
  if (phase === 'empty' || (!loading && grammarItems.length === 0 && phase !== 'complete')) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-indigo-50 to-purple-50 p-8 text-center">
        <div className="text-7xl mb-6">🧪</div>
        <h2 className="text-4xl font-bold text-indigo-900 mb-3">Grammar Lab</h2>
        <div className="text-xl text-gray-500 max-w-xl">
          No practice items ready yet. Grammar objectives unlock here after the class has been
          introduced to the rule (run the Grammar presentation first) — or skip to the next slide.
        </div>
      </div>
    );
  }
  if (!currentItem && phase !== 'complete') return null;

  // Null-safe: on the empty-round completion path currentItem is undefined.
  const content = (currentItem?.poolItem?.content ?? {}) as any;
  const mcqOptions: string[] = content.options || [];

  // TRANSFORM helpers — target words, reveal leftovers, next-needed hint tile.
  const targetWords: string[] =
    currentItem?.shape === 'transform'
      ? (content.options?.[content.correct_index] || '').split(' ')
      : [];
  // Reveal note: ERROR_SPOT/GRAMMAR_FILL carry `explanation`; TRANSFORM has
  // `instruction` (audit fix — the reveal teaches, not just flashes).
  const revealNote: string | undefined =
    currentItem?.shape === 'transform' ? content.instruction : content.explanation;
  const nextNeededWord = targetWords[buildTiles.length];
  const usedByText: Record<string, number> = {};
  for (const t of buildTiles) usedByText[t] = (usedByText[t] || 0) + 1;
  const seenByText: Record<string, number> = {};
  let hintBankIdx = -1;
  for (let i = 0; i < transformBank.length; i++) {
    const w = transformBank[i];
    seenByText[w] = (seenByText[w] || 0) + 1;
    const isUsed = (usedByText[w] || 0) >= seenByText[w];
    if (hintBankIdx === -1 && !isUsed && w === nextNeededWord) hintBankIdx = i;
  }
  const remainingTarget: Record<string, number> = {};
  for (const w of targetWords) remainingTarget[w] = (remainingTarget[w] || 0) + 1;
  for (const t of buildTiles) if (remainingTarget[t]) remainingTarget[t] -= 1;

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-indigo-50 to-purple-50 p-8">
      {/* Header */}
      <div className="text-center mb-6">
        <motion.h1
          key={currentItemIdx}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold text-indigo-900 mb-2"
        >
          Grammar Lab
        </motion.h1>
        <div className="text-lg text-indigo-600 font-medium">{currentItem?.ruleName}</div>
        <div className="text-sm text-gray-500 mt-1">
          Round {roundIndex} of {TOTAL_ROUNDS}
          {grammarItems.length > 0 && ` · Item ${currentItemIdx + 1} of ${grammarItems.length}`}
        </div>
        {streak > 1 && (
          <div className="inline-flex items-center gap-1 mt-2 px-3 py-1 bg-indigo-500 text-white rounded-full font-bold text-sm">
            🔥 Streak x{streak}
          </div>
        )}
      </div>

      {/* Steal banner (STEAL_OFFER → pick → half-points steal) */}
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

      <AnimatePresence mode="wait">
        {/* Pattern beat */}
        {phase === 'pattern' && (
          <motion.div
            key="pattern"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex-1 flex items-center justify-center"
          >
            <div className="bg-white rounded-2xl shadow-xl p-12 max-w-2xl text-center">
              <div className="text-sm text-gray-500 mb-4">Pattern</div>
              {/* Audit fix: dropped the phantom `pattern_template` read — the
                  content contract has `instruction`, fall straight back to it. */}
              <div className="text-3xl font-mono text-indigo-900 mb-4">
                {content.instruction || 'Subject + Verb + Object'}
              </div>
              {content.explanation && <div className="text-lg text-gray-600">{content.explanation}</div>}
            </div>
          </motion.div>
        )}

        {/* Answer phase — shape depends on the item type */}
        {phase === 'answer' && currentItem && (
          <motion.div
            key={`answer-${currentItemIdx}`}
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -80 }}
            className="flex-1 flex flex-col items-center justify-center"
          >
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-3xl w-full">
              {/* ERROR_SPOT: find the fix */}
              {currentItem.shape === 'error_spot' && (
                <>
                  <div className="text-center mb-6">
                    <div className="text-sm text-gray-500 mb-2">Rung 2: Spot the Error</div>
                    <div className="text-2xl text-gray-800 mb-2">{content.sentence}</div>
                    <div className="text-lg text-gray-600">Which fix is correct?</div>
                  </div>
                  <div className="space-y-3">
                    {mcqOptions.map((option: string, idx: number) => {
                      const isEliminated = eliminated.includes(idx);
                      return (
                        <motion.button
                          key={idx}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleMcqSelect(idx)}
                          disabled={isEliminated}
                          className={`w-full p-4 rounded-xl text-left text-xl transition-all ${
                            isEliminated
                              ? 'bg-gray-100 text-gray-300 line-through cursor-not-allowed border-2 border-gray-200'
                              : selectedOption === idx
                              ? idx === content.correct_index
                                ? 'bg-green-500 text-white'
                                : 'bg-red-500 text-white'
                              : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border-2 border-gray-200'
                          } ${revealed && idx === content.correct_index ? 'ring-4 ring-amber-400' : ''}`}
                        >
                          {option}
                        </motion.button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* TRANSFORM: tile assembly */}
              {currentItem.shape === 'transform' && (
                <>
                  <div className="text-center mb-6">
                    <div className="text-sm text-gray-500 mb-2">Rung 3: Transform It</div>
                    <div className="text-xl text-indigo-700 font-semibold mb-1">{content.instruction}</div>
                    <div className="text-lg text-gray-500 line-through decoration-gray-300">{content.prompt_sentence}</div>
                  </div>
                  {/* Build area */}
                  <div className="min-h-20 bg-gray-50 rounded-xl p-4 mb-6 flex flex-wrap gap-2 justify-center items-center">
                    {buildTiles.length === 0 && (
                      <div className="text-gray-400 text-lg">Tap tiles to build the new sentence</div>
                    )}
                    {buildTiles.map((tile, idx) => (
                      <motion.button
                        key={`${tile}-${idx}`}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        onClick={() => handleRemoveTile(idx)}
                        className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-lg font-medium"
                      >
                        {tile}
                      </motion.button>
                    ))}
                  </div>
                  {/* Tile bank — target words + distractors. The per-tile
                      identity handling below (usedCount vs bank prefix count)
                      already deals with duplicate words correctly — preserved. */}
                  <div className="flex flex-wrap gap-2 justify-center mb-6">
                    {transformBank.map((tile, idx) => {
                      const usedCount = buildTiles.filter((t) => t === tile).length;
                      const bankCount = transformBank.slice(0, idx + 1).filter((t) => t === tile).length;
                      const isUsed = usedCount >= bankCount;
                      const isTargetTile = (remainingTarget[tile] || 0) > 0;
                      return (
                        <motion.button
                          key={`${tile}-${idx}`}
                          whileHover={isUsed ? undefined : { scale: 1.05 }}
                          whileTap={isUsed ? undefined : { scale: 0.95 }}
                          onClick={() => handleTileTap(tile)}
                          disabled={isUsed}
                          className={`px-4 py-2 rounded-lg text-lg font-medium transition-all ${
                            isUsed
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                              : showHint && idx === hintBankIdx
                              ? 'bg-yellow-200 border-2 border-yellow-400 text-gray-800'
                              : 'bg-white border-2 border-indigo-300 hover:border-indigo-500 text-indigo-700'
                          } ${revealed && !isUsed && isTargetTile ? 'ring-4 ring-amber-400' : ''}`}
                        >
                          {tile}
                        </motion.button>
                      );
                    })}
                  </div>
                  {buildTiles.length > 0 && (
                    <div className="text-center">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleCheckAssembly}
                        className="px-8 py-3 bg-green-500 text-white rounded-xl text-xl font-bold shadow-lg"
                      >
                        Check
                      </motion.button>
                    </div>
                  )}
                </>
              )}

              {/* GRAMMAR_FILL: which sentence is correct */}
              {currentItem.shape === 'fill_blank' && (
                <>
                  <div className="text-center mb-6">
                    <div className="text-sm text-gray-500 mb-2">Rung 4: Use the Rule</div>
                    {content.sentence_with_blank && (
                      <div className="text-2xl text-gray-800 mb-2">{content.sentence_with_blank}</div>
                    )}
                    <div className="text-lg text-gray-600">Which sentence uses the rule correctly?</div>
                  </div>
                  <div className="space-y-3">
                    {mcqOptions.map((option: string, idx: number) => {
                      const isEliminated = eliminated.includes(idx);
                      return (
                        <motion.button
                          key={idx}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleMcqSelect(idx)}
                          disabled={isEliminated}
                          className={`w-full p-4 rounded-xl text-left text-xl transition-all ${
                            isEliminated
                              ? 'bg-gray-100 text-gray-300 line-through cursor-not-allowed border-2 border-gray-200'
                              : selectedOption === idx
                              ? idx === content.correct_index
                                ? 'bg-green-500 text-white'
                                : 'bg-red-500 text-white'
                              : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border-2 border-gray-200'
                          } ${revealed && idx === content.correct_index ? 'ring-4 ring-amber-400' : ''}`}
                        >
                          {option}
                        </motion.button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Reveal-on-wrong teaching beat (2nd miss): the answer + why */}
              {revealed && currentItem && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 p-4 bg-amber-50 border-2 border-amber-300 rounded-xl text-center"
                >
                  {currentItem.shape === 'transform' && (
                    <div className="text-lg font-semibold text-amber-900 mb-1">{targetWords.join(' ')}</div>
                  )}
                  {revealNote && <div className="text-base text-amber-800">{revealNote}</div>}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {/* Feedback */}
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
                {pickedStudent ? `${pickedStudent.name} cracked the grammar!` : 'Excellent!'}
              </h2>
              <div className="text-2xl text-gray-600">+{lastAward} points</div>
              {content.options?.[content.correct_index] && currentItem?.shape !== 'transform' && (
                <button
                  onClick={() => content.audio_url && playAudioUrl(content.audio_url)}
                  className="mt-4 px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-bold inline-flex items-center gap-2"
                >
                  <Volume2 size={20} /> Hear it
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Complete */}
        {phase === 'complete' && (
          <motion.div key="complete" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-8xl mb-6">🏆</div>
              <h2 className="text-5xl font-bold text-indigo-900 mb-4">Grammar Lab Complete!</h2>
              <div className="text-2xl text-gray-600">All {TOTAL_ROUNDS} rounds practiced</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Turn footer */}
      {pickedStudent && phase !== 'complete' && (
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-3 bg-white rounded-full px-6 py-3 shadow-lg">
            <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold">
              {pickedStudent.name[0]}
            </div>
            <div className="text-xl font-semibold text-gray-800">{pickedStudent.name}'s turn</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoardGrammarLab;
