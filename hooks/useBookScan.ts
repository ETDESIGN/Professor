import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { toast } from 'sonner';
import { createClientLogger } from '../services/logger';
import { rasterizePdf, isPdfFile, type RasterizedPage } from '../services/pdfRasterize';
import { assessImageQuality } from '../services/imageQuality';
import type { StructureType } from '../types/pipeline';

const log = createClientLogger('useBookScan');

// FIXPLAN_F P2.3 — the new upload flow (doc 10 §4):
// upload → [scan-page: inventory → verbatim extraction → verification] →
// teacher OCR review (✕/➕) → batch confirm → basket-driven enrichment.
// Pages/structures persist server-side (book_pages/page_structures); the
// old scanned_assets JSONB path is untouched for legacy units.

export interface ScanStructure {
  id: string;
  structure_type: StructureType;
  order_index: number;
  bbox: number[] | null;
  confidence: number | null;
  verification_flags: string[];
  data: any;
  set_label: string | null;
  grammar_tier: string | null;
  review_status: 'pending' | 'confirmed' | 'removed' | 'edited';
  source: 'ai' | 'teacher';
}

export interface ScanPage {
  id: string;
  public_url: string;
  printed_page_number: string | null;
  printed_unit_label: string | null;
  printed_title: string | null;
  upload_order: number;
  pdf_page_number: number | null;
  status: 'pending' | 'scanning' | 'scanned' | 'reviewed' | 'failed';
  error: string | null;
  structures: ScanStructure[];
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export function useBookScan(unitId: string | null) {
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadPages = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    try {
      const { data: pageRows, error } = await supabase
        .from('book_pages')
        .select('id, public_url, printed_page_number, printed_unit_label, printed_title, upload_order, pdf_page_number, status, error, page_structures(*)')
        .eq('unit_id', unitId)
        .order('upload_order', { ascending: true });
      if (error) throw error;
      setPages((pageRows || []).map((p: any) => ({
        ...p,
        structures: (p.page_structures || []).sort((a: any, b: any) => a.order_index - b.order_index),
      })));
    } catch (err: any) {
      log.warn('load_pages_failed', { error: err?.message });
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => { loadPages(); }, [loadPages]);

  /** Upload one page image + invoke scan-page. */
  const scanOne = useCallback(async (
    unit: string, page: { blob: Blob; width: number; height: number; name: string; pageNumber: number; order: number },
  ): Promise<{ ok: boolean; error?: string; printed?: string }> => {
    try {
      const fileName = `${Date.now()}-${page.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { error: upErr } = await supabase.storage.from('materials').upload(fileName, page.blob, {
        contentType: 'image/jpeg',
      });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('materials').getPublicUrl(fileName);
      const { data, error } = await supabase.functions.invoke('scan-page', {
        body: {
          unitId: unit,
          fileUrl: urlData.publicUrl,
          filename: page.name,
          pdfPageNumber: page.pageNumber,
          uploadOrder: page.order,
          width: page.width,
          height: page.height,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Scan failed');
      return { ok: true, printed: data.page_labels?.printed_page_number || null };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  }, []);

  /**
   * Rasterize PDFs, upload every page, scan in parallel (bounded), then
   * reload the server-side page list. Photos run through the intake quality
   * gate first — warnings surface as toasts, never as blocks.
   *
   * AUDIT FIX (2026-08-26): accepts an explicit unitId — the first pick
   * after page load used the hook's stale closure (unitId still null) and
   * silently skipped the scan, forcing a second pick. Also refreshes after
   * EVERY page settles so the review screen shows progress instead of a
   * frozen "0 pages" for the multi-minute scan window.
   */
  const scanFiles = useCallback(async (explicitUnitId: string | null, files: File[]) => {
    const unit = explicitUnitId || unitId;
    if (!unit || files.length === 0) return;
    setScanning(true);
    // Optimistic placeholders so the sidebar reflects work immediately.
    setPages(prev => {
      let order = prev.length;
      const placeholders = files.flatMap(f => (isPdfFile(f) ? [{ key: `${f.name}-pdf` }] : [{ key: f.name }]))
        .map(p => ({
          id: `pending-${p.key}-${order}`,
          public_url: '', printed_page_number: null, printed_unit_label: null, printed_title: null,
          upload_order: order++, pdf_page_number: null, status: 'pending' as const, error: null, structures: [],
        }));
      return [...prev, ...placeholders];
    });
    try {
      // Expand: PDFs → pages; images pass through.
      const entries: { blob: Blob; width: number; height: number; name: string; pageNumber: number; order: number }[] = [];
      let order = pages.length;
      const photoFiles = files.filter(f => !isPdfFile(f));
      const qualityWarnings: string[] = [];
      for (const file of photoFiles) {
        try {
          const q = await assessImageQuality(file);
          qualityWarnings.push(...q.warnings.map(w => `${file.name}: ${w}`));
          entries.push({ blob: file, width: q.width, height: q.height, name: file.name, pageNumber: 0, order: order++ });
        } catch {
          const dims = await imageDims(file).catch(() => ({ width: 0, height: 0 }));
          entries.push({ blob: file, ...dims, name: file.name, pageNumber: 0, order: order++ });
        }
      }
      for (const file of files) {
        if (!isPdfFile(file)) continue;
        toast.info(`Splitting ${file.name} into pages…`);
        let rasterized: RasterizedPage[];
        try {
          rasterized = await rasterizePdf(file);
        } catch (err: any) {
          toast.error(`Could not split ${file.name}: ${err?.message || err}`);
          continue;
        }
        for (const p of rasterized) {
          entries.push({ blob: p.blob, width: p.width, height: p.height, name: `p${p.pageNumber}.jpg`, pageNumber: p.pageNumber, order: order++ });
        }
      }
      // Surface at most the first few warnings (retake prompt, non-blocking).
      for (const w of qualityWarnings.slice(0, 3)) toast.warning(w);
      if (qualityWarnings.length > 3) toast.warning(`…and ${qualityWarnings.length - 3} more pages with quality notes.`);

      let done = 0;
      const results = await mapWithConcurrency(entries, 2, async (e) => {
        const r = await scanOne(unit, e);
        done++;
        // Refresh after every settled page — live progress, never a frozen
        // empty screen during the 1-3 min a dense page can take.
        loadPages().catch(() => undefined);
        if (done % 2 === 0 || done === entries.length) {
          setPages(prev => prev.filter(p => !String(p.id).startsWith('pending-')));
        }
        return r;
      });

      const failed = results.filter(r => !r.ok);
      await loadPages();
      if (failed.length === results.length && results.length > 0) {
        toast.error('Scanning failed for all pages. Open a page to see the error and retry.');
      } else if (failed.length > 0) {
        toast.error(`${failed.length} of ${results.length} pages failed to scan — retry those pages.`);
      } else {
        toast.success(`${results.length} page${results.length === 1 ? '' : 's'} scanned.`);
      }
    } finally {
      setScanning(false);
    }
  }, [unitId, pages.length, scanOne, loadPages]);

  /** Retry a single failed page (teacher re-uploads the image). */
  const retryScan = useCallback(async (pageId: string, file: File) => {
    setScanning(true);
    try {
      const page = pages.find(p => p.id === pageId);
      if (!page) return;
      const dims = await imageDims(file).catch(() => ({ width: 0, height: 0 }));
      const r = await scanOne(unitId!, { blob: file, ...dims, name: file.name, pageNumber: page.pdf_page_number || 0, order: page.upload_order });
      if (!r.ok) toast.error(r.error || 'Retry failed');
      await loadPages();
    } finally {
      setScanning(false);
    }
  }, [unitId, pages, scanOne, loadPages]);

  /** ✕ — mark a structure removed (teacher sovereignty; baskets exclude it). */
  const removeStructure = useCallback(async (structureId: string) => {
    setPages(prev => prev.map(p => ({
      ...p,
      structures: p.structures.map(s => s.id === structureId ? { ...s, review_status: 'removed' as const } : s),
    })));
    const { error } = await supabase
      .from('page_structures')
      .update({ review_status: 'removed' })
      .eq('id', structureId);
    if (error) { toast.error(error.message); await loadPages(); }
  }, [loadPages]);

  /** Restore a removed structure. */
  const restoreStructure = useCallback(async (structureId: string) => {
    setPages(prev => prev.map(p => ({
      ...p,
      structures: p.structures.map(s => s.id === structureId ? { ...s, review_status: 'pending' as const } : s),
    })));
    const { error } = await supabase
      .from('page_structures')
      .update({ review_status: 'pending' })
      .eq('id', structureId);
    if (error) { toast.error(error.message); await loadPages(); }
  }, [loadPages]);

  /** ➕ — teacher-added structure (explicit, labeled source='teacher'). */
  const addStructure = useCallback(async (
    pageId: string, structure_type: StructureType, data: any, set_label?: string,
  ) => {
    const { error } = await supabase
      .from('page_structures')
      .insert({ page_id: pageId, structure_type, data, set_label: set_label || null, source: 'teacher', review_status: 'confirmed', extractor_version: 'teacher' });
    if (error) { toast.error(error.message); return; }
    await loadPages();
  }, [loadPages]);

  /**
   * Batch confirm: pages → reviewed, unit → baskets_confirmed_at. This is
   * the teacher action that unlocks basket-driven enrichment (doc 10 §5).
   */
  const confirmBatch = useCallback(async () => {
    if (!unitId) return false;
    const pageIds = pages.filter(p => p.status === 'scanned').map(p => p.id);
    if (pageIds.length > 0) {
      const { error } = await supabase
        .from('book_pages')
        .update({ status: 'reviewed', reviewed_at: new Date().toISOString() })
        .in('id', pageIds);
      if (error) { toast.error(error.message); return false; }
    }
    // Confirm every remaining pending/edited structure (teacher reviewed the batch).
    const structureIds = pages.flatMap(p => p.structures)
      .filter(s => s.review_status === 'pending' || s.review_status === 'edited')
      .map(s => s.id);
    if (structureIds.length > 0) {
      await supabase.from('page_structures').update({ review_status: 'confirmed' }).in('id', structureIds);
    }
    const { error: unitErr } = await supabase
      .from('units')
      .update({ baskets_confirmed_at: new Date().toISOString() })
      .eq('id', unitId);
    if (unitErr) { toast.error(unitErr.message); return false; }
    await loadPages();
    return true;
  }, [unitId, pages, loadPages]);

  /** ✎ — teacher-adjusted bbox (crop handles); marks the structure edited. */
  const updateBbox = useCallback(async (structureId: string, bbox: number[]) => {
    const { error } = await supabase
      .from('page_structures')
      .update({ bbox, review_status: 'edited' })
      .eq('id', structureId);
    if (error) { toast.error(error.message); return false; }
    await loadPages();
    return true;
  }, [loadPages]);

  /** Preview a deterministic crop for a structure (P3 geometry layer). */
  const previewCrop = useCallback(async (pageId: string, structureId: string, bbox: number[], pool: string) => {
    const { data, error } = await supabase.functions.invoke('generate-media', {
      body: { action: 'crop-book-image', pageId, structureId, bbox, pool },
    });
    if (error) return { error: error.message };
    if (data?.flagged === 'low_resolution') return { flagged: true, message: data.message };
    if (!data?.url) return { error: data?.error || 'Crop failed' };
    return { url: data.url as string };
  }, []);

  return {
    pages, scanning, loading,
    loadPages, scanFiles, retryScan,
    removeStructure, restoreStructure, addStructure, confirmBatch,
    updateBbox, previewCrop,
  };
}

async function imageDims(file: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  return { width: bitmap.width, height: bitmap.height };
}
