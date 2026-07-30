-- =====================================================================
-- Phase 1.3 — Backfill: manifest dialogues → dialogue_lines
-- ---------------------------------------------------------------------
-- One-time backfill for units enriched BEFORE Phase 1.3 (their dialogues
-- exist only in manifest.enriched_content.dialogues, not in the relational
-- table). Mirrors the story backfill pattern (Phase 1.2).
--
-- Logic:
--   1. Find units with a non-empty dialogues array in the manifest AND
--      zero rows in dialogue_lines (not yet backfilled).
--   2. Flatten dialogues[].lines[] into dialogue_lines rows.
--   3. Resolve speaker names to characters.id via ILIKE match within the
--      unit's book (best-effort; unmatched speakers get speaker_override_name).
--
-- Idempotent: the UNIQUE(unit_id, order_index) constraint + the NOT EXISTS
-- guard mean re-running this is a no-op.
-- =====================================================================

DO $$
DECLARE
  u RECORD;
  dlg RECORD;
  line_rec RECORD;
  v_unit_id UUID;
  v_book_id UUID;
  v_dialogues JSONB;
  v_dialogue JSONB;
  v_lines JSONB;
  v_line JSONB;
  v_speaker TEXT;
  v_char_id UUID;
  v_order INT;
  v_dlg_idx INT;
  v_count INT := 0;
BEGIN
  -- Units with manifest dialogues but no relational rows yet.
  FOR u IN
    SELECT id, book_id, manifest->'enriched_content'->'dialogues' AS dialogues
    FROM public.units
    WHERE manifest->'enriched_content'->'dialogues' IS NOT NULL
      AND jsonb_typeof(manifest->'enriched_content'->'dialogues') = 'array'
      AND jsonb_array_length(manifest->'enriched_content'->'dialogues') > 0
      AND NOT EXISTS (SELECT 1 FROM public.dialogue_lines dl WHERE dl.unit_id = units.id)
  LOOP
    v_unit_id := u.id;
    v_book_id := u.book_id;
    v_dialogues := u.dialogues;
    v_order := 0;
    v_dlg_idx := 0;

    -- Iterate each dialogue in the array.
    FOR v_dialogue IN SELECT jsonb_array_elements(v_dialogues)
    LOOP
      v_lines := v_dialogue->'lines';
      IF v_lines IS NULL OR jsonb_typeof(v_lines) != 'array' THEN
        v_dlg_idx := v_dlg_idx + 1;
        CONTINUE;
      END IF;

      -- Iterate each line in this dialogue.
      FOR v_line IN SELECT jsonb_array_elements(v_lines)
      LOOP
        v_speaker := NULLIF(TRIM(v_line->>'speaker'), '');

        -- Resolve speaker to a book character (ILIKE match).
        v_char_id := NULL;
        IF v_book_id IS NOT NULL AND v_speaker IS NOT NULL THEN
          SELECT c.id INTO v_char_id
          FROM public.characters c
          WHERE c.book_id = v_book_id
            AND c.name ILIKE v_speaker
          LIMIT 1;
        END IF;

        INSERT INTO public.dialogue_lines (unit_id, order_index, dialogue_index, speaker_character_id, speaker_override_name, text, translation)
        VALUES (
          v_unit_id,
          v_order,
          v_dlg_idx,
          v_char_id,
          CASE WHEN v_char_id IS NULL THEN v_speaker ELSE NULL END,
          COALESCE(NULLIF(TRIM(v_line->>'text'), ''), '(empty)'),
          NULLIF(TRIM(v_line->>'translation'), '')
        )
        ON CONFLICT (unit_id, order_index) DO NOTHING;

        v_order := v_order + 1;
        v_count := v_count + 1;
      END LOOP;

      v_dlg_idx := v_dlg_idx + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Backfill complete: % dialogue_lines inserted', v_count;
END;
$$;
