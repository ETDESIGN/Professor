# Comprehensive System Audit — Professor (Teacher App)

> **Audience:** an external architecture/AI advisor. This document is self-contained — you do not need the other files in this folder to act on it. If you want depth on any one area, follow the cross-links to the subsystem deep-dives.
>
> **Scope:** an audit of *how the class-generation pipeline, the unit Knowledge Graph, the live-session/game system, the media library/vault, and the character system are (and aren't) connected today* — plus the architecture/UX questions that fall out of the gaps. **No implementation is proposed for the open forks; this document presents them neutrally for your recommendation.**
>
> All claims are evidence-backed. `file:line` references are relative to the repo root (`professor-0.1 (1)/`). Paths are stable as of the audit date.

---

## 0. The product in one paragraph

**Professor** is a teacher-led English-classroom platform for primary/young-learner English courses built around **physical textbooks**. A teacher scans a textbook page; the system uses vision-AI to extract text + vocabulary, then generative AI to produce a full unit of teaching content (vocabulary, grammar, story, song, video, dialogues, characters). The teacher reviews/edits that content (the **Knowledge Graph**), arranges it into a live lesson (a **timeline** of games and activities), then runs it as a **live classroom session** projected on a board, with a remote control on a second device and a companion **student app** that practises the same content with spaced-repetition. English course books for young learners typically feature **recurring characters across an entire book**, so characters are a first-class, cross-unit concept (this is a locked product decision — see §5).

## 0.1 The stack (one screen)

| Layer | Tech |
|---|---|
| Frontend | Vite + TypeScript multi-entry SPA (teacher / student / parent / admin entries); Tailwind; PWA (`vite-plugin-pwa`, prompt-mode updates) |
| Hosting | Vercel (`/teacher/:path*` rewrites → `teacher.html`) |
| Backend | Supabase — Postgres 17 + Auth + Storage + Edge Functions (Deno) |
| AI | **OpenRouter gateway, region-safe models only** (Moonshot Kimi K2.6 / Qwen3 / DeepSeek). OpenAI/Google/Anthropic are **forbidden** by hard rule |
| TTS/media | ElevenLabs (audio); Pollinations/Dicebear fallbacks for images |
| Payments | Stripe |

> Constraint to keep in mind: the **YouTube Data API is region-blocked** in this deployment. The app's "song/video" features therefore degrade to returning a *YouTube search URL* rather than an embed. See `supabase/functions/generate-media/index.ts:57-66` and the comment at `supabase/functions/orchestrate-lesson/index.ts:30-33`.

---

## 1. The 3-stage pipeline (the spine of this audit)

The whole system is meant to be a **3-stage content pipeline**. Understanding it is the key to everything that follows:

```
Stage 1 — GENERATION             Stage 2 — KNOWLEDGE GRAPH       Stage 3 — LIVE + STUDENT
(scanned page → AI content)      (teacher reviews/edits)         (games consume KG content)
```

- **Stage 1** (`extract-page` → `enrich-unit` → `orchestrate-lesson` → `generate-exercises`) turns a scanned page into AI content and *should* turn it into playable exercises.
- **Stage 2** (the "Knowledge Graph" / review editors) is where the teacher reviews and edits generated content (add/remove a vocab word, regenerate an image, paste a custom video URL, pick a recurring character).
- **Stage 3** (`SessionContext` + Board game templates + Student app) *consumes* the content: live games pull from a `pool_items` table and the `units.manifest` blob; the student app reuses the same data with spaced repetition.

**The headline of this audit:** Stages 2 and 3 are largely *built* and *internally wired*, but **Stage 1 is silently starving them** — the only function that turns generated content into playable games (`generate-exercises`) has *never produced data in production*, for any unit. On top of that, Stage 2's UI only surfaces a fraction of what Stage 1 actually generates. We document each precisely below.

---

## 2. Executive summary

### 2.1 The single most important finding

**The newest generated unit shows no games/exercises for two independent, verified reasons:**

1. **`generate-exercises` — the only function that turns generated content into playable games/exercises — has never successfully run in production.** Verified directly against the production database: `objectives` and `pool_items` contain **0 rows, ever** — for any unit, owned or not. There are two distinct failure modes:
   - **For textbook-created units (the recent ones):** textbook uploads insert units with `teacher_id = NULL` (`apps/teacher/UploadTextbook.tsx:331`), and `generate-exercises/index.ts:229-231` hard-rejects NULL-owner units (`"You do not own this unit"`). Its sibling functions (`enrich-unit`, `orchestrate-lesson`) **tolerate** NULL owners (`if (unit.teacher_id && ...)`), so enrichment and flow-building *succeed* — but the fire-and-forget `generate-exercises` call dies silently (`orchestrate-lesson/index.ts:495-506`, only `.catch`-logged). Verified: all recent units are NULL-owner.
   - **For owned units:** even the 12 owned-and-Active units with real `flow`s have **zero** `pool_items`. So the fire-and-forget trigger from `orchestrate-lesson` has never produced a pool for any unit — pointing to deeper reliability issues with the detached call (cold-start drops, missing auth header on the non-awaited fetch, or those units were orchestrated before the function was deployed and never re-orchestrated).
   - Result: every pool-driven board game shows its "generate the pool for this unit" empty state. This is the exact symptom reported.

2. **An earlier version of this audit claimed the Stage-3 relational layer was "not deployed to cloud." That was wrong — it came from trusting a stale `AGENTS.md` §3 instead of verifying.** Verified cloud state (queried directly via the Supabase Management API on 2026-07-29): **all 65 migrations are applied** (including `objectives`, `pool_items`, the evolved `srs_items`, hearts, RLS hardening, and all 21 July roster/attendance/live-board migrations); **all 12 edge functions are deployed** (including `generate-exercises` — it returns 401, not 404). So the schema and function layer exist and are live. **The real problem is that they have never been *fed*** — see item 1. (The `assets` table also has 0 rows: no generated image/audio has ever been recorded; `character_ledger` has 0 rows, confirming the orphan-table finding.)

   > `AGENTS.md` §3 has been corrected (2026-07-29) to reflect the verified state: 65 migrations all applied, 12 functions all deployed.

### 2.2 The rest cascades from these two + a handful of wrong-field reads

- The **Knowledge Graph shows vocabulary only** because its React component literally has no JSX for grammar/story/song/video/dialogues (`apps/teacher/LessonStudio.tsx:264-385` renders one network, "Vocabulary Network"). The data for those categories *exists* in `manifest.enriched_content`; the UI just doesn't read it.
- **Vocabulary images don't show** because the component reads the wrong field: it displays `vocab.image_prompt` (the *text prompt*) as an `<img src>` and checks `startsWith('data:')` (`LessonStudio.tsx:354`) — always false. The real image lives in `image_url`. Worse, the "auto-generate" button calls a stub returning `null`, then overwrites `image_prompt` with the literal string `'Failed'` (`LessonStudio.tsx:177-194`) — **corrupting the prompt**. A second path drops `image_url` at projection time (`AssetWorkshop.tsx:350-353`).
- **Drag-and-drop "doesn't work"** because the "Plan" button routes to a *pure mock* (`LessonTimelineBuilder.tsx`): hardcoded seed items, no `useSession`, no DB read, and a **Save button with no `onClick` handler** (`LessonTimelineBuilder.tsx:84-86`). The *real* working builder (`LessonStudio`) is orphaned behind a route you can only reach by deep-linking or after exiting a live session.

### 2.3 What is actually healthy

**Stage 3 — the live session pick→play→score→next loop and the student app — is genuinely built and wired** (the FIXPLAN B workstream landed it). Competitive board games read `pool_items` via `apps/board/useBoardPool.ts`; presentation games read `units.manifest` via `services/manifest.ts`; scoring writes `point_transactions` (class points) + `srs_items` (FSRS cognition); and the **student app reuses the same `pool_items`/`manifest`/FSRS model** through `SoloSessionContext` + `services/poolService.ts`. There are **no hardcoded sample arrays** in the games — every consumer has a generated-data source plus an explicit "empty state → generate the pool" message. **Stage 3 looks broken only because Stage 1 starves it.** See the dedicated audit notes; full depth is in the legacy `LIVE_GAME_LIFECYCLE.md` and `docs/FIXPLAN_B_LIVEBOARD.md`.

---

## 3. Symptom → root-cause map

The table below maps each reported symptom to its verified root cause(s). Numbers in `[brackets]` index the bug list in §6.

| # | Reported symptom (screenshot) | Component / route reached | Verified root cause(s) |
|---|---|---|---|
| 1 | "Timeline builder after exiting a live session: drag-to-timeline is broken; Asset Factory does nothing" | `LessonStudio.tsx` (timeline view) @ `/teacher/studio` | The library sidebar has only **2 hardcoded items** (`LessonStudio.tsx:405,420`); DnD *works* for library→timeline + reorder (`:139-169`), but "Asset Factory / Auto-Generate Missing Items" is a **fake** — `setTimeout(1500)` + hardcoded dicebear URLs (`:196-210`); `generateImage`/`generateSong` are **no-op stubs** (`:9-10`). [B6] |
| 2 | "Plan icon on a generated unit: drag-and-drop builder, but it shows no games/exercises for the latest unit" | `LessonTimelineBuilder.tsx` @ `/teacher/timeline-builder` | This screen is a **pure mock**: no `useSession`, no DB read, hardcoded seed timeline (`:14-17`), hardcoded activity catalog (`:19-27`), and the **Save button has no `onClick`** (`:84-86`). The **Plan button routes here** (`TeacherDashboard.tsx:56-62`), so *no* unit ever shows real content in this view. The real builder (`LessonStudio`) is orphaned. [B5] |
| 2b | (underlying) latest unit genuinely has no exercises even in a *working* screen | `pool_items` / `objectives` tables | The pool is empty for **every** unit (0 rows in `objectives`/`pool_items`, ever). For textbook units this is the **NULL-owner bug** [B1]; for owned units it's the **never-run-in-production** finding [B1b]. The cloud layer is fully deployed — it has just never been fed. |
| 3 | "Knowledge Graph: vocabulary half-works but images don't show; grammar/story/song/video/dialogues missing; level empty; characters incomplete" | `LessonStudio.tsx` (knowledge view) @ `/teacher/studio` "Knowledge Graph" tab | (a) **Wrong-field read** `image_prompt` vs `image_url` + the `startsWith('data:')` check (`LessonStudio.tsx:354`) [B3]; (b) the knowledge view renders **vocabulary only** — no JSX exists for grammar/story/song/video/dialogue (`:264-385`); (c) the "auto-generate images" stub **overwrites `image_prompt` with `'Failed'`**, corrupting data (`:177-194`) [B4]; (d) Level is just a free-text CEFR string (`manifest.meta.difficulty_cefr`); (e) Characters are read-only first-letter avatars with a `+` button that does nothing (`:289-296`). |
| 3b | "AssetWorkshop (post-upload review) shows all categories but is unreachable later" | `AssetWorkshop.tsx` — mounted **only** in `UploadTextbook.tsx:381` | It is the most complete review editor (vocab/grammar/characters/story/songs/videos/dialogues), but it is **never reachable from the unit list / Knowledge Graph**. After first run, a teacher cannot get back to it. [G2] |

---

## 4. Per-stage status at a glance

### Stage 1 — Generation

| Function | On disk? | On cloud? | Tolerates NULL owner? | Outcome |
|---|---|---|---|---|
| `extract-page` (vision OCR) | ✅ | ✅ | n/a (stateless) | Writes `units.scanned_assets` via client. Works. |
| `enrich-unit` (AI content, all 7 categories) | ✅ | ✅ | ✅ (`if (unit.teacher_id && ...)`) | Writes `units.manifest.enriched_content`. Works. |
| `orchestrate-lesson` (build flow + publish) | ✅ | ✅ | ✅ | Writes `units.flow` + `srs_items` templates; sets `status='Active'`. Works. Fire-and-forgets `generate-exercises`. |
| `generate-exercises` (→ `objectives` + `pool_items`) | ✅ | ✅ (deployed) | ❌ rejects NULL owner | **Deployed but has never produced data** — `objectives`/`pool_items` have 0 rows for all 87 units. Fails for textbook units (NULL-owner [B1]) and has never succeeded for owned units either [B1b]. |
| `generate-media` (image/audio/youtube) | ✅ | ✅ | n/a | Works; `youtube-search` degrades to a search URL (region block). |
| `generate-lesson` (legacy) | ✅ | ✅ | n/a | Superseded; not in the textbook pipeline. |

**Category fate:** vocabulary ✅ connects (vocab `objectives` → `pool_items` → board/student); grammar ⚠️ partial (connects *if* the enriched data carries `error_examples`/`transformation_pairs`, else presentation-only); story/song/video/dialogue ❌ **JSONB-only** — no `objectives.type` permits them (CHECK is `vocabulary|grammar|phonics`, `20260628000000_objectives_table.sql:18`), no exercise types, no flow type for dialogue. See `03_SUBSYSTEM_GENERATION_PIPELINE.md`.

### Stage 2 — Knowledge Graph / review

| Surface | Route | Reachable? | Categories shown |
|---|---|---|---|
| `UnitContentVault` (the most capable editor) | `/teacher/unit-vault/:id` via card **Edit** icon | ✅ | vocab, questions, story, grammar, media, settings (real media gen, real save) |
| `LessonStudio` Knowledge Graph view | `/teacher/studio` "Knowledge Graph" tab | ✅ (post-live exit only) | vocabulary only; image bug; characters read-only; `+` stub |
| `AssetWorkshop` (all categories) | embedded in `UploadTextbook.tsx:381` | ❌ unreachable after first run | vocab, grammar, characters, story, songs, videos, dialogues |
| `LessonTimelineBuilder` (Plan destination) | `/teacher/timeline-builder` | ✅ | none — pure mock |

**4 overlapping editors, 3 different field-name conventions, 2 save paths, navigation sends users to the 2 that don't work.** See `04_SUBSYSTEM_KNOWLEDGE_GRAPH.md`.

### Stage 3 — Live + Student

| Aspect | Status |
|---|---|
| `SessionContext` command bus (pick→play→score→next) | ✅ Built (`store/SessionContext.tsx`) |
| Board game templates (FlashMatch, SpeedQuiz, ListenTap, Unscramble, What's-Missing, I-Say-You-Say, TeamBattle, GrammarPractice, StorySequencing, FocusCards, StoryStage, GrammarSandbox) | ✅ Wired to `pool_items` + `manifest` |
| Student app (12-type exercise battery, FSRS) | ✅ Reuses same `pool_items`/`manifest`/`srs_items` |
| Content actually present | ❌ Empty in prod (Stage 1 starvation) |

**Stage 3 is healthy code on a starved data diet.** See the audit's "live game system" notes and the canonical `LIVE_GAME_LIFECYCLE.md`.

---

## 5. Locked decisions vs. open forks (what we need from you)

To focus your effort, two product decisions are **already settled** and two are **open** (we want your recommendation).

### 5.1 Locked decisions (do not re-litigate; we want *implementation* architecture, not whether)

- **L1 — Characters are a cross-unit, book-level reusable entity.** English course books for young learners feature recurring characters across the entire book. A per-unit JSONB character field cannot model this. We will build a book-level character library with a picker modal; units *reference* characters, they do not own a private copy. Depth + open implementation questions: `06_SUBSYSTEM_CHARACTERS.md`.
- **L2 — Educational-AI level/target-age differentiation is deferred.** The ambition is that, during content extraction/creation, the system analyses the English level and target age of the physical book to adapt games and questions. This is a large educational-AI pipeline of its own and is **explicitly out of scope** for this round. Today there is only a free-text CEFR field (`manifest.meta.difficulty_cefr`) and no relational level/target-age. Please do **not** fold this into the foundation work — it is noted for context only. (If you have a strong opinion on *where* to hook it later, a brief note is welcome.)

### 5.2 Open forks (we want your recommendation — see deep-dives)

- **F1 — Data model.** Should generated content beyond vocab/grammar get the relational treatment (`objectives`/`pool_items`-style tables for story/song/video/dialogue), stay JSONB with bugs fixed, or a hybrid? The choice decides whether editing, querying, cross-unit reuse, and per-category games are easy or hard. Presented neutrally with trade-offs in `02_FOUNDATION_DEEPDIVE.md` §2.
- **F2 — Authoring UI consolidation.** The 4 fragmented editors need to become one coherent authoring surface (or a small number). We want your proposal for the shape (one unified Unit Studio? Studio + first-run Workshop? something else). Presented neutrally in `02_FOUNDATION_DEEPDIVE.md` §3. (Regardless of consolidation, the routing bug — Plan routes to a dead mock — is a concrete fix.)

---

## 6. Prioritized bug & gap list (evidence-backed)

Severity: 🔴 critical (breaks core flow) · 🟠 major (broken feature) · 🟡 minor/cleanup.

| # | Sev | Bug / Gap | Evidence | Effect |
|---|---|---|---|---|
| **B1** | 🔴 | `generate-exercises` rejects NULL-owner units while siblings tolerate them | `generate-exercises/index.ts:229-231` (reject) vs `orchestrate-lesson/index.ts:313` + `enrich-unit/index.ts:41-43` (tolerate); units created at `UploadTextbook.tsx:331` without `teacher_id`; verified: all recent textbook units are NULL-owner | **Latest textbook unit has empty `objectives`/`pool_items`** → no playable games |
| **B1b** | 🔴 | `generate-exercises` has never produced data in production, even for owned units | Verified 2026-07-29: `objectives`/`pool_items`/`assets`/`character_ledger` all have **0 rows** for all 87 units; 12 owned+Active units with real `flow` still have zero `pool_items` | The fire-and-forget trigger (`orchestrate-lesson/index.ts:495-506`) is unreliable (cold-start drops / detached-fetch auth / units orchestrated pre-deploy and never re-run). The entire exercise layer is live but unfed. |
| ~~B2~~ | — | ~~"Stage-3 relational layer not on cloud"~~ — **RETRACTED (was based on stale `AGENTS.md`).** Verified 2026-07-29: all 65 migrations applied, all 12 functions deployed. The real issue is B1/B1b, not a deploy gap. | Management API query: `supabase_migrations.schema_migrations` has 65 rows; `GET /functions` lists 12 including `generate-exercises` | None — this was an audit error, corrected. |
| **B3** | 🔴 | Knowledge Graph reads wrong field for vocab image | `LessonStudio.tsx:354` reads `image_prompt` + checks `startsWith('data:')`; real image is `image_url` (used correctly by `apps/board/templates/BoardFocusCards.tsx:47` and `services/LessonTransformer.ts:46-48`) | "No image generated" shown even when a real image exists |
| **B4** | 🟠 | "Auto-generate image" stub **corrupts** data | `LessonStudio.tsx:177-194` calls `generateImage` (stub returning `null`, `:10`) then sets `image_prompt = 'Failed'` | Destroys the prompt text; needs data repair for affected rows |
| **B5** | 🟠 | Plan button routes to a pure mock builder | `LessonTimelineBuilder.tsx:84-86` (Save, no onClick) + `:14-27` (hardcoded); routing `TeacherDashboard.tsx:56-62` | "Plan" can never show real unit content |
| **B6** | 🟠 | LessonStudio "Asset Factory / Auto-Generate" is fake | `LessonStudio.tsx:196-210` (`setTimeout` + dicebear URLs); `generateSong`/`generateImage` stubs `:9-10` | Post-live composer's AI affordances are non-functional |
| **B7** | 🟠 | Vocabulary `image_url` dropped at projection time | `AssetWorkshop.tsx:350-353` builds `knowledge_graph.vocabulary` omitting `image_url` | `UnitContentVault` (reads `knowledge_graph.vocabulary`) always shows blank images, even though `enriched_content.vocabulary[].image_url` exists |
| **B8** | 🟠 | YouTube search response-shape mismatch in vault | `UnitContentVault.tsx:157-180` expects `data.items[].id.videoId`; `generate-media/index.ts:57-66` returns `{searchUrl,...}` (no `items`) | Media tab's video search never returns anything |
| **B9** | 🟡 | `UnitPreviewModal` references `TrophyIcon` before initialization | `UnitPreviewModal.tsx:36` (in fallback `steps`) vs declaration `:145` | `ReferenceError` on units with empty `timeline`/`flow` |
| **B10** | 🟡 | `LessonTimelineBuilder` DnD violates `@hello-pangea/dnd` index contract | non-contiguous `index` props within one `<Droppable>` (`:113-173`) | Drags misbehave even inside the mock |
| **G1** | 🟠 | JSONB-only data model for story/song/video/dialogue/characters/level | no tables exist; `objectives.type` CHECK is `vocabulary\|grammar\|phonics` only | No editing, querying, cross-unit reuse, or per-category games for these |
| **G2** | 🟠 | `AssetWorkshop` (the only all-category editor) unreachable after first run | mounted only at `UploadTextbook.tsx:381` | Teachers lose access to the richest review surface |
| **G3** | 🟠 | `character_ledger` table exists but **no producer writes to it** | `supabase/migrations/20260417000003_create_character_ledger.sql`; only `GamificationService.ts` reads it (student avatar cosmetics) | Orphan table; characters are per-unit JSONB instead of the cross-unit library we want (L1) |
| **G4** | 🟠 | Library/Vault is a static mock | `ResourceLibrary.tsx:9-16` (6 hardcoded items); all buttons no `onClick` | Real backing store exists (`assets` table + `generated-media`/`materials` buckets) but no UI reads it |
| **G5** | 🟠 | No media-picker modal anywhere | grep for `MediaPicker`/`Vault`/`pickFromLibrary` returns nothing | Intended UX (pick media from the vault while editing the KG) is unbuilt |
| **G6** | 🟡 | `manifest` dual-shape (`enriched_content` vs `knowledge_graph`) | written by two producers; `normalizeManifest` (`services/manifest.ts:126`) exists to reconcile but some editors read raw sub-blobs | Silent data loss (e.g. `phonetic`, `audio_url`, `confusables` dropped when read from the projection) |
| **G7** | 🟡 | `units.image_url` / `units.audio_url` columns unused by pipeline | `20260330000000_add_multimodal_urls.sql` | Dead columns; all media lives in `manifest`/`assets` |
| **G8** | 🟡 | `srs_items` templates written without `objective_id` | `orchestrate-lesson/index.ts:462-467`; backfilled only if `generate-exercises` later runs (`:317-330`) | Combined with B1, the LearnerState never links to the skill graph for affected units |
| **G9** | 🟠 | **No unit management UI** — no delete/archive/duplicate/rename | No `deleteUnit` in `Engine`/`SupabaseService`; `UnitList.tsx:10-14` exposes only New/Upload/Edit/Plan/Launch; unit card has only Plan+Launch | 87 units on cloud (~67 incomplete `Draft` test units) cannot be cleaned up via UI — data-hygiene + UX problem. Cascade FKs already exist, so hard-delete is safe. (See `04` §4.2.) |

---

## 7. The cross-system picture (why the symptoms are so widespread)

The reported symptoms are not 15 independent bugs — they are the visible surface of **three compounding structural issues**:

1. **One JSONB blob holds almost everything, and only vocab/grammar got a relational mirror.** `units.manifest` carries vocabulary, grammar, characters, story, song_suggestions, video_suggestions, and dialogues. The relational path (`objectives` → `pool_items` → `srs_items`) exists only for vocab (and grammar, conditionally). So Stage 3 can only *play* vocab/grammar; everything else is display-only. This is **G1**, and it's the heart of fork **F1**.

2. **Two producers write two manifest shapes, and editors read whichever one they were written against.** `enrich-unit` writes `enriched_content` (full). `AssetWorkshop` *also* writes a `knowledge_graph` projection that **drops fields** including `image_url` (B7). `UnitContentVault` reads `knowledge_graph`; `LessonStudio` reads `knowledge_graph` (and reads the wrong field, B3); `AssetWorkshop` reads `enriched_content`. A normalizer exists (`services/manifest.ts:126`) but isn't used uniformly. This is **G6** and the mechanism behind B3/B7.

3. **Stage 1's only path to playability has never successfully run.** The NULL-owner guard is stricter in `generate-exercises` than its siblings (B1), which blocks every textbook-created unit. And the function has **never produced data in production at all** — even for owned units (B1b) — so the *only* path that makes content playable has been effectively dead since launch, and the failure is silent. Stage 3 then looks broken when it isn't. (An earlier draft of this audit blamed a "cloud deploy gap" here; that was an audit error — the layer is fully deployed, just unfed.)

The **4 fragmented editors** (G2 + the mock builder B5) layer on top: the teacher's mental model is "review and edit my unit," but there are four screens with different field names, different save paths, and different discoverability — and the primary entry points (Plan, the Knowledge Graph tab) land on the two that are broken or partial. This is fork **F2**.

**The compounding logic to keep in mind:** you cannot meaningfully evaluate the Knowledge Graph UI (F2) without first deciding the data model (F1), because what "edit a story" or "edit a character" even *means* depends on whether those are rows you can reference, or keys in a JSONB blob. We therefore recommend the external advisor weigh F1 first.

---

## 8. Deferred / out-of-scope note (level & target-age)

The product ambition is that, at content extraction/creation, the system analyses the physical book's English level and target age to **adapt** games and questions to the audience. This is a substantial educational-AI pipeline in its own right and is **deferred** (decision **L2**). The current state, for context:

- `units.level` is a free-text CEFR string (e.g. "A1").
- `manifest.meta.difficulty_cefr` and `manifest.enriched_content.gradeLevel` carry level-ish metadata, but there is **no `levels` table, no target-age column, and no FK** — level is not relational.
- No part of the pipeline currently *uses* level to adapt generated exercises; difficulty is a flat `pool_items.difficulty` (1–3) set by `generate-exercises`.

**Ask:** treat level/target-age as a placeholder for now. Do not propose foundational changes here; if you have a short note on the cleanest future hook point, that's welcome but optional.

---

## 9. Where to go deeper

| Want depth on… | Read |
|---|---|
| The pipeline integrity bugs (B1/B1b/G6) + the data-model and editor forks (F1/F2) | `02_FOUNDATION_DEEPDIVE.md` |
| Stage 1 edge-function-by-edge-function + the exact trigger path + category fate | `03_SUBSYSTEM_GENERATION_PIPELINE.md` |
| The 3 review screens + image bugs + what's editable vs missing + editing UX | `04_SUBSYSTEM_KNOWLEDGE_GRAPH.md` |
| Library/Vault: the mock reality + storage inventory + media-picker contract | `05_SUBSYSTEM_LIBRARY_VAULT.md` |
| Cross-unit character system (book-level library, locked L1) | `06_SUBSYSTEM_CHARACTERS.md` |
| The live game system (Stage 3) and the pick→play→score→next loop | `LIVE_GAME_LIFECYCLE.md` (canonical) + `docs/FIXPLAN_B_LIVEBOARD.md` |
| The roster/analytics data-integrity workstream (orthogonal to content) | `docs/FIXPLAN_INDEX.md` + `docs/FIXPLAN_C_STUDENTMGMT.md` |

---

*Audit date: 2026-07-29. All `file:line` references verified against source at audit time.*
