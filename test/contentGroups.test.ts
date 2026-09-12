// contentGroups naming helpers (spec 2026-09-13): one batched AI call names
// every unnamed group; pickGroupNames guards the model's answer.
import { describe, it, expect } from 'vitest';
import { buildGroupNamingPrompt, pickGroupNames, wordsByStructure } from '../supabase/functions/_shared/contentGroups';

describe('buildGroupNamingPrompt', () => {
  it('carries words for vocab groups and excerpts for stories, never both', () => {
    const { sys, usr } = buildGroupNamingPrompt([
      { id: 'g1', kind: 'vocab_series', printed_label: 'Vocabulary 1', words: ['monday', 'tuesday'] },
      { id: 'g2', kind: 'story', printed_label: null, excerpt: 'Alex had a bad Monday...' },
    ]);
    expect(usr).toContain('printed_header');
    expect(usr).toContain('monday');
    expect(usr).toContain('Alex had a bad Monday');
    expect(usr).not.toContain('text_excerpt": "monday'); // vocab entries carry words, not excerpts
    expect(sys).toContain('Days of the week'); // rule example
  });
});

describe('pickGroupNames', () => {
  const ids = new Set(['g1', 'g2', 'g3']);

  it('accepts clean names for known ids', () => {
    const names = pickGroupNames({ names: [{ id: 'g1', title: 'Days of the week' }, { id: 'g2', title: 'The Friendly Farm' }] }, ids);
    expect(names.get('g1')).toBe('Days of the week');
    expect(names.get('g2')).toBe('The Friendly Farm');
    expect(names.size).toBe(2);
  });

  it('drops unknown ids, empty titles, quoted titles become clean, seed echoes rejected', () => {
    const names = pickGroupNames({
      names: [
        { id: 'nope', title: 'X' },
        { id: 'g1', title: '   ' },
        { id: 'g2', title: '"The Friendly Farm"' },
        { id: 'g3', title: 'Series 1' },
      ],
    }, ids);
    expect(names.size).toBe(1);
    expect(names.get('g2')).toBe('The Friendly Farm');
  });

  it('truncates oversized titles and strips trailing periods', () => {
    const long = 'A'.repeat(80);
    const names = pickGroupNames({ names: [{ id: 'g1', title: long }, { id: 'g2', title: 'Story.' }] }, ids);
    expect(names.get('g1')!.length).toBe(60);
    expect(names.get('g2')).toBe('Story');
  });

  it('tolerates garbage input', () => {
    expect(pickGroupNames(null, ids).size).toBe(0);
    expect(pickGroupNames({ names: 'nope' }, ids).size).toBe(0);
  });
});

describe('wordsByStructure', () => {
  it('groups basket words by structure id, skipping incomplete rows', () => {
    const m = wordsByStructure([
      { word: 'monday', structure_id: 's1' },
      { word: 'swim', structure_id: 's2' },
      { word: '', structure_id: 's1' },
      { word: 'orphan' },
    ]);
    expect(m.get('s1')).toEqual(['monday']);
    expect(m.get('s2')).toEqual(['swim']);
    expect(m.size).toBe(2);
  });
});
