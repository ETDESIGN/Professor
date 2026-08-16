-- Migration: join_class_by_code RPC
-- Audit P0-3 (docs/audit/STUDENT_APP_AUDIT_2026-08-17.md): the client's
-- findClassByCode SELECTed `classes` BEFORE enrolling, but classes_select_policy
-- requires the student to already be enrolled — an RLS deadlock where valid
-- codes returned "Class not found" and students could never join. This
-- SECURITY DEFINER RPC looks up the class and enrolls in a single call.
--
-- Returns: one row (id, name, already_enrolled) on success, zero rows when the
-- code matches no active class. Raises 42501 for unauthenticated/non-student.

CREATE OR REPLACE FUNCTION public.join_class_by_code(p_code TEXT)
RETURNS TABLE (id UUID, name TEXT, already_enrolled BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class public.classes%ROWTYPE;
    v_student UUID := auth.uid();
    v_already BOOLEAN := FALSE;
BEGIN
    IF v_student IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_student AND p.role = 'student'
    ) THEN
        RAISE EXCEPTION 'not_a_student' USING ERRCODE = '42501';
    END IF;

    SELECT c.* INTO v_class
    FROM public.classes c
    WHERE c.is_active
      AND c.code IS NOT NULL
      AND UPPER(TRIM(c.code)) = UPPER(TRIM(p_code))
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN; -- zero rows = class not found
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.class_enrollments e
        WHERE e.class_id = v_class.id AND e.student_id = v_student
    ) INTO v_already;

    IF NOT v_already THEN
        INSERT INTO public.class_enrollments (class_id, student_id)
        VALUES (v_class.id, v_student);
    END IF;

    RETURN QUERY SELECT v_class.id, v_class.name, v_already;
END;
$$;

REVOKE ALL ON FUNCTION public.join_class_by_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_class_by_code(TEXT) TO authenticated;
