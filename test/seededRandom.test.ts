import { describe, it, expect } from 'vitest';
import { mulberry32, hashString, makeRng, seededShuffle } from '../services/seededRandom';

describe('seededRandom (FIXPLAN E1.1)', () => {
  it('mulberry32 is deterministic per seed and varies across seeds', () => {
    const a1 = mulberry32(42);
    const a2 = mulberry32(42);
    const b = mulberry32(43);
    const seqA1 = [a1(), a1(), a1()];
    const seqA2 = [a2(), a2(), a2()];
    const seqB = [b(), b(), b()];
    expect(seqA1).toEqual(seqA2);
    expect(seqA1).not.toEqual(seqB);
    for (const v of [...seqA1, ...seqB]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('hashString is stable and collision-distant for scope keys', () => {
    expect(hashString('session|unit|0')).toBe(hashString('session|unit|0'));
    expect(hashString('session|unit|0')).not.toBe(hashString('session|unit|1'));
    expect(hashString('s1|u1')).not.toBe(hashString('s2|u1'));
  });

  it('makeRng produces identical sequences for identical scope parts', () => {
    const r1 = makeRng('sess-1', 'unit-9', 3, 'stu::7');
    const r2 = makeRng('sess-1', 'unit-9', 3, 'stu::7');
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });

  it('makeRng skips null/undefined/empty parts (optional scopes are safe)', () => {
    const r1 = makeRng('sess', 'unit', 2);
    const r2 = makeRng('sess', 'unit', 2, undefined, null, '');
    expect([r1(), r1()]).toEqual([r2(), r2()]);
  });

  it('makeRng differs when any scope part differs (turn/reset variety)', () => {
    const base = makeRng('sess', 'unit', 0);
    const nextTurn = makeRng('sess', 'unit', 0, 'stu::2');
    const reset = makeRng('sess', 'unit', 0, 2);
    const seqs = [base, nextTurn, reset].map((r) => [r(), r(), r()]);
    expect(new Set(seqs.map((s) => s.join(','))).size).toBe(3);
  });

  it('seededShuffle is a deterministic permutation', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const s1 = seededShuffle(items, makeRng('sess', 'unit', 0));
    const s2 = seededShuffle(items, makeRng('sess', 'unit', 0));
    const s3 = seededShuffle(items, makeRng('sess', 'unit', 1));
    expect(s1).toEqual(s2);
    expect(s1).not.toEqual(s3);
    // Permutation validity: same multiset, input unmutated.
    expect([...s1].sort((a, b) => a - b)).toEqual(items);
    expect(items[0]).toBe(0);
    expect(seededShuffle([], makeRng('x'))).toEqual([]);
    expect(seededShuffle([1], makeRng('x'))).toEqual([1]);
  });

  it('same seed reshuffles identically across independent calls (cross-tab agreement)', () => {
    // Two "tabs" building the same round from the same scope key must deal
    // the same content — the core guarantee behind FIXPLAN E1.3–E1.6.
    const deal = (sessionId: string, unitId: string, turn: string) =>
      seededShuffle(['a', 'b', 'c', 'd', 'e', 'f'], makeRng(sessionId, unitId, turn));
    expect(deal('s1', 'u1', 'stu::1')).toEqual(deal('s1', 'u1', 'stu::1'));
    expect(deal('s1', 'u1', 'stu::1')).not.toEqual(deal('s2', 'u1', 'stu::1')); // new session varies
    expect(deal('s1', 'u1', 'stu::1')).not.toEqual(deal('s1', 'u1', 'stu::2')); // new turn varies
  });
});
