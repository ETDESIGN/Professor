-- ============================================
-- Phase 0.3: Reconcile student_id TEXT → UUID
-- Cleans up mock data and converts TEXT columns to proper UUID with FKs
-- ============================================

-- Step 1: Delete mock data that cannot be cast to UUID
DELETE FROM public.srs_items
    WHERE student_id NOT IN (
        SELECT id::text FROM public.profiles WHERE id IS NOT NULL
    )
    AND student_id != 'unit_template';

DELETE FROM public.student_progress
    WHERE student_id NOT IN (
        SELECT id::text FROM public.profiles WHERE id IS NOT NULL
    );

DELETE FROM public.students
    WHERE id NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

-- Step 2: Drop policies and view that reference student_id before altering type
DROP POLICY IF EXISTS "student_progress_select_policy" ON public.student_progress;
DROP POLICY IF EXISTS "student_progress_insert_policy" ON public.student_progress;
DROP POLICY IF EXISTS "student_progress_update_policy" ON public.student_progress;
DROP POLICY IF EXISTS "student_progress_delete_policy" ON public.student_progress;

DROP POLICY IF EXISTS "srs_items_select_policy" ON public.srs_items;
DROP POLICY IF EXISTS "srs_items_insert_policy" ON public.srs_items;
DROP POLICY IF EXISTS "srs_items_update_policy" ON public.srs_items;
DROP POLICY IF EXISTS "srs_items_delete_policy" ON public.srs_items;

DROP VIEW IF EXISTS public.teacher_students_view;

-- Step 3: Convert student_progress.student_id TEXT → UUID
ALTER TABLE public.student_progress
    ALTER COLUMN student_id TYPE UUID USING student_id::uuid;

ALTER TABLE public.student_progress
    ADD CONSTRAINT fk_student_progress_profile
    FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Step 4: Convert srs_items.student_id TEXT → UUID (nullable for templates)
UPDATE public.srs_items
    SET student_id = NULL
    WHERE student_id IS NOT NULL
    AND student_id NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

ALTER TABLE public.srs_items
    ALTER COLUMN student_id TYPE UUID USING student_id::uuid;

ALTER TABLE public.srs_items
    ADD CONSTRAINT fk_srs_items_profile
    FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Step 5: Convert students.id TEXT → UUID
ALTER TABLE public.students ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.students
    ALTER COLUMN id TYPE UUID USING id::uuid;
ALTER TABLE public.students ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Step 6: Drop old helper function
DROP FUNCTION IF EXISTS public.get_user_role();

-- Step 7: Recreate policies with UUID comparisons (no ::text casts)
CREATE POLICY "student_progress_select_policy"
    ON public.student_progress FOR SELECT
    USING (
        student_id = auth.uid()
        OR public.is_teacher_or_admin()
    );

CREATE POLICY "student_progress_insert_policy"
    ON public.student_progress FOR INSERT
    WITH CHECK (
        student_id = auth.uid()
        OR public.is_teacher_or_admin()
    );

CREATE POLICY "student_progress_update_policy"
    ON public.student_progress FOR UPDATE
    USING (
        student_id = auth.uid()
        OR public.is_teacher_or_admin()
    )
    WITH CHECK (
        student_id = auth.uid()
        OR public.is_teacher_or_admin()
    );

CREATE POLICY "student_progress_delete_policy"
    ON public.student_progress FOR DELETE
    USING (public.is_teacher_or_admin());

CREATE POLICY "srs_items_select_policy"
    ON public.srs_items FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "srs_items_insert_policy"
    ON public.srs_items FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "srs_items_update_policy"
    ON public.srs_items FOR UPDATE
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "srs_items_delete_policy"
    ON public.srs_items FOR DELETE
    USING (
        student_id = auth.uid()
        OR public.is_teacher_or_admin()
    );

-- Step 8: Recreate teacher_students_view without ::text cast
CREATE OR REPLACE VIEW public.teacher_students_view AS
SELECT
    c.id as class_id,
    c.name as class_name,
    c.teacher_id,
    p.id as student_id,
    p.email as student_email,
    p.full_name as student_name,
    p.avatar_url as student_avatar,
    sp.xp,
    sp.streak,
    sp.current_unit_id
FROM public.classes c
JOIN public.class_enrollments ce ON c.id = ce.class_id
JOIN public.profiles p ON ce.student_id = p.id
LEFT JOIN public.student_progress sp ON p.id = sp.student_id
WHERE c.teacher_id = auth.uid() OR auth.uid() IN (
    SELECT teacher_id FROM public.classes WHERE id = c.id
);
