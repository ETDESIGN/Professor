import { describe, expect, it } from 'vitest';
import { bandFor, compareWords } from '../supabase/functions/evaluate-dubbing/score';

describe('compareWords', () => {
  it('returns 1 for exact match ignoring case/punctuation', () => {
    expect(compareWords('Hello, World!', 'hello world')).toBe(1);
  });
  it('penalizes missing words', () => {
    expect(compareWords('the quick brown fox', 'the quick fox')).toBeLessThan(1);
    expect(compareWords('the quick brown fox', 'the quick fox')).toBeGreaterThan(0.5);
  });
  it('returns 0 for empty transcript', () => {
    expect(compareWords('anything', '')).toBe(0);
  });
});

describe('bandFor', () => {
  it('bands per spec thresholds', () => {
    expect(bandFor(0.9)).toBe('great');
    expect(bandFor(0.85)).toBe('great');
    expect(bandFor(0.7)).toBe('almost');
    expect(bandFor(0.6)).toBe('almost');
    expect(bandFor(0.4)).toBe('try_again');
  });
});
