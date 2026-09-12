# Content Groups & Plan Library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make unit sub-content (vocab series, stories, comics, songs) first-class, teacher-selectable "content groups" from extraction → games; add multi-plan per unit, simplified unitization, and media planning fixes.

**Architecture:** `unit_content_groups` registry (group → structure_ids) seeded by enrich-unit with AI titles; selection flows through `group_id`/`structure_ids` tags on pool items and flow blocks (generalized COMIC_PANELS pattern). `unit_plans` table for multi-plan; `units.flow` stays as default-plan mirror. Board runtime filters pools by block group scope; story renderers frozen-pages-first.

**Tech Stack:** Vite+TS SPA, Supabase Postgres (migrations via Management API `POST /v1/projects/xsdnzijketjnzhakqtit/database/query`), Edge Functions/Deno (explicit deploys), vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-13-content-groups-and-plan-library-design.md`

## Global Constraints

- Region-safe AI only (never OpenAI/Google/Anthropic for app AI; OpenRouter gateway, `AI_MODEL_NAME` etc.).
- Migrations: apply via Management API with `SUPABASE_ACCESS_TOKEN`, record in `schema_migrations` (check existing convention in the migration file header).
- Edge functions do NOT auto-deploy: `npx supabase functions deploy <names> --project-ref xsdnzijketjnzhakqtit --no-verify-jwt` after every function change.
- After function edits: `npx tsc --noTarget --noResolve` style sweep over `supabase/functions` (repo tsc does not cover functions) — see §9 of AGENTS for the exact command pattern used previously.
- PWA prompt-mode untouched (`registerType: 'prompt'`, no `skipWaiting`).
- Backward compat: blocks/pool items without group tags behave exactly as today (unit-wide fallback).
- Full vitest suite (`npx vitest run`) + `npm run build` must stay green before each commit.

---

### Task 0: Docs
- [x] Spec written + committed; this plan written + committed.

### Task 1: Migration — `unit_content_groups` + `seed_unit_content_groups`
**Files:** Create `supabase/migrations/20260913000001_unit_content_groups.sql`.
**Produces:** table (cols per spec §4.1 incl. `source`), index `(unit_id, kind, order_index)`, RLS owner-only (via `units.teacher_id = auth.uid()`), RPC `seed_unit_content_groups(p_unit_id uuid) returns jsonb` — idempotent, confirmed/edited structures only, heuristics: vocab by normalized set_label; stories per reading/clil passage with adjacent same/empty-title merge; comic/song per structure. Seed skips groups whose ids are referenced by any `unit_plans.flow`/`units.flow` block `data.group_id` (protect teacher picks) and never retitles `source='teacher'` rows.
- [ ] Write migration (follow repo migration header conventions; RLS helper: reuse existing `auth`-based policies pattern from e.g. `20260830130000_class_plans.sql`)
- [ ] Apply via Management API; verify in `schema_migrations`
- [ ] `select seed_unit_content_groups('7e50177c-de93-4315-ab8c-cf2b2147d6da')` → expect 5 groups: 3 vocab_series, 1 story (CLIL p24 only — pending pages excluded), 1 comic, 0 song? (song_sheet IS confirmed → 1 song group; total 6 — verify which)
- [ ] Commit

### Task 2: enrich-unit — seeding, AI names, per-story pages, media always-on
**Files:** Modify `supabase/functions/enrich-unit/index.ts`; Create `supabase/functions/_shared/contentGroups.ts` (pure helpers: group-name prompt builder, structure→group map) + `supabase/functions/_shared/contentGroups.test.ts` if a vitest harness covers `_shared` (check existing tests location; else test via a scripts fixture).
**Consumes:** RPC from Task 1.
**Produces:** `ensureContentGroups(unitId, supabase)` — seeds + AI-names untitled groups (`title` from words/text via one batched region-safe call; never overwrite non-default titles).
1. [ ] Call seeding+naming in the post-review enrichment path (where baskets are finalized)
2. [ ] `buildBasketStory` rewrite: per story group; comics excluded from `story_pages`
3. [ ] `buildBasketMedia` always runs in standard pass; book songs persisted to manifest
4. [ ] Summary includes `pending_skipped` structure count
5. [ ] `tsc` sweep + deploy enrich-unit
6. [ ] Live verify on 7e50177c (re-run enrichment): story_pages = CLIL only; song_suggestions has "How often…"; groups titled
7. [ ] Commit

### Task 3: generate-exercises — stamping + per-story objectives
**Files:** Modify `supabase/functions/generate-exercises/index.ts`.
**Consumes:** `unit_content_groups` rows.
**Produces:** every vocab pool item `content.set_label` + `content.group_id`; story items `content.group_id`; story objectives per group (`ensureObjective('story', groupTitle, firstStructureId)`).
1. [ ] Fix vocab select (:451-469) to include `set_label, source_structure_id`; build structure→group map from `unit_content_groups.structure_ids`
2. [ ] Per-story objectives + items (keep legacy unit-wide story objective untouched for old units)
3. [ ] `tsc` sweep + deploy
4. [ ] Live verify on 7e50177c: `select count(*) filter (where content ? 'group_id') / count(*)` = 100% for vocab types
5. [ ] Commit

### Task 4: orchestrate-lesson + flowTypes + classFlow — per-group flows
**Files:** Modify `supabase/functions/_shared/flowTypes.ts` (add `STORY_STAGE_AG`), `supabase/functions/orchestrate-lesson/index.ts`, `supabase/functions/_shared/classFlow.ts`, `supabase/functions/generate-class-flow/index.ts`.
**Produces:** per-series vocab waves (FOCUS_CARDS frozen cards per series + 1 game shell each, book order); per-story STORY_STAGE_AG + STORY_QUEST; COMIC_PANELS per comic (existing); every content block tagged `group_id/structure_ids/group_kind/group_title`; classFlow per-group rebuild + optional `source_plan_id`.
1. [ ] flowTypes: register STORY_STAGE_AG
2. [ ] orchestrate-lesson transformer rewrite (vocab waves, story per group, tags)
3. [ ] classFlow/generate-class-flow per-group slicing + source_plan_id
4. [ ] `tsc` sweep + deploy orchestrate-lesson + generate-class-flow
5. [ ] Commit

### Task 5: Board runtime — blockScope + frozen-first stories
**Files:** Create `apps/board/blockScope.ts` (+ `apps/board/blockScope.test.ts`); Modify `apps/board/useBoardPool.ts`, `apps/board/useEscalatingPool.ts`, `services/manifest.ts`, `apps/board/templates/BoardStoryStage.tsx`, `BoardStoryStage.ag.tsx`, `BoardStoryQuest.tsx`, `BoardStorySequencing.tsx`.
**Produces:** `filterByGroup<T extends {content?: any}>(items: T[], data: {group_id?: string}): T[]` (no tag → all); `getStory(manifest, structureIds?: string[])`.
1. [ ] blockScope + tests (tag match, no-tag passthrough, empty-after-filter fallback to all — decide: strict filter, fallback only when block has tag but zero matches AND no frozen content)
2. [ ] Wire into useBoardPool/useEscalatingPool (intersect with class-plan objective scope)
3. [ ] Story renderers: frozen `data.pages` first; relational `getStory(structureIds)` fallback; STORY_QUEST comprehension filtered by story scope
4. [ ] vitest + build green; Commit

### Task 6: Migration — `unit_plans` + session wiring
**Files:** Create `supabase/migrations/20260913000002_unit_plans.sql`; Modify `services/SupabaseService.ts`, `store/SessionContext.tsx` (+ pure `resolveSessionFlow` helper + test).
**Produces:** `unit_plans` table (spec §4.1) + seed from `units.flow` (every unit gets ≥1 default plan); `classroom_sessions.plan_id`; service methods `listPlans/createPlan/renamePlan/duplicatePlan/deletePlan/setDefaultPlan/savePlanFlow`; launch records `plan_id`; flow resolution: session plan → classPlan.flow → default plan; default-plan saves mirror to `units.flow`.
1. [ ] Migration + apply + verify (every unit has ≥1 plan)
2. [ ] Service + SessionContext wiring + helper tests
3. [ ] Commit

### Task 7: PlanComposer — library, group pickers, media, plan switcher
**Files:** Modify `apps/teacher/PlanComposer.tsx`; Create `apps/teacher/planComposer/PlanSwitcher.tsx`, `LibraryPanel.tsx`, `GroupPicker.tsx`, `MediaInspector.tsx`; Modify `apps/teacher/live/panels/MediaResolvePanel.tsx` (extract reusable core), `supabase/functions/generate-media/index.ts` (resolve/apply patches ALL `unit_plans` flows + class_plans mirrors).
1. [ ] Library = game templates (list in spec §4.3); content-bound templates open GroupPicker in inspector (multi-select vocab_series; single story/comic); "In plan" per template+group
2. [ ] Song/Video template (MEDIA_PLAYER) + MediaInspector resolve UI + ⚠️ badge for unresolved media blocks (incl. AI-generated ones)
3. [ ] PlanSwitcher: new/duplicate/rename/delete/set-default; Save + Launch act on active plan
4. [ ] Pending-review banner linking to Review overlay
5. [ ] generate-media multi-plan patching + deploy
6. [ ] vitest + build green; Commit

### Task 8: Unitization gate
**Files:** Create `apps/teacher/UnitSplitConfirm.tsx`; Modify `apps/teacher/UploadTextbook.tsx`.
1. [ ] Post-confirm: propose-unitization; 1 group total → apply-unitization directly + toast; 2+ → UnitSplitConfirm (per-card rename/merge-with-prev/keep, primary "Create N units", secondary "Keep as one unit", link "Adjust manually" → existing UnitizationEditor)
2. [ ] Manual verify both paths; build green; Commit

### Task 9: Vault rename + backfill + heal unit 2
**Files:** Modify `apps/teacher/UnitContentVault.tsx`; Create `scripts/testing/content-groups-backfill.ts`.
1. [ ] Vault groups section (kind chips, AI titles, rename; renames set `source='teacher'`)
2. [ ] Backfill script (dry-run default; `--yes`; `--unit <id>`): seed + AI-name + re-run generate-exercises per unit
3. [ ] Owner heal sequence for 7e50177c (confirm pages, add p27, enrich, regenerate) — coordinate with owner for the re-upload
4. [ ] Commit

### Task 10: Full verification & deploy
1. [ ] `tsc --noResolve` sweep ALL functions; full vitest; `npm run build`
2. [ ] Deploy changed functions; push master → Vercel (verify `last-modified`); `/functions/v1/` 401 probes
3. [ ] Live E2E on healed unit 2 (checklist in spec §5)
4. [ ] AGENTS.md architecture row + commit
