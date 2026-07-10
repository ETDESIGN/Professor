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
