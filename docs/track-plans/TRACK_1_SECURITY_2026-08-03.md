# TRACK 1 — Security Hardening (P0-3 + P1-9/10/11)

> **Status:** Implementation-ready · **Date:** 2026-08-03
> **Scope:** Pure SQL migrations. **Zero frontend, zero function-code changes.**
> **Isolation:** No overlap with the pipeline session unless it is also writing RLS migrations — coordinate on migration timestamps only (see Coordination below).
> **Estimated effort:** 1.5–2.5 hours · **Deploy:** `supabase_apply_migration` per file, then verify with SQL probes.
> **Parent roadmap:** `docs/AUDIT_ROADMAP_2026-08-02.md` (P0-3, P1-9, P1-10, P1-11)

---

## Goal

Close the live answer-key leak (P0-3, **highest priority — actively bleeding**) and the remaining permissive-RLS + blocking-FK + missing-GRANT issues (P1-9/10/11). All four are pure schema, so this track is the safest to run in parallel — it touches only new migration files.

---

## Files this track owns (exclusive)

```
supabase/migrations/2026MMDD000001_fix_content_tables_rls_regression.sql   ← P0-3 (NEW)
supabase/migrations/2026MMDD000002_fix_audit_logs_grant_and_fk.sql         ← P1-11 + P1-10(audit_logs)
supabase/migrations/2026MMDD000003_fix_assets_owner_fk.sql                 ← P1-10(assets)
supabase/migrations/2026MMDD000004_tighten_assets_srs_parent_rls.sql       ← P1-9
```

**This track must NOT touch:** any file under `supabase/functions/`, any `apps/**`, any `services/**`, any existing migration (new files only).

---

## Step 1 — P0-3: Fix the content-tables RLS regression (DO THIS FIRST, SOLO)

**Problem:** `20260802000003_content_tables_rls_authenticated.sql` re-added `OR auth.role() = 'authenticated'` to the SELECT policies of `vocabulary_items`, `story_pages`, `dialogue_lines`, `grammar_rules`. Any authenticated student can SELECT every unit's answer-bearing content (distractors, `grammar_rules.error_examples[].correct`, comprehension answers).

**Pattern to copy:** `20260628000005_rls_hardening.sql:18-44` — owner-OR-admin-OR-enrolled-in-an-assigned-class.

**Critical nuance (verified):** the 4 tables' current policies also contain an `OR ... teacher_id IS NULL` clause (lines 22/33/44/55 of the regression migration). This is the **textbook-template case** (units created without an owner) and is **intentional** — the new migration must *keep* it and only drop the `authenticated` clause.

**New file:** `supabase/migrations/2026MMDD000001_fix_content_tables_rls_regression.sql`

For each of the 4 tables, `DROP POLICY IF EXISTS "<table>_select_policy"` then recreate with:

```sql
CREATE POLICY "<table>_select_policy"
    ON public.<table> FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = <table>.unit_id AND u.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = <table>.unit_id AND u.teacher_id IS NULL)
        OR (SELECT public.is_teacher_or_admin())
        OR EXISTS (
            SELECT 1 FROM public.class_enrollments ce
            JOIN public.assignments a ON a.class_id = ce.class_id
            WHERE ce.student_id = auth.uid() AND a.unit_id = <table>.unit_id
        )
    );
```

That is: drop the `OR auth.role() = 'authenticated'` line, add the enrollment clause. Repeat verbatim for `vocabulary_items`, `story_pages`, `dialogue_lines`, `grammar_rules`. Keep the header comment explaining *why* (cite the regression migration by name).

**Verify before deploy** (read-only probe via MCP/Management API):
```sql
-- Should still return rows for the owner, none for an unenrolled student.
SELECT count(*) FROM vocabulary_items WHERE unit_id = '<a real unit id>';
```
**Verify after deploy:** re-run as an enrolled student (rows) vs an unenrolled authenticated student (0 rows). Also confirm `get_unit_bundle` RPC (SECURITY DEFINER, bypasses RLS) still returns content — it must, since it's the student's actual read path.

---

## Step 2 — P1-11 + P1-10(audit_logs): audit_logs GRANT + FK

**Problem (P1-11):** `audit_logs` has SELECT policies but no `GRANT SELECT TO authenticated` → Postgres privilege checks fail before RLS → admin audit-log viewing is silently broken from the client. Also the "Admins read all" policy body is `role IN ('admin','teacher')` (grants teachers, contradicts the name).

**Problem (P1-10):** `audit_logs.actor_id` FK to `profiles(id)` has no `ON DELETE` → deleting a user with audit rows raises FK violation → `manage-school-members delete_user` throws.

**New file:** `supabase/migrations/2026MMDD000002_fix_audit_logs_grant_and_fk.sql`

```sql
-- P1-11: grant SELECT so the existing RLS policies can take effect
GRANT SELECT ON public.audit_logs TO authenticated;

-- Fix the mis-named policy: scope to admin only (rename + tighten)
DROP POLICY IF EXISTS "Admins can read all audit logs" ON public.audit_logs;
CREATE POLICY "Admins can read all audit logs"
    ON public.audit_logs FOR SELECT TO authenticated
    USING ((SELECT public.is_role('admin')));   -- verify is_role signature exists; fallback: raw role check

-- P1-10: allow user deletion to preserve the audit trail (SET NULL on actor_id)
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;
ALTER TABLE public.audit_logs
    ADD CONSTRAINT audit_logs_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
```

**Verify before writing:** read `20260420000003_audit_and_indexes.sql` and `20260715000002_manager_role_helpers.sql` to confirm (a) the exact existing constraint name, (b) whether `is_role('admin')` exists or whether to use `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')`. Don't assume — these are the kinds of helpers the audit found drifting.

---

## Step 3 — P1-10(assets): assets.owner_id FK

**Problem:** `assets.owner_id UUID REFERENCES auth.users(id)` (`20260730000006_unit_media_and_assets.sql:82`) has no `ON DELETE` → deleting a teacher who owns assets FK-blocks.

**New file:** `supabase/migrations/2026MMDD000003_fix_assets_owner_fk.sql`

```sql
-- Allow user deletion; assets are retained (owner_id set NULL) per the vault soft-delete model.
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_owner_id_fkey;
ALTER TABLE public.assets
    ADD CONSTRAINT assets_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;
```
**Verify before writing:** read `20260730000006` to get the exact existing constraint name (could be auto-named `assets_owner_id_fkey` or similar).

---

## Step 4 — P1-9: tighten assets + srs_items + legacy parent_student_links

**Three sub-issues, one migration file:** `supabase/migrations/2026MMDD000004_tighten_assets_srs_parent_rls.sql`

**(a) `assets` SELECT is `USING (true)` to anon + authenticated** (`20260417000002:20`). Scope to owner / teacher-in-unit / student-enrolled / admin. Mirror the P0-3 enrollment clause, joining through `units` (assets link to units via `unit_id` — verify the column name in `20260417000002`).

**(b) `srs_items` template reads leak curriculum** (`20260517000001:8-15`) — any student reads every unit's vocab templates regardless of enrollment. Tighten the `student_id IS NULL` branch to additionally require enrollment in a class with an assignment to that unit:

```sql
-- template rows: only readable by students enrolled in a class assigned the unit
... OR (
    srs_items.student_id IS NULL
    AND EXISTS (
        SELECT 1 FROM public.class_enrollments ce
        JOIN public.assignments a ON a.class_id = ce.class_id
        WHERE ce.student_id = auth.uid() AND a.unit_id = srs_items.unit_id
    )
)
```
**Verify before writing:** confirm `srs_items` has a `unit_id` column (read `20260517*` and any FSRS migration). The audit flagged possible type drift on `srs_items` keys.

**(c) Legacy `parent_student_links` allows self-claim** (`20260320000003:146`). Decision required (see Open Questions): enforce approval-state at the policy level (mirror `parent_roster_links.status`), or deprecate the legacy table. **Default if unanswerable:** add a policy-level check `approved_at IS NOT NULL` on the parent's SELECT/UPDATE so un-approved links are inert, and leave deprecation for a later cleanup.

---

## Verification (run after all 4 migrations applied)

SQL probes via MCP `supabase_execute_sql` (Management API):
1. `SELECT has_table_privilege('authenticated','audit_logs','SELECT');` → `true`.
2. `SELECT (polqual) FROM pg_policy WHERE polname LIKE '%select%' AND polrelid = 'vocabulary_items'::regclass;` → contains the enrollment clause, NOT `auth.role()`.
3. `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'audit_logs_actor_id_fkey';` → contains `ON DELETE SET NULL`.
4. End-to-end RLS check: impersonate an unenrolled authenticated student (or reason about it) — should see 0 rows on the 4 content tables; an enrolled student sees rows.

Then run `/verify` for the standard probe set.

---

## Coordination with the pipeline session

- **If the pipeline session is NOT writing RLS:** zero conflict. This track is fully independent.
- **If the pipeline session IS writing RLS** (e.g. re-doing objectives/pool_items): the only shared resource is **migration filename timestamps**. Pick timestamps strictly later than any file the other session creates (use `2026080300000X` and confirm no collision before commit). No same-file edits across the two tracks.
- **Do not** touch `enrich-unit`/`orchestrate-lesson`/`generate-exercises`/`extract-page`/`_shared/ai.ts` — those are the pipeline session's domain even if a security fix *could* live there.

---

## Open questions (resolve before Step 4)

1. **Legacy `parent_student_links`:** enforce-approval (default) vs deprecate? — needs product/owner call; defaulting to enforce-approval.
2. **`is_role('admin')` helper signature** — verify in `manager_role_helpers.sql` before using; fallback to inline `EXISTS (...)`.
3. **`srs_items.unit_id` and `assets.unit_id` column names** — verify before writing the enrollment-clause joins.

---

## Done = 

- [ ] Step 1 migration applied + verified (P0-3 closed)
- [ ] Step 2 migration applied + verified (P1-11, P1-10-audit closed)
- [ ] Step 3 migration applied + verified (P1-10-assets closed)
- [ ] Step 4 migration applied + verified (P1-9 closed)
- [ ] Strike through P0-3, P1-9, P1-10, P1-11 in `AUDIT_ROADMAP_2026-08-02.md` with commit refs
