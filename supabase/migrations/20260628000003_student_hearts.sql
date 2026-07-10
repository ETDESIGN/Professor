-- =====================================================================
-- Phase 0 (foundation) — Hearts columns on student_progress
-- ---------------------------------------------------------------------
-- Hearts are a REAL, scarce resource now (resolves audit Bug #9: cosmetic,
-- reset-every-lesson local state). The economy is compute-on-read (no
-- pg_cron, which is not configured): displayed hearts =
--   min(5, hearts + floor(elapsed_since_hearts_updated_at / 4h))
-- Productive errors cost 1 (write hearts-1, bump hearts_updated_at);
-- receptive errors warn only; completing a review restores 1.
-- Compute-on-read lives in services/learnerState.ts.
-- =====================================================================

ALTER TABLE public.student_progress
    ADD COLUMN IF NOT EXISTS hearts INTEGER NOT NULL DEFAULT 5;

ALTER TABLE public.student_progress
    ADD COLUMN IF NOT EXISTS hearts_updated_at TIMESTAMPTZ DEFAULT NOW();

-- Existing students start full.
UPDATE public.student_progress SET hearts = 5 WHERE hearts IS NULL;
UPDATE public.student_progress SET hearts_updated_at = NOW() WHERE hearts_updated_at IS NULL;
