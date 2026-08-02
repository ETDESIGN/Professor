-- =====================================================================
-- 20260803000004 — Tighten assets + srs_items + parent_student_links RLS
-- ---------------------------------------------------------------------
-- P1-9: Three permissive-RLS issues still live:
--
-- (a) assets SELECT is USING(true) to anon+authenticated (20260417000002).
--     Any user can read every generated asset. Scope to: owner, unit
--     teacher, teacher/admin, or student enrolled in a class assigned the
--     unit. Revoke anon access.
--
-- (b) srs_items template rows (student_id IS NULL) are readable by ANY
--     authenticated user (20260517000001). This leaks curriculum — a
--     student can enumerate every unit's vocab templates. Tighten the
--     template branch to require enrollment in a class assigned the unit.
--
-- (c) Legacy parent_student_links "Parents can manage links" is FOR ALL
--     with no status check — a parent can self-approve at the DB level.
--     Enforce approval-state: SELECT only active links; DELETE only own
--     pending; no UPDATE by parent.
-- =====================================================================

-- ── (a) assets: scope SELECT, revoke anon ────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read assets" ON public.assets;
CREATE POLICY "assets_select_policy"
    ON public.assets FOR SELECT TO authenticated
    USING (
        owner_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = assets.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
        OR EXISTS (
            SELECT 1 FROM public.class_enrollments ce
            JOIN public.assignments a ON a.class_id = ce.class_id
            WHERE ce.student_id = auth.uid() AND a.unit_id = assets.unit_id
        )
    );
REVOKE ALL ON public.assets FROM anon;
GRANT SELECT ON public.assets TO authenticated;

-- ── (b) srs_items: tighten template reads to enrolled students ───────
DROP POLICY IF EXISTS "srs_items_select_policy" ON public.srs_items;
CREATE POLICY "srs_items_select_policy"
    ON public.srs_items FOR SELECT TO authenticated
    USING (
        student_id = auth.uid()
        OR (
            student_id IS NULL
            AND EXISTS (
                SELECT 1 FROM public.class_enrollments ce
                JOIN public.assignments a ON a.class_id = ce.class_id
                WHERE ce.student_id = auth.uid() AND a.unit_id = srs_items.unit_id
            )
        )
        OR (SELECT public.is_teacher_or_admin())
    );

-- ── (c) parent_student_links: enforce approval-state ─────────────────
-- Drop the overly-permissive legacy policies.
DROP POLICY IF EXISTS "Parents can view linked students" ON public.parent_student_links;
DROP POLICY IF EXISTS "Parents can manage links" ON public.parent_student_links;

-- SELECT: parent sees only ACTIVE links (approved).
CREATE POLICY "parent_links_select_active"
    ON public.parent_student_links FOR SELECT TO authenticated
    USING (parent_id = auth.uid() AND status = 'active');

-- DELETE: parent may remove their own PENDING link (cancel a request).
CREATE POLICY "parent_links_delete_pending"
    ON public.parent_student_links FOR DELETE TO authenticated
    USING (parent_id = auth.uid() AND status = 'pending');

-- INSERT is already governed by parent_links_legacy_insert_policy
-- (20260715000006): parent_id = auth.uid() AND status = 'pending'.
