// Shared TTS helper (Edge / Deno). Generates an ElevenLabs narration for the
// given text and persists the MP3 to the generated-media bucket, returning a
// public Supabase URL. Used by generate-media (existing) and enrich-unit
// (Phase 1.2: store audio_url per vocab word) so both share one path.

const DUMMY = '';

export async function generateAndStoreAudio(text: string, unitId: string): Promise<{ url: string; error?: string }> {
  const elevenlabsKey = Deno.env.get('ELEVENLABS_API_KEY') || '';
  const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID') || '21m00Tcm4TlvDq8ikWAM';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!elevenlabsKey || !supabaseUrl || !supabaseKey) {
    return { url: DUMMY, error: 'Audio generation not configured' };
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': elevenlabsKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        text: text || 'Hello',
        model_id: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!response.ok) return { url: DUMMY, error: `ElevenLabs failed: ${response.status}` };

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
    return { url: DUMMY, error: 'Storage upload failed' };
  } catch (err: any) {
    return { url: DUMMY, error: err?.message || 'TTS error' };
  }
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
