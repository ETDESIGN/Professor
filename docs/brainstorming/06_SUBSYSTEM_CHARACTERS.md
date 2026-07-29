# Subsystem Deep-Dive — Cross-Unit Character System

> **Audience:** external architecture advisor. This maps the **character system** — currently an orphaned table + per-unit JSONB — and frames the target: a **cross-unit, book-level character library** with a picker modal.
>
> Read `01_COMPREHENSIVE_AUDIT.md` first. This file depends on open fork **F1** (data model) and the library/vault work (`05`). The product direction is a **LOCKED DECISION (L1)**: characters are cross-unit/book-level. We want *implementation architecture*, not whether.

---

## 1. Why characters are special (the product reality)

English course books for young learners (the app's domain) **feature recurring characters across an entire book** — a cast (e.g. two children, a robot, a pet) that appears in every unit's stories, dialogues, and illustrations. This is pedagogically load-bearing: kids bond with the cast, and continuity drives engagement.

**Implication:** a character is **not a property of a unit**. It is a **book-level entity** that units *reference*. The current per-unit JSONB model fundamentally cannot represent "the same character across units" — each unit gets its own disconnected copy. This is why characters are a locked cross-unit decision (L1).

---

## 2. Reality today

### 2.1 A table exists — and is orphaned

**`character_ledger`** (`supabase/migrations/20260417000003_create_character_ledger.sql`):

```
id, unit_id (FK→units), name, role, image_url, description, created_at
```

- Schema is *almost* right (name/role/image/description), **but `unit_id` scopes it per-unit** — wrong for a cross-unit library.
- **Writers:** **none in the generation pipeline.** No edge function ever INSERTs into `character_ledger`. The only code that touches it is `services/GamificationService.ts` (`getCharacters:377`, `addCharacter:391`, `updateCharacter:405`, `deleteCharacter:418`) — and that is for **student avatar cosmetics**, not lesson characters. Grep across `apps/`/`components/` for those four methods returns **zero UI hits**.
- **Verdict:** `character_ledger` is a **dead table** w.r.t. the content pipeline. (Gap G3.)

### 2.2 Where characters actually live

**Only inside `units.manifest` as JSONB:**
- `manifest.enriched_content.characters[]` — written by `enrich-unit` (`supabase/functions/enrich-unit/index.ts:288-294`) with **placeholder DiceBear avataaars URLs** and `image_status:'pending'`. **Never upgraded to real images** (only vocab images get upgraded, in `generate-exercises`).
- `manifest.knowledge_graph.characters[]` — copied by `AssetWorkshop` at orchestrate time.
- `manifest.theme_context.characters[]` — edited in `UnitContentVault` Settings tab (`:630-650`) as emoji/name/role rows.

### 2.3 Where characters appear in the UI (all display-only)

| Surface | What it shows | Evidence |
|---|---|---|
| `LessonStudio` KG view | First-letter avatars from `knowledge_graph.characters`; `+` button is a **no-op** | `LessonStudio.tsx:289-296` |
| `UnitContentVault` Settings | Emoji/name/role rows editing `theme_context.characters` (manifest-only, not the table) | `UnitContentVault.tsx:631-650` |
| `AssetWorkshop` | Display-only `CharacterCard` reading `item.image_url`/`image_status` | `AssetWorkshop.tsx:702-723` |
| `BoardStoryStage` (live) | Picks speaker avatars from manifest characters | `apps/board/templates/BoardStoryStage.tsx` |

**There is no character picker modal, no character avatar component library, no character CRUD screen.** The `+` button and the manifest-only editors are the closest things, and none of them model cross-unit reuse.

### 2.4 What's missing for a single character

A recurring character needs more than a name + emoji to be consistent across a book:
- **Visual identity** — a stable generated image (today: placeholder DiceBear only, never upgraded).
- **Personality / voice** — a described personality; potentially a consistent TTS voice (ElevenLabs voice ID) for dialogues/audio.
- **Role** — protagonist / sidekick / mascot / adult, etc.
- **Relations** — friends with X, sibling of Y (the cast is a graph).
- **Continuity** — the *same* character (stable id) referenced by every unit, story page, dialogue, and game in the book.

None of this is modeled today.

---

## 3. The target (locked L1): a book-level character library

The owner's stated vision:

> *Open a character modal where [the teacher] can pick an already-created character (since these English books have recurring characters for the entirety of the book). We will need to implement a proper character system for that.*

So: a **book-level character library** (a first-class entity), a **character picker modal** invoked wherever a character is needed (story speaker, dialogue turn, game avatar, illustration), and generation that **writes characters into the library** (not into per-unit JSONB).

### 3.1 This implies a "book" concept that doesn't exist yet

Today the hierarchy is **teacher → units** (classes are rosters, unrelated — see `03` §1). There is **no `books` table**. A book-level character library implies a layer above units:

```
teacher → book → units (belong to a book)
                → characters (belong to a book, referenced by units)
```

This is a meaningful structural addition and is **entangled with F1** (the data model) and with the library/vault scope (a per-book vault, per `05` Q1, aligns naturally).

---

## 4. Open questions for the advisor (implementation architecture for L1)

These assume you've read `02_FOUNDATION_DEEPDIVE.md` §2 (F1) and `05_SUBSYSTEM_LIBRARY_VAULT.md`.

1. **The "book" entity.** Propose the data model for the book→unit→character hierarchy. Is a `books` table the right anchor (owning characters + units + a per-book media vault)? How do existing units (currently book-less) get backfilled into a book? How does a teacher create/import a book (scan the cover? title only? a set of units)?
2. **Character data model — reference vs copy.** When a unit uses a character, should it **reference** the book-level character by id (so editing the character updates all units — true continuity), or **copy-on-use** (snapshot per unit, independent edits)? We lean reference-with-optional-override, but want your reasoning. How does this interact with `BoardStoryStage` and any future dialogue exercises reading "speaker"?
3. **Character identity consistency across units.** How do we keep a character's generated image consistent across units (the same robot looks like the same robot in every illustration)? Options: a fixed reference image + img2img variation; a locked seed; a character "look" prompt that's reused. Propose the generation contract.
4. **Character voice.** Should each character have a stable ElevenLabs voice (so the robot always sounds like the robot in dubbed dialogues/audio)? If so, where is the voice ID stored, and how does `tts.ts`/`generate-media` pick it per speaker? (This ties into dialogue rendering, which doesn't exist yet — see `03` §4.)
5. **Character-driven content.** Should characters become **first-class in generation** — e.g. `enrich-unit` writes story/dialogue *for the book's cast* (referencing library characters) rather than inventing new ones per unit? And should there be character-driven games/exercises (a "who said it?" dialogue game, a character-emotion match, etc.)? If so, how do characters relate to `objectives`/`pool_items` (F1)?
6. **The character picker modal contract.** Propose the picker UX: where it's invoked (story speaker, dialogue turn, game avatar, illustration), what it shows (the book's cast + "create new"), and what it returns (character id). This is the character analog of the media-picker contract in `05` Q3.
7. **Migration of existing per-unit characters.** Existing units have characters in `manifest.enriched_content.characters[]` (DiceBear placeholders). How do we reconcile these into book-level library entries without duplicates (fuzzy match by name/role? teacher-assisted merge?), and what happens to the orphaned `character_ledger` table (repurpose as the library, or new table + drop)?
8. **Character CRUD screen.** Where does a teacher create/edit/manage the cast (rename, change image, set voice, set personality)? Is it part of the book view, the library, or the Knowledge Graph? (Ties to F2 — authoring IA.)

---

## 5. Concrete gaps to close (regardless of the final model)

| Gap | Note |
|---|---|
| **G3** `character_ledger` orphaned | Either repurpose as the book-level library (drop/repurpose `unit_id`, add `book_id`) or create a new `characters` table and drop the orphan. |
| No character image upgrade | Add an upgrade path (like vocab images in `generate-exercises`) — characters stuck on DiceBear placeholders forever today. |
| `+` button no-op (`LessonStudio.tsx:294`) | Wire to the picker once it exists. |
| No character picker modal | Build per Q6. |
| No voice/personality/relations | Add columns/fields per your model. |

---

## 6. Dependency note

The character system is **the most structurally entangled** of the subsystems:
- It requires the **book** concept (new entity above units).
- It depends on **F1** (data model) — reference-vs-copy is a data-model decision.
- It depends on **F2** (authoring IA) — where the cast is managed.
- It overlaps the **library/vault** (`05`) — character images/voices are media assets, and a per-book vault aligns with a per-book cast.
- It overlaps **dialogue** (currently dead data, `03` §4) — characters are the speakers; realizing dialogues likely requires characters first.

We'd therefore expect characters to be designed *after* F1/F2 are settled, but **the book concept may need to be introduced as part of F1** (since it anchors the data model for characters *and* the vault *and* unit grouping).

*All `file:line` references verified against source at audit time (2026-07-29).*
