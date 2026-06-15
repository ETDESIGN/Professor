-- Phase 2 Security Audit Fixes

-- 1. Explicitly ensure we have the helper function
CREATE OR REPLACE FUNCTION public.is_teacher_or_admin()
RETURNS BOOLEAN AS $$
    SELECT COALESCE(
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('teacher', 'admin'),
        (SELECT role IN ('teacher', 'admin') FROM public.profiles WHERE id = auth.uid())
    )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Clean up units policies
DROP POLICY IF EXISTS "units_all_policy" ON public.units;
DROP POLICY IF EXISTS "units_select_policy" ON public.units;
DROP POLICY IF EXISTS "units_insert_policy" ON public.units;
DROP POLICY IF EXISTS "units_update_policy" ON public.units;
DROP POLICY IF EXISTS "units_delete_policy" ON public.units;

CREATE POLICY "units_select_policy"
    ON public.units FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "units_insert_policy"
    ON public.units FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT public.is_teacher_or_admin()));

CREATE POLICY "units_update_policy"
    ON public.units FOR UPDATE
    TO authenticated
    USING ((SELECT public.is_teacher_or_admin()))
    WITH CHECK ((SELECT public.is_teacher_or_admin()));

CREATE POLICY "units_delete_policy"
    ON public.units FOR DELETE
    TO authenticated
    USING ((SELECT public.is_teacher_or_admin()));

-- 3. Revoke ALL from anon for core tables to prevent data leaks
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.student_progress FROM anon;
REVOKE ALL ON public.students FROM anon;
REVOKE ALL ON public.srs_items FROM anon;
REVOKE ALL ON public.units FROM anon;
REVOKE ALL ON public.classes FROM anon;
REVOKE ALL ON public.class_enrollments FROM anon;

-- 4. Grant minimal necessary access to anon
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON public.units TO anon;
GRANT SELECT ON public.assets TO anon;
