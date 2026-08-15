# Phase 1 Implementation Handoff — the Engine

> Created 2026-08-05 as a focused handoff for the next implementation session (or a Qoder agent). Captures everything verified against the real codebase this session so Phase 1 doesn't have to rediscover it. Read alongside `professor-live-architecture-design.md` (the spec) and `PER_GAME_PROMPTS.md` Prompt 0 (the task).

## Goal

Build the foundational engine (architecture §6.3 Phase 1 + Phase 2) that every game in Prompts 1–4 depends on. Nothing in those specs can ship until this exists.

## What's already verified (don't re-verify, just build on)

- **`services/boardLearner.ts` is the correct path** and exports `classWeakObjectives` (line 232), `gradeObjective` (181), `gradeStudent` (203), `gradeStudentWeakest` (131). The architecture's reference is sound.
- **`types/exercise.ts` is the canonical ExerciseContent contract.** The specs now use the real field names. The 15 content variants are at lines 100–259. `PoolItem` at 265, `toPoolItem` at 276.
- **`addPoints` is at `store/SessionContext.tsx:704`** — signature is `(studentId: string, amount: number)`. Broadcasts `POINTS_AWARDED`, optimistic `setState` (clamps at 0, confetti if >0), then debounced ledger write.
- **The debounced flush** is `flushClassPoints` at `SessionContext.tsx:188-200` — `debounce(async () => {...}, 1500)`. Coalesces per-student amounts into one `awardClassPoints(rosterId, classId, amount, 'board_points')` call (DataService line 173). `pendingPointsRef` at line 180.
- **The broadcast reducer** handles `POINTS_AWARDED` at `SessionContext.tsx:285-289` — updates points + confetti on receiving tabs.
- **`useBoardPool`** is at `apps/board/useBoardPool.ts` (73 lines) — takes `{unitId, exerciseTypes, classWeak, roster, limit}`, returns `{items, loading, weakOrder}`. The `exerciseTypes` param is currently set once at mount; needs to become per-round (Phase 1d).
- **`scoringDefaults.ts`** has `scoreForAttempt(mistakes)` (line 72), `CLEAN_SCORE=30`, `MISTAKE_PENALTY=5`, plus the dead `CORRECT_ANSWER_POINTS`/`pointsForCorrect` (lines 24-41). `BoardTeamBattle:159` is the sole caller of `pointsForCorrect`.
- **The `DIALOGUE_STAGE` + `POLL` flowTypes fixes landed** (Phase 0 done). `SUPPORTED_FLOW_TYPES` now has `DIALOGUE_STAGE`, no `POLL`.

## Phase 1 deliverables (in build order, lowest-risk-first)

### 1a. `scoringDefaults.ts` — unified scorer (additive first, migrate callers later)
- **Add** `Difficulty = 1|2|3`, `DIFFICULTY_MULTIPLIER = {1:1.0, 2:1.4, 3:2.0}`.
- **Add** the new `scoreForAttempt(mistakes, difficulty, partialCreditRatio = 1.0)` per architecture §3.1.
- **Keep the old `scoreForAttempt(mistakes)` temporarily** as a deprecated alias pointing at the new one with `difficulty=1, partialCreditRatio=1.0` — so existing callers (FlashMatch, ListenTap, etc.) don't break until migrated. Mark with a `@deprecated` JSDoc.
- **Don't delete `pointsForCorrect` yet** — that's 1f (after TeamBattle migrates).

### 1b. Correctness write path (NEW — separate from points flush)
- **Create `services/attemptsLog.ts`** (or extend boardLearner) with `recordAttempt(studentId, {objectiveId, exerciseType, correctness: 'correct'|'incorrect'|'partial', difficulty})`.
- Writes a `point_transactions` row with `amount=0`, `source='attempt'`, `metadata={correctness, objectiveId, exerciseType, difficulty}`. **Non-debounced** — every attempt gets its own row.
- Needs the roster→profileId resolution (copy the pattern from `gradeStudent` at SessionContext:729-744 — unclaimed students get skipped, like the cognitive path).
- Expose `recordAttempt` on SessionContext (mirror the `gradeStudent` pattern).
- **Do NOT touch `addPoints` or the debounced flush.**

### 1c. New infrastructure file — `apps/board/lessonDirector.ts` (pure addition, touches nothing existing)
- `ObjectiveType = 'vocabulary'|'grammar'|'story'|'dialogue'|'phonics'`
- `LADDER_CEILING: Record<ObjectiveType, number> = {vocabulary:5, grammar:4, story:3, dialogue:3, phonics:1}` (from the Unscramble spec's fix)
- `nextRungForObjective(objective, srsState)` per architecture §1.3, with the LADDER_CEILING clamp (raw mastery→rung, then `min(raw, LADDER_CEILING[type])`)
- `SHELL_CAPABILITIES: Record<string, {consumes: ExerciseType[], rungRange: [number, number]}>` — populate from architecture §6.1 portfolio table. Verify each `consumes` entry is a real `ExerciseType` (lint per architecture §2.2 Option C).
- `PHASE_ENVELOPE: Record<Phase, {rungRange: [number, number], scoringPosture: 'none'|'per-turn'|'summative'}>` per architecture §1.2.
- `ContextualControlsSpec` TS interface per architecture §4.1 (the contract games register).
- `buildRound({roundIndex, totalRounds, objectivesInLesson, roster, shellType, phase})` per architecture §1.3 — returns `{objectiveIds: string[], rungByObjective: Record<string, number>, exerciseTypes: ExerciseType[]}`. Uses `classWeakObjectives` from boardLearner.
- Dev-time `warnIfOutsideEnvelope(shellType, phase, rung)` — `console.warn` in `import.meta.env.DEV` only.

### 1d. `useEscalatingPool` hook + `useBoardPool` per-round change
- **`apps/board/useEscalatingPool.ts`** (new) — wraps `useBoardPool`, takes `{unitId, shellType, roster, roundIndex, totalRounds}`, calls `buildRound` per round, returns `{items, loading, rungByObjective}`.
- **Modify `useBoardPool.ts`** — the `exerciseTypes` param must become settable per round, not once at mount. Currently the `useEffect` deps include `exerciseTypes?.join(',')` (line 70), which already re-fetches when the array changes — so this may need less change than feared. Audit every caller (FlashMatch, ListenTap, WhatsMissing, GrammarPractice's direct query, etc.) for breakage. The change: callers pass a new `exerciseTypes` array when the round changes, and the hook re-fetches.
- **Risk:** this is the one existing-file modification in the additive batch. Test carefully.

### 1e. `remediationQueue` in SessionContext (additive state)
- Add to `SessionState`: `remediationQueue: RemediationEntry[]` where `RemediationEntry = {objectiveId, missedBy: string[], lastMissedAt: number}`.
- Add methods: `pushToRemediation(objectiveId, studentId)`, `drainRemediation(): string[]` (returns objective IDs and clears).
- No broadcast needed initially (it's session-local analytics state, not cross-tab-synced gameplay) — but if it should drive the next slide's content on all tabs, it needs broadcast. **Decision needed:** is remediationQueue cross-tab-synced or commander-only? Architecture says "SessionContext-level" — default to NOT broadcast (the commander pulls content; the board renders what the commander tells it via the existing slide-sync channel).

### 1f. TeamBattle migration + dead-code deletion (touches existing game code — highest risk)
- `BoardTeamBattle.tsx:159` — replace `addPoints(picked, pointsForCorrect(stepType))` with `addPoints(picked, scoreForAttempt(0, 2, 1.0))` (or inline `+15`/equivalent under the new model — architecture §3.1 says TeamBattle migrates to unified scoring; decide the right difficulty multiplier for team assessment).
- Delete `CORRECT_ANSWER_POINTS` + `pointsForCorrect` from `scoringDefaults.ts` once the sole caller is migrated.
- Delete the old `scoreForAttempt(mistakes)` deprecated alias from 1a once all callers migrated (verify with grep — FlashMatch, ListenTap, SpeedQuiz, Unscramble, StorySequencing, GrammarPractice all call it).

### 1g. Visibility fixes (UI — touches BoardOverlayLayer + BoardShell + roster chip)
- **Mistakes tally** under active roster chip — read from a new `mistakesByStudent` SessionContext state, incremented in the wrong-answer branch of each game. Or per-game local state surfaced via a portal. **Decision:** centralize or per-game?
- **Persistent −5 toast (~3s)** — modify the toast in `BoardOverlayLayer.tsx` (find the current instant popup).
- **"🔁 already scored this turn" chip** — surfaced when `awardedRef` blocks; per-game concern, but needs a shared component.
- **Wheel "+? XP Waiting…" → "Let's see how you do!"** — in `BoardOverlayLayer.tsx`, find the wheel winner card (line ~228 per audit).

### 1h. Typecheck + test
- `npx tsc --noEmit` — expect the same 101 pre-existing Deno errors; my files must add zero.
- `npx vitest run` — expect the same 19 pre-existing failures; my changes must add zero.

## Open questions for the next session (decide before building)

1. **`recordAttempt` target table:** `point_transactions` with `amount=0` (keeps it one table; analytics filters `source='attempt'`) vs a new `session_attempts` table (cleaner separation; small migration). Recommended: `point_transactions` with `amount=0, source='attempt'` — no migration, and `metadata` JSONB already exists on the table (verify).
2. **`remediationQueue` cross-tab sync:** broadcast or commander-only? Recommended: commander-only (the board renders what the commander's slide-sync tells it).
3. **Mistakes tally:** centralized SessionContext state or per-game local? Recommended: per-game local, surfaced via a shared `<MistakeTally studentId />` component that games render in their overlay.

## Files that will be created or modified

**Created (additive, zero-risk):**
- `services/attemptsLog.ts` (or extend `boardLearner.ts`)
- `apps/board/lessonDirector.ts`
- `apps/board/useEscalatingPool.ts`

**Modified (existing — needs care):**
- `apps/board/templates/scoringDefaults.ts` (1a: add unified scorer; 1f: delete dead map)
- `apps/board/useBoardPool.ts` (1d: per-round exerciseTypes)
- `store/SessionContext.tsx` (1b: expose recordAttempt; 1e: remediationQueue)
- `apps/board/templates/BoardTeamBattle.tsx` (1f: migrate off pointsForCorrect)
- `apps/board/templates/BoardOverlayLayer.tsx` (1g: wheel placeholder, toast)
- Possibly `apps/board/BoardShell.tsx` (1g: mistakes tally)

## What Qoder can take after Phase 1 lands

Once Phase 1 is in, the 4 game specs (`flashmatch-v2-spec.md`, `listentap-v2-spec.md`, `whatsmissing-v2-spec.md`, `unscramble-storysequencing-v2-spec.md`) are all unblocked. Partition for parallelism:
- **Qoder Agent A:** FlashMatch + ListenTap (both vocab escalation games, both reference `useEscalatingPool`, similar shape — but they edit DIFFERENT files so no collision).
- **Qoder Agent B:** WhatsMissing (+MagicEyes absorption) + Unscramble/StorySequencing (different files again).
- **I stay coordinator:** write the Qoder handoff briefs (referencing the specs + the Phase 1 engine API), verify field names/paths, integrate + test.

Each Qoder agent gets: the spec file path, the Phase 1 API surface (`useEscalatingPool`, `scoreForAttempt`, `recordAttempt`, `ContextualControlsSpec`), the lifecycle contract, the acceptance criteria, and the EXACT files it's allowed to touch (enforced partition).
