// useSpellingBeeClock — StrictMode-safe per-word countdown for Spelling Bee.
// Follows the BoardVocabBlitz / useFastVocabTimer contract: the interval only
// decrements state (updaters may be double-invoked); expiry side effects run
// from a separate effect guarded by a re-entry ref, with the callback kept in
// a ref so it can never re-arm the effect mid-flight.
//
// The reset is done as a render-phase state adjustment (the documented React
// "adjust state when props change" pattern) instead of a reset effect: the
// render that changes resetKey must NEVER still show timeRemaining 0 from the
// previous word, or the expire effect would re-fire on the stale value before
// an effect-based reset lands.
//
// Extension over useFastVocabTimer: `penalize()` drops the clock by one unit
// (the original game's wrong-letter time penalty). Hitting 0 via a penalty
// triggers the same one-shot onExpire as running out naturally.

import { useEffect, useRef, useState } from 'react';

export interface SpellingBeeClockOptions {
  /** Countdown length in seconds; 0 = untimed (the clock never runs). */
  seconds: number;
  /** Whether the clock is running (paused during reveals/holds). */
  running: boolean;
  /** Called exactly once per resetKey when the clock hits zero. */
  onExpire: () => void;
  /** Changing this resets the clock to `seconds` (e.g. `${turnKey}:${wordIdx}`). */
  resetKey: string | number;
}

export interface SpellingBeeClock {
  /** Seconds left (=== seconds when untimed). */
  timeRemaining: number;
  /** 0..1 fraction of the clock burned (0 when untimed — no time scaffolding). */
  elapsedRatio: number;
  /** Wrong-letter penalty: drop the clock by 1s, floor 0. */
  penalize: () => void;
}

export function useSpellingBeeClock({ seconds, running, onExpire, resetKey }: SpellingBeeClockOptions): SpellingBeeClock {
  const [timeRemaining, setTimeRemaining] = useState(seconds);
  const handledRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const timed = seconds > 0;

  // Render-phase reset: the render that observes a new resetKey (or a new
  // seconds value) already carries the fresh clock — no stale-0 render exists
  // for the expire effect to misread.
  const lastResetRef = useRef({ key: resetKey, seconds });
  if (lastResetRef.current.key !== resetKey || lastResetRef.current.seconds !== seconds) {
    lastResetRef.current = { key: resetKey, seconds };
    handledRef.current = false;
    setTimeRemaining(seconds);
  }

  // Pure decrement — no side effects inside the updater.
  useEffect(() => {
    if (!timed || !running) return;
    const timer = setInterval(() => {
      setTimeRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [timed, running, resetKey]);

  // Expiry dispatch — driven from state, guarded against re-entry (covers
  // both natural expiry and a penalty driving the clock to 0).
  useEffect(() => {
    if (timed && running && timeRemaining === 0 && !handledRef.current) {
      handledRef.current = true;
      onExpireRef.current();
    }
  }, [timeRemaining, running, timed]);

  const penalize = () => {
    if (!timed) return;
    setTimeRemaining((prev) => Math.max(0, prev - 1));
  };

  const elapsedRatio = timed ? Math.max(0, Math.min(1, 1 - timeRemaining / seconds)) : 0;

  return { timeRemaining, elapsedRatio, penalize };
}
