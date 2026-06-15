-- ============================================
-- Fix: Allow reading SRS templates (student_id IS NULL)
-- Addresses a bug where students couldn't clone templates
-- ============================================

DROP POLICY IF EXISTS "srs_items_select_policy" ON public.srs_items;

CREATE POLICY "srs_items_select_policy"
    ON public.srs_items FOR SELECT
    TO authenticated
    USING (
        student_id = auth.uid()
        OR student_id IS NULL
        OR (SELECT public.is_teacher_or_admin())
    );
