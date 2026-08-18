-- ============================================
-- Live turn state (FIXPLAN E Phase 2, E2.1)
-- --------------------------------------------
-- The projector board, teacher remote and live commander each run their own
-- tab. Until now everything about the CURRENT TURN (picked responder, turn
-- token, spin choreography timestamps, wheel overlay, quiet/selection modes,
-- teams) was transient broadcast-only state: a board refresh mid-turn lost
-- the picked student, and if the picking tab died mid-spin the wheel stayed
-- open everywhere with nothing to recover from (audit 09 §3.2/§3.4).
--
-- live_state makes that state authoritative on the same one-row-per-teacher
-- session the surfaces already subscribe to. The broadcast channel stays the
-- fast path (LIVE_STATE snapshots with a seq); this row is the truth every
-- tab reconciles to on mount / refresh / reconnect.
--
-- seq is a compare-and-swap guard for writers: an update pins the expected
-- seq and writes seq + 1, so concurrent writers (commander + remote) cannot
-- silently overwrite each other's turn state (audit 09 §3.5).
--
-- Shape (application-owned, see store/liveTurnState.ts):
--   { responderId, turnToken, turnStartedAt, revealAt,
--     overlay: 'NONE'|'QUICK_WHEEL', quietMode, selectionMode, teams }
--
-- The table already participates in the supabase_realtime publication
-- (20260619000000_classroom_sessions.sql), so postgres_changes UPDATE events
-- stream the new columns with no publication change. RLS policies already
-- cover UPDATE for the owning teacher. Idempotent — safe to re-run.
-- ============================================

ALTER TABLE public.classroom_sessions
  ADD COLUMN IF NOT EXISTS live_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS seq BIGINT NOT NULL DEFAULT 0;
