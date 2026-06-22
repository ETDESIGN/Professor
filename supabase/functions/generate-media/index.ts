import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { resolveImageProvider } from '../_shared/imageProvider.ts';

// Download a generated image (http(s) or data URL) and persist it to the
// generated-media bucket, returning a public Supabase URL. Proxying through
// Storage keeps the browser CSP img-src (allow-listed for *.supabase.co)
// satisfied regardless of which image provider produced the bytes.
async function proxyToStorage(
  imageUrl: string,
  unitId: string,
): Promise<string | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !supabaseKey) return null;

  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) return null;

  const imgBuffer = await imgResp.arrayBuffer();
  const contentType = imgResp.headers.get('content-type') || 'image/png';
  const ext = contentType.split('/')[1]?.split(';')[0] || 'png';
  const uploadPath = `images/${unitId || 'default'}/${Date.now()}.${ext}`;

  const uploadResponse = await fetch(
    `${supabaseUrl}/storage/v1/object/generated-media/${uploadPath}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': contentType },
      body: imgBuffer,
    },
  );

  if (!uploadResponse.ok) return null;
  return `${supabaseUrl}/storage/v1/object/public/generated-media/${uploadPath}`;
}

const DICEBEAR = (seed: string) =>
  `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed || 'item')}`;

// --- single-item generators (shared by their action and by `batch`) ---

async function generateImage(unitId: string, prompt: string): Promise<{ url: string; provider?: string; error?: string }> {
  const provider = resolveImageProvider();
  if (!provider) {
    return { url: '', error: 'Image generation not configured (AI_API_KEY required)' };
  }
  try {
    const generated = await provider.generate(prompt || 'Educational item');
    if (!generated || !generated.imageUrl) {
      return { url: DICEBEAR(prompt || 'item'), error: 'Image provider returned no image' };
    }
    const proxied = await proxyToStorage(generated.imageUrl, unitId || 'default');
    if (proxied) return { url: proxied, provider: generated.provider };
    return { url: generated.imageUrl, provider: generated.provider };
  } catch (err: any) {
    return { url: DICEBEAR(prompt || 'item'), error: err.message };
  }
}

async function generateAudio(unitId: string, text: string): Promise<{ url: string; error?: string }> {
  const elevenlabsKey = Deno.env.get('ELEVENLABS_API_KEY') || '';
  const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID') || '21m00Tcm4TlvDq8ikWAM';
  if (!elevenlabsKey) {
    return { url: '', error: 'Audio generation not configured' };
  }
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': elevenlabsKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({
        text: text || 'Hello',
        model_id: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!response.ok) return { url: '', error: `ElevenLabs failed: ${response.status}` };

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const audioBuffer = await response.arrayBuffer();
    const uploadPath = `audio/${unitId || 'default'}/${Date.now()}.mp3`;
    const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/generated-media/${uploadPath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'audio/mpeg' },
      body: audioBuffer,
    });
    if (uploadResponse.ok) {
      return { url: `${supabaseUrl}/storage/v1/object/public/generated-media/${uploadPath}` };
    }
    return { url: '', error: 'Storage upload failed' };
  } catch (err: any) {
    return { url: '', error: err.message };
  }
}

// Run async tasks with a bounded concurrency so a large batch does not hammer
// the image/audio provider (avoids provider-side rate limits / timeouts).
async function mapWithConcurrency<T, R>(
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
