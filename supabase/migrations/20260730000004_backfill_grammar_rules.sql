-- =====================================================================
-- Phase 1.4 — Backfill: manifest grammar → grammar_rules
-- ---------------------------------------------------------------------
-- One-time backfill for units enriched BEFORE Phase 1.4 (their grammar
-- exists only in manifest.enriched_content.grammar, not in the relational
-- table). Mirrors the dialogue backfill pattern (Phase 1.3).
--
-- Idempotent: UNIQUE(unit_id, rule) + NOT EXISTS guard = re-run is a no-op.
-- =====================================================================

DO $$
DECLARE
  u RECORD;
  g JSONB;
  v_count INT := 0;
  v_idx INT;
BEGIN
  FOR u IN
    SELECT id, manifest->'enriched_content'->'grammar' AS grammar_arr
    FROM public.units
    WHERE manifest->'enriched_content'->'grammar' IS NOT NULL
      AND jsonb_typeof(manifest->'enriched_content'->'grammar') = 'array'
      AND jsonb_array_length(manifest->'enriched_content'->'grammar') > 0
      AND NOT EXISTS (SELECT 1 FROM public.grammar_rules gr WHERE gr.unit_id = units.id)
  LOOP
    v_idx := 0;
    FOR g IN SELECT jsonb_array_elements(u.grammar_arr)
    LOOP
      IF g->>'rule' IS NOT NULL AND TRIM(g->>'rule') != '' THEN
        INSERT INTO public.grammar_rules (unit_id, order_index, rule, explanation, examples, pattern_template, transformation_pairs, error_examples)
        VALUES (
          u.id,
          v_idx,
          TRIM(g->>'rule'),
          NULLIF(TRIM(g->>'explanation'), ''),
          COALESCE(g->'examples', '[]'::jsonb),
          NULLIF(TRIM(g->>'pattern_template'), ''),
          COALESCE(g->'transformation_pairs', '[]'::jsonb),
          COALESCE(g->'error_examples', '[]'::jsonb)
        )
        ON CONFLICT (unit_id, rule) DO NOTHING;
        v_count := v_count + 1;
      END IF;
      v_idx := v_idx + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Backfill complete: % grammar_rules inserted', v_count;
END;
$$;
