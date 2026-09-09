import { describe, it, expect } from 'vitest';
import { pickForObjective } from '../services/poolService';
import { PoolItem } from '../types/exercise';
import type { ObjectiveState } from '../services/learnerState';

function item(type: any, oid = 'o1'): PoolItem {
  return {
    id: `${type}-${oid}`,
    unit_id: 'u1',
    objective_id: oid,
    exercise_type: type,
    difficulty: 2,
    content: { type } as any,
  };
}

function masteryState(effective: any, r = 0.9): ObjectiveState {
  return {
    objective_id: 'o1', srs_item_id: null, stability: 1, difficulty: 5, reps: 2, lapses: 0,
    mastery_state: effective, effective_mastery: effective, retrievability: r,
    last_review: null, next_review: null, is_due: false,
  };
}

describe('pickForObjective (mastery escalation ladder)', () => {
  it('new/learning -> prefers receptive types', () => {
    const items = [item('TYPE_TRANSLATE'), item('IMAGE_SELECT'), item('SPEAK_SENTENCE')];
    const picked = pickForObjective(masteryState('learning'), items);
    expect(picked?.exercise_type).toBe('IMAGE_SELECT');
  });

  it('decaying -> prefers receptive (re-teach)', () => {
    const items = [item('TYPE_TRANSLATE'), item('LISTEN_SELECT')];
    expect(pickForObjective(masteryState('decaying', 0.5), items)?.exercise_type).toBe('LISTEN_SELECT');
  });

  it('familiar -> prefers constrained production', () => {
    const items = [item('IMAGE_SELECT'), item('WORD_BANK_BUILD'), item('TYPE_TRANSLATE')];
    const picked = pickForObjective(masteryState('familiar'), items);
    expect(['WORD_BANK_BUILD', 'TYPE_TRANSLATE']).toContain(picked?.exercise_type);
  });

  it('mastered -> prefers free production', () => {
    const items = [item('IMAGE_SELECT'), item('SPEAK_SENTENCE'), item('WORD_BANK_BUILD')];
    const picked = pickForObjective(masteryState('mastered'), items);
    expect(picked?.exercise_type).toBe('SPEAK_SENTENCE');
  });

  it('no state (unseen) -> receptive', () => {
    const items = [item('TYPE_TRANSLATE'), item('MEANING_MATCH')];
    expect(pickForObjective(undefined, items)?.exercise_type).toBe('MEANING_MATCH');
  });

  it('falls back to any available item when preferred types absent', () => {
    const items = [item('SPEAK_SENTENCE')];
    expect(pickForObjective(masteryState('learning'), items)?.exercise_type).toBe('SPEAK_SENTENCE');
  });

  it('empty items -> null', () => {
    expect(pickForObjective(masteryState('mastered'), [])).toBeNull();
  });
});

import { loopStageRank, sortByLoopStage } from '../services/poolService';

describe('loop-stage ordering (P-C round sequencer)', () => {
  it('ranks recognize(0) < recall(1) < produce(2)', () => {
    expect(loopStageRank('IMAGE_SELECT')).toBe(0);
    expect(loopStageRank('WORD_BANK_BUILD')).toBe(1);
    expect(loopStageRank('TYPE_TRANSLATE')).toBe(2);
  });

  it('orders a session recognize -> recall -> produce, weakest-first within each', () => {
    const item = (type: any, oid: string): any => ({
      id: `${type}-${oid}`, unit_id: 'u', objective_id: oid, exercise_type: type, difficulty: 2, content: { type } as any,
    });
    // Deliberately out of order: produce, recognize, recall.
    const items = [
      item('TYPE_TRANSLATE', 'a'), // produce, weak-ish
      item('IMAGE_SELECT', 'b'),   // recognize, weak
      item('WORD_BANK_BUILD', 'c'),// recall
      item('MEANING_MATCH', 'd'),  // recognize, weakest
    ];
    const r = new Map([['a', 0.9], ['b', 0.5], ['d', 0.2]]);
    const sorted = sortByLoopStage(items, r);
    const types = sorted.map((s) => s.exercise_type);
    // All receptive (d weakest, then b) first, then recall (c), then produce (a).
    expect(types).toEqual(['MEANING_MATCH', 'IMAGE_SELECT', 'WORD_BANK_BUILD', 'TYPE_TRANSLATE']);
  });
});

import { variateWithinStages, applyFamilyFilter } from '../services/poolService';

describe('variateWithinStages (replay variety, audit 2026-09-10 F1)', () => {
  const mixed = [
    { exercise_type: 'IMAGE_SELECT', id: 'r1' },
    { exercise_type: 'LISTEN_SELECT', id: 'r2' },
    { exercise_type: 'MEANING_MATCH', id: 'r3' },
    { exercise_type: 'WORD_BANK_BUILD', id: 'c1' },
    { exercise_type: 'ERROR_SPOT', id: 'c2' },
    { exercise_type: 'TYPE_TRANSLATE', id: 'p1' },
    { exercise_type: 'SPEAK_SENTENCE', id: 'p2' },
  ];

  it('preserves the recognize → recall → produce arc', () => {
    const out = variateWithinStages(mixed, 42);
    const ranks = out.map((x) => (x.id.startsWith('r') ? 0 : x.id.startsWith('c') ? 1 : 2));
    expect([...ranks].sort()).toEqual(ranks); // non-decreasing
  });

  it('is deterministic for a fixed seed and never drops items', () => {
    const a = variateWithinStages(mixed, 7);
    const b = variateWithinStages(mixed, 7);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a).toHaveLength(mixed.length);
  });

  it('different seeds produce different orders (variety)', () => {
    const a = variateWithinStages(mixed, 1).map((x) => x.id).join(',');
    const b = variateWithinStages(mixed, 2).map((x) => x.id).join(',');
    const c = variateWithinStages(mixed, 3).map((x) => x.id).join(',');
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });
});

describe('applyFamilyFilter (game-scoped batteries, audit 2026-09-10 F1)', () => {
  // 5 items across 5 distinct objectives per type — above both family thresholds.
  const rows = (types: string[]) =>
    types.flatMap((t, i) =>
      ['a', 'b', 'c', 'd', 'e'].map((s) => ({
        id: `${t}-${i}${s}`,
        objective_id: `o${i}${s}`,
        exercise_type: t,
      })),
    );

  it('scopes to the family when it is rich enough', () => {
    const all = rows(['LISTEN_SELECT', 'IMAGE_SELECT', 'GRAMMAR_FILL']);
    const out = applyFamilyFilter(all, ['LISTEN_SELECT']);
    expect(out.relaxed).toBe(false);
    expect(out.rows.every((r) => r.exercise_type === 'LISTEN_SELECT')).toBe(true);
  });

  it('relaxes to all types when the family is too thin (never a starved battery)', () => {
    const all = rows(['IMAGE_SELECT', 'GRAMMAR_FILL']);
    const thin = all.slice(0, 2); // 2 items, 2 objectives
    const out = applyFamilyFilter(thin, ['LISTEN_SELECT']);
    expect(out.relaxed).toBe(true);
    expect(out.rows).toHaveLength(2);
  });

  it('relaxes when the family has items but too few objectives', () => {
    const sameObjective = [1, 2, 3, 4, 5].map((i) => ({ id: `l${i}`, objective_id: 'same', exercise_type: 'LISTEN_SELECT' }));
    const out = applyFamilyFilter(sameObjective, ['LISTEN_SELECT']);
    expect(out.relaxed).toBe(true);
  });

  it('no types → passthrough', () => {
    const all = rows(['IMAGE_SELECT']);
    expect(applyFamilyFilter(all, undefined)).toEqual({ rows: all, relaxed: false });
    expect(applyFamilyFilter(all, [])).toEqual({ rows: all, relaxed: false });
  });
});
