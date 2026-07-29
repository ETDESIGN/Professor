# Subsystem Deep-Dive — Stage 1: Generation Pipeline

> **Audience:** external architecture advisor. This maps **what the generation pipeline actually does today**, edge-function by edge-function, and where each generated category *lands* and *dies*. The integrity bugs (NULL-owner, cloud gap, dual-manifest) are summarized here and detailed in `02_FOUNDATION_DEEPDIVE.md` §1.
>
> Read `01_COMPREHENSIVE_AUDIT.md` for the overall picture. This file feeds open fork **F1** (data model) — see the questions in §5.

---

## 1. Mental model: there is no "class creation" pipeline, only a "unit creation" pipeline

A common source of confusion: **classes and units are decoupled.** The `classes` table is just a teacher-owned roster (code + enrollments) and plays **no role** in content generation. When we say "create a class/unit," the content-generation trigger is really **unit creation from a scanned textbook page**. There is no orchestrator that runs at *class* creation. Everything below is the **unit** pipeline.

The pipeline's output lands in essentially two places:
- **One JSONB blob:** `units.manifest` (almost everything).
- **A relational path** that exists only for vocabulary (and conditionally grammar): `objectives` → `pool_items` → `srs_items`.

This single fact — *"only vocab/grammar got the relational treatment"* — is the heart of open fork F1.

---

## 2. Edge-function-by-edge-function

All functions are Deno edge functions wrapped by `supabase/functions/_shared/edgeHandler.ts`. They call **OpenRouter** (region-safe only: Moonshot Kimi K2.6 → Qwen3-235B → DeepSeek, with vision variants Qwen3-VL-235B / Qwen2.5-VL-72B). OpenAI/Google/Anthropic are forbidden by hard rule.

### 2.1 `extract-page` — vision OCR / page analysis ✅
- **File:** `supabase/functions/extract-page/index.ts`
- **Input:** `imageBase64` XOR `fileUrl` XOR `imageUrl` (`:13-24`).
- **AI:** vision models via `fetchChatCompletion` — Qwen3-VL-235B → Qwen2.5-VL-72B → Qwen3-VL-32B (`:88-92`).
- **Output / tables:** returns `{ success, url, metadata:{ extractedText, topic, gradeLevel, vocabulary[], learning_objectives[], exercises[], visual_context, ... } }` to the caller. **Writes nothing to the DB itself** (`:146-161`) — the client stores it into `units.scanned_assets` (JSONB). Writes `llm_telemetry`.
- **Role:** Stage-0 ingestion. This is the *input* to `enrich-unit`.
- **Called from:** `apps/teacher/UploadTextbook.tsx:248, 302`.

### 2.2 `enrich-unit` — the AI content generator (by category) ✅
- **File:** `supabase/functions/enrich-unit/index.ts` (391 lines).
- **Input:** `{ unitId, category }`, category ∈ `{ vocabulary, grammar, characters, story, media, dialogues, all }` (`:16`, switch `:191-220`).
- **AI:** Kimi K2.6 / Qwen3-235B / DeepSeek-R1 via `callAI` (`:69-185`). Category-specific JSON shapes (`expectedOutputFormat`); variant-key normalization (`vocab`→`vocabulary`, `songs`→`song_suggestions`, etc.).
- **Media:** sets **placeholder DiceBear URLs** for vocab (`image_status:'pending'`, `:251-256`) and characters (`:289-293`); generates **TTS audio** per word + per example sentence via `generateAndStoreAudio` (`:263-287`) → ElevenLabs → `generated-media` bucket. **Does not generate real images.**
- **Tables written:** **`units.manifest` only.** Atomically merges per category into `manifest.enriched_content.{vocabulary|grammar|characters|story|song_suggestions|video_suggestions|dialogues}` (`:296-365`). Also updates `units.title`/`units.topic`.
- **Owner check:** tolerant — `if (unit.teacher_id && ...)` short-circuits for NULL (`:41-43`). ✅ works for textbook units.
- **Gap:** produces **7 categories**, all into the same JSONB. **None** become `objectives`/`pool_items`/`character_ledger`/`assets` rows.

### 2.3 `orchestrate-lesson` — flow builder + publisher + pool trigger ✅
- **File:** `supabase/functions/orchestrate-lesson/index.ts`.
- **Input:** `{ unitId, approvedAssets }` (`:276-281`). Falls back to stored `units.manifest` if payload empty.
- **AI:** Kimi K2.6 / Qwen3-235B to assemble a `flow`/`timeline` of Board blocks (prompt `PROMPTS.orchestration`, `:323-359`); deterministic fallback `transformManifestToFlow` (`:35-252`, invoked `:429`); validated/normalized by `validateAndNormalizeFlow` (`_shared/flowTypes.ts:78`).
- **Tables written:**
  - `units.flow = <flow blocks>` and `units.status = 'Active'` (`:451-454`).
  - **`srs_items` template rows:** deletes prior NULL-student rows for the unit, inserts one per vocab word `{ word, translation, unit_id, student_id:null }` (`:460-484`). **Note: created without `objective_id`** — backfilled only if `generate-exercises` later runs (`generate-exercises/index.ts:317-330`).
  - `llm_telemetry`.
- **Fire-and-forget trigger:** after persisting, issues an **un-awaited** `fetch` to `generate-exercises` (`:495-506`) to avoid wall-clock kills.
- **Owner check:** tolerant (`:313`). ✅ works for textbook units.
- **Flow types it can emit:** INTRO_SPLASH, MEDIA_PLAYER, FOCUS_CARDS, LISTEN_TAP, TEAM_BATTLE, FLASH_MATCH, SPEAKING, SCRAMBLE, GRAMMAR_SANDBOX, GRAMMAR_PRACTICE, STORY_STAGE. PRACTICE/ASSESS types get `poolDriven:true` (`:226-233`) — meaning the Board pulls real items from `pool_items` at runtime.

### 2.4 `generate-exercises` — the games/exercises engine ❌ (the broken link)
- **File:** `supabase/functions/generate-exercises/index.ts` (377 lines). **Deterministic — no LLM call.**
- **Input:** `{ unitId }` (`:213`).
- **Media:** generates **one real image per word** via `generateAndStoreImage` (concurrency 3, `:245-256`), then writes upgraded `image_url` + `image_status:'ready'` back into `units.manifest.enriched_content.vocabulary` (`:260-273`). Provider = Pollinations (flux) by default, proxied into `generated-media`, deduped via `assets.prompt_hash`.
- **Tables written:**
  - **`objectives`** — one per vocab word (`type='vocabulary'`) + one per grammar rule (`type='grammar'`); reconciled across re-runs (`:276-313`).
  - **`pool_items`** — the exercise pool. Atomic insert-then-retire (`:332-359`). Types (`_shared/exerciseTypes.ts:6-19`): IMAGE_SELECT, MEANING_MATCH, AUDIO_L1_SELECT, LISTEN_SELECT, SPELL_CLOZE, WORD_BANK_BUILD, ERROR_SPOT, TRANSFORM, DICTATION, MINIMAL_PAIR_SWIPE, TYPE_TRANSLATE, SPEAK_SENTENCE.
  - Backfills `objective_id` onto existing NULL-student `srs_items` (`:317-330`).
- **Owner check:** **STRICT — rejects NULL owner** (`:229-231`). ❌ fails for textbook units. **This is Bug B1.**
- **Cloud status:** **Deployed** (returns 401, not 404). ✅ — *but* verified 2026-07-29 it has **never produced data**: `objectives`/`pool_items`/`assets`/`character_ledger` all have **0 rows** for all 87 units. The NULL-owner rejection (below) blocks textbook units; for owned units the fire-and-forget trigger has never succeeded. **This is Bug B1b** (the function is live but unfed). (An earlier audit draft claimed it was not deployed — that was based on a stale `AGENTS.md`; corrected.)
- **Significance:** this is the *only* function that turns generated content into **playable** exercises. Double-broken today.

### 2.5 `generate-media` — manual media tool ✅ (with a region caveat)
- **File:** `supabase/functions/generate-media/index.ts`.
- **Input:** `{ action, unitId, prompt, text, query, images, audios }`. Actions: `generate-image`, `generate-audio`, `batch`, `youtube-search` (`:27-69`).
- **Media:** image via `generateAndStoreImage` (Pollinations/flux), audio via `generateAndStoreAudio` (ElevenLabs). `youtube-search` returns **only a search URL** (the YouTube Data API is region-blocked — `:57-66`).
- **Tables:** writes `assets` (via the dedup path), uploads to `generated-media` bucket. Returns URLs to caller; **does not write to `units` directly.**
- **Called from:** `apps/teacher/AssetWorkshop.tsx:142` (per-item image gen loop), `apps/teacher/UnitContentVault.tsx:163`.

### 2.6 `generate-lesson` — legacy/standalone ⚠️ (superseded)
- **File:** `supabase/functions/generate-lesson/index.ts`.
- **Input:** `{ topic, gradeLevel, documentContext, imageBase64 }` OR `{ action:'differentiate', text, theme }` (`:14-25, 29-31`).
- **AI:** Kimi/Qwen. Returns a `textContent` JSON + Dicebear image. **Writes nothing to DB** (only `llm_telemetry`).
- **Called from:** `services/LessonTransformer.ts:9` (the `differentiate` mode) — an alternate path, **not** wired into the textbook pipeline.

### 2.7 `_shared/` modules (contracts worth knowing)
- `manifest.ts` — the **canonical normalizer** (mirrored client-side at `services/manifest.ts`). Reduces 3 manifest shapes into one `CanonicalManifest`. Priority: `enriched_content` → `knowledge_graph` → flat. **This is the read contract for Stage 2/3.**
- `exerciseTypes.ts` — the 12 Core-v1 exercise types + `buildChoices`/`shuffle`.
- `flowTypes.ts` — the 22-type Board allow-list + `validateAndNormalizeFlow` + Phase tags.
- `imageGen.ts` / `imageProvider.ts` — image gen, default Pollinations (flux), proxied to storage, dedup via `assets.prompt_hash`. Falls back to DiceBear SVG on failure (`imageGen.ts:51,78,100`).
- `tts.ts` — ElevenLabs → `generated-media` bucket.

---

## 3. The exact trigger path (frontend → functions → tables)

Entry: `/teacher/upload` → `apps/teacher/UploadTextbook.tsx` (mounted `TeacherDashboard.tsx:247`).

```
1. Teacher uploads page(s)
   → extract-page per file (UploadTextbook.tsx:248/302)
   → returns metadata{extractedText, vocabulary[], ...}

2. On first successful extract, INSERT a draft unit:
   supabase.from('units').insert({
     title: 'Draft Unit ...', topic:'Uploaded Material', level:'General',
     status:'Draft', lessons:1, flow:[], scanned_assets:[aiData]
   })                       ← UploadTextbook.tsx:331
   ⚠️ NO teacher_id set     ← root of Bug B1

3. Teacher clicks "Review & Enrich"
   → mounts AssetWorkshop (UploadTextbook.tsx:381) with unitId
   → AssetWorkshop.loadExistingEnrichment() (AssetWorkshop.tsx:75)
   → if missing, calls enrich-unit ONCE PER CATEGORY, sequential, 1.5s spacing
     (AssetWorkshop.tsx:222-280). Each call AI-generates one category and
     merges into manifest.enriched_content.

4. Background media loop in AssetWorkshop (AssetWorkshop.tsx:113-193)
   → fires generate-media (action:'generate-image') for any vocab/character
     with image_status==='pending'; persists image_url + image_status:'completed'
     back into manifest.enriched_content.

5. Teacher clicks "Build Lesson" → handleOrchestrate (AssetWorkshop.tsx:324)
   → writes a NEW knowledge_graph sub-blob into units.manifest
     (AssetWorkshop.tsx:345-366)  ⚠️ drops image_url (Bug B7)
   → calls orchestrate-lesson (AssetWorkshop.tsx:368)

6. orchestrate-lesson
   → writes units.flow + status='Active'
   → writes srs_items vocab templates (no objective_id yet)
   → fire-and-forgets generate-exercises (orchestrate-lesson/index.ts:495-506)

7. generate-exercises (IF not rejected, IF deployed)
   → writes objectives + pool_items
   → backfills objective_id onto srs_items templates
   → upgrades vocab image_url in manifest.enriched_content
```

> Alternate path: `Engine.createUnit` (`services/SupabaseService.ts:388`, exposed via `hooks/useQueries.ts:69` `useCreateUnit`) **does** set `teacher_id` (`SupabaseService.ts:106-108`) — but it's a manual title-only creator, **not** the textbook-scan pipeline. So the primary creation flow is the NULL-owner one.

---

## 4. Category fate — where each piece of generated content lands and dies

| Category | Generated by | Lands in | Becomes playable? | Dies where? |
|---|---|---|---|---|
| **Vocabulary** | enrich-unit | `manifest.enriched_content.vocabulary[]` → (generate-exercises) → `objectives` + `pool_items` (12 types) + `srs_items` | ✅ Yes (board + student) | Only if B1/B1b unfixed (verified: 0 rows today) |
| **Grammar** | enrich-unit | `manifest.enriched_content.grammar[]` → (generate-exercises) → `objectives` + `pool_items` (ERROR_SPOT/TRANSFORM/...) | ⚠️ Conditional | Zero pool items if enriched data lacks `error_examples`/`transformation_pairs`; no grammar SRS content |
| **Phonics** | (some) | `objectives(type='phonics')` allowed | partial | — |
| **Story** | enrich-unit | `manifest.enriched_content.story{title,setting,pages[{text,speaker,image_prompt,comprehension_questions}]}` | ❌ Display-only (`BoardStoryStage`) | `generate-exercises` **ignores story entirely** — no STORY_SEQUENCING/comprehension pool items, despite `comprehension_questions` being generated with options+answers. No `objectives.type='story'` (CHECK forbids it). |
| **Song** | enrich-unit (`media` cat.) | `manifest.enriched_content.song_suggestions[]` (YouTube **search query**) | ❌ | Becomes a `MEDIA_PLAYER` flow block holding a search URL. No storage table, no asset, no exercise. Region-blocked YT API → no embed. |
| **Video** | enrich-unit (`media` cat.) | `manifest.enriched_content.video_suggestions[]` (YouTube **search query**) | ❌ | Same as song. No per-unit video library. |
| **Dialogue** | enrich-unit | `manifest.enriched_content.dialogues[]` | ❌ | **No consumer renders dialogues as a board activity.** No DIALOGUE flow type (`flowTypes.ts:35-58`); `transformManifestToFlow` never emits one. Effectively dead data. |
| **Characters** | enrich-unit | `manifest.enriched_content.characters[]` (DiceBear placeholders) | ❌ (display-only) | `character_ledger` table exists with a perfect schema but **no producer writes to it**. `BoardStoryStage` reads characters from JSONB for speaker avatars. Character images never upgraded to real. See `06_SUBSYSTEM_CHARACTERS.md`. |
| **Level / target-age** | extract-page returns `gradeLevel` | `units.level` (free text) + `manifest.meta.difficulty_cefr` + `enriched_content.gradeLevel` | n/a | **No `levels` table, no target-age column, no FK.** Not used to adapt exercises (deferred L2). |

**The pattern:** vocab is fully wired; grammar conditionally; **everything else is JSONB-only and dead beyond passive display.** The relational infrastructure (objectives/pool_items) was built for vocab/grammar and never extended.

---

## 5. Open questions for the advisor (feeds F1)

These assume you've read `02_FOUNDATION_DEEPDIVE.md` §2.

1. **Should generation emit relational content for ALL categories** (story-comprehension objectives, song/video as assets, dialogue exercises), not just vocab/grammar? Give a per-category verdict.
   - Story: comprehension-MCQ objectives from `comprehension_questions`? Sequencing objectives from `pages`? Both?
   - Dialogue: a new DIALOGUE flow type + roleplay exercise type? Or keep as presentation-only?
   - Song/video: media-asset references (in a vault — see `05_SUBSYSTEM_LIBRARY_VAULT.md`) rather than skill nodes?
2. **Orchestration as a resumable pipeline vs fire-and-forget?** Today `generate-exercises` is detached and silently fails. Should orchestration track per-category/per-step status (a `generation_jobs` table?), retry on failure, and surface progress to the teacher? This directly prevents the "unit looks done but has no exercises" class of bug.
3. **The regeneration/upgrade story.** Only vocab images get upgraded to real images (in `generate-exercises`). Characters stay on DiceBear placeholders forever. Should every category have an upgrade/regenerate path, and should that write into the library/vault (so re-generated media is reusable)?
4. **Idempotency & re-runs.** `objectives` has a unique index for dedup; `pool_items` does insert-then-retire. Should *all* category emitters follow this reconcile-on-re-run pattern so a teacher can re-enrich without duplicating content?
5. **Single emitter or many?** Today `enrich-unit` writes JSONB, `generate-exercises` writes relational. In your model, is there *one* emitter per category that writes the canonical store, with the manifest as a derived cache? Or do you keep the JSONB-writer + relational-projector split?

---

## 6. Integrity bugs summary (detailed in `02_FOUNDATION_DEEPDIVE.md` §1)

| Bug | Where | Effect |
|---|---|---|
| **B1** NULL-owner rejection | `generate-exercises/index.ts:229-231` vs tolerant siblings; `UploadTextbook.tsx:331` | Textbook units never get a pool |
| **B1b** Never-fed pool | Verified 2026-07-29: 0 rows in `objectives`/`pool_items` for all 87 units; the fire-and-forget trigger (`orchestrate-lesson/index.ts:495-506`) has never succeeded in production, even for owned units | The entire exercise layer is live but unfed |
| ~~B2~~ ~~Cloud deploy gap~~ | ~~6 pending migrations + `generate-exercises` 404~~ — **RETRACTED (audit error).** Verified: all 65 migrations applied, all 12 functions deployed. | None — corrected |
| **B7/G6** Dual-manifest / dropped `image_url` | `AssetWorkshop.tsx:350-353`; `services/manifest.ts:1-16` | Silent field loss across editors |

*All `file:line` references verified against source at audit time (2026-07-29).*
