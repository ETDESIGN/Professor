import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useMainScrollRestore } from '../apps/student/useMainScrollRestore';

// jsdom has no layout engine — pin the geometry the hook reads and replace
// the hook's dual drivers (rAF + setTimeout fallback) with manually-pumped
// queues so timing is deterministic.
let frames: Map<number, () => void>;
let timers: Map<number, () => void>;
let nextId: number;

beforeEach(() => {
  frames = new Map();
  timers = new Map();
  nextId = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    const id = nextId++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  vi.stubGlobal('setTimeout', (cb: () => void) => {
    const id = nextId++;
    timers.set(id, cb);
    return id;
  });
  vi.stubGlobal('clearTimeout', (id: number) => { timers.delete(id); });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const pump = (n = 1) => {
  for (let i = 0; i < n; i++) {
    const currentFrames = Array.from(frames.values());
    const currentTimers = Array.from(timers.values());
    frames.clear();
    timers.clear();
    currentFrames.forEach((cb) => cb());
    currentTimers.forEach((cb) => cb()); // fallback driver: no-op if rAF ran (ran-guard)
  }
};

function stubGeometry(el: HTMLElement, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollTop', { value: 0, writable: true, configurable: true });
}

function Harness({ isMainScreen }: { isMainScreen: boolean }) {
  const { containerRef, handleContainerScroll } = useMainScrollRestore(isMainScreen);
  return (
    <div
      ref={containerRef}
      onScroll={handleContainerScroll}
      data-testid="scroller"
      style={{ height: 800, overflow: 'auto' }}
    >
      <div style={{ height: 3000 }} />
    </div>
  );
}

describe('useMainScrollRestore', () => {
  it('restores the saved scroll position when the main screen comes back', () => {
    const { rerender } = render(<Harness isMainScreen={true} />);
    const el = screen.getByTestId('scroller') as HTMLDivElement;

    // User scrolled down on the main screen…
    stubGeometry(el, 3000, 800);
    el.scrollTop = 1200;
    fireEvent.scroll(el);
    pump(); // mount-time restore attempt (target was 0) aborts

    // …opened a lesson (layout unmounts → isMainScreen=false), came back.
    act(() => { rerender(<Harness isMainScreen={false} />); });
    el.scrollTop = 0;
    act(() => { rerender(<Harness isMainScreen={true} />); });
    pump();

    expect(el.scrollTop).toBe(1200);
  });

  it('waits for late-growing content before restoring', () => {
    const { rerender } = render(<Harness isMainScreen={true} />);
    const el = screen.getByTestId('scroller') as HTMLDivElement;

    stubGeometry(el, 1900, 800); // still animating/loading → too short for 1200
    el.scrollTop = 1200;
    fireEvent.scroll(el);
    pump();

    act(() => { rerender(<Harness isMainScreen={false} />); });
    el.scrollTop = 0;
    act(() => { rerender(<Harness isMainScreen={true} />); });
    pump();
    expect(el.scrollTop).toBe(0); // not yet — content too short

    stubGeometry(el, 3000, 800); // content finished growing
    pump();
    expect(el.scrollTop).toBe(1200);
  });

  it('does not restore scroll that happened on another tab view', () => {
    const { rerender } = render(<Harness isMainScreen={true} />);
    const el = screen.getByTestId('scroller') as HTMLDivElement;

    stubGeometry(el, 3000, 800);
    el.scrollTop = 1200;
    fireEvent.scroll(el);
    pump();

    // Tab switch: shorter content clamps the shared container and fires
    // a scroll event while off the main screen — must not be saved.
    act(() => { rerender(<Harness isMainScreen={false} />); });
    el.scrollTop = 60;
    fireEvent.scroll(el);
    pump();

    act(() => { rerender(<Harness isMainScreen={true} />); });
    pump();
    expect(el.scrollTop).toBe(1200);
  });

  it('yields once the user scrolls manually during restore', () => {
    const { rerender } = render(<Harness isMainScreen={true} />);
    const el = screen.getByTestId('scroller') as HTMLDivElement;

    stubGeometry(el, 1900, 800); // content short → restore would keep waiting
    el.scrollTop = 1200;
    fireEvent.scroll(el);
    pump();

    act(() => { rerender(<Harness isMainScreen={false} />); });
    el.scrollTop = 0;
    act(() => { rerender(<Harness isMainScreen={true} />); });
    fireEvent.wheel(el);
    pump();

    expect(el.scrollTop).toBe(0); // restore gave up, user keeps control
  });
});
