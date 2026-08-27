import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Loader2, Scissors, BookOpen, ArrowUp } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { toast } from 'sonner';

// FIXPLAN_G G3 — the unitization boundary editor (doc 11 §2). The
// deterministic proposal loads first; the teacher's edits are the authority:
// rename, merge, split at a page, move pages between adjacent groups,
// toggle the book-level setup group. Confirming reassigns pages (never
// re-extracts) and creates ready-to-enrich draft units — enrichment itself
// only happens when the teacher opens a unit (owner decision #7).

interface EditorGroup {
  key: string;
  title: string;
  is_setup: boolean;
  pageIds: string[];
}

interface PageInfo {
  id: string;
  upload_order: number;
  printed_page_number: string | null;
  printed_title: string | null;
  structureCounts: Record<string, number>;
}

interface UnitizationEditorProps {
  sourceUnitId: string;
  onDone: (result: any) => void;
  onBack?: () => void;
}

const chipLabel = (p: PageInfo) => p.printed_page_number?.trim() || `#${p.upload_order + 1}`;
const structSummary = (p: PageInfo) =>
  Object.entries(p.structureCounts).map(([t, n]) => `${t.replace(/_/g, ' ')} ×${n}`).join(', ') || 'no structures';

export const UnitizationEditor: React.FC<UnitizationEditorProps> = ({ sourceUnitId, onDone, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<EditorGroup[]>([]);
  const [pagesById, setPagesById] = useState<Record<string, PageInfo>>({});
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('propose-unitization', { body: { unitId: sourceUnitId } });
        if (cancelled) return;
        if (error || data?.success === false) throw new Error(error?.message || data?.error || 'Proposal failed');
        setGroups((data.groups || []).map((g: any) => ({ key: g.key, title: g.title, is_setup: !!g.is_setup, pageIds: [...g.pageIds] })));
        const map: Record<string, PageInfo> = {};
        for (const p of data.pages || []) map[p.id] = p;
        setPagesById(map);
      } catch (err: any) {
        toast.error(`Could not build the unit proposal: ${err?.message || err}`);
        onBack?.();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sourceUnitId]);

  const unitGroups = useMemo(() => groups.filter((g) => !g.is_setup), [groups]);

  const rename = (gi: number, title: string) =>
    setGroups(prev => prev.map((g, i) => i === gi ? { ...g, title } : g));

  const toggleSetup = (gi: number) =>
    setGroups(prev => prev.map((g, i) => i === gi ? { ...g, is_setup: !g.is_setup, title: !g.is_setup ? 'Welcome & class setup' : (g.title === 'Welcome & class setup' ? 'Unit' : g.title) } : g));

  const mergeWithPrev = (gi: number) => {
    if (gi === 0) return;
    setGroups(prev => {
      const out: EditorGroup[] = [];
      for (let i = 0; i < prev.length; i++) {
        if (i === gi - 1) out.push({ ...prev[i], pageIds: [...prev[i].pageIds, ...prev[gi].pageIds] });
        else if (i !== gi) out.push(prev[i]);
      }
      return out;
    });
  };

  const splitAt = (gi: number, pi: number) => {
    setGroups(prev => {
      if (pi === 0) return prev; // splitting before the first page = a new empty group makes no sense
      const g = prev[gi];
      const tail = g.pageIds.slice(pi);
      if (tail.length === 0) return prev;
      const out = [...prev];
      out[gi] = { ...g, pageIds: g.pageIds.slice(0, pi) };
      out.splice(gi + 1, 0, { key: `${g.key}-split-${pi}`, title: `${g.title} (2)`, is_setup: false, pageIds: tail });
      return out;
    });
  };

  const movePage = (gi: number, pi: number, dir: -1 | 1) => {
    const target = gi + dir;
    if (target < 0 || target >= groups.length) return;
    setGroups(prev => {
      const out = prev.map(g => ({ ...g, pageIds: [...g.pageIds] }));
      const [pid] = out[gi].pageIds.splice(pi, 1);
      if (dir === -1) out[target].pageIds.push(pid);
      else out[target].pageIds.unshift(pid);
      return out;
    });
  };

  const keepAsOne = () =>
    setGroups(prev => {
      const first = prev.find(g => !g.is_setup) || prev[0];
      if (!first) return prev;
      const all = prev.flatMap(g => g.pageIds);
      const setupPages = prev.filter(g => g.is_setup).flatMap(g => g.pageIds);
      const merged: EditorGroup[] = [];
      if (setupPages.length > 0) merged.push({ key: 'g-setup', title: 'Welcome & class setup', is_setup: true, pageIds: setupPages });
      merged.push({ ...first, title: first.title === 'Welcome & class setup' ? 'Unit 1' : first.title, is_setup: false, pageIds: all.filter(p => !setupPages.includes(p)) });
      return merged;
    });

  const confirm = async () => {
    if (groups.some(g => !g.is_setup && !g.title.trim())) {
      toast.error('Every unit group needs a title.');
      return;
    }
    setApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke('apply-unitization', {
        body: { unitId: sourceUnitId, groups: groups.map(g => ({ title: g.title, is_setup: g.is_setup, pageIds: g.pageIds })) },
      });
      if (error || data?.success === false) throw new Error(error?.message || data?.error || 'Apply failed');
      setResult(data);
      toast.success(`${data.created.length} unit${data.created.length === 1 ? '' : 's'} created${data.setupPages ? ` · ${data.setupPages} setup page${data.setupPages === 1 ? '' : 's'} stored on the book` : ''}.`);
    } catch (err: any) {
      toast.error(`Unitization failed: ${err?.message || err}`);
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 gap-2">
        <Loader2 className="animate-spin" size={20} /> Reading your book's unit structure…
      </div>
    );
  }

  if (result) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 p-8">
        <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><Check size={22} /></div>
            <h2 className="text-lg font-bold text-slate-800">Your book is organized</h2>
          </div>
          <div className="space-y-2">
            {result.created.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200">
                <div>
                  <div className="font-bold text-slate-800">{u.title}</div>
                  <div className="text-xs text-slate-500">{u.pages} pages · ready to enrich (open the unit's review to enrich it)</div>
                </div>
                <button
                  onClick={() => onDone(result)}
                  className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-sm font-bold hover:bg-indigo-100"
                >
                  Open
                </button>
              </div>
            ))}
            {result.setupPages > 0 && (
              <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800">
                {result.setupPages} welcome/setup page{result.setupPages === 1 ? '' : 's'} stored on the book (class-setup material — never feeds units).
              </div>
            )}
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
      <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center">
        <div>
          <h2 className="font-bold text-slate-800 text-lg">Organize your book into units</h2>
          <p className="text-sm text-slate-500">
            We detected {unitGroups.length} unit{unitGroups.length === 1 ? '' : 's'} from the printed pages — adjust anything, then create.
            Pages are moved, never re-scanned.
          </p>
        </div>
        <div className="flex gap-2">
          {onBack && (
            <button onClick={onBack} className="px-3 py-2 border border-slate-200 text-slate-600 font-bold rounded-lg text-sm hover:bg-slate-50">Back</button>
          )}
          <button
            onClick={confirm}
            disabled={applying || unitGroups.length === 0}
            className="px-4 py-2 bg-teacher-primary text-white font-bold rounded-lg flex items-center gap-2 disabled:bg-slate-300"
          >
            {applying ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            Create {unitGroups.length} unit{unitGroups.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <button onClick={keepAsOne} className="text-sm text-slate-500 hover:text-slate-700 underline underline-offset-2">
          Keep everything as one unit instead
        </button>
        {groups.map((g, gi) => (
          <div key={g.key} className={`rounded-xl border p-3 ${g.is_setup ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {g.is_setup ? (
                <div className="flex items-center gap-1.5 text-sm font-bold text-amber-800">
                  <BookOpen size={15} /> Welcome &amp; class setup
                  <span className="text-xs font-normal text-amber-600">(stored on the book — never feeds units)</span>
                </div>
              ) : (
                <input
                  value={g.title}
                  onChange={(e) => rename(gi, e.target.value)}
                  className="flex-1 min-w-[200px] text-sm font-bold text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="Unit title"
                />
              )}
              <button
                onClick={() => toggleSetup(gi)}
                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border ${g.is_setup ? 'border-slate-300 text-slate-600 hover:bg-white' : 'border-amber-300 text-amber-700 hover:bg-amber-100'}`}
                title={g.is_setup ? 'Make this a teaching unit' : 'Store as book-level setup material instead'}
              >
                {g.is_setup ? 'Make unit' : 'Setup material'}
              </button>
              {gi > 0 && (
                <button onClick={() => mergeWithPrev(gi)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="Merge into the group above">
                  <ArrowUp size={15} />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {g.pageIds.map((pid, pi) => {
                const p = pagesById[pid];
                return (
                  <div key={pid} className="group/chip flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden" title={p ? `${p.printed_title ? p.printed_title + ' · ' : ''}${structSummary(p)}` : ''}>
                    <span className="px-2 py-1 text-sm font-bold text-slate-700">{p ? chipLabel(p) : '?'}</span>
                    <span className="flex flex-col border-l border-slate-100">
                      <button onClick={() => movePage(gi, pi, -1)} disabled={gi === 0} className="px-1 text-slate-300 hover:text-indigo-600 disabled:opacity-20 leading-none" title="Move to previous group">
                        <ArrowLeft size={11} />
                      </button>
                      <button onClick={() => movePage(gi, pi, 1)} disabled={gi === groups.length - 1} className="px-1 text-slate-300 hover:text-indigo-600 disabled:opacity-20 leading-none" title="Move to next group">
                        <ArrowRight size={11} />
                      </button>
                    </span>
                    <button onClick={() => splitAt(gi, pi)} className="px-1 text-slate-300 hover:text-rose-600 leading-none" title="Start a new unit at this page">
                      <Scissors size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/** Routed wrapper for re-editing later: /teacher/unitize/:unitId (FIXPLAN_G decision #1). */
export const UnitizePage: React.FC = () => {
  const { unitId } = useParams<{ unitId: string }>();
  const navigate = useNavigate();
  if (!unitId) return null;
  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <UnitizationEditor
        sourceUnitId={unitId}
        onBack={() => navigate('/teacher/units')}
        onDone={() => navigate('/teacher/units')}
      />
    </div>
  );
};

export default UnitizationEditor;
