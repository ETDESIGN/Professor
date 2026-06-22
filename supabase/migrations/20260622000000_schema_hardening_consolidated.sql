-- =====================================================================
-- Consolidated schema hardening
-- ---------------------------------------------------------------------
-- Replaces 4 never-applied, buggy migrations:
--   20260518000001_tier1_fk_constraints  (ordering bug: ALTER COLUMN TYPE
--                                         while views depended on it)
--   20260518000002_tier4_cleanup          (dropped the view tier1 needed)
--   20260608000000_srs_template_nullify   (safe, folded in)
--   20260608000001_units_teacher_id       (idempotent, folded in)
--
-- This version is defensive so it CANNOT fail mid-way on production data:
--   * drops dependent views BEFORE altering column types, recreates the
--     analytics view (DataService.ts consumes it) afterwards;
--   * NULLs/ filters any non-UUID values before the TEXT -> UUID casts;
--   * adds FK / NOT NULL constraints only when the data is already clean
--     (guarded DO blocks) -- never deletes rows.
--
-- Intentionally NOT done: tier4's is_role() TEXT-signature rewrite. The live
-- is_role(user_role) version works and the rewrite risked breaking every RLS
-- policy that calls is_role('teacher'). Left unchanged.
-- =====================================================================

-- ---- 1. SRS items: ensure student_id is nullable (templates use NULL) ----
-- NOTE: on live, srs_items.student_id is already UUID + nullable + FK to
-- profiles, so this is a harmless no-op. (The legacy 'unit_template' text
-- sentinel cannot exist on a UUID column, so no nullify UPDATE is needed.)
ALTER TABLE public.srs_items ALTER COLUMN student_id DROP NOT NULL;

-- ---- 2. units.teacher_id (idempotent; column already exists on live) ----
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_units_teacher_id ON public.units(teacher_id);

-- ---- 3. student_progress type hardening ----
-- Drop the two views that depend on student_progress columns BEFORE altering
-- their types (Postgres otherwise refuses with SQLSTATE 0A000).
DROP VIEW IF EXISTS public.teacher_students_view;  -- unused by client
DROP VIEW IF EXISTS public.class_analytics_view;   -- recreated below

-- Clean any non-UUID current_unit_id so the cast cannot fail.
UPDATE public.student_progress
  SET current_unit_id = NULL
  WHERE current_unit_id IS NOT NULL
    AND current_unit_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Remove any non-UUID elements from completed_unit_ids arrays.
UPDATE public.student_progress sp
  SET completed_unit_ids = ARRAY(
    SELECT elem FROM unnest(sp.completed_unit_ids) AS elem
    WHERE elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  WHERE sp.completed_unit_ids IS NOT NULL;

ALTER TABLE public.student_progress
  ALTER COLUMN current_unit_id TYPE UUID USING current_unit_id::uuid,
  ALTER COLUMN current_unit_id DROP DEFAULT;

-- completed_unit_ids has a DEFAULT '{}'::text[] that can't auto-cast to uuid[],
-- so drop the default, change the type, then restore it as an empty uuid[].
ALTER TABLE public.student_progress ALTER COLUMN completed_unit_ids DROP DEFAULT;
ALTER TABLE public.student_progress
  ALTER COLUMN completed_unit_ids TYPE UUID[] USING completed_unit_ids::uuid[];
ALTER TABLE public.student_progress ALTER COLUMN completed_unit_ids SET DEFAULT '{}'::uuid[];

-- Null out any current_unit_id that no longer references an existing unit,
-- then add the FK (valuable referential integrity).
UPDATE public.student_progress
  SET current_unit_id = NULL
  WHERE current_unit_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.units u WHERE u.id = student_progress.current_unit_id);

ALTER TABLE public.student_progress DROP CONSTRAINT IF EXISTS fk_student_progress_current_unit;
ALTER TABLE public.student_progress
  ADD CONSTRAINT fk_student_progress_current_unit
  FOREIGN KEY (current_unit_id) REFERENCES public.units(id) ON DELETE SET NULL;

-- Recreate the analytics view (definition unchanged; picks up new column types).
CREATE OR REPLACE VIEW public.class_analytics_view AS
 SELECT c.id AS class_id,
    c.teacher_id,
    count(ce.student_id) AS total_students,
    COALESCE(sum(sp.xp), 0::bigint) AS total_xp,
    round(COALESCE(avg(sp.xp), 0::numeric)) AS avg_xp_per_student,
    round(((COALESCE(avg(array_length(sp.completed_unit_ids, 1)), 0::numeric) / 10.0) * 100::numeric)) AS mastery_percent,
    LEAST(100::numeric, round((COALESCE(avg(sp.streak), 0::numeric) * 3.33))) AS engagement_percent,
    round((((count(sp.current_unit_id))::double precision / (GREATEST(count(ce.student_id), 1::bigint))::double precision) * 100::double precision)) AS completion_percent
   FROM public.classes c
   LEFT JOIN public.class_enrollments ce ON c.id = ce.class_id
   LEFT JOIN public.student_progress sp ON ce.student_id = sp.student_id
  GROUP BY c.id, c.teacher_id;

-- students.id -> profiles FK: add only if no orphan rows exist (non-destructive).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = s.id)
  ) THEN
    ALTER TABLE public.students DROP CONSTRAINT IF EXISTS fk_students_profile;
    ALTER TABLE public.students ADD CONSTRAINT fk_students_profile
      FOREIGN KEY (id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  ELSE
    RAISE NOTICE 'Skipped fk_students_profile: orphan student rows exist (clean them first).';
  END IF;
END $$;

-- billing_history.profile_id NOT NULL: set only if no NULL rows (non-destructive).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.billing_history WHERE profile_id IS NULL) THEN
    ALTER TABLE public.billing_history ALTER COLUMN profile_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'Skipped billing_history.profile_id NOT NULL: NULL rows exist.';
  END IF;
END $$;

-- ---- 4. tier4 cleanup (non-is_role parts) ----
DROP FUNCTION IF EXISTS public.get_class_assignments(UUID);
DROP FUNCTION IF EXISTS public.get_student_assignments_with_details(UUID);
DROP FUNCTION IF EXISTS public.get_unread_message_count(UUID);

-- Drop unused units columns. image_url/audio_url are no longer written
-- (GenerateLessonModal fix); draft_state was never read by the client.
ALTER TABLE public.units DROP COLUMN IF EXISTS draft_state;
ALTER TABLE public.units DROP COLUMN IF EXISTS image_url;
ALTER TABLE public.units DROP COLUMN IF EXISTS audio_url;
