# Fix Plan G — Unitization (Books → Units)

**Origin:** [`brainstorming/11_UNITIZATION_AND_CLASS_PLANS.md`](./brainstorming/11_UNITIZATION_AND_CLASS_PLANS.md) (all 8 owner decisions locked 2026-08-27). Phase F1 of the Book→Units→Series→Classes architecture.
**Status:** APPROVED + IMPLEMENTED 2026-08-28 (`565b14a` + hotfix deploy). All E2E gates green; owner acceptance (re-split of the real 26-page unit) pending.
**Risk:** 🟡 Medium — new post-scan step + unit reassignment; no schema migration required; existing units unaffected unless the teacher reorganizes them.

---

## Background

The owner's 26-page Power Up 2 sample contains **three units + welcome pages**; the pipeline landed everything in one system unit. Doc 11 §2 fixes the shape: a deterministic proposal (no AI) from already-scanned signals, a teacher boundary editor, and page reassignment. **Every content row hangs off `book_pages`** — splitting is `UPDATE book_pages SET unit_id`, never re-extraction.

**Owner decisions binding this plan:** automatic at scan with immediate correction (#1) and re-editable later (#1); welcome pages book-level, attachable to a class later when classes exist (#2 — F3); **enrich-on-open, never auto-start** (#7).

## Design

### Boundary detection (deterministic, `_shared/unitize.ts` — pure TS, vitest-testable)

Walk pages in `upload_order`:
1. A page carrying a **mission_opener** structure (with `printed_unit_number` or `printed_title`) starts a new unit group; group title = opener's `printed_title` (fallback `printed_unit_number` → "Unit N"; fallback the unit-ish `printed_unit_label`).
2. A `printed_unit_label` that differs from the current group's AND matches `/unit/i` also starts a group (covers books without openers). **Lesson labels ("Language practice 1/2", "Vocabulary 2…") never split** — they are series/F3 signals, not unit boundaries.
3. Pages before the first boundary → **setup group** (welcome material): proposed as book-level (`unit_id = NULL`), never feeds units/pools (doc 10 §5).
4. Unlabelled trailing pages join the last group.

Output: `groups: [{ key, title, is_setup, pageIds[], fromPrinted, toPrinted }]`.

### New edge functions

1. **`propose-unitization`** — `{ unitId }` → ownership check → reads the unit's pages + opener structures → returns the groups above + per-page summaries (printed number, structure counts) for the editor UI. Read-only.
2. **`apply-unitization`** — `{ sourceUnitId, groups: [{ title, pageIds[], is_setup }] }` → ownership → for each non-setup group: `INSERT units` (title, topic from source, `book_id` from source, `teacher_id` = owner, `order_index` continuing the book, status Draft) then `UPDATE book_pages SET unit_id` for its pages; setup group → `UPDATE book_pages SET unit_id = NULL` (book_id retained). Every created unit gets `baskets_confirmed_at = now()` (its content was already confirmed at extraction review — enrichment-on-open must not be blocked). Source unit: if it keeps 0 pages → soft-delete; if it keeps pages (single-group case) → rename in place. Fails loudly on any partial write (no swallowed steps — FIXPLAN F audit lesson).

### Frontend

1. **`apps/teacher/UnitizationEditor.tsx`** — group cards with page chips (printed numbers), actions: rename, merge with previous, split at page, move page between groups, toggle setup, "keep as one unit". Shows the deterministic proposal; the teacher's edits are the authority.
2. **UploadTextbook flow change:** ExtractionReview **Confirm** → UnitizationEditor (instead of straight to AssetWorkshop) → apply → land on the library with the new units visible as *"Ready to enrich"* drafts. A single-group upload shows the same step as a one-click confirm (consistency over cleverness).
3. **Re-edit later (decision #1):** the editor is reachable from (a) any unit's Studio menu — *Split unit…* — and (b) the book's unit list — *Reorganize pages…* (move pages across the book's units). Reorganizing an **enriched** unit prompts honestly: moved pages' content re-enriches in the new unit (natural-key idempotency); the old unit keeps its rows until re-enriched fresh.
4. **Enrich-on-open (#7):** no auto-enrichment anywhere. Library badges: `Ready to enrich` for confirmed-but-unenriched units (extension of the existing `PipelineBadge`). Opening a unit's Review triggers enrichment as it already does.
5. **Setup material:** a small "Class setup material (N pages)" section in the book's unit-list header listing book-level pages with thumbnails. (Attach-to-class arrives with F3.)

### What deliberately does NOT change

- Scan, extraction review, baskets, enrichment, pools, flows — untouched.
- No migration: `book_pages.unit_id` is nullable with `ON DELETE SET NULL`; `book_id` already stored.
- Series/class logic (F2/F3) — separate fixplans.

## Execution steps

1. `_shared/unitize.ts` (pure algorithm) + vitest suite (synthetic label/opener patterns incl. the Power Up jumbled-order sample).
2. `propose-unitization` + `apply-unitization` functions; deploy; 401 probes.
3. `UnitizationEditor.tsx`; UploadTextbook wiring; Studio/book re-edit entry points; library badge + setup-material section.
4. E2E: fixture-runner-style script — scan the sample PDF into a staging unit → propose (assert 3 units + 1 setup group) → apply → verify page assignment, unit creation, staging cleanup, baskets_confirmed_at, enrich-on-open works per unit.
5. Owner acceptance: re-split the existing 26-page test unit into its three real units via the editor.

## Verification checklist (do not mark complete until green)

- [x] Proposal algorithm unit tests green (incl. lesson-labels-don't-split, welcome-before-first-opener, books without openers).
- [x] E2E on the real sample: 3 units + setup group proposed; apply creates 3 Draft units with opener titles; welcome pages stored book-level (unit_id NULL, visible in the setup section).
- [x] Enrich-on-open: opening each new unit's Review enriches from its baskets; nothing enriches before that.
- [x] No content lost: sum of pages across groups = source pages; structures follow their pages.
- [x] Re-edit path: splitting an existing enriched unit reassigns pages and warns about re-enrichment.
- [x] Existing single-unit flows (photo upload, one-unit PDF) unchanged apart from the one-click unitization confirm.
