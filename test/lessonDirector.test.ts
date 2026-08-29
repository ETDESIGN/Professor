// lessonDirector.test.ts — pool-coverage regression tests (the "zoo every
// round" audit, 2026-08-17). Locks down:
//   1. buildRound selects roundSize DISTINCT objectives (the old duplicated
//      push halved every round: roundSize 6 → 3 words).
//   2. Sequential-deal rotation: unserved objectives are dealt (weakest-first)
//      before already-served ones, so rounds walk the whole pool.
//   3. The rung-walk result is what lands in rungByObjective (the old second
//      push block overwrote it with the pre-walk targetRung).
import { describe, it, expect, beforeEach } from 'vitest';
import { buildRound, denseWeakRanks, type BuildRoundInput } from '../apps/board/lessonDirector';
import { buildQuizComposition } from '../apps/board/quizEngine';
import { servedFor, markServed, resetUnit } from '../apps/board/coverageStore';
import { makeRng } from '../services/seededRandom';

const IDS = Array.from({ length: 12 }, (_, i) => `obj-${i + 1}`);

function baseInput(overrides: Partial<BuildRoundInput> = {}): BuildRoundInput {
  return {
    roundIndex: 1,
    totalRounds: 4,
    objectiveIds: [...IDS],
    objectiveTypeById: Object.fromEntries(IDS.map((id) => [id, 'vocabulary' as const])),
    srsByObjective: {}, // all unseen → mastery rung 1
    weakRanks: {},      // fresh class: every objective ties → random tie-break
    shellType: 'FLASH_MATCH',
    phase: 'PRACTICE',
    roundSize: 6,
    ...overrides,
  };
}

// Helper: positional order → strict dense ranks (what the old tests meant).
const strictRanks = (ids: string[]) => Object.fromEntries(ids.map((id, i) => [id, i]));

describe('buildRound — dense-rank tie-break (the "first 4 words forever" regression, 2026-08-30)', () => {
  it('full weak list with ALL-EQUAL retrievability does NOT collapse to the insertion-order prefix', () => {
    // Production shape: classWeakObjectives returns every objective, fresh
    // class ties at R = 0. Under the old positional ranking the subsequent
    // stable sort restored DB insertion order and the shuffle was a no-op.
    const ranks = denseWeakRanks(IDS.map((id) => ({ objective_id: id, retrievability: 0 })));
    const firsts = new Set<string>();
    for (let i = 0; i < 40; i++) {
      firsts.add(buildRound(baseInput({ weakRanks: ranks })).selectedObjectiveIds[0]);
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('deterministic per (session seed, round): identical input → identical selection', () => {
    const ranks = denseWeakRanks(IDS.map((id) => ({ objective_id: id, retrievability: 0 })));
    const a = buildRound(baseInput({ weakRanks: ranks, rng: makeRng('sess-1', 'unit-1', 1) }));
    const b = buildRound(baseInput({ weakRanks: ranks, rng: makeRng('sess-1', 'unit-1', 1) }));
    expect(a.selectedObjectiveIds).toEqual(b.selectedObjectiveIds);
  });

  it('strict ranks preserve weak-first regardless of the shuffle', () => {
    const r = buildRound(baseInput({ weakRanks: strictRanks([...IDS]) }));
    expect(new Set(r.selectedObjectiveIds)).toEqual(new Set(IDS.slice(0, 6)));
  });
});

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
    // strictRanks: obj-1 weakest (rank 0) … obj-12 strongest (rank 11).
    const r = buildRound(baseInput({ weakRanks: strictRanks([...IDS]) }));
    expect(new Set(r.selectedObjectiveIds)).toEqual(new Set(IDS.slice(0, 6)));
  });

  it('deals unserved objectives before already-served ones', () => {
    const weakRanks = strictRanks([...IDS]);
    const r1 = buildRound(baseInput({ weakRanks }));
    const r2 = buildRound(baseInput({ weakRanks, servedObjectives: r1.selectedObjectiveIds }));
    // Round 2 must be the NEXT 6 weakest — none of round 1's words repeat.
    expect(new Set(r2.selectedObjectiveIds)).toEqual(new Set(IDS.slice(6, 12)));
    expect(r2.selectedObjectiveIds).toHaveLength(6);
  });

  it('covers the whole pool across rounds (12 words, 4 rounds x 6)', () => {
    const weakRanks = strictRanks([...IDS]);
    const served: string[] = [];
    for (let round = 1; round <= 2; round++) {
      const r = buildRound(baseInput({ roundIndex: round, weakRanks, servedObjectives: [...served] }));
      served.push(...r.selectedObjectiveIds);
    }
    expect(new Set(served).size).toBe(12); // full coverage, no repeats
  });

  it('wraps back to served objectives once the pool is exhausted', () => {
    const weakRanks = strictRanks([...IDS]);
    const r = buildRound(baseInput({ weakRanks, servedObjectives: [...IDS] }));
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
    const comp = buildQuizComposition(objectives, 8, {}, srs);
    expect(comp).toHaveLength(8);
    expect(new Set(comp.map((c) => c.objectiveId)).size).toBe(8);
  });

  it('deals unserved objectives before served ones', () => {
    // Two quizzes of 6 from a 12-word pool: the second must be exactly the 6
    // words the first did NOT serve.
    const first = buildQuizComposition(objectives, 6, {}, srs).map((c) => c.objectiveId);
    expect(new Set(first).size).toBe(6);
    const second = buildQuizComposition(objectives, 6, {}, srs, first).map((c) => c.objectiveId);
    for (const id of second) {
      expect(first).not.toContain(id);
    }
  });

  it('all-tied ranks do not collapse to the insertion-order prefix', () => {
    // Production shape (same regression as buildRound): a fresh class ties
    // every objective at R = 0. Dense ranks must leave the tie to the
    // pre-sort shuffle instead of restoring a deterministic prefix.
    const ranks = denseWeakRanks(IDS.map((id) => ({ objective_id: id, retrievability: 0 })));
    const firsts = new Set<string>();
    for (let i = 0; i < 40; i++) {
      firsts.add(buildQuizComposition(objectives, 6, ranks, srs)[0].objectiveId);
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('strict ranks pick the weakest slots first', () => {
    const ranks = strictRanks([...IDS]);
    const comp = buildQuizComposition(objectives, 6, ranks, srs);
    expect(new Set(comp.map((c) => c.objectiveId))).toEqual(new Set(IDS.slice(0, 6)));
  });
});

describe('coverageStore', () => {
  const session = 'sess-test';
  const unit = 'test-unit-coverage';

  beforeEach(() => {
    resetUnit(session, unit);
  });

  it('records and resets served objectives per (session, unit)', () => {
    expect(servedFor(session, unit)).toEqual([]);
    markServed(session, unit, IDS.slice(0, 3));
    expect(servedFor(session, unit)).toHaveLength(3);
    markServed(session, unit, IDS.slice(0, 3)); // idempotent
    expect(servedFor(session, unit)).toHaveLength(3);
    resetUnit(session, unit);
    expect(servedFor(session, unit)).toEqual([]);
  });
});

describe('denseWeakRanks', () => {
  it('gives equal retrievability the SAME rank (the production fresh-class case)', () => {
    const weak = IDS.map((id) => ({ objective_id: id, retrievability: 0 }));
    const ranks = denseWeakRanks(weak);
    for (const id of IDS) expect(ranks[id]).toBe(0);
  });

  it('dense-ranks distinct retrievability ascending', () => {
    const weak = [
      { objective_id: 'a', retrievability: 0.2 },
      { objective_id: 'b', retrievability: 0.9 },
      { objective_id: 'c', retrievability: 0.2 },
      { objective_id: 'd', retrievability: 0.5 },
    ];
    expect(denseWeakRanks(weak)).toEqual({ a: 0, b: 2, c: 0, d: 1 });
  });

  it('returns {} for empty input', () => {
    expect(denseWeakRanks([])).toEqual({});
  });
});
