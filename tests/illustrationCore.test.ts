// tests/illustrationCore.test.ts
import { describe, it, expect } from 'vitest';
import { composePrompt, aspectRatioFor, HOUSE_STYLE } from '../supabase/functions/_shared/illustrationCore';

const unit = { title: 'Space Adventure', topic: 'planets and rockets', artDirection: 'deep blue palette; rockets, stars, soft glow' };

describe('composePrompt', () => {
  it('includes content, house style, surface directive, art direction, and no-text rule', () => {
    const p = composePrompt('vocab', unit, 'a cartoon astronaut.');
    expect(p).toContain('a cartoon astronaut');
    expect(p).toContain(HOUSE_STYLE);
    expect(p).toContain('centered');
    expect(p).toContain('deep blue palette');
    expect(p).toContain('Space Adventure');
    expect(p).toMatch(/no text/i);
  });

  it('uses per-surface directives', () => {
    expect(composePrompt('cover', unit, 'x')).toContain('upper third');
    expect(composePrompt('story_scene', unit, 'x')).toContain('reference images');
    expect(composePrompt('portrait', unit, 'x')).toContain('bust portrait');
  });

  it('works without art direction (old units)', () => {
    const p = composePrompt('vocab', { title: 'Farm Animals' }, 'a cow');
    expect(p).toContain('a cow');
    expect(p).not.toContain('Art direction');
  });
});

describe('aspectRatioFor', () => {
  it('maps surfaces', () => {
    expect(aspectRatioFor('vocab')).toBe('1:1');
    expect(aspectRatioFor('cover')).toBe('16:9');
    expect(aspectRatioFor('story_scene')).toBe('16:9');
    expect(aspectRatioFor('portrait')).toBe('1:1');
  });
});
