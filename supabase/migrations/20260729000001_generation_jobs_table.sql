-- =====================================================================
-- Phase 0A — Generation Jobs: `generation_jobs` table (resumable pipeline)
-- ---------------------------------------------------------------------
-- WHY THIS EXISTS (Bug B1b):
-- orchestrate-lesson triggers generate-exercises via a detached (un-awaited)
-- fetch so the long-running image generation doesn't burn the publish
-- function's wall-clock budget. But because the call is fire-and-forget, its
-- only failure handling is `.catch(console.error)` — a cold-start drop, a
-- missing auth header on the detached call, or a function error all vanish
-- silently. Verified 2026-07-29: generate-exercises has NEVER produced data in
-- production (0 rows in objectives/pool_items for all 87 units), even for
-- owned units — exactly this silent failure mode.
--
-- This table makes every pipeline stage a *visible, retryable row* instead of
-- a logged-to-void detached call. orchestrate-lesson inserts a job before
-- triggering generate-exercises and the function updates its status on
-- start/success/failure. A failed stage can now be re-run on demand rather
-- than leaving a unit in "looks done but has no exercises" limbo.
--
-- Schema notes:
--  - stage is TEXT (not enum) so adding new pipeline stages (story/dialogue/
--    character emitters in Phase 1) needs no migration.
--  - status follows a small, fixed vocabulary; enforced by CHECK.
--  - unique(unit_id, stage) means one in-flight job per stage per unit —
--    re-running a stage UPSERTS the row rather than stacking duplicates.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.generation_jobs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id     UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    stage       TEXT NOT NULL,                       -- 'generate-exercises' | future stages
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
    error       TEXT,                                -- populated when status = 'failed'
    attempt     INTEGER NOT NULL DEFAULT 1,
    started_at  TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (unit_id, stage)
);

-- Primary access path: "what's the status of every stage for this unit?"
CREATE INDEX IF NOT EXISTS idx_generation_jobs_unit ON public.generation_jobs(unit_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON public.generation_jobs(status);

ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

-- A teacher can see/manage jobs only for units they own (mirrors the units
-- RLS pattern used by objectives/pool_items). is_teacher_or_admin() covers
-- admins; the service_role (used by edge functions) bypasses RLS entirely.
DROP POLICY IF EXISTS "generation_jobs_select_policy" ON public.generation_jobs;
CREATE POLICY "generation_jobs_select_policy"
    ON public.generation_jobs FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = generation_jobs.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );

DROP POLICY IF EXISTS "generation_jobs_insert_policy" ON public.generation_jobs;
CREATE POLICY "generation_jobs_insert_policy"
    ON public.generation_jobs FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = generation_jobs.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );

DROP POLICY IF EXISTS "generation_jobs_update_policy" ON public.generation_jobs;
CREATE POLICY "generation_jobs_update_policy"
    ON public.generation_jobs FOR UPDATE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = generation_jobs.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );

DROP POLICY IF EXISTS "generation_jobs_delete_policy" ON public.generation_jobs;
CREATE POLICY "generation_jobs_delete_policy"
    ON public.generation_jobs FOR DELETE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = generation_jobs.unit_id AND u.teacher_id = auth.uid())
        OR (SELECT public.is_teacher_or_admin())
    );

GRANT ALL ON public.generation_jobs TO authenticated, anon, service_role;
