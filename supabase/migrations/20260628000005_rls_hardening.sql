-- =====================================================================
-- Security hardening (code-review follow-up)
-- ---------------------------------------------------------------------
-- (1) pool_items / objectives SELECT leaked answers: the policy ended with
--     `OR auth.role() = 'authenticated'`, which let ANY student read every
--     unit's content JSONB (incl. correct_index = answers). Scoped now to:
--     teacher owns the unit OR admin OR the student reaches the unit via an
--     assignment in a class they're enrolled in (matching the existing
--     assignments SELECT access model).
-- (2) srs_items teacher writes were blanket `is_teacher_or_admin()` — a
--     teacher with console/script access could grade students outside their
--     roster (the client guard in boardLearner is bypassable). The INSERT/
--     UPDATE WITH CHECK now additionally requires the target student to be
--     enrolled in one of the caller's classes. Student-self writes
--     (student_id = auth.uid()) and service-role/template writes are unchanged.
-- =====================================================================

-- (1a) objectives SELECT
DROP POLICY IF EXISTS "objectives_select_policy" ON public.objectives;
CREATE POLICY "objectives_select_policy"
    ON public.objectives FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = objectives.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
        OR EXISTS (
            SELECT 1 FROM public.class_enrollments ce
            JOIN public.assignments a ON a.class_id = ce.class_id
            WHERE ce.student_id = auth.uid() AND a.unit_id = objectives.unit_id
        )
    );

-- (1b) pool_items SELECT
DROP POLICY IF EXISTS "pool_items_select_policy" ON public.pool_items;
CREATE POLICY "pool_items_select_policy"
    ON public.pool_items FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = pool_items.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
        OR EXISTS (
            SELECT 1 FROM public.class_enrollments ce
            JOIN public.assignments a ON a.class_id = ce.class_id
            WHERE ce.student_id = auth.uid() AND a.unit_id = pool_items.unit_id
        )
    );

-- (2) srs_items teacher writes: scope the teacher branch to enrolled students.
DROP POLICY IF EXISTS "srs_items_insert_policy" ON public.srs_items;
CREATE POLICY "srs_items_insert_policy"
    ON public.srs_items FOR INSERT TO authenticated
    WITH CHECK (
        student_id::uuid = auth.uid()
        OR (
            (SELECT public.is_teacher_or_admin())
            AND EXISTS (
                SELECT 1 FROM public.class_enrollments ce
                JOIN public.classes c ON c.id = ce.class_id
                WHERE ce.student_id = srs_items.student_id AND c.teacher_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "srs_items_update_policy" ON public.srs_items;
CREATE POLICY "srs_items_update_policy"
    ON public.srs_items FOR UPDATE TO authenticated
    USING (
        student_id::uuid = auth.uid()
        OR (SELECT public.is_teacher_or_admin())
    )
    WITH CHECK (
        student_id::uuid = auth.uid()
        OR (
            (SELECT public.is_teacher_or_admin())
            AND EXISTS (
                SELECT 1 FROM public.class_enrollments ce
                JOIN public.classes c ON c.id = ce.class_id
                WHERE ce.student_id = srs_items.student_id AND c.teacher_id = auth.uid()
            )
        )
    );
