-- =====================================================================
-- get_unit_bundle: add vocabulary_items field
-- ---------------------------------------------------------------------
-- The read contract was incomplete: it returned objectives/pool_items/story/
-- dialogue/grammar/characters but NOT the raw vocab content, so PlanComposer
-- (and any future component needing a word's definition/image/example) fell
-- back to the manifest. Now that vocabulary_items exists (the canonical vocab
-- content row), expose it through the bundle so the RPC can fully replace the
-- manifest read path (advisor: close the debt, don't patch around it).
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
  IF v_teacher IS NOT NULL AND v_teacher IS DISTINCT FROM auth.uid() AND NOT public.is_teacher_or_admin() THEN
    RAISE EXCEPTION 'Not authorized to read this unit';
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
