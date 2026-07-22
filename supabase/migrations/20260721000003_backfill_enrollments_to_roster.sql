-- =====================================================================
-- 20260721000003 — backfill legacy enrollments into roster_students
--
-- AUDIT (issue #2): the roster-first live board reads roster_students and
-- ignores class_enrollments, so students who joined via the LEGACY self-join
-- (class code) are enrolled but never appear in the live board. Materialize
-- them into roster_students (already-claimed) so all class membership flows
-- through the roster. Idempotent.
-- =====================================================================

INSERT INTO public.roster_students (class_id, teacher_id, display_name, claimed_profile_id, claimed_at)
SELECT
    ce.class_id,
    c.teacher_id,
    COALESCE(NULLIF(p.full_name, ''), p.email, 'Student') AS display_name,
    ce.student_id              AS claimed_profile_id,
    now()                      AS claimed_at
FROM public.class_enrollments ce
JOIN public.classes c   ON c.id = ce.class_id
JOIN public.profiles p  ON p.id = ce.student_id
WHERE NOT EXISTS (
    SELECT 1 FROM public.roster_students rs
    WHERE rs.class_id = ce.class_id
      AND rs.claimed_profile_id = ce.student_id
);
