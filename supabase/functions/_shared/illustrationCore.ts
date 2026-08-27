// supabase/functions/_shared/illustrationCore.ts
// Pure, runtime-agnostic illustration core — imported by the edge wrapper
// (_shared/illustration.ts, Deno) AND tsx scripts (Node). Use only fetch +
// crypto.subtle. NEVER import Deno- or Node-specific APIs here.

export type Surface = 'vocab' | 'cover' | 'story_scene' | 'portrait';

export const HOUSE_STYLE =
  "modern children's picture-book illustration, soft rounded shapes, warm friendly palette, clean flat vector style with subtle gradients, gentle outlines, cheerful and expressive, high contrast for classroom projection, uncluttered composition";

const SURFACE_DIRECTIVES: Record<Surface, string> = {
  vocab: 'single main subject, perfectly centered, plain soft background, nothing else in frame',
  cover: 'wide establishing scene of the unit theme, upper third visually calm to leave room for a title',
  story_scene:
    'cinematic storybook scene of the described moment, clear environment and mood, any characters drawn exactly as they appear in the reference images',
  portrait: 'bust portrait of one character facing the viewer, friendly expression, simple soft background',
};

const ASPECT_RATIOS: Record<Surface, '1:1' | '16:9'> = {
  vocab: '1:1',
  cover: '16:9',
  story_scene: '16:9',
  portrait: '1:1',
};

export interface UnitArtContext {
  title: string;
  topic?: string | null;
  artDirection?: string | null;
}

export function aspectRatioFor(surface: Surface): '1:1' | '16:9' {
  return ASPECT_RATIOS[surface];
}

export function composePrompt(surface: Surface, unit: UnitArtContext, content: string): string {
  const parts = [String(content || '').trim().replace(/\.+$/, ''), `Style: ${HOUSE_STYLE}.`];
  parts.push(`${SURFACE_DIRECTIVES[surface]}.`);
  const dir = String(unit.artDirection || '').trim();
  if (dir) parts.push(`Art direction: ${dir.replace(/\.+$/, '')}.`);
  const ctx = [unit.title, unit.topic].filter(Boolean).join(' — ');
  if (ctx) parts.push(`Unit context: ${ctx}.`);
  parts.push('Strictly no text, no letters, no numbers, no logos, no watermark.');
  return parts.join(' ');
}
