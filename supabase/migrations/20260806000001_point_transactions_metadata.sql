-- =====================================================================
-- Phase 1 (architecture §3.1 / §4.4, owner decision 1 resolved 2026-08-05):
-- add a `metadata` JSONB column to point_transactions so a SEPARATE, non-
-- debounced write path can carry the per-attempt correctness signal
-- ('correct' | 'incorrect' | 'partial') for honest Class Accuracy /
-- Struggling Students analytics.
--
-- Why a separate path (not the existing debounced points flush):
--   addPoints() debounces 1500ms per student — a +30 success and a −5
--   mistake in the same window coalesce into ONE ledger row. A single
--   metadata.correctness value on that row would be meaningless. So game
--   code calls BOTH: addPoints(id, delta) for the leaderboard (existing,
--   untouched) AND recordAttempt(...) for analytics (new path), the latter
--   writing amount=0, source='attempt', metadata={correctness, ...}. Every
--   attempt gets its own row.
--
-- The column is nullable so existing rows + the existing points flush are
-- unaffected. Analytics filters `source = 'attempt'` (or `metadata ? 'correctness'`).
-- =====================================================================

ALTER TABLE public.point_transactions
    ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Index the correctness-analytics path: rows carrying a correctness signal.
-- Partial index keeps it small (the vast majority of historical rows have no
-- metadata and aren't indexed).
CREATE INDEX IF NOT EXISTS idx_pt_correctness
    ON public.point_transactions (class_id, created_at)
    WHERE metadata ? 'correctness';

-- Grant + RLS: the metadata column inherits the table's existing policies
-- (point_transactions_select_policy / _insert_policy / _update_policy already
-- cover all columns). No new policy needed — the table already allows the
-- class's teacher to read and insert. Verified against
-- 20260721000001_live_integration_ledger.sql.
