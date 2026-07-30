-- =====================================================================
-- Backfill vocabulary_items from existing units' manifest vocabulary
-- ---------------------------------------------------------------------
-- Same per-unit backfill treatment as §2.6 (characters/story/grammar). Vocab
-- was NOT covered by whatever backfill Phase 1 ran, so this populates the new
-- canonical rows from manifest.enriched_content.vocabulary (falling back to
-- knowledge_graph.vocabulary). Tolerates the two field spellings produced
-- across the pipeline (example_sentence/context_sentence, l1_translation/
-- translation). Idempotent: skips units that already have rows; UNIQUE(unit_id,
-- word) guards duplicates.
-- =====================================================================

DO $$
DECLARE
  u RECORD;
  v JSONB;
  vocab_arr JSONB;
  v_idx INT;
  v_count INT := 0;
BEGIN
  FOR u IN
    SELECT id, manifest FROM public.units
    WHERE NOT EXISTS (SELECT 1 FROM public.vocabulary_items vi WHERE vi.unit_id = units.id)
  LOOP
    vocab_arr := COALESCE(u.manifest->'enriched_content'->'vocabulary', u.manifest->'knowledge_graph'->'vocabulary');
    IF vocab_arr IS NULL OR jsonb_typeof(vocab_arr) != 'array' THEN
      CONTINUE;
    END IF;
    v_idx := 0;
    FOR v IN SELECT jsonb_array_elements(vocab_arr)
    LOOP
      IF v->>'word' IS NOT NULL AND TRIM(v->>'word') != '' THEN
        INSERT INTO public.vocabulary_items (
          unit_id, order_index, word, definition, example_sentence, l1_translation,
          phonetic, part_of_speech, image_prompt, image_url, audio_url, example_audio_url,
          distractors, confusables
        ) VALUES (
          u.id, v_idx, TRIM(v->>'word'), v->>'definition',
          COALESCE(v->>'example_sentence', v->>'context_sentence'),
          COALESCE(v->>'l1_translation', v->>'translation'),
          v->>'phonetic', v->>'part_of_speech', v->>'image_prompt',
          v->>'image_url', v->>'audio_url', v->>'example_audio_url',
          COALESCE(v->'distractors', '[]'::jsonb), COALESCE(v->'confusables', '[]'::jsonb)
        )
        ON CONFLICT (unit_id, word) DO NOTHING;
        v_count := v_count + 1;
      END IF;
      v_idx := v_idx + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Backfill complete: % vocabulary_items inserted', v_count;
END;
$$;
