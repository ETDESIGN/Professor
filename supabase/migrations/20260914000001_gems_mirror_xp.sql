-- Gems mirror XP 1:1 (owner decision 2026-09-14): every POSITIVE XP award —
-- student-app (award_xp) and live-lesson (award_xp_to_student) — pays the same
-- amount in gems, atomically, in the same UPDATE. Only positive amounts mirror
-- (mistake penalties never take gems); gems decrease only via spending.
-- Go-forward only: no retroactive backfill (spend history is not reconcilable).

CREATE OR REPLACE FUNCTION public.award_xp(p_amount INTEGER)
RETURNS TABLE(xp INTEGER, total_xp_earned INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student UUID := auth.uid();
    v_xp INTEGER;
    v_total INTEGER;
BEGIN
    IF v_student IS NULL OR p_amount IS NULL OR p_amount = 0 THEN
        RETURN;
    END IF;
    PERFORM public.ensure_student_progress(v_student);
    UPDATE public.student_progress sp
       SET xp = sp.xp + p_amount,
           total_xp_earned = sp.total_xp_earned + GREATEST(p_amount, 0),
           gems = sp.gems + GREATEST(p_amount, 0)
     WHERE sp.student_id = v_student
    RETURNING sp.xp, sp.total_xp_earned INTO v_xp, v_total;

    RETURN QUERY SELECT v_xp, v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_xp_to_student(p_student UUID, p_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_xp INTEGER;
BEGIN
    IF p_amount IS NULL OR p_amount = 0 THEN RETURN 0; END IF;
    IF NOT public.is_teacher_or_admin() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    PERFORM public.ensure_student_progress(p_student);
    UPDATE public.student_progress
       SET xp = GREATEST(0, xp + p_amount),
           total_xp_earned = total_xp_earned + GREATEST(p_amount, 0),
           gems = gems + GREATEST(p_amount, 0)
     WHERE student_id = p_student
    RETURNING xp INTO v_xp;
    RETURN COALESCE(v_xp, 0);
END;
$$;
