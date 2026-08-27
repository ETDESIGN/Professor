import { describe, it, expect } from 'vitest';
import type { ClipLine } from '../services/DubbingService';
import { buildLineWindows } from '../apps/student/dubbing/useDubRecorder';

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
