# Qoder Kickstart — Batch 1

> Paste the block below the line as your first message to Qoder. It assumes Qoder has already read `docs/brainstorming/QODER_ONBOARDING.md` in a prior session. If this is a fresh Qoder instance, also paste `docs/brainstorming/QODER_ONBOARDING.md` first.

---

You are continuing work on the "Professor" teacher app. The prior session (you, Qoder) implemented Phases 1.3–3 + a read-path retirement layer. A separate auditor (ZCode) has QA'd that work and found a prioritized set of bugs and overstatements. Your job is to fix them, one task at a time, exactly as specified.

## How we work now (READ THIS FIRST)

1. **Read `docs/brainstorming/QODER_WORKFLOW.md` in full** — it defines the task-file contract, the STATUS section you must fill in, and the non-negotiable conventions (region-safe AI, migration deploy via Management API with `--data-binary @<(python3 ...)`, edge/client mirror sync, verify-before-claiming-done).
2. **Read `docs/brainstorming/QODER_AUDIT.md`** — the full audit. Every task references findings in it. Pay attention to §4 (process weaknesses) — your prior commits overstate completion; this batch, verify against the Acceptance Criteria yourself before claiming done.
3. **The task queue is `qoder_tasks/README.md`.** Work the tasks you own (QODER) top-to-bottom. Tasks 05–07 are MINE (ZCode) — don't touch them.

## Your batch (do these, in order)

- `qoder_tasks/01_fix_story_regressions.md` — two silent student-facing regressions (reading quiz empties, story art degrades). Mapper fix + a get_unit_bundle migration.
- `qoder_tasks/02_fix_broken_navigation.md` — repoint post-live-exit + mobile Plan nav; delete the LessonStudio and LessonEditor files + their orphaned routes.
- `qoder_tasks/03_fix_asset_reliability.md` — add the unique constraint on assets(prompt_hash, type); stop swallowing asset-insert errors.
- `qoder_tasks/04_fix_rls_gaps.md` — add the `authenticated` clause to 4 content tables' SELECT policies.

## Rules (non-negotiable)

- **One task = one commit.** Don't bundle.
- **Stay in scope.** Each task lists exactly which files to touch. If a fix needs a file outside scope, STOP and append a question to the task's STATUS section — don't expand scope silently.
- **Self-verify against the Acceptance Criteria** in each task before marking it `review`. Run typecheck + build; for DB tasks, query the cloud DB and report real numbers.
- **Fill the STATUS section** at the bottom of each task file: check off the criteria, put the commit hash, note anything tricky.
- **Don't redesign.** The architecture is decided (`07_IMPLEMENTATION_PLAN.md`, `ADVISOR_RECOMMENDATION.md`). These tasks implement decided fixes. If you disagree, flag it in STATUS — don't override.
- **Migrations:** next number is `20260802000001` (Task 01), `20260802000002` (Task 03), `20260802000003` (Task 04). Apply each via the Management API with the `--data-binary @<(python3 ...)` form (NOT `-d` — it mangles SQL quotes).

## After your batch

When all 4 tasks are at `review`, tell the owner. The auditor (ZCode) will verify each against its acceptance criteria, then I (ZCode) will land tasks 05–07 (the architectural pieces: vocab emitter, orchestrator read path, Phase 2 unification design) and write Batch 2.

Start by reading `docs/brainstorming/QODER_WORKFLOW.md` and `docs/brainstorming/QODER_AUDIT.md`, then begin Task 01.
