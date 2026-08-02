-- =====================================================================
-- 20260803000005 — Parent read access to point_transactions (P1-2 prereq)
-- ---------------------------------------------------------------------
-- Track 4 A2 requires ParentDashboard to show real weekly activity from
-- point_transactions. Currently only the class teacher / manager / admin
-- can read this table. Add a scoped SELECT policy so a parent can read
-- point_transactions for their linked (active) student(s).
--
-- Path: parent_roster_links (active) → roster_students.claimed_profile_id
--       = point_transactions.profile_id
-- Legacy: parent_student_links (active) → student_id = profile_id
-- =====================================================================

DROP POLICY IF EXISTS point_transactions_parent_select ON public.point_transactions;
CREATE POLICY point_transactions_parent_select
    ON public.point_transactions FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.parent_roster_links prl
            JOIN public.roster_students rs ON rs.id = prl.roster_student_id
            WHERE prl.parent_id = auth.uid()
              AND prl.status = 'active'
              AND rs.claimed_profile_id = point_transactions.profile_id
        )
        OR EXISTS (
            SELECT 1 FROM public.parent_student_links psl
            WHERE psl.parent_id = auth.uid()
              AND psl.status = 'active'
              AND psl.student_id = point_transactions.profile_id
        )
    );
