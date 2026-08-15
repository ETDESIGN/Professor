# Professor — Games & Exercise System Audit (Claude Briefing)

> **Purpose.** This document is a self-contained briefing for a design/AI collaborator ("Claude") who has **NO access to the codebase**. Every claim below is backed by real source (file path + line number), code snippets, or DB schema. Read it top to bottom before proposing any redesign.
>
> **Scope.** The live-classroom board games and the content pipeline that feeds them. The student-app async exercise track is mentioned for context but is out of scope for this audit.
>
> **What the audit concludes, in one line.** The games are *presentational wrappers around a single repetitive mechanic each*, the live class has no coherent pedagogical loop, **there is no grammar game at all**, several games don't score, and the content pipeline that *would* feed richer games is broken in production (0 rows). We need Claude to design a proper skill-acquisition architecture per game, then implement it.

---

## Table of contents

- [§A — What "Professor" is](#a--what-professor-is)
- [§B — The two type systems (the critical mental model)](#b--the-two-type-systems-the-critical-mental-model)
- [§C — Content generation pipeline](#c--content-generation-pipeline)
- [§D — The data spine (full schema)](#d--the-data-spine-full-schema)
- [§E — The live-class loop & SessionContext](#e--the-live-class-loop--sessioncontext)
- [§F — The scoring model](#f--the-scoring-model)
- [§G — Per-game inventory + critique](#g--per-game-inventory--critique)
- [§H — Cross-cutting failure modes (the four problem areas)](#h--cross-cutting-failure-modes-the-four-problem-areas)
- [§I — Drift, dead code, and gaps](#i--drift-dead-code-and-gaps)
- [§J — What "good" looks like (the design bar)](#j--what-good-looks-like-the-design-bar)

---

## §A — What "Professor" is

**Professor** is a teacher-facing ESL/EFL tool for **live, in-classroom instruction** of English to children aged roughly **6–12**, with a primary market of **China** (Simplified Chinese / 简体中文 is the L1 used for translations, distractors, and meaning options).

### The physical classroom model (load-bearing — shapes everything)

A live class runs on **three separate browser tabs**, each a separate React root that does **not** share React state:

| Tab | Route | Who uses it | Role |
|---|---|---|---|
| **Commander** | `/teacher/live` (`apps/teacher/LiveCommander.tsx`) | Teacher, desktop/laptop | The control room: lesson roadmap, the "now answering" bar, roster chip deck, contextual controls per slide, sidebar (wheel/teams/analytics/notes) |
| **Remote ("Baton")** | `/remote` (`apps/remote/TeacherRemote.tsx`) | Teacher, phone/tablet | Hand-held remote: Spin / Pick / Class / Redo / Rank / Teams / manual Correct–Wrong / Next Student |
| **Board** | `/board` (`apps/board/ClassroomBoard.tsx`) | **Projected** to the whole class | The projector screen students actually look at — renders the current game/slide |

The three tabs converge through **Supabase Realtime**, not shared state (see §E). **There is no student-facing live surface** — students have no device during a live class; they see the projector and respond orally. The teacher performs all input. (A `BoardPoll` component was removed on 2026-08-03 precisely because no student-device vote surface exists.)

> **Implication for design.** Every game must work as a **teacher-driven, single-input, projector-displayed** experience. "Each student on their own device" is NOT the model today. If Claude proposes student-device interactions, that is a *new* architecture decision requiring explicit owner buy-in, not an assumption.

### Stack

- **Frontend:** Vite + TypeScript multi-entry SPA (entries: `teacher` / `student` / `parent` / `admin`). Tailwind. PWA (`vite-plugin-pwa`, `registerType: 'prompt'` — user-prompted updates, deliberate for a live-classroom tool).
- **Backend:** Supabase (Postgres 17 + Auth + Storage + Edge Functions / Deno).
- **AI:** via **OpenRouter** gateway, **region-safe models only** (Moonshot / Qwen / DeepSeek / Meta / NVIDIA). **Never** OpenAI / Google / Anthropic — the OpenRouter region blocks them. Canonical model env values: `AI_MODEL_NAME=moonshotai/kimi-k2.6`, `FALLBACK_MODEL_NAME=deepseek/deepseek-chat`, `VISION_MODEL_NAME=qwen/qwen3-vl-235b-a22b-instruct`, `FALLBACK_VISION_MODEL_NAME=qwen/qwen2.5-vl-72b-instruct`.
- **Media/TTS:** ElevenLabs.
- **Payments:** Stripe.

---

## §B — The two type systems (the critical mental model)

This is the single most important thing to internalize. There are **two parallel, deliberately-distinct type systems**, and they are only **loosely coupled**. Most of the audit's findings trace back to this looseness.

### System 1 — `units.flow[].type` (the board presentation shell)

A lesson is an ordered array of **flow blocks** stored in `units.flow` (JSONB). Each block has a `type` (a string from the allow-list below) which decides **which React component the projector renders**. This is the *presentation shell* — it says "render a FlashMatch board" or "render a story reader." It says nothing about the *content shape*.

The allow-list (`supabase/functions/_shared/flowTypes.ts:35-58`, `SUPPORTED_FLOW_TYPES`):

```
INTRO_SPLASH, MEDIA_PLAYER, LIVE_WARMUP, FOCUS_CARDS, GAME_ARENA, STORY_STAGE,
GRAMMAR_SANDBOX, GRAMMAR_PRACTICE, TEAM_BATTLE, UNSCRAMBLE, WHATS_MISSING,
SPEED_QUIZ, STORY_SEQUENCING, I_SAY_YOU_SAY, SPEAKING, MAGIC_EYES, POLL,
WHEEL_OF_DESTINY, UNIT_SELECTION, SCRAMBLE, FLASH_MATCH, LISTEN_TAP
```

(22 strings. `SCRAMBLE` is a legacy alias for `UNSCRAMBLE`; `SPEAKING` is an alias for `I_SAY_YOU_SAY`.)

Each block also carries a **pedagogical phase** ∈ `{WARMUP, INPUT, PRACTICE, OUTPUT, ASSESS, WRAPUP, REVIEW}` (`flowTypes.ts:16-23`), meant to realize a Pre-In-Post / PPP (Presentation–Practice–Production) model.

### System 2 — `pool_items.exercise_type` (the interactive payload)

Independently, the system generates a **pool of typed exercise items** in the `pool_items` table. Each row has an `exercise_type` (a string from a *different* allow-list) which describes **the interactive shape of one task** — "choose the correct image," "type the word you hear," "assemble the sentence from a word bank." This is the *payload*.

The 15 allowed values (`types/exercise.ts:20-35`):

```
IMAGE_SELECT, MEANING_MATCH, AUDIO_L1_SELECT, LISTEN_SELECT, SPELL_CLOZE,
WORD_BANK_BUILD, ERROR_SPOT, TRANSFORM, DICTATION, MINIMAL_PAIR_SWIPE,
TYPE_TRANSLATE, SPEAK_SENTENCE, STORY_COMPREHENSION, DIALOGUE_ROLEPLAY, WHO_SAID_IT
```

Each is classified by **cognitive modality** (`types/exercise.ts:63-75`):
- **Receptive** (`RECEPTIVE_TYPES`): `IMAGE_SELECT, MEANING_MATCH, AUDIO_L1_SELECT, LISTEN_SELECT, SPELL_CLOZE, STORY_COMPREHENSION, WHO_SAID_IT`
- **Productive**: everything else.

Each has a typed `content` JSONB shape (a discriminated union of 15 variants, `types/exercise.ts:84-259`). Example — `MeaningMatchContent`:

```ts
export interface MeaningMatchContent extends BaseContent {
  type: 'MEANING_MATCH';
  prompt: string;          // L2 word whose L1 meaning must be selected
  prompt_audio?: string;
  options: string[];       // L1 (Simplified Chinese) meaning options
  correct_index: number;
}
```

### The coupling is *runtime*, not declared

**There is NO static mapping** from a flow block type to the exercise types it consumes. Instead:

- Most **practice/assess** flow blocks carry `data.poolDriven = true` and at runtime the corresponding React component calls a hook (`useBoardPool`, see §D) that queries `pool_items` filtered by **whatever exercise types that component chooses to hardcode**.
- So the actual content a game sees is decided by a hardcoded list inside each `Board*.tsx`:
  - `BoardFlashMatch` → always `['MEANING_MATCH']` (`BoardFlashMatch.tsx:34-40`)
  - `BoardListenTap` → always `['LISTEN_SELECT']`
  - `BoardSpeedQuiz` → always `['MEANING_MATCH']`
  - `BoardTeamBattle` → always `['MEANING_MATCH']`
  - `BoardUnscramble` → always `['WORD_BANK_BUILD']`
  - `BoardWhatsMissing` → always `['IMAGE_SELECT']`
  - `BoardGrammarPractice` → always `['ERROR_SPOT','TRANSFORM']` (`BoardGrammarPractice.tsx:44`)

> **This is the rot.** Each game is welded to exactly one exercise type, forever. FlashMatch will *only ever* show "match the word to its L1 meaning." SpeedQuiz will *only ever* ask "What does `prompt` mean?" with L1 options. There is no escalation, no variation, no receptive→productive progression within a game, no way for a game to pull a different content type as the class masters the current one. §H drills into why this is a serious pedagogical problem.

### Why two systems exist (the rationale, so Claude doesn't "fix" the wrong thing)

The split is **intentional and correct in spirit**: the *shell* (how it looks on a projector, what the teacher controls) is a different concern from the *payload* (what skill is being exercised, what data shape). A `TEAM_BATTLE` could in principle consume vocab OR grammar OR sentence items; a `MEANING_MATCH` payload could be rendered as a quiet tap game OR a buzzer race OR a memory grid. Decoupling them *should* enable variety.

The problem is that **no game actually exploits the decoupling**. Each one hardcodes a single payload type and renders exactly one mechanic. The architecture promises flexibility the components never deliver. Claude's redesign should *lean into* the decoupling (make one shell able to consume multiple payloads, or make one payload renderable in multiple shells), not collapse it.

---

## §C — Content generation pipeline

Content is produced by a **two-tier pipeline**: (1) an AI authoring tier turns textbook pages into structured manifests, and (2) a deterministic "item-pool" tier turns those manifests into typed, game-consumable `pool_items` rows.

### The flow a teacher follows

1. **Upload** (`apps/teacher/UploadTextbook.tsx`) — teacher uploads image/PDF pages to the `materials` storage bucket. A draft `units` row is created (`status: 'Draft'`).
2. **Extract** — `extract-page` edge function (vision model) analyzes each page and returns structured metadata: extracted text, vocabulary `[{word, definition, category}]`, topic, grade level, learning objectives, exercises. Stored in `units.scanned_assets`.
3. **Enrich** — `enrich-unit` edge function enriches **6 categories sequentially**: `['vocabulary', 'grammar', 'characters', 'story', 'media', 'dialogues']`. Each call writes its category into `units.manifest.enriched_content` AND emits **canonical relational rows** (`vocabulary_items`, `grammar_rules`, `story_pages`, `dialogue_lines`, `characters`).
4. **Review/Approve** (`apps/teacher/AssetWorkshop.tsx`) — teacher approves/rejects items per category. Approvals written to `content_review_status`.
5. **Build Lesson** — `orchestrate-lesson` edge function assembles approved content into a sequenced `units.flow` + sets `units.status='Active'` + seeds `srs_items` templates, then **fire-and-forget triggers `generate-exercises`**.
6. **Generate Pool** — `generate-exercises` edge function builds `objectives` + `pool_items` from the manifest + relational tables. **This is the step that feeds every game.**

### The edge functions (under `supabase/functions/`)

| Function | LLM? | Purpose | Writes |
|---|---|---|---|
| `extract-page` | Yes (vision: qwen3-vl-235b → qwen2.5-vl-72b → qwen3-vl-32b) | OCR + structure a textbook page image | Only `llm_telemetry`; caller stores result in `units.scanned_assets` |
| `enrich-unit` | Yes (kimi-k2.6 → qwen3-235b → deepseek-r1) | Generate one rich content category per call | `units.manifest` + relational tables (`vocabulary_items`, `grammar_rules`, `story_pages`, `story_comprehension_questions`, `dialogue_lines`, `characters`, `unit_characters`) |
| `orchestrate-lesson` | Yes (kimi-k2.6 → qwen3-235b), **but has a deterministic fallback `transformManifestToFlow` that builds most flows** | Sequence content into `units.flow` | `units.flow` + `units.status='Active'` + `srs_items` templates + triggers generate-exercises |
| **`generate-exercises`** | **No LLM — fully deterministic** | Convert manifest + relational tables into `objectives` + `pool_items` | `objectives` + `pool_items` + `generation_jobs` status |
| `generate-media` | Yes (image gen + ElevenLabs TTS) | On-demand image/audio | `assets` + `unit_media` |
| `generate-lesson` | Yes | Alternate topic→lesson path (not from textbook) | Returns to client only |
| `evaluate-pronunciation` | Yes (STT + Levenshtein) | Score pronunciation | Returns to client only (does NOT persist) |

### `generate-exercises` — the deterministic pool builder (the engine to understand)

This is the function that decides what games *can* contain. **It makes zero LLM calls** — it mechanically converts structured manifest data into typed pool items via four builder functions. The header comment is explicit: *"there is NO LLM call here. It is fully deterministic."*

The four builders and what they emit:

| Builder | Source | Emits (exercise types) |
|---|---|---|
| `buildVocabItems` | `vocabulary_items` (or manifest fallback) | Up to **10 types per word**: `MEANING_MATCH, AUDIO_L1_SELECT, LISTEN_SELECT, IMAGE_SELECT, SPELL_CLOZE, WORD_BANK_BUILD, DICTATION, MINIMAL_PAIR_SWIPE, TYPE_TRANSLATE, SPEAK_SENTENCE` — each gated on having the required inputs (audio/image/confusables/example) |
| `buildGrammarItems` | `grammar_rules` | `ERROR_SPOT` (per error example), `TRANSFORM` (per transformation pair), `WORD_BANK_BUILD` |
| `buildStoryItems` | `story_comprehension_questions` | `STORY_COMPREHENSION` (one MCQ per question) |
| `buildDialogueItems` | `dialogue_lines` | `DIALOGUE_ROLEPLAY` (per dialogue group, productive) + `WHO_SAID_IT` (per line, receptive MCQ) |

This is gated by an `activity_type_registry` table seeded to exactly these 16 outputs (10 vocab + 3 grammar + 1 story + 2 dialogue).

> **Key fact for Claude.** The pool builder is *extensible by code, not by prompt*. Adding a new exercise type requires: (1) add to the `ExerciseType` union in `types/exercise.ts`, (2) add a `Content` variant to the `ExerciseContent` union, (3) add a builder branch in `generate-exercises`, (4) add a row to `activity_type_registry`, (5) build a renderer component and register it. There is no AI prompt that says "produce exercise type X" — the prompts live in `enrich-unit`, which produces the *raw content fields* (`distractors`, `confusables`, `error_examples`, `transformation_pairs`, `comprehension_questions`) that the deterministic builder then shapes into items.

### The production bug (why games are starved of content today)

**Verified 2026-07-29: `objectives`, `pool_items`, `assets`, and `character_ledger` all have 0 rows in production across all 87 units.** `generate-exercises` has NEVER produced data. Two cooperating defects:

**Defect 1 — Asymmetric ownership check (root cause).** The three content functions previously had *different* ownership checks. `enrich-unit` and `orchestrate-lesson` were *tolerant* of NULL owner (`if (unit.teacher_id && unit.teacher_id !== auth.userId)` — the `&&` short-circuits when `teacher_id` is NULL). `generate-exercises` was *strict* (`if (!unit.teacher_id || unit.teacher_id !== auth.userId)` — rejects NULL owner). Textbook-created units had `teacher_id = NULL`, so enrichment + orchestration *succeeded* (writing the manifest, the flow, the srs templates — making the unit *look* done), but the fire-and-forget `generate-exercises` was *silently rejected* at its ownership guard. Nothing was logged where anyone would see it.

**Defect 2 — Fire-and-forget trigger (why it was invisible).** `orchestrate-lesson` triggers `generate-exercises` via a **detached, un-awaited `fetch()`** (the comment explains why: `generate-exercises` does per-word image generation that can run long; awaiting would blow orchestrate-lesson's wall-clock budget and trigger a Supabase 546s kill). A cold-start drop, a missing auth header, or a function error all vanished silently — the only handler was `.catch(console.error)`.

**Resolution state in current code.**
- `assertOwnership.ts` now centralizes one *strict* policy (rejects NULL owner, rejects non-owner). All three functions call it. The comment explicitly says: *"Do NOT loosen it; fix NULL owners at the source instead."*
- `UploadTextbook.tsx` now stamps `teacher_id: user?.id` at creation (the comment cites Bug B1).
- A `generation_jobs` table makes the stage a visible, retryable row (`pending`/`running`/`succeeded`/`failed`).
- Existing NULL-owner units are backfilled into a shared "Legacy Units" book but still need their `teacher_id` resolved.

> **Why this matters for the audit.** The pool architecture is *correct* and the games already know how to read it (`useBoardPool`, `poolService`). The pool has just never been populated in production. Any redesign must assume the pool **will** be populated (the fix is in place) and design for a rich pool, not for the empty-state the games currently degrade to.

---

## §D — The data spine (full schema)

These are the tables that matter for the games. Column lists are from the migration files.

### `units` — the lesson container
`id UUID PK`, `title TEXT`, `level TEXT`, `status TEXT` CHECK `('Active','Draft','Locked','Completed','Processing')`, `lessons INT` (a count, NOT a table — there is no `lessons` table), `cover_image TEXT`, `flow JSONB` (the lesson timeline — the ordered array of flow blocks), `scanned_assets JSONB` (extraction outputs), `manifest JSONB` (the enriched content, now a read-cache — canonical data lives in the relational tables), `topic TEXT`, `teacher_id UUID` (→auth.users), `book_id UUID` (→books), `migrated_categories TEXT[]`.

### `objectives` — the skill-graph nodes (the mastery unit)
`id UUID PK`, `unit_id UUID` (→units, CASCADE), `type TEXT` CHECK `('vocabulary','grammar','phonics','story','dialogue')`, `target_value TEXT` (the word / rule name / "Story comprehension" / "Dialogue practice"), `created_at`. Unique index on `(unit_id, type, lower(trim(target_value)))`. **One objective per vocab word, per grammar rule, plus one each for story/dialogue.** This is what `srs_items` tracks mastery against.

### `pool_items` — THE table that feeds every game
`id UUID PK`, `unit_id UUID`, `objective_id UUID` (→objectives, CASCADE), `exercise_type TEXT` (TEXT, not enum — for extensibility), `difficulty SMALLINT` CHECK `BETWEEN 1 AND 3` (1=receptive, 2=constrained, 3=free production), `content JSONB` (the full typed payload — one of the 15 `ExerciseContent` variants), `created_at`. Indexes on `(unit_id)`, `(objective_id, exercise_type)`, `(exercise_type)`.

> **Critical design point.** A pool item does NOT have a field distinguishing "this is a vocab item" vs "this is a grammar item." That distinction lives on the **parent objective's `type`**. The pool item's own `exercise_type` distinguishes the *activity shape* (MCQ, cloze, dictation…), not the content domain. To know "is this item about a vocab word or a grammar rule?" you must join to `objectives`.

### Relational content tables (canonical "Learning Object" sources — manifest is now a cache)

**`vocabulary_items`** (`20260730000009`): `id, unit_id, order_index, word, definition, example_sentence, l1_translation` (Simplified Chinese), `phonetic` (IPA), `part_of_speech, image_prompt, image_url, audio_url` (word TTS), `example_audio_url` (sentence TTS), `distractors JSONB, confusables JSONB`, UNIQUE `(unit_id, word)`.

**`grammar_rules`** (`20260730000003`): `id, unit_id, order_index, rule, explanation, examples JSONB, pattern_template, transformation_pairs JSONB` (`[{original, transformed}]`), `error_examples JSONB` (`[{wrong, correct}]`), UNIQUE `(unit_id, rule)`.

**`story_pages`** (`20260729000004`): `id, unit_id, page_number, text, speaker, speaker_character_id` (→characters), `speaker_override_name, image_prompt, image_asset_id, audio_asset_id`, UNIQUE `(unit_id, page_number)`.

**`story_comprehension_questions`** (same migration): `id, unit_id, story_page_id, question, options JSONB, answer_index INT` (0-based), `order_index`.

**`dialogue_lines`** (`20260730000001`): `id, unit_id, order_index` (global), `dialogue_index, speaker_character_id, speaker_override_name, text` (L2), `translation` (L1), `audio_asset_id`, UNIQUE `(unit_id, order_index)`.

**`characters`** + **`unit_characters`** (`20260729000003`): book-level recurring cast. `characters`: `id, book_id, name, role, description, personality, look_prompt TEXT` (reusable visual description for image-gen consistency), `reference_image_asset_id, voice_id TEXT` (ElevenLabs voice for cross-unit audio consistency), UNIQUE `(book_id, name)`. `unit_characters`: PK `(unit_id, character_id)`.

> **Note on `character_ledger`.** Despite the name, `character_ledger` is for **student avatar cosmetics** (via GamificationService), NOT lesson characters. The migration explicitly warns it was NOT repurposed. Lesson characters live in `characters`. Its emptiness is unrelated to the content pipeline.

### `assets` + `unit_media` — generated media
`assets`: `id, unit_id, type TEXT` CHECK `('image','audio','video')`, `prompt, prompt_hash TEXT` (sha256, for dedup), `storage_path, public_url, metadata JSONB, owner_id, book_id, kind` (`'generated'|'uploaded'|'external_url'`), `source_url, tags TEXT[], is_deleted BOOL`. Unique partial index on `(prompt_hash, type) WHERE prompt_hash IS NOT NULL`.
`unit_media`: PK `(unit_id, asset_id, role)`. `role` is an open vocabulary: `'song'|'video'|'cover'|'story_page_image'|'vocab_image'|'character_portrait'|'dialogue_audio'|'generated'|'audio'`. Enables media reuse across units.

### `srs_items` — the LearnerState (FSRS spaced repetition)
`id, student_id TEXT` (**NULL = template row seeded at publish time**), `word, translation`, legacy SM-2 fields (`interval, repetition, efactor, next_review`), FSRS fields (`stability NUMERIC, difficulty NUMERIC, reps INT, lapses INT`), `mastery_state TEXT` CHECK `('new','learning','familiar','mastered','decaying')`, `objective_id UUID` (→objectives, the skill-graph link), `last_review, mastery_meta JSONB`.

### `activity_type_registry` — the declarative content→activity map
PK `(learning_object_type, activity_type)`. `learning_object_type` ∈ `('vocabulary','grammar','story','dialogue')`, `activity_type` = an exercise_type, `generator_key TEXT` (documentation-only — which builder produces it). Seeded to the 16 current outputs. **A filter, not a driver** — the builders are hardcoded and called unconditionally; the registry is permissive (emits everything if empty).

### The shared contract — `types/exercise.ts` (read this in full)

This 349-line file is the **unified contract** between the live board (Track A) and the student app (Track B). It defines `ExerciseType` (the 15-value union), `ExerciseContent` (the discriminated union of 15 content shapes), `PoolItem`, `toPoolItem(row)` (narrows a raw DB row), `BaseExerciseProps` / `ExerciseResult` (the self-completing exercise contract for the student app), and `ExerciseRegistry`. The Deno edge function has its own mirror (`_shared/exerciseTypes.ts`) because Deno and the bundler can't share a module root. **These two must stay in sync.**

The `PoolItem` shape (what games consume):
```ts
export interface PoolItem {
  id: string;
  unit_id: string;
  objective_id: string;
  exercise_type: ExerciseType;
  difficulty: 1 | 2 | 3;
  content: ExerciseContent; // discriminated union; `type` mirrors exercise_type
}
```

### `useBoardPool` — how board games pull pool items

`apps/board/useBoardPool.ts`. Every pool-driven board game calls this:
```ts
useBoardPool({ unitId, exerciseTypes, classWeak, roster, limit })
```
It (1) optionally computes a **class-weak-first ordering** via `classWeakObjectives(roster, unitId)` (aggregates FSRS retrievability across the roster's claimed profiles — surfaces the words the class struggles with most), (2) queries `pool_items` filtered by `unit_id` + `exerciseTypes`, capped by `limit`, (3) sorts by the weak ordering. Returns `{ items: PoolItem[], loading, weakOrder }`.

> **This hook is the integration point.** A redesigned game that wants richer content either (a) passes more `exerciseTypes` to pull from, or (b) consumes `items` more intelligently (escalating difficulty, mixing modalities). The hook already supports class-weak-first adaptation — most games don't meaningfully use `weakOrder`.

---

## §E — The live-class loop & SessionContext

### The realtime architecture (why it's fragile)

The three tabs converge via **two Supabase Realtime channels**:
- `classroom_live` (broadcast, event `classroom_action`) — the command bus. **Uses `broadcast: { self: false }`**, meaning the sender does NOT receive its own broadcast. Therefore **every sender must also do an optimistic local `setState`** or its own tab won't reflect the change. This is a documented, recurring footgun — the SessionContext code contains inline comments documenting "weeks of bugs" from forgetting this.
- `classroom_session_sync` (postgres_changes on the `classroom_sessions` table) — how the board/remote follow the commander's slide/status changes.

### The pick → play → score → next loop (step by step)

1. **Enter slide.** `activeSlideData` = current flow step. `quickWheelWinner` is null → the game is in **practice/choral mode** (no per-student scoring). The board shows the game fresh.
2. **Pick (teacher).** Teacher taps Spin (commander "Now answering"→Next Student, sidebar wheel, remote Baton "Spin", or a roster chip "Pick"). This calls `selectNextStudent` / `magicSelectStudent` / `nextStudent`.
3. **Wheel reveal.** `SPIN_WHEEL` broadcast → overlay opens on all tabs (`BoardOverlayLayer` spins ~2s, reveals the winner card).
4. **Auto-dismiss + turn start (2500ms later).** SessionContext fires `GAME_WIN` (confetti) + `NEW_TURN` (sets `currentTurnId` — the games' reset signal) + `DISMISS_WHEEL` (hides overlay). The picked student is now "live."
5. **Play.** The game (freshly reset for this student) is interacted with. Board games self-evaluate.
6. **Score.** Wrong attempt → game calls `addPoints(picked, -MISTAKE_PENALTY)` + bumps `mistakesRef` + `gradeStudent(...,false)`; success → `addPoints(picked, scoreForAttempt(mistakes))` + `gradeStudent(...,true)`, shows personalized overlay.
7. **Next.** Teacher taps "Next Student →" → `nextStudent()` → `CLEAR_RESPONDER` + auto-spin → back to step 3.

> **The load-bearing rule.** "Hide the wheel overlay" (`DISMISS_WHEEL`) is **decoupled** from "end the turn" (`CLEAR_RESPONDER`). Conflating them caused the historical "nothing happens after a pick" bug. `DISMISS_WHEEL` only hides the popup and *keeps* the responder; `CLEAR_RESPONDER` clears the responder and ends the turn.

### SessionContext — the state + action vocabulary

`store/SessionContext.tsx` (~1086 lines). The games consume `useSession()`. Key state fields (`SessionState`):

| Field | Purpose |
|---|---|
| `status` | `'IDLE'\|'LIVE'\|'PAUSED'` |
| `currentStepIndex` | Active slide in `activeUnit.flow` |
| `activeSlideData` | The current flow step `{type, data, phase, teacherGuide, ...}` |
| `activeUnit` | In-memory snapshot of the unit being taught (frozen at go-live, never hot-patched) |
| `activeClassId` / `activeOccurrenceId` | The live class + open attendance occurrence |
| `students` | Roster (roster-first when a class is bound), unified points |
| `selectionMode` | `'RANDOM'\|'FAIR'\|'ELIMINATION'\|'ROUND_ROBIN'` (**default `ROUND_ROBIN`**) |
| `turnsThisExercise` | Strict per-exercise round-robin tracker; reset on slide change |
| `lastAction` | Most-recent broadcast — games subscribe to this for remote controls |
| `quickWheelWinner` | **The picked responder id. null = choral/practice mode (no scoring).** |
| `currentTurnId` | **Game-lifecycle signal** — changes on each `NEW_TURN`; games key reset effects on this |
| `activeOverlay` | `'NONE'\|'QUICK_WHEEL'\|'LEADERBOARD'` |
| `pointsLog` | Local append-only log of point awards |

Key methods (the "action vocabulary"):

- **Lifecycle:** `loadUnits`, `loadStudents`, `setActiveClass`, `setActiveUnit`, `startSession`, `endSession`, `nextSlide`/`prevSlide`/`goToSlide`.
- **Scoring:** `addPoints(studentId, amount)` (broadcast + optimistic + debounced ledger write to `point_transactions`; clamps at 0; confetti if >0), `deductAllPoints(amount)` (the "quiet mode too loud" mass penalty), `gradeStudent(studentId, word, correct)` (writes FSRS for **claimed** students only), `gradeObjective(studentId, unitId, objectiveId, correct, modality)`.
- **Pick loop:** `selectNextStudent(filterTeam?, useOverlay=true)` (the auto-picker — see modes below), `magicSelectStudent(studentId)` (manual pick), `nextStudent()` (one-tap "advance the whole loop" = `CLEAR_RESPONDER` then auto-spin), `cancelTurn()` (back to choral), `assignTeams(count=2)`, `setSelectionMode(mode)`.
- **Generic command bus:** `triggerAction(type, payload?)` (broadcast any action + optimistic `lastAction` set; fires confetti if type is a win), `triggerConfetti()`.

Selection modes (`selectNextStudent`):
- `ROUND_ROBIN` (default, strict per-exercise): prefers `turnsThisExercise` remaining; resets when all have gone.
- `RANDOM`: uniform random.
- `FAIR`/`ELIMINATION`: least-recently-picked via `selectionHistory`.

After picking, `selectNextStudent` broadcasts `SPIN_WHEEL`, optimistic update, then after **2500ms** fires `GAME_WIN` + `NEW_TURN` + `DISMISS_WHEEL` together and sets `currentTurnId` locally.

### The broadcast reducer (what each action does on receipt)

`WINNER_DECLARED`/`GAME_WIN`/`CELEBRATE` → confetti. `LIVE_SNAP` → set image. `END_SESSION` → IDLE. `DISMISS_WHEEL` → `activeOverlay=NONE` only (keeps responder). `CLOSE_OVERLAY` → `activeOverlay=NONE` + clears responder/turn (**destructive alias** — don't confuse with `DISMISS_WHEEL`). `CLEAR_RESPONDER` → clear responder+turn. `NEW_TURN` → set `currentTurnId`. `SPIN_WHEEL` → overlay + winner + history. `POINTS_AWARDED` → points + confetti. `MASS_PENALTY` → deduct all.

### The 4 things every game MUST do (the lifecycle contract)

This is the canonical contract from `LIVE_GAME_LIFECYCLE.md`. Any new/redesigned game must satisfy all four:

1. **Reset on new turn.** A `useEffect` keyed on `state.currentTurnId` that reshuffles/resets the board for the newly-picked student. (Pitfall: keying on `lastAction` instead resets constantly.)
2. **Track mistakes with `useRef`.** Plus an `awardedRef` latch so a turn pays the success bonus exactly once.
3. **Score via `addPoints` + `scoreForAttempt`.** Wrong = `−MISTAKE_PENALTY` live (real-time feedback); success = `max(0, CLEAN_SCORE − mistakes×PENALTY)`.
4. **Personalize the success message** via `usePickedStudent()` (`apps/board/templates/usePickedStudent.ts`), which resolves `quickWheelWinner` → `{id, name, avatar}`.

The canonical ref pattern (verbatim from `BoardFlashMatch.tsx:65-75`):
```ts
const mistakesRef = useRef(0);
const awardedRef = useRef(false);
// mistakesRef mirrors mistakes state so closures read the live value
```

### Where results get written

- **Class points:** `addPoints` → debounced `awardClassPoints` → `point_transactions` insert (`source='board_points'`). The unified class-points ledger.
- **Cognitive/FSRS:** `gradeStudent` (board games on each attempt) and the remote's manual Correct/Wrong → `recordAttempt` → upsert on `srs_items` (`student_id, objective_id`) with FSRS scheduled `stability/difficulty/reps/lapses/next_review/mastery_state`. **Only claimed students** (have a `claimed_profile_id`) get cognitive writes; unclaimed roster students get points only.
- **Attendance:** `endSession` → ends the attendance occurrence.

> **Key separation (owner decision).** Class points (`point_transactions`) and home XP (`student_progress`) are **kept separate**. `getSessionRoster` sums them into the unified `points` shown on the board. Board cognitive writes go to the **same** `srs_items` as the async student app — "one learner model, two tracks."

---

## §F — The scoring model

The scoring logic lives in `apps/board/templates/scoringDefaults.ts` (75 lines). There are **two coexisting models** — a source of confusion Claude should resolve.

### Model 1 — the per-pick model (the one actually used by the good games)

The full code:
```ts
export const CLEAN_SCORE = 30;
export const MISTAKE_PENALTY = 5;

export function scoreForAttempt(mistakes: number): number {
  return Math.max(0, CLEAN_SCORE - mistakes * MISTAKE_PENALTY);
}
```

Semantics: **one scored exercise per picked responder.** A clean success (no mistakes during that turn) = 30 pts. Each wrong attempt during the turn = −5 pts (deducted live via `addPoints(id, -MISTAKE_PENALTY)` so the running leaderboard reflects the cost immediately). On success, the student earns `max(0, 30 − mistakes × 5)`. Net for a 2-mistake success = −5 −5 +30 = +20.

Used by: `BoardFlashMatch`, `BoardListenTap`, `BoardUnscramble`, `BoardStorySequencing`, `BoardSpeedQuiz`, `BoardGrammarPractice`.

**`BoardTeamBattle` is EXCLUDED** (team-vs-team, separate scoring).

### Model 2 — the per-step constant map (legacy, mostly dead)

```ts
export const CORRECT_ANSWER_POINTS: Record<string, number> = {
  SPEED_QUIZ: 10, TEAM_BATTLE: 15, LISTEN_TQUIP: 5, FLASH_MATCH: 8,
  UNSCRAMBLE: 10, STORY_SEQUENCING: 10, GRAMMAR_PRACTICE: 10,
};
export function pointsForCorrect(stepType): number { ... }
```

Described as legacy/override. **`pointsForCorrect` is called by NO board game** (verified by grep — only `BoardTeamBattle` uses a flat `+15`, hardcoded). This is dead code that creates **two sources of truth** for "points for a correct answer." A maintainability trap.

### The cognitive capture path (separate from points)

- `gradeStudent(studentId, word, correct)` (`services/boardLearner.ts:203`) — writes FSRS learner state, **receptive modality**, vocab-shaped.
- `gradeObjective(studentId, unitId, objectiveId, correct, modality)` (`services/boardLearner.ts:181`) — used by `BoardGrammarPractice` for rule-shaped objectives, **productive modality**.

These are the *learning* signals; `addPoints` is the *gamification* signal. They run alongside each other but write to different places (`srs_items` vs `point_transactions`).

### Known scoring UX problems

1. **Points clamp at 0 hides the deduction signal.** `addPoints` clamps the displayed total at 0 (`Math.max(0, …)`) on both the optimistic update and the reducer. A kid at 0 who gets −5 sees no visible change on the roster chip or leaderboard (the popup does show "−5," but the running score doesn't go negative). The "cost" of mistakes is invisible to low-scorers.
2. **No re-pay indication.** A single student can play many rounds of ListenTap in one turn; only the *first* correct pays the clean score (the `awardedRef` latch). But the UI gives the teacher no indication that re-paying is blocked — the kid keeps "winning" with no score change.
3. **Several games don't score at all** (see §G — `BoardWhatsMissing`, `BoardMagicEyes`, `BoardISayYouSay`, all presentation templates).

---

## §G — Per-game inventory + critique

There are **22 flow types**. Below, each is described with its mechanic, data source, whether it scores, and a critique. The "scored?" column refers to per-student pick→score lifecycle scoring.

### Quick-reference table

| `step.type` | Component | Phase | Scored? | Pool type hardcoded | Lines |
|---|---|---|---|---|---|
| `INTRO_SPLASH` | BoardIntroSplash | WARMUP | — | — | 77 |
| `LIVE_WARMUP` | BoardLiveClassWarmup | WARMUP | — | — | 113 |
| `MEDIA_PLAYER` | BoardMediaPlayer | WARMUP/INPUT | — | — | 241 |
| `FOCUS_CARDS` | BoardFocusCards | INPUT | — | vocab manifest | 305 |
| `STORY_STAGE` | BoardStoryStage | OUTPUT | — | story manifest | 210 |
| `DIALOGUE_STAGE` ⚠ | BoardDialogueStage | OUTPUT | — | dialogue manifest | 142 |
| `GRAMMAR_SANDBOX` | BoardGrammarSandbox | INPUT | — | — | 155 |
| `I_SAY_YOU_SAY`/`SPEAKING` | BoardISayYouSay | PRACTICE | **No** (choral) | SPEAK_SENTENCE pool | 162 |
| `MAGIC_EYES` | BoardMagicEyes | PRACTICE | **No** | content-provided | 101 |
| `WHATS_MISSING` | BoardWhatsMissing | PRACTICE | **No** | IMAGE_SELECT pool | 166 |
| `UNSCRAMBLE`/`SCRAMBLE` | BoardUnscramble | PRACTICE | **Yes** | WORD_BANK_BUILD | 284 |
| `STORY_SEQUENCING` | BoardStorySequencing | PRACTICE | **Yes** | story manifest | 231 |
| `FLASH_MATCH` | BoardFlashMatch | PRACTICE | **Yes** | MEANING_MATCH | 330 |
| `LISTEN_TAP` | BoardListenTap | PRACTICE | **Yes** | LISTEN_SELECT | 383 |
| `GRAMMAR_PRACTICE` | BoardGrammarPractice | PRACTICE | **Yes** (1-sided) | ERROR_SPOT+TRANSFORM | 231 |
| `SPEED_QUIZ` | BoardSpeedQuiz | ASSESS | **Yes** | MEANING_MATCH | 327 |
| `TEAM_BATTLE` | BoardTeamBattle | ASSESS | **Yes** (flat +15) | MEANING_MATCH | 387 |
| `WHEEL_OF_DESTINY` | BoardWheelOfDestiny | (picker) | — (selects responder) | — | 226 |
| `GAME_ARENA` | BoardGameArena | (picker) | — (decorative +50) | — | 240 |
| `UNIT_SELECTION` | BoardUnitSelection | (pre-session) | — | — | 144 |
| `POLL` ⚠ | *(none — dead type)* | — | — | — | — |

All under `apps/board/templates/` (absolute path: `/home/e/Documents/DEV/teacher app/professor-0.1 (1)/apps/board/templates/`).

### The 6 "real" scored games (the core of the audit)

#### BoardFlashMatch — `BoardFlashMatch.tsx` (330 lines)
- **Mechanic:** Match word→definition pairs. Click a left tile, then a right tile; correct pair locks in, wrong pair shakes and costs −5. Win when all matched.
- **Data:** Frozen `data.pairs` OR pool `MEANING_MATCH` items (class-weak-first), max 6 pairs, deduped by `objective_id`.
- **Scoring:** Full `scoreForAttempt(mistakes)` + live `−MISTAKE_PENALTY`. Personalized message: `${pickedStudent.name} nailed it! +N pts`.
- **Polish:** High — the cleanest reference implementation. Handles pool/frozen, `[turnId]` reshuffle, ref-mirror for mistakes to avoid stale closures.

**Critique — the canonical "one mechanic forever" problem.** FlashMatch is welded to `MEANING_MATCH` (word→L1-meaning). It will *never* show word→image, word→example-sentence, word→IPA, or L1→word. For a vocabulary game, this is a glaring lack of variety: a class that plays FlashMatch every lesson sees the *exact same cognitive operation* (recognize the L1 translation) every time. There is no escalation from receptive recognition to productive recall. The match metaphor could support image matching, audio matching, antonym/synonym matching, category sorting — none of which are wired.

#### BoardListenTap — `BoardListenTap.tsx` (383 lines)
- **Mechanic:** Listen-and-choose. Audio auto-plays, options appear after 3 s, student taps the image matching the audio. Streaks (🔥 x3/x5/x10), class-whisper cue ("🤫 全班：小声说答案！"), next-student preview.
- **Data:** Frozen `data.options/audioUrl/targetWord` OR pool `LISTEN_SELECT` items, class-weak-first.
- **Scoring:** First-correct = `scoreForAttempt(mistakes)`; wrong = `−MISTAKE_PENALTY` + `gradeStudent` (receptive).

**Critique.** Good production polish (phases, streaks, bilingual cues) but welded to `LISTEN_SELECT` (audio→image). No path to audio→word, audio→L1, or word→audio (productive direction). The streak system is decorative — it doesn't change difficulty, content, or scoring.

#### BoardUnscramble — `BoardUnscramble.tsx` (284 lines)
- **Mechanic:** Sentence-building. Tap word tiles from the bank to place them in a drop zone; "Check Answer" compares `placedWords.join(' ')` to the target. Punctuation-stripped comparison.
- **Data:** Frozen `data.words` + `data.targetSentence` OR pool `WORD_BANK_BUILD`.
- **Scoring:** Full lifecycle.

**Critique.** Mechanically fine but a *single* sentence-construction task. No variation: no fill-in-the-blank, no transformation (make it negative/question), no error-correction variant, no progression from short to long sentences. The "check" is binary exact-match — no partial credit for "almost right" (e.g., right words, wrong order), no targeted feedback on *which* tile is misplaced.

#### BoardStorySequencing — `BoardStorySequencing.tsx` (231 lines)
- **Mechanic:** Arrange story panels in narrative order. Click source cards → fill numbered slots; "Check Answer" verifies `slot.order === index`. Wrong → incorrect slots emptied back to source.
- **Data:** Frozen `data.cards` OR `getStory(state.activeUnit.manifest).pages`.
- **Scoring:** Full lifecycle. Grades via `gradeStudent(picked, unitId, 'story_sequencing', correct)` (objective string is a literal).

**Critique.** A reasonable recall task but detached from the story's *content* — it tests "can you remember the page order," not "did you understand the story." No comprehension question tie-in (the `story_comprehension_questions` table exists but is only consumed by `STORY_COMPREHENSION` pool items, which no board game renders — see the dead-content note in §H).

#### BoardSpeedQuiz — `BoardSpeedQuiz.tsx` (327 lines)
- **Mechanic:** Timed multiple-choice. State machine `ready → answering → reveal → results`. 15 s per question, shaped answer tiles (▲ ◆ ● ■), timer ring, streak counter, explanation after reveal. Stars (1–3) on results.
- **Data:** Frozen `data.questions` OR pool `MEANING_MATCH` (class-weak). Question text: `What does "${prompt}" mean?` with bilingual `cn` field.
- **Scoring:** Per-question wrong = `−MISTAKE_PENALTY`; quiz completion = `scoreForAttempt(mistakes)`.

**Critique.** The best-polished game, but pedagogically narrow: every question is "What does X mean?" with L1 options — the *same* receptive operation as FlashMatch, just timed. No grammar questions, no sentence-completion, no audio questions, no "choose the correct word," no differentiation by objective type. The timer adds urgency but not cognitive variety.

#### BoardGrammarPractice — `BoardGrammarPractice.tsx` (231 lines)
- **Mechanic:** Teacher-led grammar error-spotting / transformation. Shows prompt + 2–4 options; **teacher taps "Reveal Answer" then "Credit [student]"** to mark correct.
- **Data:** Pulls `ERROR_SPOT` + `TRANSFORM` pool items directly via `supabase.from('pool_items')` (bypasses `useBoardPool` — minor inconsistency).
- **Scoring:** `creditSelected(correct)` calls `gradeObjective(..., 'productive')` then `scoreForAttempt(0)` on correct.

**Critique — this is not a game.** It is a teacher-operated flashcard reveal. The "Reveal Answer → Credit" flow means **the student never interacts** — the teacher shows the answer, then decides whether to credit the picked student. There's no student attempt, no mistake tracking from student input, no feedback loop. The wrong-credit branch exists in code (lines 138–142) but is **unreachable from the UI** (only a "Credit" button is shown, line 209–215). This is the entire "grammar practice" strand, and it is the weakest part of the system. See §H.

### BoardTeamBattle — `BoardTeamBattle.tsx` (387 lines)
- **Mechanic:** Team tic-tac-toe + quiz. Countdown → question + 15 s timer → correct claims a cell, wrong gives the other team a steal → 3-in-a-row wins. Split-screen rosters (Red/Blue) + 3×3 grid.
- **Data:** Frozen `data.questions` OR pool `MEANING_MATCH`.
- **Scoring:** Flat `+15` per correct (uses the legacy `pointsForCorrect`, the *only* consumer). `gradeStudent` on every answer. Win triggers `triggerConfetti()`.

**Critique.** High production value (the only team-based game, full state machine with steal/switch/reset remotes). But same content narrowness — `MEANING_MATCH` only. And the only team game: there's no team vocabulary race, team sentence building, team grammar duel. The tic-tac-toe framing is good but the underlying quiz is the same receptive MCQ.

### Presentation / input templates (no per-answer scoring — teacher-led)

#### BoardFocusCards — `BoardFocusCards.tsx` (305 lines)
- **Mechanic:** Vocabulary presentation. Grid of 5 cards → drill view with 4-stage staged reveal (image+word → audio glyph → IPA+Chinese+definition → example sentence). Marks words "studied" at stage 4.
- **Critique.** A reasonable PPP "Presentation" stage. But purely teacher-paced, no comprehension check, no choral repetition capture. The "studied" mark is a binary flag with no learning signal.

#### BoardStoryStage — `BoardStoryStage.tsx` (210 lines)
- **Mechanic:** Storybook reader. Hook card → full-bleed pages with floating glass dialogue panel → comprehension-check closer. Target vocab highlighted gold/underlined. Speaker avatars per character.
- **Critique.** Beautiful presentation but the "comprehension check closer" is not wired to the comprehension-questions table — it's a generic prompt. No scoring, no per-student capture. A missed opportunity: the story is the natural place for narrative comprehension questions, but those exist only as pool items no board game consumes.

#### BoardDialogueStage — `BoardDialogueStage.tsx` (142 lines)
- **Mechanic:** Dialogue role-play / read-aloud. Title card → one line at a time with speaker attribution + per-speaker accent color → "Your Turn!" role-play card. Bilingual.
- **Critique.** Good scaffolding but **no scoring and no role assignment** — the "Your Turn!" card doesn't actually assign roles to students or capture anything. A dialogue role-play with no role-tracking and no pronunciation capture is just a read-along.

#### BoardGrammarSandbox — `BoardGrammarSandbox.tsx` (155 lines)
- **Mechanic:** **Passive grammar-rule presentation.** Rule name + explanation + flip-through example cards (click to reveal/collapse). Nav dots + Previous/Next footer.
- **Critique.** This is a static reference card. No interactivity, no examples generated into a practice task, no form-to-function demonstration. The `pattern_template` and `transformation_pairs` fields on `grammar_rules` are *generated by enrich-unit* but **never surface here** — Sandbox only shows `rule`, `explanation`, and `examples[]` as static strings. This is the "confusing grammar presentation" the owner flagged: it shows a rule and some example sentences, with no way to *see the rule in action* (transform a sentence, spot the error, fill the pattern).

#### BoardMediaPlayer — `BoardMediaPlayer.tsx` (241 lines)
- Karaoke video/audio player (synced highlighting) or YouTube fallback. No scoring.

#### BoardLiveClassWarmup — `BoardLiveClassWarmup.tsx` (113 lines)
- **Critique.** Low-polish scaffold: fake video progress bar (no real video element), unused `RotateCcw` import, `Volume2` button with no handler. A placeholder masquerading as a feature.

#### BoardIntroSplash — `BoardIntroSplash.tsx` (77 lines) — title screen, display only.
#### BoardUnitSelection — `BoardUnitSelection.tsx` (144 lines) — unit picker grid. The only board rendered without a `data` prop.

### Mini-games / pickers (no vocab scoring)

#### BoardWheelOfDestiny — `BoardWheelOfDestiny.tsx` (226 lines)
- Student-picker roulette. Conic-gradient wheel, ticker flapper, 16-LED chasing rim, 3-phase spin animation, fairness panel (✓/○ round-robin roster). **Selects the responder**; scoring happens in whatever game follows.
- **Critique.** Well-built. But the fairness panel is display-only — it doesn't *enforce* fairness, just shows it.

#### BoardGameArena — `BoardGameArena.tsx` (240 lines)
- **Critique.** An **older duplicate** of the wheel-of-destiny concept (SVG slice paths, not conic gradient). The "+50 XP Bonus" winner overlay is **decorative text, not actually awarded**. Superseded by `BoardWheelOfDestiny`. Should be consolidated or removed.

#### BoardWhatsMissing — `BoardWhatsMissing.tsx` (166 lines)
- **Mechanic:** Memory game. 4×2 grid of image cards shown for 10 s (memorize), then one hidden, student recalls, teacher taps "Reveal Answer."
- **Critique — a PRACTICE-phase recognition game with NO scoring wired.** No `addPoints`, no `gradeStudent`. Surprising gap. Also the recall is teacher-verified ("Reveal Answer"), not student-attempted — there's no way for the student to actually *input* their answer; the teacher just reveals.

#### BoardMagicEyes — `BoardMagicEyes.tsx` (101 lines)
- **Mechanic:** Flash an image for N seconds, blur it, ask a question, teacher reveals the answer.
- **Critique.** No scoring, content-provided (not pool-driven), shows empty state if `data.image` missing. A thin scaffold.

#### BoardISayYouSay — `BoardISayYouSay.tsx` (162 lines)
- **Mechanic:** Choral listen/repeat drill. Toggle "Listen" (teacher) / "Repeat" (students). Target word emphasized. Fake waveform.
- **Critique — the "choral cop-out."** Scores nobody, captures nothing. A listen-repeat drill with no per-student pronunciation capture (the `evaluate-pronunciation` function exists and could be used, but isn't). In a live class, the teacher has no idea who actually repeated correctly.

---

## §H — Cross-cutting failure modes (the four problem areas)

Organized by the owner's four emphasis areas.

### H1 — The grammar gap (the most severe problem)

**There is no grammar game in Professor.** This is the single biggest pedagogical hole. What exists:

- **`BoardGrammarSandbox`** — passive, read-only presentation of `{rule, explanation, examples[]}` as static strings. No interactivity. The rich grammar fields (`pattern_template`, `transformation_pairs`, `error_examples`) are **generated by `enrich-unit` but never displayed** — Sandbox ignores them.
- **`BoardGrammarPractice`** — a teacher-operated reveal-and-credit screen, not a game. The student never attempts anything; the teacher reveals the answer and decides whether to credit. The wrong-credit branch is unreachable from the UI.

**What's missing entirely:**
- No transformation game (take a sentence, make it negative / question / past tense).
- No pattern-formation game (fill the slot in a pattern template with the right form).
- No error-spotting game where the *student* finds and fixes the error.
- No graduated practice (recognize the rule → apply it in a controlled frame → produce it freely).
- No connection between the grammar presentation (Sandbox) and the grammar practice (Practice) — they don't share state, so the student can't see "here's the rule, now here's the rule in action."

**Why this matters.** Grammar is the structural backbone of language acquisition. A live class with no grammar reinforcement has no way to move students from "I know some words" to "I can build sentences." The pool already generates `ERROR_SPOT`, `TRANSFORM`, and grammar-flavored `WORD_BANK_BUILD` items — the content exists, the games to consume it don't.

### H2 — The no-variety / no-repetition problem

**Every scored game is welded to exactly one exercise type, forever:**
- FlashMatch ≡ MEANING_MATCH (word→L1 meaning)
- ListenTap ≡ LISTEN_SELECT (audio→image)
- SpeedQuiz ≡ MEANING_MATCH (word→L1 meaning, timed)
- TeamBattle ≡ MEANING_MATCH (word→L1 meaning, team)
- Unscramble ≡ WORD_BANK_BUILD (sentence assembly)
- WhatsMissing ≡ IMAGE_SELECT (image recall, unscored)

**Consequences:**
- A class that plays FlashMatch and SpeedQuiz in the same lesson is doing the **exact same cognitive operation twice** (recognize the L1 translation of a word), just with different chrome.
- There is **no escalation** within a game: no path from receptive (recognize) to productive (recall/produce). A student who has matched "apple→苹果" 20 times is not being asked to *produce* "apple" from "苹果," or to *use* "apple" in a sentence.
- There is **no multi-skill round**: no game mixes vocab + grammar + sentence tasks.
- The **receptive→productive spiral** that the type system *promises* (the `difficulty` 1/2/3 and `modality` receptive/productive fields exist on pool items) is **never exploited** by any game. The mastery-driven selection (`pickForObjective`: new→receptive→constrained→free) exists in the student app but **no board game uses it**.
- Replayability is zero: a game re-shuffles the same small pool, so a class sees the same items in slightly different orders.

**What "good" would look like.** A vocabulary game that, across rounds, escalates: round 1 image→word (receptive), round 2 word→image (receptive, reversed), round 3 audio→word, round 4 L1→L2 productive recall, round 5 use-in-a-sentence. Same shell, escalating payloads, driven by class mastery (the `weakOrder` already computed by `useBoardPool`).

### H3 — The live-class UX flow problems

- **Dead contextual controls for the two reference games.** Neither `FLASH_MATCH` nor `LISTEN_TAP` appears as a `case` in `ContextualControls.tsx` or `TeacherRemote.tsx`'s `renderActivityControls`. The contextual control bar under the commander preview falls through to the `default` case → "Presenter Mode Active" (a dead placeholder) for these two types. The games still function (they self-score and have in-board buttons), but the teacher has **no dedicated remote control bar** for them — inconsistent with every other game type.
- **Broken selection-mode toggle.** `SidebarPanel.tsx` only exposes `FAIR` and `RANDOM`, but the `SessionContext` default is `ROUND_ROBIN` (a third, stricter mode the UI never shows). So the teacher can never select the actual default behavior, and the labels shown don't match what's running. `ELIMINATION` is a fourth value never set anywhere.
- **Hardcoded analytics.** `SidebarPanel.tsx` shows "Class Accuracy 85%" as a hardcoded string. The "Struggling Students" list is just `points < 50`, which conflates "few points" with "struggling" and is gameable (a quiet correct kid has few points).
- **The wheel's permanent placeholder.** `BoardOverlayLayer.tsx` shows "+? XP Waiting…" after every spin — it is never updated with the actual award (which happens later inside the game). Permanently misleading.
- **No slide-complete signal.** Display-only templates (FocusCards, StoryStage, MediaPlayer) have no per-student scoring and no completion signal. The teacher manually drives `NEXT_CARD`/`NEXT_PANEL` and must remember to hit the bottom-deck next-arrow. There's no "slide complete / advance" affordance.
- **Manual vs auto-advance inconsistency.** `BoardListenTap` auto-advances phases on timers and has a "Next Round" button for the *same* responder, while the teacher's "Next Student" loop is separate. The mental model (one scored attempt per pick) is not enforced or communicated.
- **`endSession` doesn't clear `activeClassId`.** A subsequent "Launch Live" without re-picking a class reuses the old class binding silently.

### H4 — Pedagogical soundness

- **No skill-acquisition model.** The PPP phases (WARMUP/INPUT/PRACTICE/OUTPUT/ASSESS) are *tagged* on flow blocks but not *enforced* or *used* — there's no logic that ensures an OUTPUT (free production) block actually asks for production, or that a PRACTICE block escalates toward OUTPUT. The tags are decorative.
- **No error-driven feedback loops.** When a student errs, the system deducts points and records the mistake in FSRS, but it doesn't **re-present the item**, **offer a corrective explanation**, or **cycle the class back** to the weak item. The class-weak-first ordering is computed but not acted on pedagogically.
- **No comprehension tied to stories/dialogues.** `story_comprehension_questions` and `WHO_SAID_IT`/`DIALOGUE_ROLEPLAY` pool items exist, but **no board game renders them**. The story is presented and then abandoned; the dialogue is read and then abandoned. Output-phase games that test narrative understanding don't exist.
- **No productive-output capture for most games.** Only `BoardGrammarPractice` (1-sided) and `BoardUnscramble` (sentence assembly) ask for any production. Speaking, writing, free-sentence formation — none captured.
- **The "choral" cop-out.** `BoardISayYouSay` and the speaking strand score nobody. The rationale ("choral, can't identify individuals") is reasonable for pure repetition, but the system has `evaluate-pronunciation` (Levenshtein-based) and a `SPEAK_SENTENCE` pool type — the infrastructure for per-student speaking capture exists and is unused on the board.
- **Binary right/wrong, no partial credit.** Every scored game is binary: correct or mistake. No partial credit for "almost right" (right words wrong order in Unscramble, right phoneme wrong stress in speaking). This is both pedagogically blunt and demotivating.
- **Scoring doesn't reflect difficulty.** A receptive image-tap and a productive sentence-build both pay the same `CLEAN_SCORE=30`. The `difficulty` 1/2/3 field on pool items is ignored by scoring.

---

## §I — Drift, dead code, and gaps

| Issue | Location | Impact |
|---|---|---|
| `DIALOGUE_STAGE` has a fully-implemented component but is **missing from `BoardRenderer.tsx` `BOARD_MAP`** AND **missing from `SUPPORTED_FLOW_TYPES`**. Preview is broken; AI flow validation would drop it. | `BoardRenderer.tsx:31-53`; `flowTypes.ts:35-58` | The dialogue board silently fails in the commander preview and could be stripped by the flow validator. |
| `POLL` is in `SUPPORTED_FLOW_TYPES` but has **no Board component and no render entry** anywhere. | `flowTypes.ts:51` | Dead type — falls through to "Unknown Slide Type." |
| `BoardGameArena` is an **older duplicate** of `BoardWheelOfDestiny`. Its "+50 XP Bonus" is decorative (not awarded). | `BoardGameArena.tsx:231` | Confusion; two wheel components. |
| `pointsForCorrect` / `CORRECT_ANSWER_POINTS` legacy map is **dead code** (only TeamBattle uses a hardcoded +15). | `scoringDefaults.ts:24-41` | Two sources of truth for "points for a correct answer." |
| **Two parallel render switches** (`ClassroomBoard.tsx` vs `BoardRenderer.tsx` `BOARD_MAP`) that must mirror each other but **don't exactly**. | both files | Drift-prone; DIALOGUE_STAGE already drifted. |
| `BoardGrammarPractice` **bypasses `useBoardPool`** and queries `supabase` directly. | `BoardGrammarPractice.tsx:40-44` | Inconsistent with every other pool-driven game; loses class-weak-first ordering. |
| `BoardWhatsMissing` and `BoardMagicEyes` are PRACTICE-phase games with **no scoring wired at all**. | whole files | Students play, nothing is captured. |
| `BoardLiveClassWarmup` is a low-polish scaffold (fake video progress, unused imports, non-functional buttons). | `BoardLiveClassWarmup.tsx` | Ships as a "feature." |

---

## §J — What "good" looks like (the design bar)

This is the bar Claude's redesign should meet. Each game should be a **real skill-acquisition instrument**, not a chrome wrapper around one mechanic.

1. **Receptive→productive escalation.** A vocabulary game that escalates across rounds: recognize (image→word) → recognize reversed (word→image) → comprehend (audio→word) → recall (L1→L2) → produce (use in a sentence). Driven by class mastery — the `weakOrder` from `useBoardPool` and the FSRS state in `srs_items` should decide what to surface next.

2. **Grammar as a first-class strand.** A real grammar game where the *student* transforms sentences, spots errors, fills patterns — not a teacher-operated reveal. Graduated: see the rule (presentation) → recognize correct usage (controlled) → apply it (production). Connected to `BoardGrammarSandbox` so the rule and its practice share context.

3. **Variety within a shell.** One game shell should consume multiple payload types. FlashMatch could match word→image, word→L1, word→example, audio→image. SpeedQuiz could mix vocab, grammar, sentence-completion, audio questions. The decoupling the architecture promises should be *delivered*.

4. **Error-driven feedback.** When a student errs, re-present the item with a hint or a narrower choice; offer a corrective micro-explanation; cycle the class back to weak items. The mistake should teach, not just penalize.

5. **Honest, difficulty-aware scoring.** Productive tasks score higher than receptive; partial credit for "almost right"; the `difficulty` field on pool items feeds the award. Points reflect learning, not just speed.

6. **A coherent teacher flow.** Every game has a remote control bar; the pick→play→score→next loop is consistent and visible; slide-complete signals exist; analytics reflect real accuracy from `srs_items`/`point_transactions`, not hardcoded numbers.

7. **Story & dialogue as output, not just input.** Comprehension questions tied to the story; role-play with role assignment and (optional) pronunciation capture; the rich narrative content actually tested, not just presented.

8. **No dead chrome.** Every game scores (or is explicitly and defensibly choral). No decorative "+50 XP" overlays, no fake video bars, no unreachable code branches.

9. **Respect the lifecycle contract.** The 4 must-dos (reset on new turn, track mistakes with refs, score via `addPoints`+`scoreForAttempt`, personalize the message) are non-negotiable for any scored game — they're what make the live loop work.

10. **Designed for the projector + teacher-remote model.** Single-input, teacher-driven, class-visible. (If Claude wants to propose student-device features, that's a flagged architecture decision, not a default.)

---

## Appendix — How to read this audit with the codebase

If Claude later gets repo access, the file map (all absolute paths under `/home/e/Documents/DEV/teacher app/professor-0.1 (1)/`):

- **Lifecycle doc:** `LIVE_GAME_LIFECYCLE.md` (the canonical contract — the 4 must-dos, the wiring checklist, the skeleton).
- **Command bus + state:** `store/SessionContext.tsx`
- **Scoring math:** `apps/board/templates/scoringDefaults.ts`
- **Picked-student resolver:** `apps/board/templates/usePickedStudent.ts`
- **Board router:** `apps/board/ClassroomBoard.tsx`
- **Board frame:** `apps/board/BoardShell.tsx`
- **Wheel/points/quiet overlay:** `apps/board/templates/BoardOverlayLayer.tsx`
- **Commander (teacher desktop):** `apps/teacher/LiveCommander.tsx`
- **Commander preview renderer + BOARD_MAP:** `apps/teacher/live/panels/BoardRenderer.tsx`
- **Commander contextual controls:** `apps/teacher/live/panels/ContextualControls.tsx`
- **Commander sidebar:** `apps/teacher/live/sidebar/SidebarPanel.tsx`
- **Remote (Baton):** `apps/remote/TeacherRemote.tsx`
- **Pool hook:** `apps/board/useBoardPool.ts`
- **Reference game (match):** `apps/board/templates/BoardFlashMatch.tsx`
- **Reference game (listen):** `apps/board/templates/BoardListenTap.tsx`
- **Grammar (the gap):** `apps/board/templates/BoardGrammarSandbox.tsx`, `BoardGrammarPractice.tsx`
- **Cognitive capture service:** `services/boardLearner.ts`
- **FSRS write path:** `services/learnerState.ts` (`recordAttempt`)
- **Exercise/PoolItem contract:** `types/exercise.ts`
- **Edge functions:** `supabase/functions/{extract-page,enrich-unit,orchestrate-lesson,generate-exercises,generate-media,evaluate-pronunciation}/index.ts`
- **Flow type allow-list:** `supabase/functions/_shared/flowTypes.ts`
- **Migrations:** `supabase/migrations/` (65 files; the schema in §D cites the specific migration for each table)

— *End of audit. Prepared 2026-08-04 for design handoff.*
