// Thin shim: legacy signature kept for generate-exercises + generate-media's
// generate-image action. All real logic lives in illustration.ts (v2).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { generateIllustration, fetchUnitArtContext } from './illustration.ts';
import { ensureWordImage } from './wordImage.ts';

export interface GeneratedAsset { url: string; provider?: string; error?: string }

export async function generateAndStoreImage(prompt: string, unitId: string, word?: string): Promise<GeneratedAsset> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const sb = createClient(supabaseUrl, serviceKey);
  const ctx = await fetchUnitArtContext(sb, unitId).catch(() => null);

  // Word-library path (spec 2026-09-05): one canonical image per (owner,
  // word), reused across ALL units. Only when we know BOTH the word and the
  // owner — otherwise fall through to the legacy prompt path (characters,
  // ownerless legacy units).
  if (word && ctx?.teacherId) {
    const r = await ensureWordImage({ sb, unitId: unitId || 'default', word, ownerId: ctx.teacherId });
    if (r.error) return { url: '', provider: 'openrouter', error: r.error };
    return { url: r.url, provider: r.cached ? 'word-library' : 'openrouter' };
  }

  const r = await generateIllustration({
    sb, unitId: unitId || 'default', surface: 'vocab', content: prompt,
    context: ctx || { title: 'Unit', topic: null, artDirection: null },
  });
  // On failure generateIllustration returns a dicebear fallback WITH an error
  // — machine consumers (generate-exercises) treat a truthy url as success and
  // would persist the placeholder as image_status:'ready', permanently hiding
  // the item from regeneration. Surface failure as an empty url.
  if (r.error) return { url: '', provider: 'openrouter', error: r.error };
  return { url: r.url, provider: r.cached ? 'dedup' : 'openrouter' };
}

export const dicebearPlaceholder = (seed: string) =>
  `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed || 'item')}`;
