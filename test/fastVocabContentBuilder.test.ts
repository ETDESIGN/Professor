import { describe, it, expect } from 'vitest';
import {
  normalizePair,
  detectMode,
  buildUnitPairs,
  takeWave,
  buildSpeedQuestions,
  starsFor,
  shuffle,
} from '../components/games/fastVocab/contentBuilder';
import type { PoolItem } from '../types/exercise';

// Deterministic rng stub: always swaps to the same index / picks index 0.
const fixedRng = () => 0.42;

function poolItem(over: Record<string, any>): PoolItem {
  return {
    id: 'pi-1',
    unit_id: 'unit-1',
    objective_id: 'obj-1',
    difficulty: 1,
    ...over,
  } as PoolItem;
}

function imageItem(word: string, objective: string, image = `https://img/${word}.png`) {
  return poolItem({
    id: `img-${word}`,
    objective_id: objective,
    exercise_type: 'IMAGE_SELECT',
    content: {
      prompt: word,
      prompt_audio: `https://audio/${word}.mp3`,
      options: [
        { image_url: `https://img/other-a.png` },
        { image_url: image },
        { image_url: `https://img/other-b.png` },
        { image_url: `https://img/other-c.png` },
      ],
      correct_index: 1,
    },
  });
}

function meaningItem(word: string, objective: string, meaning = `${word}的意思`) {
  return poolItem({
    id: `mean-${word}`,
    objective_id: objective,
    exercise_type: 'MEANING_MATCH',
    content: { prompt: word, options: ['错的意思', meaning, '另一个错'], correct_index: 1 },
  });
}

describe('normalizePair', () => {
  it('normalizes IMAGE_SELECT into a word+image pair with audio', () => {
    const pair = normalizePair(imageItem('cat', 'o-cat'));
    expect(pair).not.toBeNull();
    expect(pair!.word).toBe('cat');
    expect(pair!.imageUrl).toBe('https://img/cat.png');
    expect(pair!.objectiveId).toBe('o-cat');
    expect(pair!.audioUrl).toBe('https://audio/cat.mp3');
  });

  it('normalizes MEANING_MATCH into a word+meaning pair', () => {
    const pair = normalizePair(meaningItem('dog', 'o-dog', '狗'));
    expect(pair).not.toBeNull();
    expect(pair!.word).toBe('dog');
    expect(pair!.meaning).toBe('狗');
    expect(pair!.imageUrl).toBeUndefined();
  });

  it('rejects items without a usable correct option', () => {
    const broken = poolItem({
      exercise_type: 'IMAGE_SELECT',
      content: { prompt: 'x', options: [{ image_url: '' }], correct_index: 0 },
    });
    expect(normalizePair(broken)).toBeNull();
    expect(normalizePair(poolItem({ exercise_type: 'WORD_BANK_BUILD', content: {} }))).toBeNull();
  });
});

describe('detectMode', () => {
  it('picks image mode when ≥3 real IMAGE_SELECT items exist', () => {
    const items = [imageItem('a', 'oa'), imageItem('b', 'ob'), meaningItem('c', 'oc'), imageItem('d', 'od')];
    expect(detectMode(items)).toBe('image');
  });

  it('falls back to meaning mode below the threshold', () => {
    const items = [imageItem('a', 'oa'), imageItem('b', 'ob'), meaningItem('c', 'oc')];
    expect(detectMode(items)).toBe('meaning');
  });
});

describe('buildUnitPairs', () => {
  it('dedupes by objective (first item wins) and filters to the mode', () => {
    const items = [
      imageItem('cat', 'o-cat'),
      meaningItem('cat', 'o-cat'), // duplicate objective → dropped
      imageItem('dog', 'o-dog'),
      imageItem('owl', 'o-owl'),
      imageItem('fox', 'o-fox'),
    ];
    const pairs = buildUnitPairs(items, 'image');
    expect(pairs.map((p) => p.word)).toEqual(['cat', 'dog', 'owl', 'fox']);

    const meaningPairs = buildUnitPairs(
      [imageItem('cat', 'o-cat'), meaningItem('dog', 'o-dog')],
      'meaning',
    );
    expect(meaningPairs.map((p) => p.word)).toEqual(['dog']);
  });
});

describe('takeWave', () => {
  const pairs = ['a', 'b', 'c', 'd', 'e'].map((w, i) => ({
    id: `p-${w}`,
    objectiveId: `o-${w}`,
    exerciseType: 'IMAGE_SELECT',
    difficulty: 1 as const,
    word: w,
    imageUrl: `https://img/${w}.png`,
  }));

  it('advances the cursor without repeating words inside a wave', () => {
    const first = takeWave(pairs, 0, 3, fixedRng);
    expect(first.wave).toHaveLength(3);
    const ids = first.wave.map((p) => p.objectiveId);
    expect(new Set(ids).size).toBe(3);
    expect(first.nextCursor).toBe(3);

    const second = takeWave(pairs, first.nextCursor, 3, fixedRng);
    expect(second.wave).toHaveLength(3);
    // Wave 2 starts where wave 1 stopped (d, e, then wraps to a).
    expect(second.wave.map((p) => p.word).sort()).toEqual(['a', 'd', 'e']);
  });

  it('wraps on tiny pools without looping forever', () => {
    const tiny = pairs.slice(0, 2);
    const wave = takeWave(tiny, 1, 3, fixedRng);
    expect(wave.wave).toHaveLength(2);
  });

  it('returns empty on an empty pool', () => {
    expect(takeWave([], 0, 3).wave).toEqual([]);
  });
});

describe('buildSpeedQuestions', () => {
  it('builds questions from the wave with 3 distinct choices incl. the correct word', () => {
    const wave = [imageItem('cat', 'o-cat'), imageItem('dog', 'o-dog'), imageItem('owl', 'o-owl')].map((it) =>
      normalizePair(it)!,
    );
    const qs = buildSpeedQuestions(wave, wave, 'image', 2, fixedRng);
    expect(qs).toHaveLength(2);
    for (const q of qs) {
      expect(new Set(q.choices).size).toBe(q.choices.length);
      expect(q.choices).toContain(q.correctWord);
      expect(q.choices[q.correctIndex]).toBe(q.correctWord);
      expect(q.imageUrl).toBeTruthy();
      expect(q.meaning).toBeUndefined();
    }
    // The two questions target different objectives.
    expect(new Set(qs.map((q) => q.objectiveId)).size).toBe(2);
  });

  it('degrades to 2 choices when the pool has only 2 words', () => {
    const wave = [normalizePair(imageItem('cat', 'o-cat'))!, normalizePair(imageItem('dog', 'o-dog'))!];
    const qs = buildSpeedQuestions(wave, wave, 'image', 2, fixedRng);
    expect(qs).toHaveLength(2);
    expect(qs[0].choices).toHaveLength(2);
    expect(qs[0].choices).toContain(qs[0].correctWord);
  });

  it('meaning mode prompts with the meaning, not an image', () => {
    const wave = [meaningItem('cat', 'o-cat', '猫'), meaningItem('dog', 'o-dog', '狗'), meaningItem('owl', 'o-owl', '猫头鹰')].map(
      (it) => normalizePair(it)!,
    );
    const qs = buildSpeedQuestions(wave, wave, 'meaning', 1, fixedRng);
    expect(qs[0].meaning).toBeTruthy();
    expect(qs[0].imageUrl).toBeUndefined();
  });
});

describe('starsFor', () => {
  it('maps first-try accuracy to 1–5 stars', () => {
    expect(starsFor(5, 5)).toBe(5);
    expect(starsFor(4, 5)).toBe(4);
    expect(starsFor(3, 5)).toBe(3);
    expect(starsFor(1, 5)).toBe(1);
    expect(starsFor(0, 5)).toBe(1); // floor of 1 star whenever something was played
    expect(starsFor(0, 0)).toBe(0); // nothing played → no stars
  });
});

describe('shuffle', () => {
  it('never drops or duplicates elements', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(arr, fixedRng);
    expect(out.sort()).toEqual(arr);
    expect(arr).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // input untouched
  });
});
