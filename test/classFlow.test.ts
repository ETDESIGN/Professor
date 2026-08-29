import { describe, it, expect } from 'vitest';
import { buildClassFlow, type ClassContent } from '../supabase/functions/_shared/classFlow';

const content: ClassContent = {
  title: 'Class 1 — Countryside',
  theme: 'farm animals',
  vocab: [
    { word: 'tractor', definition: 'a farm vehicle', example_sentence: 'The tractor is red.', image_url: 'https://x/tractor.png' },
    { word: 'cow', definition: 'a farm animal' },
    { word: 'duck', definition: 'a water bird' },
  ],
  grammar: [{ rule: 'I like + noun', explanation: 'Use like with a noun.', examples: ['I like cows.'] }],
  story: [{ text: 'The cow says moo.', speaker: 'Narrator' }, { text: 'Hello!', speaker: 'Farmer' }],
  dialogue: [{ speaker: 'A', text: 'Good morning!', translation: '早上好' }, { speaker: 'B', text: 'Good morning, teacher!' }],
};

const unitFlow = [
  { type: 'INTRO_SPLASH', phase: 'WARMUP', data: { title: 'A day on the farm', subtitle: 'farm', description: '' } },
  { type: 'FOCUS_CARDS', phase: 'INPUT', data: { title: 'A day on the farm — Vocabulary', cards: [{ front: 'zoo', back: '' }, { front: 'mountain', back: '' }] } },
  { type: 'SOUND_LAB', phase: 'PRACTICE', data: { title: 'lab', poolDriven: true } },
  { type: 'STORY_STAGE', phase: 'OUTPUT', data: { title: 'story', pages: [{ text: 'unrelated', speaker: 'X' }] } },
  { type: 'DIALOGUE_STAGE', phase: 'OUTPUT', data: { title: 'd', lines: [{ speaker: 'X', text: 'y' }] } },
  { type: 'GRAMMAR_SANDBOX', phase: 'INPUT', data: { title: 'old rule', explanation: '', examples: [] } },
  { type: 'TEAM_BATTLE', phase: 'ASSESS', data: { topic: 't', questions: [{ id: 'q0', text: '?', options: ['zoo'], correct: 'zoo' }] } },
  { type: 'FLASH_MATCH', phase: 'PRACTICE', data: { poolDriven: true } },
  { type: 'SPEAKING', phase: 'PRACTICE', data: { targetSentence: 'old', targetWord: 'zoo' } },
  { type: 'CUSTOM_TEACHER_BLOCK', phase: 'WRAPUP', data: { anything: true } },
];

describe('buildClassFlow', () => {
  const flow = buildClassFlow(unitFlow, content);

  it('retitles the intro to the class title', () => {
    const intro = flow.find((b) => b.type === 'INTRO_SPLASH');
    expect(intro.data.title).toBe('Class 1 — Countryside');
  });

  it('rebuilds FOCUS_CARDS from class vocab only', () => {
    const cards = flow.find((b) => b.type === 'FOCUS_CARDS').data.cards;
    expect(cards.map((c: any) => c.front)).toEqual(['tractor', 'cow', 'duck']);
    expect(cards[0].context_sentence).toBe('The tractor is red.');
    expect(cards[0].image).toBe('https://x/tractor.png');
  });

  it('keeps pool-driven shells untouched (runtime pool is class-scoped)', () => {
    const shell = flow.find((b) => b.type === 'SOUND_LAB');
    expect(shell.data.poolDriven).toBe(true);
    expect(shell.data.title).toBe('lab');
    expect(flow.find((b) => b.type === 'FLASH_MATCH').data).toEqual({ poolDriven: true });
  });

  it('rebuilds STORY_STAGE / DIALOGUE_STAGE / GRAMMAR_SANDBOX from scoped rows', () => {
    expect(flow.find((b) => b.type === 'STORY_STAGE').data.pages).toHaveLength(2);
    expect(flow.find((b) => b.type === 'DIALOGUE_STAGE').data.lines[0].translation).toBe('早上好');
    expect(flow.find((b) => b.type === 'GRAMMAR_SANDBOX').data.title).toBe('I like + noun');
  });

  it('rebuilds frozen TEAM_BATTLE questions with in-class distractors', () => {
    const q = flow.find((b) => b.type === 'TEAM_BATTLE').data.questions;
    expect(q).toHaveLength(3);
    expect(q[0].correct).toBe('a farm vehicle');
    expect(q[0].options).toContain('a farm animal');
    expect(q[0].options).not.toContain('zoo');
  });

  it('updates SPEAKING to the first class word', () => {
    const sp = flow.find((b) => b.type === 'SPEAKING').data;
    expect(sp.targetWord).toBe('tractor');
    expect(sp.targetSentence).toBe('The tractor is red.');
  });

  it('passes unknown teacher-composed blocks verbatim', () => {
    expect(flow.find((b) => b.type === 'CUSTOM_TEACHER_BLOCK')).toBeDefined();
  });

  it('drops content blocks whose class content is empty', () => {
    const empty: ClassContent = { ...content, story: [], dialogue: [], grammar: [], vocab: content.vocab };
    const f2 = buildClassFlow(unitFlow, empty);
    expect(f2.some((b) => b.type === 'STORY_STAGE')).toBe(false);
    expect(f2.some((b) => b.type === 'DIALOGUE_STAGE')).toBe(false);
    expect(f2.some((b) => b.type === 'GRAMMAR_SANDBOX')).toBe(false);
    expect(f2.some((b) => b.type === 'FOCUS_CARDS')).toBe(true);
  });

  it('drops everything vocab-bearing when the class has no words', () => {
    const noVocab: ClassContent = { ...content, vocab: [] };
    const f3 = buildClassFlow(unitFlow, noVocab);
    expect(f3.some((b) => b.type === 'FOCUS_CARDS')).toBe(false);
    expect(f3.some((b) => b.type === 'TEAM_BATTLE')).toBe(false);
    expect(f3.some((b) => b.type === 'SPEAKING')).toBe(false);
    // shells + intro + custom blocks survive
    expect(f3.some((b) => b.type === 'SOUND_LAB')).toBe(true);
  });

  it('preserves phase tags on every block', () => {
    for (const b of flow) {
      if (['INTRO_SPLASH', 'FOCUS_CARDS', 'SOUND_LAB', 'TEAM_BATTLE'].includes(b.type)) {
        expect(typeof b.phase).toBe('string');
      }
    }
  });
});
