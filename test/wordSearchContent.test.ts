import { describe, it, expect } from 'vitest';
import type { PoolItem } from '../types/exercise';
import {
  detectClueMode,
  frozenToWords,
  gridReady,
  poolToWords,
  takeRound,
  toGridWords,
  vocabularyToWords,
} from '../apps/board/templates/wordSearch/content';

const imageItem = (word: string, objectiveId: string, imageUrl = 'https://example.com/a.png'): PoolItem => ({
  id: `pi-img-${word}`,
  unit_id: 'u1',
  objective_id: objectiveId,
  exercise_type: 'IMAGE_SELECT',
  difficulty: 1,
  content: {
    type: 'IMAGE_SELECT',
    prompt: word,
    prompt_audio: `https://example.com/${word}.mp3`,
    options: [{ image_url: imageUrl }, { image_url: 'https://example.com/b.png' }],
    correct_index: 0,
  },
} as any as PoolItem);

const meaningItem = (word: string, objectiveId: string, meaning: string, difficulty = 2): PoolItem => ({
  id: `pi-mean-${word}`,
  unit_id: 'u1',
  objective_id: objectiveId,
  exercise_type: 'MEANING_MATCH',
  difficulty,
  content: {
    type: 'MEANING_MATCH',
    prompt: word,
    options: [meaning, '别的', '其他'],
    correct_index: 0,
  },
} as any as PoolItem);

describe('poolToWords', () => {
  it('merges IMAGE_SELECT + MEANING_MATCH per objective, one word each', () => {
    const words = poolToWords([
      imageItem('DANCER', 'obj-1'),
      meaningItem('DANCER', 'obj-1', '舞者', 2),
      imageItem('PILOT', 'obj-2'),
    ]);
    expect(words).toHaveLength(2);
    const dancer = words.find((w) => w.word === 'DANCER')!;
    expect(dancer.objectiveId).toBe('obj-1');
    expect(dancer.letters).toBe('DANCER');
    expect(dancer.imageUrl).toBe('https://example.com/a.png');
    expect(dancer.audioUrl).toBe('https://example.com/DANCER.mp3');
    expect(dancer.meaning).toBe('舞者');
    // Difficulty takes the max across the objective's items.
    expect(dancer.difficulty).toBe(2);
  });

  it('drops words too short or too long for the grid', () => {
    const words = poolToWords([
      imageItem('AT', 'obj-a'),
      imageItem('CONVERSATION', 'obj-b'), // 12 letters > MAX_GRID 10
      imageItem('NURSE', 'obj-c'),
    ]);
    expect(words.map((w) => w.word)).toEqual(['NURSE']);
  });

  it('treats dicebear placeholder images as absent', () => {
    const words = poolToWords([
      imageItem('CAT', 'obj-1', 'https://api.dicebear.com/7.x/shapes/svg?seed=cat'),
    ]);
    expect(words[0].imageUrl).toBeUndefined();
  });

  it('skips items without a prompt', () => {
    const broken = { ...imageItem('CAT', 'obj-1'), content: { options: [] } } as any as PoolItem;
    expect(poolToWords([broken])).toHaveLength(0);
  });
});

describe('vocabularyToWords', () => {
  it('maps the getVocabulary shape with ids that mark the fallback source', () => {
    const words = vocabularyToWords([
      { word: 'ice cream', image_url: 'https://example.com/ice.png', audio_url: 'https://example.com/ice.mp3', l1_translation: '冰淇淋' },
      { word: '', image_url: 'x' },
      { word: 'ok' }, // too short after normalize? "ok" is 2 letters → dropped
    ]);
    expect(words).toHaveLength(1);
    expect(words[0]).toMatchObject({
      word: 'ice cream',
      letters: 'ICECREAM',
      objectiveId: 'vocab:ICECREAM',
      exerciseType: 'VOCAB_FALLBACK',
      meaning: '冰淇淋',
    });
  });
});

describe('frozenToWords / gridReady', () => {
  it('builds frozen words from raw strings', () => {
    const words = frozenToWords(['Farmer', 'no!', 'WAITER']);
    expect(words.map((w) => w.letters)).toEqual(['FARMER', 'WAITER']);
  });
  it('gridReady dedupes by normalized letters', () => {
    const words = gridReady([
      { id: 'a', objectiveId: 'a', exerciseType: 'X', difficulty: 1, word: 'Cat', letters: 'CAT' },
      { id: 'b', objectiveId: 'b', exerciseType: 'X', difficulty: 1, word: 'CAT', letters: 'CAT' },
    ]);
    expect(words).toHaveLength(1);
  });
});

describe('detectClueMode', () => {
  const base = (id: string, imageUrl?: string) => ({
    id, objectiveId: id, exerciseType: 'X', difficulty: 1 as const,
    word: id, letters: id.toUpperCase(), imageUrl,
  });
  it('image mode needs ≥3 real images', () => {
    expect(detectClueMode([base('aaa'), base('bbb'), base('ccc')])).toBe('text');
    expect(detectClueMode([
      base('aaa', 'https://x/1.png'), base('bbb', 'https://x/2.png'), base('ccc', 'https://x/3.png'),
    ])).toBe('image');
  });
});

describe('takeRound', () => {
  const pool = Array.from({ length: 7 }, (_, i) => ({
    id: `w${i}`, objectiveId: `o${i}`, exerciseType: 'X', difficulty: 1 as const,
    word: `word${i}`, letters: `WORD${i}`.slice(0, 7),
  }));

  it('deals sequential non-repeating rounds with wrap-around', () => {
    const r1 = takeRound(pool, 1, 5, () => 0.5);
    const r2 = takeRound(pool, 2, 5, () => 0.5);
    expect(r1).toHaveLength(5);
    expect(r2).toHaveLength(5);
    const ids1 = new Set(r1.map((w) => w.id));
    expect(ids1.size).toBe(5); // no dupes within a round
    // Rounds 1+2 cover all 7 words exactly once (5 + wrap of 2).
    expect(new Set([...r1, ...r2].map((w) => w.id)).size).toBe(7);
  });

  it('shrinks on tiny pools without repeating', () => {
    const r = takeRound(pool.slice(0, 2), 3, 5, () => 0.1);
    expect(r).toHaveLength(2);
  });

  it('is deterministic for a fixed rng', () => {
    const a = takeRound(pool, 1, 5, () => 0.3);
    const b = takeRound(pool, 1, 5, () => 0.3);
    expect(a.map((w) => w.id)).toEqual(b.map((w) => w.id));
  });
});

describe('toGridWords', () => {
  it('carries id + letters only', () => {
    expect(toGridWords([
      { id: 'x', objectiveId: 'x', exerciseType: 'X', difficulty: 1, word: 'Cat', letters: 'CAT' },
    ])).toEqual([{ id: 'x', letters: 'CAT' }]);
  });
});
