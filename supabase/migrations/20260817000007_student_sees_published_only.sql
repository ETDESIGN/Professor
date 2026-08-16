-- =====================================================================
-- 20260817000007 — students only see PUBLISHED units
-- ---------------------------------------------------------------------
-- Owner report (2026-08-17): students could see every unit their class's
-- teacher created, including Drafts. Publishing = orchestrate-lesson setting
-- status='Active'; the student visibility rules never checked it. This
-- migration adds the status gate to every student read path:
--   1. units_select_policy (the home map list)
--   2. get_unit_bundle RPC (deep content fetch)
--   3. the enrollment branches on objectives / pool_items / assets /
--      srs_items templates (from 20260817000005)
-- Teacher/admin/owner branches are unchanged (teachers still see Drafts).

-- (1) units SELECT
DROP POLICY IF EXISTS "units_select_policy" ON public.units;
CREATE POLICY "units_select_policy"
  ON public.units FOR SELECT
  TO authenticated
  USING (
    public.is_role('admin')
    OR (public.is_role('teacher') AND (units.teacher_id = auth.uid() OR units.teacher_id IS NULL))
    OR (public.is_role('student') AND units.status = 'Active' AND units.teacher_id = ANY(public.student_class_teacher_ids()))
  );

-- (2) get_unit_bundle: students only for Active units
CREATE OR REPLACE FUNCTION public.get_unit_bundle(p_unit_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher UUID;
  v_status  TEXT;
  v_bundle  JSONB;
BEGIN
  SELECT u.teacher_id, u.status INTO v_teacher, v_status FROM public.units u WHERE u.id = p_unit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit not found';
  END IF;

  -- Authorization: owner (teacher), teacher/admin, OR an enrolled student
  -- (mirrors the units SELECT RLS policy — published/Active units only).
  IF v_teacher IS NOT NULL AND v_teacher IS DISTINCT FROM auth.uid() AND NOT public.is_teacher_or_admin() THEN
    IF NOT (public.is_role('student') AND v_status = 'Active' AND v_teacher = ANY(public.student_class_teacher_ids())) THEN
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

-- (3) enrollment-based exercise-content branches (from 20260817000005),
--     now restricted to published units.
DROP POLICY IF EXISTS "objectives_select_policy" ON public.objectives;
CREATE POLICY "objectives_select_policy"
    ON public.objectives FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = objectives.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
        OR EXISTS (
            SELECT 1 FROM public.units u
            WHERE u.id = objectives.unit_id
              AND u.status = 'Active'
              AND u.teacher_id = ANY (public.student_class_teacher_ids())
        )
    );

DROP POLICY IF EXISTS "pool_items_select_policy" ON public.pool_items;
CREATE POLICY "pool_items_select_policy"
    ON public.pool_items FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = pool_items.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
        OR EXISTS (
            SELECT 1 FROM public.units u
            WHERE u.id = pool_items.unit_id
              AND u.status = 'Active'
              AND u.teacher_id = ANY (public.student_class_teacher_ids())
        )
    );

DROP POLICY IF EXISTS "assets_select_policy" ON public.assets;
CREATE POLICY "assets_select_policy"
    ON public.assets FOR SELECT TO authenticated
    USING (
        owner_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = assets.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
        OR EXISTS (
            SELECT 1 FROM public.units u
            WHERE u.id = assets.unit_id
              AND u.status = 'Active'
              AND u.teacher_id = ANY (public.student_class_teacher_ids())
        )
    );

DROP POLICY IF EXISTS "srs_items_select_policy" ON public.srs_items;
CREATE POLICY "srs_items_select_policy"
    ON public.srs_items FOR SELECT TO authenticated
    USING (
        student_id = auth.uid()
        OR (
            student_id IS NULL
            AND EXISTS (
                SELECT 1 FROM public.units u
                WHERE u.id = srs_items.unit_id
                  AND u.status = 'Active'
                  AND u.teacher_id = ANY (public.student_class_teacher_ids())
            )
        )
        OR (SELECT public.is_teacher_or_admin())
    );
