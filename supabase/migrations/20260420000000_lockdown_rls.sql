-- ============================================
-- Phase 0.2: Harden RLS Policies
-- Replaces overly permissive policies from 20260321000001_fix_rls_recursion.sql
-- and 20260402000000_fix_srs_items_rls.sql
-- ============================================

-- Helper: role check without recursion (uses JWT claim directly)
CREATE OR REPLACE FUNCTION public.is_role(required_role user_role)
RETURNS BOOLEAN AS $$
    SELECT COALESCE(
        (auth.jwt() -> 'app_metadata' ->> 'role')::user_role,
        (SELECT role FROM public.profiles WHERE id = auth.uid())
    ) = required_role
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_teacher_or_admin()
RETURNS BOOLEAN AS $$
    SELECT public.is_role('teacher') OR public.is_role('admin')
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================
-- UNITS: SELECT authenticated, write teacher/admin only
-- ============================================

DROP POLICY IF EXISTS "units_select_policy" ON public.units;
DROP POLICY IF EXISTS "units_all_policy" ON public.units;

CREATE POLICY "units_select_policy"
    ON public.units FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "units_insert_policy"
    ON public.units FOR INSERT
    WITH CHECK (public.is_teacher_or_admin());

CREATE POLICY "units_update_policy"
    ON public.units FOR UPDATE
    USING (public.is_teacher_or_admin())
    WITH CHECK (public.is_teacher_or_admin());

CREATE POLICY "units_delete_policy"
    ON public.units FOR DELETE
    USING (public.is_teacher_or_admin());

-- ============================================
-- STUDENTS TABLE: SELECT authenticated, write teacher/admin only
-- ============================================

DROP POLICY IF EXISTS "students_select_policy" ON public.students;
DROP POLICY IF EXISTS "students_all_policy" ON public.students;

CREATE POLICY "students_select_policy"
    ON public.students FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "students_insert_policy"
    ON public.students FOR INSERT
    WITH CHECK (public.is_teacher_or_admin());

CREATE POLICY "students_update_policy"
    ON public.students FOR UPDATE
    USING (public.is_teacher_or_admin())
    WITH CHECK (public.is_teacher_or_admin());

CREATE POLICY "students_delete_policy"
    ON public.students FOR DELETE
    USING (public.is_teacher_or_admin());

-- ============================================
-- STUDENT_PROGRESS: SELECT by owner + teachers, INSERT by teacher/admin,
-- UPDATE by owner + teacher/admin
-- ============================================

DROP POLICY IF EXISTS "student_progress_select_policy" ON public.student_progress;
DROP POLICY IF EXISTS "student_progress_update_policy" ON public.student_progress;
DROP POLICY IF EXISTS "student_progress_insert_policy" ON public.student_progress;

CREATE POLICY "student_progress_select_policy"
    ON public.student_progress FOR SELECT
    USING (
        student_id = auth.uid()::text
        OR public.is_teacher_or_admin()
    );

CREATE POLICY "student_progress_insert_policy"
    ON public.student_progress FOR INSERT
    WITH CHECK (
        student_id = auth.uid()::text
        OR public.is_teacher_or_admin()
    );

CREATE POLICY "student_progress_update_policy"
    ON public.student_progress FOR UPDATE
    USING (
        student_id = auth.uid()::text
        OR public.is_teacher_or_admin()
    )
    WITH CHECK (
        student_id = auth.uid()::text
        OR public.is_teacher_or_admin()
    );

CREATE POLICY "student_progress_delete_policy"
    ON public.student_progress FOR DELETE
    USING (public.is_teacher_or_admin());

-- ============================================
-- SRS_ITEMS: Keep permissive SELECT/INSERT/UPDATE (students create their own),
-- but restrict DELETE to owner + teacher/admin
-- ============================================

DROP POLICY IF EXISTS "srs_items_select_policy" ON public.srs_items;
DROP POLICY IF EXISTS "srs_items_insert_policy" ON public.srs_items;
DROP POLICY IF EXISTS "srs_items_update_policy" ON public.srs_items;
DROP POLICY IF EXISTS "srs_items_delete_policy" ON public.srs_items;

CREATE POLICY "srs_items_select_policy"
    ON public.srs_items FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "srs_items_insert_policy"
    ON public.srs_items FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "srs_items_update_policy"
    ON public.srs_items FOR UPDATE
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "srs_items_delete_policy"
    ON public.srs_items FOR DELETE
    USING (
        student_id = auth.uid()::text
        OR public.is_teacher_or_admin()
    );

-- ============================================
-- CLASSES: Revoke anon access
-- ============================================

DROP POLICY IF EXISTS "classes_select_policy" ON public.classes;

CREATE POLICY "classes_select_policy"
    ON public.classes FOR SELECT
    USING (
        teacher_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.class_enrollments
            WHERE class_enrollments.class_id = classes.id
            AND class_enrollments.student_id = auth.uid()
        )
        OR public.is_role('admin')
    );

-- ============================================
-- REVOKE anon GRANT ALL on all tables
-- ============================================

REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.student_progress FROM anon;
REVOKE ALL ON public.students FROM anon;
REVOKE ALL ON public.srs_items FROM anon;
REVOKE ALL ON public.units FROM anon;
REVOKE ALL ON public.classes FROM anon;
REVOKE ALL ON public.class_enrollments FROM anon;
REVOKE ALL ON public.parent_student_links FROM anon;
REVOKE ALL ON public.assignments FROM anon;
REVOKE ALL ON public.student_assignments FROM anon;
REVOKE ALL ON public.messages FROM anon;
REVOKE ALL ON public.assets FROM anon;

-- Grant read-only to anon where needed (public units browsing, assets)
GRANT SELECT ON public.units TO anon;
GRANT SELECT ON public.assets TO anon;
