-- Migration: auto-create student_progress rows for students
-- Audit P0-2 (docs/audit/STUDENT_APP_AUDIT_2026-08-17.md): nothing ever created
-- student_progress rows for real signups (handle_new_user only inserts
-- profiles), so every gamification write (XP / gems / streak / hearts / shop)
-- silently no-oped — they UPDATE a row that never exists.

CREATE OR REPLACE FUNCTION public.handle_new_student_progress()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.student_progress (student_id)
    VALUES (NEW.id)
    ON CONFLICT (student_id) DO NOTHING;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'student_progress creation failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_profile_created_progress ON public.profiles;
CREATE TRIGGER on_profile_created_progress
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    WHEN (NEW.role = 'student')
    EXECUTE FUNCTION public.handle_new_student_progress();

-- Backfill: existing student profiles that never got a progress row.
INSERT INTO public.student_progress (student_id)
SELECT p.id
FROM public.profiles p
WHERE p.role = 'student'
  AND NOT EXISTS (
    SELECT 1 FROM public.student_progress sp WHERE sp.student_id = p.id
  );
