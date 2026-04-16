import { describe, it, expect } from 'vitest';
import { calculateSimilarity, generateFeedback } from '../services/SpeechService';

describe('SpeechService', () => {
  describe('calculateSimilarity', () => {
    it('returns 1 for identical strings', () => {
      expect(calculateSimilarity('hello', 'hello')).toBe(1);
    });

    it('returns 1 for identical strings ignoring case', () => {
      expect(calculateSimilarity('Hello', 'hello')).toBe(1);
    });

    it('returns 1 for identical strings ignoring punctuation', () => {
      expect(calculateSimilarity("Hello!", "hello")).toBe(1);
    });

    it('returns 0 for completely different strings', () => {
      const sim = calculateSimilarity('abc', 'xyz');
      expect(sim).toBe(0);
    });

    it('returns 1 for two empty strings', () => {
      expect(calculateSimilarity('', '')).toBe(1);
    });

    it('returns 0 when one string is empty', () => {
      expect(calculateSimilarity('hello', '')).toBe(0);
      expect(calculateSimilarity('', 'hello')).toBe(0);
    });

    it('returns high similarity for near-matches', () => {
      const sim = calculateSimilarity('cat', 'bat');
      expect(sim).toBeGreaterThanOrEqual(0.6);
      expect(sim).toBeLessThan(1);
    });

    it('returns high similarity for extra whitespace', () => {
      const sim = calculateSimilarity('  hello  ', 'hello');
      expect(sim).toBe(1);
    });

    it('handles single character differences', () => {
      const sim = calculateSimilarity('the cat', 'the bat');
      expect(sim).toBeGreaterThanOrEqual(0.7);
    });

    it('normalizes to lowercase before comparing', () => {
      const sim = calculateSimilarity('THE DOG', 'the dog');
      expect(sim).toBe(1);
    });
  });

  describe('generateFeedback', () => {
    it('returns perfect for >= 0.95', () => {
      expect(generateFeedback(0.95, 'test')).toContain('Perfect');
      expect(generateFeedback(1.0, 'test')).toContain('Perfect');
    });

    it('returns good job for >= 0.8', () => {
      expect(generateFeedback(0.8, 'apple')).toContain('Good job');
      expect(generateFeedback(0.9, 'apple')).toContain('Good job');
    });

    it('returns almost there for >= 0.6', () => {
      expect(generateFeedback(0.6, 'word')).toContain('Almost there');
      expect(generateFeedback(0.75, 'word')).toContain('Almost there');
    });

    it('returns keep practicing for < 0.6', () => {
      expect(generateFeedback(0.5, 'test')).toContain('Keep practicing');
      expect(generateFeedback(0.1, 'test')).toContain('Keep practicing');
    });

    it('includes the target word in feedback', () => {
      expect(generateFeedback(0.5, 'elephant')).toContain('elephant');
      expect(generateFeedback(0.8, 'giraffe')).toContain('giraffe');
    });
  });
});
