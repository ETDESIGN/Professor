// useFastVocabTimer — StrictMode-safe countdown for the Fast Vocab speed
// phase. Follows the BoardVocabBlitz timer contract: the interval only
// decrements state (updaters may be double-invoked); expiry side effects run
// from a separate effect guarded by a re-entry ref, with the callback kept in
// a ref so it can never re-arm the effect mid-flight.

import { useEffect, useRef, useState } from 'react';

export interface FastVocabTimerOptions {
  /** Countdown length in seconds. */
  seconds: number;
  /** Whether the clock is running (paused during reveals/holds). */
  running: boolean;
  /** Called exactly once per resetKey when the clock hits zero. */
  onExpire: () => void;
  /** Changing this resets the clock to `seconds` (e.g. `${turnId}:${qIdx}`). */
  resetKey: string | number;
}

export function useFastVocabTimer({ seconds, running, onExpire, resetKey }: FastVocabTimerOptions): number {
  const [timeRemaining, setTimeRemaining] = useState(seconds);
  const handledRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  // Reset on new question / turn.
  useEffect(() => {
    setTimeRemaining(seconds);
    handledRef.current = false;
  }, [resetKey, seconds]);

  // Pure decrement — no side effects inside the updater.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setTimeRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [running, resetKey]);

  // Expiry dispatch — driven from state, guarded against re-entry.
  useEffect(() => {
    if (running && timeRemaining === 0 && !handledRef.current) {
      handledRef.current = true;
      onExpireRef.current();
    }
  }, [timeRemaining, running]);

  return timeRemaining;
}
