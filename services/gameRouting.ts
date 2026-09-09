// ─────────────────────────────────────────────────────────────────────
// gameRouting — what each game block type MEANS on the student side.
//
// Before this module every pool-driven block type (SOUND_LAB, MEMORY_LAB,
// WORD_DETECTIVE, CLASS_RALLY, …) rendered the same generic exercise battery
// fed by selectLessonItems(unitId, studentId) — the tapped game's identity
// never reached selection, so every icon played the same items in the same
// order (audit 2026-09-10, finding F1). This table is the single source that
// maps a flow block type to its content:
//   • engine   — a real game engine owns the screen (steps/*Step.tsx)
//   • pool     — the exercise battery, restricted to a type family
//   • pool-all — the unfiltered battery (review)
// Plus the student eligibility gate (types that must never appear on the
// student map — classroom/board mechanics like CLASS_RALLY) and friendly
// display titles for map nodes and battery headers.
// ─────────────────────────────────────────────────────────────────────

import { STUDENT_ELIGIBLE_TYPES } from '../types/stage';

export type EngineKind = 'FAST_VOCAB' | 'SPELLING_BEE' | 'WORD_SEARCH' | 'MEMORY_MATCH';

export type StepContent =
  | { kind: 'engine'; engine: EngineKind }
  | { kind: 'pool'; types: readonly string[] }
  | { kind: 'pool-all' };

/**
 * Block types the solo player can host beyond STUDENT_ELIGIBLE_TYPES:
 * WORD_SEARCH gained a student engine (board v3 grid reuse); DIALOGUE_STAGE
 * renders the dialogue-roleplay exercise family instead of the old
 * "future update" placeholder.
 */
const EXTRA_ELIGIBLE_TYPES: ReadonlySet<string> = new Set(['WORD_SEARCH', 'DIALOGUE_STAGE']);

/** May this block type ever appear on the student map? (Single choke point.) */
export const isStudentEligibleType = (type: string): boolean =>
  STUDENT_ELIGIBLE_TYPES.has(type) || EXTRA_ELIGIBLE_TYPES.has(type);

/** Game type → content routing. Absent types fall back to pool-all. */
export const GAME_CONTENT: Readonly<Record<string, StepContent>> = {
  // ── Real engines (steps/*Step.tsx own the full screen) ──────────────
  FAST_VOCAB: { kind: 'engine', engine: 'FAST_VOCAB' },
  SPELLING_BEE: { kind: 'engine', engine: 'SPELLING_BEE' },
  WORD_SEARCH: { kind: 'engine', engine: 'WORD_SEARCH' },
  MEMORY_LAB: { kind: 'engine', engine: 'MEMORY_MATCH' },

  // ── Listening / sound discrimination ────────────────────────────────
  SOUND_LAB: { kind: 'pool', types: ['LISTEN_SELECT', 'AUDIO_L1_SELECT', 'MINIMAL_PAIR_SWIPE'] },
  LISTEN_TAP: { kind: 'pool', types: ['LISTEN_SELECT', 'AUDIO_L1_SELECT'] },
  PHONICS_ARENA: { kind: 'pool', types: ['MINIMAL_PAIR_SWIPE', 'LISTEN_SELECT', 'AUDIO_L1_SELECT'] },

  // ── Vocabulary recognition / production ─────────────────────────────
  WORD_DETECTIVE: { kind: 'pool', types: ['IMAGE_SELECT', 'MEANING_MATCH'] },
  VOCAB_BLITZ: { kind: 'pool', types: ['IMAGE_SELECT', 'MEANING_MATCH', 'SPELL_CLOZE', 'TYPE_TRANSLATE'] },

  // ── Sentence construction / correction ──────────────────────────────
  SENTENCE_LAB: { kind: 'pool', types: ['WORD_BANK_BUILD', 'ERROR_SPOT', 'SPELL_CLOZE'] },

  // ── Grammar ─────────────────────────────────────────────────────────
  GRAMMAR_LAB: { kind: 'pool', types: ['GRAMMAR_FILL', 'TRANSFORM', 'ERROR_SPOT'] },

  // ── Speech ──────────────────────────────────────────────────────────
  SPEAKING: { kind: 'pool', types: ['SPEAK_SENTENCE', 'DIALOGUE_ROLEPLAY'] },
  DIALOGUE_STAGE: { kind: 'pool', types: ['DIALOGUE_ROLEPLAY', 'WHO_SAID_IT', 'SPEAK_SENTENCE'] },

  // ── Reading comprehension ───────────────────────────────────────────
  STORY_QUEST: { kind: 'pool', types: ['STORY_COMPREHENSION', 'WHO_SAID_IT'] },

  // ── Rapid recognition sprint ────────────────────────────────────────
  SPEED_QUIZ: { kind: 'pool', types: ['IMAGE_SELECT', 'MEANING_MATCH', 'LISTEN_SELECT', 'AUDIO_L1_SELECT'] },

  // ── Review: everything, weakest-first (the classic battery) ─────────
  UNIT_REVIEW: { kind: 'pool-all' },
};

/** Content spec for a flow block type; null = no pool/engine routing. */
export function contentForStep(type?: string | null): StepContent | null {
  if (!type) return null;
  return GAME_CONTENT[type] ?? null;
}

/** Friendly display names for map nodes and battery headers. */
export const GAME_TITLES: Readonly<Record<string, string>> = {
  INTRO_SPLASH: 'Lesson Start',
  MEDIA_PLAYER: 'Song Time',
  FOCUS_CARDS: 'Word Lab',
  GRAMMAR_SANDBOX: 'Grammar',
  STORY_STAGE: 'Story',
  DIALOGUE_STAGE: 'Dialogue',
  FAST_VOCAB: 'Fast Vocab',
  SPELLING_BEE: 'Spelling Bee',
  WORD_SEARCH: 'Word Search',
  MEMORY_LAB: 'Memory Lab',
  SOUND_LAB: 'Sound Lab',
  LISTEN_TAP: 'Listen & Tap',
  PHONICS_ARENA: 'Phonics',
  WORD_DETECTIVE: 'Word Detective',
  VOCAB_BLITZ: 'Vocab Blitz',
  SENTENCE_LAB: 'Sentence Lab',
  SCRAMBLE: 'Sentence Scramble',
  GRAMMAR_LAB: 'Grammar Lab',
  SPEAKING: 'Speaking',
  STORY_QUEST: 'Story Quest',
  SPEED_QUIZ: 'Speed Quiz',
  GAME_ARENA: 'Game Arena',
  UNIT_REVIEW: 'Unit Review',
};

/** Friendly title for a block type, falling back to the block's own title. */
export function friendlyTitle(type?: string | null, fallback?: string): string {
  if (type && GAME_TITLES[type]) return GAME_TITLES[type];
  return fallback || (type ? titleCaseType(type) : 'Activity');
}

const titleCaseType = (type: string): string =>
  type.toLowerCase().split(/[_\s]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
