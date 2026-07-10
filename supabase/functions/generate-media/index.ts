import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { generateAndStoreImage } from '../_shared/imageGen.ts';
import { generateAndStoreAudio, mapWithConcurrency } from '../_shared/tts.ts';

// --- single-item generators (shared by their action and by `batch`) ---

async function generateImage(unitId: string, prompt: string): Promise<{ url: string; provider?: string; error?: string }> {
  return generateAndStoreImage(prompt, unitId);
}

async function generateAudio(unitId: string, text: string): Promise<{ url: string; error?: string }> {
  return generateAndStoreAudio(text, unitId);
}

serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'generate-media',
    requireAuth: true,
    rateLimit: { maxRequests: 20, windowMs: 60 * 1000 },
    validationRules: [
      { field: 'action', required: true, type: 'string' },
    ],
  }, async (body, _auth) => {
    const { action, unitId, prompt, text, query, images, audios } = body;

    switch (action) {
      case 'generate-image':
        return generateImage(unitId, prompt);

      case 'generate-audio':
        return generateAudio(unitId, text);

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
          const audOut = await mapWithConcurrency(audios, 3, (aud) => generateAudio(unitId, aud.text));
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
          message: 'YouTube Data API is unavailable in your region. Use searchUrl to open the result on YouTube.',
        };
      }

      default:
        throw new Error(`Unknown action: ${action}. Valid actions: generate-image, generate-audio, batch, youtube-search`);
    }
  });
});
