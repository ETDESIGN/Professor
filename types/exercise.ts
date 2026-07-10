// =====================================================================
// Unified Exercise Contract (Core v1) — shared by Track A (live board)
// and Track B (student app). Resolves audit A4 ("two renderers, no shared
// contract"): both tracks render exercises through ONE type + registry.
//
// This is a CLIENT module (React-aware). The Deno edge generator
// (supabase/functions/generate-exercises) has its own mirror of the type
// list + content shapes in _shared/exerciseTypes.ts — the two cannot share a
// module root (same reason manifest.ts is duplicated).
//
// v2 EXTENSION PATH: to add an exercise type, (1) add it to ExerciseType,
// (2) add a Content variant to the ExerciseContent union, (3) build a
// component on BaseExerciseProps, (4) register it, (5) teach the generator to
// emit it. No contract churn for existing types.
// =====================================================================

import type { ComponentType } from 'react';

/** The 12 Core-v1 exercise types (Locked Decision #2). */
export type ExerciseType =
  | 'IMAGE_SELECT'
  | 'MEANING_MATCH'
  | 'AUDIO_L1_SELECT'
  | 'LISTEN_SELECT'
  | 'SPELL_CLOZE'
  | 'WORD_BANK_BUILD'
  | 'ERROR_SPOT'
  | 'TRANSFORM'
  | 'DICTATION'
  | 'MINIMAL_PAIR_SWIPE'
  | 'TYPE_TRANSLATE'
  | 'SPEAK_SENTENCE';

export const EXERCISE_TYPES: ReadonlySet<string> = new Set<ExerciseType>([
  'IMAGE_SELECT',
  'MEANING_MATCH',
  'AUDIO_L1_SELECT',
  'LISTEN_SELECT',
  'SPELL_CLOZE',
  'WORD_BANK_BUILD',
  'ERROR_SPOT',
  'TRANSFORM',
  'DICTATION',
  'MINIMAL_PAIR_SWIPE',
  'TYPE_TRANSLATE',
  'SPEAK_SENTENCE',
]);

/** True if `v` is a known Core-v1 exercise type. */
export function isExerciseType(v: unknown): v is ExerciseType {
  return typeof v === 'string' && EXERCISE_TYPES.has(v);
}

/** Cognitive modality — drives the escalation ladder + hearts rules. */
export type Modality = 'receptive' | 'productive';

export const RECEPTIVE_TYPES: ReadonlySet<ExerciseType> = new Set([
  'IMAGE_SELECT',
  'MEANING_MATCH',
  'AUDIO_L1_SELECT',
  'LISTEN_SELECT',
  'SPELL_CLOZE',
]);

export function modalityOf(type: ExerciseType): Modality {
  return RECEPTIVE_TYPES.has(type) ? 'receptive' : 'productive';
}

// ---------------------------------------------------------------------
// Discriminated content union — the typed `content` JSONB of a PoolItem.
// Each variant is self-contained: prompt, the answer, distractors, and any
// audio/image the renderer needs. Generators populate `correct_index` for
// multiple-choice types and `accepted`/`correct_text` for free-input types.
// ---------------------------------------------------------------------

interface SelectableImageOption {
  image_url: string;
  /** Optional label rendered under the image (the L2 word). */
  label?: string;
}

interface TextOption {
  text: string;
}

interface BaseContent {
  /** Optional audio clip associated with the whole item. */
  audio_url?: string;
  objective_id?: string;
}

export interface ImageSelectContent extends BaseContent {
  type: 'IMAGE_SELECT';
  /** L2 word/phrase the learner matches to an image. */
  prompt: string;
  prompt_audio?: string;
  prompt_translation?: string;
  options: SelectableImageOption[];
  correct_index: number;
}

export interface MeaningMatchContent extends BaseContent {
  type: 'MEANING_MATCH';
  /** L2 word whose L1 meaning must be selected. */
  prompt: string;
  prompt_audio?: string;
  /** L1 (Simplified Chinese) meaning options. */
  options: string[];
  correct_index: number;
}

export interface AudioL1SelectContent extends BaseContent {
  type: 'AUDIO_L1_SELECT';
  /** Audio (TTS) of an L2 utterance; learner selects its L1 meaning. */
  audio_url: string;
  prompt_text?: string;
  options: string[];
  correct_index: number;
}

export interface ListenSelectContent extends BaseContent {
  type: 'LISTEN_SELECT';
  /** Audio of an L2 word; learner taps the matching word/image. */
  audio_url: string;
  prompt_text?: string;
  options: (SelectableImageOption & Partial<TextOption>)[];
  correct_index: number;
}

export interface SpellClozeContent extends BaseContent {
  type: 'SPELL_CLOZE';
  /** Sentence containing a "____" blank; choose the correctly spelled word. */
  sentence_with_blank: string;
  options: string[];
  correct_index: number;
  audio_url?: string;
}

export interface WordBankBuildContent extends BaseContent {
  type: 'WORD_BANK_BUILD';
  /** Target sentence the learner assembles from the word bank, in order. */
  target_sentence: string;
  /** Shuffled candidate tiles (includes the answer words + distractors). */
  word_bank: string[];
  translation?: string;
  audio_url?: string;
}

export interface ErrorSpotContent extends BaseContent {
  type: 'ERROR_SPOT';
  /** Sentence containing a grammatical error. */
  sentence: string;
  /** Correction options. */
  options: string[];
  correct_index: number;
  explanation?: string;
}

export interface TransformContent extends BaseContent {
  type: 'TRANSFORM';
  /** Source sentence to transform per `instruction` (e.g. make negative). */
  prompt_sentence: string;
  instruction: string;
  options: string[];
  correct_index: number;
}

export interface DictationContent extends BaseContent {
  type: 'DICTATION';
  /** Audio of an L2 sentence the learner must type back. */
  audio_url: string;
  correct_text: string;
  hint?: string;
}

export interface MinimalPairSwipeContent extends BaseContent {
  type: 'MINIMAL_PAIR_SWIPE';
  /** The contrasting phoneme pair (e.g. ["ship","sheep"]). */
  pair: [string, string];
  /** Audio of one member of the pair; learner picks which. */
  audio_url: string;
  options: TextOption[];
  correct_index: number;
  prompt?: string;
}

export interface TypeTranslateContent extends BaseContent {
  type: 'TYPE_TRANSLATE';
  /** L1 (Simplified Chinese) prompt; learner types the L2 translation. */
  prompt_l1: string;
  /** Accepted L2 answers (normalised comparison in the renderer). */
  accepted: string[];
  hint?: string;
}

export interface SpeakSentenceContent extends BaseContent {
  type: 'SPEAK_SENTENCE';
  /** Sentence the learner must pronounce. */
  target_sentence: string;
  target_word?: string;
  target_audio?: string;
}

export type ExerciseContent =
  | ImageSelectContent
  | MeaningMatchContent
  | AudioL1SelectContent
  | ListenSelectContent
  | SpellClozeContent
  | WordBankBuildContent
  | ErrorSpotContent
  | TransformContent
  | DictationContent
  | MinimalPairSwipeContent
  | TypeTranslateContent
  | SpeakSentenceContent;

// ---------------------------------------------------------------------
// PoolItem — a row of `pool_items` typed for the client.
// ---------------------------------------------------------------------

export interface PoolItem {
  id: string;
  unit_id: string;
  objective_id: string;
  exercise_type: ExerciseType;
  difficulty: 1 | 2 | 3;
  /** Discriminated content; `type` mirrors `exercise_type`. */
  content: ExerciseContent;
}

/** Narrow raw DB rows into a PoolItem with safe defaults. */
export function toPoolItem(row: any): PoolItem | null {
  if (!row || !isExerciseType(row.exercise_type)) return null;
  const content = (row.content && typeof row.content === 'object' ? row.content : {}) as any;
  return {
    id: String(row.id),
    unit_id: String(row.unit_id),
    objective_id: String(row.objective_id ?? ''),
    exercise_type: row.exercise_type,
    difficulty: (Number(row.difficulty) >= 1 && Number(row.difficulty) <= 3 ? Number(row.difficulty) : 2) as 1 | 2 | 3,
    content: { ...content, type: row.exercise_type } as ExerciseContent,
  };
}

// ---------------------------------------------------------------------
// The self-completing exercise contract (resolves the old {mode,
// onReady, validateTrigger, onResult} parent-Check-button pattern).
// Passive slides keep "Continue"; EXERCISE steps self-complete via
// onComplete and retire the parent-driven validateTrigger path.
// ---------------------------------------------------------------------

export interface ExerciseResult {
  success: boolean;
  time_taken_ms: number;
  attempts: number;
  /**
   * When false, the runner advances WITHOUT a learner-model write, hearts, or XP
   * (e.g. SPEAK_SENTENCE on a device with no microphone — engagement only, never
   * a free productive success). Defaults to true.
   */
  record?: boolean;
}

export interface BaseExerciseProps {
  /** The pool item to render. */
  data: PoolItem;
  /** Called exactly once when the learner finishes the interaction. */
  onComplete: (result: ExerciseResult) => void;
  /** Optional non-fatal error surface (e.g. "audio unavailable"). */
  onError?: (message: string) => void;
}

export type ExerciseComponent = ComponentType<BaseExerciseProps>;

// ---------------------------------------------------------------------
// ExerciseRegistry — an open, typed registry. Both the student dispatcher
// and the board presentation variant look up components here by
// pool item exercise_type.
// ---------------------------------------------------------------------

export interface ExerciseRegistry {
  register(type: ExerciseType, component: ExerciseComponent): void;
  get(type: ExerciseType): ExerciseComponent | undefined;
  has(type: ExerciseType): boolean;
  types(): ExerciseType[];
}

export function createExerciseRegistry(): ExerciseRegistry {
  const map = new Map<ExerciseType, ExerciseComponent>();
  return {
    register(type, component) {
      map.set(type, component);
    },
    get(type) {
      return map.get(type);
    },
    has(type) {
      return map.has(type);
    },
    types() {
      return Array.from(map.keys());
    },
  };
}
