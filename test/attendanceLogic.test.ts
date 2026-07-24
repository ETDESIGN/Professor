import { describe, it, expect } from 'vitest';
import {
  isPresentStatus, mergePresence, filterPresent, buildStatuses, summarize,
} from '../services/attendanceLogic';

describe('attendanceLogic', () => {
  it('isPresentStatus: only explicit absent is not present', () => {
    expect(isPresentStatus(undefined)).toBe(true);   // opt-in default
    expect(isPresentStatus('present')).toBe(true);
    expect(isPresentStatus('absent')).toBe(false);
  });

  it('mergePresence stamps isPresent from the map, defaulting present', () => {
    const roster = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const map = new Map<string, any>([['b', 'absent'], ['c', 'present']]);
    const out = mergePresence(roster, map);
    expect(out.find(s => s.id === 'a')!.isPresent).toBe(true);  // missing → present
    expect(out.find(s => s.id === 'b')!.isPresent).toBe(false);
    expect(out.find(s => s.id === 'c')!.isPresent).toBe(true);
  });

  it('filterPresent drops only isPresent === false', () => {
    const s = [{ id: 'a', isPresent: true }, { id: 'b', isPresent: false }, { id: 'c' }];
    expect(filterPresent(s).map(x => x.id)).toEqual(['a', 'c']);
  });

  it('buildStatuses marks every roster id present/absent from the set', () => {
    const m = buildStatuses(['a', 'b', 'c'], new Set(['a', 'c']));
    expect(m.get('a')).toBe('present');
    expect(m.get('b')).toBe('absent');
    expect(m.get('c')).toBe('present');
    expect(m.size).toBe(3);
  });

  it('summarize counts present and absent', () => {
    expect(summarize(['a', 'b', 'c'], new Set(['a']))).toEqual({ present: 1, absent: 2 });
    expect(summarize([], new Set())).toEqual({ present: 0, absent: 0 });
  });
});
