-- =====================================================================
-- 20260715000001 — add_manager_role (enum only)
-- A new enum value MUST be added in its own committed transaction: Postgres
-- forbids using a new value in the same transaction that creates it
-- (SQLSTATE 55P04). All helpers/policies that reference 'manager' live in
-- later migrations (own transactions), so this split is required and is also
-- correct for a fresh `supabase db push` (which wraps each file in one txn).
-- =====================================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'manager';
