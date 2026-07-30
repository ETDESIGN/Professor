-- =====================================================================
-- Phase 1.3 — Dialogue: dialogue_lines (advisor §2.3, §4, §7.2/§7.5)
-- ---------------------------------------------------------------------
-- WHY THIS EXISTS:
-- enrich-unit ALREADY generates 1-2 dialogues per unit (each 4-6 lines
-- between 2 speakers). Today these are stored in
-- units.manifest.enriched_content.dialogues and then COMPLETELY DISCARDED:
-- generate-exercises ignores dialogue (no flow type, no exercise type, no
-- relational structure). The "who said it?" game and roleplay exercises
-- are impossible without ordered, speaker-attributed lines.
--
-- What this migration enables (wired in Phase 1.3):
--   - dialogue_lines → DIALOGUE_ROLEPLAY pool items (ordered lines for
--     classroom role-play) + WHO_SAID_IT pool items (MCQ: which character
--     said this line? — unlocked by speaker_character_id, advisor §7.5)
--   - New flow type DIALOGUE_STAGE (presentation, analogous to STORY_STAGE)
--
-- objectives.type CHECK already allows 'dialogue' (widened in migration
-- 20260729000004_story_tables.sql, Phase 1.2). No constraint change needed.
-- =====================================================================

-- ── 1. dialogue_lines ─────────────────────────────────────────────────
-- One row per dialogue line. speaker_character_id→characters gives true
-- continuity (the speaker is a book-level character, advisor §7.2);
-- nullable because legacy/one-off speakers may not have a library entry
-- yet (speaker_override_name covers those, advisor §7.2).
-- order_index is the GLOBAL sequence across all dialogues in the unit
-- (dialogue 0 lines come first, then dialogue 1, etc.).
CREATE TABLE IF NOT EXISTS public.dialogue_lines (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id                 UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    order_index             INTEGER NOT NULL,           -- global 0-based order across all dialogues
    dialogue_index          INTEGER NOT NULL DEFAULT 0, -- which dialogue (0-based) this line belongs to
    speaker_character_id    UUID REFERENCES public.characters(id) ON DELETE SET NULL,  -- resolved book character
    speaker_override_name   TEXT,                       -- one-off speaker not in the cast (advisor §7.2)
    text                    TEXT NOT NULL,              -- what the speaker says (L2)
    translation             TEXT,                       -- L1 (Simplified Chinese) translation
    audio_asset_id          UUID REFERENCES public.assets(id) ON DELETE SET NULL,      -- TTS audio (Phase 1.5 vault FK)
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (unit_id, order_index)                       -- re-enrich never duplicates a line
);

CREATE INDEX IF NOT EXISTS idx_dialogue_lines_unit ON public.dialogue_lines(unit_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_lines_unit_order ON public.dialogue_lines(unit_id, order_index);

ALTER TABLE public.dialogue_lines ENABLE ROW LEVEL SECURITY;

-- Mirrors the story_pages/objectives/pool_items RLS pattern: a teacher
-- manages rows for units they own. service_role bypasses RLS (edge functions).
DROP POLICY IF EXISTS "dialogue_lines_select_policy" ON public.dialogue_lines;
CREATE POLICY "dialogue_lines_select_policy"
    ON public.dialogue_lines FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = dialogue_lines.unit_id AND u.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = dialogue_lines.unit_id AND u.teacher_id IS NULL)
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "dialogue_lines_insert_policy" ON public.dialogue_lines;
CREATE POLICY "dialogue_lines_insert_policy"
    ON public.dialogue_lines FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = dialogue_lines.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "dialogue_lines_update_policy" ON public.dialogue_lines;
CREATE POLICY "dialogue_lines_update_policy"
    ON public.dialogue_lines FOR UPDATE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = dialogue_lines.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
DROP POLICY IF EXISTS "dialogue_lines_delete_policy" ON public.dialogue_lines;
CREATE POLICY "dialogue_lines_delete_policy"
    ON public.dialogue_lines FOR DELETE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = dialogue_lines.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );
GRANT ALL ON public.dialogue_lines TO authenticated, anon, service_role;
