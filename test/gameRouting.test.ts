import { describe, it, expect } from 'vitest';
import {
  GAME_CONTENT,
  contentForStep,
  friendlyTitle,
  isStudentEligibleType,
} from '../services/gameRouting';

describe('gameRouting — eligibility gate (audit 2026-09-10 F2/F4)', () => {
  it('classroom/board mechanics are NOT student-eligible', () => {
    for (const type of ['CLASS_RALLY', 'TEAM_BATTLE', 'TEAM_SPLASH', 'WHEEL_OF_DESTINY', 'STORY_SEQUENCING', 'COMIC_PANELS', 'POLL', 'LIVE_WARMUP']) {
      expect(isStudentEligibleType(type), type).toBe(false);
    }
  });

  it('student-hostable games are eligible (incl. WORD_SEARCH + DIALOGUE_STAGE extras)', () => {
    for (const type of [
      'SOUND_LAB', 'MEMORY_LAB', 'WORD_DETECTIVE', 'SPEAKING', 'SENTENCE_LAB',
      'GRAMMAR_LAB', 'STORY_QUEST', 'VOCAB_BLITZ', 'PHONICS_ARENA', 'UNIT_REVIEW',
      'FAST_VOCAB', 'SPELLING_BEE', 'SPEED_QUIZ', 'GAME_ARENA',
      'WORD_SEARCH', 'DIALOGUE_STAGE', 'STORY_STAGE', 'FOCUS_CARDS',
    ]) {
      expect(isStudentEligibleType(type), type).toBe(true);
    }
  });

  it('every routed game is student-eligible (table consistency invariant)', () => {
    for (const type of Object.keys(GAME_CONTENT)) {
      expect(isStudentEligibleType(type), type).toBe(true);
    }
  });
});

describe('gameRouting — content routing table', () => {
  it('engines route to engines', () => {
    expect(contentForStep('FAST_VOCAB')).toEqual({ kind: 'engine', engine: 'FAST_VOCAB' });
    expect(contentForStep('SPELLING_BEE')).toEqual({ kind: 'engine', engine: 'SPELLING_BEE' });
    expect(contentForStep('WORD_SEARCH')).toEqual({ kind: 'engine', engine: 'WORD_SEARCH' });
    expect(contentForStep('MEMORY_LAB')).toEqual({ kind: 'engine', engine: 'MEMORY_MATCH' });
  });

  it('sound games route to the audio/listening family only', () => {
    const spec = contentForStep('SOUND_LAB');
    expect(spec?.kind).toBe('pool');
    if (spec?.kind === 'pool') {
      expect(spec.types).toEqual(['LISTEN_SELECT', 'AUDIO_L1_SELECT']);
    }
    // Phonics is minimal-pair discrimination ONLY (v2 — distinct opening from Sound Lab).
    const phonics = contentForStep('PHONICS_ARENA');
    expect(phonics?.kind).toBe('pool');
    if (phonics?.kind === 'pool') {
      expect(phonics.types).toEqual(['MINIMAL_PAIR_SWIPE']);
    }
  });

  it('every pool family signature (when present) is part of its types', () => {
    for (const [game, spec] of Object.entries(GAME_CONTENT)) {
      if (spec.kind !== 'pool') continue;
      for (const s of spec.signature ?? []) expect(spec.types, game).toContain(s);
    }
    // The designed opening set — every game that MUST lead with its own mechanic.
    const signatured = Object.entries(GAME_CONTENT).filter(([, s]) => s.kind === 'pool' && s.signature);
    expect(signatured.map(([g]) => g).sort()).toEqual([
      'DIALOGUE_STAGE', 'GRAMMAR_LAB', 'LISTEN_TAP', 'PHONICS_ARENA', 'SENTENCE_LAB',
      'SOUND_LAB', 'SPEAKING', 'STORY_QUEST', 'VOCAB_BLITZ', 'WORD_DETECTIVE',
    ]);
  });

  it('distinct games get DISTINCT type families (the F1 fix)', () => {
    const family = (t: string) => {
      const spec = contentForStep(t);
      expect(spec?.kind).toBe('pool');
      return (spec as unknown as { types: string[] }).types.join(',');
    };
    expect(family('SOUND_LAB')).not.toBe(family('GRAMMAR_LAB'));
    expect(family('SOUND_LAB')).not.toBe(family('SENTENCE_LAB'));
    expect(family('WORD_DETECTIVE')).not.toBe(family('STORY_QUEST'));
    expect(family('SPEAKING')).not.toBe(family('VOCAB_BLITZ'));
  });

  it('UNIT_REVIEW is the unfiltered, interleaved battery', () => {
    expect(contentForStep('UNIT_REVIEW')).toEqual({ kind: 'pool-all', interleave: true });
  });

  it('unknown and unrouted types fall through to null (player keeps legacy behavior)', () => {
    expect(contentForStep('STORY_STAGE')).toBeNull();
    expect(contentForStep('TEAM_BATTLE')).toBeNull();
    expect(contentForStep('SOMETHING_NEW')).toBeNull();
    expect(contentForStep(undefined)).toBeNull();
  });
});

describe('gameRouting — friendly titles', () => {
  it('maps known types and falls back gracefully', () => {
    expect(friendlyTitle('SOUND_LAB')).toBe('Sound Lab');
    expect(friendlyTitle('MEMORY_LAB', 'ignored')).toBe('Memory Lab');
    expect(friendlyTitle('CUSTOM_THING', 'Teacher Title')).toBe('Teacher Title');
    expect(friendlyTitle('CUSTOM_THING')).toBe('Custom Thing');
    expect(friendlyTitle(undefined, 'Block title')).toBe('Block title');
  });
});
