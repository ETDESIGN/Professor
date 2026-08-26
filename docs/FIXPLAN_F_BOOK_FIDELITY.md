# Fix Plan F — Book-Fidelity Extraction & Basket Pool System

**Origin:** [`brainstorming/10_BOOK_FIDELITY_EXTRACTION_BRAINSTORM.md`](./brainstorming/10_BOOK_FIDELITY_EXTRACTION_BRAINSTORM.md) (design decisions locked 2026-08-26).
**Status:** P0 ✅ (commit `7f89dac`) · P1 ✅ (`08a5682`, `4b05a33`; prompts iterated scan-v1→v3 against the fixture) · P2 ✅ (`fc377c1`; migrations `20260826000001/2` applied on cloud; basket E2E + legacy smoke green) · P3/P4 pending.
**Risk:** 🟢 P0 (behavior-preserving hygiene) · 🟡 P1–P2 (new pipeline, hard switchover for new uploads at P2 with legacy read path intact) · 🟡 P3–P4 (geometry + legacy rebuild).

---

## Background

The current pipeline generates categories unconditionally with fixed quotas: every uploaded page yields 6–8 vocabulary words, 1–3 grammar rules, 2–4 invented characters, a 3–5-page story, songs and dialogues — regardless of what the page contains. Root causes (doc 10 §2, verified against code 2026-08-26):

| # | Root cause | Where (verified) |
|---|---|---|
| R1 | Flat "extract everything" prompt; never asks what's on the page | `_shared/prompts/index.ts:43-77` (`extract-v3`: "Extract 6-12 vocabulary words") |
| R2 | Enrichment orders categories unconditionally with quotas | `enrich-unit/index.ts:495-567` ("exactly 2-4 fun characters", "exactly 3-5 story pages", …) |
| R3 | Frontend always invokes all six categories, 1.5 s apart | `hooks/useEnrichment.ts:186-198` |
| R4 | Extracted `exercises[]` display-only; never reach generation | `enrich-unit/index.ts:84-103` |
| R5 | Downstream gates are non-empty-array checks | `orchestrate-lesson/index.ts:81,178,198,230`; `generate-exercises/index.ts:405-423` |
| R6 | Extraction failures masked as success ("Text extraction is being updated…") | `UploadTextbook.tsx:342-356` (client) + `extract-page/index.ts:33-43,130-141` (server) |
| R7 | No per-page persistence — pages live only in `units.scanned_assets` JSONB | schema audit |

**Code-reality notes (2026-08-26 audit):** `teacher_id` is now stamped at unit creation (`UploadTextbook.tsx:398`) — the B1 creation defect is fixed on disk; `pdfjs-dist` is declared in `package.json` but imported nowhere (PDFs upload whole — rasterization is greenfield work, folded into P2); doc line refs for the generate-exercises NULL-owner guard (`:371`, not `:229-231`) and the orchestrate fire-and-forget trigger (`:595-654`, not `:495-506`) have drifted.

## Owner decisions (2026-08-26)

| Question | Decision |
|---|---|
| Where the new pipeline lives (doc 10 §11 open item) | **New `scan-page` edge function.** `extract-page` untouched and serving production until P4 parity, then deprecated (removed in P5). |
| Switchover for new uploads | **Hard switch at P2.** Old units keep working end-to-end via the legacy `scanned_assets` read path inside `enrich-unit` (dual-source). |
| L1 setting | **`profiles.native_language` per-teacher, default `zh-CN`** (matches today's hardcoded behavior; per-class override can be added later without rework). |
| Baskets as tables vs derived | **Derived** — `get_unit_baskets(unit_id)` SECURITY DEFINER RPC over `page_structures`; one materialization path, "computed fresh, never hand-written by two producers" (ADVISOR_RECOMMENDATION §2.4). |
| Draft-unit creation timing (new flow) | Upfront on upload (book selector precedes upload today), so `scan-page` persists server-side per page; the old flow's `scanned_assets` read-modify-write race disappears. |

All other decisions: doc 10 §5 decision log verbatim (no quotas anywhere in prompts; absence = absence; teacher sovereignty; verbatim reproduction; book crops default / AI optional; AI generation of absent categories only as explicit labeled teacher action).

---

## Execution steps

### P0 — Pre-flight & live-flow hygiene

1. **P0.1 Cloud drift check** — read cloud `schema_migrations` via Management API; reconcile `20260817000008`, `20260818214857` (and any others) into disk migration files before new migrations land (AGENTS.md §9 known issue).
2. **P0.2 `apps/teacher/UploadTextbook.tsx`** — remove fake-success fallback (`:342-356`); remove dead `page_type` read (`:40`); null only `manifest.enriched_content` on approve/re-extract (`:269`, `:291`) preserving `meta`/`knowledge_graph`; parallelize extraction (concurrency 3) with a single ordered `units.insert` after the batch (kills the `scanned_assets` append race).
3. **P0.3 `extract-page` honest errors** — no-API-key and all-models-failed paths return `success:false, error`; factor image→base64 into `_shared/imageInput.ts` (extract-page refactored to use it). JSON-parse-failure path unchanged (raw text is real extraction).

### P1 — Extraction contract (no UI switch)

1. **Migration `20260827000001_book_pages_and_structures.sql`** — `book_pages` (teacher_id NOT NULL, book_id NULL, unit_id NULL ON DELETE SET NULL, storage/urls, pdf_page_number, upload_order, width/height, printed_page_number/printed_unit_label/printed_title as metadata only, status pending→scanning→scanned→reviewed|failed, inventory JSONB, extractor_version, deskew_status) + `page_structures` (structure_type CHECK over the 12 kinds, order_index, bbox JSONB normalized [x,y,w,h] 0–1 top-left, confidence, verification_flags TEXT[], data JSONB, set_label, grammar_tier BOX|INFERRED, review_status pending|confirmed|removed|edited, source ai|teacher, extractor_version). RLS: owner/admin write; enrolled-student-of-Active-unit read. Indexes on (unit_id), (teacher_id), (book_id), (page_id), (structure_type).
2. **`_shared/bookScan.ts`** — STRUCTURE_TYPES, per-type verbatim schemas (doc 10 §7: vocab_set, comic, grammar_box, song_sheet, reading_passage, printed_activity, review_statements, mission_opener, character_appearance, clil_passage, dialogue_sequence), `EXTRACTOR_VERSION='scan-v1'`, deterministic `verifyStructures()` (bbox validity, required fields, overlap/confidence/`no_image` flags — no second vision opinion). Mirror into `types/pipeline.ts`, replacing the dormant `VisualZoneType` block.
3. **`_shared/prompts/bookScan.ts`** — `inventory-v1` (which structures + bboxes + page labels; empty array when none; never invent; no count limits) and `extract-structures-v1` (runtime-composed per detected type; word-for-word transcription, exact spelling/punctuation, multi-word items first-class, absence = absent).
4. **`supabase/functions/scan-page/`** — edgeHandler (requireAuth, 10/60s). Input `{unitId, fileUrl|imageBase64, bookId?, filename?, pdfPageNumber?, width?, height?}`. assertUnitOwnership → imageInput → stage 1 inventory (VISION_MODEL_NAME → FALLBACK_VISION_MODEL_NAME → qwen3-vl-32b, temp 0.1) → stage 2 extraction (8000 tok; >6 structures chunked; truncated-JSON repair) → verification → persist `book_pages` + `page_structures` (service role) → `llm_telemetry` ×2 → review payload. Failures → page row `failed` + error. Never touches `units.scanned_assets`.
5. **Golden fixtures** — `scripts/testing/fixtures/powerup2/ground-truth.json` (doc 10 Appendix A transcribed: per printed page, expected structure types, vocab sets, verbatim grammar-box/song/comic facts, tolerances; PDF never committed) + `scripts/testing/powerup2-fixture-runner.ts` (pdfjs-dist rasterize ~1500px JPEG → dev teacher account (env creds) → scratch book/unit → scan-page per page, concurrency 3 → diff vs ground truth → report → soft-delete scratch). `package.json` script `test:fixtures`.
6. **vitest** — verification-pass unit tests; prompt-quota lint (fails if new prompts contain "exactly N"/"N–M" quota patterns).

### P2 — Baskets & review (hard switch for new uploads)

1. **Migration `20260901000001_baskets_review_l1.sql`** — `profiles.native_language` (NOT NULL DEFAULT 'zh-CN'); provenance columns `vocabulary_items.set_label`+`source_structure_id`, `grammar_rules.tier`+`source_structure_id`, `story_pages.source_structure_id`, `dialogue_lines.source_structure_id` (nullable FKs); `units.baskets_confirmed_at`; `get_unit_baskets(unit_id)` SECURITY DEFINER RPC aggregating confirmed structures over pages assigned to the unit, deduped by normalized verbatim text, excluding teacher-✕, including teacher-➕. The FSRS `objectives` table is untouched (different semantics; "I can…" statements stay structure-derived).
2. **`enrich-unit` v2 dual-source** — basket mode when baskets non-empty, else legacy path byte-for-byte unchanged. Basket mode: vocabulary via the existing batched path fed by basket words + set labels + owner `native_language`; grammar verbatim-first (BOX = box text verbatim + tier badge; INFERRED teacher-removable); story = verbatim passages/panels with questions only from actual text; dialogues verbatim; media = exactly 1 song + 1 video suggestion + book's own songs as separately-marked items; characters = book-cast upsert from `character_appearance` descriptions (no invented cast). All quota language removed from basket-mode prompts.
3. **Frontend** — PDF rasterization service (pdfjs-dist worker, per-page JPEG); `UploadTextbook` hard-switch to scan-page flow (draft unit upfront, parallel scans, per-page status, printed-label mismatch = neutral note only); new `apps/teacher/ExtractionReview.tsx` (per-structure cards, ✕/➕, low-confidence highlights, ✎ in P3, batch confirm → `baskets_confirmed_at` → enrichment); page→unit assignment incl. book-level "class setup" option; auto-split proposal v1 (grouping chips from printed_unit_label + opener detection, teacher confirms — slippable to P4); `useEnrichment` basket-driven (only non-empty baskets, no 1.5 s sleeps); `AssetWorkshop` unchanged.

### P3 — Geometry & image pools

1. **Migration** — GIN index on `assets.metadata`; `unit_media` roles extended (panel|word_image|snapshot|scene|character_appearance|sticker); `kind='book_extract'` (free-text, no CHECK change).
2. **Cropper** — `generate-media` action `crop-book-image` `{pageId, structureId?, bbox, pool}`: ImageScript server-side crop → `materials` bucket → `assets` row (kind 'book_extract', metadata `{page_id, structure_id, bbox, pool}`) + `unit_media` link; <200 px output → `low_resolution` flag, no crop.
3. **Intake quality gate (client)** — EXIF orientation, min-resolution warning, blur heuristic (variance-of-Laplacian), retake prompt. Deskew = rotation-level correction + skew flag from inventory geometry; full perspective correction best-effort/flag-only.
4. **✎ crop editing** — bbox overlay with drag handles in review UI → `page_structures` updates.
5. **Pool defaults** — word-image crop = default vocab illustration when suitable (unsuitable → AI suggested, teacher decides); character appearance crops → `characters.reference_image_asset_id`; book crops count as real images for IMAGE_SELECT.

### P4 — Rebuild & migration of legacy units

1. **Migration** — `units.legacy_manifest JSONB` (archive target).
2. **`rebuild-unit` function** — scan each legacy `scanned_assets[].url` via `scan-page`; per-unit teacher dialog **fresh** (manifest → `legacy_manifest`, null manifest) vs **preserve matched edits** (natural-key match: word / normalized rule text / exact line text; keep enriched fields; link `source_structure_id`); `generation_jobs` stage `rebuild-unit` (resumable); NULL-owner units stamped by claiming caller; bulk backfill from a library action.
3. **Frontend** — UnitList per-unit "Rebuild from pages" + dialog; bulk "Rebuild all my units"; auto-split proposal if slipped from P2.
4. **Deprecation** — `extract-page` no longer called by frontend (since P2); stays deployed one cycle; removed in P5. `scanned_assets` read-only history; enrich-unit legacy path retained for un-rebuilt units.

---

## Verification checklist (per phase — do not mark complete until green)

### P0
- [x] Cloud `schema_migrations` reconciled with disk (drift fully explained: `20260818214857` = the in-flight passports schema, codified as untracked `20260819000001_student_passports.sql`; no-op marker `20260818214857_cloud_only_reconcile.sql` aligns version lists).
- [x] CI-equivalent checks: tsc clean for app code; vitest pre-existing failures in `DataService`/`BoardComponents` are unrelated mock drift (untouched files).
- [x] `extract-page` deployed; `/functions/v1/extract-page` + apikey → 401.
- [x] Fake-success fallback removed client- and server-side; failures surface as per-page errors with retry.
- [x] Multi-page upload runs 3-wide and lands as one ordered `scanned_assets` array.

### P1
- [x] Migration applied via MCP; `book_pages`/`page_structures` exist with RLS (8 policies verified live).
- [x] `scan-page` deployed; 401 probe via `/functions/v1/`.
- [x] Prompt-quota lint + verification unit tests pass (18/18).
- [x] Fixture runner green-bar achieved over runs 1–8 (iterations: ESM fix → Swift PDFKit rasterizer for the JPEG2000 sample → parallel stage-2 chunks → first-JSON robust parse): unit1=33–38 / unit2=25–36 unique words (old pipeline capped 6–8/page); both units' grammar boxes verbatim; comic/reading/song present per unit; printed page numbers read through the jumbled physical order.
- [x] `units.scanned_assets` untouched by the new path; old flow unaffected (legacy smoke, see P2).
- Residual (by design, teacher-review cases): a few word-strip layouts (Class Rules colours, the routines chart, the weather scene) capture partially — the ➕ teacher-add path covers them; soft-asserted in the ground truth.

### P2
- [x] Migration applied; `get_unit_baskets` RPC verified on live data (11 words / 1 grammar / 1 comic / 17 dialogue lines from 3 fixture pages).
- [x] `enrich-unit` deployed; basket E2E (`npm run test:baskets`) fully green: enrich 4 categories → vocabulary_items 11/11 with `source_structure_id`, grammar BOX verbatim, story_pages from comic panels, dialogue_lines verbatim with provenance, L1 translations.
- [x] Legacy regression: `scripts/testing/legacy-smoke.ts` — a scanned_assets-only unit enriches through the unchanged legacy branch (`source_mode=legacy`, 5/5).
- [x] PDF rasterization wired (pdfjs worker + openjpeg wasm as Vite URL assets); printed-label mismatch renders as a neutral note.
- [x] Absence = absence: basket-gated useEnrichment enriches only non-empty baskets.
- [ ] Manual browser pass of the full upload → review → enrich → orchestrate flow on the deployed frontend (PWA prompt: hard-reload after deploy, AGENTS.md §8.1).

### P3
- [ ] Crops generated for fixture unit panels/word-images/snapshots; `<200 px` flagged not cropped.
- [ ] ✎ bbox edit persists and re-crops correctly.
- [ ] Blur/low-res intake warnings fire on a deliberately bad photo.
- [ ] IMAGE_SELECT accepts book crops as real images.

### P4
- [ ] One real legacy unit rebuilt (owner-approved); fresh and preserve modes both behave; `legacy_manifest` archived.
- [ ] Bulk backfill resumable via `generation_jobs`.
- [ ] `extract-page` unused by frontend; still deployed (removal in P5).

---

## Notes / follow-ups (out of scope)

- P5: exercise mechanics from §9 (instruction-verb → mechanic backlog), comics LiveBoard game brainstorm, cast/persona generation, AI audio for book songs, quiet-page presentation boards, `extract-page` deletion.
- Multi-book edge cases (pages from different books in one unit) — expected to "just work" under teacher sovereignty; verify during P2 testing.
- Character-description schema fields drafted in P1 and validated against the fixture (doc 10 §11).
