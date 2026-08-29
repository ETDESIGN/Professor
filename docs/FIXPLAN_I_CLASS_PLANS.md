# Fix Plan I — Class Plans (Unit → N classes)

**Origin:** [`brainstorming/11_UNITIZATION_AND_CLASS_PLANS.md`](./brainstorming/11_UNITIZATION_AND_CLASS_PLANS.md) §4 (Design C) — all 8 owner decisions locked 2026-08-27. Phase F3, the final phase of doc 11.
**Status:** APPROVED + IMPLEMENTED 2026-08-30 (migration `20260830130000` live; propose/apply/generate-class-flow functions deployed & 401-probe verified; 21 vitest + 23 e2e checks green via `npm run test:classplans` — throwaway fixture teacher `classplans-e2e@fixture.local`). Owner acceptance (split "A day on the farm" into 3 classes, teach class 1, student app shows only class 1) pending.
**Risk:** 🟡 Medium — one additive migration + a new planning surface; every existing path degrades to today's behavior when a unit has no class plans.
**Depends on:** G landed (2026-08-28) — units carry page-scoped content. F2 (series/set_label) may land in parallel; this plan only **reads** `set_label`, never redefines it.

---

## Background

A unit spans 2–6 classes. Today the whole unit's vocabulary/grammar/story is dumped into one flow, one pool, one student release. Doc 11 §4: a **Class Plan = a scoped slice of a unit with its own flow**. Everything content-wise is page-scoped (`page_structures` → `book_pages`), so a class is a page-range slice plus surgical exceptions — reassignment and scoping, never re-extraction.

**Binding owner decisions:**
- **#4 Class scope = page ranges with exceptions** (survives re-scans).
- **#5 Strictly class-gated student release** — a series/content becomes available when its class is taught. No pre-release in v1.
- **#6 Order-only, no dates** for classes.
- **#7 Enrich-on-open, never auto** — extends to class flows: generated on teacher action (apply/regenerate), never in the background.
- **#8 Surface split** — the **student app** carries SRS/review of released material; the **LiveBoard is strictly the current class's material**, teacher-driven, never review-interleaved.
- **#2 (from G)** Welcome/class-setup pages are book-level and *optionally attachable to a class* — that attach mechanism lands here.

**Acceptance scenario (owner):** the 26-page Power Up 2 sample → after F1, unit "A day on the farm". Split it into 3 classes in the new Classes tab, teach class 1 live (board shows only class 1's material), and confirm the student app releases only class 1's series.

---

## Architecture found in the codebase (what this builds on)

| Surface | File | Behavior today |
|---|---|---|
| Unit flow (whole-unit) | `supabase/functions/orchestrate-lesson/index.ts` → `units.flow` | manifest + relational tables → validated flow; most blocks are **pool-driven shells** (`poolDriven: true`) that pull `pool_items` at runtime |
| Board pool funnel | `apps/board/useBoardPool.ts` (+ `apps/board/quizEngine.ts`) | pulls `pool_items` by `unit_id` (500 cap), seeded shuffle, class-weak-first |
| Live session state | `classroom_sessions` (one row per teacher) + `store/SessionContext.tsx` `applySessionRow`/`setActiveUnit` | all 3 tabs converge on the row; flow = `unit.flow`; `setActiveUnit(unitId)` upserts `{unit_id, class_id, current_index, status}` |
| SRS/pool primitive | `objectives` (type + `target_value` = word/rule), `pool_items.objective_id`, `srs_items` | objectives are **reconciled and id-stable** across pool regenerations (`generate-exercises` §2) |
| Student materialization | `services/learnerState.ts` `ensureStudentLearnerState` — inserts per-student `srs_items` for **every unit objective** | the single choke point for what enters a student's deck |
| Student lesson selection | `services/poolService.ts` `selectLessonItems` / `selectPracticeItems` | weakest-first over all unit objectives / due srs_items |
| Student deep content fetch | `get_unit_bundle` RPC (SECURITY DEFINER) | returns the unit's full content arrays; students gated only by unit `status='Active'` |
| Content provenance | `vocabulary_items/grammar_rules/story_pages/dialogue_lines.source_structure_id` → `page_structures.page_id` | written at enrichment (FIXPLAN F); `get_unit_baskets` already exposes it |
| Assignments | `assignments(class_id, unit_id?, …)` — UI creates title/class/due only | no class-plan concept |

---

## Design

### I1. Data model (migration `20260830120000_class_plans.sql` — re-verify prefix is free at deploy)

```sql
CREATE TABLE public.class_plans (
  id                      UUID PK DEFAULT gen_random_uuid(),
  unit_id                 UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  teacher_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_index             INTEGER NOT NULL DEFAULT 0,
  title                   TEXT NOT NULL,
  -- decision #4: page ranges + exceptions. Ranges are endpoint page-row ids
  -- (resolved over upload_order at read time) + printed-number hints for
  -- display and re-scan healing.
  scope                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- resolved content slice (see refresh_class_plan_scope); derived, never
  -- hand-edited; recomputed on apply and on enrichment changes.
  content_index           JSONB,
  content_index_stale_at  TIMESTAMPTZ,
  -- derived class flow (regenerable; decision #7 — only on teacher action)
  flow                    JSONB,
  flow_generated_at       TIMESTAMPTZ,
  -- decision #5/#8: NULL = planned; set = its content is released to students
  released_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`scope` JSONB contract (validated in the apply function; unknown keys rejected):

```jsonc
{
  "ranges": [{ "from_page_id": "…", "to_page_id": "…", "from_printed": "16", "to_printed": "17" }],
  "include_page_ids": [],        // decision #2: book-level setup pages attached to this class
  "include_structure_ids": [],   // structures on out-of-range pages pulled in
  "exclude_structure_ids": [],   // structures on in-range pages held back
  "include_vocab_ids": [],       // unsourced/teacher-added enriched content assigned to the class
  "include_grammar_ids": [],
  "include_story_ids": [],
  "include_dialogue_ids": []
}
```

**Scope resolution rule (the single definition, implemented once in `refresh_class_plan_scope`):**
1. `page_ids` = pages of the unit (ordered by `upload_order`) between each range's endpoints, inclusive → ∪ `include_page_ids` (validated teacher-owned, book-level).
2. `structure_ids` = non-removed `page_structures` on those pages ∪ `include_structure_ids` − `exclude_structure_ids`.
3. `content_index` = enriched rows with `source_structure_id ∈ structure_ids`, plus the four `include_*_ids` lists, plus objectives linked by provenance (I2), plus display data:

```jsonc
{
  "page_ids": [], "structure_ids": [],
  "vocab": [{ "id": "…", "word": "…", "set_label": "…" }],
  "set_labels": ["Countryside", "Routines"],
  "grammar_ids": [], "story_ids": [], "dialogue_ids": [],
  "objective_ids": [],
  "counts": { "vocab": 11, "grammar": 1, "story": 2, "dialogue": 6 },
  "unsourced": { "vocab": 3, "grammar": 0, "story": 0, "dialogue": 0 }  // unit-level, for the editor's "Unassigned content" section
}
```

RLS: owner / teacher-admin read-write (same pattern as `book_pages`); students get **no direct table access** — they read released scope only through RPCs (I3).

Also in this migration:
- `classroom_sessions.class_plan_id UUID NULL REFERENCES class_plans ON DELETE SET NULL` (+ index).
- `assignments.class_plan_id UUID NULL REFERENCES class_plans ON DELETE SET NULL` (+ index).
- `objectives.source_structure_id UUID NULL REFERENCES page_structures ON DELETE SET NULL` (+ index) — see I2.
- Re-publish of the unit invalidates indexes/flows: a small trigger on `units` UPDATE sets `content_index_stale_at = now()` + `flow_generated_at`-staleness is computed by UI comparing `flow_generated_at < units.updated_at`. (Stale markers only — no background regeneration, #7.)

### I2. Objective provenance (precise class → objective mapping)

`generate-exercises` currently creates objectives by `(type, lower(target_value))`. Fuzzy word-matching objectives to classes is fragile, so:
- `generate-exercises/index.ts` stamps `objectives.source_structure_id` when creating/reconciling objectives (vocab → `vocabulary_items.source_structure_id`; grammar → `grammar_rules.source_structure_id`; story → the story page's structure; dialogue → the dialogue structure).
- Migration backfills existing rows best-effort via `UPDATE … FROM vocabulary_items/grammar_rules` on `(unit_id, lower(word/rule) = lower(target_value))`.
- `refresh_class_plan_scope` links class objectives as: `objectives.source_structure_id ∈ structure_ids` ∪ (vocab objectives whose target matches a `include_vocab_ids` word) ∪ (grammar matches for included grammar rows). Unlinked objectives (legacy rows that fail backfill) surface in `content_index.unsourced` so the editor can show them.

### I3. RPCs

1. **`refresh_class_plan_scope(p_unit_id uuid, p_ids uuid[] DEFAULT NULL)`** — SECURITY DEFINER, owner/teacher-admin only; `p_ids NULL` = all the unit's plans. Recomputes and writes `content_index` (+ clears `content_index_stale_at`) for each plan; returns a per-plan summary. Called by `apply-class-plans` and re-runnable any time (idempotent).
2. **`get_released_objectives(p_unit_id uuid) RETURNS uuid[]`** — SECURITY DEFINER. Caller must be the unit owner, teacher/admin, or an enrolled student of one of the unit teacher's classes (same predicate family as `student_class_teacher_ids()` usage in the select policies). Returns:
   - **all** the unit's objective ids when the unit has **no** class plans (byte-for-byte legacy behavior), else
   - the union of `content_index.objective_ids` over plans with `released_at IS NOT NULL`.
3. **`get_unit_bundle` v2 (student branch filtered)** — when the unit has class plans and the caller is a student: `vocabulary_items/story_pages/dialogue_lines/grammar_rules` filtered to `source_structure_id ∈ released structure_ids` (+ include lists), `objectives/pool_items` filtered to released `objective_id`s, `story_questions` via `story_page_id`. Teachers/owner branch and the no-plans case return exactly today's payload. This is the server-side enforcement point for the student app — the deep content fetch can no longer hand out next week's story.

Note (accepted residual, recorded): per-row `pool_items` RLS stays enrollment-based (as hardened in `20260817000007`); a student with raw API access could still read unreleased pool rows for an Active unit. The app-level gate (I3 + I5) is the v1 enforcement; tightening pool RLS to released-only is a possible follow-up if ever needed.

### I4. Proposal + apply (edge functions, mirroring the G pattern)

**`_shared/classPlans.ts`** — pure deterministic algorithm (no AI, vitest-testable):

Input: the unit's pages in `upload_order`, each with printed number + non-removed structures (`type`, `set_label`), plus a target class count `n`.
1. **Candidate cut points** between consecutive pages at: a change in the page's `set_label` set; a `song_sheet` or `review_statements` page (natural lesson ends); a `mission_opener` page (a class rarely spans an opener).
2. **Balanced partition**: pick `n−1` cuts among candidates minimizing the max per-class vocabulary weight (greedy over prefix weights; deterministic earliest-index tie-break). Fallback when candidates < n−1: nearest balanced cuts regardless of signal (books with weak labels still get a usable split — teacher drags after).
3. **Titles**: dominant `set_label` of the slice → "Countryside"; fallback printed range "Pages 6–9"; a leading `mission_opener` keeps the unit title for class 1 ("A day on the farm — 1").

**`propose-class-plans`** (read-only): `{ unitId, targetCount? }` → ownership check (`assertUnitOwnership`) → pages + structures → `{ proposals, pages, defaultCount, unassignedContent }` for the editor. Default count = clamp(ceil(vocab weight / 12), 1, 6).

**`apply-class-plans`** (transactional, loud failures — FIXPLAN F lesson): `{ unitId, classes: [{ id?, title, order_index, scope, released_at? }] }` → ownership → validation (pages belong to the unit; include pages are teacher-owned book-level; ranges non-empty; scope JSONB shape) → upsert all plans, **delete** plans of the unit not present in the payload (releasing is destructive-by-removal: deleting a plan un-releases its content) → run `refresh_class_plan_scope` for the unit → **regenerate the flow of every class whose scope changed** (I6) → return per-plan result. One atomic apply; a failure anywhere returns an error and writes nothing (validate-then-write).

### I5. Editor UI — new "Classes" tab in UnitStudio

`apps/teacher/ClassPlansEditor.tsx` (new, lazy-loaded) + a fourth desktop tab `classes` in `UnitStudio.tsx` (`type StudioTab = 'content' | 'plan' | 'path' | 'classes'`; mobile falls back to Content like Plan/Path today).

- **Split bar:** the unit's pages as a horizontal strip (printed numbers + thumbnails); class-count stepper (+/-) → re-propose (confirm dialog when manual edits exist); drag boundaries between classes; "Propose split" button (calls `propose-class-plans`).
- **Class cards** (ordered, decision #6 — arrows, no dates): editable title; page chips; content summary from `content_index` (per-type counts + `set_labels` badges); **Release toggle** ("Mark as taught → releases to students", sets/clears `released_at`); **Generate/Regenerate flow** + read-only block list preview (PlanComposer-style) with a *stale* badge when `flow_generated_at < unit.updated_at`; **Teach this class** → `setActiveUnit(unitId, classPlanId)` + navigate `/teacher/live`.
- **Exceptions:** click a page chip → popover listing that page's structures (label + type) → toggle include/exclude per structure (writes `include/exclude_structure_ids`).
- **Unassigned content:** rows with no `source_structure_id` listed once with per-class assign checkboxes (writes `include_*_ids`).
- **Class-setup material (decision #2):** an "Attach setup pages" picker listing the book's `unit_id IS NULL` pages → `include_page_ids`.

### I6. Class flow generation (derived, deterministic, regenerable)

**`_shared/classFlow.ts`** (pure) + **`generate-class-flow`** edge function `{ classPlanId }` → ownership → loads unit + plan + `content_index` + scoped relational rows → builds `class_plans.flow`:

The unit flow is the **template** — game sequence, phase tags, rotation variety (VOCAB_BLITZ vs TEAM_BATTLE parity etc.) all carry over unchanged. Per block:
- `INTRO_SPLASH` → retitled to the class title.
- `FOCUS_CARDS` / `SPEAKING` → rebuilt from the class's `vocabulary_items` (page/set order).
- `STORY_STAGE` / `DIALOGUE_STAGE` / `GRAMMAR_SANDBOX` → rebuilt from scoped relational rows; **dropped** when the class has none of that content (an empty story stage must never reach the board).
- `MEDIA_PLAYER` → kept (warm-up media is unit-level by design).
- Pool-driven shells (`SOUND_LAB`, `MEMORY_LAB`, `WORD_DETECTIVE/FLASH_MATCH`, `SENTENCE_LAB`, `GRAMMAR_LAB`, `STORY_QUEST`, `VOCAB_BLITZ/TEAM_BATTLE`, `CLASS_RALLY`, …) → copied as-is; their runtime content comes from the pool, which is class-scoped by I7. Frozen-data variants of `TEAM_BATTLE`/`FLASH_MATCH` are rebuilt from class vocab where the shape is known.
- Unknown / teacher-composed block types → copied verbatim (teacher sovereignty — PlanComposer additions survive).
- Output runs through the shared `validateAndNormalizeFlow` (same board contract as `units.flow`).

No AI call anywhere in class flow generation (cost-conscious, deterministic — #7 spirit). `units.flow` remains the unit-level preview; class flows are derived views.

### I7. LiveBoard loads the class flow only (decision #8)

- `SessionContext.setActiveUnit(unitId, classPlanId?)` — when a plan is given: fetch `class_plans` row, use its `flow` (fallback to unit flow + visible warning if the class flow is empty), expose `state.activeClassPlan` (id, title, `content_index`, `released_at`), upsert `classroom_sessions` with `class_plan_id`.
- `applySessionRow` — resolves `row.class_plan_id` the same way (cached per id; board/remote/commander converge as today).
- `useBoardPool` + `quizEngine` — when `state.activeClassPlan?.content_index?.objective_ids` is non-empty, add `.in('objective_id', ids)` to the pool query. One edit scopes **every** pool-driven board game to the current class; no game template changes. No review-interleave ever enters: the pool query is already unit+objective scoped, nothing else feeds the board.
- Commander header: when `state.activeClassPlan` exists and `released_at` is null, show a **"Mark class taught"** button (sets `released_at` via PostgREST update, owner RLS) — the natural end-of-class release moment (#5), plus the standing toggle in the Classes tab.
- Entry points to teach a class: Classes tab "Teach this class"; `UnitList` unit-card Teach menu gains a class submenu when the unit has plans (whole-unit teach stays available = unit-flow preview).
- `endSession` clears `class_plan_id` with `unit_id` as today (SET NULL on delete also covers plan deletion).

### I8. Student app release gate (strictly class-gated, #5/#8)

- `ensureStudentLearnerState` — objectives source becomes `get_released_objectives(unitId)` (fail-open + logged on RPC error so a transient fault can't brick legacy units).
- `poolService.selectLessonItems` — filter candidate objectives to the released set (same fail-open). `selectPracticeItems` needs no change: a student's `srs_items` can only ever contain released objectives once materialization is gated — spaced review therefore automatically stays within previously released material (#8).
- `learnerState.getUnitMasterySummary` — totals over released objectives only (mid-unit "3/12 crowns" must not count next week's words).
- Deep content (`get_unit_bundle`) — already filtered server-side (I3.3), so readers/lesson surfaces show only released story/dialogue/vocab without per-screen edits.
- HomeMap — no visual change in v1 (the unit appears; its content is simply gated). A "Classes" progress breakdown per series is F2/UI territory, not F3.
- Units without class plans: every one of these paths returns today's behavior (all objectives, full bundle).

### I9. Assignments attach to a class

`assignments.class_plan_id` (I1) + `Assignments.tsx` create form gains an optional unit dropdown (teacher's units) and, when that unit has plans, a class dropdown (stores `unit_id` + `class_plan_id`); the list shows the class chip when present. Assignments remain class-roster-scoped as today.

---

## What deliberately does NOT change

- Scan, extraction review, baskets, enrichment, unit pools, `units.flow`, `student_path` — untouched. Publishing a unit works exactly as today.
- Units with no class plans: board, student app, assignments, SRS — byte-for-byte current behavior (all gates short-circuit to "everything").
- The student SRS/FSRS algorithm — only **what it's fed** changes (doc 11 §7).
- `set_label` semantics — read-only here (F2 owns them).
- No calendar dates on classes (#6). No teacher pre-release of individual series (#5 — later, post-MVP).
- No AI calls in any new code path (deterministic proposal + deterministic flow derivation).
- Files owned by the parallel session are untouched: `ExtractionReview.tsx`, `AssetWorkshop.tsx`, `UploadTextbook.tsx`, `UnitizationEditor.tsx`, `hooks/useEnrichment.ts`, `hooks/useBookScan.ts`, `services/pdfRasterize.ts`, `functions/enrich-unit/`, `functions/scan-page/`, `_shared/prompts/bookScan.ts`, `_shared/bookScan.ts`.

## Execution phases (each: implement → test → deploy → verify → commit)

| Phase | Scope | Deploy |
|---|---|---|
| **I-P1** | Migration (table + columns + 3 RPCs + bundle v2 + backfill) | Management API SQL; verify tables/RPCs via REST probes |
| **I-P2** | `_shared/classPlans.ts` + vitest; `propose-class-plans` + `apply-class-plans` | `npx supabase functions deploy propose-class-plans apply-class-plans …`; 401 probes on `/functions/v1/` |
| **I-P3** | `ClassPlansEditor.tsx` + UnitStudio Classes tab (split bar, cards, exceptions, release toggle, setup pages) | push to master (PWA hard-reload note) |
| **I-P4** | `_shared/classFlow.ts` + vitest; `generate-class-flow`; SessionContext class loading; `useBoardPool`/`quizEngine` scoping; UnitList + Classes teach entries; commander "Mark class taught" | function deploy + push |
| **I-P5** | Student gate (`learnerState`, `poolService`, mastery summary) + assignments class attach | push |
| **I-P6** | E2E script `scripts/testing/class-plans-e2e.ts` (scratch unit via powerup2 fixture pages → propose → apply → scope/flow asserts → release → `get_released_objectives` + bundle-filter asserts) + owner acceptance walkthrough | — |

## Verification checklist (do not mark complete until green)

- [ ] vitest: proposal algorithm (set-change cuts, song/review ends, balanced n-partition, weak-label fallback, Power Up jumbled-order sample) green.
- [ ] vitest: class flow derivation (scoped FOCUS_CARDS/STORY/DIALOGUE/GRAMMAR, drop-empty blocks, pool shells preserved, unknown blocks preserved, passes `validateAndNormalizeFlow`).
- [ ] Migration applied cloud; `class_plans` / columns exist; `refresh_class_plan_scope`, `get_released_objectives` executable; `get_unit_bundle` output identical to pre-migration for a unit without plans (golden compare).
- [ ] Functions live: `/functions/v1/{propose-class-plans,apply-class-plans,generate-class-flow}` + `apikey` → 401 (not 404).
- [ ] E2E: propose → apply → `content_index` correct (page/structure/objective resolution, include/exclude honored); class flow scoped; unit flow untouched.
- [ ] Release gate: unit with plans + none released → `get_released_objectives` = ∅, student bundle filtered to ∅ content; release class 1 → only class 1's objectives/vocab/story visible; unit without plans → all objectives (legacy).
- [ ] LiveBoard: teach class 1 → board + commander show class flow; pool-driven games serve only class-1 objectives; board reload mid-session rehydrates the class (not the unit flow).
- [ ] Existing production units keep working: teach, student lessons, practice, assignments — unchanged for plan-less units.
- [ ] Owner acceptance: "A day on the farm" split into 3 classes; teach class 1 live; student app shows only class 1's series.
