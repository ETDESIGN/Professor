-- =====================================================================
-- 20260715000006 — announcements
-- Adds a broadcast channel (the existing `messages` table is 1:1 only).
-- Audience can be a school (manager/active members), a class (teacher +
-- enrolled + school manager), or public (admin). Fully additive.
-- =====================================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'announcement_audience') THEN
        CREATE TYPE public.announcement_audience AS ENUM ('school','class','public');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.announcements (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id  UUID REFERENCES public.schools(id) ON DELETE CASCADE,
    class_id   UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    author_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    audience   public.announcement_audience NOT NULL DEFAULT 'class',
    title      TEXT,
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ( (audience = 'school' AND school_id IS NOT NULL)
         OR (audience = 'class'  AND class_id  IS NOT NULL)
         OR audience = 'public' )
);
CREATE INDEX IF NOT EXISTS idx_announcements_school  ON public.announcements(school_id) WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_class   ON public.announcements(class_id)  WHERE class_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_created ON public.announcements(created_at DESC);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements_select_policy" ON public.announcements;
CREATE POLICY "announcements_select_policy"
    ON public.announcements FOR SELECT TO authenticated
    USING (
        (SELECT public.is_role('admin'))
        OR author_id = auth.uid()
        OR audience = 'public'
        OR (audience = 'school' AND school_id IS NOT NULL AND (
                public.is_school_manager(school_id)
             OR EXISTS (SELECT 1 FROM public.school_memberships sm
                        WHERE sm.school_id = announcements.school_id
                          AND sm.user_id = auth.uid() AND sm.status = 'active')
            ))
        OR (audience = 'class' AND class_id IS NOT NULL AND (
                EXISTS (SELECT 1 FROM public.classes c
                        WHERE c.id = announcements.class_id AND c.teacher_id = auth.uid())
             OR public.is_school_manager((SELECT c.school_id FROM public.classes c WHERE c.id = announcements.class_id))
             OR EXISTS (SELECT 1 FROM public.class_enrollments ce
                        WHERE ce.class_id = announcements.class_id AND ce.student_id = auth.uid())
            ))
    );

DROP POLICY IF EXISTS "announcements_insert_policy" ON public.announcements;
CREATE POLICY "announcements_insert_policy"
    ON public.announcements FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid() AND (
            (SELECT public.is_role('admin'))
            OR (audience = 'school' AND school_id IS NOT NULL AND public.is_school_manager(school_id))
            OR (audience = 'class' AND class_id IS NOT NULL
                AND EXISTS (SELECT 1 FROM public.classes c
                            WHERE c.id = announcements.class_id AND c.teacher_id = auth.uid()))
            OR (audience = 'public' AND (SELECT public.is_role('admin')))
        )
    );

DROP POLICY IF EXISTS "announcements_update_policy" ON public.announcements;
CREATE POLICY "announcements_update_policy"
    ON public.announcements FOR UPDATE TO authenticated
    USING ( author_id = auth.uid() OR (SELECT public.is_role('admin')) )
    WITH CHECK ( author_id = auth.uid() OR (SELECT public.is_role('admin')) );

DROP POLICY IF EXISTS "announcements_delete_policy" ON public.announcements;
CREATE POLICY "announcements_delete_policy"
    ON public.announcements FOR DELETE TO authenticated
    USING ( author_id = auth.uid() OR (SELECT public.is_role('admin')) );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated, service_role;
GRANT USAGE ON TYPE public.announcement_audience TO authenticated;
