# 09 — Live Sync Architecture Audit (Commander ↔ Board ↔ Remote)

> **Brainstorm / audit document — 2026-08-19.** Trigger: repeated classroom desync between the
> teacher commander and the projector board ("we go a step further on the teacher commander and the
> two systems are not synchronized — on some games it works perfectly, on others not").
> Scope confirmed with owner: the **current 3-tab model** (commander `/teacher/live`, projector
> board `/board`, teacher remote `/remote`). Student devices have no live subscription by design
> (removed 2026-08-17, `d0eb0a6`) and are out of scope.
>
> **Observed symptoms (owner-confirmed):**
> 1. **Different content on screens** — commander preview and board show different cards/questions/tiles for the same round.
> 2. **Board stuck / behind a step** — teacher advances, board stays on the old slide, wheel, or overlay.
>
> Nothing in this document has been implemented. It ends with a recommendation and a phased roadmap.
>
> **Implementation plan (2026-08-19):** [`../FIXPLAN_E_LIVE_SYNC.md`](../FIXPLAN_E_LIVE_SYNC.md) — Phase 1 + Phase 2 detailed with owner decisions recorded; Phase 3 kept as backlog.

---

## 1. Executive summary

**The architecture's direction is right. The implementation has six root-cause defect classes, and the two symptoms the owner has seen in class map exactly onto the top two.**

- Symptom 1 (different content) = **per-tab randomness**. The commander preview and the projector each mount their *own copy* of every game, and most games roll their own `Math.random()` shuffles — so the two screens literally deal different content for the same round. The games that "work perfectly" (WordSearch, SpellingBee internals) are precisely the ones that already use **deterministic seeded RNG**. This is not bad luck; it's the pattern.
- Symptom 2 (board stuck behind) = **fire-and-forget writes + zero recovery**. Slide changes are persisted best-effort with errors swallowed, the postgres_changes channel has no status handling, there is no reconnect/resubscribe/rehydrate logic anywhere, and `isConnected` only watches the broadcast channel — so the board can silently stop receiving while appearing "connected".

Industry practice (§5) says the *shape* we already have — ephemeral broadcast bus for latency + durable DB row as source of truth + reconciliation — is the correct pattern for this class of app. What's missing is the third leg: **determinism** (same inputs → same content on every tab) and **reconciliation** (detect staleness, recover on reconnect/refresh).

**Verdict: do not rebuild.** Harden what exists (Phase 1), make one structural change — promote the transient turn state into the authoritative session row with a monotonic sequence number (Phase 2) — and pay down hygiene debt (Phase 3). A full rebuild (dedicated WS game server, CRDTs) is overkill for three teacher-controlled tabs with a single writer, and our own design doc (`docs/audit/professor-live-architecture-design.md` §8) already argues that adding new cross-tab-synchronized primitives is the most expensive path available.

---

## 2. How sync works today (the map)

### 2.1 Topology

Three separate browser tabs, each mounting its own `<SessionProvider>` — **they share no React state**:

| Surface | Route | File | Role |
|---|---|---|---|
| Commander | `/teacher/live` | `apps/teacher/LiveCommander.tsx` | Teacher controls + a 50%-scale **preview** of the same games via `apps/teacher/live/panels/BoardRenderer.tsx` (BOARD_MAP) |
| Projector board | `/board` | `apps/board/ClassroomBoard.tsx` + `BoardShell.tsx` | What the kids watch; renders the same `Board*.tsx` templates |
| Teacher remote | `/remote` | `apps/remote/TeacherRemote.tsx` | Phone controls; same `SessionProvider` |

Both the commander preview and the projector mount **independent instances** of every game component. Anything not derived from shared state is therefore per-tab and can drift.

### 2.2 The three Supabase Realtime channels (all created in `store/SessionContext.tsx`)

| # | Channel | Mechanism | Carries | Key lines |
|---|---|---|---|---|
| A | `classroom_live` | broadcast, event `classroom_action`, `broadcast: { self: false }` | The command bus: `SPIN_WHEEL`, `NEW_TURN`, `POINTS_AWARDED`, `DISMISS_WHEEL`, `RESET_GAME`, per-game remote actions, … | created `SessionContext.tsx:260-262`, receive reducer `:264-361`, send `:529` |
| B | `classroom_session_sync` | postgres_changes on `classroom_sessions` (all events, filtered by teacher) | **Authoritative** unit / `current_index` / status → `applySessionRow` | `:481-490`, applied at `:391-447` |
| C | `live-class-${classId}` | postgres_changes on `roster_students`, `point_transactions` (INSERT), `attendance_records` | Roster/points reconciliation → `loadStudents()` | `:615-631` |

- `self: false` means the sender never receives its own echo — **every sender must also do an optimistic local `setState`** (rationale comment at `:253-259`). This convention is the project's most-documented footgun (§3.3).
- `isConnected` reflects **only channel A's** status (`:362-364`). Channels B and C are subscribed with no status callback at all.

### 2.3 Durable vs transient state

- **Durable (DB):** the single `classroom_sessions` row — `class_id`, `unit_id`, `current_index`, `status`, `updated_at` (one row per teacher; migration `20260619000000_classroom_sessions.sql`). Plus the durable per-student trails: `point_transactions` (ledger), `srs_items` (FSRS), `student_progress.xp`.
- **Transient (broadcast-only, never persisted):** the picked responder (`quickWheelWinner`), `currentTurnId`/`turnToken`, wheel overlay state, teams, drawings, quiet mode, selection mode, confetti. **A board refresh mid-game loses all of it** until the teacher re-picks. Documented as a deliberate v1 policy (`LIVE_GAME_LIFECYCLE.md`, `SessionContext.tsx:381-390`).

### 2.4 End-to-end trace (one full pick → play → score → next cycle)

1. Teacher taps "Next Student" → `nextStudent()` (`SessionContext.tsx:1128-1134`) → broadcast `CLEAR_RESPONDER`.
2. 50 ms later → `selectNextStudent()` (round-robin, `:1046-1076`) → broadcast `SPIN_WHEEL` → wheel overlay opens on all tabs.
3. **2500 ms setTimeout chain on the picking tab only** (`:1096-1120`): broadcast `GAME_WIN` → `NEW_TURN {studentId, turnToken}` → `DISMISS_WHEEL`. Every game keys its reset `useEffect` on `currentTurnId` changing.
4. Slide change: `goToSlide` (`:766-790`) = local setState + `persistSessionIndex` → `UPDATE classroom_sessions` → channel B fires on the board → `applySessionRow` swaps `activeSlideData` → `ClassroomBoard` switches template.
5. Scoring: board game calls `addPoints()` → broadcast `POINTS_AWARDED` (instant everywhere) + 1500 ms-debounced ledger insert (`:233-245`) → channel C → `loadStudents()` recompute.

Note the structural asymmetry: **slide position travels via the DB row; everything about the current turn travels via ephemeral broadcast + one-tab timers.** Both observed symptoms live exactly on the weak legs of that split.

---

## 3. Root-cause audit (ranked by real-world impact)

### 3.1 Per-tab random content selection → **symptom 1 (different content)**

The single biggest cause. Every tab rolls its own randomness, so the commander preview and the projector deal **different content for the same round**:

- **The pool itself:** `apps/board/useBoardPool.ts:76-79` — Fisher-Yates with `Math.random()` on the objective pool *before* weak-rank sort. This feeds FastVocab, SpellingBee and friends, so even games with seeded sub-engines get a **different word order per tab** from this hook.
- **Quiz composition:** `quizEngine.ts` (question pick + shuffle; shared by SpeedQuiz, TeamBattle).
- **Per-game shuffles:** FlashMatch `:170`, Unscramble `:93`, WhatsMissing `:72`, StorySequencing `:161`, GrammarForge `:137`, StoryQuest `:225`, TeamBattle `:209`, WordDetective hint elimination `:185`.

Important nuance: the `useBoardPool` shuffle is **load-bearing** — it was added deliberately (NEWGEN_AUDIT §3.7) because without it every session served the same first-N items. The fix is therefore **not** "remove the shuffle" but **"seed it per-session deterministically"** (see §6, Phase 1): seed = `hash(sessionId | unitId | stepId)` gives variety across sessions *and* identity across tabs.

### 3.2 Fire-and-forget writes + zero recovery → **symptom 2 (board stuck behind)**

- `persistSessionIndex` / `persistSessionStatus` (`SessionContext.tsx:501-512`, `:514-527`) update the DB **best-effort with `catch {}`** while local state has already moved. If the write fails, the commander is on slide N, the board never hears about it, and nothing ever retries — permanent divergence for the rest of the class.
- **No reconnection handling of any kind**: zero `online`/`offline`/`visibilitychange` listeners in the app (verified by grep); zero handling of `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED`; no resubscribe, no heartbeat. Recovery relies entirely on supabase-js socket internals.
- **`isConnected` blind spot**: only channel A feeds it. Channels B (slide sync!) and C (roster) can drop silently while the board shows "connected". The "NO SIGNAL" gate (`ClassroomBoard.tsx:61-77`) never fires for the channel that actually carries slide position.
- **Refresh/late-join recovery is one-shot and partial**: the hydration select (`SessionContext.tsx:471-476`) restores unit/slide/status, but **all transient turn state is unrecoverable** — refreshed board loses the picked student, open overlay, and current turn until the teacher re-picks.
- Secondary confounder to rule out when diagnosing "stuck board": the PWA service worker (prompt-mode, `AGENTS.md` §8.1) can serve a stale shell after deploys — hard-refresh the projector once to exclude it before blaming realtime.

### 3.3 The `self: false` + optimistic-setState convention

Every sender must remember to mirror every broadcast with a local `setState`. GAMES_AUDIT.md §E calls this "a documented, recurring footgun — weeks of bugs". The clearest case: `currentTurnId` was initially set only in the receive reducer, so the *picking* tab never reset its own games (fixed `f03afad`). Any new sender (new button, new game, new panel) can reintroduce this class of bug at any time. The convention scales with the number of senders, and the number of senders grows every month.

### 3.4 One-tab `setTimeout` chains (time as a side effect of one browser tab)

- The 2500 ms spin chain (`SessionContext.tsx:1096-1120`) runs **only on the tab that picked**. If that tab crashes, reloads, or laptop-sleeps mid-spin, every other tab keeps the wheel overlay open forever — there is no reconciling state to recover from (matches the "stuck overlay" reports; partial mitigations landed in `43c6999`).
- SpeedQuiz runs a self-advancing per-second local timer (`BoardSpeedQuiz.tsx:71-92`) — two tabs mounted a few seconds apart drift apart with **no broadcast ever reconciling them**.
- Similar local phase machines that only change via in-tab events: DialogueStage `stage`, ISayYouSay `shellPhase`/`choralStage`, WhatsMissing `gamePhase`, TeamBattle `phase`, SoundLab `currentPhase`, ListenTap `uiPhase`.

### 3.5 No staleness protection anywhere

- Broadcast actions carry `timestamp` (`SessionContext.tsx:26-30`) — **the reducer never reads it**.
- `classroom_sessions.updated_at` is written on every persist — **never compared**. A delayed or reordered postgres_changes row is applied unconditionally.
- **Last-write-wins races:** commander *and* remote both expose `nextSlide` — two teacher tabs racing produce silent lost updates on `current_index`.
- **Single-slot `lastAction`** (`:65`, `:897-910`): only the newest action is visible to game `useEffect`s; two actions in quick succession can overwrite the first before a game consumes it (games key completion latches on it, e.g. `BoardSentenceLab.tsx:66`).

### 3.6 Duplicated manual paths (drift by construction)

- **Two slide-change code paths that must mirror each other by hand**: `goToSlide` (local tab) vs `applySessionRow` (realtime tab). Bug `028d3ce` was exactly this: the fix landed in one path and the board kept the stale responder via the other.
- **Two parallel render switches**: `ClassroomBoard.tsx:142-176` vs `BoardRenderer.tsx` BOARD_MAP — already drifted once (`a44e1bb`: 6 unregistered slide types + GAME_ARENA aliased to the wrong game). Design doc §4.1 recommends collapsing them; still open (FOLLOWUPS F1).
- **Untyped command bus**: `SessionAction.payload?: any` (`SessionContext.tsx:24`). The discriminated union was FIXPLAN **D** and is still deferred (AUDIT_ROADMAP P3-2). Mismatched action strings (`REVEAL` vs `REVEAL_ANSWER`, `RESTART` vs `START_MEMORIZE`) have already caused dead-button bugs.
- **Three score write-back paths**: unified `logAttempt` helper (11 games) vs hand-rolled `recordAttempt`+`gradeObjective` (8 games) vs `recordAttempt`-only (FlashMatch, ListenTap, StoryStage — no FSRS write); WhatsMissing uniquely calls `gradeStudent` directly. The leaderboard never diverges (all paths call `addPoints`), but analytics/FSRS coverage differs per game — a data-integrity drift rather than a visible sync one.

---

## 4. Why some games sync perfectly and others don't

Full per-game sweep of the `Board*.tsx` templates. "NT reset" = keys reset on `currentTurnId`; "RNG" = how content randomness is produced.

| Game | NT reset | Randomness | Local phase machine | Verdict |
|---|---|---|---|---|
| **WordSearch** | yes | **deterministic seed** `hashString(unitId\|roundIndex\|resetCount\|wordIds)` + mulberry32 (`wordSearch/gridEngine.ts:43-56`, used `BoardWordSearch.tsx:362-374`) | timer yes, but grid stable | **Exemplar — syncs by construction** |
| **SpellingBee** | yes | keyboard removal seeded (hashString/mulberry32); **but word order via `useBoardPool` (per-tab)** | — | Half-fixed: internals seeded, input list isn't |
| **FastVocab** | yes | via `useBoardPool` (per-tab) | — | Same half-fixed pattern |
| SpeedQuiz | yes (qIdx deliberately kept) | `quizEngine` per-tab | **self-advancing per-second timer** | **Worst drifter** — content + clock both per-tab |
| FlashMatch / Unscramble / WhatsMissing / StorySequencing / GrammarForge / StoryQuest / TeamBattle / WordDetective | yes | per-tab `Math.random` shuffles | some local phase | Drift content between screens |
| DialogueStage / ISayYouSay | **partial** — refs only; ISayYouSay bails unless `shellPhase === 'discrimination'` (`:127`) | — | **yes** (`stage`, `shellPhase`/`choralStage`) | Turn reset doesn't fully reset |
| GameArena / WheelOfDestiny | **no NEW_TURN handling** | per-tab wheel rotation | — | Wheel-family vocabulary (`RESET_ROUND`/`RESET_WHEEL`) emitted only by TeacherRemote — ContextualControls buttons are dead for these |
| GrammarPractice | yes | — | — | **Orphaned** — routed nowhere (GRAMMAR_PRACTICE → GrammarForge in both switches) |
| Display templates (FocusCards, MediaPlayer, GrammarSandbox, LiveClassWarmup, IntroSplash) | n/a | — | — | Display-only by design (§9) — fine |
| ClassRally, GrammarLab, MemoryLab, PhonicsArena, SentenceLab, SoundLab, StoryStage, VocabBlitz, ListenTap, Unscramble | yes | mostly per-tab | minor | Standard pattern; sync gaps limited to RNG |

**The pattern is unmistakable: determinism → syncs; `Math.random` → drifts.** WordSearch proves the codebase already contains the correct pattern (stable string seed → mulberry32) — Phase 1 is largely "promote the WordSearch pattern to everything", not invention.

Other per-game findings folded into Phase 3: orphaned BoardGrammarPractice (delete or route), the SpeedQuiz "Reveal" wrong-branch penalty (AUDIT_ROADMAP, open), the wheel-family action-name mismatch with ContextualControls, and WhatsMissing's legacy `REVEAL`/`RESTART` aliases.

---

## 5. What the industry does (research summary)

The confirmed best-practice pattern for multi-client realtime state over Supabase (and equivalent stacks) is exactly three legs:

1. **Broadcast for latency** — ephemeral, low-latency, client-to-client; great for UI commands; **unreliable by design** (no delivery guarantee, no persistence, missed by anyone disconnected).
2. **Durable state as source of truth** — every meaningful change is also written to the DB; clients can always re-derive the world from it.
3. **Reconciliation** — on (re)connect/refresh/visibility change, clients re-fetch authoritative state and converge; version/sequence numbers reject stale updates.

Sources:
- [supabase/realtime (GitHub)](https://github.com/supabase/realtime) — the three modes (Broadcast / Postgres Changes / Presence) and their intended use.
- [Supabase: Realtime Postgres Changes](https://supabase.com/features/realtime-postgres-changes) — postgres_changes semantics (authorized DB change listeners).
- [Reddit r/Supabase: best practices for updating/getting data in real time](https://www.reddit.com/r/Supabase/comments/1neiwhm/best_practices_for_updatinggetting_data_in_real/) — practitioner consensus: broadcast for speed + persist + refetch-on-reconnect.
- [Supabase Discord via AnswerOverflow: Postgres Changes vs Broadcast](https://www.answeroverflow.com/m/1357762690193555482) and a practitioner write-up on [why broadcast + RLS-guarded payloads replaced postgres_changes for hot paths](https://www.linkedin.com/posts/bilalkumrani_it-looked-real-time-then-i-removed-the-timer-activity-7403863444438835202-lVAr) — teams migrating hot paths to broadcast for payload control, keeping the DB for truth.
- [Supabase Realtime in Production: Limits & Fixes (AgileSoft Labs)](https://www.agilesoftlabs.com/blog/2026/05/supabase-realtime-in-production-what) — connection limits, failure modes, and why reconnect handling must be app-level.
- [Supabase Realtime Modes for Collaborative Apps (Easton Dev)](https://eastondev.com/blog/en/posts/dev/supabase-realtime/) — mode comparison for multi-client apps.
- [Building a Resilient Real-Time Data Sync Architecture (StackSync)](https://www.stacksync.com/blog/building-a-resilient-real-time-data-sync-architecture-implementation-guide-for-technical-leaders) — conflict resolution, offline handling, event sourcing options.
- [Real-Time Data Synchronization in Education Platforms (Genne, 2024)](https://www.researchgate.net/publication/400749052_Architecting_Real-Time_Data_Synchronization_in_Education_Platforms_using_GraphQL) — the same three-leg pattern in an education-specific setting.

**Read against our codebase:** we built legs 1 and 2 (broadcast bus + `classroom_sessions` row) but only *half* of leg 2 (too little state is durable — all turn state is ephemeral) and **none of leg 3** (no reconciliation, no staleness rejection), and we violated the determinism requirement that replicated renderers implicitly have (each tab must render the same function of the same state). Our own design doc already internalized the "don't add sync primitives" half of this lesson (`professor-live-architecture-design.md` §8); the missing half is "make the existing state reconcile-able".

---

## 6. Options and recommendation

### Option A — Targeted hardening (keep everything, fix the failure modes)

1. **Deterministic seeded content everywhere**: promote the WordSearch pattern (`hashString` + `mulberry32`, already in `wordSearch/gridEngine.ts`) into a shared `seededRandom.ts` util; seed = `hash(sessionId | unitId | stepId [| turnToken | resetCount])`. Replace `Math.random()` in `useBoardPool`, `quizEngine`, and the 8 per-game shuffles. Preserves NEWGEN §3.7 session variety (seed changes per session) while making tabs identical. **Kills symptom 1 outright.**
2. **Persist with retry + error surface**: `persistSessionIndex`/`persistSessionStatus` retry with backoff; on final failure show the commander a "board may be behind — tap to resync" affordance instead of swallowing.
3. **Real connection status + reconnect**: subscribe status callbacks on **all three channels**; on `CHANNEL_ERROR`/`TIMED_OUT`/`online`/`visibilitychange` → resubscribe + re-run the hydration select (extend it to re-derive what it can). `isConnected` becomes "all critical channels healthy".
4. **Cheap guards**: ignore broadcast actions with `timestamp` older than the last applied per type; include and compare `updated_at` in `applySessionRow`; queue `lastAction` as a small ring instead of a single slot (or add a monotonic `actionId`).

Risk: low. No schema change, no UX change. Effort: days, not weeks.

### Option B — A + one structural move: authoritative turn state (**recommended**)

Everything in A, plus:

5. **Promote the transient turn state into the authoritative row**: add `live_state JSONB` + `seq BIGINT` to `classroom_sessions` (or a `live_turns` table keyed by session). Contents: responder id, `turnToken`, overlay/phase, quiet/selection mode, teams. Writers: only teacher-tabs, guarded by `seq` (compare-and-swap style `WHERE seq = expected`). Every tab — including a refreshed or late-joining board — converges by reading the row; the broadcast channel remains the **fast path** that carries the same snapshot for latency.
   - Kills: refresh-loss of the picked student, stuck-wheel-when-picker-tab-dies, `lastAction` single-slot overwrite (state converges regardless), and most of the `self:false` footgun surface (see 6).
   - The 2500 ms spin chain becomes derivable: store `turn_started_at`; every tab computes "wheel should be dismissed" from `(now - turn_started_at)` rather than trusting one tab's `setTimeout` to fire the broadcast.
6. **Re-evaluate `broadcast: { self: false }`**: with an idempotent reducer over full state snapshots (B5), self-echo becomes harmless and the "every sender must remember the optimistic setState" convention can be deleted instead of documented. The original `self:false` choice (fix `f64ef2e`) predated reducer idempotency; with snapshots it's worth flipping and removing a whole bug class. (Evaluate carefully — this touches every sender at once; do it as the *last* step of Phase 2.)
7. **Collapse the dual slide-change paths**: `goToSlide` becomes a thin wrapper that writes the row and applies the same `applySessionRow` code locally — one code path, mirrored by construction (retires the `028d3ce` bug class).

Risk: medium — one migration, one writer discipline (`seq`), SessionContext surgery. But it is *additive*: broadcasts keep working unchanged while the row catches up.

### Option C — Full rebuild (dedicated WS game server, CRDTs, event sourcing) — **rejected**

Three teacher-controlled tabs with a single writer do not need per-key CRDTs or an authoritative game server. Our own architecture doc §8 already rejected adding new cross-tab primitives on cost grounds; a rebuild would relearn every lesson already encoded in `LIVE_GAME_LIFECYCLE.md` at 10× the price.

### Phased roadmap

| Phase | Contents | Risk | Effect |
|---|---|---|---|
| **1 — Harden** (Option A) | Seeded RNG everywhere; persist retry/surface; 3-channel status + reconnect/rehydrate; timestamp/updated_at guards; lastAction ring | Low | Both observed symptoms gone in practice |
| **2 — Authoritative turn state** (B5-B7) | `live_state` + `seq` migration; snapshot broadcasts; derived timers; self-echo re-evaluation; path collapse | Medium | Refresh-proof, crash-proof, race-proof; deletes the footgun conventions |
| **3 — Hygiene** | Typed action union (FIXPLAN D); collapse ClassroomBoard/BoardRenderer switches; delete/route orphaned GrammarPractice; unify score write-back on `logAttempt`; per-game fixes (SpeedQuiz reveal penalty, ISayYouSay conditional reset, wheel-family vocabulary, WhatsMissing aliases, dead TeacherRemote buttons) | Low | Stops the drift classes from regenerating |

---

## 7. Open questions for the owner

1. **Should the commander preview be a live view rather than a second game instance?** Today the preview mounts its own copy of every game (that's why RNG determinism matters). An alternative: render the preview *from the same reconciled state the board renders* (state-driven, no independent instance). Doesn't remove the need for determinism, but reduces how much the preview is trusted as "what the board shows".
2. **Is transient state worth persisting?** Phase 2's `live_state` row makes the picked student/overlay survive a projector refresh — clearly good mid-class. Trade-off: one more writer discipline (single writer, `seq` guard) and slightly more DB chatter. Recommended yes; confirming.
3. **Turn-timer authority**: if we derive timers from `turn_started_at` (B5), teacher device clocks must be roughly sane (server time via the row's `updated_at` is the safer anchor — decide during implementation).
4. **Should the two writer tabs (commander + remote) be allowed to race `current_index` at all?** Cheapest answer in Phase 1: last-write-wins with `updated_at` guard; stricter answer in Phase 2: only the session-"owner" tab may advance slides (presence-based election). Strictness costs a little remote UX flexibility; worth an owner call.

---

## Appendix — historical bug roll (sync-related, for perspective)

`f64ef2e` self-echo double-processing · `c1cfc7a`/`f03afad` NEW_TURN + currentTurnId optimistic hole + stuck overlay · `028d3ce` stale responder via the realtime path · `a3b370d` destructive CLOSE_OVERLAY wiping the responder · `5521847` commander hooks-order crash wiping the preview · `a44e1bb` 6 slide types missing from BOARD_MAP · `43c6999` turnToken, spin guard, timer cleanup, stuck overlay clear, dead End buttons, wrong-student charging during spin · `02bb5c6` score screen outliving its turn. **Every one of these is an instance of §3's six classes.** The classes, not the instances, are what Phase 1–3 remove.
