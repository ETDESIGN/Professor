// =====================================================================
// FSRS-lite — Free Spaced Repetition Scheduler (pure / testable).
// ---------------------------------------------------------------------
// Replaces the legacy SM-2 quality(0-5) seam with the modern FSRS model
// (KDD '22; the state of the art used by Anki >=23.10). Models per-item
// *stability* (interval at which recall = target) and *difficulty*, and
// predicts *retrievability* R = probability of recall now.
//
// Design (Locked Decision #1 + Flagged Defaults):
//  - 4-grade rating: Again / Hard / Good / Easy.
//  - Retrievability R is COMPUTED ON READ (never stored) from
//    (stability, difficulty, elapsed).
//  - Difficulty bounded [1,10], mean-reverts toward the "good" initial.
//  - Cold-start uses published FSRS-4.5 initial stability/difficulty.
//
// The parameters below are the published FSRS-4.5 defaults, exposed as one
// tunable object so they can be calibrated with real data later (Open Q).
// Keep this module dependency-free and deterministic so it unit-tests clean.
// =====================================================================

export type Grade = 'again' | 'hard' | 'good' | 'easy';

/** 4-grade rating mapped to the classic 0-5 quality band (for SM-2 back-compat). */
export const GRADE_QUALITY: Record<Grade, number> = {
  again: 1,
  hard: 2,
  good: 4,
  easy: 5,
};

/** Native FSRS 1-4 rating (again..easy); used by the difficulty formula. */
export const GRADE_RATING: Record<Grade, number> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};

/** Published FSRS-4.5 default parameters (tunable). */
export interface FsrsParams {
  /** Target retention — the scheduler picks the interval where R decays to this. */
  targetRetention: number;
  /** Forgetting-curve divisor: R = (1 + t/(factor*S))^-1. factor=9 → at t=S, R=0.9. */
  factor: number;
  /** Initial stability (days) per first grade. */
  sInit: { again: number; hard: number; good: number; easy: number };
  /** Initial difficulty for a "Good" first rating. */
  dInit: number;
  /** Difficulty change per grade step away from "Good". */
  dSlope: number;
  /** Difficulty bounds. */
  dMin: number;
  dMax: number;
  /** Mean-reversion weight toward dInit on each review (0..1). */
  dMeanReversion: number;
  /** Stability-update coefficients (recall path). */
  cBase: number; // exp(cBase) scales the growth
  cStab: number; // stability exponent (diminishing returns)
  cRet: number; // retrievability term
  hardPenalty: number; // multiplier on Hard
  easyBonus: number; // multiplier on Easy
  /** Lapse (Again) relearning-stability coefficients. */
  cLapse: number;
  cLapseD: number;
  cLapseS: number;
  cLapseR: number;
  lapseMinStability: number;
}

export const FSRS_DEFAULTS: FsrsParams = {
  targetRetention: 0.9,
  factor: 9,
  sInit: { again: 0.4, hard: 0.6, good: 2.4, easy: 5.8 },
  dInit: 4.93,
  dSlope: 0.94,
  dMin: 1,
  dMax: 10,
  dMeanReversion: 0.1,
  cBase: 1.49,
  cStab: 0.14,
  cRet: 0.94,
  hardPenalty: 0.5,
  easyBonus: 1.3,
  cLapse: 0.2,
  cLapseD: 0.2,
  cLapseS: 0.2,
  cLapseR: 0.7,
  lapseMinStability: 0.2,
};

/** Per-item FSRS memory state (mirrors the evolved srs_items columns). */
export interface FsrsState {
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  last_review: string | null; // ISO timestamp
}

/** Mastery-ladder progress, persisted in srs_items.mastery_meta. */
export interface MasteryMeta {
  productive_wins?: number;
  first_productive_at?: string | null; // ISO
  last_productive_at?: string | null; // ISO
  last_receptive_at?: string | null; // ISO
}

export type MasteryState = 'new' | 'learning' | 'familiar' | 'mastered' | 'decaying';

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Probability of recall right now (the power forgetting curve).
 * R(0) = 1; R decreases as elapsed grows; R increases with stability.
 */
export function retrievability(
  stability: number,
  elapsedDays: number,
  factor = FSRS_DEFAULTS.factor,
): number {
  const s = stability > 0 ? stability : 0.01;
  const t = Math.max(elapsedDays, 0);
  return clamp(Math.pow(1 + t / (factor * s), -1), 0, 1);
}

/** Days between two timestamps (0 if either is missing). */
export function elapsedDays(lastReview: string | null, now: Date = new Date()): number {
  if (!lastReview) return 0;
  const last = new Date(lastReview).getTime();
  if (Number.isNaN(last)) return 0;
  return Math.max(0, (now.getTime() - last) / MS_PER_DAY);
}

/** Current retrievability given a state and the wall clock. */
export function retrievabilityNow(state: Pick<FsrsState, 'stability' | 'last_review'>, now: Date = new Date()): number {
  return retrievability(state.stability ?? 0, elapsedDays(state.last_review, now));
}

/**
 * Initial stability/difficulty for a card's first review (cold start).
 * stability = sInit[grade]; difficulty = dInit - (rating-3)*dSlope, clamped
 * (rating uses the native 1-4 scale, so Good centers on dInit).
 */
export function initDifficulty(grade: Grade, p: FsrsParams = FSRS_DEFAULTS): number {
  return clamp(p.dInit - (GRADE_RATING[grade] - 3) * p.dSlope, p.dMin, p.dMax);
}

export function initStability(grade: Grade, p: FsrsParams = FSRS_DEFAULTS): number {
  return Math.max(p.sInit[grade], 0.1);
}

/** Next difficulty after a review (mean reversion toward dInit). */
export function nextDifficulty(d: number, grade: Grade, p: FsrsParams = FSRS_DEFAULTS): number {
  let nd = d - p.dSlope * (GRADE_RATING[grade] - 3);
  nd = p.dMeanReversion * p.dInit + (1 - p.dMeanReversion) * nd;
  return clamp(nd, p.dMin, p.dMax);
}

/** Next stability after a successful review (Hard/Good/Easy). */
export function nextStabilityRecall(
  stability: number,
  difficulty: number,
  retrievabilityR: number,
  grade: Grade,
  p: FsrsParams = FSRS_DEFAULTS,
): number {
  const base =
    stability *
    (1 + Math.exp(p.cBase) * (11 - difficulty) * Math.pow(stability, -p.cStab) * (Math.exp((1 - retrievabilityR) * p.cRet) - 1));
  let next = base;
  if (grade === 'hard') next *= p.hardPenalty;
  else if (grade === 'easy') next *= p.easyBonus;
  // Stability must not shrink on a successful recall.
  return Math.max(next, stability * 0.5);
}

/** Next stability after a lapse (Again). */
export function nextStabilityLapse(
  stability: number,
  difficulty: number,
  retrievabilityR: number,
  p: FsrsParams = FSRS_DEFAULTS,
): number {
  const next =
    p.cLapse * Math.pow(difficulty, -p.cLapseD) * (Math.pow(stability + 1, p.cLapseS) - 1) * Math.exp(p.cLapseR * (1 - retrievabilityR));
  return Math.max(next, p.lapseMinStability);
}

/**
 * The scheduled interval (days) at which R decays to targetRetention.
 * For factor=9, target=0.9 this equals `stability` days.
 */
export function nextIntervalDays(stability: number, p: FsrsParams = FSRS_DEFAULTS): number {
  const days = p.factor * stability * (1 / p.targetRetention - 1);
  return Math.max(days, 0.01);
}

/**
 * Advance an item's memory state given a grade. Pure + deterministic.
 * Returns the new state + next_review (ISO) + the R that was used.
 */
export function schedule(
  prev: Partial<FsrsState>,
  grade: Grade,
  now: Date = new Date(),
  p: FsrsParams = FSRS_DEFAULTS,
): FsrsState & { next_review: string; usedRetrievability: number } {
  const hadReview = typeof prev.stability === 'number' && typeof prev.last_review === 'string';
  const elapsed = hadReview ? elapsedDays(prev.last_review!, now) : 0;
  const r = hadReview ? retrievability(prev.stability!, elapsed, p.factor) : 1;

  let stability: number;
  let difficulty: number;
  let lapses = prev.lapses ?? 0;
  let reps = prev.reps ?? 0;

  if (!hadReview) {
    stability = initStability(grade, p);
    difficulty = initDifficulty(grade, p);
    if (grade === 'again') {
      lapses += 1;
      reps = 0;
    } else {
      reps = 1;
    }
  } else if (grade === 'again') {
    stability = nextStabilityLapse(prev.stability!, prev.difficulty ?? initDifficulty('good', p), r, p);
    difficulty = nextDifficulty(prev.difficulty ?? initDifficulty('good', p), grade, p);
    lapses += 1;
    reps = 0;
  } else {
    stability = nextStabilityRecall(prev.stability!, prev.difficulty ?? initDifficulty('good', p), r, grade, p);
    difficulty = nextDifficulty(prev.difficulty ?? initDifficulty('good', p), grade, p);
    reps += 1;
  }

  const interval = nextIntervalDays(stability, p);
  const nextReviewMs = now.getTime() + interval * MS_PER_DAY;

  return {
    stability,
    difficulty,
    reps,
    lapses,
    last_review: now.toISOString(),
    next_review: new Date(nextReviewMs).toISOString(),
    usedRetrievability: r,
  };
}

// ---------------------------------------------------------------------
// Mastery ladder (Flagged Defaults).
//   new -> learning (1st receptive success)
//   learning -> familiar (1st productive success)
//   familiar -> mastered (3 productive wins spanning >48h)
//   mastered -> decaying is COMPUTED ON READ (R < 0.85); not stored.
//   decaying -> familiar on next success (re-engaged).
// A lapse demotes: mastered->familiar, familiar->learning.
// ---------------------------------------------------------------------

const FORTY_EIGHT_H_MS = 48 * 60 * 60 * 1000;

export interface RecordMasteryInput {
  state: MasteryState;
  meta: MasteryMeta;
  grade: Grade;
  modality: 'receptive' | 'productive';
  now?: Date;
}

export interface RecordMasteryResult {
  state: MasteryState;
  meta: MasteryMeta;
}

export function recordMastery(input: RecordMasteryInput): RecordMasteryResult {
  const now = input.now ?? new Date();
  const iso = now.toISOString();
  const success = input.grade !== 'again';
  const meta: MasteryMeta = { ...input.meta };

  if (!success) {
    // Lapse: demote one rung (never below 'learning') AND reset the productive
    // mastery counter so the item must re-earn mastery with 3 FRESH productive
    // wins spanning >48h (otherwise a mastered->familiar lapse re-masters in a
    // single win because first_productive_at stays anchored to the first ever).
    let state = input.state;
    if (state === 'mastered') state = 'familiar';
    else if (state === 'familiar') state = 'learning';
    else if (state === 'decaying') state = 'learning';
    meta.productive_wins = 0;
    meta.first_productive_at = null;
    return { state, meta };
  }

  // Success path.
  let state = input.state === 'decaying' ? 'familiar' : input.state;

  if (input.modality === 'receptive') {
    meta.last_receptive_at = iso;
    if (state === 'new') state = 'learning';
  } else {
    // Productive success.
    const wins = (meta.productive_wins ?? 0) + 1;
    meta.productive_wins = wins;
    meta.last_productive_at = iso;
    if (!meta.first_productive_at) meta.first_productive_at = iso;

    if (state === 'new' || state === 'learning') {
      state = 'familiar';
    } else if (state === 'familiar') {
      // Mastered requires 3 productive wins spanning >48h.
      const span = meta.first_productive_at
        ? new Date(meta.last_productive_at).getTime() - new Date(meta.first_productive_at).getTime()
        : 0;
      if (wins >= 3 && span >= FORTY_EIGHT_H_MS) {
        state = 'mastered';
      }
    }
  }

  return { state, meta };
}

/**
 * Effective mastery, applying compute-on-read decay: a 'mastered' item whose
 * current R has fallen below the crack threshold reports 'decaying' (cracked
 * node on the HomeMap). Stored state is unchanged.
 */
export function effectiveMasteryState(
  stored: MasteryState,
  retrievabilityR: number,
  crackThreshold = 0.85,
): MasteryState {
  if (stored === 'mastered' && retrievabilityR < crackThreshold) return 'decaying';
  return stored;
}

/** True when an FSRS item is "due" (next_review has passed or it is new). */
export function isDue(nextReview: string | null, now: Date = new Date()): boolean {
  if (!nextReview) return true;
  return new Date(nextReview).getTime() <= now.getTime();
}
