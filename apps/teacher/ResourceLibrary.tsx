import React, { useState, useEffect, useMemo } from 'react';
import { Search, Image as ImageIcon, Music, Video, Loader2, Inbox, Volume2, RefreshCw, LayoutGrid, Rows3 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../services/supabaseClient';
import { MediaService } from '../../services/MediaService';
import { deriveAssetCategory, ASSET_CATEGORIES, AssetCategory } from '../../services/assetCategory';

interface WordImageRow {
  word_key: string;
  updated_at: string;
  assets: { id: string; public_url: string; created_at: string } | null;
}

// Phase 3.1 — Resource Library (the vault). Wired to the real `assets` table
// (advisor §6.4: "ResourceLibrary wired to assets instead of its hardcoded 6
// items"). This is the full-page browser; the modal variant for picking media
// into a field is <MediaPickerModal> (advisor §6.3), which shares the same
// query/shape. Soft-deleted assets (is_deleted) are hidden, never hard-deleted.

interface AssetRow {
  id: string;
  type: string;
  kind: string | null;
  prompt: string | null;
  public_url: string | null;
  source_url: string | null;
  tags: string[] | null;
  created_at: string | null;
  metadata: Record<string, any> | null;
}

const KIND_LABEL: Record<string, string> = { generated: 'AI', uploaded: 'Upload', external_url: 'Link' };

const AssetCard: React.FC<{ asset: AssetRow; index: number }> = ({ asset, index }) => {
  const url = asset.public_url || asset.source_url || '';
  const title = asset.prompt || asset.tags?.[0] || 'Untitled asset';
  const kind = asset.kind || 'generated';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
      className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all group"
    >
      <div className="aspect-video bg-slate-100 relative overflow-hidden flex items-center justify-center">
        {asset.type === 'image' && url ? (
          <img src={url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={title} loading="lazy" />
        ) : asset.type === 'audio' ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-indigo-50 text-indigo-400">
            <Music size={44} />
          </div>
        ) : asset.type === 'video' ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-rose-50 text-rose-400">
            <Video size={44} />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-300">
            <ImageIcon size={44} />
          </div>
        )}
        <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-black/50 text-white backdrop-blur">
          {KIND_LABEL[kind] || kind}
        </span>
      </div>
      <div className="p-4">
        <h3 className="font-bold text-slate-800 truncate" title={title}>{title}</h3>
        <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
          <span className="uppercase font-bold tracking-wider">
            {ASSET_CATEGORIES.find((c) => c.id === deriveAssetCategory(asset))?.label || asset.type}
          </span>
          {asset.created_at && <span>{new Date(asset.created_at).toLocaleDateString()}</span>}
        </div>
        {asset.tags && asset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {asset.tags.slice(0, 4).map((t, i) => (
              <span key={i} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{t}</span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

// Word-library flashcard (spec 2026-09-05 §3.3): front = canonical image,
// tap flips to the word + audio (TTS is globally deduped → cache hit) +
// regenerate (replaces the teacher's image for this word everywhere).
const Flashcard: React.FC<{
  wordKey: string; url: string; onRegenerated: (wordKey: string, url: string) => void;
}> = ({ wordKey, url, onRegenerated }) => {
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState<'' | 'audio' | 'regen'>('');

  const playAudio = async () => {
    setBusy('audio');
    try {
      // Empty unitId keeps the edge call unitId-less (staff-gated) while the
      // global TTS cache makes published words instant.
      const audioUrl = await MediaService.getVocabAudio('', wordKey);
      if (audioUrl) void new Audio(audioUrl).play().catch(() => undefined);
    } finally { setBusy(''); }
  };

  const regenerate = async () => {
    setBusy('regen');
    try {
      const { data, error } = await supabase.functions.invoke('generate-media', {
        body: { action: 'generate-image', word: wordKey, regenerate: true },
      });
      if (!error && data?.url && !String(data.url).includes('dicebear')) onRegenerated(wordKey, data.url);
    } finally { setBusy(''); }
  };

  return (
    <div
      onClick={() => setFlipped((f) => !f)}
      className="cursor-pointer select-none aspect-square rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-lg transition-all relative"
    >
      {!flipped ? (
        <img src={url} alt={wordKey} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4 bg-emerald-50">
          <span className="text-2xl font-extrabold text-slate-800 capitalize text-center break-words">{wordKey}</span>
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={playAudio}
              disabled={busy !== ''}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              <Volume2 size={16} /> {busy === 'audio' ? '…' : 'Audio'}
            </button>
            <button
              onClick={regenerate}
              disabled={busy !== ''}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              <RefreshCw size={16} className={busy === 'regen' ? 'animate-spin' : ''} /> New image
            </button>
          </div>
          <p className="text-[10px] text-slate-400">tap the card to flip back</p>
        </div>
      )}
    </div>
  );
};

const ResourceLibrary: React.FC = () => {
  const [filter, setFilter] = useState<AssetCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'flashcards'>('grid');
  const [wordImages, setWordImages] = useState<WordImageRow[]>([]);

  useEffect(() => {
    if (viewMode !== 'flashcards' || wordImages.length > 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('word_images')
        .select('word_key, updated_at, assets(id, public_url, created_at)')
        .order('updated_at', { ascending: false });
      // Generated types model the assets embed as an array; PostgREST returns
      // a single object for this many-to-one embed — normalize through any.
      const rows = (Array.isArray(data) ? data : []) as any[];
      if (!cancelled) setWordImages(rows.filter((r) => r?.assets?.public_url));
    })();
    return () => { cancelled = true; };
  }, [viewMode]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('assets')
          .select('id, type, kind, prompt, public_url, source_url, tags, created_at, metadata')
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(500);
        if (!cancelled) setAssets(Array.isArray(data) ? (data as AssetRow[]) : []);
      } catch {
        if (!cancelled) setAssets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let list = assets;
    if (filter !== 'all') list = list.filter((a) => deriveAssetCategory(a) === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((a) =>
        (a.prompt || '').toLowerCase().includes(q) ||
        String(a.metadata?.word_key || '').toLowerCase().includes(q) ||
        (a.tags || []).some((t) => t.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [assets, filter, search]);

  return (
    <div className="flex-1 p-8 overflow-auto bg-slate-50">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Resource Library</h1>
          <p className="text-slate-500">All generated and uploaded media across your units.</p>
        </div>
      </header>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by prompt or tag..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${filter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            All
          </button>
          {ASSET_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${filter === c.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {filter === 'vocabulary' && (
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold ${viewMode === 'grid' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}
            ><Rows3 size={16} /> Grid</button>
            <button
              onClick={() => setViewMode('flashcards')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold ${viewMode === 'flashcards' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}
            ><LayoutGrid size={16} /> Flashcards</button>
          </div>
        )}
      </div>

      {/* Flashcards / grid / states */}
      {viewMode === 'flashcards' && filter === 'vocabulary' ? (
        wordImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <LayoutGrid size={48} className="mb-3 opacity-40" />
            <p className="font-medium text-slate-500">No word images yet</p>
            <p className="text-sm mt-1">They appear as units generate vocabulary media.</p>
          </div>
        ) : (
          <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {wordImages
              .filter((w) => !search.trim() || w.word_key.includes(search.trim().toLowerCase()))
              .map((w) => (
                <Flashcard
                  key={w.word_key}
                  wordKey={w.word_key}
                  url={w.assets!.public_url}
                  onRegenerated={(wordKey, newUrl) =>
                    setWordImages((prev) => prev.map((r) => r.word_key === wordKey
                      ? { ...r, assets: r.assets ? { ...r.assets, public_url: newUrl } : r.assets, updated_at: new Date().toISOString() }
                      : r))}
                />
              ))}
          </motion.div>
        )
      ) : loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 size={28} className="animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Inbox size={48} className="mb-3 opacity-40" />
          <p className="font-medium text-slate-500">
            {assets.length === 0 ? 'No media yet' : 'No media matches your search'}
          </p>
          {assets.length === 0 && (
            <p className="text-sm mt-1">Generate a unit's exercises and its images will appear here.</p>
          )}
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <AnimatePresence>
            {filtered.map((asset, index) => (
              <AssetCard key={asset.id} asset={asset} index={index} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
};

export default ResourceLibrary;
