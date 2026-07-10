import { describe, it, expect } from 'vitest';
import { computeHeartsState, gradeFromResult, rankWeakestFirst, HEARTS_MAX } from '../services/learnerState';
import type { ObjectiveState } from '../services/learnerState';

function state(oid: string, r: number, next: string | null = null, mastery: any = 'learning'): ObjectiveState {
  return {
    objective_id: oid,
    srs_item_id: null,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    mastery_state: mastery,
    effective_mastery: mastery,
    retrievability: r,
    last_review: null,
    next_review: next,
    is_due: false,
  };
}

describe('gradeFromResult', () => {
  it('failure -> again', () => {
    expect(gradeFromResult({ success: false, time_taken_ms: 1000, attempts: 3 })).toBe('again');
  });
  it('fast first-try success -> easy', () => {
    expect(gradeFromResult({ success: true, time_taken_ms: 2000, attempts: 1 })).toBe('easy');
  });
  it('slow single success -> good', () => {
    expect(gradeFromResult({ success: true, time_taken_ms: 6000, attempts: 1 })).toBe('good');
  });
  it('multi-attempt success -> hard', () => {
    expect(gradeFromResult({ success: true, time_taken_ms: 6000, attempts: 2 })).toBe('hard');
  });
});

describe('rankWeakestFirst', () => {
  it('orders objectives lowest-retrievability first, ties by next_review', () => {
    const map = new Map<string, ObjectiveState>([
      ['a', state('a', 0.9, '2030-01-01')],
      ['b', state('b', 0.2, '2030-01-01')],
      ['c', state('c', 0.5, '2025-01-01')],
    ]);
    const ranked = rankWeakestFirst(map);
    expect(ranked[0]).toBe('b'); // weakest
    expect(ranked[1]).toBe('c');
    expect(ranked[2]).toBe('a');
  });
  it('empty map -> empty array', () => {
    expect(rankWeakestFirst(new Map())).toEqual([]);
  });
});

describe('computeHeartsState (compute-on-read)', () => {
  const REGEN = 4 * 60 * 60 * 1000;

  it('is full when stored is full regardless of elapsed', () => {
    const h = computeHeartsState(HEARTS_MAX, Date.now() - REGEN * 10, Date.now());
    expect(h.current).toBe(HEARTS_MAX);
    expect(h.next_heart_ms).toBeNull();
  });

  it('regenerates one heart per 4h elapsed', () => {
    const h = computeHeartsState(2, Date.now() - REGEN * 2, Date.now());
    expect(h.current).toBe(4); // 2 stored + 2 regen
  });

  it('never exceeds max even with huge elapsed', () => {
    const h = computeHeartsState(0, Date.now() - REGEN * 100, Date.now());
    expect(h.current).toBe(HEARTS_MAX);
  });

  it('never goes below 0', () => {
    const h = computeHeartsState(-5, Date.now(), Date.now());
    expect(h.current).toBe(0);
    expect(h.stored).toBe(0);
  });

  it('reports time-to-next-heart when not full', () => {
    const now = Date.now();
    const h = computeHeartsState(2, now - 1000, now); // 1s elapsed
    expect(h.current).toBe(2);
    expect(h.next_heart_ms).toBeLessThanOrEqual(REGEN);
    expect(h.next_heart_ms).toBeGreaterThan(0);
  });

  it('clamps stored to [0,max]', () => {
    expect(computeHeartsState(99, Date.now(), Date.now()).stored).toBe(HEARTS_MAX);
    expect(computeHeartsState(-3, Date.now(), Date.now()).stored).toBe(0);
  });
});
