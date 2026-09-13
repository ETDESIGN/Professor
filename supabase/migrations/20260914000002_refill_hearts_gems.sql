-- Heart-refill gem exchange (owner-approved Tier-1, plan 2026-09-14 §1.3):
-- atomic 50 gems → 5 hearts for the CALLING student. Gems decrease ONLY here
-- and in the shop spend path (owner gems rule). Fails (NULL) when the student
-- cannot afford it — the client shows the free Practice path instead.

CREATE OR REPLACE FUNCTION public.refill_hearts_gems(p_cost INTEGER DEFAULT 50, p_hearts INTEGER DEFAULT 5)
RETURNS TABLE(gems INTEGER, hearts INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student UUID := auth.uid();
    v_gems INTEGER;
    v_hearts INTEGER;
BEGIN
    IF v_student IS NULL THEN RETURN; END IF;
    PERFORM public.ensure_student_progress(v_student);
    UPDATE public.student_progress sp
       SET gems = sp.gems - p_cost,
           hearts = 5, -- full refill (HEARTS_MAX); column default is 5
           hearts_updated_at = NOW()
     WHERE sp.student_id = v_student
       AND sp.gems >= p_cost
    RETURNING sp.gems, sp.hearts INTO v_gems, v_hearts;

    IF v_gems IS NULL THEN
        RETURN; -- insufficient gems: caller renders the free practice path
    END IF;

    RETURN QUERY SELECT v_gems, v_hearts;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refill_hearts_gems(INTEGER, INTEGER) TO authenticated;
