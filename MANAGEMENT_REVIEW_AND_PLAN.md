# Student/Class/School Management — End-to-End Review & Redesign

> Companion to `STUDENT_MANAGEMENT_DESIGN.md` (the backend). This is the
> **frontend + product** review: what exists, what's mock, what's broken, and a
> redesigned information architecture + phased build plan.
>
> Grounded in a full audit of `apps/{teacher,admin,parent,student,board,remote}`
> and `services/{DataService,AdminService,AuthService}` (citations are `file:line`).
> **Finding:** the backend is solid and live, but the management **frontend is
> largely mockup and the new multi-tenant backend is wired into zero screens.**

---

## 0. TL;DR
- ✅ **Backend** (schools, memberships, roster_students, claim, parent approval, announcements, manager role) — designed, deployed, verified, secured.
- ❌ **Frontend** — mostly mockup; the new backend is referenced by **0** files in `apps/` or `services/`.
- 🔴 **One active blocker** — `AuthService.signUp` silently drops the chosen role, so every new parent/teacher signup becomes `student` and gets locked out after logout. **Fix this first.**
- The "Class Management" screen doesn't list classes (it renders a student table); there is no "create student" UI anywhere.

---

## 1. Current-state audit (condensed)

### 1.1 Teacher app (`apps/teacher/*`)
| Screen | file:line | Real / Mock | Gap |
|---|---|---|---|
| ClassManagement | `ClassManagement.tsx:20` | Partial | Fetches `classes` (`:30`) **but never renders them**; main table is students. Hardcoded "Class 3B" (`:106`), fake parent stats (`:130`), fake magic link (`:327`), fake PIN (`:342`). No roster creation, no `school_id`. |
| StudentPassports | `StudentPassports.tsx:10` | Mock | Reads `student.name/avatar` which **don't exist** on the live type → renders blank. PIN = `id*1234` (`:113`); external fake QR (`:155`). No real claim tokens. |
| Assignments | `Assignments.tsx:10` | Real read/create | "scheduled" filter is always false (`:53`); grading/details/stats are no-ops. No `student_assignments` status surfaced. |
| Reports | `Reports.tsx:13` | Partial | Real mastery counts; fake trend deltas (`:104-137`), hardcoded skills, no export/drill-down. |
| TeacherMessages | `TeacherMessages.tsx:14` | Real | **Cannot start a new conversation** (`:70`); every contact mislabeled "Parent" (`:154`). No announcements. |
| Dashboard/Home | `TeacherDashboard.tsx:37` / `DashboardHome.tsx:18` | Real shell / fake hero | Nav has no school/roster/announcements/manager awareness. Hero "Class 3B / Room 304 / 24 students" fabricated (`:95`). |
| TeacherOnboarding | `TeacherOnboarding.tsx:6` | **Fully mock** | `completeOnboarding` is `setTimeout` (`:26`); collects school + class + student names and **discards them**. Should create `schools`+`memberships`+`classes`+`roster_students`. |

### 1.2 Admin app (`apps/admin/*` + `AdminService.ts`)
| Capability | file:line | Real / Mock | Gap |
|---|---|---|---|
| District metrics | `AdminService.ts:80` | Real | Client-side aggregation, not DB. `totalSchools` = class count (`:98`). |
| "Schools" tab | `AdminService.ts:111` | Real but **mislabeled** | Reads `classes`, **not** the `schools` table. |
| Teachers / Students lists | `:183` / `:246` | Real | "any teacher reads all profiles" leak (`profiles_select = is_teacher_or_admin`). |
| Change role | `:348` | Partial | Writes `profiles.role` only (my `guard_profile_role` blocks non-admins; `current_role_name` prefers `app_metadata.role` → change may not take effect). No `manager` option in UI. |
| Delete user | `:363` | Orphaning | Deletes `profiles` only; leaves `auth.users` (user still logs in). Not wired to UI. |
| `requireAdmin` | `:7` | Permissive | Admits `admin` **or** `teacher`; excludes `manager`. `/admin` route has **no guard** (`App.tsx:129`). |

### 1.3 Parent & Student onboarding (`apps/parent/*`, `apps/student/*`)
| Screen | file:line | Real / Mock | Gap |
|---|---|---|---|
| AuthService.signUp | `AuthService.ts:107` | **Broken** | Accepts `role` but **sends only `full_name`** (`:124`) → all self-signups become `student`. |
| Parent link | `ParentOnboarding.tsx:56`, `ParentConnect.tsx:48` | Legacy self-link | Upserts `parent_student_links` with **no approval**. Backend now forces `pending` — but `getParentStudents` (`DataService.ts:401`) has **no status filter**, so dashboards show un-approved children. |
| ParentDashboard | `ParentDashboard.tsx:18` | Hybrid | Live child/XP; fake weekly/skill/time analytics derived from `xp`. |
| StudentOnboarding | `StudentOnboarding.tsx:6` | **Fully mock** | `setTimeout` + hardcoded roster; never enrolls/claims. |
| student/Login | `apps/student/Login.tsx:12` | Mostly mock | Checks class code but **never enrolls**; hardcoded "Leo / Class 3B". |
| Claim flow | — | **Absent** | No screen calls `claim_roster_student(token)`. |

### 1.4 Service layer (`services/*`, `hooks/useQueries.ts`)
- Every management flow is **fully wired to the legacy schema** — no stubs.
- **Zero** references to `schools`, `school_memberships`, `roster_students`, `parent_roster_links`, `announcements`, `claim_roster_student`, or `decide_parent_roster_link`. **Zero** `.rpc(` calls in the whole frontend.
- Role/id from `AuthService.getCurrentUser` → `useAppStore.userProfile` (typed `any`); refetched on route change but **no `onAuthStateChange` subscription**.

---

## 2. Critical cross-cutting issues (ranked)

| # | Issue | Severity | Where |
|---|---|---|---|
| C1 | **Signup drops role** → all new parent/teacher accounts become `student`; role-check locks them out after logout. | 🔴 Critical | `AuthService.ts:124` |
| C2 | **No route guards** — a `student` can open `/parent` or `/admin`; `verifyPortalAccess` exists but is never called. | 🔴 Critical | `App.tsx:93-99,129` |
| C3 | `getParentStudents` shows **pending** parent links (no `status='active'` filter). | 🟠 High | `DataService.ts:401` |
| C4 | `updateUserRole` writes `profiles.role` but not `app_metadata.role`; blocked for non-admins; may not take effect. | 🟠 High | `AdminService.ts:348` |
| C5 | `requireAdmin` admits `teacher`; `/admin` unguarded. | 🟠 High | `AdminService.ts:15`, `App.tsx:129` |
| C6 | ClassManagement **doesn't render classes**; no roster/student creation UI. | 🟠 High | `ClassManagement.tsx:30,176` |
| C7 | New multi-tenant backend is **0% wired** to the frontend. | 🟠 High | (whole `apps/`,`services/`) |
| C8 | `deleteUser` orphans `auth.users`; no real disable/provision. | 🟡 Medium | `AdminService.ts:363` |
| C9 | `userProfile` typed `any`; no `onAuthStateChange` → stale role after admin change. | 🟡 Medium | `useAppStore.ts:4`, `App.tsx` |

---

## 3. Redesigned information architecture (role-aware)

**Principle:** *School → Class → Student (roster)* is the ownership spine. Classes are first-class objects; students live **inside** classes as roster entries (claimable to a home account). Independent teachers sit outside any school.

```
TEACHER  (independent or affiliated)
├─ My School(s)            affiliation status + "Link to a school" / "Stay independent"
├─ Classes  ◄ FIRST-CLASS LIST (cards)
│   └─ [Class] → Roster · Code/Share · Assignments · Announcements · Analytics
├─ Students (Roster)       create roster student → claim token/link; claimed? status
├─ Messages                1:1 (compose NEW) + Announcements (class/school)
├─ Approvals               pending parent-links (decide_parent_roster_link)
└─ Reports · Settings · Billing   (de-mocked)

MANAGER  (new surface — could be a mode of /admin)
├─ School dashboard        teachers, classes, students, analytics
├─ Teachers                invite / approve / revoke (school_memberships)
├─ Approvals               affiliation requests + escalated parent-links
├─ Announcements           school-wide broadcast
└─ Roster overview

ADMIN  (platform-level)
├─ Schools & Managers      CRUD schools; provision manager accounts (edge fn)
├─ Platform analytics · Content moderation · Billing

PARENT
├─ Connect to child        via roster CLAIM TOKEN → pending → teacher approves
├─ Dashboard               reads only ACTIVE links + announcements feed

STUDENT
├─ Claim identity          claim_roster_student(token) (replaces mock "Who are you?")
└─ Join class              via code (already works in StudentApp — surface in onboarding)
```

### Teacher management wireframe (text)
```
┌──────────────────────────────────────────────────────────────┐
│ Teacher ▸ Classes                          [Independent ▸ Link] │
├──────────────┬───────────────────────────────────────────────┤
│  Classes     │  ┌─ Class card ──────┐  ┌─ Class card ──────┐ │
│  • 3B Eng    │  │ 3B English        │  │ 4A English        │ │
│  • 4A Eng    │  │ 24 roster · 19 claimed │ 18 roster · 12 claimed│ │
│  Students ▸  │  │ code: AB7K2X  [Open] │ │ code: ZZ9P1Q [Open]│ │
│  Messages ▸  │  └───────────────────┘  └───────────────────┘ │
│  Approvals(2)│                       [+ Create class]        │
└──────────────┴───────────────────────────────────────────────┘
Class detail → Roster tab:
  [+ Add student] → name → creates roster_student → shows claim link/token
  Row: Leo · ⬤ claimed (home) · XP 1240 · [parent link: approved]
       Mia · ○ unclaimed · [claim link: /claim/abc123] · [parent: pending]
```

---

## 4. Phased implementation plan

> Effort: S = ≤½ day, M = 1–2 days, L = 3+ days. Risk noted where relevant.

### Phase 0 — Unblock auth & access (do FIRST; S, low risk)
- **C1** `signUp` sends `role` in `options.data` (clamp already allows teacher/student/parent).
- **C2** wire `verifyPortalAccess` into `App.tsx` route guards; redirect on mismatch.
- **C5** tighten `requireAdmin` to `admin` only (+ `manager` where intended); guard `/admin`.
- **C3** `getParentStudents` → read `active_parent_links` view (or `status='active'`).
- Add `onAuthStateChange` to refresh `userProfile` (C9).

### Phase 1 — Service layer for the new backend (M)
- `DataService`/`AdminService`: schools, memberships, roster_students, parent_roster_links, announcements CRUD + RPC wrappers (`claim_roster_student`, `decide_parent_roster_link`).
- `hooks/useQueries.ts`: matching react-query hooks (mirror `useTeacherClasses`/`useCreateAssignment`).

### Phase 2 — Teacher management UI (redesigned) (L)
- Classes list (first-class) + Class detail (Roster / Code / Assignments / Announcements / Analytics).
- **Add student** → `roster_students` + claim token/link (replaces fake magic link & PIN).
- **My School(s)** affiliation screen (browse `school_directory`, request, status).
- Fix Messages (compose-new) + Announcements; **Approvals** queue.

### Phase 3 — Student/Parent claim & connect (M)
- Student **claim identity** (`claim_roster_student`) in onboarding (delete the mock).
- Parent **connect via roster token** → pending → approval-aware; dashboard reads active only.

### Phase 4 — Manager surface + account provisioning (L, higher risk)
- **`manage-school-members` edge function** (service role): the only path that mints/disables teacher & manager auth accounts and sets `app_metadata.role`, re-checking manager membership.
- Manager dashboard (teachers, approvals, school announcements).
- Route `updateUserRole` through the edge fn so `app_metadata.role` is authoritative (C4/C8).

### Phase 5 — De-mock & polish (M)
- Real analytics (drop fake deltas; use `class_analytics_view` properly), real settings persistence, real passports (claim tokens), remove hardcoded "Class 3B".

---

## 5. Open decisions for the owner
1. **Teacher self-signup** allowed (then request affiliation) — or **invite-only** (manager/admin provisions)? Affects Phase 0 (signUp) and Phase 4 (edge fn).
2. **Manager surface** — a new `/manager` app, or a mode inside `/admin`? (Recommend a mode in `/admin` scoped by school.)
3. **Roster ↔ existing `class_enrollments`** — keep both (roster = in-class identity; enrollment = home-account join) and merge on claim? (Recommend yes.)
4. **Independent teacher** limits — cap classes/students for unaffiliated teachers? (Billing hook.)
