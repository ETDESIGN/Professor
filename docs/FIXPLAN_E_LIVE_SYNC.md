# FIXPLAN E — Live Sync Hardening + Authoritative Turn State (Phases 1–2)

**Origin:** [`docs/brainstorming/09_LIVE_SYNC_ARCHITECTURE_AUDIT.md`](./brainstorming/09_LIVE_SYNC_ARCHITECTURE_AUDIT.md) (2026-08-19).
**Status:** Phase 1 **and** Phase 2 **implemented 2026-08-19** (typecheck clean, build green; 423 tests pass — the 12 failing tests in `DataService.test.ts`/`BoardComponents.test.tsx` fail identically on the unmodified tree, pre-existing). **Pending:** cloud migration `20260819000002_live_turn_state.sql` (MCP), frontend deploy (Vercel), and the classroom gates. **Deploy order is mandatory: migration FIRST, frontend second** — the Phase 2 CAS write filters on the `seq` column, which errors against a pre-migration table.
**Symptoms being fixed:** (1) different content on commander preview vs projector board; (2) board stuck / behind a step.

### Phase 2 implementation notes (2026-08-19)
- **New authoritative turn state:** `classroom_sessions.live_state` JSONB + `seq` (migration `20260819000002`). Writers use compare-and-swap (pin expected seq, write seq+1, one re-read/re-merge retry); a live-turn write against a missing row upserts it (the teacher can spin before any class/unit is bound).
- **`store/liveTurnState.ts`** — pure shape/merge/parse helpers (unit-tested). Turn tokens derive from the row seq (`studentId::seq`), globally unique per session — replaces the per-tab `turnSeqRef` counter.
- **Reveal is derived everywhere (E2.4):** every tab applies the reveal (turn starts, wheel dismisses, confetti) when `Date.now()` passes `live_state.revealAt`. The picking-tab-only 2.5 s `setTimeout` chain is REMOVED — a dead picker can no longer strand the wheel. The picking tab still emits the legacy `GAME_WIN`/`NEW_TURN`/`DISMISS_WHEEL` compat broadcasts (game guards key on those) and persists the dismissal (`overlay: 'NONE'`) so a refresh can't resurrect a dismissed wheel.
- **One slide-transition computation (E2.5):** module-level `computeSlideState` used by BOTH `goToSlide` and `applySessionRow` — the 028d3ce "paths drifted" bug class is structurally retired. Slide changes also clear the turn in the authoritative row.
- **Refresh recovery (the flagship):** a board refreshing mid-turn rehydrates the picked student, active turn, and reveal deadline from the row, then derives the reveal if it is already past. Verified in `test/LiveSyncTwoTab.test.tsx` — two SessionProviders over a shared fake Supabase (broadcast honours `self:false`; row writes fire `postgres_changes`), covering: pick convergence, row persistence, derived reveal on both tabs, third-tab refresh-restore, cancel-turn, and mid-spin slide change.
- **E2.6 decision — `broadcast: { self: false }` KEPT (evaluated, declined):** every existing sender already does the optimistic setState, and the new per-sender `actionId` ordering guard in the receive handler now drops duplicate/replayed broadcasts exactly, which was the safety the flip would have bought. Flipping would re-test every sender for double-apply behavior for no new capability. Revisit only if a future sender class genuinely can't do optimistic updates.


### Phase 1 implementation notes (2026-08-19)
- The `classroom_sessions` row id is **stable per teacher** (upsert updates in place), so it cannot provide per-session deal variety on its own. Phase 1 seeds on `sessionId|unitId|step` (+ turn/round parts per site); a true per-session nonce joins the seed in Phase 2 (`live_state`). The commander now also captures the row id at go-live (previously only the realtime/hydration path set it).
- SpellingBee needed no direct changes: its keyboard was already seeded (`seedKey`) and its word order flows from the now-seeded `useBoardPool`. WordSearch was already the seeded exemplar.
- Engine hooks are shared with the student solo app, so they take an optional `seedKey` param (board passes it, solo omits → `Math.random` variety preserved) — `useFastVocabTurn`, `FastVocabMatchWave`.
- `test/BoardFlashMatch.test.tsx`'s SessionContext mock gained `useSeedBase` (module API grew).


---

## Owner decisions (2026-08-19)

| Question | Decision |
|---|---|
| Scope | Phase 1 + Phase 2 planned in detail; Phase 3 is backlog. |
| Commander preview (audit §7.1) | **Twin instances + seeded determinism now** (Option A). Per-game conversion to a board-driven mirror (Option B) only if a specific game still visibly drifts after Phase 2 — first candidate: SpeedQuiz's self-advancing clock. |
| Slide-control authority (audit §7.4) | **Both commander and remote keep writing** `current_index`; staleness guards (E1.9) prevent delayed/stale writes from moving the board backwards. No single-writer lock. |
| Rollout | No deadline. Full local + preview verification and a classroom gate between phases (≥ 1 real class per phase). |

---

## Randomness inventory (verified 2026-08-19)

Every `Math.random()` call site in the live-sync surface, classified. **Rule of thumb:** if the value changes *which content/state a tab shows*, it must be seeded; if it only changes *cosmetics* (animation, stickers, confetti) or runs on a single tab whose *result* is broadcast, it is exempt.

### Seed (cross-tab content selection)

| Site | What it randomizes | Seed scope |
|---|---|---|
| `apps/board/useBoardPool.ts:77` | The objective pool order (feeds FastVocab, SpellingBee, …) | session + unit |
| `apps/board/lessonDirector.ts:308` | Objective dealing order before weak-rank sort | session + unit |
| `apps/board/quizEngine.ts:105,287,298` | Quiz composition, item pick, option shuffle (SpeedQuiz, TeamBattle) | session + unit + step + resetCount |
| `apps/board/templates/scoringUtils.ts:88` | Shared `shuffle()` helper used by templates | per caller |
| `apps/board/templates/BoardFlashMatch.tsx:170` | Pair-card shuffle | + turnToken |
| `apps/board/templates/BoardUnscramble.tsx:93` | Tile shuffle | + turnToken / resetCount |
| `apps/board/templates/BoardWhatsMissing.tsx:72` | Deck shuffle (see also the repeat-guard note at `:239`) | + roundIndex |
| `apps/board/templates/BoardStorySequencing.tsx:161` | Card shuffle | + turnToken |
| `apps/board/templates/BoardGrammarForge.tsx:137` | Tile shuffle | + turnToken |
| `apps/board/templates/BoardStoryQuest.tsx:225` | Comprehension-option shuffle | + turnToken |
| `apps/board/templates/BoardTeamBattle.tsx:209` | Item pick from pool (plus quizEngine above) | + resetCount |
| `apps/board/templates/BoardWordDetective.tsx:185` | Hint wrong-answer elimination | + turnToken |
| `apps/board/templates/wordSearch/content.ts:169` | Content build (already takes `rng` param) | session + unit + step |
| `components/games/fastVocab/contentBuilder.ts:15,109,141` | Engine shuffles (already take `rng` param) | caller-passed |
| `components/games/fastVocab/FastVocabMatchWave.tsx:64` | Wave shuffle inside engine | caller-passed |
| `components/games/spellingBee/contentBuilder.ts:144` | Engine shuffle (already takes `rng` param) | caller-passed |

### Exempt (with reason)

| Site | Reason |
|---|---|
| `store/SessionContext.tsx:1055,1062,1068` | Student-pick randomness runs on ONE tab (the picker); the **result** travels in the `SPIN_WHEEL` payload — single writer, no divergence possible. |
| `apps/board/templates/BoardOverlayLayer.tsx:30,78` | Random praise sticker + wheel landing offset — cosmetic; the wheel winner is authoritative via broadcast payload. |
| `apps/board/templates/BoardGameArena.tsx:83,93`, `BoardWordSearch.tsx:572` (hint pick) | Wheel spin rotation / hint highlight — cosmetic or board-local display. |
| `components/effects/ConfettiSystem.tsx` | Pure visual confetti physics. |
| `apps/student/*` (FlashMatch, LessonComplete, DubbingStudio), `apps/teacher/PlanComposer.tsx:127`, `services/LessonTransformer.ts`, `apps/teacher/StudentPathComposer.tsx`, `apps/remote/VoiceCommandModal.tsx:39`, `apps/teacher/live/sidebar/SidebarPanel.tsx:148`, `services/DataService.ts:313` (class-code gen), `services/perfMonitor.ts:15` | Solo app / content generation / teacher-only UI / IDs — no cross-tab live surface. |

---

## Phase 1 — Hardening (low risk, no schema change, frontend-only deploy)

### E1.1 Seeded-random utility
Create `services/seededRandom.ts` exporting: `mulberry32`, `hashString` (promoted from `apps/board/templates/wordSearch/gridEngine.ts:43-56` — that file re-exports to keep WordSearch untouched), `seededShuffle<T>(arr, seed)`, `makeRng(...parts)` (hash of joined parts → rng), and `seedBase({sessionId, unitId, stepId?})`.
**Acceptance:** unit tests — same parts → identical shuffle/order; different parts → different; permutation validity (all elements present exactly once).

### E1.2 SessionContext exposes the seed base
`store/SessionContext.tsx` already sets `sessionId` via `applySessionRow` — expose a derived `seedBase` string (`${sessionId}|${unitId}|${stepId}`) on state (or a `useSeedBase()` hook) so every template composes seeds without prop-drilling. Fallback while no session row exists: `${teacherId}|${unitId}|startedAt`.
**Acceptance:** any mounted board template can build a seed in one line.

### E1.3 Seed the pool and the director
`useBoardPool.ts:77` and `lessonDirector.ts:308` → `seededShuffle(pool, makeRng(sessionId, unitId))`. Session variety is preserved *by design*: the seed includes `sessionId`, so every new class deals differently (the NEWGEN_AUDIT §3.7 requirement), while tabs within one session agree.
**Acceptance:** two tabs in one session produce identical pool/deal order; a new session produces a different order.

### E1.4 Seed quiz composition
`apps/board/quizEngine.ts:105,287,298` — thread an optional `rng` parameter through `composeQuiz`-style exports (mirror the existing fastVocab/spellingBee pattern); SpeedQuiz and TeamBattle callers pass `makeRng(seedBase, resetCount)`.
**Acceptance:** both tabs compose the identical question set for the same slide entry; RESET_GAME reshuffles (resetCount changed).

### E1.5 Seed template-internal shuffles
Convert each "Seed" row in the inventory above that lives inside a template: replace `sort(() => Math.random() - 0.5)` / inline Fisher-Yates with `seededShuffle(items, makeRng(seedBase, scope))`, scope per the table (turn-scoped adds `turnToken` from `state.currentTurnId`, round-scoped adds round index / reset count). `scoringUtils.ts` `shuffle()` gains a seeded overload; existing calls migrate.
**Acceptance per game:** identical layout on both tabs for the same turn; reshuffle still happens on new pick / reset (variety within the class preserved via turnToken).

### E1.6 Seed the engine content builders
Board wrappers pass `makeRng(...)` into the already-parameterized `rng` arguments: `fastVocab/contentBuilder.ts`, `FastVocabMatchWave.tsx`, `spellingBee/contentBuilder.ts`, `wordSearch/content.ts`. Student-solo callers keep `Math.random` (no cross-tab surface).
**Acceptance:** FastVocab/SpellingBee serve identical item order on both tabs.

### E1.7 Persist with retry + visible failure
`store/SessionContext.tsx:501-527`: `persistSessionIndex` / `persistSessionStatus` retry 3× with backoff (≈0.5 s / 1.5 s / 4 s); on final failure set `state.syncError = 'slide-persist-failed'`. LiveCommander shows a non-blocking banner ("Board may be behind — Resync") whose button re-runs the persist with the current index; success clears it.
**Acceptance:** with the network cut, advancing a slide shows the banner; reconnect + Resync converges the board; banner clears.

### E1.8 Channel health + reconnect + rehydrate
- Status callbacks on **all three** channels (`SessionContext.tsx` A `:260-362`, B `:481-490`, C `:615-631`). `isConnected` = A **and** B (B carries slide position — it must gate "NO SIGNAL"). C failure shows a subtle roster-lag indicator only.
- On `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` → remove + recreate + resubscribe that channel; debounce ≥ 3 s between attempts.
- `window.online` and `visibilitychange→visible` → re-run the hydration select (`:471-476`) + `loadStudents()`.
**Acceptance:** cut the board tab's network 30 s mid-class, restore → board re-converges to the current slide *without* a manual refresh.

### E1.9 Staleness guards
- Broadcast envelope gains `senderId` (teacherId + surface). Reducer keeps `lastTsPerSenderType`; drops an action whose `(senderId, type, timestamp)` is older than the last applied from the same sender (same-sender ordering only — avoids cross-device clock-skew false drops).
- `applySessionRow`: track last applied `updated_at`; ignore rows **strictly older**; equal timestamps apply (same-ms races remain last-write-wins, acceptable).
**Acceptance:** an injected delayed/duplicate `classroom_sessions` event does not move the board backwards.

### E1.10 Action envelope hardening
Add a monotonic `actionId` to every broadcast; keep `state.lastAction` as the newest (zero game changes), additionally store `state.recentActions` ring (cap 20) for future consumers and for debugging desync reports ("what did this tab actually receive").
**Acceptance:** ring populated; existing games compile and behave unchanged.

### E1.11 Phase 1 verification + deploy
- Unit tests for E1.1 utilities; per-game seed determinism smoke (render twice with same seed).
- Two-tab scripted check (local dev, two browser contexts — commander `/teacher/live` + board `/board`): launch unit → spin → same content both tabs (screenshot compare) → advance slides → network-kill board 30 s → auto-recovery.
- Deploy: **frontend only** (`vercel --prod` or push to master — no edge functions, no migration). Projector needs one banner-reload after deploy (AGENTS.md §8.1).
- **Classroom gate:** ≥ 1 real class with both symptoms checked off. Do not start Phase 2 until green.

---

## Phase 2 — Authoritative turn state (one migration, additive)

### E2.1 Migration (next free `YYYYMMDDNNNNNN_` prefix at execution time)
`ALTER TABLE public.classroom_sessions ADD COLUMN IF NOT EXISTS live_state JSONB NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN IF NOT EXISTS seq BIGINT NOT NULL DEFAULT 0;` Idempotent; RLS policies already cover UPDATE; table already in `supabase_realtime` so the new columns stream via the existing channel B. Deploy via Supabase MCP (`supabase_apply_migration`) per AGENTS.md §7.
**Acceptance:** `SELECT live_state, seq FROM classroom_sessions LIMIT 1` succeeds; §8 probes green.

### E2.2 LiveState type + `updateLiveState(patch)` write path
Minimal shape (start small, extend later): `{ responderId, turnToken, turnStartedAt, revealAt, overlay, quietMode, selectionMode, teams }`. **Game micro-state stays out** (deterministic from seeds after Phase 1).
Write path: read local seq → `UPDATE classroom_sessions SET live_state = merged, seq = seq + 1, updated_at = now() WHERE teacher_id = ? AND seq = ?` (compare-and-swap). Conflict → re-read, re-merge, retry once; repeated conflict → last-write-wins + warn. Optimistic local apply + broadcast fast path `{ type: 'LIVE_STATE', payload: { snapshot, seq } }`.
**Acceptance:** concurrent writes from commander + remote never regress seq; loser converges on retry.

### E2.3 Migrate turn-state senders to the row
Replace broadcast-only state for: pick chain (`SPIN_WHEEL`/`CLEAR_RESPONDER`/`NEW_TURN`/`DISMISS_WHEEL` internals), `QUIET_MODE_CHANGED`, `SELECTION_MODE_CHANGED`, `TEAMS_ASSIGNED`, `END_SESSION`. Receivers: broadcast handler applies snapshots with `seq` guard; `applySessionRow` reconciles `live_state` when `row.seq > localSeq`; the hydration select (mount/refresh/visibility) now restores **picked student, turn token, overlay, modes** — a mid-turn board refresh converges without re-picking.
**Acceptance:** refresh the board mid-turn → same responder/turn/overlay restored everywhere.

### E2.4 Derive the pick choreography from timestamps (retire the one-tab timer chain)
The 2.5 s spin chain (`SessionContext.tsx:1096-1120`, timers `:1006-1023`) runs only on the picking tab. Replace: at pick time the writer stores `turnStartedAt` + `revealAt = turnStartedAt + SPIN_MS` (current choreography constants preserved). Every tab runs one shared effect: `now >= revealAt` → apply reveal (`GAME_WIN` visuals, turn reset, overlay dismiss) — keyed off `currentTurnId` derived from the row. On mount/reconnect with `now >= revealAt`, apply immediately (recovery). The picker tab dying mid-spin no longer strands the wheel.
After verification, retire the `GAME_WIN`/`NEW_TURN`/`DISMISS_WHEEL` broadcasts (keep the action types as no-ops for one release as a safety net).
**Acceptance:** close the commander tab mid-spin → board still completes the pick and resets games correctly.

### E2.5 Collapse the dual slide-change paths
`goToSlide` (`SessionContext.tsx:766-790`) becomes: persist (with E1.7 retry) + apply locally **through the same `applySessionRow` code path** (synthetic row). One behavior mirrored by construction — retires the `028d3ce` bug class.
**Acceptance:** board and commander slide-transition behavior identical (responder cleared, overlays cleared, timers cancelled) for local nav and realtime sync.

### E2.6 Re-evaluate `broadcast: { self: false }` (guarded, reversible, LAST)
With snapshot broadcasts + seq guard, self-echo becomes harmless. Flip to `self: true` in a **separate commit**; first audit non-snapshot actions for double-apply risk (confetti spawns, drawing throttles, `POINTS_AWARDED` display). Full two-tab regression after. Rollback = revert the flag. **Fallback if any double-behavior is not cheaply guardable: keep `self:false` and keep the optimistic-setState convention documented (this task then closes as "evaluated — declined").**

### E2.7 Deploy
Migration via MCP → verify (§8) → frontend push → projector banner-reload.

### E2.8 Phase 2 verification
- Scripted: refresh mid-turn (E2.3), kill-picker-mid-spin (E2.4), commander+remote rapid-fire slide races (E1.9 + E2.2), offline 60 s recovery.
- **Classroom gate:** ≥ 1 real class; confirm a mid-class projector refresh recovers the turn, and no stuck-overlay recurrence.

---

## Phase 3 — backlog

**Status: implemented 2026-08-19** (same session, frontend-only, no migration). Details:

- **SpeedQuiz reveal penalty (P3.1):** `REVEAL_ANSWER` now runs a neutral `handleRevealOnly()` — shows the answer, no points/mistake/attempt write (was: full wrong-answer charge). Bonus from the same audit block: TeamBattle's team rails had interpolated Tailwind classes (`border-${color}-500`) that JIT purges — replaced with static per-team class maps.
- **ISayYouSay reset (P3.2):** a new pick now resets the FULL drill from any phase (was: bailed unless in discrimination, leaking choral state to the next student). Also found + fixed its streak tiers being dead (streakRef was reset per item, contradicting its own docs — same class as SpeedQuiz F1).
- **Unified write-back (P3.3):** FlashMatch, ListenTap, StoryStage migrated from analytics-only to the full `logAttempt` triple-write (they never touched FSRS/remediation); WhatsMissing's direct `gradeStudent` replaced with the shared path. Games already doing the full triple-write by hand were left alone (churn without behavior change).
- **BoardGrammarPractice deleted (P3.4)** — orphaned since GRAMMAR_PRACTICE routed to GrammarForge (comment references only).
- **Legacy aliases (P3.5):** dead plain-`REVEAL` listener cases removed (GrammarForge, WhatsMissing ×2 — no emitter exists). `RESTART`/`SHOW_AGAIN`/`START_MEMORIZE` KEPT: the remote really emits them.
- **Wheel family (P3.6):** GameArena now also accepts `RESET_GAME` — the commander's reset button was dead for it (only the remote's `RESET_ROUND`/`RESET_WHEEL` worked).
- **TeacherRemote dead buttons (P3.7):** decorative no-op "Action" pad button removed; the camera "Flip" button now actually switches front/back camera (facing-mode state + stream restart). The audit's "Class/Settings bottom nav" no longer exists in the file — obsolete.
- **Shared BOARD_MAP (P3.8):** `apps/board/templates/boardMap.tsx` is now the ONE step-type → template registry, consumed by both ClassroomBoard (projector) and BoardRenderer (commander preview). ClassroomBoard's 32-line chain and BoardRenderer's mirror map are gone — the a44e1bb drift class is structurally retired.
- **Typed core vocabulary (P3.9):** `store/sessionActionTypes.ts` — payload map for every SessionContext-emitted action; `SessionAction.type` is typed over it as an OPEN union (`(string & {})`) so game pass-through strings compile unchanged. Full discriminated enforcement stays available if drift reappears.
- Per-game Option-B mirror conversion: still deferred until classroom data shows a game that still drifts post-Phase-2.

## Phase 3 — original backlog list (pre-implementation)

Typed action union (FIXPLAN D) · collapse `ClassroomBoard` vs `BoardRenderer` switches (design doc §4.1) · delete or route orphaned `BoardGrammarPractice` · unify score write-back on `logAttempt` (FlashMatch/ListenTap/StoryStage missing FSRS; WhatsMissing's direct `gradeStudent`) · SpeedQuiz reveal-penalty bug (AUDIT_ROADMAP open) · ISayYouSay conditional NEW_TURN reset (`:127`) · wheel-family vocabulary vs ContextualControls (`RESET_ROUND`/`RESET_WHEEL`) · WhatsMissing legacy aliases (`REVEAL`/`RESTART`) · dead TeacherRemote buttons (P3-10) · per-game Option-B mirror conversion if any game still drifts.

---

## Conventions (inherited from FIXPLAN_INDEX)

Migrations idempotent, next free prefix, deployed via MCP/pooler (never the direct DB host). File-by-file changes with `file:line` refs. Each phase ships only with its verification checklist green.
