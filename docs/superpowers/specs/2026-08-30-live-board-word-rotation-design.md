# Live Board Whole-Pool Word Rotation — Design Spec

**Date:** 2026-08-30
**Status:** Approved direction (A+B), pending implementation plan
**Owner decision (this session):** the live board's priority is to surface the
unit's ENTIRE vocabulary (30 words → all 30 used across the lesson). Strict
"no word repeats before all are used" is NOT required (best-effort rotation).
The SRS/reinforcement layer stays as-is — it must never block a word from
appearing.

---

## 1. Problem

Teachers report that live-board games cycle through only the first ~4 words of
a unit (e.g. tractor, leaf, leaves, mountain out of 11). Verified against
production (unit `c6acde58…`, session `e6802155…`):

- **Data is healthy**: all 11 words have real images, an `objectives` row, and
  all 10 exercise types in `pool_items`. Nothing is missing upstream.
- **Root cause (proven by simulation with real IDs/seeds):** the seeded
  tie-break shuffle in the selection engines is a no-op.
  `classWeakObjectives` returns ALL objectives sorted by retrievability; on a
  fresh class every word ties at R = 0, so the stable sort preserves DB
  insertion order → `weakRank` (index into that list) is a **total order** →
  the subsequent `sort((a,b) => weakRank(a) - weakRank(b))` fully restores
  insertion order and annihilates the shuffle. Every game therefore deals the
  first `roundSize` words in textbook order.
  Affected sites: `apps/board/lessonDirector.ts` (`buildRound`),
  `apps/board/quizEngine.ts` (`buildQuizComposition`),
  `apps/board/useBoardPool.ts` (item ordering).
- **Aggravator:** the rotation that should walk the rest of the pool
  (`apps/board/coverageStore.ts` sequential deal) lives in module memory and
  wipes on every page refresh, so each testing pass re-encounters the prefix.
- Cosmetic: `orchestrate-lesson` still ships a frozen `targetWord: vocab[0]`
  on SPEAKING steps (unused by `BoardISayYouSay`, but misleading).

## 2. Goals

1. Whatever the unit's vocab size, the games collectively deal every word over
   the lesson (best-effort unserved-first rotation; wrap when exhausted).
2. Per-session variety: a fresh class deals a different randomized set each
   session; genuinely weak words (lower retrievability) still rank first.
3. Rotation survives page refreshes and is shared across the classroom's tabs
   (commander / board projector / remote) via the session row.
4. Cross-tab determinism preserved (all tabs compute identical rounds from the
   same seed + served set).
5. No SRS/escalation rework; no changes to game templates' contracts.

## 3. Non-goals (parked)

- Strict no-repeat coverage guarantee (owner: not required).
- Per-step round-counter hydration for mid-lesson single-surface refresh
  (roundIndex stays component state; the ledger removes the prefix-pinning,
  and the same JSONB column is the natural home for a future `round_state`).
- Coverage-progress UI ("words shown 7/11") — the ledger makes it trivial later.
- Any rework of mastery rungs / FSRS.

## 4. Design

### 4.1 Dense-rank tie-break (core fix, pure code)

New exported helper in `apps/board/lessonDirector.ts`:

```ts
/** Dense-rank objectives by retrievability: equal R ⇒ equal rank. */
export function denseWeakRanks(
  weak: { objective_id: string; retrievability: number }[]
): Record<string, number>
```

- `BuildRoundInput.weakOrder: string[]` is replaced by
  `weakRanks: Record<string, number>` (internal contract; callers updated).
- `buildRound` sorts with dense ranks: ties keep the seeded-shuffle order
  (JS `sort` is stable). Weak-first is preserved for genuinely unequal R.
- `buildQuizComposition` (quizEngine) and `useBoardPool`'s item ordering use
  the same helper. `classWeakObjectives` callers stop discarding
  `retrievability` and build the rank map instead of the plain id list.
- Seed scope: `useEscalatingPool` adds `shellType` to `makeRng(...)` parts so
  different games deal differently even at the same round index.
  Deterministic per (session, unit, shell, round) → tabs still agree.

Behavior: fresh class (all R = 0) → pure seeded shuffle per session → varied
selection; mixed mastery → strictly weak-first.

### 4.2 Coverage ledger on the session row (DB persistence + cross-tab share)

**Migration** `supabase/migrations/20260830120000_live_board_coverage_ledger.sql`:

```sql
alter table public.classroom_sessions
  add column if not exists dealt_objectives jsonb not null default '{}'::jsonb;
```

Shape: `{ [unitId]: [objectiveId, ...] }` — element order immaterial
(consumed as a set by `buildRound`), one key per unit so switching units
starts fresh.

**RPC** (same migration), invoker security, ownership-checked:

```sql
create or replace function public.merge_dealt_objectives(
  p_session_id uuid, p_unit_id uuid, p_objective_ids uuid[]) returns void
-- atomic UPDATE: union-merge p_objective_ids into
-- dealt_objectives[p_unit_id] (distinct, order-preserving), touches updated_at
-- where id = p_session_id and teacher_id = auth.uid()
```

plus `clear_dealt_objectives(p_session_id, p_unit_id)` for resets. The
`updated_at` touch rides the EXISTING `classroom_session_sync` postgres_changes
realtime channel — no new channel needed. RLS: existing
`classroom_sessions_*_policy` (teacher_id = auth.uid()) already gates
select/update for all classroom tabs (all authenticated as the teacher).

**Why merge-from-any-tab is safe:** all tabs compute the identical selection
deterministically, so concurrent writers write the same ids; the RPC is an
idempotent union. No single-writer coordination needed.

### 4.3 Frontend plumbing

- `apps/board/coverageStore.ts`: store key becomes `${sessionId}:${unitId}`
  (sessionId param added to `servedFor` / `markServed` / `resetUnit`). Add
  `hydrate(sessionId, unitId, ids)` to merge a DB snapshot into memory
  (union — idempotent, late joins self-heal).
- New thin hook `apps/board/useCoverageLedger.ts`: wraps coverageStore +
  - applies the session row's `dealt_objectives` (from SessionContext state)
    into the store whenever it changes (hydration + drift self-heal), and
  - debounces `markServed` through to `merge_dealt_objectives` (fire-and-forget
    RPC; failures log-and-continue — the in-memory store is the working state).
- `store/SessionContext.tsx`: `applySessionRow` also copies
  `row.dealt_objectives` into state (additive field, no behavior change).
- `useEscalatingPool` + `quizEngine` (`useQuizComposition`): swap direct
  coverageStore calls for the ledger hook. The capture-once-per-round /
  mark-after-compute pattern is preserved verbatim (it prevents feedback
  churn).
- `resetUnit` call sites additionally call `clear_dealt_objectives`.

### 4.4 Optional cleanup (flag)

If a grep confirms nothing reads `data.targetWord` for SPEAKING steps, drop it
from `orchestrate-lesson`'s step builder and redeploy that function. Cosmetic;
skip if anything depends on it.

## 5. Testing

- `test/lessonDirector.test.ts` (extend):
  1. Fresh-class tie-break: with two different seeded sessions, round-1
     selections differ and are not the insertion-order prefix (fixed seeds →
     deterministic expectations).
  2. Rotation: 11 objectives, roundSize 6 → rounds 1–2 cover all 11 via the
     served set; wrap deals repeats only after exhaustion.
  3. Weak-first: an objective with lower R outranks higher-R objectives
     regardless of the shuffle.
  4. `denseWeakRanks` unit test: equal R ⇒ equal rank; order dense.
- `test/` new `quizEngineComposition.test.ts`: same properties for
  `buildQuizComposition` (proportional slots + unserved-first).
- Existing suites stay green: `boardLearner`, `poolService`,
  `BoardFlashMatch.test.tsx`, `BoardComponents.test.tsx`,
  `spellingBeeKeyboardEngine`, `LessonTransformer`.
- Migration sanity: apply via Management API; `select dealt_objectives from
  classroom_sessions` still `{}` for existing rows; RPC merge/clear behave
  (can piggyback on the `test:fixtures` harness).

## 6. Rollout order

1. Apply migration (Management API `database/query`) — additive, old builds
   unaffected.
2. Branch → code + tests → CI green → merge to master (Vercel auto-deploys
   frontend only; no edge functions changed unless §4.4 is done).
3. Manual verification on unit `c6acde58…`: play 3–4 different games + a page
   refresh mid-lesson; confirm varied words, rotation continues after
   refresh, `dealt_objectives` accumulates, and commander/board agree.
4. PWA note: teachers must accept the update banner (AGENTS.md §8.1) —
   already-open tabs keep the old bundle until Reload.

## 7. Risks & mitigations

- **RPC write amplification** (each tab writes per round): idempotent union,
  one small UPDATE per round advance — negligible at classroom scale.
- **Realtime latency vs NEXT_ROUND broadcast race:** a tab advancing a round
  before the ledger echo arrives uses its LOCAL store (memory-first design);
  the DB copy only matters for refresh/late-join hydration. Worst case is a
  one-round-stale hydration, self-healing on the next echo.
- **`BuildRoundInput` shape change** touches two call sites + tests —
  contained; no template changes.

## 8. File map (expected diff)

| File | Change |
|---|---|
| `apps/board/lessonDirector.ts` | `denseWeakRanks`, `weakOrder`→`weakRanks`, comments |
| `apps/board/quizEngine.ts` | rank map + ledger hook usage |
| `apps/board/useBoardPool.ts` | dense-rank item sort |
| `apps/board/useEscalatingPool.ts` | rank map, ledger hook, `shellType` seed part |
| `apps/board/coverageStore.ts` | session-scoped keys, `hydrate` |
| `apps/board/useCoverageLedger.ts` | new — store + RPC + realtime apply |
| `store/SessionContext.tsx` | expose `dealtObjectives` from session rows |
| `supabase/migrations/20260830120000_live_board_coverage_ledger.sql` | new |
| `test/lessonDirector.test.ts`, `test/quizEngineComposition.test.ts` | tests |
| `supabase/functions/orchestrate-lesson/index.ts` | optional §4.4 cleanup |
