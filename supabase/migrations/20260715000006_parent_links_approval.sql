-- =====================================================================
-- 20260715000006 — parent_links_approval (REVISED per code review)
-- Fixes: legacy parent_student_links defaults to 'pending' (+ insert forces
-- pending) so new legacy links cannot self-approve; parent_roster_links
-- uses can_manage_roster_student(); a parent may DELETE only their own
-- PENDING link; decide_parent_roster_link() only acts on pending links.
-- =====================================================================

-- ---- 1. Legacy parent_student_links: add gating columns (pending by default) ----
ALTER TABLE public.parent_student_links
    ADD COLUMN IF NOT EXISTS status     public.membership_status DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
-- Existing rows pre-date gating => treat as active (approved).
UPDATE public.parent_student_links SET status = 'active' WHERE status IS NULL;
-- New legacy links must be pending (cannot self-approve).
ALTER TABLE public.parent_student_links ALTER COLUMN status SET DEFAULT 'pending';

DROP POLICY IF EXISTS "parent_links_legacy_insert_policy" ON public.parent_student_links;
-- Drop the original permissive insert policy (20260323000000) so it can't be
-- OR'd with the strict one below and bypass the status='pending' gate.
DROP POLICY IF EXISTS "Parents can create links" ON public.parent_student_links;
CREATE POLICY "parent_links_legacy_insert_policy"
    ON public.parent_student_links FOR INSERT TO authenticated
    WITH CHECK ( parent_id = auth.uid() AND status = 'pending' );

DROP VIEW IF EXISTS public.active_parent_links;
CREATE OR REPLACE VIEW public.active_parent_links AS
    SELECT * FROM public.parent_student_links WHERE status = 'active';
GRANT SELECT ON public.active_parent_links TO authenticated;

-- ---- 2. New roster-based parent links ------------------------------
CREATE TABLE IF NOT EXISTS public.parent_roster_links (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    roster_student_id UUID NOT NULL REFERENCES public.roster_students(id) ON DELETE CASCADE,
    relationship      TEXT DEFAULT 'parent',
    status            public.membership_status NOT NULL DEFAULT 'pending',
    approved_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (parent_id, roster_student_id)
);
CREATE INDEX IF NOT EXISTS idx_parent_roster_links_parent  ON public.parent_roster_links(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_roster_links_student ON public.parent_roster_links(roster_student_id);

ALTER TABLE public.parent_roster_links ENABLE ROW LEVEL SECURITY;

-- SELECT: parent (own) OR a roster manager OR admin.
DROP POLICY IF EXISTS "parent_roster_links_select_policy" ON public.parent_roster_links;
CREATE POLICY "parent_roster_links_select_policy"
    ON public.parent_roster_links FOR SELECT TO authenticated
    USING (
        parent_id = auth.uid()
        OR (SELECT public.is_role('admin'))
        OR public.can_manage_roster_student(parent_roster_links.roster_student_id)
    );

-- INSERT: a parent creates a PENDING link for themselves only.
DROP POLICY IF EXISTS "parent_roster_links_insert_policy" ON public.parent_roster_links;
CREATE POLICY "parent_roster_links_insert_policy"
    ON public.parent_roster_links FOR INSERT TO authenticated
    WITH CHECK ( parent_id = auth.uid() AND status = 'pending' );

-- UPDATE: roster managers + admin only (NOT the parent) => no self-approval.
DROP POLICY IF EXISTS "parent_roster_links_update_policy" ON public.parent_roster_links;
CREATE POLICY "parent_roster_links_update_policy"
    ON public.parent_roster_links FOR UPDATE TO authenticated
    USING (
        (SELECT public.is_role('admin'))
        OR public.can_manage_roster_student(parent_roster_links.roster_student_id)
    )
    WITH CHECK (
        (SELECT public.is_role('admin'))
        OR public.can_manage_roster_student(parent_roster_links.roster_student_id)
    );

-- DELETE: own PENDING only, or a roster manager, or admin.
DROP POLICY IF EXISTS "parent_roster_links_delete_policy" ON public.parent_roster_links;
CREATE POLICY "parent_roster_links_delete_policy"
    ON public.parent_roster_links FOR DELETE TO authenticated
    USING (
        (parent_id = auth.uid() AND status = 'pending')
        OR (SELECT public.is_role('admin'))
        OR public.can_manage_roster_student(parent_roster_links.roster_student_id)
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parent_roster_links TO authenticated, service_role;

-- ---- 3. Approval RPC (server-side business rule) -------------------
CREATE OR REPLACE FUNCTION public.decide_parent_roster_link(p_link UUID, p_approve BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
             OR (rec.school_id IS NOT NULL AND public.is_school_manager(rec.school_id)) ) THEN
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
$$;

GRANT EXECUTE ON FUNCTION public.decide_parent_roster_link(UUID, BOOLEAN) TO authenticated;
