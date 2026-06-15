-- Revoke anon access on character_ledger (was missed in lockdown migrations)
REVOKE ALL ON public.character_ledger FROM anon;

-- Grant read-only to authenticated users
GRANT SELECT ON public.character_ledger TO authenticated;

-- Revoke overly broad anon access on llm_telemetry
REVOKE ALL ON public.llm_telemetry FROM anon;

-- Fix class_enrollments INSERT: validate class exists and is active
DROP POLICY IF EXISTS "enrollments_insert_policy" ON public.class_enrollments;

CREATE POLICY "enrollments_insert_policy"
    ON public.class_enrollments FOR INSERT
    TO authenticated
    WITH CHECK (
        (student_id = auth.uid() AND EXISTS (
            SELECT 1 FROM public.classes WHERE classes.id = class_enrollments.class_id
        ))
        OR public.is_teacher_or_admin()
    );

-- Add missing indexes for SRS performance
CREATE INDEX IF NOT EXISTS idx_srs_items_student_id ON public.srs_items(student_id);
CREATE INDEX IF NOT EXISTS idx_srs_items_unit_id ON public.srs_items(unit_id);
CREATE INDEX IF NOT EXISTS idx_srs_items_next_review ON public.srs_items(next_review);
CREATE INDEX IF NOT EXISTS idx_billing_history_profile_id ON public.billing_history(profile_id);

-- Fix profiles SELECT: restrict to own row for students/parents, allow teachers/admins to see more
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;

CREATE POLICY "profiles_select_policy"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (
        id = auth.uid()
        OR public.is_teacher_or_admin()
    );

-- Fix students table SELECT: same restriction
DROP POLICY IF EXISTS "students_select_policy" ON public.students;

CREATE POLICY "students_select_policy"
    ON public.students FOR SELECT
    TO authenticated
    USING (
        id = auth.uid()
        OR public.is_teacher_or_admin()
    );
