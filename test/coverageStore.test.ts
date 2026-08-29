import { describe, it, expect, beforeEach } from 'vitest';
import { servedFor, markServed, resetUnit, hydrateUnit } from '../apps/board/coverageStore';

describe('coverageStore (session-scoped)', () => {
  beforeEach(() => {
    resetUnit('sess-1', 'unit-A');
    resetUnit('sess-2', 'unit-A');
  });

  it('isolates different sessions on the same unit', () => {
    markServed('sess-1', 'unit-A', ['o1']);
    markServed('sess-2', 'unit-A', ['o2']);
    expect(servedFor('sess-1', 'unit-A')).toEqual(['o1']);
    expect(servedFor('sess-2', 'unit-A')).toEqual(['o2']);
  });

  it('isolates different units in the same session', () => {
    markServed('sess-1', 'unit-A', ['o1']);
    expect(servedFor('sess-1', 'unit-B')).toEqual([]);
  });

  it('markServed is idempotent and union-merges', () => {
    markServed('sess-1', 'unit-A', ['o1', 'o2']);
    markServed('sess-1', 'unit-A', ['o2', 'o3']);
    expect(servedFor('sess-1', 'unit-A').sort()).toEqual(['o1', 'o2', 'o3']);
  });

  it('hydrateUnit merges a DB snapshot without losing local optimism', () => {
    markServed('sess-1', 'unit-A', ['local-only']);
    hydrateUnit('sess-1', 'unit-A', ['db-1', 'local-only']);
    expect(servedFor('sess-1', 'unit-A').sort()).toEqual(['db-1', 'local-only']);
  });

  it('resetUnit forgets only that (session, unit)', () => {
    markServed('sess-1', 'unit-A', ['o1']);
    markServed('sess-1', 'unit-B', ['o2']);
    resetUnit('sess-1', 'unit-A');
    expect(servedFor('sess-1', 'unit-A')).toEqual([]);
    expect(servedFor('sess-1', 'unit-B')).toEqual(['o2']);
  });
});
