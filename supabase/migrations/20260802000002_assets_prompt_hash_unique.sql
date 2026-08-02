-- =====================================================================
-- assets: unique constraint on (prompt_hash, type) for dedup safety
-- ---------------------------------------------------------------------
-- B-DEDUP fix: imageGen.ts deduplicates by prompt_hash READ, but without
-- a unique constraint, concurrent fire-and-forget runs (orchestrate-lesson
-- + manual re-publish) can both miss the read and both insert → duplicate
-- asset rows + double image spend. This partial unique index ensures at
-- most one asset per (prompt_hash, type) combination.
--
-- Partial (WHERE prompt_hash IS NOT NULL): legacy rows and audio-without-
-- prompt rows have null prompt_hash; they must not violate the constraint.
-- The type discriminator keeps image/audio/video dedup independent.
--
-- Idempotent: dedupes existing duplicates first (keeps the oldest row),
-- then creates the index IF NOT EXISTS.
-- =====================================================================

-- Step 1: Remove existing duplicates (keep the row with the smallest id).
DELETE FROM public.assets a
USING public.assets b
WHERE a.id > b.id
  AND a.prompt_hash IS NOT NULL
  AND a.prompt_hash = b.prompt_hash
  AND a.type = b.type;

-- Step 2: Create the unique partial index.
CREATE UNIQUE INDEX IF NOT EXISTS assets_prompt_hash_type_uniq
  ON public.assets(prompt_hash, type)
  WHERE prompt_hash IS NOT NULL;
