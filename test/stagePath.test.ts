import { describe, it, expect } from 'vitest';
import {
  starsForAccuracy,
  computeNodeStates,
  isPathComplete,
  deriveDefaultPath,
  resolveUnitPath,
} from '../services/stageProgressService';
import type { StudentStage } from '../types/stage';

const stage = (over: Partial<StudentStage> & { id: string }): StudentStage => ({
  title: 'Lesson',
  icon: 'star',
  kind: 'lesson',
  lock: 'auto',
  xpReward: 10,
  blocks: [],
  ...over,
});

const done = (id: string, stars = 2) => ({
  stage_id: id,
  unit_id: 'u1',
  status: 'completed' as const,
  stars,
  best_accuracy: 80,
  attempts: 1,
  completed_at: '2026-08-19T00:00:00Z',
});

describe('starsForAccuracy', () => {
  it('thresholds are >=90 -> 3, >=70 -> 2, else 1', () => {
    expect(starsForAccuracy(100)).toBe(3);
    expect(starsForAccuracy(90)).toBe(3);
    expect(starsForAccuracy(89)).toBe(2);
    expect(starsForAccuracy(70)).toBe(2);
    expect(starsForAccuracy(69)).toBe(1);
    expect(starsForAccuracy(0)).toBe(1);
  });
});

describe('computeNodeStates', () => {
  it('first node is active, later auto nodes are locked (sequential default)', () => {
    const path = [stage({ id: 'a' }), stage({ id: 'b' }), stage({ id: 'c' })];
    const states = computeNodeStates(path, {});
    expect(states.map((s) => s.state)).toEqual(['active', 'locked', 'locked']);
    expect(states[0].playable).toBe(true);
    expect(states[1].playable).toBe(false);
  });

  it('completing a node unlocks only the next one', () => {
    const path = [stage({ id: 'a' }), stage({ id: 'b' }), stage({ id: 'c' })];
    const states = computeNodeStates(path, { a: done('a') });
    expect(states.map((s) => s.state)).toEqual(['completed', 'active', 'locked']);
    expect(states[0].stars).toBe(2);
    expect(states[0].playable).toBe(true); // replay allowed
  });

  it("teacher 'locked' forces a node closed and HALTS the chain (locked nodes can't complete, so later auto nodes stay locked; teachers use 'open' to let students pass)", () => {
    const path = [stage({ id: 'a' }), stage({ id: 'b', lock: 'locked' }), stage({ id: 'c' })];
    const states = computeNodeStates(path, { a: done('a') });
    expect(states.map((s) => s.state)).toEqual(['completed', 'locked', 'locked']);
  });

  it("teacher 'locked' on the first node locks the whole path head", () => {
    const path = [stage({ id: 'a', lock: 'locked' }), stage({ id: 'b' })];
    expect(computeNodeStates(path, {}).map((s) => s.state)).toEqual(['locked', 'locked']);
  });

  it("teacher 'open' unlocks a node out of sequence but does NOT complete the chain for later auto nodes", () => {
    const path = [stage({ id: 'a' }), stage({ id: 'b', lock: 'open' }), stage({ id: 'c' })];
    const states = computeNodeStates(path, {});
    expect(states.map((s) => s.state)).toEqual(['active', 'active', 'locked']);
  });

  it('an open-but-not-completed node keeps the following auto node locked', () => {
    const path = [stage({ id: 'a' }), stage({ id: 'b', lock: 'open' }), stage({ id: 'c' })];
    const states = computeNodeStates(path, { b: done('b') });
    // b completed but a not: c requires its PREDECESSOR (b) completed -> active
    expect(states.map((s) => s.state)).toEqual(['active', 'completed', 'active']);
  });

  it('completed beats a later teacher lock (completion is a fact and stays replayable)', () => {
    const path = [stage({ id: 'a', lock: 'locked' })];
    expect(computeNodeStates(path, { a: done('a') })[0].state).toBe('completed');
  });

  it('isPathComplete requires every node completed', () => {
    const path = [stage({ id: 'a' }), stage({ id: 'b' })];
    expect(isPathComplete(computeNodeStates(path, { a: done('a') }))).toBe(false);
    expect(isPathComplete(computeNodeStates(path, { a: done('a'), b: done('b') }))).toBe(true);
    expect(isPathComplete(computeNodeStates([], {}))).toBe(false);
  });

  it('invisible nodes are skipped entirely — not returned, not shown', () => {
    const path = [stage({ id: 'a' }), stage({ id: 'ghost', visible: false }), stage({ id: 'b' })];
    const states = computeNodeStates(path, {});
    expect(states.map((s) => s.stage.id)).toEqual(['a', 'b']);
  });

  it('an invisible node does not gate the chain — the node after it inherits the last visible predecessor', () => {
    const path = [stage({ id: 'a' }), stage({ id: 'ghost', visible: false }), stage({ id: 'b' })];
    // a NOT completed, ghost invisible: b still requires a -> locked
    expect(computeNodeStates(path, {}).map((s) => s.state)).toEqual(['active', 'locked']);
    // a completed: b unlocks even though the hidden ghost between them was never played
    expect(computeNodeStates(path, { a: done('a') }).map((s) => s.state)).toEqual(['completed', 'active']);
  });

  it('an invisible LOCKED node does not block the chain (unlike a visible locked one)', () => {
    const path = [stage({ id: 'a' }), stage({ id: 'wall', visible: false, lock: 'locked' }), stage({ id: 'b' })];
    expect(computeNodeStates(path, { a: done('a') }).map((s) => s.state)).toEqual(['completed', 'active']);
  });

  it('the chest ignores invisible nodes (isPathComplete over visible nodes only)', () => {
    const path = [stage({ id: 'a' }), stage({ id: 'ghost', visible: false })];
    expect(isPathComplete(computeNodeStates(path, { a: done('a') }))).toBe(true);
  });
});

describe('deriveDefaultPath', () => {
  const unit = {
    id: 'u1',
    flow: [
      { id: 's0', type: 'INTRO_SPLASH', title: 'Welcome', duration: 60, data: {} },
      { id: 's1', type: 'FOCUS_CARDS', title: 'New Vocabulary', duration: 300, data: {} },
      { id: 's2', type: 'GAME_ARENA', title: 'Practice', duration: 300, data: {}, phase: 'PRACTICE' },
      { id: 's3', type: 'STORY_STAGE', title: 'The Story', duration: 480, data: {} },
      { id: 's4', type: 'MEDIA_PLAYER', title: 'Song', duration: 240, data: {} },
    ],
  };

  it('attaches lead-ins to the next scored block and makes one stage per scored block', () => {
    const path = deriveDefaultPath(unit);
    // scored blocks: s2, s3 — then trailing MEDIA_PLAYER flushes as its own node — plus review
    expect(path.map((s) => s.blocks.map((b) => b.id))).toEqual([
      ['s0', 's1', 's2'],
      ['s3'],
      ['s4'],
      [expect.any(String)],
    ]);
    expect(path.every((s) => s.lock === 'auto')).toBe(true);
  });

  it('always appends a review stage (path never empty)', () => {
    expect(deriveDefaultPath({ id: 'u2', flow: [] })).toHaveLength(1);
    const [review] = deriveDefaultPath({ id: 'u2', flow: [] });
    expect(review.kind).toBe('review');
    expect(review.blocks[0].phase).toBe('ASSESS');
    expect(review.blocks[0].data.poolDriven).toBe(true);
  });

  it('derives deterministic ids (same flow -> same ids across calls)', () => {
    expect(deriveDefaultPath(unit).map((s) => s.id)).toEqual(deriveDefaultPath(unit).map((s) => s.id));
  });

  it('different units / positions never collide', () => {
    const a = deriveDefaultPath(unit).map((s) => s.id);
    const b = deriveDefaultPath({ ...unit, id: 'u9' }).map((s) => s.id);
    expect(a).not.toEqual(b);
  });
});

describe('resolveUnitPath', () => {
  it('prefers the teacher-saved path when present', () => {
    const saved = [stage({ id: 'x1', title: 'Custom' })];
    const path = resolveUnitPath({ id: 'u1', flow: [{ id: 's', type: 'GAME_ARENA' }], studentPath: saved });
    expect(path).toHaveLength(1);
    expect(path[0].title).toBe('Custom');
  });

  it('falls back to the derived path when studentPath is empty or malformed', () => {
    expect(resolveUnitPath({ id: 'u1', flow: [], studentPath: [] })[0].kind).toBe('review');
    expect(resolveUnitPath({ id: 'u1', flow: [], studentPath: [{ nope: true } as any] })[0].kind).toBe('review');
  });

  it('normalizes stored stages (defaults for missing fields)', () => {
    const path = resolveUnitPath({ id: 'u1', flow: [], studentPath: [{ id: 'z' }] });
    expect(path[0].lock).toBe('auto');
    expect(path[0].kind).toBe('lesson');
    expect(path[0].blocks).toEqual([]);
    expect(path[0].visible).toBe(true);
  });

  it('passes an explicit visible:false through normalization', () => {
    const path = resolveUnitPath({ id: 'u1', flow: [], studentPath: [{ id: 'h', visible: false }] });
    expect(path[0].visible).toBe(false);
  });
});
