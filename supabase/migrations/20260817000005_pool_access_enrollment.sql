-- =====================================================================
-- 20260817000005 — Enrollment-based student access to the exercise pool
-- ---------------------------------------------------------------------
-- Audit P0-7 (docs/audit/STUDENT_APP_AUDIT_2026-08-17.md): the student
-- SELECT branches on objectives, pool_items, assets and srs template rows
-- require an ASSIGNMENT row linking an enrolled class to the unit. Classes
-- mostly USE units without formal assignment rows, so even with pools
-- generated, enrolled students read nothing: lesson batteries empty, Daily
-- Practice "all caught up", no crowns, phonics empty, media regenerating.
--
-- Fix: swap the assignment-join for the exact rule students already pass to
-- SEE the unit (units_select_policy, 20260622000001): the unit's teacher must
-- be one of the student's class teachers (student_class_teacher_ids()).
-- Same tenant boundary, row-scoped by each row's own unit_id — this exposes
-- nothing the student cannot already enumerate via `units`.
--
-- Teacher/admin/owner branches unchanged. Policies are DROP+CREATE so the
-- migration is idempotent.
-- =====================================================================

-- (1) objectives SELECT
DROP POLICY IF EXISTS "objectives_select_policy" ON public.objectives;
CREATE POLICY "objectives_select_policy"
    ON public.objectives FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = objectives.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
        OR EXISTS (
            SELECT 1 FROM public.units u
            WHERE u.id = objectives.unit_id
              AND u.teacher_id = ANY (public.student_class_teacher_ids())
        )
    );

-- (2) pool_items SELECT
DROP POLICY IF EXISTS "pool_items_select_policy" ON public.pool_items;
CREATE POLICY "pool_items_select_policy"
    ON public.pool_items FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = pool_items.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
        OR EXISTS (
            SELECT 1 FROM public.units u
            WHERE u.id = pool_items.unit_id
              AND u.teacher_id = ANY (public.student_class_teacher_ids())
        )
    );

-- (3) assets SELECT — student branch swapped the same way (media fast path)
DROP POLICY IF EXISTS "assets_select_policy" ON public.assets;
CREATE POLICY "assets_select_policy"
    ON public.assets FOR SELECT TO authenticated
    USING (
        owner_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = assets.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
        OR EXISTS (
            SELECT 1 FROM public.units u
            WHERE u.id = assets.unit_id
              AND u.teacher_id = ANY (public.student_class_teacher_ids())
        )
    );

-- (4) srs_items SELECT — template branch swapped the same way
DROP POLICY IF EXISTS "srs_items_select_policy" ON public.srs_items;
CREATE POLICY "srs_items_select_policy"
    ON public.srs_items FOR SELECT TO authenticated
    USING (
        student_id = auth.uid()
        OR (
            student_id IS NULL
            AND EXISTS (
                SELECT 1 FROM public.units u
                WHERE u.id = srs_items.unit_id
                  AND u.teacher_id = ANY (public.student_class_teacher_ids())
            )
        )
        OR (SELECT public.is_teacher_or_admin())
    );
