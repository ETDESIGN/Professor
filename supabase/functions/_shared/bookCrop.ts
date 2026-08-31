// Shared deterministic book-crop generator (FIXPLAN_F P3.2 → shared 2026-08-27).
// Used by generate-media's `crop-book-image` action AND enrich-unit (story-page
// illustrations). Crops a stored page image by normalized bbox and writes it
// to the materials bucket as an assets row (kind 'book_extract') with full
// provenance (page → structure → bbox → pool) and a SHA-256 dedupe cache.
//
// Panel precision (doc 12 §7, 2026-08-31): comic panel crops additionally run
// through _shared/panelGeometry — boxes snap to the page's own whitespace
// gutters and missing panels are seeded from siblings — before cropping, so
// the BOOK'S panel art is cut on panel boundaries instead of mid-artwork.
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';
import { planPanelBoxes, type InkGrid, type Box as GBox } from './panelGeometry.ts';

/**
 * Bump whenever the panel refinement ALGORITHM changes — the tag is part of
 * the crop dedupe key, so a bump forces regeneration instead of serving
 * crops produced by the previous (possibly broken) refinement as cache hits
 * (the 2026-08-31 lesson: round-2 fixes cache-hit round-1's NaN-era crops
 * because the tag stayed `g2v1`).
 */
const PANEL_REFINE_VERSION = 'g2v2';

export interface CropRequest {
  sb: any; // service-role supabase client
  pageId: string;
  structureId?: string | null;
  bbox: number[]; // normalized [x,y,w,h]
  pool: string;
  paddingPx?: number;
}

export interface CropResult {
  ok: boolean;
  url?: string;
  asset_id?: string;
  width?: number;
  height?: number;
  flagged?: 'low_resolution';
  message?: string;
  error?: string;
  /** True when an identical crop already existed (dedupe cache hit). */
  cached?: boolean;
}

export async function cropBookImage(req: CropRequest): Promise<CropResult> {
  const { sb, pageId, structureId, bbox, pool } = req;
  if (!pageId || !Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((n: any) => typeof n === 'number' && Number.isFinite(n))) {
    return { ok: false, error: 'cropBookImage requires pageId and bbox [x,y,w,h] (normalized)' };
  }

  const { data: page, error: pageErr } = await sb
    .from('book_pages')
    .select('id, unit_id, book_id, teacher_id, public_url')
    .eq('id', pageId).single();
  if (pageErr || !page) return { ok: false, error: 'Page not found' };

  const key = `crop:${pageId}:${structureId || 'manual'}:${bbox.map((n: number) => n.toFixed(4)).join(',')}:${pool}`;
  const enc = new TextEncoder();
  const hashBytes = await crypto.subtle.digest('SHA-256', enc.encode(key));
  const promptHash = [...new Uint8Array(hashBytes)].map(b => b.toString(16).padStart(2, '0')).join('');
  const { data: cached } = await sb.from('assets').select('id, public_url').eq('prompt_hash', promptHash).eq('type', 'image').limit(1);
  if (cached && cached.length > 0 && cached[0].public_url) {
    return { ok: true, cached: true, url: cached[0].public_url, asset_id: cached[0].id };
  }

  let imgResp: Response;
  try {
    imgResp = await fetch(page.public_url, { signal: AbortSignal.timeout(20000) });
  } catch (e: any) {
    return { ok: false, error: `Could not fetch the page image (${e?.message || e})` };
  }
  if (!imgResp.ok) return { ok: false, error: `Could not fetch the page image (${imgResp.status})` };

  let image: any;
  try {
    image = await Image.decode(new Uint8Array(await imgResp.arrayBuffer()));
  } catch (e: any) {
    return { ok: false, error: `Could not decode the page image (${e?.message || e})` };
  }

  const [nx, ny, nw, nh] = bbox as number[];
  const pad = typeof req.paddingPx === 'number' ? req.paddingPx : Math.round(Math.max(image.width, image.height) * 0.02);
  let x = Math.round(nx * image.width) - pad;
  let y = Math.round(ny * image.height) - pad;
  let w = Math.round(nw * image.width) + pad * 2;
  let h = Math.round(nh * image.height) + pad * 2;
  x = Math.max(0, x); y = Math.max(0, y);
  w = Math.min(image.width - x, w); h = Math.min(image.height - y, h);
  if (w < 200 || h < 200) {
    return { ok: false, flagged: 'low_resolution', message: 'Crop is below the 200px usability floor; consider AI generation for this item.' };
  }

  const cropped = image.crop(x, y, w, h);
  const jpeg = await cropped.encodeJPEG(85);
  const storagePath = `crops/${pageId}/${pool}-${structureId || 'manual'}-${Date.now()}.jpg`;
  const { error: upErr } = await sb.storage.from('materials').upload(storagePath, new Uint8Array(jpeg), { contentType: 'image/jpeg' });
  if (upErr) return { ok: false, error: `Crop upload failed: ${upErr.message}` };
  const { data: urlData } = sb.storage.from('materials').getPublicUrl(storagePath);

  const { data: assetRow, error: assetErr } = await sb.from('assets').insert({
    unit_id: page.unit_id,
    owner_id: page.teacher_id,
    book_id: page.book_id,
    type: 'image',
    kind: 'book_extract',
    prompt: key,
    prompt_hash: promptHash,
    storage_path: storagePath,
    public_url: urlData.publicUrl,
    source_url: page.public_url,
    metadata: { page_id: pageId, structure_id: structureId || null, bbox, pool, crop: { x, y, w, h } },
  }).select('id').single();
  if (assetErr) return { ok: false, error: `Asset insert failed: ${assetErr.message}` };

  if (page.unit_id) {
    await sb.from('unit_media').upsert(
      { unit_id: page.unit_id, asset_id: assetRow.id, role: pool },
      { onConflict: 'unit_id,asset_id,role' },
    ).then(() => undefined, () => undefined);
  }

  return { ok: true, url: urlData.publicUrl, asset_id: assetRow.id, width: cropped.width, height: cropped.height };
}

// ── Batch variant (story fidelity: one crop per story page/paragraph) ──────
// A per-paragraph fan-out would re-fetch and re-decode the SAME page image
// once per scene through cropBookImage; the page fetch is the dominant cost
// (up to 20s timeout). cropBookImages pays it ONCE per page: one page-row
// read, one dedupe lookup for the whole batch, one fetch + decode, then
// per-item crop/upload/asset. Dedupe keys are byte-identical to
// cropBookImage's, so both APIs resolve to the same assets.

export interface BatchCropItem {
  structureId?: string | null;
  /** Normalized [x,y,w,h]; null when the scan gave no box (panel items under
   *  a panelLayout plan can be seeded deterministically without one). */
  bbox?: number[] | null;
  pool: string;
  paddingPx?: number;
  /** Panel items: the panel's order_index — links the refined crop asset
   *  back to its panel (games/composer match on structure_id + panel_index). */
  panelIndex?: number;
}

/**
 * Downsample the decoded page into ink + paper grids for panelGeometry.
 * Step 3 keeps gutter resolution ~3px (gutters are 20-40px on real scans)
 * while limiting pixel reads. ImageScript's getRGBAAt(x, y) returns
 * [r, g, b, a] — getPixelAt returns a PACKED NUMBER (the v1.3 API trap that
 * silently NaN'd the first refinement deploy).
 *
 * Two thresholds, both adaptive to the page (phone photos are rarely pure
 * white): the outer 2% frame margin (almost always background) sets the level.
 *   ink   = margin − 30 → general content detection;
 *   paper = margin − 12 → GUTTER detection only. Children's-book panels often
 *           hold pale flat skies that pass the loose threshold; the stricter
 *           paper test keeps edges from snapping onto them (sliver collapse).
 */
function buildInkGrid(image: any): InkGrid {
  const step = 3;
  const w = Math.max(4, Math.floor(image.width / step));
  const h = Math.max(4, Math.floor(image.height / step));
  const rgbaAt = (gx: number, gy: number): [number, number, number] => {
    // ImageScript pixel access is 1-INDEXED — (0, y) throws "outside
    // boundaries" (the trap that silently killed every edge refinement run
    // while the offline pngjs harness, 0-indexed, kept passing).
    const px = Math.max(1, Math.min(image.width, gx * step + 1));
    const py = Math.max(1, Math.min(image.height, gy * step + 1));
    const p = image.getRGBAAt(px, py);
    return [p[0], p[1], p[2]]; // Uint8ClampedArray [r, g, b, a]
  };
  const lumAt = (gx: number, gy: number): number => {
    const [r, g, b] = rgbaAt(gx, gy);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };
  // Background level from the frame margin.
  const mx = Math.max(1, Math.round(w * 0.02));
  const my = Math.max(1, Math.round(h * 0.02));
  let sum = 0;
  let n = 0;
  for (let x = 0; x < w; x++) {
    for (const y of [0, my, h - 1, h - 1 - my]) { sum += lumAt(x, y); n++; }
  }
  for (let y = my; y < h - my; y++) {
    for (const x of [0, mx, w - 1, w - 1 - mx]) { sum += lumAt(x, y); n++; }
  }
  const margin = sum / n;
  const inkThreshold = Math.max(140, Math.min(245, margin - 30));
  const paperThreshold = Math.max(150, Math.min(250, margin - 12));
  const ink = new Uint8Array(w * h);
  const paper = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = lumAt(x, y);
      const i = y * w + x;
      ink[i] = l < inkThreshold ? 1 : 0;
      paper[i] = l < paperThreshold ? 1 : 0;
    }
  }
  return { w, h, ink, paper };
}

const validBbox = (b: unknown): b is number[] =>
  Array.isArray(b) && b.length === 4 && b.every((v: any) => typeof v === 'number' && Number.isFinite(v));

export async function cropBookImages(req: {
  sb: any; // service-role supabase client
  pageId: string;
  items: BatchCropItem[];
  /** Epoch ms — items past the deadline are skipped (text never blocks on art). */
  deadlineAt?: number;
  /** Comic panel refinement context (doc 12 §7): the comic structure's own
   *  normalized bbox + panel items carrying panelIndex enable gutter snapping
   *  and deterministic seeding of panels the scan left box-less. */
  panelLayout?: { structureBox: number[] } | null;
}): Promise<CropResult[]> {
  const { sb, pageId, items, deadlineAt, panelLayout } = req;
  if (!pageId || !Array.isArray(items) || items.length === 0) {
    return (items || []).map(() => ({ ok: false, error: 'cropBookImages requires pageId and items' }));
  }
  const expired = () => typeof deadlineAt === 'number' && Date.now() > deadlineAt;

  const { data: page, error: pageErr } = await sb
    .from('book_pages')
    .select('id, unit_id, book_id, teacher_id, public_url')
    .eq('id', pageId).single();
  if (pageErr || !page) return items.map(() => ({ ok: false, error: 'Page not found' }));

  // Panel refinement context (doc 12 §7): every panel item carrying a
  // panelIndex under a panelLayout gets gutter-snapped geometry — including
  // panels whose scan bbox is missing (seeded from siblings/structure box).
  const wantsPlan = !!panelLayout && validBbox(panelLayout.structureBox) &&
    items.some((it) => it?.pool === 'panel' && typeof it?.panelIndex === 'number');
  const refinable = items.map((it) =>
    wantsPlan && it?.pool === 'panel' && typeof it?.panelIndex === 'number');
  const croppable = items.map((it, i) => validBbox(it?.bbox) || refinable[i]);

  // Dedupe keys. Refined panel items append the refine version + panelIndex —
  // refinement is deterministic for a given image, so the key is stable across
  // runs AND never collides with pre-refinement crops of the same bbox.
  const keys = items.map((it, i) => {
    const bboxStr = validBbox(it?.bbox)
      ? (it!.bbox as number[]).map((n: number) => n.toFixed(4)).join(',')
      : 'seed';
    const base = `crop:${pageId}:${it?.structureId || 'manual'}:${bboxStr}:${it?.pool}`;
    return refinable[i] ? `${base}:${PANEL_REFINE_VERSION}:${it!.panelIndex}` : base;
  });
  const enc = new TextEncoder();
  const hashes = await Promise.all(keys.map(async (k) => {
    const hb = await crypto.subtle.digest('SHA-256', enc.encode(k));
    return [...new Uint8Array(hb)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }));

  const cache = new Map<string, { id: string; public_url: string }>();
  const lookupHashes = [...new Set(hashes.filter((_, i) => croppable[i]))];
  if (lookupHashes.length > 0) {
    const { data: cachedRows } = await sb.from('assets')
      .select('id, public_url, prompt_hash').eq('type', 'image').in('prompt_hash', lookupHashes);
    for (const row of cachedRows || []) if (row.public_url) cache.set(row.prompt_hash, { id: row.id, public_url: row.public_url });
  }

  // Only fetch + decode when at least one item actually needs generating.
  let image: any = null;
  if (items.some((_, i) => croppable[i] && !cache.has(hashes[i])) && !expired()) {
    try {
      const imgResp = await fetch(page.public_url, { signal: AbortSignal.timeout(20000) });
      if (imgResp.ok) image = await Image.decode(new Uint8Array(await imgResp.arrayBuffer()));
    } catch { image = null; }
  }

  // Panel geometry plan (doc 12 §7): snap over-cut boxes to gutters, seed the
  // scan's box-less panels. Best-effort — a failed refinement crops raw boxes.
  const refinedBox = new Map<number, number[]>();
  if (image && wantsPlan) {
    try {
      const ink = buildInkGrid(image);
      const toGrid = (b: number[]): GBox => [b[0] * ink.w, b[1] * ink.h, b[2] * ink.w, b[3] * ink.h];
      const seeds = items
        .map((it) => ({ order: typeof it?.panelIndex === 'number' ? it.panelIndex : -1, bbox: validBbox(it?.bbox) ? toGrid(it!.bbox as number[]) : null }))
        .filter((s) => s.order >= 0);
      const plan = planPanelBoxes(ink, toGrid((panelLayout as { structureBox: number[] }).structureBox), seeds);
      items.forEach((it, i) => {
        if (!refinable[i]) return;
        const g = plan.get(it!.panelIndex as number);
        if (g) {
          // Back to normalized, clamped to the page.
          const nx = Math.max(0, Math.min(1, g[0] / ink.w));
          const ny = Math.max(0, Math.min(1, g[1] / ink.h));
          const nw = Math.max(0.01, Math.min(1 - nx, g[2] / ink.w));
          const nh = Math.max(0.01, Math.min(1 - ny, g[3] / ink.h));
          refinedBox.set(i, [nx, ny, nw, nh]);
        }
      });
    } catch (e) {
      // Refinement is best-effort (raw boxes still crop) — but NEVER silent:
      // this exact path hid the getPixelAt NaN bug for a day.
      console.error('panelGeometry refinement failed (raw boxes used):', e instanceof Error ? e.message : e);
    }
  }

  const results: CropResult[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const promptHash = hashes[i];
    if (!croppable[i]) {
      results.push({ ok: false, error: 'cropBookImages item requires bbox [x,y,w,h] (normalized)' });
      continue;
    }
    const hit = cache.get(promptHash);
    if (hit) {
      results.push({ ok: true, cached: true, url: hit.public_url, asset_id: hit.id });
      continue;
    }
    if (expired()) {
      results.push({ ok: false, error: 'crop deadline reached — AI/image_prompt fallback applies' });
      continue;
    }
    if (!image) {
      results.push({ ok: false, error: 'Page image could not be fetched or decoded' });
      continue;
    }

    // Refined box wins when the plan produced one; otherwise the raw scan box.
    const bbox = refinedBox.get(i) ?? (validBbox(it?.bbox) ? (it!.bbox as number[]) : null);
    if (!bbox) {
      results.push({ ok: false, error: 'cropBookImages item requires bbox [x,y,w,h] (normalized)' });
      continue;
    }
    const [nx, ny, nw, nh] = bbox as number[];
    const pad = typeof it.paddingPx === 'number' ? it.paddingPx : Math.round(Math.max(image.width, image.height) * 0.02);
    let x = Math.round(nx * image.width) - pad;
    let y = Math.round(ny * image.height) - pad;
    let w = Math.round(nw * image.width) + pad * 2;
    let h = Math.round(nh * image.height) + pad * 2;
    x = Math.max(0, x); y = Math.max(0, y);
    w = Math.min(image.width - x, w); h = Math.min(image.height - y, h);
    if (w < 200 || h < 200) {
      results.push({ ok: false, flagged: 'low_resolution', message: 'Crop is below the 200px usability floor; consider AI generation for this item.' });
      continue;
    }

    const cropped = image.crop(x, y, w, h);
    const jpeg = await cropped.encodeJPEG(85);
    const storagePath = `crops/${pageId}/${it.pool}-${it.structureId || 'manual'}-${Date.now()}-${i}.jpg`;
    const { error: upErr } = await sb.storage.from('materials').upload(storagePath, new Uint8Array(jpeg), { contentType: 'image/jpeg' });
    if (upErr) {
      results.push({ ok: false, error: `Crop upload failed: ${upErr.message}` });
      continue;
    }
    const { data: urlData } = sb.storage.from('materials').getPublicUrl(storagePath);

    let { data: assetRow, error: assetErr } = await sb.from('assets').insert({
      unit_id: page.unit_id,
      owner_id: page.teacher_id,
      book_id: page.book_id,
      type: 'image',
      kind: 'book_extract',
      prompt: keys[i],
      prompt_hash: promptHash,
      storage_path: storagePath,
      public_url: urlData.publicUrl,
      source_url: page.public_url,
      metadata: {
        page_id: pageId,
        structure_id: it.structureId || null,
        bbox,
        pool: it.pool,
        crop: { x, y, w, h },
        ...(typeof it.panelIndex === 'number' ? { panel_index: it.panelIndex } : {}),
        ...(refinedBox.has(i) ? { refined: true, bbox_scan: validBbox(it?.bbox) ? it!.bbox : null } : {}),
      },
    }).select('id').single();
    if (assetErr) {
      // Concurrent insert of the same dedupe key (unique prompt_hash+type) —
      // resolve to the existing asset instead of failing the page's art.
      const dup = String(assetErr.code || '') === '23505' || /duplicate|unique/i.test(String(assetErr.message || ''));
      if (dup) {
        const { data: existing } = await sb.from('assets').select('id, public_url')
          .eq('prompt_hash', promptHash).eq('type', 'image').limit(1);
        if (existing && existing.length > 0 && existing[0].public_url) {
          const found = existing[0];
          cache.set(promptHash, { id: found.id, public_url: found.public_url });
          results.push({ ok: true, cached: true, url: found.public_url, asset_id: found.id });
          continue;
        }
      }
      results.push({ ok: false, error: `Asset insert failed: ${assetErr.message}` });
      continue;
    }
    if (page.unit_id) {
      await sb.from('unit_media').upsert(
        { unit_id: page.unit_id, asset_id: assetRow.id, role: it.pool },
        { onConflict: 'unit_id,asset_id,role' },
      ).then(() => undefined, () => undefined);
    }
    cache.set(promptHash, { id: assetRow.id, public_url: urlData.publicUrl });
    results.push({ ok: true, url: urlData.publicUrl, asset_id: assetRow.id, width: cropped.width, height: cropped.height });
  }
  return results;
}
