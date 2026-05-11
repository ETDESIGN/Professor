
-- ============================================
-- Audit Remediation: RLS Hardening (v2)
-- Addresses audit findings from 2026-05-06
-- ============================================

-- 1. Idempotent preamble: ensure is_teacher_or_admin() exists
CREATE OR REPLACE FUNCTION public.is_teacher_or_admin()
RETURNS BOOLEAN AS $$
    SELECT public.is_role('teacher') OR public.is_role('admin')
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Enable RLS + policies for parent_student_links
ALTER TABLE public.parent_student_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent_links_select_policy" ON public.parent_student_links;
DROP POLICY IF EXISTS "parent_links_insert_policy" ON public.parent_student_links;
DROP POLICY IF EXISTS "parent_links_delete_policy" ON public.parent_student_links;

CREATE POLICY "parent_links_select_policy"
    ON public.parent_student_links FOR SELECT
    TO authenticated
    USING (
        parent_id = auth.uid()
        OR (SELECT public.is_teacher_or_admin())
    );

CREATE POLICY "parent_links_insert_policy"
    ON public.parent_student_links FOR INSERT
    TO authenticated
    WITH CHECK (
        parent_id = auth.uid()
        OR (SELECT public.is_teacher_or_admin())
    );

CREATE POLICY "parent_links_delete_policy"
    ON public.parent_student_links FOR DELETE
    TO authenticated
    USING (
        parent_id = auth.uid()
        OR (SELECT public.is_teacher_or_admin())
    );

-- 3. Tighten srs_items RLS: owner + teacher/admin
--    student_id is TEXT; cast auth.uid() to text for comparison
--    Use (SELECT ...) wrapper to prevent PostgreSQL from inlining is_teacher_or_admin()
DROP POLICY IF EXISTS "srs_items_select_policy" ON public.srs_items;
DROP POLICY IF EXISTS "srs_items_insert_policy" ON public.srs_items;
DROP POLICY IF EXISTS "srs_items_update_policy" ON public.srs_items;
DROP POLICY IF EXISTS "srs_items_delete_policy" ON public.srs_items;

CREATE POLICY "srs_items_select_policy"
    ON public.srs_items FOR SELECT
    TO authenticated
    USING (
        student_id::uuid = auth.uid()
        OR (SELECT public.is_teacher_or_admin())
    );

CREATE POLICY "srs_items_insert_policy"
    ON public.srs_items FOR INSERT
    TO authenticated
    WITH CHECK (
        student_id::uuid = auth.uid()
        OR (SELECT public.is_teacher_or_admin())
    );

CREATE POLICY "srs_items_update_policy"
    ON public.srs_items FOR UPDATE
    TO authenticated
    USING (
        student_id::uuid = auth.uid()
        OR (SELECT public.is_teacher_or_admin())
    )
    WITH CHECK (
        student_id::uuid = auth.uid()
        OR (SELECT public.is_teacher_or_admin())
    );

CREATE POLICY "srs_items_delete_policy"
    ON public.srs_items FOR DELETE
    TO authenticated
    USING (
        student_id::uuid = auth.uid()
        OR (SELECT public.is_teacher_or_admin())
    );

-- 4. Revert units INSERT to teacher/admin only
DROP POLICY IF EXISTS "units_insert_policy" ON public.units;

CREATE POLICY "units_insert_policy"
    ON public.units FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT public.is_teacher_or_admin()));
