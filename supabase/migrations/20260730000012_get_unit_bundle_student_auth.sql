-- =====================================================================
-- get_unit_bundle: allow enrolled students to read the bundle
-- ---------------------------------------------------------------------
-- C.4 student read path: the student app (SoloLessonPlayer/ReadingReader)
-- attaches this bundle to activeUnit so the normalizers read relational
-- content. Previously the auth check only allowed the owner/admin, so a
-- student's call was rejected and the student silently fell back to the
-- manifest. Students may read a unit when its teacher owns one of the
-- student's enrolled classes — the SAME rule the units SELECT RLS policy
-- uses (teacher_id = ANY(student_class_teacher_ids())). This mirrors that,
-- so the bundle's visibility matches the unit's own visibility.
-- (Re-states the vocabulary_items field added in 20260730000011.)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_unit_bundle(p_unit_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher UUID;
  v_found   BOOLEAN;
  v_bundle  JSONB;
BEGIN
  SELECT u.teacher_id INTO v_teacher FROM public.units u WHERE u.id = p_unit_id;
  v_found := FOUND;
  IF NOT v_found THEN
    RAISE EXCEPTION 'Unit not found';
  END IF;

  -- Authorization: owner (teacher), teacher/admin, OR an enrolled student
  -- (mirrors the units SELECT RLS policy exactly).
  IF v_teacher IS NOT NULL AND v_teacher IS DISTINCT FROM auth.uid() AND NOT public.is_teacher_or_admin() THEN
    IF NOT (public.is_role('student') AND v_teacher = ANY(public.student_class_teacher_ids())) THEN
      RAISE EXCEPTION 'Not authorized to read this unit';
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'unit_id',       p_unit_id,
    'objectives',    COALESCE((SELECT jsonb_agg(to_jsonb(o))  FROM public.objectives o  WHERE o.unit_id  = p_unit_id), '[]'::jsonb),
    'pool_items',    COALESCE((SELECT jsonb_agg(to_jsonb(pi)) FROM public.pool_items pi WHERE pi.unit_id = p_unit_id), '[]'::jsonb),
    'vocabulary_items', COALESCE((SELECT jsonb_agg(to_jsonb(vi) ORDER BY vi.order_index) FROM public.vocabulary_items vi WHERE vi.unit_id = p_unit_id), '[]'::jsonb),
    'story_pages',   COALESCE((SELECT jsonb_agg(to_jsonb(sp) ORDER BY sp.page_number) FROM public.story_pages sp WHERE sp.unit_id = p_unit_id), '[]'::jsonb),
    'story_questions', COALESCE((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.order_index) FROM public.story_comprehension_questions q WHERE q.unit_id = p_unit_id), '[]'::jsonb),
    'dialogue_lines', COALESCE((SELECT jsonb_agg(to_jsonb(dl) ORDER BY dl.order_index) FROM public.dialogue_lines dl WHERE dl.unit_id = p_unit_id), '[]'::jsonb),
    'grammar_rules', COALESCE((SELECT jsonb_agg(to_jsonb(gr) ORDER BY gr.order_index) FROM public.grammar_rules gr WHERE gr.unit_id = p_unit_id), '[]'::jsonb),
    'characters',    COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.characters c JOIN public.unit_characters uc ON uc.character_id = c.id WHERE uc.unit_id = p_unit_id), '[]'::jsonb)
  ) INTO v_bundle;

  RETURN v_bundle;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_unit_bundle(UUID) TO authenticated, service_role;
