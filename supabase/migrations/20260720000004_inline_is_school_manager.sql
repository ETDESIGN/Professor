-- =====================================================================
-- 20260720000004 — inline is_school_manager() in RLS policies
--
-- Same root cause as 20260720000003: is_school_manager() is a SECURITY
-- DEFINER helper that uses auth.uid() internally, which is NULL when the
-- helper is invoked from an RLS policy. So manager-scoped policies
-- (schools, memberships, classes-manager, announcements) failed for
-- managers (admins were fine via is_role('admin')). Inline the membership
-- check directly in each policy expression.
-- =====================================================================

-- ---------- schools ----------
DROP POLICY IF EXISTS schools_select_policy ON public.schools;
DROP POLICY IF EXISTS schools_update_policy ON public.schools;
CREATE POLICY schools_select_policy ON public.schools FOR SELECT TO authenticated
    USING (
        (SELECT public.is_role('admin'))
        OR owner_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.school_memberships sm
                   WHERE sm.school_id = schools.id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
        OR EXISTS (SELECT 1 FROM public.school_memberships sm
                   WHERE sm.school_id = schools.id AND sm.user_id = auth.uid() AND sm.status = 'active')
    );
CREATE POLICY schools_update_policy ON public.schools FOR UPDATE TO authenticated
    USING (
        (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.school_memberships sm
                   WHERE sm.school_id = schools.id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    )
    WITH CHECK (
        (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.school_memberships sm
                   WHERE sm.school_id = schools.id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    );

-- ---------- school_memberships ----------
DROP POLICY IF EXISTS memberships_select_policy ON public.school_memberships;
DROP POLICY IF EXISTS memberships_insert_policy ON public.school_memberships;
DROP POLICY IF EXISTS memberships_update_policy ON public.school_memberships;
DROP POLICY IF EXISTS memberships_delete_policy ON public.school_memberships;

CREATE POLICY memberships_select_policy ON public.school_memberships FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.school_memberships sm
                   WHERE sm.school_id = school_memberships.school_id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    );
CREATE POLICY memberships_insert_policy ON public.school_memberships FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT public.is_role('admin'))
        OR (EXISTS (SELECT 1 FROM public.school_memberships sm
                    WHERE sm.school_id = school_memberships.school_id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
            AND role = 'teacher' AND status = 'pending')
        OR (user_id = auth.uid() AND role = 'teacher' AND status = 'pending')
    );
CREATE POLICY memberships_update_policy ON public.school_memberships FOR UPDATE TO authenticated
    USING (
        (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.school_memberships sm
                   WHERE sm.school_id = school_memberships.school_id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    )
    WITH CHECK (
        (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.school_memberships sm
                   WHERE sm.school_id = school_memberships.school_id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    );
CREATE POLICY memberships_delete_policy ON public.school_memberships FOR DELETE TO authenticated
    USING (
        (user_id = auth.uid() AND status = 'pending')
        OR (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.school_memberships sm
                   WHERE sm.school_id = school_memberships.school_id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    );

-- ---------- classes (manager) ----------
DROP POLICY IF EXISTS managers_select_classes ON public.classes;
DROP POLICY IF EXISTS managers_insert_classes ON public.classes;
DROP POLICY IF EXISTS managers_update_classes ON public.classes;
DROP POLICY IF EXISTS managers_delete_classes ON public.classes;

CREATE POLICY managers_select_classes ON public.classes FOR SELECT TO authenticated
    USING ( school_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.school_memberships sm WHERE sm.school_id = classes.school_id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active') );
CREATE POLICY managers_insert_classes ON public.classes FOR INSERT TO authenticated
    WITH CHECK ( school_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.school_memberships sm WHERE sm.school_id = classes.school_id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active') );
CREATE POLICY managers_update_classes ON public.classes FOR UPDATE TO authenticated
    USING ( school_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.school_memberships sm WHERE sm.school_id = classes.school_id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active') )
    WITH CHECK ( school_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.school_memberships sm WHERE sm.school_id = classes.school_id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active') );
CREATE POLICY managers_delete_classes ON public.classes FOR DELETE TO authenticated
    USING ( school_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.school_memberships sm WHERE sm.school_id = classes.school_id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active') );

-- ---------- announcements ----------
DROP POLICY IF EXISTS announcements_select_policy ON public.announcements;
DROP POLICY IF EXISTS announcements_insert_policy ON public.announcements;

CREATE POLICY announcements_select_policy ON public.announcements FOR SELECT TO authenticated
    USING (
        (SELECT public.is_role('admin'))
        OR author_id = auth.uid()
        OR audience = 'public'
        OR (audience = 'school' AND school_id IS NOT NULL AND (
                EXISTS (SELECT 1 FROM public.school_memberships sm WHERE sm.school_id = announcements.school_id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
             OR EXISTS (SELECT 1 FROM public.school_memberships sm WHERE sm.school_id = announcements.school_id AND sm.user_id = auth.uid() AND sm.status = 'active')
            ))
        OR (audience = 'class' AND class_id IS NOT NULL AND (
                EXISTS (SELECT 1 FROM public.classes c WHERE c.id = announcements.class_id AND c.teacher_id = auth.uid())
             OR EXISTS (SELECT 1 FROM public.school_memberships sm JOIN public.classes c ON c.school_id = sm.school_id
                        WHERE c.id = announcements.class_id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
             OR EXISTS (SELECT 1 FROM public.class_enrollments ce WHERE ce.class_id = announcements.class_id AND ce.student_id = auth.uid())
            ))
    );
CREATE POLICY announcements_insert_policy ON public.announcements FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid() AND (
            (SELECT public.is_role('admin'))
            OR (audience = 'school' AND school_id IS NOT NULL
                AND EXISTS (SELECT 1 FROM public.school_memberships sm WHERE sm.school_id = announcements.school_id AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active'))
            OR (audience = 'class' AND class_id IS NOT NULL
                AND EXISTS (SELECT 1 FROM public.classes c WHERE c.id = announcements.class_id AND c.teacher_id = auth.uid()))
            OR (audience = 'public' AND (SELECT public.is_role('admin')))
        )
    );
