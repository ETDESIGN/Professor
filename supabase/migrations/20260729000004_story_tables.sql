-- =====================================================================
-- Phase 1.2 — Story: story_pages + story_comprehension_questions (advisor §2.3)
-- ---------------------------------------------------------------------
-- WHY THIS EXISTS:
-- enrich-unit ALREADY generates a story with comprehension questions for
-- every unit — verified shape: N pages, each with text + speaker +
-- 1-2 comprehension_questions that carry options[] AND the correct answer
-- index. Today this is stored in units.manifest.enriched_content.story and
-- then COMPLETELY DISCARDED: generate-exercises ignores story entirely
-- (objectives.type only allows vocabulary|grammar|phonics), so none of it
-- becomes playable. This is the single highest-value category to
-- relationalize because it converts dead data into a playable objective
-- type with ~zero new generation work (advisor §2.3).
--
-- What this migration enables (wired in Phase 1.2-4):
--   - story_pages → a STORY_SEQUENCING pool item (reorder the pages) —
--     already a Board flow type with NO producer today (03 §4)
--   - story_comprehension_questions → comprehension-MCQ pool items (the
--     options + answer index already generated, just need to be playable)
--
-- Also widens objectives.type CHECK to include 'story' (advisor §4) so
-- generate-exercises can create story objectives without a constraint
-- violation.
-- =====================================================================

-- ── 0. Widen objectives.type to include 'story' (and 'dialogue' for Phase 1.3) ─
-- The existing constraint is `type IN ('vocabulary','grammar','phonics')`.
-- Drop + recreate to add 'story' (and 'dialogue', landing now so Phase 1.3
-- doesn't need a second migration). KEEP existing rows valid.
ALTER TABLE public.objectives DROP CONSTRAINT IF EXISTS objectives_type_check;
ALTER TABLE public.objectives
    ADD CONSTRAINT objectives_type_check
    CHECK (type IN ('vocabulary', 'grammar', 'phonics', 'story', 'dialogue'));

-- ── 1. story_pages ───────────────────────────────────────────────────
-- One row per story page. speaker_character_id→characters gives true
-- continuity (the speaker is a book-level character, advisor §7.2);
-- nullable because legacy/one-off speakers may not have a library entry
-- yet (speaker_override_name covers those).
CREATE TABLE IF NOT EXISTS public.story_pages (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id                 UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    page_number             INTEGER NOT NULL,           -- 0-based narrative order
    text                    TEXT NOT NULL,              -- the page's story text (2-3 sentences)
    speaker                 TEXT,                       -- raw speaker name (as generated)
    speaker_character_id    UUID REFERENCES public.characters(id) ON DELETE SET NULL,  -- resolved book character (continuity)
    speaker_override_name   TEXT,                       -- one-off speaker not in the cast (advisor §7.2)
    image_prompt            TEXT,                       -- scene description for illustration
    image_asset_id          UUID REFERENCES public.assets(id) ON DELETE SET NULL,      -- Phase 3 vault FK
    audio_asset_id          UUID REFERENCES public.assets(id) ON DELETE SET NULL,      -- narrated audio (TTS)
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (unit_id, page_number)                       -- re-enrich never duplicates a page
);

CREATE INDEX IF NOT EXISTS idx_story_pages_unit ON public.story_pages(unit_id);
CREATE INDEX IF NOT EXISTS idx_story_pages_unit_order ON public.story_pages(unit_id, page_number);

ALTER TABLE public.story_pages ENABLE ROW LEVEL SECURITY;

-- Mirrors the objectives/pool_items RLS pattern: a teacher manages rows for
-- units they own. service_role bypasses RLS (edge functions).
DROP POLICY IF EXISTS "story_pages_select_policy" ON public.story_pages;
CREATE POLICY "story_pages_select_policy"
    ON public.story_pages FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = story_pages.unit_id AND u.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = story_pages.unit_id AND u.teacher_id IS NULL)
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "story_pages_insert_policy" ON public.story_pages;
CREATE POLICY "story_pages_insert_policy"
    ON public.story_pages FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = story_pages.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "story_pages_update_policy" ON public.story_pages;
CREATE POLICY "story_pages_update_policy"
    ON public.story_pages FOR UPDATE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = story_pages.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "story_pages_delete_policy" ON public.story_pages;
CREATE POLICY "story_pages_delete_policy"
    ON public.story_pages FOR DELETE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = story_pages.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
GRANT ALL ON public.story_pages TO authenticated, anon, service_role;

-- ── 2. story_comprehension_questions ─────────────────────────────────
-- The MCQs already generated with options + answer index. These become
-- comprehension-MCQ pool items in Phase 1.2-4. Linked to a story_page so a
-- question knows which page it tests.
CREATE TABLE IF NOT EXISTS public.story_comprehension_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id         UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    story_page_id   UUID REFERENCES public.story_pages(id) ON DELETE CASCADE,
    question        TEXT NOT NULL,
    options         JSONB NOT NULL DEFAULT '[]'::jsonb,   -- ["opt a","opt b","opt c"]
    answer_index    INTEGER NOT NULL CHECK (answer_index >= 0),  -- 0-based correct option
    order_index     INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_story_questions_unit ON public.story_comprehension_questions(unit_id);
CREATE INDEX IF NOT EXISTS idx_story_questions_page ON public.story_comprehension_questions(story_page_id);

ALTER TABLE public.story_comprehension_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "story_questions_select_policy" ON public.story_comprehension_questions;
CREATE POLICY "story_questions_select_policy"
    ON public.story_comprehension_questions FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = story_comprehension_questions.unit_id AND u.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = story_comprehension_questions.unit_id AND u.teacher_id IS NULL)
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "story_questions_insert_policy" ON public.story_comprehension_questions;
CREATE POLICY "story_questions_insert_policy"
    ON public.story_comprehension_questions FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = story_comprehension_questions.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "story_questions_update_policy" ON public.story_comprehension_questions;
CREATE POLICY "story_questions_update_policy"
    ON public.story_comprehension_questions FOR UPDATE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = story_comprehension_questions.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "story_questions_delete_policy" ON public.story_comprehension_questions;
CREATE POLICY "story_questions_delete_policy"
    ON public.story_comprehension_questions FOR DELETE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = story_comprehension_questions.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
GRANT ALL ON public.story_comprehension_questions TO authenticated, anon, service_role;
