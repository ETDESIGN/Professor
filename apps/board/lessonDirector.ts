// lessonDirector.ts — the spine of the redesigned live-class escalation engine.
//
// Implements the architecture's §1 (pedagogical model: receptive→productive
// spiral), §2.2 (SHELL_CAPABILITIES), §1.2 (PHASE_ENVELOPE), §1.3
// (nextRungForObjective + buildRound), §4.1 (ContextualControlsSpec).
//
// This module is PURE (no React, no Supabase calls of its own — buildRound
// takes pre-fetched inputs). The React binding is useEscalatingPool
// (apps/board/useEscalatingPool.ts), which calls into this + useBoardPool.
//
// All ExerciseType / Phase values come from the canonical contracts
// (types/exercise.ts, supabase/functions/_shared/flowTypes.ts). Do NOT invent
// values here — the build-time lint below (Option C, §2.2) enforces that
// SHELL_CAPABILITIES only references real ExerciseType values.

import type { ExerciseType } from '../../types/exercise';
import { EXERCISE_TYPES } from '../../types/exercise';

// Re-declare Phase locally (the Deno-side flowTypes.ts can't be imported by
// the bundler cleanly, per audit §D; keep these two in sync manually). Values
// MUST match SUPPORTED_PHASES in supabase/functions/_shared/flowTypes.ts.
export type Phase =
  | 'WARMUP'
  | 'INPUT'
  | 'PRACTICE'
  | 'OUTPUT'
  | 'ASSESS'
  | 'WRAPUP'
  | 'REVIEW';

export const SUPPORTED_PHASES: ReadonlySet<string> = new Set<Phase>([
  'WARMUP', 'INPUT', 'PRACTICE', 'OUTPUT', 'ASSESS', 'WRAPUP', 'REVIEW',
]);

// =====================================================================
// 1. Ladder ceilings per objective type (the Unscramble-spec fix).
//
// Without the clamp, a `mastered` grammar objective would compute rung 5 — a
// rung that doesn't exist on the grammar ladder — and any shell reading it
// would misbehave. One-line fix applied centrally here so every shell benefits.
// =====================================================================

export type ObjectiveType = 'vocabulary' | 'grammar' | 'story' | 'dialogue' | 'phonics';

export const LADDER_CEILING: Record<ObjectiveType, number> = {
  vocabulary: 5,
  grammar: 4,
  story: 3,
  dialogue: 3,
  phonics: 1, // no phonics pipeline today (architecture §1.1) — ceiling 1
};

// =====================================================================
// 2. nextRungForObjective — the mastery→rung function (§1.3).
//
// Maps an objective's FSRS mastery_state to a rung on its ladder, then clamps
// to the ladder ceiling. A brand-new item never starts above receptive
// recognition; a decaying item drops back to recall (not rung 1 — don't
// re-punish). Round number is a SEPARATE ceiling applied by buildRound
// (mastery caps how far a round can push; the round never forces an item
// above what its own mastery supports).
// =====================================================================

/** The SRS-state slice nextRungForObjective reads. Mirrors the relevant
 *  fields of ObjectiveState from services/boardLearner.ts. */
export interface RungSrsState {
  mastery_state: 'new' | 'learning' | 'familiar' | 'mastered' | 'decaying';
}

/** Raw mastery→rung (before the ladder ceiling clamp). Exported for tests. */
export function rawMasteryToRung(srs: RungSrsState | null): number {
  if (!srs || srs.mastery_state === 'new') return 1;          // never start above receptive recognition
  if (srs.mastery_state === 'learning') return 2;             // discrimination floor (buildRound may push to 3)
  if (srs.mastery_state === 'familiar') return 4;             // productive form
  if (srs.mastery_state === 'mastered') return 5;             // free use
  if (srs.mastery_state === 'decaying') return 3;             // remediation: drop to recall, not rung 1
  return 1;
}

/** mastery→rung, clamped to the objective's ladder ceiling. */
export function nextRungForObjective(
  objectiveType: ObjectiveType,
  srs: RungSrsState | null,
): number {
  const raw = rawMasteryToRung(srs);
  const ceiling = LADDER_CEILING[objectiveType] ?? 1;
  return Math.min(raw, ceiling);
}

// =====================================================================
// 3. SHELL_CAPABILITIES — which exercise types each shell can consume, and
// the rung range it operates in (§2.2, Option B). One shell now legitimately
// consumes multiple payload types across rounds — this is the decoupling the
// architecture promises.
//
// The exhaustiveness lint at the bottom of this file (Option C) verifies
// every consumed type is a real ExerciseType.
// =====================================================================

export interface ShellCapability {
  /** Exercise types this shell can render. Ordered loosely by rung where it
   *  matters (low→high); buildRound filters by rung via rungToExerciseTypes). */
  consumes: ExerciseType[];
  /** [min, max] rung this shell will ever request. Clamps the round baseline. */
  rungRange: [number, number];
}

export const SHELL_CAPABILITIES: Record<string, ShellCapability> = {
  FLASH_MATCH:       { consumes: ['IMAGE_SELECT', 'MEANING_MATCH', 'AUDIO_L1_SELECT'],                          rungRange: [1, 3] },
  LISTEN_TAP:        { consumes: ['LISTEN_SELECT', 'MINIMAL_PAIR_SWIPE', 'DICTATION'],                          rungRange: [2, 4] },
  UNSCRAMBLE:        { consumes: ['WORD_BANK_BUILD', 'TRANSFORM'],                                              rungRange: [3, 5] },
  WHATS_MISSING:     { consumes: ['IMAGE_SELECT'],                                                              rungRange: [1, 4] }, // rung tracks interaction mode, see whatsmissing spec §3
  STORY_SEQUENCING:  { consumes: ['STORY_COMPREHENSION'],                                                       rungRange: [1, 1] }, // round 1 is manifest-driven (not pool); only the comprehension round uses the pool
  STORY_STAGE:       { consumes: ['STORY_COMPREHENSION'],                                                       rungRange: [1, 1] }, // read-through is manifest-driven; comprehension closer is pool-driven
  DIALOGUE_STAGE:    { consumes: ['DIALOGUE_ROLEPLAY', 'WHO_SAID_IT'],                                          rungRange: [1, 3] }, // read-along → role-read (productive) → WHO_SAID_IT (receptive)
  SPEED_QUIZ:        { consumes: ['MEANING_MATCH', 'IMAGE_SELECT', 'ERROR_SPOT', 'SPELL_CLOZE', 'LISTEN_SELECT', 'STORY_COMPREHENSION'], rungRange: [1, 3] },
  TEAM_BATTLE:       { consumes: ['MEANING_MATCH', 'IMAGE_SELECT', 'ERROR_SPOT', 'SPELL_CLOZE', 'WORD_BANK_BUILD', 'STORY_COMPREHENSION'], rungRange: [1, 3] },
  // Shells not yet redesigned — present so the lint + buildRound have a complete picture.
  GRAMMAR_PRACTICE:  { consumes: ['ERROR_SPOT', 'TRANSFORM'],                                                   rungRange: [2, 3] }, // BoardGrammarForge — rung 4 reads grammar_rules directly (hybrid shell, like STORY_SEQUENCING)
  I_SAY_YOU_SAY:     { consumes: ['SPEAK_SENTENCE'],                                                            rungRange: [1, 1] }, // choral this phase (decision 2)
  SPEAKING:          { consumes: ['SPEAK_SENTENCE'],                                                            rungRange: [1, 1] }, // alias of I_SAY_YOU_SAY
  // ── New-gen shells (MASTER_ROADMAP.md, 2026-08-07) ─────────────────────
  // Grammar ladder starts at rung 2 (rung 1 = presentation, non-pool).
  GRAMMAR_LAB:       { consumes: ['ERROR_SPOT', 'TRANSFORM', 'GRAMMAR_FILL'],                                    rungRange: [2, 4] },
  // Vocab-in-context: rung 1 image recognition → rung 3 cloze/meaning MCQs.
  WORD_DETECTIVE:    { consumes: ['IMAGE_SELECT', 'SPELL_CLOZE', 'MEANING_MATCH', 'AUDIO_L1_SELECT'],            rungRange: [1, 3] },
  // Listening scaffold: recognition (2) → discrimination (3) → production (4-5).
  SOUND_LAB:         { consumes: ['LISTEN_SELECT', 'MINIMAL_PAIR_SWIPE', 'DICTATION', 'SPEAK_SENTENCE'],         rungRange: [2, 5] },
  STORY_QUEST:       { consumes: ['STORY_COMPREHENSION'],                                                        rungRange: [1, 3] },
  SENTENCE_LAB:      { consumes: ['WORD_BANK_BUILD', 'TRANSFORM'],                                               rungRange: [3, 5] },
  PHONICS_ARENA:     { consumes: ['MINIMAL_PAIR_SWIPE', 'LISTEN_SELECT', 'SPEAK_SENTENCE'],                      rungRange: [1, 2] },
  VOCAB_BLITZ:       { consumes: ['MEANING_MATCH', 'IMAGE_SELECT', 'SPELL_CLOZE', 'ERROR_SPOT', 'LISTEN_SELECT', 'STORY_COMPREHENSION'], rungRange: [1, 3] },
  MEMORY_LAB:        { consumes: ['IMAGE_SELECT'],                                                               rungRange: [1, 4] },
  CLASS_RALLY:       { consumes: ['MEANING_MATCH', 'IMAGE_SELECT', 'SPELL_CLOZE', 'LISTEN_SELECT', 'ERROR_SPOT', 'STORY_COMPREHENSION'], rungRange: [1, 3] },
};

// =====================================================================
// 4. Rung → exercise type resolution per objective type (the vocab/grammar/
// story/dialogue ladders from §1.1, restated as the data the builder needs).
// =====================================================================

const VOCAB_LADDER: Record<number, ExerciseType[]> = {
  1: ['IMAGE_SELECT'],
  2: ['LISTEN_SELECT', 'MINIMAL_PAIR_SWIPE'],
  3: ['MEANING_MATCH', 'AUDIO_L1_SELECT', 'SPELL_CLOZE'],
  4: ['TYPE_TRANSLATE', 'DICTATION'],
  5: ['WORD_BANK_BUILD', 'SPEAK_SENTENCE'],
};
const GRAMMAR_LADDER: Record<number, ExerciseType[]> = {
  // rung 1 is presentation-only (not pool-driven). 2=recognize, 3=apply, 4=produce.
  2: ['ERROR_SPOT'],
  3: ['TRANSFORM', 'GRAMMAR_FILL'],
  4: ['TRANSFORM'], // held-out pair (Option A) — same type, different selection
};
const STORY_LADDER: Record<number, ExerciseType[]> = {
  1: ['STORY_COMPREHENSION'],
  2: ['WHO_SAID_IT'],
  3: [],
};
const DIALOGUE_LADDER: Record<number, ExerciseType[]> = {
  1: ['WHO_SAID_IT'],
  2: [],
  3: ['DIALOGUE_ROLEPLAY'],
};

const LADDERS: Record<ObjectiveType, Record<number, ExerciseType[]>> = {
  vocabulary: VOCAB_LADDER,
  grammar: GRAMMAR_LADDER,
  story: STORY_LADDER,
  dialogue: DIALOGUE_LADDER,
  phonics: { 1: ['MINIMAL_PAIR_SWIPE'] },
};

/** Exercise types valid at a given rung for an objective type. */
export function exerciseTypesForRung(objectiveType: ObjectiveType, rung: number): ExerciseType[] {
  return LADDERS[objectiveType]?.[rung] ?? [];
}

// =====================================================================
// 5. PHASE_ENVELOPE — each phase owns an allowed rung range + scoring
// posture (§1.2). This is what turns the PPP phase tags from decorative into
// behaviorally meaningful.
// =====================================================================

export interface PhaseEnvelope {
  rungRange: [number, number];
  scoringPosture: 'none' | 'per-turn' | 'summative';
}

export const PHASE_ENVELOPE: Record<Phase, PhaseEnvelope> = {
  WARMUP:  { rungRange: [1, 1], scoringPosture: 'none' },       // retrieval only, prior unit, optional choral
  INPUT:    { rungRange: [0, 0], scoringPosture: 'none' },       // presentation, pre-rung
  PRACTICE: { rungRange: [1, 5], scoringPosture: 'per-turn' },   // escalates within-slide; ceiling set by class mastery
  OUTPUT:   { rungRange: [2, 4], scoringPosture: 'per-turn' },   // must include at least one rung-3+ round; partial credit active
  ASSESS:   { rungRange: [1, 5], scoringPosture: 'summative' },  // mixed, weighted class-weak-first
  WRAPUP:   { rungRange: [1, 2], scoringPosture: 'none' },       // celebratory, low-stakes
  REVIEW:   { rungRange: [1, 5], scoringPosture: 'per-turn' },   // driven by FSRS next_review <= now
};

/** Dev-time lint (architecture §1.2 / decision 6): warn — never block — if a
 *  shell requests content outside its phase's envelope. The pool is still
 *  thin in production; a hard gate would block legitimate lessons. */
export function warnIfOutsideEnvelope(shellType: string, phase: Phase, rung: number): void {
  if (!import.meta.env.DEV) return;
  const env = PHASE_ENVELOPE[phase];
  if (!env) return;
  const [floor, ceiling] = env.rungRange;
  // INPUT phase is rung 0 (presentation, pre-rung) — any pool-driven request there is misconfigured.
  if (rung < floor || rung > ceiling) {
    // eslint-disable-next-line no-console
    console.warn(
      `[lessonDirector] ${shellType} requested rung ${rung} in ${phase} phase (envelope [${floor},${ceiling}]). ` +
      `This may be fine while content is thin; investigate if it persists.`
    );
  }
}

// =====================================================================
// 6. buildRound — how a slide picks WHICH objectives, at WHICH rung, for the
// current round (§1.3). Pure function: takes pre-fetched weak ordering + SRS
// states + lesson objectives, returns the selection. useEscalatingPool wires
// this to useBoardPool.
//
// Key property: targetRung = min(roundBaseline, masteryRung) — the round
// number is a ceiling on ambition, mastery is the actual cap. A round-5 slide
// never forces a brand-new word into free production.
// =====================================================================

export interface BuildRoundInput {
  /** 1-based round index within this slide. */
  roundIndex: number;
  /** Total rounds this slide will run (drives the baseline ramp). */
  totalRounds: number;
  /** Objective IDs in scope for this lesson (already filtered to the unit). */
  objectiveIds: string[];
  /** Objective type for each objective id (needed for ladder + ceiling). */
  objectiveTypeById: Record<string, ObjectiveType>;
  /** SRS state for each objective id (null = unseen/new). */
  srsByObjective: Record<string, RungSrsState | null>;
  /** Objective IDs ordered weakest-first (from classWeakObjectives). Objectives
   *  not in this list sink to the end in their natural order. */
  weakOrder: string[];
  /** The shell requesting the round (reads SHELL_CAPABILITIES + rungRange). */
  shellType: string;
  /** The current slide's phase (reads PHASE_ENVELOPE). */
  phase: Phase;
  /** Max items to select this round. */
  roundSize: number;
}

export interface BuildRoundOutput {
  /** Selected objective IDs for this round, ordered weakest-first. */
  selectedObjectiveIds: string[];
  /** The target rung for each selected objective (already mastery-clamped). */
  rungByObjective: Record<string, number>;
  /** The exercise types to pull from the pool for this round (union of the
   *  rungs' types, intersected with the shell's consumes list). */
  exerciseTypes: ExerciseType[];
}

/** Linear ramp from the shell's rungRange floor toward its ceiling across the
 *  slide's rounds. Round 1 = floor; last round = ceiling. Exported for tests. */
export function roundBaselineRung(shellType: string, roundIndex: number, totalRounds: number): number {
  const cap = SHELL_CAPABILITIES[shellType];
  if (!cap) return 1;
  const [floor, ceiling] = cap.rungRange;
  if (totalRounds <= 1) return floor;
  const t = (roundIndex - 1) / (totalRounds - 1); // 0..1
  return Math.round(floor + t * (ceiling - floor));
}

export function buildRound(input: BuildRoundInput): BuildRoundOutput {
  const { roundIndex, totalRounds, objectiveIds, objectiveTypeById, srsByObjective, weakOrder, shellType, phase, roundSize } = input;
  const baseline = roundBaselineRung(shellType, roundIndex, totalRounds);
  const env = PHASE_ENVELOPE[phase];
  // Clamp the baseline into the phase envelope (a PRACTICE slide can't exceed its envelope even at round N).
  const envCeiling = env ? env.rungRange[1] : baseline;
  const effectiveBaseline = Math.min(baseline, envCeiling);

  // Rank objectives weakest-first (those not in weakOrder sink to the end).
  const weakRank = (oid: string) => {
    const i = weakOrder.indexOf(oid);
    return i === -1 ? weakOrder.length : i;
  };
  const ranked = objectiveIds.slice().sort((a, b) => weakRank(a) - weakRank(b));

  const selectedObjectiveIds: string[] = [];
  const rungByObjective: Record<string, number> = {};
  const exerciseTypeSet = new Set<ExerciseType>();

  for (const oid of ranked) {
    if (selectedObjectiveIds.length >= roundSize) break;
    const objType = objectiveTypeById[oid] ?? 'vocabulary';
    const masteryRung = nextRungForObjective(objType, srsByObjective[oid] ?? null);
    // targetRung = min(roundBaseline, masteryRung) — mastery caps the climb.
    let targetRung = Math.min(effectiveBaseline, masteryRung);
    if (targetRung < 1) continue; // rung 0 = presentation only; skip in pool-driven rounds
    // Skip presentation-only / empty rungs UP to the ladder ceiling so a
    // never-seen objective is never starved to an empty round (grammar rung 1 is
    // presentation-only — GRAMMAR_LADDER[1] is empty — so a never-seen grammar
    // objective capped at rung 1 must land on its first practice rung instead).
    // The bump only ever yields items where the round was previously EMPTY
    // (empty rungs were skipped before), so it cannot change working behavior.
    const ceiling = LADDER_CEILING[objType] ?? 1;
    while (targetRung <= ceiling && exerciseTypesForRung(objType, targetRung).length === 0) {
      targetRung += 1;
    }
    if (targetRung > ceiling) continue; // no pool-driven rung available above

    const types = exerciseTypesForRung(objType, targetRung);
    // Intersect with the shell's consumes list — only types the shell can render.
    const shellCap = SHELL_CAPABILITIES[shellType];
    const consumableAt = (r: number) => {
      const t = exerciseTypesForRung(objType, r);
      return shellCap ? t.filter((x) => shellCap.consumes.includes(x)) : t;
    };
    let allowed = shellCap ? types.filter((t) => shellCap.consumes.includes(t)) : types;
    let rung = targetRung;

    // Rung-walking (NEWGEN_AUDIT §3.3): if the shell can't render the target
    // rung's types, ADAPT instead of dropping the objective — a shell that
    // doesn't consume rung-1 types (SoundLab, SentenceLab) used to select zero
    // objectives on a fresh class despite a full pool. Prefer an EASIER rung
    // (never above mastery); only if nothing at/below mastery is consumable,
    // take the lowest rung the shell CAN render (playability grace — a game
    // the teacher selected must be playable).
    if (allowed.length === 0) {
      for (let r = targetRung - 1; r >= 1; r--) {
        const t = consumableAt(r);
        if (t.length > 0) { allowed = t; rung = r; break; }
      }
      if (allowed.length === 0) {
        const ladderCeil = LADDER_CEILING[objType] ?? 1;
        for (let r = targetRung + 1; r <= ladderCeil; r++) {
          const t = consumableAt(r);
          if (t.length > 0) { allowed = t; rung = r; break; }
        }
      }
      if (allowed.length === 0) continue; // shell can't render this objective's ladder at all
    }

    selectedObjectiveIds.push(oid);
    rungByObjective[oid] = rung;
    allowed.forEach((t) => exerciseTypeSet.add(t));

    selectedObjectiveIds.push(oid);
    rungByObjective[oid] = targetRung;
    allowed.forEach((t) => exerciseTypeSet.add(t));
  }

  if (import.meta.env.DEV) {
    // Dev-only lint: warn if the round produced nothing despite having objectives.
    if (selectedObjectiveIds.length === 0 && objectiveIds.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[lessonDirector] buildRound produced 0 items for ${shellType} round ${roundIndex}/${totalRounds} ` +
        `(${objectiveIds.length} objectives in scope, baseline rung ${effectiveBaseline}). ` +
        `Likely cause: no exercise types in the shell's consumes list match the objectives' current rungs. ` +
        `Check SHELL_CAPABILITIES.${shellType} vs the ladder.`
      );
    }
    Object.entries(rungByObjective).forEach(([, rung]) => warnIfOutsideEnvelope(shellType, phase, rung));
  }

  return {
    selectedObjectiveIds,
    rungByObjective,
    exerciseTypes: Array.from(exerciseTypeSet),
  };
}

// =====================================================================
// 7. ContextualControlsSpec — the contract every scored shell registers
// (§4.1). Makes the contextual control bar exhaustive (fixes the dead-bar
// bug, audit §H3) and uniform across shells.
// =====================================================================

export interface ContextualControl {
  label: string;
  enabled: boolean;
  onTrigger: () => void;
}

export interface ContextualControlsSpec {
  shellType: string;
  controls: {
    skip?: ContextualControl;        // skip current item/round, no penalty, no remediation push
    revealHint?: ContextualControl;  // narrowed hint (eliminate a distractor, highlight a tile)
    forceCorrect?: ContextualControl; // teacher override for defensible oral answers
    nextRound?: ContextualControl;   // advance to the next round manually
    endSlide?: ContextualControl;    // broadcast SLIDE_COMPLETE
    [key: string]: ContextualControl | undefined; // shells may add specific controls
  };
}

// =====================================================================
// 8. Build-time lint (Option C, §2.2): every type in every SHELL_CAPABILITIES
// consumes list must be a real ExerciseType. Catches typos at startup in dev.
// Runs once at module load.
// =====================================================================

if (import.meta.env.DEV) {
  for (const [shell, cap] of Object.entries(SHELL_CAPABILITIES)) {
    for (const t of cap.consumes) {
      if (!EXERCISE_TYPES.has(t)) {
        // eslint-disable-next-line no-console
        console.error(
          `[lessonDirector] SHELL_CAPABILITIES.${shell}.consumes references unknown exercise type "${t}". ` +
          `Fix the entry — valid types are in types/exercise.ts EXERCISE_TYPES.`
        );
      }
    }
  }
}
