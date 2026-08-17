// Fast Vocab — shared types for the game engine.
//
// Fast Vocab is a two-phase vocabulary game (match wave → timed recall)
// rendered on two surfaces: the live classroom board (BoardFastVocab, via
// SessionContext) and the student solo app (FastVocabGame). The engine in
// components/games/fastVocab is presentation + pure content logic only —
// every scoring write belongs to the surface wrapper.

/** One matchable word for the Phase-1 wave: a word pod + its counterpart pod. */
export interface FastVocabPair {
  /** pool_items.id */
  id: string;
  /** objectives.id — the FSRS mastery target. */
  objectiveId: string;
  /** Source exercise type ('IMAGE_SELECT' | 'MEANING_MATCH'). */
  exerciseType: string;
  /** pool_items.difficulty (1–3) — feeds scoreForAttempt. */
  difficulty: 1 | 2 | 3;
  /** The English word (always the word-pod side). */
  word: string;
  /** Image mode: the word's generated image (IMAGE_SELECT correct option). */
  imageUrl?: string;
  /** Meaning mode: the L1 meaning (MEANING_MATCH correct option). */
  meaning?: string;
  /** Stored TTS if the pool item carried one (prompt_audio/audio_url). */
  audioUrl?: string;
}

/** One Phase-2 speed-recall question: prompt card + 3 word choices. */
export interface FastVocabSpeedQ {
  id: string;
  objectiveId: string;
  exerciseType: string;
  difficulty: 1 | 2 | 3;
  /** Image mode: the prompt image. */
  imageUrl?: string;
  /** Meaning mode: the prompt meaning. */
  meaning?: string;
  correctWord: string;
  /** Choice words — includes correctWord (2–3 entries on tiny pools). */
  choices: string[];
  correctIndex: number;
  audioUrl?: string;
}

/** Content modality, detected from what the unit's pool actually has. */
export type FastVocabMode = 'image' | 'meaning';

/** Turn summary handed to the surface when both phases finish. */
export interface FastVocabTurnSummary {
  /** Interactions answered correctly on the first try (pairs + questions). */
  firstTryCorrect: number;
  /** Total scored interactions in the turn. */
  totalInteractions: number;
  /** Longest correct streak reached during the turn. */
  bestStreak: number;
}
