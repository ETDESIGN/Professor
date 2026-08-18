// useFastVocabTurn — the shared Fast Vocab turn controller (one student's
// lightning turn: match wave → speed round → complete).
//
// Owns ALL game-feel state (selection resolution, matched pairs, mistake
// escalation, streak, speed state machine, timer) and emits result events;
// it NEVER writes scores. The two surfaces (board via SessionContext, solo
// via SoloSessionContext) implement the events with their own scoring.
//
// Escalation contract (BoardFlashMatch pattern): 1st miss on a pair glows the
// correct counterpart for 1.5s; 2nd miss reveals a micro-explanation card for
// 3s. Speed questions are single-shot (the timer IS the retry pressure).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FastVocabMode, FastVocabPair, FastVocabSpeedQ, FastVocabTurnSummary } from './types';
import { buildSpeedQuestions } from './contentBuilder';
import { makeRng } from '../../../services/seededRandom';
import { useFastVocabTimer } from './useFastVocabTimer';

export interface FastVocabMatchResult {
  correct: boolean;
  /** No prior mistake on this pair when the correct match landed. */
  firstTry: boolean;
  /** Wrong-attempt count on this pair AFTER the event. */
  missCount: number;
  /** Streak AFTER the event (bumped on correct, reset on wrong). */
  streak: number;
}

export interface FastVocabSpeedResult {
  correct: boolean;
  timedOut: boolean;
  firstTry: boolean;
  streak: number;
}

export interface FastVocabTurnEvents {
  onMatchResult: (pair: FastVocabPair, result: FastVocabMatchResult) => void;
  onSpeedResult: (q: FastVocabSpeedQ, result: FastVocabSpeedResult) => void;
  /** Fired once when both phases finish (natural completion only). */
  onComplete: (summary: FastVocabTurnSummary) => void;
}

export interface FastVocabTurnOptions {
  /** This turn's wave (3 pairs on the board config). Identity change = reset. */
  wavePairs: FastVocabPair[];
  /** Whole-unit pair list — speed-question distractor source. */
  poolPairs: FastVocabPair[];
  mode: FastVocabMode;
  /** Speed questions after the wave (default 2). */
  speedCount?: number;
  /** Seconds per speed question (default 10). */
  timeLimit?: number;
  /** FIXPLAN E1.6 — live surfaces pass the shared seed base (useSeedBase())
   *  so every tab composes identical speed questions; solo omits it and gets
   *  Math.random variety. */
  seedKey?: string;
  events: FastVocabTurnEvents;
}

export type FastVocabPhase = 'match' | 'speed' | 'complete';

export function useFastVocabTurn({
  wavePairs,
  poolPairs,
  mode,
  speedCount = 2,
  timeLimit = 10,
  seedKey,
  events,
}: FastVocabTurnOptions) {
  const eventsRef = useRef(events);
  eventsRef.current = events;

  const [phase, setPhase] = useState<FastVocabPhase>('match');
  const [matchedPairIds, setMatchedPairIds] = useState<string[]>([]);
  const [hintPairId, setHintPairId] = useState<string | null>(null);
  const [revealPair, setRevealPair] = useState<FastVocabPair | null>(null);
  const [wrongPairId, setWrongPairId] = useState<string | null>(null);

  const [qIdx, setQIdx] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [revealCorrect, setRevealCorrect] = useState(false);
  const [wrongChoice, setWrongChoice] = useState<number | null>(null);
  const [eliminatedChoices, setEliminatedChoices] = useState<number[]>([]);
  const [streak, setStreak] = useState(0);

  const mistakesByPairRef = useRef<Record<string, number>>({});
  const awardedPairsRef = useRef<Set<string>>(new Set());
  const streakRef = useRef(0);
  const bestStreakRef = useRef(0);
  const firstTryRef = useRef(0);
  const scoredInteractionsRef = useRef(0);
  const completedRef = useRef(false);
  /** Bumped on every reset so the timer re-arms even back at qIdx 0. */
  const turnKeyRef = useRef(0);
  const [turnKey, setTurnKey] = useState(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimeouts = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    timeoutsRef.current.push(setTimeout(fn, ms));
  };

  // ── Speed questions for this wave (learn→recall arc: same words). ────────
  const speedQs = useMemo(
    () => buildSpeedQuestions(
      wavePairs,
      poolPairs,
      mode,
      speedCount,
      seedKey ? makeRng(seedKey, wavePairs.map((p) => p.id).join('|'), 'speed') : Math.random,
    ),
    [wavePairs, poolPairs, mode, speedCount, seedKey],
  );
  const currentQ = speedQs[qIdx];

  // ── Full reset whenever a new wave is handed in (NEW_TURN / RESET_GAME /
  //    solo next wave). Also the manual reset entry point for surfaces. ─────
  const resetTurn = useCallback(() => {
    clearTimeouts();
    turnKeyRef.current += 1;
    setTurnKey(turnKeyRef.current);
    mistakesByPairRef.current = {};
    awardedPairsRef.current = new Set();
    streakRef.current = 0;
    bestStreakRef.current = 0;
    firstTryRef.current = 0;
    scoredInteractionsRef.current = 0;
    completedRef.current = false;
    setPhase('match');
    setMatchedPairIds([]);
    setHintPairId(null);
    setRevealPair(null);
    setWrongPairId(null);
    setQIdx(0);
    setSelectedChoice(null);
    setRevealCorrect(false);
    setWrongChoice(null);
    setEliminatedChoices([]);
    setStreak(0);
  }, []);

  useEffect(() => {
    resetTurn();
  }, [wavePairs, resetTurn]);

  useEffect(() => clearTimeouts, []);

  // ── Timer (speed phase only; paused while locked/revealing). ─────────────
  const handleExpire = useCallback(() => {
    if (phase !== 'speed' || !currentQ || revealCorrect) return;
    const q = currentQ;
    streakRef.current = 0;
    setStreak(0);
    setRevealCorrect(true);
    eventsRef.current.onSpeedResult(q, { correct: false, timedOut: true, firstTry: false, streak: 0 });
    scoredInteractionsRef.current += 1;
    later(advanceQuestion, 1800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentQ, revealCorrect]);

  const timeRemaining = useFastVocabTimer({
    seconds: timeLimit,
    running: phase === 'speed' && !revealCorrect && selectedChoice === null,
    onExpire: handleExpire,
    resetKey: `${turnKey}:${qIdx}`,
  });

  const locked = phase !== 'match' && phase !== 'speed';

  // ── Match phase ──────────────────────────────────────────────────────────
  const attemptPair = useCallback(
    (sourcePairId: string, targetPairId: string) => {
      if (phase !== 'match') return;
      const pair = wavePairs.find((p) => p.id === sourcePairId);
      if (!pair) return;
      const correct = sourcePairId === targetPairId && !matchedPairIds.includes(sourcePairId);
      if (!correct && matchedPairIds.includes(targetPairId)) return; // already-matched pods are inert

      if (correct) {
        if (awardedPairsRef.current.has(pair.id)) return; // duplicate guard
        awardedPairsRef.current.add(pair.id);
        const firstTry = (mistakesByPairRef.current[pair.id] ?? 0) === 0;
        if (firstTry) firstTryRef.current += 1;
        scoredInteractionsRef.current += 1;
        streakRef.current += 1;
        bestStreakRef.current = Math.max(bestStreakRef.current, streakRef.current);
        setStreak(streakRef.current);
        setMatchedPairIds((prev) => [...prev, pair.id]);
        setWrongPairId(null);
        eventsRef.current.onMatchResult(pair, {
          correct: true,
          firstTry,
          missCount: mistakesByPairRef.current[pair.id] ?? 0,
          streak: streakRef.current,
        });

        if (matchedPairIds.length + 1 >= wavePairs.length) {
          // Wave cleared → speed round after a short wipe.
          later(() => {
            setPhase('speed');
            setQIdx(0);
          }, 900);
        }
      } else {
        mistakesByPairRef.current[pair.id] = (mistakesByPairRef.current[pair.id] ?? 0) + 1;
        streakRef.current = 0;
        setStreak(0);
        scoredInteractionsRef.current += 1;
        setWrongPairId(targetPairId);
        later(() => setWrongPairId((w) => (w === targetPairId ? null : w)), 800);
        const missCount = mistakesByPairRef.current[pair.id];
        eventsRef.current.onMatchResult(pair, {
          correct: false,
          firstTry: false,
          missCount,
          streak: 0,
        });
        // Escalation: 1st miss glows the correct counterpart; 2nd reveals.
        if (missCount === 1) {
          setHintPairId(pair.id);
          later(() => setHintPairId((h) => (h === pair.id ? null : h)), 1500);
        } else if (missCount >= 2) {
          setRevealPair(pair);
          later(() => setRevealPair((r) => (r?.id === pair.id ? null : r)), 3000);
        }
      }
    },
    [phase, wavePairs, matchedPairIds],
  );

  // ── Speed phase ──────────────────────────────────────────────────────────
  function advanceQuestion() {
    setRevealCorrect(false);
    setSelectedChoice(null);
    setWrongChoice(null);
    setEliminatedChoices([]);
    if (qIdx + 1 >= speedQs.length) {
      finishTurn();
    } else {
      setQIdx((i) => i + 1);
    }
  }

  function finishTurn() {
    if (completedRef.current) return;
    completedRef.current = true;
    setPhase('complete');
    eventsRef.current.onComplete({
      firstTryCorrect: firstTryRef.current,
      totalInteractions: Math.max(1, scoredInteractionsRef.current),
      bestStreak: bestStreakRef.current,
    });
  }

  const chooseAnswer = useCallback(
    (idx: number) => {
      if (phase !== 'speed' || !currentQ || revealCorrect || selectedChoice !== null) return;
      const q = currentQ;
      const correct = idx === q.correctIndex;
      setSelectedChoice(idx);
      scoredInteractionsRef.current += 1;
      if (correct) {
        streakRef.current += 1;
        bestStreakRef.current = Math.max(bestStreakRef.current, streakRef.current);
        setStreak(streakRef.current);
        eventsRef.current.onSpeedResult(q, { correct: true, timedOut: false, firstTry: true, streak: streakRef.current });
        firstTryRef.current += 1;
        later(advanceQuestion, 900);
      } else {
        streakRef.current = 0;
        setStreak(0);
        setWrongChoice(idx);
        setRevealCorrect(true);
        eventsRef.current.onSpeedResult(q, { correct: false, timedOut: false, firstTry: false, streak: 0 });
        later(advanceQuestion, 1800);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, currentQ, revealCorrect, selectedChoice, qIdx, speedQs.length],
  );

  // ── Teacher/solo controls (remote actions + in-game buttons) ─────────────

  /** MARK_CORRECT: resolve the current interaction as a clean correct. */
  const forceCorrect = useCallback(() => {
    if (phase === 'match') {
      const pair = wavePairs.find((p) => !matchedPairIds.includes(p.id));
      if (!pair) return;
      attemptPair(pair.id, pair.id); // correct by construction
    } else if (phase === 'speed' && currentQ && !revealCorrect && selectedChoice === null) {
      const q = currentQ;
      setSelectedChoice(q.correctIndex);
      scoredInteractionsRef.current += 1;
      streakRef.current += 1;
      bestStreakRef.current = Math.max(bestStreakRef.current, streakRef.current);
      setStreak(streakRef.current);
      eventsRef.current.onSpeedResult(q, { correct: true, timedOut: false, firstTry: false, streak: streakRef.current });
      setRevealCorrect(true);
      later(advanceQuestion, 900);
    } else if (phase === 'speed' && currentQ && (revealCorrect || selectedChoice !== null)) {
      // Already answered (waiting on the hold) — just move on.
      advanceQuestion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, wavePairs, matchedPairIds, currentQ, revealCorrect, selectedChoice, attemptPair]);

  /** SKIP_ITEM: skip without scoring (first unmatched pair / current question). */
  const skip = useCallback(() => {
    if (phase === 'match') {
      const pair = wavePairs.find((p) => !matchedPairIds.includes(p.id));
      if (!pair) return;
      setMatchedPairIds((prev) => [...prev, pair.id]);
      if (matchedPairIds.length + 1 >= wavePairs.length) {
        later(() => {
          setPhase('speed');
          setQIdx(0);
        }, 900);
      }
    } else if (phase === 'speed') {
      advanceQuestion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, wavePairs, matchedPairIds, qIdx, speedQs.length]);

  /** REVEAL_HINT: glow the first unmatched pair's counterpart / eliminate a wrong choice. */
  const hint = useCallback(() => {
    if (phase === 'match') {
      const pair = wavePairs.find((p) => !matchedPairIds.includes(p.id));
      if (!pair) return;
      setHintPairId(pair.id);
      later(() => setHintPairId((h) => (h === pair.id ? null : h)), 1500);
    } else if (phase === 'speed' && currentQ && !revealCorrect) {
      const wrongs = currentQ.choices
        .map((_, i) => i)
        .filter((i) => i !== currentQ.correctIndex && !eliminatedChoices.includes(i));
      if (wrongs.length > 1) {
        setEliminatedChoices((prev) => [...prev, wrongs[0]]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, wavePairs, matchedPairIds, currentQ, revealCorrect, eliminatedChoices]);

  /** SLIDE_COMPLETE / forced end: settle into complete WITHOUT the natural summary. */
  const forceComplete = useCallback(() => {
    if (completedRef.current) {
      setPhase('complete');
      return;
    }
    completedRef.current = true;
    setPhase('complete');
  }, []);

  return {
    // phases
    phase,
    resetTurn,
    // match phase
    matchedPairIds,
    hintPairId,
    revealPair,
    wrongPairId,
    attemptPair,
    // speed phase
    speedQs,
    currentQ,
    qIdx,
    selectedChoice,
    revealCorrect,
    wrongChoice,
    eliminatedChoices,
    chooseAnswer,
    timeRemaining,
    timeLimit,
    locked,
    // streak (HUD)
    streak,
    // controls
    forceCorrect,
    skip,
    hint,
    forceComplete,
  };
}
