# Architecture Recommendation — Response to the Professor Briefing Package

> **Role:** external advisor response to `00`–`06`. This is a recommendation, not an implementation plan — per your framing, you'll review and decide before anything gets built. I've kept the same evidence-referencing style as your audit so this is easy to cross-check against the source.
>
> **Format:** answers are grouped to match your `00_README.md` master question list, in the sequencing you proposed (integrity bugs → F1 → F2 → subsystems), since I agree with that ordering and want the recommendation to read in build order.

---

## 0. Sequencing — confirmed, with one addition

### 0.0 The domain model, stated before persistence

One level should come before "JSON vs. relational": what are the entities, independent of how they're stored? Stating it explicitly, in the order data actually flows:

```
Book  →  Unit  →  Knowledge Graph (a view, not a stored entity)  →  Learning Object  →  Activity  →  Live Session  →  Learning History
```

- **Book, Unit, Learning Object, Activity, Live Session, Learning History** are all real stored entities (§2, §7).
- **"Knowledge Graph"** is deliberately *not* in that list as an entity — per §5.1, it's a UI surface over Learning Objects, not a table. Naming it as a layer invites building a graph-shaped table for something that's actually a review screen.
- I'm explicitly **not** adding two layers a second opinion on this package proposed: a **Curriculum** entity above Book, and a **Universe** entity above Book that would own characters instead of the book owning them. Neither has grounding in anything the audit evidences — no multi-book curriculum need, no cross-book character reuse case — and the second one directly re-opens L1, which this package marked locked. The schema below (`characters.book_id`) doesn't foreclose either later; it just doesn't pay for them now on spec.
- **"Objectives → Pool Items" is being renamed in spirit, not in the database:** a Learning Object (today's `objectives` row — a word, a grammar pattern, a story page, a dialogue line) has a *type*, and Activities are *derived* from that type rather than hand-built per category. §2.5/§4 make this concrete as a small registry table rather than per-category branching logic. I'm keeping `pool_items` as a persisted table, not moving to fully-live-generated activities — your own audit calls the current `objectives`→`pool_items`→`srs_items` chain "clean, queryable, dedup-able" and genuinely working (`01` §2.3); replacing persistence with on-demand generation would mean re-running (and re-paying for) AI generation on every session load, and would lose the stability of "the same review item on day 3 that was scheduled on day 1." The registry pattern gets you the extensibility win without that cost.

### 0.1 Repair and build order

Your proposed order is right: **integrity bugs → F1 → F2 → subsystems**, in parallel with integrity bugs starting immediately. Reasoning:

- B1/B2/B7 are small, independent, and *validate every downstream decision*. Until a unit can produce a real pool end-to-end in production, no F1/F2 design can be tested against reality — you'd be designing against a system you can't observe working.
- F1 before F2 is correct because F2's screens are literally "views over the F1 schema." Building editor IA against JSONB and then migrating it to relational rows is strictly more work than deciding the rows first.
- One addition: **introduce the `books` table as part of F1, not as a follow-on to F1** (see §2.2). Your own docs flag this tension (`06` §6: "the book concept may need to be introduced as part of F1") — I'm resolving it here rather than leaving it open, because characters (L1, locked) and the vault's natural scope (`05` Q1b) both anchor on it. Deferring `books` to "after F1" would mean re-touching every F1 table's FKs a second time.

**Revised phase list:**

| Phase | Contents |
|---|---|
| 0 | B1, B2, B7/G6 repair (parallel, independent) |
| 1 | F1: `books`, `characters`, `story_pages`, `dialogue_lines`, `unit_media`, `generation_jobs`, extended `assets`; migration/backfill |
| 2 | F2: unified authoring shell over the new schema |
| 3 | Subsystem UI: character picker, media picker, story/dialogue editors, KG polish |

---

## 1. Integrity bugs — repair shape

You said the fix isn't in question, only how it fits the architecture. Three quick notes so the repair doesn't get re-done in Phase 1:

**B1 (NULL-owner asymmetry):** Take your lean, option (a) — stamp `teacher_id` at creation in `UploadTextbook.tsx:331`, matching `Engine.createUnit`. Do **not** loosen `generate-exercises`'s guard; that guard is the only thing standing between an authenticated caller and triggering paid generation on someone else's unit, and its strictness is correct. Additionally: extract the ownership check into one shared helper (`_shared/assertOwnership.ts`) used by all four content functions, so the next function added to the pipeline can't reintroduce the asymmetry by copy-paste. This is a small ask now and prevents B1's exact failure mode from recurring when story/dialogue emitters are added in Phase 1.

**B2 (cloud deploy gap):** Out of scope for architecture as you noted, but flag it as a **blocking precondition** for validating Phase 0 at all — sequence the deploy immediately after the B1 fix, not bundled with a larger release.

**B7/G6 (dual manifest):** Don't patch the projection to re-add `image_url` and call it done — that's treating the symptom. The actual fix is structural and belongs to F1: once vocabulary's canonical image reference is a relational FK (`objectives`/`pool_items` → `assets.id`, see §2.3), there is no second JSONB projection to drop fields from. Treat B7 as "temporarily patch the field-drop to unblock teachers today, permanently resolved by F1."

---

## 2. F1 — Data model recommendation

### 2.1 Overall direction

**Hybrid (your Direction C), with a firmer split than "AI-proposed, lean toward A":** I'm not hedging — for anything a teacher edits by hand, that a game plays, or that FSRS tracks, it should be a **relational skill node**. For anything that's fundamentally a file (an image, an audio clip, a video), it should be a **media reference** (an `assets` row), never re-modeled as a skill node. Nothing stays document-JSONB except genuinely unstructured teacher notes, if you have any — everything else in this package is structured enough to deserve a schema.

The reason I'm not leaning softer: your own evidence (`02` §2.1) shows the JSONB-first pattern is *already* the root cause of three of your eight bugs (B3, B4, B7) and the dead-data state of story/dialogue/characters. Direction B ("keep JSONB, fix bugs, add UI") repairs today's symptoms but reproduces the same failure class the next time someone adds a category — there's nothing in JSONB that prevents a second producer writing a second drifted shape. Direction A/C with a single relational emitter removes the *category* of bug, not just today's instances.

### 2.2 The `books` entity — introduced here, anchoring everything else

```sql
create table books (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id),
  title       text not null,
  cover_asset_id uuid references assets(id),
  created_at  timestamptz not null default now()
);

alter table units add column book_id uuid references books(id);
```

- **Backfill:** create one default book per teacher (e.g. "My Units" / named after the teacher), assign all existing book-less units to it. **Do not attempt to auto-detect book boundaries from content similarity** — that's a guess with a real failure mode (wrongly merging two unrelated units' casts into one book, corrupting character continuity for both). Let the teacher split later via a lightweight "move to book" action once the UI exists (§7.1).
- **Book creation UX:** title + optional cover upload for v1. Vision-assisted "scan the cover" is a natural v2 reusing `extract-page`, but don't gate v1 on it.
- Books own: units (`units.book_id`), characters (`characters.book_id`), and — per §6.1 — the vault's default scope.

### 2.3 Per-category verdict

| Category | Verdict | New/changed schema | Rationale |
|---|---|---|---|
| **Vocabulary** | Relational (already correct) | No structural change; point `pool_items`/`objectives`' image reference at `assets.id` instead of a bare URL string | Already the working pattern — extend, don't touch |
| **Grammar** | Relational, but give it a real table instead of JSONB-derived | `grammar_rules(id, unit_id, rule, explanation, examples jsonb)` as canonical source, feeding `objectives(type='grammar')` | Today's "conditional" wiring exists *because* `error_examples`/`transformation_pairs` only exist transiently in JSONB shape from `enrich-unit`; a real table with a stable shape is what `generate-exercises` should read, closing the "grammar empty in practice" gap |
| **Story** | Relational (skill node) | `story_pages(id, unit_id, page_number, speaker_character_id→characters, text, image_asset_id→assets, audio_asset_id→assets)`; `story_comprehension_questions(id, unit_id, story_page_id, question, options jsonb, order_index)` | `comprehension_questions` are already generated with options+answers (`03` §4) and are being thrown away — this is the single highest-value category to relationalize, since it converts dead data into a playable objective type with near-zero new generation work |
| **Song** | Media reference, not a skill node | `unit_media(unit_id, asset_id→assets, role='song', order_index)` | A song is a file/link a teacher plays, not a graded skill; forcing it into `objectives`/`pool_items` buys nothing and adds schema noise |
| **Video** | Media reference, not a skill node | same `unit_media`, `role='video'` | Same reasoning as song |
| **Dialogue** | Relational (skill node) | `dialogue_lines(id, unit_id, order_index, speaker_character_id→characters, text, translation, audio_asset_id→assets)` | Needs speaker FK to characters (continuity, §7.2) and ordered structure for a "who said it?" or roleplay exercise type — that structure doesn't exist as JSONB today, which is exactly why dialogue is "no consumer, no flow type" per `03` §4 |
| **Characters** | Relational, book-scoped (locked L1) | `characters` + `unit_characters` join — see §7.1 | Locked; implementation detailed in §7 |
| **Level / target-age** | No change (L2 deferred) | none | Respecting L2 — see §8 for the one-paragraph hook-point note you invited |

**Note on song/video vs. your Direction A framing:** your doc flags this as a risk of Direction A ("over-engineering if song/video are genuinely better as pure media references") — I'm resolving that explicitly rather than leaving it a risk: **yes, media reference, not skill nodes.** If you later want a song/video *exercise* (e.g. "fill in the missing lyric line"), that becomes its own relational category built from a *transcript* — not from forcing the media asset itself into `objectives`.

### 2.4 The read/write contract

**One canonical store, no manifest cache for anything that moves to a table.** Concretely:

- Every category in §2.3 marked "relational": the table *is* the source of truth. Reads for Stage 3 (board, student app) query the tables directly (or through thin service functions), not through `units.manifest`.
- `units.manifest` stops being written by any new code. Existing `enriched_content`/`knowledge_graph` fields become **legacy read-only fallback** during migration (§2.6), then get dropped once the backfill is verified.
- This directly resolves the B7/G6 class of bug: there's no longer a second shape to drift from the first, because there's only one shape (the row).
- For genuinely denormalized-for-performance needs (e.g. the board wants "everything for this unit" in one query at session start), build a **Postgres view or a single RPC function** (`get_unit_bundle(unit_id)`) that joins the tables and returns one payload shaped like today's manifest — but this is a *read-time projection*, computed fresh, never hand-written by two different code paths the way `knowledge_graph` vs `enriched_content` are today. That distinction (derived-on-read vs written-by-two-producers) is the actual fix, not just "add a normalizer" (you already have `normalizeManifest()` and it didn't prevent B7, because it's opt-in per caller, not enforced).

### 2.5 Generation emission model

**Single emitter per category, not a JSONB-writer + relational-projector split.** This directly answers your `03` §5 Q5 — I'm recommending against keeping the split, because the split *is* the mechanism behind B3/B4/B7. Concretely:

- `enrich-unit` is restructured so each category branch (`vocabulary`, `grammar`, `story`, `characters`, `dialogues`, `media`) writes directly to its relational table (upsert, not insert-only — see idempotency below), not to `manifest.enriched_content`.
- `generate-exercises` remains the single place that turns skill-node rows into `objectives`/`pool_items`, now also fed by `grammar_rules`, `story_pages`/`story_comprehension_questions`, and `dialogue_lines`, not just vocabulary.
- **Resumability:** add `generation_jobs(id, unit_id, stage, status, error, attempt, started_at, completed_at, unique(unit_id, stage))`. `orchestrate-lesson` becomes a coordinator that checks/updates this table per stage instead of a single fire-and-forget `fetch`. This directly targets your "unit looks done but has no exercises" bug class — a failed stage is now a visible row, retryable independently, instead of a `.catch`-logged void.
- **Idempotency:** every emitter follows the pattern `objectives` already uses — a unique constraint per natural key (`(unit_id, page_number)` for story pages, `(unit_id, order_index)` for dialogue lines, `(book_id, lower(name))` for characters) plus insert-then-reconcile logic, so re-running `enrich-unit` on a unit never duplicates content. This is a direct requirement for the "teacher re-enriches a unit" and "regenerate this image" flows in §5 and §6.
- **Regeneration/upgrade:** give every media-bearing category (not just vocab) the same upgrade path vocab images get today — a generic `regenerate(entity_type, entity_id, extra_instructions)` action that creates a *new* `assets` row (never overwrites) and repoints the FK. One code path, reused by vocab images, character portraits, story-page illustrations, and dialogue audio.
- **Drive `pool_items` generation from a small declarative registry, not per-category branching.** Today's implicit shape ("if grammar, look for `error_examples`/`transformation_pairs`; if vocab, do X") means every new learning-object type requires new bespoke logic inside `generate-exercises`. Cleaner:

  ```sql
  create table activity_type_registry (
    learning_object_type text not null,  -- 'vocabulary' | 'grammar' | 'story' | 'dialogue'
    activity_type        text not null,  -- exercise_type / flow-type it produces
    generator_key         text not null, -- which generator function builds it
    primary key (learning_object_type, activity_type)
  );
  ```

  `generate-exercises` looks up which activity types apply to a given objective's `learning_object_type` and calls the matching generator, instead of hardcoding a branch per category. Adding a new activity (e.g. a "sentence builder" for grammar, or the "who said it?" dialogue game in §7.5) becomes "insert a registry row + implement one generator function," not a change to the orchestration function itself. This is still a persisted-`pool_items` model (see §0.0 for why I'm keeping persistence rather than deriving activities live) — the registry only changes how the generation step decides what to build, not when or where it's stored.

### 2.6 Migration story

1. Add `book_id` (nullable) to `units`; run the default-book backfill (§2.2).
2. Create the new tables (§2.3, §7.1). Leave `units.manifest` untouched and readable.
3. Write a one-time backfill job, **per unit**: parse `manifest.enriched_content.*`, insert rows into the new tables. For characters specifically, fuzzy-match by normalized name *within the unit's assigned book* before creating a row (§7.7) — flag ambiguous matches (similar-but-not-identical names) for a teacher-facing confirm-merge screen rather than auto-merging silently, since a wrong auto-merge corrupts continuity across the whole book.
4. Feature-flag reads per category: switch board/student/editor reads from manifest → relational table only after that category's backfill is verified for a given unit (a `units.migrated_categories text[]` column works as a simple gate).
5. Once all units are verified, drop the JSONB sub-fields (or leave `manifest` as an audit-trail column, cheap to keep, expensive to keep *trusting*).
6. **No teacher edits are lost** because nothing is deleted until step 5, and step 4's flag means a teacher editing mid-migration is always editing the currently-canonical copy for that category.

---

## 3. F2 — Authoring UI consolidation

### 3.1 Overall direction

A variant of your **Direction B**, made concrete: **one unified Unit Studio, with the first-run review step folded in as that Studio's default landing state for a freshly-generated unit — not a separate screen.** This differs slightly from "Studio + keep a distinct Workshop": I don't think Workshop should remain a *different component* with its own data-reading logic (that's exactly the four-conventions problem in `02` §3.1) — it should be the same Studio, opened in a "first review" mode that just changes which affordances are emphasized (approve/toggle vs. free edit). One component, one data contract, one save path; the "first run" feeling comes from UI state, not a separate codebase.

### 3.2 Target IA

```
Unit list
  └─ Unit Studio (/teacher/unit/:id)          ← single entry point, replaces 4 routes
       ├─ tab: Content   (Vocabulary, Grammar, Story, Characters, Song/Video, Dialogue, Settings)
       │        — this tab set is exactly your §2.3 relational categories, one tab each
       │        — first open after generation = same tab set, "review" framing (badges on
       │          un-reviewed items), no separate Workshop route
       └─ tab: Plan       (timeline/session composer — the "arrange for live" surface)
Live session exit → returns to Unit Studio, Content tab (not a third orphaned screen)
```

- **Plan and New-Unit routes stop pointing at `LessonTimelineBuilder`** (the mock) and point here — this is your B5 fix, now folded into the IA rather than patched separately.
- `AssetWorkshop`'s all-category completeness and `UnitContentVault`'s real save-path become one screen; `LessonStudio`'s "Knowledge Graph" toggle is retired (superseded by the Content tab).

**Named against the teacher's actual four phases** — scan/upload is *Generate* (unchanged, already works), the Studio's Content tab is *Review*, its Plan tab is *Compose*, and the live session is *Teach*. Naming the IA this way is a useful check on the design above: each phase maps to exactly one screen state, not a screen-per-implementation-detail, which is the failure mode the current four editors are in.

### 3.3 Content vs. Plan — one surface, two tabs, not two apps

Answering `02` §3.4 Q2 directly: **one surface, two tabs**, not two separately-routed apps. Reasoning: a teacher's real task ("review this unit, then arrange it for Tuesday's class") is one session, not two visits — today's fragmentation (Edit hidden behind a card icon, Plan routing to a dead mock, Studio only reachable after exiting live) is what makes the DnD "not working" symptom feel structural when it's actually just routing. Two tabs of one component sharing the same loaded unit avoids a re-fetch/re-navigate between them and keeps unsaved-edit state coherent (no "did my vocab edit save before I switched to Plan?" ambiguity).

### 3.4 AssetWorkshop's fate

Folded in, not kept as a separate first-run-only component (see §3.1). Its *behavior* — surfacing every category for initial approval — becomes the Studio's first-open state, gated on `units.migrated_categories`/a simple `reviewed_at IS NULL` flag rather than being a different screen with its own read path. This also resolves G2 (unreachable after first run) for free: since it's the same screen as ongoing editing, "re-review" is just "open the Studio again."

### 3.5 Shared data contract

One TypeScript type per content category, matching the F1 tables 1:1 (e.g. `StoryPage`, `DialogueLine`, `CharacterRef`), used by the Studio's tabs, the Plan tab's timeline items, and the board/student consumers. This retires the three drifted shapes in `02` §3.1 (`TimelineItem`, `TimelineBlock`, `units.flow`'s 22-type shape) in favor of one contract per entity, imported wherever it's used — a straightforward consequence of F1 giving you real tables to type against instead of ad hoc JSONB keys.

### 3.6 Mobile

Read-only Content tab, no Plan tab, for v1. Teachers plan lessons on a larger screen in practice (this matches the existing stub's implicit assumption); a read-only "check what's in this unit" view on mobile has real value (glancing before class) without committing to a full mobile editing surface now. Revisit mobile editing only if usage data shows teachers actually trying to edit from phones — no evidence of that demand exists in the current codebase.

---

## 4. Generation Pipeline (Stage 1) — implementation notes beyond §2.5

- **Should generation emit relational content for all categories?** Yes — answered in §2.3/§2.5. Concretely for the two categories you specifically flagged: story gets **both** comprehension-MCQ objectives (from `comprehension_questions`, already generated and currently discarded) **and** sequencing objectives (from `pages` order) — both are cheap once `story_pages` exists, and STORY_SEQUENCING is already a board flow type with no producer (`03` §4), so sequencing is a same-day win once the table exists. Dialogue gets a new `DIALOGUE_STAGE` flow type (presentation, analogous to `STORY_STAGE`) plus a `DIALOGUE_ROLEPLAY`/`WHO_SAID_IT` pool-item type (played) — not presentation-only, since the "who said it" idea in your own `06` Q5 is exactly what `dialogue_lines.speaker_character_id` unlocks.
- **`objectives.type` CHECK constraint** (`vocabulary|grammar|phonics` today) needs widening to include `story`, `dialogue`. Flag this explicitly since it's a one-line migration easy to forget under the bigger schema work.
- **Idempotency and single-emitter**: covered in §2.5.

---

## 5. Knowledge Graph (Stage 2)

### 5.1 What it should be

**Hybrid, weighted toward structured editing (your option (c), but concretely scoped):** the primary surface is the structured category-tab editor (§3.2's Content tab) — full-graph-canvas editing (option (b)) is the wrong tool for a teacher audience doing word/sentence-level edits, and building a real graph lib (reactflow/cytoscape) is a large investment for a workflow that's fundamentally "fix this word's definition," not "restructure the relationships." That said, a **lightweight, secondary, read-mostly** visual — a simple cast/story map showing which characters appear in which story pages and dialogue lines — has genuine pedagogical value (it's the one place "does my cast show up consistently across this unit" is easy to see at a glance) and partially earns the "Knowledge Graph" name without the cost of a full graph editor. Make it a small panel inside the Characters or Story tab, not a competing top-level surface.

### 5.2 Editing writeback design

Direct consequence of §2.4: edit → write to the relational row → for categories that feed `objectives`/`pool_items` (vocab, grammar, story, dialogue), call the same reconciliation logic `generate-exercises` already uses on re-run (upsert-then-retire keyed by the same natural key), scoped to just the changed objective rather than re-running the whole category. No manifest-cache invalidation step exists to forget, because there's no manifest cache in the loop for these categories (§2.4).

### 5.3 "Regenerate image with extra description"

Answered generically in §2.5's `regenerate()` action. Landing: the new `assets` row is always created (dedup does not apply to explicit teacher-initiated regeneration — see §6.6), goes into the vault automatically (§6.4), and the content row's `image_asset_id` FK repoints to it. The **old asset is not deleted** — it stays in the vault, browsable/reusable, in case the teacher wants to revert or reuse it on a different item. Downstream `pool_items` referencing that objective read through the FK, so there's no separate "propagate to pool_items" step to design — they were already pointing at the objective, not a copied URL.

### 5.4 Story/song/video/dialogue — edit instance or drive regeneration?

- **Story, dialogue:** edit the instance directly (it's now a row with a text field — a teacher fixing a typo or rewording a line shouldn't have to re-prompt an LLM). Offer regeneration as a *secondary* "rewrite this page with AI" action, not the primary edit path.
- **Song, video:** given the YouTube region block, **yes — paste-a-URL / upload-a-file is the realistic primary path**, with AI suggestion (search query) as a secondary helper the teacher can click through to YouTube directly rather than expecting an in-app result list. One nuance worth flagging: the region block you cite is specifically on the **YouTube Data API** (used for search); a plain `<iframe>` embed by video ID typically doesn't require that API at all, so once a teacher pastes a URL, embedding the actual video player is very likely still possible even though *searching* isn't — worth a quick spike before assuming video is permanently URL-only. See §6.5.

### 5.5 Discoverability

Resolved structurally by §3 — "review/edit this unit" and "the screen you land on after generation" are the same Unit Studio, so there's no separate discoverability question to answer once F2 ships.

### 5.6 Live-update vs. edit-then-republish

**Edit-then-republish for anything mid-live-session; immediate for anything else.** A live session is already running off `SessionContext`'s loaded state (`01` §2.3 confirms this is genuinely well-built) — hot-patching content into a session the teacher is actively presenting is a bigger behavioral change than this round should take on, and risks surprising a teacher mid-class if a word's image silently changes on the board. Recommend: edits save immediately to the canonical store (so the *next* session/the student app picks them up right away), but an **already-running** session keeps the snapshot it loaded at start. This is a policy decision, not a technical blocker — flag it to the product owner as a one-line confirm rather than treating it as settled by this recommendation alone.

---

## 6. Library / Vault

### 6.1 Scope

**Per-book (your option (b)), with per-teacher browsing as a filter, not a hard boundary.** Reasoning: characters are book-scoped (L1, locked) and most media reuse in practice will be "another asset for this same book's recurring cast/setting" — book scope is the natural default. But a teacher will occasionally want to reuse a nice generic background across books, so don't hard-wall it: `assets.owner_id` (teacher) is always set; `assets.book_id` is set when the asset was created in a book's context (nullable for cross-book generic assets). The picker UI defaults to "this book" with a one-click "show all my media" toggle.

```sql
alter table assets add column owner_id  uuid references auth.users(id);
alter table assets add column book_id   uuid references books(id);
alter table assets add column kind      text;   -- 'generated' | 'uploaded' | 'external_url'
alter table assets add column source_url text;  -- pasted URL / YouTube link
alter table assets add column tags      text[] default '{}';
alter table assets add column is_deleted boolean default false;
```

Unit-to-asset becomes many-to-many via a join table rather than the current single `unit_id` FK (which is what makes reuse impossible today):

```sql
create table unit_media (
  unit_id     uuid references units(id) on delete cascade,
  asset_id    uuid references assets(id) on delete cascade,
  role        text not null,   -- 'song' | 'video' | 'cover' | 'story_page_image' | ...
  order_index int default 0,
  primary key (unit_id, asset_id, role)
);
```

### 6.2 Tagging / search

Three layers, cheapest first: (1) **category tag auto-set at creation** (`vocab-image`, `story-illustration`, `character-portrait`, `song`, `video`) — free, already knowable at write time; (2) **prompt-derived keyword tags** — cheap string-splitting off the generation prompt, no extra AI call needed; (3) **manual teacher tags** — free-text, additive. Search = simple `ILIKE`/array-contains across prompt + tags + category filter chips. Don't build AI-vision auto-tagging (a fourth, more expensive layer) until you have evidence teachers can't find things with the first three — it's the kind of feature that's easy to add later and easy to over-build now.

### 6.3 The media-picker contract

One component, one contract, used everywhere media is needed — this directly closes G5:

```
<MediaPickerModal
  kind="image" | "audio" | "video"
  scope={{ bookId, includeAllMine?: boolean }}
  onSelect={(asset: { id, public_url, storage_path, kind }) => void}
/>
```

Shows a grid of the scoped vault (filtered by `kind`), plus inline "Upload new" and "Generate new" actions so a teacher never has to leave the modal to add something that doesn't exist yet. Every field that needs media — vocab image, story-page image, character portrait, song, video, dialogue audio — calls this same component; today each screen (UnitContentVault's YouTube search + URL paste, AssetWorkshop's per-item buttons) rolls its own, which is exactly the inconsistency you flagged.

### 6.4 Generation → vault auto-population

Yes, automatically — every generated asset already writes an `assets` row today (for dedup); the only change needed is a **UI that reads it** (`ResourceLibrary.tsx` wired to `assets` instead of its hardcoded 6 items — this is a comparatively cheap fix once the picker component exists, since the library screen becomes "the picker, full-page, no `onSelect`"). Regeneration always creates a new row (§2.5, §5.3) — never overwrites — so "old" assets remain browsable/reusable by design, not as an afterthought.

### 6.5 Song & video specifically

Confirmed: upload-or-URL as primary (§5.4), AI search-suggestion as secondary. Practical additions:
- **New bucket recommended** for uploaded video — `generated-media`'s 50MB limit is workable for images/audio but tight for even short classroom video clips; a separate `media-uploads` bucket with a higher limit (e.g. 200MB) and video MIME types allowed keeps the size/type policy explicit rather than stretching the existing bucket's intent.
- **For pasted YouTube URLs:** extract the video ID and embed via `<iframe>` (no Data API call required for playback, only for *search*) — worth validating this isn't also blocked in your deployment's region before committing to it, but it's a very different API surface than the one you've confirmed is blocked, so don't assume video embedding is dead just because search is.

### 6.6 Dedup vs. reuse

Keep automatic prompt-hash dedup **only at first-generation time** (cheap, avoids double-paying for an identical prompt during initial enrichment). Any teacher-initiated "regenerate" or "generate new variation" action **bypasses the dedup check outright** (it's an explicit request for a *different* asset, not the same one) rather than trying to distinguish intent from the prompt text.

### 6.7 Quota / cleanup

Brief recommendation, since you asked for one and not a full design: **soft-delete only** (`is_deleted` flag + retention window), never hard-delete, since an asset can be referenced by multiple `unit_media`/objective rows and a hard delete risks orphaning content mid-use. A periodic job flags zero-reference assets past N days old for a teacher-facing "clean up unused media" review screen, rather than auto-purging. Defer hard spend quotas (no evidence yet of runaway generation cost) — a soft usage indicator (this month's generation count/cost) is enough for v1.

---

## 7. Characters (locked L1) — implementation architecture

### 7.1 Data model

```sql
create table characters (
  id            uuid primary key default gen_random_uuid(),
  book_id       uuid not null references books(id) on delete cascade,
  name          text not null,
  role          text,             -- protagonist / sidekick / mascot / adult
  description   text,
  personality   text,
  look_prompt   text,             -- reusable prompt fragment, see §7.3
  reference_image_asset_id uuid references assets(id),
  voice_id      text,             -- ElevenLabs voice id, see §7.4
  created_at    timestamptz not null default now(),
  unique (book_id, lower(name))
);

create table unit_characters (
  unit_id      uuid references units(id) on delete cascade,
  character_id uuid references characters(id) on delete cascade,
  primary key (unit_id, character_id)
);
```

`character_ledger` is **not repurposed.** It's semantically a different concept (student avatar cosmetics, per `GamificationService.ts`) with a table shape that only superficially resembles what's needed here (`unit_id` scoping is exactly wrong for L1). Building a fresh `characters` table is cleaner than overloading an existing one with two unrelated meanings. `character_ledger` can stay as-is for cosmetics — a rename to `avatar_cosmetics_ledger` would reduce future confusion but isn't required by this work.

### 7.2 Reference vs. copy

**Reference-with-optional-override — confirming your lean, with the mechanism spelled out.** `story_pages.speaker_character_id` and `dialogue_lines.speaker_character_id` are FKs to the book-level `characters` row (true continuity: editing a character's name/portrait updates every unit that references it). For the rare one-off exception (a guest character who appears in exactly one unit and doesn't belong in the book's permanent cast), add nullable override columns rather than forcing a full copy-on-use model for everyone:

```sql
alter table story_pages    add column speaker_override_name text;
alter table dialogue_lines add column speaker_override_name text;
```

If `speaker_character_id` is null and `speaker_override_name` is set, the line renders as a one-off speaker with no library entry. This keeps continuity as the default (matching the pedagogical reality your docs describe) while not blocking the rare exception.

### 7.3 Visual identity consistency

Given your stack (region-safe OpenRouter models, no confirmed img2img/seed-lock support), the reliable baseline is **prompt-consistency, not img2img**: store `look_prompt` (a reusable description — "a small round yellow robot with blue antenna and a friendly smile") on the character, and every image-generation call involving that character prepends it to the scene-specific prompt. This is provider-agnostic and works today. If your image provider (Pollinations/flux) turns out to support seed-locking reliably, add a `seed` column as an enhancement layer on top — but don't make the design depend on it, since you'd be betting continuity on a provider capability you haven't confirmed.

### 7.4 Character voice

Yes — `characters.voice_id` (ElevenLabs voice ID), set at character-creation time (teacher picks from a small curated list, or AI suggests one matching the stated role/personality as a default the teacher can override). `tts.ts`/`generate-media`'s dialogue/story-audio generation looks up `characters.voice_id` via the line's `speaker_character_id` instead of using one unit-wide voice — this is a small, mechanical change once `dialogue_lines`/`story_pages` carry the FK.

### 7.5 Character-driven content

Yes, first-class in generation: `enrich-unit`'s story/dialogue branches should first query `characters` for the unit's book and **write content referencing the existing cast**, only inventing new characters if the book has none yet (first unit of a new book) — and when it does invent new ones, prompt the teacher to confirm/adopt them into the library rather than silently creating book-level entries from a single unit's generation. This is the mechanism that makes L1 actually happen at generation time, not just at editing time.

Character-driven games: yes, worth building once `dialogue_lines.speaker_character_id` exists — a "who said it?" pool-item type is a natural, low-effort addition to the exercise-type union once the underlying data supports it (§4).

### 7.6 The character picker modal contract

Analog of §6.3, same shape:

```
<CharacterPickerModal
  bookId={book_id}
  onSelect={(character: { id, name, image_url }) => void}
/>
```

Shows the book's cast as cards (portrait + name + role) plus an inline "Create new character" form (name/role/description → generates a `look_prompt` + placeholder portrait immediately, real portrait generated async). Invoked from: story-page speaker field, dialogue-line speaker field, and the Characters tab's "add to unit" action (which just inserts a `unit_characters` row — no new character data, just "this book character appears in this unit").

### 7.7 Migration of existing per-unit characters

Per unit (after book backfill, §2.6): parse `manifest.enriched_content.characters[]` and `theme_context.characters[]`, normalize names, fuzzy-match against existing `characters` rows **within the same book** (Levenshtein or simple case/whitespace-normalized exact match is probably sufficient given these are short, teacher-facing names). Confident matches link via `unit_characters`; ambiguous matches (similar but not identical) surface in a lightweight teacher-facing "confirm these are the same character" screen rather than auto-merging — a wrong auto-merge silently corrupts continuity for the whole book, which is a worse failure mode than asking the teacher once.

### 7.8 Character CRUD screen location

**Book view is the primary home** — introduce a top-level "Books" section (`teacher → Books → [Book] → Units | Cast`) where "Cast" is the character list/CRUD for that book. The picker modal (§7.6), reachable from inside unit editing, is the *secondary* access point and can inline-create but always writes into the same book-level table. This matches the mental model your `06` doc states directly: characters belong to books, not to a single unit's editor — so their home screen should be the book, not the Knowledge Graph.

---

## 8. L2 hook-point note (brief, as invited — not foundational work)

You asked not to fold level/target-age work into this round, and I'm not proposing to. One optional forward-looking note: when that work starts, the cleanest hook is **`units.book_id`** rather than per-unit — course books typically target one age band consistently, so a `books.target_age_range` / `books.cefr_level` column (set once per book) is likely a better anchor than a per-unit field, and it would let a future adaptation pipeline reason about the whole book's difficulty curve rather than each unit in isolation. This is a note for later, not a decision to make now — it doesn't require any schema change in this round beyond `books` already existing (which §2.2 gives you anyway).

---

## 9. Summary — recommendation at a glance

| Fork/Question | Recommendation |
|---|---|
| Domain model | Book → Unit → Learning Object → Activity → Live Session → Learning History; Knowledge Graph is a UI surface, not an entity; no Curriculum/Universe layer added on spec |
| Pool-item generation | Persisted (not derived live, for cost/stability reasons) but driven by a small `activity_type_registry`, not per-category branching |
| F1 direction | Hybrid: relational for anything edited/played/tracked (vocab, grammar, story, dialogue, characters); media-reference for song/video; nothing stays document-JSONB |
| F1 anchor entity | `books`, introduced in this phase, not deferred |
| F1 read/write contract | Tables are truth; manifest is retired for migrated categories; denormalized reads are computed views, not hand-written second copies |
| F1 emission | Single emitter per category (no JSONB-writer/relational-projector split); `generation_jobs` for resumability |
| F2 direction | One Unit Studio, two tabs (Content, Plan); Workshop's behavior folded in as first-open state, not a separate screen |
| F2 mobile | Read-only Content tab only, v1 |
| Knowledge Graph shape | Structured tabs primary; small optional cast/story map secondary — not a full graph editor |
| Vault scope | Per-book default, per-teacher toggle |
| Characters: reference vs copy | Reference, with a nullable override for one-off non-library speakers |
| Characters: visual consistency | Reusable `look_prompt`, prompt-prepended per generation; seed-lock only if the provider confirms support |
| Sequencing | Confirmed: integrity bugs (parallel) → F1 (with `books`) → F2 → subsystem UI polish |

*Prepared in response to the package dated 2026-07-29, revised after cross-checking against a second advisor pass. Where I've diverged from your stated lean (song/video as non-skill-nodes made definitive rather than a risk note; `books` pulled into F1 rather than left as a follow-on; `character_ledger` explicitly not repurposed) or from the second opinion (keeping `pool_items` persisted rather than fully live-derived; declining the Curriculum/Universe layers as ungrounded and, for Universe, a re-opening of locked L1), I've flagged the reasoning inline so it's easy to push back on any individual call.*
