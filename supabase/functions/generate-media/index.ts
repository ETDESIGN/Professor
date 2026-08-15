import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { generateAndStoreImage } from '../_shared/imageGen.ts';
import {
  canonicalSpeechHash,
  detectLang,
  generateAndStoreAudio,
  mapWithConcurrency,
  primarySpeechSignature,
} from '../_shared/tts.ts';

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
  }, async (body, _auth) => {
    const { action, unitId, prompt, text, query, images, audios, items } = body;

    switch (action) {
      case 'generate-image':
        return generateImage(unitId, prompt);

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

      default:
        throw new Error(`Unknown action: ${action}. Valid actions: generate-image, generate-audio, resolve-speech, resolve-speech-batch, batch, youtube-search`);
    }
  });
});
