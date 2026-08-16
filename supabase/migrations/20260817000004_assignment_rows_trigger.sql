-- Migration: auto-create student_assignments rows
-- Audit P0-8 (docs/audit/STUDENT_APP_AUDIT_2026-08-17.md): teachers insert
-- only into `assignments` — nothing ever created the per-student
-- student_assignments rows, so the student homework list was always
-- "All caught up". One row per enrolled student per assignment.
--
-- Note: students who join a class after an assignment was created do not get
-- that older assignment (INSERT-time fan-out only); new assignments always
-- include the full current roster.

CREATE OR REPLACE FUNCTION public.handle_new_assignment()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.student_assignments (assignment_id, student_id)
    SELECT NEW.id, e.student_id
    FROM public.class_enrollments e
    WHERE e.class_id = NEW.class_id
      AND e.role_in_class = 'student'
    ON CONFLICT (assignment_id, student_id) DO NOTHING;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'student_assignments fan-out failed for assignment %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_assignment_created ON public.assignments;
CREATE TRIGGER on_assignment_created
    AFTER INSERT ON public.assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_assignment();

-- Backfill: existing assignments that never fanned out to enrolled students.
INSERT INTO public.student_assignments (assignment_id, student_id)
SELECT a.id, e.student_id
FROM public.assignments a
JOIN public.class_enrollments e
  ON e.class_id = a.class_id AND e.role_in_class = 'student'
ON CONFLICT (assignment_id, student_id) DO NOTHING;
