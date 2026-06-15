UPDATE public.srs_items
SET student_id = NULL
WHERE student_id = 'unit_template';

ALTER TABLE public.srs_items ALTER COLUMN student_id DROP NOT NULL;
