import React, { useState, useEffect, useMemo } from 'react';
import { Search, X, Image as ImageIcon, Music, Video, Loader2, Inbox, Check } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

// Phase 3.1 — MediaPickerModal (advisor §6.3). One reusable picker used by any
// field that needs media (vocab image, story image, character portrait, song,
// video, dialogue audio). Shows the scoped vault (filtered by kind) and calls
// onSelect with the chosen asset. Closes G5 (every screen previously rolled its
// own media picking). Upload/generate-inline actions are a follow-up.

export interface PickedAsset {
  id: string;
  type: string;
  kind: string | null;
  public_url: string | null;
  source_url: string | null;
  prompt: string | null;
}

interface MediaPickerModalProps {
  kind?: 'image' | 'audio' | 'video';
  title?: string;
  onSelect: (asset: PickedAsset) => void;
  onClose: () => void;
}

const MediaPickerModal: React.FC<MediaPickerModalProps> = ({ kind = 'image', title, onSelect, onClose }) => {
  const [assets, setAssets] = useState<PickedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('assets')
          .select('id, type, kind, prompt, public_url, source_url')
          .eq('is_deleted', false)
          .eq('type', kind)
          .order('created_at', { ascending: false })
          .limit(200);
        if (!cancelled) setAssets(Array.isArray(data) ? (data as PickedAsset[]) : []);
      } catch {
        if (!cancelled) setAssets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [kind]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) => (a.prompt || '').toLowerCase().includes(q));
  }, [assets, search]);

  const selected = assets.find((a) => a.id === selectedId) || null;

  const PreviewIcon = kind === 'audio' ? Music : kind === 'video' ? Video : ImageIcon;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">{title || `Choose ${kind}`}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 size={26} className="animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Inbox size={40} className="mb-2 opacity-40" />
              <p className="text-sm">No {kind} assets available yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filtered.map((asset) => {
                const url = asset.public_url || asset.source_url || '';
                const isSel = asset.id === selectedId;
                return (
                  <button
                    key={asset.id}
                    onClick={() => setSelectedId(asset.id)}
                    className={`relative aspect-video rounded-xl overflow-hidden border-2 transition-all group ${isSel ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    {kind === 'image' && url ? (
                      <img src={url} className="w-full h-full object-cover" alt={asset.prompt || ''} loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-300">
                        <PreviewIcon size={32} />
                      </div>
                    )}
                    {isSel && (
                      <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-white">
                        <Check size={14} />
                      </div>
                    )}
                    {asset.prompt && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
                        <p className="text-[10px] text-white truncate text-left">{asset.prompt}</p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={() => selected && onSelect(selected)}
            disabled={!selected}
            className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-pink-600 hover:bg-pink-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
};

export default MediaPickerModal;
