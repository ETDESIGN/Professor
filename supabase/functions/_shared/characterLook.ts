// characterLook.ts — shared character-consistency helpers (Edge / Deno).
//
// WHY (locked L1 / advisor §7.3):
// Recurring characters must look + sound the SAME across every unit in a book.
// Visual consistency is achieved by prepending a reusable `look_prompt`
// (stored on the character row) to every image-generation prompt that involves
// that character. This is provider-agnostic (works with Pollinations/flux
// today) — a `seed` column can layer on top later IF the provider confirms
// reliable seed-locking, but the design must not depend on it.
//
// This module is the single mechanism for that prepending, used by:
//   - enrich-unit (story/dialogue/character branches — Phase 1.1-6)
//   - generate-media (character portrait generation, called from the picker)
//
// A parallel browser-side helper lives in services/characterLook.ts for the
// CharacterPickerModal (Phase 1.1-3). Keep the two in sync — the format is
// deliberately identical so a character generates consistently regardless of
// whether the request originates client-side or server-side.

/**
 * Build an image prompt that keeps a character visually consistent.
 * Prepends the character's `look_prompt` to the scene-specific prompt so the
 * same character renders with the same appearance across units.
 *
 * Format: "<look_prompt>. Scene: <scenePrompt>"
 *   - If no look_prompt, returns the scene prompt unchanged (no-op).
 *   - Avoids double-prepending if scenePrompt already starts with the look.
 */
export function buildPromptWithCharacter(scenePrompt: string, lookPrompt?: string | null): string {
  const scene = (scenePrompt || '').trim();
  const look = (lookPrompt || '').trim();
  if (!look) return scene;
  if (scene.toLowerCase().startsWith(look.toLowerCase().slice(0, 24))) return scene;
  return `${look}. Scene: ${scene}`;
}

export interface CharacterLook {
  id: string;
  name: string;
  look_prompt: string | null;
  voice_id: string | null;
  role: string | null;
}

/**
 * Look up a character by (book, name) for its look_prompt / voice_id.
 * Returns null if not found (e.g. a one-off speaker with no library entry) —
 * callers should treat null as "no consistency constraints apply".
 *
 * Normalized name match (trim + lowercase) to tolerate casing differences
 * between how generation writes a name and how it's stored.
 */
export async function fetchCharacterByName(
  sbClient: any,
  bookId: string,
  name: string,
): Promise<CharacterLook | null> {
  if (!bookId || !name) return null;
  try {
    const { data, error } = await sbClient
      .from('characters')
      .select('id, name, look_prompt, voice_id, role')
      .eq('book_id', bookId)
      .ilike('name', name.trim())
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as CharacterLook;
  } catch {
    return null;
  }
}

/**
 * Resolve the voice_id for a speaker line. Returns the character's voice_id if
 * the character exists and has one set; otherwise null (caller falls back to
 * the default voice). Used by TTS generation for story/dialogue audio so the
 * same character sounds consistent across units (advisor §7.4).
 */
export async function resolveSpeakerVoice(
  sbClient: any,
  bookId: string,
  speakerName: string,
): Promise<string | null> {
  const ch = await fetchCharacterByName(sbClient, bookId, speakerName);
  return ch?.voice_id ?? null;
}
