import { describe, it, expect } from 'vitest';
import { themeForUnit, pickFocusUnit } from '../apps/student/atlas/territory';

describe('themeForUnit', () => {
  it('uses explicit unit theme columns when present', () => {
    expect(themeForUnit({ title: 'Power Up', topic: 'mix', theme: 'Safari', mascotEmoji: '🦁', tagline: 'Go wild!' }))
      .toEqual({ emoji: '🦁', label: 'Safari', tagline: 'Go wild!' });
  });

  it('derives Farm from topic/title keywords', () => {
    expect(themeForUnit({ title: 'Down on the Farm', topic: 'Farm animals' }).label).toBe('Farm');
    expect(themeForUnit({ title: 'Down on the Farm', topic: 'Farm animals' }).emoji).toBe('🚜');
  });

  it('derives Ocean for sea topics', () => {
    expect(themeForUnit({ title: 'Power Up', topic: 'Ocean life' }).label).toBe('Ocean');
  });

  it('derives Safari for animal topics that are not farm', () => {
    expect(themeForUnit({ title: 'Zoo Day', topic: 'Wild animals' }).label).toBe('Safari');
  });

  it('falls back to the default territory', () => {
    expect(themeForUnit({ title: 'Mystery', topic: 'grammar' }).label).toBe('Discovery');
    expect(themeForUnit({}).emoji).toBe('🧭');
  });
});

describe('pickFocusUnit', () => {
  const units = [{ id: 'a', status: 'Completed' }, { id: 'b', status: 'Active' }, { id: 'c', status: 'Locked' }];
  it('prefers the first unlocked unit not mastered-complete', () => {
    expect(pickFocusUnit(units, { a: { isComplete: true } })?.id).toBe('b');
    expect(pickFocusUnit(units, {})?.id).toBe('a');
  });
  it('returns the first unit when everything is complete', () => {
    expect(pickFocusUnit(units, { a: { isComplete: true }, b: { isComplete: true } })?.id).toBe('a');
  });
  it('handles empty input', () => {
    expect(pickFocusUnit([], {})).toBeUndefined();
  });
});
