// preloadWaveAudio — warm the browser's HTTP cache for a wave's stored audio
// URLs (publish-time generated vocabulary audio). Fetch-only: zero TTS calls,
// zero credits. Called when a wave is built so the 10–30s the student spends
// matching doubles as audio prefetch time — by the first correct tap the MP3
// is already in the disk cache and playAudioUrl starts instantly.
//
// Words with no stored audio are skipped here on purpose: the play-time
// resolver chain (assets → resolve-speech → browser voice) stays the safety
// net for them.

export function preloadWaveAudio(pairs: readonly { audioUrl?: string }[]): void {
  for (const p of pairs) {
    if (!p.audioUrl) continue;
    try {
      const audio = new Audio(p.audioUrl);
      audio.preload = 'auto';
      audio.load();
    } catch {
      /* preload is best-effort — a cold fetch at play time still works */
    }
  }
}
