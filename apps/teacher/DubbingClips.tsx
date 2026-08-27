import React, { useEffect, useState } from 'react';
import {
    Plus, Pencil, Send, Undo2, Archive, Film, Loader2, Video, ClipboardCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { DubbingService, DubbingClip } from '../../services/DubbingService';
import { supabase } from '../../services/supabaseClient';
import { useTeacherClasses } from '../../hooks/useQueries';
import { useAppStore } from '../../store/useAppStore';
import { ClassData } from '../../services/DataService';
import ClipScriptEditor from './ClipScriptEditor';
import DubbingReview from './DubbingReview';

const statusChip = (status: DubbingClip['status']) => {
    const cls =
        status === 'assigned'
            ? 'bg-emerald-100 text-emerald-700'
            : status === 'draft'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-200 text-slate-600';
    return <span className={`px-2 py-0.5 rounded-full text-xs font-bold capitalize ${cls}`}>{status}</span>;
};

/** First-frame thumbnail via <video preload="metadata"> over a signed URL. */
const ClipThumb: React.FC<{ clip: DubbingClip }> = ({ clip }) => {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        DubbingService.signedUrl(clip.videoPath)
            .then((u) => { if (!cancelled) setUrl(u); })
            .catch(() => { /* thumbnail stays a placeholder */ });
        return () => { cancelled = true; };
    }, [clip.videoPath]);
    if (!url) {
        return (
            <div className="h-32 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300">
                <Film size={32} />
            </div>
        );
    }
    return <video src={url} preload="metadata" className="h-32 w-full rounded-xl object-cover bg-black" />;
};

const DubbingClips: React.FC = () => {
    const { userProfile } = useAppStore();
    const { data: classes = [], isLoading: loadingClasses } = useTeacherClasses(userProfile?.id);

    const [selectedClassId, setSelectedClassId] = useState<string>('');
    const [clips, setClips] = useState<(DubbingClip & { lineCount?: number })[]>([]);
    const [loadingClips, setLoadingClips] = useState(false);
    const [editing, setEditing] = useState<{ clip?: DubbingClip } | null>(null);
    const [reviewing, setReviewing] = useState<DubbingClip | null>(null);

    useEffect(() => {
        if (!selectedClassId && classes.length > 0) setSelectedClassId(classes[0].id);
    }, [classes, selectedClassId]);

    const loadClips = async () => {
        if (!selectedClassId) { setClips([]); return; }
        setLoadingClips(true);
        try {
            const list = await DubbingService.listTeacherClips(selectedClassId);
            // line counts per clip (single batched query)
            let counts = new Map<string, number>();
            if (list.length > 0) {
                const { data } = await supabase
                    .from('dubbing_clip_lines')
                    .select('clip_id')
                    .in('clip_id', list.map((c) => c.id));
                counts = new Map<string, number>();
                for (const r of data ?? []) counts.set(r.clip_id, (counts.get(r.clip_id) ?? 0) + 1);
            }
            setClips(list.map((c) => ({ ...c, lineCount: counts.get(c.id) ?? 0 })));
        } catch (e: any) {
            toast.error('Failed to load clips', { description: e.message });
        } finally {
            setLoadingClips(false);
        }
    };

    useEffect(() => {
        if (!editing && !reviewing) loadClips();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedClassId, editing]);

    const withToast = async (fn: () => Promise<void>, ok: string) => {
        try {
            await fn();
            toast.success(ok);
            await loadClips();
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    const assign = (clip: DubbingClip) =>
        withToast(() => DubbingService.assignClip(clip.id), 'Clip assigned to class');
    // DubbingService only exposes draft→assigned; the reverse transition is a
    // simple status reset done here so teachers can move clips back to draft.
    const unassign = (clip: DubbingClip) =>
        withToast(
            async () => {
                const { error } = await supabase
                    .from('dubbing_clips')
                    .update({ status: 'draft' })
                    .eq('id', clip.id)
                    .eq('status', 'assigned');
                if (error) throw new Error(error.message);
            },
            'Clip moved back to draft',
        );
    const archive = (clip: DubbingClip) =>
        withToast(() => DubbingService.archiveClip(clip.id), 'Clip archived');

    if (reviewing) {
        return <DubbingReview clip={reviewing} onBack={() => setReviewing(null)} />;
    }

    if (editing) {
        const cls: ClassData | undefined = classes.find((c) => c.id === (editing.clip?.classId ?? selectedClassId));
        return (
            <ClipScriptEditor
                clip={editing.clip}
                classes={classes}
                defaultClassId={cls?.id}
                onBack={() => setEditing(null)}
                onDone={() => setEditing(null)}
            />
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <Video className="text-teacher-primary" size={24} />
                <div className="flex-1 min-w-[200px]">
                    <h1 className="text-xl font-bold text-slate-800">Dubbing clips</h1>
                    <p className="text-sm text-slate-500">Upload short videos and mark lines for students to dub</p>
                </div>
                <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-teacher-primary"
                >
                    {classes.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
                <button
                    onClick={() => setEditing({})}
                    disabled={!selectedClassId}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teacher-primary text-teacher-dark font-bold disabled:opacity-40"
                >
                    <Plus size={16} /> New clip
                </button>
            </div>

            {loadingClasses || loadingClips ? (
                <div className="flex items-center justify-center h-40 text-slate-400">
                    <Loader2 className="animate-spin" size={24} />
                </div>
            ) : clips.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
                    <Film className="mx-auto text-slate-300 mb-3" size={36} />
                    <h3 className="font-bold text-slate-700 mb-1">No clips yet</h3>
                    <p className="text-sm text-slate-500 mb-4">Create your first dubbing clip for this class.</p>
                    <button
                        onClick={() => setEditing({})}
                        disabled={!selectedClassId}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teacher-primary text-teacher-dark font-bold disabled:opacity-40"
                    >
                        <Plus size={16} /> New clip
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {clips.map((clip) => (
                        <div key={clip.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3">
                            <ClipThumb clip={clip} />
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800 truncate flex-1">{clip.title}</span>
                                {statusChip(clip.status)}
                            </div>
                            <div className="text-xs text-slate-500 flex gap-3">
                                <span>{(clip.videoDurationMs / 1000).toFixed(1)}s</span>
                                <span>{clip.lineCount ?? 0} line{(clip.lineCount ?? 0) === 1 ? '' : 's'}</span>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-auto">
                                <button
                                    onClick={() => setReviewing(clip)}
                                    disabled={clip.status !== 'assigned'}
                                    title={clip.status !== 'assigned' ? 'Only assigned clips have takes' : 'Review student takes'}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                                >
                                    <ClipboardCheck size={14} /> Review
                                </button>
                                <button
                                    onClick={() => setEditing({ clip })}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                >
                                    <Pencil size={14} /> Edit lines
                                </button>
                                {clip.status === 'draft' ? (
                                    <button
                                        onClick={() => assign(clip)}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teacher-primary text-teacher-dark text-sm font-bold"
                                    >
                                        <Send size={14} /> Assign
                                    </button>
                                ) : clip.status === 'assigned' ? (
                                    <button
                                        onClick={() => unassign(clip)}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                    >
                                        <Undo2 size={14} /> Unassign
                                    </button>
                                ) : null}
                                <button
                                    onClick={() => archive(clip)}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-500 hover:text-red-500 hover:border-red-200"
                                >
                                    <Archive size={14} /> Archive
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DubbingClips;
