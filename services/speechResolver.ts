// =====================================================================
// speechResolver — the single on-demand TTS resolution seam the board
// games use (2026-08-08 voice quality upgrade).
//
// Contract:
//   resolveSpeech({ text|key, lang?, voice?, speaker?, unitId? })
//     → { url?, status: 'cached' | 'generating' | 'failed', promptHash? }
//
// Behavior:
//   1. Memory cache (canonical prompt_hash)      → 'cached' (instant)
//   2. assets table lookup by the same hash      → 'cached' (~fast)
//   3. generate-media `resolve-speech` edge call, raced against a
//      bounded budget (default 3s). In time → 'cached'; over budget →
//      'generating' immediately (the request keeps running in the
//      background and populates the caches for the next play).
//   4. Hard failure                              → 'failed'
//
// Callers must NEVER block a game turn on this: play the browser
// (window.speechSynthesis) fallback right away and swap in the real URL
// once cached. Deterministic caching: same (text + voice + model + lang)
// → same prompt_hash → same asset row (unique index on assets).
// =====================================================================

import { supabase } from './supabaseClient';
import { createClientLogger } from './logger';

const log = createClientLogger('speechResolver');

// Mirrors the edge defaults in supabase/functions/_shared/tts.ts. If the
// dashboard overrides those env vars the client fast path simply misses and
// the edge remains the authoritative deduper (it computes + returns the
// canonical prompt_hash on every response).
// 2026-08-30: synced to the edge's kokoro defaults (qwen TTS voices were
// rejected upstream; see _shared/tts.ts for the postmortem).
const DEFAULT_OPENROUTER_TTS_MODEL = 'hexgrad/kokoro-82m';
const DEFAULT_OPENROUTER_VOICE_EN = 'af_heart';
const DEFAULT_OPENROUTER_VOICE_ZH = 'zf_xiaobei';

export type SpeechStatus = 'cached' | 'generating' | 'failed';

export interface SpeechRequest {
  /** The text to speak (word/phrase or full example sentence). */
  text?: string;
  /** Alias for text (pool-item key style). */
  key?: string;
  /** 'en' | 'zh' | … — auto-detected from text when omitted. */
  lang?: string;
  /** Explicit voice override (named voice for OpenRouter / voice_id for ElevenLabs). */
  voice?: string;
  /** Reserved: speaker identity for future per-character voices. */
  speaker?: string;
  unitId?: string;
}

export interface SpeechResolution {
  url?: string;
  status: SpeechStatus;
  promptHash?: string;
  provider?: string;
}

export interface ResolveOptions {
  /** Max ms to wait for a URL before reporting 'generating' (default 3000). */
  budgetMs?: number;
}

/** Naive script detection: any CJK ideograph → zh, else en. (Mirrors edge.) */
export function detectLang(text: string): 'zh' | 'en' {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text || '') ? 'zh' : 'en';
}

function voiceFor(lang: string, explicit?: string): string {
  if (explicit) return explicit;
  return lang === 'zh' ? DEFAULT_OPENROUTER_VOICE_ZH : DEFAULT_OPENROUTER_VOICE_EN;
}

/**
 * Canonical deterministic hash — MUST match the edge formula
 * (`audio:{lang}|{normalized text}|{voice}|{model}`).
 */
export async function canonicalSpeechHash(text: string, lang: string, voice: string, model: string): Promise<string> {
  const normalized = `audio:${(lang || 'en').toLowerCase()}|${(text || '').trim().toLowerCase()}|${voice}|${model}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convenience: canonical hash with default voice/model/lang resolution —
 * shared by every client path (MediaService, games) so all lookups agree.
 */
export async function speechHashFor(text: string, lang?: string, voice?: string): Promise<{ hash: string; lang: string }> {
  const l = (lang || detectLang(text)).toLowerCase();
  return { hash: await canonicalSpeechHash(text, l, voiceFor(l, voice), DEFAULT_OPENROUTER_TTS_MODEL), lang: l };
}

const memoryCache = new Map<string, string>();
const inflight = new Map<string, Promise<SpeechResolution>>();

export async function resolveSpeech(req: SpeechRequest, opts: ResolveOptions = {}): Promise<SpeechResolution> {
  const text = (req.text || req.key || '').trim();
  if (!text) return { status: 'failed' };

  const lang = (req.lang || detectLang(text)).toLowerCase();
  const voice = voiceFor(lang, req.voice);
  const promptHash = await canonicalSpeechHash(text, lang, voice, DEFAULT_OPENROUTER_TTS_MODEL);

  const cachedUrl = memoryCache.get(promptHash);
  if (cachedUrl) return { url: cachedUrl, status: 'cached', promptHash };

  // Concurrent requests for the same speech share one resolution.
  const existing = inflight.get(promptHash);
  if (existing) return existing;

  const resolution = (async (): Promise<SpeechResolution> => {
    // 2. assets fast path (same query shape MediaService uses).
    try {
      const { data } = await supabase
        .from('assets')
        .select('public_url')
        .eq('type', 'audio')
        .eq('prompt_hash', promptHash)
        .limit(1);
      const hit = data && data.length > 0 ? (data[0] as any)?.public_url : null;
      if (hit) {
        memoryCache.set(promptHash, hit);
        return { url: hit, status: 'cached', promptHash };
      }
    } catch (err: any) {
      log.warn('speech_assets_lookup_failed', { error: err?.message });
    }

    // 3. Edge resolve, raced against the budget.
    const budgetMs = opts.budgetMs ?? 3000;
    const invokePromise = supabase.functions
      .invoke('generate-media', {
        body: {
          action: 'resolve-speech',
          text,
          lang,
          voice: req.voice,
          unitId: req.unitId,
          prompt_hash: promptHash,
        },
      })
      .then(({ data, error }): SpeechResolution => {
        if (error || !data) {
          log.warn('speech_resolve_error', { error: (error as any)?.message });
          return { status: 'failed', promptHash };
        }
        if (data.url) {
          const serverHash = data.prompt_hash || promptHash;
          memoryCache.set(serverHash, data.url);
          return { url: data.url, status: 'cached', promptHash: serverHash, provider: data.provider };
        }
        return { status: 'failed', promptHash };
      })
      .catch((err: any): SpeechResolution => {
        log.warn('speech_resolve_exception', { error: err?.message || String(err) });
        return { status: 'failed', promptHash };
      });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<SpeechResolution>((resolve) => {
      timer = setTimeout(() => resolve({ status: 'generating', promptHash }), budgetMs);
    });
    const winner = await Promise.race([invokePromise, timeout]);
    if (timer) clearTimeout(timer);

    if (winner.status === 'generating') {
      // Keep the request running in the background so the NEXT play is cached.
      invokePromise.catch(() => { /* already logged inside */ });
    }
    return winner;
  })();

  inflight.set(promptHash, resolution);
  try {
    return await resolution;
  } finally {
    inflight.delete(promptHash);
  }
}

/**
 * Fire-and-forget round preload: resolve a batch of speech refs server-side
 * (bounded concurrency + 80s budget guard there) so play-time taps hit the
 * cache. Never throws.
 */
export async function preloadSpeechBatch(
  unitId: string,
  items: { key: string; text: string; lang?: string; voice?: string }[],
): Promise<void> {
  if (!items.length) return;
  try {
    const { data, error } = await supabase.functions.invoke('generate-media', {
      body: { action: 'resolve-speech-batch', unitId, items },
    });
    if (error) {
      log.warn('speech_preload_error', { error: error.message });
      return;
    }
    const hashes: Record<string, string> = data?.hashes || {};
    const results: Record<string, string> = data?.results || {};
    for (const [key, url] of Object.entries(results)) {
      const hash = hashes[key];
      if (hash && url) memoryCache.set(hash, url);
    }
  } catch (err: any) {
    log.warn('speech_preload_exception', { error: err?.message || String(err) });
  }
}

/** Test/maintenance seam. */
export function clearSpeechCache(): void {
  memoryCache.clear();
}
