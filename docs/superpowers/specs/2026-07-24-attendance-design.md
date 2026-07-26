# Attendance Feature — Design Spec

**Date:** 2026-07-24
**Status:** Approved (design), pending implementation plan
**Supersedes:** `.zcode/plans/plan-sess_6b4dddf8-a6e0-406f-9431-13504f4b34dd.md` (the original day-based plan)

## Summary

Teachers take **binary present/absent** attendance during a **live teaching session**. A
student can attend two separate sessions in one day, so attendance is anchored to a
**session occurrence**, not a calendar day. Absent students are excluded from live-board
participation (picking, teams, wheel, command deck) but remain visible (greyed) on the
leaderboard. The Classes/Roster screen shows a **read-only history** of past sessions.

## Locked decisions

1. **Statuses:** `present` / `absent` only. The DB `CHECK` still permits `late`/`excused`
   for the future, but the app only ever writes the two.
2. **When taken:** during a live session in the Commander, at the teacher's discretion.
   Never a forced/blocking gate. Editable at any time during the session.
3. **Granularity:** per **teaching-session occurrence**, not per day.
4. **Entry points:** taking/editing attendance is **Commander-only**. The Classes/Roster
   screen shows attendance as **read-only history**.
5. **History v1:** minimal — a list of occurrences (`date · time · "X/Y present"`), tap to
   see that session's roster with present/absent marks. No per-student rates/analytics yet.
6. **Timezone:** history dates render in the **teacher's local timezone** (the shipped
   service's UTC "today" logic is removed by the re-key to occurrences).
7. **Safe default:** if attendance is never taken for a session, everyone is present.
8. **Walk-ins:** the live modal keeps a **"+ Add student"** button reusing the existing
   unclaimed-roster creation path.

## Current state (what already shipped)

Applied live to Supabase (`xsdnzijketjnzhakqtit`) and verified, but **uncommitted** in git:

- `supabase/migrations/20260723000003_attendance_records.sql` — table + 4 RLS policies +
  realtime publication + `schema_migrations` row. **Day-keyed** (`UNIQUE(class_id,
  roster_student_id, marked_date)`), 0 rows.
- `services/AttendanceService.ts` — date-based reads/writes (`todayUTC`).
- `hooks/useQueries.ts` — `useAttendanceToday`, `useSaveAttendance`.

Because the table has 0 rows and nothing is committed, re-keying is a clean rework, not a
data migration.

## Architecture

### Data model

- **New table `class_session_occurrences`**
  - `id uuid pk`, `class_id uuid fk classes`, `teacher_id uuid fk profiles`,
    `unit_id uuid fk units null`, `started_at timestamptz default now()`,
    `ended_at timestamptz null`, `created_at timestamptz default now()`.
  - Index `(class_id, started_at desc)` for history queries.
  - RLS: reuse the recursion-safe `can_manage_class(class_id, auth.uid())` helper +
    `is_role('admin')`, matching the existing attendance policies.
  - Add to `supabase_realtime` publication.
- **Re-key `attendance_records`**
  - Add `occurrence_id uuid NOT NULL REFERENCES class_session_occurrences(id) ON DELETE CASCADE`.
  - Drop the day-based unique index; add `UNIQUE(occurrence_id, roster_student_id)`.
  - `marked_date` is no longer the key; drop it (or keep `marked_at` only for display).
  - Keep existing RLS + realtime.
  - `session_id` (the singleton `classroom_sessions` FK) is redundant now — drop it.

### Session-occurrence lifecycle

- Created **lazily** on the first of {teacher opens the Attendance panel, teacher goes LIVE
  with a unit} for a class in the Commander. No empty rows if the teacher backs out.
- `endSession()` stamps `ended_at`. A closed tab leaves `ended_at` NULL — still a valid,
  complete-enough session for history.
- Each go-live = a new occurrence ⇒ two same-day sessions are independent.

### Data layer (`services/AttendanceService.ts`, rewritten)

- `getOrCreateActiveOccurrence(classId, teacherId, unitId?)` → occurrence id.
- `endOccurrence(occurrenceId)` → stamps `ended_at`.
- `getAttendanceForOccurrence(occurrenceId)` → `Map<rosterStudentId, status>`.
- `saveAttendance(occurrenceId, teacherId, statuses)` → upsert on
  `(occurrence_id, roster_student_id)`.
- `getSessionOccurrences(classId)` → history list with present/total counts.
- `getOccurrenceAttendance(occurrenceId)` → roster + marks for the history detail view.
- Hooks in `hooks/useQueries.ts` updated to the occurrence-based signatures; query keys
  `['attendance', occurrenceId]` and `['attendance-history', classId]`.

### Board integration

- `SessionRosterStudent` gains `isPresent: boolean` (default `true`).
- `getSessionRoster` accepts an optional attendance map and stamps `isPresent`;
  `loadStudents` fetches the active occurrence's map and passes it.
- New realtime channel on `attendance_records` filtered to the active occurrence →
  re-runs `loadStudents` on change.
- Filter on `isPresent !== false` in: `selectNextStudent` (picker/wheel), `assignTeams`,
  and the Commander command-deck student strip.
- Leaderboard/board render: absent students stay visible but **greyed**; not pickable.

### UI

- **`AttendanceModal.tsx`** (live, editable) — full roster checklist, checkbox
  pre-checked = present; header summary "X present · Y absent"; "+ Add student" walk-in;
  Save → `saveAttendance`. Realtime propagates changes to the board immediately.
- **`AttendanceHistoryModal.tsx`** (read-only) — list of occurrences for the class; tap
  one → that session's roster with present/absent marks.
- Wiring: Commander header gets an "Attendance" button (opens the live modal for the
  active occurrence); `ClassManagement` `ClassDetail` gets an "Attendance" button (opens
  the history modal).

## Build order

1. Rework migration: `class_session_occurrences` + re-keyed `attendance_records`;
   re-apply live (drop the empty table, recreate). Update the repo migration file to match.
2. Rewrite `AttendanceService` + hooks (occurrence-based).
3. `SessionContext`: occurrence lifecycle + `isPresent` merge + realtime channel +
   picker/team/strip filters.
4. `AttendanceModal` (live) + `AttendanceHistoryModal` (read-only).
5. Wire into `LiveCommander` (header button) + `ClassManagement` (history button).
6. Lint (0 app-source TS errors) → commit (including the previously-uncommitted backend)
   → push for live test.

## Verification

- Live DB: `class_session_occurrences` + re-keyed `attendance_records` (unique on
  `(occurrence_id, roster_student_id)`), RLS policies, realtime membership present.
- `npm run lint` → 0 app-source TS errors.
- Manual flow: go live with a class → take attendance → uncheck a kid → they're excluded
  from the picker/teams/wheel/strip but greyed on the leaderboard; start a second session
  same day → independent attendance; Classes screen → history lists both sessions.

## Out of scope (flagged)

- Per-student attendance rates / analytics.
- Parent-visible attendance.
- Export.
