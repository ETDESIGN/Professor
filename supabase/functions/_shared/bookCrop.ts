// Shared deterministic book-crop generator (FIXPLAN_F P3.2 → shared 2026-08-27).
// Used by generate-media's `crop-book-image` action AND enrich-unit (story-page
// illustrations). Crops a stored page image by normalized bbox and writes it
// to the materials bucket as an assets row (kind 'book_extract') with full
// provenance (page → structure → bbox → pool) and a SHA-256 dedupe cache.
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

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
  bbox: number[]; // normalized [x,y,w,h]
  pool: string;
  paddingPx?: number;
}

export async function cropBookImages(req: {
  sb: any; // service-role supabase client
  pageId: string;
  items: BatchCropItem[];
  /** Epoch ms — items past the deadline are skipped (text never blocks on art). */
  deadlineAt?: number;
}): Promise<CropResult[]> {
  const { sb, pageId, items, deadlineAt } = req;
  if (!pageId || !Array.isArray(items) || items.length === 0) {
    return (items || []).map(() => ({ ok: false, error: 'cropBookImages requires pageId and items' }));
  }
  const expired = () => typeof deadlineAt === 'number' && Date.now() > deadlineAt;

  const { data: page, error: pageErr } = await sb
    .from('book_pages')
    .select('id, unit_id, book_id, teacher_id, public_url')
    .eq('id', pageId).single();
  if (pageErr || !page) return items.map(() => ({ ok: false, error: 'Page not found' }));

  const valid = items.map((it) =>
    Array.isArray(it?.bbox) && it.bbox.length === 4 && it.bbox.every((n: any) => typeof n === 'number' && Number.isFinite(n)));
  const keys = items.map((it) =>
    `crop:${pageId}:${it?.structureId || 'manual'}:${(it?.bbox || []).map((n: number) => n.toFixed(4)).join(',')}:${it?.pool}`);
  const enc = new TextEncoder();
  const hashes = await Promise.all(keys.map(async (k) => {
    const hb = await crypto.subtle.digest('SHA-256', enc.encode(k));
    return [...new Uint8Array(hb)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }));

  const cache = new Map<string, { id: string; public_url: string }>();
  const lookupHashes = [...new Set(hashes.filter((_, i) => valid[i]))];
  if (lookupHashes.length > 0) {
    const { data: cachedRows } = await sb.from('assets')
      .select('id, public_url, prompt_hash').eq('type', 'image').in('prompt_hash', lookupHashes);
    for (const row of cachedRows || []) if (row.public_url) cache.set(row.prompt_hash, { id: row.id, public_url: row.public_url });
  }

  // Only fetch + decode when at least one item actually needs generating.
  let image: any = null;
  if (items.some((_, i) => valid[i] && !cache.has(hashes[i])) && !expired()) {
    try {
      const imgResp = await fetch(page.public_url, { signal: AbortSignal.timeout(20000) });
      if (imgResp.ok) image = await Image.decode(new Uint8Array(await imgResp.arrayBuffer()));
    } catch { image = null; }
  }

  const results: CropResult[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const promptHash = hashes[i];
    if (!valid[i]) {
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

    const [nx, ny, nw, nh] = it.bbox as number[];
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
      metadata: { page_id: pageId, structure_id: it.structureId || null, bbox: it.bbox, pool: it.pool, crop: { x, y, w, h } },
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
