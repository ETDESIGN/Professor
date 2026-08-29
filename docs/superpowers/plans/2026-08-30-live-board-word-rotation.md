# Live Board Whole-Pool Word Rotation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make live-board games deal the unit's ENTIRE vocabulary (30 words → all 30) with per-session randomized order and a refresh-proof, cross-tab rotation ledger — instead of always replaying the first ~4 words in textbook order.

**Architecture:** Two layers. (1) Fix the selection engines' tie-break: rank objectives by retrievability *value* (dense ranks — equal R ⇒ equal rank) so the existing seeded shuffle governs ties; applied at `lessonDirector.buildRound`, `quizEngine.buildQuizComposition`, and `useBoardPool`'s item sort. (2) Persist the rotation: a `dealt_objectives` JSONB column on `classroom_sessions` + idempotent merge RPC riding the existing `classroom_session_sync` realtime channel; a thin `useCoverageLedger` hook hydrates/drains it.

**Tech Stack:** Vite + TypeScript SPA (React), Supabase Postgres 17 + RLS + Realtime, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-30-live-board-word-rotation-design.md`

## Global Constraints

- ALL git/test commands run with workdir `professor-0.1 (1)/` (the git repo root). Never `cd` in compound commands — set the shell workdir instead.
- Test runner: `npx vitest run <file>` (single file) or `npm test` (all). Typecheck: `npx tsc --noEmit`.
- Supabase project ref: `xsdnzijketjnzhakqtit`. SQL applies via Management API: `curl -s -X POST "https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" --data-binary @/dev/stdin` with body `{"query": "..."}`. `$SUPABASE_ACCESS_TOKEN` is already exported in the agent env.
- No changes under `supabase/functions/` except the explicitly optional Task 10 (edge functions do NOT auto-deploy; Task 10 includes its manual deploy step).
- Selection randomness MUST stay seeded (`makeRng` from `services/seededRandom.ts`) — never `Math.random` in selection paths (cross-tab deal agreement, FIXPLAN E1.3).
- Do not push to `master` during Tasks 1–9 (push auto-deploys the Vercel frontend). Work on branch `fix/live-board-word-rotation`; merge only in Task 9 after verification.
- SRS/escalation logic (`rawMasteryToRung`, `nextRungForObjective`, rung ladders) must NOT change — reinforcement stays untouched by design.
- Ignore the `.worktrees/` directories (other branches' checkouts).

## File Structure (responsibilities)

| File | Responsibility | Action |
|---|---|---|
| `apps/board/lessonDirector.ts` | Pure selection engine + new `denseWeakRanks` helper | Modify |
| `apps/board/quizEngine.ts` | Quiz composition (SpeedQuiz/TeamBattle/VocabBlitz) | Modify |
| `apps/board/useBoardPool.ts` | Pool item fetch + weak-ordering of items | Modify |
| `apps/board/useEscalatingPool.ts` | React binding: buildRound per round | Modify |
| `apps/board/coverageStore.ts` | In-memory served-set, session-scoped | Modify |
| `apps/board/ledgerWriter.ts` | NEW: debounced `merge_dealt_objectives` RPC writer (no React) | Create |
| `apps/board/useCoverageLedger.ts` | NEW: React hook — hydrate from session row + write through | Create |
| `store/SessionContext.tsx` | Expose `dealtObjectives` from session rows | Modify |
| `supabase/migrations/20260830120000_live_board_coverage_ledger.sql` | NEW: column + RPCs | Create |
| `test/lessonDirector.test.ts` | Selection regression tests | Modify |
| `test/coverageStore.test.ts` | NEW: store semantics | Create |
| `test/ledgerWriter.test.ts` | NEW: debounce/flush semantics | Create |
| `test/quizEngineComposition.test.ts` | NEW (absorbs updated quiz tests) | Create/Modify |
| `AGENTS.md` | Known-issues row for this fix | Modify |

---

### Task 0: Branch + baseline

**Files:** none (git only)

- [ ] **Step 1: Create the working branch**

```bash
git -C "professor-0.1 (1)" status --porcelain   # note any pre-existing dirt; do not touch it
git -C "professor-0.1 (1)" checkout -b fix/live-board-word-rotation master
```

- [ ] **Step 2: Baseline test run**

Run: `npm test` (workdir `professor-0.1 (1)/`)
Expected: all green. If any pre-existing failure, record it here and treat it as out of scope: ____________

- [ ] **Step 3: Commit the spec on the branch**

```bash
git -C "professor-0.1 (1)" add "docs/superpowers/specs/2026-08-30-live-board-word-rotation-design.md"
git -C "professor-0.1 (1)" commit -m "docs: live board word rotation design spec"
```

---

### Task 1: Migration — `dealt_objectives` column + merge/clear RPCs

**Files:**
- Create: `supabase/migrations/20260830120000_live_board_coverage_ledger.sql`

**Interfaces:**
- Produces (DB): column `classroom_sessions.dealt_objectives jsonb not null default '{}'::jsonb`; functions `public.merge_dealt_objectives(p_session_id uuid, p_unit_id uuid, p_objective_ids uuid[]) → void` and `public.clear_dealt_objectives(p_session_id uuid, p_unit_id uuid) → void` (invoker security, ownership-checked via `teacher_id = auth.uid()` in the WHERE clause — the existing `classroom_sessions_update_policy` RLS also applies).

- [ ] **Step 1: Write the migration file**

```sql
-- 20260830120000_live_board_coverage_ledger.sql
-- Live board whole-pool word rotation: persist which objectives have been
-- dealt to the board per (session, unit) so the sequential-deal rotation
-- survives page refreshes and is shared by commander/board/remote tabs via
-- the existing classroom_session_sync postgres_changes channel.
-- Element order inside the array is immaterial (consumed as a set).

alter table public.classroom_sessions
  add column if not exists dealt_objectives jsonb not null default '{}'::jsonb;

-- Union-merge objective ids into dealt_objectives[p_unit_id]. Idempotent:
-- concurrent tabs compute identical selections, so writes converge.
create or replace function public.merge_dealt_objectives(
  p_session_id uuid,
  p_unit_id uuid,
  p_objective_ids uuid[]
) returns void
language sql
security invoker
as $$
  update public.classroom_sessions cs
     set dealt_objectives = jsonb_set(
           cs.dealt_objectives,
           array[p_unit_id::text],
           (
             select coalesce(jsonb_agg(distinct_val), '[]'::jsonb)
             from (
               select distinct x as distinct_val
               from (
                 select jsonb_array_elements_text(
                          coalesce(cs.dealt_objectives -> p_unit_id::text, '[]'::jsonb)
                        ) as x
                 union
                 select unnest(p_objective_ids)::text as x
               ) merged
             ) deduped
           ),
           true
         ),
         updated_at = now()
   where cs.id = p_session_id
     and cs.teacher_id = auth.uid();
$$;

-- Remove a unit's dealt history (teacher restarts the unit's rotation).
create or replace function public.clear_dealt_objectives(
  p_session_id uuid,
  p_unit_id uuid
) returns void
language sql
security invoker
as $$
  update public.classroom_sessions cs
     set dealt_objectives = cs.dealt_objectives - p_unit_id::text,
         updated_at = now()
   where cs.id = p_session_id
     and cs.teacher_id = auth.uid();
$$;
```

- [ ] **Step 2: Apply to cloud via Management API**

Apply the file's SQL (strip comments is unnecessary — send as-is) using the Global Constraints curl pattern with body `{"query": "<the SQL above, newlines escaped or via --data-binary stdin>"}`. Practical form:

```bash
cd "professor-0.1 (1)"
jq -Rs '{query: .}' supabase/migrations/20260830120000_live_board_coverage_ledger.sql \
| curl -s -X POST "https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  --data-binary @/dev/stdin
```

Expected: `[{...}]`-shaped success or empty array `[]` — NOT `{"message":"Failed to run sql query": ...}`.

- [ ] **Step 3: Verify schema + function existence**

```bash
cat <<'EOF' | curl -s -X POST "https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" --data-binary @/dev/stdin
{"query": "select column_name, data_type, column_default from information_schema.columns where table_name='classroom_sessions' and column_name='dealt_objectives'; select proname from pg_proc where proname in ('merge_dealt_objectives','clear_dealt_objectives');"}
EOF
```

Expected: 1 column row (`jsonb`, default `'{}'::jsonb`) + 2 function rows. Also verify existing rows weren't clobbered: `select count(*) from classroom_sessions;` matches pre-migration count (expect 1).

- [ ] **Step 4: Commit**

```bash
git -C "professor-0.1 (1)" add supabase/migrations/20260830120000_live_board_coverage_ledger.sql
git -C "professor-0.1 (1)" commit -m "feat(db): dealt_objectives coverage ledger on classroom_sessions"
```

Note: do NOT add a `schema_migrations` marker row — this project applies migrations via Management API and records drift in AGENTS.md, and `supabase db push` is currently blocked by an unrelated pre-existing duplicate version (AGENTS.md §3).

---

### Task 2: `denseWeakRanks` helper (TDD)

**Files:**
- Modify: `apps/board/lessonDirector.ts`
- Test: `test/lessonDirector.test.ts`

**Interfaces:**
- Produces: `export function denseWeakRanks(weak: ReadonlyArray<{ objective_id: string; retrievability: number }>): Record<string, number>` — equal `retrievability` values map to the SAME rank (dense ranking, ascending); later tasks call this on `classWeakObjectives` output.

- [ ] **Step 1: Write the failing tests** — extend the existing `lessonDirector` import in `test/lessonDirector.test.ts` (line 10) to also pull `denseWeakRanks`, then append:

```ts
describe('denseWeakRanks', () => {
  it('gives equal retrievability the SAME rank (the production fresh-class case)', () => {
    const weak = IDS.map((id) => ({ objective_id: id, retrievability: 0 }));
    const ranks = denseWeakRanks(weak);
    for (const id of IDS) expect(ranks[id]).toBe(0);
  });

  it('dense-ranks distinct retrievability ascending', () => {
    const weak = [
      { objective_id: 'a', retrievability: 0.2 },
      { objective_id: 'b', retrievability: 0.9 },
      { objective_id: 'c', retrievability: 0.2 },
      { objective_id: 'd', retrievability: 0.5 },
    ];
    expect(denseWeakRanks(weak)).toEqual({ a: 0, b: 2, c: 0, d: 1 });
  });

  it('returns {} for empty input', () => {
    expect(denseWeakRanks([])).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/lessonDirector.test.ts`
Expected: FAIL — `denseWeakRanks` is not exported.

- [ ] **Step 3: Implement** — in `apps/board/lessonDirector.ts`, directly above `export interface BuildRoundInput`:

```ts
// =====================================================================
// 6a. denseWeakRanks — the production-shape weak ranking (2026-08-30).
//
// classWeakObjectives returns ALL objectives sorted by retrievability; on a
// fresh class every word ties at R = 0, so a POSITIONAL rank (index into
// that list) is a total order that annihilates buildRound's tie-break
// shuffle (the "first 4 words forever" bug). Dense ranks — equal R ⇒ equal
// rank — restore the intended semantics: strict weak-first for genuinely
// unequal R, seeded shuffle within ties.
// =====================================================================

export interface WeakObjectiveScore {
  objective_id: string;
  retrievability: number;
}

export function denseWeakRanks(weak: ReadonlyArray<WeakObjectiveScore>): Record<string, number> {
  const levels = Array.from(new Set(weak.map((w) => w.retrievability))).sort((a, b) => a - b);
  const levelIndex = new Map<number, number>(levels.map((r, i) => [r, i]));
  const out: Record<string, number> = {};
  for (const w of weak) out[w.objective_id] = levelIndex.get(w.retrievability) ?? levels.length;
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/lessonDirector.test.ts`
Expected: PASS (3 new tests).

- [ ] **Step 5: Commit**

```bash
git -C "professor-0.1 (1)" add apps/board/lessonDirector.ts test/lessonDirector.test.ts
git -C "professor-0.1 (1)" commit -m "feat(board): denseWeakRanks — rank by retrievability value, not position"
```

---

### Task 3: `buildRound` consumes `weakRanks` (the core fix, TDD)

**Files:**
- Modify: `apps/board/lessonDirector.ts` (buildRound + `BuildRoundInput`)
- Modify: `apps/board/useEscalatingPool.ts` (caller compile-fix only; full rewire is Task 8)
- Test: `test/lessonDirector.test.ts`

**Interfaces:**
- Consumes: `denseWeakRanks` (Task 2).
- Produces: `BuildRoundInput.weakRanks: Record<string, number>` REPLACES the removed `weakOrder: string[]`. Objectives missing from the map sink to the end (`fallbackRank = max rank + 1`, or 0 when the map is empty). `buildRound`'s other inputs/outputs unchanged.

- [ ] **Step 1: Migrate existing tests to the new contract + add the production-bug regression**

In `test/lessonDirector.test.ts`: in `baseInput`, change `weakOrder: [],` to `weakRanks: {},`. Replace every `weakOrder` usage as follows — the old positional tests become strict-rank tests (distinct ranks = strict priority), and NEW tests pin the actual bug:

```ts
// Helper: positional order → strict dense ranks (what the old tests meant).
const strictRanks = (ids: string[]) => Object.fromEntries(ids.map((id, i) => [id, i]));

describe('buildRound — dense-rank tie-break (the "first 4 words forever" regression, 2026-08-30)', () => {
  it('full weak list with ALL-EQUAL retrievability does NOT collapse to the insertion-order prefix', () => {
    // Production shape: classWeakObjectives returns every objective, fresh
    // class ties at R = 0. Under the old positional ranking the subsequent
    // stable sort restored DB insertion order and the shuffle was a no-op.
    const ranks = denseWeakRanks(IDS.map((id) => ({ objective_id: id, retrievability: 0 })));
    const firsts = new Set<string>();
    for (let i = 0; i < 40; i++) {
      firsts.add(buildRound(baseInput({ weakRanks: ranks })).selectedObjectiveIds[0]);
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('deterministic per (session seed, round): identical input → identical selection', () => {
    const ranks = denseWeakRanks(IDS.map((id) => ({ objective_id: id, retrievability: 0 })));
    const a = buildRound(baseInput({ weakRanks: ranks }));
    const b = buildRound(baseInput({ weakRanks: ranks }));
    expect(a.selectedObjectiveIds).toEqual(b.selectedObjectiveIds);
  });

  it('strict ranks preserve weak-first regardless of the shuffle', () => {
    const r = buildRound(baseInput({ weakRanks: strictRanks([...IDS]) }));
    expect(new Set(r.selectedObjectiveIds)).toEqual(new Set(IDS.slice(0, 6)));
  });
});
```

Then update the OLD describe blocks: `weakOrder: [...IDS]` → `weakRanks: strictRanks([...IDS])`, `weakOrder` variable declarations likewise, and `baseInput({ weakOrder })` → `baseInput({ weakRanks })`. The tests' assertions (round 2 = next 6 weakest, full coverage, wrap) must keep passing unchanged.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/lessonDirector.test.ts`
Expected: FAIL — TS/property error on `weakRanks` (not in `BuildRoundInput`) and `weakOrder` leftovers.

- [ ] **Step 3: Implement in `lessonDirector.ts`**

1. In `BuildRoundInput`, delete:
```ts
  /** Objective IDs ordered weakest-first (from classWeakObjectives). Objectives
   *  not in this list sink to the end in their natural order. */
  weakOrder: string[];
```
and add:
```ts
  /** Dense weak ranks by retrievability (denseWeakRanks of the
   *  classWeakObjectives output). Equal rank = tied ⇒ seeded shuffle decides.
   *  Objectives missing from the map sink to the end. */
  weakRanks: Record<string, number>;
```
2. In `buildRound`'s destructure, replace `weakOrder` with `weakRanks`.
3. Replace the ranking block:
```ts
  // Rank objectives weakest-first (those not in weakRanks sink to the end).
  // DENSE ranks (equal R ⇒ equal rank) mean ties survive this stable sort —
  // the seeded shuffle above decides them. A positional rank here used to be
  // a total order that restored DB insertion order and annulled the shuffle
  // ("first 4 words forever", fixed 2026-08-30).
  const rankValues = Object.values(weakRanks);
  const fallbackRank = rankValues.length > 0 ? Math.max(...rankValues) + 1 : 0;
  const weakRank = (oid: string) => weakRanks[oid] ?? fallbackRank;
```
Keep the existing Fisher–Yates shuffle and `const ranked = shuffled.sort((a, b) => weakRank(a) - weakRank(b));` untouched. Also update the module-header comment block near `buildRound` that mentions `weakOrder` if present.

- [ ] **Step 4: Compile-fix the caller** — `apps/board/useEscalatingPool.ts`: in the `round` useMemo (lines ~147–166), delete the `weakOrder,` argument from the `buildRound` call and instead compute a temporary positional shim at the top of the memo body (Task 8 does the real rewire):
```ts
    // TEMP (Task 4 replaces with denseWeakRanks of the classWeakObjectives
    // output): positional ranks keep this compiling; behavior identical to
    // the old weakOrder semantics.
    const weakRanks: Record<string, number> = Object.fromEntries(weakOrder.map((id, i) => [id, i]));
```
and pass `weakRanks` in the `buildRound` call (memo deps unchanged).

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run test/lessonDirector.test.ts && npx tsc --noEmit`
Expected: all tests PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git -C "professor-0.1 (1)" add apps/board/lessonDirector.ts apps/board/useEscalatingPool.ts test/lessonDirector.test.ts
git -C "professor-0.1 (1)" commit -m "fix(board): buildRound dense-rank tie-break — seeded shuffle now governs fresh-class ties"
```

---

### Task 4: `useEscalatingPool` — real ranks + shell-scoped seed

**Files:**
- Modify: `apps/board/useEscalatingPool.ts`

**Interfaces:**
- Consumes: `denseWeakRanks` (Task 2), `buildRound` with `weakRanks` (Task 3).
- Produces: unchanged hook output (`items`, `loading`, `rungByObjective`, `selectedObjectiveIds`).

- [ ] **Step 1: Replace the weakOrder state with ranks**

In `useEscalatingPool.ts` step-2 effect (~lines 98–133): change `const [weakOrder, setWeakOrder] = useState<string[]>([]);` to `const [weakRanks, setWeakRanks] = useState<Record<string, number>>({});`; replace `setWeakOrder(weak.map((w) => w.objective_id));` with `setWeakRanks(denseWeakRanks(weak));` (add `denseWeakRanks` to the existing `lessonDirector` import). Update the `if (!unitId || roster.length === 0)` early-return to `setWeakRanks({})`.

- [ ] **Step 2: Update the round memo**

Remove the TEMP shim from Task 3 Step 4; pass `weakRanks` in the `buildRound` call; update the memo dep `weakOrder` → `weakRanks`. Add the shell to the rng seed so different games deal differently at the same round index:
```ts
      rng: makeRng(sessionId, unitId, shellType, roundIndex),
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: typecheck clean; full suite green (selection logic covered by Task 3 tests; this task is wiring).

- [ ] **Step 4: Commit**

```bash
git -C "professor-0.1 (1)" add apps/board/useEscalatingPool.ts
git -C "professor-0.1 (1)" commit -m "feat(board): escalating pool uses dense weak ranks + shell-scoped deal seed"
```

---

### Task 5: `coverageStore` — session-scoped keys + hydration (TDD)

**Files:**
- Modify: `apps/board/coverageStore.ts`
- Create: `test/coverageStore.test.ts`
- Modify: `test/lessonDirector.test.ts` (its `servedFor/markServed/resetUnit` imports/calls)
- Modify: `apps/board/useEscalatingPool.ts`, `apps/board/quizEngine.ts` (compile-fix callers; full ledger wiring is Task 8)

**Interfaces:**
- Produces: `servedFor(sessionId: string, unitId: string): string[]`; `markServed(sessionId: string, unitId: string, objectiveIds: string[]): void`; `resetUnit(sessionId: string, unitId: string): void`; NEW `hydrateUnit(sessionId: string, unitId: string, objectiveIds: readonly string[]): void` (union-merge into memory; idempotent). The OLD 2-arg signatures are REMOVED.

- [ ] **Step 1: Write the failing tests** — `test/coverageStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { servedFor, markServed, resetUnit, hydrateUnit } from '../apps/board/coverageStore';

describe('coverageStore (session-scoped)', () => {
  beforeEach(() => {
    resetUnit('sess-1', 'unit-A');
    resetUnit('sess-2', 'unit-A');
  });

  it('isolates different sessions on the same unit', () => {
    markServed('sess-1', 'unit-A', ['o1']);
    markServed('sess-2', 'unit-A', ['o2']);
    expect(servedFor('sess-1', 'unit-A')).toEqual(['o1']);
    expect(servedFor('sess-2', 'unit-A')).toEqual(['o2']);
  });

  it('isolates different units in the same session', () => {
    markServed('sess-1', 'unit-A', ['o1']);
    expect(servedFor('sess-1', 'unit-B')).toEqual([]);
  });

  it('markServed is idempotent and union-merges', () => {
    markServed('sess-1', 'unit-A', ['o1', 'o2']);
    markServed('sess-1', 'unit-A', ['o2', 'o3']);
    expect(servedFor('sess-1', 'unit-A').sort()).toEqual(['o1', 'o2', 'o3']);
  });

  it('hydrateUnit merges a DB snapshot without losing local optimism', () => {
    markServed('sess-1', 'unit-A', ['local-only']);
    hydrateUnit('sess-1', 'unit-A', ['db-1', 'local-only']);
    expect(servedFor('sess-1', 'unit-A').sort()).toEqual(['db-1', 'local-only']);
  });

  it('resetUnit forgets only that (session, unit)', () => {
    markServed('sess-1', 'unit-A', ['o1']);
    markServed('sess-1', 'unit-B', ['o2']);
    resetUnit('sess-1', 'unit-A');
    expect(servedFor('sess-1', 'unit-A')).toEqual([]);
    expect(servedFor('sess-1', 'unit-B')).toEqual(['o2']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/coverageStore.test.ts`
Expected: FAIL (arity/signature errors).

- [ ] **Step 3: Implement** — rewrite `apps/board/coverageStore.ts` body (keep header comments, update them):

```ts
const store = new Map<string, Set<string>>();

const scopedKey = (sessionId: string, unitId: string) => `${sessionId}:${unitId}`;

/** Objective ids already dealt for this (session, unit) (insertion order). */
export function servedFor(sessionId: string, unitId: string): string[] {
  return Array.from(store.get(scopedKey(sessionId, unitId)) ?? []);
}

/** Record objectives as dealt. Idempotent. */
export function markServed(sessionId: string, unitId: string, objectiveIds: string[]): void {
  if (!sessionId || !unitId || objectiveIds.length === 0) return;
  const key = scopedKey(sessionId, unitId);
  let set = store.get(key);
  if (!set) {
    set = new Set<string>();
    store.set(key, set);
  }
  for (const id of objectiveIds) set.add(id);
}

/** Union-merge a DB ledger snapshot into memory (refresh/late-join
 *  hydration; never discards optimistic local marks). Idempotent. */
export function hydrateUnit(sessionId: string, unitId: string, objectiveIds: readonly string[]): void {
  markServed(sessionId, unitId, objectiveIds as string[]);
}

/** Forget the (session, unit)'s dealt history (e.g. teacher restarts a unit). */
export function resetUnit(sessionId: string, unitId: string): void {
  store.delete(scopedKey(sessionId, unitId));
}
```

Also update the module header comment: scope is now `(sessionId, unitId)` — session-scoped by the classroom_sessions row id, memory-only (persistence is the DB ledger, Task 8).

- [ ] **Step 4: Compile-fix every caller**

- `test/lessonDirector.test.ts`: the sequential-deal tests call `markServed(unitId, …)` / `servedFor(unitId)` / `resetUnit(unitId)` — add a session arg, e.g. `markServed('sess-test', unitId, …)` consistently, and a `beforeEach(() => resetUnit('sess-test', unitId))` where the file uses a shared unit id.
- `apps/board/useEscalatingPool.ts`: `servedFor(unitId)` → `servedFor(sessionId, unitId)` (effect ~line 143); `markServed(unitId, round.selectedObjectiveIds)` → `markServed(sessionId, unitId, …)` (effect ~line 171).
- `apps/board/quizEngine.ts` (`useQuizComposition`): `servedFor(unitId)` → `servedFor(sessionId, unitId)` (~line 281); `markServed(unitId, questionsKey.split(','))` → `markServed(sessionId, unitId, …)` (~line 320). `sessionId` is already in scope there.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run test/coverageStore.test.ts test/lessonDirector.test.ts && npx tsc --noEmit`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git -C "professor-0.1 (1)" add apps/board/coverageStore.ts test/coverageStore.test.ts test/lessonDirector.test.ts apps/board/useEscalatingPool.ts apps/board/quizEngine.ts
git -C "professor-0.1 (1)" commit -m "feat(board): session-scoped coverageStore + hydrateUnit"
```

---

### Task 6: `quizEngine` — dense ranks in composition (TDD)

**Files:**
- Modify: `apps/board/quizEngine.ts`
- Test: `test/lessonDirector.test.ts` (existing `buildQuizComposition` describe) + new cases

**Interfaces:**
- Produces: `buildQuizComposition(lessonObjectives, totalQuestions, weakRanks: Record<string, number>, srsByObjective, servedObjectives?, rng?)` — 3rd param changes from `weakOrder: string[]` to the rank map (same contract as `buildRound`: missing ids sink to the end; equal rank = tied). `useQuizComposition` builds it via `denseWeakRanks`.

- [ ] **Step 1: Update + extend the tests** — in `test/lessonDirector.test.ts`'s `buildQuizComposition` describe: replace `[]` weak-order args with `{}` and add:

```ts
  it('all-tied ranks do not collapse to the insertion-order prefix', () => {
    const ranks = denseWeakRanks(IDS.map((id) => ({ objective_id: id, retrievability: 0 })));
    const firsts = new Set<string>();
    for (let i = 0; i < 40; i++) {
      firsts.add(buildQuizComposition(objectives, 6, ranks, srs)[0].objectiveId);
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('strict ranks pick the weakest slots first', () => {
    const ranks = Object.fromEntries(IDS.map((id, i) => [id, i]));
    const comp = buildQuizComposition(objectives, 6, ranks, srs);
    expect(new Set(comp.map((c) => c.objectiveId))).toEqual(new Set(IDS.slice(0, 6)));
  });
```

(Adapt to the describe's existing `objectives`/`srs` fixtures.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/lessonDirector.test.ts`
Expected: FAIL on signature.

- [ ] **Step 3: Implement** — in `apps/board/quizEngine.ts`:

1. Import `denseWeakRanks` alongside the existing `lessonDirector` import.
2. `buildQuizComposition`: change param `weakOrder: string[]` → `weakRanks: Record<string, number>`; replace the `weakRank` closure body with the same fallback logic as buildRound:
```ts
  const rankValues = Object.values(weakRanks);
  const fallbackRank = rankValues.length > 0 ? Math.max(...rankValues) + 1 : 0;
  const weakRank = (oid: string) => weakRanks[oid] ?? fallbackRank;
```
The served-partition comparator (`sa !== sb` then `weakRank(a.id) - weakRank(b.id)`) and the pre-shuffle Fisher–Yates stay as-is (dense ranks make the shuffle load-bearing for ties).
3. `useQuizComposition`: change `const [weakOrder, setWeakOrder] = useState<string[]>([]);` → `const [weakRanks, setWeakRanks] = useState<Record<string, number>>({});`; `setWeakOrder(weak.map(w => w.objective_id))` → `setWeakRanks(denseWeakRanks(weak))`; early-return resets to `{}`; pass `weakRanks` to `buildQuizComposition`; memo dep `weakOrder` → `weakRanks`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/lessonDirector.test.ts && npx tsc --noEmit`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git -C "professor-0.1 (1)" add apps/board/quizEngine.ts test/lessonDirector.test.ts
git -C "professor-0.1 (1)" commit -m "fix(board): quiz composition dense-rank tie-break"
```

---

### Task 7: `useBoardPool` — dense-rank item ordering

**Files:**
- Modify: `apps/board/useBoardPool.ts`

**Interfaces:**
- Consumes: `denseWeakRanks` (Task 2). Hook input/output unchanged.

- [ ] **Step 1: Implement**

Import `denseWeakRanks` from `./lessonDirector`. In the fetch effect, keep a rank MAP instead of the positional id list:
```ts
      let weakRankMap: Record<string, number> = {};
      if (classWeak && roster && roster.length > 0) {
        const weak = await classWeakObjectives(roster, unitId);
        weakRankMap = denseWeakRanks(weak);
        if (!cancelled) setWeakOrder(Object.keys(weakRankMap));
      }
```
(the hook's `weakOrder` output keeps its existing contract — `Object.keys` of the map preserves the weak-sorted order — so no consumer changes). Then replace the post-shuffle sort block's rank closure:
```ts
      const rankValues = Object.values(weakRankMap);
      const fallbackRank = rankValues.length > 0 ? Math.max(...rankValues) + 1 : 0;
      const rank = (oid: string) => weakRankMap[oid] ?? fallbackRank;
      pool = pool.slice().sort((a, b) => rank(a.objective_id) - rank(b.objective_id));
```
(guard the sort with `if (Object.keys(weakRankMap).length > 0)`, matching the old `order.length > 0` guard; remove the old `let order: string[] = []` declaration and its assignment). Update the nearby comment: ties (equal retrievability) keep the seeded shuffle order — dense ranks, not positional.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: clean + green.

- [ ] **Step 3: Commit**

```bash
git -C "professor-0.1 (1)" add apps/board/useBoardPool.ts
git -C "professor-0.1 (1)" commit -m "fix(board): pool item ordering uses dense weak ranks"
```

---

### Task 8: Ledger writer + hook + SessionContext wiring

**Files:**
- Create: `apps/board/ledgerWriter.ts`
- Create: `apps/board/useCoverageLedger.ts`
- Modify: `store/SessionContext.tsx`
- Modify: `apps/board/useEscalatingPool.ts`, `apps/board/quizEngine.ts`
- Test: `test/ledgerWriter.test.ts`

**Interfaces:**
- Produces (ledgerWriter): `queueMerge(sessionId: string, unitId: string, objectiveIds: string[]): void` — buffers ids per `(sessionId, unitId)`, debounces 800ms, then one `supabase.rpc('merge_dealt_objectives', { p_session_id, p_unit_id, p_objective_ids })`; skips when sessionId is not a uuid (e.g. `'local'`); `configureLedgerRpc(rpc)` test seam (injects the rpc fn); `flushLedgerNow(): Promise<void>` (tests + graceful drain).
- Produces (useCoverageLedger): `useCoverageLedger(sessionId: string, unitId: string): { markServed: (ids: string[]) => void; resetUnit: () => void }` — markServed writes memory immediately (coverageStore) and queues the RPC; the hook ALSO hydrates coverageStore from `state.dealtObjectives?.[unitId]` whenever it changes.
- Consumes (SessionContext): session rows now carry `dealt_objectives`; new state field `dealtObjectives: Record<string, string[]> | null` applied in `applySessionRow` BEFORE the `if (!row.unit_id) return;` early return.

- [ ] **Step 1: Write the failing tests** — `test/ledgerWriter.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureLedgerRpc, queueMerge, flushLedgerNow } from '../apps/board/ledgerWriter';

describe('ledgerWriter', () => {
  const rpc = vi.fn().mockResolvedValue({});
  beforeEach(() => {
    rpc.mockClear();
    configureLedgerRpc(rpc as any);
    return flushLedgerNow();
  });

  it('coalesces repeated marks into one RPC call', async () => {
    queueMerge('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', ['a']);
    queueMerge('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', ['b']);
    queueMerge('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', ['a', 'c']);
    await flushLedgerNow();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('merge_dealt_objectives', {
      p_session_id: '11111111-1111-1111-1111-111111111111',
      p_unit_id: '22222222-2222-2222-2222-222222222222',
      p_objective_ids: ['a', 'b', 'c'],
    });
  });

  it('never calls the rpc for non-uuid session ids (local fallback)', async () => {
    queueMerge('local', '22222222-2222-2222-2222-222222222222', ['a']);
    await flushLedgerNow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('survives rpc failures without throwing', async () => {
    rpc.mockRejectedValueOnce(new Error('network'));
    queueMerge('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', ['x']);
    await expect(flushLedgerNow()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/ledgerWriter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `apps/board/ledgerWriter.ts`**

```ts
// ledgerWriter — drains coverage marks into the classroom_sessions
// dealt_objectives ledger (merge_dealt_objectives RPC). Non-React so it is
// unit-testable; useCoverageLedger is the React binding.
import { supabase } from '../../services/supabaseClient';
import { log } from '../../services/logger'; // use the project's existing logger import path

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEBOUNCE_MS = 800;

type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<unknown>;
let rpcFn: RpcFn = (fn, args) => supabase.rpc(fn, args) as unknown as Promise<unknown>;

/** Test seam. */
export function configureLedgerRpc(fn: RpcFn): void {
  rpcFn = fn;
}

const pending = new Map<string, { sessionId: string; unitId: string; ids: Set<string> }>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function queueMerge(sessionId: string, unitId: string, objectiveIds: string[]): void {
  if (!UUID_RE.test(sessionId) || !unitId || objectiveIds.length === 0) return;
  const key = `${sessionId}:${unitId}`;
  let entry = pending.get(key);
  if (!entry) {
    entry = { sessionId, unitId, ids: new Set<string>() };
    pending.set(key, entry);
  }
  for (const id of objectiveIds) entry.ids.add(id);
  if (timer === null) {
    timer = setTimeout(() => {
      timer = null;
      void flushLedgerNow();
    }, DEBOUNCE_MS);
  }
}

export async function flushLedgerNow(): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  const entries = Array.from(pending.values());
  pending.clear();
  for (const e of entries) {
    try {
      await rpcFn('merge_dealt_objectives', {
        p_session_id: e.sessionId,
        p_unit_id: e.unitId,
        p_objective_ids: Array.from(e.ids),
      });
    } catch (err) {
      // Fire-and-forget: the in-memory store remains the working state; the
      // next realtime echo / next round's write re-converges the ledger.
      log.warn('ledger_merge_failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}

export async function clearLedger(sessionId: string, unitId: string): Promise<void> {
  if (!UUID_RE.test(sessionId) || !unitId) return;
  try {
    await rpcFn('clear_dealt_objectives', { p_session_id: sessionId, p_unit_id: unitId });
  } catch (err) {
    log.warn('ledger_clear_failed', { error: err instanceof Error ? err.message : String(err) });
  }
}
```

(If the project's logger import path differs — check how `boardLearner.ts` imports `log` and match it exactly.)

- [ ] **Step 4: Implement `apps/board/useCoverageLedger.ts`**

```ts
// useCoverageLedger — React binding over coverageStore + ledgerWriter.
// Hydrates the store from the session row's dealt_objectives (realtime),
// and writes marks through to the DB ledger (debounced).
import { useCallback, useEffect } from 'react';
import { useSession } from '../../store/SessionContext';
import { hydrateUnit, markServed, resetUnit } from './coverageStore';
import { clearLedger, queueMerge } from './ledgerWriter';

export function useCoverageLedger(sessionId: string, unitId: string): {
  markServed: (objectiveIds: string[]) => void;
  resetUnit: () => void;
} {
  const { state } = useSession();
  const ledger = state.dealtObjectives?.[unitId];

  // Hydration + drift self-heal (union-merge; idempotent).
  useEffect(() => {
    if (!sessionId || !unitId || !Array.isArray(ledger) || ledger.length === 0) return;
    hydrateUnit(sessionId, unitId, ledger);
  }, [sessionId, unitId, ledger]);

  const markServedLedger = useCallback((objectiveIds: string[]) => {
    if (!sessionId || !unitId) return;
    markServed(sessionId, unitId, objectiveIds);
    queueMerge(sessionId, unitId, objectiveIds);
  }, [sessionId, unitId]);

  const resetUnitLedger = useCallback(() => {
    if (!sessionId || !unitId) return;
    resetUnit(sessionId, unitId);
    void clearLedger(sessionId, unitId);
  }, [sessionId, unitId]);

  return { markServed: markServedLedger, resetUnit: resetUnitLedger };
}
```

- [ ] **Step 5: Wire SessionContext**

In `store/SessionContext.tsx`:
1. State interface (~line 105, next to `sessionId?: string | null;`): add `dealtObjectives?: Record<string, string[]> | null;`
2. Initial state (~line 275, next to `sessionId: null,`): add `dealtObjectives: null,`
3. Near the other refs (by `liveSeqRef`): add `const dealtSigRef = useRef<string | null>(null);`
4. In `applySessionRow`, immediately BEFORE `if (!row.unit_id) return;` (~line 625), insert:
```ts
    // Coverage ledger (live board word rotation, 2026-08-30): mirror the
    // session row's dealt_objectives into state for useCoverageLedger.
    // Sig-guarded: postgres_changes re-delivers the row on every update
    // (slide moves etc.) and setState identity would churn renders.
    const dealt = (row as any).dealt_objectives;
    if (dealt && typeof dealt === 'object' && !Array.isArray(dealt)) {
      const sig = JSON.stringify(dealt);
      if (dealtSigRef.current !== sig) {
        dealtSigRef.current = sig;
        setState(prev => ({ ...prev, dealtObjectives: dealt }));
      }
    }
```

- [ ] **Step 6: Wire the two consumers**

- `useEscalatingPool.ts`: add `const coverage = useCoverageLedger(sessionId, unitId);` after the sessionId line; the capture effect keeps reading `servedFor(sessionId, unitId)` (memory-first); the mark effect calls `coverage.markServed(round.selectedObjectiveIds)` instead of bare `markServed(...)`. Remove the now-unused direct `markServed` import (keep `servedFor`).
- `quizEngine.ts` (`useQuizComposition`): same pattern — `const coverage = useCoverageLedger(sessionId, unitId);`, mark effect uses `coverage.markServed(questionsKey.split(','))`; keep `servedFor(sessionId, unitId)` for the capture-at-mount. (The hook is called unconditionally at the top — Rules of Hooks.)

- [ ] **Step 7: Run all tests + typecheck**

Run: `npx vitest run test/ledgerWriter.test.ts && npm test && npx tsc --noEmit`
Expected: all green, typecheck clean.

- [ ] **Step 8: Commit**

```bash
git -C "professor-0.1 (1)" add apps/board/ledgerWriter.ts apps/board/useCoverageLedger.ts store/SessionContext.tsx apps/board/useEscalatingPool.ts apps/board/quizEngine.ts test/ledgerWriter.test.ts
git -C "professor-0.1 (1)" commit -m "feat(board): dealt_objectives ledger — refresh-proof cross-tab word rotation"
```

---

### Task 9: Full verification + docs + merge

**Files:**
- Modify: `AGENTS.md` (known-issues row)

- [ ] **Step 1: Full suite + build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: green + clean build.

- [ ] **Step 2: Live smoke test (local dev against cloud)**

Run: `npm run dev`, open the teacher portal, start a live session on unit `c6acde58-be39-4524-bbf3-d71d8ae9b3a6` ("Enriching…", 11 words), and check:
1. FlashMatch/WordDetective/SpeedQuiz-style games show word sets that are NOT the insertion prefix (expect variety across games/rounds).
2. After a full page refresh, the rotation CONTINUES (next unserved words), not a restart from word 1.
3. `select dealt_objectives from classroom_sessions where id='e6802155-f71a-4538-acf8-fd44e8285277';` accumulates objective ids.

- [ ] **Step 3: Update AGENTS.md** — add a resolved row to §9 known issues:

```markdown
| ~~Live board games cycled only the first ~4 unit words (tractor/leaf/leaves/mountain; found 2026-08-30)~~ | **RESOLVED 2026-08-30 (branch `fix/live-board-word-rotation`)** — `classWeakObjectives`' full positional weak list made `buildRound`'s tie-break shuffle a no-op (the weak-rank sort restored DB insertion order), and the coverageStore rotation wiped on refresh. Fix: `denseWeakRanks` (equal retrievability ⇒ equal rank) at `buildRound`/`buildQuizComposition`/`useBoardPool`, plus a `dealt_objectives` JSONB ledger on `classroom_sessions` (merge/clear RPCs, `20260830120000`) hydrated via `classroom_session_sync` realtime. SRS/rung escalation untouched. |
```

- [ ] **Step 4: Commit + merge to master + verify deploy**

```bash
git -C "professor-0.1 (1)" add AGENTS.md
git -C "professor-0.1 (1)" commit -m "docs: record live-board word rotation resolution"
git -C "professor-0.1 (1)" checkout master
git -C "professor-0.1 (1)" merge --no-ff fix/live-board-word-rotation
git -C "professor-0.1 (1)" push origin master
```

Verify (AGENTS.md §7): `curl -sI https://professor-ruby.vercel.app/teacher` → `last-modified` matches the deploy time. PWA: teachers must click Reload on the update banner (§8.1).

---

### Task 10 (OPTIONAL — only if grep confirms zero readers): drop frozen `targetWord` from SPEAKING

**Files:**
- Modify: `supabase/functions/orchestrate-lesson/index.ts` (~line 161–167)

**Gate:** run `grep -rn "targetWord" --include="*.ts" --include="*.tsx" apps components services store | grep -v node_modules` — if ANY consumer reads `data.targetWord` for SPEAKING steps, SKIP this task entirely.

- [ ] **Step 1: Edit the SPEAKING step builder** to `data: { poolDriven: true }` only (drop `targetSentence`/`targetWord`).
- [ ] **Step 2: Deploy the function** (edge functions do NOT auto-deploy):

```bash
cd "professor-0.1 (1)" && npx supabase functions deploy orchestrate-lesson --project-ref xsdnzijketjnzhakqtit --no-verify-jwt
```

- [ ] **Step 3: Verify 401 probe** (AGENTS.md §8): `curl -s -X POST "https://xsdnzijketjnzhakqtit.supabase.co/functions/v1/orchestrate-lesson" -H "apikey: <anon key>"` → expect 401, not 404.
- [ ] **Step 4: Commit** `fix(orchestrate): drop dead frozen targetWord from SPEAKING steps`.
