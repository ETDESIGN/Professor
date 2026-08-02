# Qoder Task Queue

> Live index of all tasks. Owner = **QODER** (implementer) / **ME** (ZCode — architect+verifier) / **DONE**. Work top-to-bottom within the QODER column. I verify each task against its Acceptance Criteria before marking DONE.
>
> **Workflow:** `docs/brainstorming/QODER_WORKFLOW.md` (read first). **Kickstart prompt:** `docs/brainstorming/QODER_KICKSTART_BATCH1.md`.

## Batch 1 — Fix the flagged audit issues (in priority order)

| # | Task | Owner | Status | Finding |
|---|---|---|---|---|
| 01 | Fix the two story-content regressions (R1 reading quiz, R2 story art) | QODER | review | R1, R2 |
| 02 | Fix the 3 broken navigation flows (post-live exit, mobile Plan, orphaned routes) | QODER | review | B-EXIT, B-MOBILE |
| 03 | Fix asset recording reliability (dedup unique constraint, stop swallowing errors) | QODER | review | B-DEDUP, B-ASSET-SWALLOW |
| 04 | Close the RLS gap on content tables (defense-in-depth) | QODER | review | audit §4.5 |
| 05 | Add `vocabulary_items` upsert to enrich-unit (single-emitter core) | **ME** | pending | B-VOCAB-EMIT |
| 06 | Make orchestrate-lesson read relational (story/dialogue/grammar) not manifest | **ME** | pending | B-ORCH-DRIFT |
| 07 | Decide `migrated_categories` fate + design Phase 2 real unification | **ME** | pending | audit §2, §3 |

## Backlog (Batch 2+, after Batch 1 lands)

- MediaPicker invocations: wire into story image / character portrait / song / video / dialogue-audio fields (5 more call sites) — QODER
- Wire `unit_media` writes into imageGen.ts / tts.ts (Phase 1.6 finish) — QODER
- Make `activity_type_registry` actually drive emission (or document it as a filter) — ME
- PlanComposer: surface hand-authored Questions (don't overwrite with auto-generated) — QODER
- Phase 2 real unification: one state, one save path, fold AssetWorkshop in as a mode — ME+QODER
- Song/video iframe-embed spike (advisor §5.4) — ME

## Status legend
- **pending** — not started
- **in_progress** — being worked (Qoder: fill the STATUS section in the task file)
- **review** — Qoder believes done; awaiting my verification
- **DONE** — verified against acceptance criteria
- **FAILBACK** — I found issues; task returned with notes appended
