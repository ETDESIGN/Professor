// Canonical allow-list of activity block `type` values rendered by the
// Classroom Board. Source of truth: apps/board/ClassroomBoard.tsx (the render
// switch). orchestrate-lesson validates generated flow against this set so
// malformed AI output is rejected/repaired before being persisted to units.flow.
//
// Keep this list in sync with the Board's render switch.

/**
 * Pedagogical phase of a lesson step. Encoded on every block so renderers
 * (board timeline + student phase bar) know the step's instructional role:
 * WARMUP (switch to English), INPUT (present vocab/grammar), PRACTICE
 * (controlled exercises), OUTPUT (free production), ASSESS (mastery check),
 * WRAPUP (score/homework). REVIEW is a cross-unit spaced-repetition phase.
 * This realizes the Pre-In-Post / PPP model the docs promised (audit G8/A1).
 */
export type Phase =
  | 'WARMUP'
  | 'INPUT'
  | 'PRACTICE'
  | 'OUTPUT'
  | 'ASSESS'
  | 'WRAPUP'
  | 'REVIEW';

export const SUPPORTED_PHASES: ReadonlySet<string> = new Set<Phase>([
  'WARMUP',
  'INPUT',
  'PRACTICE',
  'OUTPUT',
  'ASSESS',
  'WRAPUP',
  'REVIEW',
]);

export const SUPPORTED_FLOW_TYPES: ReadonlySet<string> = new Set([
  'INTRO_SPLASH',
  'MEDIA_PLAYER',
  'LIVE_WARMUP',
  'FOCUS_CARDS',
  'GAME_ARENA',
  'STORY_STAGE',
  'GRAMMAR_SANDBOX',
  'GRAMMAR_PRACTICE',
  'TEAM_BATTLE',
  'UNSCRAMBLE',
  'WHATS_MISSING',
  'SPEED_QUIZ',
  'STORY_SEQUENCING',
  'I_SAY_YOU_SAY',
  'SPEAKING',
  'MAGIC_EYES',
  'POLL',
  'WHEEL_OF_DESTINY',
  'UNIT_SELECTION',
  'SCRAMBLE',
  'FLASH_MATCH',
  'LISTEN_TAP',
]);

export interface FlowBlock {
  type: string;
  data: Record<string, any>;
  title?: string;
  duration?: number;
  /** Pedagogical phase of this step (see Phase). Passed through untouched. */
  phase?: Phase;
}

/**
 * Validate and normalise an AI/transformer-produced flow array.
 * - Coerces to an array.
 * - Drops blocks whose `type` is not supported by the Board.
 * - Guarantees each block has a `data` object.
 * - Ensures an INTRO_SPLASH exists at index 0 (the Board progress bar + first
 *   paint depend on a slide existing).
 * - Returns { flow, dropped } so callers can log quality issues.
 */
export function validateAndNormalizeFlow(
  raw: any,
  fallbackTitle = 'Lesson',
): { flow: FlowBlock[]; dropped: number } {
  let dropped = 0;

  if (!Array.isArray(raw)) {
    return { flow: [makeIntro(fallbackTitle)], dropped: 0 };
  }

  const flow: FlowBlock[] = [];

  for (const block of raw) {
    if (!block || typeof block !== 'object') {
      dropped++;
      continue;
    }
    const type = typeof block.type === 'string' ? block.type.toUpperCase() : '';
    if (!type || !SUPPORTED_FLOW_TYPES.has(type)) {
      dropped++;
      continue;
    }
    // Pass-through phase (validated against the allow-list; unknown/dropped so
    // a renderer never sees a typo). PRACTICE/ASSESS blocks are pool-driven at
    // runtime; INPUT/WARMUP/OUTPUT/WRAPUP are passive/presentation.
    let phase: Phase | undefined;
    if (typeof block.phase === 'string') {
      const p = block.phase.toUpperCase();
      if (SUPPORTED_PHASES.has(p)) phase = p as Phase;
    }
    flow.push({
      type,
      title: typeof block.title === 'string' ? block.title : undefined,
      duration: typeof block.duration === 'number' ? block.duration : undefined,
      data:
        block.data && typeof block.data === 'object' && !Array.isArray(block.data)
          ? block.data
          : {},
      ...(phase ? { phase } : {}),
    });
  }

  // Guarantee an intro slide at index 0.
  if (flow.length === 0 || flow[0].type !== 'INTRO_SPLASH') {
    flow.unshift(makeIntro(fallbackTitle));
  }

  return { flow, dropped };
}

function makeIntro(title: string): FlowBlock {
  return { type: 'INTRO_SPLASH', data: { title, subtitle: '', description: '' } };
}
