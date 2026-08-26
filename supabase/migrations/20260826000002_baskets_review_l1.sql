-- =====================================================================
-- 20260826000002 — baskets, review confirm, provenance, L1 (F P2.1)
--
--   * profiles.native_language — per-teacher L1 (doc 10 §5: first value
--     zh-CN, matching today's hardcoded behavior; per-class override can
--     be added later without rework).
--   * Provenance columns linking enriched relational rows back to the
--     page structure they were extracted from (unit → page → structure →
--     bbox traceability, doc 10 §8).
--   * units.baskets_confirmed_at — the teacher's explicit batch-confirm
--     action; enrichment runs only after it (doc 10 §5).
--   * get_unit_baskets(unit_id) — the derived basket view (doc 10 §6):
--     per-type aggregation of CONFIRMED structures over the unit's
--     assigned pages, deduped by normalized verbatim text. Computed
--     fresh — never materialized by a second writer.
-- =====================================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS native_language TEXT NOT NULL DEFAULT 'zh-CN';

ALTER TABLE public.vocabulary_items
    ADD COLUMN IF NOT EXISTS set_label TEXT,
    ADD COLUMN IF NOT EXISTS source_structure_id UUID REFERENCES public.page_structures(id) ON DELETE SET NULL;

ALTER TABLE public.grammar_rules
    ADD COLUMN IF NOT EXISTS tier TEXT CHECK (tier IN ('BOX', 'INFERRED')),
    ADD COLUMN IF NOT EXISTS source_structure_id UUID REFERENCES public.page_structures(id) ON DELETE SET NULL;

ALTER TABLE public.story_pages
    ADD COLUMN IF NOT EXISTS source_structure_id UUID REFERENCES public.page_structures(id) ON DELETE SET NULL;

ALTER TABLE public.dialogue_lines
    ADD COLUMN IF NOT EXISTS source_structure_id UUID REFERENCES public.page_structures(id) ON DELETE SET NULL;

ALTER TABLE public.units
    ADD COLUMN IF NOT EXISTS baskets_confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_vocab_source_structure ON public.vocabulary_items (source_structure_id);
CREATE INDEX IF NOT EXISTS idx_grammar_source_structure ON public.grammar_rules (source_structure_id);
CREATE INDEX IF NOT EXISTS idx_story_source_structure ON public.story_pages (source_structure_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_source_structure ON public.dialogue_lines (source_structure_id);

-- ---------------------------------------------------------------------
-- get_unit_baskets — the derived basket view (SECURITY DEFINER; owner or
-- teacher/admin only; returns NULL for callers who cannot act on the
-- unit). Baskets include ONLY structures the teacher confirmed (or
-- edited-and-kept); teacher-removed (✕) items are excluded; teacher-
-- added (➕, source='teacher') items flow through the same queries.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_unit_baskets(p_unit_id uuid)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher uuid;
BEGIN
  SELECT u.teacher_id INTO v_teacher FROM public.units u WHERE u.id = p_unit_id AND u.deleted_at IS NULL;
  IF v_teacher IS NULL THEN
    RETURN NULL;
  END IF;
  IF NOT (v_teacher = auth.uid() OR public.is_teacher_or_admin()) THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'unit_id', p_unit_id,

    -- vocabulary: every confirmed word from vocab sets + CLIL sets + reading
    -- passages that carry their own word strip, deduped by normalized word
    -- (multi-word items first-class).
    'vocabulary', (
      SELECT COALESCE(jsonb_agg(item ORDER BY item->>'word'), '[]'::jsonb)
      FROM (
        SELECT DISTINCT ON (lower(trim(i->>'word')))
          jsonb_build_object(
            'word', i->>'word',
            'set_label', COALESCE(NULLIF(trim(ps.set_label), ''), ps.data->>'set_label'),
            'picture_bbox', i->'picture_bbox',
            'is_clil', ps.structure_type = 'clil_passage',
            'structure_id', ps.id,
            'page_id', bp.id
          ) AS item
        FROM public.page_structures ps
        JOIN public.book_pages bp ON bp.id = ps.page_id
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ps.data->'items', '[]'::jsonb)) AS i
        WHERE bp.unit_id = p_unit_id
          AND ps.review_status IN ('confirmed', 'edited')
          AND ps.structure_type IN ('vocab_set', 'clil_passage', 'reading_passage')
          AND COALESCE(trim(i->>'word'), '') <> ''
        ORDER BY lower(trim(i->>'word')), ps.created_at
      ) words
    ),

    -- grammar: BOX-tier rules verbatim from confirmed grammar boxes.
    'grammar', (
      SELECT COALESCE(jsonb_agg(g ORDER BY g->>'order_hint'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'tier', 'BOX',
          'rule_text', ps.data->>'rule_text',
          'example_sentences', COALESCE(ps.data->'example_sentences', '[]'::jsonb),
          'structure_id', ps.id,
          'page_id', bp.id,
          'order_hint', bp.upload_order
        ) AS g
        FROM public.page_structures ps
        JOIN public.book_pages bp ON bp.id = ps.page_id
        WHERE bp.unit_id = p_unit_id
          AND ps.review_status IN ('confirmed', 'edited')
          AND ps.structure_type = 'grammar_box'
      ) boxes
    ),

    -- story: verbatim reading passages and comics (panels kept in order).
    'story', jsonb_build_object(
      'passages', (
        SELECT COALESCE(jsonb_agg(p ORDER BY p->>'order_hint'), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object(
            'title', ps.data->>'title',
            'passage_text', ps.data->>'passage_text',
            'activities', COALESCE(ps.data->'activities', '[]'::jsonb),
            'scene_illustrations', COALESCE(ps.data->'scene_illustrations', '[]'::jsonb),
            'structure_id', ps.id,
            'page_id', bp.id,
            'order_hint', bp.upload_order
          ) AS p
          FROM public.page_structures ps
          JOIN public.book_pages bp ON bp.id = ps.page_id
          WHERE bp.unit_id = p_unit_id
            AND ps.review_status IN ('confirmed', 'edited')
            AND ps.structure_type IN ('reading_passage', 'clil_passage')
        ) passages
      ),
      'comics', (
        SELECT COALESCE(jsonb_agg(c ORDER BY c->>'order_hint'), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object(
            'panels', COALESCE(ps.data->'panels', '[]'::jsonb),
            'structure_id', ps.id,
            'page_id', bp.id,
            'order_hint', bp.upload_order
          ) AS c
          FROM public.page_structures ps
          JOIN public.book_pages bp ON bp.id = ps.page_id
          WHERE bp.unit_id = p_unit_id
            AND ps.review_status IN ('confirmed', 'edited')
            AND ps.structure_type = 'comic'
        ) comics
      )
    ),

    -- dialogues: comic bubbles + dialogue sequences, deduped by exact
    -- line text, in panel/conversation order.
    'dialogues', (
      SELECT COALESCE(jsonb_agg(d ORDER BY d->>'order_hint', (d->>'line_index')::int), '[]'::jsonb)
      FROM (
        SELECT DISTINCT ON (lower(trim(line->>'text')), ps.id)
          jsonb_build_object(
            'speaker', line->>'speaker',
            'text', line->>'text',
            'source', ps.structure_type,
            'structure_id', ps.id,
            'page_id', bp.id,
            'order_hint', bp.upload_order,
            'line_index', line_idx - 1
          ) AS d
        FROM public.page_structures ps
        JOIN public.book_pages bp ON bp.id = ps.page_id
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ps.data->'lines', '[]'::jsonb)) WITH ORDINALITY AS lines_tbl(line, line_idx)
        WHERE bp.unit_id = p_unit_id
          AND ps.review_status IN ('confirmed', 'edited')
          AND ps.structure_type = 'dialogue_sequence'
          AND COALESCE(trim(line->>'text'), '') <> ''
        UNION
        SELECT DISTINCT ON (lower(trim(b->>'text')), ps.id, panel_ordinality, b_ordinality)
          jsonb_build_object(
            'speaker', b->>'speaker',
            'text', b->>'text',
            'source', 'comic',
            'structure_id', ps.id,
            'page_id', bp.id,
            'order_hint', bp.upload_order,
            'line_index', ((panel_ordinality - 1) * 100) + (b_ordinality - 1)
          ) AS d
        FROM public.page_structures ps
        JOIN public.book_pages bp ON bp.id = ps.page_id
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ps.data->'panels', '[]'::jsonb)) WITH ORDINALITY AS panels(panel, panel_ordinality)
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(panel->'bubbles', '[]'::jsonb)) WITH ORDINALITY AS bubbles(b, b_ordinality)
        WHERE bp.unit_id = p_unit_id
          AND ps.review_status IN ('confirmed', 'edited')
          AND ps.structure_type = 'comic'
          AND COALESCE(trim(b->>'text'), '') <> ''
      ) lines
    ),

    -- media: the book's own songs (verbatim lyrics) as separate items.
    'book_songs', (
      SELECT COALESCE(jsonb_agg(s ORDER BY s->>'order_hint'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'title', ps.data->>'title',
          'lyrics', ps.data->>'lyrics',
          'action_lines', COALESCE(ps.data->'action_lines', '[]'::jsonb),
          'structure_id', ps.id,
          'page_id', bp.id,
          'order_hint', bp.upload_order
        ) AS s
        FROM public.page_structures ps
        JOIN public.book_pages bp ON bp.id = ps.page_id
        WHERE bp.unit_id = p_unit_id
          AND ps.review_status IN ('confirmed', 'edited')
          AND ps.structure_type = 'song_sheet'
      ) songs
    ),

    -- objectives: "I can…" statements verbatim.
    'objectives', (
      SELECT COALESCE(jsonb_agg(o->>'text') , '[]'::jsonb)
      FROM (
        SELECT DISTINCT ON (lower(trim(st)))
          jsonb_build_object('text', st) AS o
        FROM public.page_structures ps
        JOIN public.book_pages bp ON bp.id = ps.page_id
        CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(ps.data->'statements', '[]'::jsonb)) AS st
        WHERE bp.unit_id = p_unit_id
          AND ps.review_status IN ('confirmed', 'edited')
          AND ps.structure_type = 'review_statements'
          AND COALESCE(trim(st), '') <> ''
        ORDER BY lower(trim(st)), ps.created_at
      ) statements
    ),

    -- narrative: mission/opener text (never drilled).
    'narrative', (
      SELECT COALESCE(jsonb_agg(n ORDER BY n->>'order_hint'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'mission_text', ps.data->>'mission_text',
          'printed_unit_number', ps.data->>'printed_unit_number',
          'printed_title', ps.data->>'printed_title',
          'opener_art_bbox', ps.data->>'opener_art_bbox',
          'page_id', bp.id,
          'order_hint', bp.upload_order
        ) AS n
        FROM public.page_structures ps
        JOIN public.book_pages bp ON bp.id = ps.page_id
        WHERE bp.unit_id = p_unit_id
          AND ps.review_status IN ('confirmed', 'edited')
          AND ps.structure_type = 'mission_opener'
      ) missions
    ),

    -- activities: every printed activity as structured data (reserved
    -- fuel for future mechanics, doc 10 §9). Exam-format activities are
    -- tagged so the exam_formats workstream can find them.
    'activities', (
      SELECT COALESCE(jsonb_agg(a ORDER BY a->>'order_hint', (a->>'idx')::int), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'instruction', act->>'instruction',
          'verb', act->>'verb',
          'content', act->>'content',
          'exam_format',
            (act->>'instruction' ILIKE '%mover%' OR act->>'instruction' ILIKE '%exam%'
             OR act->>'instruction' ILIKE '%flyers%' OR act->>'instruction' ILIKE '%starters%'),
          'structure_id', ps.id,
          'page_id', bp.id,
          'order_hint', bp.upload_order,
          'idx', act_ordinality - 1
        ) AS a
        FROM public.page_structures ps
        JOIN public.book_pages bp ON bp.id = ps.page_id
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE ps.structure_type
            WHEN 'printed_activity' THEN jsonb_build_array(ps.data)
            ELSE COALESCE(ps.data->'activities', '[]'::jsonb)
          END
        ) WITH ORDINALITY AS acts(act, act_ordinality)
        WHERE bp.unit_id = p_unit_id
          AND ps.review_status IN ('confirmed', 'edited')
          AND ps.structure_type IN ('printed_activity', 'reading_passage', 'clil_passage')
          AND COALESCE(trim(act->>'instruction'), '') <> ''
      ) activities
    ),

    -- character appearances: exhaustive visual descriptions (extraction
    -- side of the parked cast workstream).
    'character_appearances', (
      SELECT COALESCE(jsonb_agg(ca ORDER BY ca->>'order_hint'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'name', ps.data->>'name',
          'visual_description', ps.data->>'visual_description',
          'structure_id', ps.id,
          'page_id', bp.id,
          'order_hint', bp.upload_order
        ) AS ca
        FROM public.page_structures ps
        JOIN public.book_pages bp ON bp.id = ps.page_id
        WHERE bp.unit_id = p_unit_id
          AND ps.review_status IN ('confirmed', 'edited')
          AND ps.structure_type = 'character_appearance'
      ) appearances
    ),

    'confirmed_at', (SELECT baskets_confirmed_at FROM public.units WHERE id = p_unit_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_unit_baskets(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unit_baskets(uuid) TO authenticated;
