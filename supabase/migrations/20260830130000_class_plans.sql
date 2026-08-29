-- =====================================================================
-- 20260830130000 — Class Plans (FIXPLAN I, doc 11 §4 / F3)
--
-- A Class Plan = a scoped slice of a unit with its own flow.
--   * class_plans — order-only classes (#6); scope = page ranges +
--     exceptions (#4); released_at = the strict student-release gate (#5);
--     content_index/flow are DERIVED (refresh RPC / generate-class-flow),
--     never hand-edited. Enrichment/flows only on teacher action (#7).
--   * classroom_sessions.class_plan_id — the live session teaches a class;
--     the board loads class_plans.flow (#8: strictly the current class).
--   * assignments.class_plan_id — homework attaches to a class.
--   * objectives.source_structure_id — precise class→objective linking
--     (stamped by generate-exercises going forward; best-effort backfill
--     here). Story/dialogue objectives are unit-level singletons
--     ('Story comprehension' / 'Dialogue practice') — they link to any
--     class whose scope contains story/dialogue content.
--   * refresh_class_plan_scope — resolves a plan's scope JSONB into its
--     content_index (pages → structures → enriched rows → objectives).
--   * get_released_objectives — the student gate: all objectives when the
--     unit has NO plans (legacy units unchanged), else the union over
--     released plans.
--   * get_unit_bundle v2 — student branch filtered to the released scope
--     when plans exist (teacher branch + plan-less units byte-identical).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.class_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    scope JSONB NOT NULL DEFAULT '{}'::jsonb,
    content_index JSONB,
    content_index_stale_at TIMESTAMPTZ,
    flow JSONB,
    flow_generated_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_plans_unit ON public.class_plans (unit_id, order_index);
CREATE INDEX IF NOT EXISTS idx_class_plans_teacher ON public.class_plans (teacher_id);

DROP TRIGGER IF EXISTS trg_class_plans_updated_at ON public.class_plans;
CREATE TRIGGER trg_class_plans_updated_at
    BEFORE UPDATE ON public.class_plans
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.class_plans ENABLE ROW LEVEL SECURITY;

-- Students have NO direct table access: they read released scope only via
-- get_released_objectives / the filtered get_unit_bundle (SECURITY DEFINER).
DROP POLICY IF EXISTS class_plans_select ON public.class_plans;
CREATE POLICY class_plans_select ON public.class_plans
    FOR SELECT TO authenticated
    USING (teacher_id = auth.uid() OR public.is_teacher_or_admin());

DROP POLICY IF EXISTS class_plans_insert ON public.class_plans;
CREATE POLICY class_plans_insert ON public.class_plans
    FOR INSERT TO authenticated
    WITH CHECK (teacher_id = auth.uid() OR public.is_teacher_or_admin());

DROP POLICY IF EXISTS class_plans_update ON public.class_plans;
CREATE POLICY class_plans_update ON public.class_plans
    FOR UPDATE TO authenticated
    USING (teacher_id = auth.uid() OR public.is_teacher_or_admin())
    WITH CHECK (teacher_id = auth.uid() OR public.is_teacher_or_admin());

DROP POLICY IF EXISTS class_plans_delete ON public.class_plans;
CREATE POLICY class_plans_delete ON public.class_plans
    FOR DELETE TO authenticated
    USING (teacher_id = auth.uid() OR public.is_teacher_or_admin());

-- ── Cross-references ──────────────────────────────────────────────────
ALTER TABLE public.classroom_sessions
    ADD COLUMN IF NOT EXISTS class_plan_id UUID REFERENCES public.class_plans(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_classroom_sessions_class_plan ON public.classroom_sessions (class_plan_id);

ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS class_plan_id UUID REFERENCES public.class_plans(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_class_plan ON public.assignments (class_plan_id);

-- ── Objective provenance ──────────────────────────────────────────────
ALTER TABLE public.objectives
    ADD COLUMN IF NOT EXISTS source_structure_id UUID REFERENCES public.page_structures(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_objectives_source_structure ON public.objectives (source_structure_id);

-- Best-effort backfill for existing rows (generate-exercises stamps new
-- ones going forward). Multiple same-word matches resolve arbitrarily —
-- acceptable: same unit, same word in practice.
UPDATE public.objectives o
SET source_structure_id = v.source_structure_id
FROM public.vocabulary_items v
WHERE o.type = 'vocabulary'
  AND o.source_structure_id IS NULL
  AND v.unit_id = o.unit_id
  AND v.source_structure_id IS NOT NULL
  AND lower(trim(v.word)) = lower(trim(o.target_value));

UPDATE public.objectives o
SET source_structure_id = g.source_structure_id
FROM public.grammar_rules g
WHERE o.type = 'grammar'
  AND o.source_structure_id IS NULL
  AND g.unit_id = o.unit_id
  AND g.source_structure_id IS NOT NULL
  AND lower(trim(g.rule)) = lower(trim(o.target_value));

-- ── Stale markers: a unit update (re-enrich / re-publish / flow edit)
--    invalidates its plans' derived data. Markers only — NO background
--    regeneration (#7: enrich/generate only on teacher action). ─────────
CREATE OR REPLACE FUNCTION public.mark_class_plans_stale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.class_plans
    SET content_index_stale_at = NOW()
    WHERE unit_id = NEW.id
      AND content_index_stale_at IS NULL;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_units_mark_class_plans_stale ON public.units;
CREATE TRIGGER trg_units_mark_class_plans_stale
    AFTER UPDATE ON public.units
    FOR EACH ROW EXECUTE FUNCTION public.mark_class_plans_stale();

-- ---------------------------------------------------------------------
-- class_plans_released_scope(unit) — internal helper (not granted):
-- the union of released content over a unit's plans. has_plans=false
-- means "unit teaches as one block" (legacy behavior everywhere).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.class_plans_released_scope(p_unit_id uuid)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_plan_count FROM public.class_plans WHERE unit_id = p_unit_id;
  IF v_plan_count = 0 THEN
    RETURN jsonb_build_object('has_plans', false);
  END IF;

  RETURN jsonb_build_object(
    'has_plans', true,
    'objective_ids', to_jsonb(COALESCE((
      SELECT array_agg(DISTINCT (je.value)::uuid)
      FROM public.class_plans cp,
           LATERAL jsonb_array_elements_text(COALESCE(cp.content_index->'objective_ids', '[]'::jsonb)) je
      WHERE cp.unit_id = p_unit_id AND cp.released_at IS NOT NULL
    ), '{}')),
    'structure_ids', to_jsonb(COALESCE((
      SELECT array_agg(DISTINCT (je.value)::uuid)
      FROM public.class_plans cp,
           LATERAL jsonb_array_elements_text(COALESCE(cp.content_index->'structure_ids', '[]'::jsonb)) je
      WHERE cp.unit_id = p_unit_id AND cp.released_at IS NOT NULL
    ), '{}')),
    'vocab_ids', to_jsonb(COALESCE((
      SELECT array_agg(DISTINCT (je.value)::uuid)
      FROM public.class_plans cp,
           LATERAL jsonb_array_elements_text(COALESCE(cp.content_index->'vocab_ids', '[]'::jsonb)) je
      WHERE cp.unit_id = p_unit_id AND cp.released_at IS NOT NULL
    ), '{}')),
    'grammar_ids', to_jsonb(COALESCE((
      SELECT array_agg(DISTINCT (je.value)::uuid)
      FROM public.class_plans cp,
           LATERAL jsonb_array_elements_text(COALESCE(cp.content_index->'grammar_ids', '[]'::jsonb)) je
      WHERE cp.unit_id = p_unit_id AND cp.released_at IS NOT NULL
    ), '{}')),
    'story_ids', to_jsonb(COALESCE((
      SELECT array_agg(DISTINCT (je.value)::uuid)
      FROM public.class_plans cp,
           LATERAL jsonb_array_elements_text(COALESCE(cp.content_index->'story_ids', '[]'::jsonb)) je
      WHERE cp.unit_id = p_unit_id AND cp.released_at IS NOT NULL
    ), '{}')),
    'dialogue_ids', to_jsonb(COALESCE((
      SELECT array_agg(DISTINCT (je.value)::uuid)
      FROM public.class_plans cp,
           LATERAL jsonb_array_elements_text(COALESCE(cp.content_index->'dialogue_ids', '[]'::jsonb)) je
      WHERE cp.unit_id = p_unit_id AND cp.released_at IS NOT NULL
    ), '{}'))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.class_plans_released_scope(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------
-- refresh_class_plan_scope — resolve each plan's scope into content_index
-- (owner/teacher-admin only; idempotent; re-runnable any time).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_class_plan_scope(p_unit_id uuid, p_ids uuid[] DEFAULT NULL, p_caller uuid DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher uuid;
  v_actor uuid;
  v_unit_pages uuid[];
  v_plan RECORD;
  v_scope JSONB;
  v_ranges JSONB;
  v_r JSONB;
  v_lo INTEGER;
  v_hi INTEGER;
  v_page_ids uuid[];
  v_page_ids_extra uuid[];
  v_struct_ids uuid[];
  v_include_struct uuid[];
  v_exclude_struct uuid[];
  v_inc_ids uuid[];
  v_warnings TEXT[] := '{}';
  v_vocab JSONB;
  v_vocab_ids uuid[];
  v_words TEXT[];
  v_grammar_ids uuid[];
  v_rules TEXT[];
  v_story_ids uuid[];
  v_dialogue_ids uuid[];
  v_objective_ids uuid[];
  v_results JSONB := '[]'::jsonb;
BEGIN
  SELECT teacher_id INTO v_teacher FROM public.units WHERE id = p_unit_id AND deleted_at IS NULL;
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'Unit not found';
  END IF;
  -- Caller identity: the caller's JWT when present (client path); the
  -- trusted edge functions run under the service key (auth.uid() NULL) and
  -- pass p_caller — they have already asserted unit ownership themselves.
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    v_actor := p_caller;
  END IF;
  IF NOT (v_teacher = v_actor OR (v_actor IS NOT NULL AND public.is_teacher_or_admin())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Ordered page ids = the coordinate system for ranges.
  SELECT array_agg(id ORDER BY upload_order, id) INTO v_unit_pages
  FROM public.book_pages WHERE unit_id = p_unit_id;

  FOR v_plan IN
    SELECT * FROM public.class_plans
    WHERE unit_id = p_unit_id
      AND (p_ids IS NULL OR id = ANY(p_ids))
    ORDER BY order_index
  LOOP
    v_scope := COALESCE(v_plan.scope, '{}'::jsonb);
    v_page_ids := '{}';

    -- 1. Ranges (endpoint page ids, inclusive, over upload_order).
    v_ranges := COALESCE(v_scope->'ranges', '[]'::jsonb);
    IF jsonb_typeof(v_ranges) = 'array' THEN
      FOR v_r IN SELECT je.value FROM jsonb_array_elements(v_ranges) je LOOP
        v_lo := array_position(v_unit_pages, (v_r->>'from_page_id')::uuid);
        v_hi := array_position(v_unit_pages, (v_r->>'to_page_id')::uuid);
        IF v_lo IS NULL OR v_hi IS NULL THEN
          v_warnings := v_warnings || format('range references a page outside the unit (plan %s)', v_plan.id);
          CONTINUE;
        END IF;
        IF v_hi < v_lo THEN
          v_warnings := v_warnings || format('range reversed, normalized (plan %s)', v_plan.id);
          SELECT least(v_lo, v_hi), greatest(v_lo, v_hi) INTO v_lo, v_hi;
        END IF;
        v_page_ids := v_page_ids || v_unit_pages[v_lo : v_hi];
      END LOOP;
    END IF;

    -- 2. Attached class-setup pages (book-level, decision #2): must be
    --    teacher-owned and NOT belong to another unit.
    v_inc_ids := COALESCE(ARRAY(SELECT (je.value)::uuid FROM jsonb_array_elements_text(COALESCE(v_scope->'include_page_ids', '[]'::jsonb)) je), '{}');
    IF array_length(v_inc_ids, 1) > 0 THEN
      SELECT array_agg(bp.id) INTO v_page_ids_extra
      FROM public.book_pages bp
      WHERE bp.id = ANY(v_inc_ids)
        AND bp.teacher_id = v_teacher
        AND (bp.unit_id IS NULL OR bp.unit_id = p_unit_id);
      IF v_page_ids_extra IS NOT NULL THEN
        v_page_ids := v_page_ids || v_page_ids_extra;
      END IF;
    END IF;
    SELECT array_agg(DISTINCT p) INTO v_page_ids FROM unnest(v_page_ids) p;
    v_page_ids := COALESCE(v_page_ids, '{}');

    -- 3. Structures on in-scope pages (non-removed) + include − exclude.
    SELECT array_agg(ps.id) INTO v_struct_ids
    FROM public.page_structures ps
    WHERE ps.page_id = ANY(v_page_ids) AND ps.review_status <> 'removed';

    v_include_struct := COALESCE(ARRAY(SELECT (je.value)::uuid FROM jsonb_array_elements_text(COALESCE(v_scope->'include_structure_ids', '[]'::jsonb)) je), '{}');
    v_exclude_struct := COALESCE(ARRAY(SELECT (je.value)::uuid FROM jsonb_array_elements_text(COALESCE(v_scope->'exclude_structure_ids', '[]'::jsonb)) je), '{}');
    IF array_length(v_include_struct, 1) > 0 THEN
      v_struct_ids := COALESCE(v_struct_ids, '{}') || v_include_struct;
    END IF;
    IF array_length(v_exclude_struct, 1) > 0 AND array_length(v_struct_ids, 1) > 0 THEN
      SELECT array_agg(s) INTO v_struct_ids FROM unnest(v_struct_ids) s WHERE NOT (s = ANY(v_exclude_struct));
    END IF;
    v_struct_ids := COALESCE(v_struct_ids, '{}');

    -- 4. Enriched content rows (structure provenance ∪ include lists),
    --    ordered by page position then structure order (teaching order).
    v_inc_ids := COALESCE(ARRAY(SELECT (je.value)::uuid FROM jsonb_array_elements_text(COALESCE(v_scope->'include_vocab_ids', '[]'::jsonb)) je), '{}');
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'word', t.word, 'set_label', t.set_label) ORDER BY t.pos, t.word), '[]'::jsonb),
           COALESCE(array_agg(t.id ORDER BY t.pos, t.word), '{}'),
           COALESCE(array_agg(lower(trim(t.word)) ORDER BY t.pos, t.word), '{}')
    INTO v_vocab, v_vocab_ids, v_words
    FROM (
      SELECT vi.id, vi.word, vi.set_label,
             COALESCE(bp.upload_order, 100000) * 1000 + COALESCE(ps.order_index, 0) AS pos
      FROM public.vocabulary_items vi
      LEFT JOIN public.page_structures ps ON ps.id = vi.source_structure_id
      LEFT JOIN public.book_pages bp ON bp.id = ps.page_id
      WHERE vi.unit_id = p_unit_id
        AND (vi.source_structure_id = ANY(v_struct_ids) OR vi.id = ANY(v_inc_ids))
    ) t;

    v_inc_ids := COALESCE(ARRAY(SELECT (je.value)::uuid FROM jsonb_array_elements_text(COALESCE(v_scope->'include_grammar_ids', '[]'::jsonb)) je), '{}');
    SELECT COALESCE(array_agg(t.id ORDER BY t.pos), '{}'),
           COALESCE(array_agg(lower(trim(t.rule)) ORDER BY t.pos), '{}')
    INTO v_grammar_ids, v_rules
    FROM (
      SELECT gr.id, gr.rule,
             COALESCE(bp.upload_order, 100000) * 1000 + COALESCE(ps.order_index, 0) AS pos
      FROM public.grammar_rules gr
      LEFT JOIN public.page_structures ps ON ps.id = gr.source_structure_id
      LEFT JOIN public.book_pages bp ON bp.id = ps.page_id
      WHERE gr.unit_id = p_unit_id
        AND (gr.source_structure_id = ANY(v_struct_ids) OR gr.id = ANY(v_inc_ids))
    ) t;

    v_inc_ids := COALESCE(ARRAY(SELECT (je.value)::uuid FROM jsonb_array_elements_text(COALESCE(v_scope->'include_story_ids', '[]'::jsonb)) je), '{}');
    SELECT COALESCE(array_agg(sp.id ORDER BY sp.page_number), '{}')
    INTO v_story_ids
    FROM public.story_pages sp
    WHERE sp.unit_id = p_unit_id
      AND (sp.source_structure_id = ANY(v_struct_ids) OR sp.id = ANY(v_inc_ids));

    v_inc_ids := COALESCE(ARRAY(SELECT (je.value)::uuid FROM jsonb_array_elements_text(COALESCE(v_scope->'include_dialogue_ids', '[]'::jsonb)) je), '{}');
    SELECT COALESCE(array_agg(dl.id ORDER BY dl.order_index), '{}')
    INTO v_dialogue_ids
    FROM public.dialogue_lines dl
    WHERE dl.unit_id = p_unit_id
      AND (dl.source_structure_id = ANY(v_struct_ids) OR dl.id = ANY(v_inc_ids));

    -- 5. Objectives: provenance-stamped, word/rule matched for include
    --    lists, plus the story/dialogue singletons when the class carries
    --    that content.
    SELECT COALESCE(array_agg(DISTINCT o.id), '{}') INTO v_objective_ids
    FROM public.objectives o
    WHERE o.unit_id = p_unit_id
      AND (
        o.source_structure_id = ANY(v_struct_ids)
        OR (o.type = 'vocabulary' AND lower(trim(o.target_value)) = ANY(COALESCE(v_words, '{}')))
        OR (o.type = 'grammar' AND lower(trim(o.target_value)) = ANY(COALESCE(v_rules, '{}')))
        OR (o.type = 'story' AND array_length(COALESCE(v_story_ids, '{}'), 1) > 0)
        OR (o.type = 'dialogue' AND array_length(COALESCE(v_dialogue_ids, '{}'), 1) > 0)
      );

    UPDATE public.class_plans
    SET content_index = jsonb_build_object(
          'page_ids', to_jsonb(v_page_ids),
          'structure_ids', to_jsonb(v_struct_ids),
          'vocab', COALESCE(v_vocab, '[]'::jsonb),
          'vocab_ids', to_jsonb(COALESCE(v_vocab_ids, '{}')),
          'set_labels', to_jsonb(COALESCE((
            SELECT array_agg(DISTINCT je.value->>'set_label')
            FROM jsonb_array_elements(COALESCE(v_vocab, '[]'::jsonb)) je
            WHERE COALESCE(trim(je.value->>'set_label'), '') <> ''
          ), '{}')),
          'grammar_ids', to_jsonb(COALESCE(v_grammar_ids, '{}')),
          'story_ids', to_jsonb(COALESCE(v_story_ids, '{}')),
          'dialogue_ids', to_jsonb(COALESCE(v_dialogue_ids, '{}')),
          'objective_ids', to_jsonb(COALESCE(v_objective_ids, '{}')),
          'counts', jsonb_build_object(
            'pages', COALESCE(array_length(v_page_ids, 1), 0),
            'vocab', COALESCE(array_length(COALESCE(v_vocab_ids, '{}'), 1), 0),
            'grammar', COALESCE(array_length(COALESCE(v_grammar_ids, '{}'), 1), 0),
            'story', COALESCE(array_length(COALESCE(v_story_ids, '{}'), 1), 0),
            'dialogue', COALESCE(array_length(COALESCE(v_dialogue_ids, '{}'), 1), 0),
            'objectives', COALESCE(array_length(COALESCE(v_objective_ids, '{}'), 1), 0)
          ),
          'unsourced', jsonb_build_object(
            'vocab', (SELECT COUNT(*) FROM public.vocabulary_items WHERE unit_id = p_unit_id AND source_structure_id IS NULL),
            'grammar', (SELECT COUNT(*) FROM public.grammar_rules WHERE unit_id = p_unit_id AND source_structure_id IS NULL),
            'story', (SELECT COUNT(*) FROM public.story_pages WHERE unit_id = p_unit_id AND source_structure_id IS NULL),
            'dialogue', (SELECT COUNT(*) FROM public.dialogue_lines WHERE unit_id = p_unit_id AND source_structure_id IS NULL)
          ),
          'warnings', to_jsonb(v_warnings)
        ),
        content_index_stale_at = NULL,
        updated_at = NOW()
    WHERE id = v_plan.id;

    v_results := v_results || jsonb_build_object(
      'id', v_plan.id, 'title', v_plan.title,
      'vocab', COALESCE(array_length(COALESCE(v_vocab_ids, '{}'), 1), 0),
      'objectives', COALESCE(array_length(COALESCE(v_objective_ids, '{}'), 1), 0)
    );
  END LOOP;

  RETURN jsonb_build_object('refreshed', v_results, 'warnings', to_jsonb(v_warnings));
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_class_plan_scope(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_class_plan_scope(uuid, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------
-- get_released_objectives — the student gate (#5). All objectives when
-- the unit has no plans (legacy behavior); else union over released.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_released_objectives(p_unit_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher uuid;
  v_status TEXT;
  v_scope JSONB;
  v_all uuid[];
BEGIN
  SELECT teacher_id, status INTO v_teacher, v_status FROM public.units WHERE id = p_unit_id AND deleted_at IS NULL;
  IF v_teacher IS NULL THEN
    RETURN '{}';
  END IF;
  IF NOT (
    v_teacher = auth.uid()
    OR public.is_teacher_or_admin()
    OR (public.is_role('student') AND v_status = 'Active'
        AND v_teacher = ANY (public.student_class_teacher_ids()))
  ) THEN
    RETURN '{}';
  END IF;

  v_scope := public.class_plans_released_scope(p_unit_id);
  IF NOT COALESCE((v_scope->>'has_plans')::boolean, false) THEN
    SELECT COALESCE(array_agg(id), '{}') INTO v_all
    FROM public.objectives WHERE unit_id = p_unit_id;
    RETURN v_all;
  END IF;

  RETURN COALESCE(ARRAY(SELECT (je.value)::uuid FROM jsonb_array_elements_text(COALESCE(v_scope->'objective_ids', '[]'::jsonb)) je), '{}');
END;
$$;

REVOKE ALL ON FUNCTION public.get_released_objectives(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_released_objectives(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- get_unit_bundle v2 — student branch filtered to the released scope
-- when the unit has class plans. Teachers/owner and plan-less units get
-- exactly the previous payload.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_unit_bundle(p_unit_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher UUID;
  v_status  TEXT;
  v_bundle  JSONB;
  v_is_student_caller BOOLEAN := false;
  v_scope   JSONB;
  v_obj_ids uuid[];
  v_struct_ids uuid[];
  v_vocab_ids uuid[];
  v_grammar_ids uuid[];
  v_story_ids uuid[];
  v_dialogue_ids uuid[];
BEGIN
  SELECT u.teacher_id, u.status INTO v_teacher, v_status FROM public.units u WHERE u.id = p_unit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit not found';
  END IF;

  IF v_teacher IS NOT NULL AND v_teacher IS DISTINCT FROM auth.uid() AND NOT public.is_teacher_or_admin() THEN
    IF NOT (public.is_role('student') AND v_status = 'Active' AND v_teacher = ANY(public.student_class_teacher_ids())) THEN
      RAISE EXCEPTION 'Not authorized to read this unit';
    END IF;
    v_is_student_caller := true;
  END IF;

  IF v_is_student_caller THEN
    v_scope := public.class_plans_released_scope(p_unit_id);
    IF COALESCE((v_scope->>'has_plans')::boolean, false) THEN
      v_obj_ids      := COALESCE(ARRAY(SELECT (je.value)::uuid FROM jsonb_array_elements_text(COALESCE(v_scope->'objective_ids','[]'::jsonb)) je), '{}');
      v_struct_ids   := COALESCE(ARRAY(SELECT (je.value)::uuid FROM jsonb_array_elements_text(COALESCE(v_scope->'structure_ids','[]'::jsonb)) je), '{}');
      v_vocab_ids    := COALESCE(ARRAY(SELECT (je.value)::uuid FROM jsonb_array_elements_text(COALESCE(v_scope->'vocab_ids','[]'::jsonb)) je), '{}');
      v_grammar_ids  := COALESCE(ARRAY(SELECT (je.value)::uuid FROM jsonb_array_elements_text(COALESCE(v_scope->'grammar_ids','[]'::jsonb)) je), '{}');
      v_story_ids    := COALESCE(ARRAY(SELECT (je.value)::uuid FROM jsonb_array_elements_text(COALESCE(v_scope->'story_ids','[]'::jsonb)) je), '{}');
      v_dialogue_ids := COALESCE(ARRAY(SELECT (je.value)::uuid FROM jsonb_array_elements_text(COALESCE(v_scope->'dialogue_ids','[]'::jsonb)) je), '{}');
      IF array_length(v_obj_ids, 1) = 0 THEN
        -- Plans exist, nothing released yet: the strict gate means the
        -- student gets no exercise content. Use an impossible id so the
        -- array filters exclude everything (NULL would mean "no filter").
        v_obj_ids := ARRAY['00000000-0000-0000-0000-000000000000'::uuid];
        v_struct_ids := v_obj_ids;
        v_vocab_ids := v_obj_ids;
        v_grammar_ids := v_obj_ids;
        v_story_ids := v_obj_ids;
        v_dialogue_ids := v_obj_ids;
      END IF;
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'unit_id',       p_unit_id,
    'objectives', COALESCE((
        SELECT jsonb_agg(to_jsonb(o))
        FROM public.objectives o
        WHERE o.unit_id = p_unit_id
          AND (v_obj_ids IS NULL OR o.id = ANY(v_obj_ids))
      ), '[]'::jsonb),
    'pool_items', COALESCE((
        SELECT jsonb_agg(to_jsonb(pi))
        FROM public.pool_items pi
        WHERE pi.unit_id = p_unit_id
          AND (v_obj_ids IS NULL OR pi.objective_id = ANY(v_obj_ids))
      ), '[]'::jsonb),
    'vocabulary_items', COALESCE((
        SELECT jsonb_agg(to_jsonb(vi) ORDER BY vi.order_index)
        FROM public.vocabulary_items vi
        WHERE vi.unit_id = p_unit_id
          AND (v_struct_ids IS NULL OR vi.source_structure_id = ANY(v_struct_ids) OR vi.id = ANY(v_vocab_ids))
      ), '[]'::jsonb),
    'story_pages', COALESCE((
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
          AND (v_struct_ids IS NULL OR sp.source_structure_id = ANY(v_struct_ids) OR sp.id = ANY(v_story_ids))
      ), '[]'::jsonb),
    'story_questions', COALESCE((
        SELECT jsonb_agg(to_jsonb(q) ORDER BY q.order_index)
        FROM public.story_comprehension_questions q
        WHERE q.unit_id = p_unit_id
          AND (v_story_ids IS NULL OR q.story_page_id = ANY(v_story_ids))
      ), '[]'::jsonb),
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
          AND (v_struct_ids IS NULL OR dl.source_structure_id = ANY(v_struct_ids) OR dl.id = ANY(v_dialogue_ids))
      ), '[]'::jsonb),
    'grammar_rules', COALESCE((
        SELECT jsonb_agg(to_jsonb(gr) ORDER BY gr.order_index)
        FROM public.grammar_rules gr
        WHERE gr.unit_id = p_unit_id
          AND (v_struct_ids IS NULL OR gr.source_structure_id = ANY(v_struct_ids) OR gr.id = ANY(v_grammar_ids))
      ), '[]'::jsonb),
    'characters',    COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.characters c JOIN public.unit_characters uc ON uc.character_id = c.id WHERE uc.unit_id = p_unit_id), '[]'::jsonb)
  ) INTO v_bundle;

  RETURN v_bundle;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_unit_bundle(UUID) TO authenticated, service_role;
