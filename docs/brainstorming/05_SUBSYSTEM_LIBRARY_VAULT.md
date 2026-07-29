# Subsystem Deep-Dive — Media Library / Vault

> **Audience:** external architecture advisor. This maps the **media library / vault** — what exists (a mock UI + a real-but-unwired backing store), what's missing (any picker, any upload-into-library flow), and the intended UX (a vault for all generated/uploaded media, with a picker modal used wherever media is needed).
>
> Read `01_COMPREHENSIVE_AUDIT.md` first. This file feeds open fork **F1** (data model) and depends on it — the vault's shape is a direct consequence of how media is modeled.

---

## 1. The intended role (owner's vision)

> *A library area which should be a vault for all the media generated or uploaded. The teacher can upload media into the Knowledge Graph. Every time there is a media need, the library/vault and a library/vault modal [should let them pick].*

So the vault is the **single source of truth for media** across the app: every generated image, every generated audio, every teacher upload, every custom video URL — browsable, searchable, reusable across units, and reachable via a **picker modal** from any field that needs media (vocab image, story page, character avatar, song, video, etc.).

---

## 2. Reality today

### 2.1 The Library screen is a static mock

- **File:** `apps/teacher/ResourceLibrary.tsx` (114 lines).
- **Route:** `/teacher/library` (`TeacherDashboard.tsx:254`); nav button `:194-199`, labeled `nav.library`.
- **It is entirely a static mock.** Lines `:9-16` hardcode **6 items** (Jungle Background, Animal Sounds Mix, The Solar System, etc.) pointing at freepik/dicebear URLs.
- No props, no `useEffect`, no Supabase calls, no state beyond a `filter`.
- The "Upload Asset" button (`:27-29`), search box (`:36-39`), Download/Add overlay buttons (`:90-92`), and MoreVertical (`:99`) have **no `onClick` handlers at all**. **100% non-functional.**

### 2.2 The real backing store exists — but no UI reads it

Two Supabase storage buckets exist:

| Bucket | Migration | Public? | Limits | Used by |
|---|---|---|---|---|
| `materials` | `20260401000000_create_storage_bucket.sql` | public read | 10MB; PDF/JPEG/PNG/GIF | **Only** `UploadTextbook.tsx:291-294` (textbook PDFs) |
| `generated-media` | `20260417000001_create_generated_media_bucket.sql` | public read | 50MB; image/audio MIME | `generate-media`/`generate-exercises` (via `imageGen.ts:29`), `apps/student/DubbingStudio.tsx:153-154` |

A media **catalog table** exists: **`public.assets`** (`supabase/migrations/20260417000002_create_assets_table.sql`):

```
id, unit_id (FK units), type ('image'|'audio'|'video'),
prompt, storage_path, public_url, metadata, created_at
```

Extended by `20260502000001_asset_dedup.sql` to add `content_hash`, `prompt_hash` + a unique index for dedup.

**Writers:** `MediaService.ts:84-91` and `:123-130` (every generated image/audio), `_shared/imageGen.ts:85-96`, `DubbingStudio.tsx:154`. **Read** for dedup at `MediaService.ts:62-71`, `:103-111`.

**But `ResourceLibrary.tsx` never queries `assets`.** The `assets` table is effectively the vault's data — with no UI consumer. It is a **dedup ledger today**, not a browsable library.

### 2.3 There is no media-picker / vault-picker modal anywhere

Greps for `MediaPicker`, `MediaVault`, `pickFromLibrary`, `openVault`, `ResourceLibrary`-as-modal, `fromLibrary` return only the `ResourceLibrary` route itself. `SessionContext.tsx` has no library/asset/vault hooks.

**The intended UX — "pick media from the vault while editing the Knowledge Graph" — is entirely unbuilt.**

---

## 3. How media flows today (the disconnection)

```
Generation (enrich-unit / generate-exercises / generate-media)
   → writes to generated-media bucket + assets table (with prompt_hash for dedup)
   → returns a public_url to the caller
   → caller (AssetWorkshop / UnitContentVault / MediaService) stores that URL
     into units.manifest...vocabulary[].image_url  (or audio_url)

Editing (UnitContentVault "Generate Image" button)
   → MediaService.getVocabImage dedups via assets.prompt_hash
   → if miss, calls generate-media → inserts assets row → returns URL
   → stores URL in LOCAL React state only  ← UnitContentVault.tsx:200
   → save() writes knowledge_graph.vocabulary WITHOUT image_url  ← Bug B7
   → so on reload the image is "lost" again

Browsing / reusing across units
   → ❌ no UI. The assets table has the data; nothing reads it as a library.
```

**Two concrete break points beyond the mock:**
1. Generated/uploaded media is **not persisted back to the unit** reliably (B7 — `image_url` dropped at projection; UnitContentVault only stores it in local state).
2. There is **no path from the vault to a field that needs media** (no picker).

---

## 4. Storage & schema inventory (what to build on)

- **Buckets:** `materials` (textbook PDFs), `generated-media` (all AI image/audio). **No bucket for video/song files** — songs/videos are YouTube search URLs today, never stored.
- **Catalog table `assets`:** `id, unit_id, type, prompt, storage_path, public_url, metadata, created_at, content_hash, prompt_hash`. Has `unit_id` FK (so media is *currently* unit-scoped) and a dedup unique index on `prompt_hash`.
- **RLS:** `assets` SELECT open to authenticated+anon; teacher manages. No RLS issue blocking reads.
- **Unused columns:** `units.image_url` / `units.audio_url` (`20260330000000_add_multimodal_urls.sql`) are **not used** by the pipeline — all media lives in `manifest`/`assets`. (Gap G7.)

---

## 5. Open questions for the advisor (feeds F1)

These assume you've read `02_FOUNDATION_DEEPDIVE.md` §2.

1. **Vault data model — what's the scope of a media asset?** Today `assets.unit_id` makes media unit-scoped, but the vision is a reusable vault. Options:
   - (a) **Per-teacher** vault (media owned by the teacher, usable across all their units) — `owner_id` instead of/in addition to `unit_id`.
   - (b) **Per-book** vault (media scoped to a book/course, shared across its units) — aligns with locked L1 (cross-unit characters) and the recurring-character/recurring-asset reality of course books.
   - (c) **Per-unit** (today) + opt-in "promote to library."
   Which model, and how does a unit *reference* a vault asset (by id) vs *copy* it?
2. **Tagging / search / categorization.** A vault of hundreds of generated images needs findability. Propose a tagging/faceting model (type, category, unit, character, prompt-derived tags, manual tags). How much is AI-assigned vs teacher-assigned?
3. **The media-picker contract.** Propose the **single picker contract** every KG field that needs media should use: input shape (what field types can request media — image/audio/video/character-avatar), output shape (asset id + url + metadata), and the modal UX. Today there is no contract — each screen rolls its own (UnitContentVault has a YouTube search + custom URL paste; AssetWorkshop has per-item generate buttons; nothing picks from a vault).
4. **Generation → vault auto-population.** Today every generation writes an `assets` row already (for dedup). Should *all* generated media automatically enter the vault (with the prompt as a tag), so the teacher can reuse it? And should re-generation (e.g. "regenerate vocab image with extra description," see `04` §5) create a *new* vault asset (preserving the old) rather than overwrite?
5. **Song & video specifically.** Given the YouTube Data API is region-blocked (so AI "suggestions" degrade to search URLs), is the realistic vault model for song/video: **teacher uploads a file OR pastes a URL**, with AI suggestion as a secondary helper? If files, do we need a new bucket (video MIME)? If URLs, how do we validate/embed (oEmbed?)?
6. **Dedup vs reuse.** `assets.prompt_hash` dedup means "same prompt → reuse existing." But a teacher may want two different images for the same word. Propose when dedup applies (generation) vs when the teacher explicitly wants a new asset (manual).
7. **Quota / cleanup.** Generation is paid (image/TTS). Should the vault enforce per-teacher quotas, orphan-asset cleanup, or soft-delete? Brief recommendation.

---

## 6. Concrete gaps to close regardless of architecture

| Gap | Fix shape (architecture-independent) |
|---|---|
| **G4** ResourceLibrary is a mock | Wire it to the `assets` table; add upload + real search. |
| **G5** No media-picker modal | Build the picker (contract per Q3) and invoke it from every media field in the KG. |
| **B7** `image_url` not persisted | Stop dropping it (or read through the normalizer); ensure edits write the URL back. |
| **G7** Unused `units.image_url/audio_url` | Either use them as the canonical per-unit cover/media, or drop them. |
| No video/song bucket | Decide per Q5; add bucket if files are supported. |

*All `file:line` references verified against source at audit time (2026-07-29).*
