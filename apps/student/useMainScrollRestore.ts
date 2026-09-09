import React, { useEffect, useRef } from 'react';
import { decideScrollRestore } from './mainScrollRestore';

/**
 * Keeps the student main-screen scroller's position across full-screen
 * round-trips (lesson → back). StudentApp itself stays mounted while its
 * main layout — including the scroll container div — unmounts for those
 * routes, so we save the scrollTop in a ref on every scroll and restore it
 * when the main screen mounts again, retrying until the content is tall
 * enough (keyed AnimatePresence + entrance animations and async data delay
 * layout) and yielding immediately if the user scrolls.
 *
 * Retry scheduling is dual-driven: requestAnimationFrame for smooth browsers
 * plus a setTimeout fallback of the same tick — in occluded/throttled webviews
 * rAF callbacks never fire (verified live), and timers still do.
 */
export function useMainScrollRestore(isMainScreen: boolean) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const savedScrollRef = useRef(0);

  // Save only while the main screen is mounted: navigating to a shorter tab
  // view clamps the shared container's scrollTop and fires a scroll event
  // that must not overwrite the saved main-screen position.
  const handleContainerScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isMainScreen) savedScrollRef.current = e.currentTarget.scrollTop;
  };

  useEffect(() => {
    if (!isMainScreen) return;
    const el = containerRef.current;
    if (!el) return;

    let raf = 0;
    let timer = 0;
    let userInteracted = false;
    const startedAt = performance.now();
    const onUserScroll = () => { userInteracted = true; };
    el.addEventListener('wheel', onUserScroll, { passive: true });
    el.addEventListener('touchstart', onUserScroll, { passive: true });

    const stop = () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      el.removeEventListener('wheel', onUserScroll);
      el.removeEventListener('touchstart', onUserScroll);
    };

    // Whichever of rAF / the fallback timer fires first runs the next tick.
    const scheduleTick = (fn: () => void) => {
      let ran = false;
      const run = () => {
        if (ran) return;
        ran = true;
        fn();
      };
      raf = requestAnimationFrame(run);
      timer = window.setTimeout(run, 64);
    };

    const tick = () => {
      const decision = decideScrollRestore({
        target: savedScrollRef.current,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        userInteracted,
        elapsedMs: performance.now() - startedAt,
      });
      if (decision.action === 'restore') {
        el.scrollTop = decision.scrollTop;
        stop();
        return;
      }
      if (decision.action === 'wait') {
        scheduleTick(tick);
        return;
      }
      stop();
    };
    scheduleTick(tick);
    return stop;
  }, [isMainScreen]);

  return { containerRef, handleContainerScroll };
}
