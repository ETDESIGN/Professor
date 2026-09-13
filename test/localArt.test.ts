// Local fallback art (China access, 2026-09-14): deterministic same-origin
// SVG paths replacing api.dicebear.com (unreachable from mainland China) and
// guarding old persisted dicebear/pollinations placeholder URLs.
import { describe, expect, it } from 'vitest';
import {
  fallbackAvatar,
  fallbackCover,
  isRemotePlaceholder,
  coverOrFallback,
  avatarOrFallback,
} from '../services/localArt';

describe('isRemotePlaceholder', () => {
  it('treats empty/null/undefined as placeholder', () => {
    expect(isRemotePlaceholder(undefined)).toBe(true);
    expect(isRemotePlaceholder(null)).toBe(true);
    expect(isRemotePlaceholder('')).toBe(true);
  });

  it('flags legacy dicebear and pollinations URLs', () => {
    expect(isRemotePlaceholder('https://api.dicebear.com/7.x/shapes/svg?seed=x')).toBe(true);
    expect(isRemotePlaceholder('https://pollinations.ai/p/foo')).toBe(true);
  });

  it('passes through real image URLs', () => {
    expect(isRemotePlaceholder('https://xsdnzijketjnzhakqtit.supabase.co/storage/v1/object/public/media/cover.jpg')).toBe(false);
    expect(isRemotePlaceholder('/art/cover-1.svg')).toBe(false);
  });
});

describe('fallbackCover / fallbackAvatar', () => {
  it('are deterministic for the same seed', () => {
    expect(fallbackCover('tractor')).toBe(fallbackCover('tractor'));
    expect(fallbackAvatar('Ms. Li')).toBe(fallbackAvatar('Ms. Li'));
  });

  it('return paths within the existing variant range', () => {
    for (const seed of ['a', 'b', 'tractor', 'leaf', 'mountain', 'x y z', '长颈鹿']) {
      expect(fallbackCover(seed)).toMatch(/^\/art\/cover-[0-5]\.svg$/);
      expect(fallbackAvatar(seed)).toMatch(/^\/art\/avatar-[0-3]\.svg$/);
    }
  });

  it('fall back to a default seed on empty input', () => {
    expect(fallbackCover('')).toMatch(/^\/art\/cover-\d\.svg$/);
    expect(fallbackAvatar('')).toMatch(/^\/art\/avatar-\d\.svg$/);
  });

  it('spread seeds across variants (not all identical)', () => {
    const covers = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(fallbackCover));
    expect(covers.size).toBeGreaterThan(1);
  });
});

describe('coverOrFallback / avatarOrFallback', () => {
  it('pass through real URLs untouched', () => {
    const real = 'https://example.com/real.jpg';
    expect(coverOrFallback(real, 'seed')).toBe(real);
    expect(avatarOrFallback(real, 'seed')).toBe(real);
  });

  it('swap missing and legacy-placeholder URLs for local art', () => {
    expect(coverOrFallback(null, 'unit-1')).toBe(fallbackCover('unit-1'));
    expect(coverOrFallback('https://api.dicebear.com/7.x/shapes/svg?seed=old', 'unit-1')).toBe(fallbackCover('unit-1'));
    expect(avatarOrFallback(undefined, 'Teacher')).toBe(fallbackAvatar('Teacher'));
  });
});
