# Live-Class User-Management — Audit (post-integration)

> Re-audit of the roster↔live-board↔points integration, verified against the live
> DB and the actual code. Confirms what is correct, flags 4 issues (2 fixed here,
> 2 deferred with a clear fix).

## Verdict
The integration is **implemented correctly and architecturally sound** for the core
path (roster-first board, unclaimed participation, realtime, persistent unified
points, grade→FSRS bridge). Two robustness issues were found and fixed; two minor
issues are deferred with clear fixes.

## Confirmed working (verified live + code)
- **Deployment**: `point_transactions` (SELECT+INSERT policies, realtime), `roster_students`
  + `classroom_sessions.class_id` all present in the realtime publication.
- **Roster-first board**: `SessionContext.loadStudents` (roster-first via
  `getSessionRoster`) shows claimed **and** unclaimed students; they are pickable.
- **Realtime**: roster membership changes + point inserts reload the authoritative
  total on all tabs.
- **Points**: optimistic broadcast (instant UI) + debounced (1.5s) ledger insert;
  full-reload reconcile → **no double-count**. Class points persist to the ledger;
  home XP stays separate.
- **Identity bridge**: `roster_students` (board identity) → claim →
  `class_enrollments` + `profiles`; `gradeStudent` resolves `claimed_profile_id`
  (skip unclaimed) → FSRS via `boardLearner`.
- **RLS**: new policies use the inline `auth.uid()` pattern (verified pattern).

## Issues found
| # | Severity | Issue | Status |
|---|---|---|---|
| 1 | 🟠 High | `point_transactions` policies used `(SELECT is_role('admin'))` (helper unreliable in policy context) → admins may be blocked from the ledger. | **Fixed** — inlined admin check in migration `20260721000002`. |
| 2 | 🟠 High | Roster-first board ignores `class_enrollments`: students who joined via the **legacy self-join (class code)** are enrolled but NOT in `roster_students` → they don't appear in the live board. | **Fixed** — backfill migration `20260721000003` materializes legacy enrollment-only students into `roster_students`. |
| 3 | 🟡 Minor | `setActiveClass` sets `status='LIVE'` + `updated_at` without `unit_id`, so a session row is marked LIVE when the teacher merely picks a class (before going live). | Deferred — fix: only upsert `class_id` when a unit is active. |
| 4 | 🟡 Minor | Board leaderboard's "home XP" component is only refreshed on point inserts (not on home-app activity). | Deferred — acceptable for a live class; could add a progress subscription. |

## Deferred follow-ups (recommended)
- Consider unifying the legacy "join class by code" path into roster creation so all
  class membership flows through `roster_students`.
- Migrate existing `class_enrollments`-only students into `roster_students` (one-time
  backfill) if legacy classes must appear in the live board.
