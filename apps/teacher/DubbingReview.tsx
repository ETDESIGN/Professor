import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Star, MessageSquare, EyeOff, Users, Play, Pause } from 'lucide-react';
import { toast } from 'sonner';
import {
    DubbingService,
    DubbingClip,
    Dubbing,
    ClipLine,
} from '../../services/DubbingService';
import DubPlayer from '../../components/shared/DubPlayer';

type Entry = Dubbing & { studentName: string };

const bandChip = (band: Dubbing['overallBand']) => {
    if (!band) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500">unscored</span>;
    const cls =
        band === 'great'
            ? 'bg-emerald-100 text-emerald-700'
            : band === 'almost'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-rose-100 text-rose-700';
    return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{band.replace('_', ' ')}</span>;
};

const StarPicker: React.FC<{ onPick: (stars: 1 | 2 | 3) => void; disabled?: boolean }> = ({ onPick, disabled }) => (
    <div className="flex gap-1">
        {([1, 2, 3] as const).map((s) => (
            <button
                key={s}
                disabled={disabled}
                onClick={() => onPick(s)}
                title={`${s} star${s === 1 ? '' : 's'}`}
                className="p-1 rounded hover:bg-amber-50 disabled:opacity-40"
            >
                <Star size={20} className="text-amber-400" fill="currentColor" />
            </button>
        ))}
    </div>
);

const DubbingReview: React.FC<{ clip: DubbingClip; onBack: () => void }> = ({ clip, onBack }) => {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [lines, setLines] = useState<ClipLine[]>([]);
    const [loading, setLoading] = useState(true);

    const [selected, setSelected] = useState<Entry | null>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
    const [signing, setSigning] = useState(false);
    const [comment, setComment] = useState('');
    const [confirmingUnpublish, setConfirmingUnpublish] = useState<Entry | null>(null);

    const playerRef = React.useRef<{ play(): void; pause(): void } | null>(null);
    const [playing, setPlaying] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [e, l] = await Promise.all([
                DubbingService.listClassDubEntries(clip.id),
                DubbingService.getClipLines(clip.id),
            ]);
            setEntries(e);
            setLines(l);
        } catch (err: any) {
            toast.error('Failed to load takes', { description: err.message });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clip.id]);

    // group takes by student
    const byStudent = useMemo(() => {
        const m = new Map<string, { name: string; takes: Entry[] }>();
        for (const e of entries) {
            const g = m.get(e.studentId) ?? { name: e.studentName || 'Unknown student', takes: [] };
            g.takes.push(e);
            m.set(e.studentId, g);
        }
        return [...m.values()];
    }, [entries]);

    const openTake = async (e: Entry) => {
        setSelected(e);
        setComment('');
        setVideoUrl(null);
        setAudioUrls({});
        setSigning(true);
        try {
            const video = await DubbingService.signedUrl(clip.videoPath);
            setVideoUrl(video);
            const audioEntries = await Promise.all(
                Object.entries(e.lineAudio).map(async ([lineId, path]) => {
                    try { return [lineId, await DubbingService.signedUrl(path)] as const; }
                    catch { return [lineId, ''] as const; }
                }),
            );
            setAudioUrls(Object.fromEntries(audioEntries));
        } catch (err: any) {
            toast.error('Failed to load media', { description: err.message });
        } finally {
            setSigning(false);
        }
    };

    const sendFeedback = async (stars: 1 | 2 | 3) => {
        if (!selected) return;
        try {
            await DubbingService.addFeedback(selected.id, stars, comment.trim() || undefined);
            toast.success(`Feedback sent to ${selected.studentName}`);
            setComment('');
        } catch (err: any) {
            toast.error('Failed to send feedback', { description: err.message });
        }
    };

    const doUnpublish = async () => {
        if (!confirmingUnpublish) return;
        const target = confirmingUnpublish;
        setConfirmingUnpublish(null);
        try {
            await DubbingService.unpublishDubbing(target.id);
            toast.success(`Take by ${target.studentName} unpublished`);
            if (selected?.id === target.id) setSelected(null);
            await load();
        } catch (err: any) {
            toast.error('Failed to unpublish', { description: err.message });
        }
    };

    const togglePlay = () => {
        if (!playerRef.current) return;
        if (playing) { playerRef.current.pause(); setPlaying(false); }
        else { playerRef.current.play(); setPlaying(true); }
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={onBack}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                    <ArrowLeft size={16} /> Back
                </button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-bold text-slate-800 truncate">{clip.title}</h1>
                    <p className="text-sm text-slate-500">Review student takes, leave feedback, moderate published dubs</p>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40 text-slate-400">
                    <Loader2 className="animate-spin" size={24} />
                </div>
            ) : entries.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
                    <Users className="mx-auto text-slate-300 mb-3" size={36} />
                    <h3 className="font-bold text-slate-700 mb-1">No takes yet</h3>
                    <p className="text-sm text-slate-500">Student takes for this clip will appear here.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: student × takes list */}
                    <div className="space-y-4">
                        {byStudent.map(({ name, takes }) => (
                            <div key={takes[0].studentId} className="bg-white rounded-2xl border border-slate-200 p-4">
                                <div className="font-bold text-slate-800 mb-3">{name}</div>
                                <div className="space-y-2">
                                    {takes.map((t) => (
                                        <div
                                            key={t.id}
                                            className={`flex flex-wrap items-center gap-2 p-3 rounded-xl border ${
                                                selected?.id === t.id
                                                    ? 'border-teacher-primary bg-teacher-primary/5'
                                                    : 'border-slate-200'
                                            }`}
                                        >
                                            <button
                                                onClick={() => openTake(t)}
                                                className="text-sm font-medium text-slate-700 hover:underline"
                                            >
                                                Take {t.attemptNo}
                                            </button>
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                                    t.isPublished
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : 'bg-slate-100 text-slate-500'
                                                }`}
                                            >
                                                {t.isPublished ? 'published' : 'private'}
                                            </span>
                                            {bandChip(t.overallBand)}
                                            <div className="flex-1" />
                                            {t.isPublished && (
                                                <button
                                                    onClick={() => setConfirmingUnpublish(t)}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 text-xs font-medium text-slate-500 hover:text-red-500 hover:border-red-200"
                                                >
                                                    <EyeOff size={14} /> Unpublish
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Right: player + feedback */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-4 h-fit">
                        {!selected ? (
                            <p className="text-sm text-slate-400 text-center py-10">Select a take to review it.</p>
                        ) : signing || !videoUrl ? (
                            <div className="flex items-center justify-center h-48 text-slate-400">
                                <Loader2 className="animate-spin" size={24} />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <DubPlayer
                                    ref={playerRef}
                                    videoUrl={videoUrl}
                                    lines={lines}
                                    lineAudioUrls={audioUrls}
                                    className="w-full rounded-xl bg-black aspect-video"
                                />
                                <button
                                    onClick={togglePlay}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teacher-primary text-teacher-dark font-bold"
                                >
                                    {playing ? <Pause size={16} /> : <Play size={16} />}
                                    {playing ? 'Pause' : 'Play take'}
                                </button>

                                <div className="border-t border-slate-100 pt-4">
                                    <div className="text-sm font-bold text-slate-700 mb-2">
                                        Feedback for {selected.studentName} (Take {selected.attemptNo})
                                    </div>
                                    <StarPicker onPick={sendFeedback} />
                                    <div className="flex gap-2 mt-3">
                                        <input
                                            value={comment}
                                            onChange={(e) => setComment(e.target.value)}
                                            placeholder="Optional comment…"
                                            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teacher-primary"
                                        />
                                        <span className="inline-flex items-center text-slate-300">
                                            <MessageSquare size={16} />
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1">Pick 1–3 stars to send feedback (comment optional).</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Unpublish confirm dialog */}
            {confirmingUnpublish && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
                        <h3 className="font-bold text-slate-800 mb-2">Unpublish this take?</h3>
                        <p className="text-sm text-slate-600 mb-5">
                            {confirmingUnpublish.studentName}'s Take {confirmingUnpublish.attemptNo} will be removed from the
                            class gallery. The take itself is kept.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setConfirmingUnpublish(null)}
                                className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={doUnpublish}
                                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-bold hover:bg-red-600"
                            >
                                Unpublish
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DubbingReview;
