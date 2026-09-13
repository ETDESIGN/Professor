import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useSpellingBeeTurn } from '../components/games/spellingBee/useSpellingBeeTurn';
import type { SpellingBeeWord, SpellingBeeSettings, SpellingBeeTurnEvents } from '../components/games/spellingBee/types';

const mkWords = (tag: string): SpellingBeeWord[] =>
  Array.from({ length: 3 }, (_, i) => ({
    id: `${tag}-${i}`,
    objectiveId: `obj-${tag}-${i}`,
    exerciseType: 'MEANING_MATCH',
    difficulty: 1 as const,
    word: `word ${i}`,
    letters: `WORDX${tag.toUpperCase()}`,
  }));

const settings: SpellingBeeSettings = { timerSeconds: 20, letterRemoval: false };
const events: SpellingBeeTurnEvents = {
  onWrongLetter: () => {},
  onWordResult: () => {},
  onComplete: () => {},
};

describe('useSpellingBeeTurn — wave-change timer race (owner 2026-09-14: dead keyboard)', () => {
  it('reaches typing after a wave change — the keyboard must not stay disabled', () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = renderHook(
        ({ w }) => useSpellingBeeTurn({ waveWords: w, settings, events }),
        { initialProps: { w: mkWords('a') } },
      );
      // Mount starts in 'typing' (no beat); a wave change must present and
      // then REACH typing once PRESENT_BEAT_MS elapses.
      expect(result.current.status).toBe('typing');
      rerender({ w: mkWords('b') });
      expect(result.current.status).toBe('presenting');
      act(() => { vi.advanceTimersByTime(3400); });
      expect(result.current.status).toBe('typing'); // fails pre-fix: stays 'presenting'
    } finally {
      vi.useRealTimers();
    }
  });
});
