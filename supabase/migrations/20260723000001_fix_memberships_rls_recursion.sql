-- =====================================================================
-- 20260723000001 — fix school_memberships RLS infinite recursion
--
-- Root cause: 20260720000004 inlined is_school_manager() as a subquery on
-- school_memberships INSIDE school_memberships policies → self-referential
-- RLS → "infinite recursion detected in policy for relation school_memberships".
-- That cascaded to every query touching classes or joining memberships
-- (class create/list, roster load, parent links, points ledger, etc.).
--
-- Fix: restore the 20260720000002 pattern — SECURITY DEFINER helpers that
-- accept auth.uid() as a parameter (reliable in policy context) and bypass
-- RLS on school_memberships. Never subquery the protected table from its
-- own policy.
-- =====================================================================

-- ---------- schools ----------
DROP POLICY IF EXISTS schools_select_policy ON public.schools;
DROP POLICY IF EXISTS schools_update_policy ON public.schools;

CREATE POLICY schools_select_policy ON public.schools FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR owner_id = auth.uid()
        OR public.is_school_manager(schools.id, auth.uid())
        OR EXISTS (SELECT 1 FROM public.school_memberships sm
                   WHERE sm.school_id = schools.id
                     AND sm.user_id = auth.uid() AND sm.status = 'active')
    );
CREATE POLICY schools_update_policy ON public.schools FOR UPDATE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR public.is_school_manager(schools.id, auth.uid())
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR public.is_school_manager(schools.id, auth.uid())
    );

-- ---------- school_memberships (no self-subquery) ----------
DROP POLICY IF EXISTS memberships_select_policy ON public.school_memberships;
DROP POLICY IF EXISTS memberships_insert_policy ON public.school_memberships;
DROP POLICY IF EXISTS memberships_update_policy ON public.school_memberships;
DROP POLICY IF EXISTS memberships_delete_policy ON public.school_memberships;

CREATE POLICY memberships_select_policy ON public.school_memberships FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR public.is_school_manager(school_memberships.school_id, auth.uid())
    );
CREATE POLICY memberships_insert_policy ON public.school_memberships FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR (public.is_school_manager(school_memberships.school_id, auth.uid())
            AND role = 'teacher' AND status = 'pending')
        OR (user_id = auth.uid() AND role = 'teacher' AND status = 'pending')
    );
CREATE POLICY memberships_update_policy ON public.school_memberships FOR UPDATE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR public.is_school_manager(school_memberships.school_id, auth.uid())
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR public.is_school_manager(school_memberships.school_id, auth.uid())
    );
CREATE POLICY memberships_delete_policy ON public.school_memberships FOR DELETE TO authenticated
    USING (
        (user_id = auth.uid() AND status = 'pending')
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR public.is_school_manager(school_memberships.school_id, auth.uid())
    );

-- ---------- classes (manager) ----------
DROP POLICY IF EXISTS managers_select_classes ON public.classes;
DROP POLICY IF EXISTS managers_insert_classes ON public.classes;
DROP POLICY IF EXISTS managers_update_classes ON public.classes;
DROP POLICY IF EXISTS managers_delete_classes ON public.classes;

CREATE POLICY managers_select_classes ON public.classes FOR SELECT TO authenticated
    USING ( school_id IS NOT NULL AND public.is_school_manager(school_id, auth.uid()) );
CREATE POLICY managers_insert_classes ON public.classes FOR INSERT TO authenticated
    WITH CHECK ( school_id IS NOT NULL AND public.is_school_manager(school_id, auth.uid()) );
CREATE POLICY managers_update_classes ON public.classes FOR UPDATE TO authenticated
    USING ( school_id IS NOT NULL AND public.is_school_manager(school_id, auth.uid()) )
    WITH CHECK ( school_id IS NOT NULL AND public.is_school_manager(school_id, auth.uid()) );
CREATE POLICY managers_delete_classes ON public.classes FOR DELETE TO authenticated
    USING ( school_id IS NOT NULL AND public.is_school_manager(school_id, auth.uid()) );

-- ---------- roster_students ----------
DROP POLICY IF EXISTS roster_students_select_policy ON public.roster_students;
DROP POLICY IF EXISTS roster_students_insert_policy ON public.roster_students;
DROP POLICY IF EXISTS roster_students_update_policy ON public.roster_students;
DROP POLICY IF EXISTS roster_students_delete_policy ON public.roster_students;

CREATE POLICY roster_students_select_policy ON public.roster_students FOR SELECT TO authenticated
    USING ( public.can_manage_roster_student(roster_students.id, auth.uid()) );
CREATE POLICY roster_students_insert_policy ON public.roster_students FOR INSERT TO authenticated
    WITH CHECK ( public.can_manage_class(roster_students.class_id, auth.uid()) );
CREATE POLICY roster_students_update_policy ON public.roster_students FOR UPDATE TO authenticated
    USING ( public.can_manage_roster_student(roster_students.id, auth.uid()) )
    WITH CHECK ( public.can_manage_class(roster_students.class_id, auth.uid()) );
CREATE POLICY roster_students_delete_policy ON public.roster_students FOR DELETE TO authenticated
    USING ( public.can_manage_roster_student(roster_students.id, auth.uid()) );

-- ---------- parent_roster_links ----------
DROP POLICY IF EXISTS parent_roster_links_select_policy ON public.parent_roster_links;
DROP POLICY IF EXISTS parent_roster_links_update_policy ON public.parent_roster_links;
DROP POLICY IF EXISTS parent_roster_links_delete_policy ON public.parent_roster_links;

CREATE POLICY parent_roster_links_select_policy ON public.parent_roster_links FOR SELECT TO authenticated
    USING (
        parent_id = auth.uid()
        OR public.can_manage_roster_student(parent_roster_links.roster_student_id, auth.uid())
    );
CREATE POLICY parent_roster_links_update_policy ON public.parent_roster_links FOR UPDATE TO authenticated
    USING ( public.can_manage_roster_student(parent_roster_links.roster_student_id, auth.uid()) )
    WITH CHECK ( public.can_manage_roster_student(parent_roster_links.roster_student_id, auth.uid()) );
CREATE POLICY parent_roster_links_delete_policy ON public.parent_roster_links FOR DELETE TO authenticated
    USING (
        (parent_id = auth.uid() AND status = 'pending')
        OR public.can_manage_roster_student(parent_roster_links.roster_student_id, auth.uid())
    );

-- ---------- announcements ----------
DROP POLICY IF EXISTS announcements_select_policy ON public.announcements;
DROP POLICY IF EXISTS announcements_insert_policy ON public.announcements;

CREATE POLICY announcements_select_policy ON public.announcements FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR author_id = auth.uid()
        OR audience = 'public'
        OR (audience = 'school' AND school_id IS NOT NULL AND (
                public.is_school_manager(school_id, auth.uid())
             OR EXISTS (SELECT 1 FROM public.school_memberships sm
                        WHERE sm.school_id = announcements.school_id
                          AND sm.user_id = auth.uid() AND sm.status = 'active')
            ))
        OR (audience = 'class' AND class_id IS NOT NULL AND (
                EXISTS (SELECT 1 FROM public.classes c
                        WHERE c.id = announcements.class_id AND c.teacher_id = auth.uid())
             OR public.is_school_manager(
                    (SELECT c.school_id FROM public.classes c WHERE c.id = announcements.class_id),
                    auth.uid())
             OR EXISTS (SELECT 1 FROM public.class_enrollments ce
                        WHERE ce.class_id = announcements.class_id AND ce.student_id = auth.uid())
            ))
    );
CREATE POLICY announcements_insert_policy ON public.announcements FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid() AND (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
            OR (audience = 'school' AND school_id IS NOT NULL AND public.is_school_manager(school_id, auth.uid()))
            OR (audience = 'class' AND class_id IS NOT NULL
                AND EXISTS (SELECT 1 FROM public.classes c
                            WHERE c.id = announcements.class_id AND c.teacher_id = auth.uid()))
            OR (audience = 'public'
                AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

-- ---------- point_transactions (manager branch via helper, not inline join) ----------
DROP POLICY IF EXISTS point_transactions_select_policy ON public.point_transactions;
DROP POLICY IF EXISTS point_transactions_insert_policy ON public.point_transactions;

CREATE POLICY point_transactions_select_policy ON public.point_transactions FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR EXISTS (SELECT 1 FROM public.classes c
                   WHERE c.id = point_transactions.class_id AND c.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.classes c
                   WHERE c.id = point_transactions.class_id AND c.school_id IS NOT NULL
                     AND public.is_school_manager(c.school_id, auth.uid()))
    );

CREATE POLICY point_transactions_insert_policy ON public.point_transactions FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR EXISTS (SELECT 1 FROM public.roster_students rs JOIN public.classes c ON c.id = rs.class_id
                   WHERE rs.id = point_transactions.roster_id AND c.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.roster_students rs JOIN public.classes c ON c.id = rs.class_id
                   WHERE rs.id = point_transactions.roster_id AND c.school_id IS NOT NULL
                     AND public.is_school_manager(c.school_id, auth.uid()))
    );
