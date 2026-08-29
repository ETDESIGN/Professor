// Thin shim: legacy signature kept for generate-exercises + generate-media's
// generate-image action. All real logic lives in illustration.ts (v2).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { generateIllustration, fetchUnitArtContext } from './illustration.ts';

export interface GeneratedAsset { url: string; provider?: string; error?: string }

export async function generateAndStoreImage(prompt: string, unitId: string): Promise<GeneratedAsset> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const sb = createClient(supabaseUrl, serviceKey);
  const ctx = await fetchUnitArtContext(sb, unitId).catch(() => null);
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
