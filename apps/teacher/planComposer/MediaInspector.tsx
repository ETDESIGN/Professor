import React, { useState } from 'react';
import { Loader2, Search, Link2, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../services/supabaseClient';
import { parseYouTubeUrl, oembedLookup } from '../../../services/youtubeUrl';

// MediaInspector — plan-time video resolution for a MEDIA_PLAYER block (spec
// 2026-09-13): the song/video step becomes fixable in the COMPOSER instead of
// only live. "Find video" runs the server catalog ladder (generate-media
// resolve-media, which heals the same block across plans + class plans);
// pasting a YouTube URL validates via oEmbed then applies server-side.
// The parent refreshes the timeline after each action (server-persisted data
// is the source of truth).

interface MediaInspectorProps {
  unitId: string;
  block: { title?: string; data?: any };
  onDataPatched: () => void | Promise<void>;
}

const MediaInspector: React.FC<MediaInspectorProps> = ({ unitId, block, onDataPatched }) => {
  const [finding, setFinding] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [url, setUrl] = useState('');
  const data = block.data || {};
  const resolved = Boolean(data.videoUrl || data.audioUrl);

  const findVideo = async () => {
    setFinding(true);
    try {
      const { data: out, error } = await supabase.functions.invoke('generate-media', {
        body: { action: 'resolve-media', unitId },
      });
      if (error) throw new Error(error.message);
      if (out?.error) throw new Error(String(out.error));
      const n = Number(out?.resolvedCount ?? 0);
      await onDataPatched();
      if (n > 0) toast.success(`Video found for ${n} step${n === 1 ? '' : 's'}`);
      else toast.info('No catalog match yet — paste a YouTube URL below, or resolve it live.');
    } catch (err: any) {
      toast.error(`Find video failed: ${err?.message || err}`);
    } finally {
      setFinding(false);
    }
  };

  const applyUrl = async () => {
    const parsed = parseYouTubeUrl(url.trim());
    if (!parsed?.videoId) {
      toast.error('That does not look like a YouTube video URL.');
      return;
    }
    setPasting(true);
    try {
      const oe = await oembedLookup(parsed.videoId);
      if (!oe.ok) throw new Error('YouTube does not know this video — check the URL.');
      const { data: out, error } = await supabase.functions.invoke('generate-media', {
        body: {
          action: 'apply-media',
          unitId,
          url: `https://www.youtube.com/watch?v=${parsed.videoId}`,
          ...(data.search_query ? { blockSearchQuery: String(data.search_query) } : {}),
        },
      });
      if (error) throw new Error(error.message);
      if (out?.error) throw new Error(String(out.error));
      setUrl('');
      await onDataPatched();
      toast.success('Video applied');
    } catch (err: any) {
      toast.error(err?.message || 'Apply failed');
    } finally {
      setPasting(false);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
      <label className="block text-xs font-bold text-blue-700 uppercase">Video</label>
      {resolved ? (
        <div className="flex items-start gap-2 text-xs text-slate-700">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-bold truncate">{data.videoTitle || data.title || 'Video ready'}</p>
            <p className="text-slate-400">
              {data.videoChannel ? `${data.videoChannel} · ` : ''}
              {data.resolvedVia ? `via ${data.resolvedVia}` : 'resolved'}
            </p>
            {data.videoUrl && (
              <a href={data.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 font-bold mt-1">
                Open on YouTube <ExternalLink size={10} />
              </a>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2 text-xs text-amber-700">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p>No video yet — this step will show the honest standby card until resolved.</p>
          </div>
          <button
            type="button"
            onClick={findVideo}
            disabled={finding}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-2 rounded-lg text-xs hover:bg-blue-700 disabled:opacity-50"
          >
            {finding ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            Find video (catalog)
          </button>
          {Array.isArray(data.candidates) && data.candidates.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-slate-500 font-bold uppercase">Suggestions</p>
              {data.candidates.slice(0, 3).map((c: any, i: number) => (
                <a
                  key={i}
                  href={c.url || `https://www.youtube.com/results?search_query=${encodeURIComponent(data.search_query || '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-[11px] text-indigo-600 font-bold truncate hover:underline"
                >
                  {c.title || c.url || 'Candidate'}
                </a>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <div className="flex-1 flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2">
              <Link2 size={13} className="text-slate-400 shrink-0" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste a YouTube URL"
                className="flex-1 py-2 text-xs outline-none bg-transparent"
              />
            </div>
            <button
              type="button"
              onClick={applyUrl}
              disabled={pasting || url.trim().length === 0}
              className="px-3 py-2 bg-slate-800 text-white font-bold rounded-lg text-xs disabled:opacity-40"
            >
              {pasting ? <Loader2 size={13} className="animate-spin" /> : 'Use'}
            </button>
          </div>
        </>
      )}
      {Array.isArray(data.lyrics) && data.lyrics.length > 0 && (
        <p className="text-[11px] text-slate-400">Lyrics are attached — the board shows the chant-along fallback if the video can’t play.</p>
      )}
    </div>
  );
};

export default MediaInspector;
