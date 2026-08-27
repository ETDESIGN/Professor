// supabase/functions/evaluate-dubbing/score.ts — pure logic, unit-testable.
// No Deno imports here: Vitest imports this file from the repo tree.
export type Band = 'great' | 'almost' | 'try_again';

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9'ñáéíóúü\s-]/gi, '').split(/\s+/).filter(Boolean);

/** Bag-of-words F1 between reference and transcript. */
export function compareWords(reference: string, transcript: string): number {
  const ref = norm(reference), tr = norm(transcript);
  if (!ref.length || !tr.length) return 0;
  const counts = new Map<string, number>();
  for (const w of ref) counts.set(w, (counts.get(w) ?? 0) + 1);
  let hit = 0;
  for (const w of tr) {
    const c = counts.get(w) ?? 0;
    if (c > 0) { hit++; counts.set(w, c - 1); }
  }
  const p = hit / tr.length, r = hit / ref.length;
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

export function bandFor(wordMatch: number): Band {
  if (wordMatch >= 0.85) return 'great';
  if (wordMatch >= 0.60) return 'almost';
  return 'try_again';
}
