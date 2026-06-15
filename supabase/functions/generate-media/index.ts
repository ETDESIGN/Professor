import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';

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
      case 'generate-image': {
        const aiApiKey = Deno.env.get('AI_API_KEY') || '';
        const modelName = Deno.env.get('IMAGE_GEN_MODEL') || 'black-forest-labs/flux-schnell';

        if (!aiApiKey) {
          return { url: '', error: 'Image generation not configured (AI_API_KEY required)' };
        }

        try {
          // Attempt OpenRouter image generation
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: modelName,
              messages: [
                { role: 'user', content: `Generate a child-friendly educational illustration: ${prompt || 'Educational item'}. Style: simple, colorful, flat vector illustration, suitable for kids aged 6-12. No text.` }
              ],
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';
            
            // Extract Markdown image URL from OpenRouter's response (e.g. ![alt](https://...))
            const imgMatch = content.match(/!\[.*?\]\((https?:\/\/.*?)\)/);
            let imageUrl = imgMatch ? imgMatch[1] : null;

            // Fallback to DiceBear if OpenRouter didn't return a standard image URL
            if (!imageUrl) {
               imageUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(prompt || 'item')}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`;
            }

            const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

            if (supabaseUrl && supabaseKey && imageUrl) {
              // Fetch the image from the URL so we can save it to our own storage
              const imgResp = await fetch(imageUrl);
              if (imgResp.ok) {
                const imgBuffer = await imgResp.arrayBuffer();
                const contentType = imgResp.headers.get('content-type') || 'image/png';
                const ext = contentType.split('/')[1]?.split(';')[0] || 'png';
                const uploadPath = `images/${unitId || 'default'}/${Date.now()}.${ext}`;

                const uploadResponse = await fetch(
                  `${supabaseUrl}/storage/v1/object/generated-media/${uploadPath}`,
                  {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${supabaseKey}`,
                      'Content-Type': contentType,
                    },
                    body: imgBuffer,
                  }
                );

                if (uploadResponse.ok) {
                  return { url: `${supabaseUrl}/storage/v1/object/public/generated-media/${uploadPath}` };
                }
              }
            }
            // If storage fails or wasn't configured, just return the external URL directly
            return { url: imageUrl };
          }
          return { url: '', error: `Image gen failed: ${response.status}` };
        } catch (err: any) {
          return { url: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(prompt || 'item')}`, error: err.message };
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
        const searchQuery = query || 'English lesson kids';
        return { 
          items: [],
          message: 'YouTube search is not available in your region. Use the song/video suggestions from enriched content instead.'
        };
      }

      default:
        throw new Error(`Unknown action: ${action}. Valid actions: generate-image, generate-audio, batch, youtube-search`);
    }
  });
});
