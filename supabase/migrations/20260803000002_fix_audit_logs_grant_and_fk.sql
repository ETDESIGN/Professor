-- =====================================================================
-- 20260803000002 — Fix audit_logs: GRANT SELECT + tighten admin policy + FK
-- ---------------------------------------------------------------------
-- P1-11: audit_logs has RLS policies but no GRANT SELECT TO authenticated.
-- Postgres privilege checks fail BEFORE RLS evaluation, so admin audit-log
-- viewing is silently broken from the client. Add the GRANT.
--
-- P1-11 (policy): The "Admins read all audit logs" policy body was
-- `role IN ('admin','teacher')` — granting teachers access (contradicts
-- the policy name and intent). Tighten to admin-only via is_role('admin').
--
-- P1-10: audit_logs.actor_id FK to profiles(id) has no ON DELETE clause.
-- Deleting a user who has audit rows raises an FK violation, blocking
-- manage-school-members delete_user. Change to ON DELETE SET NULL so the
-- audit trail is preserved (actor becomes NULL) while allowing deletion.
-- =====================================================================

-- ── 1. GRANT SELECT so RLS policies can actually take effect ─────────
GRANT SELECT ON public.audit_logs TO authenticated;

-- ── 2. Tighten the "Admins read all" policy to admin-only ────────────
DROP POLICY IF EXISTS "Admins read all audit logs" ON public.audit_logs;
CREATE POLICY "Admins read all audit logs"
    ON public.audit_logs FOR SELECT TO authenticated
    USING ((SELECT public.is_role('admin')));

-- ── 3. ON DELETE SET NULL on actor_id FK ─────────────────────────────
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;
ALTER TABLE public.audit_logs
    ADD CONSTRAINT audit_logs_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
