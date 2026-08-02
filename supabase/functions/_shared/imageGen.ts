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

    // Record the asset for future dedup + the vault (best-effort). Record even
    // when proxying failed (fall back to the direct provider URL) so the asset
    // is still tracked — previously a proxy failure meant nothing was recorded,
    // leaving the assets table (and thus the vault) permanently empty.
    if (supabaseUrl && supabaseKey) {
      try {
        const insertResp = await fetch(`${supabaseUrl}/rest/v1/assets`, {
          method: 'POST',
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({
            unit_id: unitId || null,
            type: 'image',
            kind: 'generated',
            prompt,
            prompt_hash: promptHash,
            storage_path: proxied ? `images/${unitId || 'default'}` : 'external',
            public_url: url,
          }),
        });
        if (!insertResp.ok) {
          const errBody = await insertResp.json().catch(() => ({}));
          // 409 / 23505 = unique_violation: a concurrent run already inserted
          // this asset. Re-read its public_url and return it (dedup-safe).
          if (insertResp.status === 409 || (errBody as any)?.code === '23505') {
            const reRead = await fetch(
              `${supabaseUrl}/rest/v1/assets?select=public_url&type=eq.image&prompt_hash=eq.${promptHash}&limit=1`,
              { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
            );
            if (reRead.ok) {
              const rows = await reRead.json();
              if (Array.isArray(rows) && rows.length > 0 && rows[0].public_url) {
                return { url: rows[0].public_url, provider: 'dedup' };
              }
            }
          } else {
            console.error('[imageGen] assets insert failed:', insertResp.status, (errBody as any)?.message || JSON.stringify(errBody));
          }
        } else {
          // Task 17: link the asset to the unit via unit_media (role 'generated').
          // Best-effort — a failure here must not fail image generation.
          try {
            const inserted = await insertResp.json();
            const assetId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
            if (assetId && unitId) {
              await fetch(`${supabaseUrl}/rest/v1/unit_media`, {
                method: 'POST',
                headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
                body: JSON.stringify({ unit_id: unitId, asset_id: assetId, role: 'generated', order_index: 0 }),
              });
            }
          } catch (linkErr: any) {
            console.error('[imageGen] unit_media link failed:', linkErr?.message || linkErr);
          }
        }
      } catch (insertErr: any) {
        // Network-level failure on the insert — log but don't fail generation.
        console.error('[imageGen] assets insert error:', insertErr?.message || insertErr);
      }
    }
    return { url, provider: generated.provider };
  } catch (err: any) {
    return { url: DICEBEAR(prompt), error: err?.message || 'image error' };
  }
}

export const dicebearPlaceholder = DICEBEAR;
