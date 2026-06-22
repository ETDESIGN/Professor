import { describe, it, expect } from 'vitest';
import { normalizeManifest, getVocabulary } from '../services/manifest';

describe('normalizeManifest (Phase 2 data contract)', () => {
  it('returns an empty canonical manifest for null/undefined', () => {
    const m = normalizeManifest(null);
    expect(m.vocabulary).toEqual([]);
    expect(m.grammar).toEqual([]);
    expect(m.timeline).toEqual([]);
    expect(m.meta.unit_title).toBe('Lesson');
  });

  it('normalizes the enriched_content shape (enrich-unit output)', () => {
    const m = normalizeManifest({
      meta: { unit_title: 'Animals', theme: 'zoo', difficulty_cefr: 'A1' },
      enriched_content: {
        title: 'Animals',
        topic: 'zoo',
        gradeLevel: 'A1',
        description: 'A trip to the zoo',
        vocabulary: [
          { word: 'zoo', definition: 'animal park', example_sentence: 'We go to the zoo.', distractors: ['park', 'shop'] },
          { word: '  lion  ', definition: 'big cat', context_sentence: 'The lion roars.' },
        ],
        grammar: [{ rule: 'Plurals', explanation: 'add s', examples: ['cats', 'dogs'] }],
        characters: [{ name: 'Leo' }],
        story: { title: 'A Day at the Zoo', setting: 'zoo', pages: [{ text: 'page1', speaker: 'Leo' }] },
        song_suggestions: [{ title: 'song' }],
        video_suggestions: [],
        dialogues: [],
      },
    });

    expect(m.meta.unit_title).toBe('Animals');
    expect(m.meta.theme).toBe('zoo');
    expect(m.meta.difficulty_cefr).toBe('A1');
    expect(m.vocabulary).toHaveLength(2);
    // whitespace trimmed
    expect(m.vocabulary[1].word).toBe('lion');
    // example_sentence normalized from context_sentence fallback
    expect(m.vocabulary[1].example_sentence).toBe('The lion roars.');
    expect(m.vocabulary[0].distractors).toEqual(['park', 'shop']);
    expect(m.grammar[0].examples).toEqual(['cats', 'dogs']);
    expect(m.characters).toHaveLength(1);
    expect(m.story.pages).toHaveLength(1);
    expect(m.song_suggestions).toHaveLength(1);
  });

  it('normalizes the knowledge_graph shape (AssetWorkshop/LessonTransformer)', () => {
    const m = normalizeManifest({
      meta: { unit_title: 'Food', theme: 'fruit' },
      knowledge_graph: {
        vocabulary: [{ word: 'apple', definition: 'red fruit' }],
        grammar_rules: [{ rule: 'Articles', world_examples: ['an apple'] }],
        characters: [],
        narrative_arc: 'A story about fruit.',
      },
      timeline: [{ type: 'FOCUS_CARDS', title: 'Vocab' }],
    });

    expect(m.vocabulary[0].word).toBe('apple');
    // examples normalized from world_examples
    expect(m.grammar[0].examples).toEqual(['an apple']);
    expect(m.timeline).toHaveLength(1);
    // narrative_arc with no story -> synthesised single page
    expect(m.story.pages[0].text).toBe('A story about fruit.');
  });

  it('normalizes a flat approvedAssets payload', () => {
    const m = normalizeManifest({
      title: 'Colors',
      topic: 'colors',
      gradeLevel: 'A2',
      vocabulary: [{ word: 'red' }, { word: 'blue' }],
      grammar: [{ rule: 'Adjectives' }],
      characters: [{ name: 'Pixie' }],
      story: { pages: [{ text: 'p' }] },
    });

    expect(m.meta.unit_title).toBe('Colors');
    expect(m.meta.theme).toBe('colors');
    expect(m.vocabulary.map((v) => v.word)).toEqual(['red', 'blue']);
  });

  it('drops vocab/grammar entries missing the key field', () => {
    const m = normalizeManifest({
      enriched_content: {
        vocabulary: [{ word: 'ok' }, { definition: 'no word' }, { word: '   ' }],
        grammar: [{ explanation: 'no rule' }, { rule: 'Good' }],
      },
    });
    expect(m.vocabulary).toHaveLength(1);
    expect(m.vocabulary[0].word).toBe('ok');
    expect(m.grammar).toHaveLength(1);
    expect(m.grammar[0].rule).toBe('Good');
  });

  it('getVocabulary tolerates any shape', () => {
    expect(getVocabulary({ enriched_content: { vocabulary: [{ word: 'x' }] } })).toHaveLength(1);
    expect(getVocabulary({ knowledge_graph: { vocabulary: [{ word: 'y' }] } })).toHaveLength(1);
    expect(getVocabulary(undefined)).toEqual([]);
  });
});
