// memoryPairs — pure builder for the Memory Lab step (no React / no I/O).
// Unit vocabulary → word ↔ L1-meaning pairs for the FlashMatch engine.

export interface MemoryPair {
  id: string;
  /** English word (left column). */
  left: string;
  /** L1 translation, or definition when no translation exists (right column). */
  right: string;
  audioUrl?: string;
}

/**
 * Build match pairs from getVocabulary() shapes. Drops words with neither an
 * L1 translation nor a definition (nothing to match against), dedupes by word,
 * and shuffles deterministically when a seed is supplied (tests) / randomly
 * otherwise. Capped at `max` (default 6 — FlashMatch renders one column list).
 */
export function buildMemoryPairs(
  vocab: readonly any[],
  max = 6,
  rng: () => number = Math.random,
): MemoryPair[] {
  const seen = new Set<string>();
  const usable: MemoryPair[] = [];
  for (const v of vocab) {
    const word = typeof v?.word === 'string' ? v.word.trim() : '';
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    const right = (typeof v?.l1_translation === 'string' && v.l1_translation.trim())
      || (typeof v?.definition === 'string' && v.definition.trim());
    if (!right) continue;
    seen.add(key);
    usable.push({
      id: key,
      left: word,
      right: right.trim(),
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
