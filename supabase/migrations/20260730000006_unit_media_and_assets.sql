-- =====================================================================
-- Phase 1.5 — Vault backbone: unit_media + extended assets (advisor §6.1)
-- ---------------------------------------------------------------------
-- WHY THIS EXISTS:
-- Today an asset belongs to exactly ONE unit via assets.unit_id (a single
-- FK), which makes media REUSE impossible (a nice character portrait or
-- background can't be shared across units/books). The vault needs a
-- many-to-many unit<->asset join plus richer asset metadata (who owns it,
-- which book it came from, what kind it is, tags, soft-delete).
--
-- This is the BACKBONE for the Phase 3 vault UI (ResourceLibrary +
-- <MediaPickerModal>) and for song/video becoming media references (not
-- skill nodes — advisor §2.3). It is intentionally schema-only: producers
-- (imageGen/tts/enrich-unit) are rewired to write unit_media in Phase 1.6
-- (emission consolidation). assets.unit_id is KEPT for now (non-breaking);
-- it is deprecated and will be retired once producers move over.
--
-- Songs/videos are currently manifest "suggestions" (title + search_query,
-- no file/URL), so no unit_media rows are populated for them yet — that
-- awaits a real media source (teacher-pasted URL / upload, Phase 3).
-- =====================================================================

-- ── 1. unit_media (many-to-many unit <-> asset) ──────────────────────
-- role: 'song' | 'video' | 'cover' | 'story_page_image' | 'vocab_image' |
--       'character_portrait' | 'dialogue_audio' | ... (open vocabulary)
-- PK (unit_id, asset_id, role): the same asset may serve multiple roles in
-- a unit, but a given (unit, asset, role) link is unique.
CREATE TABLE IF NOT EXISTS public.unit_media (
    unit_id      UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    asset_id     UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    role         TEXT NOT NULL,
    order_index  INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (unit_id, asset_id, role)
);

CREATE INDEX IF NOT EXISTS idx_unit_media_unit ON public.unit_media(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_media_asset ON public.unit_media(asset_id);

ALTER TABLE public.unit_media ENABLE ROW LEVEL SECURITY;

-- Mirrors the story_pages/dialogue_lines/grammar_rules RLS pattern.
DROP POLICY IF EXISTS "unit_media_select_policy" ON public.unit_media;
CREATE POLICY "unit_media_select_policy"
    ON public.unit_media FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_media.unit_id AND u.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_media.unit_id AND u.teacher_id IS NULL)
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "unit_media_insert_policy" ON public.unit_media;
CREATE POLICY "unit_media_insert_policy"
    ON public.unit_media FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_media.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "unit_media_update_policy" ON public.unit_media;
CREATE POLICY "unit_media_update_policy"
    ON public.unit_media FOR UPDATE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_media.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "unit_media_delete_policy" ON public.unit_media;
CREATE POLICY "unit_media_delete_policy"
    ON public.unit_media FOR DELETE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_media.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
GRANT ALL ON public.unit_media TO authenticated, anon, service_role;

-- ── 2. Extend assets (advisor §6.1) ──────────────────────────────────
-- owner_id: the teacher who created/owns the asset (vault per-teacher scope).
-- book_id:  the book the asset was created in (nullable = cross-book generic).
-- kind:     'generated' | 'uploaded' | 'external_url'.
-- source_url: pasted URL / YouTube link (for external_url kind).
-- tags:     free-text + derived keywords for vault search.
-- is_deleted: soft-delete (never hard-delete; assets can be referenced by
--           multiple unit_media rows — advisor §6.7).
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS owner_id   UUID REFERENCES auth.users(id);
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS book_id    UUID REFERENCES public.books(id);
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS kind       TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS tags       TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_assets_owner ON public.assets(owner_id);
CREATE INDEX IF NOT EXISTS idx_assets_book  ON public.assets(book_id);

-- ── 3. Backfill: assets.unit_id -> unit_media ────────────────────────
-- Migrate existing single-FK relationships into the join table. Idempotent
-- (ON CONFLICT DO NOTHING). Currently a no-op (assets is empty) but correct
-- for any assets that exist. role falls back to the asset's type.
INSERT INTO public.unit_media (unit_id, asset_id, role, order_index)
SELECT a.unit_id, a.id, COALESCE(a.type, 'media'), 0
FROM public.assets a
WHERE a.unit_id IS NOT NULL
ON CONFLICT (unit_id, asset_id, role) DO NOTHING;
