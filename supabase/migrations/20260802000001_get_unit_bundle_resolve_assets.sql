-- =====================================================================
-- get_unit_bundle: resolve asset URLs for story_pages + dialogue_lines
-- ---------------------------------------------------------------------
-- R2 fix: story_pages carry image_asset_id / audio_asset_id (FKs to
-- assets), but the bundle previously returned only the raw FK via
-- to_jsonb(sp) — never the actual URL. Consumers (BoardStoryStage,
-- ReadingReader) need the resolved public_url to render images/audio.
--
-- This migration re-creates get_unit_bundle with LEFT JOINs to assets
-- so each story_pages row also carries:
--   image_url  (= assets.public_url for image_asset_id)
--   audio_url  (= assets.public_url for audio_asset_id)
-- and each dialogue_lines row carries:
--   audio_url  (= assets.public_url for audio_asset_id)
--
-- Function signature, authorization logic, and SECURITY DEFINER are
-- unchanged from 20260730000012.
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
    'story_pages',   COALESCE((
        SELECT jsonb_agg(
          to_jsonb(sp) || jsonb_build_object(
            'image_url', ia.public_url,
            'audio_url', sa.public_url
          )
          ORDER BY sp.page_number
        )
        FROM public.story_pages sp
        LEFT JOIN public.assets ia ON ia.id = sp.image_asset_id
        LEFT JOIN public.assets sa ON sa.id = sp.audio_asset_id
        WHERE sp.unit_id = p_unit_id
      ), '[]'::jsonb),
    'story_questions', COALESCE((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.order_index) FROM public.story_comprehension_questions q WHERE q.unit_id = p_unit_id), '[]'::jsonb),
    'dialogue_lines', COALESCE((
        SELECT jsonb_agg(
          to_jsonb(dl) || jsonb_build_object(
            'audio_url', da.public_url
          )
          ORDER BY dl.order_index
        )
        FROM public.dialogue_lines dl
        LEFT JOIN public.assets da ON da.id = dl.audio_asset_id
        WHERE dl.unit_id = p_unit_id
      ), '[]'::jsonb),
    'grammar_rules', COALESCE((SELECT jsonb_agg(to_jsonb(gr) ORDER BY gr.order_index) FROM public.grammar_rules gr WHERE gr.unit_id = p_unit_id), '[]'::jsonb),
    'characters',    COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.characters c JOIN public.unit_characters uc ON uc.character_id = c.id WHERE uc.unit_id = p_unit_id), '[]'::jsonb)
  ) INTO v_bundle;

  RETURN v_bundle;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_unit_bundle(UUID) TO authenticated, service_role;
