import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { assertUnitOwnership } from '../_shared/assertOwnership.ts';
import { generateAndStoreImage } from '../_shared/imageGen.ts';
import { generateCover, generatePortrait, generateStoryPageScene, generateIllustration, fetchUnitArtContext } from '../_shared/illustration.ts';
import { serviceRoleKey } from '../_shared/serviceKey.ts';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { composeAvatar, generateAvatarArt } from '../_shared/avatarCompose.ts';
import {
  canonicalSpeechHash,
  detectLang,
  generateAndStoreAudio,
  mapWithConcurrency,
  primarySpeechSignature,
} from '../_shared/tts.ts';
import {
  ageBandFromGrade,
  ageBandFromManifest,
  oembedValidate,
  parseYouTubeVideoId,
  resolveMediaForFlow,
  syncClassPlanFlows,
  upsertMediaAsset,
} from '../_shared/mediaResolver.ts';

// --- single-item generators (shared by their action and by `batch`) ---

async function generateImage(unitId: string, prompt: string): Promise<{ url: string; provider?: string; error?: string }> {
  return generateAndStoreImage(prompt, unitId);
}

async function generateAudio(
  unitId: string,
  text: string,
  lang?: string,
  voice?: string,
  promptHash?: string,
): Promise<{ url: string; error?: string; provider?: string; prompt_hash?: string }> {
  return generateAndStoreAudio(text, unitId, { lang, voice, promptHash });
}

// --- on-demand speech resolution (reference-based audio for the games) ---

interface ResolveSpeechParams {
  text: string;
  lang?: string;
  voice?: string;
  unitId?: string;
  promptHash?: string;
}

interface ResolveSpeechResult {
  url: string;
  prompt_hash: string;
  status: 'cached' | 'generated' | 'failed';
  provider?: string;
  error?: string;
}

/**
 * Deterministic on-demand resolver: fast path reads the assets cache by the
 * canonical prompt_hash; on miss, generates via the provider chain and stores.
 * Same (text + voice + model + lang) always resolves to the same asset.
 */
async function resolveSpeechCore(params: ResolveSpeechParams): Promise<ResolveSpeechResult> {
  const text = String(params.text || '').trim();
  if (!text) return { url: '', prompt_hash: '', status: 'failed', error: 'text is required' };

  const lang = (params.lang || detectLang(text)).toLowerCase();
  const signature = primarySpeechSignature(lang, params.voice);
  const promptHash = params.promptHash || await canonicalSpeechHash(text, lang, signature.voice, signature.model);

  // Fast path: cached asset lookup (~ms; never blocks on generation).
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/assets?type=eq.audio&prompt_hash=eq.${encodeURIComponent(promptHash)}&select=public_url&limit=1`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }, signal: AbortSignal.timeout(5000) },
    );
    if (resp.ok) {
      const rows = await resp.json();
      const url = Array.isArray(rows) ? rows[0]?.public_url : null;
      if (url) return { url, prompt_hash: promptHash, status: 'cached' };
    }
  } catch (_lookupErr) {
    // Cache read failed — fall through to generation (still correct).
  }

  const gen = await generateAndStoreAudio(text, params.unitId || '', { lang, voice: params.voice, promptHash });
  if (gen.url) return { url: gen.url, prompt_hash: promptHash, status: 'generated', provider: gen.provider };
  return { url: '', prompt_hash: promptHash, status: 'failed', error: gen.error };
}

// Batch budget guard: keep total wall-clock well under the ~150s edge limit.
// In-flight provider calls are themselves bounded (15s openrouter / 30s
// elevenlabs), so 80s of starts + one trailing call stays safely inside.
const RESOLVE_BATCH_BUDGET_MS = 80000;
const RESOLVE_BATCH_CONCURRENCY = 5;

serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'generate-media',
    requireAuth: true,
    // 2026-08-08: raised 20→40 — per-item resolve-speech calls during live
    // games plus batch preloads share this budget.
    rateLimit: { maxRequests: 40, windowMs: 60 * 1000 },
    validationRules: [
      { field: 'action', required: true, type: 'string' },
    ],
  }, async (body, auth) => {
    const { action, unitId, prompt, text, query, images, audios, items } = body;

    // FIXPLAN H1 (audit P0-3): every action in this function can trigger paid
    // AI generation (or write assets) but none of them checked unit ownership.
    // Gate centrally, before any branch runs:
    //   - unitId present → caller must own the unit (assertUnitOwnership;
    //     admin bypasses). Applies to generate-image, generate-audio,
    //     resolve-speech, resolve-speech-batch, batch.
    //   - no unitId → staff-only (teacher/admin/manager). Covers youtube-search
    //     and any unitId-less call; crop-book-image additionally keeps its own
    //     page-level teacher_id check below.
    const role = auth?.role;
    const isStaff = role === 'teacher' || role === 'admin' || role === 'manager';
    if (unitId) {
      const adminSb = createClient(
        Deno.env.get('SUPABASE_URL') || '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
        { auth: { persistSession: false } },
      );
      const { data: unit } = await adminSb.from('units').select('teacher_id').eq('id', unitId).single();
      const ownership = assertUnitOwnership(unit?.teacher_id ?? null, { callerId: auth?.userId, callerRole: role });
      if (!ownership.ok) return { error: ownership.reason || 'Not authorized' };
    } else if (!isStaff && action !== 'compose-avatar') {
      // compose-avatar is the one student self-service action: it operates
      // strictly on auth.uid()'s own profile (verified inside avatarCompose).
      return { error: 'Teachers only' };
    }

    switch (action) {
      case 'generate-image': {
        // v2: surface-aware; server composes style + does dedup + records the asset.
        const surface = ['vocab', 'cover', 'story_scene', 'portrait'].includes(body.surface) ? body.surface : 'vocab';
        const sb = createClient(Deno.env.get('SUPABASE_URL') || '', serviceRoleKey());
        const ctx = await fetchUnitArtContext(sb, unitId);
        if (surface !== 'vocab' || body.regenerate) {
          // ownership check for non-vocab surfaces (vocab is world-deduped by prompt).
          // Deny-unless-claimed: ownerless legacy units (teacher_id NULL) are
          // admin-only — otherwise ANY authenticated user could spend money on them.
          const ownerOk = ctx?.teacherId
            ? (ctx.teacherId === auth?.userId || auth?.role === 'admin')
            : (auth?.role === 'admin');
          if (!ownerOk) throw new Error('You do not own this unit');
        }
        return generateIllustration({
          sb, unitId: unitId || 'default', surface, content: prompt || 'Educational item',
          context: ctx || { title: 'Unit', topic: null, artDirection: null },
          regenerate: Boolean(body.regenerate),
        });
      }

      case 'generate-audio':
        return generateAudio(unitId, text, body.lang, body.voice, body.promptHash || body.prompt_hash);

      // On-demand cached speech resolution (the contract the games use):
      // { text, lang?, voice?, unitId?, prompt_hash? } →
      // { url, prompt_hash, status: 'cached'|'generated'|'failed', provider? }
      case 'resolve-speech':
        return resolveSpeechCore({ text, lang: body.lang, voice: body.voice, unitId, promptHash: body.promptHash || body.prompt_hash });

      // Round preloading: resolve many speech refs at once, bounded.
      // items: [{ key, text, lang?, voice? }] → { results: {key: url}, hashes: {key: hash} }
      case 'resolve-speech-batch': {
        const list: any[] = Array.isArray(items) ? items : (Array.isArray(audios) ? audios : []);
        const results: Record<string, string> = {};
        const hashes: Record<string, string> = {};
        const started = Date.now();
        await mapWithConcurrency(list, RESOLVE_BATCH_CONCURRENCY, async (item: any) => {
          const key = String(item?.key || item?.text || '');
          const itemText = String(item?.text || '').trim();
          if (!key || !itemText) return;
          if (Date.now() - started > RESOLVE_BATCH_BUDGET_MS) return; // time-budget guard: skip remaining
          const r = await resolveSpeechCore({ text: itemText, lang: item?.lang, voice: item?.voice, unitId });
          if (r.prompt_hash) hashes[key] = r.prompt_hash;
          if (r.url) results[key] = r.url;
        });
        return { results, hashes };
      }

      case 'batch': {
        // Phase 4 (P1-6): generate in-branch, in parallel (capped) instead of
        // sequentially self-fetching this endpoint (which re-ran auth + rate
        // limit per item).
        const results: { images: Record<string, string>; audios: Record<string, string> } = { images: {}, audios: {} };

        if (Array.isArray(images)) {
          const imgOut = await mapWithConcurrency(images, 4, (img) => generateImage(unitId, img.prompt));
          images.forEach((img: any, i: number) => {
            if (imgOut[i]?.url) results.images[img.key] = imgOut[i].url;
          });
        }

        if (Array.isArray(audios)) {
          const audOut = await mapWithConcurrency(audios, 3, (aud) => generateAudio(unitId, aud.text, aud.lang, aud.voice, aud.promptHash));
          audios.forEach((aud: any, i: number) => {
            if (audOut[i]?.url) results.audios[aud.key] = audOut[i].url;
          });
        }

        return { results };
      }

      case 'youtube-search': {
        // YouTube Data API is region-blocked. Return a usable search URL so the
        // caller can open the recommended song/video on YouTube directly.
        const searchQuery = query || 'English lesson kids';
        return {
          searchQuery,
          searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`,
          message: 'YouTube Data API is unavailable in your region. Use searchUrl to open the result directly.',
        };
      }

      // Media resolution (design 2026-09-04 §4.2, on-demand entry): resolve
      // a unit's unresolved MEDIA_PLAYER blocks via the catalog-first ladder
      // and persist the result into units.flow. Heals already-generated units
      // WITHOUT re-orchestration. Ownership is gated centrally above
      // (unitId present → caller must own the unit).
      //   { action:'resolve-media', unitId, classId?, dryRun?, skipAi? }
      case 'resolve-media': {
        const sb = createClient(Deno.env.get('SUPABASE_URL') || '', serviceRoleKey(), { auth: { persistSession: false } });

        const { data: unit, error: unitErr } = await sb
          .from('units')
          .select('id, teacher_id, title, topic, manifest, flow')
          .eq('id', unitId)
          .single();
        if (unitErr || !unit) return { error: `Unit not found: ${unitErr?.message || unitId}` };

        // Age context: the live class's teacher-declared grade when a class is
        // bound (and owned by the caller), else the manifest's CEFR guess.
        let ageBand = ageBandFromManifest(unit.manifest);
        let ageSource = ageBand ? 'manifest' : 'none';
        const classId = String(body.classId || '');
        if (classId) {
          const { data: cls } = await sb
            .from('classes')
            .select('grade_level, teacher_id')
            .eq('id', classId)
            .maybeSingle();
          const owned = cls && (cls.teacher_id === auth?.userId || auth?.role === 'admin');
          const band = owned ? ageBandFromGrade(cls?.grade_level) : null;
          if (band) { ageBand = band; ageSource = 'class'; }
        }

        const flow = Array.isArray(unit.flow) ? unit.flow : [];
        const before = flow.filter((b: any) => b?.type === 'MEDIA_PLAYER' && !b?.data?.videoUrl && !b?.data?.audioUrl).length;
        if (before === 0) return { success: true, resolvedCount: 0, message: 'No unresolved MEDIA_PLAYER blocks.', ageBand, ageSource };

        const vocab = Array.isArray(unit.manifest?.vocabulary)
          ? unit.manifest.vocabulary.map((v: any) => v?.word).filter(Boolean).slice(0, 20)
          : [];
        const suggestions = [
          ...(Array.isArray(unit.manifest?.song_suggestions) ? unit.manifest.song_suggestions : []),
          ...(Array.isArray(unit.manifest?.video_suggestions) ? unit.manifest.video_suggestions : []),
        ];

        // Hard budget: the ladder must never approach the edge wall-clock limit.
        const deadlineMs = Date.now() + 45000;
        const { resolved, rungs } = await resolveMediaForFlow(sb, flow, {
          unitId: unit.id,
          teacherId: unit.teacher_id || null,
          topic: unit.topic || unit.manifest?.topic || null,
          vocab,
          ageBand,
          suggestions,
          deadlineMs,
        });

        let persisted = 0;
        let plansSynced = 0;
        if (!body.dryRun && resolved > 0) {
          const { error: updErr } = await sb.from('units').update({ flow }).eq('id', unitId);
          if (updErr) return { error: `Resolution succeeded but the flow save failed: ${updErr.message}`, resolvedCount: resolved, rungs };
          persisted = resolved;
          // The live session may run from a class plan — heal those flows too.
          try {
            const resolvedBlocks = flow
              .filter((b: any) => b?.type === 'MEDIA_PLAYER' && b?.data?.videoUrl)
              .map((b: any) => ({
                searchQuery: b.data.search_query || null,
                title: b.data.title || null,
                data: (({ videoUrl, videoTitle, videoChannel, videoThumbnailUrl, resolvedVia, resolvedAt, ageBand }) =>
                  ({ videoUrl, videoTitle, videoChannel, videoThumbnailUrl, resolvedVia, resolvedAt, ageBand }))(b.data),
              }));
            plansSynced = await syncClassPlanFlows(sb, unitId, resolvedBlocks);
          } catch { /* best-effort: units.flow is already saved */ }
        }

        return {
          success: true,
          unresolvedBefore: before,
          resolvedCount: resolved,
          persisted,
          plansSynced,
          dryRun: Boolean(body.dryRun),
          rungs,
          ageBand,
          ageSource,
        };
      }

      // Teacher override (design §4.4 "teacher supremacy"): apply an explicit
      // video URL to the unit's unresolved MEDIA_PLAYER block. Server-side
      // oEmbed validation blocks typos/hallucinated ids; patches BOTH
      // units.flow and the unit's class_plans.flow copies; records the pick as
      // a reusable asset (source 'teacher' — the flywheel's strongest signal).
      //   { action:'apply-media', unitId, url, title?, blockSearchQuery? }
      case 'apply-media': {
        const sb = createClient(Deno.env.get('SUPABASE_URL') || '', serviceRoleKey(), { auth: { persistSession: false } });

        const videoId = parseYouTubeVideoId(String(body.url || ''));
        if (!videoId) return { error: 'That does not look like a YouTube video URL.' };
        const oe = await oembedValidate(videoId);
        if (!oe.ok || !oe.title) {
          return { error: 'Video not found on YouTube — it may be private, deleted, or mis-pasted.' };
        }

        const { data: unit, error: unitErr } = await sb
          .from('units')
          .select('id, teacher_id, title, flow')
          .eq('id', unitId)
          .single();
        if (unitErr || !unit) return { error: `Unit not found: ${unitErr?.message || unitId}` };

        const flow = Array.isArray(unit.flow) ? unit.flow : [];
        const wantedQuery = body.blockSearchQuery ? String(body.blockSearchQuery).trim().toLowerCase() : null;
        const targets = flow.filter((b: any) => b?.type === 'MEDIA_PLAYER' && !b?.data?.videoUrl && !b?.data?.audioUrl);
        const target = (wantedQuery
          ? targets.find((b: any) => String(b.data?.search_query || '').trim().toLowerCase() === wantedQuery)
          : null) ?? targets[0];
        if (!target) return { error: 'No unresolved media step found — it may already have a video.' };

        const merged = {
          videoUrl: oe.url,
          videoTitle: oe.title,
          videoChannel: oe.channel || '',
          ...(oe.thumbnailUrl ? { videoThumbnailUrl: oe.thumbnailUrl } : {}),
          resolvedVia: 'teacher',
          resolvedAt: new Date().toISOString(),
        };
        target.data = { ...(target.data || {}), ...merged };

        const { error: updErr } = await sb.from('units').update({ flow }).eq('id', unitId);
        if (updErr) return { error: `Save failed: ${updErr.message}` };

        let plansSynced = 0;
        try {
          plansSynced = await syncClassPlanFlows(sb, unitId, [{
            searchQuery: target.data.search_query || null,
            title: target.data.title || null,
            data: merged,
          }]);
        } catch { /* best-effort */ }

        const assetId = await upsertMediaAsset(sb, {
          videoId,
          url: oe.url,
          title: oe.title,
          channel: oe.channel,
          thumbnailUrl: oe.thumbnailUrl,
        }, {
          unitId: unit.id,
          role: target.data.kind === 'video' ? 'video' : 'song',
          teacherId: unit.teacher_id || null,
          source: 'teacher',
        });

        return { success: true, videoUrl: oe.url, videoTitle: oe.title, videoChannel: oe.channel, assetId, plansSynced };
      }

      case 'crop-book-image': {
        // FIXPLAN_F P3.2 — the geometry layer's cropper. Deterministic crop
        // of a stored page image by normalized bbox, written to the
        // materials bucket as an assets row (kind 'book_extract') with full
        // provenance (page → structure → bbox → pool). Crops below the
        // LiveBoard-zoom floor are flagged, never written.
        //   { pageId, structureId?, bbox: [x,y,w,h], pool, paddingPx? }
        const pageId = String(body.pageId || '');
        const structureId = body.structureId ? String(body.structureId) : null;
        const pool = String(body.pool || 'snapshot');
        const bboxRaw = body.bbox;
        if (!pageId || !Array.isArray(bboxRaw) || bboxRaw.length !== 4 || !bboxRaw.every((n: any) => typeof n === 'number' && Number.isFinite(n))) {
          throw new Error('crop-book-image requires pageId and bbox [x,y,w,h] (normalized)');
        }
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const serviceKey = serviceRoleKey();
        if (!supabaseUrl || !serviceKey) throw new Error('Service credentials not configured');
        const sb = createClient(supabaseUrl, serviceKey);

        const { data: page, error: pageErr } = await sb
          .from('book_pages')
          .select('id, unit_id, book_id, teacher_id, public_url, width, height')
          .eq('id', pageId).single();
        if (pageErr || !page) throw new Error('Page not found');
        if (page.teacher_id && page.teacher_id !== auth?.userId && auth?.role !== 'admin') {
          throw new Error('You do not own this page');
        }

        // Deterministic dedupe key — identical (page, structure, box, pool)
        // crops resolve to the same asset.
        const key = `crop:${pageId}:${structureId || 'manual'}:${bboxRaw.map((n: number) => n.toFixed(4)).join(',')}:${pool}`;
        const encoder = new TextEncoder();
        const hashBytes = await crypto.subtle.digest('SHA-256', encoder.encode(key));
        const promptHash = [...new Uint8Array(hashBytes)].map(b => b.toString(16).padStart(2, '0')).join('');
        const { data: cached } = await sb.from('assets').select('id, public_url').eq('prompt_hash', promptHash).eq('type', 'image').limit(1);
        if (cached && cached.length > 0 && cached[0].public_url) {
          return { url: cached[0].public_url, asset_id: cached[0].id, pool, cached: true };
        }

        const imgResp = await fetch(page.public_url, { signal: AbortSignal.timeout(20000) });
        if (!imgResp.ok) throw new Error(`Could not fetch the page image (${imgResp.status})`);
        const image = await Image.decode(new Uint8Array(await imgResp.arrayBuffer()));

        const [nx, ny, nw, nh] = bboxRaw as number[];
        const pad = typeof body.paddingPx === 'number' ? body.paddingPx : Math.round(Math.max(image.width, image.height) * 0.02);
        let x = Math.round(nx * image.width) - pad;
        let y = Math.round(ny * image.height) - pad;
        let w = Math.round(nw * image.width) + pad * 2;
        let h = Math.round(nh * image.height) + pad * 2;
        x = Math.max(0, x); y = Math.max(0, y);
        w = Math.min(image.width - x, w); h = Math.min(image.height - y, h);
        if (w < 200 || h < 200) {
          return { flagged: 'low_resolution', width: w, height: h, message: 'Crop is below the 200px usability floor; consider AI generation for this item.' };
        }

        const cropped = image.crop(x, y, w, h);
        const jpeg = await cropped.encodeJPEG(85);
        const storagePath = `crops/${pageId}/${pool}-${structureId || 'manual'}-${Date.now()}.jpg`;
        const { error: upErr } = await sb.storage.from('materials').upload(storagePath, new Uint8Array(jpeg), { contentType: 'image/jpeg' });
        if (upErr) throw new Error(`Crop upload failed: ${upErr.message}`);
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
          metadata: { page_id: pageId, structure_id: structureId, bbox: bboxRaw, pool, crop: { x, y, w, h } },
        }).select('id').single();
        if (assetErr) throw new Error(`Asset insert failed: ${assetErr.message}`);

        if (page.unit_id) {
          await sb.from('unit_media').upsert(
            { unit_id: page.unit_id, asset_id: assetRow.id, role: pool },
            { onConflict: 'unit_id,asset_id,role' },
          ).then(() => undefined, () => undefined);
        }

        return { url: urlData.publicUrl, asset_id: assetRow.id, pool, width: cropped.width, height: cropped.height };
      }

      // Illustration v2 per-surface pipeline (spec 2026-08-28). One surface per
      // call — a full unit pass (~15-18 images) cannot fit the ~150s edge limit;
      // sequencing lives in the client orchestrator + backfill script.
      case 'generate-illustrations': {
        const surface = String(body.surface || '');
        const sb = createClient(Deno.env.get('SUPABASE_URL') || '', serviceRoleKey());
        if (!unitId) throw new Error('unitId is required');
        const ctx = await fetchUnitArtContext(sb, unitId);
        if (!ctx) throw new Error('Unit not found');
        // Deny-unless-claimed: ownerless legacy units (teacher_id NULL) are
        // admin-only — otherwise ANY authenticated user could spend money on them.
        const ownerOk = ctx.teacherId
          ? (ctx.teacherId === auth?.userId || auth?.role === 'admin')
          : (auth?.role === 'admin');
        if (!ownerOk) throw new Error('You do not own this unit');
        const regenerate = Boolean(body.regenerate);
        if (surface === 'cover') return generateCover(sb, unitId, regenerate);
        if (surface === 'portrait') {
          if (!body.characterId) throw new Error('characterId is required for portrait');
          // portrait must be a character linked to this unit (ownership proxy)
          const { data: link } = await sb.from('unit_characters').select('character_id').eq('unit_id', unitId).eq('character_id', body.characterId).maybeSingle();
          if (!link) throw new Error('Character is not linked to this unit');
          return generatePortrait(sb, unitId, String(body.characterId), regenerate);
        }
        if (surface === 'story_page') {
          if (!body.pageId) throw new Error('pageId is required for story_page');
          const { data: pg } = await sb.from('story_pages').select('unit_id').eq('id', body.pageId).maybeSingle();
          if (!pg || pg.unit_id !== unitId) throw new Error('Story page not in this unit');
          return generateStoryPageScene(sb, unitId, String(body.pageId), regenerate);
        }
        throw new Error(`Unknown surface: ${surface}. Valid: cover, portrait, story_page`);
      }

      case 'compose-avatar': {
        // Avatar v2: flatten the caller's OWN persisted config into a cached
        // multi-res render and write profiles.avatar_url (spec 2026-09-03).
        return await composeAvatar(auth?.userId || '');
      }

      case 'avatar-art-generate': {
        // Avatar v2 art pipeline (staff only — gate above). Generates base
        // masters / item candidates via OpenRouter; curation happens offline.
        return await generateAvatarArt({
          kind: body.kind || 'misc',
          id: String(body.id || ''),
          prompt: String(body.prompt || ''),
          references: Array.isArray(body.references) ? body.references : undefined,
          outPath: body.outPath || undefined,
          aspectRatio: body.aspectRatio || '1:1',
          seed: typeof body.seed === 'number' ? body.seed : undefined,
        });
      }

      default:
        throw new Error(`Unknown action: ${action}. Valid actions: generate-image, generate-audio, resolve-speech, resolve-speech-batch, batch, youtube-search, crop-book-image, generate-illustrations, compose-avatar, avatar-art-generate`);
    }
  });
});
