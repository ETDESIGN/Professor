import React, { forwardRef, useCallback, useEffect, useRef } from 'react';
import type { ClipLine } from '../../services/DubbingService';

export type DubPlayerHandle = {
  play(): void;
  pause(): void;
};

export type DubPlayerProps = {
  /** Signed URL of the clip video (already signed by the caller). */
  videoUrl: string;
  /** Ordered clip lines defining the subtitle/audio windows. */
  lines: ClipLine[];
  /** lineId → signed audio URL for the recorded dubbing take. */
  lineAudioUrls: Record<string, string>;
  /** Notified on active-line change; -1 when between lines. */
  onLineChange?(lineIndex: number): void;
  className?: string;
};

/**
 * DubPlayer — plays the clip video (always muted) while triggering the
 * student's recorded per-line audio in sync, driven by an rAF loop that
 * compares `video.currentTime * 1000` against each line's window.
 *
 * The component receives ALREADY-SIGNED urls and never calls DubbingService
 * itself, keeping it testable and independent of auth.
 */
const DubPlayer = forwardRef<DubPlayerHandle, DubPlayerProps>(function DubPlayer(
  { videoUrl, lines, lineAudioUrls, onLineChange, className },
  ref
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioByLine = useRef<Map<string, HTMLAudioElement>>(new Map());
  const firedLines = useRef<Set<string>>(new Set());
  const rafId = useRef<number | null>(null);
  const playing = useRef(false);
  const activeIndex = useRef(-1);
  const onLineChangeRef = useRef(onLineChange);
  onLineChangeRef.current = onLineChange;

  // Preload per-line audio elements so playback start latency is ~0.
  useEffect(() => {
    const map = new Map<string, HTMLAudioElement>();
    for (const line of lines) {
      const url = lineAudioUrls[line.id];
      if (!url) continue; // lines without a recorded blob are silent
      const audio = new Audio(url);
      audio.preload = 'auto';
      map.set(line.id, audio);
    }
    audioByLine.current = map;
    return () => {
      for (const audio of map.values()) {
        audio.pause();
        audio.src = '';
      }
      map.clear();
    };
  }, [lines, lineAudioUrls]);

  const stopAllAudio = useCallback(() => {
    for (const audio of audioByLine.current.values()) {
      audio.pause();
    }
  }, []);

  const emitLineChange = useCallback((index: number) => {
    if (activeIndex.current !== index) {
      activeIndex.current = index;
      onLineChangeRef.current?.(index);
    }
  }, []);

  const cancelLoop = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    if (!playing.current) return;
    const video = videoRef.current;
    if (video) {
      const tMs = video.currentTime * 1000;
      let current = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (tMs >= line.startMs && tMs < line.endMs) {
          current = i;
          if (!firedLines.current.has(line.id)) {
            firedLines.current.add(line.id);
            const audio = audioByLine.current.get(line.id);
            if (audio) {
              try { audio.currentTime = 0; } catch { /* not loaded yet */ }
              void audio.play().catch(() => { /* autoplay rejection — silent */ });
            }
          }
          break;
        }
      }
      emitLineChange(current);
    }
    rafId.current = requestAnimationFrame(tick);
  }, [lines, emitLineChange]);

  const play = useCallback(() => {
    firedLines.current.clear();
    playing.current = true;
    const video = videoRef.current;
    if (video) {
      video.muted = true; // never unmuted
      void video.play().catch(() => { /* autoplay rejection */ });
    }
    cancelLoop();
    rafId.current = requestAnimationFrame(tick);
  }, [tick, cancelLoop]);

  const pause = useCallback(() => {
    playing.current = false;
    cancelLoop();
    stopAllAudio();
    videoRef.current?.pause();
  }, [cancelLoop, stopAllAudio]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Seeking resets fired flags so a re-entered window fires again cleanly.
    const onSeeked = () => {
      firedLines.current.clear();
      stopAllAudio();
    };
    video.addEventListener('seeked', onSeeked);
    return () => {
      video.removeEventListener('seeked', onSeeked);
    };
  }, [stopAllAudio]);

  // Unmount stops everything.
  useEffect(() => {
    return () => {
      playing.current = false;
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      rafId.current = null;
      for (const audio of audioByLine.current.values()) audio.pause();
      videoRef.current?.pause();
    };
  }, []);

  React.useImperativeHandle(ref, () => ({ play, pause }), [play, pause]);

  return (
    <video
      ref={videoRef}
      className={className}
      src={videoUrl}
      muted
      playsInline
      preload="auto"
    />
  );
});

export default DubPlayer;
