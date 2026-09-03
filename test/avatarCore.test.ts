import { describe, it, expect } from 'vitest';
import {
  normalizeConfig,
  configWithItem,
  configWithBody,
  slotAvailableForBody,
  itemAvailableForBody,
  canonicalConfigString,
  hashString,
  rosterDefaultIndex,
  renderUrlForSize,
  nearestRenderSize,
  baseAssetPath,
  isAvatarBody,
} from '../services/avatarCore';

describe('avatarCore — normalizeConfig', () => {
  it('defaults a null/legacy config to human_boy skin 1 with empty slots', () => {
    const c = normalizeConfig(null);
    expect(c).toEqual({ version: 1, body: 'human_boy', skin: 1, items: {
      hair: null, eyes: null, outfit: null, headwear: null, face: null, handheld: null, back: null, background: null,
    }});
  });

  it('accepts a valid config unchanged and clamps skin', () => {
    const c = normalizeConfig({ version: 1, body: 'robot', skin: 99, items: { headwear: 'hat_crown', hair: 'junk-hair-id' } });
    expect(c.body).toBe('robot');
    expect(c.skin).toBe(6);
    expect(c.items.headwear).toBe('hat_crown');
    expect(c.items.hair).toBe('junk-hair-id'); // unknown ids kept; compat enforced elsewhere
  });

  it('rejects an unknown body', () => {
    expect(normalizeConfig({ body: 'dragon' }).body).toBe('human_boy');
    expect(isAvatarBody('alien')).toBe(true);
    expect(isAvatarBody('unicorn')).toBe(false);
  });
});

describe('avatarCore — compatibility', () => {
  it('human-only slots are unavailable on species bodies', () => {
    expect(slotAvailableForBody('hair', 'human_girl')).toBe(true);
    expect(slotAvailableForBody('outfit', 'robot')).toBe(false);
    expect(slotAvailableForBody('headwear', 'monster')).toBe(true);
  });

  it('item compatibility = slot rule + explicit list', () => {
    expect(itemAvailableForBody({ slot: 'headwear', compatible_bodies: [] }, 'alien')).toBe(true);
    expect(itemAvailableForBody({ slot: 'headwear', compatible_bodies: ['robot'] }, 'alien')).toBe(false);
    expect(itemAvailableForBody({ slot: 'hair', compatible_bodies: [] }, 'robot')).toBe(false);
  });
});

describe('avatarCore — config transforms', () => {
  it('configWithItem sets and clears slots', () => {
    const base = normalizeConfig(null);
    const withHat = configWithItem(base, 'headwear', 'hat_crown');
    expect(withHat.items.headwear).toBe('hat_crown');
    expect(configWithItem(withHat, 'headwear', null).items.headwear).toBeNull();
  });

  it('configWithBody strips human-only items when switching to a species', () => {
    const base = normalizeConfig({ body: 'human_boy', items: { hair: 'hair_afro_dark', outfit: 'outfit_hoodie_blue', headwear: 'headwear_cap_red' } });
    const lookup = (id: string) =>
      id === 'headwear_cap_red' ? { slot: 'headwear' as const, compatible_bodies: [] as never[] } : undefined;
    const robot = configWithBody(base, 'robot', lookup);
    expect(robot.body).toBe('robot');
    expect(robot.items.hair).toBeNull();
    expect(robot.items.outfit).toBeNull();
    expect(robot.items.headwear).toBe('headwear_cap_red'); // universal slot survives
  });

  it('configWithBody strips items with explicit incompatible lists', () => {
    const base = normalizeConfig({ body: 'robot', items: { headwear: 'sig_robot_antenna' } });
    const lookup = (id: string) =>
      id === 'sig_robot_antenna' ? { slot: 'headwear' as const, compatible_bodies: ['robot' as const] } : undefined;
    expect(configWithBody(base, 'alien', lookup).items.headwear).toBeNull();
  });
});

describe('avatarCore — hashing & URLs', () => {
  it('canonicalConfigString is order-independent across slot insertion order', () => {
    const a = normalizeConfig({ body: 'robot', skin: 1, items: { headwear: 'h1', face: 'f1' } });
    const b = normalizeConfig({ body: 'robot', skin: 1, items: { face: 'f1', headwear: 'h1' } });
    expect(canonicalConfigString(a)).toBe(canonicalConfigString(b));
    // nulls dropped, skin matters
    const c = normalizeConfig({ body: 'robot', skin: 2, items: {} });
    expect(canonicalConfigString(c)).not.toBe(canonicalConfigString(a));
  });

  it('roster defaults are deterministic and spread across the range', () => {
    expect(rosterDefaultIndex('abc')).toBe(rosterDefaultIndex('abc'));
    expect(rosterDefaultIndex('abc')).toBeLessThan(12);
    const seen = new Set(Array.from({ length: 50 }, (_, i) => rosterDefaultIndex(`s${i}`)));
    expect(seen.size).toBeGreaterThan(4);
    expect(hashString('x')).toBeGreaterThan(0);
  });

  it('renderUrlForSize swaps the size suffix in BOTH URL formats', () => {
    // Compositor render path (slash-separated).
    expect(renderUrlForSize('https://x/avatars/renders/p/h/512.png', 100)).toBe('https://x/avatars/renders/p/h/128.png');
    // Roster default path (underscore-separated).
    expect(renderUrlForSize('https://x/avatars/defaults/def3_512.png', 600)).toBe('https://x/avatars/defaults/def3_512.png');
    expect(renderUrlForSize('https://x/avatars/defaults/def3_128.png', 300)).toBe('https://x/avatars/defaults/def3_256.png');
    // Non-render URLs pass through untouched.
    expect(renderUrlForSize('https://x/other.png', 512)).toBe('https://x/other.png');
    expect(nearestRenderSize(90)).toBe(128);
    expect(nearestRenderSize(600)).toBe(512);
  });

  it('baseAssetPath clamps human skins and pins species to skin 1', () => {
    expect(baseAssetPath('human_boy', 9)).toBe('avatars/bases/human_boy_skin6.png');
    expect(baseAssetPath('human_girl', 3)).toBe('avatars/bases/human_girl_skin3.png');
    expect(baseAssetPath('robot', 5)).toBe('avatars/bases/robot_skin1.png');
  });
});
