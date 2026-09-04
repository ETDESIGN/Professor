# Global Word-Image Library (dedup + library classification + flashcard view) — Design

- **Date:** 2026-09-05
- **Status:** Approved in brainstorm session (owner decisions recorded below)
- **Scope:** Vocabulary image generation dedup, one-time cleanup, ResourceLibrary category chips + flashcard view mode

---

## 1. Problem

The same vocabulary word gets the same image generated ~10 times. Two observed flavors:

1. **Same unit re-tested** — each test/re-scan creates a new `unit_id`; `vocabulary_items` uniqueness is per `(unit_id, word)` (`supabase/migrations/20260730000009_vocabulary_items.sql:25`), so every word is re-enriched and re-seeded with a dicebear placeholder (`supabase/functions/enrich-unit/index.ts:1060-1065`), which re-triggers the client heal loop.
2. **Same word across units / across pipeline stages** — there is no word-level image reuse. The illustration v2 cache-return (`supabase/functions/_shared/illustration.ts:90-97`) hashes `(model + prompt + refs)`, but:
   - the prompt embeds `unit.title`, `unit.topic`, art direction (`_shared/illustrationCore.ts:40-42`) → cross-unit cache misses by construction. The comment at `generate-media/index.ts:148` ("vocab is world-deduped by prompt") states the intended global behavior; the key construction defeats it;
   - four different prompt formulas exist for the same word: the LLM's per-unit `image_prompt` (`src/hooks/useEnrichment.ts:315`), `Illustration of the word "X"` (`src/services/MediaService.ts:38-40`), `Illustration of "X" for children's English lesson` (`MediaService.ts:126-141`, fired by student preload for **all words on every lesson open** — `src/apps/student/SoloLessonPlayer.tsx:104-115` — without checking whether `image_url` already exists), and `generate-exercises`' own fallback (`supabase/functions/generate-exercises/index.ts:470`).

For contrast, **audio already has the correct design**: `_shared/tts.ts:16-21` hashes only `(lang, text, voice, model)` with no unit context, so identical phrases always resolve to the same cached asset. Images never got the word-canonical equivalent, and `unit_media` — created explicitly to enable cross-unit reuse (`20260730000006_unit_media_and_assets.sql:28-35`) — is never queried by any vocab path.

Consequences: wasted generation spend, storage bloat, and a cluttered library (the owner's original complaint).

## 2. Owner decisions (this session)

| Question | Decision |
|---|---|
| Reuse scope | **Per-teacher, across all units and books** ("Across all my units"). Not per-book, not same-unit-only. |
| Existing duplicates | **Clean them up** — one-time script, dry-run default, no missing-word backfill (that stays deferred as before). |
| Mechanism | **`word_images` table** (chosen over the recommended hash-only approach) — explicit source of truth, natural home for a future curation UI. |
| Flashcards | **Tagging + flashcard view** — library category chips AND a flashcard browse mode rendered from `word_images`. No new subsystem (no decks, no editor, no grammar image generation). |

## 3. Design

### 3.1 Data model

New table (single migration):

```sql
create table public.word_images (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  word_key   text not null,
  asset_id   uuid not null references public.assets(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, word_key)
);
alter table public.word_images enable row level security;
-- owner-scoped select/insert/update policies (edge writes go via service role)
create index word_images_asset_idx on public.word_images(asset_id);
```

- `word_key = word.trim().toLowerCase()` with internal whitespace collapsed. **Exact match** — "leaf" and "leaves" are distinct words (deliberate: they are taught as separate cards). No lemma folding.
- Vocab assets get `metadata: { surface: 'vocab', word_key }` stamped at creation (merged, not replaced) — this is also the signal the library classification reads. Existing assets are backfilled by the cleanup script (§3.4).
- `word_images` is the single source of truth for "the image for word X of teacher Y". `assets.prompt_hash` continues to be stored for non-vocab surfaces unchanged.

**Trap avoided (documented for the implementer):** the global unique index `assets_prompt_hash_type_unq (prompt_hash, type)` (`20260802000002_assets_prompt_hash_unique.sql:27-29`) plus a canonical *unit-context-free* prompt would collide across owners (two teachers, same word, identical prompt string). Therefore the vocab-path `prompt_hash` input MUST include `owner_id` (e.g. `sha256(model + "\n" + prompt + "\n" + owner_id)`). Non-vocab surfaces are unaffected (their prompts embed unit context already).

### 3.2 Generation choke point

One server-side path for ALL vocab images, new shared helper `supabase/functions/_shared/wordImage.ts`:

```ts
canonicalWordKey(word: string): string                          // pure
resolveWordImage(rest, ownerId, wordKey): Promise<Asset|null>   // table lookup
ensureWordImage({rest, ownerId, unitId, word, regenerate?}): Promise<{url, assetId, cached}>
```

`ensureWordImage` behavior:

1. Derive `word_key` from `word`.
2. Unless `regenerate`: look up `word_images` by `(owner_id, word_key)` → hit: return existing asset (`cached: true`), no generation, no prompt model call.
3. Miss: generate with **one canonical, unit-context-free vocab prompt** — fixed flashcard style (flat children's illustration, single centered subject, plain light background, **no text/letters/labels in the image**). Unit title/topic/art direction and the caller's prompt phrasing are ignored for the vocab surface only; covers, portraits, story scenes keep their current unit-context prompts.
4. Insert the asset row (`metadata: {surface:'vocab', word_key}`, owner-scoped `prompt_hash` per the trap above), then upsert `word_images ... on conflict (owner_id, word_key) do update set asset_id, updated_at` (last-write-wins; the loser of a concurrent race becomes an orphan swept by a later cleanup run).
5. `regenerate: true`: bypass the lookup, generate fresh, upsert the table, and soft-delete the superseded asset (`assets.is_deleted = true`). **Regenerate replaces the word's image globally for that teacher.**

**Owner resolution:** `owner_id = unit.teacher_id ?? authenticated caller uid` (edge functions do their own JWT auth). Legacy NULL-owner units still work via the caller fallback.

**Accepted caveat:** a polysemous word ("rock" = stone vs music) locks onto whatever the first generation produced. The Regenerate button is the pressure valve. Sense disambiguation is a future direction (§6).

Callers converge (all four already have the word in hand):

| Caller | Change |
|---|---|
| `generate-media` vocab branch (`action:'generate-image'`, `action:'batch'`) | Route through `ensureWordImage`; accept `word` in payloads (keep `prompt` as back-compat fallback when `word` is absent). |
| `src/hooks/useEnrichment.ts` heal loop | Send `word: item.word` in the body. Loop logic unchanged — placeholders still fire, but now cache-return from the table (edge calls, not money). |
| `src/services/MediaService.ts` (`getVocabImage`, `preloadUnitAssets`/`generateBatch`) | Pass `word` through; use the same body shape. |
| `src/apps/student/SoloLessonPlayer.tsx` preload | **Skip words whose `image_url` is a real image** (mirror of `isRealImage`, `generate-exercises/index.ts:43-45`) before batching. Remaining words go through the same deduped path. |
| `supabase/functions/generate-exercises/index.ts:465-479` publish-time | Replace the direct `generateAndStoreImage(prompt || fallback, unitId)` with `ensureWordImage({word: v.word, ...})`; keep the existing `isRealImage` skip and write-backs (`:546-564`). |
| `_shared/imageGen.ts` shim (`generateAndStoreImage`) | Delegate vocab surface to `ensureWordImage`. |

`enrich-unit` is **not** changed (it seeds dicebear placeholders; image generation happens in the paths above).

### 3.3 Library: category chips + flashcard view (`src/apps/teacher/ResourceLibrary.tsx`)

- **Category derivation (pure helper, unit-tested):**
  `metadata.surface='vocab'` → Vocabulary; `metadata.pool='panel'` or `kind='book_extract'` → Comics & book art; `metadata.pool='scene'` → Story art; `surface` portrait/cover → Portraits & covers; `type='audio'` → Audio; `type='video'` → Video; `kind='external_url'` → Links; else Other.
- Chip bar (All + the categories above) alongside the existing type/text filters. `MediaPickerModal` stays unchanged (type-only) — can adopt chips later.
- **Flashcard view mode** (segmented toggle, available when Vocabulary is the active filter): grid over `word_images ⋈ assets` queried client-side (RLS scopes to owner). Card front = image; click flips to the word + a play-audio button (via the existing TTS resolver — audio is globally deduped, so this is a cache hit); per-card action: Regenerate (calls `generate-media` vocab with `regenerate: true`, optimistic update). Free-text search filters by word.

### 3.4 Cleanup + bootstrap script — `scripts/testing/word-image-dedupe.ts`

Conventions follow `scripts/testing/illustration-backfill.ts` (dry-run default, `--yes` to execute; additionally `--owner <uuid>` to scope, `--purge-storage` off by default). Runs with the service-role key from `.env.local`.

1. **Bootstrap `word_images`:** fetch all `vocabulary_items` (with owning `units.teacher_id`); group real-image rows by `(owner_id, word_key)`; winner = asset with newest `created_at` among the group's distinct URLs (tie → URL referenced by the most units); upsert into `word_images`.
2. **Stamp metadata:** merge `{surface:'vocab', word_key}` into winner assets' `metadata`.
3. **Repoint references:** all `vocabulary_items.image_url` for the same `(owner, word_key)` → winner URL. `pool_items.content` image URLs via targeted string replace: `replace(content::text, '"<old_url>"', '"<new_url>"')::jsonb` (exact-URL replace is safe; guarded by the dry-run diff report). Only vocab URLs (URLs that appear as some `vocabulary_items.image_url`) are ever touched — story/portrait/cover/panel assets are outside the set by construction.
4. **Retire duplicates:** vocab image assets that are not winners, not referenced by any `vocabulary_items.image_url`, `pool_items.content`, or `word_images` → `is_deleted = true`. `--purge-storage` additionally removes their storage objects.
5. **Report:** per-owner summary (words deduped, references repointed, assets retired, storage bytes reclaimed). NULL-owner units are skipped and listed.

### 3.5 Non-goals (explicit)

- No per-unit vocab image overrides (regenerate is global per word per teacher).
- No lemma/plural folding; no sense keys.
- No grammar image generation (Grammar surfaces stay text-only; the chips simply have no grammar media to show until a future grammar-media story exists).
- No new `exercise_type`s, board games, or flow changes.
- No cross-teacher sharing of word images (audio remains the only globally-shared cache).
- No backfill of missing word images (~190 fleet-wide gap stays deferred per prior owner decision).

## 4. Error handling

- `word_images` lookup failure → fall through to generation (dedup is an optimization, never a gate); upsert failure after generation → asset still returned, next call retries the upsert.
- Insert conflict on `word_images` (race) → last-write-wins via `on conflict do update`; the superseded asset becomes an orphan for a later cleanup sweep.
- Storage upload failure → existing failure paths unchanged (`image_status:'failed'` remains terminal in the heal loop).
- Cleanup script performs no destructive action without `--yes`; storage deletion additionally requires `--purge-storage`.

## 5. Testing & rollout

**Unit tests (vitest, `panelGeometry` pattern):** `canonicalWordKey`, category derivation, cleanup plan phase (winner selection + repoint plan as pure functions over fetched rows).

**Live verification:**
- After function deploy: standard §8 probes (`/functions/v1/generate-media` → 401, not 404).
- Dedup behavior: generate the same word from two different units → identical `asset_id`, second response `cached:true`, `word_images` row count unchanged.
- Preload fix: opening a student lesson for an already-imaged unit produces no `generate-media` image calls.

**Rollout order:**
1. Migration `word_images` via MCP.
2. `supabase functions deploy generate-media generate-exercises --no-verify-jwt` (edge functions do NOT auto-deploy — §7 AGENTS.md).
3. Frontend push to master (heal-loop `word` payload, preload skip, MediaService, ResourceLibrary) → Vercel auto-deploy; verify via `last-modified` + `sw.js` chunk probe.
4. Live dedup verification (above).
5. Cleanup script dry-run → owner reviews report → `--yes` (+ optional `--purge-storage` later).
6. Verify library chips + flashcard view in production.

## 6. Future directions (not in this workstream)

- Cross-teacher shared word-image library (platform-global, matching audio) — would need an ownership/quality model.
- Teacher-facing curation UI over `word_images` (the reason the table was chosen over hash-only).
- Sense disambiguation (`word + sense` keys) for polysemous words.
- Grammar media story (grammar flashcards need an image/visualization design first).
- Exposing flashcard view to the student app as a review mode.

## 7. Affected files

| File | Change |
|---|---|
| `supabase/migrations/2026xxxx_word_images.sql` | new table + RLS + index |
| `supabase/functions/_shared/wordImage.ts` | new — choke point (§3.2) |
| `supabase/functions/_shared/imageGen.ts` | delegate vocab to `ensureWordImage` |
| `supabase/functions/generate-media/index.ts` | vocab branch routing + `word` payload |
| `supabase/functions/generate-exercises/index.ts` | publish-time path via `ensureWordImage` |
| `src/hooks/useEnrichment.ts` | send `word`; loop unchanged |
| `src/services/MediaService.ts` | pass `word`; preload skip |
| `src/apps/student/SoloLessonPlayer.tsx` | skip real images before batch |
| `src/apps/teacher/ResourceLibrary.tsx` | category chips + flashcard view |
| `scripts/testing/word-image-dedupe.ts` | new — cleanup/bootstrap (§3.4) |

(Exact `src/` prefixes to be confirmed against the repo tree at plan time; the exploration reported both `hooks/` and `apps/` under the frontend root.)
