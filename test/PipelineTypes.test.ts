import { describe, it, expect } from 'vitest';
import {
  LessonManifest,
  VocabAsset,
  GrammarRuleAsset,
  ThemeContext,
  ThemeCharacter,
  ActivityBlock,
} from '../types/pipeline';

describe('Pipeline Types - VocabAsset', () => {
  it('should accept a complete VocabAsset', () => {
    const asset: VocabAsset = {
      word: 'bus',
      definition: 'A large vehicle',
      distractors: ['train', 'car'],
      image_prompt: 'A red bus',
      context_sentence: 'The bus stops at every corner.',
    };
    expect(asset.word).toBe('bus');
    expect(asset.context_sentence).toBe('The bus stops at every corner.');
  });

  it('should work without optional context_sentence', () => {
    const asset: VocabAsset = {
      word: 'bus',
      definition: 'A large vehicle',
      distractors: [],
      image_prompt: 'A red bus',
    };
    expect(asset.context_sentence).toBeUndefined();
  });
});

describe('Pipeline Types - GrammarRuleAsset', () => {
  it('should accept a grammar rule with world_examples', () => {
    const rule: GrammarRuleAsset = {
      rule: 'There is / There are',
      explanation: 'Use there is for singular',
      world_examples: ['There is a bus at the stop.'],
    };
    expect(rule.world_examples!.length).toBe(1);
  });

  it('should work without optional world_examples', () => {
    const rule: GrammarRuleAsset = {
      rule: 'Past Tense',
      explanation: 'Add -ed to regular verbs',
    };
    expect(rule.world_examples).toBeUndefined();
  });
});

describe('Pipeline Types - ThemeContext', () => {
  it('should define a theme context with characters', () => {
    const ctx: ThemeContext = {
      setting: 'A busy city bus stop',
      characters: [
        { name: 'Leo', role: 'Student', emoji: '\uD83E\uDDD1' },
        { name: 'Ms. Chen', role: 'Teacher', emoji: '\uD83D\uDC69\u200D\u2708\uFE0F' },
      ],
      world_description: 'A city where people travel by bus and train.',
    };
    expect(ctx.characters.length).toBe(2);
    expect(ctx.characters[0].name).toBe('Leo');
  });
});

describe('Pipeline Types - LessonManifest', () => {
  it('should construct a complete manifest', () => {
    const manifest: LessonManifest = {
      meta: { unit_title: 'City Transport', theme: 'Transportation' },
      theme_context: {
        setting: 'City',
        characters: [{ name: 'Leo', role: 'Student', emoji: '\uD83E\uDDD1' }],
        world_description: 'A city scene',
      },
      knowledge_graph: {
        characters: [],
        vocabulary: [{ word: 'bus', definition: 'A vehicle', distractors: [], image_prompt: 'bus' }],
        grammar_rules: [],
      },
      timeline: [{ type: 'FOCUS', title: 'Vocab', duration: 10 }],
    };
    expect(manifest.theme_context!.setting).toBe('City');
    expect(manifest.timeline.length).toBe(1);
  });

  it('should work without optional theme_context', () => {
    const manifest: LessonManifest = {
      meta: { unit_title: 'Test', theme: 'Test' },
      knowledge_graph: { characters: [], vocabulary: [], grammar_rules: [] },
      timeline: [],
    };
    expect(manifest.theme_context).toBeUndefined();
  });
});
