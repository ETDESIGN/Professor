-- =====================================================================
-- 20260721000001 — live integration: unified class-points ledger
--
-- Implements the roster↔board↔points integration (Claude plan, refined):
--  - point_transactions = source of truth for CLASS points (auto + manual).
--  - home XP stays in profiles (separate, per owner decision).
--  - unified total = home XP + SUM(ledger) (computed at roster load).
--  - keyed on roster_students.id so UNCLAIMED students (no profile) still
--    earn points; profile_id is backfilled when they claim.
-- RLS is INLINED (auth.uid() is not reliable inside SECURITY DEFINER helpers).
-- classroom_sessions.class_id already exists (20260619000000) — wired in app.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.point_transactions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roster_id  UUID NOT NULL REFERENCES public.roster_students(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- backfilled on claim
    class_id   UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    amount     INTEGER NOT NULL,
    source     TEXT NOT NULL DEFAULT 'board',            -- board_listen_tap | baton_manual | speed_quiz | ...
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pt_roster ON public.point_transactions(roster_id);
CREATE INDEX IF NOT EXISTS idx_pt_class  ON public.point_transactions(class_id);
CREATE INDEX IF NOT EXISTS idx_pt_profile ON public.point_transactions(profile_id) WHERE profile_id IS NOT NULL;

ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;

-- SELECT: the class's teacher, the school's manager, or admin.
DROP POLICY IF EXISTS point_transactions_select_policy ON public.point_transactions;
CREATE POLICY point_transactions_select_policy ON public.point_transactions FOR SELECT TO authenticated
    USING (
        (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = point_transactions.class_id AND c.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.classes c JOIN public.school_memberships sm ON sm.school_id = c.school_id
                   WHERE c.id = point_transactions.class_id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    );

-- INSERT: same authority. (roster_id must belong to the teacher's class.)
DROP POLICY IF EXISTS point_transactions_insert_policy ON public.point_transactions;
CREATE POLICY point_transactions_insert_policy ON public.point_transactions FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.roster_students rs JOIN public.classes c ON c.id = rs.class_id
                   WHERE rs.id = point_transactions.roster_id AND c.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.roster_students rs JOIN public.classes c ON c.id = rs.class_id
                   JOIN public.school_memberships sm ON sm.school_id = c.school_id
                   WHERE rs.id = point_transactions.roster_id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    );

GRANT SELECT, INSERT ON public.point_transactions TO authenticated, service_role;

-- Realtime: board subscribes to roster_students + point_transactions for the live class.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='roster_students') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.roster_students;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='point_transactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.point_transactions;
  END IF;
END $$;

-- On claim: backfill profile_id on this roster's ledger rows so the unified
-- total (home XP + ledger) can be computed for the now-claimed home account.
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
           claim_token        = gen_random_uuid()::text,
           updated_at         = now()
     WHERE id = r.id;

    -- Enrollment bridge (roster -> class_enrollments).
    INSERT INTO public.class_enrollments (class_id, student_id)
    VALUES (r.class_id, auth.uid())
    ON CONFLICT DO NOTHING;

    -- Backfill profile_id on accumulated class points.
    UPDATE public.point_transactions SET profile_id = auth.uid()
     WHERE roster_id = r.id AND profile_id IS NULL;

    PERFORM public.audit_action(
        'roster_student_claimed', 'roster_students', r.id::text,
        jsonb_build_object('profile_id', auth.uid())
    );
    RETURN r.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_roster_student(TEXT) TO authenticated;
