// Evidence gate for the per-game battery mechanics (owner report 2026-09-10:
// "whatever game I choose I get the same lion/polar-bear Chinese-word question
// at the beginning"). Runs the REAL selection pipeline (the pure stages of
// selectLessonItems + v2 routing) against a SNAPSHOT of the real production
// pool for unit e432361f ("A Day at the Zoo", 86 items / 15 types) and asserts
// each game OPENS on its own signature mechanic — no two games may open on the
// same exercise type, and grammar/sentence batteries must never leak
// vocabulary MCQs.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { GAME_CONTENT } from '../services/gameRouting';
import {
  applyFamilyFilter,
  buildBatteryIds,
  orderFamily,
  interleaveStages,
  variateWithinStages,
  sortByLoopStage,
} from '../services/poolService';

type Row = { id: string; objective_id: string; exercise_type: string };
const rows: Row[] = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'zoo-pool-e432361f.json'), 'utf-8'),
);

/**
 * The battery a fresh (all-unseen) student would see, using the SAME pure
 * stages as selectLessonItems: family filter → buildBatteryIds (one per
 * objective + family fill) → arc order → seed shuffle → signature/interleave.
 */
function simulate(
  types?: readonly string[],
  signature?: readonly string[],
  interleave?: boolean,
  seed = 12345,
): { relaxed: boolean; battery: string[] } {
  const family = applyFamilyFilter(rows, types);
  const candidateRows = family.rows as Row[];
  const objectives = Array.from(new Set(candidateRows.map((r) => r.objective_id).filter(Boolean)));
  const familyApplied = !family.relaxed && Boolean(types && types.length > 0);
  const chosenIds = buildBatteryIds(candidateRows, new Map(), objectives, 14, {
    family: familyApplied,
    seed,
    maxPerObjective: familyApplied ? 3 : 1,
  });
  const idType = new Map(candidateRows.map((r) => [r.id, r.exercise_type]));
  // sortByLoopStage only reads exercise_type/objective_id — minimal shapes are fine.
  let ordered = sortByLoopStage(
    chosenIds.map((id) => ({ exercise_type: idType.get(id)!, id })) as any,
    new Map<string, number>(),
  );
  ordered = variateWithinStages(ordered, seed);
  if (signature && signature.length > 0) ordered = orderFamily(ordered, signature);
  if (interleave) ordered = interleaveStages(ordered);
  return { relaxed: family.relaxed, battery: ordered.map((o) => o.exercise_type) };
}

const batteryFor = (game: string, seed = 12345) => {
  const spec = GAME_CONTENT[game];
  if (!spec || spec.kind === 'engine') throw new Error(`${game} is not a pool game`);
  return simulate(
    spec.kind === 'pool' ? spec.types : undefined,
    spec.kind === 'pool' ? spec.signature : undefined,
    spec.kind === 'pool-all' ? spec.interleave : undefined,
    seed,
  );
};

describe('per-game opening mechanics against the REAL zoo pool snapshot', () => {
  it('every pool game opens on its signature exercise type', () => {
    const expectFirst: Record<string, string[]> = {
      SOUND_LAB: ['LISTEN_SELECT'],            // audio → English (not a Chinese MCQ)
      PHONICS_ARENA: ['MINIMAL_PAIR_SWIPE'],   // ship/sheep swipe
      GRAMMAR_LAB: ['GRAMMAR_FILL', 'TRANSFORM'],
      SENTENCE_LAB: ['WORD_BANK_BUILD'],       // word tiles
      STORY_QUEST: ['STORY_COMPREHENSION'],
      SPEAKING: ['SPEAK_SENTENCE'],
      WORD_DETECTIVE: ['IMAGE_SELECT'],        // picture hunt
      VOCAB_BLITZ: ['MEANING_MATCH'],          // word → L1 recall
      DIALOGUE_STAGE: ['DIALOGUE_ROLEPLAY', 'SPEAK_SENTENCE'],
    };
    for (const [game, allowed] of Object.entries(expectFirst)) {
      const { battery } = batteryFor(game);
      expect(allowed, `${game} opened on ${battery[0]}`).toContain(battery[0]);
    }
  });

  it('no two SIGNATURE-led games open on the same exercise type (the reported bug)', () => {
    const openings = new Map<string, string>();
    for (const [game, spec] of Object.entries(GAME_CONTENT)) {
      if (spec.kind !== 'pool' || !spec.signature) continue; // SPEED_QUIZ-style mixed sprints may share
      const first = batteryFor(game).battery[0];
      if (openings.has(first)) {
        throw new Error(`${game} and ${openings.get(first)} both open on ${first}`);
      }
      openings.set(first, game);
    }
  });

  it('grammar and sentence batteries contain ONLY their family (no vocabulary-MCQ leakage)', () => {
    const grammar = batteryFor('GRAMMAR_LAB').battery;
    expect(grammar).not.toContain('MEANING_MATCH');
    expect(grammar).not.toContain('IMAGE_SELECT');
    const sentence = batteryFor('SENTENCE_LAB').battery;
    expect(sentence).not.toContain('MEANING_MATCH');
  });

  it('Story Quest no longer relaxes to the mixed battery (8 story MCQs on 1 objective)', () => {
    const { relaxed, battery } = batteryFor('STORY_QUEST');
    expect(relaxed).toBe(false);
    expect(battery.length).toBeGreaterThanOrEqual(3); // fill pass tops up the 1-objective family
    expect(battery.every((t) => t === 'STORY_COMPREHENSION' || t === 'WHO_SAID_IT')).toBe(true);
  });

  it('Phonics is minimal-pair discrimination only (distinct from Sound Lab)', () => {
    const phonics = batteryFor('PHONICS_ARENA').battery;
    expect(new Set(phonics)).toEqual(new Set(['MINIMAL_PAIR_SWIPE']));
  });

  it('Unit Review interleaves stages instead of running every MCQ first', () => {
    const stageOf = (t: string) =>
      ['IMAGE_SELECT', 'LISTEN_SELECT', 'MEANING_MATCH', 'AUDIO_L1_SELECT', 'SPELL_CLOZE'].includes(t) ? 0
        : ['WORD_BANK_BUILD', 'ERROR_SPOT', 'TRANSFORM', 'MINIMAL_PAIR_SWIPE'].includes(t) ? 1 : 2;
    const review = batteryFor('UNIT_REVIEW', 777).battery;
    const firstRun = review.slice(0, 6).map(stageOf);
    // An interleaved battery must not hold one stage for more than 2 consecutive screens.
    let maxRun = 1; let run = 1;
    for (let i = 1; i < firstRun.length; i++) {
      run = firstRun[i] === firstRun[i - 1] ? run + 1 : 1;
      maxRun = Math.max(maxRun, run);
    }
    expect(maxRun).toBeLessThanOrEqual(2);
  });

  it('openings vary across launches (seed shuffle inside the signature tier)', () => {
    const a = batteryFor('UNIT_REVIEW', 1).battery[1]; // index 1: post-signature slot varies
    const b = batteryFor('UNIT_REVIEW', 2).battery[1];
    const c = batteryFor('UNIT_REVIEW', 3).battery[1];
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });
});
