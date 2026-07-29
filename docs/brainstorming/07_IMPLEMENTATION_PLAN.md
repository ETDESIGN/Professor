# Implementation Plan — Professor (Teacher App)

> **Status:** DECIDED. This plan records the owner's decisions (2026-07-29) after reviewing `ADVISOR_RECOMMENDATION.md` against the corrected audit (`01`–`06`). It supersedes the advisor's sequencing only where the B2 correction changes the work; the advisor's architecture is otherwise accepted.
>
> **Companion docs:** `00_README.md` (overview + master questions) · `01_COMPREHENSIVE_AUDIT.md` (bugs/gaps, corrected) · `ADVISOR_RECOMMENDATION.md` (architecture rationale). This plan is the *what/when*; those are the *why*.

---

## 0. Decisions locked (2026-07-29)

| # | Decision | Source |
|---|---|---|
| **D1** | **F1 data model:** accept the advisor's hybrid — `books` + relational skill-node tables (story, dialogue, characters) + media-reference for song/video. **Build it incrementally (phased), not big-bang.** | advisor §2; owner chose "phase it" |
| **D2** | **Phase 0:** unblock the pipeline (B1/B1b) **and** start F1 foundation (`books` + `generation_jobs`) in the same phase. | owner choice |
| **D3** | **F2:** accept the unified **Unit Studio** (one component, Content + Plan tabs; AssetWorkshop's first-run behavior folded in as the landing state). | advisor §3; owner accepted |
| **D4** | **Characters:** full system this round — tables + picker + `look_prompt` consistency + `voice_id` + character-driven generation. (Compatible with "phase F1" because characters anchor on `books`, an early phase.) | owner choice; advisor §7 |
| L1 | Characters are cross-unit, book-level (product-locked) | pre-existing |
| L2 | Educational-AI level/target-age differentiation deferred | pre-existing |

**Adjustments to the advisor made by this plan:**
- The advisor's "B2 deploy gap" **does not exist** — verified the layer is live (see `02` §1.2). Replaced below with **B1b** (never-fed pool).
- The advisor filed `generation_jobs` under Phase 1; **this plan puts it in Phase 0** because it's the fix for B1b (a current production-blocker), not an enhancement.
- The advisor's Phase 0 "repair B1/B2/B7" → this plan's Phase 0 is "unblock + foundation."

---

## 1. Phased structure (build order)

The guiding principle: **a unit can produce a real exercise pool end-to-end in production as early as possible** (so we can validate everything against reality), then expand outward.

```
Phase 0 — UNBLOCK + FOUNDATION   (parallel tracks)
Phase 1 — RELATIONAL CONTENT     (the F1 categories, incrementally)
Phase 2 — UNIFIED UNIT STUDIO    (F2: one component, retires 4 editors)
Phase 3 — SUBSYSTEM POLISH       (vault UI, pickers, KG visuals, mobile)
```

Each phase is independently shippable and independently verifiable.

---

## Phase 0 — Unblock the pipeline + lay the foundation

> **✅ COMPLETE (verified 2026-07-29).** Clean end-to-end run: uploaded unit `d9c67a81` ("The Friendly Farm") produced **8 vocab + 1 grammar + 4 story pages + 3 songs + 2 videos + 2 dialogues**, an **11-slide flow**, **9 objectives → 54 pool_items**, **8 SRS templates**, `generation_jobs.status = succeeded`. The entire generation→pool chain works in production for the first time. Deployed to cloud (2 migrations + 3 edge functions) and Vercel (frontend).
>
> **Bugs found & fixed during verification** (all in `07` §"Bugs found during Phase 0 verification" below):
> - `sbClient is not defined` — my generation_jobs upsert was out of scope (fixed: moved `sbClient` to outer scope).
> - `Assignment to constant variable` (pre-existing) — `transformManifestToFlow` reassigned `const flow`; this crashed ALL flow generation, giving every unit a 1-slide minimal fallback. Fixed: `const` → `let`. This was masked for a long time.
> - Vocabulary enrichment 100% failure — my `max_tokens: 9000` override exceeded the primary models' output cap (~8192), so OpenRouter rejected vocab for every model while grammar/story/etc. (at 5000) succeeded. Fixed: reverted to 5000, kept the `extractBalancedJson` + `repairTruncatedJson` helpers to handle any truncation.

**Goal:** by the end of Phase 0, (a) a textbook-created unit produces a real `objectives`/`pool_items` pool in production, and (b) the `books` + `generation_jobs` tables exist so Phase 1 builds on them.

### 0A — Pipeline unblock (B1 + B1b)

| Task | File / target | Detail |
|---|---|---|
| Stamp `teacher_id` at unit creation | `apps/teacher/UploadTextbook.tsx:331` | Match `Engine.createUnit` (`services/SupabaseService.ts:106-108`); set `teacher_id = auth.uid()` on insert. |
| Extract shared ownership helper | `supabase/functions/_shared/assertOwnership.ts` (new) | One helper used by `enrich-unit`, `orchestrate-lesson`, `generate-exercises` — closes the asymmetry permanently so the next emitter can't reintroduce B1 by copy-paste. **Do NOT loosen `generate-exercises`'s guard** (advisor §1). |
| Backfill NULL-owner units | one-time SQL (MCP) | `UPDATE units SET teacher_id = <resolve from session/creator> WHERE teacher_id IS NULL;` — resolve ownership per unit (the 14 NULL-owner units, incl. the recent textbook test units). Confirm with owner before running. |
| Add `generation_jobs` table | new migration | `generation_jobs(id, unit_id, stage, status, error, attempt, started_at, completed_at, unique(unit_id, stage))`. **Pulled from advisor §2.5 into Phase 0** — this is the B1b fix. |
| Make `generate-exercises` reliable + re-runnable | `supabase/functions/orchestrate-lesson/index.ts:495-506` | Replace the fire-and-forget detached `fetch` with a `generation_jobs`-tracked stage. On failure, write `status='failed', error=...` (visible, retryable) instead of `.catch`-logging into a void. |
| Re-run `generate-exercises` for existing units | ops task | For each unit with `flow` but no pool, create+run a `generate-exercises` job. **Verifies the pool finally populates.** |

**Exit criteria (Phase 0A):** a freshly-uploaded textbook unit reaches `Active` status with `objectives`/`pool_items` populated; the live board games show real content instead of "generate the pool" empty states.

### 0B — F1 foundation

| Task | Detail |
|---|---|
| `books` table | `books(id, owner_id→auth.users, title, cover_asset_id→assets, created_at)` (advisor §2.2). |
| `units.book_id` (nullable FK) | `alter table units add column book_id uuid references books(id);` |
| Default-book backfill | One default book per teacher ("My Units"); assign all existing book-less units. **Do NOT auto-detect book boundaries** (advisor §2.2) — guessing risks merging unrelated casts. |
| Feature-flag gate | `units.migrated_categories text[]` column (advisor §2.6 step 4) — gates per-category read switchover during Phase 1. |

**Exit criteria (Phase 0B):** `books` exists, every unit has a `book_id`, `generation_jobs` tracks pipeline stages, the flag column is in place.

### 0C — Quick UX relief (optional, recommended in parallel)

These are independent of the schema work and unblock real teacher use immediately:

| Bug | Fix |
|---|---|
| **B7 patch** (vocab images blank) | Temporary: read `image_url` not `image_prompt` in `LessonStudio.tsx:354`, and stop dropping `image_url` in the `AssetWorkshop.tsx:350-353` projection. Permanent fix comes in Phase 1 (relational FK). |
| **B5 routing** (Plan → dead mock) | Point Plan/New-Unit routes at a real builder (`TeacherDashboard.tsx:56-62`). Phase 2 replaces this builder with the Unit Studio; this is the interim. |
| **B4 data-corrupting stub** | Remove the `generateImage` stub's `'Failed'` overwrite (`LessonStudio.tsx:177-194`); data-repair pass for corrupted `image_prompt` rows. |
| **G9 unit management** (no delete) | Add `Engine.deleteUnit` + a delete-with-confirmation action on the unit card (`UnitList.tsx`). Cascade FKs already exist, so hard-delete is safe. Lets the owner clean up the ~67 incomplete test units. |

---

## Phase 1 — Relational content (F1 categories, incrementally)

**Goal:** each content category becomes a relational table (the canonical store), `units.manifest` retires for migrated categories, and the JSONB-writer/projector split (the B3/B4/B7 class) is eliminated.

**Sequencing within Phase 1** — ordered by dependency and value:

### 1.1 — `characters` (the anchor for story + dialogue)
Build first because story/dialogue FK into it. Full system per D4.

- Tables: `characters(book_id, name, role, description, personality, look_prompt, reference_image_asset_id, voice_id, unique(book_id, lower(name)))` + `unit_characters(unit_id, character_id)` join (advisor §7.1).
- **NOT** repurposing `character_ledger` (stays for avatar cosmetics; consider rename later).
- **Picker modal:** `<CharacterPickerModal bookId onSelect>` with inline "create new" (advisor §7.6).
- **Visual consistency:** `look_prompt` prepended to every generation involving the character (advisor §7.3) — provider-agnostic, works today. (Seed-lock only if Pollinations/flux confirms support.)
- **Voice:** `characters.voice_id`; `tts.ts`/`generate-media` look up the speaker's voice (advisor §7.4).
- **Character-driven generation:** `enrich-unit` story/dialogue branches query the book's cast and write content referencing it; new characters prompt teacher adoption, never silent auto-creation (advisor §7.5).
- **Migration:** fuzzy-match existing `manifest.characters` by normalized name within the book; **ambiguous matches → teacher confirm-merge screen**, never silent auto-merge (advisor §7.7).

### 1.2 — `story_pages` + `story_comprehension_questions`
> **✅ COMPLETE (2026-07-29).** Tables deployed; `objectives.type` widened to include `story` + `dialogue`; new `STORY_COMPREHENSION` exercise type; `generate-exercises` emits it from the relational table (with a manifest fallback for legacy units); `enrich-unit` writes story relationally (single emitter, resolving speakers to book characters for continuity); backfilled 55 pages + 62 comprehension questions across 12 units. Next orchestration of a story-bearing unit will populate STORY_COMPREHENSION pool items.

Highest-value category: turns currently-discarded `comprehension_questions` into a playable objective type with ~zero new generation work.

- `story_pages(unit_id, page_number, speaker_character_id→characters, text, image_asset_id→assets, audio_asset_id→assets)` + nullable `speaker_override_name` for one-off non-cast speakers (advisor §7.2).
- `story_comprehension_questions(unit_id, story_page_id, question, options jsonb, order_index)`.
- Widen `objectives.type` CHECK to include `story`, `dialogue` (advisor §4 — easy to forget).
- `generate-exercises` emits STORY_SEQUENCING (already a board type with no producer — same-day win) + comprehension-MCQ from the questions table.
- **Regeneration/upgrade:** generic `regenerate(entity_type, entity_id, extra_instructions)` action creates a *new* `assets` row (never overwrites), repoints FK (advisor §2.5). Reused by all media-bearing categories.

### 1.3 — `dialogue_lines`
- `dialogue_lines(unit_id, order_index, speaker_character_id→characters, text, translation, audio_asset_id→assets)` + nullable `speaker_override_name`.
- New flow type `DIALOGUE_STAGE` (presentation) + pool-item types `DIALOGUE_ROLEPLAY` / `WHO_SAID_IT` (played) — the "who said it?" game unlocks once `speaker_character_id` exists (advisor §4, §7.5).

### 1.4 — `grammar_rules` (real table, not JSONB-derived)
- `grammar_rules(id, unit_id, rule, explanation, examples jsonb)` as canonical source feeding `objectives(type='grammar')`.
- Closes the "grammar empty in practice" gap: `generate-exercises` reads a stable-shaped table, not transient JSONB.

### 1.5 — `unit_media` + extended `assets` (song/video + the vault backbone)
- `unit_media(unit_id, asset_id→assets, role, order_index)` — many-to-many (advisor §6.1). **Replaces the single `assets.unit_id` FK** that makes reuse impossible today.
- `assets` columns: `owner_id`, `book_id` (nullable for cross-book), `kind` ('generated'|'uploaded'|'external_url'), `source_url`, `tags text[]`, `is_deleted` (advisor §6.1).
- Song/video are media references here, **not** skill nodes (advisor §2.3 — resolves the over-engineering risk explicitly).

### 1.6 — Emission + registry (cross-cutting)
- **Single emitter per category:** `enrich-unit` writes directly to the relational tables (upsert), not to `manifest.enriched_content` (advisor §2.5 — removes the B3/B4/B7 class).
- **`activity_type_registry`(learning_object_type, activity_type, generator_key)** — `generate-exercises` looks up which activities apply per objective type instead of hardcoding branches (advisor §2.5).
- **Idempotency:** unique natural keys per table (`(unit_id, page_number)`, `(unit_id, order_index)`, `(book_id, lower(name))`) + insert-then-reconcile, so re-enrich never duplicates.
- **Read contract:** a `get_unit_bundle(unit_id)` view/RPC joins the tables into one payload for the board/student app — **derived on read, never hand-written by two producers** (advisor §2.4 — the real fix, vs. the opt-in `normalizeManifest` that didn't prevent B7).
- **Migration:** per-unit backfill from `manifest.enriched_content.*` → new tables; feature-flag reads via `migrated_categories`; drop JSONB sub-fields only after verification (advisor §2.6). No teacher edits lost.

**Exit criteria (Phase 1):** all content categories live in relational tables; `units.manifest` read-only-legacy; the board/student app read via `get_unit_bundle`; re-enriching a unit is idempotent.

---

## Phase 2 — Unified Unit Studio (F2)

**Goal:** the 4 fragmented editors become one component with a shared data contract.

### 2.1 — The surface
- One route: `/teacher/unit/:id` → **Unit Studio**, two tabs: **Content** + **Plan** (advisor §3.2).
- Content tab = one sub-tab per F1 category (Vocabulary, Grammar, Story, Characters, Song/Video, Dialogue, Settings) — directly mirrors the §2.3 tables.
- **First-open state after generation** = the Content tab with "review" framing (approve/toggle badges on un-reviewed items). This folds `AssetWorkshop` in as a *mode*, not a separate screen — resolves G2 (advisor §3.4).
- Live-session exit → returns to the Unit Studio Content tab (not an orphaned screen).
- Plan + New-Unit routes stop pointing at `LessonTimelineBuilder` (the mock) — **the B5 fix, now structural** (advisor §3.2).

### 2.2 — Shared data contract
- One TS type per category, matching the F1 tables 1:1 (`StoryPage`, `DialogueLine`, `CharacterRef`, …), used by the Studio tabs, the Plan timeline, and the board/student consumers (advisor §3.5).
- Retires the three drifted shapes (`TimelineItem`, `TimelineBlock`, `units.flow`'s 22-type shape).

### 2.3 — Retire the old editors
- `LessonTimelineBuilder` (the mock) — deleted.
- `LessonStudio`'s Knowledge Graph toggle — superseded by the Content tab.
- `AssetWorkshop` + `UnitContentVault` — their logic absorbed into the Unit Studio.

### 2.4 — Mobile
- Read-only Content tab, no Plan tab, for v1 (advisor §3.6).

**Exit criteria (Phase 2):** one authoring component, one data contract, one save path; the 4-editor fragmentation is gone.

---

## Phase 3 — Subsystem polish

The pieces that depend on Phases 1–2 being in place.

### 3.1 — Library/Vault UI (G4, G5)
- Wire `ResourceLibrary.tsx` to the `assets` table (replaces the 6 hardcoded items) — it becomes "the picker, full-page, no `onSelect`" (advisor §6.4).
- **Media-picker modal** `<MediaPickerModal kind scope onSelect>` (advisor §6.3) — invoked from every field that needs media (vocab image, story image, character portrait, song, video, dialogue audio). Closes G5.
- Tagging: category-tag auto-set + prompt-derived keywords + manual tags; search = `ILIKE`/array-contains + filter chips. No AI-vision auto-tagging until evidence demands it (advisor §6.2).
- Soft-delete only (`is_deleted` + retention); zero-reference assets flagged for a "clean up unused media" review (advisor §6.7).

### 3.2 — Song/video path
- **Spike first:** confirm whether `<iframe>` embed by video ID works in your region even though the YouTube *Data API* (search) is blocked (advisor §5.4/§6.5). If yes, video embedding is alive — only search is dead. This may change the song/video UX materially.
- If uploads are primary: new `media-uploads` bucket (200MB, video MIME) — `generated-media`'s 50MB is tight for video (advisor §6.5).

### 3.3 — Knowledge Graph visuals
- Primary = structured category tabs (the Unit Studio Content tab). A small **read-mostly cast/story map** (which characters appear in which pages/lines) as a secondary panel inside the Story or Characters tab — earns the "Knowledge Graph" name without a full graph editor (advisor §5.1). No reactflow/cytoscape investment this round.

### 3.4 — Live-update policy (product decision to confirm)
- Edits save immediately to the canonical store (next session + student app pick them up).
- An **already-running** session keeps its start-time snapshot (no hot-patching mid-class — risks surprising the teacher) (advisor §5.6). **Confirm this policy with the owner before building.**

---

## 2. Open risks / things to validate early

| Risk | Mitigation |
|---|---|
| **Video embed region status unknown** | 10-min spike in Phase 3.2 (or earlier) — material to the song/video UX. |
| **Pollinations/flux seed-lock for character consistency** | Validate during Phase 1.1; `look_prompt` is the provider-agnostic baseline regardless. |
| **Character auto-merge corrupting book continuity** | Never silent auto-merge — teacher confirm-merge screen for ambiguous matches (advisor §7.7). |
| **Backfill losing teacher edits** | Feature-flag per category; drop JSONB only after verification (advisor §2.6). |
| **The 67 incomplete test units polluting data** | G9 delete UI in Phase 0C lets the owner clean up before backfill. |
| **F2 refactor touching 4 editors at once** | Phase 2 happens *after* F1 settles, so it builds against stable tables (advisor's own logic). |

---

## 3. Verification gates (run at each phase boundary)

- **Phase 0:** upload a textbook page → unit reaches `Active` → `objectives`/`pool_items` non-zero → a board game renders real content. (This is the end-to-end test that's *never been possible* in production until now.)
- **Phase 1:** re-enrich a unit → no duplicate rows → edit a story page → board reflects it via `get_unit_bundle` → `migrated_categories` flips for that category.
- **Phase 2:** Plan/Edit/post-live-exit all open the same Unit Studio; one save path; the mock builder is gone.
- **Phase 3:** media-picker opens from every media field; vault shows real generated assets; character picker shows the book's cast consistently.

---

## 4. What is explicitly NOT in this plan

- **L2** (educational-AI level/target-age differentiation) — deferred. Hook point noted for later: `books.target_age_range` / `books.cefr_level` (advisor §8), no schema change needed this round.
- **Curriculum / Universe layers** above `books` — declined as ungrounded (advisor §0.0); `books` doesn't foreclose them later.
- **AI-vision auto-tagging** for the vault — deferred until evidence demands (advisor §6.2).
- **Hard spend quotas** on generation — deferred; a soft usage indicator suffices for v1 (advisor §6.7).
- **Full graph-canvas editor** (reactflow/cytoscape) — declined; a small cast/story map panel covers the pedagogical need (advisor §5.1).

---

## 5. Recommended starting point

**Phase 0A (pipeline unblock) first**, because it's the smallest set of changes that converts "the system has never worked end-to-end" into "the system works end-to-end" — and every subsequent phase is validated against a working pipeline rather than a starved one. Phase 0B (foundation) runs in parallel since it's schema-only with no behavioral change yet.

When you're ready, I'll begin Phase 0A — starting with the `teacher_id` stamp + `assertOwnership` helper + `generation_jobs` table, then the backfill (with your confirmation before touching existing units).
