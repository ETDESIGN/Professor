
-- ============================================
-- Fix infinite recursion between classes ↔ class_enrollments RLS policies
-- Root cause: original enrollment policies (20260320000003) reference classes
-- via subquery, and classes_select_policy (20260420000000) references
-- class_enrollments via EXISTS → mutual recursion.
-- Fix: drop old recursive policies, use SECURITY DEFINER helper instead.
-- ============================================

-- 1. SECURITY DEFINER helper: check if current user is enrolled in a class
--    Bypasses RLS on class_enrollments, breaking the recursion cycle.
CREATE OR REPLACE FUNCTION public.is_enrolled(class_uuid UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.class_enrollments
        WHERE class_id = class_uuid AND student_id = auth.uid()
    )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Drop OLD recursive enrollment policies (from 20260320000003, never dropped)
DROP POLICY IF EXISTS "Teachers can view class enrollments" ON public.class_enrollments;
DROP POLICY IF EXISTS "Teachers can manage enrollments" ON public.class_enrollments;
DROP POLICY IF EXISTS "Students can view own enrollments" ON public.class_enrollments;

-- 3. Drop old classes policies from 20260320000003 that overlap with lockdown policies
DROP POLICY IF EXISTS "Teachers can view own classes" ON public.classes;
DROP POLICY IF EXISTS "Teachers can update own classes" ON public.classes;
DROP POLICY IF EXISTS "Teachers can delete own classes" ON public.classes;
DROP POLICY IF EXISTS "Teachers can create classes" ON public.classes;

-- 4. Recreate classes_select_policy using is_enrolled() instead of EXISTS subquery
DROP POLICY IF EXISTS "classes_select_policy" ON public.classes;

CREATE POLICY "classes_select_policy"
    ON public.classes FOR SELECT
    TO authenticated
    USING (
        teacher_id = auth.uid()
        OR public.is_enrolled(id)
        OR public.is_role('admin')
    );

-- 5. Recreate classes write policies (clean, no subqueries on enrollments)
CREATE POLICY "classes_insert_policy"
    ON public.classes FOR INSERT
    TO authenticated
    WITH CHECK (
        teacher_id = auth.uid()
        OR public.is_role('admin')
    );

CREATE POLICY "classes_update_policy"
    ON public.classes FOR UPDATE
    TO authenticated
    USING (
        teacher_id = auth.uid()
        OR public.is_role('admin')
    )
    WITH CHECK (
        teacher_id = auth.uid()
        OR public.is_role('admin')
    );

CREATE POLICY "classes_delete_policy"
    ON public.classes FOR DELETE
    TO authenticated
    USING (
        teacher_id = auth.uid()
        OR public.is_role('admin')
    );

-- 6. Recreate safe enrollment policies (no references to classes table)
DROP POLICY IF EXISTS "enrollments_select_policy" ON public.class_enrollments;

CREATE POLICY "enrollments_select_policy"
    ON public.class_enrollments FOR SELECT
    TO authenticated
    USING (
        student_id = auth.uid()
        OR public.is_teacher_or_admin()
    );

CREATE POLICY "enrollments_insert_policy"
    ON public.class_enrollments FOR INSERT
    TO authenticated
    WITH CHECK (
        student_id = auth.uid()
        OR public.is_teacher_or_admin()
    );

CREATE POLICY "enrollments_update_policy"
    ON public.class_enrollments FOR UPDATE
    TO authenticated
    USING (
        student_id = auth.uid()
        OR public.is_teacher_or_admin()
    )
    WITH CHECK (
        student_id = auth.uid()
        OR public.is_teacher_or_admin()
    );

CREATE POLICY "enrollments_delete_policy"
    ON public.class_enrollments FOR DELETE
    TO authenticated
    USING (
        student_id = auth.uid()
        OR public.is_teacher_or_admin()
    );
