// useTapDragPairing — the hybrid tap + drag interaction for the Fast Vocab
// match wave.
//
// Two paths produce the SAME onPairAttempt(aPodId, bPodId) event:
//   • Tap-to-pair (the house idiom, BoardFlashMatch-style): tap a pod on one
//     side to select it, tap a pod on the other side to attempt the pair.
//     Tapping the same pod again deselects; tapping another pod on the same
//     side switches the selection.
//   • True drag (the original game's feel): press a pod and move past the
//     DRAG_THRESHOLD — a floating ghost follows the pointer; release over a
//     pod on the opposite side to attempt the pair. Release elsewhere cancels.
//
// Hit-testing uses document.elementFromPoint + [data-fv-pod] attributes, so
// the game surfaces stay dumb (they only tag their pods). Pods must set
// `touch-action: none` (exposed as podTouchAction) or touch pointers will
// cancel into scrolling before the drag can start.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export type PodSide = 'source' | 'target';

/** Pixels of movement before a press becomes a drag. */
const DRAG_THRESHOLD = 8;

export interface PodSelection {
  podId: string;
  side: PodSide;
}

export interface DragGhost extends PodSelection {
  x: number;
  y: number;
}

export interface TapDragPairingOptions {
  /** Fired with the two pod ids of an attempted pair (order: source-side first when known). */
  onPairAttempt: (aPodId: string, bPodId: string) => void;
  /** Return false to ignore all interaction (locked transitions). */
  isEnabled?: () => boolean;
  /** Clears selection (called when the surface resets/rebuilds). */
}

interface PointerSession {
  pointerId: number;
  podId: string;
  side: PodSide;
  startX: number;
  startY: number;
  dragging: boolean;
}

export function useTapDragPairing({ onPairAttempt, isEnabled }: TapDragPairingOptions) {
  const [selected, setSelected] = useState<PodSelection | null>(null);
  const [ghost, setGhost] = useState<DragGhost | null>(null);
  const sessionRef = useRef<PointerSession | null>(null);
  const attemptRef = useRef(onPairAttempt);
  attemptRef.current = onPairAttempt;
  const enabledRef = useRef(isEnabled);
  enabledRef.current = isEnabled;
  // Mirror of `selected` so tap resolution happens OUTSIDE setState — a side
  // effect inside a state updater fires twice under StrictMode.
  const selectedRef = useRef<PodSelection | null>(null);
  const select = useCallback((next: PodSelection | null) => {
    selectedRef.current = next;
    setSelected(next);
  }, []);

  const clearSelection = useCallback(() => select(null), [select]);

  const podIdAt = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y);
    const pod = el?.closest?.('[data-fv-pod]') as HTMLElement | null;
    return pod?.dataset.fvPod ?? null;
  };

  const sideOf = (podId: string): PodSide | null => {
    const el = document.querySelector(`[data-fv-pod="${CSS.escape(podId)}"]`);
    const side = (el as HTMLElement | null)?.dataset?.fvSide;
    return side === 'source' || side === 'target' ? side : null;
  };

  /** pointerdown handler the surface attaches to every pod. */
  const handlePodPointerDown = useCallback(
    (podId: string, side: PodSide) => (e: ReactPointerEvent) => {
      if (e.button !== undefined && e.button !== 0) return; // primary presses only
      if (enabledRef.current && !enabledRef.current()) return;
      sessionRef.current = {
        pointerId: e.pointerId,
        podId,
        side,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
      };
    },
    [],
  );

  // Window-level move/up while a press is live. Bound once, gated by sessionRef.
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (!s.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        s.dragging = true;
        setGhost({ podId: s.podId, side: s.side, x: e.clientX, y: e.clientY });
      } else if (s.dragging) {
        setGhost((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev));
      }
    };

    const finishSession = (e: PointerEvent, cancelled: boolean) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      sessionRef.current = null;
      setGhost(null);

      if (cancelled) return;

      if (s.dragging) {
        // Drop: attempt a pair with whatever opposite-side pod is under the pointer.
        const dropPodId = podIdAt(e.clientX, e.clientY);
        if (dropPodId && dropPodId !== s.podId) {
          const dropSide = sideOf(dropPodId);
          if (dropSide && dropSide !== s.side) {
            select(null);
            const pair = s.side === 'source' ? [s.podId, dropPodId] : [dropPodId, s.podId];
            attemptRef.current(pair[0], pair[1]);
            return;
          }
        }
        return; // dropped nowhere useful — cancel, keep selection unchanged
      }

      // Plain tap on pod (s.podId / s.side).
      const tapped = { podId: s.podId, side: s.side };
      const prev = selectedRef.current;
      if (prev && prev.side === tapped.side) {
        select(prev.podId === tapped.podId ? null : tapped); // toggle off / switch
      } else if (prev) {
        // Opposite side already selected → attempt the pair now.
        const pair = prev.side === 'source' ? [prev.podId, tapped.podId] : [tapped.podId, prev.podId];
        select(null);
        attemptRef.current(pair[0], pair[1]);
      } else {
        select(tapped); // first selection
      }
    };

    const onPointerUp = (e: PointerEvent) => finishSession(e, false);
    const onPointerCancel = (e: PointerEvent) => finishSession(e, true);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  }, []);

  return {
    /** Current tap-selection (for pod highlighting). */
    selected,
    /** Live drag ghost position (render a floating pod at x/y), null when not dragging. */
    ghost,
    /** Clear the tap-selection (call on wave rebuild / reset). */
    clearSelection,
    /** Props each pod must spread: data attrs + pointer handler + touch-action. */
    podProps: (podId: string, side: PodSide) => ({
      'data-fv-pod': podId,
      'data-fv-side': side,
      onPointerDown: handlePodPointerDown(podId, side),
      style: { touchAction: 'none' as const },
    }),
  };
}
