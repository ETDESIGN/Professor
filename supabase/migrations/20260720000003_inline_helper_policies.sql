-- =====================================================================
-- 20260720000003 — inline helper-based RLS policies (auth.uid() fix)
--
-- Root cause (confirmed): auth.uid()/auth.jwt() are NULL/unreliable inside
-- SECURITY DEFINER helper functions when invoked from an RLS policy, but
-- work in the policy expression itself. So policies that delegated to
-- can_manage_class()/can_manage_roster_student() denied valid rows
-- (e.g. roster_students INSERT). Fix: inline the checks directly in the
-- policy expressions (mirrors the working class_enrollments pattern).
--
-- This migration inlines roster_students (already applied live; re-applied
-- here for the repo record) and parent_roster_links.
-- is_role('admin') is kept (it reads app_metadata from the JWT and works).
-- =====================================================================

-- ---------- roster_students ----------
DROP POLICY IF EXISTS roster_students_select_policy ON public.roster_students;
DROP POLICY IF EXISTS roster_students_insert_policy ON public.roster_students;
DROP POLICY IF EXISTS roster_students_update_policy ON public.roster_students;
DROP POLICY IF EXISTS roster_students_delete_policy ON public.roster_students;

CREATE POLICY roster_students_select_policy ON public.roster_students FOR SELECT TO authenticated
    USING (
        (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = roster_students.class_id AND c.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.classes c JOIN public.school_memberships sm ON sm.school_id = c.school_id
                   WHERE c.id = roster_students.class_id AND c.school_id IS NOT NULL
                     AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    );
CREATE POLICY roster_students_insert_policy ON public.roster_students FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = roster_students.class_id AND c.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.classes c JOIN public.school_memberships sm ON sm.school_id = c.school_id
                   WHERE c.id = roster_students.class_id AND c.school_id IS NOT NULL
                     AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    );
CREATE POLICY roster_students_update_policy ON public.roster_students FOR UPDATE TO authenticated
    USING (
        (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = roster_students.class_id AND c.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.classes c JOIN public.school_memberships sm ON sm.school_id = c.school_id
                   WHERE c.id = roster_students.class_id AND c.school_id IS NOT NULL
                     AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    )
    WITH CHECK (
        (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = roster_students.class_id AND c.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.classes c JOIN public.school_memberships sm ON sm.school_id = c.school_id
                   WHERE c.id = roster_students.class_id AND c.school_id IS NOT NULL
                     AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    );
CREATE POLICY roster_students_delete_policy ON public.roster_students FOR DELETE TO authenticated
    USING (
        (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = roster_students.class_id AND c.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.classes c JOIN public.school_memberships sm ON sm.school_id = c.school_id
                   WHERE c.id = roster_students.class_id AND c.school_id IS NOT NULL
                     AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    );

-- ---------- parent_roster_links ----------
DROP POLICY IF EXISTS parent_roster_links_select_policy ON public.parent_roster_links;
DROP POLICY IF EXISTS parent_roster_links_update_policy ON public.parent_roster_links;
DROP POLICY IF EXISTS parent_roster_links_delete_policy ON public.parent_roster_links;

CREATE POLICY parent_roster_links_select_policy ON public.parent_roster_links FOR SELECT TO authenticated
    USING (
        parent_id = auth.uid()
        OR (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.roster_students rs JOIN public.classes c ON c.id = rs.class_id
                   WHERE rs.id = parent_roster_links.roster_student_id AND c.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.roster_students rs JOIN public.classes c ON c.id = rs.class_id
                   JOIN public.school_memberships sm ON sm.school_id = c.school_id
                   WHERE rs.id = parent_roster_links.roster_student_id AND c.school_id IS NOT NULL
                     AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    );
CREATE POLICY parent_roster_links_update_policy ON public.parent_roster_links FOR UPDATE TO authenticated
    USING (
        (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.roster_students rs JOIN public.classes c ON c.id = rs.class_id
                   WHERE rs.id = parent_roster_links.roster_student_id AND c.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.roster_students rs JOIN public.classes c ON c.id = rs.class_id
                   JOIN public.school_memberships sm ON sm.school_id = c.school_id
                   WHERE rs.id = parent_roster_links.roster_student_id AND c.school_id IS NOT NULL
                     AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    )
    WITH CHECK (
        (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.roster_students rs JOIN public.classes c ON c.id = rs.class_id
                   WHERE rs.id = parent_roster_links.roster_student_id AND c.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.roster_students rs JOIN public.classes c ON c.id = rs.class_id
                   JOIN public.school_memberships sm ON sm.school_id = c.school_id
                   WHERE rs.id = parent_roster_links.roster_student_id AND c.school_id IS NOT NULL
                     AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    );
CREATE POLICY parent_roster_links_delete_policy ON public.parent_roster_links FOR DELETE TO authenticated
    USING (
        (parent_id = auth.uid() AND status = 'pending')
        OR (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.roster_students rs JOIN public.classes c ON c.id = rs.class_id
                   WHERE rs.id = parent_roster_links.roster_student_id AND c.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.roster_students rs JOIN public.classes c ON c.id = rs.class_id
                   JOIN public.school_memberships sm ON sm.school_id = c.school_id
                   WHERE rs.id = parent_roster_links.roster_student_id AND c.school_id IS NOT NULL
                     AND sm.user_id = auth.uid() AND sm.role = 'manager' AND sm.status = 'active')
    );
