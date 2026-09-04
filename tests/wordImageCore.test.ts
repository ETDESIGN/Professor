// tests/wordImageCore.test.ts
import { describe, it, expect } from 'vitest';
import {
  canonicalWordKey,
  canonicalVocabContent,
  vocabPromptHashFor,
  NEUTRAL_VOCAB_CONTEXT,
  planWordDedupe,
} from '../supabase/functions/_shared/wordImageCore';
import { composePrompt } from '../supabase/functions/_shared/illustrationCore';

const realUrl = (n: number) => `https://x.supabase.co/storage/v1/object/public/generated-media/images/u1/${n}.png`;
const asset = (n: number, created: string) => ({ id: `a${n}`, public_url: realUrl(n), created_at: created });

describe('canonicalWordKey', () => {
  it('trims, lowercases, collapses internal whitespace', () => {
    expect(canonicalWordKey('  Ice   Cream ')).toBe('ice cream');
    expect(canonicalWordKey('Rock')).toBe('rock');
  });
  it('keeps distinct words distinct (no plural folding)', () => {
    expect(canonicalWordKey('leaf')).not.toBe(canonicalWordKey('leaves'));
  });
  it('empty/null-safe', () => {
    expect(canonicalWordKey('')).toBe('');
    expect(canonicalWordKey(null as any)).toBe('');
  });
});

describe('canonicalVocabContent / neutral context', () => {
  it('embeds the word, not the unit', () => {
    expect(canonicalVocabContent('rock')).toContain('rock');
    const p = composePrompt('vocab', NEUTRAL_VOCAB_CONTEXT, canonicalVocabContent('rock'));
    expect(p).toContain('rock');
    expect(p).not.toContain('Unit context');
    expect(p).not.toContain('Art direction');
    expect(p).toMatch(/no text/i);
  });
});

describe('vocabPromptHashFor', () => {
  it('differs per owner for the same word (unique-index safety)', async () => {
    const a = await vocabPromptHashFor('m', 'rock', 'owner-1');
    const b = await vocabPromptHashFor('m', 'rock', 'owner-2');
    expect(a).not.toBe(b);
  });
  it('is deterministic for the same triple', async () => {
    expect(await vocabPromptHashFor('m', 'rock', 'o')).toBe(await vocabPromptHashFor('m', 'rock', 'o'));
  });
});

describe('planWordDedupe', () => {
  const rows = (owner: string | null, word: string, urls: string[]) =>
    urls.map((u, i) => ({ id: `${word}-${owner}-${i}`, unit_id: `u-${i}`, owner_id: owner, word, image_url: u }));

  it('picks the newest asset-backed URL as winner and plans repoints', () => {
    const input = [
      ...rows('t1', 'rock', [realUrl(1), realUrl(2), realUrl(2)]), // 2 units on newest URL 2
      ...rows('t1', 'tree', [realUrl(3)]),
    ];
    const assets = new Map([realUrl(1), realUrl(2), realUrl(3)].map((u, i) => [u, asset(i + 1, `2026-09-0${i + 1}`)]));
    const { plans, skippedNoOwner } = planWordDedupe(input, assets);
    expect(skippedNoOwner).toBe(0);
    const rock = plans.find((p) => p.word_key === 'rock')!;
    expect(rock.winnerUrl).toBe(realUrl(2));
    expect(rock.winnerAssetId).toBe('a2');
    expect(rock.repoint).toHaveLength(1); // only the row still on URL 1
    expect(rock.repoint[0].from_url).toBe(realUrl(1));
    expect(rock.retireAssetIds).toEqual(['a1']); // loser with no remaining references
    expect(plans.find((p) => p.word_key === 'tree')!.retireAssetIds).toEqual([]);
  });

  it('isolates owners and skips NULL-owner rows', () => {
    const input = [
      ...rows('t1', 'rock', [realUrl(1)]),
      ...rows('t2', 'rock', [realUrl(2)]),
      ...rows(null, 'rock', [realUrl(3)]),
    ];
    const assets = new Map([realUrl(1), realUrl(2), realUrl(3)].map((u, i) => [u, asset(i + 1, `2026-09-0${i + 1}`)]));
    const { plans, skippedNoOwner } = planWordDedupe(input, assets);
    expect(skippedNoOwner).toBe(1);
    expect(plans.map((p) => p.owner_id).sort()).toEqual(['t1', 't2']);
    // URL 3 is only referenced by the skipped NULL-owner row: never retired.
    expect(plans.flatMap((p) => p.retireAssetIds)).not.toContain('a3');
  });

  it('never retires a URL that wins for another word of the same owner', () => {
    const input = [
      ...rows('t1', 'rock', [realUrl(1), realUrl(2)]),
      ...rows('t1', 'pebble', [realUrl(2)]), // same URL reused by a second word
    ];
    const assets = new Map([realUrl(1), realUrl(2)].map((u, i) => [u, asset(i + 1, `2026-09-0${i + 1}`)]));
    const { plans } = planWordDedupe(input, assets);
    expect(plans.flatMap((p) => p.retireAssetIds)).not.toContain('a2'); // a2 wins 'pebble'
  });

  it('ignores placeholder URLs entirely', () => {
    const input = rows('t1', 'rock', ['https://api.dicebear.com/7.x/shapes/svg?seed=x', '']);
    const { plans } = planWordDedupe(input, new Map());
    expect(plans).toHaveLength(0);
  });

  it('emits one guarded replace statement per repoint pair', () => {
    const input = [...rows('t1', 'rock', [realUrl(1), realUrl(2)])];
    const assets = new Map([realUrl(1), realUrl(2)].map((u, i) => [u, asset(i + 1, `2026-09-0${i + 1}`)]));
    const { repointSqlStatements } = planWordDedupe(input, assets);
    expect(repointSqlStatements).toHaveLength(1);
    expect(repointSqlStatements[0]).toContain(`replace(content::text, '"${realUrl(1)}"', '"${realUrl(2)}"')`);
    expect(repointSqlStatements[0]).toContain('where content::text');
  });
});
