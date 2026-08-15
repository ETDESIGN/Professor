// BoardMemoryLab — Memory game with speech-recognition production (NEW GEN)
//
// Replaces: BoardWhatsMissing / MagicEyes (764 lines + teacher-typing produce mode)
//
// Pedagogical loop (per MASTER_ROADMAP.md Game 8):
//   SHOW grid of images (timed memorize) → REMOVE one → RECALL:
//     Rounds 1-2 (recognize): student TAPS which card is missing (MCQ candidates)
//     Round 3 (produce): student SPEAKS the missing word — speech recognition
//     scores it (replaces the legacy teacher-typing produce mode)
//   → Progressive: grid 4→6→8, memorize time 10s→8s→6s → FSRS push per round
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

const BoardMemoryLab = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation } = useSession();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);

  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<'memorize' | 'recall' | 'feedback' | 'complete'>('memorize');
  const [countdown, setCountdown] = useState(ROUNDS[0].memorizeTime);
  const [grid, setGrid] = useState<MemoryCard[]>([]);
  const [removedIdx, setRemovedIdx] = useState(-1);
  const [candidates, setCandidates] = useState<MemoryCard[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null);
  const [lastAward, setLastAward] = useState(0);

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id).filter(Boolean), [state.students]);

  // ── Content: IMAGE_SELECT items → card pool (correct-option image + word) ──
  const { items: poolItems, loading } = useBoardPool({
    unitId,
    exerciseTypes: ['IMAGE_SELECT'],
    classWeak: true,
    roster,
    limit: 24,
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

  // Warm the TTS cache for the round's cards (bounded, fire-and-forget).
  useEffect(() => {
    if (poolItems.length > 0) preloadRoundSpeech(unitId, poolItems);
  }, [poolItems, unitId]);

  // ── Round setup: build grid, pick the removed card, build candidates ────
  const setupRound = (roundIdx: number) => {
    const cfg = ROUNDS[roundIdx];
    if (!cfg) return;
    const shuffledCards = shuffle(cardPool);
    const gridCards = shuffledCards.slice(0, cfg.gridSize);
    const removed = Math.floor(Math.random() * gridCards.length);
    const removedCard = gridCards[removed];
    // Candidates = the missing card + 3 distractors NOT in the grid.
    const distractors = shuffledCards
      .filter((c) => !gridCards.includes(c))
      .slice(0, 3);
    setCandidates(shuffle([removedCard, ...distractors]));
    setGrid(gridCards);
    setRemovedIdx(removed);
    setCountdown(cfg.memorizeTime);
    setSelectedCandidate(null);
    mistakesRef.current = 0;
    awardedRef.current = false;
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

  // ── Memorize countdown → recall ─────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'memorize') return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setPhase('recall');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, round]);

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
      }
    },
  });

  // ── Lifecycle: reset on new turn ────────────────────────────────────────
  useEffect(() => {
    if (turnId === null) return;
    setupDone.current = false;
    setRound(0);
    setLastAward(0);
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
      setRound(0);
      setLastAward(0);
      if (cardPool.length >= 4) setupRound(0);
    } else if (type === 'SKIP_ITEM') {
      advanceRound();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // ── Scoring (per-round attempt lifecycle) ───────────────────────────────
  const roundSuccess = (partialRatio = 1.0) => {
    const card = removedCard;
    if (!card) return;
    const picked = state.quickWheelWinner;
    const difficulty = card.poolItem.difficulty || 1;
    const points = scoreForAttempt(mistakesRef.current, difficulty, partialRatio);
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
        modality: ROUNDS[round]?.mode === 'produce' ? 'productive' : 'receptive',
        pushToRemediation,
      });
    }
    setLastAward(points);
    setPhase('feedback');
    setTimeout(() => advanceRound(), 2200);
  };

  const roundMiss = (modality: 'receptive' | 'productive') => {
    const card = removedCard;
    const picked = state.quickWheelWinner;
    if (picked) {
      mistakesRef.current += 1;
      addPoints(picked, -MISTAKE_PENALTY);
    }
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

  const handleCandidateSelect = (idx: number) => {
    // Recall-phase taps work in recognize rounds AND as the speech-unsupported
    // fallback in the produce round (candidates only render in those cases).
    if (phase !== 'recall') return;
    const card = candidates[idx];
    setSelectedCandidate(idx);
    if (card && removedCard && card.poolItem.id === removedCard.poolItem.id) {
      roundSuccess(1.0);
    } else {
      roundMiss(cfg?.mode === 'produce' ? 'productive' : 'receptive');
      setTimeout(() => setSelectedCandidate(null), 800);
    }
  };

  const advanceRound = () => {
    if (round < ROUNDS.length - 1 && cardPool.length >= ROUNDS[round + 1].gridSize) {
      const next = round + 1;
      setRound(next);
      setupRound(next);
    } else {
      setPhase('complete');
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

  const cfg = ROUNDS[round];

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
          {ROUNDS.map((_, r) => (
            <div
              key={r}
              className={`w-3 h-3 rounded-full ${
                r === round ? 'bg-cyan-600 animate-pulse' : r < round ? 'bg-cyan-400' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
        <div className="text-sm text-gray-500 mt-1">
          Round {round + 1} of {ROUNDS.length} — {cfg?.mode === 'produce' ? 'Say what is missing' : 'Tap what is missing'}
        </div>
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
            <div className={`grid gap-4 ${cfg.gridSize > 4 ? 'grid-cols-4' : 'grid-cols-2'} max-w-3xl`}>
              {grid.map((card, idx) => (
                <motion.div
                  key={`${card.poolItem.id}-${idx}`}
                  initial={{ rotateY: 90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  transition={{ delay: idx * 0.08 }}
                  className="aspect-square w-28 md:w-32 rounded-xl overflow-hidden border-4 border-white shadow-lg"
                >
                  <img src={card.imageUrl} alt={card.word} className="w-full h-full object-cover" />
                </motion.div>
              ))}
            </div>
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
            </div>

            {/* Grid with the gap */}
            <div className={`grid gap-4 ${cfg.gridSize > 4 ? 'grid-cols-4' : 'grid-cols-2'} max-w-3xl mb-8`}>
              {grid.map((card, idx) => (
                <div
                  key={`${card.poolItem.id}-${idx}`}
                  className={`aspect-square w-28 md:w-32 rounded-xl overflow-hidden border-4 shadow-lg ${
                    idx === removedIdx
                      ? 'border-dashed border-cyan-400 bg-cyan-100 flex items-center justify-center'
                      : 'border-white'
                  }`}
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
                    className={`aspect-square w-28 rounded-xl overflow-hidden border-4 transition-all ${
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
                className="w-40 h-40 mx-auto mb-6 rounded-2xl overflow-hidden border-4 border-green-400 shadow-2xl"
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
