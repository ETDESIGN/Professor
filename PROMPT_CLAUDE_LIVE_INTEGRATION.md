# PROMPT FOR CLAUDE — Audit & Redesign: Roster ↔ Live-Board ↔ Points Integration

> Paste this entire prompt into Claude (Projects / long context). It asks Claude to
> (1) audit how the **student-management module** connects (or fails to connect) to
> the **live board / live-class system**, and (2) produce a unified design + a
> concrete, phased implementation plan. Give Claude the repo access below.

---

## 0. Your mission

"Professor" is a K-12 ESL teaching platform. We recently built a complete
**student/class/school management module** (roster students, claim flow, schools,
managers, parents) AND we have a pre-existing **Live Board** (projector screen the
teacher drives in a live class). **The two were never properly integrated.** The
symptom reported by the teacher:

> "Even after a student is marked **claimed**, when I launch a live class (Teach
> button), I can't find any student name connected to the live session. The student
> doesn't participate, the **random picker doesn't use them**, and **points aren't
> being awarded** (neither automatically by the system nor manually by the teacher)
> even though students are supposed to earn points for answers/performance during
> live classes."

We believe the **design and planning of this integration was overlooked**. We do
**not** want a quick patch. We want you to:

1. **Audit** the existing integration end-to-end (roster identity → session roster →
   picker → points → LearnerState → home app), citing exact files/lines.
2. **Brainstorm** the target architecture (look at how Kahoot / Blooket / ClassDojo /
   Nearpod / Quizizz model rosters, live sessions, turn-taking, and unified points).
3. **Produce a redesign**: a single coherent model where a claimed student flows
   into a live session, the picker uses them, points (class + home, unified) are
   awarded both automatically and manually, and grades feed the shared LearnerState
   that shapes home practice.
4. **Produce a phased implementation plan** with concrete, ordered, low-risk steps.

Be honest about what is fundamentally broken vs. just unwired.

---

## 1. Repo

```
https://github.com/ETDESIGN/Professor.git
```
The app is in the repo root (`professor-0.1 (1)/`). Read these first (they are the
source of truth and already contain deep prior audits):

- `STUDENT_MANAGEMENT_DESIGN.md` — the NEW student-management module (data model,
  RLS, the claim flow). **Read fully.**
- `MANAGEMENT_REVIEW_AND_PLAN.md` — current-state audit of all management screens.
- `LIVE_BOARD_REDESIGN.md` — the live-classroom pedagogy + foundational board issues.
- `PROMPT_CLAUDE_AUDIT.md` — a prior audit prompt for the board *templates*.
- `AGENTS.md` — stack, deploy, the region-safe AI constraint, project IDs.

---

## 2. Architecture & stack (so you have full context)

- **Frontend:** Vite + TypeScript **multi-entry SPA** (entries: `teacherEntry.tsx`,
  `studentEntry.tsx`, `parentEntry.tsx`, `adminEntry.tsx`, plus a unified `App.tsx`
  router). Tailwind, framer-motion, @tanstack/react-query, Zustand stores.
- **Backend:** **Supabase** (Postgres 17 + Auth + Realtime + Storage + Edge
  Functions / Deno). Project ref `xsdnzijketjnzhakqtit`.
- **Live state:** `store/SessionContext.tsx` (teacher/board/remote shared state via
  Supabase Realtime broadcast channel `classroom_live` + the `classroom_sessions`
  table) and `store/SoloSessionContext.tsx` (student home app).
- **AI:** via **OpenRouter** only — **region-safe** (Moonshot/Qwen/DeepSeek/Meta).
  **Never** propose OpenAI/Google/Anthropic.
- **Two usage contexts (critical):**
  - **Home** — student's own device, **Student app**, self-paced (FSRS practice,
    mastery, daily quests). NOT live-coupled to the board.
  - **School (live class)** — **ONE projector screen** driven by the teacher;
    **students have NO devices**. Teacher controls via a phone/tablet
    (`apps/remote/TeacherRemote.tsx`). The board is **display-only**.
  - The **only** link between a live class and a student's home practice is the
    **shared LearnerState**: teacher grades a student in class → writes FSRS/mastery
    → reshapes that student's home practice.

---

## 3. The five user roles and their surfaces

| Role | Surfaces | Key flows |
|---|---|---|
| **Admin** | `/admin` (`apps/admin/DistrictAdminDashboard.tsx`) | Platform-wide: schools, managers, analytics, content moderation. Bootstraps schools+managers via the `manage-school-members` edge function. |
| **Manager** | `/admin` → `apps/admin/ManagerDashboard.tsx` (role-aware `AdminPortal`) | Runs ONE school: invite/approve teachers, approve parent-links, school announcements. |
| **Teacher** | `/teacher` (`apps/teacher/*`) | Creates classes, adds **roster students** (no-auth placeholders) → gets a **claim link**, runs **live classes** (LessonStudio → Teach → board + remote), messages, announcements, reports. May be independent or affiliated to a school. |
| **Student** | `/student` (`apps/student/*`), reached via **claim link** `/claim?t=…` | Claims a roster spot → bound to home account → enrolled → self-paced home practice. **No device in live class.** |
| **Parent** | `/parent` (`apps/parent/*`) | Connects to child via roster claim token (approval-gated), views progress. |

---

## 4. The NEW student-management data model (the roster identity)

These tables/functions were just added — **understand them before auditing the bridge**:

- `roster_students` — **no-auth class roster placeholder** created by the teacher
  (`display_name`, `class_id`, `teacher_id`, `school_id` [derived from class],
  `claim_token` [unique, one-time], `claimed_profile_id` [nullable → profiles.id],
  `claimed_at`, `is_archived`).
- `claim_roster_student(p_token)` RPC — a home account binds itself to a roster
  entry; **it ALSO inserts a `class_enrollments` row** (the roster→enrollment bridge)
  so the claimed student joins the class.
- `class_enrollments(class_id, student_id→profiles.id)` — the legacy/current
  "auth student is in a class" link that the board's `getTeacherStudents` reads.
- `parent_roster_links` — approval-gated parent↔roster links.
- `schools`, `school_memberships` (affiliation `pending/active/rejected/revoked`),
  `manager` role.
- `profiles` (auth identity, `role`, Stripe/billing), `students` (a 1:1 game-state
  mirror of `profiles` — `points`, `level`, `team`).

**Two student-identity concepts now coexist** (`roster_students` vs
`class_enrollments`/`profiles`/`students`) — reconcile this in your design.

> ⚠️ **RLS caveat to respect in any DB design you propose:** `auth.uid()` /
> `auth.jwt()` are **NULL inside `SECURITY DEFINER` functions called from RLS
> policies** in this project (confirmed, hard-won lesson). They work in the policy
> expression itself. So any helper used in a policy must take `auth.uid()` as a
> parameter, or the check must be **inlined** in the policy (subquery on other
> tables, like the working `class_enrollments` policies). Do **not** propose
> `SECURITY DEFINER` helpers that call `auth.uid()` internally.

---

## 5. The live board / live-class system (what exists)

Read these files (cite lines in the audit):

- `store/SessionContext.tsx` — the live session store. Key members:
  - `state.students` — **the board roster every game uses**. Populated by
    `loadStudents()` → `getTeacherStudents(teacherId)` (reads `class_enrollments`).
    Called once at session init — **no realtime reload when a student claims/joins
    mid-session.**
  - Picker: `state.quickWheelWinner`, `state.turnsThisExercise`, round-robin
    `selectNextStudent` (prefers not-yet-picked).
  - Points/grading: `addPoints(studentId, n)`, `gradeStudent`, `gradeStudentWeakest`
    → should write the shared **LearnerState** (FSRS/mastery) via
    `services/boardLearner.ts` / `services/SupabaseService.ts` (`Engine`).
- `apps/board/ClassroomBoard.tsx` + `apps/board/BoardShell.tsx` — the projector
  board; renders the active flow step + overlays (leaderboard, weak-banner,
  confetti). All templates read `state.students`.
- `apps/board/templates/*` — ~20 game templates (BoardListenTap is the "gold
  standard": real audio + capture + round-robin). Many capture nothing.
- `apps/remote/TeacherRemote.tsx` — the teacher's phone controls ("Baton":
  Spin/Pick/Class/Redo/Rank/Teams/Correct/Wrong/+XP). Sends `lastAction` over the
  `classroom_live` broadcast channel.
- `apps/teacher/LiveCommander.tsx` — the "Teach"/launch surface + live sidebar.
- `classroom_sessions` table — `{teacher_id, unit_id, current_index, status}`;
  upserted on `setActiveUnit`. **No `class_id`** — a session is keyed by teacher,
  not by class (relevant: which class's roster is "live"?).
- `services/DataService.ts` — `getTeacherStudents`, `getClassStudents`
  (`class_enrollments`), `getClassAnalytics`.
- `services/GamificationService.ts`, `services/boardLearner.ts` — XP / LearnerState.

`LIVE_BOARD_REDESIGN.md` already documents: teams are cosmetic (`student.team`
never assigned), the command bus is racey/non-idempotent, the pool is
fire-and-forget, most games capture nothing, and **points should be a UNIFIED
per-student total (class + home combined)** (§0.1.4) but today class points are
**ephemeral session state** while home XP lives in the profile/gamification — they
are **not unified**.

---

## 6. The specific gaps to solve (the integration that was overlooked)

1. **Claimed students don't reach the live session.** A claimed student is enrolled
   in `class_enrollments`, but the board loads `state.students` **once** at session
   start (and possibly across all the teacher's classes, not the live class). A
   student who claims **after** the teacher launched the board never appears. There's
   no realtime roster subscription.
2. **No class↔session binding.** `classroom_sessions` has no `class_id`. The board
   doesn't know **which class** is live, so it can't scope the roster to the right
   class (and can't write per-class data correctly).
3. **Two student identities.** `roster_students` (the teacher's roster, with
   `display_name` and a `claimed_profile_id`) vs `class_enrollments`/`profiles`
   (auth students). Unclaimed roster students have **no profile** — can the board
   include them (they're physically in the room!) even before claiming? Today: no.
4. **Picker ignores students** because `state.students` is empty/stale (consequence
   of #1).
5. **Points not awarded / not unified.** `addPoints` updates **ephemeral** session
   state; it's unclear whether it persists to the profile/LearnerState at all, and
   class points + home XP are **two separate totals** (violates the locked
   §0.1.4 "unified points" decision). Both **automatic** (system-graded, e.g.
   SpeedQuiz/ListenTap capture) and **manual** (teacher Baton +XP/Correct) awarding
   must work and persist.
6. **Grades → home bridge is fuzzy.** When the teacher marks a student Correct/Wrong
   in a live individual round, it must write that student's **FSRS/mastery
   (LearnerState)** so their **home** practice adapts. Audit whether `gradeStudent`
   actually does this and whether it resolves the right student id (profile vs
   roster).

---

## 7. What to deliver (one markdown document)

### A. Integration audit (with file:line citations)
- Trace the full path: teacher adds roster student → student claims → enrollment →
  `loadStudents` → `state.students` → picker → `addPoints`/`gradeStudent` →
  LearnerState → home app. Mark each hop **working / broken / missing**.
- Specifically answer: does a claimed student appear in `state.students`? If not,
  why exactly? Does `addPoints` persist anywhere? Is class XP ever unified with
  home XP?
- Reconcile the `roster_students` vs `class_enrollments`/`profiles`/`students`
  identity split. Propose **one** canonical student identity for the board (and how
  unclaimed roster students participate in class with no profile).

### B. Target architecture (with brainstorm)
- How Kahoot/Blooket/ClassDojo/Nearpod/Quizizz model: roster, live session,
  turn-taking/fairness, real-time roster changes, and unified season/total points.
- A proposed unified model covering: **class↔session binding** (add `class_id` to
  `classroom_sessions`?), **realtime roster** (Supabase Realtime subscription on
  enrollments/roster for the live class), **picker source of truth**, **unified
  points** (class + home in one per-student total, persisted), **auto + manual
   awarding**, and the **grade→LearnerState→home** bridge.
- How unclaimed roster students participate (they're physically present) without a
  profile, and what happens to their points once they claim.

### C. Data model changes
- Exact new/changed tables, columns, RPCs, RLS (respecting the `auth.uid()`-in-
  policy caveat in §4). E.g., a persisted `class_points`/unified XP table, a
  `class_id` on sessions, a roster view the board subscribes to.

### D. Phased implementation plan
- Ordered, low-risk phases (foundations first: class↔session binding + realtime
  roster so students appear; then unified points + persistence; then auto/manual
  awarding wired to all capturing games; then grade→home bridge). Each step:
  files to touch, the change, and how to verify. Flag any step that needs the
  `auth.uid()`-inline-RLS pattern.

### E. Risks & open questions for the owner
- E.g., should unclaimed roster students earn persistent points (and to where)?
  Should the board re-fetch the roster on a timer, or use Realtime? How to handle a
  student claiming **during** a live session (merge their ephemeral points)?

---

## 8. Constraints (must respect)
- Supabase Postgres 17 + RLS + Edge Functions (Deno). Region-safe AI only
  (Moonshot/Qwen/DeepSeek/Meta via OpenRouter) — no OpenAI/Google/Anthropic.
- **No student devices in a live class** — the board is a single teacher-controlled
  screen; answers are spoken/physical; the teacher is the sole operator. Do NOT
  propose student-device live sync.
- Chinese L1 (Simplified Chinese alongside English) — relevant for any UI text.
- Don't redesign the board *templates'* look-and-feel (that's
  `PROMPT_CLAUDE_AUDIT.md`'s scope); focus on the **roster/session/points/identity
  integration**.

Be thorough, specific, and honest. Prioritize making a claimed student **appear in
the live class, be pickable, and earn persistent (unified) points — auto and
manual — that flow into their home LearnerState.**
