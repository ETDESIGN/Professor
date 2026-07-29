# Subsystem Deep-Dive — Stage 2: Knowledge Graph (Review/Edit Surface)

> **Audience:** external architecture advisor. This maps **the teacher's review/edit experience for generated unit content** — what the "Knowledge Graph" actually is today, the two image bugs in detail, what's editable vs missing as UI, and the intended editing UX.
>
> Read `01_COMPREHENSIVE_AUDIT.md` first. This file feeds open fork **F2** (editor consolidation) and depends on **F1** (data model). The character and library aspects of editing have their own deep-dives (`05`, `06`).

---

## 1. What "Knowledge Graph" actually is today

**Important framing:** despite the name, there is **no graph library** in the app (no reactflow/d3/cytoscape). "Knowledge Graph" is marketing copy for **tabbed/grid editors over JSONB**. The owner's screenshot shows one such surface; there are actually **three overlapping review screens**, and the one the teacher reaches reads from the *wrong half* of the data model.

### 1.1 The three review surfaces

| Surface | File | How it's reached | Reads from | Categories shown |
|---|---|---|---|---|
| **UnitContentVault** (the most capable) | `apps/teacher/UnitContentVault.tsx` (665 lines) | Card **Edit** icon → `navigate('/teacher/unit-vault/:id')` (`TeacherDashboard.tsx:255-256`, `UnitList.tsx:220`) | `manifest.knowledge_graph.vocabulary` + `knowledge_graph.grammar_rules` + `flow` step data | vocab, questions, story, grammar, media, settings |
| **LessonStudio "Knowledge Graph" view** | `apps/teacher/LessonStudio.tsx` (toggle `:237-242`) | Toggle inside LessonStudio (`/teacher/studio`) | `manifest.knowledge_graph.vocabulary` / `knowledge_graph.characters` | vocabulary + character initials; image gen is a **stub** |
| **AssetWorkshop** (the richest, all categories) | `apps/teacher/AssetWorkshop.tsx` (787 lines) | **Only** embedded in `UploadTextbook.tsx:381` (post-upload). NOT reachable from the unit list / vault. | `manifest.enriched_content` (full) | vocabulary, grammar, characters, story, songs, videos, dialogues |

**The teacher's actual flow:** Unit list → Edit → **UnitContentVault**. That is the "Knowledge Graph" page in practice (the screenshot). It is the most capable editor but the *least discoverable*, and it reads the `knowledge_graph` projection (which dropped `image_url`).

### 1.2 The data model the KG reads (recap — see `03` for generation side)

Content is stored as JSONB on `units.manifest` with **two competing sub-objects** (`services/manifest.ts:1-16`, `types/pipeline.ts:103-130`):

- `manifest.knowledge_graph` — `{ characters, vocabulary[], grammar_rules[], narrative_arc }`. **Legacy/scant.** Vocab lacks `image_url`.
- `manifest.enriched_content` — `{ vocabulary, grammar, characters, story{title,setting,pages[]}, song_suggestions[], video_suggestions[], dialogues[] }`. **Complete.** Written by `enrich-unit`.

A normalizer flattens both (`normalizeManifest()`, `services/manifest.ts:126`), but **`UnitContentVault` does not use it** — it reads `knowledge_graph` fields directly (`UnitContentVault.tsx:81`, `:94`). `AssetWorkshop` reads `enriched_content` directly (`AssetWorkshop.tsx:85`). **This split is the root cause of "most categories empty" in the screen the teacher actually sees.**

---

## 2. The two image bugs in detail

### 2.1 Bug B3 — LessonStudio reads the wrong field

The flashcard image render (`LessonStudio.tsx:354-366`):

```tsx
{vocab.image_prompt && vocab.image_prompt.startsWith('data:') ? (
   <img src={vocab.image_prompt} ... />
) : (
   <div ...>
      {vocab.image_prompt === 'Generating...' ? <...Loader...>
       : vocab.image_prompt === 'Failed' ? <span>Generation Failed</span>
       : "No image generated"}
   </div>
)}
```

- It reads **`vocab.image_prompt`** (the *text prompt* used to generate an image) and treats it as the image source.
- It checks `startsWith('data:')` — a base64 data URL check. Prompts are never data URLs → **always false** → "No image generated".
- The real image lives in a **separate field `image_url`** (`services/manifest.ts:30`, `:96`). The live board reads it correctly: `apps/board/templates/BoardFocusCards.tsx:47` does `c.image || rich.image_url`; `services/LessonTransformer.ts:46-48` keeps only URLs matching `^https?://`.

**Read site:** `LessonStudio.tsx:354`.
**Correct write site:** `image_url` — written by `AssetWorkshop.tsx:153,185`, the `enrich-unit` edge fn `supabase/functions/enrich-unit/index.ts:253`, and `services/MediaService.ts:84`. The field the studio displays is **never populated with image data**.

### 2.2 Bug B4 — the "auto-generate" stub corrupts data

`handleGenerateAssets` (`LessonStudio.tsx:177-194`) tries to "fix" missing images by calling `generateImage(...)`. But `generateImage` is a module-level **stub** that returns `null` (`LessonStudio.tsx:10`):

```ts
const generateImage = async (_prompt: string): Promise<string | null> => null;
```

The handler then sets `image_prompt = 'Failed'` (`:188`). **Net effect: the button actively destroys the prompt text** by overwriting `image_prompt` with the literal string `'Failed'`. So even after a correct field-read fix, affected rows need data repair (the prompt is gone).

> The real generator (`MediaService.getVocabImage`) is wired only in `UnitContentVault.tsx:198` — a different screen.

### 2.3 Bug B7 — the projection drops `image_url`

Independently of the above, `AssetWorkshop` builds the `knowledge_graph.vocabulary` projection **omitting `image_url`** (`AssetWorkshop.tsx:350-353`):

```ts
vocabulary: approvedAssets.vocabulary.map(v => ({
  word: v.word, definition: v.definition, image_prompt: v.image_prompt,
  context_sentence: v.example_sentence, distractors: v.distractors || [],
})),
```

So `UnitContentVault` (which reads `knowledge_graph.vocabulary`) shows blank images even if we fix B3, because the field simply isn't there. The real images live in `enriched_content.vocabulary[].image_url` and `assets.public_url`.

**All three compound:** B3 (wrong field) + B4 (corrupts the wrong field) + B7 (correct field not projected). A complete fix touches all three plus a data-repair pass.

---

## 3. What's editable today vs missing as UI (per category, in UnitContentVault)

| Category | In UnitContentVault | Status | Evidence |
|---|---|---|---|
| **Vocabulary** | ✅ add/remove/edit (word, definition, context, distractors); regenerate image/audio | Half-working (image bugs above) | `:225-275`, `:351-376`, image `:195-208`, render `:379-383` |
| **Grammar** | ✅ rule + examples editing | Half-working (empty in practice — enrich writes to `enriched_content.grammar`, projection only copies a subset) | `:477-530` |
| **Story** | ✅ page add/remove/edit (speaker/emoji/text/imageUrl) | Works only if a STORY_STAGE flow step exists (reads `flow[].data.pages`, NOT `enriched_content.story`) | `:90-91`, `:258-268`, `:441-475` |
| **Questions (quiz)** | ✅ add/remove/edit | Tied to `flow`, not the KG | `:87-88`, `:237-256`, `:407-439` |
| **Song** | ❌ no tab | MISSING — lives only in `enriched_content.song_suggestions`, surfaced in orphaned AssetWorkshop | — |
| **Video / custom URL** | ⚠️ partial | "Media" tab = YouTube search (**broken** — B8) + custom URL paste ("Apply" works, warm-up MEDIA_PLAYER only). No per-unit video library. | `:532-576`, search `:157-180`, apply `:189-193` |
| **Dialogues** | ❌ no tab | MISSING — lives only in `enriched_content.dialogues` | — |
| **Level** | ⚠️ free text only | Settings tab: a "CEFR Level" input reading `manifest.meta.difficulty_cefr`. **No target-age field anywhere.** (Deferred L2.) | `:614-617`, header `:296` |
| **Characters** | ⚠️ flat list, no modal | Settings tab: emoji/name/role rows from `manifest.theme_context.characters[]`. No "pick recurring character" modal, no character library, no link to `enriched_content.characters`. LessonStudio KG view shows first-letter avatars with a `+` button that does nothing. | `:630-650`; `LessonStudio.tsx:289-296` |

### 3.1 Bug B8 — YouTube search response-shape mismatch

`UnitContentVault.searchYouTube` (`:157-180`) calls `generate-media` `action:'youtube-search'` and expects `data.items[]` with `id.videoId` + `snippet...` (YouTube Data API shape). But the edge function (`generate-media/index.ts:57-66`) **no longer returns `items`** — the YouTube Data API is region-blocked, so it returns `{ searchUrl, searchQuery, message }`. Result: `data?.items` is always `undefined` → results stay empty → the video search never returns anything. Clean, reproducible.

---

## 4. The intended editing UX — what exists vs what's stubbed vs missing

The owner's stated vision for the Knowledge Graph:

> *A proper screen where the teacher can modify the content of the generated material — e.g. modify/add/remove a vocabulary word; regenerate the generated image by adding an extra description; same for grammar; for song and video, able to add a custom video URL; open a character modal to pick an already-created recurring character.*

| Intended capability | Today |
|---|---|
| Modify/add/remove a vocabulary word | ✅ exists (UnitContentVault) |
| Regenerate a vocab image with an **extra description** | ⚠️ exists but broken (B3/B4/B7); no "append to prompt" UX |
| Modify/add/remove grammar | ✅ exists (UnitContentVault) — but empty in practice |
| Add a custom video URL | ✅ "Apply" works for the warm-up MEDIA_PLAYER (`:189-193`) — but only one slot, not a per-category library |
| **Character modal** to pick a **recurring** character | ❌ does not exist — `+` button is a no-op; characters are per-unit JSONB (see `06_SUBSYSTEM_CHARACTERS.md`, locked L1) |
| Edit **story / song / dialogue** | ❌ no UI (data exists in `enriched_content`) |
| **Media-picker** to choose from a vault when media is needed | ❌ no modal anywhere (see `05_SUBSYSTEM_LIBRARY_VAULT.md`) |

### 4.1 Stubbed/inert affordances (look functional, aren't)
- `LessonStudio` "Asset Factory / Auto-Generate Missing Items" — fake (`setTimeout` + dicebear, `:196-210`).
- `LessonStudio` `generateSong` returns `"Feature pending..."` (`:9`); `generateImage` returns `null` (`:10`).
- `LessonStudio` character `+` button — no `onClick` (`:294-296`).
- `ResourceLibrary` Upload/Search/Download/Add/More buttons — no handlers (see `05`).

### 4.2 No unit management at all (no delete / archive)
There is **no way to delete or archive a unit** anywhere in the app. Verified:
- No `deleteUnit` / `removeUnit` / `archiveUnit` method exists in `Engine` (`services/SupabaseService.ts`) — the service has no unit-deletion path at all.
- `UnitList.tsx` (`apps/teacher/UnitList.tsx:10-14`) exposes only `onNewUnit`, `onUploadMaterial`, `onEditUnit`, `onPlanLesson`, `onLaunchLesson` — **no delete/archive handler**, and the unit card (`:149-157`) has only Plan + Launch buttons (Edit is via the kebab/preview modal).
- Consequence: the 87 units on cloud (including ~67 `Draft`/incomplete test units from when the pipeline was broken, e.g. the Jul 28 unit stuck mid-orchestration) **cannot be cleaned up through the UI**. The DB currently holds a lot of half-generated test data with no teacher-facing way to remove it.

This is both a **UX gap** (teachers accumulate dead units) and a **data-hygiene problem** (test/incomplete units pollute the unit list and any future analytics). It should be addressed as part of F2 (authoring IA) — at minimum a delete (with confirmation) + ideally an archive/duplicate/rename set on the unit card. Note the `units` table already has a `status` column (`Draft`/`Active`/`Locked`/`Completed`/`Processing`) and `draft_state` JSONB, so soft-delete/archive is trivially supportable; only the UI + service method are missing. Row-level cascade already exists (`objectives`, `pool_items`, `assets`, `character_ledger`, `srs_items` all FK→`units` with `ON DELETE CASCADE`), so a hard delete is safe once a teacher confirms.

---

## 5. Open questions for the advisor (feeds F2; depends on F1)

1. **What should the "Knowledge Graph" *be*?** Three shapes to weigh:
   - (a) A **structured category editor** (tabs/grids per category, like UnitContentVault today but complete and correct).
   - (b) A **true node-edge graph** (a real graph lib — reactflow/cytoscape — showing how vocab/grammar/story/characters connect, editable on canvas). The name implies this was the original intent.
   - (c) A **hybrid** (graph overview + drill-in structured editors).
   Which fits a teacher's review workflow best? (Teachers are not data scientists; usability matters more than literal graph aesthetics.)
2. **The editing writeback design.** Today edits write to `knowledge_graph` (UnitContentVault) or `enriched_content` (AssetWorkshop) — two shapes that drift. In your F1 model, what does an edit write to, and how does it invalidate/refresh the canonical store + the manifest cache + any downstream `pool_items` (so editing a vocab word updates the exercises that reference it)?
3. **"Regenerate image with an extra description"** — the owner explicitly wants teachers to *append* to the AI prompt and re-generate. Where does the regenerated asset land (the vault, so it's reusable — see `05`)? How does the edit flow back to `pool_items` content that references the old image?
4. **Story/song/video/dialogue editors** — for each, should the teacher edit the *generated instance* (a row) or *drive regeneration* (re-prompt)? For song/video specifically, given the YouTube region block, is "paste a custom URL / upload a file" the realistic primary path, with AI-suggestion as a secondary helper?
5. **Discoverability of the rich editor.** `AssetWorkshop` (all categories) vanishes after first run; `UnitContentVault` (capable) is hidden behind a card icon; `LessonStudio` (partial) is post-live-exit only. In your F2 IA, where does "review/edit this unit's content" live, and is it the same surface a teacher lands on right after generation?
6. **Live-update vs edit-then-republish.** If a teacher edits content mid-unit-life, do running live sessions / student app practice pick up the change immediately, or only on next publish? (Today `flow` and `pool_items` are separate; edits to one don't always reach the other.)

---

## 6. Concrete bugs to fix regardless of architecture

| Bug | Fix shape (architecture-independent) |
|---|---|
| **B3** wrong field | Read `image_url` (fall back through the normalizer), not `image_prompt`. |
| **B4** corrupting stub | Remove the stub or wire it to `MediaService.getVocabImage`; stop overwriting `image_prompt` with `'Failed'`. Data-repair pass for corrupted rows. |
| **B7** dropped projection | Stop dropping `image_url` (or — better — read through `normalizeManifest` everywhere and deprecate the dual shape). |
| **B8** YouTube shape | Either render the `searchUrl` (open in new tab) or build a real picker; stop expecting `data.items`. |
| **B9** `TrophyIcon` before init | Move declaration above use in `UnitPreviewModal.tsx:36/145`. |
| **G2** AssetWorkshop unreachable | Add a route from the unit list (re-review/re-enrich). |

*All `file:line` references verified against source at audit time (2026-07-29).*
