// Shared TTS helper (Edge / Deno). Generates narration audio for the given
// text and persists the MP3 to the generated-media bucket, returning a public
// Supabase URL. Used by generate-media (on-demand + batch) — enrichment never
// awaits TTS (decoupled 2026-07-30).
//
// ── 2026-08-08 voice quality upgrade (revised 2026-08-30) ───────────────────
// TTS runs through a PROVIDER CHAIN (env-selectable, graceful fallback):
//   1. openrouter  — kokoro-82m via the OpenAI-compatible /audio/speech
//                    endpoint (bilingual: EN af_* + Mandarin zf_/zm_ voices,
//                    same AI_API_KEY as all other AI calls — region-safe).
//                    (Was qwen-audio-3.0-tts — its voice IDs are not exposed
//                    and every documented name 400s upstream; see config
//                    note below.)
//   2. elevenlabs  — eleven_flash_v2_5 (kept for character voice_ids and as
//                    fallback; NOT removed).
// Deterministic caching: the asset is keyed by prompt_hash =
// SHA-256("audio:{lang}|{normalized text}|{voice}|{model}") of the REQUESTED
// signature (primary provider config), so identical (text + voice + model +
// lang) always resolves to the same cached asset regardless of which provider
// in the chain ultimately served it. assets has a unique index on
// (prompt_hash, type) — merge-duplicates keeps concurrent inserts safe.
//
// Phase 1.1-5 (advisor §7.4): an optional voice override lets a recurring
// character sound consistent across units. For the elevenlabs provider this is
// a voice_id; for openrouter it is a named voice (e.g. "Cherry").

const DUMMY = '';

// ── ElevenLabs config (legacy default, kept as fallback + character voices) ─
const ELEVENLABS_DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';
// Was eleven_monolingual_v1 (English-only, lowest quality, slow). flash v2.5:
// ~75ms latency, multilingual. Overridable via TTS_MODEL_ID.
const ELEVENLABS_MODEL = Deno.env.get('TTS_MODEL_ID') || 'eleven_flash_v2_5';
const ELEVENLABS_TIMEOUT_MS = 30000;

// ── OpenRouter TTS config ────────────────────────────────────────────────────
// 2026-08-30: default switched qwen → kokoro. qwen/qwen-audio-3.0-tts-flash
// exists on OpenRouter but its upstream rejects every documented/plausible
// voice name ("Provider returned 400" — the valid voice IDs are not exposed
// by the models API; verified live 2026-08-30), while hexgrad/kokoro-82m was
// verified live end-to-end: bilingual (af_* / zf_* / zm_* voices), honors
// response_format:'mp3', and costs $0.62/M chars vs qwen's $15/M. To switch
// back once qwen's voice IDs are known (or to any other TTS model), set
// OPENROUTER_TTS_MODEL + OPENROUTER_TTS_VOICE[_EN/_ZH] in the dashboard —
// no code change needed (the canonical hash uses the resolved model, so the
// cache re-keys itself; the client fast path tolerates the mismatch by
// design — see services/speechResolver.ts).
const OPENROUTER_MODEL = Deno.env.get('OPENROUTER_TTS_MODEL') || 'hexgrad/kokoro-82m';
// Per-language default voices. Kokoro voices are language-tagged:
//   af_/am_ = American English (female/male), zf_/zm_ = Mandarin Chinese.
// Verified live 2026-08-30: af_heart (en), zf_xiaobei (zh), af_bella (en),
// zf_xiaoni / zm_yunjian (zh). An explicit OPENROUTER_TTS_VOICE overrides both.
const OPENROUTER_VOICE_EN = Deno.env.get('OPENROUTER_TTS_VOICE_EN') || 'af_heart';
const OPENROUTER_VOICE_ZH = Deno.env.get('OPENROUTER_TTS_VOICE_ZH') || 'zf_xiaobei';
const OPENROUTER_TIMEOUT_MS = 15000;

export type TtsProvider = 'openrouter' | 'elevenlabs';

export interface TtsOptions {
  /** 'en' | 'zh' | … — auto-detected from text when omitted (CJK → zh). */
  lang?: string;
  /** Explicit voice override (elevenlabs voice_id OR openrouter voice name). */
  voice?: string | null;
  /** Pre-computed canonical prompt_hash; computed here when omitted. */
  promptHash?: string | null;
  /** Reserved: speaker identity for future per-character voice mapping. */
  speaker?: string | null;
}

export interface TtsResult {
  url: string;
  error?: string;
  provider?: TtsProvider;
  prompt_hash?: string;
}

/** Naive script detection: any CJK ideograph → zh, else en. */
export function detectLang(text: string): 'zh' | 'en' {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text || '') ? 'zh' : 'en';
}

/** Provider chain from env. Default: openrouter → elevenlabs. */
export function ttsChain(): TtsProvider[] {
  const provider = (Deno.env.get('TTS_PROVIDER') || 'openrouter').trim().toLowerCase();
  const raw = Deno.env.get('TTS_FALLBACK_CHAIN') ||
    `${provider},${provider === 'openrouter' ? 'elevenlabs' : 'openrouter'}`;
  const chain = raw.split(',').map((s) => s.trim().toLowerCase())
    .filter((s): s is TtsProvider => s === 'openrouter' || s === 'elevenlabs');
  return chain.length > 0 ? chain : ['openrouter', 'elevenlabs'];
}

/** Resolve the OpenRouter voice for a language (explicit override wins). */
export function openRouterVoice(lang: string, explicit?: string | null): string {
  if (explicit) return explicit;
  return Deno.env.get('OPENROUTER_TTS_VOICE') || (lang === 'zh' ? OPENROUTER_VOICE_ZH : OPENROUTER_VOICE_EN);
}

/**
 * The REQUESTED signature (primary provider's resolved voice + model). The
 * canonical cache key is derived from this — stable no matter which provider
 * in the chain ultimately served the audio.
 */
export function primarySpeechSignature(lang: string, explicitVoice?: string | null): { voice: string; model: string } {
  if (ttsChain()[0] === 'elevenlabs') {
    return {
      voice: explicitVoice || Deno.env.get('ELEVENLABS_VOICE_ID') || ELEVENLABS_DEFAULT_VOICE,
      model: ELEVENLABS_MODEL,
    };
  }
  return { voice: openRouterVoice(lang, explicitVoice), model: OPENROUTER_MODEL };
}

/**
 * Canonical deterministic hash: same (text + voice + model + lang) → same
 * hash. MUST stay in sync with services/speechResolver.ts (client fast path).
 */
export async function canonicalSpeechHash(text: string, lang: string, voice: string, model: string): Promise<string> {
  const normalized = `audio:${(lang || 'en').toLowerCase()}|${(text || '').trim().toLowerCase()}|${voice}|${model}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── providers ────────────────────────────────────────────────────────────────

async function synthesizeOpenRouter(text: string, voice: string): Promise<{ buffer?: ArrayBuffer; error?: string }> {
  const apiKey = Deno.env.get('AI_API_KEY') || '';
  if (!apiKey) return { error: 'AI_API_KEY not configured' };
  try {
    const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Professor' },
      signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        input: text || 'Hello',
        voice,
        response_format: 'mp3',
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { error: `OpenRouter TTS failed: ${response.status} ${body.slice(0, 200)}` };
    }
    return { buffer: await response.arrayBuffer() };
  } catch (err: any) {
    return { error: err?.message || 'OpenRouter TTS error' };
  }
}

async function synthesizeElevenLabs(text: string, voiceId: string): Promise<{ buffer?: ArrayBuffer; error?: string }> {
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY') || '';
  if (!apiKey) return { error: 'ELEVENLABS_API_KEY not configured' };
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      signal: AbortSignal.timeout(ELEVENLABS_TIMEOUT_MS),
      body: JSON.stringify({
        text: text || 'Hello',
        model_id: ELEVENLABS_MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!response.ok) {
      // Include the body — ElevenLabs puts the real reason here (e.g.
      // invalid_api_key), and a bare status is how the 2026-08-29 broken-key
      // failure stayed undiagnosed for months.
      const body = await response.text().catch(() => '');
      const hint = body.includes('API key ID used as API key')
        ? ' (ELEVENLABS_API_KEY looks like a key ID — set the actual sk_… secret in the dashboard)'
        : '';
      return { error: `ElevenLabs failed: ${response.status} ${body.slice(0, 200)}${hint}` };
    }
    return { buffer: await response.arrayBuffer() };
  } catch (err: any) {
    return { error: err?.message || 'ElevenLabs error' };
  }
}

// ── storage + asset record ───────────────────────────────────────────────────

async function storeAudio(
  audioBuffer: ArrayBuffer,
  unitId: string,
  text: string,
  promptHash: string | null,
): Promise<{ url: string; error?: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  // Storage uploads need the legacy JWT (see serviceKey.ts) — the injected
  // new-style key is rejected by /storage/v1 with "Invalid Compact JWS".
  const { serviceRoleKey } = await import('./serviceKey.ts');
  const supabaseKey = serviceRoleKey();
  if (!supabaseUrl || !supabaseKey) return { url: DUMMY, error: 'Supabase not configured' };

  const uploadPath = `audio/${unitId || 'default'}/${Date.now()}.mp3`;
  const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/generated-media/${uploadPath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'audio/mpeg' },
    body: audioBuffer,
  });
  if (!uploadResponse.ok) {
    const detail = (await uploadResponse.text().catch(() => '')).slice(0, 150);
    return { url: DUMMY, error: `Storage upload failed (${uploadResponse.status}): ${detail}` };
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/generated-media/${uploadPath}`;
  // Record the audio as an asset (deduped by prompt_hash via the unique
  // (prompt_hash, type) index — merge-duplicates makes concurrent inserts
  // race-safe) + link it to the unit via unit_media. Best-effort: never fails
  // generation.
  try {
    const assetResp = await fetch(`${supabaseUrl}/rest/v1/assets`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation,resolution=merge-duplicates',
      },
      body: JSON.stringify({
        unit_id: unitId || null,
        type: 'audio',
        kind: 'generated',
        prompt: text?.slice(0, 200) || null,
        prompt_hash: promptHash || null,
        storage_path: uploadPath,
        public_url: publicUrl,
      }),
    });
    if (assetResp.ok) {
      const inserted = await assetResp.json();
      const assetId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
      if (assetId && unitId) {
        await fetch(`${supabaseUrl}/rest/v1/unit_media`, {
          method: 'POST',
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ unit_id: unitId, asset_id: assetId, role: 'audio', order_index: 0 }),
        });
      }
    } else {
      const errBody = await assetResp.json().catch(() => ({}));
      console.error('[tts] assets insert failed:', assetResp.status, (errBody as any)?.message || '');
    }
  } catch (assetErr: any) {
    console.error('[tts] asset/unit_media link error:', assetErr?.message || assetErr);
  }
  return { url: publicUrl };
}

// ── main entry ───────────────────────────────────────────────────────────────

/**
 * Generate + store speech for `text` through the provider chain.
 * Backward compatible: a plain string third argument is treated as a voice
 * override (legacy callers).
 */
export async function generateAndStoreAudio(
  text: string,
  unitId: string,
  voiceOrOpts?: string | null | TtsOptions,
): Promise<TtsResult> {
  const opts: TtsOptions = typeof voiceOrOpts === 'string' ? { voice: voiceOrOpts } : (voiceOrOpts || {});
  const lang = (opts.lang || detectLang(text)).toLowerCase();
  const signature = primarySpeechSignature(lang, opts.voice);
  const promptHash = opts.promptHash || await canonicalSpeechHash(text, lang, signature.voice, signature.model);

  const errors: string[] = [];
  for (const provider of ttsChain()) {
    const synth = provider === 'openrouter'
      ? await synthesizeOpenRouter(text, openRouterVoice(lang, opts.voice))
      : await synthesizeElevenLabs(text, opts.voice || Deno.env.get('ELEVENLABS_VOICE_ID') || ELEVENLABS_DEFAULT_VOICE);
    if (!synth.buffer) {
      errors.push(`${provider}: ${synth.error}`);
      continue;
    }
    const stored = await storeAudio(synth.buffer, unitId, text, promptHash);
    if (stored.url) return { url: stored.url, provider, prompt_hash: promptHash };
    errors.push(`store: ${stored.error}`);
  }
  return { url: DUMMY, error: errors.join(' | ') || 'No TTS providers configured', prompt_hash: promptHash };
}

/** Bounded-concurrency map (avoids provider rate limits on large batches). */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
