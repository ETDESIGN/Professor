// BoardFastVocab — Two-Phase Vocabulary Arena (PRACTICE phase, v3 Redesign)
//
// Pedagogical loop (per games-v3 audit & owner direction 2026-09-09):
//   One lightning turn per picked student:
//     Phase 1 (Power Match, 3 pairs): cross-modal encoding (image↔word or word↔meaning)
//     Phase 2 (Speed Sprint, 2 questions): rapid retrieval on the SAME words (learn → recall arc)
//
// Key fixes & features:
//   - F1: Turn stability — score accumulation flushes once at turn completion, preventing
//         auto-rotate wheel from aborting turns mid-match.
//   - F2: High-energy visual stages with distinct Phase 1 / Phase 2 banners.
//   - F5/F6: Eliminated destructive bare RefreshCcw icon from board header.
//   - F8: Prominent challenger badge ("⚡ ALICE'S TURN") with avatar ring and streak chip.
//   - Stitch Cyber-Arena HUD: #070C18 blueprint grid, cyan/pink neon badges, radial timer gauge.
//   - Victory pod: glowing 5-star spring celebration with stats and audio replay.
//   - Keyboard shortcuts: [1, 2, 3] or [A, B, C] for speed answers; [SPACE] for pronunciation audio.
//   - Responsive floor: zero vertical scroll at 700×320 landscape (@media (max-height: 450px)).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Star, Zap, Volume2, HelpCircle } from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { makeRng } from '../../../services/seededRandom';
import { useBoardPool } from '../useBoardPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { logAttempt } from './scoreAttempt';
import { playCue } from './playCue';
import { playAudioUrl } from '../../../services/SpeechService';
import FastVocabHud from '../../../components/games/fastVocab/FastVocabHud';
import FastVocabMatchWave from '../../../components/games/fastVocab/FastVocabMatchWave';
import FastVocabSpeedRound from '../../../components/games/fastVocab/FastVocabSpeedRound';
import { useFastVocabTurn } from '../../../components/games/fastVocab/useFastVocabTurn';
import { preloadWaveAudio } from '../../../components/games/fastVocab/preloadWaveAudio';
import {
  detectMode,
  buildUnitPairs,
  takeWave,
  starsFor,
  resolveWaveSize,
} from '../../../components/games/fastVocab/contentBuilder';
import type {
  FastVocabPair,
  FastVocabSpeedQ,
  FastVocabTurnSummary,
} from '../../../components/games/fastVocab/types';
import type {
  FastVocabMatchResult,
  FastVocabSpeedResult,
} from '../../../components/games/fastVocab/useFastVocabTurn';

const SPEED_COUNT = 2;
const SPEED_TIME_LIMIT = 10;

const BoardFastVocab: React.FC<{ data?: any }> = ({ data }) => {
  const { state, addPoints, pushToRemediation, triggerAction, triggerConfetti } = useSession();
  const seedBase = useSeedBase();
  const pickedStudent = usePickedStudent();
  const unitId = state.activeUnit?.id || '';
  const waveSize = resolveWaveSize((data as any)?.waveSize);

  // ── Pool → pairs ────────────────────────────────────────────────────────
  const { items: poolItems, loading } = useBoardPool({
    unitId,
    exerciseTypes: ['IMAGE_SELECT', 'MEANING_MATCH'],
  });
  const mode = useMemo(() => detectMode(poolItems), [poolItems]);
  const unitPairs = useMemo(() => buildUnitPairs(poolItems, mode), [poolItems, mode]);

  // ── Wave cursor (NOT reset per turn — pool coverage) ────────────────────
  const cursorRef = useRef(0);
  const [wavePairs, setWavePairs] = useState<FastVocabPair[]>([]);
  const [turnSummary, setTurnSummary] = useState<FastVocabTurnSummary | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryName, setSummaryName] = useState<string | null>(null);
  const [turnPoints, setTurnPoints] = useState(0);
  const turnPointsRef = useRef(0);
  const awardeeRef = useRef<string | null>(null);
  const winCuedRef = useRef(false);

  const flushTurnPoints = useCallback(() => {
    if (turnPointsRef.current !== 0 && awardeeRef.current) {
      addPoints(awardeeRef.current, turnPointsRef.current);
    }
    turnPointsRef.current = 0;
    setTurnPoints(0);
    awardeeRef.current = null;
  }, [addPoints]);

  const buildWave = useCallback(
    (fromCursor: number) => {
      const { wave, nextCursor } = takeWave(
        unitPairs,
        fromCursor,
        waveSize,
        makeRng(seedBase, fromCursor, 'wave')
      );
      cursorRef.current = nextCursor;
      setWavePairs(wave);
      preloadWaveAudio(wave);
    },
    [unitPairs, waveSize, seedBase]
  );

  // Initial wave once the pool resolves
  const seededUnitRef = useRef<string | null>(null);
  useEffect(() => {
    if (unitPairs.length > 0 && seededUnitRef.current !== unitId) {
      seededUnitRef.current = unitId;
      cursorRef.current = 0;
      turnPointsRef.current = 0;
      setTurnPoints(0);
      setTurnSummary(null);
      winCuedRef.current = false;
      buildWave(0);
    }
  }, [unitId, unitPairs, buildWave]);

  // ── Turn controller (engine) ────────────────────────────────────────────
  const events = useMemo(
    () => ({
      onMatchResult: (pair: FastVocabPair, r: FastVocabMatchResult) => {
        if (r.correct) {
          playCue('correct');
          if (r.streak === 3 || r.streak === 5) {
            playCue('streak');
            triggerConfetti();
          }
          playAudioUrl(pair.audioUrl, pair.word).catch(() => {});
        } else {
          playCue('wrong');
          if (r.missCount === 2) playCue('reveal');
        }
        const picked = state.quickWheelWinner;
        if (!picked) return;
        awardeeRef.current = picked;
        if (r.correct) {
          const points = scoreForAttempt(0, pair.difficulty, 1.0, r.streak);
          // Batched accumulation (F1 fix) — flushes once at turn completion
          turnPointsRef.current += points;
          setTurnPoints(turnPointsRef.current);
          logAttempt({
            state,
            picked,
            unitId,
            objectiveId: pair.objectiveId,
            exerciseType: pair.exerciseType,
            difficulty: pair.difficulty,
            correctness: 'correct',
            modality: 'receptive',
            pushToRemediation,
          });
        } else {
          turnPointsRef.current -= MISTAKE_PENALTY;
          setTurnPoints(turnPointsRef.current);
          logAttempt({
            state,
            picked,
            unitId,
            objectiveId: pair.objectiveId,
            exerciseType: pair.exerciseType,
            difficulty: pair.difficulty,
            correctness: 'incorrect',
            correct: false,
            modality: 'receptive',
            pushToRemediation,
          });
        }
      },
      onSpeedResult: (q: FastVocabSpeedQ, r: FastVocabSpeedResult) => {
        if (r.correct) {
          playCue('correct');
          if (r.streak === 3 || r.streak === 5) {
            playCue('streak');
            triggerConfetti();
          }
          playAudioUrl(q.audioUrl, q.correctWord).catch(() => {});
        } else if (!r.timedOut) {
          playCue('wrong');
        } else {
          playCue('reveal');
          playAudioUrl(q.audioUrl, q.correctWord).catch(() => {});
        }
        const picked = state.quickWheelWinner;
        if (!picked) return;
        awardeeRef.current = picked;
        if (r.correct) {
          const points = scoreForAttempt(0, q.difficulty, 1.0, r.streak);
          turnPointsRef.current += points;
          setTurnPoints(turnPointsRef.current);
        } else if (!r.timedOut) {
          // Timeout costs nothing (clock-anxiety rule)
          turnPointsRef.current -= MISTAKE_PENALTY;
          setTurnPoints(turnPointsRef.current);
        }
        logAttempt({
          state,
          picked,
          unitId,
          objectiveId: q.objectiveId,
          exerciseType: q.exerciseType,
          difficulty: q.difficulty,
          correctness: r.correct ? 'correct' : 'incorrect',
          correct: r.correct,
          modality: 'receptive',
          pushToRemediation,
        });
      },
      onComplete: (summary: FastVocabTurnSummary) => {
        flushTurnPoints();
        setTurnSummary(summary);
        setShowSummary(true);
        setSummaryName(pickedStudent?.name ?? null);
        if (!winCuedRef.current) {
          winCuedRef.current = true;
          playCue('win');
          triggerConfetti();
        }
        triggerAction('SLIDE_COMPLETE', { forced: false });
      },
    }),
    [
      state,
      unitId,
      pickedStudent?.name,
      triggerConfetti,
      triggerAction,
      flushTurnPoints,
      pushToRemediation,
    ]
  );

  const turn = useFastVocabTurn({
    wavePairs,
    poolPairs: unitPairs,
    mode,
    speedCount: SPEED_COUNT,
    timeLimit: SPEED_TIME_LIMIT,
    seedKey: seedBase,
    events,
  });

  // ── Keyboard Shortcuts (Speed Choices & Audio) ───────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (turn.phase === 'speed' && turn.currentQ) {
          playAudioUrl(turn.currentQ.audioUrl, turn.currentQ.correctWord).catch(() => {});
        }
        return;
      }

      if (turn.phase === 'speed' && turn.currentQ && turn.selectedChoice === null) {
        const key = e.key.toUpperCase();
        if (key === '1' || key === 'A') turn.chooseAnswer(0);
        else if (key === '2' || key === 'B') turn.chooseAnswer(1);
        else if (key === '3' || key === 'C') turn.chooseAnswer(2);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [turn]);

  // ── Lifecycle: NEW_TURN (keyed on currentTurnId) ──────────────────────────
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return;
    flushTurnPoints();
    setTurnSummary(null);
    setShowSummary(false);
    winCuedRef.current = false;
    if (unitPairs.length > 0) buildWave(cursorRef.current);
  }, [turnId, buildWave, flushTurnPoints, unitPairs.length]);

  // ── Remote / commander controls ───────────────────────────────────────────
  useEffect(() => {
    const action = state.lastAction;
    if (!action) return;
    switch (action.type) {
      case 'CLEAR_RESPONDER':
        setShowSummary(false);
        break;
      case 'SPIN_WHEEL':
      case 'GAME_WIN':
        break;
      case 'RESET_GAME': {
        flushTurnPoints();
        setTurnSummary(null);
        setShowSummary(false);
        winCuedRef.current = false;
        cursorRef.current = 0;
        if (unitPairs.length > 0) buildWave(0);
        break;
      }
      case 'SKIP_ITEM':
        flushTurnPoints();
        turn.skip();
        break;
      case 'REVEAL_HINT':
        turn.hint();
        break;
      case 'MARK_CORRECT':
        turn.forceCorrect();
        break;
      case 'SLIDE_COMPLETE':
        turn.forceComplete();
        break;
    }
  }, [state.lastAction, buildWave, flushTurnPoints, turn, unitPairs.length]);

  // ── Empty pool state ──────────────────────────────────────────────────────
  if (loading || (unitPairs.length === 0 && wavePairs.length === 0)) {
    if (!loading && unitPairs.length === 0) {
      return (
        <div className="h-full bg-[#070C18] flex flex-col items-center justify-center text-slate-100 text-center px-8">
          <h2 className="text-4xl font-extrabold text-sky-400 mb-2">Fast Vocab</h2>
          <p className="text-slate-400 text-lg">Content isn't ready for this round yet.</p>
          <button
            onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })}
            className="mt-6 px-6 py-3 bg-[#111C3D] hover:bg-[#1E2D5A] border border-[#1E2D5A] rounded-xl font-bold text-white transition-colors"
          >
            Skip Round
          </button>
        </div>
      );
    }
    return (
      <div className="h-full bg-[#070C18] flex flex-col items-center justify-center text-sky-400 font-mono">
        <div className="flex items-center gap-3 text-lg font-bold">
          <span className="w-3 h-3 rounded-full bg-sky-400 animate-ping" />
          <span>LOADING LIGHTNING VOCAB…</span>
        </div>
      </div>
    );
  }

  const matchProgress =
    turn.phase === 'match'
      ? turn.matchedPairIds.length / Math.max(1, wavePairs.length)
      : 1;
  const hudProgress =
    turn.phase === 'match'
      ? matchProgress * 0.6
      : 0.6 + (turn.qIdx / Math.max(1, turn.speedQs.length)) * 0.4;
  const hudLabel =
    turn.phase === 'match'
      ? `Match ${turn.matchedPairIds.length}/${wavePairs.length} Pairs`
      : turn.phase === 'speed'
      ? `Speed Recall ${turn.qIdx + 1}/${turn.speedQs.length}`
      : 'Turn Complete';

  const stars = turnSummary
    ? starsFor(turnSummary.firstTryCorrect, turnSummary.totalInteractions)
    : 0;

  return (
    <div className="h-full w-full bg-[#070C18] text-slate-100 flex flex-col justify-between p-3 select-none overflow-hidden relative font-sans">
      {/* ── TOP HUD HEADER STRIP (Pl-28 lg:pl-44 avoids • PRACTICE badge collision) ── */}
      <header className="w-full flex items-center justify-between px-4 py-2 bg-[#0B132B]/95 border border-[#1E2D5A] rounded-2xl backdrop-blur-md shrink-0 shadow-lg z-20 pl-28 lg:pl-44">
        {/* Left: Phase Pill & Round Title */}
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-mono font-bold uppercase tracking-wider ${
              turn.phase === 'match'
                ? 'bg-sky-500/15 border-sky-400/50 text-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                : turn.phase === 'speed'
                ? 'bg-pink-500/15 border-pink-400/50 text-pink-400 shadow-[0_0_12px_rgba(255,46,121,0.25)]'
                : 'bg-emerald-500/15 border-emerald-400/50 text-emerald-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                turn.phase === 'match'
                  ? 'bg-sky-400 animate-pulse'
                  : turn.phase === 'speed'
                  ? 'bg-pink-400 animate-pulse'
                  : 'bg-emerald-400'
              }`}
            />
            <span>
              {turn.phase === 'match'
                ? '⚡ PHASE 1: MATCH'
                : turn.phase === 'speed'
                ? '🔥 PHASE 2: SPEED'
                : 'COMPLETE'}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-[#0E1733] border border-[#1E2D5A] rounded-lg text-xs font-mono text-slate-300">
            <span className="text-slate-400 font-bold">MODE:</span>
            <span className="text-sky-300 font-semibold">
              {mode === 'image' ? 'Image Match' : 'Meaning Match'} ({waveSize} Pairs)
            </span>
          </div>
        </div>

        {/* Center: Stage Progress Tracker & Timer */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3.5 py-1 bg-[#0E1733] border border-[#1E2D5A] rounded-xl">
            <span className="text-xs font-mono font-bold text-sky-300 uppercase">
              {hudLabel}
            </span>
            <div className="w-24 h-2 bg-[#070C18] rounded-full overflow-hidden border border-white/10">
              <div
                className="h-full bg-gradient-to-r from-sky-400 to-pink-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.round(Math.max(0, Math.min(1, hudProgress)) * 100)}%` }}
              />
            </div>
          </div>

          {/* Speed Round Radial Countdown Gauge */}
          {turn.phase === 'speed' && (
            <div className="flex items-center gap-2 bg-[#070C18]/90 border border-pink-400/50 px-3 py-1 rounded-full shadow-[0_0_16px_rgba(255,46,121,0.25)]">
              <div className="relative w-8 h-8 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-slate-800"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className={turn.timeRemaining <= 3 ? 'text-red-500' : 'text-pink-400'}
                    strokeDasharray={`${Math.round((turn.timeRemaining / turn.timeLimit) * 100)}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                  />
                </svg>
                <span className="text-[11px] font-mono font-black text-pink-300 absolute">
                  {turn.timeRemaining}s
                </span>
              </div>
              <span className="font-mono text-[10px] font-bold text-pink-400 uppercase tracking-widest hidden sm:inline">
                RECALL
              </span>
            </div>
          )}
        </div>

        {/* Right: Streak & Challenger Chip (F8 Fix: High Legibility from 8m) */}
        <div className="flex items-center gap-3">
          {turn.streak > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-mono font-bold shadow-[0_0_10px_rgba(245,158,11,0.25)]">
              <Flame size={14} className="fill-current text-amber-400" />
              <span>STREAK x{turn.streak}</span>
            </div>
          )}

          {pickedStudent ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-[#0E1733] border border-pink-500/40 rounded-full text-xs font-medium text-slate-200 shadow-[0_0_12px_rgba(255,46,121,0.2)]">
              <div className="w-5 h-5 rounded-full bg-pink-500/20 border border-pink-400 text-pink-400 flex items-center justify-center font-bold text-[11px]">
                {pickedStudent.name[0]}
              </div>
              <span className="font-bold tracking-wide text-white uppercase">
                {pickedStudent.name}'s turn
              </span>
            </div>
          ) : (
            <div className="px-3 py-1 rounded-full bg-[#0E1733] border border-sky-400/40 text-sky-300 text-xs font-mono font-semibold">
              Choral Practice
            </div>
          )}
        </div>
      </header>

      {/* ── MAIN GAME ARENA ── */}
      <main className="flex-1 w-full max-w-6xl mx-auto my-2 flex flex-col justify-center min-h-0 relative z-10">
        <AnimatePresence mode="wait">
          {/* 1. MATCH WAVE (PHASE 1) */}
          {turn.phase === 'match' && (
            <motion.div
              key={`match-${wavePairs.map((p) => p.id).join(',')}`}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              className="h-full w-full flex flex-col justify-center"
            >
              <div className="text-center mb-1">
                <span className="text-xs font-mono text-sky-400 uppercase tracking-widest font-bold">
                  Tap card then tap matching partner · or drag across
                </span>
              </div>

              <div className="flex-1 min-h-0 flex items-center justify-center">
                <FastVocabMatchWave
                  pairs={wavePairs}
                  mode={mode}
                  matchedPairIds={turn.matchedPairIds}
                  hintPairId={turn.hintPairId}
                  revealPair={turn.revealPair}
                  wrongPairId={turn.wrongPairId}
                  seedKey={seedBase}
                  onPairAttempt={turn.attemptPair}
                />
              </div>
            </motion.div>
          )}

          {/* 2. SPEED ROUND (PHASE 2) */}
          {turn.phase === 'speed' && turn.currentQ && (
            <motion.div
              key={`speed-${turn.currentQ.id}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.2 }}
              className="h-full w-full flex flex-col justify-center"
            >
              <div className="text-center mb-1">
                <span className="text-xs font-mono text-pink-400 uppercase tracking-widest font-bold">
                  Rapid Retrieval: Tap the English word or press [1, 2, 3]
                </span>
              </div>

              <div className="flex-1 min-h-0 flex items-center justify-center">
                <FastVocabSpeedRound
                  question={turn.currentQ}
                  mode={mode}
                  qIndex={turn.qIdx}
                  qTotal={turn.speedQs.length}
                  selectedChoice={turn.selectedChoice}
                  revealCorrect={turn.revealCorrect}
                  wrongChoice={turn.wrongChoice}
                  eliminatedChoices={turn.eliminatedChoices}
                  locked={turn.selectedChoice !== null}
                  onChoose={turn.chooseAnswer}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── TURN-COMPLETE CELEBRATION POD (Stitch Screen 4) ── */}
      <AnimatePresence>
        {turn.phase === 'complete' && showSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md cursor-pointer"
            onClick={() => {
              setShowSummary(false);
              if (!state.quickWheelWinner && unitPairs.length > 0) {
                setTurnSummary(null);
                turnPointsRef.current = 0;
                setTurnPoints(0);
                winCuedRef.current = false;
                buildWave(cursorRef.current);
              } else {
                setTurnSummary(null);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 20 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="bg-[#0B132B]/95 border-2 border-emerald-400 rounded-3xl p-8 md:p-10 shadow-[0_0_50px_rgba(16,185,129,0.35)] flex flex-col items-center max-w-lg mx-4 text-center select-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-400 mb-3 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
                <Zap size={32} className="fill-current" />
              </div>

              <h2 className="text-3xl md:text-4xl font-black text-white mb-1 font-sans tracking-wide">
                {summaryName ? `${summaryName} Mastered It!` : 'Arena Complete!'}
              </h2>
              <p className="text-xs font-mono text-sky-400 uppercase tracking-wider mb-4">
                Lightning Recall Confirmed
              </p>

              {turnSummary && (
                <>
                  {/* Glowing 5-Star Sequence */}
                  <div className="flex gap-2.5 my-3">
                    {Array.from({ length: 5 }, (_, i) => (
                      <motion.span
                        key={i}
                        initial={{ scale: 0, rotate: -25 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{
                          delay: 0.15 + i * 0.15,
                          type: 'spring',
                          stiffness: 320,
                          damping: 16,
                        }}
                      >
                        <Star
                          size={34}
                          className={
                            i < stars
                              ? 'text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.8)]'
                              : 'text-slate-700'
                          }
                          fill={i < stars ? 'currentColor' : 'none'}
                          strokeWidth={2}
                        />
                      </motion.span>
                    ))}
                  </div>

                  {/* High-Impact Stat Tiles */}
                  <div className="grid grid-cols-3 gap-3 w-full my-4">
                    <div className="bg-[#0E1733] border border-[#1E2D5A] rounded-2xl p-3">
                      <p className="text-2xl font-black text-emerald-400 font-mono tabular-nums">
                        {turnPoints >= 0 ? '+' : ''}
                        {turnPoints}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                        Points Earned
                      </p>
                    </div>

                    <div className="bg-[#0E1733] border border-[#1E2D5A] rounded-2xl p-3">
                      <p className="text-2xl font-black text-amber-400 font-mono tabular-nums">
                        {turnSummary.bestStreak}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                        Best Streak
                      </p>
                    </div>

                    <div className="bg-[#0E1733] border border-[#1E2D5A] rounded-2xl p-3">
                      <p className="text-2xl font-black text-sky-400 font-mono tabular-nums">
                        {turnSummary.firstTryCorrect}/{turnSummary.totalInteractions}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                        First Try
                      </p>
                    </div>
                  </div>
                </>
              )}

              <p className="text-xs font-mono text-slate-400 mt-2 animate-pulse">
                {state.quickWheelWinner
                  ? 'Tap anywhere or spin next student on remote'
                  : 'Tap anywhere to start the next wave'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FOOTER BAR ── */}
      <footer className="w-full flex items-center justify-between px-3 py-1 bg-[#0B132B]/60 border border-[#1E2D5A]/50 rounded-xl text-xs font-mono text-slate-400 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>16:9 Projector Board · Optimal Legibility at 8m</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Shortcuts: [1, 2, 3] Answer Choice · [SPACE] Pronounce Word</span>
        </div>
      </footer>
    </div>
  );
};

export default BoardFastVocab;
