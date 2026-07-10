// Edge-side mirror of the Core-v1 exercise types + content builders (the client
// equivalent lives in types/exercise.ts). Duplicated because the Deno edge
// generator and the React client cannot share a module root (same reason
// manifest.ts is duplicated). Keep these in sync.

export const EXERCISE_TYPES = [
  'IMAGE_SELECT',
  'MEANING_MATCH',
  'AUDIO_L1_SELECT',
  'LISTEN_SELECT',
  'SPELL_CLOZE',
  'WORD_BANK_BUILD',
  'ERROR_SPOT',
  'TRANSFORM',
  'DICTATION',
  'MINIMAL_PAIR_SWIPE',
  'TYPE_TRANSLATE',
  'SPEAK_SENTENCE',
] as const;

export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const RECEPTIVE_TYPES: ReadonlySet<ExerciseType> = new Set([
  'IMAGE_SELECT',
  'MEANING_MATCH',
  'AUDIO_L1_SELECT',
  'LISTEN_SELECT',
  'SPELL_CLOZE',
]);

export function modalityOf(type: ExerciseType): 'receptive' | 'productive' {
  return RECEPTIVE_TYPES.has(type) ? 'receptive' : 'productive';
}

/** Fisher-Yates shuffle (returns a new array). */
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick up to `n` distractors from `pool`, excluding `exclude`. */
export function pickDistractors<T>(pool: T[], exclude: T, n: number): T[] {
  return shuffle(pool.filter((x) => x !== exclude)).slice(0, n);
}

/**
 * Build a multiple-choice option set: correct + distractors, then shuffle,
 * returning { options, correct_index }. Works for any value type.
 */
export function buildChoices<T>(correct: T, distractors: T[], count = 4): { options: T[]; correct_index: number } {
  const chosen = pickDistractors(distractors, correct, Math.max(0, count - 1));
  const options = shuffle([correct, ...chosen]);
  return { options, correct_index: options.indexOf(correct) };
}
