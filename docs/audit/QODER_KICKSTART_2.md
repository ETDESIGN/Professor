# Qoder Kickstart Prompts — Batch 2 (SpeedQuiz/TeamBattle + StoryStage/DialogueStage)

> **Status.** Batch 1 (FlashMatch/ListenTap/WhatsMissing/Unscramble/StorySequencing) shipped and integrated. These are the next 4 games. Specs are field-name-verified. Phase 1 engine + 5 redesigned games are live in production.
>
> **Engine available (unchanged from Batch 1, read-only to both agents):**
> - `apps/board/lessonDirector.ts` — `SHELL_CAPABILITIES`, `PHASE_ENVELOPE`, `nextRungForObjective`, `buildRound`, `ContextualControlsSpec`, `exerciseTypesForRung`.
> - `apps/board/useEscalatingPool.ts` — `useEscalatingPool({unitId, shellType, phase, roster, roundIndex, totalRounds, roundSize})`.
> - `apps/board/templates/scoringDefaults.ts` — `scoreForAttempt(mistakes, difficulty, partialCreditRatio)`, `MISTAKE_PENALTY`, `CLEAN_SCORE_BASE`, `DIFFICULTY_MULTIPLIER`, `Difficulty`.
> - `services/attemptsLog.ts` — `recordAttempt({rosterId, classId, profileId, correctness, objectiveId, exerciseType, difficulty})`, `AttemptCorrectness`.
> - `store/SessionContext.tsx` — `pushToRemediation`, `getRemediationQueue`, `drainRemediation`. `addPoints(studentId, amount)` unchanged.
>
> **Lifecycle contract (non-negotiable, all 4 must-dos):** (1) reset on `state.currentTurnId` change; (2) track mistakes with `useRef` + an `awardedRef` latch (or per-item adaptation like FlashMatch); (3) score via `addPoints` + `scoreForAttempt`; (4) personalize via `usePickedStudent()`.
>
> **Dual-write on every scored event:** `addPoints(id, delta)` for the leaderboard AND `recordAttempt({rosterId, classId, profileId, correctness, objectiveId, exerciseType, difficulty})` for analytics. Separate paths, separate concerns.
>
> **Cross-game helpers you MAY import:** `computeLCSPartialCredit`, `detectSwappedPair`, `highlightFirstWrongPosition`, `UNSCRAMBLE_PASS_THRESHOLD` from `apps/board/templates/BoardUnscramble.tsx` (Batch 1 placed them there — see FOLLOWUPS.md F2; will move to a shared util later, use them where they are for now).
>
> **Field names in specs are VERIFIED.** Every content shape was checked against `types/exercise.ts`. Use them verbatim — don't reinvent. If a spec references a field you can't find, STOP and check `types/exercise.ts` before guessing.

---

## ═══════ QODER AGENT C — BoardSpeedQuiz + BoardTeamBattle (assessment) ═══════

You are implementing two assessment games in the Professor teacher app — a teacher-facing ESL tool for live classroom English instruction (ages 6–12, China market). **Read these files in this exact order before touching code:**
1. `docs/audit/GAMES_AUDIT.md` — §E (lifecycle), §F (scoring), §G (current SpeedQuiz/TeamBattle).
2. `docs/audit/professor-live-architecture-design.md` — §1 (ladders), §2 (escalation), §3 (scoring), §4 (controls).
3. `docs/audit/speedquiz-teambattle-v2-spec.md` — YOUR spec. **Read the correction note at the top about `question.correctAnswer` being a derived field** — you MUST build a `correctAnswerFor(item: PoolItem): string` helper that switches on `exercise_type`. The `LISTEN_SELECT` case returns an image URL, not text — handle that.
4. The Phase 1 engine files listed above.
5. `apps/board/templates/BoardSpeedQuiz.tsx` + `apps/board/templates/BoardTeamBattle.tsx` — what you're rewriting.

### Files you OWN (only you may edit these)
- `apps/board/templates/BoardSpeedQuiz.tsx` — rewrite per spec Part B
- `apps/board/templates/BoardTeamBattle.tsx` — rewrite per spec Part C (note: TeamBattle was partially migrated in Phase 1f — `scoreForAttempt` is already imported and used at line ~158; finish the job per the spec's dual-ledger model)

### Files you MAY READ but MUST NOT edit
- Everything else. Especially the Phase 1 engine, the Batch-1 games (FlashMatch/ListenTap/WhatsMissing/Unscramble/StorySequencing), and `ContextualControls.tsx`/`TeacherRemote.tsx` (Agent D owns those this batch — see collision note below).

### Tasks
**Shared (Part A — implement as a helper module or inline in both):**
- `buildQuizComposition(lessonObjectives, totalQuestions, roster)` — proportional-to-type-distribution + mastery-weighted within type (spec A1).
- `buildQuestionForObjective(objective, roster)` — the vocab type-cycling rule (spec A2): map rung → exercise type via the `vocabTypeForRung` map. Non-vocab types are fixed (grammar→ERROR_SPOT, story→STORY_COMPREHENSION).
- `correctAnswerFor(item: PoolItem): string` — **critical** (the spec's flagged footgun). Switch on `exercise_type`:
  - `MEANING_MATCH`/`ERROR_SPOT`/`SPELL_CLOZE`/`STORY_COMPREHENSION` → `item.content.options[item.content.correct_index]`
  - `LISTEN_SELECT` → `item.content.options[item.content.correct_index].image_url` (image URL!)
  - `WORD_BANK_BUILD` → no `correctAnswer` (handled via LCS, separately)
- The WORD_BANK_BUILD rendering inside the quiz — reuse `computeLCSPartialCredit` from `BoardUnscramble.tsx`. On timeout mid-assembly, score whatever was placed (spec A3).

**SpeedQuiz (Part B):**
- One-shot per question (`awardedRef` per turn, no retry loop — spec B1).
- The `SPEED_QUIZ_CONTROLS` spec (B2).
- `SLIDE_COMPLETE` after last question resolves.
- Dual-write on every answer + timeout.

**TeamBattle (Part C):**
- Dual-ledger: team aggregate (drives tic-tac-toe win) + individual `addPoints`/`recordAttempt`/`gradeObjective` (spec C1).
- WORD_BANK_BUILD cells become Race Cells (both teams' reps assemble simultaneously, higher LCS ratio wins) — spec C2.
- `TEAM_BATTLE_CONTROLS` (C3).
- `SLIDE_COMPLETE` on tic-tac-toe win / draw / forced end.
- **Stealing doesn't claw back the previous owner's points** (spec C1 — important fairness rule).

**Assessment → learning handoff (Part D):**
- Misses push to `pushToRemediation` with `missedAtDifficulty` (spec D1 proposes an extension to `RemediationEntry` — but the current `RemediationEntry` shape in `SessionContext.tsx` doesn't have that field yet. **Decision:** either extend the type in `SessionContext.tsx` (you own that file? check the partition) OR put difficulty in the existing structure as metadata. Simplest: leave the existing `pushToRemediation(objectiveId, studentId)` call as-is — the difficulty info is already captured in `point_transactions.metadata.difficulty` via `recordAttempt`. Don't extend the type unless you confirm you own `SessionContext.tsx`.)

### Collision note (important)
Agent D also needs to edit `ContextualControls.tsx` and `TeacherRemote.tsx` for STORY_STAGE/DIALOGUE_STAGE cases. **You do NOT need those files** — SpeedQuiz and TeamBattle already have working control bars (they're not on the dead-bar list). Keep your edits to your two game files only. If you find you need a control-bar change, flag it to the coordinator rather than editing the shared files.

### Acceptance (must pass before handoff)
- `npx tsc --noEmit` adds zero non-Deno errors (baseline ~101 Deno errors).
- `npx vitest run` adds zero new failures (baseline 19 pre-existing in BoardComponents/DataService).
- Both games: question-type variety (not just MEANING_MATCH), unified scoring, dual-write, assessment feeds remediationQueue.
- `correctAnswerFor` handles the LISTEN_SELECT image-URL case correctly.
- TeamBattle: dual-ledger, no retroactive point clawback on steal.

### When done
Report: files changed, any spec ambiguities + resolutions, confirmation that `correctAnswerFor` handles all 6 types, any field-name discoveries.

---

## ═══════ QODER AGENT D — BoardStoryStage + BoardDialogueStage (narrative output) ═══════

You are implementing two narrative-output games in the Professor teacher app — a teacher-facing ESL tool for live classroom English instruction (ages 6–12, China market). **Read these files in this exact order before touching code:**
1. `docs/audit/GAMES_AUDIT.md` — §E (lifecycle), §G (current StoryStage/DialogueStage).
2. `docs/audit/professor-live-architecture-design.md` — §1, §2, §3, §4.
3. `docs/audit/storystage-dialoguestage-v2-spec.md` — YOUR spec. **Read the correction note at the top carefully** — all three pool content shapes were invented by the spec author and have been corrected. The corrected shapes are in the code blocks below the correction note. Use THOSE, not any lingering references to `correctAnswer`/`correctCharacter`/`characters`.
4. The Phase 1 engine files.
5. `apps/board/templates/BoardStoryStage.tsx` + `apps/board/templates/BoardDialogueStage.tsx` — what you're rewriting.

### Files you OWN (only you may edit these)
- `apps/board/templates/BoardStoryStage.tsx` — rewrite per spec §1 (scored comprehension closer)
- `apps/board/templates/BoardDialogueStage.tsx` — rewrite per spec §2 (role assignment + teacher-judged role-read + WHO_SAID_IT)
- `apps/teacher/live/panels/ContextualControls.tsx` — add STORY_STAGE + DIALOGUE_STAGE cases
- `apps/remote/TeacherRemote.tsx` — add STORY_STAGE + DIALOGUE_STAGE cases (incl. the "Rate Role: ✓ / ~ / ✗" control for DialogueStage's role-read stage)

### Files you MAY READ but MUST NOT edit
- Everything else. Especially the Phase 1 engine, Batch-1 games, Agent C's SpeedQuiz/TeamBattle files.

### Tasks
**StoryStage (§1):**
- Keep the existing storybook read-through (it works).
- Add the scored comprehension closer: pull `STORY_COMPREHENSION` items, present sequentially as MCQs, picked-student-answered via teacher relay.
- **Use the corrected shape:** `{ prompt, options: string[], correct_index, story_page_id? }`. Index-based comparison (`submittedIndex === item.content.correct_index`), NOT string equality to an invented `correctAnswer`.
- Coordinate with StorySequencing over the shared item pool (spec §1's session-scoped `askedComprehensionItems` Map).
- Standard lifecycle, dual-write, `SLIDE_COMPLETE` after last comprehension question.
- Empty-state: if no remaining STORY_COMPREHENSION items, end after the read-through (a story read without a check is still complete).

**DialogueStage (§2):**
- Three stages: read-along (existing, unscored, surface `lines[].translation` for bilingual) → role assignment + role-read (new, scored via teacher 3-way rating) → WHO_SAID_IT comprehension (new, scored MCQ).
- **Use the corrected shapes:**
  - `DialogueRoleplayContent = { lines: { speaker: string, text: string, translation?: string }[], dialogue_index: number }` — NO top-level `characters` array. Derive via `[...new Set(lines.map(l => l.speaker))]`.
  - `WhoSaidItContent = { line_text, options: string[], correct_index, context_before?, context_after? }` — index-based comparison. Optionally surface `context_before`/`context_after` in the question UI.
- Role assignment: reuse existing pick machinery (`selectNextStudent` / `magicSelectStudent`), one pick per character, same-dialogue exclusion (spec §2.1).
- Role-read scoring: **teacher 3-way rating** (correct/partial/incorrect → ratio 1.0/0.6/0). Per-character `awardedByCharacterRef` (Set, reset on currentTurnId) — multi-character-per-turn adaptation like FlashMatch's per-pair pattern.
- Choral/picked toggle (decision 4): choral mode skips role assignment + rating entirely, goes straight from read-along to comprehension.
- The "Rate Role: ✓ / ~ / ✗" Baton control — one instance per active character during the role-read stage.
- **No pronunciation, no STT, anywhere.** Both scoring paths (binary MCQ + 3-way rating) are teacher-judged. Confirm decision 2 (pronunciation deferral) is respected.

**Shared 3-way rating refactor opportunity (spec §2.2):**
- This is the 3rd recurrence of the 3-way rating (DICTATION in ListenTap, grammar rung-4, now dialogue role-read). The spec suggests extracting it to a shared component. **Optional** — if you do it, create `apps/board/TeacherRatingControl.tsx` (you own that new file). If not, hand-written is fine for now (flag it as a follow-up). Don't let it block delivery.

### Collision note (important)
Agent C does NOT need `ContextualControls.tsx`/`TeacherRemote.tsx` this batch (SpeedQuiz/TeamBattle already have working control bars). You own both shared files exclusively this batch. Add your STORY_STAGE + DIALOGUE_STAGE cases without worrying about clobbering Agent C.

### Registration note
- `DIALOGUE_STAGE` is already in `SUPPORTED_FLOW_TYPES` and `BoardRenderer.tsx`'s BOARD_MAP (Phase 0 added it). Verify `ClassroomBoard.tsx` renders it (it does — line 137). The spec's §4 registration note is already satisfied; just confirm during implementation.
- `STORY_STAGE` was already registered everywhere — no action needed.

### Acceptance (must pass before handoff)
- `npx tsc --noEmit` adds zero non-Deno errors.
- `npx vitest run` adds zero new failures.
- StoryStage: scored comprehension, real `correct_index` comparison, coordination with StorySequencing.
- DialogueStage: role assignment (derived characters, not invented field), 3-way rating, choral/picked toggle, WHO_SAID_IT with index comparison, bilingual read-along.
- Both: dual-write, no STT/pronunciation, full lifecycle.
- Control bars work on Commander + Baton (including the Rate Role buttons).

### When done
Report: files changed, any spec ambiguities + resolutions, confirmation that the 3 corrected content shapes were used (not the invented ones), any field-name discoveries.

---

## Coordinator notes (me, after both agents report)

1. Re-run `tsc --noEmit` + `vitest run` on the combined result (Batch 1 + Batch 2 + Phase 1).
2. Verify no collision on `ContextualControls.tsx`/`TeacherRemote.tsx` (Agent D owns them exclusively this batch; Agent C shouldn't touch them — confirm).
3. Spot-check: SpeedQuiz actually varies question types (not just MEANING_MATCH); TeamBattle's dual-ledger works; StoryStage's comprehension uses `correct_index`; DialogueStage derives characters from `lines[].speaker`.
4. Verify dual-write in every scored branch across all 4 new games.
5. Deploy to Vercel (frontend only — no edge function changes this batch).

Partition is strict: Agent C owns SpeedQuiz + TeamBattle (no shared-file edits). Agent D owns StoryStage + DialogueStage + the two shared control files. No overlap.
