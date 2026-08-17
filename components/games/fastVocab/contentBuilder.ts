// Fast Vocab — pure content builders (no React, no I/O).
//
// Normalizes pool_items into Fast Vocab pairs/questions using the same field
// contract as BoardFlashMatch's normalizer (types/exercise.ts):
//   IMAGE_SELECT   { prompt, prompt_audio?, options: [{image_url, label?}], correct_index }
//   MEANING_MATCH  { prompt, prompt_audio?, options: string[], correct_index }
//
// Everything here is deterministic given the RNG argument where relevant, so
// it is unit-testable (see contentBuilder.test.ts).

import type { PoolItem } from '../../../types/exercise';
import type { FastVocabMode, FastVocabPair, FastVocabSpeedQ } from './types';

/** Fisher–Yates shuffle. Pass an rng for deterministic tests; defaults to Math.random. */
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Normalize one pool item into a Fast Vocab pair, or null when unusable. */
export function normalizePair(item: PoolItem): FastVocabPair | null {
  const base = {
    id: item.id,
    objectiveId: item.objective_id,
    exerciseType: item.exercise_type,
    difficulty: (item.difficulty ?? 1) as 1 | 2 | 3,
  };
  const c = item.content as any;
  const audioUrl: string | undefined =
    typeof c?.prompt_audio === 'string' && c.prompt_audio
      ? c.prompt_audio
      : typeof c?.audio_url === 'string' && c.audio_url
        ? c.audio_url
        : undefined;

  switch (item.exercise_type) {
    case 'IMAGE_SELECT': {
      const img = c?.options?.[c.correct_index]?.image_url;
      if (!c?.prompt || !img) return null;
      return { ...base, word: String(c.prompt), imageUrl: String(img), audioUrl };
    }
    case 'MEANING_MATCH': {
      const meaning = c?.options?.[c.correct_index];
      if (!c?.prompt || meaning == null) return null;
      return { ...base, word: String(c.prompt), meaning: String(meaning), audioUrl };
    }
    default:
      return null;
  }
}

/**
 * Detect the content modality for a unit: image mode when the pool has at
 * least `minImageItems` (default 3) IMAGE_SELECT items with a real correct
 * image (generate-exercises only emits IMAGE_SELECT when the unit has real
 * generated images, so presence is the signal). Otherwise meaning mode
 * (word ↔ L1).
 */
export function detectMode(items: readonly PoolItem[], minImageItems = 3): FastVocabMode {
  let imageCount = 0;
  for (const it of items) {
    if (it.exercise_type !== 'IMAGE_SELECT') continue;
    const c = it.content as any;
    if (c?.prompt && c?.options?.[c.correct_index]?.image_url) imageCount++;
    if (imageCount >= minImageItems) return 'image';
  }
  return 'meaning';
}

/**
 * The unit's full deduped pair list for the detected mode — one pair per
 * objective (first occurrence wins, matching BoardFlashMatch/VocabBlitz).
 * Caller shuffles the pool BEFORE this (useBoardPool already does).
 */
export function buildUnitPairs(items: readonly PoolItem[], mode: FastVocabMode): FastVocabPair[] {
  const seen = new Set<string>();
  const out: FastVocabPair[] = [];
  for (const it of items) {
    if (seen.has(it.objective_id)) continue;
    const pair = normalizePair(it);
    if (!pair) continue;
    const usable = mode === 'image' ? Boolean(pair.imageUrl) : Boolean(pair.meaning);
    if (!usable) continue;
    seen.add(pair.objectiveId);
    out.push(pair);
  }
  return out;
}

export interface MatchWave {
  wave: FastVocabPair[];
  /** Cursor to hand back for the next wave (wraps around the pool). */
  nextCursor: number;
}

/**
 * Take the next `size` pairs starting at `cursor`, wrapping around the pool
 * and never repeating an objective within the wave. Shrinks gracefully on
 * tiny pools (fewer pairs than `size` → all of them).
 */
export function takeWave(
  pairs: readonly FastVocabPair[],
  cursor: number,
  size = 3,
  rng: () => number = Math.random,
): MatchWave {
  if (pairs.length === 0) return { wave: [], nextCursor: 0 };
  const max = Math.min(size, pairs.length);
  const start = ((cursor % pairs.length) + pairs.length) % pairs.length;
  const used = new Set<string>();
  const wave: FastVocabPair[] = [];
  let i = start;
  let guard = 0;
  while (wave.length < max && guard <= pairs.length * 2) {
    const p = pairs[i % pairs.length];
    if (!used.has(p.objectiveId)) {
      used.add(p.objectiveId);
      wave.push(p);
    }
    i++;
    guard++;
  }
  return { wave: shuffle(wave, rng), nextCursor: i % pairs.length };
}

/**
 * Build the Phase-2 speed-recall questions from the wave's own words (the
 * learn→recall arc: match them first, then recognize them under time
 * pressure). Choices are the correct word + up to 2 sibling words, preferably
 * from the same wave, backfilled from the whole unit pool on tiny waves.
 */
export function buildSpeedQuestions(
  wave: readonly FastVocabPair[],
  pool: readonly FastVocabPair[],
  mode: FastVocabMode,
  count = 2,
  rng: () => number = Math.random,
): FastVocabSpeedQ[] {
  if (wave.length === 0) return [];
  const n = Math.min(count, wave.length);
  const chosen = shuffle(wave, rng).slice(0, n);

  return chosen.map((pair) => {
    const siblingPool = [
      ...wave.filter((p) => p.objectiveId !== pair.objectiveId),
      ...pool.filter((p) => p.objectiveId !== pair.objectiveId && p.word !== pair.word),
    ];
    const distractors: string[] = [];
    for (const cand of shuffle(siblingPool, rng)) {
      if (distractors.length >= 2) break;
      if (cand.word !== pair.word && !distractors.includes(cand.word)) distractors.push(cand.word);
    }
    const choices = shuffle([pair.word, ...distractors], rng);
    return {
      id: `${pair.id}-speed`,
      objectiveId: pair.objectiveId,
      exerciseType: pair.exerciseType,
      difficulty: pair.difficulty,
      imageUrl: mode === 'image' ? pair.imageUrl : undefined,
      meaning: mode === 'meaning' ? pair.meaning : undefined,
      correctWord: pair.word,
      choices,
      correctIndex: choices.indexOf(pair.word),
      audioUrl: pair.audioUrl,
    };
  });
}

/** 1–5 stars from first-try accuracy (≥1 star whenever anything was played). */
export function starsFor(firstTryCorrect: number, totalInteractions: number): number {
  if (totalInteractions <= 0) return 0;
  return Math.max(1, Math.round((firstTryCorrect / totalInteractions) * 5));
}

/** Supported match-wave sizes (the "Longer cycle" game setting: 3 ⇄ 5). */
export type FastVocabWaveSize = 3 | 5;

/**
 * Resolve a raw settings value (flow block `data.waveSize`, localStorage,
 * anything) to a legal wave size. Anything that isn't exactly 5 means the
 * default lightning cycle of 3 — an unknown value must never brick the game.
 */
export function resolveWaveSize(value: unknown): FastVocabWaveSize {
  return Number(value) === 5 ? 5 : 3;
}
