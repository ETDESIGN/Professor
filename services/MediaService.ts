import { supabase } from './supabaseClient';
import { speechHashFor } from './speechResolver';
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

    // Illustration v2: the edge function (surface-aware) owns server-side
    // dedup and asset recording — no client-side hash/lookup/insert here.
    const result = await callGenerateMedia({
      action: 'generate-image',
      unitId,
      prompt,
      surface: 'vocab',
    });
    const url = result?.url || '';
    if (url && !url.includes('dicebear')) cache.images.set(cacheKey, url);
    return url;
  },

  async getVocabAudio(unitId: string, word: string, contextSentence?: string): Promise<string> {
    const cacheKey = `${unitId}:audio:${word}`;
    if (cache.audios.has(cacheKey)) return cache.audios.get(cacheKey)!;

    const text = contextSentence || word;
    // Canonical deterministic hash (text + lang + voice + model) — identical
    // speech always hits the same cached asset, across units and sessions.
    const { hash: promptHash, lang } = await speechHashFor(text);

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
      lang,
      promptHash,
    });

    const url = result?.url || '';
    if (url) {
      cache.audios.set(cacheKey, url);
      // Asset record is stored server-side by generate-media (with the same
      // prompt_hash, merge-duplicates) — no client-side insert needed.
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
