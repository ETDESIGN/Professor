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
import { Star, SpellCheck, Zap, Trophy } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useBoardPool } from '../useBoardPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { logAttempt } from './scoreAttempt';
import { playCue } from './playCue';
import { playAudioUrl } from '../../../services/SpeechService';
import { getVocabulary } from '../../../services/manifest';
import type { ContextualControlsSpec } from '../lessonDirector';
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
  playAudio: 'PLAY_AUDIO',
  addTime: 'ADD_TIME_10',
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
    playAudio:    { label: 'Audio', enabled: true, onTrigger: noop },
    addTime:      { label: '+10s', enabled: true, onTrigger: noop },
    revealHint:   { label: 'Hint', enabled: true, onTrigger: noop },
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
  // Default timer changed from 15s to 25s per owner feedback & audit §2/F4
  const TIMER_SECONDS = clampInt(data?.timerSeconds, 0, 120, 25);
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
      case 'PLAY_AUDIO':
        // audit F1 parity: remote audio replay (also serves as the Ready tap
        // during the presentation beat).
        if (turn.status === 'presenting') turn.beginTyping();
        else if (turn.currentWord) playAudioUrl(turn.currentWord.audioUrl, turn.currentWord.word).catch(() => {});
        break;
      case 'ADD_TIME_10':
        turn.addTime(10);
        break;
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

  // games-v3 audit F1: the presentation beat auto-plays the word ONCE (image +
  // audio together); replay stays a tap away on the word card.
  useEffect(() => {
    if (turn.status === 'presenting' && turn.currentWord) {
      playAudioUrl(turn.currentWord.audioUrl, turn.currentWord.word).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn.status, turn.wordIdx]);

  const wordProgress = turn.wordIdx + (turn.status === 'typing' ? 0 : 1);
  const hudProgress = Math.min(1, wordProgress / Math.max(1, turn.wordsTotal));
  const hudLabel = `Word ${Math.min(turn.wordIdx + 1, turn.wordsTotal)}/${turn.wordsTotal} — ${pickedStudent?.name ?? 'Practice'}`;
  const timed = TIMER_SECONDS > 0;

  const stars = turnSummary
    ? starsForRun(turnSummary.solved, turnSummary.attempted, turnMistakesRef.current)
    : 0;

  return (
    <div className="h-full w-full bg-[#070C18] text-white flex flex-col justify-between p-3 sm:p-5 font-display relative overflow-hidden select-none">
      {/* ── Stitch Stadium Header (Overscan Safe, pl-28 lg:pl-44) ── */}
      <header className="w-full flex items-center justify-between h-14 shrink-0 border-b border-slate-800/80 pb-2 pl-28 lg:pl-44 pr-2 gap-3 z-30">
        {/* Left Region: Phase Indicator + Title Cluster */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          {/* Phase Pill */}
          <div
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase border shadow-md shrink-0 ${
              turn.status === 'presenting'
                ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(0,255,204,0.3)]'
                : turn.status === 'typing'
                  ? 'bg-sky-950/80 border-sky-400 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                  : turn.status === 'solved'
                    ? 'bg-emerald-950/80 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                    : 'bg-amber-950/80 border-amber-400 text-amber-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                turn.status === 'presenting'
                  ? 'bg-cyan-400 animate-ping'
                  : turn.status === 'typing'
                    ? 'bg-sky-400 animate-pulse'
                    : turn.status === 'solved'
                      ? 'bg-emerald-400'
                      : 'bg-amber-400'
              }`}
            />
            <span>
              {turn.status === 'presenting'
                ? 'PHASE: LOOK & LISTEN'
                : turn.status === 'typing'
                  ? 'PHASE: SPELL IT'
                  : turn.status === 'solved'
                    ? 'PHASE: SOLVED!'
                    : 'PHASE: REVEALED'}
            </span>
          </div>

          {/* Title & Round badge */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="flex items-center gap-1.5 font-headline font-black text-lg text-white">
              <Zap size={18} className="text-amber-400 fill-amber-400" />
              <span>SPELLING BEE</span>
            </div>
            <span className="text-slate-600 font-bold">•</span>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-300 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
              Round {turn.wordIdx + 1} of {turn.wordsTotal}
            </span>
          </div>

          {/* Picked student turn pill */}
          <div className="flex items-center gap-2 bg-[#111C3D] px-3 py-1 rounded-full border border-cyan-500/40 text-xs font-mono shrink-0">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-bold text-white tracking-wide">
              {pickedStudent?.name ?? 'Class Practice'}
            </span>
          </div>

          {/* Streak pill */}
          {turn.streak >= 2 && (
            <div className="hidden md:flex items-center gap-1 bg-amber-950/50 border border-amber-400/50 px-2.5 py-1 rounded-full text-xs font-mono font-bold text-amber-300 shrink-0">
              <span>🔥</span>
              <span>{turn.streak} IN A ROW</span>
            </div>
          )}
        </div>

        {/* Right Corner Telemetry: Countdown Clock + +10s Button + Room Score */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Countdown Clock with +10s in-class adjust button */}
          {timed && (
            <div
              className={`flex items-center gap-2 px-3 py-1 rounded-xl border transition-all ${
                turn.timeRemaining <= 5 && turn.status === 'typing'
                  ? 'bg-rose-950/70 border-rose-500 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.4)] animate-pulse'
                  : 'bg-slate-800/80 border-slate-700 text-cyan-300'
              }`}
            >
              <span className="font-mono text-base sm:text-lg font-black tracking-wider">
                {turn.timeRemaining}s
              </span>
              {turn.status === 'typing' && (
                <button
                  type="button"
                  onClick={() => turn.addTime(10)}
                  className="px-2 py-0.5 bg-purple-900/60 hover:bg-purple-800 border border-purple-400/60 text-purple-200 rounded-md text-[11px] font-mono font-extrabold active:scale-95 transition-all cursor-pointer"
                  title="Grant +10 seconds"
                >
                  +10s
                </button>
              )}
            </div>
          )}

          {/* Score chip */}
          <div className="flex items-center gap-1.5 px-3.5 py-1 rounded-xl bg-slate-800/80 border border-slate-700 font-mono text-xs">
            <span className="text-slate-400 uppercase text-[11px]">SCORE</span>
            <span className="font-headline font-black text-sm text-emerald-400">
              {turnPoints >= 0 ? '+' : ''}{turnPoints} PTS
            </span>
          </div>
        </div>
      </header>

      {/* ── Main Stage ── */}
      <main className="flex-1 min-h-0 flex items-center justify-center my-auto w-full py-1">
        <AnimatePresence mode="wait">
          {turn.currentWord && turn.status !== 'complete' && (
            <motion.div
              key={`${turn.wordIdx}-${turn.currentWord.id}`}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ duration: 0.22 }}
              className="w-full flex justify-center"
            >
              <SpellingBeeStage
                word={turn.currentWord}
                typedCount={turn.typedCount}
                wrongLetter={turn.wrongLetter}
                removedKeys={turn.removedKeys}
                hintKey={turn.hintKey}
                status={turn.status}
                onReady={turn.beginTyping}
                onType={turn.typeLetter}
                onReplayAudio={() => playAudioUrl(turn.currentWord?.audioUrl, turn.currentWord?.word).catch(() => {})}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Screen 4: Cyber Victory Pod ── */}
      <AnimatePresence>
        {turn.status === 'complete' && showSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md cursor-pointer p-4 select-none"
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
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="bg-[#0B132B] border-2 border-cyan-500/40 rounded-3xl p-6 sm:p-10 shadow-[0_0_60px_rgba(0,255,204,0.25)] flex flex-col items-center max-w-lg w-full text-center relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Decorative ambient glow */}
              <div className="absolute -right-20 -top-20 w-56 h-56 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -left-20 -bottom-20 w-56 h-56 bg-pink-500/15 rounded-full blur-3xl pointer-events-none" />

              {/* Victory Trophy Icon */}
              <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-amber-400 shadow-[0_0_24px_rgba(245,158,11,0.4)] mb-3">
                <Trophy size={36} />
              </div>

              <h2 className="text-2xl sm:text-4xl font-black text-white font-headline tracking-wide mb-1">
                {summaryName ? `${summaryName} Nailed It!` : 'Spelling Complete!'}
              </h2>
              <p className="text-cyan-300 font-mono text-xs uppercase tracking-widest mb-4">
                Round Complete · Excellent Work!
              </p>

              {turnSummary && (
                <>
                  {/* Star tally (fills in sequence) */}
                  <div className="flex gap-2.5 my-4">
                    {Array.from({ length: 5 }, (_, i) => (
                      <motion.span
                        key={i}
                        initial={{ scale: 0, rotate: -30 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ delay: 0.2 + i * 0.15, type: 'spring', stiffness: 350, damping: 15 }}
                      >
                        <Star
                          size={36}
                          className={i < stars ? 'text-amber-400 drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]' : 'text-slate-700'}
                          fill={i < stars ? 'currentColor' : 'none'}
                          strokeWidth={2}
                        />
                      </motion.span>
                    ))}
                  </div>

                  {/* Stat Cards Grid */}
                  <div className="grid grid-cols-3 gap-3 w-full my-2">
                    <div className="bg-slate-900/80 border border-slate-700 rounded-2xl p-3 flex flex-col items-center">
                      <p className="text-2xl sm:text-3xl font-black text-emerald-400 tabular-nums font-headline">
                        {turnPoints >= 0 ? '+' : ''}{turnPoints}
                      </p>
                      <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mt-1">PTS EARNED</p>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-700 rounded-2xl p-3 flex flex-col items-center">
                      <p className="text-2xl sm:text-3xl font-black text-amber-400 tabular-nums font-headline">
                        {turnSummary.bestStreak} 🔥
                      </p>
                      <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mt-1">BEST STREAK</p>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-700 rounded-2xl p-3 flex flex-col items-center">
                      <p className="text-2xl sm:text-3xl font-black text-cyan-400 tabular-nums font-headline">
                        {turnSummary.solved}/{turnSummary.attempted}
                      </p>
                      <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mt-1">WORDS SPELLED</p>
                    </div>
                  </div>
                </>
              )}

              <p className="text-xs text-slate-400 mt-5 font-mono animate-pulse">
                {state.quickWheelWinner ? 'Tap screen or Next Student on remote' : 'Tap to continue'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BoardSpellingBee;
