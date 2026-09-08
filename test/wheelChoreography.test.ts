// wheelChoreography — pure timing/curve contract for the carnival picker wheel
// (spec: docs/superpowers/specs/2026-09-09-carnival-wheel-choreography-design.md).
import { describe, it, expect } from 'vitest';
import {
  SPIN_MS,
  REVEAL_HOLD_MS,
  SPIN_REVEAL_MS,
  landAtFor,
  spinAngle,
  spinAngleSamples,
} from '../services/wheelChoreography';

describe('wheelChoreography constants', () => {
  it('reveal deadline is spin + hold', () => {
    expect(SPIN_REVEAL_MS).toBe(SPIN_MS + REVEAL_HOLD_MS);
  });

  it('hold is the Duolingo-readable 3s window; spin stays under 5s', () => {
    expect(REVEAL_HOLD_MS).toBe(3000);
    expect(SPIN_MS).toBeGreaterThanOrEqual(3000);
    expect(SPIN_MS).toBeLessThanOrEqual(5000);
  });

  it('landAtFor derives the land milestone from the reveal deadline', () => {
    const revealAt = 1_000_000;
    expect(landAtFor(revealAt)).toBe(revealAt - REVEAL_HOLD_MS);
  });
});

describe('spinAngle curve', () => {
  it('hits its endpoints exactly (t=0 → 0, t=1 → 1)', () => {
    expect(spinAngle(0)).toBe(0);
    expect(spinAngle(1)).toBe(1);
    expect(spinAngle(-0.5)).toBe(0);
    expect(spinAngle(1.5)).toBe(1);
  });

  it('dips below zero during the anticipation wind-back', () => {
    expect(spinAngle(0.04)).toBeLessThan(0);
    // deepest dip is small: ~0.6% of travel (≈10° of a 1800° spin)
    const dip = Math.min(...spinAngleSamples(200));
    expect(dip).toBeLessThan(0);
    expect(dip).toBeGreaterThan(-0.02);
  });

  it('is monotonic non-decreasing from the anticipation end to the overshoot peak', () => {
    // The settle wobble (peak ≈ t 0.9 → back to 1.0) is DELIBERATELY
    // non-monotonic — monotonicity only holds on the main travel.
    const samples = spinAngleSamples(400);
    for (let i = 1; i < samples.length; i++) {
      const t = i / 400;
      if (t < 0.09 || t > 0.9) continue;
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] - 1e-9);
    }
  });

  it('overshoots past 1.0 in the settle, then returns to exactly 1.0', () => {
    const samples = spinAngleSamples(1000);
    const peak = Math.max(...samples);
    expect(peak).toBeGreaterThan(1.0005); // visible wobble…
    expect(peak).toBeLessThan(1.02); // …but never a neighbour's slice (0.6% default)
    expect(samples[samples.length - 1]).toBe(1);
  });

  it('shrinks the overshoot on demand (narrow winner segments)', () => {
    const samples = spinAngleSamples(1000, { overshoot: 0.001 });
    const peak = Math.max(...samples);
    expect(peak).toBeGreaterThan(1.00005);
    expect(peak).toBeLessThan(1.003);
  });

  it('spends its tail crawling: >96% of travel completes by 70% of the spin', () => {
    // The long decelerating tail is what makes the final ticks read one-by-one.
    expect(spinAngle(0.7)).toBeGreaterThan(0.96);
    expect(spinAngle(0.7)).toBeLessThan(1);
  });
});
