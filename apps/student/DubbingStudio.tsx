import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Loader2, Mic, RefreshCw, Share2, Star, Users, Video, Volume2, Play } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  DubbingService,
  type ClipLine,
  type DubbingClip,
  type LineScore,
} from '../../services/DubbingService';
import { GamificationService } from '../../services/GamificationService';
import { XP_REWARDS, QUEST_TYPES } from '../../constants/gamification';
import { useDubRecorder, buildLineWindows } from './dubbing/useDubRecorder';
import DubPlayer from '../../components/shared/DubPlayer';
import { playCue } from '../board/templates/playCue';
import { createClientLogger } from '../../services/logger';

const log = createClientLogger('DubbingStudio');

type ClipWithLines = DubbingClip & { lines?: ClipLine[] };
type Phase = 'pick' | 'watch' | 'record' | 'result';

interface DubbingStudioProps {
  onBack: () => void;
  /** Opens the class gallery (friends' published dubs). Optional — hidden when absent. */
  onOpenGallery?: () => void;
}

/** Owner decision 7 (2026-09-13): +1 gem for a 'great'-band PUBLISHED take (exactly-once latch). */
const DUBBING_GREAT_GEMS = 1;

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

const BAND_STARS: Record<string, number> = { great: 3, almost: 2, try_again: 1 };

const BAND_CHIP: Record<string, string> = {
  great: 'bg-[#E6F4F1] text-[#1E6F5C] border-[#2A9D8F]',
  almost: 'bg-[#FFF6E0] text-[#9A6B00] border-[#E9C46A]',
  try_again: 'bg-[#FEF2F2] text-[#C0392B] border-[#FF4B4B]',
};

const DubbingStudio: React.FC<DubbingStudioProps> = ({ onBack, onOpenGallery }) => {
  const [phase, setPhase] = useState<Phase>('pick');
  const [clips, setClips] = useState<ClipWithLines[]>([]);
  const [clipsLoading, setClipsLoading] = useState(true);
  const [newClipIds, setNewClipIds] = useState<Set<string>>(new Set());
  const [clip, setClip] = useState<ClipWithLines | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const [lineScores, setLineScores] = useState<Record<string, LineScore | null>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [published, setPublished] = useState(false);
  /**
   * Snapshot of the take's blobs, taken when the pass is finished (hook state
   * is cleared on reset). Kept in a REF so saveTake can read it in the same
   * event handler that produces it (see SNAPSHOT FLUSH INVARIANT below).
   */
  const finalBlobsRef = useRef<Record<string, Blob>>({});
  /** The saved take's dubbing row id — Share reuses this row instead of creating a duplicate take. */
  const savedDubbingIdRef = useRef<string | null>(null);
  /** XP already granted for this take (10 private, top-up 5 on publish → exactly 15 published / 10 private). */
  const xpGivenRef = useRef(0);
  /** Gems already granted for this take (+1 once, on a 'great' band publish). */
  const gemGivenRef = useRef(false);
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
      playCue('reveal'); // karaoke deck: a line was captured
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
    finalBlobsRef.current = {};
    savedDubbingIdRef.current = null;
    xpGivenRef.current = 0;
    gemGivenRef.current = false;
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
      const score = results[lineId] ?? null;
      if (score) playCue(score.band === 'great' ? 'correct' : score.band === 'try_again' ? 'wrong' : 'reveal');
      setLineScores((prev) => ({ ...prev, [lineId]: score }));
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
        ctx2d.fillStyle = '#1D3557';
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
        ctx2d.lineWidth = 2;
        ctx2d.strokeStyle = '#2A9D8F';
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

  // Result-screen celebration cue (owner sound directive).
  useEffect(() => {
    if (phase === 'result') playCue('win');
  }, [phase]);

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
  // SNAPSHOT FLUSH INVARIANT (review fix round 2): the take's blobs live in
  // `finalBlobsRef` — a ref, NOT state — and saveTake() reads
  // finalBlobsRef.current directly. A setState in the same event handler
  // (goResult) is not visible to saveTake's closure (stale → empty
  // lineAudio), so no consumer of this data may depend on state flushing.
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
        const blob = finalBlobsRef.current[line.id];
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
        overallBand: overall ?? null,
      });
      savedDubbingIdRef.current = dubbingId;
      setSaveState('saved');
      // Private-save XP (rescaled 2026-09-04 to the 1-5 economy): exactly
      // once per take. Also progresses the daily dubbing quest.
      if (xpGivenRef.current < XP_REWARDS.DUBBING_COMPLETE) {
        try {
          await GamificationService.awardXP(XP_REWARDS.DUBBING_COMPLETE, 'dubbing_complete_private');
          await GamificationService.updateQuestProgress(QUEST_TYPES.DUBBING_TAKE, 1);
          xpGivenRef.current = XP_REWARDS.DUBBING_COMPLETE;
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
  }, [clip, lines, lineScores, saveState]);

  const goResult = useCallback(() => {
    videoRef.current?.pause();
    // Snapshot the blobs BEFORE reset clears the hook state, then release the
    // mic/AnalyserNode/AudioContext so no recording indicator stays live.
    // The snapshot goes into a REF and is what saveTake reads — setState here
    // would not be visible to saveTake's closure in the same handler.
    const snapshot = { ...recorder.lineBlobs };
    recorder.reset();
    finalBlobsRef.current = snapshot;
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
      // Top-up so the published total is exactly DUBBING_PERFECT
      // (DUBBING_COMPLETE already granted).
      if (xpGivenRef.current < XP_REWARDS.DUBBING_PERFECT) {
        await GamificationService.awardXP(XP_REWARDS.DUBBING_PERFECT - xpGivenRef.current, 'dubbing_complete');
        xpGivenRef.current = XP_REWARDS.DUBBING_PERFECT;
      }
      // Owner decision 7: +1 gem exactly once for a 'great'-band PUBLISHED take.
      const overall = bandFromScores(lineScores, lines);
      if (overall === 'great' && !gemGivenRef.current) {
        gemGivenRef.current = true;
        try {
          await GamificationService.awardGems(DUBBING_GREAT_GEMS, 'dubbing_great_publish');
        } catch (err) {
          log.warn('gem_failed', { error: err instanceof Error ? err.message : String(err) });
        }
      }
      playCue('win');
      toast.success('Shared with your class!');
    } catch (err) {
      log.warn('publish_failed', { error: err instanceof Error ? err.message : String(err) });
      toast.error('Could not share your take.');
    }
  }, [saveTake, lineScores, lines]);

  const tryAgain = useCallback(() => {
    Object.values(blobUrlMap.current).forEach((u) => URL.revokeObjectURL(u));
    blobUrlMap.current = {};
    setLineScores({});
    setSaveState('idle');
    setPublished(false);
    finalBlobsRef.current = {};
    savedDubbingIdRef.current = null;
    xpGivenRef.current = 0;
    gemGivenRef.current = false;
    recorder.reset();
    setPhase('watch');
  }, [recorder]);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!recordingSupported()) {
    return (
      <div className="h-dvh bg-[#EAE0D0] text-[#1D3557] flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-[#FDFBF7] border-2 border-[#E2D7C3] flex items-center justify-center">
          <Mic size={28} className="text-[#8C7A68]" />
        </div>
        <h1 className="text-xl font-bold">Please update your browser</h1>
        <p className="text-sm text-[#8C7A68] max-w-xs">
          Voice dubbing needs microphone recording, which this browser does not support. Try the latest Chrome, Safari, or Edge.
        </p>
        <button onClick={onBack} className="mt-2 px-5 py-3 bg-[#2A9D8F] text-white rounded-2xl font-bold shadow-[0_4px_0_#1E6F5C] active:translate-y-[2px] active:shadow-[0_2px_0_#1E6F5C] text-sm">
          Go back
        </button>
      </div>
    );
  }

  const activeLine = activeSubIdx >= 0 ? lines[activeSubIdx] : null;
  const recLine = recorder.activeLineIndex >= 0 ? lines[recorder.activeLineIndex] : null;
  const recNextLine = recorder.activeLineIndex >= 0 ? lines[recorder.activeLineIndex + 1] : null;
  const recordedCount = Object.keys(recorder.lineBlobs).length;
  const overallBand = bandFromScores(lineScores, lines);
  const overallMatch = useMemo(() => {
    const vals = lines.map((l) => lineScores[l.id]).filter((s): s is LineScore => !!s);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, s) => a + s.wordMatch, 0) / vals.length) * 100);
  }, [lineScores, lines]);

  return (
    <div className="h-dvh bg-[#EAE0D0] text-[#1D3557] font-sans max-w-md mx-auto flex flex-col">
      <header className="p-4 flex justify-between items-center z-10 shrink-0">
        <button
          onClick={() => {
            if (phase === 'record') { recorder.reset(); }
            if (phase === 'pick') onBack();
            else { setPhase('pick'); setClip(null); setVideoUrl(null); }
          }}
          className="p-2 bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-full active:translate-y-[2px] transition-colors"
          aria-label="Back"
        >
          <ChevronLeft size={22} className="text-[#1D3557]" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-extrabold text-[#8C7A68] uppercase tracking-widest">
            {phase === 'pick' ? 'Dubbing' : 'Dubbing Studio'}
          </span>
          {clip && <span className="font-bold text-sm text-[#264653]">{clip.title}</span>}
        </div>
        {phase === 'pick' && onOpenGallery ? (
          <button
            onClick={onOpenGallery}
            className="p-2 bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-full active:translate-y-[2px]"
            aria-label="Friends' videos"
            title="Friends' videos"
          >
            <Users size={20} className="text-[#2A9D8F]" />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </header>

      {/* ── Pick phase ── */}
      {phase === 'pick' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {clipsLoading && (
            <div className="flex items-center justify-center py-16 text-[#8C7A68]">
              <Loader2 className="animate-spin" />
            </div>
          )}
          {!clipsLoading && clips.length === 0 && (
            <div className="bg-[#FDFBF7] rounded-3xl border-2 border-[#E2D7C3] p-6 text-center">
              {/* Shapes-only illustration (no animal mascot per owner rule) */}
              <div className="w-20 h-16 mx-auto mb-4 rounded-2xl bg-[#F7F3E8] border-2 border-[#E2D7C3] flex items-center justify-center relative">
                <div className="absolute -top-2 left-4 w-0.5 h-3 bg-[#8C7A68]" />
                <div className="absolute -top-2 right-4 w-0.5 h-3 bg-[#8C7A68]" />
                <Video size={26} className="text-[#2A9D8F]" />
              </div>
              <h3 className="font-bold text-lg text-[#1D3557] mb-1">No dubbing clips yet!</h3>
              <p className="text-sm text-[#8C7A68] mb-1">Your teacher will assign fun voice clips for your class.</p>
              <p className="text-xs text-[#8C7A68]/80 mb-5">你的老师会布置配音任务</p>
              <div className="grid grid-cols-3 gap-2 mb-5">
                {[
                  { icon: <Play size={16} />, label: 'Watch' },
                  { icon: <Mic size={16} />, label: 'Record' },
                  { icon: <Share2 size={16} />, label: 'Share' },
                ].map((s) => (
                  <div key={s.label} className="bg-[#F7F3E8] rounded-2xl border border-[#E2D7C3] p-2.5 flex flex-col items-center gap-1">
                    <span className="w-8 h-8 rounded-full bg-[#E6F4F1] text-[#1E6F5C] flex items-center justify-center">{s.icon}</span>
                    <span className="text-[10px] font-bold text-[#8C7A68] uppercase tracking-wide">{s.label}</span>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 bg-[#2A9D8F] text-white font-bold rounded-2xl text-sm shadow-[0_4px_0_#1E6F5C] inline-block">
                Check back soon
              </div>
            </div>
          )}
          {clips.map((c) => (
            <button
              key={c.id}
              onClick={() => void openClip(c)}
              className="w-full flex items-center gap-4 p-4 bg-[#FDFBF7] rounded-3xl border-2 border-[#E2D7C3] hover:border-[#2A9D8F] active:translate-y-[2px] transition-all text-left shadow-[0_4px_0_#E2D7C3]"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2A9D8F] to-[#1E6F5C] flex items-center justify-center shrink-0">
                <Video size={24} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate text-[#1D3557]">{c.title}</div>
                <div className="text-xs text-[#8C7A68] font-semibold">
                  {(c.lines?.length ?? 0)} lines · {Math.round(c.videoDurationMs / 1000)}s
                </div>
              </div>
              {newClipIds.has(c.id) ? (
                <span className="px-2 py-0.5 rounded-full bg-[#E6F4F1] text-[#1E6F5C] text-[10px] font-extrabold uppercase border border-[#2A9D8F]">
                  New
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-[#F7F3E8] text-[#8C7A68] text-[10px] font-extrabold uppercase border border-[#E2D7C3]">
                  Dubbed
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Watch phase ── */}
      {phase === 'watch' && (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 bg-[#1D3557] rounded-t-[32px] relative overflow-hidden mx-2 mt-1">
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
              <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                <p className="text-center text-lg font-medium text-white">{activeLine.text}</p>
              </div>
            )}
          </div>
          <div className="p-5 pt-4">
            <p className="text-sm text-[#8C7A68] font-semibold mb-4 text-center">
              Watch the clip once, then record your voice over it.
            </p>
            <button
              onClick={() => {
                videoRef.current?.pause();
                setPhase('record');
              }}
              disabled={!videoUrl}
              className="w-full py-4 rounded-2xl bg-[#2A9D8F] hover:bg-[#1E6F5C] disabled:opacity-50 font-bold text-white shadow-[0_4px_0_#1E6F5C] active:translate-y-[2px] active:shadow-[0_2px_0_#1E6F5C] flex items-center justify-center gap-2"
            >
              <Mic size={20} /> Start dubbing
            </button>
          </div>
        </div>
      )}

      {/* ── Record pass phase (KARAOKE deck) ── */}
      {phase === 'record' && (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 bg-[#1D3557] rounded-t-[32px] relative mx-2 mt-1 min-h-[28vh]">
            <video ref={videoRef} src={videoUrl ?? undefined} className="w-full h-full object-contain" muted playsInline />
            <div className="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-[#FDFBF7]/90 border border-[#E2D7C3] text-[10px] font-extrabold text-[#1D3557]">
              LINE {Math.min(Math.max(recorder.activeLineIndex + 1, recordedCount + 1), lines.length)} / {lines.length}
            </div>
          </div>

          <div className="bg-[#FDFBF7] border-t-[3px] border-[#E2D7C3] rounded-t-[28px] p-5 flex flex-col gap-4 flex-none">
            {/* Karaoke line deck */}
            <div className="text-center min-h-[92px] flex flex-col justify-center">
              {recorder.state === 'pass_done' ? (
                <p className="text-sm font-extrabold text-[#1E6F5C]">Pass complete! Review your lines below.</p>
              ) : recLine ? (
                <>
                  <div className="text-[10px] text-[#8C7A68] font-extrabold uppercase tracking-widest mb-1">
                    {recorder.state === 'countdown' ? 'Get ready…' : 'Speak now'}
                  </div>
                  <p className="text-2xl font-bold text-[#1D3557] leading-snug px-2">{recLine.text}</p>
                  {recNextLine && (
                    <p className="text-sm text-[#8C7A68]/70 font-semibold mt-1.5">Next: {recNextLine.text}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-[#8C7A68] font-semibold">Listen for your cue…</p>
              )}
            </div>

            {/* Draining window bar */}
            {recorder.state !== 'pass_done' && (
              <div className="h-3 rounded-full bg-[#F7F3E8] border border-[#E2D7C3] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-none ${
                    recorder.state === 'recording_line' ? 'bg-[#E76F51]' : 'bg-[#E9C46A]'
                  }`}
                  style={{ width: `${Math.round((recorder.state === 'recording_line' ? 1 - recorder.windowProgress : recorder.windowProgress) * 100)}%` }}
                />
              </div>
            )}

            {/* Mic + waveform */}
            {recorder.state !== 'pass_done' && (
              <div className="flex items-center justify-center gap-4">
                <div className="relative">
                  {(recorder.state === 'recording_line' || recorder.state === 'countdown') && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-4 border-[#FF4B4B]"
                      animate={{ scale: [1, 1.35, 1], opacity: [0.7, 0, 0.7] }}
                      transition={{ repeat: Infinity, duration: 1.4 }}
                    />
                  )}
                  <div className="w-16 h-16 rounded-full bg-[#FF4B4B] shadow-[0_4px_0_#C0392B] flex items-center justify-center">
                    <Mic size={26} className="text-white" />
                  </div>
                </div>
                <div className="h-12 flex-1 bg-[#1D3557] rounded-xl overflow-hidden relative">
                  <canvas ref={canvasRef} width={400} height={48} className="w-full h-full absolute inset-0" />
                </div>
              </div>
            )}

            {/* Instant band chips for captured lines */}
            {recordedCount > 0 && recorder.state !== 'pass_done' && (
              <div className="flex gap-2 flex-wrap justify-center">
                {lines.filter((l) => recorder.lineBlobs[l.id]).map((l) => {
                  const s = lineScores[l.id];
                  return (
                    <span key={l.id} className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${BAND_CHIP[s?.band ?? 'great']}`}>
                      {s ? `${BAND_LABEL[s.band]} ${Math.round(s.wordMatch * 100)}%` : 'Scoring…'}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Controls */}
            {recorder.state === 'idle' || recorder.state === 'watching' || recorder.state === 'countdown' ? (
              <button
                onClick={recorder.startPass}
                className="w-full py-4 rounded-2xl bg-[#FF4B4B] hover:bg-[#E04040] font-bold text-white shadow-[0_4px_0_#C0392B] active:translate-y-[2px] active:shadow-[0_2px_0_#C0392B] flex items-center justify-center gap-2"
              >
                <Mic size={20} /> Tap to record
              </button>
            ) : recorder.state === 'pass_done' ? (
              <div className="space-y-3">
                <div className="max-h-44 overflow-y-auto space-y-2">
                  {lines.map((l) => {
                    const s = lineScores[l.id];
                    return (
                      <div key={l.id} className="flex items-center gap-2 bg-[#F7F3E8] border border-[#E2D7C3] rounded-2xl p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate font-semibold text-[#264653]">{l.text}</p>
                          {!s && <span className="text-[10px] text-[#8C7A68]">Score pending…</span>}
                          {s && (
                            <span className={`text-[10px] font-extrabold uppercase ${s.band === 'great' ? 'text-[#1E6F5C]' : s.band === 'almost' ? 'text-[#9A6B00]' : 'text-[#C0392B]'}`}>
                              {BAND_LABEL[s.band]} · {Math.round(s.wordMatch * 100)}%
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => recorder.rerecordLine(l.id)}
                          className="p-2.5 bg-[#FDFBF7] border border-[#E2D7C3] rounded-full active:translate-y-[2px] shrink-0"
                          aria-label={`Redo line ${l.order + 1}`}
                          title="Redo this line"
                        >
                          <RefreshCw size={15} className="text-[#E76F51]" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={goResult}
                  className="w-full py-4 rounded-2xl bg-[#2A9D8F] hover:bg-[#1E6F5C] font-bold text-white shadow-[0_4px_0_#1E6F5C] active:translate-y-[2px] active:shadow-[0_2px_0_#1E6F5C]"
                >
                  See my results
                </button>
              </div>
            ) : (
              <div className="text-center text-xs text-[#8C7A68] font-semibold py-2">Recording… stay quiet between lines.</div>
            )}
          </div>
        </div>
      )}

      {/* ── Result phase (STAR BAND card) ── */}
      {phase === 'result' && clip && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {videoUrl && Object.keys(blobUrlMap.current).length > 0 ? (
            <div className="bg-[#FDFBF7] rounded-3xl border-2 border-[#E2D7C3] p-2 shadow-[0_4px_0_#E2D7C3]">
              <DubPlayer
                videoUrl={videoUrl}
                lines={lines}
                lineAudioUrls={blobUrlMap.current}
                className="w-full rounded-2xl bg-black"
              />
            </div>
          ) : (
            <div className="aspect-video bg-[#1D3557] rounded-2xl flex items-center justify-center text-[#8C7A68] text-sm font-semibold">
              {saveState === 'saving' ? 'Saving your take…' : 'No recording to play back.'}
            </div>
          )}

          {/* Star band card */}
          <div className="bg-[#FDFBF7] rounded-3xl border-2 border-[#E2D7C3] p-5 shadow-[0_4px_0_#E2D7C3]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Star className="text-[#E9C46A] w-5 h-5 fill-[#E9C46A]" />
                <span className="font-extrabold text-[#1D3557]">
                  {(() => {
                    if (saveState === 'saving') return 'Scoring…';
                    return overallBand ? BAND_LABEL[overallBand] ?? overallBand : 'Score pending';
                  })()}
                </span>
              </div>
              {published && (
                <span className="px-2 py-1 rounded-full bg-[#E6F4F1] text-[#1E6F5C] text-[10px] font-extrabold uppercase border border-[#2A9D8F]">
                  Shared with class
                </span>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 mb-3">
              {[1, 2, 3].map((n) => (
                <Star
                  key={n}
                  size={34}
                  className={n <= (overallBand ? BAND_STARS[overallBand] : 0) ? 'text-[#E9C46A] fill-[#E9C46A]' : 'text-[#E2D7C3] fill-transparent'}
                />
              ))}
            </div>

            {overallMatch !== null && (
              <div className="flex justify-center mb-3">
                <span className="px-3 py-1 rounded-full bg-[#F7F3E8] border border-[#E2D7C3] text-xs font-extrabold text-[#264653]">
                  {overallMatch}% word match
                </span>
              </div>
            )}

            <div className="space-y-2">
              {lines.map((l) => {
                const s = lineScores[l.id];
                return (
                  <div key={l.id} className="bg-[#F7F3E8] border border-[#E2D7C3] rounded-2xl p-3">
                    <p className="text-xs text-[#264653] font-semibold mb-1">{l.text}</p>
                    {s ? (
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${BAND_CHIP[s.band]}`}>
                          {BAND_LABEL[s.band]}
                        </span>
                        <span className="text-[11px] text-[#8C7A68] font-semibold">{s.feedback || Math.round(s.wordMatch * 100) + '% match'}</span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-[#8C7A68]">Score pending — your teacher can still hear your dub.</span>
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
              className="py-3.5 rounded-2xl bg-[#FDFBF7] border-2 border-[#E2D7C3] hover:border-[#8C7A68] font-bold text-sm text-[#1D3557] shadow-[0_4px_0_#E2D7C3] active:translate-y-[2px] disabled:opacity-50"
            >
              Try again
            </button>
            <button
              onClick={() => void shareWithClass()}
              disabled={saveState === 'saving' || published}
              className="py-3.5 rounded-2xl bg-[#2A9D8F] hover:bg-[#1E6F5C] font-bold text-sm text-white shadow-[0_4px_0_#1E6F5C] active:translate-y-[2px] active:shadow-[0_2px_0_#1E6F5C] flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saveState === 'saving' ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
              {published ? 'Shared' : 'Share with class'}
              {!published && overallBand === 'great' && (
                <span className="px-1.5 py-0.5 rounded-full bg-[#FFF6E0] border border-[#E9C46A] text-[#9A6B00] text-[10px] font-extrabold">
                  +1 💎
                </span>
              )}
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
