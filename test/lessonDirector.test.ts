// lessonDirector.test.ts — pool-coverage regression tests (the "zoo every
// round" audit, 2026-08-17). Locks down:
//   1. buildRound selects roundSize DISTINCT objectives (the old duplicated
//      push halved every round: roundSize 6 → 3 words).
//   2. Sequential-deal rotation: unserved objectives are dealt (weakest-first)
//      before already-served ones, so rounds walk the whole pool.
//   3. The rung-walk result is what lands in rungByObjective (the old second
//      push block overwrote it with the pre-walk targetRung).
import { describe, it, expect } from 'vitest';
import { buildRound, type BuildRoundInput } from '../apps/board/lessonDirector';
import { buildQuizComposition } from '../apps/board/quizEngine';
import { servedFor, markServed, resetUnit } from '../apps/board/coverageStore';

const IDS = Array.from({ length: 12 }, (_, i) => `obj-${i + 1}`);

function baseInput(overrides: Partial<BuildRoundInput> = {}): BuildRoundInput {
  return {
    roundIndex: 1,
    totalRounds: 4,
    objectiveIds: [...IDS],
    objectiveTypeById: Object.fromEntries(IDS.map((id) => [id, 'vocabulary' as const])),
    srsByObjective: {}, // all unseen → mastery rung 1
    weakOrder: [],      // fresh class: every objective ties → random tie-break
    shellType: 'FLASH_MATCH',
    phase: 'PRACTICE',
    roundSize: 6,
    ...overrides,
  };
}

describe('buildRound — distinct selection (halving-bug regression)', () => {
  it('selects roundSize DISTINCT objectives (no duplicated ids)', () => {
    const r = buildRound(baseInput());
    expect(r.selectedObjectiveIds).toHaveLength(6);
    expect(new Set(r.selectedObjectiveIds).size).toBe(6);
  });

  it('caps at the number of available objectives', () => {
    const r = buildRound(baseInput({ objectiveIds: IDS.slice(0, 3) }));
    expect(r.selectedObjectiveIds).toHaveLength(3);
  });
});

describe('buildRound — sequential deal, weakest-first rotation', () => {
  it('round 1 gets the weakest objectives when a weak order exists', () => {
    // weakOrder is weakest-first: obj-1 weakest … obj-12 strongest.
    const r = buildRound(baseInput({ weakOrder: [...IDS] }));
    expect(new Set(r.selectedObjectiveIds)).toEqual(new Set(IDS.slice(0, 6)));
  });

  it('deals unserved objectives before already-served ones', () => {
    const weakOrder = [...IDS];
    const r1 = buildRound(baseInput({ weakOrder }));
    const r2 = buildRound(baseInput({ weakOrder, servedObjectives: r1.selectedObjectiveIds }));
    // Round 2 must be the NEXT 6 weakest — none of round 1's words repeat.
    expect(new Set(r2.selectedObjectiveIds)).toEqual(new Set(IDS.slice(6, 12)));
    expect(r2.selectedObjectiveIds).toHaveLength(6);
  });

  it('covers the whole pool across rounds (12 words, 4 rounds x 6)', () => {
    const weakOrder = [...IDS];
    const served: string[] = [];
    for (let round = 1; round <= 2; round++) {
      const r = buildRound(baseInput({ roundIndex: round, weakOrder, servedObjectives: [...served] }));
      served.push(...r.selectedObjectiveIds);
    }
    expect(new Set(served).size).toBe(12); // full coverage, no repeats
  });

  it('wraps back to served objectives once the pool is exhausted', () => {
    const weakOrder = [...IDS];
    const r = buildRound(baseInput({ weakOrder, servedObjectives: [...IDS] }));
    // Everything served → back to the weakest 6.
    expect(new Set(r.selectedObjectiveIds)).toEqual(new Set(IDS.slice(0, 6)));
  });

  it('randomizes the tie order on a fresh class (no weak order)', () => {
    // All objectives tie at rank 0 — over many builds, more than one distinct
    // first objective must appear (guards against deterministic insertion
    // order, the "zoo always first" symptom).
    const firsts = new Set<string>();
    for (let i = 0; i < 40; i++) {
      firsts.add(buildRound(baseInput()).selectedObjectiveIds[0]);
    }
    expect(firsts.size).toBeGreaterThan(1);
  });
});

describe('buildRound — rung walk is preserved', () => {
  it('uses the shell-adapted rung, not the pre-walk target', () => {
    // SOUND_LAB consumes nothing at vocab rung 1 (IMAGE_SELECT), so an unseen
    // objective (mastery rung 1) must be walked UP to rung 2. The old
    // duplicated push overwrote rungByObjective back to targetRung (1).
    const r = buildRound(baseInput({
      shellType: 'SOUND_LAB',
      objectiveIds: IDS.slice(0, 2),
      roundSize: 2,
    }));
    expect(r.selectedObjectiveIds).toHaveLength(2);
    for (const oid of r.selectedObjectiveIds) {
      expect(r.rungByObjective[oid]).toBe(2);
    }
    expect(r.exerciseTypes).toContain('LISTEN_SELECT');
  });
});

describe('buildQuizComposition — sequential deal', () => {
  const objectives = IDS.map((id) => ({ id, type: 'vocabulary' as const }));
  const srs: Record<string, null> = Object.fromEntries(IDS.map((id) => [id, null]));

  it('selects totalQuestions distinct objectives', () => {
    const comp = buildQuizComposition(objectives, 8, [], srs);
    expect(comp).toHaveLength(8);
    expect(new Set(comp.map((c) => c.objectiveId)).size).toBe(8);
  });

  it('deals unserved objectives before served ones', () => {
    // Two quizzes of 6 from a 12-word pool: the second must be exactly the 6
    // words the first did NOT serve.
    const first = buildQuizComposition(objectives, 6, [], srs).map((c) => c.objectiveId);
    expect(new Set(first).size).toBe(6);
    const second = buildQuizComposition(objectives, 6, [], srs, first).map((c) => c.objectiveId);
    for (const id of second) {
      expect(first).not.toContain(id);
    }
  });
});

describe('coverageStore', () => {
  it('records and resets served objectives per unit', () => {
    const unit = 'test-unit-coverage';
    resetUnit(unit);
    expect(servedFor(unit)).toEqual([]);
    markServed(unit, IDS.slice(0, 3));
    expect(servedFor(unit)).toHaveLength(3);
    markServed(unit, IDS.slice(0, 3)); // idempotent
    expect(servedFor(unit)).toHaveLength(3);
    resetUnit(unit);
    expect(servedFor(unit)).toEqual([]);
  });
});
