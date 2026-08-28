// Parent gallery: own child's dubbing takes with playback, teacher feedback
// and delete (GDPR erasure). Real data via DubbingService (no more assets mock).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Play, Star, Trash2, X, AlertTriangle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAppStore } from '../../store/useAppStore';
import { getParentStudents, StudentWithProgress } from '../../services/DataService';
import {
  DubbingService,
  type ClipLine,
  type Dubbing,
  type DubbingClip,
  type Feedback,
} from '../../services/DubbingService';
import DubPlayer from '../../components/shared/DubPlayer';
import { createClientLogger } from '../../services/logger';

const log = createClientLogger('DubbingGallery');

interface DubbingGalleryProps {
  onBack: () => void;
}

type CardItem = Dubbing & {
  clipTitle: string;
  feedback: Feedback[];
};

const BAND_RANK: Record<string, number> = { great: 0, almost: 1, try_again: 2 };

function BandBadge({ band }: { band: Dubbing['overallBand'] }) {
  if (!band) {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
        Score pending
      </span>
    );
  }
  const styles: Record<string, string> = {
    great: 'bg-emerald-100 text-emerald-700',
    almost: 'bg-amber-100 text-amber-700',
    try_again: 'bg-rose-100 text-rose-700',
  };
  const labels: Record<string, string> = { great: 'Great', almost: 'Almost', try_again: 'Try again' };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${styles[band]}`}>
      {labels[band]}
    </span>
  );
}

function Stars({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3].map((i) => (
        <Star
          key={i}
          size={12}
          className={i <= count ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300'}
        />
      ))}
    </span>
  );
}

const DubbingGallery: React.FC<DubbingGalleryProps> = ({ onBack }) => {
  const { userProfile } = useAppStore();
  const [children, setChildren] = useState<StudentWithProgress[]>([]);
  const [childId, setChildId] = useState<string | null>(null);
  const [items, setItems] = useState<CardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'recent' | 'best'>('recent');

  // Player modal state
  const [active, setActive] = useState<CardItem | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerData, setPlayerData] = useState<{
    videoUrl: string;
    lines: ClipLine[];
    lineAudioUrls: Record<string, string>;
  } | null>(null);

  // Delete confirm state
  const [pendingDelete, setPendingDelete] = useState<CardItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Resolve linked children exactly like ParentDashboard/ParentReports.
  useEffect(() => {
    const load = async () => {
      if (!userProfile?.id) return;
      try {
        const students = await getParentStudents(userProfile.id);
        setChildren(students);
        setChildId(students[0]?.id ?? null);
      } catch (err) {
        log.warn('error_loading_parent_students', {
          error: err instanceof Error ? err.message : String(err),
        });
        setError('Could not load linked students.');
      }
    };
    load();
  }, [userProfile?.id]);

  const loadDubs = useCallback(async (cid: string) => {
    setLoading(true);
    setError(null);
    try {
      const dubs = await DubbingService.childDubs(cid);
      // Clip titles (unique clips) + teacher feedback per dub, in parallel.
      const clipIds = [...new Set(dubs.map((d) => d.clipId))];
      const clipRes = await Promise.allSettled(clipIds.map((id) => DubbingService.getClip(id)));
      const clipById = new Map<string, DubbingClip>();
      clipRes.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) clipById.set(clipIds[i], r.value);
      });
      const fbRes = await Promise.allSettled(dubs.map((d) => DubbingService.listFeedback(d.id)));
      const cards: CardItem[] = dubs.map((d, i) => ({
        ...d,
        clipTitle: clipById.get(d.clipId)?.title ?? 'Dubbing clip',
        feedback: fbRes[i].status === 'fulfilled' ? fbRes[i].value : [],
      }));
      setItems(cards);
    } catch (err) {
      log.warn('error_loading_child_dubs', {
        error: err instanceof Error ? err.message : String(err),
      });
      setError('Could not load dubbing takes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (childId) loadDubs(childId);
    else setLoading(false);
  }, [childId, loadDubs]);

  const displayItems = useMemo(() => {
    if (filter === 'recent') return items; // childDubs orders by created_at desc
    return [...items].sort((a, b) => {
      const ra = a.overallBand ? BAND_RANK[a.overallBand] ?? 3 : 3;
      const rb = b.overallBand ? BAND_RANK[b.overallBand] ?? 3 : 3;
      return ra - rb;
    });
  }, [items, filter]);

  const openPlayer = async (item: CardItem) => {
    setActive(item);
    setPlayerData(null);
    setPlayerLoading(true);
    try {
      const clip = await DubbingService.getClip(item.clipId);
      const entries = Object.entries(item.lineAudio); // [lineId, storagePath]
      const [videoUrl, lines, ...audioUrls] = await Promise.all([
        DubbingService.signedUrl(clip?.videoPath ?? ''),
        DubbingService.getClipLines(item.clipId),
        ...entries.map(([, path]) => DubbingService.signedUrl(path)),
      ]);
      const lineAudioUrls: Record<string, string> = {};
      entries.forEach(([lineId], i) => {
        if (audioUrls[i]) lineAudioUrls[lineId] = audioUrls[i];
      });
      setPlayerData({ videoUrl, lines, lineAudioUrls });
    } catch (err) {
      log.warn('error_opening_player', {
        error: err instanceof Error ? err.message : String(err),
      });
      toast.error('Could not load this take.');
      setActive(null);
    } finally {
      setPlayerLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await DubbingService.deleteDubbing(pendingDelete.id);
      toast.success('Removed');
      setPendingDelete(null);
      if (active?.id === pendingDelete.id) setActive(null);
      if (childId) await loadDubs(childId);
    } catch (err) {
      log.warn('error_deleting_dub', {
        error: err instanceof Error ? err.message : String(err),
      });
      toast.error('Could not remove this take.');
    } finally {
      setDeleting(false);
    }
  };

  const childName = children.find((c) => c.id === childId)?.full_name?.split(' ')[0] || 'Student';

  return (
    <div className="h-full bg-slate-50 flex flex-col relative">
      <header className="bg-white px-4 py-3 sticky top-0 z-20 border-b border-slate-100 flex items-center gap-2">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full" aria-label="Back">
          <ChevronLeft size={24} className="text-slate-600" />
        </button>
        <h1 className="font-bold text-lg text-slate-800 flex-1 truncate">{childName}'s Studio</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Child switcher (multi-child parents) */}
        {children.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {children.map((c) => (
              <button
                key={c.id}
                onClick={() => setChildId(c.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${
                  c.id === childId
                    ? 'bg-cyan-500 text-white'
                    : 'bg-white border border-slate-200 text-slate-500'
                }`}
              >
                {c.full_name || 'Student'}
              </button>
            ))}
          </div>
        )}

        {/* Filter chips */}
        <div className="flex gap-2">
          {(
            [
              ['recent', 'Recent'],
              ['best', 'Best'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-full text-xs font-bold ${
                filter === key
                  ? 'bg-cyan-500 text-white shadow-md shadow-cyan-200'
                  : 'bg-white border border-slate-200 text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-500" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl p-6 text-center text-slate-500 border border-slate-100">
            {error}
          </div>
        ) : children.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-slate-100">
            <div className="text-5xl mb-3">👨‍👩‍👧‍👦</div>
            <h2 className="font-bold text-slate-800 mb-1">No Students Linked</h2>
            <p className="text-sm text-slate-500">
              Link your child's account to see their dubbing takes.
            </p>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-slate-100">
            <div className="text-5xl mb-3">🎬</div>
            <h2 className="font-bold text-slate-800 mb-1">No Takes Yet</h2>
            <p className="text-sm text-slate-500">
              {childName} hasn't recorded any dubbing takes.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayItems.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 cursor-pointer hover:border-cyan-200 transition-colors"
                onClick={() => openPlayer(item)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-800 text-sm truncate">
                      {item.clipTitle}
                      {item.isPublished && (
                        <span className="ml-2 text-[9px] font-bold uppercase text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded-full align-middle">
                          Published
                        </span>
                      )}
                    </h3>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })
                        : ''}{' '}
                      · Take {item.attemptNo}
                    </div>
                  </div>
                  <BandBadge band={item.overallBand} />
                </div>

                {item.feedback.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-2 space-y-1.5">
                    {item.feedback.slice(0, 2).map((f, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Stars count={f.stars} />
                        {f.comment && (
                          <p className="text-xs text-slate-600 line-clamp-2 flex-1">{f.comment}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-cyan-600">
                    <Play size={14} /> Play
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(item);
                    }}
                    className="p-2 text-slate-400 hover:text-rose-500 rounded-full hover:bg-rose-50 transition-colors"
                    aria-label="Delete take"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Player modal */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
            onClick={() => setActive(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-lg bg-black rounded-3xl overflow-hidden relative shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {playerLoading || !playerData ? (
                <div className="aspect-video flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
                </div>
              ) : (
                <DubPlayer
                  videoUrl={playerData.videoUrl}
                  lines={playerData.lines}
                  lineAudioUrls={playerData.lineAudioUrls}
                  className="w-full aspect-video bg-black"
                />
              )}
              <div className="p-4 bg-slate-900 flex justify-between items-center text-white">
                <div className="min-w-0">
                  <h3 className="font-bold truncate">{active.clipTitle}</h3>
                  <div className="text-xs text-slate-400">Recorded by {childName}</div>
                </div>
                <button
                  onClick={() => setPendingDelete(active)}
                  className="p-2 bg-white/10 rounded-full hover:bg-rose-500/80"
                  aria-label="Delete take"
                >
                  <Trash2 size={20} />
                </button>
              </div>
              <button
                onClick={() => setActive(null)}
                className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white backdrop-blur-sm"
                aria-label="Close"
              >
                <X size={24} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirm dialog */}
      <AnimatePresence>
        {pendingDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
            onClick={() => !deleting && setPendingDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <AlertTriangle size={32} className="mx-auto text-amber-500 mb-2" />
              <h3 className="font-bold text-slate-800 mb-1">Remove this take?</h3>
              <p className="text-sm text-slate-500 mb-5">
                "{pendingDelete.clipTitle}" will be permanently deleted, including its audio
                recordings. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  disabled={deleting}
                  onClick={() => setPendingDelete(null)}
                  className="flex-1 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  disabled={deleting}
                  onClick={confirmDelete}
                  className="flex-1 py-2 rounded-xl text-sm font-bold bg-rose-500 text-white disabled:opacity-50"
                >
                  {deleting ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DubbingGallery;
