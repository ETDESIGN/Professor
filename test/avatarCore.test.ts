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
  it('defaults a null/legacy config to human_boy with empty slots', () => {
    const c = normalizeConfig(null);
    expect(c).toEqual({ version: 1, body: 'human_boy', items: {
      hair: null, eyes: null, outfit: null, headwear: null, face: null, handheld: null, back: null, background: null,
    }});
  });

  it('accepts a valid config unchanged and drops the retired skin key', () => {
    const c = normalizeConfig({ version: 1, body: 'robot', skin: 99, items: { headwear: 'headwear_cap_red', hair: 'junk-hair-id' } });
    expect(c.body).toBe('robot');
    expect((c as unknown as { skin?: number }).skin).toBeUndefined();
    expect(c.items.headwear).toBe('headwear_cap_red');
    expect(c.items.hair).toBe('junk-hair-id'); // unknown ids kept; compat enforced elsewhere
  });

  it('migrates robot_bender → robot and accepts dragon', () => {
    expect(normalizeConfig({ body: 'robot_bender' }).body).toBe('robot');
    expect(isAvatarBody('dragon')).toBe(true);
    expect(normalizeConfig({ body: 'unicorn' }).body).toBe('human_boy');
    expect(isAvatarBody('alien')).toBe(true);
    expect(isAvatarBody('unicorn')).toBe(false);
  });
});

describe('avatarCore — compatibility', () => {
  it('all slots are available on all bodies (per-item compat is the gate)', () => {
    expect(slotAvailableForBody('hair', 'human_girl')).toBe(true);
    expect(slotAvailableForBody('outfit', 'robot')).toBe(true);
    expect(slotAvailableForBody('headwear', 'monster')).toBe(true);
  });

  it('item compatibility = explicit list only', () => {
    expect(itemAvailableForBody({ slot: 'headwear', compatible_bodies: [] }, 'alien')).toBe(true);
    expect(itemAvailableForBody({ slot: 'headwear', compatible_bodies: ['robot'] }, 'alien')).toBe(false);
    expect(itemAvailableForBody({ slot: 'hair', compatible_bodies: ['dragon'] }, 'dragon')).toBe(true);
  });
});

describe('avatarCore — config transforms', () => {
  it('configWithItem sets and clears slots', () => {
    const base = normalizeConfig(null);
    const withHat = configWithItem(base, 'headwear', 'hat_crown');
    expect(withHat.items.headwear).toBe('hat_crown');
    expect(configWithItem(withHat, 'headwear', null).items.headwear).toBeNull();
  });

  it('configWithBody keeps universal items and strips explicit incompatibles', () => {
    const base = normalizeConfig({ body: 'human_boy', items: { hair: 'hair_spiky_brown', outfit: 'outfit_hoodie_red', headwear: 'headwear_cap_red' } });
    const lookup = (id: string) =>
      id === 'hair_spiky_brown' ? { slot: 'hair' as const, compatible_bodies: ['human_boy' as const] } : undefined;
    const robot = configWithBody(base, 'robot', lookup);
    expect(robot.body).toBe('robot');
    expect(robot.items.hair).toBeNull(); // boy-only wig stripped
    expect(robot.items.outfit).toBe('outfit_hoodie_red'); // universal top survives
    expect(robot.items.headwear).toBe('headwear_cap_red');
  });

  it('configWithBody strips items with explicit incompatible lists', () => {
    const base = normalizeConfig({ body: 'robot', items: { headwear: 'headwear_antenna_bolt' } });
    const lookup = (id: string) =>
      id === 'headwear_antenna_bolt' ? { slot: 'headwear' as const, compatible_bodies: ['robot' as const] } : undefined;
    expect(configWithBody(base, 'alien', lookup).items.headwear).toBeNull();
  });
});

describe('avatarCore — hashing & URLs', () => {
  it('canonicalConfigString is order-independent across slot insertion order', () => {
    const a = normalizeConfig({ body: 'robot', items: { headwear: 'h1', face: 'f1' } });
    const b = normalizeConfig({ body: 'robot', items: { face: 'f1', headwear: 'h1' } });
    expect(canonicalConfigString(a)).toBe(canonicalConfigString(b));
    // nulls dropped, body matters
    const c = normalizeConfig({ body: 'alien', items: {} });
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

  it('baseAssetPath is the single-skin Stitch path', () => {
    expect(baseAssetPath('human_boy')).toBe('avatars/bases/human_boy.png');
    expect(baseAssetPath('dragon')).toBe('avatars/bases/dragon.png');
  });
});
