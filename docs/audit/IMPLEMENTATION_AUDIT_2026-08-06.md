# Implementation Audit — Game/Exercise System Redesign
**Date:** 2026-08-06 · **Scope:** all work landed in the recent redesign rounds (engine, services, 14 board templates, 2 edge functions, 1 migration, SessionContext)

This is a code-level audit of what was *implemented*, not what was *designed*. Findings are graded **🔴 Critical** (silent scoring failure / contract violation), **🟡 Moderate** (analytics gap / inconsistency), **🟢 Minor** (dead code / cosmetic), **✅ Verified sound**.

---

## Executive summary

The redesign is structurally sound. The architecture's load-bearing pieces — the mastery-gated escalation engine (`lessonDirector`), the dual-write scoring model, the FSRS integration, the grammar strand's hybrid shell — are all correct and internally consistent. The recurring failure mode from earlier rounds (**invented field names**) is completely resolved: **0 mismatches** across all 10 audited games.

Two real bugs surfaced, both in games that were *not* rewritten in this redesign round (SpeedQuiz + TeamBattle inherited pre-existing lifecycle gaps that the new contract exposes). A handful of analytics-write gaps remain in the grammar strand. Everything else is consistent.

| Severity | Count | Headline |
|---|---|---|
| 🔴 Critical | 2 | SpeedQuiz scores only Q1 per turn; TeamBattle missing lifecycle refs |
| 🟡 Moderate | 4 | GrammarForge analytics gap on wrong attempts; 3 FSRS-write gaps on override paths |
| 🟢 Minor | 4 | Dead `showAlreadyScored` no-op; inconsistent picked-student source; legacy GrammarPractice drift; migration mtime oddity |
| ✅ Sound | — | Engine, scoring math, field names, grammar generation/reservation, type contract, endSession cleanup |

---

## §A — The engine (lessonDirector + useEscalatingPool)

**Verdict: ✅ Sound.** The core is pure, well-documented, and internally consistent.

### What it does right
- **`nextRungForObjective`** correctly maps FSRS `mastery_state` → rung, with the ladder-ceiling clamp (`LADDER_CEILING`) that prevents a `mastered` grammar objective from computing a nonexistent rung-5. The `decaying → 3` (not 1) mapping is pedagogically correct — doesn't re-punish a forgetting item.
- **`buildRound`** correctly computes `targetRung = min(roundBaseline, masteryRung)` — mastery caps ambition, round number is only a ceiling. Weakest-first ordering works.
- **`SHELL_CAPABILITIES`** + the build-time lint (L348-360) catch typos in exercise-type references at startup in dev. GRAMMAR_PRACTICE `rungRange` was corrected to `[2,3]`.
- **`PHASE_ENVELOPE`** + `warnIfOutsideEnvelope` give phases behavioral meaning (a WARMUP slide can't accidentally run rung-5 production).

### One subtle thing worth knowing
`useEscalatingPool` aggregates per-objective mastery across the roster by taking the **worst** (lowest-rung) student (L112-118). This is correct for "don't escalate past what the weakest student can handle," but it means **one struggling student anchors the whole class's escalation**. If that student is absent next lesson but still in the roster, the class stays suppressed. Not a bug — a design choice — but worth flagging if teachers report "the games never get harder."

---

## §B — The scoring model (scoringDefaults.ts)

**Verdict: ✅ Sound.** The math is correct and the comment examples check out.

```
scoreForAttempt(mistakes, difficulty, partialCreditRatio)
  = round( max(0, 30 × DIFFICULTY_MULTIPLIER[difficulty] − mistakes × 5) × partialCreditRatio )
```

- `DIFFICULTY_MULTIPLIER {1:1.0, 2:1.4, 3:2.0}` — receptive/constrained/free-production. Matches `pool_items.difficulty` semantics.
- The two worked examples in the header comment (2-mistake clean at diff 1 = +20; 1-mistake partial 0.7 at diff 2 = +21) are arithmetically correct.
- Legacy `pointsForCorrect` / `CORRECT_ANSWER_POINTS` map fully retired; TeamBattle (its last caller) migrated.

**No issues.**

---

## §C — The dual-write analytics path (attemptsLog.ts + boardLearner.ts)

**Verdict: ✅ Sound design; a few call-site gaps (see §E).**

The separation is correct and well-justified: `addPoints` debounces (1500ms) so it can't carry per-attempt correctness; `recordAttempt` writes a separate `amount=0, source='attempt'` row for every attempt. Class Accuracy = correct ÷ total reads honestly.

`gradeObjective` / `gradeStudent` (FSRS Tier 1) and `recordExposure` (Tier 2) / `recordChoralReview` (Tier 3) are all correctly scoped:
- Tier 2/3 never downgrade mastery (presentation/choral can only promote or leave unchanged) ✓
- `recordExposure` uses `ignoreDuplicates: true` for race safety ✓
- `assertTeacherMayGrade` verifies unit ownership + roster membership before any FSRS write ✓

---

## §D — Field-name verification (the recurring failure mode)

**Verdict: ✅ Fully resolved. 0 mismatches across all 10 audited games.**

This was the dominant bug source in earlier rounds (specs invented `.word`/`.meaning`/`.correctImageUrl` that don't exist). Every content-read site now matches the canonical `types/exercise.ts` contract. Several files carry an explicit "field names verified 2026-08-05" comment and the code honors it.

The single non-canonical access — `BoardDialogueStage.tsx:486` reads `(currentLine as any).audio` — is a defensive fallback for legacy manifest line data (the canonical `DialogueRoleplayContent.lines[]` has no `audio` field), cast `as any`, degrades to TTS. Not a mismatch in the failure mode being audited.

---

## §E — Per-game lifecycle contract compliance

The 4 must-dos: (1) reset on `currentTurnId`, (2) mistake ref, (3) award latch, (4) `addPoints` + `recordAttempt` dual-write.

| Game | turnId reset | mistake ref | award latch | dual-write | FSRS | Issues |
|---|---|---|---|---|---|---|
| FlashMatch | ✅ | ✅ Set | ✅ Set | ✅ | — | Sound |
| Unscramble | ✅ | ✅ | ✅ | ✅ | ✅ | Sound |
| WhatsMissing | ✅ | ✅ | ✅ | ✅ | ✅ (via `gradeStudent`) | Uses `gradeStudent` not `gradeObjective` — divergence, likely intentional |
| **SpeedQuiz** | ✅ | ✅ | ✅ | ✅ | ✅ | **🔴 Only Q1 scores per turn** |
| **TeamBattle** | ❌ | ❌ | ❌ (uses state) | ✅ | ✅ | **🔴 3 of 4 must-dos missing** |
| StoryStage | ✅ | ✅ | ✅ | ✅ | — | Sound |
| StorySequencing | ✅ | ✅ | ✅ | ✅ | ✅ | Sound |
| DialogueStage | ✅ | ✅ | ✅ + per-character | ✅ | 🟡 partial | FSRS only on role-read, not WHO_SAID_IT |
| GrammarForge | ✅ | ✅ | ✅ | 🟡 partial | ✅ | **🟡 No `recordAttempt` on wrong attempts** |
| GrammarPractice (legacy) | ✅ | ✅ | ✅ | 🟡 | ✅ | **🟡 No `recordAttempt` at all** |
| ISayYouSay | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 MARK_CORRECT omits `gradeObjective` |
| ListenTap | ✅ | ✅ | ✅ | ✅ | — | Sound |
| FocusCards | N/A (presentation) | N/A | N/A | recordExposure only | N/A | Exempt by design |
| MediaPlayer | N/A (passive) | N/A | N/A | none | N/A | Exempt by design |

---

## §F — Critical bugs (🔴)

### F1. SpeedQuiz scores only the first question per turn
**File:** `apps/board/templates/BoardSpeedQuiz.tsx`
**Severity:** 🔴 Critical — silent scoring failure on every multi-question quiz.

`awardedRef` is set `true` when Q1 is answered (`handleAnswer` L155 / `handleTimeout` L192) and is only reset by the `turnId` effect (L115) or `resetQuiz` (L237). **`nextQuestion()` (L221-233) does NOT reset it.** So for Q2..Qn within the same turn, both handlers hit their early-return guard:
```
if (awardedRef.current) return;   // L154, L191
```
Every question after the first is silently no-op'd — no points, no analytics, no FSRS, no remediation. The quiz *plays* correctly (advances, shows reveal) but stops scoring.

The header comment (L8) even says "awardedRef per turn" — but the code is per-turn-only, not per-question. Either the intent was per-question (then `nextQuestion` must reset the latch) or the latch was meant to be per-question all along.

**Fix:** add `awardedRef.current = false;` to `nextQuestion()` (and reset `mistakesRef.current = 0` so each question starts fresh).

### F2. TeamBattle missing the lifecycle contract (3 of 4 must-dos)
**File:** `apps/board/templates/BoardTeamBattle.tsx`
**Severity:** 🔴 Critical — state can leak across student picks; no mistake tracking.

There is no `const turnId = state.currentTurnId` and no `useEffect(...,[turnId])` anywhere. There is no `mistakesRef` — scoring always calls `scoreForAttempt(0, currentQ.difficulty, ...)` (L194, L268), so a clean answer is always worth full points even after wrong attempts. There is no `awardedRef`; it leans on `answerRevealed`/`raceComplete` state guards.

Some of this is defensible for a team game: `pickStudent(team)` (L175) picks round-robin from the active team rather than via the wheel, and each cell is a fresh team attempt (so `mistakes=0` per cell is reasonable). But the **missing turnId reset is a real state-leak risk**: if the teacher ends the slide mid-game or picks a new student, stale `teamTurnTracker` / `grid` / `winResult` state could persist.

**Fix:** at minimum, add a `turnId` effect that resets `teamTurnTracker`, `grid`, `qIndex`, `winResult`, `phase` on new turn. Whether to add per-question mistake tracking is a design call (teams alternate, so "mistakes within a turn" is less meaningful than for a solo responder).

---

## §G — Moderate issues (🟡)

### G1. GrammarForge: wrong attempts not written to analytics / FSRS
**File:** `apps/board/templates/BoardGrammarForge.tsx:248-251, 289-292`

The incorrect branches of `onErrorSpotAnswer` and `checkTransform` call only `addPoints(pickedStudent?.id || '', -MISTAKE_PENALTY)`. They do NOT call `recordAttempt` or `gradeObjective`. So wrong attempts are deducted on the leaderboard but **invisible to Class Accuracy and FSRS** — the grammar strand's analytics will look artificially strong (only correct/partial attempts are recorded).

The correct/partial branches route through `doScoring` (L206-229) which does write both. The asymmetry is the bug.

**Fix:** in both incorrect branches, add `recordAttempt({..., correctness: 'incorrect', ...})` and `gradeObjective(..., false, ...)`.

### G2. GrammarPractice (legacy): no analytics at all
**File:** `apps/board/templates/BoardGrammarPractice.tsx`

`recordAttempt` is never imported or called. Only `gradeObjective` (L130) and `addPoints` (L137/141) fire. Also: no `usePickedStudent` (reads `state.quickWheelWinner` directly), `scoreForAttempt(mistakesRef.current)` is called with one arg (difficulty defaults to 1, ignoring the pool item's difficulty), and the `else if (!correct)` branch (L138-142) is dead code (the Credit button only passes `true`).

This is the legacy grammar game that GrammarForge replaces. If it's still wired into the BOARD_MAP, it should either be brought up to contract or retired. If it's already retired, this is informational only.

### G3. DialogueStage: FSRS only on role-read, not WHO_SAID_IT
**File:** `apps/board/templates/BoardDialogueStage.tsx`

`handleRateRole` calls `gradeObjective` (L211) but `handleWhoSaidItAnswer` (L216-260) and its MARK_CORRECT path (L372-390) write `recordAttempt` only — no FSRS cognitive write. The comprehension MCQ doesn't update the learner model.

This may be intentional (WHO_SAID_IT is receptive recognition, lower-confidence than a performed role-read), but it's an inconsistency worth a deliberate decision.

### G4. ISayYouSay: MARK_CORRECT omits gradeObjective
**File:** `apps/board/templates/BoardISayYouSay.tsx:193-201`

The discrimination `onDiscriminationAnswer` writes `gradeObjective` on both correct (L144) and incorrect (L156), but the remote `MARK_CORRECT` force-correct branch only does `addPoints` + `recordAttempt`. Minor FSRS gap on the teacher-override path.

---

## §H — Minor issues (🟢)

### H1. GrammarForge `showAlreadyScored` is a no-op
**File:** `apps/board/templates/BoardGrammarForge.tsx:231-234`

The callback body is empty (just a comment). The `awardedRef` guard still blocks re-scoring correctly, but the "🔁 already scored this turn" chip that other games show never appears (and there's no `alreadyScoredChip` state to render it from). Dead code — either implement the chip or remove the call.

### H2. Inconsistent picked-student source
9 of 11 scored games read `state.quickWheelWinner` directly inside scoring helpers despite importing `usePickedStudent` for display. Only GrammarForge and ISayYouSay actually score against `pickedStudent.id`. Functionally equivalent (both resolve the same id), but the imported hook is decorative in most games. Cosmetic — no behavior impact.

### H3. Migration mtime oddity
`20260803000004_tighten_assets_srs_parent_rls.sql` has a later file mtime (Aug 6 02:16) than the newer-named `20260806000001_point_transactions_metadata.sql` (Aug 6 01:55). The Aug-3 migration was edited/re-saved after the Aug-6 file was created. Migration application order is by filename (correct), but the late edit means a recent change is "hidden" under an older timestamp. Worth confirming the edited content is what's intended and already applied to cloud.

### H4. `BoardDialogueStage.tsx:486` defensive `as any` audio read
Reads `(currentLine as any).audio` — field absent from canonical `DialogueRoleplayContent.lines[]`. Defensive fallback for legacy manifest data, degrades to TTS. Non-load-bearing, no behavior impact, but technically a contract deviation.

---

## §I — Edge functions + migrations

**Verdict: ✅ Sound.** The grammar strand's generation + reservation is correct and consistent.

### enrich-unit grammar generation
- Few-shot example shows **3 transformation_pairs** (was 1 — the documented fix). Prose asks for 4-6 pairs + 4-5 error_examples. Models anchor on the example, so the floor is now 3. Verified working: new units produce 5 pairs with varied transformations.
- All three new grammar fields (`pattern_template`, `transformation_pairs`, `error_examples`) are prompted AND persisted to the `grammar_rules` table (upsert on `unit_id,rule`, idempotent).
- **Region-safe models clean:** only `moonshotai/kimi-k2.6`, `qwen/qwen3-235b-a22b`, `deepseek/deepseek-r1-0528:free`. No OpenAI/Google/Anthropic. Soft flag: no runtime guard prevents an operator from injecting a forbidden model via env vars (protection is hardcoded defaults + comments only).

### generate-exercises Option A reservation
- `buildGrammarItems` (L167-223) reserves `pairs[pairs.length - 1]` when `pairs.length >= 3`, excludes it from both item construction AND the distractor pool. **Convention matches `BoardGrammarForge.tsx` exactly** (same last-index, same `>= 3` gate) — the two are intentionally coupled and the client cites the edge function as source of truth.
- Rung-4 answer leakage is prevented: the reserved pair's `transformed` text never appears in rung-2/3 distractors.

### NULL-owner production bug
**Resolved, not present.** The stale line references (229-231, 495-506) now point to the centralized `assertUnitOwnership` helper. All three functions (enrich/orchestrate/generate) call the same strict helper; the asymmetric tolerance that caused Bug B1 is gone. The fire-and-forget trigger now records a `generation_jobs` row (pending → running → succeeded/failed), so silent drops are visible and retryable.

**Residual dependency:** the fix assumes NULL owners were backfilled at creation (UploadTextbook stamps `teacher_id`). If that backfill hasn't run in an environment, textbook units will still fail with `"Unit has no owner"`. Worth confirming the backfill ran on production.

### Migration 20260806000001
- Adds nullable `metadata JSONB` + partial index `idx_pt_correctness` (WHERE `metadata ? 'correctness'`). Nullable so existing rows + the points flush are unaffected. Forward-only, idempotent (`IF NOT EXISTS`). No rollback (consistent with the rest of the 90-migration set). Correct and minimal.

### Type contract consistency
Edge `_shared/exerciseTypes.ts` and client `types/exercise.ts` agree exactly: **15/15 exercise types** in the same order, `RECEPTIVE_TYPES` sets match (7/7). The duplication is documented as intentional (Deno ↔ React can't share a module root).

---

## §J — SessionContext + state management

**Verdict: ✅ Sound.**

- `endSession` (L687-723) clears ALL session-scoped state: `activeClassId`, `currentTurnId`, `quickWheelWinner`, `remediationQueue`, `turnsThisExercise`, `sessionStartedAt`, plus the `resetAskedComprehensionItems` import for StoryStage coordination. Thorough — the "living checklist" comment (L693) correctly flags that new SessionContext state must be added here.
- `SelectionMode` retired `ELIMINATION` → `'ROUND_ROBIN' | 'RANDOM' | 'FAIR'`.
- Remediation queue (`pushToRemediation`/`getRemediation`/`drainRemediation`) correctly session-scoped.
- Action vocabulary: only 3 distinct `triggerAction` types dispatched from board templates (`RESET_GAME`, `SLIDE_COMPLETE`, `UNSCRAMBLE_MOVE`). The rest of the action handling is inbound (templates listen for `REVEAL_HINT`, `MARK_CORRECT`, `SKIP_PAIR`, etc. via `state.lastAction`).

---

## Recommended fix priority

1. **🔴 F1 — SpeedQuiz `awardedRef` reset in `nextQuestion`** (one-line fix, highest impact: restores scoring for Q2+ on every quiz)
2. **🔴 F2 — TeamBattle turnId reset** (prevents state leak across student picks)
3. **🟡 G1 — GrammarForge `recordAttempt` on wrong attempts** (makes grammar analytics honest)
4. **🟡 G2 — Decide GrammarPractice's fate** (retire or bring to contract — it's the legacy replacement target)
5. **🟢 H1 — Implement or remove GrammarForge `showAlreadyScored`** (dead code)
6. **🟡 G3/G4 — FSRS gaps on override paths** (deliberate decision needed per game)

F1 is the only one I'd call urgent — it's a silent failure that makes every SpeedQuiz under-score by (N−1)/N of its questions, and the teacher has no signal it's happening.
