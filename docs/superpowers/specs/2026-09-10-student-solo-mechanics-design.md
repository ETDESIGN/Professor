# Student Solo Mechanics Fix — Design (Phase 1, mechanics before Stitch)

**Date:** 2026-09-10 · **Status:** approved direction (owner: "fix the mechanics first, so I can see the gaming with their original design") · **Precedes:** Wonder Atlas Plan 2 (lesson-loop reskin — deferred until owner evaluates the games)

## Problem (audit 2026-09-10)

On the student map of "A Day at the Zoo" (`e432361f`), 19 nodes are all `lock:'open'` and ~13 of them
(SOUND_LAB, MEMORY_LAB, WORD_DETECTIVE, SPEAKING, SENTENCE_LAB, GRAMMAR_LAB, STORY_QUEST,
CLASS_RALLY, VOCAB_BLITZ, WORD_SEARCH, PHONICS_ARENA, DIALOGUE_STAGE, UNIT_REVIEW) render **the
same generic exercise battery**: `SoloLessonPlayer` routes every `poolDriven || PRACTICE/ASSESS`
block to `ExerciseRunner` fed by `selectLessonItems(unitId, studentId, 14)` — a selection that
**never receives the game type** and is fully deterministic (unseen-first → weakest-first →
loop-stage sort). Result: identical first question, identical batch, every icon, every launch.
The pool has variety (86 items / 15 exercise types); the player ignores it.

Secondary defects fixed in the same pass:
- **F2 dead eligibility filter:** `STUDENT_ELIGIBLE_TYPES` / `POOL_ROUND_TYPES` (`types/stage.ts`)
  are defined but imported nowhere — board-only types leak onto the student map.
- **F3 silent full-flow fallback:** `setActiveUnit` (`store/SoloSessionContext.tsx:135-143`)
  plays the whole unit flow when the tapped stage id no longer resolves (re-publishes change
  stage ids) — every icon, same full sequence, no signal.
- **F4 CLASS_RALLY everywhere:** orchestrate-lesson force-appends a cooperative *classroom*
  closer to every unit (`index.ts:275-280`); it leaks onto the solo map as a normal node.

## Decisions (owner direction 2026-09-10 + agent recommendations where unanswered)

1. Mechanics first; Stitch reskin decided AFTER the owner sees each game in its original design.
2. **CLASS_RALLY: hidden from the student map** (classroom mechanic; stays on the live board).
3. **WORD_SEARCH: real student word-search built now** — reuses the pure, tested board grid engine.
4. **MEMORY_LAB: real memory game** — the existing `FlashMatch` pair game embedded in the lesson.

## Design

### 1. `apps/student/gameRouting.ts` (new, pure) — single source of routing

```ts
type StepContent =
  | { kind: 'engine'; engine: 'FAST_VOCAB' | 'SPELLING_BEE' | 'WORD_SEARCH' | 'MEMORY_MATCH' }
  | { kind: 'pool'; types: string[] }   // battery filtered to these exercise_types
  | { kind: 'pool-all' };               // unfiltered battery (review)
```

Routing table (game block type → content), keyed by flow type:

| Block type | Content |
|---|---|
| FAST_VOCAB / SPELLING_BEE | engine (existing steps, untouched) |
| WORD_SEARCH | engine → new `WordSearchStep` |
| MEMORY_LAB | engine → new `MemoryMatchStep` (FlashMatch embedded) |
| SOUND_LAB | pool: LISTEN_SELECT, AUDIO_L1_SELECT, MINIMAL_PAIR_SWIPE |
| PHONICS_ARENA | pool: MINIMAL_PAIR_SWIPE, LISTEN_SELECT, AUDIO_L1_SELECT |
| WORD_DETECTIVE | pool: IMAGE_SELECT, MEANING_MATCH |
| VOCAB_BLITZ | pool: IMAGE_SELECT, MEANING_MATCH, TYPE_TRANSLATE, SPELL_CLOZE |
| SENTENCE_LAB | pool: WORD_BANK_BUILD, ERROR_SPOT, SPELL_CLOZE |
| GRAMMAR_LAB | pool: GRAMMAR_FILL, TRANSFORM, ERROR_SPOT |
| SPEAKING | pool: SPEAK_SENTENCE, DIALOGUE_ROLEPLAY |
| DIALOGUE_STAGE | pool: DIALOGUE_ROLEPLAY, WHO_SAID_IT, SPEAK_SENTENCE |
| STORY_QUEST | pool: STORY_COMPREHENSION, WHO_SAID_IT |
| LISTEN_TAP | pool: LISTEN_SELECT, AUDIO_L1_SELECT |
| SPEED_QUIZ | pool: receptive set (IMAGE_SELECT, MEANING_MATCH, LISTEN_SELECT, AUDIO_L1_SELECT) |
| UNIT_REVIEW | pool-all |
| unknown / other eligible | pool-all (today's behavior as fallback) |

(Board-only classics like FLASH_MATCH/SCRAMBLE are NOT routed: the eligibility
gate keeps them off the student map, so routing them would be dead weight —
enforced by a table-consistency test.)

Also in this module:
- `GAME_TITLES: Record<string, string>` — friendly display names ("Sound Lab", "Word Detective"…)
  used by the battery header and derived-path node titles (replaces raw `SOUND_LALL`-style names).
- `STUDENT_HIDDEN_TYPES: ReadonlySet<string>` — board/classroom-only types never shown on the
  student map: `CLASS_RALLY` + multiplayer/board mechanics (`TEAM_BATTLE`, `TEAM_SPLASH`,
  `WHEEL_OF_DESTINY`, `STORY_SEQUENCING`, `COMIC_PANELS`, `POLL`, `LIVE_WARMUP`, …). These stay
  fully available on the teacher board — the filter applies at student-path resolution only.

### 2. `services/poolService.ts` — type-aware, variety-seeded selection

`selectLessonItems(unitId, studentId, count = 14, opts?: { types?: string[]; seed?: number })`:
- When `opts.types` is set, candidate rows are filtered to those exercise_types **first**, then
  the existing weakest-first/mastery ladder runs inside the family.
- **Relaxation guard:** if the filtered candidates serve < 5 distinct objectives (or < 5 items),
  fall back to all types (log via `log.info('lesson_items_type_filter_relaxed')`) — a thin family
  must never produce an empty/near-empty battery.
- **Seeded shuffle:** the final list is shuffled *within each loop-stage bucket*
  (recognize/recall/produce) with `mulberry32(opts.seed)` — variety across replays while keeping
  the pedagogical arc. `opts.seed` comes from the player (random per battery mount); tests pass
  fixed seeds for determinism.

### 3. `apps/student/SoloLessonPlayer.tsx` — route by spec

- `contentSpec = contentForStep(currentStep?.type)` from gameRouting.
- `isEngineStep := contentSpec?.kind === 'engine'` (replaces the hardcoded FAST_VOCAB/SPELLING_BEE
  check; those two keep their existing step wiring, two new engines join them, all lazy-loaded).
- Battery effect calls `selectLessonItems(unitId, studentId, 14, { types: spec.types, seed })`
  and passes `title = GAME_TITLES[type] ?? currentStep.title` to ExerciseRunner.
- Everything else (INTRO_SPLASH, FOCUS_CARDS, STORY_STAGE, GRAMMAR_SANDBOX, MEDIA_PLAYER,
  GAME_ARENA speed-quiz) keeps its existing dedicated renderer.

### 4. `apps/student/steps/WordSearchStep.tsx` (new) — the real word search

Contract identical to FastVocabStep/SpellingBeeStep: `{ unitId, unitTitle, onDone, onExit }`,
self-fetching, `loading / play / done` screens, `recordAnswer` per word, no self-awarded XP.
- Content: pool rows (IMAGE_SELECT/MEANING_MATCH) → `poolToWords` (board
  `wordSearch/content.ts`, pure) with `get_unit_bundle` vocabulary fallback (SpellingBeeStep
  pattern) → `takeRound(words, 8)`.
- Grid: `buildGrid(words, { seed })` from board `wordSearch/gridEngine.ts` (pure, tested).
- Interaction: tap first letter → tap last letter → `snapLine`/`matchSegment` validate against
  placements; found words check off a list; completion when all found (or Skip → done).
- Styling: current student design language (duo-*). Stitch reskin deliberately deferred.

### 5. `apps/student/steps/MemoryMatchStep.tsx` (new) — the real memory game

Same step contract. Pairs: unit vocabulary (`getVocabulary(manifest)`, image + word) → 4–6 pairs;
drives `FlashMatch` in `mode:'embedded'` with the `onReady/validateTrigger/onResult` contract
already exercised by `LessonSession` (driver logic copied from there), wrapped in
loading/play/done screens. Pair-building extracted into a pure helper for tests.

### 6. `services/stageProgressService.ts` + path resolution — enforce eligibility

- `resolveUnitPath`/`deriveDefaultPath`: drop any node whose blocks are **all**
  `STUDENT_ELIGIBLE_TYPES`-ineligible (works for both teacher-composed
  `student_path` and derived flows — single choke point, no data migration).
  Nodes with mixed blocks keep their eligible blocks; empty-blocks legacy
  markers pass through.
- Derived node titles use `GAME_TITLES` (friendly names on the map), and
  `normalizeStage` translates saved titles that are EXACT raw type strings
  ("SOUND_LAB" → "Sound Lab") — teacher-authored titles pass through untouched.

### 7. `store/SoloSessionContext.tsx` — honest stage fallback

`setActiveUnit` stage resolution: by id → **by normalized title** (titles are stable type names
across re-publishes) → only then full flow, and never silently: `console.warn` +
`activeStage = null`. This kills the "every icon plays the same full sequence" mode for
stale-map cases.

## Addendum — v2 (2026-09-10, after owner retest: "every game still opens on the same lion/polar-bear Chinese-word question")

v1 filtered each battery to its family but three flaws kept the openings feeling identical:
families overlapped in MODALITY (Phonics/Sound Lab both opened on an audio→Chinese MCQ;
Review is all-types by design), the "≥3 objectives" guard wrongly relaxed single-objective
families (Story Quest's 8 MCQs on 1 objective) into the generic mix, and the released-objectives
filter re-widened the family whenever a class plan existed (latent bug, fixed).

v2 changes:
- **Signature openings** — every routed family declares `signature` types that LEAD the battery
  (test/familyRepro.test.ts asserts, against a snapshot of the REAL zoo pool, that no two
  signature-led games open on the same exercise type and grammar/sentence batteries never leak
  vocabulary MCQs).
- **Phonics = MINIMAL_PAIR_SWIPE only** (its distinct 2-option swipe UI); Sound Lab opens on
  LISTEN_SELECT (audio→English), Listen&Tap on AUDIO_L1_SELECT (audio→Chinese).
- **Family guard is item-based** (≥3 items); single-objective families qualify and a repeat
  **fill pass** tops each objective up to 3 items (buildBatteryIds, pure, shared with tests).
- **Seeded per-objective option shuffle** — DB rows arrive alphabetically by type, which made
  every family battery serve one type wall-to-wall (grammar = 8× ERROR_SPOT).
- **Unit Review interleaves** the stage arc (round-robin) instead of running all MCQs first.
- The owner's "Grammar Lab showed the polar-bear vocab MCQ" report cannot reproduce with v2
  code (asserted); if seen again, first suspect a stale PWA tab (reload banner / hard refresh).

## Explicitly out of scope (Phase 1)

- Any Stitch/Wonder Atlas reskin (owner decides after seeing the games).
- The two duplicate zoo units `046caeed` / `5e7f7029` (0 pool items → batteries will now relax
  to whatever exists; still empty for those units). Recommended follow-up: regenerate exercises
  or archive them — owner data decision.
- Lock/progression policy (nodes stay `open` as composed).
- Edge-function changes (all fixes are client-side; no function redeploy needed).

## Verification

- New vitest: gameRouting table completeness + hidden set; selectLessonItems filter/relax/seed
  (mocked supabase, existing patterns); eligibility filter on paths; memory pair-builder.
- `tsc --noEmit`, full vitest suite, `npm run build`.
- Manual: push to master (Vercel auto-deploy), open the zoo unit on the test student account,
  tap each icon — every surviving icon must launch a distinct experience; no two pool icons may
  show the same first question on consecutive launches.
