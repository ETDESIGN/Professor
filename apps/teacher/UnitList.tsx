
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Filter, Grid, List, MoreVertical, Edit2, Play, BookOpen, Users, CalendarPlus, Loader2, Sparkles, Wand2, Upload, FileText, Trash2, AlertTriangle, Plus, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, FolderInput, RotateCcw, LibraryBig, Dices, Scissors, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import UnitPreviewModal from './UnitPreviewModal';
import { useSession } from '../../store/SessionContext';
import { Engine } from '../../services/SupabaseService';
import type { Book, UnitPipelineMeta } from '../../services/BookService';
import { backfillPools } from '../../services/ExercisePoolService';
import { supabase } from '../../services/supabaseClient';
import { toast } from 'sonner';

interface UnitListProps {
  onNewUnit: () => void;
  onUploadMaterial?: () => void;
  onEditUnit?: (unitId: string) => void;
  onPlanLesson?: (unitId: string) => void;
  onLaunchLesson?: () => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } }
};

const itemVariants: any = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

// ── Pipeline-aware status badge (Draft · Enriching · Ready · Active) ─────
const PipelineBadge: React.FC<{ unit: any; meta?: UnitPipelineMeta }> = ({ unit, meta }) => {
  if (meta?.jobStatus === 'pending' || meta?.jobStatus === 'running' || unit.status === 'Processing') {
    return (
      <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-sm flex items-center gap-2 bg-purple-100 text-purple-700 animate-pulse">
        <Sparkles size={12} /> Enriching
      </span>
    );
  }
  if ((meta?.poolCount ?? 0) > 0) {
    return (
      <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-sm flex items-center gap-2 bg-emerald-100 text-emerald-700">
        Ready · {meta!.poolCount} exercises
      </span>
    );
  }
  if (meta?.readyToEnrich) {
    return (
      <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-sm flex items-center gap-2 bg-indigo-100 text-indigo-700">
        <Wand2 size={12} /> Ready to enrich
      </span>
    );
  }
  const s = unit.status;
  const cls = s === 'Active' ? 'bg-green-100 text-green-700'
    : s === 'Completed' ? 'bg-blue-100 text-blue-700'
    : s === 'Locked' ? 'bg-slate-200 text-slate-600'
    : 'bg-yellow-100 text-yellow-700';
  return <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-sm ${cls}`}>{s === 'Draft' ? 'Draft' : s}</span>;
};


// FIXPLAN_G — book-level setup material (doc 10 §5 / doc 11 §2): welcome and
// class-setup pages stored on the book (unit_id NULL). Recorded verbatim,
// never feeds units or pools; attachable to a class when class plans exist (F3).
const BookSetupMaterial: React.FC<{ bookId: string }> = ({ bookId }) => {
  const [pages, setPages] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('book_pages')
        .select('id, public_url, printed_page_number, printed_title')
        .is('unit_id', null)
        .eq('book_id', bookId)
        .order('upload_order');
      if (!cancelled) setPages(data || []);
    })();
    return () => { cancelled = true; };
  }, [bookId]);
  if (pages.length === 0) return null;
  return (
    <div className="mt-6 bg-amber-50/60 rounded-xl border border-amber-200">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-3 text-left">
        <BookOpen size={16} className="text-amber-700" />
        <span className="text-sm font-bold text-amber-800">Class setup material ({pages.length} page{pages.length === 1 ? '' : 's'})</span>
        <span className="text-xs text-amber-600 ml-1">welcome pages — kept on the book, never in units</span>
        <ChevronRight size={15} className={`ml-auto text-amber-600 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 flex gap-3 overflow-x-auto">
          {pages.map(p => (
            <div key={p.id} className="shrink-0 w-28">
              {p.public_url
                ? <img src={p.public_url} alt={p.printed_title || 'setup page'} className="w-28 h-36 object-cover rounded-lg border border-amber-200" />
                : <div className="w-28 h-36 rounded-lg border border-amber-200 bg-white" />}
              <div className="text-[11px] font-bold text-amber-800 mt-1 truncate">{p.printed_page_number ? `p.${p.printed_page_number} · ` : ''}{p.printed_title || 'Setup page'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const UnitList: React.FC<UnitListProps> = ({ onNewUnit, onUploadMaterial, onEditUnit, onPlanLesson, onLaunchLesson }) => {
  const { state, loadUnits, setActiveUnit, startSession, goToSlide } = useSession();
  const navigate = useNavigate();
  const [selectedUnit, setSelectedUnit] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showNewUnitModal, setShowNewUnitModal] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null); // unit.id or book:ID of open kebab
  const [unitToTrash, setUnitToTrash] = useState<any | null>(null);
  const [bookToTrash, setBookToTrash] = useState<Book | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // FIXPLAN_F P4.3 — Rebuild-from-pages dialog state.
  const [rebuildUnit, setRebuildUnit] = useState<any | null>(null);
  const [rebuildRunning, setRebuildRunning] = useState(false);

  // ── Book manager state ───────────────────────────────────────────────────
  const [tab, setTab] = useState<'library' | 'trash'>('library');
  const [activeBookId, setActiveBookId] = useState<string | null>(null); // null = bookshelf
  const [books, setBooks] = useState<Book[]>([]);
  const [pipelineMeta, setPipelineMeta] = useState<Record<string, UnitPipelineMeta>>({});
  const [trashUnits, setTrashUnits] = useState<any[]>([]);
  const [trashBooks, setTrashBooks] = useState<Book[]>([]);
  const [showNewBookModal, setShowNewBookModal] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [renamingBook, setRenamingBook] = useState<Book | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [movingUnit, setMovingUnit] = useState<any | null>(null);
  const [foreverTarget, setForeverTarget] = useState<{ kind: 'unit' | 'book'; id: string; title: string } | null>(null);

  // ── Library filters (bookshelf search + level) ───────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');

  // ── Phase 3: bulk pool backfill ──────────────────────────────────────────
  const [backfillState, setBackfillState] = useState<{ running: boolean; done: number; total: number }>({ running: false, done: 0, total: 0 });

  const userId = (state as any).userId ?? null;

  const refreshBooks = useCallback(async () => {
    try { setBooks(await Engine.listBooks()); } catch (e: any) { toast.error(`Could not load books: ${e?.message || e}`); }
  }, []);

  const refreshTrash = useCallback(async () => {
    try {
      const [tu, tb] = await Promise.all([Engine.listTrashedUnits(), Engine.listTrashedBooks()]);
      setTrashUnits(tu); setTrashBooks(tb);
    } catch { /* trash RPCs degrade to empty */ }
  }, []);

  // Ensure we have fresh data on mount
  useEffect(() => {
    loadUnits();
    refreshBooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === 'trash') refreshTrash();
  }, [tab, refreshTrash]);

  // Close the open kebab menu on outside click or Escape. Document-level
  // listeners instead of a fixed overlay: the card's hover transform turns a
  // `fixed` child into a card-relative element, which broke outside-click.
  useEffect(() => {
    if (!menuOpenFor) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.('[data-kebab-menu]')) setMenuOpenFor(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpenFor(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpenFor]);

  // Pipeline meta for badges
  useEffect(() => {
    const ids = (state.units || []).map((u: any) => u.id);
    if (ids.length === 0) return;
    Engine.getUnitPipelineMeta(ids).then(setPipelineMeta).catch(() => {});
  }, [state.units]);

  // Phase 3: units that have a lesson flow but no exercise pool — the
  // candidates for the bulk "Generate missing pools" backfill.
  const missingPoolUnitIds = useMemo(() => {
    return ((state.units || []) as any[])
      .filter(u => Array.isArray(u.flow) && u.flow.length > 0 && (pipelineMeta[u.id]?.poolCount ?? 0) === 0)
      .map(u => u.id);
  }, [state.units, pipelineMeta]);

  // FIXPLAN_F P4.3 — Rebuild a legacy unit from its stored page images via
  // the book-fidelity pipeline (resumable job; polls generation_jobs).
  const handleRebuild = async (mode: 'fresh' | 'preserve') => {
    if (!rebuildUnit || rebuildRunning) return;
    setRebuildRunning(true);
    const unitId = rebuildUnit.id;
    try {
      const { data, error } = await supabase.functions.invoke('rebuild-unit', { body: { unitId, mode } });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || 'Rebuild failed to start');
      toast.info(`Rebuilding "${rebuildUnit.title}" from its pages… (each page is re-scanned; this can take a few minutes)`);
      setRebuildUnit(null);
      // Poll the job until it settles (rebuild-unit chains itself).
      const deadline = Date.now() + 30 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 5000));
        const { data: job } = await supabase
          .from('generation_jobs')
          .select('status, error')
          .eq('unit_id', unitId)
          .eq('stage', 'rebuild-unit')
          .maybeSingle();
        if (job?.status === 'succeeded') { toast.success(`Rebuild complete — open the unit to review and re-enrich.`); return; }
        if (job?.status === 'failed') { toast.error(`Rebuild failed: ${job.error || 'unknown error'}`); return; }
      }
      toast.warning('Rebuild is still running in the background — check back in a few minutes.');
    } catch (err: any) {
      toast.error(`Rebuild error: ${err?.message || err}`);
    } finally {
      setRebuildRunning(false);
    }
  };

  const handleBackfillPools = async () => {
    if (backfillState.running || missingPoolUnitIds.length === 0) return;
    setBackfillState({ running: true, done: 0, total: missingPoolUnitIds.length });
    try {
      const result = await backfillPools(missingPoolUnitIds, (done, total) => {
        setBackfillState({ running: true, done, total });
      });
      if (result.failed === 0) {
        toast.success(`Backfill complete — ${result.ok} unit${result.ok === 1 ? '' : 's'} now have exercise pools`);
      } else {
        toast.warning(`Backfill finished: ${result.ok} succeeded, ${result.failed} failed — click again to retry the failures`);
      }
    } catch (err: any) {
      toast.error(`Backfill error: ${err?.message || err}`);
    } finally {
      setBackfillState({ running: false, done: 0, total: 0 });
      // Refresh badges with the new pool counts.
      const ids = (state.units || []).map((u: any) => u.id);
      if (ids.length > 0) Engine.getUnitPipelineMeta(ids).then(setPipelineMeta).catch(() => {});
    }
  };

  // ── Grouping: units by book ──────────────────────────────────────────────
  const { unitsByBook, unassigned } = useMemo(() => {
    const byBook: Record<string, any[]> = {};
    const unasgn: any[] = [];
    const bookIds = new Set(books.map(b => b.id));
    for (const u of (state.units || []) as any[]) {
      if (u.book_id && bookIds.has(u.book_id)) {
        (byBook[u.book_id] = byBook[u.book_id] || []).push(u);
      } else {
        unasgn.push(u);
      }
    }
    for (const k of Object.keys(byBook)) byBook[k].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    return { unitsByBook: byBook, unassigned: unasgn };
  }, [state.units, books]);

  const activeBook = books.find(b => b.id === activeBookId) || null;
  const isOwner = (b: Book) => !!b.owner_id && (!userId || b.owner_id === userId);

  // ── Bookshelf filtering (search + level) ─────────────────────────────────
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const levelActive = levelFilter !== 'all';
  const unitMatches = (u: any) => {
    if (normalizedQuery && !String(u.title || '').toLowerCase().includes(normalizedQuery)) return false;
    if (levelActive) {
      // unit.level is freeform ("A1", "Beginner (A1)"…) — match leniently, both directions.
      const lv = String(u.level || '').toLowerCase();
      const sel = levelFilter.toLowerCase();
      if (lv !== sel && !lv.includes(sel) && !sel.includes(lv)) return false;
    }
    return true;
  };
  const filtersActive = !!normalizedQuery || levelActive;
  const levelOptions = useMemo(() => {
    const levels = new Set<string>();
    for (const u of (state.units || []) as any[]) { if (u.level) levels.add(String(u.level)); }
    return Array.from(levels).sort();
  }, [state.units]);
  const visibleBooks = filtersActive
    ? books.filter(b =>
        (!!normalizedQuery && b.title.toLowerCase().includes(normalizedQuery)) ||
        (unitsByBook[b.id] || []).some(unitMatches))
    : books;
  const visibleUnassigned = filtersActive ? unassigned.filter(unitMatches) : unassigned;

  // ── Existing actions (unchanged) ────────────────────────────────────────
  const handleLaunch = async (unit: any) => {
    await setActiveUnit(unit.id);
    startSession();
    goToSlide(0);
    onLaunchLesson?.();
  };

  const handlePlan = (unit: any) => {
    setIsLoading(true);
    setTimeout(async () => {
      await setActiveUnit(unit.id);
      setIsLoading(false);
      onPlanLesson?.(unit.id);
    }, 500);
  };

  const handleEditEnrichment = async (unit: any) => {
    await setActiveUnit(unit.id);
    onEditUnit?.(unit.id);
  };

  // ── Unit & Book Manager actions ─────────────────────────────────────────
  const handleTrashUnit = async () => {
    if (!unitToTrash) return;
    setIsDeleting(true);
    try {
      await Engine.deleteUnit(unitToTrash.id); // now a soft delete
      toast.success(`Moved "${unitToTrash.title}" to Trash`);
      await loadUnits();
    } catch (err: any) {
      toast.error(`Delete failed: ${err?.message || err}`);
    } finally {
      setIsDeleting(false);
      setUnitToTrash(null);
      setMenuOpenFor(null);
    }
  };

  const handleCreateBook = async () => {
    if (!newBookTitle.trim()) return;
    try {
      await Engine.createBook(newBookTitle);
      toast.success(`Book "${newBookTitle.trim()}" created`);
      setNewBookTitle(''); setShowNewBookModal(false);
      await refreshBooks();
    } catch (err: any) { toast.error(`Could not create book: ${err?.message || err}`); }
  };

  const handleRenameBook = async () => {
    if (!renamingBook || !renameValue.trim()) return;
    try {
      await Engine.renameBook(renamingBook.id, renameValue);
      toast.success('Book renamed');
      setRenamingBook(null); setRenameValue('');
      await refreshBooks();
    } catch (err: any) { toast.error(`Rename failed: ${err?.message || err}`); }
  };

  const handleTrashBook = async () => {
    if (!bookToTrash) return;
    setIsDeleting(true);
    try {
      await Engine.softDeleteBook(bookToTrash.id);
      toast.success(`Moved "${bookToTrash.title}" to Trash`);
      if (activeBookId === bookToTrash.id) setActiveBookId(null);
      await Promise.all([refreshBooks(), loadUnits()]);
    } catch (err: any) {
      toast.error(`Could not trash book: ${err?.message || err}`);
    } finally {
      setIsDeleting(false);
      setBookToTrash(null);
      setMenuOpenFor(null);
    }
  };

  const handleMoveUnit = async (bookId: string | null) => {
    if (!movingUnit) return;
    try {
      await Engine.moveUnitToBook(movingUnit.id, bookId);
      toast.success(bookId ? 'Unit moved' : 'Unit moved to Unassigned');
      setMovingUnit(null);
      await loadUnits();
    } catch (err: any) { toast.error(`Move failed: ${err?.message || err}`); }
  };

  const handleReorder = async (unit: any, dir: -1 | 1) => {
    const siblings = (unit.book_id ? unitsByBook[unit.book_id] : unassigned) || [];
    const idx = siblings.findIndex((s: any) => s.id === unit.id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= siblings.length) return;
    try {
      await Engine.reorderUnit(unit.id, newIdx);
      await loadUnits();
    } catch (err: any) { toast.error(`Reorder failed: ${err?.message || err}`); }
  };

  // Illustration v2 — force a fresh AI cover for this unit (Task 4 generate-illustrations,
  // surface 'cover', regenerate bypasses the existing-asset reuse).
  const regenerateCover = async (unit: any) => {
    try {
      const { error } = await supabase.functions.invoke('generate-media', {
        body: { action: 'generate-illustrations', surface: 'cover', unitId: unit.id, regenerate: true },
      });
      if (error) throw error;
      toast.success('Cover regenerated');
      await loadUnits();
    } catch (err: any) { toast.error(`Cover failed: ${err?.message || err}`); }
  };

  const handleRestoreUnit = async (u: any) => {
    try { await Engine.restoreUnit(u.id); toast.success(`Restored "${u.title}"`); await Promise.all([loadUnits(), refreshTrash(), refreshBooks()]); }
    catch (err: any) { toast.error(`Restore failed: ${err?.message || err}`); }
  };

  const handleRestoreBook = async (b: Book) => {
    try { await Engine.restoreBook(b.id); toast.success(`Restored "${b.title}"`); await Promise.all([refreshBooks(), refreshTrash(), loadUnits()]); }
    catch (err: any) { toast.error(`Restore failed: ${err?.message || err}`); }
  };

  const handleDeleteForever = async () => {
    if (!foreverTarget) return;
    setIsDeleting(true);
    try {
      if (foreverTarget.kind === 'unit') await Engine.deleteUnitForever(foreverTarget.id);
      else await Engine.deleteBookFull(foreverTarget.id);
      toast.success(`Permanently deleted "${foreverTarget.title}"`);
      setForeverTarget(null);
      await Promise.all([refreshTrash(), loadUnits(), refreshBooks()]);
    } catch (err: any) {
      toast.error(`Delete failed: ${err?.message || err}`);
    } finally { setIsDeleting(false); }
  };

  // ── Unit card (book detail + unassigned) ────────────────────────────────
  const renderUnitCard = (unit: any, opts?: { inBook?: boolean; index?: number; total?: number }) => (
    <motion.div
      key={unit.id}
      variants={itemVariants}
      className="bg-white rounded-xl border border-slate-200 hover:shadow-lg transition-all group duration-300 hover:-translate-y-1"
    >
      {/* Thumbnail Area — own overflow-hidden + top rounding; the card wrapper
          must NOT clip so the kebab dropdown can extend past the card edge. */}
      <div className="h-48 bg-slate-100 relative overflow-hidden rounded-t-xl">
        <div className="absolute top-4 left-4 z-10">
          <PipelineBadge unit={unit} meta={pipelineMeta[unit.id]} />
        </div>

        <img
          src={unit.coverImage}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          alt="Cover"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60"></div>

        {/* Hover Actions */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 backdrop-blur-sm gap-3">
          <button
            onClick={() => handlePlan(unit)}
            className="bg-white text-slate-800 p-3 rounded-xl font-bold hover:bg-slate-50 shadow-lg transform hover:scale-105 transition-transform flex items-center gap-2"
            title="Edit Lesson Plan"
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <CalendarPlus size={20} />}
            <span className="text-xs">Plan</span>
          </button>
          <button
            onClick={() => handleLaunch(unit)}
            className="bg-teacher-primary text-white p-3 rounded-xl font-bold hover:bg-emerald-500 shadow-lg transform hover:scale-105 transition-transform flex items-center gap-2"
            title="Launch Class"
          >
            <Play size={20} />
            <span className="text-xs">Teach</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <div className="flex justify-between items-start mb-2">
          <div className="min-w-0">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase mb-2 inline-block bg-slate-100 text-slate-600">
              {unit.level}
            </span>
            <h3 className="text-xl font-display font-bold text-slate-800 leading-tight truncate">{unit.title}</h3>
          </div>
          <div className="flex items-center gap-1">
            {opts?.inBook && (
              <div className="flex flex-col">
                <button onClick={() => handleReorder(unit, -1)} disabled={(opts.index ?? 0) === 0}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-20 p-0.5" title="Move up"><ArrowUp size={14} /></button>
                <button onClick={() => handleReorder(unit, 1)} disabled={(opts.index ?? 0) === (opts.total ?? 1) - 1}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-20 p-0.5" title="Move down"><ArrowDown size={14} /></button>
              </div>
            )}
            <div className="relative" data-kebab-menu>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpenFor(menuOpenFor === unit.id ? null : unit.id); }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"
                title="Unit actions"
                aria-label={`Actions for ${unit.title ?? 'unit'}`}
                aria-haspopup="menu"
                aria-expanded={menuOpenFor === unit.id}
              >
                <MoreVertical size={20} />
              </button>
              {menuOpenFor === unit.id && (
                <>
                  <div className="absolute right-0 top-8 z-20 bg-white rounded-lg shadow-xl border border-slate-200 py-1 w-48" role="menu">
                    <button onClick={(e) => { e.stopPropagation(); setMenuOpenFor(null); handlePlan(unit); }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                      <Edit2 size={14} /> Plan / Edit
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setMenuOpenFor(null); handleEditEnrichment(unit); }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                      <BookOpen size={14} /> Review Content
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setMovingUnit(unit); setMenuOpenFor(null); }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                      <FolderInput size={14} /> Move to book…
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setMenuOpenFor(null); setRebuildUnit(unit); }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                      <RotateCcw size={14} /> Rebuild from pages
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setMenuOpenFor(null); regenerateCover(unit); }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                      <ImageIcon size={14} /> Regenerate cover
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setMenuOpenFor(null); navigate(`/teacher/unitize/${unit.id}`); }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                      <Scissors size={14} /> Split into units…
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setMenuOpenFor(null); setUnitToTrash(unit); }}
                      className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                      <Trash2 size={14} /> Move to Trash
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Contextual Stats based on Status */}
        {unit.status === 'Processing' ? (
          <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 mt-4">
            <div className="text-xs font-bold text-purple-700 flex items-center gap-2 mb-1">
              <Loader2 size={12} className="animate-spin" /> AI Analyzing...
            </div>
            <div className="w-full h-1.5 bg-purple-200 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 w-2/3 animate-pulse"></div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 text-xs font-bold text-slate-500 border-t border-slate-100 pt-4 mt-4">
            <div className="flex items-center gap-1.5">
              <BookOpen size={16} className="text-slate-400" />
              {unit.flow ? unit.flow.length : 0} Slides
            </div>
            <div className="flex items-center gap-1.5">
              <Users size={16} className="text-slate-400" />
              Class 3B
            </div>
            <div className="ml-auto text-slate-400 font-normal">
              {unit.lastUpdated}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );

  // ── Bookshelf card ────────────────────────────────────────────────────────
  const renderBookCard = (book: Book) => {
    const bookUnits = unitsByBook[book.id] || [];
    const cover = bookUnits[0]?.coverImage;
    const managed = isOwner(book);
    return (
      <motion.div
        key={book.id}
        variants={itemVariants}
        className="bg-white rounded-xl border border-slate-200 hover:shadow-lg transition-all group duration-300 hover:-translate-y-1 cursor-pointer relative"
        onClick={() => setActiveBookId(book.id)}
      >
        <div className="h-40 bg-gradient-to-br from-indigo-100 to-emerald-50 relative overflow-hidden rounded-t-xl">
          {cover ? (
            <img src={cover} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="Book cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-indigo-300">
              <LibraryBig size={56} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-3 left-4 text-white font-bold text-lg drop-shadow">
            {book.title}
          </div>
        </div>
        {managed && (
          <div className="absolute top-3 right-3 z-20" onClick={(e) => e.stopPropagation()} data-kebab-menu>
            <button
              onClick={() => setMenuOpenFor(menuOpenFor === `book:${book.id}` ? null : `book:${book.id}`)}
              className="bg-white/90 text-slate-600 p-1.5 rounded-full hover:bg-white shadow"
              title="Book actions"
              aria-label={`Actions for ${book.title}`}
              aria-haspopup="menu"
              aria-expanded={menuOpenFor === `book:${book.id}`}
            >
              <MoreVertical size={16} />
            </button>
            {menuOpenFor === `book:${book.id}` && (
              <div className="absolute right-0 top-9 z-20 bg-white rounded-lg shadow-xl border border-slate-200 py-1 w-44" role="menu">
                <button onClick={() => { setRenamingBook(book); setRenameValue(book.title); setMenuOpenFor(null); }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                  <Edit2 size={14} /> Rename
                </button>
                <button onClick={() => { setBookToTrash(book); setMenuOpenFor(null); }}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                  <Trash2 size={14} /> Move to Trash
                </button>
              </div>
            )}
          </div>
        )}
        <div className="p-4 flex items-center justify-between text-sm text-slate-500 font-medium">
          <span>{bookUnits.length} unit{bookUnits.length === 1 ? '' : 's'}</span>
          {!managed && <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Shared</span>}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="flex-1 p-8 overflow-auto">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Curriculum Library</h1>
          <p className="text-slate-500">Books group your units — manage lessons and source material</p>
        </div>
        <div className="flex gap-3">
          {/* Phase 3: one-click backfill for Active units that never got a
              pool (their fire-and-forget trigger was dropped before the
              Aug-17 reliability fix). Admins can backfill all units. */}
          {missingPoolUnitIds.length > 0 && (
            <button
              onClick={handleBackfillPools}
              disabled={backfillState.running}
              className="bg-amber-100 hover:bg-amber-200 text-amber-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60"
              title={`Generate exercise pools for ${missingPoolUnitIds.length} unit(s) with a lesson flow but no exercises`}
            >
              {backfillState.running ? <Loader2 size={18} className="animate-spin" /> : <Dices size={18} />}
              {backfillState.running
                ? `Generating ${backfillState.done}/${backfillState.total}…`
                : `Generate missing pools (${missingPoolUnitIds.length})`}
            </button>
          )}
          <button
            onClick={() => setShowGenerateModal(true)}
            className="bg-purple-100 hover:bg-purple-200 text-purple-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-all active:scale-95"
          >
            <Wand2 size={20} /> Generate Lesson
          </button>
          <button
            onClick={() => setShowNewBookModal(true)}
            className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-all active:scale-95"
          >
            <Plus size={20} /> New Book
          </button>
          <button
            onClick={() => setShowNewUnitModal(true)}
            className="bg-teacher-primary hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-emerald-200 transition-all active:scale-95"
          >
            <span className="text-xl">+</span> New Unit
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setTab('library'); }}
          className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${tab === 'library' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
        >
          Library
        </button>
        <button
          onClick={() => setTab('trash')}
          className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${tab === 'trash' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
        >
          <Trash2 size={14} /> Trash {(trashUnits.length + trashBooks.length) > 0 && <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5">{trashUnits.length + trashBooks.length}</span>}
        </button>
      </div>

      {tab === 'trash' ? (
        /* ── TRASH VIEW ─────────────────────────────────────────────── */
        <div>
          {trashUnits.length === 0 && trashBooks.length === 0 && (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
              Trash is empty
            </div>
          )}
          {trashUnits.length > 0 && (
            <>
              <h3 className="text-sm font-bold uppercase text-slate-400 mb-3">Units</h3>
              <div className="space-y-2 mb-8">
                {trashUnits.map((u) => (
                  <div key={u.id} className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-4">
                    <BookOpen size={20} className="text-slate-400" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-700 truncate">{u.title}</div>
                      <div className="text-xs text-slate-400">Trashed {new Date(u.deleted_at).toLocaleDateString()}</div>
                    </div>
                    <button onClick={() => handleRestoreUnit(u)} className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 font-bold text-sm flex items-center gap-1.5 hover:bg-emerald-200">
                      <RotateCcw size={14} /> Restore
                    </button>
                    <button onClick={() => setForeverTarget({ kind: 'unit', id: u.id, title: u.title })} className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 font-bold text-sm flex items-center gap-1.5 hover:bg-red-200">
                      <Trash2 size={14} /> Delete forever
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          {trashBooks.length > 0 && (
            <>
              <h3 className="text-sm font-bold uppercase text-slate-400 mb-3">Books</h3>
              <div className="space-y-2">
                {trashBooks.map((b) => (
                  <div key={b.id} className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-4">
                    <LibraryBig size={20} className="text-slate-400" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-700 truncate">{b.title}</div>
                      <div className="text-xs text-slate-400">Trashed {b.deleted_at ? new Date(b.deleted_at).toLocaleDateString() : ''}</div>
                    </div>
                    <button onClick={() => handleRestoreBook(b)} className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 font-bold text-sm flex items-center gap-1.5 hover:bg-emerald-200">
                      <RotateCcw size={14} /> Restore
                    </button>
                    <button onClick={() => setForeverTarget({ kind: 'book', id: b.id, title: b.title })} className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 font-bold text-sm flex items-center gap-1.5 hover:bg-red-200">
                      <Trash2 size={14} /> Delete forever
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : activeBook ? (
        /* ── BOOK DETAIL VIEW ───────────────────────────────────────── */
        <div>
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setActiveBookId(null)} className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600">
              <ChevronLeft size={20} />
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-800">{activeBook.title}</h2>
              <p className="text-sm text-slate-400">{(unitsByBook[activeBook.id] || []).length} units · ordered</p>
            </div>
          </div>
          {(unitsByBook[activeBook.id] || []).length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
              No units in this book yet. Use a unit's kebab menu → “Move to book…” to add some.
            </div>
          ) : (
            <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {(unitsByBook[activeBook.id] || []).map((unit, i) => renderUnitCard(unit, { inBook: true, index: i, total: (unitsByBook[activeBook.id] || []).length }))}
            </motion.div>
          )}
          <BookSetupMaterial bookId={activeBook.id} />
        </div>
      ) : (
        /* ── BOOKSHELF VIEW ─────────────────────────────────────────── */
        <div>
          {/* Filters */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text"
                placeholder="Search units & books..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search units and books"
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
              <Filter size={20} className="text-slate-400" />
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                aria-label="Filter by level"
                className="border-none bg-transparent font-medium text-slate-600 focus:ring-0 cursor-pointer"
              >
                <option value="all">All Levels</option>
                {levelOptions.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          {/* Books grid */}
          {visibleBooks.length > 0 && (
            <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
              {visibleBooks.map(renderBookCard)}
            </motion.div>
          )}

          {/* Unassigned units */}
          {visibleUnassigned.length > 0 && (
            <>
              <h3 className="text-sm font-bold uppercase text-slate-400 mb-3">Unassigned units</h3>
              <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {visibleUnassigned.map((unit) => renderUnitCard(unit))}
              </motion.div>
            </>
          )}

          {visibleBooks.length === 0 && visibleUnassigned.length === 0 && (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
              {filtersActive ? (
                <p>No matches for your search or filters.</p>
              ) : (
                <>
                  <p className="font-bold text-slate-500 mb-1">No books yet</p>
                  <p className="text-sm">Create your first book to group units, or upload material to generate a unit.</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Preview Modal */}
      {selectedUnit && (
        <UnitPreviewModal
          unit={selectedUnit}
          onClose={() => setSelectedUnit(null)}
          onLaunch={() => { setSelectedUnit(null); handleLaunch(selectedUnit); }}
          onEdit={() => { setSelectedUnit(null); handlePlan(selectedUnit); }}
        />
      )}

      {/* Generate Lesson Modal — Deprecated: redirects to upload */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Lesson Generation</h2>
            <p className="text-slate-600 mb-6">Upload textbook pages to generate AI-powered lessons.</p>
            <button
              onClick={() => { setShowGenerateModal(false); if (onUploadMaterial) onUploadMaterial(); }}
              className="px-6 py-3 bg-teacher-primary text-white font-bold rounded-lg"
            >
              Go to Upload Workspace
            </button>
            <button onClick={() => setShowGenerateModal(false)} className="ml-3 px-6 py-3 bg-slate-200 text-slate-700 font-bold rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* New Book Modal */}
      <AnimatePresence>
        {showNewBookModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
            onClick={() => setShowNewBookModal(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-slate-800 mb-1">Create a book</h2>
              <p className="text-sm text-slate-500 mb-4">Books group your units, like a textbook or course.</p>
              <input
                autoFocus
                value={newBookTitle}
                onChange={(e) => setNewBookTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBook(); }}
                placeholder="e.g. Let's Go 3 — Semester 1"
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
              />
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowNewBookModal(false)} className="px-4 py-2 rounded-lg text-slate-600 font-medium hover:bg-slate-100">Cancel</button>
                <button onClick={handleCreateBook} disabled={!newBookTitle.trim()} className="px-5 py-2 rounded-lg bg-indigo-600 text-white font-bold disabled:opacity-40 hover:bg-indigo-700">Create</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rename Book Modal */}
      <AnimatePresence>
        {renamingBook && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
            onClick={() => setRenamingBook(null)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-slate-800 mb-4">Rename book</h2>
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRenameBook(); }}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
              />
              <div className="flex justify-end gap-3">
                <button onClick={() => setRenamingBook(null)} className="px-4 py-2 rounded-lg text-slate-600 font-medium hover:bg-slate-100">Cancel</button>
                <button onClick={handleRenameBook} disabled={!renameValue.trim()} className="px-5 py-2 rounded-lg bg-indigo-600 text-white font-bold disabled:opacity-40 hover:bg-indigo-700">Save</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Move Unit To Book Modal */}
      <AnimatePresence>
        {movingUnit && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
            onClick={() => setMovingUnit(null)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-slate-800 mb-1">Move "{movingUnit.title}"</h2>
              <p className="text-sm text-slate-500 mb-4">Choose the destination book.</p>
              <div className="space-y-2 max-h-72 overflow-auto">
                {books.filter(isOwner).map((b) => (
                  <button key={b.id} onClick={() => handleMoveUnit(b.id)}
                    disabled={b.id === movingUnit.book_id}
                    className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed">
                    <LibraryBig size={18} className="text-indigo-500" />
                    <span className="font-medium text-slate-700">{b.title}</span>
                    {b.id === movingUnit.book_id && <span className="ml-auto text-xs text-slate-400">current</span>}
                  </button>
                ))}
                <button onClick={() => handleMoveUnit(null)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50 flex items-center gap-3 text-slate-500">
                  <FolderInput size={18} />
                  <span className="font-medium">Unassigned (no book)</span>
                </button>
              </div>
              <div className="flex justify-end mt-4">
                <button onClick={() => setMovingUnit(null)} className="px-4 py-2 rounded-lg text-slate-600 font-medium hover:bg-slate-100">Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Unit Options Modal */}
      <AnimatePresence>
        {showNewUnitModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
            onClick={() => setShowNewUnitModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-100">
                <h2 className="text-xl font-bold text-slate-800">Create New Unit</h2>
                <p className="text-slate-500 text-sm mt-1">Choose how you want to create your lesson</p>
              </div>

              <div className="p-6 space-y-4">
                <button
                  onClick={() => { setShowNewUnitModal(false); onNewUnit?.(); }}
                  className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-purple-500 hover:bg-purple-50 transition-all flex items-center gap-4 text-left group"
                >
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 group-hover:bg-purple-500 group-hover:text-white transition-all">
                    <Wand2 size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">Generate from Topic</h3>
                    <p className="text-sm text-slate-500">Enter a topic and let AI create a lesson</p>
                  </div>
                </button>

                <button
                  onClick={() => { setShowNewUnitModal(false); onUploadMaterial?.(); }}
                  className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all flex items-center gap-4 text-left group"
                >
                  <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                    <Upload size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">Upload Material</h3>
                    <p className="text-sm text-slate-500">Upload PDF or images for AI to analyze</p>
                  </div>
                </button>
              </div>

              <div className="px-6 pb-6">
                <button onClick={() => setShowNewUnitModal(false)} className="w-full py-2 text-slate-500 font-medium hover:text-slate-700">
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rebuild-from-pages mode dialog (FIXPLAN_F P4) */}
      <AnimatePresence>
        {rebuildUnit && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
            onClick={() => !rebuildRunning && setRebuildUnit(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                  <RotateCcw size={24} />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-slate-800">Rebuild “{rebuildUnit.title}” from its pages?</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Every stored page image is re-scanned and transcribed exactly as printed (verbatim, no quotas).
                    This runs in the background and can take a few minutes.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 mt-5">
                <button onClick={() => handleRebuild('fresh')} disabled={rebuildRunning}
                  className="text-left p-4 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 disabled:opacity-50">
                  <div className="font-bold text-slate-800 text-sm">Fresh rebuild</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Start clean: the current AI-generated content is archived (recoverable), and the unit re-enriches
                    purely from what the pages actually contain.
                  </div>
                </button>
                <button onClick={() => handleRebuild('preserve')} disabled={rebuildRunning}
                  className="text-left p-4 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 disabled:opacity-50">
                  <div className="font-bold text-slate-800 text-sm">Preserve matched edits</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Keep content you already edited or approved; only gaps are filled from the pages
                    (matched by word / rule / line).
                  </div>
                </button>
              </div>
              <div className="flex justify-end mt-4">
                <button onClick={() => setRebuildUnit(null)} disabled={rebuildRunning}
                  className="px-5 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                  {rebuildRunning ? 'Starting…' : 'Cancel'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Move-to-Trash Confirmation Modal */}
      <AnimatePresence>
        {unitToTrash && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
            onClick={() => !isDeleting && setUnitToTrash(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 flex-shrink-0">
                  <AlertTriangle size={24} />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-slate-800">Move this unit to Trash?</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    "<span className="font-semibold text-slate-700">{unitToTrash.title}</span>" will be moved to the Trash.
                    You can restore it from the Trash tab, or delete it forever there.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setUnitToTrash(null)} disabled={isDeleting}
                  className="px-5 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={handleTrashUnit} disabled={isDeleting}
                  className="px-5 py-2 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                  {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {isDeleting ? 'Moving…' : 'Move to Trash'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Book Move-to-Trash Confirmation Modal */}
      <AnimatePresence>
        {bookToTrash && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
            onClick={() => !isDeleting && setBookToTrash(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 flex-shrink-0">
                  <AlertTriangle size={24} />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-slate-800">Move this book to Trash?</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    "<span className="font-semibold text-slate-700">{bookToTrash.title}</span>" will be moved to the Trash.
                    Its units are kept and appear under Unassigned until you restore the book or move them elsewhere.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setBookToTrash(null)} disabled={isDeleting}
                  className="px-5 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={handleTrashBook} disabled={isDeleting}
                  className="px-5 py-2 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                  {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {isDeleting ? 'Moving…' : 'Move to Trash'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Forever Confirmation Modal */}
      <AnimatePresence>
        {foreverTarget && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
            onClick={() => !isDeleting && setForeverTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 flex-shrink-0">
                  <AlertTriangle size={24} />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-slate-800">Delete forever?</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    "<span className="font-semibold text-slate-700">{foreverTarget.title}</span>"
                    {foreverTarget.kind === 'unit'
                      ? ' and ALL its generated content (vocabulary, exercises, pool items, media references) will be permanently removed.'
                      : ' will be permanently removed.'}
                    {' '}This cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setForeverTarget(null)} disabled={isDeleting}
                  className="px-5 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={handleDeleteForever} disabled={isDeleting}
                  className="px-5 py-2 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                  {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {isDeleting ? 'Deleting…' : 'Delete forever'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UnitList;
