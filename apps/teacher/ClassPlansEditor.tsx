import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarRange, Check, ChevronLeft, ChevronRight, Loader2, Plus, Minus, Save,
  Play, RefreshCw, Scissors, Sparkles, Wand2, X,
} from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { toast } from 'sonner';

// FIXPLAN I-P3 — the Classes tab (doc 11 §4): slice a unit into N classes.
// The deterministic proposal (set-label changes, song/review boundaries,
// balanced vocab load) loads first; the teacher's boundaries are the
// authority. Classes are order-only (#6); releasing a class (#5) makes its
// content available in the student app; the flow per class is derived and
// regenerable (#7) — never auto-generated in the background.

interface PageInfo {
  id: string;
  upload_order: number;
  printed_page_number: string | null;
  set_labels: string[];
  structure_counts: Record<string, number>;
  structures: { id: string; structure_type: string; set_label: string | null }[];
}

interface SetupPage {
  id: string;
  upload_order: number;
  printed_page_number: string | null;
  public_url: string;
}

interface EditClass {
  /** Existing db plan id (undefined = new, unsaved). */
  id?: string;
  key: string;
  title: string;
  /** Half-open slice [from, to) into the ordered page list. */
  from: number;
  to: number;
  released: boolean;
  /** Preserved scope exceptions (include/exclude lists survive re-slicing). */
  extras: Record<string, string[]>;
  contentIndex: any | null;
  flowLength: number;
  flowStale: boolean;
}

interface ClassPlansEditorProps {
  unitId: string;
  /** Called with (classPlanId) to go live teaching that class (wired to setActiveUnit). */
  onTeachClass: (classPlanId: string) => void | Promise<void>;
}

const chipLabel = (p: PageInfo) => p.printed_page_number?.trim() || `#${p.upload_order + 1}`;

const EMPTY_EXTRAS: Record<string, string[]> = {
  include_page_ids: [], include_structure_ids: [], exclude_structure_ids: [],
  include_vocab_ids: [], include_grammar_ids: [], include_story_ids: [], include_dialogue_ids: [],
};

const cloneExtras = (e: Record<string, string[]>): Record<string, string[]> => ({
  ...EMPTY_EXTRAS, ...Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [...(v || [])]])),
});

export const ClassPlansEditor: React.FC<ClassPlansEditorProps> = ({ unitId, onTeachClass }) => {
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [setupPages, setSetupPages] = useState<SetupPage[]>([]);
  const [unassigned, setUnassigned] = useState<any>({ vocab: [], grammar: [], story: [], dialogue: [] });
  const [classes, setClasses] = useState<EditClass[]>([]);
  const [dirty, setDirty] = useState(false);
  const [applying, setApplying] = useState(false);
  const [regenId, setRegenId] = useState<string | null>(null);
  const [teachingId, setTeachingId] = useState<string | null>(null);
  const [exceptFor, setExceptFor] = useState<{ classKey: string; pageIdx: number } | null>(null);

  const indexOfPage = useMemo(() => {
    const m = new Map<string, number>();
    pages.forEach((p, i) => m.set(p.id, i));
    return m;
  }, [pages]);

  const load = useCallback(async () => {
    let cancelled = false;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('propose-class-plans', { body: { unitId } });
      if (cancelled) return;
      if (error || data?.success === false) throw new Error(error?.message || data?.error || 'Proposal failed');
      const pgs: PageInfo[] = data.pages || [];
      setPages(pgs);
      setSetupPages(data.setupPages || []);
      setUnassigned(data.unassigned || { vocab: [], grammar: [], story: [], dialogue: [] });

      const existing: any[] = data.existingPlans || [];
      if (existing.length > 0) {
        // Rebuild saved classes from their stored ranges; keep exceptions.
        const saved: EditClass[] = existing.map((plan: any, i: number) => {
          const ranges = Array.isArray(plan.scope?.ranges) ? plan.scope.ranges : [];
          const idxs = ranges
            .map((r: any) => ({ f: indexOfPageIn(pgs, r.from_page_id), t: indexOfPageIn(pgs, r.to_page_id) }))
            .filter((x: any) => x.f >= 0 && x.t >= 0);
          const from = idxs.length ? Math.min(...idxs.map((x: any) => x.f)) : i;
          const to = idxs.length ? Math.max(...idxs.map((x: any) => x.t)) + 1 : from + 1;
          const extras = cloneExtras(plan.scope || {});
          delete (extras as any).ranges;
          return {
            id: plan.id, key: `saved-${plan.id}`, title: plan.title, from, to,
            released: !!plan.released_at,
            extras,
            contentIndex: plan.content_index,
            flowLength: Array.isArray(plan.flow) ? plan.flow.length : 0,
            flowStale: !!plan.content_index_stale_at,
          };
        });
        setClasses(saved);
      } else {
        const proposals: any[] = data.proposals || [];
        setClasses(proposals.map((pr, i) => ({
          key: `new-${i}`, title: pr.title,
          from: pgs.findIndex((p: any) => p.id === pr.from_page_id),
          to: pgs.findIndex((p: any) => p.id === pr.to_page_id) + 1,
          released: false, extras: cloneExtras(EMPTY_EXTRAS),
          contentIndex: null, flowLength: 0, flowStale: false,
        })).filter((c) => c.from >= 0 && c.to > c.from));
      }
      setDirty(false);
    } catch (err: any) {
      toast.error(`Could not load the class plan: ${err?.message || err}`);
    } finally {
      if (!cancelled) setLoading(false);
    }
    return () => { cancelled = true; };
  }, [unitId]);

  useEffect(() => { load(); }, [load]);

  const markDirty = (fn: (prev: EditClass[]) => EditClass[]) => {
    setClasses(prev => fn(prev));
    setDirty(true);
  };

  const setCount = (n: number) => {
    if (n < 1 || n > 12 || applying) return;
    markDirty(prev => {
      const total = pages.length;
      if (n === prev.length) return prev;
      if (n > prev.length) {
        // Split the largest class at its midpoint.
        const out = prev.map(c => ({ ...c }));
        while (out.length < n) {
          let bigIdx = 0;
          for (let i = 1; i < out.length; i++) if (out[i].to - out[i].from > out[bigIdx].to - out[bigIdx].from) bigIdx = i;
          const c = out[bigIdx];
          if (c.to - c.from < 2) break;
          const mid = Math.ceil((c.from + c.to) / 2);
          out[bigIdx] = { ...c, to: mid };
          out.splice(bigIdx + 1, 0, {
            key: `${c.key}-${mid}`, title: `${c.title} (2)`, from: mid, to: c.to,
            released: false, extras: cloneExtras(EMPTY_EXTRAS), contentIndex: null, flowLength: 0, flowStale: false,
          });
        }
        return out;
      }
      // Fewer classes: merge the smallest class into its neighbor, repeat.
      const out = prev.map(c => ({ ...c }));
      while (out.length > n && out.length > 1) {
        let smallIdx = 0;
        for (let i = 1; i < out.length; i++) if (out[i].to - out[i].from < out[smallIdx].to - out[smallIdx].from) smallIdx = i;
        const neighborIdx = smallIdx > 0 ? smallIdx - 1 : smallIdx + 1;
        const lo = Math.min(smallIdx, neighborIdx);
        const a = out[lo], b = out[lo + 1];
        const merged: EditClass = {
          ...a,
          from: Math.min(a.from, b.from),
          to: Math.max(a.to, b.to),
          released: a.released || b.released,
          extras: cloneExtras(EMPTY_EXTRAS), // exceptions don't survive merges
          contentIndex: null, flowLength: 0, flowStale: false,
        };
        out.splice(lo, 2, merged);
      }
      return out;
    });
  };

  /** Move the boundary between class i and i+1 by delta pages. */
  const moveBoundary = (i: number, delta: number) => {
    markDirty(prev => {
      const out = prev.map(c => ({ ...c }));
      const newTo = out[i].to + delta;
      if (newTo <= out[i].from || newTo >= out[i + 1].to) return prev;
      out[i] = { ...out[i], to: newTo };
      out[i + 1] = { ...out[i + 1], from: newTo };
      return out;
    });
  };

  const rename = (i: number, title: string) =>
    markDirty(prev => prev.map((c, j) => j === i ? { ...c, title } : c));

  const toggleReleased = async (i: number) => {
    const c = classes[i];
    const next = !c.released;
    markDirty(prev => prev.map((x, j) => j === i ? { ...x, released: next } : x));
    if (!c.id) return; // unsaved — held until Save
    try {
      const { error } = await supabase.from('class_plans')
        .update({ released_at: next ? new Date().toISOString() : null })
        .eq('id', c.id);
      if (error) throw error;
      toast.success(next
        ? `"${c.title}" marked as taught — its content is now released to students`
        : `"${c.title}" un-released`);
    } catch (e: any) {
      toast.error(`Could not update the release state: ${e?.message || e}`);
      markDirty(prev => prev.map((x, j) => j === i ? { ...x, released: !next } : x));
    }
  };

  const toggleListId = (classKey: string, list: string, id: string) => {
    markDirty(prev => prev.map(c => {
      if (c.key !== classKey) return c;
      const cur = c.extras[list] || [];
      const next = cur.includes(id) ? cur.filter((x: string) => x !== id) : [...cur, id];
      return { ...c, extras: { ...cloneExtras(c.extras), [list]: next } };
    }));
  };

  const buildPayload = () => classes.map((c, i) => {
    const slice = pages.slice(c.from, c.to);
    const scope: any = {
      ranges: [{
        from_page_id: slice[0].id,
        to_page_id: slice[slice.length - 1].id,
        from_printed: slice[0].printed_page_number ?? null,
        to_printed: slice[slice.length - 1].printed_page_number ?? null,
      }],
      ...cloneExtras(c.extras),
    };
    // Drop empty exception lists (keep the payload lean).
    for (const k of Object.keys(scope)) {
      if (k !== 'ranges' && Array.isArray(scope[k]) && scope[k].length === 0) delete scope[k];
    }
    const payload: any = { title: c.title.trim(), order_index: i, scope };
    if (c.id) payload.id = c.id;
    if (c.released) payload.released_at = new Date().toISOString();
    return payload;
  });

  const save = async () => {
    if (applying || classes.length === 0) return;
    // Every page must be covered exactly once (contiguous model).
    const covered = classes.reduce((s, c) => s + (c.to - c.from), 0);
    if (covered !== pages.length) {
      toast.error(`The classes must cover all ${pages.length} pages exactly once (currently ${covered}).`);
      return;
    }
    setApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke('apply-class-plans', {
        body: { unitId, classes: buildPayload() },
      });
      if (error || data?.success === false) throw new Error(error?.message || data?.error || 'Apply failed');
      toast.success(`Saved ${data.saved} class${data.saved === 1 ? '' : 'es'}${data.deleted ? `, removed ${data.deleted}` : ''}.`);
      await load();
    } catch (e: any) {
      toast.error(`Could not save: ${e?.message || e}`);
    } finally {
      setApplying(false);
    }
  };

  const regenerateFlow = async (c: EditClass) => {
    if (!c.id) { toast('Save the classes first, then generate the flow.', { icon: '⏳' }); return; }
    setRegenId(c.id);
    try {
      const { data, error } = await supabase.functions.invoke('generate-class-flow', { body: { classPlanId: c.id } });
      if (error || data?.success === false) throw new Error(error?.message || data?.error || 'Generation failed');
      setClasses(prev => prev.map(x => x.id === c.id
        ? { ...x, flowLength: (data.flow || []).length, flowStale: false, contentIndex: data.contentIndex ?? x.contentIndex }
        : x));
      toast.success(`"${c.title}" flow ready — ${data.flow?.length ?? 0} blocks`);
    } catch (e: any) {
      toast.error(`Flow generation failed: ${e?.message || e}`);
    } finally {
      setRegenId(null);
    }
  };

  const teach = async (c: EditClass) => {
    if (!c.id) { toast('Save the classes first, then teach.', { icon: '⏳' }); return; }
    if (c.flowLength === 0) { toast('Generate the class flow first — the board needs it.', { icon: '⚠️' }); return; }
    setTeachingId(c.id);
    try {
      await onTeachClass(c.id);
    } catch (e: any) {
      toast.error(`Could not start the class: ${e?.message || e}`);
    } finally {
      setTeachingId(null);
    }
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 size={28} className="animate-spin text-indigo-600" /></div>;
  }

  if (pages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
        <CalendarRange size={28} className="text-slate-300" />
        <p className="text-slate-600 font-medium">This unit has no scanned pages.</p>
        <p className="text-sm text-slate-400">Classes slice the unit's book pages — upload or reassign pages first.</p>
      </div>
    );
  }

  const savedCount = classes.filter(c => c.id).length;

  return (
    <div className="flex-1 overflow-auto bg-slate-50">
      <div className="max-w-5xl mx-auto p-6 space-y-5">
        {/* Toolbar: class count stepper + save */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
            <Scissors size={16} className="text-indigo-600" /> Split into
            <div className="flex items-center gap-1">
              <button onClick={() => setCount(classes.length - 1)} disabled={classes.length <= 1 || applying}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40" title="Fewer classes (merges the smallest pair)"><Minus size={14} /></button>
              <span className="w-8 text-center text-lg font-bold text-indigo-700">{classes.length}</span>
              <button onClick={() => setCount(classes.length + 1)} disabled={classes.length >= 12 || applying}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40" title="More classes (splits the largest)"><Plus size={14} /></button>
            </div>
            classes
          </div>
          <span className="text-xs text-slate-400">{pages.length} pages · order-only, no dates</span>
          <div className="ml-auto flex items-center gap-2">
            {dirty && <span className="text-xs font-bold text-amber-600 flex items-center gap-1"><Wand2 size={12} /> unsaved edits</span>}
            <button onClick={save} disabled={applying || classes.length === 0}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">
              {applying ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save classes
            </button>
          </div>
        </div>

        {/* Class cards */}
        {classes.map((c, i) => {
          const slice = pages.slice(c.from, c.to);
          const counts = c.contentIndex?.counts;
          return (
            <div key={c.key} className={`bg-white rounded-xl border p-4 ${c.released ? 'border-emerald-300' : 'border-slate-200'}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                <input
                  value={c.title}
                  onChange={(e) => rename(i, e.target.value)}
                  className="font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-400 outline-none px-1 min-w-[10rem] flex-1"
                  placeholder="Class title"
                />
                {/* Release toggle (#5) */}
                <button
                  onClick={() => toggleReleased(i)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    c.released
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300 hover:text-emerald-600'
                  }`}
                  title="Released classes' content is what students see in the app"
                >
                  <Check size={13} /> {c.released ? 'Taught — released' : 'Mark as taught'}
                </button>
                <button onClick={() => regenerateFlow(c)} disabled={!c.id || regenId === c.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  title="Regenerate the class flow from its scoped content (derived — regenerable)">
                  {regenId === c.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  Flow {c.flowLength > 0 && <span className="text-indigo-600">{c.flowLength}</span>}
                  {c.flowStale && <span className="text-amber-600" title="The unit changed since this flow was generated">· stale</span>}
                </button>
                <button onClick={() => teach(c)} disabled={!c.id || teachingId === c.id}
                  className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-700 disabled:opacity-50"
                  title="Teach this class live — the board loads only this class's material">
                  {teachingId === c.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Teach
                </button>
              </div>

              <div className="mt-3 flex items-start gap-2">
                {/* Boundary shift (left edge, not on first class) */}
                <div className="flex flex-col justify-center gap-1">
                  {i > 0 && (
                    <button onClick={() => moveBoundary(i - 1, -1)} className="p-1 rounded border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-300"
                      title="Move the boundary with the previous class one page earlier">
                      <ChevronLeft size={14} />
                    </button>
                  )}
                  {i > 0 && (
                    <button onClick={() => moveBoundary(i - 1, 1)} className="p-1 rounded border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-300"
                      title="Move the boundary with the previous class one page later">
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>
                {/* Page chips */}
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {slice.map((p, pi) => (
                    <button key={p.id}
                      onClick={() => setExceptFor(exceptFor?.classKey === c.key && exceptFor.pageIdx === c.from + pi ? null : { classKey: c.key, pageIdx: c.from + pi })}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        exceptFor?.classKey === c.key && exceptFor.pageIdx === c.from + pi
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300'
                      }`}
                      title="Click to include/exclude individual structures on this page">
                      p.{chipLabel(p)}
                      {p.set_labels.length > 0 && <span className="ml-1 text-[10px] font-medium text-slate-400">{p.set_labels[0]}</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content summary from the resolved index */}
              {counts && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="px-2 py-1 rounded bg-slate-100">{counts.vocab} words</span>
                  {counts.grammar > 0 && <span className="px-2 py-1 rounded bg-slate-100">{counts.grammar} grammar</span>}
                  {counts.story > 0 && <span className="px-2 py-1 rounded bg-slate-100">{counts.story} story pages</span>}
                  {counts.dialogue > 0 && <span className="px-2 py-1 rounded bg-slate-100">{counts.dialogue} dialogue lines</span>}
                  <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-600">{counts.objectives} objectives</span>
                  {(c.contentIndex?.set_labels || []).map((l: string) => (
                    <span key={l} className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">{l}</span>
                  ))}
                </div>
              )}

              {/* Structure exception popover */}
              {exceptFor?.classKey === c.key && (() => {
                const p = pages[exceptFor.pageIdx];
                if (!p) return null;
                const excluded = c.extras.exclude_structure_ids || [];
                return (
                  <div className="mt-3 border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-600">Page {chipLabel(p)} — exclude specific structures from this class</span>
                      <button onClick={() => setExceptFor(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                    </div>
                    {p.structures.length === 0 && <p className="text-xs text-slate-400">No structures on this page.</p>}
                    <div className="flex flex-wrap gap-2">
                      {p.structures.map(s => {
                        const off = excluded.includes(s.id);
                        return (
                          <button key={s.id}
                            onClick={() => toggleListId(c.key, 'exclude_structure_ids', s.id)}
                            className={`px-2 py-1 rounded text-xs border transition-colors ${
                              off ? 'bg-rose-50 border-rose-300 text-rose-600 line-through' : 'bg-white border-slate-200 text-slate-600 hover:border-rose-300'
                            }`}>
                            {s.structure_type.replace(/_/g, ' ')}{s.set_label ? ` · ${s.set_label}` : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Setup pages attach (decision #2) */}
              {setupPages.length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs font-bold text-slate-500 cursor-pointer hover:text-indigo-600">
                    Class-setup material ({(c.extras.include_page_ids || []).length}/{setupPages.length} attached)
                  </summary>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {setupPages.map(sp => {
                      const on = (c.extras.include_page_ids || []).includes(sp.id);
                      return (
                        <button key={sp.id}
                          onClick={() => toggleListId(c.key, 'include_page_ids', sp.id)}
                          className={`px-2 py-1 rounded text-xs border transition-colors ${
                            on ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-slate-200 text-slate-500 hover:border-amber-300'
                          }`}>
                          {on ? '✓ ' : ''}p.{sp.printed_page_number || `#${sp.upload_order + 1}`}
                        </button>
                      );
                    })}
                  </div>
                </details>
              )}

              {/* Unassigned content (unsourced enriched rows) */}
              {(unassigned.vocab?.length || 0) + (unassigned.grammar?.length || 0) > 0 && (
                <details className="mt-2">
                  <summary className="text-xs font-bold text-slate-500 cursor-pointer hover:text-indigo-600">
                    Unassigned content — words/rules without a page ({unassigned.vocab?.length || 0} words)
                  </summary>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(unassigned.vocab || []).map((v: any) => {
                      const on = (c.extras.include_vocab_ids || []).includes(v.id);
                      return (
                        <button key={v.id}
                          onClick={() => toggleListId(c.key, 'include_vocab_ids', v.id)}
                          className={`px-2 py-1 rounded text-xs border transition-colors ${
                            on ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'
                          }`}>
                          {on ? '✓ ' : ''}{v.word}{v.set_label ? ` · ${v.set_label}` : ''}
                        </button>
                      );
                    })}
                    {(unassigned.grammar || []).map((g: any) => {
                      const on = (c.extras.include_grammar_ids || []).includes(g.id);
                      return (
                        <button key={g.id}
                          onClick={() => toggleListId(c.key, 'include_grammar_ids', g.id)}
                          className={`px-2 py-1 rounded text-xs border transition-colors ${
                            on ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'
                          }`}>
                          {on ? '✓ ' : ''}{String(g.rule).slice(0, 40)}
                        </button>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
          );
        })}

        {savedCount === 0 && classes.length > 0 && (
          <p className="text-xs text-slate-400 text-center flex items-center justify-center gap-1">
            <Sparkles size={12} /> Proposal loaded — adjust the boundaries and titles, then Save. The board and the student app stay on the whole unit until you save classes.
          </p>
        )}
      </div>
    </div>
  );
};

const indexOfPageIn = (pages: PageInfo[], id: string): number => pages.findIndex(p => p.id === id);

export default ClassPlansEditor;
