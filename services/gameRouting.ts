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

export interface PoolSpec {
  kind: 'pool';
  /** Exercise types allowed in this game's battery. */
  types: readonly string[];
  /**
   * The game's SIGNATURE types lead the battery (v2, owner feedback
   * 2026-09-10): several families overlap in modality (audio MCQ vs meaning
   * MCQ read the same to a player), so the FIRST screen of every game must be
   * its signature mechanic — Phonics opens on a minimal-pair swipe, Grammar
   * Lab on a grammar fill, Sentence Lab on word tiles, never a generic
   * word→Chinese MCQ.
   */
  signature?: readonly string[];
}

export type StepContent =
  | { kind: 'engine'; engine: EngineKind }
  | PoolSpec
  | { kind: 'pool-all'; interleave?: boolean };

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
  // v2: Phonics is minimal-pair discrimination ONLY (its own distinct swipe
  // UI); Sound Lab keeps the two audio-MCQ types and opens on LISTEN
  // (audio → English), so the two games no longer share an opening mechanic.
  SOUND_LAB: { kind: 'pool', types: ['LISTEN_SELECT', 'AUDIO_L1_SELECT'], signature: ['LISTEN_SELECT'] },
  LISTEN_TAP: { kind: 'pool', types: ['LISTEN_SELECT', 'AUDIO_L1_SELECT'], signature: ['AUDIO_L1_SELECT'] },
  PHONICS_ARENA: { kind: 'pool', types: ['MINIMAL_PAIR_SWIPE'], signature: ['MINIMAL_PAIR_SWIPE'] },

  // ── Vocabulary recognition / production ─────────────────────────────
  // Detective = picture hunt (image MCQ); Blitz = fast recall (word→L1).
  WORD_DETECTIVE: { kind: 'pool', types: ['IMAGE_SELECT', 'MEANING_MATCH'], signature: ['IMAGE_SELECT'] },
  VOCAB_BLITZ: { kind: 'pool', types: ['IMAGE_SELECT', 'MEANING_MATCH', 'SPELL_CLOZE', 'TYPE_TRANSLATE'], signature: ['MEANING_MATCH'] },

  // ── Sentence construction / correction ──────────────────────────────
  SENTENCE_LAB: { kind: 'pool', types: ['WORD_BANK_BUILD', 'ERROR_SPOT', 'SPELL_CLOZE'], signature: ['WORD_BANK_BUILD'] },

  // ── Grammar ─────────────────────────────────────────────────────────
  GRAMMAR_LAB: { kind: 'pool', types: ['GRAMMAR_FILL', 'TRANSFORM', 'ERROR_SPOT'], signature: ['GRAMMAR_FILL', 'TRANSFORM'] },

  // ── Speech ──────────────────────────────────────────────────────────
  SPEAKING: { kind: 'pool', types: ['SPEAK_SENTENCE', 'DIALOGUE_ROLEPLAY'], signature: ['SPEAK_SENTENCE'] },
  DIALOGUE_STAGE: { kind: 'pool', types: ['DIALOGUE_ROLEPLAY', 'WHO_SAID_IT', 'SPEAK_SENTENCE'], signature: ['DIALOGUE_ROLEPLAY'] },

  // ── Reading comprehension ───────────────────────────────────────────
  STORY_QUEST: { kind: 'pool', types: ['STORY_COMPREHENSION', 'WHO_SAID_IT'], signature: ['STORY_COMPREHENSION'] },

  // ── Rapid recognition sprint: mixed receptive by design (no signature —
  // its distinctness is speed, a UI concern; opening may match other games). ──
  SPEED_QUIZ: { kind: 'pool', types: ['IMAGE_SELECT', 'MEANING_MATCH', 'LISTEN_SELECT', 'AUDIO_L1_SELECT'] },

  // ── Review: everything, interleaved so consecutive screens vary ─────
  UNIT_REVIEW: { kind: 'pool-all', interleave: true },
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
