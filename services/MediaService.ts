import { supabase } from './supabaseClient';
import { createClientLogger } from './logger';

const log = createClientLogger('MediaService');

interface MediaCache {
  images: Map<string, string>;
  audios: Map<string, string>;
}

const cache: MediaCache = {
  images: new Map(),
  audios: new Map(),
};

const preloadQueue: Set<string> = new Set();
let isPreloading = false;

/**
 * Direct Pollinations image URL (region-safe, no key). Mirrors the edge
 * provider's prompt format. Used as a reliable fallback when the generate-media
 * edge function fails/times out — the browser loads the image directly from
 * Pollinations (now CSP-allow-listed), which caches server-side after first gen.
 */
export function pollinationsImageUrl(prompt: string, size = 768): string {
  const enc = encodeURIComponent(`children's educational illustration: ${prompt}. simple, colorful, flat vector style, kids 6-12, no text`);
  return `https://image.pollinations.ai/prompt/${enc}?width=${size}&height=${size}&nologo=true&model=flux`;
}

async function hashPrompt(prompt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(prompt.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function callGenerateMedia(payload: any): Promise<any> {
  const { data, error } = await supabase.functions.invoke('generate-media', {
    body: payload,
  });

  if (error) {
    log.warn('generate_media_error', { error: error.message });
    return null;
  }

  return data;
}

export const MediaService = {
  async getVocabImage(unitId: string, word: string, contextSentence?: string): Promise<string> {
    const cacheKey = `${unitId}:${word}`;
    if (cache.images.has(cacheKey)) return cache.images.get(cacheKey)!;

    const prompt = contextSentence
      ? `Illustration for the word "${word}" in context: "${contextSentence}"`
      : `Illustration of the word "${word}"`;
    const promptHash = await hashPrompt(prompt);

    const { data: globalExisting } = await supabase
      .from('assets')
      .select('public_url')
      .eq('type', 'image')
      .eq('prompt_hash', promptHash)
      .limit(1);

    if (globalExisting && globalExisting.length > 0 && globalExisting[0].public_url) {
      cache.images.set(cacheKey, globalExisting[0].public_url);
      return globalExisting[0].public_url;
    }

    const result = await callGenerateMedia({
      action: 'generate-image',
      unitId,
      prompt,
    });

    let url = result?.url || '';
    // Fallback: if the edge function failed/timed out (no URL), serve the image
    // directly from Pollinations (CSP-allowed). Reliable + cached after first load.
    if (!url) url = pollinationsImageUrl(prompt);
    cache.images.set(cacheKey, url);
    supabase.from('assets').insert({
      unit_id: unitId,
      type: 'image',
      prompt: word,
      prompt_hash: promptHash,
      storage_path: 'external',
      public_url: url
    }).then(({ error }) => error && log.warn('asset_insert_error', { error: error.message } as any));
    return url;
  },

  async getVocabAudio(unitId: string, word: string, contextSentence?: string): Promise<string> {
    const cacheKey = `${unitId}:audio:${word}`;
    if (cache.audios.has(cacheKey)) return cache.audios.get(cacheKey)!;

    const text = contextSentence || word;
    const promptHash = await hashPrompt(`audio:${text}`);

    const { data: globalExisting } = await supabase
      .from('assets')
      .select('public_url')
      .eq('type', 'audio')
      .eq('prompt_hash', promptHash)
      .limit(1);

    if (globalExisting && globalExisting.length > 0 && globalExisting[0].public_url) {
      cache.audios.set(cacheKey, globalExisting[0].public_url);
      return globalExisting[0].public_url;
    }

    const result = await callGenerateMedia({
      action: 'generate-audio',
      unitId,
      text,
    });

    const url = result?.url || '';
    if (url) {
      cache.audios.set(cacheKey, url);
      supabase.from('assets').insert({
        unit_id: unitId,
        type: 'audio',
        prompt: word,
        prompt_hash: promptHash,
        storage_path: 'external',
        public_url: url
      }).then(({ error }) => error && log.warn('asset_insert_error', { error: error.message } as any));
    }
    return url;
  },

  async generateBatch(
    unitId: string,
    items: { key: string; imagePrompt?: string; audioText?: string }[]
  ): Promise<{ images: Record<string, string>; audios: Record<string, string> }> {
    const images = items.filter(i => i.imagePrompt).map(i => ({ key: i.key, prompt: i.imagePrompt }));
    const audios = items.filter(i => i.audioText).map(i => ({ key: i.key, text: i.audioText }));

    if (images.length === 0 && audios.length === 0) {
      return { images: {}, audios: {} };
    }

    log.info('batch_generate', { metadata: { unitId, imageCount: images.length, audioCount: audios.length } });

    const result = await callGenerateMedia({
      action: 'batch',
      unitId,
      images: images.length > 0 ? images : undefined,
      audios: audios.length > 0 ? audios : undefined,
    });

    const results = result?.results || { images: {}, audios: {} };

    for (const [key, url] of Object.entries(results.images || {})) {
      if (url) cache.images.set(`${unitId}:${key}`, url as string);
    }

    for (const [key, url] of Object.entries(results.audios || {})) {
      if (url) cache.audios.set(`${unitId}:audio:${key}`, url as string);
    }

    return results;
  },

  async preloadUnitAssets(unitId: string, vocabulary: { word: string; context_sentence?: string }[]): Promise<void> {
    const key = `${unitId}:preload`;
    if (preloadQueue.has(key)) return;
    preloadQueue.add(key);

    if (isPreloading) return;
    isPreloading = true;

    try {
      const items = vocabulary.map(v => ({
        key: v.word,
        imagePrompt: `Illustration of "${v.word}" for children's English lesson`,
        audioText: v.context_sentence || v.word,
      }));

      await MediaService.generateBatch(unitId, items);
      log.info('preload_complete', { metadata: { unitId, count: items.length } });
    } catch (err: any) {
      log.warn('preload_failed', { error: err.message });
    } finally {
      isPreloading = false;
      preloadQueue.delete(key);
    }
  },

  getCachedImage(unitId: string, word: string): string | undefined {
    return cache.images.get(`${unitId}:${word}`);
  },

  getCachedAudio(unitId: string, word: string): string | undefined {
    return cache.audios.get(`${unitId}:audio:${word}`);
  },

  clearCache(): void {
    cache.images.clear();
    cache.audios.clear();
    preloadQueue.clear();
  },
};
