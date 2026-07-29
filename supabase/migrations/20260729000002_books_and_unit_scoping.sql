-- =====================================================================
-- Phase 0B — Books entity + unit scoping (F1 foundation)
-- ---------------------------------------------------------------------
-- WHY THIS EXISTS:
-- Characters are a cross-unit, book-level entity (locked product decision
-- L1 — English course books have recurring characters across the whole book),
-- and the media vault's natural scope is per-book (advisor §6.1). Both anchor
-- on a `books` entity that sits ABOVE units. Introducing `books` now (in
-- Phase 0, not deferred) avoids re-touching every Phase-1 table's FKs twice.
--
-- This migration:
--   1. Creates `books` (owner = teacher; nullable owner_id so legacy NULL-
--      owner units can be grouped under a shared legacy book without forcing
--      a fake owner — advisor §2.2 warns against guessing ownership).
--   2. Adds `units.book_id` (nullable FK) — every unit eventually belongs to
--      a book; nullable during migration so we don't break existing inserts.
--   3. Adds `units.migrated_categories text[]` — the per-category feature
--      flag from advisor §2.6 step 4. Gates the read switchover from
--      units.manifest → the new relational tables (added in Phase 1) so a
--      teacher editing mid-migration always edits the currently-canonical
--      copy for that category. No teacher edits are lost during migration.
--   4. Backfills: one default book per teacher ("My Units"), plus one shared
--      legacy book for NULL-owner units. Does NOT auto-detect book boundaries
--      from content similarity (advisor §2.2) — guessing risks wrongly merging
--      two unrelated units' casts. The teacher splits later via a "move to
--      book" action once the UI exists.
-- =====================================================================

-- ── 1. books table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.books (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- owner_id is the teacher who owns this book. Nullable so legacy NULL-
    -- owner units can be grouped without inventing an owner.
    owner_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title          TEXT NOT NULL,
    cover_asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
    -- Forward-looking hook for deferred L2 (level/target-age). Per advisor §8,
    -- a book targets one age band consistently; anchoring level on the book
    -- (not the unit) is the clean future hook. Unused until L2 starts.
    target_age_range TEXT,
    cefr_level       TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_books_owner ON public.books(owner_id);

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

-- A teacher sees/manages their own books; admins manage all. NULL-owner
-- (legacy) books are readable by any teacher (they contain shared legacy
-- units). service_role bypasses RLS (used by edge functions).
DROP POLICY IF EXISTS "books_select_policy" ON public.books;
CREATE POLICY "books_select_policy"
    ON public.books FOR SELECT
    TO authenticated
    USING (
        owner_id = auth.uid()
        OR owner_id IS NULL
        OR (SELECT public.is_teacher_or_admin())
    );

DROP POLICY IF EXISTS "books_insert_policy" ON public.books;
CREATE POLICY "books_insert_policy"
    ON public.books FOR INSERT
    TO authenticated
    WITH CHECK (
        owner_id = auth.uid()
        OR (SELECT public.is_teacher_or_admin())
    );

DROP POLICY IF EXISTS "books_update_policy" ON public.books;
CREATE POLICY "books_update_policy"
    ON public.books FOR UPDATE
    TO authenticated
    USING (
        owner_id = auth.uid()
        OR (SELECT public.is_teacher_or_admin())
    );

DROP POLICY IF EXISTS "books_delete_policy" ON public.books;
CREATE POLICY "books_delete_policy"
    ON public.books FOR DELETE
    TO authenticated
    USING (
        owner_id = auth.uid()
        OR (SELECT public.is_teacher_or_admin())
    );

GRANT ALL ON public.books TO authenticated, anon, service_role;

-- ── 2. units.book_id + migrated_categories ───────────────────────────
-- Both nullable: book_id is filled by the backfill below + new inserts;
-- migrated_categories stays NULL/empty until Phase 1 flips a category on.
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS book_id UUID REFERENCES public.books(id) ON DELETE SET NULL;
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS migrated_categories TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_units_book ON public.units(book_id);

-- ── 3. Backfill: one default book per teacher ────────────────────────
-- Idempotent: uses NOT EXISTS guards so re-running is safe. Each teacher who
-- owns units gets a "My Units" book; all their book-less units attach to it.
DO $$
DECLARE
    t_id UUID;
    new_book_id UUID;
BEGIN
    FOR t_id IN SELECT DISTINCT teacher_id FROM public.units WHERE teacher_id IS NOT NULL
    LOOP
        -- Create a default book for this teacher only if they don't have one yet.
        IF NOT EXISTS (SELECT 1 FROM public.books WHERE owner_id = t_id) THEN
            INSERT INTO public.books (owner_id, title)
            VALUES (t_id, 'My Units')
            RETURNING id INTO new_book_id;
        ELSE
            SELECT id INTO new_book_id FROM public.books WHERE owner_id = t_id LIMIT 1;
        END IF;
        -- Attach this teacher's book-less units to their default book.
        UPDATE public.units SET book_id = new_book_id
        WHERE teacher_id = t_id AND book_id IS NULL;
    END LOOP;
END $$;

-- ── 4. Legacy NULL-owner units → one shared legacy book ──────────────
-- NULL-owner units can't be assigned to a teacher-owned book (we don't know
-- who owns them). Group them under a single shared, NULL-owner "Legacy Units"
-- book so they're not orphaned. The owner can later delete these via the G9
-- delete-UI or reassign them once ownership is resolved.
DO $$
DECLARE
    legacy_book_id UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM public.units WHERE teacher_id IS NULL AND book_id IS NULL) THEN
        SELECT id INTO legacy_book_id FROM public.books WHERE title = 'Legacy Units' AND owner_id IS NULL LIMIT 1;
        IF legacy_book_id IS NULL THEN
            INSERT INTO public.books (owner_id, title) VALUES (NULL, 'Legacy Units') RETURNING id INTO legacy_book_id;
        END IF;
        UPDATE public.units SET book_id = legacy_book_id
        WHERE teacher_id IS NULL AND book_id IS NULL;
    END IF;
END $$;
