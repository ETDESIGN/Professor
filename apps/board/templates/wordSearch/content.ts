// Word Search content — pure normalizers (no React, no I/O).
//
// Where the words come from, in priority order (mirrors the FastVocab 2026-08
// convention — critical because production pool_items is still empty for most
// units, so the vocabulary_items fallback is the de-facto primary source):
//   1. pool_items via useEscalatingPool — IMAGE_SELECT (word + image + audio)
//      and MEANING_MATCH (word + L1 meaning) merged per objective.
//   2. vocabulary_items via getVocabulary(unit.manifest) — word, image_url,
//      audio_url, l1_translation.
//   3. Frozen flow-block data.words (legacy string list).
//
// Field contract (types/exercise.ts): IMAGE_SELECT
//   { prompt, prompt_audio?, options: [{image_url}], correct_index }
// MEANING_MATCH { prompt, prompt_audio?, options: string[], correct_index }

import type { PoolItem } from '../../../../types/exercise';
import {
  normalizeWord,
  MIN_WORD_LENGTH,
  MAX_GRID,
  type GridWord,
} from './gridEngine';

/** One round word with everything the clue cards / scoring need. */
export interface SearchWord {
  id: string;
  objectiveId: string;
  /** Source pool exercise type, or 'VOCAB_FALLBACK' / 'FROZEN'. */
  exerciseType: string;
  difficulty: 1 | 2 | 3;
  /** Display form ("ice cream"). */
  word: string;
  /** Normalized A-Z grid form ("ICECREAM"). */
  letters: string;
  imageUrl?: string;
  audioUrl?: string;
  /** L1 meaning (MEANING_MATCH option / vocabulary_items.l1_translation). */
  meaning?: string;
}

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
 * Pool items → deduped SearchWord[], one per objective. IMAGE_SELECT provides
 * the word + image + audio; MEANING_MATCH enriches the same objective with the
 * L1 meaning (and audio when the image item lacked it). Difficulty takes the
 * max seen for the objective.
 */
export function poolToWords(items: readonly PoolItem[]): SearchWord[] {
  const byObjective = new Map<string, SearchWord>();
  for (const item of items) {
    const c = item.content as any;
    const prompt = typeof c?.prompt === 'string' && c.prompt ? c.prompt : null;
    if (!prompt) continue;
    const letters = normalizeWord(prompt);
    if (letters.length < MIN_WORD_LENGTH) continue;

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
    }
    entry.difficulty = Math.max(entry.difficulty, difficultyOf(item.difficulty)) as 1 | 2 | 3;
  }
  return gridReady([...byObjective.values()]);
}

/**
 * vocabulary_items (getVocabulary shape) → SearchWord[]. objectiveId is
 * synthesized ("vocab:<word>") — gradeObjective skips non-UUID ids upstream,
 * same as BoardUnscramble's frozen-round guard.
 */
export function vocabularyToWords(vocab: readonly any[]): SearchWord[] {
  const out: SearchWord[] = [];
  for (const v of vocab) {
    const word = typeof v?.word === 'string' ? v.word : '';
    if (!word) continue;
    const letters = normalizeWord(word);
    if (letters.length < MIN_WORD_LENGTH || letters.length > MAX_GRID) continue;
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
  return out;
}

/** Frozen legacy data.words (string[]) → minimal SearchWord[]. */
export function frozenToWords(words: readonly any[]): SearchWord[] {
  const out: SearchWord[] = [];
  for (const w of words) {
    const letters = normalizeWord(w);
    if (letters.length < MIN_WORD_LENGTH || letters.length > MAX_GRID) continue;
    out.push({
      id: `frozen:${letters}`,
      objectiveId: `frozen:${letters}`,
      exerciseType: 'FROZEN',
      difficulty: 1,
      word: String(w),
      letters,
    });
  }
  return out;
}

/** Keep only words that fit the grid; dedupe by normalized letters. */
export function gridReady(words: readonly SearchWord[]): SearchWord[] {
  const seen = new Set<string>();
  const out: SearchWord[] = [];
  for (const w of words) {
    if (w.letters.length < MIN_WORD_LENGTH || w.letters.length > MAX_GRID) continue;
    if (seen.has(w.letters)) continue;
    seen.add(w.letters);
    out.push(w);
  }
  return out;
}

/** Clue-card modality: images only when the unit has ≥3 real images. */
export type ClueMode = 'image' | 'text';
export function detectClueMode(words: readonly SearchWord[], minImages = 3): ClueMode {
  return words.filter((w) => w.imageUrl).length >= minImages ? 'image' : 'text';
}

/**
 * Deal one round from the pool with wrap-around coverage (the takeWave
 * contract): never repeats a word within a round, wraps on tiny pools, and
 * shuffles deterministically via the supplied rng.
 */
export function takeRound(
  words: readonly SearchWord[],
  roundIndex: number,
  size: number,
  rng: () => number = Math.random,
): SearchWord[] {
  if (words.length === 0) return [];
  const max = Math.min(size, words.length);
  const start = (((roundIndex - 1) * size) % words.length + words.length) % words.length;
  const picked: SearchWord[] = [];
  for (let i = 0; picked.length < max && i < words.length; i++) {
    picked.push(words[(start + i) % words.length]);
  }
  // Fisher–Yates with injected rng.
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked;
}

/** SearchWord[] → the engine's minimal GridWord[]. */
export function toGridWords(words: readonly SearchWord[]): GridWord[] {
  return words.map((w) => ({ id: w.id, letters: w.letters }));
}
