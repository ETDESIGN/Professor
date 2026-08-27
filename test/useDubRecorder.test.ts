import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ClipLine } from '../services/DubbingService';

vi.mock('../services/logger', () => ({
  createClientLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../services/SpeechService', () => ({
  captureTranscript: () => null, // unsupported → transcript capture skipped
}));

import { buildLineWindows, useDubRecorder } from '../apps/student/dubbing/useDubRecorder';

function line(id: string, order: number, startMs: number, endMs: number): ClipLine {
  return { id, order, text: `line ${id}`, startMs, endMs, characterName: null };
}

describe('buildLineWindows', () => {
  it('returns empty array for no lines', () => {
    expect(buildLineWindows([], 10_000)).toEqual([]);
  });

  it('builds ordered windows with 1500ms countdown lead', () => {
    const windows = buildLineWindows([line('a', 0, 3000, 5000), line('b', 1, 6000, 8000)], 10_000);
    expect(windows.map((w) => w.lineId)).toEqual(['a', 'b']);
    expect(windows[0]).toMatchObject({ startMs: 3000, endMs: 5000, leadMs: 1500 });
    expect(windows[1]).toMatchObject({ startMs: 6000, endMs: 8000, leadMs: 4500 });
    expect(windows.map((w) => w.index)).toEqual([0, 1]);
  });

  it('clamps lead to >= 0 when the line starts in less than 1500ms', () => {
    const windows = buildLineWindows([line('a', 0, 800, 2000)], 10_000);
    expect(windows[0].leadMs).toBe(0);
  });

  it('enforces non-overlap: clamps a late line start to the previous end', () => {
    const windows = buildLineWindows([line('a', 0, 1000, 3000), line('b', 1, 2000, 4500)], 10_000);
    expect(windows[1].startMs).toBe(3000);
    expect(windows[1].endMs).toBe(4500);
    expect(windows.map((w) => w.startMs)).toEqual([1000, 3000]);
  });

  it('throws when clamping leaves no positive window', () => {
    expect(() => buildLineWindows([line('a', 0, 1000, 3000), line('b', 1, 2500, 2800)], 10_000)).toThrow(
      /overlap|after start/i,
    );
  });

  it('throws when end <= start on the input line', () => {
    expect(() => buildLineWindows([line('a', 0, 2000, 2000)], 10_000)).toThrow(/after start/i);
  });

  it('clamps endMs to the video duration', () => {
    const windows = buildLineWindows([line('a', 0, 8000, 12_000)], 10_000);
    expect(windows[0].endMs).toBe(10_000);
  });

  it('sorts windows by startMs regardless of order field', () => {
    const windows = buildLineWindows([line('b', 1, 6000, 7000), line('a', 0, 1000, 2000)], 10_000);
    expect(windows.map((w) => w.lineId)).toEqual(['a', 'b']);
  });
});

// ── Hook-level regression: blob→line attribution race ────────────────────────
// ondataavailable fires asynchronously AFTER stop(); the rAF loop may already
// have started line N+1. The pending line is snapshotted at stop() time so a
// late chunk is attributed to the line that was STOPPED, not the next one.
describe('useDubRecorder blob attribution', () => {
  let rafQueue: FrameRequestCallback[];
  const video: HTMLVideoElement = document.createElement('video');
  let recorderInstances: any[];

  class FakeRecorder {
    static instances: any[] = [];
    state = 'inactive';
    ondataavailable: ((ev: { data: Blob }) => void) | null = null;
    constructor(_stream: any) {
      FakeRecorder.instances.push(this);
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      // NOTE: does NOT fire ondataavailable synchronously — the test fires it late.
    }
    fireChunkLate(data: Blob) {
      this.ondataavailable?.({ data });
    }
  }

  beforeEach(() => {
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    FakeRecorder.instances = [];
    recorderInstances = FakeRecorder.instances;
    rafQueue = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    (navigator as any).mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }),
    };
    video.play = vi.fn().mockResolvedValue(undefined) as any;
    video.pause = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    act(() => {
      // let hook cleanup run on unmount (renderHandle.unmount in the test)
    });
  });

  /** Run one rAF tick at the given video time (ms). */
  const tickAt = (ms: number) => {
    video.currentTime = ms / 1000;
    const cbs = rafQueue.splice(0);
    act(() => {
      cbs.forEach((cb) => cb(performance.now()));
    });
  };

  it('attributes a late dataavailable chunk to the stopped line, not the next one', async () => {
    const lines = [line('a', 0, 1000, 2000), line('b', 1, 3000, 4000)];
    const captured: Array<[string, Blob, string]> = [];
    const handle = renderHook(() =>
      useDubRecorder({
        videoEl: video,
        lines,
        durationMs: 6000,
        onLineCaptured: (lineId, blob, transcript) => captured.push([lineId, blob, transcript]),
      }),
    );

    act(() => {
      handle.result.current.startPass();
    });
    // Let the async getUserMedia + setup settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Enter line a's window → recorder.start().
    tickAt(1500);
    expect(handle.result.current.state).toBe('recording_line');
    expect(recorderInstances[0].state).toBe('recording');

    // Leave line a's window → stop() with a snapshotted as pending.
    tickAt(2100);
    expect(recorderInstances[0].state).toBe('inactive');

    // Enter line b's window → start() again BEFORE a's chunk lands.
    tickAt(3500);
    expect(handle.result.current.state).toBe('recording_line');
    expect(recorderInstances[0].state).toBe('recording');

    // NOW the browser delivers line a's chunk (late) — must map to 'a'.
    act(() => {
      recorderInstances[0].fireChunkLate(new Blob(['chunk-a'], { type: 'audio/webm' }));
    });
    expect(captured.map((c) => c[0])).toEqual(['a']);
    expect(handle.result.current.lineBlobs['a']).toBeInstanceOf(Blob);

    // Finish line b; its chunk must map to 'b'.
    tickAt(4100);
    expect(recorderInstances[0].state).toBe('inactive');
    act(() => {
      recorderInstances[0].fireChunkLate(new Blob(['chunk-b'], { type: 'audio/webm' }));
    });
    expect(captured.map((c) => c[0])).toEqual(['a', 'b']);
    expect(handle.result.current.lineBlobs['b']).toBeInstanceOf(Blob);

    handle.unmount();
  });
});
