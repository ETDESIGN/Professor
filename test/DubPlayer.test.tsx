import React, { createRef } from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import DubPlayer, { DubPlayerHandle } from '../components/shared/DubPlayer';
import type { ClipLine } from '../services/DubbingService';

const lines: ClipLine[] = [
  { id: 'l1', order: 0, text: 'Hello', startMs: 0, endMs: 1000, characterName: 'A' },
  { id: 'l2', order: 1, text: 'World', startMs: 1500, endMs: 2500, characterName: 'B' },
];
const lineAudioUrls: Record<string, string> = {
  l1: 'https://example.com/l1.mp3',
  l2: 'https://example.com/l2.mp3',
};

describe('DubPlayer', () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;
  let rafCallbacks: FrameRequestCallback[];
  let onLineChange: (lineIndex: number) => void;
  let handle: React.RefObject<DubPlayerHandle>;

  beforeEach(() => {
    vi.useFakeTimers();
    playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    rafCallbacks = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    onLineChange = vi.fn<(lineIndex: number) => void>();
    handle = createRef<DubPlayerHandle>();
    render(
      <DubPlayer
        ref={handle}
        videoUrl="https://example.com/video.mp4"
        lines={lines}
        lineAudioUrls={lineAudioUrls}
        onLineChange={onLineChange}
      />
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const tick = () => {
    const cbs = rafCallbacks.splice(0);
    cbs.forEach((cb) => cb(performance.now()));
  };

  const audioPlays = (url: string) =>
    (playSpy.mock.contexts as HTMLMediaElement[]).filter((el) => el?.src === url).length;

  it('video element is always muted', () => {
    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.muted).toBe(true);
  });

  it('plays first line audio when playback starts at t=0', () => {
    const video = document.querySelector('video') as HTMLVideoElement;
    video.currentTime = 0;
    handle.current!.play();
    tick();
    expect(audioPlays(lineAudioUrls.l1)).toBe(1);
    expect(onLineChange).toHaveBeenCalledWith(0);
  });

  it('plays second line audio when currentTime passes 1500ms', () => {
    const video = document.querySelector('video') as HTMLVideoElement;
    handle.current!.play();
    tick();
    video.currentTime = 0.5;
    tick();
    video.currentTime = 1.6; // past 1500ms
    tick();
    expect(audioPlays(lineAudioUrls.l2)).toBe(1);
    expect(onLineChange).toHaveBeenCalledWith(1);
  });

  it('never double-plays the same line within one pass', () => {
    const video = document.querySelector('video') as HTMLVideoElement;
    handle.current!.play();
    tick();
    video.currentTime = 1.7;
    tick();
    tick();
    tick();
    expect(audioPlays(lineAudioUrls.l2)).toBe(1);
  });

  it('reports -1 when between lines', () => {
    const video = document.querySelector('video') as HTMLVideoElement;
    handle.current!.play();
    tick();
    video.currentTime = 1.2; // gap between 1000 and 1500
    tick();
    expect(onLineChange).toHaveBeenCalledWith(-1);
  });

  it('pause stops the current line audio', () => {
    const video = document.querySelector('video') as HTMLVideoElement;
    handle.current!.play();
    tick();
    video.currentTime = 1.6;
    tick();
    handle.current!.pause();
    const pausedContexts = pauseSpy.mock.contexts as HTMLMediaElement[];
    expect(pausedContexts.some((el) => el?.src === lineAudioUrls.l2)).toBe(true);
  });

  it('re-fires lines on a new playback pass (flags reset on play)', () => {
    const video = document.querySelector('video') as HTMLVideoElement;
    handle.current!.play();
    tick();
    video.currentTime = 1.6;
    tick();
    handle.current!.pause();
    handle.current!.play();
    video.currentTime = 0;
    tick();
    expect(audioPlays(lineAudioUrls.l1)).toBe(2);
  });
});
