# Core-v1 Exercise / Learning Engine Redesign

Implementation of the plan
`professor-exercise-engine-core-v1.md` (source of truth) against
`PIPELINE_REDESIGN_AUDIT_AND_BRIEF.md`. This converts the broken/hollow
exercise, game-mechanics and lesson-structuring layers into one standardized,
extensible, FSRS-driven engine spanning **both tracks** (live board + async
student app), built by *improving* the existing flow rather than replacing it.

> Canonical new modules introduced here:
> - **Unified exercise contract** → `types/exercise.ts` (client) + `supabase/functions/_shared/exerciseTypes.ts` (edge mirror)
> - **FSRS scheduler** → `services/fsrs.ts`
> - **LearnerState (FSRS read/write seam)** → `services/learnerState.ts`
> - **Pool selection** → `services/poolService.ts`
> - **Board per-student capture** → `services/boardLearner.ts`
> - **Exercise-pool generator** → `supabase/functions/generate-exercises/index.ts`

---

## 1. Data model (migrations `20260628000xxx`)

| Table | Purpose | Key columns |
|---|---|---|
| `objectives` | Skill graph: one row per vocab word / grammar rule / phonics target | `unit_id`, `type` (`vocabulary\|grammar\|phonics`), `target_value` |
| `pool_items` | Generated exercise items (the "item pool") | `objective_id`, `exercise_type`, `difficulty 1-3`, `content jsonb` |
| `srs_items` (evolved) | LearnerState: per-student per-objective memory | + `objective_id`, `stability`, `difficulty`, `reps`, `lapses`, `mastery_state`, `last_review`, `mastery_meta`; SM-2 cols + RLS preserved |
| `student_progress` (evolved) | Hearts economy | + `hearts`, `hearts_updated_at` |

- **Retrievability (R) is never stored** — computed on read from `(stability, elapsed)`.
- **Mastery `decaying` is computed on read** (`mastered` + R<0.85 → effective `decaying`).
- **Hearts are compute-on-read**: `min(5, stored + floor(elapsed/4h))`. **No cron** (`pg_cron` is not configured).
- Migration `000004` dedupes + adds `UNIQUE(student_id, objective_id)` to back the atomic `recordAttempt` upsert.
- `objectives` gets an expression index on `lower(trim(target_value))` so the word-match backfill never full-scans.

### RLS
- `objectives`/`pool_items`: authenticated SELECT; writes scoped to the unit's owner / admin.
- `srs_items`: existing owner + teacher/admin + template-read policies preserved; the unique constraint + app-level enrollment guards (see §6) close cross-tenant writes.

---

## 2. The exercise contract (`types/exercise.ts`)

- **12 Core-v1 types** (Locked Decision #2): `IMAGE_SELECT`, `MEANING_MATCH`,
  `AUDIO_L1_SELECT`, `LISTEN_SELECT`, `SPELL_CLOZE`, `WORD_BANK_BUILD`,
  `ERROR_SPOT`, `TRANSFORM`, `DICTATION`, `MINIMAL_PAIR_SWIPE`,
  `TYPE_TRANSLATE`, `SPEAK_SENTENCE`.
- Discriminated `ExerciseContent` union per type; `PoolItem`; `toPoolItem` nulless.
- **Self-completing contract** (replaces the old `{mode,onReady,validateTrigger,onResult}` + parent-Check-button pattern):
  `BaseExerciseProps { data: PoolItem; onComplete(result: ExerciseResult); onError? }`
  where `ExerciseResult = { success; time_taken_ms; attempts; record? }`.
  `record:false` = engagement-only advance (no learner/hearts/XP write).
- **`ExerciseRegistry`** — open Map; both the student dispatcher and the board
  look up components by `exercise_type`. **v2 extension path**: add a type to the
  union + a Content variant + a component + register it + teach the generator.
- The Deno generator mirrors the type list in `_shared/exerciseTypes.ts`
  (edge/client can't share a module root — same reason `manifest.ts` is duplicated).

---

## 3. FSRS-lite (`services/fsrs.ts`)

- 4-grade rating (Again/Hard/Good/Easy); published FSRS-4.5 default params (tunable object).
- `retrievability(stability, elapsed)` — power forgetting curve `R = (1 + t/(9·S))⁻¹`.
- `schedule(prev, grade)` → next stability/difficulty/next_review (lapse resets reps; mean-reverting difficulty bounded [1,10]).
- **Mastery ladder**: `new → learning` (1st receptive success) → `familiar` (1st productive success) → `mastered` (3 productive wins spanning >48h); **lapse demotes a rung AND resets the productive counter** so re-mastery needs 3 fresh wins; `mastered` cracks to `decaying` on read when R<0.85.

---

## 4. LearnerState + selection (`services/learnerState.ts`, `services/poolService.ts`)

- `recordAttempt(studentId, objectiveId, grade, {exerciseType|modality})` — the single write path that closes the loop ("SRS feeds back into what is practised"). **Upsert** on `(student_id, objective_id)` (no duplicate rows).
- `getLearnerState`, `getUnitMasterySummary` (crowns/cracks/completion), hearts (`getHearts`/`loseHeart`/`restoreHeart`), pure `computeHeartsState` (tested).
- **Lesson selection** (`selectLessonItems`): rank objectives weakest-first, pick one mastery-appropriate item per objective (escalation ladder below). Two-phase (rank on light columns, fetch `content` only for chosen items).
- **Practice selection** (`selectPracticeItems`): due + weak across all units, real effective mastery, server-side bounded. Replaces the siloed `SpacedRepetition` flashcard flow.

### Escalation ladder (difficulty buckets — distinct from receptive/productive *modality*)
- new / learning / decaying → **receptive** (`IMAGE_SELECT`, `LISTEN_SELECT`, `MEANING_MATCH`, `AUDIO_L1_SELECT`, `SPELL_CLOZE`)
- familiar → **constrained** (`WORD_BANK_BUILD`, `ERROR_SPOT`, `TRANSFORM`, `MINIMAL_PAIR_SWIPE`)
- mastered → **free production** (`TYPE_TRANSLATE`, `SPEAK_SENTENCE`, `DICTATION`)

The buckets cover **all 12 types** so nothing the generator emits is unreachable.
Modality (receptive=hearts-lenient, productive=hearts-cost) comes from the single
`modalityOf` source — the two axes can't silently diverge.

---

## 5. Enrich + generate (shared backend)

- **`enrich-unit`** (Phase 1.1-1.2): expanded vocab schema — IPA `phonetic`,
  `part_of_speech`, **Simplified-Chinese** `l1_translation`, `confusables`;
  grammar — `pattern_template`, `transformation_pairs`, `error_examples`;
  story — per-page `comprehension_questions`. Generates **TTS `audio_url` per word**
  via the shared `_shared/tts.ts` (ElevenLabs → Supabase Storage).
- **`generate-exercises`** (Phase 1.3-1.4): DETERMINISTIC pool builder (no LLM
  hallucination) — full receptive→productive battery per vocab objective,
  grammar ERROR_SPOT/TRANSFORM/WORD_BANK_BUILD; **sibling-word distractors**;
  **one image/word** (deduped via `assets.prompt_hash`); IMAGE_SELECT omitted
  when <4 sibling images (falls back to MEANING_MATCH). Pool swap is
  insert-new-then-retire-old (no empty-pool window).
- **`orchestrate-lesson`** (Phase 1.5): phase-tags every block
  (`WARMUP/INPUT/PRACTICE/OUTPUT/ASSESS/WRAPUP/REVIEW`), marks pool-driven steps,
  and **fire-and-forget** triggers `generate-exercises` (never blocks the publish).
- `manifest.ts` mirrors (edge + client) aligned to the expanded schema.
- Shared `_shared/tts.ts` + `_shared/imageGen.ts` de-duplicate the media path.

---

## 6. Security model

- `generate-exercises` rejects NULL-owner units (must own).
- `boardLearner.gradeStudent` verifies the calling teacher **owns the unit** and
  the student is **enrolled in one of their classes** before writing the
  LearnerState (no cross-tenant mutation). Choral rounds write nothing.
- Region-safe LLMs only (env `AI_MODEL_NAME`/`FALLBACK_MODEL_NAME`); no model
  IDs hardcoded. `llm_telemetry` for AI calls; `generate-exercises` builds
  deterministically (no AI call).

---

## 7. Track B — student app

- 12 components on the `{data,onComplete,onError}` contract:
  `ChoiceExercise` (7 multiple-choice types) + `WordBankBuild`, `Dictation`,
  `TypeTranslate`, `MinimalPairSwipe`, `SpeakSentence`.
- **Real audio** via `SpeechService.playAudioUrl` (audio_url → ElevenLabs → `speechSynthesis` fallback) — fixes the **mock playAudio bug**.
- **`ExerciseRunner`** plays a list of pool items: per-item `recordAttempt` +
  hearts + XP; out-of-hearts; auto-advance. Used by both Lesson (pool steps) and
  Practice.
- **`SoloLessonPlayer`**: pool-driven PRACTICE/ASSESS steps render the runner
  (self-completing); passive slides keep Continue. Mock games + dead
  validateTrigger path removed.
- **Hardcoded defaults removed** → empty-state guards: ListenTap/FlashMatch/
  SentenceScramble (Spanish/animal), DubbingStudio ("Lost Hat"/freepik).

---

## 8. Track A — live board

- **Phase-aware badge** on `ClassroomBoard` (reads `block.phase`).
- **`BoardFocusCards`** renders generated `phonetic` (IPA), not the missing
  `pronunciation` key (Bug #7).
- **Per-student capture** (`boardLearner.gradeStudent`) wired into
  `SessionContext.gradeStudent`; **class-weak** aggregation
  (`classWeakObjectives`, single batched query) available for board games.
- **`BoardGrammarPractice`** template (Phase 3.6): grammar PRACTICE strand —
  consumes the ERROR_SPOT/TRANSFORM pool items large-screen for teacher-led error
  correction + transformation drills (closes audit G2's "grammar is
  presentation-only"). Emitted as a `GRAMMAR_PRACTICE` (phase PRACTICE) block by
  orchestrate-lesson after `GRAMMAR_SANDBOX`.

---

## 9. Mastery loop UI (Phase 4)

- **HomeMap** surfaces **crowns** (familiar/mastered count, distinct from XP) and
  a **cracked-node** alert per unit from `getUnitMasterySummary` — tapping the
  cracked badge opens Practice to repair. A fully-mastered unit shows a crown.
  Compute-on-read decay, no cron.

---

## 9. Code-review fixes applied (post-implementation)

A six-track review (security / performance / business-logic / deploy-safety /
duplication / dead-code) found 18 issues; **all fixed**:

**CRITICAL**
- `boardLearner` cross-tenant write → enrollment + unit-ownership guard.
- `generate-exercises` NULL-owner authz bypass → reject NULL-owner.
- `orchestrate-lesson` blocking self-invoke (546 risk) → fire-and-forget.

**WARNING**
- FSRS lapse didn't reset mastery progress → now resets `productive_wins`/`first_productive_at` (+ regression test).
- `recordAttempt` read-modify-write race → atomic upsert + unique constraint migration.
- `SpeakSentence` unsupported path granted a free productive write → `record:false`.
- `generate-exercises` non-atomic pool rebuild → insert-then-retire-old; success gated on persisted rows.
- poolService unreachable grammar types (ERROR_SPOT/TRANSFORM/MINIMAL_PAIR_SWIPE) → complete buckets.
- Practice collapsed mastery to 2 buckets → reads stored `mastery_state` + compute-on-read decay.
- `classWeakObjectives` N+1 → single batched query.
- Practice unbounded `srs_items` select → server-side due filter + limit.
- Objective backfill sequential UPDATEs → bounded parallel.
- Lesson over-fetched `content` JSONB → two-phase fetch.

**SUGGESTION**
- Backfill expression index added to `objectives`.
- `SoloLessonPlayer` dead game/validateTrigger/footer code removed.
- `shared.useDelayedComplete` + `registry` re-export removed.

---

## 10. Verification
- `npm run lint` (tsc --noEmit): client clean (Deno edge fns are a separate deployment unit).
- `npm test` (vitest): **279 pass / 1 pre-existing skip**. New suites: `fsrs`,
  `exercises` (registry dispatch + 3 components), `learnerState` (gradeFromResult,
  rankWeakestFirst, computeHeartsState), `poolService` (mastery escalation),
  `generateExercises` (sibling-distractor builders).
- `npm run build`: green.
- Extraction + billing + auth/RLS untouched except new tables/columns.

---

## 11. Follow-up (not in Core v1)
- ✅ Competitive board *game* templates now all pool/content-driven:
  `BoardListenTap`, `BoardWhatsMissing`, `BoardFlashMatch`, `BoardUnscramble`
  (WORD_BANK_BUILD), `BoardSpeedQuiz` (MEANING_MATCH + per-student capture),
  `BoardGrammarPractice` (ERROR_SPOT/TRANSFORM + per-student grammar capture),
  `BoardTeamBattle` (MEANING_MATCH → team-quiz), `BoardISayYouSay`
  (SPEAK_SENTENCE choral drill), `BoardStorySequencing` (unit story pages via
  `getStory`). `BoardMagicEyes` is content-provided (empty-state guard);
  `BoardWheelOfDestiny` is the student selector (feeds the content games). No
  board game reads hardcoded content — all fall back to the pool/manifest when
  frozen flow data is absent.
- FSRS `w` matrix + mastery-threshold calibration after pilot.

## 12. Track-A parity fixes (post-doc)
- **Live student mode (`LessonSession`)**: audit P0 bugs fixed — #5 (live mode
  no longer coerces every activity to LISTEN_TAP/SCRAMBLE; pool-driven PRACTICE/
  ASSESS steps render the shared `ExerciseRunner`, passive steps show a
  "follow the board" state) and #6 (real authenticated student id, not phantom
  `'s1'`).
- **`useBoardPool` hook** (`apps/board/useBoardPool.ts`): board games fetch fresh
  pool items, optionally class-weak-first (audit Locked Decision #7). Pool-driven
  exemplars: `BoardListenTap` (real audio + per-student vocab capture),
  `BoardWhatsMissing` (memorize grid from class-weak IMAGE_SELECT items),
  `BoardFlashMatch` (word/meaning pairs from MEANING_MATCH items).
- **Per-student grammar capture** (`boardLearner.gradeObjective`): generalises the
  board grading model beyond vocab — `BoardGrammarPractice` lets the teacher
  credit the selected student on a grammar objective (productive).

## 13. Hardcoded-content sweep (audit P-bugs #2/#3)
- **`PhonicsPhlyer`** (Bug #2): the hardcoded "sh" flying-word demo is now a
  pool-driven `MINIMAL_PAIR_SWIPE` session via `ExerciseRunner` (real minimal-pair
  audio + pronunciation scoring); clean empty state when the unit has none.
- **`ReadingReader`** (Bug #3): the hardcoded "Lost Hat"/Spanish story is now
  manifest-driven — reads the active unit's story + generated comprehension
  questions, with tappable vocab definitions (Simplified-Chinese L1); clean empty
  state when there's no story. (New `getStory` accessor in `services/manifest.ts`.)

## 14. Second review round fixes
A second six-track review of the board-pool/standalone-rewrite round found 7
issues; **all fixed** (283 tests, typecheck + build green):
- **CRITICAL — `BoardFlashMatch` infinite render loop** in pool mode: the inline
  `frozenPairs` was a fresh `[]` each render → rebuild effect ran every render →
  "Maximum update depth exceeded". Fixed by memoizing the frozen source in
  `BoardFlashMatch` / `BoardWhatsMissing` / `BoardListenTap`. Regression test added.
- **`BoardListenTap` capture asymmetry**: `targetWord` now falls back to `label`
  /`prompt_text` so label-only correct options still show a word + get per-student
  capture.
- **Answer-leak (RLS)**: `pool_items`/`objectives` SELECT no longer uses the
  `auth.role()='authenticated'` catch-all — scoped to teacher-owner / admin /
  enrolled-and-assigned students (migration `000005`).
- **Teacher-write enforcement (RLS)**: `srs_items` INSERT/UPDATE WITH CHECK now
  requires the target student be enrolled in one of the caller's classes (not just
  `is_teacher_or_admin()`) — closes the client-only grading guard (migration `000005`).
- **Perf**: `useBoardPool` gained an optional `limit` (capped consumers pass `8`).
- **Dead code**: removed unused `totalSteps/stepIndex/progress` (ReadingReader) and
  unused `X` import (PhonicsPhlyer).

## 15. Plan-vs-implementation audit follow-up
A task-by-task audit against the plan identified gaps; the "Should" items are now
done (typecheck clean, 283 tests, build green):
- **G2 / 4.3 — Mastery-tied quests**: new `QUEST_TYPES.REACH_FAMILIAR`
  ("Master N Words"); `ExerciseRunner` advances it the FIRST time a session a
  productive success lifts an objective to `familiar`/`mastered` (per-session
  de-dup via a `familiarSeen` set). Quest-assignment fallback in
  `GamificationService.getDailyQuests` updated.
- **G3 / 4.5 — Dashboards read LearnerState**: new `learnerState.getClassMasteryCounts`
  (batched roster aggregation, compute-on-read crack) exposed via
  `Engine.getClassMasteryCounts`. `Reports.tsx` leaderboard now sorts/shows real
  "Skills Mastered" + cracked badges (replacing XP-derived Accuracy), and
  "Needs Attention" = students with 0 acquired skills. `DashboardHome.tsx` shows
  class "Skills Mastered" + "Need Review" stat cards.
- **G1 / 1.2 — Example-sentence TTS**: `enrich-unit` now generates BOTH
  `audio_url` (word) and `example_audio_url` (example_sentence); both manifest
  mirrors carry `example_audio_url`; `generate-exercises` DICTATION now targets
  the sentence (richer) and SPEAK_SENTENCE prefers the sentence audio.
- **P2 / 3.4 — Class-weak suggestions**: `apps/board/ClassWeakBanner.tsx`
  surfaces the roster's top-3 weakest vocab words (avg recall < 0.7) during
  practice/assess steps so the teacher can prioritise them.
- **P5 / 5.1 — recordAttempt test**: `test/recordAttempt.test.ts` mocks the
  Supabase client and asserts the FSRS+mastery upsert patch. It **caught a real
  cold-start bug**: on a student's first attempt on an objective, `recordAttempt`
  threw on `existing.id = …` (existing was null) and returned null — so the
  mastery-quest advance + board `gradeStudent` return silently failed on every
  brand-new item (the DB upsert itself still ran). Fixed by tracking the row id
  locally (`rowId`) instead of mutating `existing`.

### Documented deviations (reconciled with the spec)
- **0.1**: `objectives.type` is `TEXT + CHECK`, not the planned native ENUM
  (matches repo convention; trivially extensible). No change planned.
- **1.3**: `generate-exercises` is deterministic (no LLM), so the plan's
  "region-safe models + telemetry" is N/A for it — the enriched manifest supplies
  all fields, avoiding hallucination + cost. `enrich-unit` still writes
  `llm_telemetry` for its AI calls (constraint met).

## 16. Image generation fix (deploy)
The image pipeline was broken: `_shared/imageProvider.ts` called OpenRouter's
`/chat/completions` with `flux-schnell` (default, since `IMAGE_GEN_MODEL` wasn't
set) — but an image model through the **chat** endpoint returns text, not images,
so `generate()` returned `null` → placeholders. The plan's "Nano Banana" is
Google (region-blocked). **Fix:** added a `pollinationsProvider` (region-safe,
key-less, Flux-backed, deterministic URL) and made it the default
(`IMAGE_PROVIDER` defaults to `pollinations`; OpenRouter remains an option).
Bumped the proxy-fetch timeout to 45s (Pollinations first-gen can be slow).
Redeployed `generate-media` + `generate-exercises`. **Verified end-to-end**:
Pollinations → Storage → public URL (200, real JPEG). Audio (ElevenLabs via
`tts.ts`) is configured; on failure it gracefully falls back to
`speechSynthesis` — verify in the live test.

### Still outstanding (need a live session)
- **G4 / 5.2** — End-to-end (re-enrich a unit → `generate-exercises` builds a
  pool with the new schema/audio → play → `srs_items` writes → weak word
  resurfaces; board round → selected-student update). Existing units use the
  OLD enrich format (no `phonetic`/`l1_translation`/`audio_url`) → **re-enrich
  first**.
- **Calibration** — FSRS `w` matrix + mastery thresholds after a real pilot.
