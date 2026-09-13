// Local fallback art (2026-09-14, China-access workstream).
//
// api.dicebear.com is unreachable from mainland China — every dicebear
// fallback URL rendered as a broken image there. These helpers return
// same-origin SVGs from public/art/ instead. Deterministic per seed so a
// given word/user always gets the same artwork.
//
// Pure string functions — no React, no DOM.

const COVER_COUNT = 6;
const AVATAR_COUNT = 4;

/** Old persisted placeholder URLs that must never be rendered as real art. */
export function isRemotePlaceholder(url?: string | null): boolean {
  if (!url) return true;
  return url.includes('dicebear') || url.startsWith('https://pollinations.ai');
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic local cover art path (pastel gradient + glyph). */
export function fallbackCover(seed: string): string {
  return `/art/cover-${hashSeed(seed || 'unit') % COVER_COUNT}.svg`;
}

/** Deterministic local avatar art path (person silhouette on pastel bg). */
export function fallbackAvatar(seed: string): string {
  return `/art/avatar-${hashSeed(seed || 'user') % AVATAR_COUNT}.svg`;
}

/** Render-time guard: pass through real images, swap placeholders/missing. */
export function coverOrFallback(url: string | null | undefined, seed: string): string {
  return isRemotePlaceholder(url) ? fallbackCover(seed) : url as string;
}

/** Render-time guard: pass through real avatars, swap placeholders/missing. */
export function avatarOrFallback(url: string | null | undefined, seed: string): string {
  return isRemotePlaceholder(url) ? fallbackAvatar(seed) : url as string;
}

/** Student-app mascot (ListenTap / SentenceScramble companion). */
export const MASCOT_ART = '/art/mascot.svg';

/** HomeMap reward-chest icon. */
export const CHEST_ART = '/art/chest.svg';
