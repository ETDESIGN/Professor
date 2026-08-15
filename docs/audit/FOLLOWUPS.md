# Follow-ups — Post Phase-1 + Games Integration

> Created 2026-08-06. Tracked minor items from the Phase 1 + 5-games integration that are functional but not ideal. None are blocking. Grouped by priority.

## P2 — Should fix before too much more builds on top

### F1. `ContextualControlsSpec` has no runtime registry
**Where:** `apps/board/lessonDirector.ts` defines the `ContextualControlsSpec` interface; each game exports its own `*_CONTROLS` constant + a `*_ACTION_TYPES` map; the board's `lastAction` listener handles them ad-hoc.
**Problem:** The interface is declarative-only — nothing consumes the specs centrally. Adding a new game means manually wiring its action types into the board's listener, the commander's `ContextualControls.tsx`, and the Baton's `TeacherRemote.tsx` separately. Drift-prone (the same class of bug the spec was meant to prevent).
**Fix:** A `ContextualControlsRegistry` that games register their spec into at module load; `ContextualControls.tsx` + `TeacherRemote.tsx` iterate the registry instead of switching on `step.type`. Centralizes the contract.
**Trigger:** When the 3rd game without a registry lands (we're at 5 already, so this is overdue). Worth doing as part of Phase 8 (teacher-flow polish, architecture §6.3).

### F2. LCS helpers live in `BoardUnscramble.tsx` (cross-game import)
**Where:** `computeLCSPartialCredit`, `detectSwappedPair`, `highlightFirstWrongPosition`, `UNSCRAMBLE_PASS_THRESHOLD` are exported from `apps/board/templates/BoardUnscramble.tsx`; `BoardStorySequencing.tsx` imports them.
**Problem:** Shared scoring/diff utilities living inside a game component file is the wrong layer. Cross-game imports from a template are fragile (renaming or refactoring Unscramble can break StorySequencing silently).
**Fix:** Move to a shared `apps/board/textDiff.ts` (or fold partial-credit helpers into `scoringDefaults.ts` — they're scoring-adjacent). Update both games' imports.
**Trigger:** Next time anyone touches Unscramble's scoring, or when grammar (Prompt 5) needs the same LCS for TRANSFORM rung-3 partial credit.

## P3 — Nice to have

### F3. `recordAttempt` write volume
**Where:** `services/attemptsLog.ts` writes one `point_transactions` row per attempt (non-debounced by design — that's the whole point, so analytics is honest).
**Problem:** A fast game (FlashMatch with 6 pairs, lots of wrong taps) can write 10+ rows per turn. Over a lesson that's hundreds of rows. Not a correctness issue, but worth monitoring volume once games are live. The `idx_pt_correctness` partial index keeps reads fast.
**Fix (if needed):** A lightweight client-side batch (collect 1s of attempts, insert in one round-trip). Do NOT debounce across attempts in a way that loses the per-attempt signal (that was the original bug). Only batch the *network* call.
**Trigger:** Only if DB write volume becomes observable. Don't preemptively optimize.

### F4. Pre-existing test failures (not ours, but they degrade the signal)
**Where:** `test/BoardComponents.test.tsx` (FocusCards/SpeedQuiz/StoryStage rendering) and `test/DataService.test.ts` (SRS words) — 19 failures total, predates all Phase-1 work.
**Problem:** The baseline is "19 failing" so any new regression has to be diffed against that manually. Masks future breakage.
**Fix:** Either fix the tests (some may have broken when the games were rewritten — worth checking if SpeedQuiz/StoryStage tests still match the new behavior) or mark them `.skip()` with a comment so the baseline is clean.
**Trigger:** Before the next batch of games lands — a clean baseline makes the Qoder handoff verification much faster.

### F5. `awardClassPoints` doesn't yet write `metadata`
**Where:** `services/DataService.ts:awardClassPoints` — the debounced points flush still inserts `{roster_id, class_id, amount, source, profile_id}` with no `metadata`.
**Problem:** Not a bug — the per-attempt correctness signal lives on the separate `recordAttempt` path by design (decision 1 resolution). But it means a `point_transactions` row from the points flush has `metadata = null` while an attempt row has `metadata = {correctness, ...}`. Analytics queries must filter `source = 'attempt'` (or `metadata ? 'correctness'`) to avoid mixing.
**Fix:** None needed functionally. Optionally, tag the points-flush rows with `metadata = {source: 'points_flush'}` for easier filtering, but the `source` column already distinguishes them.
**Trigger:** If analytics queries get confusing.

## P4 — Observability (after deploy)

### F6. Verify escalation actually varies content
**Where:** `useEscalatingPool` + `lessonDirector.buildRound`.
**Problem:** The whole architecture's value depends on a game actually pulling *different* exercise types across rounds, not the same one forever. In dev this is hard to verify without a populated pool + roster with varied SRS states.
**Fix:** After deploy, once a real unit has a populated `pool_items` table (the production bug is fixed but content may not yet be regenerated), spot-check a live class: open the console, watch `buildRound`'s dev warnings, confirm rounds pull IMAGE_SELECT → MEANING_MATCH etc. The dev-time `warnIfOutsideEnvelope` + the "buildRound produced 0 items" warning are the canaries.
**Trigger:** First real live class after deploy, or when you regenerate the pool for a unit.

### F7. The 5 Aug-3 migration author's pattern bug
**Where:** The migration `20260803000004_tighten_assets_srs_parent_rls.sql` had two `CREATE POLICY` collisions I fixed (DROP targeted legacy names, CREATE collided with already-present new-name policies).
**Problem:** Systematic issue in whoever authored the Aug-3 batch — their DROPs targeted old policy names that had already been renamed, so CREATEs hit `SQLSTATE 42710`. I fixed 2 instances; there could be more in their other migrations if any exist.
**Fix:** None needed now (I fixed both). Worth noting to the Aug-3 author so they don't repeat the pattern.
**Trigger:** N/A (fixed).

---

*End of follow-ups. None block deploy.*
