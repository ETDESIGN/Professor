// BoardMemoryLab — English Vocabulary Memory Lab (v3 Redesign)
//
// Pedagogical loop (per games-v3 audit & owner direction 2026-09-09):
//   "It's not a memory class, it's an English memory class."
//   Strict 4–6 card hard cap (eliminates bloated 8/10-card rounds).
//   Alternate cross-modal directions across 3 rounds:
//     Round 1 (Image → Word, 4 cards): memorize pictures & words → recall missing word
//     Round 2 (Word → Image, 5 cards): memorize English words → recall missing picture
//     Round 3 (Productive Speech, 6 cards): memorize items → speak the missing English word
//
// Features:
//   - Stitch Cyber-Lab Widescreen HUD & 16:9 projection layout
//   - Teacher Clock Controls: manual Start ("START TIMER"), Pause/Resume, and "Peek Again" (+3s)
//   - 4-Option Candidate Shelf (A/B/C/D) with keyboard shortcuts (1-4, A-D, SPACE)
//   - Educational Double-Miss Reveal: shows target image + English word + auto-played native audio
//   - Fully responsive @media (max-height: 450px) reflow without scrolling

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  MicOff,
  Volume2,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Eye,
  CheckCircle2,
  XCircle,
  Flame,
  HelpCircle,
} from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { makeRng } from '../../../services/seededRandom';
import { useBoardPool } from '../useBoardPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { useSpeechRecognition } from './useSpeechRecognition';
import { logAttempt } from './scoreAttempt';
import { shuffle } from './scoringUtils';
import { playCue, startTickLoop } from './playCue';
import { useSpeech } from './useSpeech';
import { preloadRoundSpeech } from './speechPreload';
import type { PoolItem, ImageSelectContent } from '../../../types/exercise';

interface MemoryCard {
  poolItem: PoolItem;
  imageUrl: string;
  word: string;
  audioUrl?: string;
  speechText?: string;
}

interface RoundConfig {
  gridSize: number;
  memorizeTime: number;
  mode: 'recognize' | 'produce';
  direction: 'image→word' | 'word→image' | 'produce';
  title: string;
  instruction: string;
}

// 4–6 card hard cap across the 3 rounds
const BASE_ROUNDS: RoundConfig[] = [
  {
    gridSize: 4,
    memorizeTime: 10,
    mode: 'recognize',
    direction: 'image→word',
    title: 'Image → Word',
    instruction: 'Memorize pictures & words — recall the missing word!',
  },
  {
    gridSize: 5,
    memorizeTime: 8,
    mode: 'recognize',
    direction: 'word→image',
    title: 'Word → Image',
    instruction: 'Memorize the words — recall the missing picture!',
  },
  {
    gridSize: 6,
    memorizeTime: 8,
    mode: 'produce',
    direction: 'produce',
    title: 'Say It Aloud',
    instruction: 'Memorize the items — speak the missing word in English!',
  },
];

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

const BoardMemoryLab: React.FC<{ data?: any }> = () => {
  const { state, addPoints, pushToRemediation, triggerAction, triggerConfetti } = useSession();
  const seedBase = useSeedBase();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  const roundResolvedRef = useRef(false);
  const completeRef = useRef(false);
  const roundGenRef = useRef(0);
  const choralFiredRef = useRef(-1);

  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<'memorize' | 'choral' | 'recall' | 'feedback' | 'complete'>('memorize');
  const [countdown, setCountdown] = useState(BASE_ROUNDS[0].memorizeTime);
  const [clockArmed, setClockArmed] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [peekActive, setPeekActive] = useState(false);

  const [grid, setGrid] = useState<MemoryCard[]>([]);
  const [removedIdx, setRemovedIdx] = useState(-1);
  const [candidates, setCandidates] = useState<MemoryCard[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null);
  const [lastAward, setLastAward] = useState(0);
  const [streak, setStreak] = useState(0);
  const [missedOut, setMissedOut] = useState(false);

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id).filter(Boolean), [state.students]);

  // ── Content: IMAGE_SELECT items → card pool ──
  const { items: poolItems, loading } = useBoardPool({
    unitId,
    exerciseTypes: ['IMAGE_SELECT'],
    classWeak: true,
    roster,
  });

  const cardPool: MemoryCard[] = useMemo(() => {
    const cards: MemoryCard[] = [];
    const seen = new Set<string>();
    for (const pi of poolItems) {
      const content = pi.content as ImageSelectContent;
      const correct = content.options?.[content.correct_index];
      if (!correct?.image_url || seen.has(correct.image_url)) continue;
      seen.add(correct.image_url);
      cards.push({
        poolItem: pi,
        imageUrl: correct.image_url,
        word: correct.label || content.prompt || '',
        audioUrl: content.prompt_audio || content.audio_url,
        speechText: content.prompt || correct.label,
      });
    }
    return cards;
  }, [poolItems]);

  // Adaptive round ladder bounded by pool length, strictly capped at 4–6 cards
  const rounds = useMemo<RoundConfig[]>(() => {
    if (cardPool.length < 4) return BASE_ROUNDS;
    return BASE_ROUNDS.map((r, idx) => {
      const targetSize = idx === 0 ? 4 : idx === 1 ? 5 : 6;
      return {
        ...r,
        gridSize: Math.min(targetSize, cardPool.length),
      };
    });
  }, [cardPool.length]);

  const cfg = rounds[round] || BASE_ROUNDS[0];

  // Pre-warm TTS for cards
  useEffect(() => {
    if (poolItems.length > 0) preloadRoundSpeech(unitId, poolItems);
  }, [poolItems, unitId]);

  // ── Round setup ──────────────────────────────────────────────────────────
  const testedCardsRef = useRef<Set<string>>(new Set());

  const setupRound = useCallback(
    (roundIdx: number) => {
      const currentCfg = rounds[roundIdx] || rounds[0];
      if (!currentCfg || cardPool.length < 4) return;

      const cardKey = (c: MemoryCard) => c.poolItem?.id ?? c.imageUrl;
      const shuffledCards = shuffle(cardPool, makeRng(seedBase, roundIdx, 'cards'));

      let unprobed = shuffledCards.filter((c) => !testedCardsRef.current.has(cardKey(c)));
      if (unprobed.length === 0) {
        testedCardsRef.current = new Set();
        unprobed = shuffledCards;
      }
      const removedCard = unprobed[0];
      testedCardsRef.current.add(cardKey(removedCard));

      const gridCards = shuffle(
        [
          removedCard,
          ...shuffledCards.filter((c) => c !== removedCard).slice(0, currentCfg.gridSize - 1),
        ],
        makeRng(seedBase, roundIdx, 'grid')
      );
      const removed = gridCards.indexOf(removedCard);

      // Candidates: target card + 3 distinct distractors
      const outsideGrid = shuffledCards.filter((c) => !gridCards.includes(c));
      const insideGrid = gridCards.filter((c) => c !== removedCard);
      const distractorPool = [...outsideGrid, ...insideGrid];
      const distractors = distractorPool.slice(0, 3);
      const roundCandidates = shuffle(
        [removedCard, ...distractors],
        makeRng(seedBase, roundIdx, 'candidates')
      );

      setCandidates(roundCandidates);
      setGrid(gridCards);
      setRemovedIdx(removed);
      setCountdown(currentCfg.memorizeTime);
      setClockArmed(false);
      setIsPaused(false);
      setPeekActive(false);
      setSelectedCandidate(null);
      setMissedOut(false);
      mistakesRef.current = 0;
      awardedRef.current = false;
      roundResolvedRef.current = false;
      roundGenRef.current += 1;
      choralFiredRef.current = -1;
      setPhase('memorize');
    },
    [cardPool, rounds, seedBase]
  );

  const setupDone = useRef(false);
  useEffect(() => {
    if (loading || cardPool.length < 4 || setupDone.current) return;
    setupDone.current = true;
    setupRound(0);
  }, [loading, cardPool.length, setupRound]);

  // ── Countdown Timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'memorize' || grid.length === 0 || !clockArmed || isPaused) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setPhase('choral');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, round, grid.length, clockArmed, isPaused]);

  // Tension ticking cue
  useEffect(() => {
    if (phase !== 'memorize' || grid.length === 0 || !clockArmed || isPaused) return;
    const stopTicks = startTickLoop(countdown > 0 && countdown < 4 ? 500 : 1000);
    return stopTicks;
  }, [phase, round, countdown, grid.length, clockArmed, isPaused]);

  // Choral callout phase transition
  useEffect(() => {
    if (phase !== 'choral') return;
    if (choralFiredRef.current !== round) {
      choralFiredRef.current = round;
      playCue('reveal');
    }
    const t = setTimeout(() => setPhase('recall'), 1500);
    return () => clearTimeout(t);
  }, [phase, round]);

  // Reveal cue when feedback mounts
  useEffect(() => {
    if (phase === 'feedback') playCue('reveal');
  }, [phase]);

  // Speech & reference audio
  const removedCard = removedIdx >= 0 ? grid[removedIdx] : undefined;
  const { play: playRemovedSpeech } = useSpeech({
    text: removedCard?.speechText,
    audioUrl: removedCard?.audioUrl,
    unitId,
  });

  const playRemovedAudio = useCallback(() => {
    if (removedCard?.audioUrl || removedCard?.speechText) {
      playRemovedSpeech();
    }
  }, [removedCard, playRemovedSpeech]);

  // ── Attempt Handlers ──────────────────────────────────────────────────────
  const scheduleAdvance = useCallback(
    (delay: number) => {
      const gen = roundGenRef.current;
      setTimeout(() => {
        if (roundGenRef.current === gen) advanceRound();
      }, delay);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [round, rounds.length, cardPool.length]
  );

  const completeGame = useCallback(
    (broadcast = true) => {
      if (completeRef.current) return;
      completeRef.current = true;
      playCue('win');
      setPhase('complete');
      if (broadcast) triggerAction('SLIDE_COMPLETE', { forced: false });
    },
    [triggerAction]
  );

  const advanceRound = useCallback(() => {
    if (round < rounds.length - 1 && cardPool.length >= 4) {
      const next = round + 1;
      setRound(next);
      setupRound(next);
    } else {
      completeGame();
    }
  }, [round, rounds.length, cardPool.length, setupRound, completeGame]);

  const roundSuccess = useCallback(
    (partialRatio = 1.0) => {
      const card = removedCard;
      if (!card || roundResolvedRef.current) return;
      roundResolvedRef.current = true;
      playCue('correct');
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak === 3 || nextStreak === 5) {
        playCue('streak');
        triggerConfetti();
      }
      const picked = state.quickWheelWinner;
      const difficulty = card.poolItem.difficulty || 1;
      const points = scoreForAttempt(mistakesRef.current, difficulty, partialRatio, nextStreak);
      if (picked && !awardedRef.current) {
        awardedRef.current = true;
        if (points > 0) addPoints(picked, points);
        logAttempt({
          state,
          picked,
          unitId,
          objectiveId: card.poolItem.objective_id,
          exerciseType: 'IMAGE_SELECT',
          difficulty,
          correctness: partialRatio >= 1 ? 'correct' : 'partial',
          modality: rounds[round]?.mode === 'produce' ? 'productive' : 'receptive',
          pushToRemediation,
        });
      }
      setLastAward(points);
      setPhase('feedback');
      playRemovedAudio();
      scheduleAdvance(2400);
    },
    [
      removedCard,
      streak,
      state,
      rounds,
      round,
      triggerConfetti,
      addPoints,
      unitId,
      pushToRemediation,
      playRemovedAudio,
      scheduleAdvance,
    ]
  );

  const roundMiss = useCallback(
    (modality: 'receptive' | 'productive') => {
      const card = removedCard;
      if (roundResolvedRef.current) return;
      playCue('wrong');
      setStreak(0);
      mistakesRef.current += 1;
      const picked = state.quickWheelWinner;
      if (picked) addPoints(picked, -MISTAKE_PENALTY);
      if (card) {
        logAttempt({
          state,
          picked: picked || '',
          unitId,
          objectiveId: card.poolItem.objective_id,
          exerciseType: 'IMAGE_SELECT',
          difficulty: card.poolItem.difficulty || 1,
          correctness: 'incorrect',
          correct: false,
          modality,
          pushToRemediation,
        });
      }
    },
    [removedCard, state, addPoints, unitId, pushToRemediation]
  );

  // Educational Double-Miss Reveal (F8): shows the missing card & plays audio before advancing
  const resolveRoundAsMiss = useCallback(() => {
    if (roundResolvedRef.current) return;
    roundResolvedRef.current = true;
    playCue('reveal');
    setMissedOut(true);
    setLastAward(0);
    setPhase('feedback');
    playRemovedAudio();
    scheduleAdvance(2600);
  }, [playRemovedAudio, scheduleAdvance]);

  const markCorrect = useCallback(() => {
    if ((phase !== 'recall' && phase !== 'choral') || roundResolvedRef.current || completeRef.current) return;
    roundSuccess(1.0);
  }, [phase, roundSuccess]);

  const handleCandidateSelect = useCallback(
    (idx: number) => {
      if (phase !== 'recall' || roundResolvedRef.current) return;
      const card = candidates[idx];
      setSelectedCandidate(idx);
      if (card && removedCard && card.poolItem.id === removedCard.poolItem.id) {
        roundSuccess(1.0);
      } else {
        roundMiss(cfg?.mode === 'produce' ? 'productive' : 'receptive');
        if (mistakesRef.current >= 2) {
          resolveRoundAsMiss();
        } else {
          setTimeout(() => setSelectedCandidate(null), 800);
        }
      }
    },
    [phase, candidates, removedCard, cfg?.mode, roundSuccess, roundMiss, resolveRoundAsMiss]
  );

  // Speech Recognition for Produce mode
  const {
    isListening,
    isSupported: speechSupported,
    startListening,
    score: speechScore,
    transcript: speechTranscript,
    passed: speechPassed,
  } = useSpeechRecognition({
    targetText: removedCard?.word || '',
    onResult: (score, transcript, passed) => {
      if (passed) {
        roundSuccess(Math.max(0.6, Math.min(1, score)));
      } else {
        roundMiss('productive');
        if (mistakesRef.current >= 2) resolveRoundAsMiss();
      }
    },
  });

  // Peek Again (+3s temporary reveal)
  const triggerPeekAgain = useCallback(() => {
    if (phase !== 'recall' || peekActive) return;
    setPeekActive(true);
    playCue('reveal');
    setTimeout(() => {
      setPeekActive(false);
    }, 3000);
  }, [phase, peekActive]);

  // ── Keyboard Shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (phase === 'memorize') {
          if (!clockArmed) setClockArmed(true);
          else setIsPaused((p) => !p);
        } else if (phase === 'recall' && cfg?.mode === 'produce' && speechSupported) {
          if (!isListening) startListening();
        } else if (phase === 'feedback') {
          playRemovedAudio();
        }
        return;
      }

      if (phase === 'recall' && candidates.length > 0) {
        const key = e.key.toUpperCase();
        if (key === 'A' || key === '1') handleCandidateSelect(0);
        else if (key === 'B' || key === '2') handleCandidateSelect(1);
        else if (key === 'C' || key === '3') handleCandidateSelect(2);
        else if (key === 'D' || key === '4') handleCandidateSelect(3);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    phase,
    clockArmed,
    cfg?.mode,
    speechSupported,
    isListening,
    startListening,
    playRemovedAudio,
    candidates.length,
    handleCandidateSelect,
  ]);

  // ── Lifecycle: Reset on New Turn ──────────────────────────────────────────
  useEffect(() => {
    if (turnId === null) return;
    setupDone.current = false;
    completeRef.current = false;
    setRound(0);
    setLastAward(0);
    setStreak(0);
    setMissedOut(false);
    if (cardPool.length >= 4) {
      setupDone.current = true;
      setupRound(0);
    }
  }, [turnId, cardPool.length, setupRound]);

  // ── Remote Controls ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;
    if (type === 'RESET_GAME') {
      completeRef.current = false;
      testedCardsRef.current = new Set();
      setRound(0);
      setLastAward(0);
      setStreak(0);
      setMissedOut(false);
      if (cardPool.length >= 4) setupRound(0);
    } else if (type === 'SKIP_ITEM') {
      advanceRound();
    } else if (type === 'PLAY_AUDIO' || type === 'NEXT_ITEM') {
      if (phase === 'memorize') {
        if (!clockArmed) setClockArmed(true);
        else setIsPaused((p) => !p);
      } else if (phase === 'feedback') {
        playRemovedAudio();
      }
    } else if (type === 'MARK_CORRECT') {
      markCorrect();
    } else if (type === 'SLIDE_COMPLETE') {
      completeGame(false);
    }
  }, [state.lastAction, phase, clockArmed, setupRound, advanceRound, playRemovedAudio, markCorrect, completeGame, cardPool.length]);

  // ── Loading & Empty Fallbacks ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#070C18] text-sky-400 font-mono">
        <div className="flex items-center gap-3 text-lg font-bold">
          <span className="w-3 h-3 rounded-full bg-sky-400 animate-ping" />
          <span>INITIALIZING MEMORY ARCHIVE…</span>
        </div>
      </div>
    );
  }

  if (cardPool.length < 4) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#070C18] text-slate-100 p-8 text-center select-none">
        <div className="text-7xl mb-6">🧠</div>
        <h2 className="text-3xl font-extrabold text-sky-400 mb-3 tracking-wide">Memory Lab</h2>
        <div className="text-base text-slate-400 max-w-md">
          Not enough illustrated vocabulary in this unit yet (minimum 4 items required). Run the exercise
          generator or advance to the next slide.
        </div>
      </div>
    );
  }

  // Grid layout class based on card count (4 cards = 1 row of 4; 5-6 cards = 2 rows of 3)
  const gridClass =
    grid.length === 4
      ? 'grid-cols-4 grid-rows-1'
      : grid.length === 5
      ? 'grid-cols-3 grid-rows-2'
      : 'grid-cols-3 grid-rows-2';

  return (
    <div className="h-full w-full bg-[#070C18] text-slate-100 flex flex-col justify-between p-3 select-none overflow-hidden relative font-sans">
      {/* ── TOP HUD HEADER STRIP ── */}
      <header className="w-full flex items-center justify-between px-4 py-2 bg-[#0B132B]/95 border border-[#1E2D5A] rounded-2xl backdrop-blur-md shrink-0 shadow-lg z-20 pl-28 lg:pl-44">
        {/* Left: Phase Pill & Round Detail */}
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 px-3.5 py-1 rounded-full border text-xs font-mono font-bold uppercase tracking-wider ${
              phase === 'memorize'
                ? 'bg-sky-500/15 border-sky-400/50 text-sky-400'
                : phase === 'choral'
                ? 'bg-pink-500/15 border-pink-400/50 text-pink-400 animate-pulse'
                : phase === 'recall'
                ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-400'
                : 'bg-amber-500/15 border-amber-400/50 text-amber-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                phase === 'memorize'
                  ? 'bg-sky-400 animate-pulse'
                  : phase === 'recall'
                  ? 'bg-emerald-400'
                  : 'bg-pink-400'
              }`}
            />
            <span>
              PHASE: {phase === 'choral' ? 'POINT!' : phase.toUpperCase()}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-[#0E1733] border border-[#1E2D5A] rounded-lg text-xs font-mono text-slate-300">
            <span className="text-slate-400 font-bold">R{round + 1}/3:</span>
            <span className="text-sky-300 font-semibold">{cfg.title}</span>
          </div>
        </div>

        {/* Center: Big Countdown Timer + Play/Pause/Start Controls */}
        <div className="flex items-center gap-3">
          {phase === 'memorize' && (
            <div className="flex items-center gap-3 bg-[#070C18]/90 border-2 border-sky-400/50 px-3.5 py-1 rounded-full shadow-[0_0_20px_rgba(56,189,248,0.25)]">
              {/* Circular gauge */}
              <div className="relative w-9 h-9 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-slate-800"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className={countdown < 4 ? 'text-pink-500' : 'text-sky-400'}
                    strokeDasharray={`${Math.round((countdown / cfg.memorizeTime) * 100)}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                  />
                </svg>
                <span className="text-xs font-mono font-bold text-sky-300 absolute">
                  {countdown}
                </span>
              </div>

              {/* Big Seconds text */}
              <div className="flex items-baseline gap-1">
                <span
                  className={`text-2xl font-black font-mono tracking-tight leading-none ${
                    countdown < 4 ? 'text-pink-400 animate-pulse' : 'text-sky-400'
                  }`}
                >
                  {countdown < 10 ? `0${countdown}` : countdown}
                </span>
                <span className="font-mono text-[10px] font-bold text-sky-400/80">SEC</span>
              </div>

              <div className="h-5 w-[1px] bg-slate-700 mx-1" />

              {/* Manual Teacher Start / Pause Trigger */}
              {!clockArmed ? (
                <button
                  onClick={() => setClockArmed(true)}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#FF2E79] hover:bg-[#FF2E79]/90 active:scale-95 text-white font-bold text-xs tracking-wider uppercase shadow-[0_0_15px_rgba(255,46,121,0.45)] transition-all cursor-pointer"
                >
                  <Play size={14} className="fill-current" />
                  <span>START TIMER (SPACE)</span>
                </button>
              ) : (
                <button
                  onClick={() => setIsPaused((p) => !p)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0E1733] hover:bg-[#1E2D5A] border border-sky-400/40 active:scale-95 text-sky-300 font-mono text-xs font-bold transition-all cursor-pointer"
                  title={isPaused ? 'Resume timer' : 'Pause timer'}
                >
                  {isPaused ? <Play size={13} /> : <Pause size={13} />}
                  <span>{isPaused ? 'RESUME' : 'PAUSE'}</span>
                </button>
              )}
            </div>
          )}

          {phase === 'recall' && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0E1733] border border-emerald-400/40 text-emerald-300 text-xs font-mono font-bold">
                <HelpCircle size={14} />
                <span>WHAT IS MISSING?</span>
              </div>

              {/* Peek Again (+3s reveal) */}
              <button
                onClick={triggerPeekAgain}
                disabled={peekActive}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold font-mono transition-all active:scale-95 ${
                  peekActive
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300 animate-pulse'
                    : 'bg-[#0E1733] hover:bg-[#1E2D5A] border-amber-400/40 text-amber-300'
                }`}
                title="Briefly peek at the missing card for 3 seconds"
              >
                <Eye size={13} />
                <span>PEEK (+3s)</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Streak & Turn Indicator */}
        <div className="flex items-center gap-3">
          {streak > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-mono font-bold shadow-[0_0_10px_rgba(245,158,11,0.25)]">
              <Flame size={14} className="fill-current text-amber-400" />
              <span>STREAK x{streak}</span>
            </div>
          )}

          {pickedStudent && (
            <div className="flex items-center gap-2 px-3 py-1 bg-[#0E1733] border border-[#1E2D5A] rounded-full text-xs font-medium text-slate-200">
              <div className="w-5 h-5 rounded-full bg-pink-500/20 border border-pink-400 text-pink-400 flex items-center justify-center font-bold text-[11px]">
                {pickedStudent.name[0]}
              </div>
              <span className="font-semibold">{pickedStudent.name}'s turn</span>
            </div>
          )}
        </div>
      </header>

      {/* ── MAIN CONTENT ARENA ── */}
      <div className="flex-1 flex flex-col justify-center my-2 min-h-0 relative z-10">
        <AnimatePresence mode="wait">
          {/* 1. MEMORIZE PHASE */}
          {phase === 'memorize' && (
            <motion.div
              key={`memorize-${round}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full flex flex-col justify-center"
            >
              <div className="text-center mb-1.5">
                <span className="text-xs font-mono text-sky-400 uppercase tracking-widest font-bold">
                  {cfg.instruction}
                </span>
              </div>

              {/* Grid of landscape specimen cards */}
              <div className={`grid gap-3 w-full max-w-6xl mx-auto flex-1 min-h-0 ${gridClass}`}>
                {grid.map((card, idx) => {
                  const isWordMode = cfg.direction === 'word→image';
                  return (
                    <motion.div
                      key={`${card.poolItem.id}-${idx}`}
                      initial={{ rotateY: 90, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      transition={{ delay: idx * 0.06 }}
                      className="group relative bg-[#111C3D] border border-[#1E2D5A] hover:border-sky-400/60 rounded-2xl overflow-hidden flex flex-col shadow-md transition-all"
                    >
                      {/* Number badge */}
                      <div className="absolute top-2 left-2 z-10 font-mono text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-[#070C18]/85 text-slate-300 border border-white/10 backdrop-blur-sm">
                        0{idx + 1}
                      </div>

                      {/* Card Content based on Round Direction */}
                      {isWordMode ? (
                        /* Word Focus Card */
                        <div className="flex-1 w-full flex flex-col items-center justify-center p-4 bg-gradient-to-b from-[#0E1733] to-[#111C3D]">
                          <span className="text-2xl lg:text-3xl font-black text-white tracking-wide font-sans group-hover:text-sky-300 transition-colors">
                            {card.word.toUpperCase()}
                          </span>
                          <span className="font-mono text-xs text-sky-400 mt-1 font-semibold">
                            ENGLISH WORD
                          </span>
                        </div>
                      ) : (
                        /* Image + Subtitle Card */
                        <>
                          <div className="relative flex-1 w-full overflow-hidden bg-slate-950">
                            <img
                              src={card.imageUrl}
                              alt={card.word}
                              className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                          <div className="h-10 px-3.5 bg-[#0E1733] border-t border-[#1E2D5A] flex items-center justify-between shrink-0">
                            <span className="font-sans text-base lg:text-lg font-black tracking-wide text-white group-hover:text-sky-300 transition-colors">
                              {card.word.toUpperCase()}
                            </span>
                            <span className="font-mono text-xs text-sky-400 font-bold">
                              0{idx + 1}
                            </span>
                          </div>
                        </>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* 2. CHORAL RALLY CALLOUT */}
          {phase === 'choral' && (
            <motion.div
              key={`choral-${round}`}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex items-center justify-center"
            >
              <div className="text-center px-12 py-10 rounded-3xl bg-gradient-to-br from-[#0B132B] to-[#1E2D5A] border-2 border-pink-500 shadow-[0_0_40px_rgba(255,46,121,0.35)]">
                <div className="text-6xl mb-3 animate-bounce">👉</div>
                <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-tight tracking-wide mb-2">
                  Everyone — Point at the Missing Card!
                </h2>
                <div className="text-base text-pink-300 font-mono font-bold">
                  {pickedStudent ? `${pickedStudent.name}, get ready to answer!` : 'Spot the gap!'}
                </div>
              </div>
            </motion.div>
          )}

          {/* 3. RECALL PHASE */}
          {phase === 'recall' && (
            <motion.div
              key={`recall-${round}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full flex flex-col justify-between"
            >
              {/* Grid with Missing Slot */}
              <div className={`grid gap-3 w-full max-w-6xl mx-auto flex-1 min-h-0 mb-2 ${gridClass}`}>
                {grid.map((card, idx) => {
                  const isMissing = idx === removedIdx && !peekActive;
                  const isWordMode = cfg.direction === 'word→image';

                  if (isMissing) {
                    return (
                      <div
                        key={`gap-${idx}`}
                        className="relative rounded-2xl overflow-hidden bg-[#0D1733]/90 border-2 border-dashed border-sky-400 flex flex-col items-center justify-center p-3 text-center shadow-[0_0_20px_rgba(56,189,248,0.25)] animate-pulse"
                      >
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-sky-400/20 border border-sky-400/50 font-mono text-[11px] font-bold text-sky-300">
                          0{idx + 1} · ACTIVE TARGET
                        </div>
                        <div className="w-12 h-12 rounded-full bg-sky-400/15 border border-sky-400 flex items-center justify-center mb-1 shadow-[0_0_15px_rgba(56,189,248,0.35)]">
                          <span className="font-extrabold text-2xl text-sky-300">?</span>
                        </div>
                        <span className="font-sans font-bold text-sm lg:text-base text-sky-200 tracking-wider">
                          TARGET #0{idx + 1}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400 mt-0.5">
                          {cfg.direction === 'image→word'
                            ? 'Recall the missing word'
                            : cfg.direction === 'word→image'
                            ? 'Recall the missing picture'
                            : 'Say the missing word'}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={`${card.poolItem.id}-${idx}`}
                      className="group relative bg-[#111C3D] border border-[#1E2D5A] rounded-2xl overflow-hidden flex flex-col shadow-md"
                    >
                      <div className="absolute top-2 left-2 z-10 font-mono text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-[#070C18]/85 text-slate-300 border border-white/10">
                        0{idx + 1}
                      </div>
                      {isWordMode ? (
                        <div className="flex-1 w-full flex flex-col items-center justify-center p-4 bg-gradient-to-b from-[#0E1733] to-[#111C3D]">
                          <span className="text-xl lg:text-2xl font-black text-white tracking-wide font-sans">
                            {card.word.toUpperCase()}
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className="relative flex-1 w-full overflow-hidden bg-slate-950">
                            <img
                              src={card.imageUrl}
                              alt={card.word}
                              className="w-full h-full object-cover object-center"
                            />
                          </div>
                          <div className="h-9 px-3.5 bg-[#0E1733] border-t border-[#1E2D5A] flex items-center justify-between shrink-0">
                            <span className="font-sans text-sm lg:text-base font-black tracking-wide text-white">
                              {card.word.toUpperCase()}
                            </span>
                            <span className="font-mono text-xs text-sky-400">0{idx + 1}</span>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── CANDIDATE SHELF (Bottom Tray) ── */}
              <div className="w-full max-w-6xl mx-auto bg-[#0B132B]/95 border border-[#1E2D5A] rounded-2xl p-2.5 backdrop-blur-md shrink-0 shadow-lg">
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-sky-400">
                      CHOOSE FOR MISSING SLOT:
                    </span>
                  </div>
                  <span className="font-mono text-xs text-slate-400">
                    Keys: [A] [B] [C] [D] or Tap Option
                  </span>
                </div>

                {/* Candidate Selection Modes */}
                {cfg.direction === 'image→word' && (
                  /* Word Pills Tray */
                  <div className="grid grid-cols-4 gap-3">
                    {candidates.map((cand, idx) => {
                      const isSelected = selectedCandidate === idx;
                      const isCorrect = removedCard && cand.poolItem.id === removedCard.poolItem.id;
                      return (
                        <motion.button
                          key={`${cand.poolItem.id}-${idx}`}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleCandidateSelect(idx)}
                          className={`relative rounded-xl border p-3 flex items-center justify-between transition-all cursor-pointer ${
                            isSelected
                              ? isCorrect
                                ? 'bg-emerald-500/20 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                                : 'bg-red-500/20 border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                              : 'bg-[#111C3D] hover:bg-[#1E2D5A] border-[#1E2D5A] hover:border-sky-400/60'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-lg bg-[#070C18] border border-white/10 font-mono text-xs font-black text-sky-400 flex items-center justify-center">
                              {OPTION_KEYS[idx]}
                            </span>
                            <span className="font-sans text-base lg:text-lg font-black text-white tracking-wide">
                              {cand.word.toUpperCase()}
                            </span>
                          </div>
                          {isSelected && (
                            <span>
                              {isCorrect ? (
                                <CheckCircle2 className="text-emerald-400" size={20} />
                              ) : (
                                <XCircle className="text-red-400" size={20} />
                              )}
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {cfg.direction === 'word→image' && (
                  /* Picture Cards Tray */
                  <div className="grid grid-cols-4 gap-3">
                    {candidates.map((cand, idx) => {
                      const isSelected = selectedCandidate === idx;
                      const isCorrect = removedCard && cand.poolItem.id === removedCard.poolItem.id;
                      return (
                        <motion.button
                          key={`${cand.poolItem.id}-${idx}`}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleCandidateSelect(idx)}
                          className={`relative rounded-xl border p-2 flex items-center gap-3 transition-all cursor-pointer ${
                            isSelected
                              ? isCorrect
                                ? 'bg-emerald-500/20 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                                : 'bg-red-500/20 border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                              : 'bg-[#111C3D] hover:bg-[#1E2D5A] border-[#1E2D5A] hover:border-sky-400/60'
                          }`}
                        >
                          <span className="w-6 h-6 rounded-lg bg-[#070C18] border border-white/10 font-mono text-xs font-black text-sky-400 flex items-center justify-center shrink-0">
                            {OPTION_KEYS[idx]}
                          </span>
                          <div className="w-14 h-12 rounded-lg overflow-hidden bg-slate-950 shrink-0 border border-white/10">
                            <img
                              src={cand.imageUrl}
                              alt={cand.word}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="font-sans text-sm font-bold text-slate-200 truncate">
                            {cand.word.toUpperCase()}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {cfg.direction === 'produce' && (
                  /* Productive Speech Mode */
                  <div className="flex items-center justify-between px-2 py-1">
                    {!speechSupported ? (
                      /* Fallback Word Pills if mic unsupported */
                      <div className="grid grid-cols-4 gap-3 w-full">
                        {candidates.map((cand, idx) => (
                          <button
                            key={`${cand.poolItem.id}-${idx}`}
                            onClick={() => handleCandidateSelect(idx)}
                            className="bg-[#111C3D] hover:bg-[#1E2D5A] border border-[#1E2D5A] hover:border-sky-400/60 rounded-xl p-3 flex items-center gap-3 font-sans font-bold text-base text-white"
                          >
                            <span className="w-6 h-6 rounded-lg bg-[#070C18] font-mono text-xs text-sky-400 flex items-center justify-center">
                              {OPTION_KEYS[idx]}
                            </span>
                            <span>{cand.word.toUpperCase()}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      /* Speech Recognition Mic Bar */
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={startListening}
                            disabled={isListening}
                            className={`px-7 py-2.5 rounded-xl font-sans font-bold text-base flex items-center gap-2.5 shadow-lg cursor-pointer ${
                              isListening
                                ? 'bg-pink-500 text-white animate-pulse shadow-[0_0_20px_rgba(255,46,121,0.5)]'
                                : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                            }`}
                          >
                            <Mic size={20} />
                            <span>{isListening ? 'Listening… Speak English' : 'Tap to Speak (SPACE)'}</span>
                          </motion.button>

                          {speechTranscript && (
                            <div className="px-4 py-1.5 bg-[#070C18] border border-[#1E2D5A] rounded-xl font-mono text-sm text-slate-200">
                              <span>Heard: </span>
                              <span className="font-bold text-white">"{speechTranscript}"</span>
                              <span className="ml-2 font-bold text-sky-400">
                                ({Math.round((speechScore || 0) * 100)}%)
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={markCorrect}
                            className="px-4 py-2 bg-[#0E1733] hover:bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-bold rounded-xl transition-all"
                          >
                            Teacher: Mark Correct
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* 4. FEEDBACK & EDUCATIONAL REVEAL (F8 Fix) */}
          {phase === 'feedback' && removedCard && (
            <motion.div
              key="feedback"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex-1 flex items-center justify-center"
            >
              <div className="text-center max-w-lg p-8 bg-[#0B132B]/95 border-2 border-emerald-400 rounded-3xl shadow-[0_0_35px_rgba(16,185,129,0.3)] backdrop-blur-md">
                {/* Revealed Image Card */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, y: [0, -8, 0] }}
                  transition={{ type: 'spring', stiffness: 220 }}
                  className="w-48 h-36 mx-auto mb-4 rounded-2xl overflow-hidden border-2 border-emerald-400 shadow-xl bg-slate-950"
                >
                  <img
                    src={removedCard.imageUrl}
                    alt={removedCard.word}
                    className="w-full h-full object-cover"
                  />
                </motion.div>

                {/* Status headline */}
                <h2
                  className={`text-2xl font-black mb-1 tracking-wide ${
                    missedOut ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  {missedOut
                    ? 'Learning Moment · Remember This Word!'
                    : pickedStudent
                    ? `${pickedStudent.name} Got It!`
                    : 'Target Card Revealed!'}
                </h2>

                {/* Bold Word */}
                <div className="text-3xl font-black text-white mb-2 font-sans tracking-wider">
                  {removedCard.word.toUpperCase()}
                </div>

                {/* Points or Review badge */}
                <div className="text-base font-mono font-bold mb-4 text-slate-300">
                  {lastAward > 0 ? (
                    <span className="text-emerald-400 font-extrabold">+{lastAward} POINTS</span>
                  ) : (
                    <span className="text-amber-400">0 Points · Vocabulary Review</span>
                  )}
                </div>

                {/* Audio replay button */}
                <button
                  onClick={playRemovedAudio}
                  className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 rounded-xl font-bold font-sans inline-flex items-center gap-2 shadow-[0_0_15px_rgba(56,189,248,0.4)] transition-all cursor-pointer"
                >
                  <Volume2 size={18} />
                  <span>Hear Native Audio (SPACE)</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* 5. COMPLETE SCREEN */}
          {phase === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex-1 flex items-center justify-center"
            >
              <div className="text-center px-12 py-10 bg-[#0B132B]/95 border border-sky-400/40 rounded-3xl shadow-2xl">
                <div className="text-7xl mb-4">🐘</div>
                <h2 className="text-4xl font-extrabold text-white mb-2 font-sans tracking-wide">
                  Memory Lab Complete!
                </h2>
                <div className="text-lg text-sky-300 font-mono mb-4">Elephant Memory Achieved!</div>
                <div className="text-sm text-slate-400">
                  All 3 English memory rounds mastered with the class.
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── FOOTER BAR ── */}
      <footer className="w-full flex items-center justify-between px-3 py-1 bg-[#0B132B]/60 border border-[#1E2D5A]/50 rounded-xl text-xs font-mono text-slate-400 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>16:9 Projector Board · Optimal Legibility</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Shortcuts: [SPACE] Timer/Audio · [1-4 / A-D] Candidate</span>
        </div>
      </footer>
    </div>
  );
};

export default BoardMemoryLab;
