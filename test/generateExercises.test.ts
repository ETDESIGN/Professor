// Unit tests for the generate-exercises builder helpers (edge mirror, importable
// because _shared/exerciseTypes.ts is dependency-free). Covers the generator's
// sibling-distractor + multiple-choice construction used per vocabulary word.
import { describe, it, expect } from 'vitest';
import { buildChoices, pickDistractors, shuffle, modalityOf } from '../supabase/functions/_shared/exerciseTypes';

describe('generate-exercises builders', () => {
  it('buildChoices places the correct answer + distractors and reports its index', () => {
    const pool = ['苹果', '香蕉', '橙子', '葡萄', '梨'];
    const { options, correct_index } = buildChoices('苹果', pool, 4);
    expect(options).toHaveLength(4);
    expect(options[correct_index]).toBe('苹果');
    expect(options.filter((o) => o === '苹果')).toHaveLength(1); // no duplicate correct
  });

  it('pickDistractors excludes the correct value and respects count', () => {
    const pool = ['a', 'b', 'c', 'd'];
    const d = pickDistractors(pool, 'a', 2);
    expect(d).not.toContain('a');
    expect(d).toHaveLength(2);
  });

  it('pickDistractors handles a pool smaller than requested', () => {
    const d = pickDistractors(['x'], 'y', 3);
    expect(d).toEqual(['x']);
  });

  it('shuffle returns the same elements, different array', () => {
    const src = [1, 2, 3, 4, 5];
    const s = shuffle(src);
    expect(s.sort()).toEqual(src);
    expect(s).not.toBe(src); // new array
  });

  it('buildChoices never puts the correct answer at a fixed position (randomised)', () => {
    const pool = ['d1', 'd2', 'd3', 'd4', 'd5'];
    const positions = new Set<number>();
    for (let i = 0; i < 40; i++) positions.add(buildChoices('correct', pool, 4).correct_index);
    expect(positions.size).toBeGreaterThan(1); // index varies (not always 0)
  });

  it('modalityOf classifies receptive vs productive', () => {
    expect(modalityOf('IMAGE_SELECT')).toBe('receptive');
    expect(modalityOf('LISTEN_SELECT')).toBe('receptive');
    expect(modalityOf('TYPE_TRANSLATE')).toBe('productive');
    expect(modalityOf('SPEAK_SENTENCE')).toBe('productive');
    expect(modalityOf('WORD_BANK_BUILD')).toBe('productive');
  });
});
