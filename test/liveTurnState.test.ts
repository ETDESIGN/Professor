import { describe, it, expect } from 'vitest';
import {
  EMPTY_LIVE_TURN,
  mergeLiveTurn,
  rowToLiveTurn,
  turnTokenFor,
} from '../store/liveTurnState';

describe('liveTurnState (FIXPLAN E2 pure helpers)', () => {
  it('merge: patch wins per key, explicit nulls clear, unknown keys dropped', () => {
    const base = { ...EMPTY_LIVE_TURN, responderId: 's1', quietMode: true };
    const merged = mergeLiveTurn(base, { responderId: null, overlay: 'QUICK_WHEEL' as const });
    expect(merged.responderId).toBeNull(); // explicit clear
    expect(merged.quietMode).toBe(true); // untouched key survives
    expect(merged.overlay).toBe('QUICK_WHEEL');
    // Unknown incoming keys never enter the shape.
    expect(Object.keys(merged).sort()).toEqual(Object.keys(EMPTY_LIVE_TURN).sort());
  });

  it('merge: undefined patch values are ignored (optional scopes are safe)', () => {
    const base = { ...EMPTY_LIVE_TURN, turnToken: 's1::3' };
    expect(mergeLiveTurn(base, { turnToken: undefined })).toEqual(base);
  });

  it('rowToLiveTurn: tolerates pre-migration rows (no live_state / seq)', () => {
    expect(rowToLiveTurn(null)).toEqual({ live: EMPTY_LIVE_TURN, seq: 0 });
    expect(rowToLiveTurn({ live_state: null, seq: undefined })).toEqual({ live: EMPTY_LIVE_TURN, seq: 0 });
    expect(rowToLiveTurn({})).toEqual({ live: EMPTY_LIVE_TURN, seq: 0 });
  });

  it('rowToLiveTurn: parses a written row and keeps seq numeric', () => {
    const row = {
      live_state: { responderId: 's2', turnToken: 's2::4', revealAt: 12345, overlay: 'QUICK_WHEEL' },
      seq: '7',
    };
    const { live, seq } = rowToLiveTurn(row);
    expect(seq).toBe(7);
    expect(live.responderId).toBe('s2');
    expect(live.revealAt).toBe(12345);
    expect(live.quietMode).toBe(false); // missing keys default
  });

  it('turnTokenFor: tokens are unique per seq (globally unique per session)', () => {
    expect(turnTokenFor('s1', 1)).toBe('s1::1');
    expect(turnTokenFor('s1', 1)).not.toBe(turnTokenFor('s1', 2));
    expect(turnTokenFor('s1', 2)).not.toBe(turnTokenFor('s2', 2));
  });
});
