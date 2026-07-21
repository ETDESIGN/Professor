-- =====================================================================
-- 20260720000002 — auth.uid() in SECURITY DEFINER policy helpers (RLS fix)
--
-- Root cause: auth.uid() returns NULL inside a SECURITY DEFINER function
-- when that function is invoked from an RLS policy (it is only reliable in
-- the policy expression itself). is_role() worked because it reads
-- app_metadata.role from the JWT, but is_school_manager() / can_manage_class()
-- / can_manage_roster_student() used auth.uid() internally -> always false
-- from RLS -> e.g. "new row violates row-level security policy for roster_students".
--
-- Fix (Supabase-recommended pattern): the helpers take the user id as a
-- parameter; every policy passes auth.uid() explicitly.
-- =====================================================================

-- ---- 1. Drop affected policies (so they don't reference the old signatures) ----
DROP POLICY IF EXISTS schools_select_policy            ON public.schools;
DROP POLICY IF EXISTS schools_update_policy            ON public.schools;
DROP POLICY IF EXISTS memberships_select_policy        ON public.school_memberships;
DROP POLICY IF EXISTS memberships_insert_policy        ON public.school_memberships;
DROP POLICY IF EXISTS memberships_update_policy        ON public.school_memberships;
DROP POLICY IF EXISTS memberships_delete_policy        ON public.school_memberships;

DROP POLICY IF EXISTS managers_select_classes          ON public.classes;
DROP POLICY IF EXISTS managers_insert_classes          ON public.classes;
DROP POLICY IF EXISTS managers_update_classes          ON public.classes;
DROP POLICY IF EXISTS managers_delete_classes          ON public.classes;

DROP POLICY IF EXISTS roster_students_select_policy    ON public.roster_students;
DROP POLICY IF EXISTS roster_students_insert_policy    ON public.roster_students;
DROP POLICY IF EXISTS roster_students_update_policy    ON public.roster_students;
DROP POLICY IF EXISTS roster_students_delete_policy    ON public.roster_students;

DROP POLICY IF EXISTS parent_roster_links_select_policy  ON public.parent_roster_links;
DROP POLICY IF EXISTS parent_roster_links_update_policy  ON public.parent_roster_links;
DROP POLICY IF EXISTS parent_roster_links_delete_policy  ON public.parent_roster_links;

DROP POLICY IF EXISTS announcements_select_policy      ON public.announcements;
DROP POLICY IF EXISTS announcements_insert_policy      ON public.announcements;

-- ---- 2. Replace helpers with auth.uid()-as-parameter versions ----
DROP FUNCTION IF EXISTS public.is_school_manager(uuid);
DROP FUNCTION IF EXISTS public.can_manage_class(uuid);
DROP FUNCTION IF EXISTS public.can_manage_roster_student(uuid);

CREATE FUNCTION public.is_school_manager(school_uuid UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (SELECT public.is_role('admin'))
        OR EXISTS (
            SELECT 1 FROM public.school_memberships
            WHERE school_id = school_uuid
              AND user_id   = p_user
              AND role      = 'manager'
              AND status    = 'active'
        )
$$;

CREATE FUNCTION public.can_manage_class(p_class UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.classes c
                   WHERE c.id = p_class AND c.teacher_id = p_user)
        OR EXISTS (SELECT 1 FROM public.classes c
                   JOIN public.school_memberships sm ON sm.school_id = c.school_id
                   WHERE c.id = p_class AND c.school_id IS NOT NULL
                     AND sm.user_id = p_user AND sm.role = 'manager' AND sm.status = 'active')
$$;

CREATE FUNCTION public.can_manage_roster_student(p_id UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (SELECT public.is_role('admin'))
        OR EXISTS (SELECT 1 FROM public.roster_students rs
                   JOIN public.classes c ON c.id = rs.class_id
                   WHERE rs.id = p_id AND c.teacher_id = p_user)
        OR EXISTS (SELECT 1 FROM public.roster_students rs
                   JOIN public.classes c ON c.id = rs.class_id
                   JOIN public.school_memberships sm ON sm.school_id = c.school_id
                   WHERE rs.id = p_id AND c.school_id IS NOT NULL
                     AND sm.user_id = p_user AND sm.role = 'manager' AND sm.status = 'active')
$$;

GRANT EXECUTE ON FUNCTION public.is_school_manager(UUID, UUID)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_class(UUID, UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_roster_student(UUID, UUID) TO authenticated;

-- ---- 3. Recreate policies, passing auth.uid() explicitly ----

-- schools
CREATE POLICY schools_select_policy
    ON public.schools FOR SELECT TO authenticated
    USING (
        (SELECT public.is_role('admin'))
        OR owner_id = auth.uid()
        OR public.is_school_manager(schools.id, auth.uid())
        OR EXISTS (SELECT 1 FROM public.school_memberships sm
                   WHERE sm.school_id = schools.id
                     AND sm.user_id = auth.uid() AND sm.status = 'active')
    );
CREATE POLICY schools_update_policy
    ON public.schools FOR UPDATE TO authenticated
    USING ( (SELECT public.is_role('admin')) OR public.is_school_manager(schools.id, auth.uid()) )
    WITH CHECK ( (SELECT public.is_role('admin')) OR public.is_school_manager(schools.id, auth.uid()) );

-- memberships
CREATE POLICY memberships_select_policy
    ON public.school_memberships FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR (SELECT public.is_role('admin'))
        OR public.is_school_manager(school_memberships.school_id, auth.uid())
    );
CREATE POLICY memberships_insert_policy
    ON public.school_memberships FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT public.is_role('admin'))
        OR (public.is_school_manager(school_memberships.school_id, auth.uid())
            AND role = 'teacher' AND status = 'pending')
        OR (user_id = auth.uid() AND role = 'teacher' AND status = 'pending')
    );
CREATE POLICY memberships_update_policy
    ON public.school_memberships FOR UPDATE TO authenticated
    USING (
        (SELECT public.is_role('admin'))
        OR public.is_school_manager(school_memberships.school_id, auth.uid())
    )
    WITH CHECK (
        (SELECT public.is_role('admin'))
        OR public.is_school_manager(school_memberships.school_id, auth.uid())
    );
CREATE POLICY memberships_delete_policy
    ON public.school_memberships FOR DELETE TO authenticated
    USING (
        (user_id = auth.uid() AND status = 'pending')
        OR (SELECT public.is_role('admin'))
        OR public.is_school_manager(school_memberships.school_id, auth.uid())
    );

-- classes (manager) — additive, additive, additive (existing teacher policies untouched)
CREATE POLICY managers_select_classes
    ON public.classes FOR SELECT TO authenticated
    USING ( school_id IS NOT NULL AND public.is_school_manager(school_id, auth.uid()) );
CREATE POLICY managers_insert_classes
    ON public.classes FOR INSERT TO authenticated
    WITH CHECK ( school_id IS NOT NULL AND public.is_school_manager(school_id, auth.uid()) );
CREATE POLICY managers_update_classes
    ON public.classes FOR UPDATE TO authenticated
    USING ( school_id IS NOT NULL AND public.is_school_manager(school_id, auth.uid()) )
    WITH CHECK ( school_id IS NOT NULL AND public.is_school_manager(school_id, auth.uid()) );
CREATE POLICY managers_delete_classes
    ON public.classes FOR DELETE TO authenticated
    USING ( school_id IS NOT NULL AND public.is_school_manager(school_id, auth.uid()) );

-- roster_students
CREATE POLICY roster_students_select_policy
    ON public.roster_students FOR SELECT TO authenticated
    USING ( public.can_manage_roster_student(roster_students.id, auth.uid()) );
CREATE POLICY roster_students_insert_policy
    ON public.roster_students FOR INSERT TO authenticated
    WITH CHECK ( public.can_manage_class(roster_students.class_id, auth.uid()) );
CREATE POLICY roster_students_update_policy
    ON public.roster_students FOR UPDATE TO authenticated
    USING ( public.can_manage_roster_student(roster_students.id, auth.uid()) )
    WITH CHECK ( public.can_manage_class(roster_students.class_id, auth.uid()) );
CREATE POLICY roster_students_delete_policy
    ON public.roster_students FOR DELETE TO authenticated
    USING ( public.can_manage_roster_student(roster_students.id, auth.uid()) );

-- parent_roster_links
CREATE POLICY parent_roster_links_select_policy
    ON public.parent_roster_links FOR SELECT TO authenticated
    USING (
        parent_id = auth.uid()
        OR public.can_manage_roster_student(parent_roster_links.roster_student_id, auth.uid())
    );
CREATE POLICY parent_roster_links_update_policy
    ON public.parent_roster_links FOR UPDATE TO authenticated
    USING ( public.can_manage_roster_student(parent_roster_links.roster_student_id, auth.uid()) )
    WITH CHECK ( public.can_manage_roster_student(parent_roster_links.roster_student_id, auth.uid()) );
CREATE POLICY parent_roster_links_delete_policy
    ON public.parent_roster_links FOR DELETE TO authenticated
    USING (
        (parent_id = auth.uid() AND status = 'pending')
        OR public.can_manage_roster_student(parent_roster_links.roster_student_id, auth.uid())
    );

-- announcements
CREATE POLICY announcements_select_policy
    ON public.announcements FOR SELECT TO authenticated
    USING (
        (SELECT public.is_role('admin'))
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
             OR public.is_school_manager((SELECT c.school_id FROM public.classes c WHERE c.id = announcements.class_id), auth.uid())
             OR EXISTS (SELECT 1 FROM public.class_enrollments ce
                        WHERE ce.class_id = announcements.class_id AND ce.student_id = auth.uid())
            ))
    );
CREATE POLICY announcements_insert_policy
    ON public.announcements FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid() AND (
            (SELECT public.is_role('admin'))
            OR (audience = 'school' AND school_id IS NOT NULL AND public.is_school_manager(school_id, auth.uid()))
            OR (audience = 'class' AND class_id IS NOT NULL
                AND EXISTS (SELECT 1 FROM public.classes c
                            WHERE c.id = announcements.class_id AND c.teacher_id = auth.uid()))
            OR (audience = 'public' AND (SELECT public.is_role('admin')))
        )
    );
