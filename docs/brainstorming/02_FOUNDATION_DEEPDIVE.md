# Foundation Deep-Dive — Pipeline Integrity, Data Model, and Editor Consolidation

> **Audience:** external architecture advisor. This is the highest-stakes document in the package: it covers the three decisions that gate *everything else*. Read `01_COMPREHENSIVE_AUDIT.md` first for the overall picture; this file goes deep on the foundation.
>
> **Two forks are OPEN and we want your recommendation** (§2 data model, §3 editor consolidation). **Pipeline integrity (§1) is a concrete fix list**, not a fork — those bugs must be repaired regardless of any architecture decision.

---

## §1. Pipeline integrity (the bugs that starve the rest)

These three issues are why "the latest generated unit shows no games/exercises." They are factual bugs with verified fixes; we list them so you can factor their repair into your architecture recommendation, but **the fix is not in question — only how it fits the larger design**.

### 1.1 The NULL-owner asymmetry (Bug B1)

The textbook-scan pipeline creates units **without a `teacher_id`**, but only one of the three content functions rejects that.

**Verified chain:**

| Step | Code | Behavior |
|---|---|---|
| Unit created at upload | `apps/teacher/UploadTextbook.tsx:331` | `.insert({ ..., status:'Draft', flow:[], scanned_assets:[aiData] })` — **no `teacher_id`** |
| `enrich-unit` owner check | `supabase/functions/enrich-unit/index.ts:41-43` | `if (unit.teacher_id && unit.teacher_id !== auth.userId) return ...` — **tolerates NULL** (short-circuits) |
| `orchestrate-lesson` owner check | `supabase/functions/orchestrate-lesson/index.ts:313` | same tolerant pattern — **tolerates NULL** |
| `generate-exercises` owner check | `supabase/functions/generate-exercises/index.ts:229-231` | `if (!unit.teacher_id || unit.teacher_id !== auth.userId) return 'You do not own this unit'` — **rejects NULL** |
| Fire-and-forget trigger | `orchestrate-lesson/index.ts:495-506` | detached `fetch` to `generate-exercises`, errors only `.catch`-logged |

**Net effect:** enrichment succeeds, the flow is built, `srs_items` vocab templates are seeded — but the call that would have written `objectives` and `pool_items` (the *playable* exercises) silently dies. Every board game that reads the pool then shows its "generate the pool for this unit" empty state.

**The design tension the comment admits** (`generate-exercises/index.ts:225-228`): the strict guard was a hardening to stop any authenticated caller from regenerating the pool and triggering paid image/TTS generation on a unit they don't own. The tolerant guards in the siblings were left as-is. So the asymmetry is **intentional but inconsistent** — and the textbook path (the primary creation flow) creates NULL-owner units that the strict function can never process.

**Repair is unavoidable, but the *shape* matters for your recommendation:**
- (a) Stamp `teacher_id` at creation (`UploadTextbook.tsx:331` + `Engine.createUnit` already does this at `services/SupabaseService.ts:106-108`), **or**
- (b) Make `generate-exercises` tolerant like its siblings and enforce payment/ownership elsewhere.
- We lean (a) for correctness, but want your view on whether the ownership model should be tightened project-wide (a single helper) as part of the foundation work.

### 1.2 The "never-fed" production pool (Bug B1b) — *(replaces an earlier, incorrect "deploy gap" finding)*

> **Correction (2026-07-29):** An earlier draft of this section (and `01` §2.1 item 2) claimed the Stage-3 relational layer was "not deployed to cloud," citing `AGENTS.md` §3. **That was wrong.** We trusted a stale doc instead of verifying. Verified directly against production via the Supabase Management API:

**Verified cloud state (2026-07-29):**
- **All 65 migrations are applied** on cloud — including `objectives`, `pool_items`, the evolved `srs_items` (FSRS columns), hearts, RLS hardening (`20260628000000`–`05`), *and* all 21 July roster/attendance/live-board migrations (`20260715000001`–`20260726000004`). `supabase_migrations.schema_migrations` has 65 rows; newest `20260726000004`.
- **All 12 edge functions are deployed**, including `generate-exercises` (it returns 401, not 404).
- All 11 key content tables exist (`units`, `objectives`, `pool_items`, `srs_items`, `assets`, `character_ledger`, `schools`, `roster_students`, `attendance_records`, `classroom_sessions`, `point_transactions`).

**So the layer is fully deployed. The real problem is that it has never been *fed* (Bug B1b):**

| Table | Rows on cloud | Meaning |
|---|---|---|
| `units` | 87 | Content generation works (extract-page + enrich-unit) |
| `objectives` | **0** | `generate-exercises` has never written a single skill node |
| `pool_items` | **0** | Zero playable exercises exist, for any unit, ever |
| `assets` | **0** | No generated image/audio ever recorded (vault is empty) |
| `character_ledger` | **0** | Confirms the orphan-table finding (Gap G3) |
| `srs_items` | 144 templates, **0 per-student, 0 linked to objective** | Vocab templates exist but orphaned; no student has ever practised |

**This sharpens the diagnosis of §1.1 (Bug B1):** the NULL-owner bug explains why *textbook* units get no pool, but it does *not* explain why the 12 owned-and-Active units with real `flow`s also have zero `pool_items`. That points to a **deeper reliability problem with the fire-and-forget trigger** (`orchestrate-lesson/index.ts:495-506`) — cold-start drops, a missing auth header on the non-awaited detached fetch, or those units were orchestrated before the function was deployed and never re-orchestrated. Either way, `generate-exercises` has effectively been dead in production since launch, and the failure is silent (`.catch`-logged only).

**Implication for your recommendation:** the fix is not "deploy" (already deployed). It is (a) stamp `teacher_id` on textbook units + backfill the 14 NULL-owner ones (Bug B1), **and** (b) make the `generate-exercises` trigger *reliable and observable* (re-run on demand, surface status to the teacher, retry on failure). This connects directly to open question F1-Q2 in `03` §5 (orchestration as a resumable pipeline vs fire-and-forget) — we'd welcome your design there.

`AGENTS.md` §3 has been corrected (2026-07-29) to reflect this verified state.

> Deploy mechanics are out of scope for your recommendation, but be aware: deploys go through the Supabase Management API (server-side) or the pooler connection string — the direct Postgres host hits a TLS-EOF blocker in this environment (`AGENTS.md` §9). Any migration-heavy proposal should keep migrations idempotent and ordered.

### 1.3 The manifest dual-shape bug (Bug B7 / Gap G6)

Two producers write **two different sub-blobs** inside `units.manifest`, and they don't carry the same fields.

**The two shapes** (defined in `services/manifest.ts:1-16`, `types/pipeline.ts:103-130`):

```
manifest.enriched_content   ← written by enrich-unit (FULL)
  vocabulary[]: { word, definition, example_sentence, l1_translation,
                  phonetic, image_prompt, image_url, image_status,
                  audio_url, example_audio_url, distractors, confusables, ... }
  grammar[], characters[], story{title,setting,pages[]},
  song_suggestions[], video_suggestions[], dialogues[]

manifest.knowledge_graph    ← written ONLY by AssetWorkshop at orchestrate time (REDUCED)
  vocabulary[]: { word, definition, image_prompt, context_sentence, distractors }
                 ↑ NO image_url, NO audio, NO phonetic, NO l1_translation, NO confusables
  grammar_rules[]: { rule, explanation, world_examples }
  characters[], narrative_arc
```

**The projection drops `image_url`** at `apps/teacher/AssetWorkshop.tsx:350-353`. So any editor that reads `knowledge_graph.vocabulary` (notably `UnitContentVault.tsx:81-84`) shows blank images forever, even though `enriched_content.vocabulary[].image_url` and `assets.public_url` both hold the real image.

**A normalizer exists** — `normalizeManifest()` at `services/manifest.ts:126` (priority: `enriched_content` → `knowledge_graph` → flat) — and the live board uses it correctly (`services/manifest.ts` accessors). But several editors read raw sub-blobs instead of going through it (`LessonStudio.tsx:49-51`, `UnitContentVault.tsx:81`). The client normalizer is mirrored server-side at `supabase/functions/_shared/manifest.ts`.

**This is a structural smell, not just a bug:** having two shapes that can drift means data can be silently lost whenever a consumer reads the wrong one. **Whatever data model you propose, we'd want a single canonical read contract** (the normalizer, or a single source table).

---

## §2. OPEN FORK F1 — The data model for generated content

This is the central architectural fork. **We want your recommendation.** We present the current reality and three directions neutrally, with the trade-offs that matter for *this* product.

### 2.1 Current reality

Almost all generated content lives in **one JSONB column** (`units.manifest`). Only two categories got a relational mirror:

| Category | JSONB home | Relational home | Played by Stage 3? |
|---|---|---|---|
| Vocabulary | `manifest.enriched_content.vocabulary[]` | `objectives(type='vocabulary')` → `pool_items` (12 types) → `srs_items` | ✅ Yes |
| Grammar | `manifest.enriched_content.grammar[]` | `objectives(type='grammar')` → `pool_items` (ERROR_SPOT/TRANSFORM/...) | ⚠️ Conditional (needs `error_examples`/`transformation_pairs`) |
| Phonics | (some) | `objectives(type='phonics')` | partial |
| **Story** | `manifest.enriched_content.story{pages[]}` | **none** | Display-only (`BoardStoryStage`) |
| **Song** | `manifest.enriched_content.song_suggestions[]` | **none** (YouTube search URL only) | ❌ No exercise type |
| **Video** | `manifest.enriched_content.video_suggestions[]` | **none** (YouTube search URL only) | ❌ No exercise type |
| **Dialogue** | `manifest.enriched_content.dialogues[]` | **none** | ❌ No flow type, no consumer |
| **Characters** | `manifest.enriched_content.characters[]` | **none** (`character_ledger` exists but orphaned — see `06_SUBSYSTEM_CHARACTERS.md`) | Display-only |
| **Level / target-age** | `manifest.meta.difficulty_cefr`, `enriched_content.gradeLevel` | **none** | n/a (deferred L2) |

The `objectives.type` CHECK constraint literally forbids story/song/dialogue: `type IN ('vocabulary','grammar','phonics')` (`supabase/migrations/20260628000000_objectives_table.sql:18`). The exercise-type union (`types/exercise.ts:20-32`) has no story-comprehension or dialogue types. The Board flow-type allow-list (`supabase/functions/_shared/flowTypes.ts`) has no DIALOGUE type.

**The relational pattern that already works** (vocab): `objectives` (one row per skill node, FK→unit) → `pool_items` (one row per exercise instance, FK→objective, `exercise_type` + `difficulty` + `content` JSONB) → `srs_items` (FSRS learner state, FK→objective). This is clean, queryable, dedup-able (`objectives_unit_type_target_key` unique index), and consumed identically by the board (`useBoardPool`) and the student app (`poolService`).

### 2.2 Three directions (neutral)

**Direction A — Extend the relational pattern to all content categories.**
Story pages, song/video assets, and dialogue turns become addressable entities (their own tables or extended `objectives`/`pool_items` types), with the manifest kept as a denormalized cache for fast reads. New objective types (`story`, `dialogue`, ...) and new exercise types (story-sequencing-already-exists-as-a-board-type-but-has-no-producer, comprehension-MCQ, dialogue-roleplay, song-fill-in-the-blank, ...). Characters move to a book-level library (per locked L1) and are *referenced* by objectives/flow.

- *Enables:* real per-item editing, per-category games, cross-unit reuse, querying/analytics ("which words is this class weakest on"), a unified FSRS learner model across all skills, the character library, and a real media vault (assets become first-class).
- *Cost:* the largest change. New migrations, a generation pipeline that emits relational rows for every category (not just vocab), a backfill for existing units, and a read/write contract that replaces "edit a JSONB blob" with "edit rows + invalidate cache."
- *Risk:* over-engineering if some categories (song/video) are genuinely better as pure media references than as skill nodes.

**Direction B — Keep JSONB, fix the bugs, add UI coverage.**
Keep `units.manifest` as the single source of truth. Fix B1/B1b/B7/G6. Add editor JSX for grammar/story/song/video/dialogue. Leave characters and the library as separate concerns.

- *Enables:* the fastest path to "the Knowledge Graph shows everything and is editable."
- *Cost:* makes the things *this product specifically needs* harder long-term — cross-unit character reuse (L1), a queryable media vault, per-category analytics, and any future "adapt to level" work (L2). JSONB editing also has weaker concurrency/validation than row-level edits.
- *Risk:* technical debt that resurfaces the moment we build characters, the vault, or analytics.

**Direction C — Hybrid, AI-proposed.**
You propose the split: which categories are relational (skill nodes that feed games + FSRS), which are media/asset references (song, video, maybe story-as-narrative), and which stay document-shaped (e.g. teacher notes, theme context). Justify each by the product need (editing, querying, cross-unit reuse, playability).

- *Our lean:* C, leaning toward A for anything that should be *played* or *tracked*, and media-reference shape for song/video. But we want your independent reasoning, not just our lean.

### 2.3 The questions we want answered for F1

1. **Which categories should be relational skill nodes (feed `objectives`/`pool_items`/`srs_items`) vs. media/asset references vs. document JSONB?** Give us a per-category verdict with rationale, especially for: story (narrative vs. comprehension objectives), song, video, dialogue, characters, grammar.
2. **Where do characters and media live in your model**, given L1 (cross-unit characters) and the library/vault ambition (see `05_SUBSYSTEM_LIBRARY_VAULT.md`)? Are `character_ledger` and `assets` the right anchors, or do you propose new entities (e.g. a `books` table that owns characters)?
3. **What's the read/write contract?** A single canonical normalizer over a denormalized cache? A view? Row-level CRUD with a manifest cache invalidated on write? We want one source of truth, not two drifting shapes (the B7/G6 smell).
4. **How does generation emit your model?** Today `enrich-unit` writes JSONB; `generate-exercises` is the only relational emitter. Should *all* generation write relationally, with the manifest as a derived cache? Should orchestration be a resumable pipeline rather than fire-and-forget (see `03_SUBSYSTEM_GENERATION_PIPELINE.md`)?
5. **Migration story for existing units** (they have JSONB content, some have empty pools). How do we reconcile without losing teacher edits?

> **Sequencing note:** F1 should be decided *before* F2 (editor consolidation), because "edit a story/character/song" means different things depending on whether those are rows or JSONB keys.

---

## §3. OPEN FORK F2 — Authoring UI consolidation

The teacher's mental model is simple — *"review and edit my unit, then arrange and run a live lesson."* The codebase implements this across **four overlapping editors** with inconsistent data contracts. **We want your proposal for the target shape.**

### 3.1 The four editors today

| Editor | File | Route | Reads | Saves | Discoverability |
|---|---|---|---|---|---|
| `LessonStudio` | `apps/teacher/LessonStudio.tsx` | `/teacher/studio` | `useSession()` → `activeUnit.manifest`/`.flow` | ✅ `saveUnit` → `units` | Only via deep-link or **after exiting a live session** |
| `LessonTimelineBuilder` | `apps/teacher/LessonTimelineBuilder.tsx` | `/teacher/timeline-builder` | **nothing** (hardcoded mock) | ❌ Save button no onClick | **Plan icon destination** (primary entry → dead end) |
| `UnitContentVault` | `apps/teacher/UnitContentVault.tsx` | `/teacher/unit-vault/:id` | `manifest.knowledge_graph` + `flow` | ✅ `Engine.updateUnit` | Card **Edit** icon (least discoverable, most capable) |
| `AssetWorkshop` | `apps/teacher/AssetWorkshop.tsx` | embedded only | `manifest.enriched_content` (ALL categories) | ✅ (writes both shapes) | **Only** post-upload (`UploadTextbook.tsx:381`); unreachable later |

**Field-name inconsistencies** (symptom of no shared contract):
- `LessonTimelineBuilder`: `{ id, type, title, duration, category }` (TimelineItem)
- `LessonStudio`: `{ id, type, title, duration, assetType, status, data }` (TimelineBlock)
- DB `units.flow`: `{ id?, type, title?, duration?, data, teacherGuide?, phase }` (22-type allow-list)
- `UnitContentVault` reads `knowledge_graph.vocabulary` (no `image_url`); `AssetWorkshop` reads `enriched_content.vocabulary` (has `image_url`).

**Routing reality** (`apps/teacher/TeacherDashboard.tsx:56-62`, `:245-256`): the **Plan** button and **New Unit** both route to `LessonTimelineBuilder` (the mock). The real builder (`LessonStudio`) is orphaned. The most capable editor (`UnitContentVault`) is hidden behind a card icon. The all-category editor (`AssetWorkshop`) vanishes after first run.

### 3.2 The concrete fix (not in question)

Regardless of consolidation: **the Plan/New-Unit routes must stop pointing at the mock.** And `AssetWorkshop` must be reachable from the unit list for re-review/re-enrichment (G2). These are bugs (B5/G2), not architecture.

### 3.3 Three directions (neutral)

**Direction A — One unified "Unit Studio".**
Replace all four editors with a single surface with two modes: a **Knowledge Graph editor** (all categories, editable, with a media-picker and character-picker) and a **Timeline/session composer**, both fed from the canonical data model (F1). Plan, Edit, and post-live-exit all open the same place. Cleanest mental model; biggest upfront refactor.

**Direction B — Studio + keep a first-run Workshop.**
Preserve `AssetWorkshop` as a distinct *"review AI enrichment right after upload"* step (approve/toggle generated items), then route all ongoing editing (Plan, Edit, post-live) into one unified Studio. This keeps the approve-then-edit flow that already exists and matches how a teacher first encounters generated content.

**Direction C — AI-proposed.**
You propose the information architecture: how many surfaces, what each is for, and the navigation graph between curriculum → unit → review/edit → compose → run live. In particular, we'd like your view on whether "review/edit content" and "arrange the timeline" are *one* surface or *two*, and where the live-session-exit landing should go.

### 3.4 The questions we want answered for F2

1. **Propose the target authoring IA.** How many surfaces, their purpose, and the navigation between them. Where do Plan, Edit, and post-live-exit land?
2. **Are "edit content" and "arrange timeline" one surface or two?** Today they're tangled (`LessonStudio` toggles; `UnitContentVault` is content-only; the timeline mock is arrange-only).
3. **What happens to `AssetWorkshop`?** First-run-only approval step, or folded into the unified editor? (We lean keep-as-first-run, but want your view.)
4. **What's the shared data contract** so we stop having four field-name conventions? (Tied to F1's read/write contract.)
5. **Mobile.** Today mobile Plan routes to `LessonEditor`, an explicit empty stub whose "Go to Lesson Studio" button just calls `onBack` (`apps/teacher/LessonEditor.tsx`). Should mobile get a reduced version of the same surface, or stay read-only? Brief recommendation.

---

## §4. How F1 and F2 interact (and what to decide first)

- **F1 (data model) should be decided before F2 (editor consolidation).** "Edit a story" or "pick a character" is a different UI depending on whether those are rows you reference or keys in a blob.
- Both should be decided before any per-subsystem design (Knowledge Graph UI, Library/Vault, Characters), because those subsystems *implement* the data model and *live inside* the authoring surface.
- **Pipeline integrity (§1) is independent** and can/should be repaired in parallel — it's a concrete bug list, not a fork. We'd start there regardless of architecture, because until B1/B1b are fixed, *no* design can be validated end-to-end in production.

---

## §5. Summary ask for the advisor

1. **Recommend F1** (per-category data-model verdict + read/write contract + generation emission + migration).
2. **Recommend F2** (authoring IA + the shared data contract + AssetWorkshop's fate + mobile).
3. **Sanity-check our repair ordering**: integrity bugs (§1) first, then F1, then F2, then subsystems.
4. Keep the two **locked decisions** in mind: characters are cross-unit/book-level (L1), and educational-AI level differentiation is deferred (L2) — don't propose foundational work that conflicts with either.

*All `file:line` references verified against source at audit time (2026-07-29).*
