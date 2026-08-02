# Qoder Task Queue

> Live index. Owner = **QODER** (implementer) / **ME** (ZCode — architect+verifier) / **DONE**. Work top-to-bottom within the QODER column. I verify each task against its Acceptance Criteria before marking DONE.
>
> **Workflow:** `docs/brainstorming/QODER_WORKFLOW.md` (read first). **Batch 2 kickstart:** `docs/brainstorming/QODER_KICKSTART_BATCH2.md`.

## Batch 1 — Fix the flagged audit issues ✅ COMPLETE (verified)

| # | Task | Owner | Status | Verified |
|---|---|---|---|---|
| 01 | Fix the two story-content regressions (R1 reading quiz, R2 story art) | QODER | DONE | ✅ getStory mapper + bundle LEFT JOIN verified on cloud (image_url + audio_url + story_questions present) |
| 02 | Fix the 3 broken navigation flows (post-live exit, mobile Plan, orphaned routes) | QODER | DONE | ✅ files deleted, no dead routes, post-live exit → /teacher/unit/:id verified |
| 03 | Fix asset recording reliability (dedup unique constraint, stop swallowing errors) | QODER | DONE | ✅ unique index on cloud, 409 re-read, errors logged |
| 04 | Close the RLS gap on content tables (defense-in-depth) | QODER | DONE | ✅ 4/4 policies have authenticated clause, anon grants SELECT-only |
| 05 | Add `vocabulary_items` upsert to enrich-unit (single-emitter core) | ME | DONE | ✅ deployed (B-VOCAB-EMIT closed) |
| 06 | Make orchestrate-lesson read relational (story/dialogue/grammar) not manifest | ME | DONE | ✅ deployed (B-ORCH-DRIFT closed) |
| 07 | Decide `migrated_categories` fate + design Phase 2 real unification | ME | DONE | ✅ design doc committed (qoder_tasks/07) |

**Batch 1 net result:** all 7 audit findings the batch targeted are closed and verified. Migration parity 84/84, typecheck clean, build clean. One straggler (e2e stale route) fixed by ZCode.

---

## Batch 2 — Phase 2 real unification + remaining audit items (IN PROGRESS)

The keystone is done (Task 08 — `useUnitStudioStore`). Batch 2 re-wires the editors onto it, one sub-tab per task, then folds AssetWorkshop in and adds the missing media wiring.

| # | Task | Owner | Status | Depends on |
|---|---|---|---|---|
| **08** | **`useUnitStudioStore`** (the keystone — owns unit + content + save/reconcile) | **ME — DONE** | done | — |
| 09 | Re-wire Vocabulary sub-tab to read/write the store (not local state) | QODER | DONE | ✅ verified — local useState removed, store is the source, single load |
| 10 | Re-wire Grammar sub-tab to the store | QODER | DONE | ✅ verified |
| 11 | Re-wire Story sub-tab to the store | QODER | DONE | ✅ verified |
| 12 | Re-wire Dialogue + Cast sub-tabs to the store | QODER | DONE | ✅ verified — honest no-op (no dialogue tab; Cast uses CharacterService, out of scope) |
| 13 | Re-wire Media + Settings + Questions sub-tabs to the store; remove vault's own save button | QODER | DONE | ✅ verified — vault save hidden when embedded |
| 14 | Add the single [Save] action in the Unit Studio header; remove redundant save buttons | QODER | DONE | ✅ verified — header Save wired to store.save + dirty indicator + Publish&Teach through store |
| 15 | Fold AssetWorkshop in as an in-Studio Review mode (not a route); retire /teacher/review/:id | ME | DONE | ✅ Review is an overlay mode; ReviewRoute deleted; route removed; no dead navigation |
| 16 | Wire MediaPickerModal into 4 more fields (story image, character portrait, song, video) | QODER | DONE | ✅ verified — 3 new pickers (song field doesn't exist in the Media sub-tab; honest 3/4) |
| 17 | Wire `unit_media` writes into imageGen.ts/tts.ts (Phase 1.6 finish) | QODER | DONE | ✅ verified — code wired + insert path confirmed; tables populate on next generation |
| 18 | activity_type_registry: make it drive emission OR document as filter | ME | DONE | ✅ DECISION: document as filter (operational gating without deploy); generator_key is descriptive-only. Comment updated. |

**Sequencing rationale:** 09-12 are mechanical (state source moves from `useState` to the store). Do them in order so each verifies against the same acceptance criteria. 13 consolidates the last sub-tabs + removes the vault's save. 14 adds the unified save. 15 is the architectural fold (mine). 16-17 are independent media work that can run in parallel with 09-14.

**Exit criteria for Batch 2 = Phase 2 done:**
- [x] One component (UnitStudio) owns unit editing state via the store
- [x] One save action (header [Save]) persists all edits + reconciles
- [x] Review is an in-Studio mode, not a route
- [x] No orphaned routes (/teacher/review/:id gone — ReviewRoute.tsx deleted)
- [ ] MediaPicker on all 5 fields; unit_media populated by generators
- [ ] All editor sub-tabs work (no regressions)

## Status legend
- **pending** — not started
- **in_progress** — being worked (Qoder: fill the STATUS section in the task file)
- **review** — Qoder believes done; awaiting my verification
- **DONE** — verified against acceptance criteria
- **FAILBACK** — I found issues; task returned with notes appended
