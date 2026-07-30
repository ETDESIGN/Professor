-- =====================================================================
-- Phase 1.6 — Emission consolidation: activity_type_registry + get_unit_bundle
-- ---------------------------------------------------------------------
-- Two cross-cutting pieces (advisor §2.4, §2.5):
--
-- 1. activity_type_registry — declarative map of which exercise/activity
--    types each learning-object type produces. Lets generate-exercises be
--    registry-driven instead of hardcoding a branch per category: adding a
--    new activity becomes "insert a registry row + implement a generator",
--    not an edit to the orchestration function. Seeded to EXACTLY match the
--    current working output (so the registry gate changes nothing today).
--
-- 2. get_unit_bundle(unit_id) — the READ CONTRACT. One SECURITY DEFINER RPC
--    that joins the relational tables (objectives, pool_items, story,
--    dialogue, grammar, characters) into a single payload, derived on read.
--    This is the "never hand-written by two producers" fix (advisor §2.4):
--    board/student apps get one consistent shape instead of each re-deriving
--    from units.manifest. Teacher-scoped for now (owner / admin / unowned);
--    student-class access is layered on when consumers switch over.
-- =====================================================================

-- ── 1. activity_type_registry ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_type_registry (
    learning_object_type TEXT NOT NULL,   -- 'vocabulary' | 'grammar' | 'story' | 'dialogue'
    activity_type        TEXT NOT NULL,   -- the exercise_type it produces
    generator_key        TEXT NOT NULL,   -- which generator builds it (buildVocabItems, etc.)
    PRIMARY KEY (learning_object_type, activity_type)
);
ALTER TABLE public.activity_type_registry ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.activity_type_registry TO authenticated, anon, service_role;
-- Read-only for authenticated (the generator reads it via service_role).
DROP POLICY IF EXISTS "activity_registry_select_policy" ON public.activity_type_registry;
CREATE POLICY "activity_registry_select_policy"
    ON public.activity_type_registry FOR SELECT TO authenticated
    USING (true);

-- Seed to EXACTLY match current generate-exercises output.
-- vocabulary battery (10), grammar (3), story (1), dialogue (2).
INSERT INTO public.activity_type_registry (learning_object_type, activity_type, generator_key) VALUES
  ('vocabulary', 'MEANING_MATCH',       'buildVocabItems'),
  ('vocabulary', 'AUDIO_L1_SELECT',     'buildVocabItems'),
  ('vocabulary', 'LISTEN_SELECT',       'buildVocabItems'),
  ('vocabulary', 'IMAGE_SELECT',        'buildVocabItems'),
  ('vocabulary', 'SPELL_CLOZE',         'buildVocabItems'),
  ('vocabulary', 'WORD_BANK_BUILD',     'buildVocabItems'),
  ('vocabulary', 'DICTATION',           'buildVocabItems'),
  ('vocabulary', 'MINIMAL_PAIR_SWIPE',  'buildVocabItems'),
  ('vocabulary', 'TYPE_TRANSLATE',      'buildVocabItems'),
  ('vocabulary', 'SPEAK_SENTENCE',      'buildVocabItems'),
  ('grammar',    'ERROR_SPOT',          'buildGrammarItems'),
  ('grammar',    'TRANSFORM',           'buildGrammarItems'),
  ('grammar',    'WORD_BANK_BUILD',     'buildGrammarItems'),
  ('story',      'STORY_COMPREHENSION', 'buildStoryItems'),
  ('dialogue',   'DIALOGUE_ROLEPLAY',   'buildDialogueItems'),
  ('dialogue',   'WHO_SAID_IT',         'buildDialogueItems')
ON CONFLICT (learning_object_type, activity_type) DO NOTHING;

-- ── 2. get_unit_bundle(unit_id) — the read contract ──────────────────
-- Joins the relational spine + content tables into one JSONB payload.
-- SECURITY DEFINER so a single authorized read sees the full bundle even
-- where per-table RLS would differ; authorization is enforced inside
-- (owner / admin / unowned-unit, mirroring the table RLS pattern).
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
  -- Owner, admin, or an unowned unit (mirrors the per-table RLS pattern).
  IF v_teacher IS NOT NULL AND v_teacher IS DISTINCT FROM auth.uid() AND NOT public.is_teacher_or_admin() THEN
    RAISE EXCEPTION 'Not authorized to read this unit';
  END IF;

  SELECT jsonb_build_object(
    'unit_id',       p_unit_id,
    'objectives',    COALESCE((SELECT jsonb_agg(to_jsonb(o))  FROM public.objectives o  WHERE o.unit_id  = p_unit_id), '[]'::jsonb),
    'pool_items',    COALESCE((SELECT jsonb_agg(to_jsonb(pi)) FROM public.pool_items pi WHERE pi.unit_id = p_unit_id), '[]'::jsonb),
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
