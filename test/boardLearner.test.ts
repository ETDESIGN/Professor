import { describe, it, expect } from 'vitest';
import { teacherGradeToFsrs } from '../services/boardLearner';
import { averageRetrievability } from '../services/learnerState';
import type { ObjectiveState } from '../services/learnerState';

function st(r: number): ObjectiveState {
  return {
    objective_id: 'o', srs_item_id: null, stability: 1, difficulty: 5, reps: 1, lapses: 0,
    mastery_state: 'learning', effective_mastery: 'learning', retrievability: r,
    last_review: null, next_review: null, is_due: false,
  };
}

describe('boardLearner teacherGradeToFsrs', () => {
  it('maps Correct -> good (receptive recognition success)', () => {
    expect(teacherGradeToFsrs(true)).toBe('good');
  });
  it('maps Wrong -> again (lapse)', () => {
    expect(teacherGradeToFsrs(false)).toBe('again');
  });
});

describe('averageRetrievability (class-weak aggregation)', () => {
  it('averages retrievability across a roster and treats empty as full', () => {
    expect(averageRetrievability([st(0.4), st(0.8), st(0.2)])).toBeCloseTo((0.4 + 0.8 + 0.2) / 3, 5);
    expect(averageRetrievability([])).toBe(1);
  });
});
