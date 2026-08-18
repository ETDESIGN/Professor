// ─────────────────────────────────────────────────────────────────────
// Student Path types — the teacher-planned, Duolingo-style stage plan
// stored on units.student_path. One stage = one node on the student map:
// optional lead-in presentation blocks + one scored round. The plan is a
// separate document from units.flow (the live-session plan); both share
// the flow-block shape so builders can be reused.
// ─────────────────────────────────────────────────────────────────────

export type StageLock = 'auto' | 'locked' | 'open';
export type StageKind = 'lesson' | 'review';

/** Same shape as a units.flow step (id/type/title/duration/data/phase). */
export interface StageBlock {
  id: string;
  type: string;
  title: string;
  duration: number;
  data: any;
  phase?: string;
}

export interface StudentStage {
  /** Stable across reorders — the key student_stage_progress rows reference. */
  id: string;
  title: string;
  /** Icon key resolved by STAGE_ICON_MAP on the student map / composer. */
  icon: string;
  kind: StageKind;
  lock: StageLock;
  /**
   * Teacher visibility switch: false = the node stays in the plan but is NOT
   * rendered in the student app at all (and does not gate the unlock chain).
   * Distinct from lock:'locked', which shows the node closed. Default true.
   */
  visible?: boolean;
  xpReward?: number;
  blocks: StageBlock[];
}

/**
 * Presentation blocks that render BEFORE the scored round inside the same
 * node (Duolingo introduces items, then drills them). Anything else in a
 * stage is treated as the scored round.
 */
export const LEAD_IN_TYPES: ReadonlySet<string> = new Set([
  'INTRO_SPLASH',
  'MEDIA_PLAYER',
  'FOCUS_CARDS',
]);

/**
 * Node identity for a pool-driven round: the solo player renders these via
 * the ExerciseRunner battery (pool-driven PRACTICE/ASSESS, exactly how the
 * student app already renders such flow slots), so the block type carries
 * the node's identity/settings while the FSRS pool supplies the content.
 */
export const POOL_ROUND_TYPES: ReadonlySet<string> = new Set([
  'GAME_ARENA',
  'SPEED_QUIZ',
  'SPEAKING',
  'LISTEN_TAP',
  'SPELLING_BEE',
  'FAST_VOCAB',
  'PHONICS_ARENA',
  'VOCAB_BLITZ',
  'GRAMMAR_LAB',
  'SENTENCE_LAB',
  'WORD_DETECTIVE',
  'SOUND_LAB',
  'MEMORY_LAB',
  'STORY_QUEST',
  'UNIT_REVIEW',
]);

/** Every block type the solo player can render (eligible for a student path). */
export const STUDENT_ELIGIBLE_TYPES: ReadonlySet<string> = new Set([
  ...LEAD_IN_TYPES,
  ...POOL_ROUND_TYPES,
  'STORY_STAGE',
  'GRAMMAR_SANDBOX',
]);

/** Icon keys → lucide icon names, resolved where the icons are imported. */
export const STAGE_ICON_KEYS = [
  'star',
  'book',
  'mic',
  'headphones',
  'zap',
  'puzzle',
  'activity',
  'gauge',
  'spellcheck',
  'trophy',
] as const;

export type StageIconKey = (typeof STAGE_ICON_KEYS)[number];

/** Default icon per block type (used when deriving / composing nodes). */
export const ICON_FOR_TYPE: Record<string, string> = {
  INTRO_SPLASH: 'star',
  MEDIA_PLAYER: 'headphones',
  FOCUS_CARDS: 'book',
  STORY_STAGE: 'book',
  STORY_QUEST: 'book',
  GRAMMAR_SANDBOX: 'puzzle',
  GRAMMAR_LAB: 'puzzle',
  SPEED_QUIZ: 'zap',
  GAME_ARENA: 'activity',
  SPEAKING: 'mic',
  LISTEN_TAP: 'headphones',
  SOUND_LAB: 'headphones',
  SPELLING_BEE: 'spellcheck',
  FAST_VOCAB: 'gauge',
  PHONICS_ARENA: 'mic',
  VOCAB_BLITZ: 'zap',
  SENTENCE_LAB: 'book',
  WORD_DETECTIVE: 'book',
  MEMORY_LAB: 'activity',
  UNIT_REVIEW: 'trophy',
};
