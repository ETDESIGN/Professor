// useSpellingBeeTurn — the shared Spelling Bee turn controller (one wave of
// words: type each word letter-by-letter → resolve → advance).
//
// Owns ALL game-feel state (cursor, wrong-letter flashes, per-word countdown,
// adaptive keyboard narrowing, streak) and emits result events; it NEVER
// writes scores. The two surfaces (board via SessionContext, solo via local
// score + Gamification) implement the events with their own scoring.
//
// Surface contract for the events:
//   • onWrongLetter — the original's −1 time unit already happened inside the
//     clock (penalize); the surface adds its own point penalty if any.
//   • onWordResult(timedOut) — the SPLIT fail rule lives at the surface:
//     the board reveals + advances (clock-anxiety rule, no penalty), solo
//     ends the run.
//   • onComplete — natural completion only (all words resolved); a teacher
//     SLIDE_COMPLETE goes through forceComplete() which never fires it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  SpellingBeeSettings,
  SpellingBeeTurnEvents,
  SpellingBeeTurnSummary,
  SpellingBeeWord,
  SpellingBeeWordResult,
} from './types';
import { useSpellingBeeClock } from './useSpellingBeeClock';
import { computeRemovedKeys, hintKeyFor, hashString, mulberry32 } from './keyboardEngine';

export interface SpellingBeeTurnOptions {
  /** This turn's words (identity change = full reset, like FastVocab's wave). */
  waveWords: SpellingBeeWord[];
  settings: SpellingBeeSettings;
  events: SpellingBeeTurnEvents;
  /** Extra seed space for the keyboard-removal rng (unit id upstream). */
  seedKey?: string;
}

export type SpellingBeeStatus = 'typing' | 'solved' | 'revealed' | 'complete';

const SOLVE_HOLD_MS = 900;
const REVEAL_HOLD_MS = 1600;
const WRONG_FLASH_MS = 600;
const HINT_PULSE_MS = 2500;

export function useSpellingBeeTurn({ waveWords, settings, events, seedKey = '' }: SpellingBeeTurnOptions) {
  const eventsRef = useRef(events);
  eventsRef.current = events;

  const [status, setStatus] = useState<SpellingBeeStatus>('typing');
  const [wordIdx, setWordIdx] = useState(0);
  const [typedCount, setTypedCount] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hintCount, setHintCount] = useState(0);
  const [wrongLetter, setWrongLetter] = useState<string | null>(null);
  const [removedKeys, setRemovedKeys] = useState<ReadonlySet<string>>(new Set());
  const [hintKey, setHintKey] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  /** Bumped on every reset so the clock re-arms even back at wordIdx 0. */
  const turnKeyRef = useRef(0);
  const [turnKey, setTurnKey] = useState(0);

  // Per-word refs (mirrors for synchronous reads inside stable callbacks).
  const mistakesRef = useRef(0);
  const resolvedRef = useRef(false);
  const streakRef = useRef(0);
  const bestStreakRef = useRef(0);
  const solvedCountRef = useRef(0);
  const attemptedRef = useRef(0);
  const firstTryRef = useRef(0);
  const completedRef = useRef(false);
  const timeRemainingRef = useRef(settings.timerSeconds);
  const waveWordsRef = useRef(waveWords);
  waveWordsRef.current = waveWords;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const statusRef = useRef<SpellingBeeStatus>(status);
  statusRef.current = status;
  const wordIdxRef = useRef(wordIdx);
  wordIdxRef.current = wordIdx;
  const typedCountRef = useRef(typedCount);
  typedCountRef.current = typedCount;
  const removedKeysRef = useRef<ReadonlySet<string>>(removedKeys);
  removedKeysRef.current = removedKeys;

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimeouts = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    timeoutsRef.current.push(setTimeout(fn, ms));
  };

  const currentWord = waveWords[wordIdx];
  const currentWordId = currentWord?.id ?? '';

  // ── Per-word countdown ───────────────────────────────────────────────────
  const handleExpire = useCallback(() => {
    if (statusRef.current !== 'typing') return;
    resolveWord({ solved: false, timedOut: true });
    // Everything resolveWord reads lives in refs (deps [] keeps the clock's
    // onExpire stable, mirroring the useFastVocabTimer contract).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const clock = useSpellingBeeClock({
    seconds: settings.timerSeconds,
    running: status === 'typing',
    onExpire: handleExpire,
    resetKey: `${turnKey}:${wordIdx}:${currentWordId}`,
  });
  timeRemainingRef.current = clock.timeRemaining;

  // ── Word resolution (solved / timeout / skip / force) ────────────────────
  function resolveWord(opts: { solved: boolean; timedOut?: boolean; forced?: boolean; skipped?: boolean }) {
    if (statusRef.current === 'complete') return;
    const word = waveWordsRef.current[wordIdxRef.current];
    if (!word || resolvedRef.current) return;
    resolvedRef.current = true;

    const cfg = settingsRef.current;
    const wordMistakes = mistakesRef.current;
    const timed = cfg.timerSeconds > 0;
    const timeFrac = timed ? Math.max(0, Math.min(1, timeRemainingRef.current / cfg.timerSeconds)) : 1;
    const forced = !!opts.forced;
    const skipped = !!opts.skipped;
    const timedOut = !!opts.timedOut;

    attemptedRef.current += 1;
    let firstTry = false;
    if (opts.solved) {
      streakRef.current += 1;
      bestStreakRef.current = Math.max(bestStreakRef.current, streakRef.current);
      solvedCountRef.current += 1;
      firstTry = wordMistakes === 0 && !forced;
      if (firstTry) firstTryRef.current += 1;
    } else {
      streakRef.current = 0;
    }
    setStreak(streakRef.current);
    setStatus(opts.solved ? 'solved' : 'revealed');

    eventsRef.current.onWordResult({
      word,
      solved: opts.solved,
      timedOut,
      forced,
      skipped,
      mistakes: wordMistakes,
      timeFrac,
      firstTry,
      streak: streakRef.current,
    });

    later(advance, opts.solved ? SOLVE_HOLD_MS : REVEAL_HOLD_MS);
  }

  function advance() {
    clearTimeouts();
    setWrongLetter(null);
    setHintKey(null);
    setTypedCount(0);
    setMistakes(0);
    mistakesRef.current = 0;
    setHintCount(0);
    resolvedRef.current = false;
    setRemovedKeys(new Set());

    const next = wordIdxRef.current + 1;
    if (next >= waveWordsRef.current.length) {
      finishTurn();
    } else {
      setStatus('typing');
      setWordIdx(next);
      wordIdxRef.current = next;
    }
  }

  function finishTurn() {
    if (completedRef.current) return;
    completedRef.current = true;
    setStatus('complete');
    eventsRef.current.onComplete({
      solved: solvedCountRef.current,
      attempted: attemptedRef.current,
      bestStreak: bestStreakRef.current,
      firstTry: firstTryRef.current,
    });
  }

  // ── Typing ────────────────────────────────────────────────────────────────
  const typeLetter = useCallback(
    (ch: string) => {
      if (statusRef.current !== 'typing') return;
      const word = waveWordsRef.current[wordIdxRef.current];
      if (!word) return;
      const letter = ch.toUpperCase();
      if (!/^[A-Z]$/.test(letter)) return;
      if (removedKeysRef.current.has(letter)) return; // shed keys are inert

      const expected = word.letters[typedCountRef.current];
      if (letter === expected) {
        const next = typedCountRef.current + 1;
        typedCountRef.current = next;
        setTypedCount(next);
        setWrongLetter(null);
        if (next >= word.letters.length) {
          resolveWord({ solved: true });
        }
      } else {
        mistakesRef.current += 1;
        setMistakes(mistakesRef.current);
        streakRef.current = 0;
        setStreak(0);
        setWrongLetter(letter);
        later(() => setWrongLetter((w) => (w === letter ? null : w)), WRONG_FLASH_MS);
        clock.penalize(); // the original's −1 time unit per wrong letter
        eventsRef.current.onWrongLetter(word, { letter, streak: 0 });
      }
    },
    // clock.penalize is a stable closure over setState only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Physical keyboard (a–z; no text input anywhere, so no native keyboard on
  // touch devices — the on-screen QWERTY is the touch surface).
  const typeLetterRef = useRef(typeLetter);
  typeLetterRef.current = typeLetter;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (!/^[a-zA-Z]$/.test(e.key)) return;
      typeLetterRef.current(e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Adaptive keyboard narrowing (deterministic per word) ─────────────────
  useEffect(() => {
    const word = waveWords[wordIdx];
    if (!word || !settings.letterRemoval || status === 'complete') {
      setRemovedKeys((prev) => (prev.size > 0 ? new Set() : prev));
      return;
    }
    const rng = mulberry32(hashString(`${seedKey}|${word.id}`));
    const removed = computeRemovedKeys(word.letters, typedCount, mistakes, clock.elapsedRatio, hintCount, rng);
    setRemovedKeys((prev) => (prev.size === removed.size && [...removed].every((k) => prev.has(k)) ? prev : removed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWordId, wordIdx, typedCount, mistakes, clock.elapsedRatio, hintCount, settings.letterRemoval, status]);

  // ── Full reset on a new wave (NEW_TURN / RESET_GAME / solo next round) ───
  const resetTurn = useCallback(() => {
    clearTimeouts();
    turnKeyRef.current += 1;
    setTurnKey(turnKeyRef.current);
    mistakesRef.current = 0;
    resolvedRef.current = false;
    streakRef.current = 0;
    bestStreakRef.current = 0;
    solvedCountRef.current = 0;
    attemptedRef.current = 0;
    firstTryRef.current = 0;
    completedRef.current = false;
    wordIdxRef.current = 0;
    setStatus('typing');
    setWordIdx(0);
    setTypedCount(0);
    typedCountRef.current = 0;
    setMistakes(0);
    setHintCount(0);
    setWrongLetter(null);
    setHintKey(null);
    setRemovedKeys(new Set());
    setStreak(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    resetTurn();
  }, [waveWords, resetTurn]);

  useEffect(() => clearTimeouts, []);

  // ── Teacher / solo controls ───────────────────────────────────────────────

  /** REVEAL_HINT: shed 3 more distractors; pulse the next letter when narrow. */
  const hint = useCallback(() => {
    if (statusRef.current !== 'typing') return;
    const word = waveWordsRef.current[wordIdxRef.current];
    if (!word) return;
    const nextHintCount = hintCount + 1;
    setHintCount(nextHintCount);
    if (!settings.letterRemoval) {
      // No scaffolding mode: the hint IS the next-letter pulse.
      setHintKey(word.letters[typedCountRef.current] ?? null);
      later(() => setHintKey(null), HINT_PULSE_MS);
      return;
    }
    const rng = mulberry32(hashString(`${seedKey}|${word.id}`));
    const removed = computeRemovedKeys(word.letters, typedCountRef.current, mistakesRef.current, clock.elapsedRatio, nextHintCount, rng);
    setRemovedKeys((prev) => (prev.size === removed.size ? prev : removed));
    const key = hintKeyFor(word.letters, typedCountRef.current, removed);
    if (key) {
      setHintKey(key);
      later(() => setHintKey(null), HINT_PULSE_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintCount, settings.letterRemoval, seedKey]);

  /** MARK_CORRECT: force-solve the current word (or advance a resolved one). */
  const forceCorrect = useCallback(() => {
    if (statusRef.current === 'typing') {
      resolveWord({ solved: true, forced: true });
    } else if (statusRef.current === 'solved' || statusRef.current === 'revealed') {
      advance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** SKIP_ITEM: reveal the current word, never scored (or advance a resolved one). */
  const skip = useCallback(() => {
    if (statusRef.current === 'typing') {
      resolveWord({ solved: false, skipped: true });
    } else if (statusRef.current === 'solved' || statusRef.current === 'revealed') {
      advance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** SLIDE_COMPLETE / forced end: settle into complete WITHOUT the summary event. */
  const forceComplete = useCallback(() => {
    clearTimeouts();
    if (!completedRef.current) {
      completedRef.current = true;
    }
    setStatus('complete');
  }, []);

  return {
    // word state
    status,
    currentWord,
    wordIdx,
    wordsTotal: waveWords.length,
    typedCount,
    wrongLetter,
    removedKeys,
    hintKey,
    streak,
    // clock
    timeRemaining: clock.timeRemaining,
    timerSeconds: settings.timerSeconds,
    elapsedRatio: clock.elapsedRatio,
    // typing + controls
    typeLetter,
    hint,
    skip,
    forceCorrect,
    forceComplete,
    resetTurn,
  };
}
