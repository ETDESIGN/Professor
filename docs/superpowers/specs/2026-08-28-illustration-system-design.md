# Illustration System v2 — Design Spec

**Date:** 2026-08-28
**Status:** Approved by owner (design Q&A) — pending spec review
**Audit evidence:** live provider probe + production `assets` query + git history + full frontend surface map (this session)

---

## 1. Problem & root cause

Vocabulary illustration quality regressed in recent weeks. Audit findings:

- **Root cause (external):** the default image provider is Pollinations.ai's free anonymous endpoint (`imageProvider.ts`, default since 2026-07-11). Our requests ask for `model=flux`, but Pollinations now serves anonymous requests with **Sana only** (verified: `/models` returns `["sana"]`; `model=flux` and `model=turbo` produce byte-identical output; a live-generated sample shows mangled anatomy/smearing). All production images since 2026-08-03 are Pollinations URLs. No code change on our side caused the regression.
- **Secondary bug:** `proxyToStorage` fails for ~98% of images (96/98 assets in the last full week have `storage_path='external'`), so the app depends on Pollinations serving those URLs forever.
- **Coverage gap:** only 20/207 production vocab items have a real image; image-dependent exercises and games silently downgrade to text mode.
- **Missing pipelines (confirmed by frontend audit):**
  - Story pages: `story_pages.image_prompt` is populated and `image_asset_id` FK exists, but nothing generates or writes images. Student `ReadingReader` displays the raw prompt text; `BoardStorySequencing` renders an unconditional broken `<img>`; `DubbingStudio` renders an empty `src`.
  - Unit covers: `units.cover_image` is written once with a dicebear placeholder at creation and never replaced. Teacher `UnitList`, `UnitPreviewModal` (hardcoded dicebear, ignores the field), and board `BoardUnitSelection` show placeholders; the student app shows no unit art at all.
  - Characters: `characters.look_prompt` and `reference_image_asset_id` exist; the vault picker can even set a portrait — but no surface renders it (dicebear avatars / emoji everywhere).

## 2. Decisions (owner, 2026-08-28)

1. **Provider:** OpenRouter paid Image API (`POST /v1/images`) via the existing `AI_API_KEY` billing. No Pollinations dependency.
2. **Scope (v1):** vocab rebuild + backfill, unit covers, story page illustrations, character portraits.
3. **Style:** house style + per-unit art direction (palette/motifs from unit topic). Never a single rigid style, never per-unit style anarchy.
4. **Characters:** reference-based scene consistency — portraits first, then story scenes generated with the speaking characters' portraits as `input_references` so recurring characters look identical across pages and units.

## 3. Architecture

### 3.1 Illustration service (`supabase/functions/_shared/illustration.ts`)

Replaces the internals of the image path. `imageProvider.ts` and `imageGen.ts` are retired into it (or reduced to thin shims during migration).

- **Client:** `POST https://openrouter.ai/api/v1/images` with `Authorization: Bearer $AI_API_KEY`.
  - Request: `{ model, prompt, aspect_ratio, n: 1, input_references? }` (input_references = character portrait URLs for story scenes).
  - Response: `{ data: [{ b64_json, media_type }], usage: { cost } }`.
  - **Upload:** decode base64 → upload bytes directly to the `generated-media` storage bucket → `public_url` is always our own Supabase URL (structurally fixes the proxy bug; no provider URL re-fetch).
  - Timeout ~60s per image, one retry on 5xx/timeouts.
- **Env (dashboard-set, code defaults safe):**
  - `IMAGE_PROVIDER=openrouter` (default changes from `pollinations` to `openrouter`; the pollinations provider stays in code through this release as an explicit fallback, then is deleted in the P5 cleanup)
  - `IMAGE_GEN_MODEL` — bake-off winner (placeholder default `bytedance-seed/seedream-4.5`)
  - `IMAGE_GEN_FALLBACK_MODEL` — secondary (placeholder default `black-forest-labs/flux.2-pro`)
- **Style brain:** `composePrompt(surface, unit, content)` where surface ∈ `vocab | cover | story_scene | portrait`:
  - house-style spec (one curated children's-book flat-vector description, final wording tuned in the bake-off)
  - unit art direction (from `units.art_direction`, fallback: derived from topic/title)
  - surface directives: vocab = 1:1, single centered subject, plain background; cover = 16:9, scene with negative space at top for a title; story_scene = 16:9 cinematic, no text; portrait = 1:1 bust, neutral background
  - universal suffix: no text, no letters, no watermarks
- **Asset recording:** existing `assets` row per image (`kind='generated'`, `prompt`, `prompt_hash` = sha256(model + prompt + refs), `public_url`, new `model` column). `prompt_hash` dedup preserved (hash now includes the model so a future model swap can regenerate deliberately).

### 3.2 Data model (one migration)

- `units.art_direction TEXT NULL` — per-unit art-direction line from enrichment (palette + motifs).
- `assets.model TEXT NULL` — model id that produced the image.
- No new tables. `units.cover_image`, `story_pages.image_asset_id`, `characters.reference_image_asset_id` already exist.

### 3.3 Enrichment change (`enrich-unit`)

- Vocabulary JSON spec gains `art_direction` at the unit level: one line, palette + 2-3 motifs from the unit topic (e.g. "warm sunset palette; rockets, planets, soft glow"). Persisted to `units.art_direction`.
- Story `image_prompt` instruction upgraded: scene descriptions should name the speaking characters explicitly (by name) so the generator can match them to reference portraits.

## 4. Generation flows

All flows live behind a new `generate-illustrations` action in `generate-media` (plus the existing `generate-image` action keeps working for manual vocab regeneration):

```
unit pass (idempotent, dedup-guarded):
  1. cover        — parallel  ┐
  2. vocab images — parallel  ├─ writes: units.cover_image / vocabulary_items.image_url /
  3. portraits    — parallel  ┘   characters.reference_image_asset_id (assets row each)
  4. story scenes — after portraits exist:
       for each story_page with image_prompt & no image_asset_id:
         refs = portraits of characters speaking/appearing on that page
         generate with input_references=refs → story_pages.image_asset_id
```

- **Triggers:** the automatic unit pass runs **edge-side** at enrichment completion (reusing the `generation_jobs` fire-and-forget instrumentation) so completion never depends on a teacher's browser being open; the existing frontend vocab orchestrator (`hooks/useEnrichment.ts`) stays as a complementary path for vocab; manual per-surface "Regenerate" buttons in the teacher vault (cover, vocab item, character, story page).
- **Guardrails:** per-unit attempt cap (30 images/pass) — exceeded attempts return a clear partial result, never a silent loop; every step idempotent via `prompt_hash` dedup and "already has image" checks; `generation_jobs` instrumentation reused for the automatic pass.
- **Backfill script** (`scripts/testing/illustration-backfill.ts`, tsx-run like `legacy-smoke.ts`):
  1. vocab items with NULL/placeholder/`pollinations.ai` image_url → regenerate
  2. units without a real cover → generate covers (+ `art_direction` fallback derivation for old units)
  3. characters without portrait → portraits
  4. story pages without `image_asset_id` → scenes (after their unit's portraits)
  - dry-run mode printing the plan + estimated cost; `--yes` to execute. Uses the fixture dev teacher auth pattern.

## 5. Frontend wiring

| Surface | Change |
|---|---|
| `apps/teacher/UnitList.tsx` | render stored `cover_image`; keep icon only when missing |
| `apps/teacher/UnitPreviewModal.tsx` | use stored cover (remove hardcoded dicebear) |
| `apps/board/templates/BoardUnitSelection.tsx` | stored cover with dicebear last-resort |
| Student unit start (`HomeMap` nodes / unit entry) | show cover art on unit nodes/entry screen |
| `apps/board/templates/BoardStoryStage.tsx`, `BoardStoryQuest.tsx` | render `story_pages` image (already resolve `image_asset_id` via `get_unit_bundle`) |
| `apps/board/templates/BoardStorySequencing.tsx` | gate the unconditional `<img>` |
| `apps/student/ReadingReader.tsx` | illustration replaces prompt-text placeholder |
| `apps/student/DubbingStudio.tsx` | pass real scene image or remove the empty-src img (mounted without data today) |
| Story speaker avatars (`BoardStoryStage`, `SoloLessonPlayer`) | character portrait replaces emoji/letter |
| `apps/teacher/UnitContentVault.tsx` + `CharacterPickerModal.tsx` | render stored portrait; character "Regenerate portrait" button |
| Vault story tab | page image preview + "Regenerate" per page |

Dicebear remains only as an explicit loading/last-resort fallback — never as final content.

## 6. Model bake-off (first implementation step)

- Script generates 6 canonical prompts (2 vocab, 1 cover, 1 portrait, 2 story scenes **with reference portraits**) through `bytedance-seed/seedream-4.5`, `bytedance-seed/seedream-5-0-lite`, `black-forest-labs/flux.2-pro` → saves to `/tmp` and renders an HTML contact sheet.
- Owner picks winner on: children's-illustration beauty, prompt following, **reference-character fidelity** (decisive for scene consistency).
- Cost ≈ $1–2. Winner becomes `IMAGE_GEN_MODEL` in the dashboard; runner-up becomes `IMAGE_GEN_FALLBACK_MODEL`.
- Google/OpenAI/Anthropic/xAI image models are excluded by the region-safe hard rule (AGENTS.md §5) even though listed on OpenRouter.

## 7. Cost

- Per fully illustrated unit: 1 cover + 6–8 vocab + 2–3 portraits + 4–6 scenes ≈ 15–18 images ≈ **$0.55–0.80** (at $0.035–0.045/image).
- Steady state incl. backfill: **~$15–25/month**; one-time backfill of existing units ≤ ~$10.

## 8. Secrets & deploy (owner dashboard, per AGENTS.md §6)

- Supabase Edge secrets to set: `IMAGE_PROVIDER=openrouter`, `IMAGE_GEN_MODEL=<bake-off winner>`, `IMAGE_GEN_FALLBACK_MODEL=<runner-up>` (reuse existing `AI_API_KEY`).
- Deploy: migration (§3.2) via MCP/Management API; `generate-media`, `enrich-unit` function deploys; Vercel frontend deploy on push.
- Verify per AGENTS.md §8 (probe `/functions/v1/generate-media`).

## 9. Testing

- Bake-off script doubles as the provider smoke test.
- Backfill dry-run against the fixture teacher (`fixture-test+powerup2@passport.local`) before production run.
- Extend `npm run test:fixtures`-style regression: enrichment fixture must include `art_direction`; a unit-pass integration test (fixture unit) asserts cover/vocab/portrait/story images exist and are Supabase-storage URLs (no `pollinations.ai`, no `external` storage_path).
- Manual: one full unit pass on a dev unit → eyeball board + student reader + teacher library.

## 10. Out of scope (v1)

- Per-scene character redraws for *poses/actions* beyond identity consistency (reference images carry identity only).
- Teacher UI for editing `art_direction` per unit (regeneration button only for now; edit comes with the vault polish).
- Animations/video, image editing workflows (in-painting), asset style migration for units the owner deems fine.
