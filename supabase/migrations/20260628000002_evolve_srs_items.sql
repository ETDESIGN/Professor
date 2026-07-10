-- =====================================================================
-- Phase 0.3 — Evolve `srs_items` into the LearnerState (FSRS)
-- ---------------------------------------------------------------------
-- Adds the FSRS-lite memory columns + per-student mastery_state + the
-- objective link. The legacy SM-2 columns (interval, repetition, efactor)
-- are KEPT for back-compat (the client SM-2 path and any stored templates
-- still read them); the new path writes stability/difficulty/reps/lapses.
--
-- `retrievability` (R) is NEVER stored — it is computed on read by
-- services/fsrs.ts from (stability, difficulty, elapsed). This keeps a
-- single source of truth and avoids stale-R drift.
--
-- Existing RLS policies (owner + teacher/admin + template reads) are
-- untouched; this migration only ADDS columns + an index + a backfill.
-- =====================================================================

-- FSRS memory state (null until first FSRS review; cold-start handled in code).
ALTER TABLE public.srs_items ADD COLUMN IF NOT EXISTS stability NUMERIC;
ALTER TABLE public.srs_items ADD COLUMN IF NOT EXISTS difficulty NUMERIC;

-- FSRS counters (distinct from the legacy SM-2 `repetition` column).
ALTER TABLE public.srs_items ADD COLUMN IF NOT EXISTS reps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.srs_items ADD COLUMN IF NOT EXISTS lapses INTEGER NOT NULL DEFAULT 0;

-- Per-student mastery state (new -> learning -> familiar -> mastered -> decaying).
-- Template rows (student_id IS NULL) are seeded at publish time and carry the
-- default 'new'; student clones inherit 'new' until their first attempt.
ALTER TABLE public.srs_items ADD COLUMN IF NOT EXISTS mastery_state TEXT NOT NULL DEFAULT 'new';
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'srs_items_mastery_state_check'
    ) THEN
        ALTER TABLE public.srs_items
            ADD CONSTRAINT srs_items_mastery_state_check
            CHECK (mastery_state IN ('new', 'learning', 'familiar', 'mastered', 'decaying'));
    END IF;
END $$;

-- Link to the skill-graph objective (nullable: legacy rows may not match a
-- generated objective; NEW items always set it).
ALTER TABLE public.srs_items
    ADD COLUMN IF NOT EXISTS objective_id UUID REFERENCES public.objectives(id) ON DELETE SET NULL;

-- Last FSRS review timestamp (distinct from the scheduling `next_review`).
ALTER TABLE public.srs_items ADD COLUMN IF NOT EXISTS last_review TIMESTAMPTZ;

-- Mastery-ladder progress (productive win count + window timestamps). Kept as
-- JSONB so the mastery thresholds (3 productive wins over >48h) can evolve
-- without a migration. Populated by services/learnerState.recordAttempt.
ALTER TABLE public.srs_items ADD COLUMN IF NOT EXISTS mastery_meta JSONB DEFAULT '{}'::jsonb;

-- Index for LearnerState lookups by objective (SRS-driven selection).
CREATE INDEX IF NOT EXISTS idx_srs_items_objective ON public.srs_items(objective_id);
-- Compound index for "this student's state for these objectives".
CREATE INDEX IF NOT EXISTS idx_srs_items_student_objective ON public.srs_items(student_id, objective_id);

-- Backfill objective_id for existing vocabulary templates where the word
-- matches a generated vocabulary objective (case-insensitive). Non-destructive:
-- only fills NULLs; never overwrites; ignores non-matching rows.
UPDATE public.srs_items s
SET objective_id = o.id
FROM public.objectives o
WHERE s.objective_id IS NULL
  AND s.word IS NOT NULL
  AND o.type = 'vocabulary'
  AND lower(trim(s.word)) = lower(trim(o.target_value));
