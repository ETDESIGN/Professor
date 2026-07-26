-- =====================================================================
-- 20260726000003 — Fix decide_parent_roster_link is_school_manager arity
--                   (workstream C3)
-- ---------------------------------------------------------------------
-- WHY: 20260715000006 defined decide_parent_roster_link calling
--   public.is_school_manager(rec.school_id)   -- 1-arg
-- but 20260720000002:41 did
--   DROP FUNCTION IF EXISTS public.is_school_manager(uuid)
-- and recreated it at :45 as
--   public.is_school_manager(school_uuid uuid, p_user uuid)   -- 2-arg
-- The body of decide_parent_roster_link was NEVER updated, so the
-- school-manager authorization branch throws at runtime:
--   ERROR: function is_school_manager(uuid) does not exist
-- Admin and class-teacher branches short-circuit before that line via OR,
-- so they still work — only school-manager approvals are broken today.
--
-- This migration CREATE OR REPLACEs decide_parent_roster_link with the
-- exact body currently live on cloud (pulled verbatim 2026-07-26), with the
-- single is_school_manager call corrected to the 2-arg signature:
--   public.is_school_manager(rec.school_id, auth.uid())
-- Everything else is byte-identical to the current live function.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.decide_parent_roster_link(p_link uuid, p_approve boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    rec RECORD;
BEGIN
    SELECT prl.status, rs.school_id, rs.class_id
      INTO rec
      FROM public.parent_roster_links prl
      JOIN public.roster_students rs ON rs.id = prl.roster_student_id
     WHERE prl.id = p_link;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent link not found' USING ERRCODE = '22023';
    END IF;
    -- Only PENDING links may be decided (prevents re-activating rejected/revoked).
    IF rec.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending parent links can be decided (current: %)', rec.status
            USING ERRCODE = '55006';
    END IF;
    IF NOT ( (SELECT public.is_role('admin'))
             OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = rec.class_id AND c.teacher_id = auth.uid())
             OR (rec.school_id IS NOT NULL AND public.is_school_manager(rec.school_id, auth.uid())) ) THEN
        RAISE EXCEPTION 'Not authorized to decide this parent link' USING ERRCODE = '42501';
    END IF;

    IF p_approve THEN
        UPDATE public.parent_roster_links
           SET status = 'active', approved_by = auth.uid(), approved_at = now()
         WHERE id = p_link;
    ELSE
        UPDATE public.parent_roster_links
           SET status = 'rejected', approved_by = auth.uid(), approved_at = now()
         WHERE id = p_link;
    END IF;

    PERFORM public.audit_action(
        'parent_link_decided', 'parent_roster_links', p_link::text,
        jsonb_build_object('approved', p_approve)
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.decide_parent_roster_link(uuid, boolean) TO authenticated;
