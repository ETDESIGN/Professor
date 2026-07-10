import { describe, it, expect } from 'vitest';
import {
  Grade,
  retrievability,
  elapsedDays,
  retrievabilityNow,
  initDifficulty,
  initStability,
  nextDifficulty,
  nextStabilityRecall,
  nextStabilityLapse,
  nextIntervalDays,
  schedule,
  recordMastery,
  effectiveMasteryState,
  isDue,
  FSRS_DEFAULTS,
} from '../services/fsrs';

describe('fsrs retrievability', () => {
  it('is 1 at t=0 and decreases monotonically with elapsed time', () => {
    expect(retrievability(2.4, 0)).toBe(1);
    const r1 = retrievability(2.4, 1);
    const r5 = retrievability(2.4, 5);
    const r30 = retrievability(2.4, 30);
    expect(r1).toBeGreaterThan(r5);
    expect(r5).toBeGreaterThan(r30);
    expect(r30).toBeGreaterThan(0);
    expect(r30).toBeLessThan(1);
  });

  it('is higher for more stable memories at equal elapsed', () => {
    expect(retrievability(10, 5)).toBeGreaterThan(retrievability(1, 5));
  });

  it('equals targetRetention when elapsed == stability (factor 9, target 0.9)', () => {
    const S = 3;
    // at t=S, R = (1 + 1/9)^-1 = 0.9
    expect(retrievability(S, S)).toBeCloseTo(0.9, 5);
  });

  it('is bounded to [0,1] even for degenerate inputs', () => {
    expect(retrievability(0, 100)).toBeGreaterThanOrEqual(0);
    expect(retrievability(0, 100)).toBeLessThanOrEqual(1);
    expect(retrievability(-5, -10)).toBeGreaterThanOrEqual(0);
  });
});

describe('fsrs elapsedDays', () => {
  it('returns 0 when last review missing', () => {
    expect(elapsedDays(null)).toBe(0);
  });
  it('returns positive days for a past timestamp', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(elapsedDays(twoDaysAgo)).toBeGreaterThan(1.9);
    expect(elapsedDays(twoDaysAgo)).toBeLessThan(2.1);
  });
});

describe('fsrs cold-start init', () => {
  it('again < hard < good < easy initial stability', () => {
    const a = initStability('again');
    const h = initStability('hard');
    const g = initStability('good');
    const e = initStability('easy');
    expect(a).toBeLessThan(h);
    expect(h).toBeLessThan(g);
    expect(g).toBeLessThan(e);
  });
  it('difficulty is bounded [dMin,dMax] and good ~= dInit', () => {
    expect(initDifficulty('good')).toBeCloseTo(FSRS_DEFAULTS.dInit, 5);
    expect(initDifficulty('again')).toBeGreaterThan(initDifficulty('good'));
    expect(initDifficulty('easy')).toBeLessThan(initDifficulty('good'));
  });
});

describe('fsrs difficulty update', () => {
  it('rises on again, falls on easy, mean-reverts within bounds', () => {
    const d = 5;
    expect(nextDifficulty(d, 'again')).toBeGreaterThan(d);
    expect(nextDifficulty(d, 'easy')).toBeLessThan(d);
    expect(nextDifficulty(d, 'good')).toBeGreaterThanOrEqual(FSRS_DEFAULTS.dMin);
    expect(nextDifficulty(100, 'easy')).toBeLessThanOrEqual(FSRS_DEFAULTS.dMax);
  });
});

describe('fsrs stability update', () => {
  it('successful recall grows stability, hard<good<easy', () => {
    const S = 2;
    const r = 0.8;
    const hard = nextStabilityRecall(S, 5, r, 'hard');
    const good = nextStabilityRecall(S, 5, r, 'good');
    const easy = nextStabilityRecall(S, 5, r, 'easy');
    expect(good).toBeGreaterThan(S);
    expect(hard).toBeLessThan(good);
    expect(easy).toBeGreaterThan(good);
  });
  it('lapse reduces stability below recall path', () => {
    const S = 5;
    const lapse = nextStabilityLapse(S, 5, 0.3);
    const recall = nextStabilityRecall(S, 5, 0.3, 'good');
    expect(lapse).toBeLessThan(recall);
    expect(lapse).toBeGreaterThanOrEqual(FSRS_DEFAULTS.lapseMinStability);
  });
});

describe('fsrs schedule', () => {
  it('cold-start schedule never returns NaN and sets next_review in the future', () => {
    const out = schedule({}, 'good');
    expect(Number.isNaN(out.stability)).toBe(false);
    expect(Number.isNaN(out.difficulty)).toBe(false);
    expect(new Date(out.next_review).getTime()).toBeGreaterThan(Date.now());
    expect(out.lapses).toBe(0);
    expect(out.reps).toBe(1);
  });

  it('higher grades produce longer intervals (hard<good<easy)', () => {
    const good = schedule({ stability: 2, difficulty: 5, reps: 3, lapses: 0, last_review: new Date(Date.now() - 86400000).toISOString() }, 'good');
    const easy = schedule({ stability: 2, difficulty: 5, reps: 3, lapses: 0, last_review: new Date(Date.now() - 86400000).toISOString() }, 'easy');
    const hard = schedule({ stability: 2, difficulty: 5, reps: 3, lapses: 0, last_review: new Date(Date.now() - 86400000).toISOString() }, 'hard');
    expect(new Date(easy.next_review).getTime()).toBeGreaterThan(new Date(good.next_review).getTime());
    expect(new Date(good.next_review).getTime()).toBeGreaterThan(new Date(hard.next_review).getTime());
  });

  it('again (lapse) increments lapses and resets reps', () => {
    const out = schedule({ stability: 3, difficulty: 5, reps: 4, lapses: 1, last_review: new Date(Date.now() - 86400000 * 3).toISOString() }, 'again');
    expect(out.lapses).toBe(2);
    expect(out.reps).toBe(0);
  });

  it('nextIntervalDays ~ stability when factor=9 target=0.9', () => {
    expect(nextIntervalDays(3)).toBeCloseTo(3, 1);
  });
});

describe('fsrs mastery ladder', () => {
  it('new -> learning on first receptive success', () => {
    const out = recordMastery({ state: 'new', meta: {}, grade: 'good', modality: 'receptive' });
    expect(out.state).toBe('learning');
    expect(out.meta.last_receptive_at).toBeTruthy();
  });
  it('learning -> familiar on first productive success', () => {
    const out = recordMastery({ state: 'learning', meta: {}, grade: 'good', modality: 'productive' });
    expect(out.state).toBe('familiar');
    expect(out.meta.productive_wins).toBe(1);
  });
  it('familiar stays familiar until 3 productive wins over >48h', () => {
    const t0 = new Date('2026-01-01T00:00:00Z');
    let res = recordMastery({ state: 'learning', meta: {}, grade: 'good', modality: 'productive', now: t0 });
    expect(res.state).toBe('familiar');
    res = recordMastery({ ...res, grade: 'good', modality: 'productive', now: new Date('2026-01-01T01:00:00Z') }); // +1h
    expect(res.state).toBe('familiar'); // only 2 wins, <48h
    res = recordMastery({ ...res, grade: 'good', modality: 'productive', now: new Date('2026-01-03T00:00:00Z') }); // +48h, 3rd win
    expect(res.state).toBe('mastered');
  });
  it('lapse demotes mastered->familiar->learning', () => {
    let res = recordMastery({ state: 'mastered', meta: { productive_wins: 5 }, grade: 'again', modality: 'productive' });
    expect(res.state).toBe('familiar');
    res = recordMastery({ state: 'familiar', meta: {}, grade: 'again', modality: 'productive' });
    expect(res.state).toBe('learning');
  });
  it('decaying recovers to familiar on productive success', () => {
    const res = recordMastery({ state: 'decaying', meta: {}, grade: 'good', modality: 'productive' });
    expect(res.state).toBe('familiar');
  });
  it('lapse resets productive progress so re-master needs 3 fresh wins (not 1)', () => {
    const t0 = new Date('2026-01-01T00:00:00Z');
    // Reach mastered with 3 wins over >48h.
    let res = recordMastery({ state: 'learning', meta: {}, grade: 'good', modality: 'productive', now: t0 });
    res = recordMastery({ ...res, grade: 'good', modality: 'productive', now: new Date('2026-01-02T00:00:00Z') });
    res = recordMastery({ ...res, grade: 'good', modality: 'productive', now: new Date('2026-01-04T00:00:00Z') });
    expect(res.state).toBe('mastered');
    expect(res.meta.productive_wins).toBe(3);
    // Lapse demotes to familiar AND resets the productive counter.
    res = recordMastery({ ...res, grade: 'again', modality: 'productive' });
    expect(res.state).toBe('familiar');
    expect(res.meta.productive_wins).toBe(0);
    expect(res.meta.first_productive_at).toBeNull();
    // A SINGLE productive win must NOT re-master.
    res = recordMastery({ ...res, grade: 'good', modality: 'productive', now: new Date('2026-01-10T00:00:00Z') });
    expect(res.state).toBe('familiar');
  });
});

describe('fsrs compute-on-read decay + due', () => {
  it('mastered with R<0.85 reports decaying (stored unchanged)', () => {
    expect(effectiveMasteryState('mastered', 0.7)).toBe('decaying');
    expect(effectiveMasteryState('mastered', 0.9)).toBe('mastered');
    expect(effectiveMasteryState('learning', 0.1)).toBe('learning');
  });
  it('isDue true for null next_review and past timestamps', () => {
    expect(isDue(null)).toBe(true);
    expect(isDue(new Date(Date.now() - 1000).toISOString())).toBe(true);
    expect(isDue(new Date(Date.now() + 100000).toISOString())).toBe(false);
  });
  it('retrievabilityNow matches manual calc', () => {
    const last = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const r = retrievabilityNow({ stability: 2, last_review: last });
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(1);
  });
});
