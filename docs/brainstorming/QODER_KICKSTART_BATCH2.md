# Qoder Kickstart — Batch 2

> Paste the block below the line as your first message to Qoder for Batch 2.

---

You are continuing the "Professor" teacher-app work. Batch 1 is DONE and verified — all 7 audit findings closed. Now Batch 2: the Phase 2 "real unification" (one owning component, one store, one save) plus the remaining media wiring.

## Read these first (in order)
1. `docs/brainstorming/QODER_WORKFLOW.md` — the collaboration rules (you know these; re-read §"Conventions" + §"STATUS section").
2. `qoder_tasks/07_design_decisions.md` §B — the Phase 2 unification architecture (the keystone concept: one store owns unit editing; sub-tabs become presentational).
3. `store/useUnitStudioStore.ts` — **the keystone ZCode built (Task 08).** This is your contract. Read the whole file. Understand: `load(unitId)` loads unit + all content categories; `setVocabulary/setGrammarRules/setStoryPages/setQuestions/setMediaStep/setManifest` each mark the category dirty; `save()` persists dirty categories + reconciles. The setters accept updater functions.
4. `qoder_tasks/README.md` — the live queue (Batch 2 section).

## Your batch (do these, in the order shown)

| # | Task file | What |
|---|---|---|
| 09 | `qoder_tasks/09_rewire_vocab_subtab.md` | Vocabulary sub-tab → store. **This is the template** for 10-13. |
| 10-13 | `qoder_tasks/10_13_rewire_other_subtabs.md` | Grammar / Story / Dialogue+Cast / Media+Settings+Questions. **One commit per task.** |
| 14 | `qoder_tasks/14_17_batch2_misc.md` (Task 14 section) | Single [Save] in Studio header (depends on 09-13). |
| 16 | `qoder_tasks/14_17_batch2_misc.md` (Task 16 section) | MediaPicker into 4 more fields (independent — can start anytime). |
| 17 | `qoder_tasks/14_17_batch2_misc.md` (Task 17 section) | Wire `unit_media` into imageGen/tts (independent — can start anytime). |

Tasks 15 (fold AssetWorkshop as Review mode) and 18 (activity_type_registry) are **MINE (ZCode)** — don't touch them.

## Critical rules for this batch

1. **The store is the contract. Do NOT change `store/useUnitStudioStore.ts`.** If a sub-tab needs a field the store doesn't expose, STOP and append a question to the task's STATUS — don't expand the store yourself.
2. **One commit per task.** Tasks 10-13 are 4 separate commits (one per sub-tab), not one bundled commit. A regression in one shouldn't block the others.
3. **Re-wire, don't rewrite.** The sub-tab UI/logic stays identical; only the state source moves from `useState` to the store. The store setters accept updaters, so `setX(prev => ...)` and `setX([...x, new])` work unchanged.
4. **Coordinate the load.** Only ONE `store.load(unitId)` call should exist — at the UnitContentVault (embedded) component level, on mount. Do NOT add per-sub-tab loads.
5. **Manual-verify each task.** Edit a category, save, reload the unit, confirm the edit persisted + (for vocab/grammar/story) the DB table reflects it. Report what you did in STATUS.
6. **Self-verify against acceptance criteria** before marking review. Last batch your commits met criteria cleanly — same standard.
7. **Migrations (Task 17):** none expected (it's edge-code wiring). If you think one is needed, STOP and flag it.

## After your batch
When 09-14 (+ 16, 17) are at `review`, tell the owner. I'll verify each against its criteria (code + manual-edit persistence + DB), then do Tasks 15 + 18 myself.

Start by reading `store/useUnitStudioStore.ts` + `qoder_tasks/09_rewire_vocab_subtab.md`, then begin Task 09.
