// Media resolver core (media-resolution design §4.1): pure logic for the
// catalog-first resolution ladder — age-band mapping, title normalization +
// similarity (the hallucination gate), channel allowlist tiers, duration
// sanity, candidate ranking, catalog scoring, and auto-apply policy.
// Pure TypeScript — NO Deno imports — so vitest and the edge runtime share
// the exact same behavior (same contract as bookScan.ts / storySegments.ts).
import { describe, expect, it } from 'vitest';
import {
  ageBandFromGrade,
  ageBandFromManifest,
  normalizeTitle,
  titleSimilarity,
  channelTier,
  durationOk,
  rankCandidates,
  scoreCatalogEntry,
  autoApplyAllowed,
  type MediaCandidate,
  type AgeBand,
} from '../supabase/functions/_shared/mediaResolverCore';

describe('ageBandFromGrade — teacher-declared grades map to bands', () => {
  it('maps Pre-K/Kindergarten to toddler', () => {
    expect(ageBandFromGrade('Pre-K')).toBe('toddler');
    expect(ageBandFromGrade('Kindergarten')).toBe('toddler');
  });
  it('maps 1st-3rd Grade to early_primary', () => {
    expect(ageBandFromGrade('1st Grade')).toBe('early_primary');
    expect(ageBandFromGrade('2nd Grade')).toBe('early_primary');
    expect(ageBandFromGrade('3rd Grade')).toBe('early_primary');
  });
  it('maps 4th-6th Grade to upper_primary', () => {
    expect(ageBandFromGrade('4th Grade')).toBe('upper_primary');
    expect(ageBandFromGrade('6th Grade')).toBe('upper_primary');
  });
  it('maps ESL Beginner to early_primary (the safe default for young ESL learners)', () => {
    expect(ageBandFromGrade('ESL Beginner')).toBe('early_primary');
  });
  it('maps CEFR guesses: Pre-A1/A1 early, A2 upper, B1 teen', () => {
    expect(ageBandFromGrade('A1')).toBe('early_primary');
    expect(ageBandFromGrade('A2')).toBe('upper_primary');
    expect(ageBandFromGrade('B1')).toBe('teen');
  });
  it('returns null for unknown/empty/General', () => {
    expect(ageBandFromGrade('General')).toBeNull();
    expect(ageBandFromGrade('')).toBeNull();
    expect(ageBandFromGrade(null)).toBeNull();
    expect(ageBandFromGrade(undefined)).toBeNull();
  });
});

describe('ageBandFromManifest — reads the AI-guessed CEFR fields', () => {
  it('reads gradeLevel', () => {
    expect(ageBandFromManifest({ gradeLevel: 'A1/A2' })).toBe('early_primary'); // first match wins, A1 before A2
  });
  it('reads meta.difficulty_cefr as fallback', () => {
    expect(ageBandFromManifest({ meta: { difficulty_cefr: 'B1' } })).toBe('teen');
  });
  it('returns null when nothing usable', () => {
    expect(ageBandFromManifest({})).toBeNull();
    expect(ageBandFromManifest(null)).toBeNull();
  });
});

describe('normalizeTitle / titleSimilarity — the hallucination gate', () => {
  it('strips case, punctuation, pipes and promo noise words', () => {
    const tokens = normalizeTitle('One Little Finger featuring @NoodleAndPals | Kids Song | Super Simple Songs');
    expect(tokens).toContain('one');
    expect(tokens).toContain('little');
    expect(tokens).toContain('finger');
    expect(tokens).not.toContain('featuring');
    expect(tokens).not.toContain('noodleandpals');
    expect(tokens).not.toContain('kids');
    expect(tokens).not.toContain('song');
    expect(tokens).not.toContain('super');
  });
  it('same song, different channel promos → high similarity', () => {
    const a = 'One Little Finger featuring @NoodleAndPals | Kids Song | Super Simple Songs';
    const b = 'One Little Finger | Noodle & Pals | Songs For Children';
    expect(titleSimilarity(a, b)).toBeGreaterThanOrEqual(0.5);
  });
  it('different songs → low similarity', () => {
    expect(titleSimilarity('Head Shoulders Knees & Toes (Sing It)', 'Rain Rain Go Away')).toBeLessThan(0.2);
  });
  it('identical normalized titles → 1', () => {
    expect(titleSimilarity('Clean Up Song!!', 'clean up song')).toBe(1);
  });
});

describe('channelTier — ESL value ranking (auto-apply allowlist)', () => {
  it('tier 0: ESL-native channels', () => {
    expect(channelTier('Super Simple Songs - Kids Songs')).toBe(0);
    expect(channelTier('STEVE AND MAGGIE')).toBe(0);
    expect(channelTier('The Singing Walrus - English Songs For Kids')).toBe(0);
    expect(channelTier('Dream English Kids')).toBe(0);
  });
  it('tier 1: classroom staples', () => {
    expect(channelTier('Jack Hartmann Kids Music Channel')).toBe(1);
    expect(channelTier('Sesame Street')).toBe(1);
  });
  it('tier 2: kids entertainment', () => {
    expect(channelTier('Cocomelon - Nursery Rhymes')).toBe(2);
    expect(channelTier('Baby Shark - Pinkfong Kids’ Songs & Stories')).toBe(2);
  });
  it('tier 3: unknown channel — never auto-applies', () => {
    expect(channelTier('Some Random Guy')).toBe(3);
    expect(channelTier('')).toBe(3);
  });
});

describe('durationOk — song/video sanity windows', () => {
  it('songs: 45s..8min pass; shorter/longer fail', () => {
    expect(durationOk(200, 'song')).toBe(true);
    expect(durationOk(30, 'song')).toBe(false);
    expect(durationOk(4000, 'song')).toBe(false); // the 1-hour compilation problem
  });
  it('videos get a wider window up to 15min', () => {
    expect(durationOk(700, 'video')).toBe(true);
    expect(durationOk(1200, 'video')).toBe(false);
  });
  it('unknown duration passes (cannot judge — ranked lower instead)', () => {
    expect(durationOk(null, 'song')).toBe(true);
    expect(durationOk(undefined, 'song')).toBe(true);
  });
});

describe('rankCandidates — deterministic preference order', () => {
  it('prefers ESL-native channel over entertainment channel', () => {
    const cands: MediaCandidate[] = [
      { title: 'Colors Song', channel: 'Cocomelon - Nursery Rhymes', source: 'ai', durationSec: 150 },
      { title: 'Colors Song', channel: 'The Singing Walrus - English Songs For Kids', source: 'ai', durationSec: 150 },
    ];
    expect(rankCandidates(cands, { kind: 'song' })[0].channel).toContain('Singing Walrus');
  });
  it('prefers duration-sane over insane at equal tier (kills compilations)', () => {
    const cands: MediaCandidate[] = [
      { title: 'One Little Finger + More', channel: 'Super Simple Songs - Kids Songs', source: 'ai', durationSec: 4211 },
      { title: 'One Little Finger', channel: 'Super Simple Songs - Kids Songs', source: 'ai', durationSec: 145 },
    ];
    expect(rankCandidates(cands, { kind: 'song' })[0].durationSec).toBe(145);
  });
  it('prefers the age-band match at equal tier', () => {
    const cands: MediaCandidate[] = [
      { title: 'Hello Song', channel: 'Dream English Kids', source: 'catalog', durationSec: 100, ageBands: ['upper_primary'] },
      { title: 'Hello Song', channel: 'Dream English Kids', source: 'catalog', durationSec: 100, ageBands: ['toddler', 'early_primary'] },
    ];
    expect(rankCandidates(cands, { kind: 'song', ageBand: 'early_primary' })[0].ageBands).toContain('early_primary');
  });
});

describe('scoreCatalogEntry — catalog match scoring (ladder rungs 1-3)', () => {
  const entry = (over: Partial<{ title: string; topics: string[]; ageBands: AgeBand[] }> = {}) =>
    ({ title: 'One Little Finger | Kids Song', topics: ['body'], ageBands: ['toddler', 'early_primary'] as AgeBand[], ...over });

  it('exact-ish suggestion title match dominates (rung 2)', () => {
    const s = scoreCatalogEntry(entry({}), {
      kind: 'song', suggestionTitle: 'One Little Finger', topic: 'body parts', vocab: [],
    });
    const weak = scoreCatalogEntry(entry({ title: 'Rain Rain Go Away', topics: ['weather'] }), {
      kind: 'song', suggestionTitle: 'One Little Finger', topic: 'body parts', vocab: [],
    });
    expect(s).toBeGreaterThan(weak);
    expect(s).toBeGreaterThanOrEqual(5);
  });
  it('topic + age match scores above threshold; total miss scores 0', () => {
    const s = scoreCatalogEntry(entry({}), { kind: 'song', topic: 'my body', vocab: ['finger'], ageBand: 'early_primary' });
    expect(s).toBeGreaterThanOrEqual(2);
    const miss = scoreCatalogEntry(entry({ topics: ['weather'] }), { kind: 'song', topic: 'transport', vocab: ['bus'], ageBand: 'teen' });
    expect(miss).toBe(0);
  });
  it('vocabulary overlap adds score', () => {
    const none = scoreCatalogEntry(entry({}), { kind: 'song', topic: 'body', vocab: [] });
    const withVocab = scoreCatalogEntry(entry({}), { kind: 'song', topic: 'body', vocab: ['finger', 'head', 'arm'] });
    expect(withVocab).toBeGreaterThan(none);
  });
  it('topic tokens hitting the entry TITLE add +1 — the best topic match is deterministic and auto-applies', () => {
    // Real regression (owner report 2026-09-05, "A Day at the Zoo"): topic
    // "Animals and nature" tag-matches several animals entries at 2 (<3) and
    // the pick among ties was arbitrary — nothing resolved. The entry whose
    // TITLE also shares a topic token must outrank the rest and reach 3.
    const farm = scoreCatalogEntry(entry({ title: 'The Animals On The Farm', topics: ['animals_farm'] }), { kind: 'song', topic: 'Animals and nature', vocab: [] });
    const jungle = scoreCatalogEntry(entry({ title: 'Walking In The Jungle', topics: ['animals_zoo'] }), { kind: 'song', topic: 'Animals and nature', vocab: [] });
    expect(farm).toBe(3);
    expect(jungle).toBe(2);
    expect(farm).toBeGreaterThan(jungle);
  });
});

describe('autoApplyAllowed — the age-safety gate', () => {
  it('catalog/book/teacher sources apply when duration is sane', () => {
    expect(autoApplyAllowed({ title: 'x', channel: 'Super Simple Songs - Kids Songs', source: 'catalog', durationSec: 120 }, 'song')).toBe(true);
    expect(autoApplyAllowed({ title: 'x', channel: 'Super Simple Songs - Kids Songs', source: 'book', durationSec: 120 }, 'song')).toBe(true);
  });
  it('catalog entry with insane duration is NOT auto-applied', () => {
    expect(autoApplyAllowed({ title: 'x', channel: 'Super Simple Songs - Kids Songs', source: 'catalog', durationSec: 4000 }, 'song')).toBe(false);
  });
  it('AI candidate from a known (allowlisted) channel applies; unknown channel never does', () => {
    expect(autoApplyAllowed({ title: 'x', channel: 'Maple Leaf Learning', source: 'ai', durationSec: 100 }, 'song')).toBe(true);
    expect(autoApplyAllowed({ title: 'x', channel: 'Random Uploads', source: 'ai', durationSec: 100 }, 'song')).toBe(false);
  });
  it('teacher source is always the truth (even odd durations)', () => {
    expect(autoApplyAllowed({ title: 'x', channel: 'Anyone', source: 'teacher' }, 'song')).toBe(true);
  });
});
