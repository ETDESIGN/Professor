# Attendance Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let teachers take binary present/absent attendance per live teaching session; absent students are excluded from live-board participation (picking, teams, wheel, command-deck strip) but stay visible (greyed) on the leaderboard; the Classes screen shows read-only session history.

**Architecture:** Attendance is anchored to a new `class_session_occurrences` row (one per "go live"), not a calendar day. A pure `attendanceLogic` module holds all testable rules (presence merge, filter, status building, summary). `AttendanceService` wraps Supabase. `SessionContext` creates/ends occurrences, merges an `isPresent` flag onto each roster student, subscribes to realtime attendance changes, and filters participation. Two React components provide the live editable modal and the read-only history.

**Tech Stack:** Vite + React + TypeScript, Supabase (Postgres + RLS + Realtime), TanStack Query, vitest, Tailwind, framer-motion, lucide-react.

**Reference spec:** `docs/superpowers/specs/2026-07-24-attendance-design.md`

**Conventions (verified):**
- Lint: `npm run lint` (`tsc --noEmit`) → must be 0 app-source errors.
- Unit tests: `npm run test` (vitest). Test files live in `test/` and import from `../services/...`.
- Work dir for all commands: `professor-0.1 (1)/`.
- DB changes apply live via the Supabase Management API (per `AGENTS.md`), authenticated by `$SUPABASE_ACCESS_TOKEN`, project ref `xsdnzijketjnzhakqtit`.
- Pre-existing uncommitted work to fold in: `services/AttendanceService.ts`, `supabase/migrations/20260723000003_attendance_records.sql`, and the two hooks in `hooks/useQueries.ts`. These get **rewritten** by this plan (the shipped table has 0 rows, so re-keying is a clean rework).

---

## File Structure

- **Create** `services/attendanceLogic.ts` — pure presence rules (no I/O). Testable core.
- **Create** `test/attendanceLogic.test.ts` — unit tests for the pure rules.
- **Rewrite** `supabase/migrations/20260723000003_attendance_records.sql` — occurrences table + re-keyed attendance.
- **Rewrite** `services/AttendanceService.ts` — occurrence-based reads/writes + history.
- **Modify** `hooks/useQueries.ts` — occurrence/history hooks.
- **Modify** `services/DataService.ts` — add `isPresent` to `SessionRosterStudent`.
- **Modify** `store/SessionContext.tsx` — occurrence lifecycle, presence merge, realtime, participation filters.
- **Create** `apps/teacher/AttendanceModal.tsx` — live editable checklist.
- **Create** `apps/teacher/AttendanceHistoryModal.tsx` — read-only history.
- **Modify** `apps/teacher/LiveCommander.tsx` — header "Attendance" button + present-only command-deck strip.
- **Modify** `apps/teacher/ClassManagement.tsx` — "Attendance" (history) button in `ClassDetail`.
- **Modify** `apps/board/BoardShell.tsx` — grey absent on the leaderboard.
- **Modify** `apps/board/templates/BoardWheelOfDestiny.tsx` — wheel segments = present only.

---

## Task 1: Rework the database schema (occurrences + re-keyed attendance)

**Files:**
- Rewrite: `supabase/migrations/20260723000003_attendance_records.sql`

- [ ] **Step 1: Rewrite the migration file**

Replace the entire file contents with:

```sql
-- =====================================================================
-- 20260723000003 — session occurrences + per-session attendance
--
-- Attendance is anchored to a discrete teaching-session OCCURRENCE (one row
-- per "go live"), not a calendar day. A student can attend two sessions in a
-- day → two independent attendance sets. Absent students are excluded from
-- live-board participation but stay visible (greyed) on the leaderboard.
--
-- RLS reuses the recursion-safe can_manage_class(class_id, auth.uid()) helper.
-- =====================================================================

-- Discrete teaching-session occurrences (the durable session history the
-- singleton classroom_sessions row never kept).
CREATE TABLE IF NOT EXISTS public.class_session_occurrences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    uuid NOT NULL REFERENCES public.classes(id)   ON DELETE CASCADE,
  teacher_id  uuid NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  unit_id     uuid REFERENCES public.units(id)              ON DELETE SET NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_occurrences_class_started
  ON public.class_session_occurrences (class_id, started_at DESC);

ALTER TABLE public.class_session_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS occurrences_select_policy ON public.class_session_occurrences;
CREATE POLICY occurrences_select_policy ON public.class_session_occurrences
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR public.can_manage_class(class_session_occurrences.class_id, auth.uid())
  );

DROP POLICY IF EXISTS occurrences_write_policy ON public.class_session_occurrences;
CREATE POLICY occurrences_write_policy ON public.class_session_occurrences
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR public.can_manage_class(class_session_occurrences.class_id, auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR public.can_manage_class(class_session_occurrences.class_id, auth.uid())
  );

-- Per-(occurrence, student) attendance. Binary present/absent in the app;
-- CHECK keeps late/excused reserved for the future.
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id     uuid NOT NULL REFERENCES public.class_session_occurrences(id) ON DELETE CASCADE,
  class_id          uuid NOT NULL REFERENCES public.classes(id)         ON DELETE CASCADE,
  teacher_id        uuid NOT NULL REFERENCES public.profiles(id)        ON DELETE CASCADE,
  roster_student_id uuid NOT NULL REFERENCES public.roster_students(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'present'
                    CHECK (status IN ('present', 'absent', 'late', 'excused')),
  marked_at         timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- One record per student per occurrence; re-taking upserts the row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_occurrence_student
  ON public.attendance_records (occurrence_id, roster_student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_occurrence
  ON public.attendance_records (occurrence_id);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_select_policy ON public.attendance_records;
CREATE POLICY attendance_select_policy ON public.attendance_records
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR public.can_manage_class(attendance_records.class_id, auth.uid())
  );

DROP POLICY IF EXISTS attendance_write_policy ON public.attendance_records;
CREATE POLICY attendance_write_policy ON public.attendance_records
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR public.can_manage_class(attendance_records.class_id, auth.uid())
  ) WITH CHECK (
    teacher_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      OR public.can_manage_class(attendance_records.class_id, auth.uid())
    )
  );

-- Realtime so the board reflects mid-session attendance changes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='attendance_records') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='class_session_occurrences') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.class_session_occurrences;
  END IF;
END $$;
```

- [ ] **Step 2: Apply live (drop the empty shipped table, recreate)**

The shipped `attendance_records` (day-keyed, 0 rows) must be dropped first. Run:

```bash
cd "professor-0.1 (1)"
curl -s -X POST "https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"DROP TABLE IF EXISTS public.attendance_records CASCADE;"}'
```
Then apply the new migration body. Paste the SQL from Step 1 (minus comments is fine) as the `query` value in a second `POST .../database/query` call, or use the Supabase MCP `apply_migration` tool with name `20260723000003_attendance_records`.

- [ ] **Step 3: Verify live**

Run:
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"SELECT to_regclass('"'"'public.class_session_occurrences'"'"') AS occ, to_regclass('"'"'public.attendance_records'"'"') AS att, (SELECT count(*) FROM pg_indexes WHERE indexname='"'"'uq_attendance_occurrence_student'"'"') AS uniq, (SELECT count(*) FROM pg_policies WHERE tablename IN ('"'"'attendance_records'"'"','"'"'class_session_occurrences'"'"')) AS policies;"}'
```
Expected: `occ` and `att` non-null, `uniq=1`, `policies>=4`.

- [ ] **Step 4: Commit**

```bash
git add "supabase/migrations/20260723000003_attendance_records.sql"
git commit -m "feat(attendance): occurrences + per-session attendance schema"
```

---

## Task 2: Pure attendance logic module (TDD)

**Files:**
- Create: `services/attendanceLogic.ts`
- Test: `test/attendanceLogic.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/attendanceLogic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  isPresentStatus, mergePresence, filterPresent, buildStatuses, summarize,
} from '../services/attendanceLogic';

describe('attendanceLogic', () => {
  it('isPresentStatus: only explicit absent is not present', () => {
    expect(isPresentStatus(undefined)).toBe(true);   // opt-in default
    expect(isPresentStatus('present')).toBe(true);
    expect(isPresentStatus('absent')).toBe(false);
  });

  it('mergePresence stamps isPresent from the map, defaulting present', () => {
    const roster = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const map = new Map<string, any>([['b', 'absent'], ['c', 'present']]);
    const out = mergePresence(roster, map);
    expect(out.find(s => s.id === 'a')!.isPresent).toBe(true);  // missing → present
    expect(out.find(s => s.id === 'b')!.isPresent).toBe(false);
    expect(out.find(s => s.id === 'c')!.isPresent).toBe(true);
  });

  it('filterPresent drops only isPresent === false', () => {
    const s = [{ id: 'a', isPresent: true }, { id: 'b', isPresent: false }, { id: 'c' }];
    expect(filterPresent(s).map(x => x.id)).toEqual(['a', 'c']);
  });

  it('buildStatuses marks every roster id present/absent from the set', () => {
    const m = buildStatuses(['a', 'b', 'c'], new Set(['a', 'c']));
    expect(m.get('a')).toBe('present');
    expect(m.get('b')).toBe('absent');
    expect(m.get('c')).toBe('present');
    expect(m.size).toBe(3);
  });

  it('summarize counts present and absent', () => {
    expect(summarize(['a', 'b', 'c'], new Set(['a']))).toEqual({ present: 1, absent: 2 });
    expect(summarize([], new Set())).toEqual({ present: 0, absent: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- attendanceLogic`
Expected: FAIL — `Cannot find module '../services/attendanceLogic'`.

- [ ] **Step 3: Write the implementation**

Create `services/attendanceLogic.ts`:

```ts
import type { AttendanceStatus } from './AttendanceService';

/** A student is present unless explicitly marked 'absent'. Missing = present (opt-in). */
export function isPresentStatus(status: AttendanceStatus | undefined): boolean {
  return status !== 'absent';
}

/** Stamp isPresent onto each roster student from an attendance map (rosterId → status). */
export function mergePresence<T extends { id: string }>(
  roster: T[],
  attendance: Map<string, AttendanceStatus>,
): (T & { isPresent: boolean })[] {
  return roster.map(s => ({ ...s, isPresent: isPresentStatus(attendance.get(s.id)) }));
}

/** Only students who are present (isPresent !== false; undefined counts as present). */
export function filterPresent<T extends { isPresent?: boolean }>(students: T[]): T[] {
  return students.filter(s => s.isPresent !== false);
}

/** Full present/absent status map for every roster id, given the present set. */
export function buildStatuses(rosterIds: string[], presentIds: Set<string>): Map<string, AttendanceStatus> {
  const m = new Map<string, AttendanceStatus>();
  for (const id of rosterIds) m.set(id, presentIds.has(id) ? 'present' : 'absent');
  return m;
}

/** Present/absent counts for the modal header. */
export function summarize(rosterIds: string[], presentIds: Set<string>): { present: number; absent: number } {
  let present = 0;
  for (const id of rosterIds) if (presentIds.has(id)) present++;
  return { present, absent: rosterIds.length - present };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- attendanceLogic`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add services/attendanceLogic.ts test/attendanceLogic.test.ts
git commit -m "feat(attendance): pure presence logic module + tests"
```

---

## Task 3: Rewrite AttendanceService (occurrence-based)

**Files:**
- Rewrite: `services/AttendanceService.ts`

- [ ] **Step 1: Replace the file contents**

```ts
import { supabase } from './supabaseClient';
import { toast } from 'sonner';
import { createClientLogger } from './logger';
import { buildStatuses } from './attendanceLogic';

const log = createClientLogger('AttendanceService');

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface OccurrenceSummary {
  id: string;
  started_at: string;
  ended_at: string | null;
  present: number;
  total: number;
}

export interface OccurrenceMark {
  roster_student_id: string;
  name: string;
  status: AttendanceStatus;
}

/**
 * Return the id of the class's currently-open occurrence (ended_at IS NULL),
 * creating one if none is open. Called at go-live / when opening attendance.
 */
export async function getOrCreateActiveOccurrence(
  classId: string, teacherId: string, unitId?: string | null,
): Promise<string | null> {
  const { data: open } = await supabase
    .from('class_session_occurrences')
    .select('id')
    .eq('class_id', classId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open?.id) return open.id;

  const { data, error } = await supabase
    .from('class_session_occurrences')
    .insert({ class_id: classId, teacher_id: teacherId, unit_id: unitId ?? null })
    .select('id')
    .single();
  if (error) { log.warn('occurrence_create_error', { error: error.message }); return null; }
  return data.id;
}

/** Stamp ended_at on an occurrence (best-effort). */
export async function endOccurrence(occurrenceId: string): Promise<void> {
  const { error } = await supabase
    .from('class_session_occurrences')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', occurrenceId)
    .is('ended_at', null);
  if (error) log.warn('occurrence_end_error', { error: error.message });
}

/** Attendance for one occurrence as Map<roster_student_id, status>. */
export async function getAttendanceForOccurrence(
  occurrenceId: string,
): Promise<Map<string, AttendanceStatus>> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('roster_student_id, status')
    .eq('occurrence_id', occurrenceId);
  if (error) { log.warn('attendance_read_error', { error: error.message }); return new Map(); }
  const m = new Map<string, AttendanceStatus>();
  for (const r of (data || [])) m.set(r.roster_student_id, r.status as AttendanceStatus);
  return m;
}

/**
 * Persist a full present/absent pass for an occurrence. `presentIds` is the
 * set of roster ids marked present; every roster id gets a real row.
 */
export async function saveAttendance(
  occurrenceId: string, classId: string, teacherId: string,
  rosterIds: string[], presentIds: Set<string>,
): Promise<void> {
  if (rosterIds.length === 0) return;
  const statuses = buildStatuses(rosterIds, presentIds);
  const rows = [...statuses.entries()].map(([roster_student_id, status]) => ({
    occurrence_id: occurrenceId, class_id: classId, teacher_id: teacherId,
    roster_student_id, status, marked_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from('attendance_records')
    .upsert(rows, { onConflict: 'occurrence_id,roster_student_id', ignoreDuplicates: false });
  if (error) {
    log.warn('save_attendance_error', { error: error.message });
    toast.error('Could not save attendance. Please try again.');
    throw error;
  }
}

/** Occurrences for a class, newest first, with present/total counts. */
export async function getSessionOccurrences(classId: string): Promise<OccurrenceSummary[]> {
  const { data: occ, error } = await supabase
    .from('class_session_occurrences')
    .select('id, started_at, ended_at')
    .eq('class_id', classId)
    .order('started_at', { ascending: false });
  if (error || !occ) { log.warn('occurrences_read_error', { error: error?.message }); return []; }
  const ids = occ.map(o => o.id);
  if (ids.length === 0) return [];
  const { data: recs } = await supabase
    .from('attendance_records')
    .select('occurrence_id, status')
    .in('occurrence_id', ids);
  const total = new Map<string, number>();
  const present = new Map<string, number>();
  for (const r of (recs || [])) {
    total.set(r.occurrence_id, (total.get(r.occurrence_id) || 0) + 1);
    if (r.status !== 'absent') present.set(r.occurrence_id, (present.get(r.occurrence_id) || 0) + 1);
  }
  return occ.map(o => ({
    id: o.id, started_at: o.started_at, ended_at: o.ended_at,
    present: present.get(o.id) || 0, total: total.get(o.id) || 0,
  }));
}

/** Roster with marks for one occurrence (history detail). */
export async function getOccurrenceAttendance(occurrenceId: string): Promise<OccurrenceMark[]> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('roster_student_id, status, roster_students(display_name)')
    .eq('occurrence_id', occurrenceId);
  if (error) { log.warn('occurrence_detail_error', { error: error.message }); return []; }
  return (data || []).map((r: any) => ({
    roster_student_id: r.roster_student_id,
    name: r.roster_students?.display_name || 'Student',
    status: r.status as AttendanceStatus,
  }));
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no new errors referencing `services/AttendanceService.ts` or `services/attendanceLogic.ts`.

- [ ] **Step 3: Re-run the logic tests (import chain unchanged)**

Run: `npm run test -- attendanceLogic`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add services/AttendanceService.ts
git commit -m "feat(attendance): occurrence-based AttendanceService"
```

---

## Task 4: Update hooks in useQueries.ts

**Files:**
- Modify: `hooks/useQueries.ts` (the import block and the two attendance hooks added earlier, ~lines 41-46 and 335-362)

- [ ] **Step 1: Replace the AttendanceService import block**

Find:
```ts
import {
  getAttendanceForClassToday,
  saveAttendance,
  AttendanceStatus,
} from '../services/AttendanceService';
```
Replace with:
```ts
import {
  getAttendanceForOccurrence,
  saveAttendance,
  getSessionOccurrences,
  getOccurrenceAttendance,
} from '../services/AttendanceService';
```

- [ ] **Step 2: Replace the two attendance hooks**

Find the `useAttendanceToday` and `useSaveAttendance` functions and replace both with:
```ts
/** Attendance for an occurrence, as Map<roster_student_id, status>. */
export function useAttendanceForOccurrence(occurrenceId: string | undefined) {
  return useQuery({
    queryKey: ['attendance', occurrenceId],
    queryFn: () => getAttendanceForOccurrence(occurrenceId!),
    enabled: !!occurrenceId,
    staleTime: 5_000,
  });
}

/** Persist a present/absent pass for an occurrence. */
export function useSaveAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ occurrenceId, classId, teacherId, rosterIds, presentIds }: {
      occurrenceId: string; classId: string; teacherId: string;
      rosterIds: string[]; presentIds: Set<string>;
    }) => saveAttendance(occurrenceId, classId, teacherId, rosterIds, presentIds),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['attendance', v.occurrenceId] });
      qc.invalidateQueries({ queryKey: ['attendance-history', v.classId] });
    },
  });
}

/** Read-only session history for a class. */
export function useSessionOccurrences(classId: string | undefined) {
  return useQuery({
    queryKey: ['attendance-history', classId],
    queryFn: () => getSessionOccurrences(classId!),
    enabled: !!classId,
  });
}

/** Roster + marks for one occurrence (history detail). */
export function useOccurrenceAttendance(occurrenceId: string | undefined) {
  return useQuery({
    queryKey: ['attendance-detail', occurrenceId],
    queryFn: () => getOccurrenceAttendance(occurrenceId!),
    enabled: !!occurrenceId,
  });
}
```

- [ ] **Step 3: Verify compile**

Run: `npm run lint`
Expected: no errors in `hooks/useQueries.ts`.

- [ ] **Step 4: Commit**

```bash
git add hooks/useQueries.ts
git commit -m "feat(attendance): occurrence + history query hooks"
```

---

## Task 5: SessionContext — occurrence lifecycle, presence merge, realtime, filters

**Files:**
- Modify: `services/DataService.ts:107-116` (add `isPresent`), `services/DataService.ts:157-166` (default it)
- Modify: `store/SessionContext.tsx` (state, imports, loadStudents, realtime, setActiveUnit, endSession, selectNextStudent, assignTeams, context value + type)

- [ ] **Step 1: Add `isPresent` to the roster shape**

In `services/DataService.ts`, add to the `SessionRosterStudent` interface (after `is_claimed: boolean;`):
```ts
    isPresent: boolean;         // false only when explicitly marked absent this session
```
And in the `getSessionRoster` return object (the `roster.map(...)` result), add:
```ts
            isPresent: true,        // default present; loadStudents overlays attendance
```

- [ ] **Step 2: Import presence helpers + service in SessionContext**

At the top of `store/SessionContext.tsx`, add:
```ts
import { mergePresence, filterPresent } from '../services/attendanceLogic';
import { getOrCreateActiveOccurrence, endOccurrence, getAttendanceForOccurrence } from '../services/AttendanceService';
```

- [ ] **Step 3: Add `activeOccurrenceId` to session state**

In the `SessionState` interface add `activeOccurrenceId: string | null;` and in the initial state object (near `status: 'IDLE',`) add `activeOccurrenceId: null,`.

- [ ] **Step 4: Merge presence in `loadStudents`**

Replace the roster branch inside `loadStudents` (the `if (state.activeClassId) { ... return; }` block) with:
```ts
      if (state.activeClassId) {
        const roster = await getSessionRoster(state.activeClassId);
        const occId = activeOccurrenceIdRef.current;
        if (occId) {
          const attendance = await getAttendanceForOccurrence(occId);
          setState(prev => ({ ...prev, students: mergePresence(roster, attendance) }));
        } else {
          setState(prev => ({ ...prev, students: roster }));
        }
        return;
      }
```
Add a ref near the other refs (e.g. beside `activeClassIdRef`): `const activeOccurrenceIdRef = useRef<string | null>(null);` and keep it in sync — in the setState calls that set `activeOccurrenceId`, also set `activeOccurrenceIdRef.current`.

- [ ] **Step 5: Create the occurrence at go-live (`setActiveUnit`)**

Inside `setActiveUnit`, after `const userId = await getTeacherId();` and the `classroom_sessions` upsert, add:
```ts
      if (userId && activeClassIdRef.current) {
        const occId = await getOrCreateActiveOccurrence(activeClassIdRef.current, userId, unitId);
        activeOccurrenceIdRef.current = occId;
        setState(prev => ({ ...prev, activeOccurrenceId: occId }));
        await loadStudents();
      }
```

- [ ] **Step 6: Add a context method to ensure an occurrence exists (for opening the modal pre-live)**

Add to `SessionContextType`:
```ts
  ensureAttendanceOccurrence: () => Promise<string | null>;
```
Implement in the provider:
```ts
  const ensureAttendanceOccurrence = useCallback(async (): Promise<string | null> => {
    if (activeOccurrenceIdRef.current) return activeOccurrenceIdRef.current;
    const userId = await getTeacherId();
    const classId = activeClassIdRef.current;
    if (!userId || !classId) return null;
    const occId = await getOrCreateActiveOccurrence(classId, userId, activeUnitRef.current?.id ?? null);
    activeOccurrenceIdRef.current = occId;
    setState(prev => ({ ...prev, activeOccurrenceId: occId }));
    await loadStudents();
    return occId;
  }, []);
```
Add `ensureAttendanceOccurrence` to the context provider `value`.

- [ ] **Step 7: End the occurrence in `endSession`**

In `endSession`, before/after `persistSessionStatus('IDLE');` add:
```ts
    const occId = activeOccurrenceIdRef.current;
    if (occId) { void endOccurrence(occId); activeOccurrenceIdRef.current = null; }
    setState(prev => ({ ...prev, activeOccurrenceId: null }));
```

- [ ] **Step 8: Subscribe to attendance realtime**

In the realtime `useEffect` (keyed on `state.activeClassId`), add another `.on(...)` before `.subscribe()`:
```ts
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_records', filter: `class_id=eq.${state.activeClassId}` },
        () => loadStudents())
```
(Filtering by `class_id` is sufficient and avoids re-subscribing when the occurrence changes.)

- [ ] **Step 9: Filter participation on present-only**

In `selectNextStudent`, change:
```ts
    let pool = state.students;
```
to:
```ts
    let pool = filterPresent(state.students);
```
In `assignTeams`, change:
```ts
    const sorted = [...state.students].sort((a, b) => (b.points || 0) - (a.points || 0));
```
to:
```ts
    const sorted = filterPresent([...state.students]).sort((a, b) => (b.points || 0) - (a.points || 0));
```

- [ ] **Step 10: Verify compile**

Run: `npm run lint`
Expected: no errors in `store/SessionContext.tsx` or `services/DataService.ts`.

- [ ] **Step 11: Commit**

```bash
git add store/SessionContext.tsx services/DataService.ts
git commit -m "feat(attendance): occurrence lifecycle + presence merge + participation filters"
```

---

## Task 6: Live AttendanceModal + Commander wiring

**Files:**
- Create: `apps/teacher/AttendanceModal.tsx`
- Modify: `apps/teacher/LiveCommander.tsx` (import + header button + present-only command-deck strip)

- [ ] **Step 1: Create the modal**

Create `apps/teacher/AttendanceModal.tsx`:
```tsx
import React, { useMemo, useState } from 'react';
import { X, Check, Plus, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRosterForClass, useCreateRosterStudent, useSaveAttendance, useAttendanceForOccurrence } from '../../hooks/useQueries';
import { summarize } from '../../services/attendanceLogic';
import { toast } from 'sonner';

interface Props {
  classId: string;
  teacherId: string;
  occurrenceId: string;
  onClose: () => void;
}

const AttendanceModal: React.FC<Props> = ({ classId, teacherId, occurrenceId, onClose }) => {
  const { data: roster = [] } = useRosterForClass(classId);
  const { data: existing } = useAttendanceForOccurrence(occurrenceId);
  const createStudent = useCreateRosterStudent();
  const saveAttendance = useSaveAttendance();
  const [name, setName] = useState('');
  const [absent, setAbsent] = useState<Set<string>>(new Set());

  // Seed absent set from any saved attendance for this occurrence (present by default).
  React.useEffect(() => {
    if (!existing) return;
    const next = new Set<string>();
    existing.forEach((status, id) => { if (status === 'absent') next.add(id); });
    setAbsent(next);
  }, [existing]);

  const rosterIds = useMemo(() => roster.map(r => r.id), [roster]);
  const presentIds = useMemo(
    () => new Set(rosterIds.filter(id => !absent.has(id))),
    [rosterIds, absent],
  );
  const counts = summarize(rosterIds, presentIds);

  const toggle = (id: string) => setAbsent(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const handleAdd = async () => {
    if (!name.trim()) return;
    try {
      await createStudent.mutateAsync({ classId, teacherId, displayName: name });
      setName('');
    } catch { /* toast in service */ }
  };

  const handleSave = async () => {
    try {
      await saveAttendance.mutateAsync({ occurrenceId, classId, teacherId, rosterIds, presentIds });
      toast.success('Attendance saved');
      onClose();
    } catch { /* toast in service */ }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 60 }}
          className="bg-white w-full max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[90vh]">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center">
            <div>
              <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Users size={18} /> Attendance</h2>
              <p className="text-xs text-slate-500">{counts.present} present · {counts.absent} absent</p>
            </div>
            <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={20} className="text-slate-600" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {roster.map(r => {
              const present = !absent.has(r.id);
              return (
                <button key={r.id} onClick={() => toggle(r.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${present ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white opacity-60'}`}>
                  <span className="font-semibold text-slate-700">{r.display_name}</span>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center ${present ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                    {present && <Check size={14} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
            {roster.length === 0 && <p className="text-center text-sm text-slate-400 py-6">No students on the roster yet.</p>}
          </div>

          <div className="p-3 border-t border-slate-100 space-y-2">
            <div className="flex gap-2">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Add walk-in student…"
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              <button onClick={handleAdd} disabled={!name.trim()} className="px-3 py-2 bg-slate-100 rounded-xl text-slate-600 hover:bg-slate-200 disabled:opacity-40"><Plus size={18} /></button>
            </div>
            <button onClick={handleSave} disabled={saveAttendance.isPending}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50">
              {saveAttendance.isPending ? 'Saving…' : 'Save attendance'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AttendanceModal;
```

> Note: confirm the `useRosterForClass` row shape exposes `id` and `display_name` (it does — see `RosterStudent` in `services/ManagementService.ts` used by `ClassDetail`). If the property is `name` instead, adjust accordingly.

- [ ] **Step 2: Wire the Commander header button**

In `apps/teacher/LiveCommander.tsx`:
- Add to the lucide import list: `UserCheck`.
- Add to the `useSession()` destructure: `ensureAttendanceOccurrence`.
- Add local state near the other `useState`s: `const [showAttendance, setShowAttendance] = useState(false);`
- Import: `import AttendanceModal from './AttendanceModal';` and `import { useAuth } from ...` if a teacherId source is needed — use `state.activeClassId` for classId and get teacherId from the existing session (see below).
- In the header actions `<div className="flex items-center gap-4">`, before the End Session button, add:
```tsx
              <button
                onClick={async () => { const id = await ensureAttendanceOccurrence(); if (id) setShowAttendance(true); }}
                className="flex items-center gap-1.5 bg-slate-800 text-slate-200 px-3 py-1.5 rounded-full border border-slate-700 hover:bg-slate-700 text-sm font-bold"
                title="Attendance">
                <UserCheck size={14} /> Attendance
              </button>
```
- Before the final closing `</div>` of the component (near the Point Tooltip Modal render), add:
```tsx
        {showAttendance && state.activeClassId && state.activeOccurrenceId && (
          <AttendanceModal
            classId={state.activeClassId}
            teacherId={(state as any).teacherId || ''}
            occurrenceId={state.activeOccurrenceId}
            onClose={() => setShowAttendance(false)}
          />
        )}
```

> teacherId source: `saveAttendance` and `createStudent` need the teacher id. If `state` does not carry it, resolve it via the existing `getTeacherId()` path. Simplest: add `teacherId` to session state when the session is created, OR read `supabase.auth.getUser()` inside `AttendanceModal` instead of receiving it as a prop. **Decision:** resolve teacherId inside `AttendanceModal` via `supabase.auth.getUser()` in a `useEffect` and store in state, dropping the `teacherId` prop. Update the modal props to remove `teacherId` and add the lookup:
```tsx
// inside AttendanceModal, replace the teacherId prop with:
import { supabase } from '../../services/supabaseClient';
const [teacherId, setTeacherId] = useState('');
React.useEffect(() => { supabase.auth.getUser().then(({ data }) => setTeacherId(data.user?.id || '')); }, []);
```
Then the Commander render omits the `teacherId` prop.

- [ ] **Step 3: Present-only command-deck strip**

In `LiveCommander.tsx`, add import: `import { filterPresent } from '../../store/../services/attendanceLogic';` (use the correct relative path `../../services/attendanceLogic`). Change the command-deck map:
```tsx
                  {state.students.map((student: any) => (
```
to:
```tsx
                  {filterPresent(state.students).map((student: any) => (
```

- [ ] **Step 4: Verify compile**

Run: `npm run lint`
Expected: no errors in `apps/teacher/LiveCommander.tsx` or `apps/teacher/AttendanceModal.tsx`.

- [ ] **Step 5: Commit**

```bash
git add apps/teacher/AttendanceModal.tsx apps/teacher/LiveCommander.tsx
git commit -m "feat(attendance): live attendance modal + commander wiring"
```

---

## Task 7: Read-only history modal + ClassManagement wiring

**Files:**
- Create: `apps/teacher/AttendanceHistoryModal.tsx`
- Modify: `apps/teacher/ClassManagement.tsx` (import + state + button in `ClassDetail` header)

- [ ] **Step 1: Create the history modal**

Create `apps/teacher/AttendanceHistoryModal.tsx`:
```tsx
import React, { useState } from 'react';
import { X, Check, Minus, ChevronLeft } from 'lucide-react';
import { useSessionOccurrences, useOccurrenceAttendance } from '../../hooks/useQueries';

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

const AttendanceHistoryModal: React.FC<{ classId: string; onClose: () => void }> = ({ classId, onClose }) => {
  const { data: sessions = [], isLoading } = useSessionOccurrences(classId);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: detail = [] } = useOccurrenceAttendance(openId ?? undefined);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {openId && <button onClick={() => setOpenId(null)} className="text-slate-400 hover:text-slate-600"><ChevronLeft size={18} /></button>}
            <h2 className="font-bold text-lg text-slate-800">{openId ? 'Session detail' : 'Attendance history'}</h2>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {!openId && (
            isLoading ? <p className="text-sm text-slate-400 p-4">Loading…</p> :
            sessions.length === 0 ? <p className="text-sm text-slate-400 p-4 text-center">No sessions recorded yet.</p> :
            sessions.map(s => (
              <button key={s.id} onClick={() => setOpenId(s.id)}
                className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-slate-50 border-b border-slate-100 text-left">
                <span className="text-sm font-semibold text-slate-700">{fmt(s.started_at)}</span>
                <span className="text-xs font-bold text-slate-500">{s.present}/{s.total} present</span>
              </button>
            ))
          )}
          {openId && detail.map(m => {
            const present = m.status !== 'absent';
            return (
              <div key={m.roster_student_id} className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                <span className="text-sm font-medium text-slate-700">{m.name}</span>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center ${present ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                  {present ? <Check size={13} strokeWidth={3} /> : <Minus size={13} />}
                </span>
              </div>
            );
          })}
          {openId && detail.length === 0 && <p className="text-sm text-slate-400 p-4 text-center">No marks recorded for this session.</p>}
        </div>
      </div>
    </div>
  );
};

export default AttendanceHistoryModal;
```

- [ ] **Step 2: Wire the button into ClassDetail**

In `apps/teacher/ClassManagement.tsx`:
- Add import: `import AttendanceHistoryModal from './AttendanceHistoryModal';`
- Add to the lucide import list: `CalendarCheck`.
- In `ClassDetail`, add state near `const [showAdd, setShowAdd] = useState(false);`: `const [showHistory, setShowHistory] = useState(false);`
- In the header actions `<div className="flex gap-2">` (line ~359), after the "Teach" button, add:
```tsx
                        <button onClick={() => setShowHistory(true)}
                          className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
                          <CalendarCheck size={15} /> Attendance
                        </button>
```
- Before the final closing tag of `ClassDetail`'s returned JSX, add:
```tsx
            {showHistory && <AttendanceHistoryModal classId={cls.id} onClose={() => setShowHistory(false)} />}
```

- [ ] **Step 3: Verify compile**

Run: `npm run lint`
Expected: no errors in `apps/teacher/ClassManagement.tsx` or `apps/teacher/AttendanceHistoryModal.tsx`.

- [ ] **Step 4: Commit**

```bash
git add apps/teacher/AttendanceHistoryModal.tsx apps/teacher/ClassManagement.tsx
git commit -m "feat(attendance): read-only session history + classes wiring"
```

---

## Task 8: Board presence rendering (grey leaderboard, present-only wheel)

**Files:**
- Modify: `apps/board/BoardShell.tsx` (leaderboard rows ~258-268)
- Modify: `apps/board/templates/BoardWheelOfDestiny.tsx:31` (present-only segments)

- [ ] **Step 1: Grey absent students on the leaderboard**

In `apps/board/BoardShell.tsx`, the `leaderboard` memo keeps ALL students (do not filter). In the `leaderboard.map((s, i) => ( ... ))` row JSX, add a greyed style when absent. Change the row's outer element `className` to append presence-based opacity, e.g. add to the existing className string:
```tsx
${s.isPresent === false ? 'opacity-40 grayscale' : ''}
```
(Insert into the row container's `className` template literal; do not remove existing classes.)

- [ ] **Step 2: Present-only wheel segments**

In `apps/board/templates/BoardWheelOfDestiny.tsx`, change line 31:
```tsx
const students = useMemo(() => state.students || [], [state.students]);
```
to:
```tsx
import { filterPresent } from '../../../services/attendanceLogic';
// ...
const students = useMemo(() => filterPresent(state.students || []), [state.students]);
```
(Place the import at the top with the other imports; keep the memo where it is.)

- [ ] **Step 3: Verify compile**

Run: `npm run lint`
Expected: no errors in the two board files.

- [ ] **Step 4: Commit**

```bash
git add apps/board/BoardShell.tsx apps/board/templates/BoardWheelOfDestiny.tsx
git commit -m "feat(attendance): grey absent on leaderboard + present-only wheel"
```

---

## Task 9: Full verification + push

- [ ] **Step 1: Lint clean**

Run: `npm run lint`
Expected: 0 app-source TS errors.

- [ ] **Step 2: Unit tests pass**

Run: `npm run test -- attendanceLogic`
Expected: PASS. Then `npm run test` — expected: no new failures introduced by this feature.

- [ ] **Step 3: Live DB verification**

Run the Step 3 query from Task 1 again; confirm both tables, the unique index, and policies exist.

- [ ] **Step 4: Manual smoke (after Vercel deploy)**

1. Open a class → **Teach** → go live with a unit → tap **Attendance** in the header → uncheck one student → **Save**.
2. Confirm that student is **absent from** the command-deck strip and the wheel segments, but **greyed** on the projector leaderboard.
3. **End Session**, start a second session for the same class the same day, take attendance again.
4. On the Classes screen → **Attendance** button → confirm **two** sessions listed with correct present counts; open one → see present/absent marks.

- [ ] **Step 5: Push**

```bash
git push origin master
```
(Vercel auto-deploys `master`.)

---

## Self-Review Notes (author)

- **Spec coverage:** per-session model (Task 1/5), binary present/absent (Task 2/6), Commander-only taking + never-forced button (Task 6), read-only history (Task 7), participation exclusion + greyed leaderboard (Task 5/6/8), safe default present (Task 2 `isPresentStatus` + `getSessionRoster` default), local-time history rendering (Task 7 `toLocaleString`), walk-in add (Task 6). All covered.
- **Type consistency:** `AttendanceStatus` defined in `AttendanceService.ts`, imported by `attendanceLogic.ts`; `saveAttendance(occurrenceId, classId, teacherId, rosterIds, presentIds)` signature is identical in the service (Task 3) and the hook (Task 4) and the modal call (Task 6). `SessionRosterStudent.isPresent` added in Task 5 and consumed by `filterPresent`/leaderboard.
- **Deferred (flagged, not in this plan):** filtering absent from `BoardSpeedQuiz`/`BoardTeamBattle`/`BoardListenTap` internal roster memos — the authoritative pick (`selectNextStudent`) already excludes absent, so those visuals cannot select an absent student; refine later if their on-screen rosters need to hide absentees. Per-student attendance rates, parent-visible attendance, and export remain out of scope.
