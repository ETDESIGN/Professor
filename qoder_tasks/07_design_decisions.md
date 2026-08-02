# Task 07 — Design decisions: `migrated_categories` + Phase 2 real unification

> **Owner: ZCode (me).** This is a DESIGN doc, not an implementation task. It records the two decisions Batch 2+ depends on. Qoder does NOT implement this; it implements the *consequences* (written as future tasks).

## Decision A — `migrated_categories`: retire the column, document the heuristic

### The situation
The advisor's `units.migrated_categories TEXT[]` (migration `20260729000002`) was designed as a per-unit, per-category flag to gate the read switchover (advisor §2.6 step 4): flip a category on the array → reads switch to relational; keep it off → manifest is primary. The safety value: a known-bad unit could be forced back to manifest by removing the category from the array.

Qoder implemented the column but **all application code ignores it**. Instead, the normalizers (`services/manifest.ts` getVocabulary/getStory/getDialogues) use a `relational array length > 0` heuristic: if the relational table has rows for this unit, use them; else fall back to manifest.

### The decision: **keep the heuristic, retire the column**
Reasoning:
1. The heuristic is already correct in practice. The relational writes are the canonical emitters now (after Task 05 — vocab; Tasks 01-04 don't change this). An empty relational table genuinely means "not yet migrated / write failed" → manifest fallback is right.
2. The `migrated_categories` flag adds a *second* source of truth ("the array says it's migrated") that can disagree with reality ("the table is empty"). Two truths is exactly the bug class we're trying to eliminate.
3. The advisor's safety value (force manifest for a known-bad unit) is achievable more directly: **delete the bad relational rows** for that unit+category. The heuristic then falls back automatically. No flag needed.
4. Keeping a dead column invites future confusion ("why isn't this gating anything?").

### Action (Batch 2 task — Qoder)
- Add a code comment at the top of `services/manifest.ts` documenting that the heuristic (`relational array length > 0`) IS the gate, and that `migrated_categories` is legacy/unused.
- Leave the column in place for now (dropping it is a migration with no benefit; the cost is one nullable text[] column). Add a `COMMENT ON COLUMN units.migrated_categories IS 'Legacy/unused — the relational-array-length heuristic in services/manifest.ts is the actual read gate. Retained for forward-compat.'` via a small migration.

**Do NOT** wire `migrated_categories` into the normalizers — that re-introduces the two-truths problem.

---

## Decision B — Phase 2 "real unification": the target architecture

### The current state (verified)
`UnitStudio.tsx` is a 2-tab wrapper: Content tab embeds `<UnitContentVault>` verbatim (independent state + save); Plan tab is `<PlanComposer>` (independent state + save); Review navigates OUT to a separately-routed `<AssetWorkshop>`. Three save paths coexist. Plan §2's exit criterion ("one component, one data contract, one save path") is unmet.

### The target: **one owning component, one store slice, one save action**

```
UnitStudio (owns: useUnitStudioStore(unitId))
├─ header: title + tabs + [Save] + [Publish & Teach]
├─ Content tab
│   ├─ sub-tabs: Vocabulary | Grammar | Story | Dialogue | Characters | Media | Settings
│   ├─ each sub-tab is a PRESENTATIONAL component (no own save) reading/writing the store
│   └─ VocabularyEditor / GrammarEditor / StoryEditor / etc. (today's vault sections, extracted)
├─ Plan tab = PlanComposer (reads unit from store, writes flow to store)
└─ Review = an in-Studio MODE (AssetWorkship's approval UI rendered as an overlay/panel),
            NOT a separate route

Single save: [Save] in the header persists the whole store slice (one Engine.updateUnit +
reconcile). [Publish & Teach] = save + orchestrate + navigate to live.
```

### Migration strategy (incremental, not big-bang — avoid breaking what works)
This is too entangled to do in one task. Sequence it as Batch 2 tasks:

1. **Extract a `useUnitStudioStore` (ZCode).** A Zustand slice (or React context) that loads the unit + bundle once, holds edits in memory, exposes `updateVocab/grammar/story/...` + `save()` + `reconcile()`. This is the "one state" the plan wants. The hardest part — do it first, myself.
2. **Re-wire UnitContentVault's sections to read/write the store instead of local state (Qoder, one sub-tab per task).** Each sub-tab (Vocabulary, Grammar, Story, …) becomes a presentational component. Risk is low because the logic is unchanged; only the state source moves. Sequence: Vocabulary first (most-used), then Grammar, Story, Dialogue, Media, Settings.
3. **Move PlanComposer onto the store (Qoder).** It already reads the bundle; switch it to read `store.unit` + write `store.flow`.
4. **Fold AssetWorkshop in as a Review MODE (ZCode + Qoder).** Render `<AssetWorkshop>` inside the Studio as a panel/overlay rather than a route; its approvals write `content_review_status` as today. Remove `/teacher/review/:id` route; the "Review" button toggles the mode in-studio.
5. **Single save action (ZCode).** Replace the per-section save buttons with one header [Save] that calls `store.save()` (writes all dirty categories + triggers reconcile). Keep a per-section "edited" indicator.

### What this UNDOES / removes
- The three independent save paths (vault Save, vault "Publish & Teach", Plan "Save plan").
- The `/teacher/review/:id` route.
- UnitContentVault as a standalone routed component (it becomes the Content tab's internals).

### What this PRESERVES
- All the editor UI/logic (it's extracted, not rewritten).
- The reconciliation trigger (now fired once by the unified save, not per-section).
- PlanComposer's hard-won wiring (just re-rooted to the store).

### Exit criteria for "Phase 2 done"
- [ ] One component owns the unit editing state.
- [ ] One save action persists all edits + triggers reconcile.
- [ ] Review is an in-Studio mode, not a route.
- [ ] No orphaned routes (`/teacher/review/:id` gone; the `unit-vault` alias already removed in Task 02).
- [ ] Post-live exit lands on this Studio (already fixed in Task 02).
- [ ] All editor sub-tabs work (no regressions in vocab/grammar/story/dialogue editing).

---

## Why I'm doing the store extraction (step 1) myself
It's the architectural keystone: every subsequent Qoder task depends on the store's shape. If I hand Qoder "extract a store" without specifying the exact API, we'll get something that doesn't fit the existing editors and the whole batch stalls. So I design + build the store, then Qoder's tasks are mechanical re-wires against a stable contract.

## Batch 2 preview (after Batch 1 + this design land)
- 08 (ME): `useUnitStudioStore` + types
- 09 (QODER): re-wire Vocabulary sub-tab to store
- 10 (QODER): re-wire Grammar sub-tab
- 11 (QODER): re-wire Story sub-tab
- 12 (QODER): re-wire Dialogue sub-tab
- 13 (QODER): re-wire Media + Settings sub-tabs
- 14 (QODER): move PlanComposer onto store
- 15 (ME+QODER): fold AssetWorkshop as Review mode + single save action
- 16 (QODER): MediaPicker invocations on the remaining 4 fields (story image, character portrait, song, video)
- 17 (QODER): wire `unit_media` writes (Phase 1.6 finish)
- 18 (ME): activity_type_registry — make it drive, or document as filter

Plus the song/video iframe-embed spike (ME) somewhere in parallel.
