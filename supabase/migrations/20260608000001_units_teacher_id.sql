ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_units_teacher_id ON public.units(teacher_id);

UPDATE public.units u
SET teacher_id = p.id
FROM public.profiles p
WHERE u.teacher_id IS NULL
  AND p.role IN ('teacher', 'admin')
  AND NOT EXISTS (
    SELECT 1 FROM public.units u2 WHERE u2.teacher_id = p.id LIMIT 1
  );
