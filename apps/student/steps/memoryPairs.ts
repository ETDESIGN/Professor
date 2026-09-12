// memoryPairs — pure builder for the Memory Lab step (no React / no I/O).
// Unit vocabulary → cross-modal word ↔ image / L1-meaning pairs for the Memory Match engine.

export interface MemoryPair {
  id: string;
  /** English word (left column). */
  left: string;
  /** Image URL (preferred) or L1 translation / definition (right column). */
  right: string;
  /** 'image' if right is an image URL, 'text' if right is L1 text/definition. */
  rightType?: 'image' | 'text';
  imageUrl?: string;
  audioUrl?: string;
  l1Translation?: string;
}

/**
 * Build match pairs from getVocabulary() shapes. Prefers image_url from vocab
 * (right side = image card, left = word card; fallback to L1 text when no image),
 * drops words with neither an image nor an L1 translation / definition, dedupes by word,
 * and shuffles deterministically when a seed is supplied (tests) / randomly
 * otherwise. Capped at `max` (default 4 — fits 2×4 mobile grid without scrolling).
 */
export function buildMemoryPairs(
  vocab: readonly any[],
  max = 4,
  rng: () => number = Math.random,
): MemoryPair[] {
  const seen = new Set<string>();
  const usable: MemoryPair[] = [];
  for (const v of vocab) {
    const word = typeof v?.word === 'string' ? v.word.trim() : '';
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;

    const imageUrl = typeof v?.image_url === 'string' && v.image_url.trim() ? v.image_url.trim() : undefined;
    const l1 = typeof v?.l1_translation === 'string' && v.l1_translation.trim() ? v.l1_translation.trim() : undefined;
    const definition = typeof v?.definition === 'string' && v.definition.trim() ? v.definition.trim() : undefined;

    // Prefer image_url, fallback to L1 translation, fallback to definition
    const right = imageUrl || l1 || definition;
    if (!right) continue;

    seen.add(key);
    usable.push({
      id: key,
      left: word,
      right,
      rightType: imageUrl ? 'image' : 'text',
      imageUrl,
      l1Translation: l1 || definition,
      audioUrl: typeof v?.audio_url === 'string' && v.audio_url ? v.audio_url : undefined,
    });
  }
  // Fisher–Yates with injected rng, then cap.
  for (let i = usable.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [usable[i], usable[j]] = [usable[j], usable[i]];
  }
  return usable.slice(0, Math.max(2, max));
}
