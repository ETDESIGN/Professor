-- =====================================================================
-- Vocabulary canonical content row (advisor §2.3 correction + C.3 vocab)
-- ---------------------------------------------------------------------
-- The original §2.3 verdict ("Vocabulary: already correct") was wrong on one
-- point: objectives/pool_items existed, but there was NO canonical Learning
-- Object content row underneath them. grammar_rules and story_pages are
-- canonical content rows (separate from the derived Activities in
-- objectives/pool_items, per §0.0). Vocab skipped straight from raw AI JSONB
-- (manifest.enriched_content.vocabulary) to N activity-shaped pool_items with
-- nothing canonical in between — so every component needing raw vocab content
-- (definition/image/example) fell back to the manifest (e.g. PlanComposer).
--
-- vocabulary_items is that missing canonical row: one row per word per unit,
-- holding the content fields. pool_items stay derived (regenerated from this
-- table on edit via the Phase 1.7 reconciliation trigger — same pattern C.3
-- used for grammar, so edits reach already-existing exercises).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.vocabulary_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id             UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    order_index         INTEGER NOT NULL DEFAULT 0,
    word                TEXT NOT NULL,
    definition          TEXT,
    example_sentence    TEXT,
    l1_translation      TEXT,                       -- Simplified Chinese meaning
    phonetic            TEXT,                       -- IPA
    part_of_speech      TEXT,
    image_prompt        TEXT,
    image_url           TEXT,                       -- generated image (preserved on edit)
    audio_url           TEXT,                       -- TTS of the word (preserved on edit)
    example_audio_url   TEXT,                       -- TTS of the example sentence (preserved)
    distractors         JSONB NOT NULL DEFAULT '[]'::jsonb,
    confusables         JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (unit_id, word)
);

CREATE INDEX IF NOT EXISTS idx_vocabulary_items_unit ON public.vocabulary_items(unit_id);

ALTER TABLE public.vocabulary_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vocabulary_items_select_policy" ON public.vocabulary_items;
CREATE POLICY "vocabulary_items_select_policy"
    ON public.vocabulary_items FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = vocabulary_items.unit_id AND u.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = vocabulary_items.unit_id AND u.teacher_id IS NULL)
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "vocabulary_items_insert_policy" ON public.vocabulary_items;
CREATE POLICY "vocabulary_items_insert_policy"
    ON public.vocabulary_items FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = vocabulary_items.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "vocabulary_items_update_policy" ON public.vocabulary_items;
CREATE POLICY "vocabulary_items_update_policy"
    ON public.vocabulary_items FOR UPDATE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = vocabulary_items.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "vocabulary_items_delete_policy" ON public.vocabulary_items;
CREATE POLICY "vocabulary_items_delete_policy"
    ON public.vocabulary_items FOR DELETE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = vocabulary_items.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
GRANT ALL ON public.vocabulary_items TO authenticated, anon, service_role;
