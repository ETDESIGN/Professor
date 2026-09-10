// BoardSentenceLab — Scaffolded sentence building game (v3 Syntax Workshop)
//
// Pedagogical Loop:
//   1. SHOW English context clue + thematic visual + word count runway
//   2. STUDENT builds sentence by tapping 3D tactile word blocks into runway slots
//   3. In-place self-correction: failed check highlights erroneous slots (green = right, amber = wrong)
//      without wiping placed words back to the bank
//   4. Progressive hints: distractor elimination (10s) → exact word pulse (18s)
//   5. Reveal-on-resolve: full sentence in glowing emerald + auto-played TTS audio + bilingual scaffold
//   6. Escalates across 3 rounds with level-up interstitials
//
// v3 Features:
// - English-first task prompt & word count slots ("Build: 4 words")
// - Tactile 3D word blocks with slot-based Sentence Runway
// - In-place editing (never wipes correct tiles on failed check)
// - Native sentence TTS synthesis on success and reveal
// - Progressive hint ladder (distractor elimination → target tile pulse)
// - Cancellable timeouts via advanceTimerRef
// - Remote & Commander parity (SKIP, HINT, CHECK, MARK_CORRECT, REDO, END)
// - Responsive phone floor @media (max-height: 450px) calibration for 700x320

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Volume2, Check, CheckCircle, X, Sparkles,
  ChevronRight, Lightbulb, RotateCcw, Award, Layers
} from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { makeRng } from '../../../services/seededRandom';
import { useEscalatingPool } from '../useEscalatingPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { computeLCSPartialCredit, PARTIAL_PASS_THRESHOLD, shuffle } from './scoringUtils';
import { logAttempt } from './scoreAttempt';
import { playCue } from './playCue';
import { useSpeech } from './useSpeech';
import type { PoolItem, WordBankBuildContent, TransformContent } from '../../../types/exercise';

interface SentenceItem {
  poolItem: PoolItem;
  promptText: string;
  targetSentence: string;
  targetTiles: string[];
  wordBank: string[];
  translation?: string;
  audioUrl?: string;
  exerciseType: 'WORD_BANK_BUILD' | 'TRANSFORM';
}

interface BankTile {
  id: number;
  text: string;
}

const TOTAL_ROUNDS = 3;

const BoardSentenceLab: React.FC<{ data?: any }> = () => {
  const { state, addPoints, pushToRemediation, triggerAction, triggerConfetti } = useSession();
  const seedBase = useSeedBase();
  const pickedStudent = usePickedStudent();

  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  const resolvedRef = useRef(false);
  const completeRef = useRef(false);
  const advanceTimerRef = useRef<any>(null);

  const [currentItemIdx, setCurrentItemIdx] = useState(0);
  const [buildTiles, setBuildTiles] = useState<BankTile[]>([]);
  const [phase, setPhase] = useState<'building' | 'checking' | 'feedback' | 'complete'>('building');
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2>(0);
  const [lastAward, setLastAward] = useState(0);
  const [placedFeedback, setPlacedFeedback] = useState<boolean[] | null>(null);
  const [streak, setStreak] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [roundIndex, setRoundIndex] = useState(1);

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = state.students?.map((s: any) => s.id).filter(Boolean) || [];

  // Escalate pool items across rounds
  const { items: poolItems, loading } = useEscalatingPool({
    unitId,
    shellType: 'SENTENCE_LAB',
    phase: 'PRACTICE',
    roster,
    roundIndex,
    totalRounds: TOTAL_ROUNDS,
    roundSize: 2,
  });

  const [roundItems, setRoundItems] = useState<PoolItem[]>([]);
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

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  // Normalize pool items with English-first task frames
  const sentenceItems: SentenceItem[] = useMemo(() => {
    const items: SentenceItem[] = [];
    for (const pi of roundItems) {
      const content = pi.content as any;

      if (pi.exercise_type === 'WORD_BANK_BUILD') {
        const wbb = content as WordBankBuildContent;
        const targetTiles = wbb.target_sentence.trim().split(/\s+/);
        items.push({
          poolItem: pi,
          promptText: `Build the sentence (${targetTiles.length} words)`,
          targetSentence: wbb.target_sentence,
          targetTiles,
          wordBank: wbb.word_bank,
          translation: wbb.translation,
          audioUrl: wbb.audio_url,
          exerciseType: 'WORD_BANK_BUILD',
        });
      } else if (pi.exercise_type === 'TRANSFORM') {
        const transform = content as TransformContent;
        const correctSentence = transform.options[transform.correct_index];
        const targetTiles = correctSentence.trim().split(/\s+/);

        const targetSet = new Set(targetTiles);
        const distractorPool: string[] = [];
        transform.options.forEach((opt, i) => {
          if (i === transform.correct_index) return;
          for (const w of (opt || '').split(/\s+/)) {
            if (!targetSet.has(w) && !distractorPool.includes(w)) distractorPool.push(w);
          }
        });
        const distractors = shuffle(distractorPool, makeRng(seedBase, pi.id, 'distractors')).slice(0, 2);
        items.push({
          poolItem: pi,
          promptText: transform.prompt_sentence || 'Transform the sentence',
          targetSentence: correctSentence,
          targetTiles,
          wordBank: [...targetTiles, ...distractors],
          translation: transform.instruction,
          exerciseType: 'TRANSFORM',
        });
      }
    }
    return items;
  }, [roundItems, seedBase]);

  const currentItem = sentenceItems[currentItemIdx];

  // TTS speech audio for target sentence
  const { play: playSentenceAudio } = useSpeech({
    text: currentItem?.targetSentence,
    audioUrl: currentItem?.audioUrl,
    unitId,
  });

  // Unique bank tiles
  const bankTiles: BankTile[] = useMemo(() => {
    if (!currentItem) return [];
    return shuffle(currentItem.wordBank, makeRng(seedBase, currentItem.poolItem.id, 'bank')).map((text, idx) => ({
      id: idx,
      text,
    }));
  }, [currentItemIdx, currentItem, seedBase]);

  // Target word set for progressive hint distractor identification
  const targetTileSet = useMemo(() => new Set(currentItem?.targetTiles || []), [currentItem]);
  const firstDistractorId = useMemo(() => {
    if (!currentItem || hintLevel < 1) return null;
    const distractor = bankTiles.find((bt) => !targetTileSet.has(bt.text));
    return distractor ? distractor.id : null;
  }, [currentItem, hintLevel, bankTiles, targetTileSet]);

  // Next needed word in order
  const nextNeededWord = currentItem ? currentItem.targetTiles[buildTiles.length] : undefined;
  const hintTile =
    hintLevel >= 2 && nextNeededWord
      ? bankTiles.find((bt) => bt.text === nextNeededWord && !buildTiles.some((p) => p.id === bt.id))
      : undefined;

  // Progressive inactivity hint timer
  useEffect(() => {
    if (phase !== 'building' || !currentItem) return;

    const timer10 = setTimeout(() => {
      setHintLevel((prev) => (prev < 1 ? 1 : prev));
    }, 10000);

    const timer18 = setTimeout(() => {
      setHintLevel((prev) => (prev < 2 ? 2 : prev));
    }, 18000);

    return () => {
      clearTimeout(timer10);
      clearTimeout(timer18);
    };
  }, [phase, currentItemIdx, buildTiles.length, currentItem]);

  // Reset on turn change
  useEffect(() => {
    if (turnId === null) return;
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    mistakesRef.current = 0;
    awardedRef.current = false;
    resolvedRef.current = false;
    completeRef.current = false;
    fetchStartedRef.current = true;
    setCurrentItemIdx(0);
    setBuildTiles([]);
    setPhase('building');
    setHintLevel(0);
    setPlacedFeedback(null);
    setStreak(0);
    setRevealed(false);
    setRoundIndex(1);
    setRoundItems([]);
    setRoundTransition(false);
  }, [turnId]);

  // Remote & Commander actions
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;

    if (type === 'RESET_GAME') {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      mistakesRef.current = 0;
      awardedRef.current = false;
      resolvedRef.current = false;
      completeRef.current = false;
      fetchStartedRef.current = true;
      setCurrentItemIdx(0);
      setBuildTiles([]);
      setPhase('building');
      setHintLevel(0);
      setPlacedFeedback(null);
      setStreak(0);
      setRevealed(false);
      setRoundIndex(1);
      setRoundItems([]);
      setRoundTransition(false);
    } else if (type === 'SKIP_ITEM') {
      advanceToNext();
    } else if (type === 'CHECK_ANSWER') {
      handleCheck();
    } else if (type === 'REVEAL_HINT') {
      setHintLevel((prev) => (prev < 2 ? ((prev + 1) as 0 | 1 | 2) : 2));
    } else if (type === 'MARK_CORRECT') {
      succeed(1.0);
    } else if (type === 'SLIDE_COMPLETE') {
      completeGame(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // Keyboard shortcuts (SPACE to hear sentence, 1-6 for tiles, ENTER to check)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        playSentenceAudio();
        return;
      }

      if (e.code === 'Enter') {
        e.preventDefault();
        if (buildTiles.length > 0 && phase === 'building') {
          handleCheck();
        }
        return;
      }

      if (phase !== 'building' || resolvedRef.current) return;

      // Digits 1-9 select available bank tiles
      if (e.code.startsWith('Digit')) {
        const num = parseInt(e.code.replace('Digit', ''), 10);
        const available = bankTiles.filter((bt) => !buildTiles.some((p) => p.id === bt.id));
        if (num > 0 && num <= available.length) {
          handleTileTap(available[num - 1]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, buildTiles, bankTiles, currentItem]);

  const handleTileTap = (tile: BankTile) => {
    if (phase !== 'building' || !currentItem || resolvedRef.current) return;
    if (buildTiles.length >= currentItem.targetTiles.length) return;
    setBuildTiles((prev) => [...prev, tile]);
    setPlacedFeedback(null); // Reset error diagnostic on active change
    setHintLevel(0);
  };

  const handleRemoveTile = (idx: number) => {
    if (phase !== 'building' || resolvedRef.current) return;
    setBuildTiles((prev) => prev.filter((_, i) => i !== idx));
    setPlacedFeedback(null);
  };

  const succeed = (partialCredit: number) => {
    if (!currentItem || resolvedRef.current || completeRef.current) return;
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
    const points = scoreForAttempt(mistakesRef.current, difficulty, partialCredit, nextStreak);
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
        correctness: partialCredit >= 1 ? 'correct' : 'partial',
        modality: 'productive',
        pushToRemediation,
      });
    }

    setLastAward(points);
    setPhase('feedback');
    playSentenceAudio();

    // Auto-advance after celebration beat
    advanceTimerRef.current = setTimeout(() => advanceToNext(), 2200);
  };

  // P1 Fix (§3 F4, §4.b P1, §4.e 2): In-place editing without punitive tile wipe
  const handleCheck = () => {
    if (!currentItem || phase !== 'building' || resolvedRef.current) return;

    const placedTexts = buildTiles.map((t) => t.text);
    const partialCredit = computeLCSPartialCredit(placedTexts, currentItem.targetTiles);
    const difficulty = currentItem.poolItem.difficulty || 2;

    if (partialCredit >= PARTIAL_PASS_THRESHOLD) {
      succeed(partialCredit);
    } else {
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
        difficulty,
        correctness: 'incorrect',
        correct: false,
        modality: 'productive',
        pushToRemediation,
      });

      // Per-position LCS feedback: true = correct slot, false = wrong slot
      setPlacedFeedback(placedTexts.map((t, i) => currentItem.targetTiles[i] === t));

      if (mistakesRef.current >= 2) {
        // P1 Fix (§3 F3, §4.b P1): Complete reveal-on-resolve with auto-played audio
        playCue('reveal');
        resolvedRef.current = true;
        setRevealed(true);
        playSentenceAudio();
        advanceTimerRef.current = setTimeout(() => advanceToNext(), 3000);
      } else {
        // DO NOT wipe buildTiles! Allow child to tap and swap only incorrect tiles.
        setPhase('checking');
        advanceTimerRef.current = setTimeout(() => {
          setPhase('building');
        }, 1200);
      }
    }
  };

  const completeGame = (broadcast = true) => {
    if (completeRef.current) return;
    completeRef.current = true;
    playCue('win');
    setPhase('complete');
    if (broadcast) triggerAction('SLIDE_COMPLETE', { forced: false });
  };

  const advanceToNext = () => {
    if (completeRef.current) return;
    const resetItemState = () => {
      mistakesRef.current = 0;
      awardedRef.current = false;
      resolvedRef.current = false;
      setBuildTiles([]);
      setPhase('building');
      setHintLevel(0);
      setPlacedFeedback(null);
      setRevealed(false);
    };

    if (currentItemIdx < sentenceItems.length - 1) {
      resetItemState();
      setCurrentItemIdx((prev) => prev + 1);
    } else if (roundIndex < TOTAL_ROUNDS) {
      resetItemState();
      setCurrentItemIdx(0);
      setRoundItems([]);
      fetchStartedRef.current = false;
      setRoundTransition(true);
      setRoundIndex((r) => r + 1);
    } else {
      completeGame();
    }
  };

  const classScore = (state.students || []).reduce((acc: number, s: any) => acc + (s.points || 0), 0);

  // ── Round-transition interstitial ──────────────
  if (roundTransition) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#070c18] text-slate-100 p-8 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="w-20 h-20 rounded-2xl bg-[#a855f7]/20 border-2 border-[#a855f7] flex items-center justify-center text-4xl mb-4 mx-auto shadow-[0_0_24px_rgba(168,85,247,0.4)]">
            ⚡
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold text-white font-headline">
            Round {roundIndex} — Level Up!
          </h2>
          <p className="text-lg text-slate-400 mt-2 font-mono">
            Complex sentence structures ahead…
          </p>
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#070c18] text-slate-100">
        <div className="flex items-center gap-3 text-2xl text-[#38bdf8] font-headline">
          <span className="w-4 h-4 rounded-full bg-[#38bdf8] animate-ping" />
          Loading Sentence Lab…
        </div>
      </div>
    );
  }

  if (!currentItem && phase !== 'complete') {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#070c18] text-slate-100 p-8 text-center">
        <div className="text-7xl mb-6">✍️</div>
        <h2 className="text-4xl font-extrabold text-[#38bdf8] mb-3 font-headline">Sentence Lab</h2>
        <div className="text-xl text-slate-400 max-w-xl">
          No sentence items ready for this unit yet. Run exercise generation or proceed to next slide.
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col justify-between h-full w-full bg-[#070c18] text-slate-100 font-body p-3 md:p-5 select-none overflow-hidden antialiased">
      {/* Background Grid & Lighting */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#38bdf8]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-[#ff2e79]/10 rounded-full blur-3xl pointer-events-none" />

      {/* ================= TOP BAR (16:9 Calibrated Header) ================= */}
      <header className="relative z-10 w-full shrink-0 flex items-center justify-between px-3 py-2 bg-[#0b132b]/90 border border-[#1e2d5a] rounded-2xl pl-28 lg:pl-44 shadow-lg">
        {/* Left: Mode Chip */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#111c3d] border border-[#38bdf8]/40 text-[#38bdf8] font-mono text-xs uppercase font-bold tracking-wider">
            <span className="w-2 h-2 rounded-full bg-[#38bdf8] animate-ping" />
            <span>SENTENCE LAB</span>
          </div>

          {pickedStudent ? (
            <div className="hidden sm:flex items-center gap-2 bg-[#111c3d] px-3 py-1 rounded-full border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="font-mono text-xs text-slate-300">
                {pickedStudent.name}&apos;s turn
              </span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2 bg-[#111c3d] px-3 py-1 rounded-full border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-[#38bdf8]" />
              <span className="font-mono text-xs text-[#38bdf8]">Choral Assembly</span>
            </div>
          )}
        </div>

        {/* Center: Target Syntax / Rule */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-[#070c18] border border-slate-800 text-xs font-mono">
          <span className="text-purple-400 font-bold">ROUND {roundIndex}/{TOTAL_ROUNDS}:</span>
          <span className="text-slate-300">
            Challenge {currentItemIdx + 1} of {sentenceItems.length}
          </span>
        </div>

        {/* Right: Audio / Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={playSentenceAudio}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#111c3d] hover:bg-[#1a2954] text-[#38bdf8] border border-[#38bdf8]/30 font-mono text-xs font-bold transition-all cursor-pointer"
            title="Hear Sentence Audio (SPACE)"
          >
            <Volume2 size={14} />
            <span className="hidden sm:inline">HEAR</span>
            <span className="text-[10px] text-slate-400">[SPACE]</span>
          </button>
        </div>
      </header>

      {/* ================= MAIN PROJECTOR STAGE ================= */}
      <main className="relative z-10 flex-1 flex flex-col justify-between gap-2.5 md:gap-3 my-1 overflow-hidden max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {phase !== 'complete' && currentItem && (
            <motion.div
              key={`item-${roundIndex}-${currentItemIdx}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col justify-between gap-2.5 md:gap-3 w-full"
            >
              {/* 1. TOP CONTEXT STRIP: Clue line & L1 Scaffold (§2 Owner Bug Fix) */}
              <section className="w-full rounded-2xl bg-[#0b132b]/95 border border-[#1e2d5a] p-3 md:p-4 flex items-center justify-between gap-4 shadow-xl shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-[#1a2954] border border-[#38bdf8]/40 flex items-center justify-center text-[#38bdf8] shrink-0 shadow-md">
                    <Layers size={24} />
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono text-[10px] md:text-xs font-extrabold uppercase tracking-wide">
                        {currentItem.exerciseType === 'TRANSFORM' ? 'Grammar Transform' : 'Sentence Build'}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {currentItem.targetTiles.length} words total
                      </span>
                    </div>

                    {/* Primary English Task Line */}
                    <div className="font-headline font-extrabold text-base md:text-xl text-white tracking-tight">
                      {currentItem.promptText}
                    </div>

                    {/* L1 Scaffold (Subtle gloss, never the only text) */}
                    {currentItem.translation && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 font-sans">
                        <span className="font-mono text-[10px] text-purple-400 font-bold">L1 CUE:</span>
                        <span>{currentItem.translation}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Checking status or hint indicator */}
                <div className="hidden sm:flex flex-col items-end gap-1">
                  {hintLevel > 0 && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-xs font-bold animate-pulse">
                      <Lightbulb size={14} />
                      <span>{hintLevel === 1 ? 'Hint: Distractor dimmed' : 'Hint: Next word pulsed'}</span>
                    </div>
                  )}
                  <span className="text-[11px] font-mono text-slate-500">
                    Press numbers 1–6 to select tiles
                  </span>
                </div>
              </section>

              {/* 2. MIDDLE SECTION: THE SENTENCE RUNWAY WITH DISCRETE SLOTS */}
              <section className="w-full flex-1 rounded-2xl bg-[#0b132b]/95 border border-[#1e2d5a] p-3 md:p-4 flex flex-col justify-between shadow-2xl relative min-h-[140px] md:min-h-[180px]">
                <div className="w-full flex items-center justify-between mb-1.5 px-1">
                  <div className="flex items-center gap-2 font-mono text-xs font-extrabold uppercase text-[#38bdf8] tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-[#38bdf8]" />
                    <span>SENTENCE RUNWAY</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-amber-400 font-bold">{buildTiles.length} SNAPPED</span>
                    <span className="text-slate-500">/</span>
                    <span className="text-slate-400">{currentItem.targetTiles.length} SLOTS</span>
                  </div>
                </div>

                {/* Dynamic Discrete Slots Grid */}
                <div
                  className="w-full flex-1 grid gap-2.5 md:gap-3.5 items-stretch my-1"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(currentItem.targetTiles.length, 3)}, minmax(0, 1fr))`,
                  }}
                >
                  {currentItem.targetTiles.map((targetWord, slotIdx) => {
                    const isFilled = slotIdx < buildTiles.length;
                    const tile = isFilled ? buildTiles[slotIdx] : null;
                    const isCurrentTarget = slotIdx === buildTiles.length;
                    const isLastSlot = slotIdx === currentItem.targetTiles.length - 1;

                    // Revealed answer state
                    if (revealed) {
                      return (
                        <div
                          key={`revealed-${slotIdx}`}
                          className="rounded-xl md:rounded-2xl bg-[#111c3d] border-2 border-emerald-400 p-2 md:p-3 flex flex-col justify-between shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-pulse"
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono text-emerald-400 font-bold">
                            <span>0{slotIdx + 1}</span>
                            <span>CORRECT</span>
                          </div>
                          <div className="my-auto text-center font-headline font-extrabold text-xl md:text-3xl text-emerald-300">
                            {targetWord}
                          </div>
                          <div className="text-center text-[10px] font-mono text-emerald-400">
                            ✓ MODEL
                          </div>
                        </div>
                      );
                    }

                    // Filled Slot
                    if (isFilled && tile) {
                      const isCorrect = placedFeedback ? placedFeedback[slotIdx] : null;
                      let slotBorder = 'border-amber-400/80 bg-[#1a2954] shadow-[0_0_18px_rgba(245,158,11,0.25)]';
                      if (isCorrect === true) {
                        slotBorder = 'border-emerald-400 bg-emerald-950/40 shadow-[0_0_18px_rgba(16,185,129,0.3)]';
                      } else if (isCorrect === false) {
                        slotBorder = 'border-[#ff2e79] bg-[#ff2e79]/15 shadow-[0_0_18px_rgba(255,46,121,0.3)] animate-bounce';
                      }

                      return (
                        <button
                          key={`filled-${slotIdx}`}
                          onClick={() => handleRemoveTile(slotIdx)}
                          className={`rounded-xl md:rounded-2xl border-2 p-2 md:p-3 flex flex-col justify-between text-left transition-all duration-200 cursor-pointer hover:scale-[1.02] group ${slotBorder}`}
                          title="Tap to return word to bank"
                        >
                          <div className="flex items-center justify-between w-full text-[10px] font-mono">
                            <span className="w-5 h-5 rounded-md bg-black/40 flex items-center justify-center font-bold text-slate-300">
                              0{slotIdx + 1}
                            </span>
                            {isCorrect === false ? (
                              <span className="text-[#ff2e79] font-bold flex items-center gap-0.5">
                                <X size={12} /> RETRY
                              </span>
                            ) : (
                              <span className="text-amber-400 group-hover:text-red-400 font-bold">
                                ✕ REMOVE
                              </span>
                            )}
                          </div>

                          <div className="my-auto text-center font-headline font-extrabold text-xl md:text-3xl text-white tracking-tight drop-shadow">
                            {tile.text}
                          </div>

                          <div className="text-center text-[10px] font-mono text-slate-400 group-hover:text-red-300">
                            {isCorrect === false ? 'Swap this word' : 'Tap to remove'}
                          </div>
                        </button>
                      );
                    }

                    // Active Target Slot
                    if (isCurrentTarget) {
                      return (
                        <div
                          key={`active-${slotIdx}`}
                          className="rounded-xl md:rounded-2xl bg-[#111c3d]/60 border-2 border-dashed border-[#38bdf8] p-2 md:p-3 flex flex-col justify-between relative shadow-[0_0_16px_rgba(56,189,248,0.25)] animate-pulse"
                        >
                          <div className="flex items-center justify-between w-full text-[10px] font-mono text-[#38bdf8]">
                            <span className="w-5 h-5 rounded-md bg-[#38bdf8]/20 flex items-center justify-center font-bold">
                              0{slotIdx + 1}
                            </span>
                            <span className="font-extrabold uppercase">TARGET</span>
                          </div>

                          <div className="my-auto text-center flex flex-col items-center justify-center text-[#38bdf8]">
                            <span className="text-2xl font-bold mb-0.5">+</span>
                            <span className="font-mono text-xs font-bold">
                              {isLastSlot ? 'Final Word' : 'Next Word'}
                            </span>
                          </div>

                          <div className="text-center text-[10px] font-mono text-slate-400">
                            Select from bank
                          </div>
                        </div>
                      );
                    }

                    // Pending Future Slot
                    return (
                      <div
                        key={`pending-${slotIdx}`}
                        className="rounded-xl md:rounded-2xl bg-[#070c18]/50 border-2 border-dashed border-slate-700/60 p-2 md:p-3 flex flex-col justify-between opacity-60"
                      >
                        <div className="text-[10px] font-mono text-slate-500">
                          0{slotIdx + 1}
                        </div>
                        <div className="my-auto text-center text-slate-600 font-mono text-xs">
                          Pending
                        </div>
                        <div className="text-center text-[10px] font-mono text-slate-700">
                          {isLastSlot ? 'End .' : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Live String Preview */}
                <div className="w-full bg-[#070c18]/80 rounded-xl border border-[#1e2d5a] px-3.5 py-1.5 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-bold">Live Sentence:</span>
                    <span className="text-white font-bold text-sm tracking-wide">
                      {buildTiles.length > 0 ? buildTiles.map((t) => t.text).join(' ') : '—'}
                    </span>
                  </div>
                  <span className="text-slate-500">
                    {buildTiles.length === currentItem.targetTiles.length
                      ? 'All slots filled · Ready to Check'
                      : `${currentItem.targetTiles.length - buildTiles.length} words remaining`}
                  </span>
                </div>
              </section>

              {/* 3. BOTTOM SECTION: TACTILE WORD BANK TRAY & CHECK ACTION */}
              <section className="w-full rounded-2xl bg-[#0b132b]/95 border border-[#1e2d5a] p-3 md:p-4 flex flex-col justify-between shadow-2xl shrink-0">
                <div className="w-full flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black uppercase text-slate-200 tracking-wider">
                      WORD BANK TRAY
                    </span>
                    <span className="font-mono text-[10px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/30">
                      Tap tile to place
                    </span>
                  </div>
                  <span className="font-mono text-xs text-slate-400">
                    Distractors included (choose wisely)
                  </span>
                </div>

                {/* 3D Tactile Word Blocks Grid */}
                <div className="w-full grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 md:gap-3.5 mb-2">
                  {bankTiles.map((tile, idx) => {
                    const isUsed = buildTiles.some((t) => t.id === tile.id);
                    const isDistractorDimmed = hintLevel >= 1 && tile.id === firstDistractorId;
                    const isNextNeededHint = hintLevel >= 2 && hintTile?.id === tile.id;

                    let blockStyle = 'bg-gradient-to-b from-[#1a2954] to-[#111c3d] border-2 border-slate-700 text-white hover:border-[#38bdf8] hover:-translate-y-1 shadow-[0_6px_0_#091024,0_8px_16px_rgba(0,0,0,0.5)]';
                    if (isUsed) {
                      blockStyle = 'bg-[#0b132b] border border-slate-800 text-slate-600 opacity-30 pointer-events-none shadow-none';
                    } else if (isNextNeededHint) {
                      blockStyle = 'bg-gradient-to-b from-amber-500 to-amber-600 border-2 border-amber-300 text-slate-900 font-black ring-4 ring-amber-400 shadow-[0_0_24px_rgba(245,158,11,0.6)] animate-pulse scale-105';
                    } else if (isDistractorDimmed) {
                      blockStyle = 'bg-[#0f172a] border border-red-900/40 text-slate-500 opacity-45';
                    }

                    return (
                      <button
                        key={tile.id}
                        onClick={() => handleTileTap(tile)}
                        disabled={isUsed}
                        className={`group relative rounded-xl md:rounded-2xl p-2.5 md:p-3.5 flex flex-col items-center justify-center transition-all duration-150 cursor-pointer active:translate-y-1 ${blockStyle}`}
                      >
                        <span className="w-full flex items-center justify-between font-mono text-[9px] text-slate-400 mb-0.5">
                          <span>0{idx + 1}</span>
                          {isNextNeededHint && <span className="text-slate-900 font-bold">NEXT</span>}
                          {isDistractorDimmed && <span className="text-red-400 font-bold">DEC</span>}
                        </span>
                        <span className="font-headline font-black text-xl md:text-2xl xl:text-3xl tracking-tight">
                          {tile.text}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Bottom Action Strip */}
                <div className="w-full flex items-center justify-between pt-1 border-t border-slate-800/80">
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                    {placedFeedback && (
                      <span className="text-amber-400 font-bold">
                        Check highlights: Green = correct, Pink = incorrect (tap pink to swap)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleCheck}
                      disabled={buildTiles.length === 0 || phase !== 'building'}
                      className={`px-6 py-2 rounded-xl font-headline font-extrabold text-sm tracking-wide uppercase flex items-center gap-2 transition-all shadow-lg cursor-pointer ${
                        buildTiles.length === currentItem.targetTiles.length
                          ? 'bg-[#ff2e79] hover:bg-[#ff2e79]/90 text-white shadow-[0_0_20px_rgba(255,46,121,0.5)] active:scale-95'
                          : 'bg-[#111c3d] text-slate-400 border border-slate-700 hover:text-white'
                      }`}
                    >
                      <Check size={16} />
                      <span>Check Sentence</span>
                      <span className="text-[10px] font-mono opacity-80">[ENTER]</span>
                    </button>
                  </div>
                </div>
              </section>
            </motion.div>
          )}

          {/* CELEBRATION FEEDBACK STATE */}
          {phase === 'feedback' && currentItem && (
            <motion.div
              key="feedback"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex-1 flex flex-col justify-center items-center gap-4 w-full text-center"
            >
              <div className="w-full bg-gradient-to-r from-[#0b132b] via-[#11244d] to-[#0b132b] border-2 border-emerald-400 rounded-3xl p-6 md:p-8 shadow-[0_0_35px_rgba(16,185,129,0.3)]">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-3xl mx-auto mb-3 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.5)]">
                  ★
                </div>
                <div className="font-mono text-xs font-extrabold text-emerald-400 uppercase tracking-widest mb-1">
                  PERFECT SENTENCE MATCH
                </div>
                <h2 className="font-headline font-black text-2xl md:text-4xl text-white mb-3">
                  Brilliant job{pickedStudent ? `, ${pickedStudent.name}` : ''}! Sentence Verified!
                </h2>

                {/* Large Assembled Sentence Display */}
                <div className="p-4 rounded-2xl bg-[#070c18] border-2 border-emerald-400/80 my-4 inline-block max-w-3xl">
                  <div className="font-headline font-extrabold text-2xl md:text-4xl text-emerald-300 tracking-wide">
                    &ldquo;{currentItem.targetSentence}&rdquo;
                  </div>
                  {currentItem.translation && (
                    <div className="text-sm font-sans text-slate-400 mt-1">
                      {currentItem.translation}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-center gap-4 mt-2">
                  <div className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400 text-emerald-300 font-mono font-bold text-sm">
                    <Sparkles size={16} />
                    <span>+{lastAward} Class Points</span>
                  </div>
                  {streak > 1 && (
                    <div className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#ff2e79]/20 border border-[#ff2e79] text-[#ff2e79] font-mono font-bold text-sm">
                      <span>🔥 Streak x{streak}</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ALL COMPLETE TERMINAL CARD */}
          {phase === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#0b132b]/95 border border-[#1e2d5a] rounded-3xl shadow-2xl"
            >
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-4xl mb-4 shadow-[0_0_24px_rgba(16,185,129,0.4)]">
                🏆
              </div>
              <h2 className="font-headline font-extrabold text-3xl md:text-5xl text-white mb-2">
                Sentence Lab Mastered!
              </h2>
              <p className="text-slate-400 text-lg max-w-md mb-6">
                All {TOTAL_ROUNDS} escalation rounds completed with flying colors! 🌟
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#111c3d] border border-slate-700 text-[#38bdf8] font-mono font-bold text-sm">
                <Sparkles size={16} />
                <span>Class Score: {classScore} pts</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ================= PROJECTOR HUD BOTTOM FOOTER BAR ================= */}
      <footer className="relative z-10 w-full shrink-0 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-[#0b132b]/90 border border-[#1e2d5a] rounded-2xl backdrop-blur-md shadow-lg">
          {/* Left: Class Score & Streak */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-base">★</span>
              <span className="font-headline font-bold text-xs text-slate-300">Class Score:</span>
              <span className="font-mono font-bold text-xs text-amber-400">{classScore} pts</span>
            </div>
            <div className="h-4 w-px bg-slate-800" />
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🔥</span>
              <span className="font-headline font-bold text-xs text-slate-300">Streak:</span>
              <span className="font-mono font-bold text-xs text-[#ff2e79]">{streak}</span>
            </div>
          </div>

          {/* Center: Stage Cue */}
          <div className="hidden lg:flex items-center gap-2 bg-[#111c3d] px-3 py-1 rounded-lg border border-slate-800">
            <span className="font-mono text-xs text-slate-400">
              Round {roundIndex} of {TOTAL_ROUNDS} · Sentence {currentItemIdx + 1} of {sentenceItems.length}
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={playSentenceAudio}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 hover:border-[#38bdf8] text-slate-300 hover:text-white font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer"
              type="button"
            >
              <Volume2 size={14} />
              <span>Sentence Audio</span>
            </button>

            <button
              onClick={advanceToNext}
              className="group relative px-4 py-1.5 rounded-xl bg-[#111c3d] hover:bg-[#1a2954] border border-[#1e2d5a] text-slate-200 font-headline font-bold text-xs tracking-wide transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              type="button"
            >
              <span>Skip</span>
              <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default BoardSentenceLab;
