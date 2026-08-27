import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClipLine } from '../../../services/DubbingService';
import { captureTranscript } from '../../../services/SpeechService';
import { createClientLogger } from '../../../services/logger';

const log = createClientLogger('useDubRecorder');

/** Countdown lead time before each line window (ms). */
export const COUNTDOWN_LEAD_MS = 1500;

export type LineWindow = {
  lineId: string;
  /** 0-based running index in the validated, ordered window list. */
  index: number;
  startMs: number;
  endMs: number;
  /** When to show the countdown for this line — 1500ms before startMs, clamped >= 0. */
  leadMs: number;
};

export type RecorderState =
  | 'idle'
  | 'watching'
  | 'countdown'
  | 'recording_line'
  | 'line_done'
  | 'pass_done';

/**
 * Validates and normalizes clip lines into recording windows.
 *
 * Rules:
 * - Windows are sorted by startMs.
 * - endMs is clamped to the video duration.
 * - Non-overlap is ENFORCED: a line starting before the previous window's
 *   end is clamped to start at that end; if that leaves no positive-length
 *   window, throws Error('Lines overlap').
 * - endMs <= startMs (after clamping) throws Error('Line end must be after start').
 * - leadMs = max(0, startMs - 1500).
 */
export function buildLineWindows(lines: ClipLine[], durationMs: number): LineWindow[] {
  const sorted = [...lines].sort((a, b) => a.startMs - b.startMs);
  const windows: LineWindow[] = [];
  let prevEnd = 0;
  for (let i = 0; i < sorted.length; i++) {
    const l = sorted[i];
    let start = Math.max(0, l.startMs);
    let end = Math.min(l.endMs, durationMs);
    if (start < prevEnd) start = prevEnd; // non-overlap enforcement
    if (end <= start) {
      // Distinguish a degenerate input line from an overlap-created one.
      if (l.endMs <= l.startMs) throw new Error('Line end must be after start');
      throw new Error('Lines overlap');
    }
    windows.push({
      lineId: l.id,
      index: i,
      startMs: start,
      endMs: end,
      leadMs: Math.max(0, start - COUNTDOWN_LEAD_MS),
    });
    prevEnd = end;
  }
  return windows;
}

type TranscriptEvent = { atMs: number; text: string };

export type UseDubRecorderProps = {
  videoEl: HTMLVideoElement | null;
  lines: ClipLine[];
  durationMs: number;
  /** Fired when a line's blob is captured (pass or rerecord). */
  onLineCaptured?: (lineId: string, blob: Blob, transcript: string) => void;
};

export type UseDubRecorderResult = {
  state: RecorderState;
  activeLineIndex: number;
  lineBlobs: Record<string, Blob>;
  lineTranscripts: Record<string, string>;
  /** Live analyser for waveform rendering; null when mic is off. */
  analyser: AnalyserNode | null;
  startPass: () => void;
  rerecordLine: (lineId: string) => void;
  reset: () => void;
};

/**
 * One-pass dubbing recorder.
 *
 * Timing core: `startPass()` must be called inside the tap handler (iOS mic
 * gesture requirement). It acquires the mic, creates ONE MediaRecorder for
 * the whole session, seeks the (muted) video to 0 and plays it; an rAF loop
 * watches `video.currentTime` and drives the state machine:
 *   leadMs -> 'countdown', startMs -> recorder.start(), endMs -> recorder.stop()
 * A single recorder instance is reused with start/stop around each line
 * window (one chunk per line) — a new MediaRecorder per line is what breaks
 * iOS Safari. Fallback if a device drops stop/start chunks: use
 * `recorder.start(timeslice)` and cut the chunk stream by timestamps
 * (documented, not enabled — verify on the Task 8 device pass).
 *
 * Web Speech `captureTranscript` runs for the whole pass; final results are
 * timestamped and sliced into per-line transcripts by window.
 *
 * `rerecordLine(lineId)` replays ONLY that line's window muted (with its
 * lead) and replaces the blob. This works without a fresh gesture while the
 * mic session from the pass is still alive; otherwise the browser requires
 * a new tap (caller shows "tap to try again").
 */
export function useDubRecorder(props: UseDubRecorderProps): UseDubRecorderResult {
  const { videoEl, lines, durationMs, onLineCaptured } = props;

  const [state, setState] = useState<RecorderState>('idle');
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const [lineBlobs, setLineBlobs] = useState<Record<string, Blob>>({});
  const [lineTranscripts, setLineTranscripts] = useState<Record<string, string>>({});
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const windowsRef = useRef<LineWindow[]>([]);
  const windows = buildLineWindows(lines, durationMs);
  windowsRef.current = windows;

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const currentLineRef = useRef<LineWindow | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const transcriptEventsRef = useRef<TranscriptEvent[]>([]);
  const passStartRef = useRef<number>(0); // performance.now() at video t=0
  const cbRef = useRef(onLineCaptured);
  cbRef.current = onLineCaptured;

  const ensureMic = useCallback(async (): Promise<MediaRecorder | null> => {
    if (recorderRef.current && streamRef.current) return recorderRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    // Waveform analyser (best-effort).
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      const node = ctx.createAnalyser();
      node.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(node);
      audioCtxRef.current = ctx;
      setAnalyser(node);
    } catch (err) {
      log.warn('analyser_setup_failed', { error: err instanceof Error ? err.message : String(err) });
    }
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (ev) => {
      if (ev.data.size === 0 || !currentLineRef.current) return;
      const line = currentLineRef.current;
      const blob = new Blob([ev.data], { type: ev.data.type || 'audio/webm' });
      // Slice transcript events captured inside this window (relative to pass start).
      const win = line;
      const inWindow = transcriptEventsRef.current
        .filter((e) => e.atMs >= win.startMs - 300 && e.atMs <= win.endMs + 300)
        .map((e) => e.text)
        .join(' ');
      setLineBlobs((prev) => ({ ...prev, [line.lineId]: blob }));
      setLineTranscripts((prev) => ({ ...prev, [line.lineId]: inWindow }));
      cbRef.current?.(line.lineId, blob, inWindow);
    };
    recorderRef.current = recorder;
    return recorder;
  }, []);

  const startTranscript = useCallback(() => {
    transcriptEventsRef.current = [];
    try {
      recognitionRef.current = captureTranscript((_full) => {
        /* replaced below with timestamped capture */
      });
    } catch {
      /* best-effort */
    }
    if (!recognitionRef.current) return;
    const rec = recognitionRef.current as any;
    const prev = rec.onresult;
    rec.onresult = (event: any) => {
      const atMs = performance.now() - passStartRef.current;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcriptEventsRef.current.push({ atMs, text: event.results[i][0].transcript });
        }
      }
      prev?.(event);
    };
  }, []);

  const stopTranscript = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
  }, []);

  /**
   * rAF state machine over a window list (full pass or single rerecord).
   * `mode` 'pass' advances through all windows; 'rerecord' targets one.
   */
  const runLoop = useCallback(
    (mode: 'pass' | 'rerecord', target?: LineWindow) => {
      const video = videoEl;
      if (!video) return;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

      const wins = mode === 'pass' ? windowsRef.current : [target!];
      let winIdx = 0;

      const tick = () => {
        const t = video.currentTime * 1000;
        const win = wins[winIdx];

        if (!win) {
          // Past the last window.
          if (mode === 'pass') {
            setState('pass_done');
          } else {
            setState('pass_done'); // return to the post-pass UI
          }
          stopTranscript();
          rafRef.current = null;
          return;
        }

        if (t < win.leadMs && winIdx === 0 && mode === 'pass') {
          setState('watching');
          setActiveLineIndex(-1);
        } else if (t < win.startMs) {
          setState('countdown');
          setActiveLineIndex(win.index);
        } else if (t < win.endMs) {
          // Enter the line window: start the recorder chunk (guarded by
          // recorder state — setState does not refresh this closure).
          currentLineRef.current = win;
          const rec = recorderRef.current;
          if (rec && rec.state !== 'recording') {
            try {
              rec.start();
            } catch (err) {
              log.warn('recorder_start_failed', { error: err instanceof Error ? err.message : String(err) });
            }
          }
          setState('recording_line');
          setActiveLineIndex(win.index);
        } else {
          // Window finished: stop the recorder chunk for this line.
          const rec = recorderRef.current;
          if (rec && rec.state === 'recording') {
            try {
              rec.stop();
            } catch {
              /* ignore */
            }
          }
          if (mode === 'rerecord') {
            setState('pass_done');
            stopTranscript();
            rafRef.current = null;
            return;
          }
          setState('line_done');
          winIdx += 1;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [videoEl, stopTranscript],
  );

  const startPass = useCallback(() => {
    const video = videoEl;
    if (!video || windowsRef.current.length === 0) return;
    void (async () => {
      try {
        await ensureMic();
      } catch (err) {
        log.warn('mic_error', { error: err instanceof Error ? err.message : String(err) });
        return;
      }
      video.muted = true;
      video.currentTime = 0;
      passStartRef.current = performance.now();
      startTranscript();
      await video.play().catch(() => undefined);
      setLineBlobs({});
      setLineTranscripts({});
      setState('watching');
      runLoop('pass');
    })();
  }, [videoEl, ensureMic, startTranscript, runLoop]);

  const rerecordLine = useCallback(
    (lineId: string) => {
      const video = videoEl;
      const win = windowsRef.current.find((w) => w.lineId === lineId);
      if (!video || !win) return;
      if (!recorderRef.current || !streamRef.current) return; // mic session must be alive
      video.muted = true;
      video.currentTime = Math.max(0, win.startMs - 500) / 1000;
      // Recompute pass start so transcript timestamps map to video time again.
      passStartRef.current = performance.now() - video.currentTime * 1000;
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
      startTranscript();
      void video.play().catch(() => undefined);
      setState('countdown');
      runLoop('rerecord', win);
    },
    [videoEl, startTranscript, runLoop],
  );

  const reset = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    stopTranscript();
    try {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    } catch {
      /* ignore */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    try {
      audioCtxRef.current?.close();
    } catch {
      /* ignore */
    }
    audioCtxRef.current = null;
    setAnalyser(null);
    currentLineRef.current = null;
    setState('idle');
    setActiveLineIndex(-1);
    setLineBlobs({});
    setLineTranscripts({});
  }, [stopTranscript]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      try {
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        audioCtxRef.current?.close();
      } catch {
        /* ignore */
      }
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return { state, activeLineIndex, lineBlobs, lineTranscripts, analyser, startPass, rerecordLine, reset };
}
