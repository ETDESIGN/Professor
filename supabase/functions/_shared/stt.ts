// Speech-to-Text provider abstraction for the pronunciation evaluator.
//
// API RESTRICTION (critical): the user's OpenRouter billing region blocks
// Google, OpenAI (Whisper) and Anthropic. This module MUST NOT call any of
// those providers directly.
//
// Strategy:
//   1. If a region-safe STT provider is explicitly configured via env, use it
//      to transcribe the audio server-side.
//   2. Otherwise return null. Callers then rely on the client-supplied Web
//      Speech transcript (region-free, runs in the browser) plus Levenshtein
//      similarity scoring. We never fabricate a transcript.
//
// Adding a future provider: implement the SttProvider shape and register it in
// transcribe(). Keep all new providers region-safe (Moonshot/Qwen/DeepSeek via
// OpenRouter, a self-hosted Whisper-compatible endpoint, etc.).

export interface SttResult {
  transcript: string;
  /** 0..1 confidence, falls back to a neutral weight downstream if unknown. */
  confidence: number;
}

/**
 * Transcribe audio using the configured region-safe STT provider.
 * Returns null when no provider is configured (client transcript should be used)
 * or when the provider fails. Never throws.
 */
export async function transcribe(
  audioBase64: string | undefined | null,
  language: string,
): Promise<SttResult | null> {
  if (!audioBase64) return null;

  const provider = (Deno.env.get('STT_PROVIDER') || '').toLowerCase();

  try {
    if (provider === 'openrouter-audio') {
      return await openRouterAudioProvider(audioBase64, language);
    }
    // Future providers (e.g. STT_PROVIDER=self-hosted-whisper) plug in here.
  } catch (err) {
    console.error(
      'stt_provider_error:',
      err instanceof Error ? err.message : String(err),
    );
  }

  // No region-safe provider configured: rely on the client Web Speech transcript.
  return null;
}

/**
 * Optional OpenRouter audio-capable chat model provider (e.g. a qwen-audio id).
 * Disabled unless STT_PROVIDER=openrouter-audio AND STT_AUDIO_MODEL are set.
 * Sends the audio inline so the model actually hears it (unlike the previous
 * OpenAI fallback which never transmitted audio).
 */
async function openRouterAudioProvider(
  audioBase64: string,
  language: string,
): Promise<SttResult | null> {
  const apiKey = Deno.env.get('AI_API_KEY');
  const baseUrl = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1';
  const model = Deno.env.get('STT_AUDIO_MODEL');
  if (!apiKey || !model) return null;

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: `Transcribe the spoken English in the user's audio. Reply with ONLY the transcript in ${language}, no JSON, no commentary, no quotes.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Transcribe this audio recording.' },
            { type: 'input_audio', input_audio: { data: audioBase64, format: 'webm' } },
          ],
        },
      ],
      temperature: 0,
    }),
  });

  if (!resp.ok) return null;
  const data = await resp.json();
  const transcript = (data.choices?.[0]?.message?.content || '').toString().trim();
  if (!transcript) return null;
  return { transcript, confidence: 0.85 };
}
