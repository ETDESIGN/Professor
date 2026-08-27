import React, { useRef, useState, useEffect } from 'react';
import {
    ArrowLeft, ArrowDown, ArrowUp, Trash2, Film, Plus, Save, Send, Loader2, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { DubbingService, DubbingClip, ClipLine } from '../../services/DubbingService';
import { supabase } from '../../services/supabaseClient';
import { Field } from './SharedUI';
import { ClassData } from '../../services/DataService';

const MAX_DURATION_MS = 60_000;
const MAX_SIZE_BYTES = 50 * 1024 * 1024;
const ACCEPTED = ['video/mp4', 'video/webm'];

type EditorLine = Omit<ClipLine, 'id'>;

const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const frac = Math.floor((ms % 1000) / 100);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${frac}`;
};

/** Measures a video file's duration (ms) via a temp <video> element. */
function measureVideoDuration(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => {
            const d = Math.round((v.duration || 0) * 1000);
            URL.revokeObjectURL(url);
            resolve(d);
        };
        v.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Could not read video metadata'));
        };
        v.src = url;
    });
}

interface ClipScriptEditorProps {
    /** Existing clip to edit (lines mode). Omit for the create flow. */
    clip?: DubbingClip;
    classes: ClassData[];
    defaultClassId?: string;
    onBack: () => void;
    onDone: () => void;
}

const ClipScriptEditor: React.FC<ClipScriptEditorProps> = ({
    clip: existingClip,
    classes,
    defaultClassId,
    onBack,
    onDone,
}) => {
    // ── Create-flow state ────────────────────────────────────────────────────
    const [file, setFile] = useState<File | null>(null);
    const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
    const [title, setTitle] = useState(existingClip?.title ?? '');
    const [classId, setClassId] = useState<string>(existingClip?.classId ?? defaultClassId ?? '');
    const [measuredDurationMs, setMeasuredDurationMs] = useState<number>(existingClip?.videoDurationMs ?? 0);

    // ── Editor state ─────────────────────────────────────────────────────────
    const [clip, setClip] = useState<DubbingClip | null>(existingClip ?? null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [lines, setLines] = useState<EditorLine[]>([]);
    const [lineStartMs, setLineStartMs] = useState<number | null>(null);
    const [lineEndMs, setLineEndMs] = useState<number | null>(null);
    const [lineText, setLineText] = useState('');
    const [lineCharacter, setLineCharacter] = useState('');
    const [busy, setBusy] = useState(false);
    const [creating, setCreating] = useState(false);

    // Load video URL + existing lines for an existing clip
    useEffect(() => {
        if (!existingClip) return;
        let cancelled = false;
        (async () => {
            try {
                const url = await DubbingService.signedUrl(existingClip.videoPath);
                if (!cancelled) setVideoUrl(url);
            } catch (e: any) {
                toast.error('Could not load video', { description: e.message });
            }
            const { data, error } = await supabase
                .from('dubbing_clip_lines')
                .select('*')
                .eq('clip_id', existingClip.id)
                .order('order', { ascending: true });
            if (!cancelled && !error) {
                setLines(
                    (data ?? []).map((r: any) => ({
                        order: r.order,
                        text: r.text,
                        startMs: r.start_ms,
                        endMs: r.end_ms,
                        characterName: r.character_name ?? null,
                    })),
                );
            }
        })();
        return () => { cancelled = true; };
    }, [existingClip]);

    const handleFilePicked = async (f: File | null) => {
        if (!f) return;
        if (!ACCEPTED.includes(f.type)) {
            toast.error('Unsupported format', { description: 'Use an MP4 or WebM video.' });
            return;
        }
        if (f.size > MAX_SIZE_BYTES) {
            toast.error('Video exceeds 50MB limit');
            return;
        }
        try {
            const durationMs = await measureVideoDuration(f);
            if (durationMs > MAX_DURATION_MS) {
                toast.error('Video exceeds 60s limit', { description: `Measured ${(durationMs / 1000).toFixed(1)}s.` });
                return;
            }
            setFile(f);
            setMeasuredDurationMs(durationMs);
            setLocalVideoUrl(URL.createObjectURL(f));
            if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
        } catch (e: any) {
            toast.error('Could not read video', { description: e.message });
        }
    };

    const handleCreate = async () => {
        if (!file || !title.trim() || !classId) {
            toast.error('Pick a video, title, and class first');
            return;
        }
        setCreating(true);
        try {
            const { id, videoPath } = await DubbingService.createClip({
                classId,
                title: title.trim(),
                videoDurationMs: measuredDurationMs,
            });
            await DubbingService.uploadClipVideo(id, file);
            setClip({
                id,
                classId,
                unitId: null,
                title: title.trim(),
                videoPath,
                videoDurationMs: measuredDurationMs,
                language: 'en',
                status: 'draft',
            });
            setVideoUrl(localVideoUrl);
            toast.success('Clip created — mark your lines');
        } catch (e: any) {
            toast.error('Failed to create clip', { description: e.message });
        } finally {
            setCreating(false);
        }
    };

    const currentTimeMs = () => Math.round((videoRef.current?.currentTime ?? 0) * 1000);

    const markIn = () => {
        const t = currentTimeMs();
        setLineStartMs(t);
        if (lineEndMs !== null && lineEndMs <= t) setLineEndMs(null);
    };
    const markOut = () => {
        const t = currentTimeMs();
        if (lineStartMs !== null && t <= lineStartMs) {
            toast.error('End must be after start');
            return;
        }
        setLineEndMs(t);
    };

    const addLine = () => {
        if (lineStartMs === null || lineEndMs === null) {
            toast.error('Mark in and out points first');
            return;
        }
        if (!lineText.trim()) {
            toast.error('Enter the line text');
            return;
        }
        const next: EditorLine = {
            order: lines.length,
            text: lineText.trim(),
            startMs: lineStartMs,
            endMs: lineEndMs,
            characterName: lineCharacter.trim() || null,
        };
        // quick client-side overlap check in timeline order
        const overlaps = lines.some((l) => next.startMs < l.endMs && l.startMs < next.endMs);
        if (overlaps) {
            toast.error('Lines overlap', { description: 'This time range intersects an existing line.' });
            return;
        }
        setLines((prev) => [...prev, next]);
        setLineStartMs(null);
        setLineEndMs(null);
        setLineText('');
        setLineCharacter('');
    };

    const removeLine = (i: number) =>
        setLines((prev) => prev.filter((_, idx) => idx !== i).map((l, idx) => ({ ...l, order: idx })));

    const moveLine = (i: number, dir: -1 | 1) => {
        const j = i + dir;
        if (j < 0 || j >= lines.length) return;
        setLines((prev) => {
            const next = [...prev];
            [next[i], next[j]] = [next[j], next[i]];
            return next.map((l, idx) => ({ ...l, order: idx }));
        });
    };

    const saveLines = async (): Promise<boolean> => {
        if (!clip) return false;
        try {
            await DubbingService.saveClipLines(clip.id, lines);
            return true;
        } catch (e: any) {
            toast.error(e.message === 'Lines overlap' ? 'Lines overlap — fix the timings' : 'Save failed', {
                description: e.message !== 'Lines overlap' ? e.message : 'Lines must be in order without overlapping ranges.',
            });
            return false;
        }
    };

    const handleSaveDraft = async () => {
        setBusy(true);
        try {
            if (await saveLines()) toast.success('Draft saved');
        } finally {
            setBusy(false);
        }
    };

    const handleAssign = async () => {
        setBusy(true);
        try {
            if (!(await saveLines())) return;
            await DubbingService.assignClip(clip!.id);
            toast.success('Clip assigned to class');
            onDone();
        } catch (e: any) {
            toast.error('Assign failed', { description: e.message });
        } finally {
            setBusy(false);
        }
    };

    const canAssign = clip?.status === 'draft';

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <button onClick={onBack} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Back">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-xl font-bold text-slate-800">
                        {clip ? 'Edit clip script' : 'New dubbing clip'}
                    </h1>
                    <p className="text-sm text-slate-500">
                        {clip ? clip.title : 'Upload a short video and mark the lines to dub'}
                    </p>
                </div>
            </div>

            {/* Step 1: upload + create (create flow only) */}
            {!clip && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 mb-6">
                    <Field label="Video (MP4 / WebM, max 60s, max 50MB)">
                        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-6 cursor-pointer hover:border-teacher-primary transition-colors text-center">
                            <Film size={28} className="text-slate-400" />
                            <span className="text-sm font-medium text-slate-600">
                                {file ? file.name : 'Click to choose a video'}
                            </span>
                            {measuredDurationMs > 0 && (
                                <span className="text-xs text-slate-400 flex items-center gap-1">
                                    <Clock size={12} /> {(measuredDurationMs / 1000).toFixed(1)}s
                                </span>
                            )}
                            <input
                                type="file"
                                accept="video/mp4,video/webm"
                                className="hidden"
                                onChange={(e) => handleFilePicked(e.target.files?.[0] ?? null)}
                            />
                        </label>
                    </Field>
                    {localVideoUrl && (
                        <video src={localVideoUrl} controls className="w-full max-h-64 rounded-xl bg-black" />
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Title">
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g. At the restaurant"
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teacher-primary"
                            />
                        </Field>
                        <Field label="Class">
                            <select
                                value={classId}
                                onChange={(e) => setClassId(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-teacher-primary"
                            >
                                <option value="">Select a class…</option>
                                {classes.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </Field>
                    </div>
                    <button
                        onClick={handleCreate}
                        disabled={!file || !title.trim() || !classId || creating}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teacher-primary text-teacher-dark font-bold disabled:opacity-40"
                    >
                        {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        Create clip & start marking
                    </button>
                </div>
            )}

            {/* Step 2: line editor */}
            {clip && videoUrl && (
                <>
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
                        <video ref={videoRef} src={videoUrl} controls className="w-full max-h-80 rounded-xl bg-black" />
                        <div className="mt-4 flex flex-wrap items-end gap-3">
                            <button
                                onClick={markIn}
                                className="px-3 py-2 rounded-lg border border-slate-300 font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Mark in{lineStartMs !== null ? ` (${fmt(lineStartMs)})` : ''}
                            </button>
                            <button
                                onClick={markOut}
                                className="px-3 py-2 rounded-lg border border-slate-300 font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Mark out{lineEndMs !== null ? ` (${fmt(lineEndMs)})` : ''}
                            </button>
                            <div className="flex-1 min-w-[180px]">
                                <input
                                    value={lineCharacter}
                                    onChange={(e) => setLineCharacter(e.target.value)}
                                    placeholder="Character (optional)"
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teacher-primary"
                                />
                            </div>
                            <div className="flex-[2] min-w-[220px]">
                                <input
                                    value={lineText}
                                    onChange={(e) => setLineText(e.target.value)}
                                    placeholder="Line text…"
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teacher-primary"
                                />
                            </div>
                            <button
                                onClick={addLine}
                                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-teacher-primary text-teacher-dark font-bold"
                            >
                                <Plus size={16} /> Add line
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
                        <h2 className="text-sm font-bold text-slate-600 mb-3">Lines ({lines.length})</h2>
                        {lines.length === 0 && (
                            <p className="text-sm text-slate-400">No lines yet — play the video, mark in/out, type the text, then “Add line”.</p>
                        )}
                        <ul className="space-y-2">
                            {lines.map((l, i) => (
                                <li key={`${l.order}-${l.startMs}`} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                                    <span className="text-xs font-mono text-slate-400 shrink-0">
                                        {fmt(l.startMs)} → {fmt(l.endMs)}
                                    </span>
                                    <span className="text-sm text-slate-800 flex-1 truncate">
                                        {l.characterName && <span className="font-bold text-teacher-primary mr-1">{l.characterName}:</span>}
                                        {l.text}
                                    </span>
                                    <button onClick={() => moveLine(i, -1)} disabled={i === 0} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Move line up"><ArrowUp size={14} /></button>
                                    <button onClick={() => moveLine(i, 1)} disabled={i === lines.length - 1} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Move line down"><ArrowDown size={14} /></button>
                                    <button onClick={() => removeLine(i)} className="p-1 text-slate-400 hover:text-red-500" aria-label="Delete line"><Trash2 size={14} /></button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={handleSaveDraft}
                            disabled={busy}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        >
                            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save draft
                        </button>
                        <button
                            onClick={handleAssign}
                            disabled={busy || !canAssign}
                            title={canAssign ? undefined : 'Already assigned'}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teacher-primary text-teacher-dark font-bold disabled:opacity-40"
                        >
                            <Send size={16} /> Assign to class
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default ClipScriptEditor;
