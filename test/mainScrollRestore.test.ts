import { describe, it, expect } from 'vitest';
import { decideScrollRestore } from '../apps/student/mainScrollRestore';

describe('decideScrollRestore', () => {
  it('aborts when there is nothing to restore (first visit)', () => {
    expect(decideScrollRestore({ target: 0, scrollHeight: 3000, clientHeight: 800, userInteracted: false, elapsedMs: 0 }))
      .toEqual({ action: 'abort' });
  });

  it('restores once the content is tall enough to hold the target', () => {
    expect(decideScrollRestore({ target: 1200, scrollHeight: 3000, clientHeight: 800, userInteracted: false, elapsedMs: 10 }))
      .toEqual({ action: 'restore', scrollTop: 1200 });
  });

  it('restores when within a small epsilon of the target (clamping is fine)', () => {
    // scrollable height 1196 = target 1200 - 4 → still counts as reachable
    expect(decideScrollRestore({ target: 1200, scrollHeight: 1996, clientHeight: 800, userInteracted: false, elapsedMs: 10 }))
      .toEqual({ action: 'restore', scrollTop: 1200 });
  });

  it('waits while the content is still shorter than the target (async layout / entrance animations)', () => {
    // scrollable height 1100 < 1196
    expect(decideScrollRestore({ target: 1200, scrollHeight: 1900, clientHeight: 800, userInteracted: false, elapsedMs: 10 }))
      .toEqual({ action: 'wait' });
  });

  it('aborts once the user scrolls manually (never fight the user)', () => {
    expect(decideScrollRestore({ target: 1200, scrollHeight: 3000, clientHeight: 800, userInteracted: true, elapsedMs: 10 }))
      .toEqual({ action: 'abort' });
  });

  it('gives up after the retry deadline (content never grew tall enough)', () => {
    expect(decideScrollRestore({ target: 1200, scrollHeight: 1900, clientHeight: 800, userInteracted: false, elapsedMs: 3000 }))
      .toEqual({ action: 'abort' });
  });

  it('still waits just inside the deadline (throttled webviews tick slowly)', () => {
    expect(decideScrollRestore({ target: 1200, scrollHeight: 1900, clientHeight: 800, userInteracted: false, elapsedMs: 2500 }))
      .toEqual({ action: 'wait' });
  });
});
