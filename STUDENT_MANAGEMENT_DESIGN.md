# Student Management Module — Architecture, Gap Analysis & Design

> Status: design + Phase-1 (additive) implementation. Grounded in a live audit of
> the `xsdnzijketjnzhakqtit` database (all migrations through `20260628000005`
> are applied — note: AGENTS.md §3/§9 stating 6 are *pending* is stale).
>
> Scope: the **student/teacher/manager/parent management architecture** — roles,
> tenancy (schools), affiliation, roster students + claim, parent linking,
> access control. It does **not** re-plumb the live-classroom LearnerState (that
> is the `LIVE_BOARD_REDESIGN.md` track).

---

## 0. Decisions driving this design (confirmed with owner)

| # | Decision | Implication |
|---|---|---|
| D1 | **Multi-tenant** | New `schools` table + new `manager` role; teachers/managers scoped per school. |
| D2 | **Teachers may be independent** | A teacher with no active `school_memberships` row operates solo. Affiliation is a **request** a manager approves; until approved the teacher stays independent. |
| D3 | **Students = roster placeholders + later claim** | Teachers create **no-auth** roster records (matches the no-device classroom model). A home account later **claims** a roster entry via a one-time token. |
| D4 | **Manager = full teacher CRUD + class assignment** | Manager creates/edits/disables teacher accounts and assigns them to classes **within their school**. |
| D5 | **Approval-gated links** | Teacher↔school requests and parent↔student links both require human approval (manager / teacher-or-manager respectively). |
| D6 | **Deliverable** | This analysis + implemented SQL/RLS + deploy. Phase-1 (additive, prod-safe) deployed now; Phase-2 (re-tenanting of *existing* broad policies) is documented and QA-gated. |

---

## 1. Current state (as audited on live)

### 1.1 Roles
- `user_role` enum: **`admin, teacher, student, parent`** — **no `manager`**.
- Role is resolved by `public.is_role(required_role)` which reads **`auth.jwt()->'app_metadata'->'role'`** (the no-recursion variant, migration `20260420000005`). It does **not** fall back to `profiles.role`, so any role whose `app_metadata.role` is unset is invisible to every RLS policy. This is a latent correctness bug for self-signups.
- `public.is_teacher_or_admin()` = `is_role('teacher') OR is_role('admin')`.

### 1.2 Identity & the two "student" concepts
| Table | PK / key | What it is |
|---|---|---|
| `profiles` | `id UUID = auth.users.id` | The **auth** identity. `role`, email, name, Stripe/billing columns. |
| `students` | `id UUID` → **FK `profiles(id)` ON DELETE CASCADE** (`fk_students_profile`) | A **1:1 game-state mirror** of an auth profile (`name, avatar, points, level, team`). Because of the FK, **a row cannot exist without an auth account.** |
| `class_enrollments` | `(class_id, student_id)` where `student_id → profiles(id)` | Class membership is keyed on **auth profiles**. |

**Consequence:** there is currently **no such thing as a roster-only student.** Every "student" presupposes a real login. This directly conflicts with D3 (no-device classroom + teacher-created placeholders).

### 1.3 Tenancy
- **There is no `schools` entity.** `classes.teacher_id → profiles(id)` is the only ownership link. Nothing for a teacher to "affiliate with," nothing for a manager to "manage."
- `units.teacher_id` exists (tenant isolation added in `20260622000001`).

### 1.4 Parent ↔ student
- `parent_student_links(parent_id, student_id, relationship, approved_at, created_at)` where both FK → `profiles`.
- `approved_at` exists but **RLS lets any parent self-insert a link to any student** with `approved_at = NULL`, and nothing checks it. There is **no approver, no `approved_by`, no status**. A parent could silently attach to any child's account.

### 1.5 Messaging
- `messages(sender_id, receiver_id, content, read, created_at)` — **1:1 only.** No announcements, no class/school broadcast, no parent↔teacher thread abstraction, no group/thread model.

### 1.6 Existing RLS weaknesses (security)
- **`students` SELECT** (`tier0`): `id = auth.uid() OR is_teacher_or_admin()` — **any teacher reads every student row** in the system (global, not roster-scoped).
- **`profiles` SELECT** (`tier0`): `id = auth.uid() OR is_teacher_or_admin()` — any teacher sees every user's profile (emails, Stripe ids).
- **`class_enrollments` teacher branch** correctly scopes to `teacher_id = auth.uid()` — this is the one good scoping precedent to clone.
- **`srs_items` teacher writes** were already tightened in `20260628000005` to require the target student be enrolled in the caller's class — the pattern to follow for the rest.
- `audit_logs` exists (`action, actor_id, target_type, target_id, metadata, created_at`) but nothing writes manager/account-provisioning events.

### 1.7 Account creation today
- `handle_new_user()` (trigger on `auth.users`) creates a `profiles` row from `raw_user_meta_data`. There is **no admin "create user" path** in SQL — creating a teacher/manager **auth** account requires `auth.admin.createUser` (service-role only), i.e. an Edge Function or the dashboard. RLS/SQL alone can manage *memberships*, not mint auth accounts.

---

## 2. Required state (target architecture)

### 2.1 Entity-relationship map

```
                         ┌──────────────┐
                         │   profiles   │  (auth identity; role ∈ admin/manager/teacher/student/parent)
                         └──────┬───────┘
            ┌───────────────────┼────────────────────────────────────────────┐
            │                   │                                            │
   ┌────────┴─────────┐  ┌──────┴────────┐                          ┌────────┴────────┐
   │ school_memberships│  │ roster_students│                         │ parent_student_  │
   │ (user↔school,     │  │ (no-auth class  │                         │ links (legacy,   │
   │  role, status)    │  │  roster + claim)│                         │  profile↔profile)│
   └────────┬─────────┘  └──────┬─────────┘                          └──────────────────┘
            │                   │
   ┌────────┴─────────┐   ┌─────┴──────────┐    ┌──────────────────┐
   │     schools      │   │    classes     │───▶│ parent_roster_   │
   │ (multi-tenant)   │   │ (+ school_id)  │    │ links (approval) │
   └──────────────────┘   └────────────────┘    └──────────────────┘
                                  │
                          ┌───────┴────────┐
                          │class_enrollments│  (existing; profile-keyed)
                          └────────────────┘
```

**Relationships & cardinalities**
| Relationship | Type | Notes |
|---|---|---|
| `schools` 1—N `school_memberships` | cascade | A school has many members. |
| `profiles` 1—N `school_memberships` | restrict | A user can be member of several schools; at most one **active** membership per (school,user). |
| `profiles`(role=manager) 1—1 `schools.owner_id` | set null | The creating manager (informational). Real authority = active `manager` membership. |
| `classes.school_id` N—1 `schools` | set null | Null = independent-teacher class. |
| `roster_students.class_id` N—1 `classes` | cascade | A roster entry belongs to one class. |
| `roster_students.teacher_id` N—1 `profiles` | cascade | The teacher who created/owns it. |
| `roster_students.claimed_profile_id` 1—1 `profiles` | set null | Null until a home account claims it. |
| `parent_roster_links` (parent ↔ roster_student) | unique pair | Approval-gated; replaces the un-gated profile link for roster students. |

### 2.2 Role-permission matrix (target)

| Capability | admin | manager | teacher (independent) | teacher (school, active) | student | parent |
|---|---|---|---|---|---|---|
| Create/edit own classes | ✓ | ✓ (in own school) | ✓ | ✓ | ✗ | ✗ |
| Create roster student (placeholder) | ✓ | ✓ (own school) | ✓ (own classes) | ✓ (own classes) | ✗ | ✗ |
| Edit/assign/archive roster students | ✓ | ✓ (own school) | ✓ (own) | ✓ (own) | ✗ | ✗ |
| Manage teachers (CRUD + assign) | ✓ | ✓ (own school) | ✗ | ✗ | ✗ | ✗ |
| Request school affiliation | — | — | ✓ | ✓ | ✗ | ✗ |
| Approve teacher affiliation | ✓ | ✓ (own school) | ✗ | ✗ | ✗ | ✗ |
| Approve parent↔student link | ✓ | ✓ (own school) | ✓ (own students) | ✓ (own students) | ✗ | ✗ |
| View school analytics / roster | ✓ | ✓ (own school) | ✗ | own classes only | ✗ | ✗ |
| Claim a roster student (home account) | — | — | — | — | ✓ | ✓ (on behalf) |
| Mint auth accounts (teacher/manager) | ✓ (service role) | via admin fn | ✗ | ✗ | ✗ | ✗ |

---

## 3. Functional audit — accounted-for vs missing

### 3.1 Already present (keep)
- Class CRUD by owner teacher (`classes`).
- Class membership (`class_enrollments`), correctly teacher-scoped.
- Assignments + per-student assignment status.
- Direct 1:1 messaging.
- Audit log table.
- SRS/progress per auth student; teacher writes scoped to enrolled students.

### 3.2 Required by the stated logic — **present after Phase 1**
- Teacher creates/edits classes — ✅ (exists; manager also gains it).
- Teacher creates/edits student accounts — ✅ **new** via `roster_students` (placeholder) + claim.
- Manager manages/edits/assigns students — ✅ **new** via manager RLS on `roster_students`/`classes`.
- Manager manages teacher accounts — ✅ **partial**: manager can CRUD teacher **memberships** (assign/revoke within school); **auth-account creation** requires a privileged edge function (Phase 1.5, see §7).
- Teacher school-link / affiliation request — ✅ **new** via `school_memberships` (status `pending→active`).

### 3.3 Missing vs. a professional EdMS (industry-standard gap list)
| Area | Gap | Severity |
|---|---|---|
| **Role hierarchy** | No `manager`/tenancy at all. | Critical (fixed Phase 1) |
| **Roster vs auth identity** | No placeholder student; identity split between `students`(1:1) and `profiles`. | Critical (fixed Phase 1) |
| **Parent↔teacher comms** | Only 1:1 `messages`; no announcements/broadcast, no thread, no parent channel. | High (Phase 1 adds `announcements`; threads = Phase 3) |
| **Parent↔student verification** | Parent links are un-approved (child-safety/COPPA risk). | High (fixed Phase 1) |
| **Attendance** | No attendance/sessions-of-record. | Medium (Phase 3) |
| **Progress/gradebook reporting** | Progress exists but no parent-facing report card, no class mastery rollup beyond `class_analytics_view`. | Medium (Phase 3) |
| **School terms/academic calendar** | None. | Medium (Phase 3) |
| **RBAC granularity** | Single coarse `role` column; no per-action permissions, no delegation (co-teacher). | Medium |
| **Account lifecycle** | No disable/suspend/deactivate; only delete (cascade). | Medium |
| **Notification center** | None beyond unread-message count. | Low |
| **Self-serve password/reset & invite tokens** | Relies on Supabase Auth magic-link/email only. | Low |

---

## 4. Workflow & security validation (conflicts / risks)

1. **"Teachers create student accounts" — the core risk.** Interpreted as *auth accounts*, this would let any teacher mint logins for arbitrary people. **Resolution (D3):** teachers create **roster placeholders only** (no credentials, no PII beyond a display name). Real auth accounts are created only by the **student/parent at home** via claim. This removes the privilege-escalation surface entirely.
2. **Global teacher over-read (existing).** `students`/`profiles` SELECT let any teacher read all rows. Phase 1 sidesteps this by routing student management through the **new** `roster_students` (correctly scoped) and leaving the legacy tables for backward compatibility. Phase 2 re-scopes the legacy policies (QA-gated, see §7).
3. **Self-parent-link abuse.** Today a parent self-attaches to any student. Phase 1 makes links **pending** until a teacher/manager approves (`approved_by` recorded).
4. **Manager authority scope.** A manager's power is bounded by an **active `manager` membership** in the target `school_id`. RLS enforces this on every mutation; a manager of school A cannot touch school B. Auth-account creation for teachers is **not** granted to managers via SQL — it requires a service-role edge function that re-checks the manager's membership (defense in depth).
5. **Affiliation race / duplicate.** `UNIQUE(school_id, user_id)` + a partial unique index on active memberships prevents multiple active memberships and duplicate pending requests.
6. **Claim token reuse.** `claim_token` is unique, single-use (cleared on claim), and has an optional expiry; claiming sets `claimed_profile_id` + `claimed_at` and nulls the token.
7. **JWT vs profiles.role mismatch** (latent). `is_role` reads only `app_metadata`. Phase 1 hardens `is_role` to fall back to `profiles.role` via a `SECURITY DEFINER` helper (bypasses RLS → no recursion), so the new `manager` role is reliable regardless of how the account was provisioned.
8. **Tenancy on `classes`.** Adding nullable `school_id` keeps existing independent classes working; manager RLS is **additive** (new policies, not replacements) so the running app cannot be locked out.

---

## 5. Target schema (what Phase 1 implements)

### 5.1 `manager` role + hardened role helpers
- `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'manager'`.
- `public.current_role_name()` (STABLE, SECURITY DEFINER) = `app_metadata.role` ?? `jwt.role` ?? `profiles.role`.
- `public.is_role()` rewritten to use it (strictly more correct; identical when app_metadata is set).
- `public.is_manager()`, `public.is_school_manager(uuid)`, `public.is_teacher_in_school(uuid)`, `public.my_managed_school_ids()` (returns `uuid[]`), `public.my_school_id()`.

### 5.2 `schools`
```
schools(id, name, slug UNIQUE, country, city, contact_email,
        owner_id →profiles SET NULL, is_active, created_at, updated_at)
```

### 5.3 `school_memberships` (affiliation + assignment)
```
type membership_status ENUM('pending','active','rejected','revoked')

school_memberships(id, school_id→schools CASCADE, user_id→profiles CASCADE,
  role user_role CHECK IN('manager','teacher'),
  status membership_status DEFAULT 'pending',
  requested_at, reviewed_by→profiles SET NULL, reviewed_at, title,
  UNIQUE(school_id,user_id))
+ UNIQUE INDEX (school_id,user_id) WHERE status='active'   -- one active per pair
```

### 5.4 `classes.school_id` (additive)
- `ALTER TABLE classes ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE SET NULL;`
- Manager RLS on `classes` (additive SELECT/INSERT/UPDATE/DELETE for `is_school_manager(classes.school_id)`).

### 5.5 `roster_students` (the placeholder + claim model)
```
roster_students(id, school_id→schools CASCADE NULL,
  class_id→classes CASCADE, teacher_id→profiles CASCADE NOT NULL,
  display_name TEXT NOT NULL, avatar, team,
  claim_token TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  claim_token_expires_at, claimed_profile_id→profiles SET NULL, claimed_at,
  is_archived BOOL DEFAULT false, metadata JSONB DEFAULT '{}',
  created_at, updated_at)
```
- RLS: teacher of the class OR manager of the school OR admin can CRUD; a student/parent can **claim** via the token through a SECURITY DEFINER RPC (not direct RLS, to enforce single-use + profile binding).

### 5.6 Parent linking (approval-gated)
- **New** `parent_roster_links(parent_id→profiles, roster_student_id→roster_students, relationship, status membership_status DEFAULT 'pending', approved_by→profiles, approved_at, created_at, UNIQUE(parent_id, roster_student_id))` — RLS: parent creates pending; teacher-of-student or manager-of-school approves.
- **Legacy** `parent_student_links`: add `status` + `approved_by` (nullable; existing rows treated as approved via a backfill + an `active_parent_links` view). Insert defaults to `pending`.

### 5.7 `announcements` (additive comms)
```
announcements(id, school_id NULL, class_id NULL, author_id→profiles,
  audience ENUM('school','class','public'), title, body, created_at)
CHECK ((audience='school' AND school_id IS NOT NULL)
    OR (audience='class' AND class_id IS NOT NULL))
```
- RLS: school audience → members of that school; class audience → teacher + enrolled; author/admin always.

### 5.8 Audit helper
- `public.audit_action(p_action text, p_target_type text, p_target_id text, p_meta jsonb)` SECURITY DEFINER → inserts into `audit_logs` with `actor_id = auth.uid()`. Called from the membership/claim RPCs.

### 5.9 Claim RPC
- `public.claim_roster_student(p_token text)` SECURITY DEFINER: looks up the roster row by token, enforces not-archived/not-yet-claimed/expiry, binds `claimed_profile_id = auth.uid()`, clears token, audits. Returns the roster id.

---

## 6. RLS design principles (Phase 1)

1. **Additive only on existing tables** (`classes`, `parent_student_links`): new policy names; never drop an existing policy → the running app keeps working.
2. **Full definition on new tables** (`schools`, `school_memberships`, `roster_students`, `parent_roster_links`, `announcements`): scoped from creation.
3. **Manager authority is membership-derived**, not role-column-derived: every manager policy calls `is_school_manager(<row>.school_id)`, which checks an *active* `manager` membership. Revoking the membership instantly removes all power.
4. **Teacher authority = ownership** (`teacher_id = auth.uid()`) for independent teachers, with an **OR manager-of-school** branch for school classes.
5. **Sensitive writes go through SECURITY DEFINER RPCs** (`claim_roster_student`, future `manage_membership`) so business rules (single-use tokens, status transitions) are enforced server-side, not in client-mutable RLS.

---

## 7. Phased plan

### Phase 1 — additive, prod-safe (DEPLOYED in this work)
Migrations `20260715000001`–`20260715000007` (enum-add is isolated to its own
committed transaction — `00001` — because Postgres forbids using a new enum
value in the same transaction that adds it; `00002` carries the helpers):
1. `add_manager_role` — enum value only.
2. `manager_role_helpers` — hardened `is_role`/`current_role_name`/`is_manager` + `audit_action`.
3. `schools_and_memberships` — tables + scoped RLS + helper fns.
4. `classes_school_scoping` — `classes.school_id` + additive manager RLS + teacher-membership trigger.
5. `roster_students` — placeholder table + scoped RLS + `claim_roster_student` RPC.
6. `parent_links_approval` — `parent_roster_links` + `decide_parent_roster_link` RPC + legacy gating + view.
7. `announcements` — broadcast table + scoped RLS.

> **Deployed & verified** on `xsdnzijketjnzhakqtit` via the Supabase Management
> API (`/database/query`) with the `SUPABASE_ACCESS_TOKEN`, and recorded into
> `supabase_migrations.schema_migrations` (the MCP `supabase_*` tools were
> unauthorized this session because the MCP process didn't inherit the env var —
> sanctioned fallback per AGENTS.md §7). Verification: `manager` enum present;
> all 5 new tables exist with RLS enabled + 4 policies each; `classes.school_id`
> present; all 10 helper/RPC functions present; all 7 migrations recorded; the 4
> new REST endpoints return 401 (deployed/protected), not 404; **no public table
> has RLS disabled** (advisor-clean for the new surface).

### Phase 2 — re-tenant existing broad policies (DOCUMENTED, QA-Gated, NOT auto-deployed)
These **replace** global teacher policies with class/school-scoped ones. They are correct but can lock out real users if a client queries students/profiles outside the enrollment path, so they require staging QA before going live. Provided in §8.

### Phase 1.5 / Phase 3 — follow-ups (out of scope for this pass, listed for completeness)
- **Edge function `manage-school-members`** (service role): the only path that mints/disables teacher & manager **auth** accounts and sets their `app_metadata.role`, re-checking the caller's manager membership. Required to fully realize D4.
- **Roster ↔ LearnerState bridge**: store in-class graded state for *unclaimed* roster students (today FSRS/progress are profile-keyed); a `roster_grades` table keyed on `roster_students.id`, merged into the home LearnerState on claim.
- Attendance, report cards, academic terms, threaded messaging, notification center (§3.3).

---

## 8. Phase-2 SQL (re-tenanting — apply after staging QA)

```sql
-- students SELECT: teacher sees only students enrolled in their classes (or school)
DROP POLICY IF EXISTS "students_select_policy" ON public.students;
CREATE POLICY "students_select_policy" ON public.students FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR (SELECT public.is_role('admin'))
  OR EXISTS (SELECT 1 FROM public.class_enrollments ce
             JOIN public.classes c ON c.id = ce.class_id
             WHERE ce.student_id = students.id AND c.teacher_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.classes c
             WHERE c.school_id = ANY(public.my_managed_school_ids())
               AND c.id IN (SELECT class_id FROM public.class_enrollments WHERE student_id = students.id))
);

-- profiles SELECT: manager sees members of their schools; teacher sees students in their classes
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR (SELECT public.is_role('admin'))
  OR EXISTS (SELECT 1 FROM public.school_memberships sm
             WHERE sm.user_id = profiles.id
               AND sm.school_id = ANY(public.my_managed_school_ids())
               AND sm.status = 'active')
  OR EXISTS (SELECT 1 FROM public.class_enrollments ce
             JOIN public.classes c ON c.id = ce.class_id
             WHERE ce.student_id = profiles.id AND c.teacher_id = auth.uid())
);
```
Apply these only after confirming no client query path reads `students`/`profiles` outside enrollment-derived filters.

---

## 9. Verification (after Phase-1 deploy)
**Status: PASSED** — see the verified checklist under §7 Phase 1.
- `user_role` contains `manager`.
- Tables `schools, school_memberships, roster_students, parent_roster_links, announcements` exist; `classes.school_id` exists.
- `GET .../rest/v1/roster_students` and `.../schools` return **401** (deployed, RLS-protected), not 404.
- Supabase advisors: no new `security` warnings (RLS enabled on every new table).
- Smoke (manual): create a school + manager membership → manager can CRUD a class/roster in their school but not another school's (Phase-1.5 fn needed to create the auth accounts).

---

## 10. Post-review hardening (applied)
A `/review` of the Phase-1 migrations found 3 critical + 8 warning + 1
duplication issue. All were fixed in place (the affected files
`20260715000002/03/05/06` were corrected and re-applied idempotently to live,
since the originals were uncommitted). Summary of what changed:

| Finding | Fix |
|---|---|
| **CRITICAL** role-check lockout (`auth.jwt()>>'role'`='authenticated' shadowed `profiles.role`) | removed the top-level JWT term from `current_role_name()` |
| **CRITICAL** `profiles.role` self-promotion | `trg_guard_profile_role` blocks role UPDATE unless admin/service; `handle_new_user` clamps self-signup `admin`/`manager`→`student` (admin provisioning via `app_metadata` still honored) |
| **CRITICAL** cross-tenant `roster_students` attach | `school_id` now derived from the class via `trg_sync_roster_school`; manager authority reads `classes.school_id` via `can_manage_class/can_manage_roster_student` |
| school PII public | `schools` SELECT restricted to members/admin/owner; new public `school_directory` view exposes only id/name/slug/country/city |
| manager minting co-managers / pre-activating | membership INSERT manager branch restricted to `role='teacher', status='pending'` |
| legacy parent links auto-approve | `parent_student_links.status` defaults `'pending'`; INSERT forced pending; old permissive insert policy dropped |
| stale `teacher_id` authority | roster policies authorize via `classes.teacher_id`, not the snapshot column |
| permanent affiliation lockout | blanket `UNIQUE` → partial unique index `WHERE status IN ('pending','active')` |
| non-durable parent-link rejection | parent DELETE limited to own `pending`; `decide_parent_roster_link` only acts on `pending` |
| membership status free-for-all | `trg_membership_transition` enforces `pending→active|rejected`, `active→revoked` |
| duplicated approver predicate | centralized in `can_manage_class()`/`can_manage_roster_student()` |

Verified live: all triggers/views/indexes present, policies reference the
helpers, no public table lacks RLS. (RLS *behavioral* testing — e.g. confirming
a non-admin cannot update `profiles.role` — needs an authenticated session and
should be smoke-tested via the app or a signed-JWT probe.)
