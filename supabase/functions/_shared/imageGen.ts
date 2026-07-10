// Shared image generation helper (Edge / Deno). Generates a child-friendly
// illustration via the active provider and proxies it into the generated-media
// bucket (so the browser CSP img-src for *.supabase.co is satisfied). Dedups
// via the assets table (prompt_hash) so repeated runs don't re-spend. Used by
// generate-media and generate-exercises (Phase 1.4: 1 image/word).

import { resolveImageProvider } from './imageProvider.ts';

const DICEBEAR = (seed: string) =>
  `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed || 'item')}`;

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.toLowerCase().trim());
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function proxyToStorage(imageUrl: string, unitId: string): Promise<string | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !supabaseKey) return null;

  const imgResp = await fetch(imageUrl, { signal: AbortSignal.timeout(45000) });
  if (!imgResp.ok) return null;
  const imgBuffer = await imgResp.arrayBuffer();
  const contentType = imgResp.headers.get('content-type') || 'image/png';
  const ext = contentType.split('/')[1]?.split(';')[0] || 'png';
  const uploadPath = `images/${unitId || 'default'}/${Date.now()}.${ext}`;
  const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/generated-media/${uploadPath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': contentType },
    body: imgBuffer,
  });
  if (!uploadResponse.ok) return null;
  return `${supabaseUrl}/storage/v1/object/public/generated-media/${uploadPath}`;
}

export interface GeneratedAsset {
  url: string;
  provider?: string;
  error?: string;
}

/**
 * Generate (or reuse) one image for a prompt. Dedup: if an asset row with the
 * same prompt_hash already exists, return its public_url without generating.
 * On failure returns a Dicebear placeholder so callers never get an empty URL.
 */
export async function generateAndStoreImage(prompt: string, unitId: string): Promise<GeneratedAsset> {
  const provider = resolveImageProvider();
  if (!provider) return { url: DICEBEAR(prompt), error: 'Image generation not configured' };

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const promptHash = await sha256Hex(prompt);

  // Dedup: reuse an existing generated asset for this prompt.
  if (supabaseUrl && supabaseKey) {
    try {
      const dedupResp = await fetch(
        `${supabaseUrl}/rest/v1/assets?select=public_url&type=eq.image&prompt_hash=eq.${promptHash}&limit=1`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
      );
      if (dedupResp.ok) {
        const rows = await dedupResp.json();
        if (Array.isArray(rows) && rows.length > 0 && rows[0].public_url) {
          return { url: rows[0].public_url, provider: 'dedup' };
        }
      }
    } catch {
      /* fall through to generation */
    }
  }

  try {
    const generated = await provider.generate(prompt || 'Educational item');
    if (!generated || !generated.imageUrl) {
      return { url: DICEBEAR(prompt), error: 'No image returned' };
    }
    const proxied = await proxyToStorage(generated.imageUrl, unitId || 'default');
    const url = proxied || generated.imageUrl;

    // Record the asset for future dedup (best-effort).
    if (supabaseUrl && supabaseKey && proxied) {
      await fetch(`${supabaseUrl}/rest/v1/assets`, {
        method: 'POST',
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_id: unitId || null,
          type: 'image',
          prompt,
          prompt_hash: promptHash,
          storage_path: 'external',
          public_url: url,
        }),
      }).catch(() => {});
    }
    return { url, provider: generated.provider };
  } catch (err: any) {
    return { url: DICEBEAR(prompt), error: err?.message || 'image error' };
  }
}

export const dicebearPlaceholder = DICEBEAR;
