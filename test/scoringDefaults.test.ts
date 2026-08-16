import { describe, it, expect } from 'vitest';
import {
  scoreForAttempt,
  streakBonus,
  CLEAN_SCORE_BASE,
  MISTAKE_PENALTY,
  MAX_QUESTION_POINTS,
} from '../apps/board/templates/scoringDefaults';

describe('scoringDefaults (1–5 scale)', () => {
  it('exposes the rescaled model constants', () => {
    expect(CLEAN_SCORE_BASE).toBe(1);
    expect(MISTAKE_PENALTY).toBe(1);
    expect(MAX_QUESTION_POINTS).toBe(5);
  });

  it('awards the difficulty value for a clean answer', () => {
    expect(scoreForAttempt(0, 1)).toBe(1);
    expect(scoreForAttempt(0, 2)).toBe(2);
    expect(scoreForAttempt(0, 3)).toBe(3);
  });

  it('prior mistakes do NOT reduce the award — the live −1 is the whole cost', () => {
    expect(scoreForAttempt(3, 2)).toBe(2);
    expect(scoreForAttempt(1, 3)).toBe(3);
  });

  it('streaks add a flat bonus (+1 at ≥3, +2 at ≥5)', () => {
    expect(streakBonus(0)).toBe(0);
    expect(streakBonus(2)).toBe(0);
    expect(streakBonus(3)).toBe(1);
    expect(streakBonus(4)).toBe(1);
    expect(streakBonus(5)).toBe(2);
    expect(scoreForAttempt(0, 1, 1.0, 3)).toBe(2);
    expect(scoreForAttempt(0, 2, 1.0, 5)).toBe(4);
  });

  it('difficulty 3 with a 5-streak is the "very special" max of 5', () => {
    expect(scoreForAttempt(0, 3, 1.0, 5)).toBe(5);
  });

  it('caps any single question at MAX_QUESTION_POINTS (double-or-nothing bet)', () => {
    expect(scoreForAttempt(0, 3, 2.0, 5)).toBe(5);
  });

  it('any success earns at least 1 point (partial credit rounds up, never 0)', () => {
    expect(scoreForAttempt(0, 1, 0.3)).toBe(1);
    expect(scoreForAttempt(0, 2, 0.5)).toBe(1);
    expect(scoreForAttempt(0, 3, 0.5)).toBe(2);
  });

  it('unknown difficulty falls back to the base value', () => {
    expect(scoreForAttempt(0, 99)).toBe(1);
    expect(scoreForAttempt(0)).toBe(1);
  });
});
