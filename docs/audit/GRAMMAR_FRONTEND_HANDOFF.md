# Grammar Frontend Handoff — Sandbox v2 + BoardGrammarForge

> Created 2026-08-06 as the entry point for the next session. The grammar strand's backend + data path are DONE and DEPLOYED. This doc covers only what remains: the two frontend components + registration + deploy.

## What's DONE (verified, deployed, don't redo)

**Backend (deployed to Supabase):**
- ✅ `enrich-unit` grammar prompt bumped — few-shot example now shows 3 pairs (was 1) + prose asks for 4–6. **Verified working:** new units produce 5 pairs with varied transformation types.
- ✅ `generate-exercises` `buildGrammarItems` — Option A reservation logic added. Reserves the last-indexed `transformation_pair` per rule (if ≥3 pairs); reserved pair is excluded from both TRANSFORM item construction AND the distractor pool, so rung 4's answer can't leak early. If <3 pairs, no reservation — that objective skips rung 4 this session. **Deployed.**

**Data path (client, verified compiles):**
- ✅ `getGrammar(manifest)` added to `services/manifest.ts` — mirrors `getVocabulary`/`getStory`/`getDialogues`. Prefers `_relational.grammar_rules` (attached by the activeUnit loader via `get_unit_bundle`, which DOES include `grammar_rules` ordered by `order_index`), falls back to manifest cache. Returns `CanonicalGrammar[]` with `{ rule, explanation, examples, pattern_template, transformation_pairs, error_examples }` — all the fields Sandbox v2 + Forge rung 4 need.

**Specs (verified + corrected):**
- ✅ `docs/audit/grammar-strand-v2-spec.md` — field-name clean (Claude self-corrected after the Prompt 5 fix). Read §2 (the three rungs, corrected normalizer), §4 (Option A mechanism — note the "last index reserved" convention MUST match between the deployed builder and the client-side rung-4 loader), §6 (registration: `SHELL_CAPABILITIES.BOARD_GRAMMAR_FORGE = { consumes: ['ERROR_SPOT', 'TRANSFORM'], rungRange: [2, 3] }` — rung 4 NOT in declaration, it's a hybrid shell like StorySequencing).

## What REMAINS (next session)

### 1. `BoardGrammarSandbox` v2 — rewrite `apps/board/templates/BoardGrammarSandbox.tsx`
- INPUT phase, NO scoring. Reads `getGrammar(state.activeUnit.manifest)` directly.
- Three card types (spec §1):
  - **Card 1 — pattern skeleton:** `rule` + `pattern_template` rendered as a visual slot skeleton (e.g. "Subject + ___ + Object" as tiles), not prose.
  - **Cards 2…N — transform demo:** step through `transformation_pairs[0..2]` (cap 3). Show `original`, then on teacher tap reveal `transformed` with changed tokens highlighted (`diffTokens`).
  - **Final card — error teaser:** `error_examples[0]` shown as an unanswered "spot what's wrong?" teaser. **Must use index `[0]` specifically** — that's the same entry `buildGrammarItems` uses for the first ERROR_SPOT pool item, so Forge rung 2's first question is the same sentence (the "rule, then rule in action" coordination).
- Teacher-paced (nav dots, prev/next). Existing `NEXT_PANEL`/`PREV_PANEL`/`FLIP_CARD` remote handlers already work — reuse.
- Empty-state: no grammar rules → existing "No grammar rules available" message.

### 2. `BoardGrammarForge` — NEW file `apps/board/templates/BoardGrammarForge.tsx`
- The flagship game. Three escalating rungs (spec §2):
  - **Rung 2 — ERROR_SPOT (difficulty 1–2):** via `useEscalatingPool({ shellType: 'GRAMMAR_PRACTICE', phase: 'PRACTICE', ... })` (note: the shell type in SHELL_CAPABILITIES is currently `GRAMMAR_PRACTICE` — Agent D's edit added STORY_STAGE/DIALOGUE_STAGE but not the FORGE rename; either reuse `GRAMMAR_PRACTICE` capability or rename to `BOARD_GRAMMAR_FORGE` consistently). Teacher relays the class's oral pick. Binary MCQ scoring.
  - **Rung 3 — TRANSFORM (difficulty 2, path b):** the pool item is an MCQ; per the spec, take `options[correct_index]` text and split IT into tiles for assembly, `prompt_sentence` as the reference line. Reuse `computeLCSPartialCredit`/`detectSwappedPair` from `BoardUnscramble.tsx`. LCS partial credit.
  - **Rung 4 — PRODUCE (difficulty 3):** reads `grammar_rules` DIRECTLY (not the pool). Load the reserved pair via the **same "last index reserved" convention** as the deployed builder: `const reserved = rule.transformation_pairs[rule.transformation_pairs.length - 1]`. Show `reserved.original`, ask student to produce `reserved.transformed`. **Teacher 3-way rating** (correct/partial/incorrect → ratio 1.0/0.6/0). `gradeObjective(student, unitId, objectiveId, correct, 'productive')`. Choral/picked toggle (decision 4): choral = no score.
- Standard 4 lifecycle must-dos (reset on `currentTurnId`, mistakes/awarded refs, scoreForAttempt + addPoints + recordAttempt, usePickedStudent).
- Dispatcher: 2 ERROR_SPOT rounds, 2 TRANSFORM rounds, 1 PRODUCE round (spec §7). Skip rung 4 if `transformation_pairs.length < 3`.
- Controls: `GRAMMAR_FORGE_CONTROLS` (skip/revealHint/forceCorrect/nextRound/endSlide) + the choral/picked toggle for rung 4 + the 3-way rating buttons.
- Consider extracting the 3-way rating control to a shared `apps/board/TeacherRatingControl.tsx` (it's now the 3rd recurrence: DICTATION, grammar rung-4, dialogue role-read) — optional, per FOLLOWUPS.md.

### 3. Registration
- **Alias `GRAMMAR_PRACTICE` → `BoardGrammarForge`** (like `SCRAMBLE`→`UNSCRAMBLE`, `SPEAKING`→`ISayYouSay`). Existing flows emit `GRAMMAR_PRACTICE`; don't break them. Add to:
  - `apps/board/ClassroomBoard.tsx` render switch: `{currentStep.type === 'GRAMMAR_PRACTICE' && <BoardGrammarForge data={currentStep.data} />}`
  - `apps/teacher/live/panels/BoardRenderer.tsx` BOARD_MAP: `GRAMMAR_PRACTICE: BoardGrammarForge`
  - `apps/teacher/live/panels/ContextualControls.tsx`: add `GRAMMAR_PRACTICE` case
  - `apps/remote/TeacherRemote.tsx`: add `GRAMMAR_PRACTICE` case (incl. Rate buttons for rung 4)
- Optionally also add a `BOARD_GRAMMAR_FORGE` flow type as an alias (mirrors the SCRAMBLE/UNSCRAMBLE pattern). `SUPPORTED_FLOW_TYPES` already has `GRAMMAR_PRACTICE` — no change needed there.
- **Update `SHELL_CAPABILITIES`** in `apps/board/lessonDirector.ts`: either keep the `GRAMMAR_PRACTICE` entry (already correct: `{ consumes: ['ERROR_SPOT', 'TRANSFORM'], rungRange: [2, 4] }`) or rename to `BOARD_GRAMMAR_FORGE` consistently. Pick one and use it everywhere. The rungRange should be `[2, 3]` per the spec correction (rung 4 isn't pool-driven).

### 4. Deploy + verify
- `npx tsc --noEmit` — 0 non-Deno errors.
- `npx vitest run` — no new failures.
- `vercel --prod` — frontend deploy.
- (Backend already deployed this session: `generate-exercises` + `enrich-unit`.)

## Critical coordination note (the #1 thing to get right)

The **"last index reserved" convention** must match EXACTLY between:
- The deployed `buildGrammarItems` (reserves `pairs[pairs.length - 1]`)
- The client-side rung-4 loader in BoardGrammarForge (reads `rule.transformation_pairs[rule.transformation_pairs.length - 1]`)

If they disagree, rung 4 will show the wrong prompt (one that was actually built into a pool item and already seen at rung 3). Both sides use `pairs.length - 1`. Verify this when implementing Forge.

## Files involved (next session)

**Created:**
- `apps/board/templates/BoardGrammarForge.tsx` (new)
- Optionally `apps/board/TeacherRatingControl.tsx` (shared 3-way rating, optional)

**Rewritten:**
- `apps/board/templates/BoardGrammarSandbox.tsx`

**Edited (registration):**
- `apps/board/ClassroomBoard.tsx` (render switch)
- `apps/teacher/live/panels/BoardRenderer.tsx` (BOARD_MAP)
- `apps/teacher/live/panels/ContextualControls.tsx` (GRAMMAR_PRACTICE case)
- `apps/remote/TeacherRemote.tsx` (GRAMMAR_PRACTICE case)
- `apps/board/lessonDirector.ts` (rungRange fix to [2,3], optional rename)

**Already done (don't touch):**
- `supabase/functions/generate-exercises/index.ts` (Option A — deployed)
- `supabase/functions/enrich-unit/index.ts` (prompt bump — deployed)
- `services/manifest.ts` (getGrammar — added)

— *End of handoff. Entry point for next session.*
