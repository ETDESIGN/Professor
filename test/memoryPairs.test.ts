import { describe, it, expect } from 'vitest';
import { buildMemoryPairs } from '../apps/student/steps/memoryPairs';

describe('buildMemoryPairs (Memory Lab content)', () => {
  const vocab = [
    { word: 'zoo', l1_translation: '动物园', audio_url: 'https://a/1.mp3' },
    { word: 'bear', l1_translation: '熊' },
    { word: 'snake', definition: 'A long thin animal with no legs.' },
    { word: 'nothing', phonetic: '/x/' }, // no translation AND no definition -> dropped
    { word: 'Zoo', l1_translation: '重复' }, // dupe of zoo (case-insensitive) -> dropped
    { word: 'tiger', l1_translation: '老虎' },
    { word: 'monkey', l1_translation: '猴子' },
    { word: 'zebra', l1_translation: '斑马' },
    { word: 'giraffe', l1_translation: '长颈鹿' },
  ];

  it('builds word ↔ meaning pairs, drops unmatchable + dupes, caps at max', () => {
    const pairs = buildMemoryPairs(vocab, 4, () => 0.99); // descending-safe constant rng
    expect(pairs).toHaveLength(4);
    const words = pairs.map((p) => p.left);
    expect(words).not.toContain('nothing');
    expect(new Set(words).size).toBe(4);
    for (const p of pairs) expect(p.right.length).toBeGreaterThan(0);
  });

  it('falls back to the definition when no L1 translation exists', () => {
    const pairs = buildMemoryPairs([{ word: 'snake', definition: 'A long thin animal.' }], 6, () => 0.5);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].right).toBe('A long thin animal.');
  });

  it('under 2 usable pairs returns what exists (caller shows error screen at <2)', () => {
    expect(buildMemoryPairs([{ word: 'x' }], 6)).toHaveLength(0);
  });
});
