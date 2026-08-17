import { describe, it, expect } from 'vitest';
import type { PoolItem } from '../types/exercise';
import {
  frozenToWords,
  poolToWords,
  shuffle,
  starsForRun,
  takeRound,
  takeWave,
  vocabularyToWords,
} from '../components/games/spellingBee/contentBuilder';
import { mulberry32, hashString } from '../components/games/spellingBee/keyboardEngine';

const item = (over: Record<string, any>): PoolItem =>
  ({
    id: `pi-${over.objective_id}-${over.exercise_type}`,
    unit_id: 'unit-1',
    difficulty: 1,
    ...over,
  }) as PoolItem;

describe('poolToWords', () => {
  it('merges IMAGE_SELECT + MEANING_MATCH per objective and filters placeholders', () => {
    const words = poolToWords([
      item({
        objective_id: 'obj-truck',
        exercise_type: 'IMAGE_SELECT',
        difficulty: 2,
        content: {
          prompt: 'truck',
          options: [{ image_url: 'https://cdn.example.com/truck.png' }, { image_url: 'https://api.dicebear.com/x.svg' }],
          correct_index: 0,
        },
      }),
      item({
        objective_id: 'obj-truck',
        exercise_type: 'MEANING_MATCH',
        difficulty: 1,
        content: { prompt: 'truck', options: ['卡车', '船'], correct_index: 0, prompt_audio: 'https://cdn.example.com/a.mp3' },
      }),
    ]);
    expect(words).toHaveLength(1);
    const w = words[0];
    expect(w.word).toBe('truck');
    expect(w.letters).toBe('TRUCK');
    expect(w.imageUrl).toBe('https://cdn.example.com/truck.png'); // dicebear filtered
    expect(w.meaning).toBe('卡车');
    expect(w.audioUrl).toBe('https://cdn.example.com/a.mp3');
    expect(w.difficulty).toBe(2); // max across the objective
    expect(w.objectiveId).toBe('obj-truck');
  });

  it('covers DICTATION-only objectives via correct_text', () => {
    const words = poolToWords([
      item({
        objective_id: 'obj-d1',
        exercise_type: 'DICTATION',
        difficulty: 3,
        content: { prompt_text: 'helicopter', audio_url: 'https://cdn.example.com/h.mp3', correct_text: 'helicopter' },
      }),
    ]);
    expect(words).toHaveLength(1);
    expect(words[0].word).toBe('helicopter');
    expect(words[0].letters).toBe('HELICOPTER');
    expect(words[0].audioUrl).toBe('https://cdn.example.com/h.mp3');
    expect(words[0].difficulty).toBe(3);
  });

  it('drops words outside the 3–12 keyboard band', () => {
    const words = poolToWords([
      item({ objective_id: 'o1', exercise_type: 'DICTATION', content: { correct_text: 'ox' } }),
      item({ objective_id: 'o2', exercise_type: 'DICTATION', content: { correct_text: 'extraordinarily' } }),
      item({ objective_id: 'o3', exercise_type: 'DICTATION', content: { correct_text: 'train' } }),
    ]);
    expect(words.map((w) => w.word)).toEqual(['train']);
  });
});

describe('vocabularyToWords', () => {
  it('maps the getVocabulary shape with synthesized objective ids', () => {
    const words = vocabularyToWords([
      { word: 'Ice Cream', image_url: 'https://cdn.example.com/ic.png', audio_url: 'https://cdn.example.com/ic.mp3', l1_translation: '冰淇淋' },
      { word: 'train', image_url: 'https://api.dicebear.com/t.svg' },
      { word: '' },
    ]);
    expect(words).toHaveLength(2);
    expect(words[0]).toMatchObject({
      word: 'Ice Cream',
      letters: 'ICECREAM',
      objectiveId: 'vocab:ICECREAM',
      exerciseType: 'VOCAB_FALLBACK',
      imageUrl: 'https://cdn.example.com/ic.png',
      audioUrl: 'https://cdn.example.com/ic.mp3',
      meaning: '冰淇淋',
    });
    expect(words[1].imageUrl).toBeUndefined(); // dicebear filtered
  });
});

describe('frozenToWords', () => {
  it('accepts a plain legacy string list', () => {
    const words = frozenToWords(['bus', 42, 'skateboard']);
    expect(words.map((w) => w.word)).toEqual(['bus', 'skateboard']);
    expect(words.every((w) => w.exerciseType === 'FROZEN')).toBe(true);
  });
});

describe('dedupe (via vocabularyToWords)', () => {
  it('collapses duplicates by normalized letters', () => {
    const words = vocabularyToWords([{ word: 'Train' }, { word: 'train' }, { word: 'TRAIN' }]);
    expect(words).toHaveLength(1);
  });
});

describe('takeWave', () => {
  const POOL = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'].map((l, i) => ({
    id: `w${i}`,
    objectiveId: `w${i}`,
    exerciseType: 'FROZEN',
    difficulty: 1 as const,
    word: l.toLowerCase(),
    letters: l,
  }));

  it('deals consecutive slices without repeating within a wave', () => {
    const first = takeWave(POOL, 0, 3);
    expect(first.wave.map((w) => w.id)).toEqual(['w0', 'w1', 'w2']);
    expect(first.nextCursor).toBe(3);
    const second = takeWave(POOL, first.nextCursor, 3);
    expect(second.wave.map((w) => w.id)).toEqual(['w3', 'w4', 'w0']); // wraps
    const uniq = new Set(second.wave.map((w) => w.id));
    expect(uniq.size).toBe(3);
  });

  it('handles a pool smaller than the wave size', () => {
    const { wave } = takeWave(POOL.slice(0, 2), 0, 5);
    expect(wave).toHaveLength(2);
  });

  it('returns empty on an empty pool', () => {
    expect(takeWave([], 0, 5).wave).toEqual([]);
  });
});

describe('takeRound', () => {
  const POOL = Array.from({ length: 8 }, (_, i) => ({
    id: `w${i}`,
    objectiveId: `w${i}`,
    exerciseType: 'FROZEN' as const,
    difficulty: 1 as const,
    word: `word${i}`,
    letters: `WORD${i}`.replace(/\d/g, '') + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i], // distinct letters
  }));

  it('is deterministic per (unitId, roundIndex) and covers the pool across rounds', () => {
    const r1a = takeRound(POOL, 'unit-1', 1, 5);
    const r1b = takeRound(POOL, 'unit-1', 1, 5);
    expect(r1a.map((w) => w.id)).toEqual(r1b.map((w) => w.id));
    const r2 = takeRound(POOL, 'unit-1', 2, 5);
    expect(new Set(r1a.map((w) => w.id))).not.toEqual(new Set(r2.map((w) => w.id))); // different deal
    const ids = new Set([...r1a, ...r2].map((w) => w.id));
    expect(ids.size).toBe(8); // full coverage over two rounds
  });
});

describe('shuffle', () => {
  it('is deterministic with the injected rng and keeps every element', () => {
    const rng = mulberry32(hashString('shuffle'));
    const a = shuffle([1, 2, 3, 4, 5], rng);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('starsForRun', () => {
  it('maps solved ratio and mistakes onto the 0–5 star scale', () => {
    expect(starsForRun(5, 5, 0)).toBe(5);
    expect(starsForRun(5, 5, 2)).toBe(4);
    expect(starsForRun(5, 5, 4)).toBe(3);
    expect(starsForRun(4, 5, 1)).toBe(3);
    expect(starsForRun(3, 5, 0)).toBe(2);
    expect(starsForRun(2, 5, 0)).toBe(1);
    expect(starsForRun(0, 0, 0)).toBe(0);
  });
});
