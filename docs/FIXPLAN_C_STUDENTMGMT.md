# Workstream C — Student management data integrity

**Goal:** Reconcile the two parallel student models (legacy `class_enrollments`+`profiles` vs new `roster_students`) so all screens agree on student counts, the leaderboard reflects the board's source of truth, archiving actually removes a student everywhere, and the parent-link pipeline is consistent.
**Risk:** 🟡 Medium. One migration + several service-layer edits. Touches leaderboard/analytics which other features depend on — needs careful smoke testing.
**Status:** Plan drafted — awaiting approval to implement.

---

## C1. Make `archiveRosterStudent` cascade (P1)

**Bug:** `services/ManagementService.ts:177-183` only sets `is_archived=true`. It does not unlink `class_enrollments`, `parent_roster_links`, `parent_student_links`, or zero out `point_transactions`. A "removed" student still appears in Reports, DashboardHome, TeacherMessages, the leaderboard, and `class_analytics_view` — every screen that reads `class_enrollments`.

**Fix — prefer server-side cascade via a SECURITY DEFINER RPC** (so the cleanup can't be bypassed by a buggy client and runs with elevated privileges to delete rows the teacher normally can't see via RLS):

New migration **`supabase/migrations/20260726000002_archive_roster_cascade.sql`**:
```sql
CREATE OR REPLACE FUNCTION public.archive_roster_student(p_roster_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_class_id    uuid;
  v_profile_id  uuid;
  v_teacher_id  uuid;
  v_caller      uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT class_id, claimed_profile_id, teacher_id
    INTO v_class_id, v_profile_id, v_teacher_id
    FROM roster_students WHERE id = p_roster_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Caller must be admin, class teacher, or active school manager.
  IF NOT (
    EXISTS (SELECT 1 FROM profiles WHERE id = v_caller AND role = 'admin')
    OR v_teacher_id = v_caller
    OR EXISTS (SELECT 1 FROM classes c
               JOIN school_memberships sm ON sm.school_id = c.school_id
               WHERE c.id = v_class_id AND c.school_id IS NOT NULL
                 AND sm.user_id = v_caller AND sm.role='manager' AND sm.status='active')
  ) THEN
    RAISE EXCEPTION 'Not authorized to archive this roster student';
  END IF;

  -- 1. Soft-archive the roster row (board hides it).
  UPDATE roster_students SET is_archived = true WHERE id = p_roster_id;

  -- 2. Unlink the legacy enrollment (Reports/Dashboard/Messages hide it).
  IF v_profile_id IS NOT NULL THEN
    DELETE FROM class_enrollments
      WHERE class_id = v_class_id AND student_id = v_profile_id;
  END IF;

  -- 3. Archive parent links (new + legacy).
  UPDATE parent_roster_links
    SET status = 'archived'
    WHERE roster_student_id = p_roster_id AND status IN ('pending','active');

  IF v_profile_id IS NOT NULL THEN
    UPDATE parent_student_links
      SET status = 'archived'
      WHERE student_id = v_profile_id AND status IN ('pending','active');
  END IF;

  -- 4. Keep point_transactions as historical record (do NOT delete) — they
  --    feed aggregate analytics. The roster row being archived hides the
  --    student from future board interactions.
END;
$function$;
GRANT EXECUTE ON FUNCTION public.archive_roster_student(uuid) TO authenticated;
```

**Note:** the `parent_student_links.status` column may need an `'archived'` value added to its CHECK constraint — verify before running, or use a safe existing value. The `parent_roster_links.status` similarly needs checking.

**Client change** — `services/ManagementService.ts:177`:
```ts
export async function archiveRosterStudent(id: string): Promise<void> {
  const { error } = await supabase.rpc('archive_roster_student', { p_roster_id: id });
  if (error) throw error;
}
```

**Files:**
- New: `supabase/migrations/20260726000002_archive_roster_cascade.sql`
- Modified: `services/ManagementService.ts:177-183`

**Verification:**
- [ ] Archive a claimed student → row disappears from Reports, Dashboard, Messages, leaderboard within one refetch.
- [ ] Archive an unclaimed student → no error; board no longer shows them.
- [ ] A parent linked to the archived student no longer sees them in their dashboard.

---

## C2. Rebuild leaderboard + analytics over roster_students (P1)

**Bug:** `GamificationService.getLeaderboard` (`services/GamificationService.ts:331-`) filters by `class_enrollments` (line 340). `class_analytics_view` (migration `20260421000000`) is `LEFT JOIN class_enrollments`. **Both miss unclaimed roster students** — a teacher with 20 roster entries of which 5 are claimed sees 5 students on the leaderboard but 20 on the live board. The board's own "+5 XP to Everyone" iterates the roster. The two views disagree.

**Fix — two parts:**

### C2.1 New leaderboard source: roster-first

In `services/GamificationService.ts:331` replace the `class_enrollments` query with one over `roster_students` joined to `point_transactions` (the same source the board uses in `services/DataService.ts:119` `getSessionRoster`). The roster's `display_name` falls back to `profiles.full_name` when claimed:

```ts
// Pseudocode for the new query shape:
const { data } = await supabase
  .from('roster_students')
  .select(`
    id, display_name, avatar, team, claimed_profile_id,
    points:point_transactions(delta),
    profile:profiles!claimed_profile_id(full_name, avatar_url)
  `)
  .eq('class_id', classId)
  .eq('is_archived', false);
// then sum the deltas client-side (or use a view — see C2.2)
```

### C2.2 New `class_roster_analytics_view` (server-side, replaces `class_analytics_view`)

New migration **`supabase/migrations/20260726000003_roster_analytics_view.sql`**:
```sql
-- Drops nothing; adds a roster-first analytics view alongside the legacy one
-- so we can migrate consumers one at a time.
CREATE OR REPLACE VIEW public.class_roster_analytics_view AS
SELECT
  rs.class_id,
  rs.id             AS roster_student_id,
  COALESCE(p.full_name, rs.display_name) AS student_name,
  rs.claimed_profile_id,
  rs.is_archived,
  COALESCE(pt.points_total, 0) AS class_points,
  COALESCE(sp.xp, 0)           AS home_xp,
  COALESCE(pt.points_total,0) + COALESCE(sp.xp,0) AS total_points
FROM roster_students rs
LEFT JOIN profiles p         ON p.id = rs.claimed_profile_id
LEFT JOIN student_progress sp ON sp.student_id = rs.claimed_profile_id
LEFT JOIN (
  SELECT roster_id, SUM(delta) AS points_total
  FROM point_transactions
  GROUP BY roster_id
) pt ON pt.roster_id = rs.id
WHERE rs.is_archived = false;

GRANT SELECT ON public.class_roster_analytics_view TO authenticated;
```

Then point `getClassAnalytics` (`services/DataService.ts:441`) and the leaderboard at the new view. Leave `class_analytics_view` in place for now (other consumers may exist); deprecate after C2.1 + C2.2 land and stabilize.

**Files:**
- New: `supabase/migrations/20260726000003_roster_analytics_view.sql`
- Modified: `services/GamificationService.ts:331` (`getLeaderboard`)
- Modified: `services/DataService.ts:441` (`getClassAnalytics`)

**Verification:**
- [ ] A class with 20 roster entries (5 claimed) shows 20 students on the leaderboard with their board points.
- [ ] Points awarded via the board (workstream B2) appear on the leaderboard within one refetch.
- [ ] Reports dashboard student count matches the board.

---

## C3. Fix `decide_parent_roster_link` 2-arg call (P1)

**Bug:** `supabase/migrations/20260715000006_parent_links_approval.sql:114` calls `public.is_school_manager(rec.school_id)` (1-arg). `supabase/migrations/20260720000002_authuid_in_policy_helpers.sql:41` does `DROP FUNCTION IF EXISTS public.is_school_manager(uuid)` and recreates it as 2-arg `is_school_manager(school_uuid, p_user)` at line 45. The body of `decide_parent_roster_link` is never updated. **The school-manager branch of the approval RPC throws `function is_school_manager(uuid) does not exist` at runtime.** Admin and class-teacher branches short-circuit before that line and still work.

**Fix:** new migration **`supabase/migrations/20260726000004_fix_decide_parent_link.sql`** that `CREATE OR REPLACE`s `decide_parent_roster_link` with the corrected call:
```sql
... OR (rec.school_id IS NOT NULL
        AND public.is_school_manager(rec.school_id, auth.uid())) ...
```
Reproduce the rest of the function body from `20260715000006:90-134` verbatim; only the `is_school_manager` line changes.

**Files:**
- New: `supabase/migrations/20260726000004_fix_decide_parent_link.sql`

**Verification:**
- [ ] As a school manager (not the class teacher), approve a parent link → succeeds (no `function ... does not exist` error).
- [ ] As admin, the existing approval path still works.

---

## C4. Bridge the two parent-link tables (P1)

**Bug:** `parent_roster_links` (new, approval-gated, used by `ManagementService`) and `parent_student_links` (legacy, used by `getParentStudents` in `services/DataService.ts:493`, which feeds `ParentDashboard`/`ParentReports`/`ParentSettings`/`ParentMessages`) are not bridged. A parent who connects-via-token and is approved appears in the teacher's "Approvals" queue (`parent_roster_links`) but **does not appear in their own dashboard** (`getParentStudents` reads the legacy table). The parent will think the link is broken.

**Fix — choose direction:**

**Option A (recommend): migrate `getParentStudents` to read `parent_roster_links`** (the new source of truth). The view joins `roster_students` → `profiles` (via `claimed_profile_id`) so the parent sees both claimed-name and roster-name.

```ts
// services/DataService.ts:493 — replace the parent_student_links query
const { data } = await supabase
  .from('parent_roster_links')
  .select(`
    roster_student_id,
    status,
    roster:roster_students(
      id, display_name, class_id, claimed_profile_id,
      profile:profiles!claimed_profile_id(full_name, avatar_url, email)
    )
  `)
  .eq('parent_id', userId)
  .eq('status', 'active');
```

**Option B (one-way bridge trigger):** on `parent_roster_links` INSERT (approved), also INSERT into `parent_student_links`. Keeps both tables populated. More moving parts; prefer A unless there are external consumers of the legacy table.

**Files (Option A):**
- Modified: `services/DataService.ts:493` (`getParentStudents`)
- Possibly: a backfill migration to copy any existing approved `parent_roster_links` into the read path (none needed if the read now goes straight to the new table).

**Verification:**
- [ ] Parent approves a roster link, teacher approves → parent dashboard shows the student.
- [ ] Parent of a legacy (`parent_student_links`) student still sees them (verify whether the legacy table has live rows; if not, no backfill needed).

---

## C5. Stop shipping `claim_token` to the browser (P2)

**Bug:** `services/ManagementService.ts:131-143` (`getRosterForClass`) uses `select('*')`, returning the one-time claim token to the browser for every roster row. RLS limits this to the class teacher/manager/admin, but it's unnecessary surface area — anyone with manager access to the school can harvest unused claim tokens for every student in every class.

**Fix:** replace `select('*')` with an explicit column list excluding `claim_token` (and `claim_token_expires_at`). Add a separate, narrowly-scoped admin/teacher-only method `getRosterClaimToken(rosterId)` that returns the token for a single row when the teacher actually needs to share it.

**Files:**
- Modified: `services/ManagementService.ts:131-143`
- New: `getRosterClaimToken` helper (same file).

**Verification:**
- [ ] Browser DevTools → network → roster response no longer contains `claim_token`.
- [ ] "Copy claim link" button in ClassManagement still works (uses the new single-row method).

---

## C6. "Regenerate claim link" affordance (P2)

**Bug:** once the teacher closes the success toast after adding a roster student, or the realtime reload hides the "Claim link" button after a claim, there's no UI to issue a fresh token for an unclaimed student. The DB rotates the token on claim, so the old one is dead — but for an unclaimed student whose link was lost, the only path is "Remove + re-add."

**Fix:** add a `regenerate_roster_claim_token(p_roster_id)` SECURITY DEFINER RPC (admin/teacher/manager authorized) that sets a fresh `claim_token` + `claim_token_expires_at`. Add a "Regenerate link" button in `ClassManagement.tsx` for unclaimed rows.

**Files:**
- New: `regenerate_roster_claim_token` in the C1 migration or its own.
- Modified: `services/ManagementService.ts` (client wrapper).
- Modified: `apps/teacher/ClassManagement.tsx` (button).

---

## C7. Surface "unclaimed — grading won't stick" to the teacher (P2)

**Bug:** `store/SessionContext.tsx:598-613` `gradeStudent()` returns early if `roster?.claimed_profile_id` is null. Since the roster intentionally includes unclaimed kids (the whole point of roster-first), a large fraction of spins in a real classroom produce **no cognitive capture at all** and no feedback that nothing was recorded.

**Fix (UX, not data):** when grading an unclaimed student, show a non-blocking toast/inline note on the commander: "Student hasn't claimed their account yet — grading isn't recorded." Don't block the flow; just inform.

**Files:**
- Modified: `store/SessionContext.tsx:598-613` (return a status enum instead of void).
- Modified: callers (`LiveCommander.tsx`, `TeacherRemote.tsx`) to surface the toast on the "unclaimed" status.

---

## Sequencing within C

1. **C1 (cascade archive)** — unblocks correct counts everywhere downstream.
2. **C3 (2-arg `is_school_manager`)** — one-line correctness fix; quick win.
3. **C2 (leaderboard + analytics over roster)** — biggest "screens agree" win; do after C1 so archived kids are excluded consistently.
4. **C4 (parent-link bridge)** — depends on C2's roster-first direction conceptually but technically independent.
5. **C5, C6, C7 (P2 cleanups)** — independent; batch or defer.

---

## Overall verification (do all before marking C complete)

- [ ] Archive a claimed student → disappears from Reports, Dashboard, Messages, leaderboard.
- [ ] Leaderboard student count == board student count == roster student count for a test class.
- [ ] Board-awarded points appear on the leaderboard within one refetch.
- [ ] School manager can approve a parent link (no `is_school_manager` error).
- [ ] Approved parent sees their child in their parent dashboard.
- [ ] `claim_token` is not present in the roster network response.
- [ ] "Regenerate link" produces a working new claim URL for an unclaimed student.
