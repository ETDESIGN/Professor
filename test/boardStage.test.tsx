import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BoardStage, { stageScale, STAGE_W, STAGE_H } from '../components/shared/BoardStage';

// jsdom has no ResizeObserver — capture instances so tests can fire entries.
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  static callback: (entries: { contentRect: { width: number; height: number } }[]) => void = () => {};
  constructor(cb: (entries: any[]) => void) {
    MockResizeObserver.callback = cb;
    MockResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  MockResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

describe('stageScale (pure math)', () => {
  it('is exactly 1.0 at the design point 1280×720', () => {
    expect(stageScale(1280, 720)).toBe(1);
  });
  it('letterboxes an iPad-mini landscape viewport (width-bound)', () => {
    expect(stageScale(1133, 744)).toBeCloseTo(1133 / 1280, 5);
  });
  it('is height-bound on an iPhone landscape viewport', () => {
    expect(stageScale(844, 390)).toBeCloseTo(390 / 720, 5);
  });
  it('is width-bound on a portrait phone', () => {
    expect(stageScale(390, 844)).toBeCloseTo(390 / 1280, 5);
  });
  it('upscales on a 1080p projector', () => {
    expect(stageScale(1920, 1080)).toBeCloseTo(1.5, 5);
  });
});

describe('BoardStage (component)', () => {
  it('renders a 1280×720 inner stage scaled to the measured container', async () => {
    const { container } = render(
      <BoardStage>
        <div>game</div>
      </BoardStage>,
    );
    const outer = container.firstElementChild as HTMLElement;
    const stage = outer.firstElementChild as HTMLElement;

    // The mount-time layout-effect measure ran before these clientWidth stubs
    // existed, so only the ResizeObserver path drives k in this test.
    const widthSpy = vi.spyOn(outer, 'clientWidth', 'get').mockReturnValue(744);
    const heightSpy = vi.spyOn(outer, 'clientHeight', 'get').mockReturnValue(1133);
    // A later ResizeObserver notification (URL bar etc.).
    await act(async () => {
      MockResizeObserver.callback([{ contentRect: { width: 744, height: 1133 } }]);
    });

    await waitFor(() => {
      expect(stage.style.width).toBe(`${STAGE_W}px`);
      expect(stage.style.height).toBe(`${STAGE_H}px`);
      expect(stage.style.transform).toBe(`scale(${744 / 1280})`);
      expect(stage.style.getPropertyValue('--stage-scale')).toBe(`${744 / 1280}`);
      expect(stage.style.getPropertyValue('container-type')).toBe('size');
    });
    widthSpy.mockRestore();
    heightSpy.mockRestore();
  });
});
