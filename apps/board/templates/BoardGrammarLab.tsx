// BoardGrammarLab — Interactive grammar game (v3 Redesign 2026-09-12)
//
// Design sources:
//   - docs/audit/games-v3/stitch/17-grammar-lab/1-building.html (Syntax runway + 3D blocks)
//   - docs/audit/games-v3/stitch/17-grammar-lab/2-warming.html (Bilingual bubbling warming-up holding state)
//
// Pedagogical loop (per item, per MASTER_ROADMAP.md):
//   SHOW pattern/formula (2s) → STUDENT answers the item in its own rung
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
// MARK_CORRECT teacher override / SLIDE_COMPLETE / STEAL_OFFER).
//
// Preserves:
//   - Confetti + animated trophy completion (owner spring bounce)
//   - Escalating pool snapshots (3 rounds, roundSize: 2)
//   - Seeded deterministic tile banks
//   - Steal mechanic & reveal holds
//   - Phone-landscape floor 700x320 zero scroll
//   - Header clearance pl-40 lg:pl-48

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Beaker, Check, Zap, ArrowRight, RotateCcw, Flame } from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { useBoardPresentation } from '../boardPresentation';
import { makeRng } from '../../../services/seededRandom';
import { useEscalatingPool } from '../useEscalatingPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { computeLCSPartialCredit, PARTIAL_PASS_THRESHOLD, shuffle } from './scoringUtils';
import { logAttempt } from './scoreAttempt';
import { playCue } from './playCue';
import { playAudioUrl, browserSpeak } from '../../../services/SpeechService';
import type { PoolItem, ErrorSpotContent, TransformContent, GrammarFillContent } from '../../../types/exercise';

type RungShape = 'error_spot' | 'transform' | 'fill_blank';

interface GrammarItem {
  poolItem: PoolItem;
  shape: RungShape;
  ruleName: string;
}

const TOTAL_ROUNDS = 3;

/** Steal banner render state (STEAL_OFFER flow). Null = no steal live. */
type StealBanner =
  | { kind: 'offer' }
  | { kind: 'active'; name: string }
  | { kind: 'stolen'; name: string; points: number };

const BoardGrammarLab = ({ data }: { data?: any }) => {
  const { state, addPoints, pushToRemediation, triggerAction, triggerConfetti } = useSession();
  const seedBase = useSeedBase();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  const resolvedRef = useRef(false);
  const completeRef = useRef(false);
  const stealPhaseRef = useRef<'pending' | 'active' | null>(null);
  const stealerIdRef = useRef<string | null>(null);
  const preStealWinnerRef = useRef<string | null>(null);
  const [stealBanner, setStealBanner] = useState<StealBanner | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentItemIdx, setCurrentItemIdx] = useState(0);
  const [phase, setPhase] = useState<'pattern' | 'answer' | 'feedback' | 'complete' | 'empty'>('pattern');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [buildTiles, setBuildTiles] = useState<string[]>([]);
  const [showHint, setShowHint] = useState(false);
  const [eliminated, setEliminated] = useState<number[]>([]);
  const [lastAward, setLastAward] = useState(0);
  const [streak, setStreak] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [roundIndex, setRoundIndex] = useState(1);

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id).filter(Boolean), [state.students]);

  // ── Steal plumbing (STEAL_OFFER → pick → half-points steal) ──────────────
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

  const [roundItems, setRoundItems] = useState<PoolItem[]>(() => (!loading && poolItems.length > 0 ? poolItems : []));
  const [roundTransition, setRoundTransition] = useState(false);
  const fetchStartedRef = useRef(true);

  useEffect(() => {
    if (roundTransition) {
      if (loading) {
        fetchStartedRef.current = true;
        return;
      }
      if (!fetchStartedRef.current) return;
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

  // TRANSFORM tile bank — shuffled ONCE per item.
  const transformBank = useMemo(() => {
    if (!currentItem || currentItem.shape !== 'transform') return [];
    const content = currentItem.poolItem.content as TransformContent;
    const options = content.options || [];
    const targetWords = (options[content.correct_index] || '').split(' ').filter(Boolean);
    const targetSet = new Set(targetWords);
    const distractorPool: string[] = [];
    options.forEach((opt, i) => {
      if (i === content.correct_index) return;
      for (const w of (opt || '').split(' ').filter(Boolean)) {
        if (!targetSet.has(w) && !distractorPool.includes(w)) distractorPool.push(w);
      }
    });
    const itemId = currentItem.poolItem.id;
    return shuffle(
      [...targetWords, ...shuffle(distractorPool, makeRng(seedBase, itemId, 'distractors')).slice(0, 3)],
      makeRng(seedBase, itemId, 'bank'),
    );
  }, [currentItemIdx, currentItem, seedBase]);

  // ── Lifecycle: reset everything on a NEW picked student ─────────────────
  useEffect(() => {
    if (turnId === null) return;
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
    setRoundItems(poolItems.length > 0 ? poolItems : []);
    setRoundTransition(false);
  }, [turnId, poolItems]);

  // ── Steal lock-in: convert the stealer pick into an active steal ────────
  useEffect(() => {
    if (stealPhaseRef.current !== 'pending') return;
    const winner = state.quickWheelWinner;
    if (!winner || winner === preStealWinnerRef.current) return;
    stealPhaseRef.current = 'active';
    stealerIdRef.current = winner;
    resolvedRef.current = false;
    setRevealed(false);
    setSelectedOption(null);
    setBuildTiles([]);
    setStealBanner({ kind: 'active', name: resolveName(winner) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.quickWheelWinner]);

  // ── Empty state once the pool resolves with nothing usable ─────────────
  useEffect(() => {
    if (!loading && !roundTransition && poolItems.length === 0 && grammarItems.length === 0 && !completeRef.current) {
      setPhase('empty');
    }
  }, [loading, roundTransition, poolItems.length, grammarItems.length]);

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
      setShowHint(true);
      if (currentItem && currentItem.shape !== 'transform' && phase === 'answer') {
        const content = currentItem.poolItem.content as any;
        const wrongs = (content.options || [])
          .map((_: string, i: number) => i)
          .filter((i: number) => i !== content.correct_index && !eliminated.includes(i));
        if (wrongs.length > 1) setEliminated((prev) => [...prev, wrongs[0]]);
      }
    } else if (type === 'SKIP_ITEM') {
      advanceToNext();
    } else if (type === 'MARK_CORRECT') {
      if (currentItem && currentItem.shape !== 'transform' && phase === 'answer') {
        setSelectedOption((currentItem.poolItem.content as any).correct_index);
      }
      handleSuccess(1.0, true);
    } else if (type === 'SLIDE_COMPLETE') {
      completeGame(false);
    } else if (type === 'STEAL_OFFER') {
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

  const revealAnswer = (advance: () => void) => {
    playCue('reveal');
    resolvedRef.current = true;
    setRevealed(true);
    scheduleAdvance(() => {
      setRevealed(false);
      advance();
    }, 2200);
  };

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

  const handleStealWrong = () => {
    if (!currentItem || resolvedRef.current || phase !== 'answer') return;
    playCue('wrong');
    setStealBanner(null);
    revealAnswer(() => advanceToNext());
  };

  const completeGame = (broadcast = true) => {
    if (completeRef.current) return;
    completeRef.current = true;
    clearSteal();
    playCue('win');
    triggerConfetti();
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
    const target = (content.options?.[content.correct_index] || '').split(' ').filter(Boolean);
    const ratio = computeLCSPartialCredit(buildTiles, target);
    if (stealPhaseRef.current === 'active') {
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

  const advanceToNext = () => {
    if (completeRef.current) return;
    clearSteal();
    const resetItemState = () => {
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

  // ── Interstitial / loading / empty states ──────────────────────────────
  if (roundTransition) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-[#070C18] text-white cyber-grid select-none p-6">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center bg-[#0B132B] border border-cyan-500/30 p-10 rounded-3xl shadow-2xl">
          <div className="text-7xl mb-4">⚡</div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-[#00FFCC] tracking-tight">Round {roundIndex} — Level up!</h2>
          <div className="text-lg text-slate-400 mt-2 font-mono">Harder grammar challenges coming…</div>
        </motion.div>
      </div>
    );
  }

  // games-v3 audit 17 §3 F9: retract the 240px leaderboard rail while the
  // warming-up holding card shows (nothing is scored there). Kept ABOVE the
  // early returns — hooks must run unconditionally.
  const warmingUp = phase === 'empty' || (!loading && grammarItems.length === 0 && phase !== 'complete');
  const { setRailHidden } = useBoardPresentation();
  useEffect(() => {
    setRailHidden(warmingUp);
    return () => setRailHidden(false);
  }, [warmingUp, setRailHidden]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-[#070C18] text-cyan-400 cyber-grid select-none p-6">
        <div className="flex items-center gap-3 bg-[#0B132B] border border-cyan-500/30 px-8 py-5 rounded-2xl shadow-xl">
          <Beaker className="animate-spin text-[#00FFCC]" size={32} />
          <span className="text-2xl font-bold tracking-wide">Forging grammar lab items…</span>
        </div>
      </div>
    );
  }

  // ── Kid-Friendly Bilingual Warming Up Holding State (from Stitch Design #2) ──
  if (warmingUp) {
    return (
      <div className="h-full w-full bg-[#070C18] text-slate-100 flex flex-col justify-between p-4 md:p-6 cyber-grid select-none overflow-hidden relative gl-container">
        {/* Ambient radial glows behind center */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
          <div className="w-[640px] h-[640px] rounded-full bg-cyan-400/5 blur-[120px] absolute" />
          <div className="w-[420px] h-[420px] rounded-full bg-[#FF2D78]/5 blur-[100px] absolute translate-y-12" />
        </div>

        {/* Top HUD with clear left margin (pl-40 lg:pl-48) */}
        <header className="w-full flex items-center justify-between pl-40 lg:pl-48 relative z-20 gl-header">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0B132B] border border-white/10 flex items-center justify-center text-[#FF2D78] shadow-[0_0_15px_rgba(255,45,120,0.25)]">
              <Beaker size={22} />
            </div>
            <span className="font-headline font-extrabold text-xl tracking-tight text-white flex items-center gap-2">
              Grammar Lab
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 font-sans tracking-normal">ESL Studio</span>
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0B132B] border border-slate-800 text-xs font-semibold tracking-wider text-slate-300 uppercase">
            <span className="w-2 h-2 rounded-full bg-[#00FFCC] animate-pulse" />
            <span>STANDBY MODE</span>
          </div>
        </header>

        {/* Center arena: warming up holding card */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 relative z-10 gl-main">
          <div className="w-full max-w-xl bg-[#0B132B]/90 border border-[#182752] rounded-3xl p-6 md:p-8 flex flex-col items-center text-center shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-md relative overflow-hidden gl-card">
            {/* Bubbling test tube vector */}
            <div className="relative w-36 h-40 mb-4 flex items-center justify-center glow-beaker">
              {/* Floating bubbles */}
              <div className="absolute top-2 w-full flex justify-center pointer-events-none">
                <div className="absolute w-3.5 h-3.5 rounded-full bg-[#38BDF8]/80 shadow-[0_0_10px_#38BDF8] bubble-1 -translate-x-4" />
                <div className="absolute w-3 h-3 rounded-full bg-[#FF2D78]/80 shadow-[0_0_10px_#FF2D78] bubble-2 translate-x-3" />
                <div className="absolute w-2.5 h-2.5 rounded-full bg-white/90 shadow-[0_0_8px_#FFFFFF] bubble-3 -translate-x-1" />
                <div className="absolute w-3 h-3 rounded-full bg-[#00FFCC]/70 shadow-[0_0_10px_#00FFCC] bubble-4 translate-x-6" />
                <div className="absolute w-2 h-2 rounded-full bg-[#FF2D78]/90 shadow-[0_0_8px_#FF2E79] bubble-5 -translate-x-6" />
              </div>

              {/* Master SVG Test Tube */}
              <svg className="w-32 h-36 drop-shadow-[0_10px_25px_rgba(0,0,0,0.5)]" viewBox="0 0 140 180" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="glLiquidGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.9" />
                    <stop offset="60%" stopColor="#2563EB" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#FF2D78" stopOpacity="0.95" />
                  </linearGradient>
                  <linearGradient id="glGlassGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
                    <stop offset="25%" stopColor="#38BDF8" stopOpacity="0.2" />
                    <stop offset="75%" stopColor="#38BDF8" stopOpacity="0.1" />
                    <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.4" />
                  </linearGradient>
                  <filter id="glLiquidGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
                <rect x="42" y="24" width="56" height="110" rx="0" fill="#0B132B" opacity="0.6" />
                <path d="M42 130 C42 155 98 155 98 130 Z" fill="#0B132B" opacity="0.6" />
                <line x1="88" y1="50" x2="94" y2="50" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                <line x1="84" y1="65" x2="94" y2="65" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                <line x1="88" y1="80" x2="94" y2="80" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                <line x1="84" y1="95" x2="94" y2="95" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                <line x1="88" y1="110" x2="94" y2="110" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                <g className="liquid-sway">
                  <path d="M45 82 C55 80 65 85 75 82 C85 79 90 83 95 82 V132 C95 152 45 152 45 132 Z" fill="url(#glLiquidGrad)" filter="url(#glLiquidGlow)" />
                  <path d="M45 82 C55 79 65 85 75 82 C85 79 90 84 95 82" stroke="#BAE6FD" strokeWidth="3.5" strokeLinecap="round" opacity="0.9" />
                  <circle cx="56" cy="115" r="3" fill="#FFFFFF" opacity="0.8" />
                  <circle cx="78" cy="128" r="4" fill="#BAE6FD" opacity="0.7" />
                  <circle cx="68" cy="102" r="2.5" fill="#FF85B3" opacity="0.9" />
                  <circle cx="82" cy="94" r="2" fill="#FFFFFF" opacity="0.85" />
                  <circle cx="58" cy="136" r="3.5" fill="#38BDF8" opacity="0.6" />
                </g>
                <rect x="36" y="14" width="68" height="8" rx="4" fill="url(#glGlassGrad)" stroke="#38BDF8" strokeWidth="1.5" strokeOpacity="0.8" />
                <rect x="42" y="20" width="56" height="4" fill="#0B132B" opacity="0.8" />
                <path d="M42 22 V130 C42 158 98 158 98 130 V22" stroke="url(#glGlassGrad)" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M48 28 V128 C48 144 58 148 64 150" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
                <path d="M92 34 V110" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.25" />
                <path d="M28 55 Q34 55 34 49 Q34 55 40 55 Q34 55 34 61 Q34 55 28 55 Z" fill="#38BDF8" opacity="0.85" />
                <path d="M106 100 Q110 100 110 96 Q110 100 114 100 Q110 100 110 104 Q110 100 106 100 Z" fill="#FF2D78" opacity="0.85" />
              </svg>
            </div>

            <h1 className="font-headline font-extrabold text-2xl md:text-3xl text-white tracking-tight mb-2 leading-tight">
              Grammar Lab is warming up!
            </h1>
            <p className="text-lg md:text-xl font-semibold text-[#00FFCC] mb-3 tracking-wide drop-shadow-[0_0_12px_rgba(0,255,204,0.4)]">
              语法实验准备中…
            </p>
            <p className="text-slate-300 text-sm md:text-base font-medium max-w-md mb-6 leading-relaxed">
              Ask your teacher to generate exercises for this unit.
            </p>
            <button
              onClick={() => advanceToNext()}
              className="inline-flex items-center justify-center gap-2 px-6 py-2 rounded-full border border-slate-700 bg-[#070C18]/60 hover:bg-white/5 hover:border-slate-500 text-slate-400 hover:text-slate-200 text-sm font-semibold tracking-wide transition-all active:scale-95"
            >
              <span>Skip</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </main>

        <footer className="w-full flex items-center justify-between text-xs text-slate-500 font-mono gl-footer">
          <span>16:9 Projector Mode · 8m Distance Optimized</span>
          <span>Awaiting Exercises</span>
        </footer>

        <style>{`
          .cyber-grid {
            background-size: 48px 48px;
            background-image: 
              linear-gradient(to right, rgba(48, 40, 64, 0.35) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(48, 40, 64, 0.35) 1px, transparent 1px);
          }
          @keyframes rise-slow {
            0% { transform: translateY(20px) scale(0.7); opacity: 0; }
            40% { opacity: 0.9; }
            100% { transform: translateY(-70px) scale(1.15); opacity: 0; }
          }
          @keyframes rise-medium {
            0% { transform: translateY(16px) scale(0.6); opacity: 0; }
            50% { opacity: 1; }
            100% { transform: translateY(-60px) scale(1.1); opacity: 0; }
          }
          @keyframes rise-fast {
            0% { transform: translateY(10px) scale(0.5); opacity: 0; }
            50% { opacity: 0.85; }
            100% { transform: translateY(-50px) scale(1.2); opacity: 0; }
          }
          @keyframes wave-liquid {
            0%, 100% { transform: scaleY(1) translateY(0); }
            50% { transform: scaleY(1.04) translateY(-2px); }
          }
          .bubble-1 { animation: rise-slow 3.2s infinite ease-in-out; }
          .bubble-2 { animation: rise-medium 2.5s infinite ease-in-out 0.8s; }
          .bubble-3 { animation: rise-fast 2.1s infinite ease-in-out 1.5s; }
          .bubble-4 { animation: rise-medium 2.9s infinite ease-in-out 0.3s; }
          .bubble-5 { animation: rise-slow 3.6s infinite ease-in-out 1.2s; }
          .liquid-sway { animation: wave-liquid 3s infinite ease-in-out; transform-origin: bottom center; }
          .glow-beaker { filter: drop-shadow(0 0 20px rgba(56, 189, 248, 0.35)); }

          @media (max-height: 450px) {
            .gl-container { padding: 0.5rem 1rem !important; }
            .gl-header { margin-bottom: 0.25rem !important; }
            .gl-card { padding: 0.75rem 1rem !important; }
            .gl-footer { display: none !important; }
          }
        `}</style>
      </div>
    );
  }

  if (!currentItem && phase !== 'complete') return null;

  const content = (currentItem?.poolItem?.content ?? {}) as any;
  const mcqOptions: string[] = content.options || [];

  const targetWords: string[] =
    currentItem?.shape === 'transform'
      ? (content.options?.[content.correct_index] || '').split(' ').filter(Boolean)
      : [];

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

  // Formula presentation syntax pills
  const rawFormula = content.instruction || currentItem?.ruleName || 'Subject + Verb + Object';
  const formulaParts = rawFormula.includes('+')
    ? rawFormula.split('+').map((s: string) => s.trim()).filter(Boolean)
    : [rawFormula];

  const getSyntaxPillStyle = (idx: number) => {
    switch (idx % 4) {
      case 0:
        return 'bg-[#38BDF8]/15 border-[#38BDF8]/50 text-[#38BDF8] shadow-[0_0_12px_rgba(56,189,248,0.25)]';
      case 1:
        return 'bg-[#00FFCC]/15 border-[#00FFCC]/50 text-[#00FFCC] shadow-[0_0_12px_rgba(0,255,204,0.25)]';
      case 2:
        return 'bg-[#A855F7]/15 border-[#A855F7]/50 text-[#A855F7] shadow-[0_0_12px_rgba(168,85,247,0.25)]';
      default:
        return 'bg-[#F59E0B]/15 border-[#F59E0B]/50 text-[#F59E0B] shadow-[0_0_12px_rgba(245,158,11,0.25)]';
    }
  };

  // Full target sentence for audio playback (solves F7 dead audio button)
  const fullTargetSentence =
    currentItem?.shape === 'transform'
      ? (content.options?.[content.correct_index] || targetWords.join(' '))
      : currentItem?.shape === 'error_spot'
      ? (mcqOptions[content.correct_index] || content.sentence || '')
      : (content.sentence_with_blank || mcqOptions[content.correct_index] || '');

  const handleHearIt = () => {
    if (content.audio_url) {
      playAudioUrl(content.audio_url, fullTargetSentence);
    } else if (fullTargetSentence) {
      browserSpeak(fullTargetSentence);
    }
  };

  // Error Spot prompt framing (Grammar Forge pattern)
  const isFix = !mcqOptions.some((opt: string) => content.sentence?.toLowerCase().includes(opt.toLowerCase()));
  const errorPromptText = isFix
    ? 'Sentence with mistake — choose the correct word to fix it:'
    : 'Spot the wrong word in this sentence:';

  return (
    <div className="h-full w-full bg-[#070C18] text-slate-100 flex flex-col justify-between p-4 md:p-6 cyber-grid select-none overflow-hidden relative gl-container">
      {/* Ambient background glows */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
        <div className="w-[720px] h-[720px] rounded-full bg-cyan-400/5 blur-[120px] absolute" />
        <div className="w-[480px] h-[480px] rounded-full bg-[#FF2D78]/5 blur-[100px] absolute translate-y-12" />
      </div>

      {/* TOP HUD BAR: Strict overscan clearance pl-40 lg:pl-48 */}
      <header className="w-full flex flex-col gap-2 relative z-20 gl-header">
        <div className="flex justify-between items-center w-full px-4 md:px-6 py-2.5 bg-[#0B132B]/80 border border-slate-800/80 rounded-2xl shadow-sm backdrop-blur-md">
          {/* Left: Over-scan clearance + Phase Pill + Game Name */}
          <div className="flex items-center gap-3 md:gap-4 pl-40 lg:pl-48">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1e1e30] border border-slate-700 text-[11px] font-mono font-semibold text-[#00FFCC] tracking-widest uppercase">
              <span className="w-2 h-2 rounded-full bg-[#00FFCC] animate-pulse" />
              PHASE: GRAMMAR LAB
            </span>
            <div className="font-headline font-bold text-xl md:text-2xl text-white tracking-wide flex items-center gap-2">
              <Beaker className="text-[#00FFCC]" size={24} />
              <span>Grammar Lab</span>
            </div>
            {/* Round badge */}
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-800">
              <span className="px-2.5 py-0.5 bg-[#141422] border border-slate-700 rounded-lg font-mono text-xs font-semibold text-[#FFE04A] tracking-wider uppercase">
                Round {roundIndex}/{TOTAL_ROUNDS}
              </span>
              {grammarItems.length > 0 && (
                <span className="text-xs font-mono text-slate-400">
                  Item {currentItemIdx + 1}/{grammarItems.length}
                </span>
              )}
            </div>
          </div>

          {/* Right: Turn Badge & Streak */}
          <div className="flex items-center gap-3">
            {streak > 1 && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-orange-950/60 border border-orange-500/50 text-orange-300 font-bold text-xs font-mono uppercase tracking-wider">
                <Flame size={14} className="text-orange-400 fill-orange-400" />
                <span>{streak} STREAK</span>
              </div>
            )}
            {pickedStudent && (
              <div className="flex items-center gap-2 px-3 py-1 bg-[#1A1A36] border border-violet-500/40 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                <span className="font-mono text-xs font-bold text-violet-200 tracking-wider uppercase">
                  {pickedStudent.name}'S TURN
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Steal Banner */}
        <AnimatePresence>
          {stealBanner && (
            <motion.div
              key={stealBanner.kind}
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className={`mx-auto w-fit px-6 py-2 rounded-xl text-center text-white shadow-2xl font-black ${
                stealBanner.kind === 'stolen'
                  ? 'bg-[#004d3d] border border-[#00ffcc] text-[#c0fff4]'
                  : 'bg-[#3d0020] border border-[#ff2d78] text-[#ffe0ec]'
              }`}
            >
              {stealBanner.kind === 'offer' && (
                <div className="text-lg md:text-xl animate-pulse">⚡ STEAL CHANCE! Teacher spins for stealer!</div>
              )}
              {stealBanner.kind === 'active' && (
                <div className="text-lg md:text-xl">
                  ⚡ {stealBanner.name} is stealing for <span className="text-amber-300">HALF POINTS</span>!
                </div>
              )}
              {stealBanner.kind === 'stolen' && (
                <div className="text-xl md:text-2xl">🌟 STOLEN! {stealBanner.name} +{stealBanner.points} pts</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* CENTER ARENA */}
      <main className="flex-1 flex flex-col justify-center my-2 md:my-3 px-2 md:px-6 relative z-10 overflow-hidden gl-main">
        <AnimatePresence>
          {/* Phase 1: Pattern / Formula Presentation Beat (2 seconds) */}
          {phase === 'pattern' && (
            <motion.div
              key="pattern"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full flex items-center justify-center"
            >
              <div className="w-full max-w-2xl bg-[#0B132B]/90 border border-[#182752] rounded-3xl p-6 md:p-10 text-center shadow-2xl backdrop-blur-md relative overflow-hidden gl-card">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1e1e30] border border-[#302840] text-xs font-mono font-bold text-[#00FFCC] uppercase tracking-widest mb-3">
                  <span className="w-2 h-2 rounded-full bg-[#00FFCC] animate-pulse" />
                  Formula Beat · 语法规则
                </div>

                <h3 className="text-sm font-mono text-slate-400 uppercase tracking-wider mb-2">
                  {currentItem?.ruleName}
                </h3>

                {/* Formula Syntax Pills */}
                <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 my-4 md:my-6">
                  {formulaParts.map((part, pIdx) => (
                    <React.Fragment key={pIdx}>
                      <span className={`px-4 py-2 rounded-xl border text-xl md:text-2xl font-extrabold uppercase tracking-wide ${getSyntaxPillStyle(pIdx)}`}>
                        {part}
                      </span>
                      {pIdx < formulaParts.length - 1 && (
                        <span className="text-slate-500 font-bold text-xl">+</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>

                {content.explanation && (
                  <p className="text-base md:text-lg text-slate-300 bg-[#141422] border border-slate-700/60 rounded-xl p-3 md:p-4 mt-2 leading-relaxed">
                    {content.explanation}
                  </p>
                )}

                <div className="mt-4 text-xs font-mono text-slate-500">
                  Challenge begins in 2s…
                </div>
              </div>
            </motion.div>
          )}

          {/* Phase 2: Challenge Answer Phase */}
          {phase === 'answer' && currentItem && (
            <motion.div
              key={`answer-${currentItemIdx}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              className="w-full flex-1 flex flex-col justify-center"
            >
              {/* SHAPE 1: TRANSFORM (Rung 3 Sentence Assembly Runway) */}
              {currentItem.shape === 'transform' && (
                <div className="w-full flex flex-col gap-3 md:gap-4 max-w-5xl mx-auto">
                  {/* Mission / Reference Plate */}
                  <div className="bg-[#141422]/90 border border-[#302840] rounded-2xl p-4 md:p-5 flex items-center justify-between gap-4 shadow-lg relative overflow-hidden gl-prompt-card">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#38BDF8] via-[#00FFCC] to-[#A855F7]" />
                    <div className="pl-3 flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono uppercase tracking-widest text-[#38BDF8] font-bold">RUNG 3 · TRANSFORM</span>
                        <span className="text-xs font-mono text-slate-400">· {currentItem.ruleName}</span>
                      </div>
                      <h2 className="font-headline font-extrabold text-xl md:text-2xl text-white tracking-tight mt-0.5">
                        {content.instruction || 'Build the transformed sentence:'}
                      </h2>
                    </div>
                    {content.prompt_sentence && (
                      <div className="hidden sm:flex flex-col bg-[#0a0a12] border border-slate-800 rounded-xl px-4 py-2 max-w-md">
                        <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold">Original Sentence</span>
                        <p className="font-headline font-bold text-base text-slate-300 italic line-through decoration-slate-600">
                          "{content.prompt_sentence}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Sentence Assembly Runway */}
                  <div className="bg-[#141422]/80 border border-[#302840] rounded-3xl p-4 md:p-6 backdrop-blur-sm shadow-xl">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <span className="font-mono font-bold text-xs uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#00FFCC]" />
                        Sentence Assembly Runway
                      </span>
                      <span className="font-mono text-xs text-slate-400 hidden sm:inline">
                        Tap words to place them in order
                      </span>
                    </div>

                    {/* Runway Slots Grid */}
                    <div className="flex flex-wrap items-stretch gap-2.5 md:gap-3 min-h-[70px] md:min-h-[85px] bg-[#0a0a12]/60 rounded-2xl p-3 border border-slate-800/80 gl-dropzone">
                      {Array.from({ length: Math.max(targetWords.length, buildTiles.length) }).map((_, i) => {
                        const isFilled = i < buildTiles.length;
                        const isActiveTarget = i === buildTiles.length;
                        const tileWord = buildTiles[i];

                        if (isFilled) {
                          return (
                            <button
                              key={`slot-${i}`}
                              onClick={() => handleRemoveTile(i)}
                              className="px-4 py-2.5 rounded-xl bg-[#1e1e30] border-2 border-amber-400/80 hover:border-amber-300 text-amber-200 font-headline font-extrabold text-lg md:text-xl flex items-center gap-2 shadow-[0_0_15px_rgba(245,158,11,0.25)] active:scale-95 transition-all group gl-tile"
                              title="Tap to remove"
                            >
                              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-400/20 w-5 h-5 rounded flex items-center justify-center">
                                {i + 1}
                              </span>
                              <span>{tileWord}</span>
                              <span className="text-slate-400 group-hover:text-white text-xs">×</span>
                            </button>
                          );
                        }

                        if (isActiveTarget) {
                          return (
                            <div
                              key={`slot-${i}`}
                              className="px-4 py-2.5 rounded-xl border-2 border-dashed border-[#00FFCC]/70 bg-[#00FFCC]/5 text-[#00FFCC] font-mono text-sm md:text-base font-bold flex items-center gap-2 animate-pulse gl-tile"
                            >
                              <span className="w-5 h-5 rounded border border-[#00FFCC]/50 flex items-center justify-center text-xs">
                                {i + 1}
                              </span>
                              <span>[ + NEXT WORD ]</span>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={`slot-${i}`}
                            className="px-4 py-2.5 rounded-xl border-2 border-dashed border-[#302840] text-slate-600 font-mono text-sm font-bold flex items-center gap-2 gl-tile"
                          >
                            <span className="w-5 h-5 rounded border border-slate-700 flex items-center justify-center text-xs">
                              {i + 1}
                            </span>
                            <span>[ SLOT ]</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Word Bank Tray & Check Button */}
                  <div className="bg-[#0a0a12] border border-[#302840] rounded-2xl p-4 md:p-5 shadow-2xl">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <span className="font-mono font-bold text-xs uppercase tracking-widest text-slate-400">
                        Word Bank Tiles
                      </span>
                      <span className="font-mono text-xs text-[#FFE04A]">
                        {transformBank.length > targetWords.length ? '⚡ Distractor Words Present' : 'Tap to place'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2.5 md:gap-3 items-center">
                      {transformBank.map((tile, idx) => {
                        const usedCount = buildTiles.filter((t) => t === tile).length;
                        const bankCount = transformBank.slice(0, idx + 1).filter((t) => t === tile).length;
                        const isUsed = usedCount >= bankCount;
                        const isTargetTile = (remainingTarget[tile] || 0) > 0;

                        return (
                          <button
                            key={`${tile}-${idx}`}
                            onClick={() => handleTileTap(tile)}
                            disabled={isUsed || phase !== 'answer' || resolvedRef.current}
                            className={`px-4 py-2.5 md:py-3 rounded-xl font-headline font-bold text-lg md:text-xl transition-all gl-btn ${
                              isUsed
                                ? 'bg-[#141422]/50 border border-[#302840] text-slate-600 cursor-not-allowed opacity-40'
                                : showHint && idx === hintBankIdx
                                ? 'bg-[#FFE04A] text-slate-950 border-2 border-amber-300 shadow-[0_0_15px_rgba(255,224,74,0.6)] animate-pulse'
                                : 'bg-[#111C3D] hover:bg-[#16244f] border-2 border-[#00FFCC] text-white shadow-[0_5px_0_rgba(0,0,0,0.6)] active:translate-y-1 active:shadow-[0_1px_0_rgba(0,0,0,0.6)]'
                            } ${revealed && !isUsed && isTargetTile ? 'ring-4 ring-amber-400' : ''}`}
                          >
                            {tile}
                          </button>
                        );
                      })}

                      {buildTiles.length > 0 && (
                        <button
                          onClick={handleCheckAssembly}
                          className="ml-auto glow-pink-btn px-6 md:px-8 py-2.5 md:py-3 rounded-xl bg-[#FF2D78] hover:bg-[#FF2D78]/90 text-white font-headline font-black text-base md:text-lg tracking-wider uppercase flex items-center gap-2 transition-all active:scale-95 shadow-[0_0_20px_rgba(255,45,120,0.45),0_4px_0_#b3004e] gl-btn"
                        >
                          Check Sentence
                          <ArrowRight size={20} className="stroke-[3]" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* SHAPE 2: ERROR_SPOT (Rung 2 Spot the Error) */}
              {currentItem.shape === 'error_spot' && (
                <div className="w-full max-w-4xl mx-auto flex flex-col gap-4">
                  {/* Stem Card with Error Framing */}
                  <div className="bg-[#141422] border border-[#302840] rounded-3xl p-5 md:p-7 shadow-2xl relative overflow-hidden gl-prompt-card">
                    <div className="text-amber-400 font-bold text-xs md:text-sm mb-2 flex items-center gap-2 font-mono uppercase tracking-wider">
                      <Zap size={16} className="text-amber-400" />
                      <span>{errorPromptText}</span>
                    </div>
                    <p className="text-white text-2xl md:text-4xl font-extrabold tracking-wide leading-snug gl-sentence">
                      {content.sentence}
                    </p>
                  </div>

                  {/* Option Plates Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 gl-options-grid">
                    {mcqOptions.map((option: string, idx: number) => {
                      const isEliminated = eliminated.includes(idx);
                      const isSelected = selectedOption === idx;
                      const isCorrect = idx === content.correct_index;
                      const isRevealedCorrect = revealed && isCorrect;

                      return (
                        <button
                          key={idx}
                          onClick={() => handleMcqSelect(idx)}
                          disabled={isEliminated || resolvedRef.current || phase !== 'answer'}
                          className={`w-full p-4 md:p-5 rounded-2xl border-2 text-left text-lg md:text-2xl font-bold transition-all flex items-center justify-between gl-option-btn ${
                            isEliminated
                              ? 'bg-[#0f0f1a] border-[#302840] text-slate-600 line-through opacity-40 cursor-not-allowed'
                              : isSelected
                              ? isCorrect
                                ? 'bg-[#004d3d] border-[#00FFCC] text-[#c0fff4] shadow-[0_0_20px_rgba(0,255,204,0.3)]'
                                : 'bg-[#3d0f0f] border-[#ff4444] text-[#ffa0a0] shadow-[0_0_20px_rgba(255,68,68,0.3)]'
                              : 'bg-[#141422] border-[#302840] hover:border-[#00FFCC] hover:bg-[#1e1e30] text-white shadow-md active:scale-[0.99]'
                          } ${isRevealedCorrect ? 'ring-4 ring-amber-400 border-amber-400' : ''}`}
                        >
                          <span className="flex items-center gap-3 md:gap-4">
                            <span className={`w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center font-mono text-sm md:text-base font-black ${
                              isSelected && isCorrect
                                ? 'bg-[#00FFCC] text-slate-950'
                                : isSelected && !isCorrect
                                ? 'bg-[#ff4444] text-white'
                                : isRevealedCorrect
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-[#1e1e30] text-[#00FFCC] border border-[#302840]'
                            }`}>
                              {['A', 'B', 'C', 'D'][idx] || idx + 1}
                            </span>
                            <span className="tracking-wide">{option}</span>
                          </span>
                          {isSelected && isCorrect && <Check size={26} className="text-[#00FFCC] stroke-[3]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SHAPE 3: GRAMMAR_FILL (Rung 4 Use the Rule) */}
              {currentItem.shape === 'fill_blank' && (
                <div className="w-full max-w-4xl mx-auto flex flex-col gap-4">
                  {/* Stem Card */}
                  <div className="bg-[#141422] border border-[#302840] rounded-3xl p-5 md:p-7 shadow-2xl relative overflow-hidden gl-prompt-card">
                    <div className="text-[#38BDF8] font-bold text-xs md:text-sm mb-2 flex items-center gap-2 font-mono uppercase tracking-wider">
                      <Zap size={16} className="text-[#38BDF8]" />
                      <span>Which sentence uses the rule correctly?</span>
                    </div>
                    {content.sentence_with_blank && (
                      <p className="text-white text-2xl md:text-4xl font-extrabold tracking-wide leading-snug gl-sentence">
                        {content.sentence_with_blank}
                      </p>
                    )}
                  </div>

                  {/* Option Plates Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 gl-options-grid">
                    {mcqOptions.map((option: string, idx: number) => {
                      const isEliminated = eliminated.includes(idx);
                      const isSelected = selectedOption === idx;
                      const isCorrect = idx === content.correct_index;
                      const isRevealedCorrect = revealed && isCorrect;

                      return (
                        <button
                          key={idx}
                          onClick={() => handleMcqSelect(idx)}
                          disabled={isEliminated || resolvedRef.current || phase !== 'answer'}
                          className={`w-full p-4 md:p-5 rounded-2xl border-2 text-left text-lg md:text-2xl font-bold transition-all flex items-center justify-between gl-option-btn ${
                            isEliminated
                              ? 'bg-[#0f0f1a] border-[#302840] text-slate-600 line-through opacity-40 cursor-not-allowed'
                              : isSelected
                              ? isCorrect
                                ? 'bg-[#004d3d] border-[#00FFCC] text-[#c0fff4] shadow-[0_0_20px_rgba(0,255,204,0.3)]'
                                : 'bg-[#3d0f0f] border-[#ff4444] text-[#ffa0a0] shadow-[0_0_20px_rgba(255,68,68,0.3)]'
                              : 'bg-[#141422] border-[#302840] hover:border-[#00FFCC] hover:bg-[#1e1e30] text-white shadow-md active:scale-[0.99]'
                          } ${isRevealedCorrect ? 'ring-4 ring-amber-400 border-amber-400' : ''}`}
                        >
                          <span className="flex items-center gap-3 md:gap-4">
                            <span className={`w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center font-mono text-sm md:text-base font-black ${
                              isSelected && isCorrect
                                ? 'bg-[#00FFCC] text-slate-950'
                                : isSelected && !isCorrect
                                ? 'bg-[#ff4444] text-white'
                                : isRevealedCorrect
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-[#1e1e30] text-[#00FFCC] border border-[#302840]'
                            }`}>
                              {['A', 'B', 'C', 'D'][idx] || idx + 1}
                            </span>
                            <span className="tracking-wide">{option}</span>
                          </span>
                          {isSelected && isCorrect && <Check size={26} className="text-[#00FFCC] stroke-[3]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reveal-on-wrong teaching beat (2nd miss) */}
              {revealed && currentItem && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 p-4 bg-amber-950/60 border-2 border-amber-500/80 rounded-2xl text-center shadow-xl max-w-2xl mx-auto"
                >
                  {currentItem.shape === 'transform' && (
                    <div className="text-xl font-bold text-amber-200 mb-1">{targetWords.join(' ')}</div>
                  )}
                  {revealNote && <div className="text-sm md:text-base text-amber-300 font-medium">{revealNote}</div>}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Phase 3: Feedback Phase */}
          {phase === 'feedback' && (
            <motion.div
              key="feedback"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full flex items-center justify-center"
            >
              <div className="bg-[#0B132B] border-2 border-[#00FFCC] rounded-3xl p-8 md:p-12 text-center shadow-[0_0_40px_rgba(0,255,204,0.25)] max-w-xl w-full">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200 }}
                  className="text-7xl md:text-8xl mb-4"
                >
                  🎉
                </motion.div>
                <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-2">
                  {pickedStudent ? `${pickedStudent.name} cracked the grammar!` : 'Formula Mastered!'}
                </h2>
                <div className="text-xl md:text-2xl font-mono font-bold text-[#00FFCC] mb-4">
                  +{lastAward} points
                </div>

                {/* Always-functional audio button via playAudioUrl/browserSpeak */}
                {fullTargetSentence && (
                  <button
                    onClick={handleHearIt}
                    className="mt-2 px-6 py-2.5 bg-[#141422] hover:bg-[#1e1e30] border border-[#00FFCC]/50 text-[#00FFCC] hover:text-white rounded-xl font-bold inline-flex items-center gap-2 transition-all active:scale-95 shadow-md text-sm md:text-base"
                  >
                    <Volume2 size={20} /> Hear Sentence
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* Phase 4: Complete Phase (Owner's Celebration Animation Preserved) */}
          {phase === 'complete' && (
            <motion.div key="complete" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 14 }}
                  className="text-[10rem] md:text-[11rem] leading-none mb-6 drop-shadow-[0_12px_24px_rgba(0,255,204,0.3)]"
                >
                  🏆
                </motion.div>
                <motion.h2
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-5xl md:text-6xl font-extrabold text-white mb-3 tracking-tight"
                >
                  Grammar Lab Complete!
                </motion.h2>
                <div className="text-xl md:text-2xl text-slate-400 font-mono">
                  All {TOTAL_ROUNDS} rounds practiced
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* FOOTER: Picked student chip or HUD info */}
      <footer className="w-full flex items-center justify-between text-xs text-slate-500 font-mono gl-footer">
        <div className="flex items-center gap-4">
          <span>16:9 Projector Mode · 8m Legibility</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">Controls: Remote / Hotkeys</span>
        </div>
        {pickedStudent && phase !== 'complete' && (
          <div className="inline-flex items-center gap-2 bg-[#0B132B] border border-slate-800 px-4 py-1.5 rounded-full text-slate-300">
            <span className="w-2 h-2 rounded-full bg-[#00FFCC]" />
            <span>Active: {pickedStudent.name}</span>
          </div>
        )}
      </footer>

      {/* Phone-landscape floor 700x320 zero scroll styles */}
      <style>{`
        .cyber-grid {
          background-size: 48px 48px;
          background-image: 
            linear-gradient(to right, rgba(48, 40, 64, 0.35) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(48, 40, 64, 0.35) 1px, transparent 1px);
        }
        .glow-pink-btn {
          box-shadow: 0 0 20px rgba(255, 45, 120, 0.45), 0 4px 0 #b3004e;
        }
        .glow-pink-btn:hover {
          box-shadow: 0 0 28px rgba(255, 45, 120, 0.7), 0 4px 0 #b3004e;
        }
        @media (max-height: 450px) {
          .gl-container { padding: 0.4rem 0.8rem !important; }
          .gl-header { margin-bottom: 0.2rem !important; }
          .gl-header header { padding: 0.25rem 0.75rem !important; }
          .gl-main { margin: 0.2rem 0 !important; }
          .gl-prompt-card { padding: 0.5rem 0.75rem !important; margin-bottom: 0.3rem !important; border-radius: 1rem !important; }
          .gl-sentence { font-size: 1.15rem !important; line-height: 1.25 !important; }
          .gl-options-grid { gap: 0.35rem !important; }
          .gl-option-btn { padding: 0.4rem 0.75rem !important; font-size: 1rem !important; border-radius: 0.75rem !important; }
          .gl-dropzone { min-height: 44px !important; padding: 0.25rem !important; margin-bottom: 0.25rem !important; gap: 0.25rem !important; }
          .gl-tile { padding: 0.2rem 0.5rem !important; font-size: 0.85rem !important; border-radius: 0.5rem !important; }
          .gl-btn { height: 2.1rem !important; padding: 0 0.75rem !important; font-size: 0.85rem !important; border-radius: 0.75rem !important; }
          .gl-footer { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default BoardGrammarLab;
