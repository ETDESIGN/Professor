// Round-level speech preload (2026-08-08 TTS upgrade). Warms the on-demand
// TTS cache for a game round's reference-based listening items so play-time
// taps hit cached audio instead of generating on the spot. Fire-and-forget:
// bounded server-side (concurrency 5 + 80s budget guard) and never throws.

import type { PoolItem } from '../../../types/exercise';
import { preloadSpeechBatch } from '../../../services/speechResolver';

/** Extract the speech text a reference-based pool item needs at play time. */
export function speechTextOf(pi: PoolItem): string {
  const c: any = pi?.content || {};
  if (c.audio_url) return ''; // pre-stored audio — nothing to resolve
  switch (pi?.exercise_type) {
    case 'LISTEN_SELECT':
    case 'AUDIO_L1_SELECT':
      return c.prompt_text || '';
    case 'DICTATION':
      return c.prompt_text || c.correct_text || '';
    case 'MINIMAL_PAIR_SWIPE':
      return c.prompt_text || (Array.isArray(c.pair) ? String(c.pair[0] || '') : '');
    case 'SPEAK_SENTENCE':
      return c.target_audio ? '' : (c.target_sentence || c.target_word || '');
    default:
      return '';
  }
}

/** Warm the speech cache for every reference-based item in the round. */
export function preloadRoundSpeech(unitId: string, items: PoolItem[]): void {
  const entries = items
    .map((pi, i) => ({ key: `${pi.exercise_type}:${i}`, text: speechTextOf(pi) }))
    .filter((e) => e.text);
  if (entries.length === 0) return;
  void preloadSpeechBatch(unitId, entries);
}
