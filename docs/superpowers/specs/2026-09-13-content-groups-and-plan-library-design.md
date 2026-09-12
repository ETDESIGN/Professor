# Content Groups & Plan Library — Design

**Date:** 2026-09-13 · **Status:** Approved (owner) · **Audited against:** live unit `7e50177c` ("unit 2", Power Up 2 pp. 19–26 upload)

## 1. Problem

Teachers upload one unit of a textbook containing several distinct content groups — multiple vocabulary series, multiple stories, a comic, a song — but everything downstream of extraction treats the unit as one undifferentiated pool:

1. **Vocab series mixed.** All 25 words of unit 2 land in every game at once. Series identity (`vocabulary_items.set_label`) survives extraction but dies at `generate-exercises/index.ts:453-454` (select omits `set_label`, so the stamp at `:98-100` never fires) and no runtime pool filter exists anyway.
2. **Stories concatenated.** `enrich-unit` `buildBasketStory` (:741-928) flattens every reading passage AND every comic's panels into one `story_pages` list; `getStory()` re-reads ALL unit story pages at runtime, overriding block data; one story objective per unit. Unit 2's story stage = CLIL paragraph + comic panels interleaved.
3. **Plan composer can't express selection.** Only comics have per-item selection (the 2026-08-30 pattern). Vocab/story blocks are one-size-fits-all. `STORY_STAGE_AG` (owner's preferred "Story Stage 2") is missing from `SUPPORTED_FLOW_TYPES` → silently dropped by any AI/class-flow regeneration.
4. **Media invisible in planning.** PlanComposer has no Song/Video block and no unresolved badge; media only enter via AI regeneration. The book's own song never enriched into the unit (media pass optional → `manifest.song_suggestions` NULL for unit 2 while a confirmed `song_sheet` exists).
5. **Silent pending-review exclusion.** Pages 25–26 (CLIL continuation + Literature story "A bad, bad Monday morning") sat `pending` and were silently excluded from baskets; nothing in the planner warns. (Printed p. 27, the story's second page, was never uploaded at all.)
6. **Unitization always forces the full split editor** even for single-unit uploads; and a unit can hold only ONE plan (`units.flow`), so "Lesson 1 / Lesson 2 / Revision" is inexpressible.

## 2. Ground truth (unit 2 audit)

Book: 3 vocab series ("Vocabulary 1" days of the week, "Free time activities", "Let's be healthy!"), 1 comic "The Friendly Farm" (6 panels), 2–3 reading passages (CLIL ×2 + Literature "A bad, bad Monday morning"), 1 printed song "How often…". System saw: 3 series (labels intact in DB), 1 mixed story, 1 comic, 0 songs, 2 pending passages excluded.

## 3. Decision history (owner)

- Approach **B**: thin `unit_content_groups` registry (group → `structure_ids[]`), all selectors resolve group → structure_ids → objectives (reuses comic + class-plan rails). Approach C (groups own members: words/pages/crops) pinned as a late-future upgrade.
- Vocab waves: **one block per series** in book order; blocks carry their group selection (multi-select when editing).
- Story stage accepts **either a story or a comic** group (Story Stage 2 = `STORY_STAGE_AG` preferred renderer; Story Stage 1 kept). Comics additionally remain as COMIC_PANELS game. Stories keep their **book illustrations** (scene crops).
- Group titles: **AI-derived descriptive names** at enrichment (printed header kept as `printed_label`); teacher can rename; renames stick.
- Media fixes **in this workstream** (book-song enrichment always-on, Song/Video library block, unresolved badge).
- Unitization: keep capability; **default path requires zero decisions** (1 detected unit → skip editor; 2+ → simple confirm screen with Create N / Keep as one / Adjust manually).
- **Multiple plans per unit** (Lesson 1, Lesson 2, Revision…): new `unit_plans` table; `units.flow` stays as default-plan mirror for edge-function compat.
- Later (not now): favorites/pinning on library items, custom Page module (teacher uploads image/video), new story/comic presentation games.

## 4. Architecture

### 4.1 Data model

```sql
unit_content_groups (
  id uuid pk, unit_id → units on delete cascade,
  kind text check in ('vocab_series','story','comic','song'),
  title text not null, printed_label text,
  structure_ids uuid[] not null default '{}',
  order_index int not null default 0,
  source text not null default 'scan',   -- 'scan' | 'teacher'
  created_at, updated_at
)
```

RLS: unit owner. Seeded idempotently (`seed_unit_content_groups(p_unit_id)`) from confirmed/edited `page_structures`: vocab_sets grouped by normalized set_label; stories = per reading/clil passage with adjacent same-title merging; one group per comic / song_sheet. Seeding never deletes or retitles teacher-edited groups.

```sql
unit_plans (
  id uuid pk, unit_id → units cascade, title text,
  flow jsonb not null default '[]', order_index int,
  is_default bool not null default false, created_at, updated_at
)
-- classroom_sessions.plan_id uuid → unit_plans(id) nullable
```

Seeded one row per unit from `units.flow`. `units.flow` remains a **mirror of the default plan** (orchestrate-lesson, generate-media patching, syncClassPlanFlows keep working).

### 4.2 Contracts

- **Pool items** gain `content.group_id` (+ `set_label` on vocab) — stamped by generate-exercises.
- **Flow blocks** gain optional `data.group_id, data.structure_ids, data.group_kind, data.group_title` — the COMIC_PANELS pattern generalized. Blocks without tags behave exactly as today (unit-wide).
- **Story objectives** become per story group (legacy unit-wide objective kept for old data).
- **Flow resolution at runtime:** session plan → class plan → default plan.

### 4.3 Pipeline changes

- **enrich-unit**: after review-confirm → seed groups + one batched region-safe AI naming call; stories built per group (comics no longer appended to `story_pages`; a story block selecting a comic freezes panel pages at generation); media pass always runs (book songs → `manifest.song_suggestions`, source `'book'`); summary reports pending-skipped structures.
- **generate-exercises**: fix the `set_label` select bug; stamp `group_id`; per-story objectives + items.
- **orchestrate-lesson**: per-series vocab waves (FOCUS_CARDS + one game shell each), per-story STORY_STAGE_AG + STORY_QUEST, COMIC_PANELS per comic, warm-up MEDIA_PLAYER (now fed). `STORY_STAGE_AG` registered in `SUPPORTED_FLOW_TYPES`.
- **generate-class-flow / classFlow**: per-group rebuild sliced by class scope; optional `source_plan_id`.
- **Board runtime**: `blockScope` filter (group_id match intersected with class-plan objective scope); story renderers frozen-`data.pages`-first, relational `getStory(structureIds)` fallback.
- **PlanComposer**: library becomes game **templates**; content-bound templates open a **group picker** (multi-select series / single story/comic); "In plan" per template+group; Song/Video template with resolve UI in inspector + ⚠️ unresolved badge; pending-review banner; plan switcher (new/duplicate/rename/delete/set-default).
- **Unitization**: post-confirm gate — 1 group → apply directly; 2+ → `UnitSplitConfirm` (per-card rename/merge/keep, "Create N units" / "Keep as one unit" / "Adjust manually" → existing editor unchanged).
- **Vault**: groups section with rename (renames stick; seed never overwrites).

### 4.4 Healing

`scripts/testing/content-groups-backfill.ts` (dry-run default): seed + AI-name + re-stamp pools per unit. Unit 2 heal: confirm pages 25–26, add printed p. 27, re-enrich, regenerate plan → expect 3 series + 2 stories + 1 comic + 1 song groups.

## 5. Verification

- Unit tests (vitest): blockScope, getStory filter, group-name helpers, plan flow resolution.
- `npx tsc --noResolve` sweep over supabase/functions (repo tsc does not cover functions).
- Live probes per AGENTS §7-8: migrations via Management API; function deploys explicit; Vercel last-modified; `/functions/v1/` 401 probes.
- Live E2E on healed unit 2 (per-series waves, Story Stage 2 on story AND comic, Alex story intact, warm-up song, two plans).
