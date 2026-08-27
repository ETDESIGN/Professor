import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Loader2, Mic, RefreshCw, Share2, Star, Video } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  DubbingService,
  type ClipLine,
  type DubbingClip,
  type LineScore,
} from '../../services/DubbingService';
import { GamificationService } from '../../services/GamificationService';
import { useDubRecorder, buildLineWindows } from './dubbing/useDubRecorder';
import DubPlayer from '../../components/shared/DubPlayer';
import { createClientLogger } from '../../services/logger';

const log = createClientLogger('DubbingStudio');

type ClipWithLines = DubbingClip & { lines?: ClipLine[] };
type Phase = 'pick' | 'watch' | 'record' | 'result';

interface DubbingStudioProps {
  onBack: () => void;
}

// ── Capability check (pattern kept from the previous implementation) ─────────
function recordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function bandFromScores(scores: Record<string, LineScore | null>, lines: ClipLine[]): 'great' | 'almost' | 'try_again' | null {
  const vals = lines.map((l) => scores[l.id]).filter((s): s is LineScore => !!s);
  if (vals.length === 0) return null;
  const great = vals.filter((s) => s.band === 'great').length;
  const bad = vals.filter((s) => s.band === 'try_again').length;
  if (bad === 0 && great >= Math.ceil(vals.length / 2)) return 'great';
  if (bad >= Math.ceil(vals.length / 2)) return 'try_again';
  return 'almost';
}

const BAND_LABEL: Record<string, string> = {
  great: 'Great!',
  almost: 'Almost there',
  try_again: 'Try again',
};

const DubbingStudio: React.FC<DubbingStudioProps> = ({ onBack }) => {
  const [phase, setPhase] = useState<Phase>('pick');
  const [clips, setClips] = useState<ClipWithLines[]>([]);
  const [clipsLoading, setClipsLoading] = useState(true);
  const [newClipIds, setNewClipIds] = useState<Set<string>>(new Set());
  const [clip, setClip] = useState<ClipWithLines | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const [lineScores, setLineScores] = useState<Record<string, LineScore | null>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [published, setPublished] = useState(false);
  /** Snapshot of the take's blobs, taken when the pass is finished (hook state is cleared on reset). */
  const [finalBlobs, setFinalBlobs] = useState<Record<string, Blob>>({});
  /** The saved take's dubbing row id — Share reuses this row instead of creating a duplicate take. */
  const savedDubbingIdRef = useRef<string | null>(null);
  /** XP already granted for this take (10 private, top-up 5 on publish → exactly 15 published / 10 private). */
  const xpGivenRef = useRef(0);
  const [activeSubIdx, setActiveSubIdx] = useState(-1);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafWaveRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const lines = useMemo(() => clip?.lines ?? [], [clip]);

  // ── Recorder hook (timing core) ─────────────────────────────────────────────
  const blobUrlMap = useRef<Record<string, string>>({});
  const recorder = useDubRecorder({
    videoEl: videoRef.current,
    lines,
    durationMs: clip?.videoDurationMs ?? 0,
    onLineCaptured: (lineId, blob, transcript) => {
      evaluateLine(lineId, blob, transcript);
    },
  });

  // ── Data load ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [myClips, myDubs] = await Promise.all([
          DubbingService.listMyClips(),
          DubbingService.myDubs(),
        ]);
        if (cancelled) return;
        setClips(myClips);
        const dubbed = new Set(myDubs.map((d) => d.clipId));
        setNewClipIds(new Set(myClips.filter((c) => !dubbed.has(c.id)).map((c) => c.id)));
      } catch (err) {
        log.warn('list_clips_failed', { error: err instanceof Error ? err.message : String(err) });
        toast.error('Could not load your dubbing clips.');
      } finally {
        if (!cancelled) setClipsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Revoke object URLs on unmount.
  useEffect(() => {
    return () => {
      Object.values(blobUrlMap.current).forEach((u) => URL.revokeObjectURL(u));
      if (rafWaveRef.current) cancelAnimationFrame(rafWaveRef.current);
      try {
        audioCtxRef.current?.close();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // The <video> element is re-mounted per phase; the hook receives
  // videoRef.current as a prop on every render so it tracks the live element.

  const openClip = useCallback(async (c: ClipWithLines) => {
    // Guard: malformed/overlapping lines must not crash the screen.
    try {
      buildLineWindows(c.lines ?? [], c.videoDurationMs);
    } catch {
      toast.error('This clip has invalid line timings. Ask your teacher to fix it.');
      return;
    }
    setClip(c);
    setLineScores({});
    setSaveState('idle');
    setPublished(false);
    setFinalBlobs({});
    savedDubbingIdRef.current = null;
    xpGivenRef.current = 0;
    setPhase('watch');
    try {
      const url = await DubbingService.signedUrl(c.videoPath);
      setVideoUrl(url);
    } catch (err) {
      log.warn('signed_url_failed', { error: err instanceof Error ? err.message : String(err) });
      toast.error('Could not load the video.');
      setPhase('pick');
    }
  }, []);

  // ── Per-line instant evaluation (one line per request, fired per line) ──────
  const evaluateLine = useCallback(async (lineId: string, blob: Blob, transcript: string) => {
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;
    try {
      const b64 = await blobToBase64(blob);
      const { results } = await DubbingService.evaluateTake(clip?.id ?? '', [
        { lineId, text: line.text, transcript: transcript || undefined, audioBase64: b64 },
      ]);
      setLineScores((prev) => ({ ...prev, [lineId]: results[lineId] ?? null }));
    } catch (err) {
      log.warn(`line_eval_failed line=${lineId}`, { error: err instanceof Error ? err.message : String(err) });
      setLineScores((prev) => ({ ...prev, [lineId]: null })); // AI down → pending
    }
  }, [lines, clip]);

  // ── Waveform (AnalyserNode pattern kept from the previous implementation) ───
  useEffect(() => {
    if (phase !== 'record') {
      if (rafWaveRef.current) cancelAnimationFrame(rafWaveRef.current);
      rafWaveRef.current = null;
      return;
    }
    const start = () => {
      const node = analyserRef.current;
      const canvas = canvasRef.current;
      if (!node || !canvas) {
        rafWaveRef.current = requestAnimationFrame(start);
        return;
      }
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) return;
      const bufferLength = node.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const draw = () => {
        rafWaveRef.current = requestAnimationFrame(draw);
        node.getByteTimeDomainData(dataArray);
        ctx2d.fillStyle = 'rgb(15, 23, 42)';
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
        ctx2d.lineWidth = 2;
        ctx2d.strokeStyle = 'rgb(34, 197, 94)';
        ctx2d.beginPath();
        const sliceWidth = canvas.width / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * canvas.height) / 2;
          if (i === 0) ctx2d.moveTo(x, y);
          else ctx2d.lineTo(x, y);
          x += sliceWidth;
        }
        ctx2d.lineTo(canvas.width, canvas.height / 2);
        ctx2d.stroke();
      };
      draw();
    };
    rafWaveRef.current = requestAnimationFrame(start);
    return () => {
      if (rafWaveRef.current) cancelAnimationFrame(rafWaveRef.current);
      rafWaveRef.current = null;
    };
  }, [phase, recorder.analyser]);

  // Keep our analyser ref in sync with the hook's.
  useEffect(() => {
    analyserRef.current = recorder.analyser;
  }, [recorder.analyser]);

  // Subtitle tracking during Watch.
  const onTimeUpdate = useCallback(() => {
    if (phase !== 'watch') return;
    const t = (videoRef.current?.currentTime ?? 0) * 1000;
    const idx = lines.findIndex((l) => t >= l.startMs && t <= l.endMs);
    setActiveSubIdx(idx);
  }, [phase, lines]);

  // ── Save + publish flow ─────────────────────────────────────────────────────
  // Invariants (review fix round 1):
  //   - ONE dubbing row per take: creation is guarded by savedDubbingIdRef;
  //     Share with class re-publishes the SAME row (never a duplicate take).
  //   - XP per take, exactly once per tier: 10 on private save, top-up +5 on
  //     publish → exactly 15 published / 10 private-only.
  const saveTake = useCallback(async (): Promise<string | null> => {
    if (!clip) return null;
    if (savedDubbingIdRef.current) return savedDubbingIdRef.current; // already saved
    if (saveState === 'saving') return null;
    setSaveState('saving');
    try {
      const prior = await DubbingService.myDubs(clip.id);
      const attemptNo = prior.length + 1;
      const dubbingId = await DubbingService.createDubbing(clip.id, attemptNo);
      const lineAudio: Record<string, string> = {};
      for (const line of lines) {
        const blob = finalBlobs[line.id];
        if (!blob) continue;
        lineAudio[line.id] = await DubbingService.uploadLineAudio(dubbingId, line.id, blob);
      }
      const perLineScores: Record<string, LineScore> = {};
      for (const [k, v] of Object.entries(lineScores)) {
        if (v) perLineScores[k] = v;
      }
      const overall = bandFromScores(lineScores, lines);
      // AI-down path: persist with overallBand null → UI shows "Score pending".
      await DubbingService.saveTake({
        dubbingId,
        lineAudio,
        perLineScores,
        overallBand: (overall ?? null) as unknown as string,
      });
      savedDubbingIdRef.current = dubbingId;
      setSaveState('saved');
      // Private-save XP: 10, exactly once per take.
      if (xpGivenRef.current < 10) {
        try {
          await GamificationService.awardXP(10, 'dubbing_complete_private');
          xpGivenRef.current = 10;
        } catch (err) {
          log.warn('xp_failed', { error: err instanceof Error ? err.message : String(err) });
        }
      }
      return dubbingId;
    } catch (err) {
      log.warn('save_failed', { error: err instanceof Error ? err.message : String(err) });
      toast.error('Could not save your take. Please try again.');
      setSaveState('idle');
      return null;
    }
  }, [clip, lines, lineScores, finalBlobs, saveState]);

  const goResult = useCallback(() => {
    videoRef.current?.pause();
    // Snapshot the blobs BEFORE reset clears the hook state, then release the
    // mic/AnalyserNode/AudioContext so no recording indicator stays live.
    const snapshot = { ...recorder.lineBlobs };
    recorder.reset();
    setFinalBlobs(snapshot);
    // Object URLs for DubPlayer playback.
    const urls: Record<string, string> = {};
    for (const [lineId, blob] of Object.entries(snapshot)) {
      urls[lineId] = URL.createObjectURL(blob);
    }
    blobUrlMap.current = urls;
    setPhase('result');
    void saveTake();
  }, [recorder, saveTake]);

  const shareWithClass = useCallback(async () => {
    const dubbingId = await saveTake();
    if (!dubbingId) return;
    try {
      await DubbingService.publishDubbing(dubbingId); // publish the SAME take
      setPublished(true);
      // Top-up so the published total is exactly 15 (10 already granted).
      if (xpGivenRef.current < 15) {
        await GamificationService.awardXP(15 - xpGivenRef.current, 'dubbing_complete');
        xpGivenRef.current = 15;
      }
      toast.success('Shared with your class!');
    } catch (err) {
      log.warn('publish_failed', { error: err instanceof Error ? err.message : String(err) });
      toast.error('Could not share your take.');
    }
  }, [saveTake]);

  const tryAgain = useCallback(() => {
    Object.values(blobUrlMap.current).forEach((u) => URL.revokeObjectURL(u));
    blobUrlMap.current = {};
    setLineScores({});
    setSaveState('idle');
    setPublished(false);
    setFinalBlobs({});
    savedDubbingIdRef.current = null;
    xpGivenRef.current = 0;
    recorder.reset();
    setPhase('watch');
  }, [recorder]);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!recordingSupported()) {
    return (
      <div className="h-dvh bg-slate-900 text-white flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
          <Mic size={28} className="text-slate-400" />
        </div>
        <h1 className="text-xl font-bold">Please update your browser</h1>
        <p className="text-sm text-slate-400 max-w-xs">
          Voice dubbing needs microphone recording, which this browser does not support. Try the latest Chrome, Safari, or Edge.
        </p>
        <button onClick={onBack} className="mt-2 px-4 py-2 bg-white/10 rounded-xl text-sm font-bold">
          Go back
        </button>
      </div>
    );
  }

  const activeLine = activeSubIdx >= 0 ? lines[activeSubIdx] : null;
  const recLine = recorder.activeLineIndex >= 0 ? lines[recorder.activeLineIndex] : null;
  const recordedCount = Object.keys(recorder.lineBlobs).length;

  return (
    <div className="h-dvh bg-slate-900 text-white font-sans max-w-md mx-auto flex flex-col">
      <header className="p-4 flex justify-between items-center z-10 shrink-0">
        <button
          onClick={() => {
            if (phase === 'record') { recorder.reset(); }
            if (phase === 'pick') onBack();
            else { setPhase('pick'); setClip(null); setVideoUrl(null); }
          }}
          className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
          aria-label="Back"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            {phase === 'pick' ? 'Dubbing' : 'Dubbing Studio'}
          </span>
          {clip && <span className="font-bold text-sm">{clip.title}</span>}
        </div>
        <div className="w-10" />
      </header>

      {/* ── Pick phase ── */}
      {phase === 'pick' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {clipsLoading && (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="animate-spin" />
            </div>
          )}
          {!clipsLoading && clips.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <Video className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">No dubbing clips assigned yet. Check back soon!</p>
            </div>
          )}
          {clips.map((c) => (
            <button
              key={c.id}
              onClick={() => void openClip(c)}
              className="w-full flex items-center gap-4 p-4 bg-slate-800 rounded-2xl border border-slate-700 hover:border-slate-500 transition-colors text-left"
            >
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                <Video size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{c.title}</div>
                <div className="text-xs text-slate-400">
                  {(c.lines?.length ?? 0)} lines · {Math.round(c.videoDurationMs / 1000)}s
                </div>
              </div>
              {newClipIds.has(c.id) && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase">
                  New
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Watch phase ── */}
      {phase === 'watch' && (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 bg-black relative">
            <video
              ref={videoRef}
              src={videoUrl ?? undefined}
              className="w-full h-full object-contain"
              autoPlay
              playsInline
              onTimeUpdate={onTimeUpdate}
              onEnded={() => setActiveSubIdx(-1)}
            />
            {activeLine && (
              <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black to-transparent">
                <p className="text-center text-lg font-medium">{activeLine.text}</p>
              </div>
            )}
          </div>
          <div className="p-6 bg-slate-800 border-t border-slate-700">
            <p className="text-sm text-slate-400 mb-4 text-center">
              Watch the clip once, then record your voice over it.
            </p>
            <button
              onClick={() => {
                videoRef.current?.pause();
                setPhase('record');
              }}
              disabled={!videoUrl}
              className="w-full py-4 rounded-2xl bg-red-500 hover:bg-red-600 disabled:opacity-50 font-bold flex items-center justify-center gap-2"
            >
              <Mic size={20} /> Start dubbing
            </button>
          </div>
        </div>
      )}

      {/* ── Record pass phase ── */}
      {phase === 'record' && (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 bg-black relative">
            <video ref={videoRef} src={videoUrl ?? undefined} className="w-full h-full object-contain" muted playsInline />
          </div>

          <div className="bg-slate-800 border-t border-slate-700 p-6 flex flex-col gap-4">
            {/* Current line + progress */}
            <div className="text-center min-h-[72px]">
              {recorder.state === 'pass_done' ? (
                <p className="text-sm font-bold text-emerald-400">Pass complete! Review your lines below.</p>
              ) : recLine ? (
                <>
                  <div className="text-xs text-slate-400 font-bold uppercase mb-1">
                    {recorder.state === 'countdown' ? 'Get ready…' : 'Speak now'} ·{' '}
                    {Math.min(recordedCount + 1, lines.length)} of {lines.length}
                  </div>
                  <p className="text-xl font-semibold leading-snug">{recLine.text}</p>
                </>
              ) : (
                <p className="text-sm text-slate-400">Listen for your cue…</p>
              )}
            </div>

            {/* Mic ring + waveform */}
            {recorder.state !== 'pass_done' && (
              <div className="flex items-center justify-center gap-4">
                <div className="relative">
                  {(recorder.state === 'recording_line' || recorder.state === 'countdown') && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-4 border-red-500"
                      animate={{ scale: [1, 1.35, 1], opacity: [0.7, 0, 0.7] }}
                      transition={{ repeat: Infinity, duration: 1.4 }}
                    />
                  )}
                  <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center">
                    <Mic size={26} />
                  </div>
                </div>
                <div className="h-12 flex-1 bg-slate-900 rounded-lg border border-slate-700 overflow-hidden relative">
                  <canvas ref={canvasRef} width={400} height={48} className="w-full h-full absolute inset-0" />
                </div>
              </div>
            )}

            {/* Controls */}
            {recorder.state === 'idle' || recorder.state === 'watching' || recorder.state === 'countdown' ? (
              <button
                onClick={recorder.startPass}
                className="w-full py-4 rounded-2xl bg-red-500 hover:bg-red-600 font-bold flex items-center justify-center gap-2"
              >
                <Mic size={20} /> Tap to record
              </button>
            ) : recorder.state === 'pass_done' ? (
              <div className="space-y-3">
                <div className="max-h-44 overflow-y-auto space-y-2">
                  {lines.map((l) => {
                    const s = lineScores[l.id];
                    return (
                      <div key={l.id} className="flex items-center gap-2 bg-slate-900 rounded-xl p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate text-slate-300">{l.text}</p>
                          {!s && <span className="text-[10px] text-slate-500">Score pending…</span>}
                          {s && (
                            <span
                              className={`text-[10px] font-bold uppercase ${
                                s.band === 'great' ? 'text-emerald-400' : s.band === 'almost' ? 'text-yellow-400' : 'text-red-400'
                              }`}
                            >
                              {BAND_LABEL[s.band] ?? s.band} · {Math.round(s.wordMatch * 100)}%
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => recorder.rerecordLine(l.id)}
                          className="p-2 bg-white/10 rounded-full hover:bg-white/20 shrink-0"
                          aria-label={`Redo line ${l.order + 1}`}
                          title="Redo this line"
                        >
                          <RefreshCw size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={goResult}
                  className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 font-bold"
                >
                  See my results
                </button>
              </div>
            ) : (
              <div className="text-center text-xs text-slate-500 py-2">Recording… stay quiet between lines.</div>
            )}
          </div>
        </div>
      )}

      {/* ── Result phase ── */}
      {phase === 'result' && clip && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {videoUrl && Object.keys(blobUrlMap.current).length > 0 ? (
            <DubPlayer
              videoUrl={videoUrl}
              lines={lines}
              lineAudioUrls={blobUrlMap.current}
              className="w-full rounded-2xl bg-black"
            />
          ) : (
            <div className="aspect-video bg-black rounded-2xl flex items-center justify-center text-slate-500 text-sm">
              {saveState === 'saving' ? 'Saving your take…' : 'No recording to play back.'}
            </div>
          )}

          {/* Score card */}
          <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Star className="text-yellow-400 w-5 h-5 fill-yellow-400" />
                <span className="font-bold">
                  {(() => {
                    const b = bandFromScores(lineScores, lines);
                    if (saveState === 'saving') return 'Scoring…';
                    return b ? BAND_LABEL[b] ?? b : 'Score pending';
                  })()}
                </span>
              </div>
              {published && (
                <span className="px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase">
                  Shared with class
                </span>
              )}
            </div>
            <div className="space-y-2">
              {lines.map((l) => {
                const s = lineScores[l.id];
                return (
                  <div key={l.id} className="bg-slate-900 rounded-xl p-3">
                    <p className="text-xs text-slate-300 mb-1">{l.text}</p>
                    {s ? (
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            s.band === 'great'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : s.band === 'almost'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {BAND_LABEL[s.band] ?? s.band}
                        </span>
                        <span className="text-[11px] text-slate-400">{s.feedback || Math.round(s.wordMatch * 100) + '% match'}</span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-500">Score pending — your teacher can still hear your dub.</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pb-6">
            <button
              onClick={tryAgain}
              disabled={saveState === 'saving'}
              className="py-3 rounded-2xl bg-white/10 hover:bg-white/20 font-bold text-sm disabled:opacity-50"
            >
              Try again
            </button>
            <button
              onClick={() => void shareWithClass()}
              disabled={saveState === 'saving' || published}
              className="py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-600 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saveState === 'saving' ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
              {published ? 'Shared' : 'Share with class'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const s = String(reader.result ?? '');
      resolve(s.slice(s.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export default DubbingStudio;
