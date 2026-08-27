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
    return { ok: true, cached: true as any, url: cached[0].public_url, asset_id: cached[0].id };
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
