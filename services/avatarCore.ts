// Avatar system v2 — pure shared logic (no Supabase, no React; testable).
// Design: docs/superpowers/specs/2026-09-03-avatar-system-v2-design.md
// Config is the source of truth (profiles.avatar_config); every rendered
// image is a cache keyed by config hash. avatar_url ALWAYS holds a render
// URL (never JSON) — that invariant is what makes the 20+ existing <img>
// consumers correct without touching them.

export type AvatarBody = 'human_boy' | 'human_girl' | 'robot' | 'alien' | 'monster';
export type AvatarSlot = 'hair' | 'eyes' | 'outfit' | 'headwear' | 'face' | 'handheld' | 'back' | 'background';
export type AvatarItemKind = 'item' | 'base' | 'emote' | 'powerup';
export type AvatarRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type AvatarRenderVariant = 'idle' | 'celebrate' | 'wave' | 'dance_01';

/** shop_items row projected to the avatar domain (kind 'item' | 'base'). */
export interface AvatarItem {
  id: string;
  name: string;
  slot: AvatarSlot | null;
  kind: AvatarItemKind;
  rarity: AvatarRarity | null;
  cost: number;
  description: string | null;
  compatible_bodies: AvatarBody[];
  layer_asset_path: string | null;
  preview_url: string | null;
  unlock_type: 'gems' | 'default' | 'quest' | 'event';
  sort_order: number;
}

export interface AvatarConfig {
  version: 1;
  body: AvatarBody;
  skin: number;
  items: Partial<Record<AvatarSlot, string | null>>;
}

export const AVATAR_BODIES: readonly AvatarBody[] = ['human_boy', 'human_girl', 'robot', 'alien', 'monster'] as const;
export const AVATAR_SLOTS: readonly AvatarSlot[] = ['hair', 'eyes', 'outfit', 'headwear', 'face', 'handheld', 'back', 'background'] as const;

/** Slots that require body-fit art — human bodies only in v1 (spec §2.1). */
export const HUMAN_ONLY_SLOTS: ReadonlySet<AvatarSlot> = new Set(['hair', 'eyes', 'outfit']);

/** Composite layer order; 'body' is the base render itself. */
export const RENDER_ORDER: readonly (AvatarSlot | 'body')[] = ['background', 'back', 'body', 'outfit', 'hair', 'eyes', 'face', 'headwear', 'handheld'] as const;

export const DEFAULT_BODY: AvatarBody = 'human_boy';
export const SKIN_COUNT = 6;
export const ROSTER_DEFAULT_COUNT = 12;
export const RENDER_SIZES = [128, 256, 512, 768] as const;
/** Canonical avatar_url size (what profiles.avatar_url points at). */
export const CANONICAL_SIZE = 512;

const SUPABASE_URL: string = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL) || '';
export const GENERATED_MEDIA_PUBLIC = (path: string): string =>
  `${SUPABASE_URL}/storage/v1/object/public/generated-media/${path}`;

export function isHumanBody(body: AvatarBody): boolean {
  return body === 'human_boy' || body === 'human_girl';
}

export function slotAvailableForBody(slot: AvatarSlot, body: AvatarBody): boolean {
  return !HUMAN_ONLY_SLOTS.has(slot) || isHumanBody(body);
}

export function itemAvailableForBody(
  item: Pick<AvatarItem, 'slot' | 'compatible_bodies'>,
  body: AvatarBody,
): boolean {
  if (!item.slot) return false;
  if (!slotAvailableForBody(item.slot, body)) return false;
  return item.compatible_bodies.length === 0 || item.compatible_bodies.includes(body);
}

export function isAvatarBody(v: unknown): v is AvatarBody {
  return typeof v === 'string' && (AVATAR_BODIES as readonly string[]).includes(v);
}

/** Tolerant parse of a stored avatar_config into a canonical AvatarConfig. */
export function normalizeConfig(raw: unknown): AvatarConfig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const body = isAvatarBody(obj.body) ? obj.body : DEFAULT_BODY;
  const skinRaw = Number(obj.skin);
  const skin = Number.isFinite(skinRaw) ? Math.min(Math.max(Math.round(skinRaw), 1), SKIN_COUNT) : 1;
  const items: AvatarConfig['items'] = {};
  const rawItems = (obj.items && typeof obj.items === 'object' ? obj.items : {}) as Record<string, unknown>;
  for (const slot of AVATAR_SLOTS) {
    const v = rawItems[slot];
    items[slot] = typeof v === 'string' && v ? v : null;
  }
  return { version: 1, body, skin, items };
}

export function configWithItem(config: AvatarConfig, slot: AvatarSlot, itemId: string | null): AvatarConfig {
  return { ...config, items: { ...config.items, [slot]: itemId } };
}

/**
 * Switch body, stripping items that no longer fit (human-only slots, or
 * item-level compatible_bodies). `lookup` maps item id → its slot/compat;
 * unknown ids are kept only if their slot is still available.
 */
export function configWithBody(
  config: AvatarConfig,
  body: AvatarBody,
  lookup?: (id: string) => Pick<AvatarItem, 'slot' | 'compatible_bodies'> | undefined,
): AvatarConfig {
  const items: AvatarConfig['items'] = { ...config.items };
  for (const slot of AVATAR_SLOTS) {
    const id = items[slot];
    if (!id) continue;
    if (!slotAvailableForBody(slot, body)) {
      items[slot] = null;
      continue;
    }
    const meta = lookup?.(id);
    if (meta && meta.compatible_bodies.length > 0 && !meta.compatible_bodies.includes(body)) {
      items[slot] = null;
    }
  }
  return { ...config, body, items };
}

/** Canonical string for hashing — MUST match the edge compositor's
 *  canonicalization (sorted slots, nulls dropped, skin included). */
export function canonicalConfigString(config: AvatarConfig): string {
  const parts: string[] = [];
  for (const slot of AVATAR_SLOTS) {
    const id = config.items[slot];
    if (id) parts.push(`${slot}:${id}`);
  }
  return JSON.stringify({ version: 1, body: config.body, skin: config.skin, items: parts.sort() });
}

/** djb2 — deterministic roster-default assignment (client + scripts). */
export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function rosterDefaultIndex(id: string): number {
  return hashString(id) % ROSTER_DEFAULT_COUNT;
}

/** Pre-composited default render for (esp. unclaimed) roster students. */
export function rosterDefaultUrl(rosterId: string, size: number = CANONICAL_SIZE): string {
  const s = nearestRenderSize(size);
  return GENERATED_MEDIA_PUBLIC(`avatars/defaults/def${rosterDefaultIndex(rosterId)}_${s}.png`);
}

/** Storage path of the base body render (species have one fixed skin). */
export function baseAssetPath(body: AvatarBody, skin: number): string {
  const s = isHumanBody(body) ? Math.min(Math.max(Math.round(skin), 1), SKIN_COUNT) : 1;
  return `avatars/bases/${body}_skin${s}.png`;
}

export function layerUrlFor(item: Pick<AvatarItem, 'layer_asset_path' | 'preview_url'>): string | null {
  if (item.preview_url) return item.preview_url;
  if (item.layer_asset_path) return GENERATED_MEDIA_PUBLIC(item.layer_asset_path);
  return null;
}

export function nearestRenderSize(size: number): number {
  let best: number = RENDER_SIZES[0];
  for (const s of RENDER_SIZES) {
    if (Math.abs(s - size) < Math.abs(best - size)) best = s;
  }
  return best;
}

/** `.../hash/512.png` (compositor) or `.../def0_512.png` (defaults) → the
 *  requested size variant. Deterministic render paths only. */
export function renderUrlForSize(url: string, size: number): string {
  const s = nearestRenderSize(size);
  return url.replace(/([/_])(128|256|512|768)\.png$/, `$1${s}.png`);
}

/** Shop/builder rarity presentation (static class strings — Tailwind-safe). */
export const RARITY_META: Record<AvatarRarity, { label: string; chip: string; ring: string; glow: string }> = {
  common: {
    label: 'Common',
    chip: 'bg-slate-100 text-slate-600 border border-slate-200',
    ring: 'border-slate-200',
    glow: '',
  },
  rare: {
    label: 'Rare',
    chip: 'bg-blue-50 text-blue-600 border border-blue-200',
    ring: 'border-blue-300',
    glow: 'shadow-[0_0_12px_rgba(59,130,246,0.25)]',
  },
  epic: {
    label: 'Epic',
    chip: 'bg-purple-50 text-purple-600 border border-purple-200',
    ring: 'border-purple-300',
    glow: 'shadow-[0_0_14px_rgba(168,85,247,0.3)]',
  },
  legendary: {
    label: 'Legendary',
    chip: 'bg-amber-50 text-amber-600 border border-amber-300',
    ring: 'border-amber-400',
    glow: 'shadow-[0_0_16px_rgba(251,191,36,0.45)]',
  },
};

export const SLOT_LABELS: Record<AvatarSlot, string> = {
  hair: 'Hair',
  eyes: 'Eyes',
  outfit: 'Outfit',
  headwear: 'Headwear',
  face: 'Face',
  handheld: 'Handheld',
  back: 'Back',
  background: 'Background',
};
