import React, { useMemo, useState } from 'react';
import { Check, Loader2, Plus, RotateCcw, X, AlertTriangle, FileImage, ChevronRight, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { useBookScan, type ScanPage, type ScanStructure } from '../../hooks/useBookScan';
import type { StructureType } from '../../types/pipeline';

// FIXPLAN_F P2.3 — the teacher OCR review step (doc 10 §4 stage 4):
// per-structure ✕ remove / ➕ add, low-confidence highlights, batch confirm
// that unlocks basket-driven enrichment. Teacher sovereignty: nothing here
// blocks or overrides a decision.

interface ExtractionReviewProps {
  unitId: string;
  unitTitle: string;
  onConfirm: () => void;
  onBack?: () => void;
}

const TYPE_STYLES: Record<string, { label: string; classes: string }> = {
  vocab_set: { label: 'Vocabulary', classes: 'bg-emerald-100 text-emerald-700' },
  grammar_box: { label: 'Grammar box', classes: 'bg-blue-100 text-blue-700' },
  comic: { label: 'Comic', classes: 'bg-amber-100 text-amber-700' },
  song_sheet: { label: 'Song', classes: 'bg-pink-100 text-pink-700' },
  reading_passage: { label: 'Reading', classes: 'bg-indigo-100 text-indigo-700' },
  clil_passage: { label: 'CLIL', classes: 'bg-teal-100 text-teal-700' },
  printed_activity: { label: 'Activity', classes: 'bg-purple-100 text-purple-700' },
  review_statements: { label: 'I can…', classes: 'bg-lime-100 text-lime-700' },
  mission_opener: { label: 'Mission', classes: 'bg-orange-100 text-orange-700' },
  character_appearance: { label: 'Character', classes: 'bg-rose-100 text-rose-700' },
  dialogue_sequence: { label: 'Dialogue', classes: 'bg-cyan-100 text-cyan-700' },
};

const excerpt = (s: string | null | undefined, n = 140): string => {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};

function StructureBody({ s }: { s: ScanStructure }) {
  const d = s.data || {};
  switch (s.structure_type) {
    case 'vocab_set':
      return (
        <div>
          {s.set_label && <div className="text-xs font-bold text-slate-500 mb-1">Set: {s.set_label}</div>}
          <div className="flex flex-wrap gap-1">
            {(d.items || []).map((it: any, i: number) => (
              <span key={i} className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded text-sm font-semibold text-emerald-800">{it.word}</span>
            ))}
          </div>
          <div className="text-xs text-slate-400 mt-1">{(d.items || []).length} words (multi-word items allowed)</div>
        </div>
      );
    case 'grammar_box':
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide bg-blue-600 text-white rounded">BOX</span>
            {d.rule_text && <span className="text-sm font-bold text-blue-900">{excerpt(d.rule_text, 90)}</span>}
          </div>
          {(d.example_sentences || []).slice(0, 3).map((s2: string, i: number) => (
            <div key={i} className="text-sm text-blue-800 italic">“{excerpt(s2, 110)}”</div>
          ))}
        </div>
      );
    case 'comic':
      return (
        <div className="text-sm text-slate-700">
          {(d.panels || []).length} panels · first bubble: {excerpt(d.panels?.[0]?.bubbles?.[0]?.text || d.panels?.[0]?.narration, 100)}
        </div>
      );
    case 'song_sheet':
      return (
        <div className="text-sm">
          <div className="font-bold text-pink-800">{d.title || '(untitled song)'}</div>
          <div className="text-slate-600 italic whitespace-pre-line">{excerpt(d.lyrics, 220)}</div>
        </div>
      );
    case 'reading_passage':
    case 'clil_passage':
      return (
        <div className="text-sm">
          <div className="font-bold text-indigo-800">{d.title || '(untitled)'}</div>
          <div className="text-slate-600">{excerpt(d.passage_text, 200)}</div>
        </div>
      );
    case 'printed_activity':
      return (
        <div className="text-sm">
          <span className="font-bold text-purple-800">{excerpt(d.instruction, 120)}</span>
          {d.verb && <span className="ml-2 px-1.5 py-0.5 bg-purple-50 text-purple-600 text-xs rounded">{d.verb}</span>}
        </div>
      );
    case 'review_statements':
      return <div className="text-sm text-lime-800">{(d.statements || []).map((x: string) => excerpt(x, 70)).join(' · ')}</div>;
    case 'mission_opener':
      return <div className="text-sm text-orange-800">{excerpt(d.mission_text || d.printed_title, 160)}</div>;
    case 'character_appearance':
      return (
        <div className="text-sm">
          <span className="font-bold text-rose-800">{d.name || 'Unnamed character'}</span>
          <span className="text-slate-600"> — {excerpt(d.visual_description, 160)}</span>
        </div>
      );
    case 'dialogue_sequence':
      return (
        <div className="text-sm text-cyan-900">
          {(d.lines || []).length} lines · {excerpt(d.lines?.[0]?.text, 90)}
        </div>
      );
    default:
      return <div className="text-xs text-slate-400">{JSON.stringify(d).slice(0, 120)}</div>;
  }
}

function AddStructureForm({ pageId, onAdd }: { pageId: string; onAdd: (type: StructureType, data: any, setLabel?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<StructureType>('vocab_set');
  const [text, setText] = useState('');
  const [setLabel, setSetLabel] = useState('');

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full border-2 border-dashed border-slate-300 rounded-lg p-2 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-1.5">
        <Plus size={14} /> Add something the scan missed
      </button>
    );
  }

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    if (type === 'vocab_set') {
      const items = t.split(/[,;\n]/).map(w => w.trim()).filter(Boolean).map(word => ({ word }));
      onAdd(type, { items }, setLabel.trim() || undefined);
    } else if (type === 'grammar_box') {
      onAdd(type, { rule_text: '', example_sentences: t.split(/\n/).map(x => x.trim()).filter(Boolean) });
    } else if (type === 'dialogue_sequence') {
      onAdd(type, { lines: t.split(/\n/).map(x => x.trim()).filter(Boolean).map(line => {
        const m = line.match(/^([^:]{1,30}):(.+)$/);
        return m ? { speaker: m[1].trim(), text: m[2].trim() } : { speaker: null, text: line };
      }) });
    } else if (type === 'song_sheet') {
      onAdd(type, { title: '(teacher-added song)', lyrics: t });
    } else {
      onAdd(type, { instruction: t });
    }
    setOpen(false); setText(''); setSetLabel('');
  };

  return (
    <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/50 space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold text-blue-700"><Plus size={12} /> Teacher-added (labeled, not from the book scan)</div>
      <select value={type} onChange={e => setType(e.target.value as StructureType)} className="text-sm border rounded px-2 py-1 bg-white">
        <option value="vocab_set">Vocabulary (comma-separated words)</option>
        <option value="grammar_box">Grammar box (one sentence per line)</option>
        <option value="dialogue_sequence">Dialogue (Speaker: line, per line)</option>
        <option value="song_sheet">Song lyrics</option>
        <option value="printed_activity">Activity instruction</option>
      </select>
      {type === 'vocab_set' && (
        <input value={setLabel} onChange={e => setSetLabel(e.target.value)} placeholder="Set label (optional)"
          className="w-full text-sm border rounded px-2 py-1 bg-white" />
      )}
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
        placeholder={type === 'vocab_set' ? 'mountain, lake, have a shower…' : 'One item per line…'}
        className="w-full text-sm border rounded px-2 py-1 bg-white" />
      <div className="flex gap-2">
        <button onClick={submit} className="px-3 py-1 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700">Add</button>
        <button onClick={() => setOpen(false)} className="px-3 py-1 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
      </div>
    </div>
  );
}

const ExtractionReview: React.FC<ExtractionReviewProps> = ({ unitId, unitTitle, onConfirm, onBack }) => {
  const { pages, scanning, loading, removeStructure, restoreStructure, addStructure, confirmBatch } = useBookScan(unitId);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const active: ScanPage | null = useMemo(() => pages.find(p => p.id === activeId) || pages[0] || null, [pages, activeId]);
  const visibleStructures = (p: ScanPage) => p.structures.filter(s => s.review_status !== 'removed');
  const removedCount = (p: ScanPage) => p.structures.filter(s => s.review_status === 'removed').length;
  const flagCount = (p: ScanPage) => visibleStructures(p).filter(s => s.verification_flags?.length > 0).length;

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const ok = await confirmBatch();
      if (ok) { toast.success('Extraction confirmed — enrichment will use these baskets.'); onConfirm(); }
    } finally {
      setConfirming(false);
    }
  };

  if (loading && pages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 gap-2">
        <Loader2 className="animate-spin" size={20} /> Loading scanned pages…
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-white">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm z-10">
        <div>
          <h2 className="font-bold text-slate-800 text-lg">Stage 2: Review extracted content</h2>
          <p className="text-sm text-slate-500">
            {pages.length} page{pages.length === 1 ? '' : 's'} · everything below was transcribed from your book.
            Remove anything wrong, add anything missed, then confirm.
          </p>
        </div>
        <div className="flex gap-2">
          {onBack && (
            <button onClick={onBack} className="px-3 py-2 border border-slate-200 text-slate-600 font-bold rounded-lg text-sm hover:bg-slate-50">
              Back
            </button>
          )}
          <button
            className="px-4 py-2 bg-teacher-primary text-white font-bold rounded-lg flex items-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed"
            disabled={pages.length === 0 || confirming || scanning}
            onClick={handleConfirm}
          >
            {confirming ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            Confirm & Enrich
            {!confirming && <ChevronRight size={18} />}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Page list */}
        <div className="w-72 bg-slate-50 border-r border-slate-200 flex flex-col">
          <div className="p-3 border-b border-slate-200 font-bold text-slate-700 text-sm flex items-center gap-2">
            <FileImage size={15} /> Pages
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {pages.map(p => (
              <button
                key={p.id}
                onClick={() => setActiveId(p.id)}
                className={`w-full text-left p-2.5 rounded-lg border transition-colors ${active?.id === p.id ? 'bg-white border-blue-400 shadow-sm' : 'border-transparent hover:bg-slate-100'}`}
              >
                <div className="text-sm font-bold text-slate-700">
                  {p.printed_page_number ? `Page ${p.printed_page_number}` : `Sheet ${p.upload_order + 1}`}
                  {p.status === 'failed' && <span className="ml-2 text-red-500 text-xs">failed</span>}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {visibleStructures(p).length} structures
                  {removedCount(p) > 0 && ` · ${removedCount(p)} removed`}
                  {flagCount(p) > 0 && <span className="text-amber-600"> · {flagCount(p)} to check</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Page preview */}
        <div className="w-2/5 p-4 bg-slate-100 border-r border-slate-200 flex flex-col">
          <div className="flex-1 bg-white p-3 shadow-md rounded-xl flex items-center justify-center border border-slate-200 relative overflow-hidden min-h-0">
            {active?.public_url ? (
              <img src={active.public_url} alt="page" className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="text-slate-400 flex flex-col items-center gap-2"><FileImage size={40} className="opacity-50" /><span>Page preview</span></div>
            )}
          </div>
          {active && (
            <div className="mt-3 text-xs text-slate-500 space-y-1">
              {active.printed_unit_label && (
                <div className="flex items-center gap-1.5">
                  <BookOpen size={12} />
                  <span>This page says “{active.printed_unit_label}” — it will be added to <b>{unitTitle}</b>.</span>
                </div>
              )}
              {active.printed_page_number && active.printed_unit_label && (
                <div className="text-slate-400">Printed labels are recorded as metadata only; you decide where pages belong.</div>
              )}
              {active.status === 'failed' && (
                <div className="text-red-600 flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> Scan failed: {active.error}</div>
              )}
            </div>
          )}
        </div>

        {/* Structures */}
        <div className="flex-1 bg-white flex flex-col min-w-0">
          <div className="p-3 border-b flex items-center justify-between text-sm font-bold text-slate-600 bg-slate-50">
            <span>Extracted structures</span>
            {scanning && <span className="text-amber-600 flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" /> scanning…</span>}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {!active || visibleStructures(active).length === 0 && !active.structures.length ? (
              <div className="text-center text-slate-400 py-10 text-sm">
                No structures detected on this page. That can be correct — decorative pages have none.
              </div>
            ) : (
              <>
                {active && visibleStructures(active).map(s => {
                  const style = TYPE_STYLES[s.structure_type] || { label: s.structure_type, classes: 'bg-slate-100 text-slate-600' };
                  const flagged = (s.verification_flags || []).length > 0;
                  return (
                    <div key={s.id} className={`p-3 rounded-lg border ${flagged ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'}`}>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${style.classes}`}>{style.label}</span>
                          {s.source === 'teacher' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-white">TEACHER-ADDED</span>}
                          {flagged && (
                            <span className="text-amber-600 flex items-center gap-1 text-xs" title={s.verification_flags.join(', ')}>
                              <AlertTriangle size={12} /> {s.verification_flags.includes('low_confidence') ? 'low confidence' : s.verification_flags.includes('no_image') ? 'no picture box' : 'check me'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => removeStructure(s.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Remove this structure"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                      <StructureBody s={s} />
                    </div>
                  );
                })}
                {active && removedCount(active) > 0 && (
                  <div className="text-xs text-slate-400">
                    Removed: {active.structures.filter(s => s.review_status === 'removed').map(s => (TYPE_STYLES[s.structure_type] || { label: s.structure_type }).label).join(', ')}{' '}
                    {active.structures.filter(s => s.review_status === 'removed').map(s => (
                      <button key={s.id} onClick={() => restoreStructure(s.id)} className="inline-flex items-center gap-0.5 text-blue-500 hover:underline ml-1">
                        <RotateCcw size={10} /> undo
                      </button>
                    ))}
                  </div>
                )}
                {active && active.status !== 'failed' && (
                  <AddStructureForm pageId={active.id} onAdd={(type, data, label) => addStructure(active.id, type, data, label)} />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExtractionReview;
