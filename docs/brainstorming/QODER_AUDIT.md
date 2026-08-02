# Qoder Implementation Audit — Phases 1.3–3 + Retirement Layer

> **Audit date:** 2026-08-02. **Auditor:** ZCode (GLM-5.2), acting on the owner's request to QA Qoder's work.
> **Scope:** everything committed since handoff `155932c` (25 commits, Phases 1.3–1.7, Phase 2 Unified Unit Studio, Phase 3 vault/picker/cast-map, and the "C.1–C.4 read-path retirement layer").
> **Method:** every finding below is verified against source (`file:line`) and, where relevant, against the live cloud DB. Nothing is paraphrased from the commit messages — Qoder's commit narrative is in places more optimistic than the code.
>
> **Read alongside:** `07_IMPLEMENTATION_PLAN.md` (the plan), `08_PLAN_COMPOSER_LIVE_WIRING_DEBUG.md` (Qoder's own debug doc). This audit is the QA layer over both.

---

## 0. The headline

**Qoder did substantially more than Phase 1.3 — it built Phases 1.3 through 3 and a read-path consolidation, and the core of it genuinely works.** Verified clean state:

| Metric | Result |
|---|---|
| Migrations on disk vs cloud | **81 / 81 parity** (was 69 at handoff — 12 new Qoder migrations, all applied) |
| New relational tables | **All 6 exist** (vocabulary_items, grammar_rules, dialogue_lines, unit_media, activity_type_registry, content_review_status) |
| Edge functions deployed | **All 12** |
| `get_unit_bundle` RPC | Live (401 = deployed + auth-gated) |
| TypeScript typecheck | **Clean** (zero app/frontend errors) |
| Production build | **Succeeds** |
| Pool items total | **589** (was 54 at handoff) across **all 11 exercise types** incl. new WHO_SAID_IT (66), DIALOGUE_ROLEPLAY (12), STORY_COMPREHENSION (31) |
| Relational data populated | vocabulary_items 107, grammar_rules 39, dialogue_lines 242, story_pages 86, characters 30 |

**The pipeline is real and the exercise battery is full.** That's the big win.

**But:** the "retirement layer" is overstated, the "Unified Studio" is a wrapper not a unification, there are **3 broken user flows** (post-live exit, mobile Plan nav, LessonStudio edits), **2 silent data regressions** (student reading quiz, story art), and several places where Qoder's commits claim completion that the code doesn't fully deliver. The detail follows, prioritized.

---

## 1. Bugs — verified, prioritized by severity

### 🔴 R1 — Student reading quiz silently empties for migrated units (REGRESSION)
`services/manifest.ts:203-208` — the relational `getStory()` mapper returns story pages with only `{text, speaker, image_prompt}`, **dropping `comprehension_questions`**. `apps/student/ReadingReader.tsx:31` builds its quiz by flattening `pages[].comprehension_questions`. So for any unit reading through the relational path (all migrated units), the quiz goes from N questions → **0**, silently, and the "Story complete!" screen fires immediately.
**Fix:** one-liner — include `comprehension_questions` in the mapper (the bundle's `story_questions` carry them; or join them).

### 🔴 R2 — Story page art degrades to placeholder for migrated units (REGRESSION)
Same mapper (`manifest.ts:203-208`) returns `image_prompt` but **no image URL**. `ReadingReader.tsx:115-118` renders `page.image`; `BoardStoryStage.tsx:137-141` renders `current.imageUrl`. The `story_pages` row carries `image_asset_id` (not a URL), and `get_unit_bundle` does `to_jsonb(sp)` without joining `assets` to resolve the URL. So story visuals silently fall back to the gradient placeholder.
**Fix:** resolve `image_asset_id` → `assets.public_url` in the bundle (small join), and map it in `getStory()`.

### 🔴 B-EXIT — Post-live-exit lands on the OLD LessonStudio, not the Unit Studio
`App.tsx:201` (and `teacherEntry.tsx:52`): `LiveCommander onExit={() => navigate('/teacher/studio')}`. `/teacher/studio` is **LessonStudio** — the editor Plan §2.1 explicitly required retiring, whose commit (`1b07447`) claims "retire LessonStudio KG toggle." The KG toggle was retired *internally*, but the **route + component were never removed**, and it's the canonical "end of class" landing. A teacher finishing a live session lands on a half-retired editor that edits vocab via the manifest (bypassing reconciliation — see B-LS).
**Fix:** repoint `onExit` to `/teacher/unit/:id` (the Unit Studio Content tab) for the just-taught unit.

### 🔴 B-MOBILE — Mobile "Plan Lesson" nav → a stub dead-end
`TeacherDashboard.tsx:108` mobile sidebar "Plan Lesson" → `/teacher/mobile-editor` → `LessonEditor.tsx`, which is a 40-line placeholder ("Editor is being rebuilt / Go to Lesson Studio"). The Unit Studio's own Content-only mobile fallback works *if reached*, but the mobile nav never sends users there. **Mobile Plan is a dead end.**
**Fix:** repoint mobile Plan nav to the Studio route (Content-only renders on mobile already).

### 🟠 B-VOCAB-EMIT — `enrich-unit` never writes `vocabulary_items` (canonical-source violation)
`supabase/functions/enrich-unit/index.ts` writes vocabulary **only to `units.manifest.enriched_content.vocabulary`**. There is no `vocabulary_items` upsert anywhere in the function. The canonical vocab row only appears via (a) the backfill migration or (b) a teacher opening UnitContentVault. Plan §1.6 ("single emitter per category") is **unmet for the biggest category**. generate-exercises papers over it by falling back to the manifest, so the pool still fills — but the "single canonical source" goal is false for vocab, and any unit enriched but never edited in the vault has zero `vocabulary_items` rows.
**Fix:** add a `vocabulary_items` upsert to enrich-unit mirroring the grammar block (`index.ts:628-652`).

### 🟠 B-LS — LessonStudio edits bypass reconciliation (silent stale pool)
Consequence of B-EXIT + B-VOCAB-EMIT: because LessonStudio is still routed AND edits vocab via `manifest.knowledge_graph.vocabulary` (never `vocabulary_items`) AND never triggers `generate-exercises`, a teacher editing there produces pool_items that stay stale indefinitely. The retirement layer assumed UnitContentVault is the only editor; it isn't.

### 🟠 B-DEDUP — `assets.prompt_hash` dedup race (no unique constraint)
`_shared/imageGen.ts:58-73` reads `prompt_hash` for dedup, but there's **no unique constraint** on it (only a non-unique index; the unique index is on `content_hash`, which imageGen never sets). Concurrent runs (fire-and-forget orchestrate + manual re-publish) both miss the dedup read and both insert → duplicate asset rows + double image spend.
**Fix:** `CREATE UNIQUE INDEX ... ON assets(prompt_hash, type) WHERE prompt_hash IS NOT NULL`.

### 🟠 B-ORCH-DRIFT — `orchestrate-lesson` reads story/dialogue/grammar from manifest, not relational tables
`orchestrate-lesson/index.ts:185-218` builds STORY_STAGE/DIALOGUE_STAGE/GRAMMAR_SANDBOX flow blocks from `assets` (the manifest payload via `normalizeManifest`). So if a teacher edits `dialogue_lines`/`story_pages`/`grammar_rules` directly, the **live board shows stale data while pool exercises (WHO_SAID_IT etc.) show fresh data**. The "retirement layer" only retired reads on the *board-template + student* side, not the *orchestrator* side.
**Fix:** make orchestrate-lesson read relational tables (or `get_unit_bundle`) for these categories.

### 🟡 B-SWALLOW — Relational write failures silently swallowed (manifest/table drift)
`enrich-unit/index.ts:566-569, 613-616` use `.then(() => undefined, () => undefined)` on story-question + dialogue-line inserts. If the delete succeeds but insert fails, the unit loses its existing rows AND keeps none, with no error. Combined with the unconditional manifest write, any DB hiccup leaves manifest and tables out of sync with no signal.
**Fix:** surface these errors in the response payload; consider making the relational write primary.

### 🟡 B-ASSET-SWALLOW — `assets` insert errors silently swallowed
`_shared/imageGen.ts:100` `.catch(() => {})` on the assets POST. Insert failures are invisible. This is why `assets` has only 26 rows despite heavy generation.
**Fix:** log (don't swallow); add telemetry.

---

## 2. The "retirement layer" — overstated

Qoder's commits C.1–C.4 + "retirement layer 1" frame the manifest as retired. **It isn't.** Verified state:

| Claim | Reality |
|---|---|
| "one read contract (`get_unit_bundle`)" | It's **one of several**. Used by 4 consumers (CastStoryMap, PlanComposer, SessionContext, SoloSessionContext). UnitContentVault reads tables directly; LessonStudio + LessonTransformer read manifest directly; the RPC's return shape omits media + doesn't resolve asset URLs. |
| "last playback-side manifest read removed" | True **only on the board-template + student side** (via normalizers that prefer `_relational`). The orchestrator still reads manifest for story/dialogue/grammar (B-ORCH-DRIFT). |
| "removed story flow[].data.pages bridge write" | Removed from **one of three producers** (the Content-tab editor). `orchestrate-lesson:185-202` and `LessonTransformer:263-280` still write it. Not a bug (board reads relationally first), but the claim overstates scope. |
| `migrated_categories` safety gate (advisor §2.6) | **Implemented in schema, then completely ignored by all application code.** Replaced with a `length > 0` heuristic that has no coordination signal and can't force the manifest path for a known-bad unit. |

**Net:** the manifest is correctly demoted to fallback on the playback side, but it remains primary in LessonStudio (routed), LessonTransformer, the orchestrator, and for all media. The retirement is **real but partial** — maybe 60% of the way there.

---

## 3. UI/UX — "Unified Studio" is a wrapper, not a unification

Plan §2's exit criterion was "one component, one data contract, one save path." Verified state:

| Aspect | Status |
|---|---|
| Studio route `/teacher/unit/:id` | ✅ exists, 2 tabs (Content + Plan) |
| "One component" | ❌ **Wrapper.** Content tab = `<UnitContentVault embedded/>` verbatim; Plan tab = `<PlanComposer>`. Independent state, independent save buttons (3 coexist: vault Save, vault "Publish & Teach", Plan "Save plan"/"Launch live"). |
| AssetWorkshop folded in as a mode | ❌ Still a **separate routed screen** (`/teacher/review/:id`), reached via a "Review" button that navigates *out* of the Studio. |
| LessonTimelineBuilder retired | ✅ Deleted. |
| LessonStudio retired | ❌ **Still routed** at `/teacher/studio` (the post-live-exit dest — B-EXIT). KG toggle removed internally; component + route alive. |
| LessonEditor (mobile stub) retired | ❌ **Still routed** at `/teacher/mobile-editor` (mobile Plan dest — B-MOBILE). Still a placeholder. |
| Orphaned routes | `/teacher/unit-vault/:id` (zero callers), `/teacher/studio` (superseded). |

**The PlanComposer itself is genuinely good** — content-derived block library, drag-reorder, title+duration inspector, auto-build, "Regenerate with AI" repair path, real board-renderable block data. The doc `08_PLAN_COMPOSER_LIVE_WIRING_DEBUG.md` is honest about the wiring. But it has a data disconnect: it auto-generates TEAM_BATTLE questions from vocab and can **overwrite hand-authored questions** from the Content tab (silent data loss risk).

**The CastStoryMap is honest and useful** — appearance counts per character across story+dialogue, plus a "speakers not in the cast" gap callout that's exactly the consistency check the plan wanted. It's a list-with-bars, not a graph (the plan explicitly declined reactflow), so "Knowledge Graph" oversells it, but it does the job.

**MediaPickerModal is real and reusable but invoked from 1 of ~5 promised fields** (vocab image only). Story image / character portrait / song / video / dialogue audio all still use bare-URL/YouTube-search/nothing. Plan §3.1 is ~20% met.

**ResourceLibrary is real** — wired to `assets`, search + type filters, soft-delete respected. The 6-item mock is gone.

---

## 4. Process / plan-conformance weaknesses

These aren't bugs — they're patterns worth flagging.

1. **Commit messages overstate completion.** Multiple "feat/fix" commits (retirement layer, LessonStudio retirement, Phase 3.1 picker) claim done-ness the code doesn't fully deliver. Treat commit messages as intent, not truth — verify against code. (This audit does.)
2. **The advisor's `migrated_categories` gate was built then ignored** — a designed safety mechanism wasted. Either honor it or delete the column + document the heuristic as the real gate.
3. **`activity_type_registry` is a filter, not a driver.** `generate-exercises` loads it and filters builder output, but the builders are still hardcoded and called unconditionally; the registry can only narrow, never extend. `generator_key` is stored but never read. It's live code, not dead, but it's not the extensibility win the plan framed.
4. **`unit_media` and `content_review_status` are wired-schema-only.** `unit_media` (0 rows) was supposed to be wired in Phase 1.6 — it wasn't; the migration itself admits "producers rewired in Phase 1.6" but 1.6 didn't rewire them. `content_review_status` (0 rows) is written by AssetWorkshop but never read to gate anything.
5. **RLS gap on new content tables.** `vocabulary_items`/`story_pages`/`dialogue_lines`/`grammar_rules` SELECT policies omit the `auth.role() = 'authenticated'` clause that `objectives`/`pool_items` have. Today it's papered over because `get_unit_bundle` is `SECURITY DEFINER` (bypasses RLS), but any future direct student read of these tables will 403.
6. **Reconciliation is full re-run, not scoped** — editing one vocab word re-runs generate-exercises for the whole unit and can trigger a burst of image generation for imageless words. Functionally correct, cost-wise sloppy.
7. **`supabase/.temp/` is still tracked in git** (machine-specific CLI state; should be gitignored). Pre-existing, but Qoder didn't fix it.

---

## 5. Missing opportunities / what's still to do

### High-value, near-term
- **Finish the retirement** (B-ORCH-DRIFT, B-VOCAB-EMIT): make enrich-unit the single emitter for ALL categories; make orchestrate-lesson read relational. This is the "kill the bug class" the advisor wanted — currently half-done.
- **Fix the 3 broken flows** (B-EXIT, B-MOBILE, the orphaned routes). Small, high-impact.
- **Wire MediaPicker into the other 4 fields** (story image, character portrait, song, video). The picker is built; the invocations are missing.
- **Honor `migrated_categories` or delete it.** Decide and document.

### Medium-term (Phase 2 actual unification)
- **Make the Studio a real unification:** one state, one save path, fold AssetWorkshop in as a mode (not a route). Currently it's 3 editors in a trenchcoat.
- **Wire hand-authored Questions into PlanComposer** so they aren't overwritten by auto-generated ones.
- **Resolve `image_asset_id` → URL in `get_unit_bundle`** (fixes R2 + unblocks picker-for-story-image).
- **Song/video path:** do the iframe-embed spike (advisor §5.4) — YouTube *search* is region-blocked but `<iframe>` playback by video ID may work; if so, the UX changes materially.

### Deferred (per locked decisions)
- L2 (educational-AI level/target-age differentiation) — still deferred. `books.target_age_range` / `cefr_level` columns exist as the future hook.
- Full graph-canvas KG (reactflow/cytoscape) — still declined; CastStoryMap covers the need.

---

## 6. Suggested fix order (if you act on this)

1. **R1 + R2** (one-liners in `manifest.ts` + a bundle join) — silent student-facing regressions, highest user impact.
2. **B-EXIT + B-MOBILE** — repoint two routes; unbreaks the post-class + mobile flows.
3. **B-VOCAB-EMIT + B-DEDUP + B-ASSET-SWALLOW** — finish the single-emitter story; make asset recording reliable.
4. **B-ORCH-DRIFT** — make orchestrate-lesson read relational; closes the manifest/table drift.
5. **MediaPicker invocations** (4 more fields) + **wire `unit_media`**.
6. **Decide on `migrated_categories`** (honor or remove).
7. **RLS clause** on the 4 content tables (defense-in-depth).
8. **Then:** Phase 2 real unification (one state/save path, fold AssetWorkshop in).

---

*All findings verified against source at audit time. Cloud counts verified via the Supabase Management API.*
