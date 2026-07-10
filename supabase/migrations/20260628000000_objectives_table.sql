-- =====================================================================
-- Phase 0.1 — Skill Graph: `objectives` table
-- ---------------------------------------------------------------------
-- Every unit declares learning objectives (one per vocab word, one per
-- grammar rule, one per phonics target). Objectives are the unit of
-- mastery: the LearnerState (evolved srs_items) tracks per-student,
-- per-objective memory state, and pool_items are generated per objective.
--
-- `type` uses TEXT + CHECK (not a native ENUM) to match the repo convention
-- (units.status, student_assignments.status) and stay trivially extensible
-- for the v2 phonics/reading/fluency lanes without an ALTER TYPE dance.
--
-- RLS: teachers own the objectives of units they own (full access);
-- authenticated students may SELECT (lesson content is broadly readable,
-- matching how units.flow already is); writes are teacher/admin only.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.objectives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('vocabulary', 'grammar', 'phonics')),
    target_value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- A given word/rule should appear once per unit (dedup guard for re-runs of
-- generate-exercises). Expression uniqueness must be a UNIQUE INDEX in Postgres
-- (table UNIQUE constraints cannot reference expressions like lower(trim(...))).
CREATE UNIQUE INDEX IF NOT EXISTS objectives_unit_type_target_key
    ON public.objectives (unit_id, type, lower(trim(target_value)));

CREATE INDEX IF NOT EXISTS idx_objectives_unit ON public.objectives(unit_id);
CREATE INDEX IF NOT EXISTS idx_objectives_type ON public.objectives(type);
-- Expression index used by the srs_items->objectives word-match backfill
-- (20260628000002_evolve_srs_items.sql) so it never full-scans a large table.
CREATE INDEX IF NOT EXISTS idx_objectives_target_lower ON public.objectives (lower(trim(target_value)));

ALTER TABLE public.objectives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "objectives_select_policy" ON public.objectives;
CREATE POLICY "objectives_select_policy"
    ON public.objectives FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = objectives.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
        OR auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "objectives_insert_policy" ON public.objectives;
CREATE POLICY "objectives_insert_policy"
    ON public.objectives FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = objectives.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );

DROP POLICY IF EXISTS "objectives_update_policy" ON public.objectives;
CREATE POLICY "objectives_update_policy"
    ON public.objectives FOR UPDATE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = objectives.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );

DROP POLICY IF EXISTS "objectives_delete_policy" ON public.objectives;
CREATE POLICY "objectives_delete_policy"
    ON public.objectives FOR DELETE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = objectives.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );

GRANT ALL ON public.objectives TO authenticated, anon, service_role;
