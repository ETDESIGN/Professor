import { describe, it, expect } from 'vitest';
import {
  normalizeForDedupe,
  sanitizeConfusables,
  dedupeDistinct,
  grammarMutations,
} from '../supabase/functions/_shared/exerciseQuality';

describe('normalizeForDedupe', () => {
  it('folds case, curly apostrophes, terminal punctuation and whitespace', () => {
    expect(normalizeForDedupe('He mustn’t go outside.')).toBe(normalizeForDedupe("he mustn't go outside"));
    expect(normalizeForDedupe('  How   often? ')).toBe('how often');
  });
});

describe('sanitizeConfusables', () => {
  it('drops vs-joined alternatives and questions, keeps real words/phrases', () => {
    expect(sanitizeConfusables(['Friday vs Saturday', 'Tuesday', 'watch a DVD', 'which day?', ''])).toEqual([
      'Tuesday',
      'watch a DVD',
    ]);
  });
});

describe('dedupeDistinct', () => {
  it('dedupes distractors vs correct AND each other (normalized)', () => {
    expect(dedupeDistinct('Tuesday', ['TUESDAY.', 'tuesday', 'Wednesday'])).toEqual(['Wednesday']);
    expect(dedupeDistinct('go', ['Go', 'went', 'went '])).toEqual(['went']);
  });
});

describe('grammarMutations — real-grammar wrong variants only, never invented words', () => {
  it('moves the frequency adverb to the wrong slot', () => {
    expect(grammarMutations('I always eat breakfast')).toContain('I eat always breakfast');
  });
  it('inserts to after a modal', () => {
    expect(grammarMutations('You must wear shoes')).toContain('You must to wear shoes');
  });
  it('drops the third-person s', () => {
    expect(grammarMutations('She eats vegetables at dinner')).toContain('She eat vegetables at dinner');
  });
  it('swaps a/an wrongly', () => {
    expect(grammarMutations('I have an egg')).toContain('I have a egg');
  });
  it('swaps do/does forms', () => {
    expect(grammarMutations("She doesn't like fish")).toContain("She don't like fish");
  });
  it('returns [] when nothing matches', () => {
    expect(grammarMutations('The sky is blue')).toEqual([]);
  });
  it('never mutates into the same normalized string', () => {
    for (const m of grammarMutations('He mustn’t go outside on rainy days.')) {
      expect(normalizeForDedupe(m)).not.toBe(normalizeForDedupe('He mustn’t go outside on rainy days.'));
    }
  });
});
