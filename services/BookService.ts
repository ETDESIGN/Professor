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
    cover_asset_id?: string | null;
    target_age_range?: string | null;
    cefr_level?: string | null;
    created_at?: string;
    /** Present on rows returned by the trash-listing RPC. */
    deleted_at?: string | null;
}

/** Pipeline-aware unit meta (library status badges). */
export interface UnitPipelineMeta {
    poolCount: number;
    /** 'pending' | 'running' | 'succeeded' | 'failed' | null */
    jobStatus: string | null;
    /** FIXPLAN_G: extraction confirmed but not yet enriched (decision #7 —
     *  enrichment runs only when the teacher opens the unit). */
    readyToEnrich?: boolean;
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

// ─────────────────────────────────────────────────────────────────────
// Unit & Book Manager (2026-08-07 — see docs/brainstorming/
// UNIT_BOOK_MANAGER_BRAINSTORM_AND_DECISIONS.md). Books are folders:
// soft-delete + trash/restore, move/reorder units, permanent delete via
// SECURITY DEFINER RPCs (migration 20260807000001_unit_book_manager).
// ─────────────────────────────────────────────────────────────────────

/** The teacher's own books (RLS scopes to owner; trashed rows are
 *  filtered out by the SELECT policy). */
export async function listBooks(): Promise<Book[]> {
    const { data, error } = await supabase
        .from('books')
        .select('id, owner_id, title, cover_asset_id, target_age_range, cefr_level, created_at')
        .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []) as Book[];
}

/** Create a custom book owned by the current teacher. */
export async function createBook(title: string): Promise<Book> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase
        .from('books')
        .insert({ owner_id: user.id, title: title.trim() || 'Untitled Book' })
        .select('id, owner_id, title')
        .single();
    if (error || !data) throw new Error(error?.message || 'Failed to create book');
    return data as Book;
}

export async function renameBook(bookId: string, title: string): Promise<void> {
    const { error } = await supabase.from('books').update({ title: title.trim() }).eq('id', bookId);
    if (error) throw error;
}

/** Soft-delete (move to trash). RPC because a direct PostgREST UPDATE fails:
 *  the SELECT policy (deleted_at IS NULL) rejects the updated row. */
export async function softDeleteBook(bookId: string): Promise<void> {
    const { error } = await supabase.rpc('trash_book', { p_book_id: bookId });
    if (error) throw new Error(error.message);
}

export async function restoreBook(bookId: string): Promise<void> {
    const { error } = await supabase.rpc('restore_book', { p_book_id: bookId });
    if (error) throw new Error(error.message);
}

/** Permanent delete (RPC refuses while the book still has live units). */
export async function deleteBookFull(bookId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_book_full', { p_book_id: bookId });
    if (error) throw new Error(error.message);
}

/** Trashed books are hidden by the SELECT policy — fetch via RPC-free
 *  workaround is impossible client-side, so the Trash view lists trashed
 *  books through this direct select (RLS still enforces ownership).
 *  NOTE: the SELECT policy filters deleted_at IS NULL, so trashed rows are
 *  NOT visible to the client. The trash therefore operates on units only for
 *  books: trashing a book keeps its row visible-with-flag is impossible.
 *  → Design choice: books are soft-deleted, and the library lists them via
 *  a dedicated RPC that returns the owner's trashed books. */
export async function listTrashedBooks(): Promise<Book[]> {
    const { data, error } = await supabase.rpc('list_trashed_books');
    if (error) {
        // RPC may not exist yet (older deployments) — degrade to empty.
        console.warn('listTrashedBooks unavailable:', error.message);
        return [];
    }
    return (data || []) as Book[];
}

// ── Unit lifecycle within books ────────────────────────────────────────

/** Move a unit into another book (appends at the end). */
export async function moveUnitToBook(unitId: string, bookId: string | null): Promise<void> {
    let orderIndex = 0;
    if (bookId) {
        const { count } = await supabase
            .from('units')
            .select('id', { count: 'exact', head: true })
            .eq('book_id', bookId);
        orderIndex = count ?? 0;
    }
    const { error } = await supabase
        .from('units')
        .update({ book_id: bookId, order_index: orderIndex })
        .eq('id', unitId);
    if (error) throw error;
}

/** Reorder a unit within its book to newIndex (shifts siblings). */
export async function reorderUnit(unitId: string, newIndex: number): Promise<void> {
    const { data: unit, error: fetchErr } = await supabase
        .from('units')
        .select('book_id, order_index')
        .eq('id', unitId)
        .single();
    if (fetchErr || !unit) throw new Error(fetchErr?.message || 'Unit not found');

    const siblings = await supabase
        .from('units')
        .select('id, order_index')
        .eq('book_id', unit.book_id)
        .neq('id', unitId)
        .order('order_index', { ascending: true });
    if (siblings.error) throw siblings.error;

    const ordered = (siblings.data || []) as { id: string; order_index: number }[];
    const clamped = Math.max(0, Math.min(newIndex, ordered.length));
    ordered.splice(clamped, 0, { id: unitId, order_index: 0 });

    // Write back contiguous indices (only rows whose index actually changed).
    for (let i = 0; i < ordered.length; i++) {
        if (ordered[i].order_index !== i) {
            const { error } = await supabase
                .from('units')
                .update({ order_index: i })
                .eq('id', ordered[i].id);
            if (error) throw error;
        }
    }
}

/** Soft-delete a unit (Engine.deleteUnit now routes here). RPC — see trash_book. */
export async function softDeleteUnit(unitId: string): Promise<void> {
    const { error } = await supabase.rpc('trash_unit', { p_unit_id: unitId });
    if (error) throw new Error(error.message);
}

/**
 * Bulk soft-delete for the library multi-select. Atomic: the RPC verifies
 * ownership of every id up front, so all units trash or none. Returns the
 * number actually trashed (already-trashed ids are skipped, not failed).
 */
export async function trashUnits(unitIds: string[]): Promise<number> {
    const { data, error } = await supabase.rpc('trash_units', { p_unit_ids: unitIds });
    if (error) throw new Error(error.message);
    return typeof data === 'number' ? data : unitIds.length;
}

export async function restoreUnit(unitId: string): Promise<void> {
    const { error } = await supabase.rpc('restore_unit', { p_unit_id: unitId });
    if (error) throw new Error(error.message);
}

/** Permanent delete with content cascade (SECURITY DEFINER RPC). */
export async function deleteUnitFull(unitId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_unit_full', { p_unit_id: unitId });
    if (error) throw new Error(error.message);
}

/** Trashed units (RLS hides them from normal SELECTs — RPC). */
export async function listTrashedUnits(): Promise<any[]> {
    const { data, error } = await supabase.rpc('list_trashed_units');
    if (error) {
        console.warn('listTrashedUnits unavailable:', error.message);
        return [];
    }
    return (data || []) as any[];
}

/** Pipeline meta for library badges: pool counts + generation job status. */
export async function getUnitPipelineMeta(unitIds: string[]): Promise<Record<string, UnitPipelineMeta>> {
    const out: Record<string, UnitPipelineMeta> = {};
    if (unitIds.length === 0) return out;
    for (const id of unitIds) out[id] = { poolCount: 0, jobStatus: null };

    const [poolRes, jobsRes, unitsRes, vocabRes] = await Promise.all([
        supabase.from('pool_items').select('unit_id').in('unit_id', unitIds),
        supabase.from('generation_jobs').select('unit_id, status').in('unit_id', unitIds).eq('stage', 'generate-exercises'),
        supabase.from('units').select('id, baskets_confirmed_at').in('id', unitIds),
        supabase.from('vocabulary_items').select('unit_id').in('unit_id', unitIds),
    ]);
    const enrichedUnits = new Set<string>();
    if (!vocabRes.error && vocabRes.data) {
        for (const row of vocabRes.data as { unit_id: string }[]) enrichedUnits.add(row.unit_id);
    }
    const confirmedUnits = new Set<string>();
    if (!unitsRes.error && unitsRes.data) {
        for (const row of unitsRes.data as { id: string; baskets_confirmed_at: string | null }[]) {
            if (row.baskets_confirmed_at) confirmedUnits.add(row.id);
        }
    }

    if (!poolRes.error && poolRes.data) {
        for (const row of poolRes.data as { unit_id: string }[]) {
            if (out[row.unit_id]) out[row.unit_id].poolCount += 1;
        }
    }
    if (!jobsRes.error && jobsRes.data) {
        for (const row of jobsRes.data as { unit_id: string; status: string }[]) {
            if (out[row.unit_id]) out[row.unit_id].jobStatus = row.status;
        }
    }
    for (const id of unitIds) {
        out[id].readyToEnrich = confirmedUnits.has(id) && !enrichedUnits.has(id) && out[id].poolCount === 0;
    }
    return out;
}
