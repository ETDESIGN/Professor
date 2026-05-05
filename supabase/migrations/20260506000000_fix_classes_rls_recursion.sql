
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
DROP POLICY IF EXISTS "classes_insert_policy" ON public.classes;
DROP POLICY IF EXISTS "classes_update_policy" ON public.classes;
DROP POLICY IF EXISTS "classes_delete_policy" ON public.classes;

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
DROP POLICY IF EXISTS "enrollments_insert_policy" ON public.class_enrollments;
DROP POLICY IF EXISTS "enrollments_update_policy" ON public.class_enrollments;
DROP POLICY IF EXISTS "enrollments_delete_policy" ON public.class_enrollments;

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

-- ============================================
-- 7. Fix is_role() to handle missing app_metadata gracefully
-- ============================================

CREATE OR REPLACE FUNCTION public.is_role(required_role user_role)
RETURNS BOOLEAN AS $$
    DECLARE
        jwt_role TEXT;
        profile_role TEXT;
    BEGIN
        jwt_role := auth.jwt() -> 'app_metadata' ->> 'role';
        IF jwt_role IS NOT NULL AND jwt_role = required_role::text THEN
            RETURN true;
        END IF;

        SELECT role::text INTO profile_role FROM public.profiles WHERE id = auth.uid();
        RETURN profile_role = required_role::text;
    END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- 8. Fix units INSERT — allow any authenticated user (app gates the UI)
-- ============================================

DROP POLICY IF EXISTS "units_insert_policy" ON public.units;

CREATE POLICY "units_insert_policy"
    ON public.units FOR INSERT
    TO authenticated
    WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- 9. Ensure class_analytics_view exists
-- ============================================

CREATE OR REPLACE VIEW public.class_analytics_view AS
SELECT
  c.id as class_id,
  c.teacher_id,
  COUNT(ce.student_id) as total_students,
  COALESCE(SUM(sp.xp), 0) as total_xp,
  ROUND(COALESCE(AVG(sp.xp), 0)) as avg_xp_per_student,
  ROUND(COALESCE(AVG(array_length(sp.completed_unit_ids, 1)), 0) / 10.0 * 100) as mastery_percent,
  LEAST(100, ROUND(COALESCE(AVG(sp.streak), 0) * 3.33)) as engagement_percent,
  ROUND((COUNT(sp.current_unit_id)::float / GREATEST(COUNT(ce.student_id), 1)) * 100) as completion_percent
FROM public.classes c
LEFT JOIN public.class_enrollments ce ON c.id = ce.class_id
LEFT JOIN public.student_progress sp ON ce.student_id = sp.student_id
GROUP BY c.id, c.teacher_id;

GRANT SELECT ON public.class_analytics_view TO authenticated, service_role;
