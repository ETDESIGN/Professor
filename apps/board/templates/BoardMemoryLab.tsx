// BoardMemoryLab — Memory game with speech-recognition production (NEW GEN)
//
// Replaces: BoardWhatsMissing / MagicEyes (764 lines + teacher-typing produce mode)
//
// Pedagogical loop (per MASTER_ROADMAP.md Game 8):
//   SHOW grid of images (timed memorize) → REMOVE one → RECALL:
//     Rounds 1-2 (recognize): student TAPS which card is missing (MCQ candidates)
//     Round 3 (produce): student SPEAKS the missing word — speech recognition
//     scores it (replaces the legacy teacher-typing produce mode)
//     Round 4 (produce, tension peak): 10 cards / 5s — appended ONLY when the
//     illustrated card pool has ≥10 distinct cards
//   → Progressive: grid 4→6→8(→10), memorize 10s→8s→6s(→5s) → FSRS push per round
//   → Tension pack: ticking clock while memorizing (ramps to 500ms under 4s
//     left) + a ~1.5s choral "Everyone — point!" callout before recall
//
// Lifecycle: NEW_TURN reset on currentTurnId, per-round mistakesRef/awardedRef
// reset, remote controls via state.lastAction (RESET_GAME / SKIP_ITEM).
// Zero teacher typing.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2 } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
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
  /** TTS source text when audioUrl is absent (reference-based audio). */
  speechText?: string;
}

interface RoundConfig {
  gridSize: number;
  memorizeTime: number;
  mode: 'recognize' | 'produce';
}

const ROUNDS: RoundConfig[] = [
  { gridSize: 4, memorizeTime: 10, mode: 'recognize' },
  { gridSize: 6, memorizeTime: 8, mode: 'recognize' },
  { gridSize: 8, memorizeTime: 6, mode: 'produce' },
];

/** Round 4 — the tension peak (biggest grid, shortest clock). Only staged
 *  when the illustrated card pool has ≥10 distinct cards; advanceRound's
 *  per-round gridSize guard enforces it exactly like rounds 2-3. */
const TENSION_ROUND: RoundConfig = { gridSize: 10, memorizeTime: 5, mode: 'produce' };

const BoardMemoryLab = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation, triggerAction, triggerConfetti } = useSession();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  /** Per-round resolve latch (success / MARK_CORRECT / miss auto-resolve). */
  const roundResolvedRef = useRef(false);
  /** Completion latch — makes the SLIDE_COMPLETE broadcast idempotent. */
  const completeRef = useRef(false);
  /** Round generation counter — stale auto-advance timers (e.g. after a
   *  remote SKIP_ITEM raced the pending timeout) must not skip a 2nd round. */
  const roundGenRef = useRef(0);
  /** Per-round choral-callout latch — the "Everyone — point!" reveal cue must
   *  fire exactly once per round (reset to -1 in setupRound, re-render safe). */
  const choralFiredRef = useRef(-1);

  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<'memorize' | 'choral' | 'recall' | 'feedback' | 'complete'>('memorize');
  const [countdown, setCountdown] = useState(ROUNDS[0].memorizeTime);
  const [grid, setGrid] = useState<MemoryCard[]>([]);
  const [removedIdx, setRemovedIdx] = useState(-1);
  const [candidates, setCandidates] = useState<MemoryCard[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null);
  const [lastAward, setLastAward] = useState(0);
  const [streak, setStreak] = useState(0);
  /** 2nd-miss auto-resolve notice ("Missed it — moving on…") during the hold. */
  const [missedOut, setMissedOut] = useState(false);

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id).filter(Boolean), [state.students]);

  // ── Content: IMAGE_SELECT items → card pool (correct-option image + word) ──
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
        word: correct.label || content.prompt,
        audioUrl: content.prompt_audio || content.audio_url,
        speechText: content.prompt || correct.label,
      });
    }
    return cards;
  }, [poolItems]);

  // Effective round ladder: the 3 base rounds always, + the 10-card/5s
  // tension round only when the pool has ≥10 distinct cards. Every
  // round-count surface (progress dots, "Round x of y", advanceRound, mode
  // lookups) reads this — nothing hardcodes 3.
  const rounds = useMemo<RoundConfig[]>(
    () => (cardPool.length >= TENSION_ROUND.gridSize ? [...ROUNDS, TENSION_ROUND] : ROUNDS),
    [cardPool.length]
  );

  // Warm the TTS cache for the round's cards (bounded, fire-and-forget).
  useEffect(() => {
    if (poolItems.length > 0) preloadRoundSpeech(unitId, poolItems);
  }, [poolItems, unitId]);

  // ── Round setup: build grid, pick the removed card, build candidates ────
  /** Cards already probed (removed) in earlier rounds of this game — see
   *  setupRound. Keyed by pool item id (falls back to image URL). */
  const testedCardsRef = useRef<Set<string>>(new Set());
  const setupRound = (roundIdx: number) => {
    const cfg = rounds[roundIdx];
    if (!cfg) return;
    const cardKey = (c: MemoryCard) => c.poolItem?.id ?? c.imageUrl;
    const shuffledCards = shuffle(cardPool);
    // Coverage fix: pick the removed (tested) card from the not-yet-probed
    // ones first — the old pure-random pick inside a reshuffled grid could
    // re-test the same word round after round while the rest of the pool was
    // never probed. Once every card has been probed, start a fresh cycle.
    let unprobed = shuffledCards.filter((c) => !testedCardsRef.current.has(cardKey(c)));
    if (unprobed.length === 0) {
      testedCardsRef.current = new Set();
      unprobed = shuffledCards;
    }
    const removedCard = unprobed[0];
    testedCardsRef.current.add(cardKey(removedCard));
    const gridCards = shuffle([
      removedCard,
      ...shuffledCards.filter((c) => c !== removedCard).slice(0, cfg.gridSize - 1),
    ]);
    const removed = gridCards.indexOf(removedCard);
    // Candidates = the missing card + 3 distractors NOT in the grid.
    const distractors = shuffledCards
      .filter((c) => !gridCards.includes(c))
      .slice(0, 3);
    setCandidates(shuffle([removedCard, ...distractors]));
    setGrid(gridCards);
    setRemovedIdx(removed);
    setCountdown(cfg.memorizeTime);
    setSelectedCandidate(null);
    setMissedOut(false);
    mistakesRef.current = 0;
    awardedRef.current = false;
    roundResolvedRef.current = false;
    roundGenRef.current += 1;
    choralFiredRef.current = -1;
    setPhase('memorize');
  };

  // Initial round setup once the pool is ready (and on pool changes when idle).
  const setupDone = useRef(false);
  useEffect(() => {
    if (loading || cardPool.length < 4 || setupDone.current) return;
    setupDone.current = true;
    setupRound(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, cardPool.length]);

  // ── Memorize countdown → choral callout → recall ────────────────────────
  // grid.length === 0 guards the loading/empty-pool screens: phase state sits
  // at 'memorize' there, and without this guard the clock (and its ticks)
  // would run audibly behind them.
  useEffect(() => {
    if (phase !== 'memorize' || grid.length === 0) return;
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
  }, [phase, round, grid.length]);

  // ── Ticking clock (tension): one tick per memorize second, doubling up
  // (every 500ms) for the final stretch (<4s left). Restarting on each
  // countdown change re-anchors the tick to the visible number; the cleanup
  // makes every exit path — countdown exhausted, phase/round change
  // (SKIP_ITEM / RESET_GAME / new turn / advance), unmount — stop the loop,
  // so no path can leave a tick interval running. ─────────────────────────
  useEffect(() => {
    if (phase !== 'memorize' || grid.length === 0) return;
    const stopTicks = startTickLoop(countdown > 0 && countdown < 4 ? 500 : 1000);
    return stopTicks;
  }, [phase, round, countdown, grid.length]);

  // ── Choral callout: ~1.5s full-screen "Everyone — point!" beat between
  // memorize and recall. choralFiredRef guarantees the reveal cue fires once
  // per round (re-render / re-entry safe); the cleanup drops the pending
  // timer whenever the phase exits early (SKIP_ITEM / MARK_CORRECT /
  // SLIDE_COMPLETE / reset), so recall is never entered by a stale timer. ──
  useEffect(() => {
    if (phase !== 'choral') return;
    if (choralFiredRef.current !== round) {
      choralFiredRef.current = round;
      playCue('reveal');
    }
    const t = setTimeout(() => setPhase('recall'), 1500);
    return () => clearTimeout(t);
  }, [phase, round]);

  // Reveal cue exactly when the missing card bounces in (feedback phase
  // mounts) — the card stays hidden until this moment.
  useEffect(() => {
    if (phase === 'feedback') playCue('reveal');
  }, [phase]);

  // ── Speech recognition (round 3 produce mode) ───────────────────────────
  const removedCard = removedIdx >= 0 ? grid[removedIdx] : undefined;

  // Reference-based audio: background-resolve the removed card's word;
  // play() never blocks — browser voice covers the not-ready case.
  const { play: playRemovedSpeech } = useSpeech({
    text: removedCard?.speechText,
    audioUrl: removedCard?.audioUrl,
    unitId,
  });
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

  // ── Lifecycle: reset on new turn ────────────────────────────────────────
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId]);

  // ── Remote controls ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;
    if (type === 'RESET_GAME') {
      completeRef.current = false;
      testedCardsRef.current = new Set(); // fresh coverage cycle
      setRound(0);
      setLastAward(0);
      setStreak(0);
      setMissedOut(false);
      if (cardPool.length >= 4) setupRound(0);
    } else if (type === 'SKIP_ITEM') {
      advanceRound();
    } else if (type === 'MARK_CORRECT') {
      // Teacher override ("Correct" on the remote): accept the answer
      // WITHOUT recognition — especially the round-3 spoken word. Scores the
      // round as a clean correct (mistakesRef preserved) and advances.
      markCorrect();
    } else if (type === 'SLIDE_COMPLETE') {
      // Forced End from the remote/commander → jump to the complete state.
      // completeRef stops us echoing the broadcast back (our own optimistic
      // lastAction update re-enters this listener).
      completeGame(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // ── Scoring (per-round attempt lifecycle) ───────────────────────────────
  // Generation-guarded auto-advance: a remote SKIP_ITEM racing the pending
  // timer bumps the generation in setupRound and the stale timer bails.
  const scheduleAdvance = (delay: number) => {
    const gen = roundGenRef.current;
    setTimeout(() => {
      if (roundGenRef.current === gen) advanceRound();
    }, delay);
  };

  // Natural completion → terminal card + SLIDE_COMPLETE broadcast. The ref
  // makes it idempotent across the optimistic lastAction echo and the
  // remote's forced End both landing here.
  const completeGame = (broadcast = true) => {
    if (completeRef.current) return;
    completeRef.current = true;
    playCue('win');
    setPhase('complete');
    if (broadcast) triggerAction('SLIDE_COMPLETE', { forced: false });
  };

  const roundSuccess = (partialRatio = 1.0) => {
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
    // Hold ~2.2s: the feedback card (image + word + Hear it) is teaching
    // content, not empty celebration.
    scheduleAdvance(2200);
  };

  const roundMiss = (modality: 'receptive' | 'productive') => {
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
  };

  // Reveal-on-wrong, MemoryLab EXCEPTION: never reveal the missing card (that
  // would defeat the memory mechanic). After the 2nd miss, cue and auto-
  // resolve the round as a miss via the standard miss path, then move on.
  const resolveRoundAsMiss = () => {
    if (roundResolvedRef.current) return;
    roundResolvedRef.current = true;
    playCue('reveal');
    setMissedOut(true);
    scheduleAdvance(1600);
  };

  // MARK_CORRECT body (invoked from the lastAction listener): accept the
  // answer without recognition — scores as a clean correct with mistakesRef
  // preserved, shows the card, and advances.
  const markCorrect = () => {
    // Also accept during the choral callout — never drop a remote "Correct"
    // press (dead-button avoidance). roundSuccess moves us to feedback and
    // the callout's pending timer is cleaned up by the phase change.
    if ((phase !== 'recall' && phase !== 'choral') || roundResolvedRef.current || completeRef.current) return;
    roundSuccess(1.0);
  };

  const handleCandidateSelect = (idx: number) => {
    // Recall-phase taps work in recognize rounds AND as the speech-unsupported
    // fallback in the produce round (candidates only render in those cases).
    if (phase !== 'recall' || roundResolvedRef.current) return;
    const card = candidates[idx];
    setSelectedCandidate(idx);
    if (card && removedCard && card.poolItem.id === removedCard.poolItem.id) {
      roundSuccess(1.0);
    } else {
      roundMiss(cfg?.mode === 'produce' ? 'productive' : 'receptive');
      if (mistakesRef.current >= 2) resolveRoundAsMiss();
      else setTimeout(() => setSelectedCandidate(null), 800);
    }
  };

  const advanceRound = () => {
    if (round < rounds.length - 1 && cardPool.length >= rounds[round + 1].gridSize) {
      const next = round + 1;
      setRound(next);
      setupRound(next);
    } else {
      completeGame();
    }
  };

  const playRemovedAudio = () => {
    if (removedCard?.audioUrl || removedCard?.speechText) playRemovedSpeech();
  };

  // ── Loading / empty states ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-cyan-50 to-blue-50">
        <div className="text-2xl text-gray-400">Loading memory items…</div>
      </div>
    );
  }
  if (cardPool.length < 4) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-cyan-50 to-blue-50 p-8 text-center">
        <div className="text-7xl mb-6">🧠</div>
        <h2 className="text-4xl font-bold text-cyan-900 mb-3">Memory Lab</h2>
        <div className="text-xl text-gray-500 max-w-xl">
          Not enough illustrated vocabulary for this unit yet. Run the exercise generator (with
          images), or skip to the next slide.
        </div>
      </div>
    );
  }

  const cfg = rounds[round];

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-cyan-50 to-blue-50 p-8">
      {/* Header */}
      <div className="text-center mb-4">
        <motion.h1
          key={round}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold text-cyan-900 mb-2"
        >
          Memory Lab
        </motion.h1>
        <div className="flex items-center justify-center gap-2">
          {rounds.map((_, r) => (
            <div
              key={r}
              className={`w-3 h-3 rounded-full ${
                r === round ? 'bg-cyan-600 animate-pulse' : r < round ? 'bg-cyan-400' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
        <div className="text-sm text-gray-500 mt-1">
          Round {round + 1} of {rounds.length} — {cfg?.mode === 'produce' ? 'Say what is missing' : 'Tap what is missing'}
        </div>
        {streak > 1 && (
          <div className="inline-flex items-center gap-1 mt-1 px-3 py-1 bg-cyan-500 text-white rounded-full font-bold text-sm">
            🔥 Streak x{streak}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* Memorize phase */}
        {phase === 'memorize' && cfg && (
          <motion.div
            key={`memorize-${round}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex-1 flex flex-col items-center justify-center"
          >
            <div className="text-center mb-4">
              <div className="text-xl text-gray-600 mb-2">Memorize the cards!</div>
              {/* Countdown ring */}
              <div className="relative inline-flex items-center justify-center">
                <svg className="w-20 h-20 -rotate-90">
                  <circle cx="40" cy="40" r="34" stroke="#e5e7eb" strokeWidth="8" fill="none" />
                  <motion.circle
                    cx="40" cy="40" r="34"
                    stroke="#0891b2" strokeWidth="8" fill="none"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 34}
                    animate={{ strokeDashoffset: 2 * Math.PI * 34 * (1 - countdown / cfg.memorizeTime) }}
                    transition={{ duration: 1, ease: 'linear' }}
                  />
                </svg>
                <span className="absolute text-3xl font-bold text-cyan-800">{countdown}</span>
              </div>
            </div>
            <div className={`grid gap-4 ${cfg.gridSize > 4 ? 'grid-cols-4' : 'grid-cols-2'} max-w-5xl`}>
              {grid.map((card, idx) => (
                <motion.div
                  key={`${card.poolItem.id}-${idx}`}
                  initial={{ rotateY: 90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  transition={{ delay: idx * 0.08 }}
                  className="aspect-square w-40 md:w-44 rounded-xl overflow-hidden border-4 border-white shadow-lg"
                >
                  <img src={card.imageUrl} alt={card.word} className="w-full h-full object-cover" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Choral callout — full-screen rally right before recall */}
        {phase === 'choral' && (
          <motion.div
            key={`choral-${round}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex items-center justify-center"
          >
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 0.7, ease: 'easeInOut' }}
              className="text-center px-12 py-16 rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-2xl"
            >
              <div className="text-8xl mb-4">👉</div>
              <div className="text-4xl md:text-6xl font-extrabold text-white leading-tight">
                Everyone — point at the missing card!
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Recall phase */}
        {phase === 'recall' && cfg && (
          <motion.div
            key={`recall-${round}`}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            className="flex-1 flex flex-col items-center justify-center"
          >
            <div className="text-center mb-4">
              <div className="text-2xl text-gray-700 font-semibold">
                {cfg.mode === 'produce' ? 'What is missing? Say it!' : 'Which card is missing?'}
              </div>
              {missedOut && (
                <div className="text-xl text-gray-500 mt-2 animate-pulse">Missed it — moving on…</div>
              )}
            </div>

            {/* Grid with the gap */}
            <div className={`grid gap-4 ${cfg.gridSize > 4 ? 'grid-cols-4' : 'grid-cols-2'} max-w-5xl mb-8`}>
              {grid.map((card, idx) => (
                <div
                  key={`${card.poolItem.id}-${idx}`}
                  className={`aspect-square w-40 md:w-44 rounded-xl overflow-hidden border-4 shadow-lg ${
                    idx === removedIdx
                      ? 'border-dashed border-cyan-400 bg-cyan-100 flex items-center justify-center'
                      : 'border-white'
                  } ${missedOut ? 'opacity-60' : ''}`}
                >
                  {idx === removedIdx ? (
                    <span className="text-5xl">❓</span>
                  ) : (
                    <img src={card.imageUrl} alt={card.word} className="w-full h-full object-cover" />
                  )}
                </div>
              ))}
            </div>

            {/* Recognize: candidate cards */}
            {cfg.mode === 'recognize' && (
              <div className="flex gap-4 justify-center flex-wrap">
                {candidates.map((card, idx) => (
                  <motion.button
                    key={`${card.poolItem.id}-c${idx}`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleCandidateSelect(idx)}
                    className={`aspect-square w-40 rounded-xl overflow-hidden border-4 transition-all ${
                      selectedCandidate === idx
                        ? removedCard && card.poolItem.id === removedCard.poolItem.id
                          ? 'border-green-500'
                          : 'border-red-500'
                        : 'border-white hover:border-cyan-400 shadow-lg'
                    }`}
                  >
                    <img src={card.imageUrl} alt={`Candidate ${idx + 1}`} className="w-full h-full object-cover" />
                  </motion.button>
                ))}
              </div>
            )}

            {/* Produce: speech recognition */}
            {cfg.mode === 'produce' && (
              <div className="text-center">
                {!speechSupported ? (
                  <div>
                    <MicOff size={48} className="mx-auto mb-4 text-gray-400" />
                    <div className="text-gray-500 text-lg mb-4">Speech recognition not supported — tap the word instead:</div>
                    {/* Fallback: recognize-style candidates */}
                    <div className="flex gap-4 justify-center flex-wrap">
                      {candidates.map((card, idx) => (
                        <motion.button
                          key={`${card.poolItem.id}-f${idx}`}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleCandidateSelect(idx)}
                          className="px-6 py-4 bg-white border-2 border-cyan-300 rounded-xl text-xl font-bold text-cyan-800"
                        >
                          {card.word}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={startListening}
                      disabled={isListening}
                      className={`px-12 py-6 rounded-full font-bold text-2xl flex items-center gap-3 mx-auto ${
                        isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-green-500 hover:bg-green-600 text-white'
                      }`}
                    >
                      <Mic size={32} />
                      {isListening ? 'Listening…' : 'Tap to Speak'}
                    </motion.button>
                    {speechTranscript && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 p-4 bg-white rounded-xl inline-block"
                      >
                        <div className="text-sm text-gray-500 mb-1">You said:</div>
                        <div className="text-2xl text-gray-800 mb-2">{speechTranscript}</div>
                        <div className="text-lg">
                          Score:{' '}
                          <span className={`font-bold ${speechPassed ? 'text-green-600' : 'text-red-600'}`}>
                            {Math.round((speechScore || 0) * 100)}%
                          </span>
                          {speechPassed && ' ✅'}
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Feedback */}
        {phase === 'feedback' && removedCard && (
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
                animate={{ scale: 1, y: [0, -12, 0] }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="w-48 h-48 mx-auto mb-6 rounded-2xl overflow-hidden border-4 border-green-400 shadow-2xl"
              >
                <img src={removedCard.imageUrl} alt={removedCard.word} className="w-full h-full object-cover" />
              </motion.div>
              <h2 className="text-4xl font-bold text-green-600 mb-2">
                {pickedStudent ? `${pickedStudent.name} remembered it!` : 'Got it!'}
              </h2>
              <div className="text-3xl text-cyan-900 font-bold mb-2">{removedCard.word}</div>
              <div className="text-2xl text-gray-600 mb-3">+{lastAward} points</div>
              {(removedCard.audioUrl || removedCard.speechText) && (
                <button
                  onClick={playRemovedAudio}
                  className="px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-bold inline-flex items-center gap-2"
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
              <div className="text-8xl mb-6">🧠</div>
              <h2 className="text-5xl font-bold text-cyan-900 mb-4">Memory Lab Complete!</h2>
              <div className="text-2xl text-gray-600">Elephant memory! 🐘</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Turn footer */}
      {pickedStudent && phase !== 'complete' && (
        <div className="mt-4 text-center">
          <div className="inline-flex items-center gap-3 bg-white rounded-full px-6 py-3 shadow-lg">
            <div className="w-10 h-10 rounded-full bg-cyan-500 flex items-center justify-center text-white font-bold">
              {pickedStudent.name[0]}
            </div>
            <div className="text-xl font-semibold text-gray-800">{pickedStudent.name}'s turn</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoardMemoryLab;
