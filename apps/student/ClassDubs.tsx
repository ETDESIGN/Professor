import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Heart, Loader2, Sparkles, Users, Video, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  DubbingService,
  type ClipLine,
  type Dubbing,
  type DubbingClip,
} from '../../services/DubbingService';
import { supabase } from '../../services/supabaseClient';
import DubPlayer from '../../components/shared/DubPlayer';
import { playCue } from '../board/templates/playCue';
import { createClientLogger } from '../../services/logger';

const log = createClientLogger('ClassDubs');

type ClassDub = Dubbing & { studentName: string; likeCount: number; likedByMe: boolean };
type ClipWithLines = DubbingClip & { lines?: ClipLine[] };

const BAND_LABEL: Record<string, string> = {
  great: 'Great!',
  almost: 'Almost there',
  try_again: 'Try again',
};

const BAND_CLASS: Record<string, string> = {
  great: 'bg-[#E6F4F1] text-[#1E6F5C] border border-[#2A9D8F]',
  almost: 'bg-[#FFF6E0] text-[#9A6B00] border border-[#E9C46A]',
  try_again: 'bg-[#FEF2F2] text-[#C0392B] border border-[#FF4B4B]',
};

/** Privacy invariant: first name only — never render a full name in the gallery. */
function firstName(fullName: string): string {
  return (fullName || '?').trim().split(' ')[0] || '?';
}

interface ClassDubsProps {
  onBack: () => void;
  /** CTA from the empty state → back into the recording studio. */
  onGoStudio: () => void;
}

const ClassDubs: React.FC<ClassDubsProps> = ({ onBack, onGoStudio }) => {
  const [clips, setClips] = useState<ClipWithLines[]>([]);
  const [clipsLoading, setClipsLoading] = useState(true);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [dubs, setDubs] = useState<ClassDub[]>([]);
  const [dubsLoading, setDubsLoading] = useState(false);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{
    dub: ClassDub;
    clip: ClipWithLines;
    videoUrl: string;
    lines: ClipLine[];
    lineAudioUrls: Record<string, string>;
  } | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);

  const activeClip = useMemo(
    () => clips.find((c) => c.id === activeClipId) ?? null,
    [clips, activeClipId],
  );

  // ── Load my clips + my uid ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [myClips, { data: userData }] = await Promise.all([
          DubbingService.listMyClips(),
          supabase.auth.getUser(),
        ]);
        if (cancelled) return;
        setClips(myClips);
        setMyUid(userData?.user?.id ?? null);
        if (myClips.length > 0) setActiveClipId(myClips[0].id);
      } catch (err) {
        log.warn('load_clips_failed', { error: err instanceof Error ? err.message : String(err) });
        toast.error('Could not load your class clips.');
      } finally {
        if (!cancelled) setClipsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load published dubs for the active clip tab ─────────────────────────────
  useEffect(() => {
    if (!activeClipId) return;
    let cancelled = false;
    setDubsLoading(true);
    setDubs([]);
    void (async () => {
      try {
        const list = await DubbingService.listClassDubs(activeClipId);
        if (!cancelled) setDubs(list);
      } catch (err) {
        log.warn('list_class_dubs_failed', { error: err instanceof Error ? err.message : String(err) });
        if (!cancelled) toast.error('Could not load your classmates’ dubs.');
      } finally {
        if (!cancelled) setDubsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeClipId]);

  // Own published dub pinned first.
  const orderedDubs = useMemo(() => {
    const mine = dubs.filter((d) => myUid && d.studentId === myUid);
    const rest = dubs.filter((d) => !(myUid && d.studentId === myUid));
    return [...mine, ...rest];
  }, [dubs, myUid]);

  // ── Likes (optimistic, revert + toast on error) ─────────────────────────────
  const onToggleLike = useCallback(async (dub: ClassDub) => {
    const next = !dub.likedByMe;
    setDubs((prev) =>
      prev.map((d) =>
        d.id === dub.id
          ? { ...d, likedByMe: next, likeCount: d.likeCount + (next ? 1 : -1) }
          : d,
      ),
    );
    try {
      await DubbingService.toggleLike(dub.id);
    } catch (err) {
      // Revert to the captured PRE-toggle state (d in the callback is post-toggle).
      setDubs((prev) =>
        prev.map((d) =>
          d.id === dub.id
            ? { ...d, likedByMe: dub.likedByMe, likeCount: dub.likeCount }
            : d,
        ),
      );
      log.warn('toggle_like_failed', { error: err instanceof Error ? err.message : String(err) });
      toast.error('Could not save your like. Try again.');
    }
  }, []);

  // ── Open a dub in the full-screen player (signed URLs) ──────────────────────
  const openDub = useCallback(async (dub: ClassDub) => {
    if (!activeClip) return;
    setPlayerLoading(true);
    try {
      const [videoUrl, lines] = await Promise.all([
        DubbingService.signedUrl(activeClip.videoPath),
        activeClip.lines?.length
          ? Promise.resolve(activeClip.lines)
          : DubbingService.getClipLines(activeClip.id),
      ]);
      const lineAudioUrls: Record<string, string> = {};
      await Promise.all(
        Object.entries(dub.lineAudio).map(async ([lineId, path]) => {
          if (!path) return;
          try {
            lineAudioUrls[lineId] = await DubbingService.signedUrl(path);
          } catch {
            // Missing audio for one line → play the rest.
          }
        }),
      );
      setPlaying({ dub, clip: activeClip, videoUrl, lines, lineAudioUrls });
    } catch (err) {
      log.warn('open_dub_failed', { error: err instanceof Error ? err.message : String(err) });
      toast.error('Could not play this dub.');
    } finally {
      setPlayerLoading(false);
    }
  }, [activeClip]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="h-dvh bg-[#EAE0D0] text-[#1D3557] font-sans max-w-md mx-auto flex flex-col">
      <header className="p-4 flex justify-between items-center z-10 shrink-0">
        <button
          onClick={onBack}
          className="p-2 bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-full active:translate-y-[2px]"
          aria-label="Back"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-extrabold text-[#8C7A68] uppercase tracking-widest">
            Class Gallery
          </span>
          {activeClip && <span className="font-bold text-sm text-[#264653]">{activeClip.title}</span>}
        </div>
        <div className="w-10" />
      </header>

      {/* Per-clip tabs */}
      {clips.length > 0 && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto shrink-0" role="tablist">
          {clips.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={c.id === activeClipId}
              onClick={() => setActiveClipId(c.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                c.id === activeClipId
                  ? 'bg-[#2A9D8F] text-white shadow-[0_3px_0_#1E6F5C]'
                  : 'bg-[#FDFBF7] text-[#8C7A68] border-2 border-[#E2D7C3]'
              }`}
            >
              {c.title}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {clipsLoading && (
          <div className="flex items-center justify-center py-16 text-[#8C7A68]">
            <Loader2 className="animate-spin" />
          </div>
        )}

        {!clipsLoading && clips.length === 0 && (
          <div className="text-center py-16 text-[#8C7A68]">
            <Video className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">No dubbing clips assigned yet. Check back soon!</p>
          </div>
        )}

        {!clipsLoading && clips.length > 0 && dubsLoading && (
          <div className="flex items-center justify-center py-16 text-[#8C7A68]">
            <Loader2 className="animate-spin" />
          </div>
        )}

        {!clipsLoading && clips.length > 0 && !dubsLoading && orderedDubs.length === 0 && (
          <div className="text-center py-16 text-[#8C7A68] flex flex-col items-center gap-4">
            <Users className="opacity-50" />
            <p className="text-sm">No friends have shared yet — be the first!</p>
            <button
              onClick={onGoStudio}
              className="px-4 py-2.5 bg-[#2A9D8F] hover:bg-[#1E6F5C] rounded-2xl text-sm font-bold text-white shadow-[0_4px_0_#1E6F5C] active:translate-y-[2px] flex items-center gap-2"
            >
              <Sparkles size={16} /> Record a dub
            </button>
          </div>
        )}

        {!dubsLoading && orderedDubs.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {orderedDubs.map((d) => {
              const isMine = !!(myUid && d.studentId === myUid);
              return (
                <motion.div
                  key={d.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#FDFBF7] rounded-3xl border-2 border-[#E2D7C3] p-4 flex flex-col gap-3 shadow-[0_4px_0_#E2D7C3]"
                >
                  <button
                    onClick={() => void openDub(d)}
                    disabled={playerLoading}
                    className="flex items-center gap-3 text-left disabled:opacity-60"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2A9D8F] to-[#1E6F5C] flex items-center justify-center font-bold text-white shrink-0">
                      {firstName(d.studentName).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {/* Privacy: first name only */}
                        <span className="font-bold text-sm truncate text-[#1D3557]">{firstName(d.studentName)}</span>
                        {isMine && (
                          <span className="px-1.5 py-0.5 rounded-full bg-[#E6F4F1] text-[#1E6F5C] border border-[#2A9D8F] text-[9px] font-extrabold uppercase shrink-0">
                            Yours
                          </span>
                        )}
                      </div>
                      {d.overallBand ? (
                        <span
                          className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            BAND_CLASS[d.overallBand] ?? 'bg-[#F7F3E8] text-[#8C7A68] border border-[#E2D7C3]'
                          }`}
                        >
                          {BAND_LABEL[d.overallBand] ?? d.overallBand}
                        </span>
                      ) : (
                        <span className="inline-block mt-1 text-[10px] text-[#8C7A68] font-semibold">
                          Score pending
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => void openDub(d)}
                      disabled={playerLoading}
                      className="text-xs font-extrabold text-[#2A9D8F] hover:text-[#1E6F5C] flex items-center gap-1 disabled:opacity-60"
                    >
                      {playerLoading ? <Loader2 size={14} className="animate-spin" /> : <Video size={14} />}
                      Watch
                    </button>
                    <button
                      onClick={() => { playCue('correct'); void onToggleLike(d); }}
                      className="flex items-center gap-1 text-sm"
                      aria-label={d.likedByMe ? 'Unlike' : 'Like'}
                    >
                      <Heart
                        size={18}
                        className={
                          d.likedByMe ? 'text-[#E76F51] fill-[#E76F51]' : 'text-[#E2D7C3] fill-transparent'
                        }
                      />
                      <span className="text-xs font-bold text-[#8C7A68]">{d.likeCount}</span>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Full-screen playback overlay ── */}
      {playing && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
          <div className="p-4 flex items-center justify-between text-white">
            <div className="min-w-0">
              <div className="text-xs text-slate-400 uppercase tracking-widest font-bold">
                Now playing
              </div>
              {/* Privacy: first name only */}
              <div className="font-bold truncate">
                {firstName(playing.dub.studentName)} · {playing.clip.title}
              </div>
            </div>
            <button
              onClick={() => setPlaying(null)}
              className="p-2 bg-white/10 rounded-full hover:bg-white/20"
              aria-label="Close player"
            >
              <X size={24} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 max-w-md w-full mx-auto">
            <DubPlayer
              videoUrl={playing.videoUrl}
              lines={playing.lines}
              lineAudioUrls={playing.lineAudioUrls}
              className="w-full rounded-2xl bg-black"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassDubs;
