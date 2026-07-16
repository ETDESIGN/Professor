-- =====================================================================
-- 20260715000005 — roster_students (REVISED per code review)
-- Fixes: school_id is now DERIVED from the class (trigger) so a manager
-- cannot attach a roster row to another school's class; authority is read
-- from classes.teacher_id / classes.school_id (not a stale snapshot
-- teacher_id column); the repeated approver predicate is centralized in
-- can_manage_class()/can_manage_roster_student() helpers.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.roster_students (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id              UUID REFERENCES public.schools(id) ON DELETE CASCADE,
    class_id               UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    teacher_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    display_name           TEXT NOT NULL,
    avatar                 TEXT,
    team                   TEXT,
    claim_token            TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    claim_token_expires_at TIMESTAMPTZ,
    claimed_profile_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    claimed_at             TIMESTAMPTZ,
    is_archived            BOOLEAN NOT NULL DEFAULT false,
    metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_roster_students_class   ON public.roster_students(class_id);
CREATE INDEX IF NOT EXISTS idx_roster_students_teacher ON public.roster_students(teacher_id);
CREATE INDEX IF NOT EXISTS idx_roster_students_school  ON public.roster_students(school_id) WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roster_students_claimed ON public.roster_students(claimed_profile_id) WHERE claimed_profile_id IS NOT NULL;

ALTER TABLE public.roster_students ENABLE ROW LEVEL SECURITY;

-- ---- Centralized authority helpers (classes.school_id is the source of truth) ----
CREATE OR REPLACE FUNCTION public.can_manage_class(p_class UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.classes c
                   WHERE c.id = p_class AND c.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.classes c
                   WHERE c.id = p_class
                     AND c.school_id IS NOT NULL
                     AND public.is_school_manager(c.school_id))
$$;

CREATE OR REPLACE FUNCTION public.can_manage_roster_student(p_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.roster_students rs
                   JOIN public.classes c ON c.id = rs.class_id
                   WHERE rs.id = p_id AND c.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.roster_students rs
                   JOIN public.classes c ON c.id = rs.class_id
                   WHERE rs.id = p_id
                     AND c.school_id IS NOT NULL
                     AND public.is_school_manager(c.school_id))
$$;

-- ---- Derive roster_students.school_id from the class (single source of truth) ----
CREATE OR REPLACE FUNCTION public.sync_roster_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    cls_school UUID;
BEGIN
    SELECT c.school_id INTO cls_school FROM public.classes c WHERE c.id = NEW.class_id;
    NEW.school_id := cls_school;  -- always mirror the class (NULL when independent)
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_roster_school ON public.roster_students;
CREATE TRIGGER trg_sync_roster_school
    BEFORE INSERT OR UPDATE OF class_id, school_id ON public.roster_students
    FOR EACH ROW EXECUTE FUNCTION public.sync_roster_school_id();

-- ---- Policies (use the helpers; no stale teacher_id / school_id authority) ----
DROP POLICY IF EXISTS "roster_students_select_policy" ON public.roster_students;
CREATE POLICY "roster_students_select_policy"
    ON public.roster_students FOR SELECT TO authenticated
    USING ( public.can_manage_roster_student(roster_students.id) );

DROP POLICY IF EXISTS "roster_students_insert_policy" ON public.roster_students;
CREATE POLICY "roster_students_insert_policy"
    ON public.roster_students FOR INSERT TO authenticated
    WITH CHECK ( public.can_manage_class(roster_students.class_id) );

DROP POLICY IF EXISTS "roster_students_update_policy" ON public.roster_students;
CREATE POLICY "roster_students_update_policy"
    ON public.roster_students FOR UPDATE TO authenticated
    USING ( public.can_manage_roster_student(roster_students.id) )
    WITH CHECK ( public.can_manage_class(roster_students.class_id) );

DROP POLICY IF EXISTS "roster_students_delete_policy" ON public.roster_students;
CREATE POLICY "roster_students_delete_policy"
    ON public.roster_students FOR DELETE TO authenticated
    USING ( public.can_manage_roster_student(roster_students.id) );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roster_students TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_class(UUID)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_roster_student(UUID)   TO authenticated;

-- ---- Claim RPC: single-use token -> bind home account ----------------
CREATE OR REPLACE FUNCTION public.claim_roster_student(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r public.roster_students;
BEGIN
    SELECT * INTO r FROM public.roster_students WHERE claim_token = p_token FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid claim token' USING ERRCODE = '22023';
    END IF;
    IF r.is_archived THEN
        RAISE EXCEPTION 'This student is archived and cannot be claimed' USING ERRCODE = '55006';
    END IF;
    IF r.claimed_profile_id IS NOT NULL THEN
        RAISE EXCEPTION 'This student has already been claimed' USING ERRCODE = '55006';
    END IF;
    IF r.claim_token_expires_at IS NOT NULL AND r.claim_token_expires_at < now() THEN
        RAISE EXCEPTION 'Claim token expired' USING ERRCODE = '22023';
    END IF;

    UPDATE public.roster_students
       SET claimed_profile_id = auth.uid(),
           claimed_at         = now(),
           claim_token        = gen_random_uuid()::text,  -- rotate => invalidate
           updated_at         = now()
     WHERE id = r.id;

    PERFORM public.audit_action(
        'roster_student_claimed', 'roster_students', r.id::text,
        jsonb_build_object('profile_id', auth.uid())
    );
    RETURN r.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_roster_student(TEXT) TO authenticated;
