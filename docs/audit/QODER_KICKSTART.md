# Qoder Kickstart Prompts — Phase 2 Game Implementation

> **Status.** Phase 1 (the engine) is shipped. These are the kickstart prompts for two parallel Qoder agents that will each implement two games from the v2 specs. Strict file-scope partition — no collisions.
>
> **Engine available (Phase 1, shipped 2026-08-06):**
> - `apps/board/lessonDirector.ts` — `SHELL_CAPABILITIES`, `PHASE_ENVELOPE`, `nextRungForObjective`, `buildRound`, `ContextualControlsSpec`, `exerciseTypesForRung`.
> - `apps/board/useEscalatingPool.ts` — `useEscalatingPool({unitId, shellType, phase, roster, roundIndex, totalRounds, roundSize})` → `{items, loading, rungByObjective, selectedObjectiveIds}`.
> - `apps/board/templates/scoringDefaults.ts` — `scoreForAttempt(mistakes, difficulty, partialCreditRatio)`, `MISTAKE_PENALTY`, `CLEAN_SCORE_BASE`, `DIFFICULTY_MULTIPLIER`, `Difficulty`. (Legacy `pointsForCorrect` deleted.)
> - `services/attemptsLog.ts` — `recordAttempt({rosterId, classId, profileId, correctness, objectiveId, exerciseType, difficulty, sessionId})`, `AttemptCorrectness` = `'correct'|'incorrect'|'partial'`. Plus `classAccuracySince`, `studentAccuracySince` for analytics reads.
> - `store/SessionContext.tsx` — `pushToRemediation(objectiveId, studentId)`, `getRemediationQueue()`, `drainRemediation()`. `addPoints` UNCHANGED (still `(studentId, amount)` — call `recordAttempt` separately for analytics).
> - DB migration `20260806000001_point_transactions_metadata.sql` — adds `metadata JSONB` to `point_transactions` (MUST be applied before `recordAttempt` works; see deploy note below).
>
> **Lifelong rules for every agent (the lifecycle contract — non-negotiable):**
> 1. Reset on `state.currentTurnId` change — a `useEffect` keyed on `currentTurnId`, NOT on `lastAction`.
> 2. Track mistakes with `useRef` + an `awardedRef` latch so a turn pays the success bonus exactly once.
> 3. Score via `addPoints(studentId, amount)` + `scoreForAttempt(mistakes, difficulty, partialCreditRatio)`.
> 4. Personalize the success message via `usePickedStudent()`.
>
> **Two paths per scoring event:** call `addPoints(id, delta)` for the leaderboard AND `recordAttempt({rosterId, classId, profileId, correctness, objectiveId, exerciseType, difficulty})` for analytics. They are separate concerns, separate write paths.
>
> **Deploy note.** Before running these games against the real backend, apply the migration: `supabase db push` (or MCP `supabase_apply_migration` on `20260806000001_point_transactions_metadata.sql`). Without it, `recordAttempt` inserts will fail silently (caught + logged, non-fatal) — games still work but analytics stay empty.
>
> **Spec field names are verified.** Every spec's normalizer was checked against `types/exercise.ts`. Use the field names in the spec verbatim — don't reinvent.

---

## ═══════ QODER AGENT A — FlashMatch + ListenTap (vocabulary escalation) ═══════

You are implementing two vocabulary games in the Professor teacher app — a teacher-facing ESL tool for live classroom English instruction (ages 6–12, China market). The architecture, audit, and your two game specs are in `docs/audit/`. **Read these files in this exact order before touching code:**
1. `docs/audit/GAMES_AUDIT.md` — §E (lifecycle contract), §F (scoring), §G (current games).
2. `docs/audit/professor-live-architecture-design.md` — §1 (ladders), §2 (escalation engine), §3 (scoring), §4 (controls).
3. `docs/audit/flashmatch-v2-spec.md` — YOUR spec for game 1.
4. `docs/audit/listentap-v2-spec.md` — YOUR spec for game 2.
5. `apps/board/lessonDirector.ts`, `apps/board/useEscalatingPool.ts`, `apps/board/templates/scoringDefaults.ts`, `services/attemptsLog.ts` — the Phase 1 engine you build against.

### Files you OWN (only you may edit these — Agent B will not touch them)
- `apps/board/templates/BoardFlashMatch.tsx` — rewrite per `flashmatch-v2-spec.md`
- `apps/board/templates/BoardListenTap.tsx` — rewrite per `listentap-v2-spec.md`
- `apps/teacher/live/panels/ContextualControls.tsx` — add `FLASH_MATCH` and `LISTEN_TAP` cases (currently dead — audit §H3)
- `apps/remote/TeacherRemote.tsx` — add `FLASH_MATCH` and `LISTEN_TAP` to `renderActivityControls` (currently missing)

### Files you MAY READ but MUST NOT edit
- Everything else — especially `lessonDirector.ts`, `useEscalatingPool.ts`, `scoringDefaults.ts`, `SessionContext.tsx`, `BoardTeamBattle.tsx` (Agent B's territory).

### Tasks
**Game 1 — BoardFlashMatch (rewrite `BoardFlashMatch.tsx`):**
- Implement the 3-payload normalizer (`normalizeToMatchPair` in the spec §1, verbatim field names — already verified against `types/exercise.ts`).
- Wire `useEscalatingPool({ shellType: 'FLASH_MATCH', phase: <from slide>, roster, roundIndex, totalRounds })`.
- Implement the round-escalation logic per spec §2.
- Implement per-pair lifecycle (spec §3 — `mistakesByPairRef`, `awardedPairsRef` reset on `currentTurnId`).
- Register `FLASH_MATCH_CONTROLS` `ContextualControlsSpec` (spec §4) and wire the controls into `ContextualControls.tsx` + `TeacherRemote.tsx`.
- Broadcast `SLIDE_COMPLETE` on natural end (spec §5).
- Wire the error-driven feedback (spec §6: 1st-miss hint, 2nd-miss micro-explanation, end-of-slide `pushToRemediation`).
- Empty-pool graceful state (spec §7).
- On every scored event: `addPoints(id, delta)` AND `recordAttempt({rosterId, classId, profileId, correctness: 'correct'|'incorrect', objectiveId, exerciseType, difficulty})`.

**Game 2 — BoardListenTap (rewrite `BoardListenTap.tsx`):**
- Implement the 3 round types (`LISTEN_SELECT`, `MINIMAL_PAIR_SWIPE`, `DICTATION`) per spec §1.
- Wire `useEscalatingPool({ shellType: 'LISTEN_TAP', ... })`.
- Make streaks meaningful (spec §2 — streak escalates the rung, capped by mastery).
- Implement the standard single-item lifecycle (`mistakesRef`, `awardedRef`).
- Register `LISTEN_TAP_CONTROLS` + wire into the two control files.
- Broadcast `SLIDE_COMPLETE`.
- DICTATION round: typed input on the Remote-Baton only (never the projector); Levenshtein scoring; per-round choral/picked toggle (owner decision 4).
- Empty-pool state.
- Dual-write (`addPoints` + `recordAttempt`) on every scored event.

### Acceptance (must pass before handoff)
- `npx tsc --noEmit` adds zero non-function errors (baseline is 101 Deno errors — your changes must not add any).
- `npx vitest run` adds zero new test failures (baseline is 19 pre-existing failures in BoardComponents/DataService — your changes must not add any).
- Both games: variety (3 payload types across rounds), mastery-gated escalation, full lifecycle, dual-write, no dead control bars, empty-pool graceful.
- The FLASH_MATCH + LISTEN_TAP entries in `ContextualControls.tsx` and `TeacherRemote.tsx` actually work (the teacher sees real controls, not "Presenter Mode Active").

### When done
Report: files changed, any spec ambiguities encountered (with how you resolved them), and any new field-name discoveries (verify against `types/exercise.ts` — the specs were checked once but re-verify any you're unsure of).

---

## ═══════ QODER AGENT B — WhatsMissing (+MagicEyes) + Unscramble/StorySequencing ═══════

You are implementing four games (2 files; WhatsMissing absorbs MagicEyes) in the Professor teacher app — a teacher-facing ESL tool for live classroom English instruction (ages 6–12, China market). The architecture, audit, and your game specs are in `docs/audit/`. **Read these files in this exact order before touching code:**
1. `docs/audit/GAMES_AUDIT.md` — §E (lifecycle), §F (scoring), §G (current games), §H4 (un-scored games critique).
2. `docs/audit/professor-live-architecture-design.md` — §1, §2, §3, §4, §6.2 (the MagicEyes→WhatsMissing consolidation decision).
3. `docs/audit/whatsmissing-v2-spec.md` — YOUR spec for game 1 (absorbs MagicEyes).
4. `docs/audit/unscramble-storysequencing-v2-spec.md` — YOUR spec for games 2 & 3 (one file, two parts A/B).
5. `apps/board/lessonDirector.ts`, `apps/board/useEscalatingPool.ts`, `apps/board/templates/scoringDefaults.ts`, `services/attemptsLog.ts` — the Phase 1 engine you build against.

### Files you OWN (only you may edit these — Agent A will not touch them)
- `apps/board/templates/BoardWhatsMissing.tsx` — rewrite per `whatsmissing-v2-spec.md` (absorbs MagicEyes as a `mode: 'magic_eyes'` flag)
- `apps/board/templates/BoardMagicEyes.tsx` — DELETE this file (consolidated into WhatsMissing; also remove its imports + render entries in `apps/board/ClassroomBoard.tsx:135` region and `apps/teacher/live/panels/BoardRenderer.tsx`, and `MAGIC_EYES` from render switches — BUT keep `MAGIC_EYES` in `SUPPORTED_FLOW_TYPES` for now, route it to `BoardWhatsMissing` with `mode='magic_eyes'`)
- `apps/board/templates/BoardUnscramble.tsx` — rewrite per spec Part A (`unscramble-storysequencing-v2-spec.md` §A)
- `apps/board/templates/BoardStorySequencing.tsx` — rewrite per spec Part B (§B)

### Files you MAY READ but MUST NOT edit
- Everything else — especially `lessonDirector.ts`, `useEscalatingPool.ts`, `scoringDefaults.ts`, `SessionContext.tsx`, `BoardFlashMatch.tsx`, `BoardListenTap.tsx`, `ContextualControls.tsx`, `TeacherRemote.tsx` (Agent A's territory).

### Tasks
**Game 1 — BoardWhatsMissing (rewrite `BoardWhatsMissing.tsx`, absorb MagicEyes):**
- Implement the `mode: 'whats_missing' | 'magic_eyes'` flag (spec §1).
- Implement recognize + produce interaction modes (spec §2 — the audit's "student never inputs" critique this fixes).
- Wire `useEscalatingPool({ shellType: 'WHATS_MISSING', ... })`.
- Bring it into the lifecycle (currently UNSCORED — spec §3). Use `effectiveDifficulty` (produce mode overrides to 2).
- Register `WHATS_MISSING_CONTROLS` `ContextualControlsSpec` + add to `ContextualControls.tsx` and `TeacherRemote.tsx`.
- Route `MAGIC_EYES` render entries to `BoardWhatsMissing` with `mode='magic_eyes'` (don't break existing flows that emit `MAGIC_EYES`).
- Dual-write (`addPoints` + `recordAttempt`).

**Game 2 — BoardUnscramble (rewrite `BoardUnscramble.tsx`, spec Part A):**
- Implement LCS partial credit (spec §A1 — `computeLCSPartialCredit`, `detectSwappedPair`, `highlightFirstWrongPosition`).
- Implement the 2 round types (`WORD_BANK_BUILD`, `TRANSFORM`) per spec §A2. **CRITICAL:** the spec was corrected for the TRANSFORM-as-MCQ mismatch — use "path b" (the correct option's text becomes the tile target, `prompt_sentence` as reference). Field names in the spec are verified against `types/exercise.ts`.
- Wire `useEscalatingPool({ shellType: 'UNSCRAMBLE', ... })`.
- Lifecycle + scoring with partial credit (spec §A3).
- Controls + `SLIDE_COMPLETE` (spec §A4).
- Dual-write with `correctness: 'correct'|'partial'|'incorrect'`.

**Game 3 — BoardStorySequencing (rewrite `BoardStorySequencing.tsx`, spec Part B):**
- **Fix the literal-string objective bug** (spec §B1): replace the `'story_sequencing'` literal with the real `story.objective_id`.
- Keep round 1 (panel sequencing from manifest — not pool-driven, spec §B0).
- Add round 2: `STORY_COMPREHENSION` MCQs from the pool (spec §B2 — these pool items exist but no board game consumes them yet).
- Wire `useEscalatingPool({ shellType: 'STORY_SEQUENCING', ... })` for round 2 only.
- Lifecycle + scoring.
- Dual-write.

### Special care: the MagicEyes absorption
- `BoardMagicEyes.tsx` is currently referenced in `apps/board/ClassroomBoard.tsx`, `apps/teacher/live/panels/BoardRenderer.tsx`, and `apps/teacher/UnitPreviewModal.tsx`. After absorbing into WhatsMissing:
  - Update the two render switches (`ClassroomBoard.tsx`, `BoardRenderer.tsx`) so `MAGIC_EYES` renders `<BoardWhatsMissing data={{...data, mode: 'magic_eyes'}} />`.
  - DELETE `BoardMagicEyes.tsx`.
  - Leave `MAGIC_EYES` in `SUPPORTED_FLOW_TYPES` (existing flows emit it; we just route it differently).

### Acceptance (must pass before handoff)
- `npx tsc --noEmit` adds zero non-function errors.
- `npx vitest run` adds zero new test failures.
- WhatsMissing: both modes work, scores, dual-writes. MagicEyes file deleted, render path consolidated.
- Unscramble: LCS partial credit works, TRANSFORM path-b renders correctly, dual-write with partial correctness.
- StorySequencing: real objective_id, STORY_COMPREHENSION round 2 consumes the previously-unused pool items.
- All three: no dead control bars, empty-pool graceful, full lifecycle.

### When done
Report: files changed, any spec ambiguities + resolutions, any new field-name discoveries (re-verify against `types/exercise.ts`).

---

## Coordinator notes (me, after both agents report)

I'll:
1. Re-run `tsc --noEmit` + `vitest run` on the combined result.
2. Re-verify any field names the agents flagged.
3. Spot-check the dual-write (`addPoints` + `recordAttempt`) is wired in every scored branch.
4. Apply the DB migration (`20260806000001`) if not yet applied.
5. Sanity-check the escalation actually pulls varied content (not just one type) — requires the pool to be populated (the production bug; verify in dev).

The two agents never touch overlapping files. Partition is strict: A owns the vocab pair + their control wiring; B owns the memory/assembly pair + the MagicEyes consolidation. Both depend only on the Phase 1 engine (shipped, read-only to them).
