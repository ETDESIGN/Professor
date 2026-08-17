// Spelling Bee — shared types for the game engine.
//
// Spelling Bee is a letter-by-letter spelling game (word card + audio, letter
// slots, on-screen QWERTY keyboard under a per-word countdown, adaptive
// distractor-key elimination) rendered on two surfaces: the live classroom
// board (BoardSpellingBee, via SessionContext) and the student solo app
// (SpellingBeeGame). The engine in components/games/spellingBee is
// presentation + pure content/keyboard logic only — every scoring write
// belongs to the surface wrapper.

/** One spellable word with everything the card, audio and scoring need. */
export interface SpellingBeeWord {
  /** pool_items.id, or synthesized for the vocabulary/frozen fallbacks. */
  id: string;
  /** objectives.id (or a synthesized non-UUID id for fallback sources). */
  objectiveId: string;
  /** Source pool exercise type, or 'VOCAB_FALLBACK' / 'FROZEN'. */
  exerciseType: string;
  /** pool_items.difficulty (1–3) — feeds scoreForAttempt. */
  difficulty: 1 | 2 | 3;
  /** Display form ("ice cream"). */
  word: string;
  /** Normalized A–Z spelling ("ICECREAM") — drives typing validation. */
  letters: string;
  /** Real generated image (dicebear placeholders filtered upstream). */
  imageUrl?: string;
  /** Stored TTS of the word, if the source carried one. */
  audioUrl?: string;
  /** L1 meaning (fallback cue when the image is missing). */
  meaning?: string;
}

/** Per-surface game settings (plan-block data on the board, localStorage solo). */
export interface SpellingBeeSettings {
  /** Per-word countdown in seconds; 0 = untimed (the original's timer toggle). */
  timerSeconds: number;
  /** Adaptive distractor-key elimination (the original's "Remove letters"). */
  letterRemoval: boolean;
}

/** Emitted on every wrong letter (the surface decides the penalty). */
export interface SpellingBeeWrongLetter {
  /** The wrong key that was pressed (uppercase). */
  letter: string;
  /** Streak AFTER the event (always 0 — a wrong letter resets it). */
  streak: number;
}

/** Emitted once per word when it resolves. */
export interface SpellingBeeWordResult {
  word: SpellingBeeWord;
  /** Player typed every letter (or teacher MARK_CORRECT). */
  solved: boolean;
  /** Clock hit zero (board: reveal + advance; solo: the run ends). */
  timedOut: boolean;
  /** Teacher MARK_CORRECT override — solved, but not first-try. */
  forced: boolean;
  /** Teacher SKIP_ITEM — revealed, never scored. */
  skipped: boolean;
  /** Wrong-letter count on this word. */
  mistakes: number;
  /** 0..1 fraction of the clock remaining when solved (1 when untimed). */
  timeFrac: number;
  /** Zero wrong letters and not forced. */
  firstTry: boolean;
  /** Streak AFTER the event (bumped on solved, reset otherwise). */
  streak: number;
}

/** Natural-completion summary for the wave (all words resolved). */
export interface SpellingBeeTurnSummary {
  /** Words solved by typing or MARK_CORRECT. */
  solved: number;
  /** Words that resolved any way (solved, timed out or skipped). */
  attempted: number;
  /** Longest solve streak reached during the wave. */
  bestStreak: number;
  /** Words solved with zero wrong letters. */
  firstTry: number;
}

export interface SpellingBeeTurnEvents {
  onWrongLetter: (word: SpellingBeeWord, result: SpellingBeeWrongLetter) => void;
  onWordResult: (result: SpellingBeeWordResult) => void;
  /** Fired once when the whole wave resolves naturally (never on forceComplete). */
  onComplete: (summary: SpellingBeeTurnSummary) => void;
}
