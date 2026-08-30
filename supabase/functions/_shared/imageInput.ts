// Resolve a page image into a model-readable form. If a URL is given, fetch
// it server-side and re-encode as base64 — this guarantees the VL model can
// actually READ the bytes (a private/non-public storage URL the model can't
// fetch is the usual cause of "Cannot read image" even on a VL model).
// Factored out of extract-page (FIXPLAN_F P0.3) so scan-page shares it.
//
// Also decodes the image's pixel dimensions (best-effort, imagescript): the
// scan prompts DECLARE them so the vision model grounds bboxes as fractions
// of the true image instead of raw pixels of whatever size the provider
// resized it to (the scan-v6/v7 null-bbox regression — every box >1.0 got
// pruned by sanitizeBbox).

import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

export interface ResolvedImage {
  /** data:...;base64,... when the bytes could be fetched/decoded */
  dataUrl: string;
  /** the original URL, when one was given */
  fallbackUrl: string;
  /** what to send the model: dataUrl when available, else fallbackUrl */
  finalUrl: string;
  /** decoded byte length (0 when only a URL is available) */
  byteLength: number;
  /** decoded pixel dimensions, when the bytes could be decoded */
  width?: number;
  height?: number;
}

export async function resolveImageDataUrl(opts: { imageBase64?: string; url?: string }): Promise<ResolvedImage> {
  if (opts.imageBase64) {
    const dataUrl = `data:image/jpeg;base64,${opts.imageBase64}`;
    return { dataUrl, fallbackUrl: opts.url || '', finalUrl: dataUrl, byteLength: opts.imageBase64.length };
  }
  const fallbackUrl = opts.url || '';
  if (!fallbackUrl) {
    return { dataUrl: '', fallbackUrl, finalUrl: '', byteLength: 0 };
  }
  try {
    const imgResp = await fetch(fallbackUrl, { signal: AbortSignal.timeout(20000) });
    if (imgResp.ok) {
      const bytes = new Uint8Array(await imgResp.arrayBuffer());
      let width: number | undefined;
      let height: number | undefined;
      try {
        const decoded = await Image.decode(bytes);
        width = decoded.width;
        height = decoded.height;
      } catch { /* dims are optional — the scan proceeds without them */ }
      // Chunked btoa: String.fromCharCode(...bytes) overflows the call stack
      // for real page scans (a ~300KB JPEG has ~300k args — well past the
      // engine's argument limit).
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      const ct = imgResp.headers.get('content-type') || 'image/jpeg';
      const dataUrl = `data:${ct};base64,${btoa(binary)}`;
      return { dataUrl, fallbackUrl, finalUrl: dataUrl, byteLength: bytes.length, width, height };
    }
  } catch {
    /* fall back to the raw URL */
  }
  return { dataUrl: '', fallbackUrl, finalUrl: fallbackUrl, byteLength: 0 };
}
