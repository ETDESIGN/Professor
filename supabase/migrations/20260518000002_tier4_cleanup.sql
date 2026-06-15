-- Tier 4: Remove orphaned database objects

-- Drop unused SECURITY DEFINER helper functions
DROP FUNCTION IF EXISTS public.get_class_assignments(UUID);
DROP FUNCTION IF EXISTS public.get_student_assignments_with_details(UUID);
DROP FUNCTION IF EXISTS public.get_unread_message_count(UUID);

-- Drop unused view (recreated twice, never queried from frontend)
DROP VIEW IF EXISTS public.teacher_students_view;

-- Drop unused columns from units table
ALTER TABLE public.units DROP COLUMN IF EXISTS draft_state;
ALTER TABLE public.units DROP COLUMN IF EXISTS image_url;
ALTER TABLE public.units DROP COLUMN IF EXISTS audio_url;

-- Consolidate is_role() function: keep only the final correct version
CREATE OR REPLACE FUNCTION public.is_role(check_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  current_role TEXT;
BEGIN
  SELECT role INTO current_role FROM public.profiles WHERE id = auth.uid();
  RETURN current_role = check_role;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;
