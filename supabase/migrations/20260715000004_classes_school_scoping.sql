-- =====================================================================
-- 20260715000003 — classes_school_scoping
-- Adds nullable classes.school_id (null = independent teacher) and
-- ADDITIVE manager RLS on classes (new policy names — existing teacher
-- policies are untouched, so the running app cannot be locked out).
-- Also enforces that a school class's teacher_id is an active member.
-- =====================================================================

ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_classes_school ON public.classes(school_id);

-- Integrity: when a class is tied to a school, its teacher must be an active
-- member of that school (independent classes, school_id NULL, are unaffected).
CREATE OR REPLACE FUNCTION public.validate_class_teacher_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    is_member BOOLEAN;
BEGIN
    IF NEW.school_id IS NOT NULL AND NOT (SELECT public.is_role('admin')) THEN
        SELECT EXISTS (
            SELECT 1 FROM public.school_memberships sm
            WHERE sm.school_id = NEW.school_id
              AND sm.user_id   = NEW.teacher_id
              AND sm.status    = 'active'
              AND sm.role     IN ('teacher','manager')
        ) INTO is_member;
        IF NOT is_member THEN
            RAISE EXCEPTION 'teacher_id % is not an active member of school %',
                NEW.teacher_id, NEW.school_id
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_class_teacher ON public.classes;
CREATE TRIGGER trg_validate_class_teacher
    BEFORE INSERT OR UPDATE OF teacher_id, school_id ON public.classes
    FOR EACH ROW EXECUTE FUNCTION public.validate_class_teacher_membership();

-- ---- Additive manager policies (added; not replacing teacher ones) ----
DROP POLICY IF EXISTS "managers_select_classes" ON public.classes;
CREATE POLICY "managers_select_classes"
    ON public.classes FOR SELECT TO authenticated
    USING ( school_id IS NOT NULL AND public.is_school_manager(school_id) );

DROP POLICY IF EXISTS "managers_insert_classes" ON public.classes;
CREATE POLICY "managers_insert_classes"
    ON public.classes FOR INSERT TO authenticated
    WITH CHECK ( school_id IS NOT NULL AND public.is_school_manager(school_id) );

DROP POLICY IF EXISTS "managers_update_classes" ON public.classes;
CREATE POLICY "managers_update_classes"
    ON public.classes FOR UPDATE TO authenticated
    USING ( school_id IS NOT NULL AND public.is_school_manager(school_id) )
    WITH CHECK ( school_id IS NOT NULL AND public.is_school_manager(school_id) );

DROP POLICY IF EXISTS "managers_delete_classes" ON public.classes;
CREATE POLICY "managers_delete_classes"
    ON public.classes FOR DELETE TO authenticated
    USING ( school_id IS NOT NULL AND public.is_school_manager(school_id) );
