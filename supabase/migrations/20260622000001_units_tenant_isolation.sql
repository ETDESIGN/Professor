-- =====================================================================
-- Phase 5 (P2-2): tenant-isolate units SELECT
-- ---------------------------------------------------------------------
-- Previously `units_select_policy` was USING (true) -- every authenticated
-- user saw every unit across ALL teachers (a real multi-tenant leak).
--
-- New model:
--   * admin   -> all units
--   * teacher -> own units (teacher_id = auth.uid()); legacy NULL-teacher
--                units remain visible to teachers/admins so nothing is hidden
--   * student -> units owned by the teachers of any class the student is
--                enrolled in (class-teacher model; does NOT depend on the
--                assignments table being populated, so enrolled students keep
--                seeing their teacher's catalog)
-- Parents are intentionally not granted direct unit SELECT; revisit if parent
-- reports need it.
--
-- The student lookup goes through a SECURITY DEFINER helper so it is NOT
-- subject to class_enrollments/classes RLS (avoids recursion / empty results).
-- Easily reversible: DROP POLICY + recreate USING (true).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.student_class_teacher_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(array_agg(DISTINCT c.teacher_id), '{}'::uuid[])
  FROM public.classes c
  WHERE c.id IN (
    SELECT ce.class_id
    FROM public.class_enrollments ce
    WHERE ce.student_id = auth.uid()
  );
$$;

ALTER FUNCTION public.student_class_teacher_ids() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.student_class_teacher_ids() TO authenticated;

DROP POLICY IF EXISTS "units_select_policy" ON public.units;

CREATE POLICY "units_select_policy"
  ON public.units FOR SELECT
  TO authenticated
  USING (
    public.is_role('admin')
    OR (public.is_role('teacher') AND (units.teacher_id = auth.uid() OR units.teacher_id IS NULL))
    OR (public.is_role('student') AND units.teacher_id = ANY(public.student_class_teacher_ids()))
  );
