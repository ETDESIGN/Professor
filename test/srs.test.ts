import { describe, it, expect } from 'vitest';
import { diffMissingSRSWords, SRS_DEFAULTS } from '../services/srs';

describe('diffMissingSRSWords (Phase 3 reconcile)', () => {
  it('returns all template words when the student has none', () => {
    const missing = diffMissingSRSWords(
      [{ word: 'apple' }, { word: 'pear' }],
      [],
    );
    expect(missing.map((m) => m.word)).toEqual(['apple', 'pear']);
  });

  it('returns only words the student is missing (preserves existing)', () => {
    // Student already reviewed 'apple'; teacher re-orchestrated and added 'pear'.
    const missing = diffMissingSRSWords(
      [{ word: 'apple' }, { word: 'pear' }],
      [{ word: 'apple' }],
    );
    expect(missing.map((m) => m.word)).toEqual(['pear']);
  });

  it('returns nothing when the student already has every word', () => {
    const missing = diffMissingSRSWords(
      [{ word: 'apple' }, { word: 'pear' }],
      [{ word: 'apple' }, { word: 'pear' }],
    );
    expect(missing).toEqual([]);
  });

  it('is case- and whitespace-insensitive on the lookup', () => {
    const missing = diffMissingSRSWords(
      [{ word: '  Apple  ' }, { word: 'PEAR' }],
      [{ word: 'apple' }],
    );
    expect(missing.map((m) => m.word)).toEqual(['PEAR']);
  });

  it('deduplicates template words and ignores empty words', () => {
    const missing = diffMissingSRSWords(
      [{ word: 'apple' }, { word: 'apple' }, { word: '' }, { word: 'pear' }],
      [],
    );
    expect(missing.map((m) => m.word)).toEqual(['apple', 'pear']);
  });

  it('exposes frozen SM-2 defaults', () => {
    expect(SRS_DEFAULTS).toEqual({ interval: 0, repetition: 0, efactor: 2.5 });
    expect(Object.isFrozen(SRS_DEFAULTS)).toBe(true);
  });
});
