import React, { useMemo, useState } from 'react';
import { Loader2, Merge, Pencil, BookOpen, ChevronRight, Scissors, Settings2 } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { toast } from 'sonner';

// UnitSplitConfirm — the SIMPLE unitization gate (spec 2026-09-13). When the
// scan proposal detects MULTIPLE units in one upload, the teacher answers one
// question ("create these N units?") with per-card tweak powers (rename /
// merge with previous). "Adjust manually" still opens the full
// UnitizationEditor for edge cases (whole books, misdetected ranges).
// A SINGLE-group upload never sees any of this — UploadTextbook applies it
// directly (the "zero decisions" default).

interface EditorGroup {
  key: string;
  title: string;
  is_setup: boolean;
  pageIds: string[];
}

interface PageInfo {
  id: string;
  upload_order: number;
  printed_page_number?: string | null;
  structureCounts?: Record<string, number>;
}

interface UnitSplitConfirmProps {
  sourceUnitId: string;
  proposal: { groups: EditorGroup[]; pages: PageInfo[] | Record<string, PageInfo> };
  onBack: () => void;
  onDone: (result: any) => void;
  onAdjustManually: () => void;
}

const chipLabel = (p: PageInfo) => p.printed_page_number?.trim() || `#${p.upload_order + 1}`;

const UnitSplitConfirm: React.FC<UnitSplitConfirmProps> = ({ sourceUnitId, proposal, onBack, onDone, onAdjustManually }) => {
  const [groups, setGroups] = useState<EditorGroup[]>(() => (proposal.groups || []).map((g) => ({ ...g, pageIds: [...g.pageIds] })));
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const pagesById = useMemo(() => {
    const map = new Map<string, PageInfo>();
    const pages = proposal.pages;
    if (Array.isArray(pages)) {
      for (const p of pages) map.set(p.id, p);
    } else if (pages && typeof pages === 'object') {
      for (const p of Object.values(pages)) if (p?.id) map.set(p.id, p as PageInfo);
    }
    return map;
  }, [proposal.pages]);

  const unitGroups = groups.filter((g) => !g.is_setup);

  const rename = (key: string, title: string) => {
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, title } : g)));
  };

  const mergeWithPrev = (index: number) => {
    if (index === 0) return;
    setGroups((prev) => {
      const out: EditorGroup[] = [];
      for (let i = 0; i < prev.length; i++) {
        if (i === index - 1) out.push({ ...prev[i], pageIds: [...prev[i].pageIds, ...prev[index].pageIds] });
        else if (i !== index) out.push(prev[i]);
      }
      return out;
    });
  };

  const apply = async (mode: 'split' | 'as-one') => {
    const payload = mode === 'as-one'
      ? [{ title: unitGroups[0]?.title || 'Unit', is_setup: false, pageIds: groups.flatMap((g) => g.pageIds) }]
      : groups.map((g) => ({ title: g.title, is_setup: g.is_setup, pageIds: g.pageIds }));
    if (payload.some((g) => !g.title.trim())) {
      toast.error('Every unit needs a title.');
      return;
    }
    setApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke('apply-unitization', {
        body: { unitId: sourceUnitId, groups: payload },
      });
      if (error || data?.success === false) throw new Error(error?.message || data?.error || 'Apply failed');
      setResult(data);
    } catch (err: any) {
      toast.error(`Creating the units failed: ${err?.message || err}`);
    } finally {
      setApplying(false);
    }
  };

  if (result) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 p-8">
        <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-800">Your book is organized</h2>
          <div className="space-y-2">
            {result.created.map((u: any) => (
              <div key={u.id} className="p-3 rounded-lg border border-slate-200">
                <div className="font-bold text-slate-800">{u.title}</div>
                <div className="text-xs text-slate-500">{u.pages} pages · ready to enrich</div>
              </div>
            ))}
          </div>
          <button onClick={() => onDone(result)} className="w-full py-2.5 bg-teacher-primary text-white font-bold rounded-lg hover:opacity-90">
            Go to my units <ChevronRight size={16} className="inline" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-white">
      <div className="p-4 border-b border-slate-200 bg-white">
        <h2 className="font-bold text-slate-800 text-lg">
          We found {unitGroups.length} unit{unitGroups.length === 1 ? '' : 's'} in your upload
        </h2>
        <p className="text-sm text-slate-500">
          Create them as separate units, or keep everything in one. Rename or merge cards first if something looks off.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-3 max-w-3xl w-full mx-auto">
        {groups.map((g, gi) => {
          const chips = g.pageIds.map((id) => pagesById.get(id)).filter(Boolean) as PageInfo[];
          return (
            <div key={g.key} className={`rounded-xl border p-4 ${g.is_setup ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg shrink-0 ${g.is_setup ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                  {g.is_setup ? <Settings2 size={16} /> : <BookOpen size={16} />}
                </div>
                <input
                  value={g.title}
                  onChange={(e) => rename(g.key, e.target.value)}
                  className="flex-1 p-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                {gi > 0 && (
                  <button
                    type="button"
                    onClick={() => mergeWithPrev(gi)}
                    className="flex items-center gap-1 px-2.5 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50"
                    title="Merge this group into the one above"
                  >
                    <Merge size={13} /> Merge up
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1 mt-2.5">
                {chips.map((p) => (
                  <span key={p.id} className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                    p{chipLabel(p)}
                  </span>
                ))}
                {g.is_setup && <span className="text-[10px] font-bold text-amber-600">setup pages (stored on the book)</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 border-t border-slate-200 bg-white flex flex-wrap items-center gap-2 justify-between">
        <button type="button" onClick={onBack} className="px-3 py-2 border border-slate-200 text-slate-600 font-bold rounded-lg text-sm hover:bg-slate-50">
          Back
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAdjustManually}
            className="px-3 py-2 border border-slate-200 text-slate-500 font-bold rounded-lg text-xs hover:bg-slate-50 flex items-center gap-1.5"
            title="Open the full editor (move single pages, split ranges)"
          >
            <Pencil size={13} /> Adjust manually
          </button>
          <button
            type="button"
            onClick={() => apply('as-one')}
            disabled={applying}
            className="px-4 py-2.5 border border-slate-300 text-slate-600 font-bold rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Keep as one unit
          </button>
          <button
            type="button"
            onClick={() => apply('split')}
            disabled={applying}
            className="flex items-center gap-2 px-4 py-2.5 bg-teacher-primary text-white font-bold rounded-lg text-sm hover:opacity-90 disabled:opacity-50"
          >
            {applying ? <Loader2 size={15} className="animate-spin" /> : <Scissors size={15} />}
            Create {unitGroups.length} unit{unitGroups.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UnitSplitConfirm;
