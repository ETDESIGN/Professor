/**
 * Scroll-restore decision logic for the student main screen (pure — unit
 * tested in test/mainScrollRestore.test.ts).
 *
 * The main layout (and with it the scrolling container div) fully unmounts
 * when a lesson or other full-screen route opens, so the browser loses the
 * scrollTop. Restore therefore has to wait until the remounted content is
 * tall enough to hold the saved position, and must never fight the user.
 * The deadline is generous (3s) because throttled webviews only manage a
 * couple of timer-driven ticks per window.
 */

const RESTORE_DEADLINE_MS = 3000;
const RESTORE_EPSILON_PX = 4;

export interface ScrollRestoreSnapshot {
  /** Previously saved scroll position to restore (0 = nothing to restore). */
  target: number;
  /** Container's content height (may still be growing after remount). */
  scrollHeight: number;
  /** Container's own height.
   */
  clientHeight: number;
  /** True once the user wheeled/touched the container during restore. */
  userInteracted: boolean;
  /** Milliseconds since restore started. */
  elapsedMs: number;
}

export type ScrollRestoreDecision =
  | { action: 'restore'; scrollTop: number }
  | { action: 'wait' }
  | { action: 'abort' };

export function decideScrollRestore(s: ScrollRestoreSnapshot): ScrollRestoreDecision {
  if (s.target <= 0) return { action: 'abort' };
  if (s.userInteracted) return { action: 'abort' };
  if (s.elapsedMs >= RESTORE_DEADLINE_MS) return { action: 'abort' };
  if (s.scrollHeight - s.clientHeight >= s.target - RESTORE_EPSILON_PX) {
    return { action: 'restore', scrollTop: s.target };
  }
  return { action: 'wait' };
}
