# Workstream A — Capture untracked roster/attendance RPCs

**Goal:** Bring 4 SECURITY DEFINER RPCs that exist only on the cloud DB into version control, so a fresh `supabase db push` reproduces them.
**Risk:** 🟢 Low. The migration is `CREATE OR REPLACE` of definitions that are already live; re-running on the current cloud is a no-op.
**Status:** ✅ Migration file drafted — awaiting approval to apply.

---

## Background

The TypeScript service layer calls four RPCs that have been working in production but were never committed to a local migration file:

| RPC | Caller | Purpose |
|---|---|---|
| `create_roster_student` | `services/ManagementService.ts:151`, `apps/teacher/AttendanceModal.tsx:49` | Insert one roster_students row |
| `create_session_occurrence` | `services/AttendanceService.ts:41`, `store/SessionContext.tsx:506` | Open a live-session occurrence |
| `save_attendance_records` | `services/AttendanceService.ts:83` | Upsert attendance rows |
| `end_session_occurrence` | `services/AttendanceService.ts:50`, `store/SessionContext.tsx:541` | Close an occurrence |

**Drift confirmed:** `grep -rn "CREATE FUNCTION.*<name>" supabase/` returns no matches for all four. The functions were created directly via the cloud SQL editor during the roster/attendance work.

**Risk if unfixed:** any environment rebuild — CI reset, disaster recovery, a teammate's fresh clone + `db push` — would silently lose these. The app would then throw at runtime when adding a student or saving attendance.

---

## What's already done

The migration file is drafted:
- **`supabase/migrations/20260726000001_codify_roster_attendance_rpcs.sql`**

It captures the EXACT definitions currently live on `xsdnzijketjnzhakqtit`, pulled verbatim via the Supabase Management API on 2026-07-26. All four are:
- `SECURITY DEFINER` — run as the function owner (postgres), bypassing RLS so the inner profile/class lookups don't recurse.
- `SET search_path TO 'public'` — schema-injection hardening.
- Authorized by: `profiles.role = 'admin'` OR `classes.teacher_id = auth.uid()`. `create_roster_student` additionally allows an active school manager on the class's school.
- `CREATE OR REPLACE` — idempotent. Re-running on a DB that already has these is a no-op behaviorally.

The dependent tables (`class_session_occurrences`, `attendance_records`) already match between disk and cloud (verified against `20260723000003_attendance_records.sql`), so no schema reconciliation is needed — only the functions.

---

## Execution steps

1. **Review** `supabase/migrations/20260726000001_codify_roster_attendance_rpcs.sql`.
2. **Apply** via Supabase MCP:
   - `supabase_apply_migration` with the file path, OR
   - `supabase_execute_sql` with the contents, OR
   - backup CLI path: `supabase db push` against the pooler URL (AGENTS.md §7).
3. **Verify** (see checklist below).

> ⚠️ Do NOT use the direct `db.xsdnzijketjnzhakqtit.supabase.co` host (TLS-EOF blocker; AGENTS.md §9).

---

## Verification checklist

After applying:

- [ ] Migration shows as applied on cloud: `supabase migrations list` shows `20260726000001` as ✓.
- [ ] All four functions present and match:
  ```sql
  SELECT proname, prosecdef, config
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND proname IN
    ('create_roster_student','create_session_occurrence',
     'save_attendance_records','end_session_occurrence');
  ```
  Expect 4 rows, all `prosecdef = true`, all with `search_path='public'`.
- [ ] Smoke test (browser, signed in as teacher): add a roster student in ClassManagement → succeeds.
- [ ] Smoke test: open AttendanceModal for a live class → save attendance → row appears in `attendance_records`.
- [ ] Smoke test: end the session → `class_session_occurrences.ended_at` is non-null for the active row.

---

## Notes / follow-ups (not in this workstream)

- The `end_session_occurrence` function silently no-ops if the occurrence is already ended or not owned by the caller. This is intentional (idempotent) but means a buggy client that thinks it ended a session when it didn't won't get an error. Acceptable for now.
- `save_attendance_records` requires the client to pass `p_records` as a JSON array of `{roster_student_id, status, marked_at}`. The TS caller (`AttendanceService.ts:83`) builds this correctly; no change needed.
- None of these functions emit audit-log rows. If audit coverage for roster/attendance writes is desired, add `audit_action(...)` calls in a follow-up (workstream D scope).
