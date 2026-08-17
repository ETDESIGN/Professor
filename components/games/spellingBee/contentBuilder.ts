// Spelling Bee content builder — pure normalizers (no React, no I/O).
//
// Where the words come from, in priority order (the FastVocab/WordSearch
// 2026-08 convention — critical because production pool_items is still empty
// for many units, so the vocabulary_items fallback is the de-facto primary
// source):
//   1. pool_items — IMAGE_SELECT (word + image + audio) and MEANING_MATCH
//      (L1 meaning) merged per objective, plus DICTATION items whose
//      correct_text/audio enrich objectives the other types missed.
//   2. vocabulary_items via getVocabulary(unit.manifest) — word, image_url,
//      audio_url, l1_translation.
//   3. Frozen flow-block data.words (legacy string list).
//
// Field contract (types/exercise.ts): IMAGE_SELECT
//   { prompt, prompt_audio?, options: [{image_url}], correct_index }
// MEANING_MATCH { prompt, prompt_audio?, options: string[], correct_index }
// DICTATION { prompt_text?, audio_url?, correct_text }

import type { PoolItem } from '../../../types/exercise';
import type { SpellingBeeWord } from './types';
import { normalizeWord, MIN_WORD_LENGTH, MAX_WORD_LENGTH, hashString, mulberry32 } from './keyboardEngine';

const isRealImage = (url: unknown): url is string =>
  typeof url === 'string' && /^https?:/.test(url) && !url.includes('dicebear');

const audioOf = (content: any): string | undefined => {
  const a = content?.prompt_audio ?? content?.audio_url;
  return typeof a === 'string' && a ? a : undefined;
};

const difficultyOf = (value: unknown): 1 | 2 | 3 => {
  const n = Number(value);
  return n === 2 || n === 3 ? n : 1;
};

/**
 * Pool items → deduped SpellingBeeWord[], one per objective. IMAGE_SELECT
 * provides the word + image + audio; MEANING_MATCH enriches the same
 * objective with the L1 meaning; DICTATION items contribute via their
 * correct_text (covering objectives the other types missed) and audio.
 * Difficulty takes the max seen for the objective.
 */
export function poolToWords(items: readonly PoolItem[]): SpellingBeeWord[] {
  const byObjective = new Map<string, SpellingBeeWord>();
  for (const item of items) {
    const c = item.content as any;
    let prompt: string | null = null;
    if (typeof c?.prompt === 'string' && c.prompt) prompt = c.prompt;
    else if (item.exercise_type === 'DICTATION' && typeof c?.correct_text === 'string' && c.correct_text) {
      prompt = c.correct_text;
    }
    if (!prompt) continue;
    const letters = normalizeWord(prompt);
    if (letters.length < MIN_WORD_LENGTH || letters.length > MAX_WORD_LENGTH) continue;

    let entry = byObjective.get(item.objective_id);
    if (!entry) {
      entry = {
        id: item.objective_id,
        objectiveId: item.objective_id,
        exerciseType: item.exercise_type,
        difficulty: difficultyOf(item.difficulty),
        word: prompt,
        letters,
      };
      byObjective.set(item.objective_id, entry);
    }

    if (item.exercise_type === 'IMAGE_SELECT') {
      const img = c?.options?.[c.correct_index]?.image_url;
      if (isRealImage(img)) entry.imageUrl = img;
      entry.audioUrl = entry.audioUrl ?? audioOf(c);
    } else if (item.exercise_type === 'MEANING_MATCH') {
      const meaning = c?.options?.[c.correct_index];
      if (typeof meaning === 'string' && meaning) entry.meaning = meaning;
      entry.audioUrl = entry.audioUrl ?? audioOf(c);
    } else if (item.exercise_type === 'DICTATION') {
      entry.audioUrl = entry.audioUrl ?? audioOf(c);
    }
    entry.difficulty = Math.max(entry.difficulty, difficultyOf(item.difficulty)) as 1 | 2 | 3;
  }
  return dedupe([...byObjective.values()]);
}

/**
 * vocabulary_items (getVocabulary shape) → SpellingBeeWord[]. objectiveId is
 * synthesized ("vocab:<LETTERS>") — gradeObjective skips non-UUID ids
 * upstream, same as the WordSearch fallback.
 */
export function vocabularyToWords(vocab: readonly any[]): SpellingBeeWord[] {
  const out: SpellingBeeWord[] = [];
  for (const v of vocab) {
    const word = typeof v?.word === 'string' ? v.word : '';
    if (!word) continue;
    const letters = normalizeWord(word);
    if (letters.length < MIN_WORD_LENGTH || letters.length > MAX_WORD_LENGTH) continue;
    out.push({
      id: `vocab:${letters}`,
      objectiveId: `vocab:${letters}`,
      exerciseType: 'VOCAB_FALLBACK',
      difficulty: 1,
      word,
      letters,
      imageUrl: isRealImage(v.image_url) ? v.image_url : undefined,
      audioUrl: typeof v.audio_url === 'string' && v.audio_url ? v.audio_url : undefined,
      meaning: typeof v.l1_translation === 'string' && v.l1_translation ? v.l1_translation : undefined,
    });
  }
  return dedupe(out);
}

/** Frozen legacy data.words (string[]) → minimal SpellingBeeWord[]. */
export function frozenToWords(words: readonly any[]): SpellingBeeWord[] {
  const out: SpellingBeeWord[] = [];
  for (const w of words) {
    const letters = normalizeWord(w);
    if (letters.length < MIN_WORD_LENGTH || letters.length > MAX_WORD_LENGTH) continue;
    out.push({
      id: `frozen:${letters}`,
      objectiveId: `frozen:${letters}`,
      exerciseType: 'FROZEN',
      difficulty: 1,
      word: String(w),
      letters,
    });
  }
  return dedupe(out);
}

/** Keep only keyboard-sized words; dedupe by normalized letters. */
export function dedupe(words: readonly SpellingBeeWord[]): SpellingBeeWord[] {
  const seen = new Set<string>();
  const out: SpellingBeeWord[] = [];
  for (const w of words) {
    if (w.letters.length < MIN_WORD_LENGTH || w.letters.length > MAX_WORD_LENGTH) continue;
    if (seen.has(w.letters)) continue;
    seen.add(w.letters);
    out.push(w);
  }
  return out;
}

/** Fisher–Yates with the injected rng. */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Deal one wave from the pool with wrap-around coverage (the takeWave
 * contract): never repeats a word within a wave, wraps on tiny pools.
 */
export function takeWave(
  words: readonly SpellingBeeWord[],
  fromCursor: number,
  size: number,
): { wave: SpellingBeeWord[]; nextCursor: number } {
  if (words.length === 0) return { wave: [], nextCursor: 0 };
  const max = Math.min(size, words.length);
  const start = ((fromCursor % words.length) + words.length) % words.length;
  const wave: SpellingBeeWord[] = [];
  for (let i = 0; i < max; i++) {
    wave.push(words[(start + i) % words.length]);
  }
  return { wave, nextCursor: (start + max) % words.length };
}

/**
 * Deal the words for round `roundIndex` (1-based) with wrap-around coverage,
 * deterministically shuffled per (unitId, roundIndex) so every board tab
 * deals the same round.
 */
export function takeRound(
  words: readonly SpellingBeeWord[],
  unitId: string,
  roundIndex: number,
  size: number,
): SpellingBeeWord[] {
  const rng = mulberry32(hashString(`${unitId}|round|${roundIndex}`));
  return shuffle(takeWave(words, (roundIndex - 1) * size, size).wave, rng);
}

/** 0–5 stars for a finished run (board overlay + solo results screen). */
export function starsForRun(solved: number, attempted: number, mistakes: number): number {
  if (attempted === 0) return 0;
  const ratio = solved / attempted;
  if (ratio >= 1 && mistakes === 0) return 5;
  if (ratio >= 1 && mistakes <= 2) return 4;
  if (ratio >= 0.8) return 3;
  if (ratio >= 0.6) return 2;
  return 1;
}
