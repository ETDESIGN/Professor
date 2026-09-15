import { useEffect, useRef } from 'react';
import { Sentry } from '../services/errorReporting';

// Fallback media: 2s loop, 64x36 black h264 (baseline) + silent AAC audio
// track. Unmuted-with-silent-audio is what makes iPadOS treat it as active
// media playback and skip auto-lock (the streaming-site mechanism).
const FALLBACK_VIDEO_SRC = '/media/silence-loop.mp4';

/**
 * Keep the display awake while `active` — the teacher's live screens are
 * projected/driven without touch for minutes at a time.
 *
 * Primary: Screen Wake Lock API (Safari/iPadOS 16.4+, all desktop browsers).
 * NOT available inside WKWebView — the engine Apple requires for third-party
 * iOS browsers (Brave/Chrome/Firefox on iPad) — or when the request is
 * rejected (e.g. Low Power Mode).
 *
 * Fallback for those cases: a hidden, silent, looping inline video. Active
 * video playback prevents iOS auto-lock regardless of the Wake Lock API.
 * Unmuted video needs a user gesture on iOS; live screens are entered by a
 * tap, and any later interaction retries play() if autoplay was blocked.
 *
 * Everything is a silent no-op on failure — the classroom must never error
 * because the device keeps auto-locking.
 */
export function useScreenWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let fallbackVideo: HTMLVideoElement | null = null;

    const notify = (mechanism: string) => {
      Sentry.addBreadcrumb({ category: 'wake-lock', message: mechanism, level: 'info' });
    };

    const attemptPlay = () => {
      if (!fallbackVideo || disposed) return;
      const p = fallbackVideo.play();
      if (p && typeof p.catch === 'function') {
        // Autoplay blocked (no gesture yet) — the interaction listeners retry.
        p.catch(() => {});
      }
    };

    const startFallback = () => {
      if (disposed || fallbackVideo) return;
      const video = document.createElement('video');
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.loop = true;
      video.setAttribute('aria-hidden', 'true');
      video.setAttribute('disablepictureinpicture', '');
      video.setAttribute('tabindex', '-1');
      // Hidden but rendered — display:none lets WebKit suspend the video.
      video.style.cssText =
        'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;';
      video.src = FALLBACK_VIDEO_SRC;
      fallbackVideo = video;
      document.body.appendChild(video);
      notify('screen-awake via video fallback (Wake Lock API unavailable)');
      attemptPlay();
    };

    const acquire = async () => {
      if (sentinelRef.current && !sentinelRef.current.released) return;
      try {
        if (!navigator.wakeLock) throw new Error('wake-lock-unavailable');
        const sentinel = await navigator.wakeLock.request('screen');
        if (!sentinel) throw new Error('wake-lock-unavailable');
        if (disposed) {
          sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        if (fallbackVideo) fallbackVideo.pause(); // the API lock is cheaper
        notify('screen-awake via Wake Lock API');
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
        });
      } catch {
        startFallback();
      }
    };

    const onUserGesture = () => attemptPlay();
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      acquire();
      attemptPlay();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('pointerup', onUserGesture, { capture: true, passive: true });
    document.addEventListener('touchend', onUserGesture, { capture: true, passive: true });
    document.addEventListener('keydown', onUserGesture, true);
    acquire();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('pointerup', onUserGesture, true);
      document.removeEventListener('touchend', onUserGesture, true);
      document.removeEventListener('keydown', onUserGesture, true);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      sentinel?.release().catch(() => {});
      if (fallbackVideo) {
        fallbackVideo.pause();
        fallbackVideo.removeAttribute('src');
        fallbackVideo.load();
        fallbackVideo.remove();
        fallbackVideo = null;
      }
    };
  }, [active]);
}
