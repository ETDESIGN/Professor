// supabase/functions/_shared/wordImage.ts
// Per-teacher word-image library (spec 2026-09-05). ALL vocab-surface image
// generation routes through ensureWordImage: consult word_images first; on a
// miss generate with the canonical unit-context-free prompt; upsert the
// pointer. A regenerate replaces the teacher's image for that word GLOBALLY
// (superseded asset is soft-deleted — reversible, hidden from the library).
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { canonicalWordKey, canonicalVocabContent, NEUTRAL_VOCAB_CONTEXT } from './wordImageCore.ts';
import { generateIllustration } from './illustration.ts';

export interface WordImageResult { url: string; assetId?: string; cached?: boolean; error?: string }

export async function resolveWordImage(
  sb: SupabaseClient, ownerId: string, wordKey: string,
): Promise<{ assetId: string; url: string } | null> {
  const { data } = await sb
    .from('word_images')
    .select('asset_id, assets(public_url)')
    .eq('owner_id', ownerId)
    .eq('word_key', wordKey)
    .maybeSingle();
  const url = (data as any)?.assets?.public_url;
  if (data?.asset_id && url) return { assetId: data.asset_id, url };
  return null;
}

export async function ensureWordImage(opts: {
  sb: SupabaseClient; unitId: string; word: string; ownerId: string; regenerate?: boolean;
}): Promise<WordImageResult> {
  const wordKey = canonicalWordKey(opts.word);
  if (!wordKey) return { url: '', error: 'word is required for the vocab library path' };
  if (!opts.ownerId) return { url: '', error: 'ownerId is required for the vocab library path' };

  if (!opts.regenerate) {
    const hit = await resolveWordImage(opts.sb, opts.ownerId, wordKey);
    if (hit) return { url: hit.url, assetId: hit.assetId, cached: true };
  }
  const prev = await resolveWordImage(opts.sb, opts.ownerId, wordKey);

  const r = await generateIllustration({
    sb: opts.sb, unitId: opts.unitId, surface: 'vocab',
    content: canonicalVocabContent(opts.word),
    context: NEUTRAL_VOCAB_CONTEXT, // unit-context-free BY DESIGN (spec §3.2)
    regenerate: opts.regenerate,
    ownerId: opts.ownerId,
    metadata: { surface: 'vocab', word_key: wordKey },
  });
  if (r.error || !r.assetId) return r; // dicebear fallback + error, as before

  // Upsert the canonical pointer (last-write-wins on a concurrent race; the
  // loser asset becomes an orphan for a later cleanup sweep). Best-effort per
  // spec §4: dedup bookkeeping must never fail an otherwise-successful
  // generation — the next call retries the upsert.
  try {
    await opts.sb.from('word_images').upsert(
      { owner_id: opts.ownerId, word_key: wordKey, asset_id: r.assetId },
      { onConflict: 'owner_id,word_key' },
    );
    if (prev && prev.assetId !== r.assetId) {
      // Regenerate replaced the image globally: retire the superseded row.
      // (When generateIllustration repointed the SAME row on a 409, the ids
      // match and there is nothing to retire.)
      await opts.sb.from('assets').update({ is_deleted: true }).eq('id', prev.assetId);
    }
  } catch (err) {
    console.error('word_images upsert failed (non-fatal):', err);
  }
  return r;
}
