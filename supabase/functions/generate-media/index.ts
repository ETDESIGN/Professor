import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';

serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'generate-media',
    rateLimit: { maxRequests: 20, windowMs: 60 * 1000 },
    validationRules: [
      { field: 'action', required: true, type: 'string' },
    ],
  }, async (body, _auth) => {
    const { action, unitId, prompt, text, query, images, audios } = body;

    switch (action) {
      case 'generate-image': {
        const imageGenUrl = Deno.env.get('IMAGE_GEN_URL') || '';
        const imageGenKey = Deno.env.get('IMAGE_GEN_KEY') || '';

        if (!imageGenUrl || !imageGenKey) {
          return { url: '', error: 'Image generation not configured' };
        }

        try {
          const response = await fetch(imageGenUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${imageGenKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'gemini-2.0-flash-exp',
              prompt: prompt || `Educational illustration for children`,
              n: 1,
              size: '512x512',
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const url = data.data?.[0]?.url || data.url || '';
            return { url };
          }
          return { url: '', error: `Image gen failed: ${response.status}` };
        } catch (err: any) {
          return { url: '', error: err.message };
        }
      }

      case 'generate-audio': {
        const elevenlabsKey = Deno.env.get('ELEVENLABS_API_KEY') || '';
        const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID') || '21m00Tcm4TlvDq8ikWAM';

        if (!elevenlabsKey) {
          return { url: '', error: 'Audio generation not configured' };
        }

        try {
          const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
              'xi-api-key': elevenlabsKey,
              'Content-Type': 'application/json',
              'Accept': 'audio/mpeg',
            },
            body: JSON.stringify({
              text: text || 'Hello',
              model_id: 'eleven_monolingual_v1',
              voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            }),
          });

          if (response.ok) {
            const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
            const audioBuffer = await response.arrayBuffer();

            const uploadPath = `audio/${unitId || 'default'}/${Date.now()}.mp3`;
            const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/generated-media/${uploadPath}`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'audio/mpeg',
              },
              body: audioBuffer,
            });

            if (uploadResponse.ok) {
              const url = `${supabaseUrl}/storage/v1/object/public/generated-media/${uploadPath}`;
              return { url };
            }
            return { url: '', error: 'Storage upload failed' };
          }
          return { url: '', error: `ElevenLabs failed: ${response.status}` };
        } catch (err: any) {
          return { url: '', error: err.message };
        }
      }

      case 'batch': {
        const results: { images: Record<string, string>; audios: Record<string, string> } = { images: {}, audios: {} };

        if (Array.isArray(images)) {
          for (const img of images) {
            const imgResult = await (await fetch(req.url, {
              method: 'POST',
              headers: req.headers,
              body: JSON.stringify({ action: 'generate-image', unitId, prompt: img.prompt }),
            })).json();
            if (imgResult.url) results.images[img.key] = imgResult.url;
          }
        }

        if (Array.isArray(audios)) {
          for (const aud of audios) {
            const audResult = await (await fetch(req.url, {
              method: 'POST',
              headers: req.headers,
              body: JSON.stringify({ action: 'generate-audio', unitId, text: aud.text }),
            })).json();
            if (audResult.url) results.audios[aud.key] = audResult.url;
          }
        }

        return { results };
      }

      case 'youtube-search': {
        const googleApiKey = Deno.env.get('GOOGLE_API_KEY') || '';
        if (!googleApiKey) {
          return { items: [], error: 'YouTube search not configured' };
        }
        const searchQuery = query || 'English lesson kids';
        const ytResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=8&q=${encodeURIComponent(searchQuery)}&type=video&videoEmbeddable=true&safeSearch=strict&key=${googleApiKey}`
        );
        if (ytResponse.ok) {
          const ytData = await ytResponse.json();
          return { items: ytData.items || [] };
        }
        return { items: [], error: `YouTube API failed: ${ytResponse.status}` };
      }

      default:
        throw new Error(`Unknown action: ${action}. Valid actions: generate-image, generate-audio, batch, youtube-search`);
    }
  });
});
