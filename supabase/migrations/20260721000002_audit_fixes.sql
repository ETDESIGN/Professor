-- =====================================================================
-- 20260721000002 — audit fixes: inline admin check in point_transactions
--
-- AUDIT (issue #1): point_transactions policies used `(SELECT public.is_role
-- ('admin'))`. is_role is a SECURITY DEFINER helper that relies on auth.jwt()
-- /auth.uid(), which are unreliable when the helper is invoked from an RLS
-- policy (the same root cause as 20260720000003/04). Inline the admin check so
-- admins can also read/insert ledger rows (teachers/managers were already fine
-- via the EXISTS branches).
-- =====================================================================

DROP POLICY IF EXISTS point_transactions_select_policy ON public.point_transactions;
CREATE POLICY point_transactions_select_policy ON public.point_transactions FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = point_transactions.class_id AND c.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.classes c JOIN public.school_memberships sm ON sm.school_id = c.school_id
                   WHERE c.id = point_transactions.class_id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    );

DROP POLICY IF EXISTS point_transactions_insert_policy ON public.point_transactions;
CREATE POLICY point_transactions_insert_policy ON public.point_transactions FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR EXISTS (SELECT 1 FROM public.roster_students rs JOIN public.classes c ON c.id = rs.class_id
                   WHERE rs.id = point_transactions.roster_id AND c.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.roster_students rs JOIN public.classes c ON c.id = rs.class_id
                   JOIN public.school_memberships sm ON sm.school_id = c.school_id
                   WHERE rs.id = point_transactions.roster_id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    );
