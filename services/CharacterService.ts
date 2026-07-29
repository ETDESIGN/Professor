import { supabase } from './supabaseClient';

/**
 * CharacterService — Phase 1.1-3.
 *
 * Frontend CRUD for the book-level character library (locked L1). Characters
 * are scoped to a BOOK, not a unit — they're the recurring cast that appears
 * across every unit in a course book. This service talks to the `characters`
 * table; the `unit_characters` join (which characters appear in a given unit)
 * is managed via linkUnit/unlinkUnit.
 *
 * Server-side consistency (look_prompt prepend, voice_id resolution) lives in
 * the edge functions via _shared/characterLook.ts; this service is for the
 * teacher-facing CRUD + picker modal.
 */

export interface Character {
    id: string;
    book_id: string;
    name: string;
    role: string | null;
    description: string | null;
    personality: string | null;
    look_prompt: string | null;
    reference_image_asset_id: string | null;
    voice_id: string | null;
    created_at: string;
    // joined image_url from assets when fetched with the relation (convenience)
    image_url?: string | null;
}

export interface CharacterInput {
    name: string;
    role?: string | null;
    description?: string | null;
    personality?: string | null;
    look_prompt?: string | null;
    voice_id?: string | null;
}

export const CharacterService = {
    /** List all characters in a book (the cast). Ordered by creation. */
    async listForBook(bookId: string): Promise<Character[]> {
        const { data, error } = await supabase
            .from('characters')
            .select('*')
            .eq('book_id', bookId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return (data || []) as Character[];
    },

    /** Get one character by id. */
    async get(id: string): Promise<Character | null> {
        const { data, error } = await supabase
            .from('characters')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) throw error;
        return (data as Character) || null;
    },

    /** Find a character by (book, name) — case-insensitive. */
    async findByName(bookId: string, name: string): Promise<Character | null> {
        const { data, error } = await supabase
            .from('characters')
            .select('*')
            .eq('book_id', bookId)
            .ilike('name', name.trim())
            .maybeSingle();
        if (error) throw error;
        return (data as Character) || null;
    },

    /** Create a new character in the book. Throws on duplicate (book,name). */
    async create(bookId: string, input: CharacterInput): Promise<Character> {
        const { data, error } = await supabase
            .from('characters')
            .insert({ book_id: bookId, ...input })
            .select('*')
            .single();
        if (error) throw error;
        return data as Character;
    },

    /** Update a character. Teacher edits win over generation defaults. */
    async update(id: string, patch: Partial<CharacterInput>): Promise<Character> {
        const { data, error } = await supabase
            .from('characters')
            .update(patch)
            .eq('id', id)
            .select('*')
            .single();
        if (error) throw error;
        return data as Character;
    },

    /** Delete a character from the library (cascades unit_characters joins). */
    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('characters').delete().eq('id', id);
        if (error) throw error;
    },

    /** Link a character to a unit ("this character appears in this unit"). */
    async linkUnit(unitId: string, characterId: string): Promise<void> {
        const { error } = await supabase
            .from('unit_characters')
            .upsert({ unit_id: unitId, character_id: characterId }, { onConflict: 'unit_id,character_id' });
        if (error) throw error;
    },

    /** Unlink a character from a unit (removes from that unit only). */
    async unlinkUnit(unitId: string, characterId: string): Promise<void> {
        const { error } = await supabase
            .from('unit_characters')
            .delete()
            .eq('unit_id', unitId)
            .eq('character_id', characterId);
        if (error) throw error;
    },

    /** List the characters linked to a unit (the cast appearing in it). */
    async listForUnit(unitId: string): Promise<Character[]> {
        const { data, error } = await supabase
            .from('unit_characters')
            .select('character:characters(*)')
            .eq('unit_id', unitId);
        if (error) throw error;
        return ((data || []).map((r: any) => r.character).filter(Boolean) as Character[]);
    },
};

/**
 * Resolve the book_id for a unit (the picker scopes the cast to the unit's book).
 * Returns null if the unit has no book (legacy) — callers fall back gracefully.
 */
export async function getUnitBookId(unitId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('units')
        .select('book_id')
        .eq('id', unitId)
        .maybeSingle();
    if (error) return null;
    return (data?.book_id as string) || null;
}
