-- =====================================================================
-- Phase 1.4 — Grammar: grammar_rules (advisor §2.3)
-- ---------------------------------------------------------------------
-- WHY THIS EXISTS:
-- Today grammar is JSONB-derived: enrich-unit writes grammar rules into
-- units.manifest.enriched_content.grammar, and generate-exercises reads
-- them from the normalized manifest. This works BUT the data is transient
-- and shape-fragile — the "grammar empty in practice" gap exists because
-- generate-exercises can only build exercises when the JSONB happens to
-- carry error_examples/transformation_pairs (conditional wiring). A real
-- table with a stable shape is what generate-exercises should read.
--
-- What this migration enables:
--   - grammar_rules becomes the canonical source for grammar exercises
--   - generate-exercises reads a stable-shaped table, not transient JSONB
--   - Teacher edits to grammar rules persist in a queryable, editable row
--   - Re-enrichment is idempotent (UNIQUE constraint on natural key)
--
-- Schema extends the plan's minimal (rule, explanation, examples) with
-- the fields generate-exercises ACTUALLY needs to produce ERROR_SPOT,
-- TRANSFORM, and WORD_BANK_BUILD items: pattern_template,
-- transformation_pairs, error_examples.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.grammar_rules (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id                 UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    order_index             INTEGER NOT NULL DEFAULT 0,  -- ordering within the unit
    rule                    TEXT NOT NULL,               -- rule name (e.g. "Present Simple")
    explanation             TEXT,                        -- child-friendly explanation
    examples                JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["example 1", "example 2"]
    pattern_template        TEXT,                        -- "Subject + ___ + Object"
    transformation_pairs    JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{"original":"...","transformed":"..."}]
    error_examples          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{"wrong":"...","correct":"..."}]
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (unit_id, rule)                              -- re-enrich never duplicates a rule
);

CREATE INDEX IF NOT EXISTS idx_grammar_rules_unit ON public.grammar_rules(unit_id);

ALTER TABLE public.grammar_rules ENABLE ROW LEVEL SECURITY;

-- Mirrors the story_pages/dialogue_lines/objectives RLS pattern.
DROP POLICY IF EXISTS "grammar_rules_select_policy" ON public.grammar_rules;
CREATE POLICY "grammar_rules_select_policy"
    ON public.grammar_rules FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = grammar_rules.unit_id AND u.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = grammar_rules.unit_id AND u.teacher_id IS NULL)
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "grammar_rules_insert_policy" ON public.grammar_rules;
CREATE POLICY "grammar_rules_insert_policy"
    ON public.grammar_rules FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = grammar_rules.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "grammar_rules_update_policy" ON public.grammar_rules;
CREATE POLICY "grammar_rules_update_policy"
    ON public.grammar_rules FOR UPDATE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = grammar_rules.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "grammar_rules_delete_policy" ON public.grammar_rules;
CREATE POLICY "grammar_rules_delete_policy"
    ON public.grammar_rules FOR DELETE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = grammar_rules.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
GRANT ALL ON public.grammar_rules TO authenticated, anon, service_role;
