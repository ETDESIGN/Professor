// BoardSpellingBee — letter-by-letter spelling shell (PRACTICE phase), live-
// board surface of the shared Spelling Bee engine
// (components/games/spellingBee).
//
// One lightning turn per picked student: spell N words (default 3) letter by
// letter on the on-screen QWERTY under a per-word countdown, with the
// original game's adaptive scaffolding — wrong keys drop off the keyboard as
// the clock burns and mistakes mount (never a letter the word still needs).
//
// Adapted from the solo original (Gemini spec) to the classroom loop:
//   • "Category select" → the unit's pool (3-tier: pool_items →
//     vocabulary_items → frozen data.words; the de-facto production source
//     is vocabulary_items until pools are generated).
//   • Wrong letter → the original's −1 time unit (inside the engine's clock)
//     PLUS the unified −MISTAKE_PENALTY point write when a student is picked.
//   • Timeout → REVEAL + advance, never a penalty (clock-anxiety house
//     rule); the solo surface is the one that ends the run on timeout.
//   • Word score → scoreForAttempt(mistakes, difficulty, streak) + 1 speed
//     bonus at ≥50% clock left (the original's remaining-time points,
//     rescaled into the unified 1–5 economy).
//
// Lifecycle compliance (LIVE_GAME_LIFECYCLE §5): NEW_TURN resets per-turn
// state keyed on currentTurnId but NOT the pool cursor (each student consumes
// the NEXT words — BoardFastVocab precedent); RESET_GAME rewinds to 0. All
// scoring gated on state.quickWheelWinner (choral/practice = zero writes).
// Every scored word goes through logAttempt (analytics + FSRS + remediation).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCcw, Star, SpellCheck } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useBoardPool } from '../useBoardPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { logAttempt } from './scoreAttempt';
import { playCue } from './playCue';
import { playAudioUrl } from '../../../services/SpeechService';
import { getVocabulary } from '../../../services/manifest';
import type { ContextualControlsSpec } from '../lessonDirector';
import FastVocabHud from '../../../components/games/fastVocab/FastVocabHud';
import SpellingBeeStage from '../../../components/games/spellingBee/SpellingBeeStage';
import { useSpellingBeeTurn } from '../../../components/games/spellingBee/useSpellingBeeTurn';
import {
  poolToWords,
  vocabularyToWords,
  frozenToWords,
  takeWave,
  starsForRun,
} from '../../../components/games/spellingBee/contentBuilder';
import type {
  SpellingBeeTurnSummary,
  SpellingBeeWord,
  SpellingBeeWordResult,
} from '../../../components/games/spellingBee/types';

// ── Config (flow block data via the Plan Composer inspector) ────────────────
const clampInt = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.round(n)));
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Contextual controls contract (same strings the emitters use) ───────────
export const SPELLING_BEE_ACTION_TYPES = {
  hint: 'REVEAL_HINT',
  forceCorrect: 'MARK_CORRECT',
  skip: 'SKIP_ITEM',
  reset: 'RESET_GAME',
  endSlide: 'SLIDE_COMPLETE',
} as const;

const noop = () => {};
export const SPELLING_BEE_CONTROLS: ContextualControlsSpec = {
  shellType: 'SPELLING_BEE',
  controls: {
    revealHint:   { label: 'Hint', enabled: true, onTrigger: noop }, // sheds 3 distractor keys / pulses the next letter
    forceCorrect: { label: 'Mark Correct', enabled: true, onTrigger: noop },
    skip:         { label: 'Skip Word', enabled: true, onTrigger: noop },
    endSlide:     { label: 'End', enabled: true, onTrigger: noop },
  },
};

const BoardSpellingBee = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation, triggerAction, triggerConfetti } = useSession();
  const pickedStudent = usePickedStudent();
  const unitId = state.activeUnit?.id || '';

  const WORDS_PER_TURN = clampInt(data?.wordsPerTurn, 1, 10, 3);
  const TIMER_SECONDS = clampInt(data?.timerSeconds, 0, 120, 15);
  const LETTER_REMOVAL = data?.letterRemoval !== false;

  // ── Content: pool_items → vocabulary_items → frozen data.words ───────────
  const [poolRefresh, setPoolRefresh] = useState(0);
  const { items: poolItems, loading, error: poolError } = useBoardPool({
    unitId,
    exerciseTypes: ['IMAGE_SELECT', 'MEANING_MATCH', 'DICTATION'],
    refreshKey: poolRefresh,
  });
  const poolWords = useMemo(() => poolToWords(poolItems), [poolItems]);
  const vocabWords = useMemo(
    () => (poolWords.length > 0 ? [] : vocabularyToWords(getVocabulary(state.activeUnit?.manifest))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unitId, poolWords.length],
  );
  const frozenWords = useMemo(() => frozenToWords(Array.isArray(data?.words) ? data.words : []), [data?.words]);
  const allWords: SpellingBeeWord[] = poolWords.length > 0 ? poolWords : vocabWords.length > 0 ? vocabWords : frozenWords;

  // ── Wave cursor (NOT reset per turn — pool coverage) ─────────────────────
  const cursorRef = useRef(0);
  const [waveWords, setWaveWords] = useState<SpellingBeeWord[]>([]);
  const [turnSummary, setTurnSummary] = useState<SpellingBeeTurnSummary | null>(null);
  // The score screen must show the student who JUST played, frozen at
  // completion — never the live pickedStudent (which flips to the next kid
  // on NEW_TURN while the engine's reset chain is still tearing down).
  const [showSummary, setShowSummary] = useState(false);
  const [summaryName, setSummaryName] = useState<string | null>(null);
  const [turnPoints, setTurnPoints] = useState(0);
  const turnPointsRef = useRef(0);
  const turnMistakesRef = useRef(0);
  const winCuedRef = useRef(false);
  // Who this wave was dealt to, frozen at deal time — onComplete must never
  // read the live pickedStudent (which flips to the NEXT kid if the teacher
  // taps Next Student while the last word's hold is still running).
  const turnOwnerNameRef = useRef<string | null>(null);

  const buildWave = useCallback(
    (fromCursor: number) => {
      const { wave, nextCursor } = takeWave(allWords, fromCursor, WORDS_PER_TURN);
      cursorRef.current = nextCursor;
      setWaveWords(wave);
    },
    [allWords, WORDS_PER_TURN],
  );

  // Initial wave once content resolves; latched per unit (a mid-session unit
  // switch refetches and must re-seed from scratch).
  const seededUnitRef = useRef<string | null>(null);
  useEffect(() => {
    if (allWords.length > 0 && seededUnitRef.current !== unitId) {
      seededUnitRef.current = unitId;
      cursorRef.current = 0;
      turnPointsRef.current = 0;
      setTurnPoints(0);
      setTurnSummary(null);
      turnMistakesRef.current = 0;
      winCuedRef.current = false;
      turnOwnerNameRef.current = pickedStudent?.name ?? null;
      buildWave(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, allWords, buildWave]);

  // ── Turn controller (engine) ─────────────────────────────────────────────
  const events = useMemo(
    () => ({
      onWrongLetter: (word: SpellingBeeWord) => {
        playCue('wrong');
        turnMistakesRef.current += 1;
        const picked = state.quickWheelWinner;
        if (!picked) return; // choral/practice — game feel, zero writes
        addPoints(picked, -MISTAKE_PENALTY);
        turnPointsRef.current -= MISTAKE_PENALTY;
        setTurnPoints(turnPointsRef.current);
        // No analytics/FSRS write here: attempts are logged per WORD (in
        // onWordResult, carrying the mistake count) — per-letter writes
        // flooded remediation and skewed mastery for struggling spellers.
      },
      onWordResult: (r: SpellingBeeWordResult) => {
        if (r.solved) {
          playCue('correct');
          if (r.streak === 3 || r.streak === 5) {
            playCue('streak');
            triggerConfetti();
          }
          playAudioUrl(r.word.audioUrl, r.word.word).catch(() => {});
          const picked = state.quickWheelWinner;
          if (picked) {
            const base = scoreForAttempt(r.mistakes, r.word.difficulty, 1.0, r.streak);
            const speedBonus = r.timeFrac >= 0.5 ? 1 : 0;
            const points = Math.min(5, base + speedBonus);
            addPoints(picked, points);
            turnPointsRef.current += points;
            setTurnPoints(turnPointsRef.current);
            logAttempt({
              state,
              picked,
              unitId,
              objectiveId: UUID_RE.test(r.word.objectiveId) ? r.word.objectiveId : undefined,
              exerciseType: r.word.exerciseType,
              difficulty: r.word.difficulty,
              correctness: 'correct',
              modality: 'productive',
              pushToRemediation,
            });
          }
        } else if (r.timedOut) {
          // Clock-anxiety rule: a timeout reveals and costs nothing.
          playCue('reveal');
          playAudioUrl(r.word.audioUrl, r.word.word).catch(() => {});
          const picked = state.quickWheelWinner;
          if (picked) {
            logAttempt({
              state,
              picked,
              unitId,
              objectiveId: UUID_RE.test(r.word.objectiveId) ? r.word.objectiveId : undefined,
              exerciseType: r.word.exerciseType,
              difficulty: r.word.difficulty,
              correctness: 'incorrect',
              correct: false,
              modality: 'productive',
              pushToRemediation,
            });
          }
        }
        // skipped → teacher's call, never scored (BoardFastVocab skip contract)
      },
      onComplete: (summary: SpellingBeeTurnSummary) => {
        setTurnSummary(summary);
        setShowSummary(true);
        setSummaryName(turnOwnerNameRef.current ?? pickedStudent?.name ?? null);
        if (!winCuedRef.current) {
          winCuedRef.current = true;
          playCue('win');
          triggerConfetti();
        }
        triggerAction('SLIDE_COMPLETE', { forced: false });
      },
    }),
    // Events are held in a ref by the controller; identities may be stale
    // without affecting behavior (every dependency is read from the latest
    // render closure via the controller's refs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.quickWheelWinner, state.students, state.activeClassId, unitId, addPoints, pushToRemediation, triggerAction, triggerConfetti],
  );

  const turn = useSpellingBeeTurn({
    waveWords,
    settings: { timerSeconds: TIMER_SECONDS, letterRemoval: LETTER_REMOVAL },
    events,
    seedKey: unitId,
    // Freeze gameplay while the wheel overlay is up: quickWheelWinner already
    // points at the INCOMING student during the 2.5s spin, and the overlay is
    // pointer-events-none — without this, taps/timeouts in that window charge
    // the wrong kid.
    paused: state.activeOverlay === 'QUICK_WHEEL',
  });

  // ── Lifecycle: NEW_TURN (keyed on currentTurnId, never lastAction) ──────
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return; // choral mode keeps the board as-is
    turnPointsRef.current = 0;
    setTurnPoints(0);
    setTurnSummary(null);
    setShowSummary(false); // drop the previous turn's score screen instantly
    turnMistakesRef.current = 0;
    winCuedRef.current = false;
    turnOwnerNameRef.current = pickedStudent?.name ?? null; // freeze this wave's owner
    if (allWords.length > 0) buildWave(cursorRef.current); // next words, NOT word 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId]);

  // ── Remote / commander controls (same strings the emitters use) ─────────
  useEffect(() => {
    const action = state.lastAction;
    if (!action) return;
    switch (action.type) {
      case 'SPIN_WHEEL':
      case 'CLEAR_RESPONDER':
      case 'GAME_WIN':
        // The teacher started the Next-Student cycle — hide the previous
        // turn's score screen right away (the wheel overlay takes it from
        // here) so the new student's name never lands on the old screen.
        setShowSummary(false);
        break;
      case 'RESET_GAME': {
        turnPointsRef.current = 0;
        setTurnPoints(0);
        setTurnSummary(null);
        setShowSummary(false);
        turnMistakesRef.current = 0;
        winCuedRef.current = false;
        cursorRef.current = 0; // full restart → wave 0 for the whole slide
        if (allWords.length > 0) buildWave(0);
        break;
      }
      case 'SKIP_ITEM':
        playCue('reveal');
        turn.skip();
        break;
      case 'REVEAL_HINT':
        playCue('reveal');
        turn.hint();
        break;
      case 'MARK_CORRECT':
        turn.forceCorrect();
        break;
      case 'SLIDE_COMPLETE': {
        // Teacher-forced end settles silently; the natural-completion echo is
        // already latched via winCuedRef.
        turn.forceComplete();
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // ── Empty pool state ────────────────────────────────────────────────────
  if (loading || (allWords.length === 0 && waveWords.length === 0)) {
    if (!loading && allWords.length === 0) {
      const fetchFailed = poolError && poolWords.length === 0;
      return (
        <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-white text-center px-8">
          <h2 className="text-4xl font-bold text-slate-500 mb-2">Spelling Bee</h2>
          <p className="text-slate-600 text-xl max-w-xl">
            {fetchFailed
              ? "Couldn't load the words — check the connection and retry."
              : 'This unit has no vocabulary words yet. Add vocabulary (or generate the exercise pool) first.'}
          </p>
          <div className="mt-6 flex gap-3">
            {fetchFailed && (
              <button
                onClick={() => setPoolRefresh((k) => k + 1)}
                className="px-6 py-3 bg-amber-600 hover:bg-amber-500 rounded-xl font-bold text-white"
              >
                Retry
              </button>
            )}
            <button
              onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-white"
            >
              Skip Round
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-white">
        <h2 className="text-4xl font-bold text-slate-500 mb-2">Spelling Bee</h2>
        <p className="text-slate-600 text-xl">Loading…</p>
      </div>
    );
  }

  const wordProgress = turn.wordIdx + (turn.status === 'typing' ? 0 : 1);
  const hudProgress = Math.min(1, wordProgress / Math.max(1, turn.wordsTotal));
  const hudLabel = `Word ${Math.min(turn.wordIdx + 1, turn.wordsTotal)}/${turn.wordsTotal} — ${pickedStudent?.name ?? 'Practice'}`;
  const timed = TIMER_SECONDS > 0;

  const stars = turnSummary
    ? starsForRun(turnSummary.solved, turnSummary.attempted, turnMistakesRef.current)
    : 0;

  return (
    <div className="h-full bg-slate-900 flex flex-col p-6 md:p-8 font-display relative overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 gap-4">
        <div className="bg-white/10 px-5 py-2.5 rounded-2xl flex items-center gap-3 border border-white/10">
          <div className="w-11 h-11 bg-amber-500 rounded-xl flex items-center justify-center text-white">
            <SpellCheck size={22} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white leading-tight">Spelling Bee</h1>
            <p className="text-slate-400 text-xs md:text-sm">
              {WORDS_PER_TURN} words per turn{timed ? ` · ${TIMER_SECONDS}s per word` : ' · untimed'}
              {LETTER_REMOVAL ? ' · keys drop as you go' : ''}
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
          timeRemaining={timed && turn.status === 'typing' ? turn.timeRemaining : undefined}
          timeLimit={timed ? TIMER_SECONDS : undefined}
        />
      </div>

      {/* Stage */}
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {turn.currentWord && turn.status !== 'complete' && (
            <motion.div
              key={`${turn.wordIdx}-${turn.currentWord.id}`}
              initial={{ opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -80 }}
              transition={{ duration: 0.25 }}
              className="w-full"
            >
              <SpellingBeeStage
                word={turn.currentWord}
                typedCount={turn.typedCount}
                wrongLetter={turn.wrongLetter}
                removedKeys={turn.removedKeys}
                hintKey={turn.hintKey}
                status={turn.status}
                onType={turn.typeLetter}
                onReplayAudio={() => playAudioUrl(turn.currentWord?.audioUrl, turn.currentWord?.word).catch(() => {})}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Turn-complete overlay */}
      <AnimatePresence>
        {turn.status === 'complete' && showSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer"
            onClick={() => {
              setShowSummary(false);
              // Choral practice: clicking rolls straight into the next wave.
              // Picked mode: dismiss (the teacher's Next Student rebuilds).
              if (!state.quickWheelWinner && allWords.length > 0) {
                setTurnSummary(null);
                turnPointsRef.current = 0;
                setTurnPoints(0);
                turnMistakesRef.current = 0;
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
                {summaryName ? `${summaryName} nailed it!` : 'Complete!'}
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
                        {turnSummary.solved}/{turnSummary.attempted}
                      </p>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">words spelled</p>
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
    </div>
  );
};

export default BoardSpellingBee;
