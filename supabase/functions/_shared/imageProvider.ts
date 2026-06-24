// Image generation provider abstraction.
//
// The media pipeline must NOT be locked to a single vendor (e.g. Black Forest
// Labs flux). Providers are selected via the IMAGE_PROVIDER env var and each
// implements generate(prompt) -> { imageUrl }, where imageUrl is a publicly
// fetchable URL or a data: URL. The caller (generate-media) then downloads the
// image and re-uploads it to Supabase Storage, so the browser CSP `img-src`
// (allow-listed for *.supabase.co) is always satisfied regardless of which
// provider produced the image.
//
// To add a provider: implement ImageProvider and register it in
// resolveImageProvider(). Keep every provider reachable from the user's
// OpenRouter billing region (no direct Google / OpenAI / Anthropic image APIs
// — those are region-blocked).

export interface GeneratedImage {
  /** Publicly fetchable http(s) URL or data: URL of the generated image. */
  imageUrl: string;
  provider: string;
}

export interface ImageProvider {
  name: string;
  generate(prompt: string): Promise<GeneratedImage | null>;
}

/**
 * Default provider: an OpenRouter chat-style image model. The model id is
 * configurable via IMAGE_GEN_MODEL so it can be swapped to ANY OpenRouter
 * image model (or a future better-adapted solution) without code changes.
 * Defaults to flux-schnell purely as a working baseline.
 */
function openRouterImageProvider(): ImageProvider {
  return {
    name: 'openrouter',
    async generate(prompt): Promise<GeneratedImage | null> {
      const apiKey = Deno.env.get('AI_API_KEY') || '';
      const baseUrl = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1';
      const model = Deno.env.get('IMAGE_GEN_MODEL') || 'black-forest-labs/flux-schnell';
      if (!apiKey) return null;

      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        // Bounded: a slow/hung image model must not stall the function (546).
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: `Generate a child-friendly educational illustration: ${prompt}. Style: simple, colorful, flat vector illustration, suitable for kids aged 6-12. No text.`,
            },
          ],
        }),
      });
      if (!resp.ok) return null;

      const data = await resp.json();
      const content = String(data.choices?.[0]?.message?.content || '');

      // OpenRouter image responses vary by model. Try several envelopes.
      const mdMatch = content.match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/);
      if (mdMatch) return { imageUrl: mdMatch[1], provider: 'openrouter' };

      const urlMatch = content.match(/(https?:\/\/\S+\.(?:png|jpg|jpeg|webp))/i);
      if (urlMatch) return { imageUrl: urlMatch[1], provider: 'openrouter' };

      const dataUrlMatch = content.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);
      if (dataUrlMatch) return { imageUrl: dataUrlMatch[0], provider: 'openrouter' };

      const structured =
        data.choices?.[0]?.message?.images?.[0]?.image_url ||
        data.data?.[0]?.url ||
        data.choices?.[0]?.message?.image_url;
      if (typeof structured === 'string' && structured.length > 0) {
        return { imageUrl: structured, provider: 'openrouter' };
      }

      return null;
    },
  };
}

/**
 * Resolve the active image provider from env. Returns null when disabled or
 * when AI_API_KEY is absent so callers can fall back to placeholders.
 */
export function resolveImageProvider(): ImageProvider | null {
  const name = (Deno.env.get('IMAGE_PROVIDER') || 'openrouter').toLowerCase();
  switch (name) {
    case 'openrouter':
      return openRouterImageProvider();
    // Future providers register here, e.g.:
    //   case 'self-hosted': return selfHostedProvider();
    //   case 'sd-webui':   return sdWebuiProvider();
    default:
      console.error(`image_provider_unknown: "${name}" — falling back to openrouter`);
      return openRouterImageProvider();
  }
}
