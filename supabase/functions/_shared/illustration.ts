// Edge wrapper around illustrationCore: reads Deno env, resolves unit art
// context, does dedup → generate → upload → record, and the per-surface
// write-backs (units.cover_image / characters.reference_image_asset_id /
// story_pages.image_asset_id).
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  Surface, UnitArtContext, composePrompt, aspectRatioFor,
  IllustrationConfig, SupabaseRestConfig, ImageGenResult,
  callOpenRouterImages, uploadImageToStorage, findAssetByHash, insertAssetRow, promptHashFor,
} from './illustrationCore.ts';

const DICEBEAR = (seed: string) => `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed || 'item')}`;

function envConfig(): { ill: IllustrationConfig; rest: SupabaseRestConfig; model: string; fallbackModel: string | null } | null {
  const openrouterKey = Deno.env.get('AI_API_KEY') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!openrouterKey || !supabaseUrl || !serviceKey) return null;
  return {
    ill: { openrouterKey },
    rest: { supabaseUrl, serviceKey },
    model: Deno.env.get('IMAGE_GEN_MODEL') || 'bytedance-seed/seedream-4.5',
    fallbackModel: Deno.env.get('IMAGE_GEN_FALLBACK_MODEL') || null,
  };
}

export async function fetchUnitArtContext(sb: SupabaseClient, unitId: string): Promise<UnitArtContext & { teacherId: string | null; bookId: string | null } | null> {
  const { data: unit } = await sb.from('units').select('title, topic, art_direction, teacher_id, book_id').eq('id', unitId).single();
  if (!unit) return null;
  return {
    title: String(unit.title || 'Unit'),
    topic: unit.topic || null,
    artDirection: unit.art_direction || null,
    teacherId: unit.teacher_id || null,
    bookId: unit.book_id || null,
  };
}

/** One small chat call to derive the unit's art direction line (cached in units.art_direction). */
export async function ensureArtDirection(sb: SupabaseClient, unit: { id: string; title: string; topic?: string | null; artDirection?: string | null }): Promise<string> {
  const existing = String(unit.artDirection || '').trim();
  if (existing) return existing;
  const openrouterKey = Deno.env.get('AI_API_KEY') || '';
  const textModel = Deno.env.get('AI_MODEL_NAME') || 'moonshotai/kimi-k2.6';
  let dir = '';
  if (openrouterKey) {
    try {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openrouterKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: textModel,
          messages: [
            { role: 'system', content: 'You are an art director for a children\'s English course (ages 6-12). Reply with ONE line only: a color palette plus 2-3 visual motifs for the unit. No preamble, no quotes. Example: warm sunset palette; rockets, planets, soft glow' },
            { role: 'user', content: `Unit title: ${unit.title}\nTopic: ${unit.topic || 'general English'}` },
          ],
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (resp.ok) {
        const data = await resp.json();
        dir = String(data.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '').split('\n')[0].slice(0, 200);
      }
    } catch { /* fall through to topic-derived default */ }
  }
  if (!dir) dir = `cheerful primary palette; motifs from ${unit.topic || unit.title}`;
  await sb.from('units').update({ art_direction: dir }).eq('id', unit.id);
  return dir;
}

async function runOneImage(cfg: { ill: IllustrationConfig; model: string }, prompt: string, aspectRatio: string, refs?: string[]): Promise<ImageGenResult> {
  const primary = await callOpenRouterImages(cfg.ill, { model: cfg.model, prompt, aspectRatio, inputReferences: refs });
  if (primary.ok) return primary;
  const fbModel = Deno.env.get('IMAGE_GEN_FALLBACK_MODEL');
  if (fbModel && fbModel !== cfg.model) {
    const fb = await callOpenRouterImages(cfg.ill, { model: fbModel, prompt, aspectRatio, inputReferences: refs });
    if (fb.ok) return fb;
  }
  return primary;
}

export async function generateIllustration(opts: {
  sb: SupabaseClient; unitId: string; surface: Surface; content: string;
  context: UnitArtContext; inputReferences?: string[]; regenerate?: boolean;
}): Promise<{ url: string; assetId?: string; cached?: boolean; error?: string }> {
  const cfg = envConfig();
  if (!cfg) return { url: DICEBEAR(opts.content), error: 'Illustration not configured (AI_API_KEY/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)' };

  const finalPrompt = composePrompt(opts.surface, opts.context, opts.content);
  const refs = (opts.inputReferences || []).filter(Boolean);
  const hash = await promptHashFor(cfg.model, finalPrompt, refs);

  if (!opts.regenerate) {
    const cached = await findAssetByHash(cfg.rest, hash);
    if (cached) return { url: cached.public_url, assetId: cached.id, cached: true };
  }

  const gen = await runOneImage({ ill: cfg.ill, model: cfg.model }, finalPrompt, aspectRatioFor(opts.surface), refs);
  // NOTE: `gen.ok === false` (not `!gen.ok`) — the repo tsconfig runs without
  // strictNullChecks, where negative truthiness checks don't narrow unions.
  if (gen.ok === false) return { url: DICEBEAR(opts.content), error: gen.error };

  const bytes = Uint8Array.from(atob(gen.b64), (c) => c.charCodeAt(0));
  const publicUrl = await uploadImageToStorage(cfg.rest, opts.unitId, bytes, gen.mediaType);
  if (!publicUrl) return { url: DICEBEAR(opts.content), error: 'storage upload failed' };

  const { id: assetId, conflict } = await insertAssetRow(cfg.rest, {
    unit_id: opts.unitId || null,
    prompt: finalPrompt,
    prompt_hash: hash,
    model: gen.model,
    storage_path: `images/${opts.unitId || 'default'}`,
    public_url: publicUrl,
  });
  let finalUrl = publicUrl;
  if (conflict && !opts.regenerate) {
    const cached = await findAssetByHash(cfg.rest, hash);
    if (cached) { finalUrl = cached.public_url; }
  }
  // unit_media link (best-effort, mirrors old imageGen behavior)
  if (assetId && opts.unitId) {
    try {
      await fetch(`${cfg.rest.supabaseUrl}/rest/v1/unit_media`, {
        method: 'POST',
        headers: { apikey: cfg.rest.serviceKey, Authorization: `Bearer ${cfg.rest.serviceKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ unit_id: opts.unitId, asset_id: assetId, role: 'generated', order_index: 0 }),
      });
    } catch { /* non-fatal */ }
  }
  return { url: finalUrl, assetId: assetId || undefined };
}

// ── per-surface flows (used by generate-media's generate-illustrations) ──

export async function generateCover(sb: SupabaseClient, unitId: string, regenerate = false) {
  const ctx = await fetchUnitArtContext(sb, unitId);
  if (!ctx) throw new Error('Unit not found');
  const artDirection = await ensureArtDirection(sb, { id: unitId, title: ctx.title, topic: ctx.topic, artDirection: ctx.artDirection });
  const content = `cover illustration for the unit "${ctx.title}" about ${ctx.topic || ctx.title}`;
  const r = await generateIllustration({ sb, unitId, surface: 'cover', content, context: { ...ctx, artDirection }, regenerate });
  if (r.url && !r.error) await sb.from('units').update({ cover_image: r.url }).eq('id', unitId);
  return r;
}

export async function generatePortrait(sb: SupabaseClient, unitId: string, characterId: string, regenerate = false) {
  const { data: ch } = await sb.from('characters').select('name, look_prompt, reference_image_asset_id').eq('id', characterId).single();
  if (!ch) throw new Error('Character not found');
  if (ch.reference_image_asset_id && !regenerate) {
    const { data: a } = await sb.from('assets').select('public_url').eq('id', ch.reference_image_asset_id).maybeSingle();
    if (a?.public_url) return { url: a.public_url, cached: true };
  }
  const ctx = await fetchUnitArtContext(sb, unitId);
  if (!ctx) throw new Error('Unit not found');
  const look = String(ch.look_prompt || '').trim() || `a friendly child character named ${ch.name}`;
  const r = await generateIllustration({ sb, unitId, surface: 'portrait', content: `character portrait of ${ch.name}: ${look}`, context: ctx, regenerate: true });
  if (r.assetId) await sb.from('characters').update({ reference_image_asset_id: r.assetId }).eq('id', characterId);
  return r;
}

export async function generateStoryPageScene(sb: SupabaseClient, unitId: string, pageId: string, regenerate = false) {
  const { data: page } = await sb.from('story_pages').select('id, page_number, text, speaker, speaker_character_id, image_prompt, image_asset_id').eq('id', pageId).single();
  if (!page) throw new Error('Story page not found');
  if (page.image_asset_id && !regenerate) {
    const { data: a } = await sb.from('assets').select('public_url').eq('id', page.image_asset_id).maybeSingle();
    if (a?.public_url) return { url: a.public_url, cached: true };
  }
  const ctx = await fetchUnitArtContext(sb, unitId);
  if (!ctx) throw new Error('Unit not found');

  // Reference chain: portraits of characters appearing/speaking on this page.
  const refs: string[] = [];
  const { data: linked } = await sb.from('unit_characters').select('characters(id, name, reference_image_asset_id)').eq('unit_id', unitId);
  const chars: any[] = (linked || []).map((l: any) => l.characters).filter(Boolean);
  const speakerName = String(page.speaker || '').trim().toLowerCase();
  for (const c of chars) {
    const cname = String(c.name || '').toLowerCase();
    const isSpeaker = (page.speaker_character_id && c.id === page.speaker_character_id) || (speakerName && c.name?.toLowerCase() === speakerName);
    // Text-mention match is independent of speakerName (speaker is nullable):
    // a character named in the page text is a reference even on speaker-less
    // pages. The length guard keeps the degenerate `includes('') === true`
    // empty-name case from matching every character.
    const mentioned = cname.length > 1 && String(page.text || '').toLowerCase().includes(cname);
    if ((isSpeaker || mentioned) && c.reference_image_asset_id) {
      const { data: a } = await sb.from('assets').select('public_url').eq('id', c.reference_image_asset_id).maybeSingle();
      if (a?.public_url) refs.push(a.public_url);
    }
  }

  const content = String(page.image_prompt || '').trim() || `scene: ${String(page.text || '').slice(0, 300)}`;
  // Forward `regenerate` to bypass the prompt-hash dedup — without it a
  // "regenerate" whose prompt hash matches an existing asset returns the
  // cached image (regenerate only skipped the image_asset_id early-return).
  const r = await generateIllustration({ sb, unitId, surface: 'story_scene', content, context: ctx, inputReferences: refs.slice(0, 2), regenerate });
  if (r.assetId) await sb.from('story_pages').update({ image_asset_id: r.assetId }).eq('id', pageId);
  return r;
}

export const dicebearPlaceholder = DICEBEAR;
