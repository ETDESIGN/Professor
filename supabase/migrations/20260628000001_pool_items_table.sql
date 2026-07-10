-- =====================================================================
-- Phase 0.2 — Item Pool: `pool_items` table
-- ---------------------------------------------------------------------
-- Generated at publish time by `generate-exercises`. Each item is a single,
-- typed exercise payload: { prompt, response, distractors, audio, image, ... }
-- keyed to one objective + exercise_type. The lesson/quiz runtimes pull from
-- this pool (ordered by LearnerState mastery/SRS) instead of the frozen
-- units.flow. This is what turns "1 prompt per activity" into a full
-- receptive->productive battery per word.
--
-- exercise_type is TEXT (not enum) so the registry can grow to the ~22-type
-- v2 set without migrations. difficulty 1-3 drives adaptive escalation.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.pool_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
    exercise_type TEXT NOT NULL,
    difficulty SMALLINT NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 3),
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Primary access paths: "all items for a unit/lesson" and "items for one
-- objective + type" (used by SRS-driven selection and adaptive picks).
CREATE INDEX IF NOT EXISTS idx_pool_items_unit ON public.pool_items(unit_id);
CREATE INDEX IF NOT EXISTS idx_pool_items_objective_type ON public.pool_items(objective_id, exercise_type);
CREATE INDEX IF NOT EXISTS idx_pool_items_type ON public.pool_items(exercise_type);

ALTER TABLE public.pool_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pool_items_select_policy" ON public.pool_items;
CREATE POLICY "pool_items_select_policy"
    ON public.pool_items FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = pool_items.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
        OR auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "pool_items_insert_policy" ON public.pool_items;
CREATE POLICY "pool_items_insert_policy"
    ON public.pool_items FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = pool_items.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );

DROP POLICY IF EXISTS "pool_items_update_policy" ON public.pool_items;
CREATE POLICY "pool_items_update_policy"
    ON public.pool_items FOR UPDATE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = pool_items.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );

DROP POLICY IF EXISTS "pool_items_delete_policy" ON public.pool_items;
CREATE POLICY "pool_items_delete_policy"
    ON public.pool_items FOR DELETE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = pool_items.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );

GRANT ALL ON public.pool_items TO authenticated, anon, service_role;
