-- =====================================================================
-- C.1 — Durable review/approval status (advisor Q5, prerequisite for A)
-- ---------------------------------------------------------------------
-- AssetWorkshop's approve/reject (_approved) is TRANSIENT component state —
-- re-entering the Review pass shows a blank slate every time. This table makes
-- review status DURABLE and queryable so:
--   - the persistent Review entry point (Phase 2.3/G2) shows real state, and
--   - the future unified review mode (A) has a data model to land on.
--
-- content_id is the item's natural key per category (vocab: word; grammar: rule;
-- story: page index as text; dialogue: line index; characters: character.id).
-- This is intentionally generic across categories. RLS mirrors the established
-- unit-scoped pattern.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.content_review_status (
    unit_id       UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    content_type  TEXT NOT NULL,   -- 'vocabulary'|'grammar'|'story'|'dialogues'|'characters'|'songs'|'videos'
    content_id    TEXT NOT NULL,   -- natural key within the category (see header)
    status        TEXT NOT NULL DEFAULT 'approved',  -- 'approved'|'rejected'|'pending'
    reviewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (unit_id, content_type, content_id)
);

CREATE INDEX IF NOT EXISTS idx_content_review_unit ON public.content_review_status(unit_id);

ALTER TABLE public.content_review_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_review_select_policy" ON public.content_review_status;
CREATE POLICY "content_review_select_policy"
    ON public.content_review_status FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = content_review_status.unit_id AND u.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = content_review_status.unit_id AND u.teacher_id IS NULL)
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "content_review_insert_policy" ON public.content_review_status;
CREATE POLICY "content_review_insert_policy"
    ON public.content_review_status FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = content_review_status.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "content_review_update_policy" ON public.content_review_status;
CREATE POLICY "content_review_update_policy"
    ON public.content_review_status FOR UPDATE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = content_review_status.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "content_review_delete_policy" ON public.content_review_status;
CREATE POLICY "content_review_delete_policy"
    ON public.content_review_status FOR DELETE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = content_review_status.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
GRANT ALL ON public.content_review_status TO authenticated, anon, service_role;
