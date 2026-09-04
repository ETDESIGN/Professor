import React, { useState } from 'react';
import { Loader2, Wand2, Check } from 'lucide-react';
import { useSession } from '../../../../store/SessionContext';
import { parseYouTubeUrl, oembedLookup } from '../../../../services/youtubeUrl';

/**
 * MediaResolvePanel (media design 2026-09-04, W3.4): the live quick-resolve
 * surface shown in the commander/remote when the current step is a MEDIA_PLAYER
 * with nothing playable. Three moves, fastest first:
 *   1. "Find video" — the catalog-first ladder runs server-side (resolve-media)
 *   2. Candidate chips — one-click apply (server validates + persists both
 *      flow stores, all tabs converge via MEDIA_RESOLVED)
 *   3. Paste a YouTube URL — client oEmbed preview, server validates on apply.
 */
const MediaResolvePanel: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { resolveMediaForActiveUnit, applyMediaToStep } = useSession();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<{ title?: string; channel?: string; thumbnailUrl?: string; offline?: boolean } | null>(null);
  const [checking, setChecking] = useState(false);

  const findVideo = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await resolveMediaForActiveUnit();
      if (!r.ok) setMsg(r.error || 'Resolution failed');
      else if (!r.resolvedCount) setMsg('No match found — paste a URL or open the search');
      else setMsg(null);
    } finally { setBusy(false); }
  };

  const checkUrl = async (value: string) => {
    setUrl(value);
    setPreview(null);
    const parsed = parseYouTubeUrl(value);
    if (!parsed) return;
    setChecking(true);
    try {
      const r = await oembedLookup(parsed.videoId);
      setPreview(r.ok ? r : { offline: true, title: value });
    } finally { setChecking(false); }
  };

  const applyUrl = async () => {
    const parsed = parseYouTubeUrl(url);
    if (!parsed) { setMsg('That does not look like a YouTube link'); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await applyMediaToStep(parsed.canonicalUrl);
      if (!r.ok) setMsg(r.error || 'Could not apply the video');
      else { setUrl(''); setPreview(null); }
    } finally { setBusy(false); }
  };

  return (
    <div className={`flex flex-col gap-2 ${compact ? 'p-2' : 'p-3'} bg-slate-800/80 rounded-xl border border-slate-700/60 w-full`}>
      <div className="flex items-center gap-2">
        <button onClick={findVideo} disabled={busy}
          className="h-10 px-4 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />} Find video
        </button>
        <div className="flex-1 flex gap-2">
          <input value={url} onChange={e => checkUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyUrl()}
            placeholder="Paste a YouTube link…"
            className="flex-1 min-w-0 bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500" />
          <button onClick={applyUrl} disabled={busy || !parseYouTubeUrl(url)}
            className="h-10 px-3 bg-slate-100 text-slate-900 rounded-lg text-sm font-bold flex items-center gap-1 disabled:opacity-40">
            {checking ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Apply
          </button>
        </div>
      </div>

      {preview && (
        <div className="flex items-center gap-3 bg-slate-900/60 rounded-lg p-2 border border-slate-700/60">
          {preview.thumbnailUrl && <img src={preview.thumbnailUrl} alt="" className="w-24 h-14 rounded object-cover shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm text-white font-medium truncate">{preview.title || 'Unverified link'}</p>
            <p className="text-xs text-slate-400 truncate">
              {preview.channel || 'unknown channel'}
              {preview.offline ? ' · offline (not verified)' : ' · verified'}
            </p>
          </div>
        </div>
      )}

      {msg && <p className="text-xs text-amber-400 px-1">{msg}</p>}
    </div>
  );
};

export default MediaResolvePanel;
