import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronRight, MessageSquare, Music, Scissors, Target, X } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { toast } from 'sonner';

// FIXPLAN_F completion (2026-08-28) — the "From the book" panel (doc 10 §6,
// owner-approved shape): a collapsed summary card showing the verbatim book
// baskets that have no derived-content tab of their own — comics, printed
// activities, "I can…" objectives, mission texts, the book's own songs.
// Ledger semantics: the teacher already confirmed this material at the
// extraction review; this SURFACES it. Remove-per-item for structure-backed
// types; types with no live consumer yet are labeled "reserved for upcoming
// exercise mechanics" (doc 10 §9) so they read as a promise, not a dead end.

interface BasketItem {
  [k: string]: any;
}

// Panels-pool thumbnail (doc 12 §2): book-panel crops land as assets rows with
// metadata { structure_id, bbox, pool:'panel' [, panel_index, refined] } at
// enrichment time (gutter-refined per doc 12 §7).
interface PanelAsset {
  id: string;
  created_at?: string;
  public_url: string;
  metadata: { structure_id?: string | null; bbox?: number[]; panel_index?: number } | null;
}

interface BookBaskets {
  comics?: BasketItem[];
  activities?: BasketItem[];
  objectives?: string[];
  narrative?: BasketItem[];
  book_songs?: BasketItem[];
}

const excerpt = (s: unknown, n = 110): string => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};

const FromTheBookPanel: React.FC<{ unitId: string }> = ({ unitId }) => {
  const [baskets, setBaskets] = useState<BookBaskets | null>(null);
  const [openType, setOpenType] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  // Book-panel crops for the comics section, grouped by comic structure id and
  // sorted in reading order (top-to-bottom, then left-to-right).
  const [panelsByStructure, setPanelsByStructure] = useState<Record<string, PanelAsset[]>>({});

  const load = async () => {
    try {
      const { data, error } = await supabase.rpc('get_unit_baskets', { p_unit_id: unitId });
      if (!error && data) setBaskets(data);
    } catch { /* the panel is best-effort */ }
    try {
      const { data: assets } = await supabase
        .from('assets')
        .select('id, created_at, public_url, metadata')
        .eq('unit_id', unitId)
        .eq('kind', 'book_extract')
        .eq('metadata->>pool', 'panel')
        .order('created_at', { ascending: false });
      const grouped: Record<string, PanelAsset[]> = {};
      const seen = new Set<string>(); // (structure, panel_index|bbox) — newest wins
      for (const a of (assets || []) as PanelAsset[]) {
        if (!a?.public_url || !a.metadata?.structure_id) continue;
        const key = `${a.metadata.structure_id}:${typeof a.metadata.panel_index === 'number' ? a.metadata.panel_index : JSON.stringify(a.metadata?.bbox || [])}`;
        if (seen.has(key)) continue; // older crop of the same panel
        seen.add(key);
        const g = String(a.metadata.structure_id);
        (grouped[g] ||= []).push(a);
      }
      for (const list of Object.values(grouped)) {
        list.sort((a, b) => {
          const pa = typeof a.metadata?.panel_index === 'number' ? a.metadata.panel_index : 99;
          const pb = typeof b.metadata?.panel_index === 'number' ? b.metadata.panel_index : 99;
          if (pa !== pb) return pa - pb;
          const [ax, ay] = a.metadata?.bbox || [0, 0];
          const [bx, by] = b.metadata?.bbox || [0, 0];
          return (ay - by) || (ax - bx);
        });
      }
      setPanelsByStructure(grouped);
    } catch { /* thumbnails are best-effort */ }
  };
  useEffect(() => { load(); }, [unitId]);

  const counts = useMemo(() => ({
    comics: baskets?.comics?.length ?? 0,
    activities: baskets?.activities?.length ?? 0,
    objectives: baskets?.objectives?.length ?? 0,
    narrative: baskets?.narrative?.length ?? 0,
    songs: baskets?.book_songs?.length ?? 0,
  }), [baskets]);
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  if (total === 0) return null;

  const removeStructure = async (structureId: string) => {
    setRemoving(structureId);
    try {
      const { error } = await supabase.from('page_structures').update({ review_status: 'removed' }).eq('id', structureId);
      if (error) throw error;
      toast.success('Removed from the book content — it will not feed future enrichment.');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Could not remove');
    } finally {
      setRemoving(null);
    }
  };

  const sections: { id: string; label: string; icon: React.ReactNode; count: number; note?: string; render: () => React.ReactNode }[] = [
    {
      id: 'comics', label: 'Comics', icon: <Scissors size={14} />, count: counts.comics,
      note: 'the book\'s own panel art feeds Story pages; the comics LiveBoard game is next',
      render: () => (baskets?.comics || []).map((c, i) => {
        const panels = c.panels || [];
        const firstBubble = panels.flatMap((p: any) => p.bubbles || [])[0]?.text;
        const thumbs = panelsByStructure[String(c.structure_id)] || [];
        return (
          <PanelRow key={c.structure_id || i} onRemove={c.structure_id ? () => removeStructure(c.structure_id) : null} removing={removing === c.structure_id}>
            <div className="text-sm font-bold text-slate-800">{panels.length} panels</div>
            {firstBubble && <div className="text-xs text-slate-500 italic">“{excerpt(firstBubble, 90)}”</div>}
            {thumbs.length > 0 && (
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {thumbs.slice(0, 8).map((t) => (
                  <a key={t.id} href={t.public_url} target="_blank" rel="noreferrer" title="Open the book panel crop">
                    <img src={t.public_url} alt="Book panel" className="h-14 rounded-md border border-slate-200 object-cover hover:border-slate-400" />
                  </a>
                ))}
              </div>
            )}
          </PanelRow>
        );
      }),
    },
    {
      id: 'activities', label: 'Printed activities', icon: <Target size={14} />, count: counts.activities,
      note: 'reserved for upcoming exercise mechanics',
      render: () => (baskets?.activities || []).map((a, i) => (
        <PanelRow key={a.structure_id || i} onRemove={a.structure_id ? () => removeStructure(a.structure_id) : null} removing={removing === a.structure_id}>
          <div className="text-sm font-bold text-slate-800">{excerpt(a.instruction, 90)}</div>
          <div className="flex gap-1.5 mt-0.5">
            {a.verb && <span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{a.verb}</span>}
            {a.exam_format && <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">exam</span>}
          </div>
        </PanelRow>
      )),
    },
    {
      id: 'objectives', label: '“I can…” objectives', icon: <Target size={14} />, count: counts.objectives,
      note: 'future mastery gate',
      render: () => (baskets?.objectives || []).map((o, i) => (
        <PanelRow key={i} onRemove={null}>
          <div className="text-sm text-slate-700">“{excerpt(o, 100)}”</div>
        </PanelRow>
      )),
    },
    {
      id: 'narrative', label: 'Mission texts', icon: <BookOpen size={14} />, count: counts.narrative,
      note: 'intro-splash material — never drilled',
      render: () => (baskets?.narrative || []).map((n, i) => (
        <PanelRow key={n.page_id || i} onRemove={null}>
          <div className="text-sm text-slate-700">{excerpt(n.mission_text || n.printed_title, 110)}</div>
        </PanelRow>
      )),
    },
    {
      id: 'songs', label: 'Book songs', icon: <Music size={14} />, count: counts.songs,
      note: 'lyrics transcribed verbatim — see the Songs tab',
      render: () => (baskets?.book_songs || []).map((s, i) => (
        <PanelRow key={s.structure_id || i} onRemove={s.structure_id ? () => removeStructure(s.structure_id) : null} removing={removing === s.structure_id}>
          <div className="text-sm font-bold text-pink-800">{s.title || '(untitled song)'}</div>
        </PanelRow>
      )),
    },
  ].filter(s => s.count > 0);

  return (
    <div className="mx-6 mt-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpenType(openType ? null : sections[0]?.id ?? null)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-slate-50"
      >
        <BookOpen size={16} className="text-slate-500" />
        <span className="text-sm font-bold text-slate-700">From your book</span>
        <span className="text-xs text-slate-400">— captured verbatim from your pages</span>
        <span className="ml-auto flex gap-1.5">
          {sections.map(s => (
            <span key={s.id} className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
              {s.label} {s.count}
            </span>
          ))}
        </span>
      </button>
      {(openType || sections.length === 1) && (
        <div className="border-t border-slate-100">
          {sections.map(s => (
            <div key={s.id} className="border-b border-slate-100 last:border-b-0">
              <button
                onClick={() => setOpenType(openType === s.id ? null : s.id)}
                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-slate-50"
              >
                <span className="text-slate-400">{s.icon}</span>
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{s.label} ({s.count})</span>
                {s.note && <span className="text-[11px] text-slate-400 font-normal normal-case">· {s.note}</span>}
                <ChevronRight size={13} className={`ml-auto text-slate-300 transition-transform ${(openType || sections.length === 1) === s.id && openType !== null ? 'rotate-90' : ''}`} />
              </button>
              {(openType === s.id || (sections.length === 1 && openType !== null)) && (
                <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {s.render()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const PanelRow: React.FC<{ children: React.ReactNode; onRemove: (() => void) | null; removing?: boolean }> = ({ children, onRemove, removing }) => (
  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/60 flex items-start gap-2 group">
    <div className="flex-1 min-w-0">{children}</div>
    {onRemove && (
      <button
        onClick={onRemove}
        disabled={removing}
        className="p-1 text-slate-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        title="Remove this item — it will not feed future enrichment"
      >
        {removing ? <MessageSquare size={13} className="animate-pulse" /> : <X size={13} />}
      </button>
    )}
  </div>
);

export default FromTheBookPanel;
