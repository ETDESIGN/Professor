-- =====================================================================
-- 20260723000002 — materialize class_enrollments joins into roster_students
--
-- AUDIT (P1 #6): the roster-first live board reads roster_students only.
-- Migration 20260721000003 was a ONE-TIME backfill — it caught students who
-- had joined via class code BEFORE that migration ran, but any student who
-- joins AFTER it still lands in class_enrollments only and never appears on
-- the live board (can't be picked, no FSRS grading, no points).
--
-- Fix: a trigger that runs on every class_enrollments INSERT and idempotently
-- creates a CLAIMED roster_students row for the joining profile. Mirrors the
-- backfill's behaviour but for ongoing joins. display_name comes from the
-- profile; school_id is derived by the existing trg_sync_roster_school
-- BEFORE INSERT trigger, so we don't set it here.
--
-- SECURITY DEFINER: the actor is the STUDENT joining (their RLS on
-- roster_students INSERT would deny them — they don't manage the class).
-- The function bypasses RLS to create the roster row on the teacher's behalf.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.materialize_enrollment_to_roster()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_teacher_id UUID;
    v_display_name TEXT;
BEGIN
    -- Resolve the class's teacher + a friendly display name for the profile.
    SELECT c.teacher_id INTO v_teacher_id
    FROM public.classes c
    WHERE c.id = NEW.class_id;

    IF v_teacher_id IS NULL THEN
        -- Class vanished (FK cascades should prevent this) — nothing to do.
        RETURN NEW;
    END IF;

    SELECT COALESCE(NULLIF(p.full_name, ''), NULLIF(p.email, ''), 'Student')
    INTO v_display_name
    FROM public.profiles p
    WHERE p.id = NEW.student_id;

    -- Idempotent: don't create a duplicate roster row for the same
    -- (class, claimed_profile_id). Re-joining / re-inserting is a no-op.
    IF NOT EXISTS (
        SELECT 1 FROM public.roster_students rs
        WHERE rs.class_id = NEW.class_id
          AND rs.claimed_profile_id = NEW.student_id
    ) THEN
        INSERT INTO public.roster_students
            (class_id, teacher_id, display_name, claimed_profile_id, claimed_at)
        VALUES
            (NEW.class_id, v_teacher_id, v_display_name, NEW.student_id, now());
    END IF;

    RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.materialize_enrollment_to_roster() TO authenticated;

DROP TRIGGER IF EXISTS trg_enrollment_to_roster ON public.class_enrollments;
CREATE TRIGGER trg_enrollment_to_roster
    AFTER INSERT ON public.class_enrollments
    FOR EACH ROW
    EXECUTE FUNCTION public.materialize_enrollment_to_roster();
