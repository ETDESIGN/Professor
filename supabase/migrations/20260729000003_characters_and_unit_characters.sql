-- =====================================================================
-- Phase 1.1 — Characters: book-level library + unit_characters join
-- ---------------------------------------------------------------------
-- WHY THIS EXISTS (locked decision L1):
-- English course books for young learners feature RECURRING characters
-- across an entire book. A per-unit JSONB field (today's reality, in
-- manifest.enriched_content.characters) cannot model "the same robot in
-- unit 1 and unit 5" — each unit gets a disconnected copy, so the cast
-- never has continuity. Characters must be a BOOK-LEVEL entity that units
-- REFERENCE, not own.
--
-- This migration introduces:
--   1. `characters` — a book-scoped library (one row per recurring
--      character). Carries the fields needed for cross-unit consistency:
--      look_prompt (reusable visual description prepended to every image
--      generation involving the character — provider-agnostic, works with
--      Pollinations/flux today; a `seed` column can be added later if the
--      provider confirms seed-locking) and voice_id (ElevenLabs voice, so
--      the same character sounds the same across units).
--   2. `unit_characters` — many-to-many join (a character appears in many
--      units; a unit features many characters). This is what makes a
--      character "appear in this unit" without copying its data.
--
-- NOT repurposing `character_ledger` (advisor §7.1): that table is
-- semantically different (student avatar cosmetics via GamificationService,
-- unit-scoped). Building a fresh `characters` table is cleaner than
-- overloading an existing one with two unrelated meanings.
-- character_ledger stays as-is for cosmetics.
-- =====================================================================

-- ── 1. characters table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.characters (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id       UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    role          TEXT,             -- protagonist / sidekick / mascot / adult
    description   TEXT,
    personality   TEXT,
    -- Reusable visual description prepended to every image generation
    -- involving this character, so the same character looks consistent
    -- across units (advisor §7.3). Provider-agnostic baseline.
    look_prompt   TEXT,
    -- The character's reference portrait (Phase 3 vault FK; nullable until
    -- the vault work lands — for now the manifest image_url is the source).
    reference_image_asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
    -- ElevenLabs voice id so the character sounds consistent across units
    -- (advisor §7.4). Nullable: set at creation or later; TTS falls back to
    -- the default voice when null.
    voice_id      TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- One character per (book, name) — re-enriching a book never duplicates
    -- a character. Expression uniqueness must be a UNIQUE INDEX in Postgres.
    UNIQUE (book_id, name)
);

CREATE INDEX IF NOT EXISTS idx_characters_book ON public.characters(book_id);
CREATE INDEX IF NOT EXISTS idx_characters_book_name ON public.characters(book_id, lower(name));

ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

-- A teacher can see/manage characters only for books they own (mirrors the
-- objectives/pool_items/generation_jobs RLS pattern). NULL-owner (legacy)
-- books: readable by any teacher, managed by admins. service_role bypasses
-- RLS (used by edge functions).
DROP POLICY IF EXISTS "characters_select_policy" ON public.characters;
CREATE POLICY "characters_select_policy"
    ON public.characters FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.books b WHERE b.id = characters.book_id AND b.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.books b WHERE b.id = characters.book_id AND b.owner_id IS NULL)
        OR (SELECT public.is_teacher_or_admin())
    );

DROP POLICY IF EXISTS "characters_insert_policy" ON public.characters;
CREATE POLICY "characters_insert_policy"
    ON public.characters FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.books b WHERE b.id = characters.book_id AND b.owner_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );

DROP POLICY IF EXISTS "characters_update_policy" ON public.characters;
CREATE POLICY "characters_update_policy"
    ON public.characters FOR UPDATE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.books b WHERE b.id = characters.book_id AND b.owner_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );

DROP POLICY IF EXISTS "characters_delete_policy" ON public.characters;
CREATE POLICY "characters_delete_policy"
    ON public.characters FOR DELETE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.books b WHERE b.id = characters.book_id AND b.owner_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );

GRANT ALL ON public.characters TO authenticated, anon, service_role;

-- ── 2. unit_characters join ──────────────────────────────────────────
-- A character appears in many units; a unit features many characters.
-- "Adding a character to a unit" = inserting one row here (no character
-- data copied). Deleting the join removes the character from that unit
-- without touching the library entry.
CREATE TABLE IF NOT EXISTS public.unit_characters (
    unit_id      UUID REFERENCES public.units(id) ON DELETE CASCADE,
    character_id UUID REFERENCES public.characters(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (unit_id, character_id)
);

CREATE INDEX IF NOT EXISTS idx_unit_characters_unit ON public.unit_characters(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_characters_character ON public.unit_characters(character_id);

ALTER TABLE public.unit_characters ENABLE ROW LEVEL SECURITY;

-- A teacher can manage the join for units they own. (Units carry teacher_id;
-- characters carry book_id. We gate on the unit's owner for simplicity,
-- since adding/removing a character from a unit is a unit-level action.)
DROP POLICY IF EXISTS "unit_characters_select_policy" ON public.unit_characters;
CREATE POLICY "unit_characters_select_policy"
    ON public.unit_characters FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_characters.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );

DROP POLICY IF EXISTS "unit_characters_insert_policy" ON public.unit_characters;
CREATE POLICY "unit_characters_insert_policy"
    ON public.unit_characters FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_characters.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );

DROP POLICY IF EXISTS "unit_characters_delete_policy" ON public.unit_characters;
CREATE POLICY "unit_characters_delete_policy"
    ON public.unit_characters FOR DELETE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_characters.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );

GRANT ALL ON public.unit_characters TO authenticated, anon, service_role;
