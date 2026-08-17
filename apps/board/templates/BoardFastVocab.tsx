// BoardFastVocab — two-phase vocabulary game (PRACTICE phase), live-board
// surface of the shared Fast Vocab engine (components/games/fastVocab).
//
// One lightning turn per picked student: a 3-pair match wave (hybrid
// tap-to-pair / drag-and-drop) followed by 2 timed speed-recall questions on
// the SAME words (learn → recall arc). All content comes from the unit pool
// (IMAGE_SELECT with MEANING_MATCH fallback via detectMode) — no frozen data.
//
// Lifecycle compliance (LIVE_GAME_LIFECYCLE §5):
//   1. NEW_TURN resets per-turn state keyed on currentTurnId — but NOT the
//      pool cursor: each student consumes the NEXT words (pool-coverage fix,
//      BoardVocabBlitz precedent). RESET_GAME rewinds the cursor to 0.
//   2. Mistake/award latching lives in the turn controller (awardedPairsRef,
//      mistakesByPairRef, one-shot speed answers).
//   3. Scoring gated on state.quickWheelWinner (choral mode = zero writes);
//      wrong = −MISTAKE_PENALTY live, correct = scoreForAttempt(0, difficulty,
//      1.0, streak), timeout = no penalty (clock-anxiety house rule). Every
//      scored event goes through logAttempt (analytics + FSRS + remediation).
//   4. Personalized completion overlay via usePickedStudent + turn stars.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCcw, Star, Zap } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
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
import {
  detectMode,
  buildUnitPairs,
  takeWave,
  starsFor,
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

// Lightning config (owner decision 2026-08-17): 3 pairs + 2 speed questions.
const WAVE_SIZE = 3;
const SPEED_COUNT = 2;
const SPEED_TIME_LIMIT = 10;

const BoardFastVocab = (_props: { data: any }) => {
  const { state, addPoints, pushToRemediation, triggerAction, triggerConfetti } = useSession();
  const pickedStudent = usePickedStudent();
  const unitId = state.activeUnit?.id || '';

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
  const [turnPoints, setTurnPoints] = useState(0);
  const turnPointsRef = useRef(0);
  const winCuedRef = useRef(false);

  const buildWave = useCallback(
    (fromCursor: number) => {
      const { wave, nextCursor } = takeWave(unitPairs, fromCursor, WAVE_SIZE);
      cursorRef.current = nextCursor;
      setWavePairs(wave);
    },
    [unitPairs],
  );

  // Initial wave once the pool resolves (also covers a turn that was picked
  // while the pool was still loading). Latched per unit: a mid-session unit
  // switch refetches the pool and must re-seed the wave from scratch.
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
        if (!picked) return; // choral/practice — game feel, zero writes
        if (r.correct) {
          const points = scoreForAttempt(0, pair.difficulty, 1.0, r.streak);
          addPoints(picked, points);
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
          addPoints(picked, -MISTAKE_PENALTY);
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
        if (r.correct) {
          const points = scoreForAttempt(0, q.difficulty, 1.0, r.streak);
          addPoints(picked, points);
          turnPointsRef.current += points;
          setTurnPoints(turnPointsRef.current);
        } else if (!r.timedOut) {
          // Timeout costs nothing (clock-anxiety rule) — a wrong click does.
          addPoints(picked, -MISTAKE_PENALTY);
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
        setTurnSummary(summary);
        if (!winCuedRef.current) {
          winCuedRef.current = true;
          playCue('win');
          triggerConfetti();
        }
        triggerAction('SLIDE_COMPLETE', { forced: false });
      },
    }),
    // Events are held in a ref by the controller; identities may be stale
    // without affecting behavior because every dependency is read from the
    // latest render closure via the controller's ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.quickWheelWinner, state.students, state.activeClassId, unitId, addPoints, pushToRemediation, triggerAction, triggerConfetti],
  );

  const turn = useFastVocabTurn({
    wavePairs,
    poolPairs: unitPairs,
    mode,
    speedCount: SPEED_COUNT,
    timeLimit: SPEED_TIME_LIMIT,
    events,
  });

  // ── Lifecycle: NEW_TURN (keyed on currentTurnId, never lastAction) ──────
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return; // choral mode keeps the board as-is
    turnPointsRef.current = 0;
    setTurnPoints(0);
    setTurnSummary(null);
    winCuedRef.current = false;
    if (unitPairs.length > 0) buildWave(cursorRef.current); // next words, NOT q0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId]);

  // ── Remote / commander controls (same strings the emitters use) ─────────
  useEffect(() => {
    const action = state.lastAction;
    if (!action) return;
    switch (action.type) {
      case 'RESET_GAME': {
        turnPointsRef.current = 0;
        setTurnPoints(0);
        setTurnSummary(null);
        winCuedRef.current = false;
        cursorRef.current = 0; // full restart → wave 0 for the whole slide
        if (unitPairs.length > 0) buildWave(0);
        break;
      }
      case 'SKIP_ITEM':
        turn.skip();
        break;
      case 'REVEAL_HINT':
        turn.hint();
        break;
      case 'MARK_CORRECT':
        turn.forceCorrect();
        break;
      case 'SLIDE_COMPLETE': {
        // Teacher-forced end settles silently (nothing to celebrate); the
        // natural-completion echo is already latched via winCuedRef.
        turn.forceComplete();
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // ── Empty pool state ────────────────────────────────────────────────────
  if (loading || (unitPairs.length === 0 && wavePairs.length === 0)) {
    if (!loading && unitPairs.length === 0) {
      return (
        <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-white text-center px-8">
          <h2 className="text-4xl font-bold text-slate-500 mb-2">Fast Vocab</h2>
          <p className="text-slate-600 text-xl">Content isn't ready for this round yet.</p>
          <button
            onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })}
            className="mt-6 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-white"
          >
            Skip Round
          </button>
        </div>
      );
    }
    return (
      <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-white">
        <h2 className="text-4xl font-bold text-slate-500 mb-2">Fast Vocab</h2>
        <p className="text-slate-600 text-xl">Loading…</p>
      </div>
    );
  }

  const matchProgress = turn.phase === 'match'
    ? turn.matchedPairIds.length / Math.max(1, wavePairs.length)
    : 1;
  const hudProgress = turn.phase === 'match'
    ? matchProgress * 0.6
    : 0.6 + (turn.qIdx / Math.max(1, turn.speedQs.length)) * 0.4;
  const hudLabel =
    turn.phase === 'match'
      ? `Match ${turn.matchedPairIds.length}/${wavePairs.length} — ${pickedStudent?.name ?? 'Practice'}`
      : turn.phase === 'speed'
        ? `Speed ${turn.qIdx + 1}/${turn.speedQs.length} — ${pickedStudent?.name ?? 'Practice'}`
        : 'Complete';

  const stars = turnSummary ? starsFor(turnSummary.firstTryCorrect, turnSummary.totalInteractions) : 0;

  return (
    <div className="h-full bg-slate-900 flex flex-col p-6 md:p-8 font-display relative overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 gap-4">
        <div className="bg-white/10 px-5 py-2.5 rounded-2xl flex items-center gap-3 border border-white/10">
          <div className="w-11 h-11 bg-amber-500 rounded-xl flex items-center justify-center text-white">
            <Zap size={22} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white leading-tight">Fast Vocab</h1>
            <p className="text-slate-400 text-xs md:text-sm">
              {mode === 'image' ? 'Image Match' : 'Meaning Match'} · tap or drag to pair, then speed recall
            </p>
          </div>
        </div>
        <button
          onClick={() => triggerAction('RESET_GAME')}
          className="p-3 bg-slate-800 rounded-xl text-slate-400 hover:bg-slate-700 hover:text-white shrink-0"
          title="Reset (Rewinds the word queue to the start)"
        >
          <RefreshCcw />
        </button>
      </div>

      {/* HUD */}
      <div className="mb-4">
        <FastVocabHud
          score={turnPoints}
          streak={turn.streak}
          progressLabel={hudLabel}
          progress={hudProgress}
          timeRemaining={turn.phase === 'speed' ? turn.timeRemaining : undefined}
          timeLimit={turn.phase === 'speed' ? turn.timeLimit : undefined}
        />
      </div>

      {/* Stage */}
      <div className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait">
          {turn.phase === 'match' && (
            <motion.div
              key={`match-${wavePairs.map((p) => p.id).join(',')}`}
              initial={{ opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -80 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0"
            >
              <FastVocabMatchWave
                pairs={wavePairs}
                mode={mode}
                matchedPairIds={turn.matchedPairIds}
                hintPairId={turn.hintPairId}
                revealPair={turn.revealPair}
                wrongPairId={turn.wrongPairId}
                onPairAttempt={turn.attemptPair}
              />
            </motion.div>
          )}
          {turn.phase === 'speed' && turn.currentQ && (
            <motion.div
              key={`speed-${turn.currentQ.id}`}
              initial={{ opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -80 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0"
            >
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Turn-complete overlay */}
      <AnimatePresence>
        {turn.phase === 'complete' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer"
            onClick={() => {
              // Choral practice: clicking rolls straight into the next wave.
              // Picked mode: dismiss (the teacher's Next Student rebuilds).
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
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="bg-white p-8 md:p-12 rounded-[3rem] shadow-2xl flex flex-col items-center max-w-lg mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-3xl md:text-5xl font-black text-slate-800 mb-2 text-center">
                {pickedStudent ? `${pickedStudent.name} nailed it!` : 'Complete!'}
              </h2>

              {turnSummary && (
                <>
                  {/* Star tally (fills in sequence) */}
                  <div className="flex gap-2 my-5">
                    {Array.from({ length: 5 }, (_, i) => (
                      <motion.span
                        key={i}
                        initial={{ scale: 0, rotate: -30 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ delay: 0.25 + i * 0.22, type: 'spring', stiffness: 300, damping: 15 }}
                      >
                        <Star
                          size={36}
                          className={i < stars ? 'text-amber-400' : 'text-slate-200'}
                          fill={i < stars ? 'currentColor' : 'none'}
                          strokeWidth={2}
                        />
                      </motion.span>
                    ))}
                  </div>
                  <div className="flex gap-6 text-center">
                    <div>
                      <p className="text-3xl font-black text-emerald-500 tabular-nums">
                        {turnPoints >= 0 ? '+' : ''}{turnPoints}
                      </p>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">pts this turn</p>
                    </div>
                    <div>
                      <p className="text-3xl font-black text-orange-400 tabular-nums">{turnSummary.bestStreak}</p>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">best streak</p>
                    </div>
                    <div>
                      <p className="text-3xl font-black text-indigo-500 tabular-nums">
                        {turnSummary.firstTryCorrect}/{turnSummary.totalInteractions}
                      </p>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">first try</p>
                    </div>
                  </div>
                </>
              )}
              <p className="text-sm text-slate-400 mt-6 animate-pulse">
                {state.quickWheelWinner ? 'tap to dismiss — Next Student for a new wave' : 'tap for the next wave'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes fv-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-fv-shake { animation: fv-shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
};

export default BoardFastVocab;
