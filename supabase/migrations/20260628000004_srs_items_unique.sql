-- =====================================================================
-- Unique constraint on srs_items(student_id, objective_id)
-- ---------------------------------------------------------------------
-- Backs the atomic upsert in services/learnerState.recordAttempt so
-- concurrent attempts can never create duplicate per-student/per-objective
-- rows (the read-modify-write race). NULL student_id (templates) rows are
-- unaffected — Postgres treats NULLs as distinct, so multiple template rows
-- remain allowed (templates are keyed by unit+word, not this pair).
--
-- Safe to apply on existing data: duplicates are de-duplicated first (keep the
-- most-recently-reviewed row per student+objective), so the constraint cannot
-- fail mid-way. Non-destructive to non-duplicated progress.
-- =====================================================================

-- 1. De-duplicate: for each (student_id, objective_id) with >1 row, keep the
--    row with the latest last_review (ties broken by latest next_review / id).
--    Operates only on student-scoped rows (student_id IS NOT NULL).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY student_id, objective_id
           ORDER BY last_review DESC NULLS LAST, next_review DESC NULLS LAST, id DESC
         ) AS rn
  FROM public.srs_items
  WHERE student_id IS NOT NULL AND objective_id IS NOT NULL
)
DELETE FROM public.srs_items
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Add the unique constraint (idempotent guard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'srs_items_student_objective_key'
  ) THEN
    ALTER TABLE public.srs_items
      ADD CONSTRAINT srs_items_student_objective_key UNIQUE (student_id, objective_id);
  END IF;
END $$;
