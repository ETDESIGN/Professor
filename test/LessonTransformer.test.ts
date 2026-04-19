import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({
        data: { below: 'simple text', on: 'on-level text', above: 'advanced text' },
        error: null,
      }),
    },
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

import { transformManifestToFlow } from '../services/LessonTransformer';
import { LessonManifest } from '../types/pipeline';

const makeManifest = (overrides: Partial<LessonManifest> = {}): LessonManifest => ({
  meta: {
    unit_title: 'Test Unit',
    theme: 'City Transportation',
    difficulty_cefr: 'A2',
  },
  knowledge_graph: {
    characters: [
      { name: 'Leo', role: 'Student', emoji: '\uD83E\uDDD1' },
      { name: 'Ms. Chen', role: 'Teacher', emoji: '\uD83D\uDC69\u200D\u2708\uFE0F' },
    ],
    vocabulary: [
      { word: 'bus', definition: 'A large vehicle', distractors: ['train', 'car', 'bicycle'], image_prompt: 'A red bus' },
      { word: 'taxi', definition: 'A car for hire', distractors: ['bus', 'plane', 'boat'], image_prompt: 'A yellow taxi' },
    ],
    grammar_rules: [
      { rule: 'There is / There are', explanation: 'Singular vs plural', world_examples: ['There is a bus at the stop.', 'There are taxis near the hotel.'] },
    ],
  },
  timeline: [
    { type: 'MEDIA', title: 'Warm Up Song', duration: 300 },
    { type: 'FOCUS_CARDS', title: 'Vocab Drill', duration: 600 },
    { type: 'GAME_ARENA', title: 'Speed Quiz', duration: 600 },
    { type: 'STORY', title: 'Story Time', duration: 600 },
  ],
  ...overrides,
});

describe('LessonTransformer', () => {
  it('should always start with an INTRO_SPLASH', async () => {
    const flow = await transformManifestToFlow(makeManifest());
    expect(flow[0].type).toBe('INTRO_SPLASH');
    expect(flow[0].title).toContain('Test Unit');
    expect(flow[0].data.theme).toBe('City Transportation');
  });

  it('should generate flow with correct number of steps', async () => {
    const flow = await transformManifestToFlow(makeManifest());
    expect(flow.length).toBe(5);
  });

  it('should map MEDIA type to MEDIA_PLAYER', async () => {
    const flow = await transformManifestToFlow(makeManifest());
    const media = flow.find(s => s.type === 'MEDIA_PLAYER');
    expect(media).toBeDefined();
    expect(media!.title).toBe('Warm Up Song');
    expect(media!.data.lyrics).toEqual([]);
    expect(media!.data.videoThumbnail).toContain('dicebear');
  });

  it('should map FOCUS_CARDS type with vocabulary cards', async () => {
    const flow = await transformManifestToFlow(makeManifest());
    const focus = flow.find(s => s.type === 'FOCUS_CARDS');
    expect(focus).toBeDefined();
    expect(focus!.data.cards.length).toBe(2);
    expect(focus!.data.cards[0].back).toBe('bus');
    expect(focus!.data.cards[1].back).toBe('taxi');
  });

  it('should map GAME_ARENA type to TEAM_BATTLE with questions', async () => {
    const flow = await transformManifestToFlow(makeManifest());
    const game = flow.find(s => s.type === 'TEAM_BATTLE');
    expect(game).toBeDefined();
    expect(game!.data.questions.length).toBe(2);
    expect(game!.data.questions[0].correct).toBe('bus');
  });

  it('should map STORY type to STORY_STAGE with pages', async () => {
    const flow = await transformManifestToFlow(makeManifest());
    const story = flow.find(s => s.type === 'STORY_STAGE');
    expect(story).toBeDefined();
    expect(story!.data.pages.length).toBe(1);
    expect(story!.data.readingLevels).toBeDefined();
  });

  it('should handle empty vocabulary gracefully', async () => {
    const manifest = makeManifest({
      knowledge_graph: {
        characters: [],
        vocabulary: [],
        grammar_rules: [],
      },
      timeline: [],
    });
    const flow = await transformManifestToFlow(manifest);
    expect(flow.length).toBe(1);
    expect(flow[0].type).toBe('INTRO_SPLASH');
  });

  it('should handle unknown activity types with fallback', async () => {
    const manifest = makeManifest({
      timeline: [{ type: 'UNKNOWN_TYPE', title: 'Mystery Step', duration: 100 }],
    });
    const flow = await transformManifestToFlow(manifest);
    const fallback = flow.find(s => s.id === 'step_1');
    expect(fallback).toBeDefined();
    expect(fallback!.type).toBe('INTRO_SPLASH');
    expect(fallback!.title).toBe('Mystery Step');
  });

  it('should use vocabulary from manifest when block config is empty', async () => {
    const manifest = makeManifest({
      timeline: [{ type: 'FOCUS', title: 'Vocab', duration: 300 }],
    });
    const flow = await transformManifestToFlow(manifest);
    const focus = flow.find(s => s.type === 'FOCUS_CARDS');
    expect(focus!.data.cards.length).toBe(2);
  });

  it('should generate proper image URLs with encoded seeds', async () => {
    const flow = await transformManifestToFlow(makeManifest());
    const focus = flow.find(s => s.type === 'FOCUS_CARDS');
    const card = focus!.data.cards[0];
    expect(card.image).toContain('bus');
    expect(card.image).not.toContain(' ');
  });
});
