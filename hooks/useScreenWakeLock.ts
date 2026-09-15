import { useEffect, useRef } from 'react';

/**
 * Screen Wake Lock (the mechanism streaming sites use): while `active`, ask
 * the OS not to auto-lock the display. Safari/iPadOS 16.4+ incl. home-screen
 * installed PWAs; no permission prompt; requires HTTPS.
 *
 * The browser silently releases the lock when the page is hidden or the
 * screen is locked manually — we re-acquire when the page becomes visible
 * again. Unsupported browsers and rejected requests (e.g. low battery) are
 * silent no-ops: the classroom must never error because the device keeps
 * auto-locking.
 */
export function useScreenWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) return;
    let disposed = false;

    const acquire = async () => {
      if (sentinelRef.current && !sentinelRef.current.released) return;
      try {
        const sentinel = await navigator.wakeLock?.request('screen');
        if (!sentinel) return;
        if (disposed) {
          sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
        });
      } catch {
        // NotAllowedError etc. — stay quiet, auto-lock simply remains.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    acquire();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      sentinel?.release().catch(() => {});
    };
  }, [active]);
}
