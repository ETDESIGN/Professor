import { supabase } from './supabaseClient';

/**
 * BookService — Phase 0B.
 *
 * `books` is the entity above `units` introduced so characters can be
 * cross-unit/book-level (locked L1) and the media vault can scope per-book.
 * Every unit must belong to a book; this helper makes that invariant easy to
 * honor at every unit-creation site without duplicating the get-or-create
 * logic (which is how `teacher_id` ended up inconsistent across sites — Bug B1).
 *
 * Policy: a teacher's first unit auto-creates a default book named "My Units";
 * subsequent units reuse it. The teacher can later rename it / split units
 * into other books via the UI (not yet built — Phase 2).
 */

export interface Book {
    id: string;
    owner_id: string | null;
    title: string;
}

/**
 * Return the caller's default book, creating "My Units" if they don't have
 * any book yet. Returns null if there is no authenticated user.
 *
 * Used at unit-creation sites so new units are never orphaned (book_id null).
 */
export async function getOrCreateDefaultBookForCurrentUser(): Promise<Book | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Reuse an existing book for this teacher if one exists.
    const { data: existing } = await supabase
        .from('books')
        .select('id, owner_id, title')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (existing) return existing as Book;

    // None yet — create the default book.
    const { data: created, error } = await supabase
        .from('books')
        .insert({ owner_id: user.id, title: 'My Units' })
        .select('id, owner_id, title')
        .single();

    if (error || !created) {
        // RLS/policy failure or other error — surface it so the caller can
        // decide whether to proceed without a book_id (unit creation shouldn't
        // hard-fail just because book scoping failed).
        console.error('getOrCreateDefaultBookForCurrentUser: failed to create default book:', error?.message);
        return null;
    }
    return created as Book;
}
