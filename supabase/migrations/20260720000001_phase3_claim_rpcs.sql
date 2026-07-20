-- =====================================================================
-- 20260720000001 — phase3_claim_rpcs
-- Makes the teacher's claim link (/claim?t=...) resolve end-to-end:
--   * preview_roster_token  : token-holder sees the student name (no roster exposure otherwise)
--   * connect_parent_by_token : parent requests a (pending, approval-gated) link via token
--   * claim_roster_student (updated) : ALSO enrolls the student in the class (roster -> enrollment bridge)
-- All SECURITY DEFINER (postgres-owned => bypasses RLS, no recursion).
-- =====================================================================

-- (1) Preview: minimal, safe info for someone holding the one-time token.
CREATE OR REPLACE FUNCTION public.preview_roster_token(p_token TEXT)
RETURNS TABLE (
    roster_student_id UUID,
    display_name      TEXT,
    is_claimed        BOOLEAN,
    class_name        TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT rs.id,
           rs.display_name,
           (rs.claimed_profile_id IS NOT NULL),
           (SELECT c.name FROM public.classes c WHERE c.id = rs.class_id)
    FROM public.roster_students rs
    WHERE rs.claim_token = p_token
      AND rs.is_archived = false
    LIMIT 1;
$$;

-- (2) Parent connect by token (idempotent, approval-gated). Returns a status string.
CREATE OR REPLACE FUNCTION public.connect_parent_by_token(p_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rid UUID;
    cur TEXT;
BEGIN
    SELECT id INTO rid FROM public.roster_students
     WHERE claim_token = p_token AND is_archived = false;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid or expired link' USING ERRCODE = '22023';
    END IF;

    SELECT status INTO cur FROM public.parent_roster_links
     WHERE parent_id = auth.uid() AND roster_student_id = rid;
    IF cur = 'active'  THEN RETURN 'already_active';  END IF;
    IF cur = 'pending' THEN RETURN 'already_pending'; END IF;

    IF cur IS NULL THEN
        INSERT INTO public.parent_roster_links (parent_id, roster_student_id, status)
        VALUES (auth.uid(), rid, 'pending');
    ELSE
        -- rejected/revoked: allow re-request (re-queue for teacher approval)
        UPDATE public.parent_roster_links
           SET status = 'pending', approved_by = NULL, approved_at = NULL
         WHERE parent_id = auth.uid() AND roster_student_id = rid;
    END IF;

    PERFORM public.audit_action(
        'parent_link_requested_by_token', 'roster_students', rid::text,
        jsonb_build_object('parent', auth.uid())
    );
    RETURN 'requested';
END;
$$;

-- (3) Upgrade claim_roster_student: also enroll the student in the class so they
--     appear in rosters, the board, and reports (roster -> enrollment bridge).
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

    -- Enrollment bridge: the claiming home account joins the class.
    INSERT INTO public.class_enrollments (class_id, student_id)
    VALUES (r.class_id, auth.uid())
    ON CONFLICT DO NOTHING;

    PERFORM public.audit_action(
        'roster_student_claimed', 'roster_students', r.id::text,
        jsonb_build_object('profile_id', auth.uid())
    );
    RETURN r.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_roster_token(TEXT)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.connect_parent_by_token(TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_roster_student(TEXT)      TO authenticated;
