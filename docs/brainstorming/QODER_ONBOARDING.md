# Qoder Onboarding — Professor (Teacher App) Implementation

> **Read this FIRST, in full, before doing anything.** This file is the handoff from a prior coding session (ZCode / GLM-5.2) to a new session (Qoder / Qwen3.8). It exists so you start with the complete, accurate context that session built up — without re-deriving it.
>
> **You are picking up an implementation IN PROGRESS.** Phases 0, 1.1, and 1.2 are DONE and deployed. Phase 1.3 (`dialogue_lines`) is NEXT. Do not re-plan, re-audit, or re-architect — the architecture is decided and documented. Your job is to *continue building* the decided plan, following its conventions exactly.

---

## 0. The 60-second orientation

- **Project:** "Professor" — a teacher-led English-classroom platform for young learners, built around physical textbooks. Scan a page → AI generates a full unit → teacher reviews/edits → runs live classroom games → student app practices the same content with spaced repetition.
- **Working directory:** `/home/e/Documents/DEV/teacher app/professor-0.1 (1)/` (a git repo on branch `master`). The parent `/home/e/Documents/DEV/teacher app/` holds the workspace `AGENTS.md`.
- **Stack:** Vite + TypeScript multi-entry SPA (teacher/student/parent/admin) → Vercel. Supabase (Postgres 17 + Edge Functions/Deno). AI via **OpenRouter, region-safe models only** (Moonshot/Qwen/DeepSeek — **OpenAI/Google/Anthropic are FORBIDDEN by hard rule**). ElevenLabs for TTS. Stripe for billing.
- **Supabase project:** `xsdnzijketjnzhakqtit` ("Professor 1.0", Mumbai). The PAT is in `SUPABASE_ACCESS_TOKEN`.
- **The doc that owns the plan:** `docs/brainstorming/07_IMPLEMENTATION_PLAN.md`. Read it. It has ✅ COMPLETE markers on finished phases and describes what to build next.
- **CRITICAL git state:** all Phase 0/1.1/1.2 work is **UNCOMMITTED** on `master`. Nothing has been committed since `5a729ef`. Do not reset/checkout or you will lose it. (See §7.)

---

## 1. The single most important mental model: the 3-stage pipeline

Everything you touch relates to this pipeline. Memorize it:

```
Stage 1 — GENERATION          Stage 2 — KNOWLEDGE GRAPH       Stage 3 — LIVE + STUDENT
(scan page → AI content)      (teacher reviews/edits)         (games consume content)
```

- **Stage 1** (`extract-page` → `enrich-unit` → `orchestrate-lesson` → `generate-exercises` edge functions) turns a scanned page into AI content AND into playable exercises.
- **Stage 2** is the review/edit surface (today fragmented across 4 editors — Phase 2 consolidates them).
- **Stage 3** (`SessionContext` + Board game templates + Student app) *consumes* content: live games read `pool_items`; the student app reuses the same data with FSRS spaced repetition.

**The relational spine that connects the stages (this is the heart of the whole design):**

```
units → objectives → pool_items → srs_items
        (skill nodes)  (exercises)   (FSRS learner state)
```

Vocabulary and grammar already use this spine. **Phases 1.2/1.3/1.4 extend it to story/dialogue/grammar-real-table** so those categories become playable too (today they're JSONB-only and discarded). Characters (`characters` + `unit_characters`) and media (`assets`, soon `unit_media`) are separate but linked entities.

---

## 2. Read these docs in this order (they are the source of truth)

All in `docs/brainstorming/`. They are evidence-backed — every claim cites `file:line`. **Do not contradict them without checking the evidence.**

| Order | File | Why |
|---|---|---|
| 1 | `07_IMPLEMENTATION_PLAN.md` | **THE ACTIVE PLAN.** Phases 0→1→2→3, with ✅ DONE markers and "what's NEXT". This is your task list. §0 records the 4 locked decisions (D1–D4). |
| 2 | `00_README.md` | Navigator + the master question list + locked decisions (L1 characters book-level; L2 level-differentiation deferred). |
| 3 | `01_COMPREHENSIVE_AUDIT.md` | The full audit: bugs (B1–B10), gaps (G1–G9), symptom→root-cause map. **Bug list has been corrected** — B2 was an audit error (retracted); B1b is the real one. |
| 4 | `02_FOUNDATION_DEEPDIVE.md` | The two architecture forks (F1 data model, F2 editor consolidation) — **both now DECIDED** (D1, D3). |
| 5 | `03_SUBSYSTEM_GENERATION_PIPELINE.md` | Edge-function-by-edge-function + where each category lands/dies. |
| 6 | `04_SUBSYSTEM_KNOWLEDGE_GRAPH.md` | The 4 fragmented editors + image bugs (B3/B4/B7 — now fixed in Phase 0C). |
| 7 | `05_SUBSYSTEM_LIBRARY_VAULT.md` | The mock library + the missing media-picker. (Phase 1.5 / Phase 3.) |
| 8 | `06_SUBSYSTEM_CHARACTERS.md` | The character system (DONE in Phase 1.1). |
| 9 | `ADVISOR_RECOMMENDATION.md` | The external advisor's architecture rationale. **Note:** it was written against the pre-correction package, so its "B2 deploy gap" framing is stale (the layer is deployed). Its architecture recommendations are still the basis of the plan. |

**Also read these workspace/canonical docs:**
- `AGENTS.md` (workspace root, `/home/e/Documents/DEV/teacher app/AGENTS.md`) — deploy runbook, connection inventory, region-safe AI rule, known issues. **§3 cloud state was corrected 2026-07-29** (65 migrations all applied, 12 functions deployed).
- `LIVE_GAME_LIFECYCLE.md` (repo root) — canonical Stage-3 reference (pick→play→score→next loop, the 4 things every board game must do).
- `docs/FIXPLAN_INDEX.md` + `docs/FIXPLAN_B_LIVEBOARD.md` — the prior workstream that wired live-board scoring (Phase 3 is healthy).

---

## 3. What's DONE (Phases 0, 1.1, 1.2) — deployed, verified working

**Do not redo any of this.** It is live on cloud + Vercel and verified.

### Phase 0 — Unblock + foundation ✅
- **Bug B1 fix:** `teacher_id` stamped at unit creation (`apps/teacher/UploadTextbook.tsx` + `Engine.createUnit`). Shared ownership check: `supabase/functions/_shared/assertOwnership.ts` (strict — do NOT loosen; the prior asymmetry starved the pool).
- **Bug B1b fix:** `generation_jobs` table (migration `20260729000001`) + `orchestrate-lesson`/`generate-exercises` track the trigger visibly. The fire-and-forget is now observable/retryable.
- **Bug B5 fix:** Plan button routes to `LessonStudio` (real builder), not the dead mock.
- **Bug B3/B4/B7 fixes:** vocab images read `image_url` (not `image_prompt`); the corrupting `'Failed'` stub removed; `AssetWorkshop` projection keeps `image_url`.
- **G9:** delete-unit UI + `Engine.deleteUnit`.
- **`books` table** (migration `20260729000002`) + `units.book_id` + `migrated_categories` flag + default-book backfill (0 orphan units). `services/BookService.ts`.
- **Two pre-existing bugs found+fixed during verification** (both in `07` §Phase 0 header):
  - `Assignment to constant variable` — `transformManifestToFlow` reassigned `const flow`; this crashed ALL flow generation → every unit got a 1-slide fallback. Fixed `const`→`let`.
  - Vocabulary enrichment 100% failure — a `max_tokens: 9000` override exceeded model output caps; reverted to 5000, kept `extractBalancedJson` + `repairTruncatedJson` for truncation tolerance.

### Phase 1.1 — Characters (locked L1: book-level) ✅
- Migration `20260729000003`: `characters` (book-scoped: `look_prompt`, `voice_id`, `personality`, `reference_image_asset_id`) + `unit_characters` join. RLS mirrors objectives pattern. **`character_ledger` NOT repurposed** (stays for avatar cosmetics).
- Backfill: 29 chars → 2 books, 40 joins, **9 ambiguous merges flagged (not auto-merged)** — saved to `/tmp/char_ambiguities.json` (lost on reboot; the data is also inferable from the `characters` table).
- `look_prompt` consistency: `supabase/functions/_shared/characterLook.ts` (`buildPromptWithCharacter`, `fetchCharacterByName`, `resolveSpeakerVoice`).
- `voice_id` in TTS: `_shared/tts.ts` `generateAndStoreAudio(text, unitId, voiceId?)`.
- Character-driven generation: `enrich-unit` fetches the book's cast, injects into prompts (reuse not invent), persists to library + `unit_characters`. **Verified: Jenny/Jim/Gracie reused across units.**
- Frontend: `services/CharacterService.ts` + `apps/teacher/CharacterPickerModal.tsx`, wired into `UnitContentVault` Settings → Characters (avatars + "Add from cast" + create + unlink).

### Phase 1.2 — Story (highest-value category) ✅
- Migration `20260729000004`: `story_pages` + `story_comprehension_questions`. `objectives.type` CHECK widened to include **`story` AND `dialogue`** (so Phase 1.3 needs no migration).
- New exercise type `STORY_COMPREHENSION` (added to `_shared/exerciseTypes.ts` + RECEPTIVE set).
- `generate-exercises` emits `STORY_COMPREHENSION` from `story_comprehension_questions` (with manifest fallback for legacy units).
- `enrich-unit` writes story relationally (single emitter; resolves `speaker` → `speaker_character_id` for continuity).
- Backfill: 55 pages + 62 comprehension questions across 12 units.
- **Verified:** test unit `1c542fad` produced **8 STORY_COMPREHENSION** pool items (was 0 for all units before). Total pool 64.

### Current verified baseline (the thing that now works end-to-end)
A fresh upload produces: vocab + grammar + story + songs + videos + dialogues, an ~11-slide flow, objectives + pool_items (incl. STORY_COMPREHENSION), srs templates, a `generation_jobs` row, and reuses the book's character cast.

---

## 4. What's NEXT (your task queue, in order)

From `07_IMPLEMENTATION_PLAN.md`. **Build in this order** — each phase was sequenced for dependency/value reasons.

### Phase 1.3 — `dialogue_lines` (NEXT)
The last relational content category. `objectives.type` already allows `'dialogue'` (widened in 1.2).
- Table: `dialogue_lines(unit_id, order_index, speaker_character_id→characters, text, translation, audio_asset_id→assets)` + nullable `speaker_override_name` (advisor §7.2).
- New flow type `DIALOGUE_STAGE` (presentation) + pool-item types `DIALOGUE_ROLEPLAY` / `WHO_SAID_IT` (advisor §4, §7.5 — "who said it?" unlocks once `speaker_character_id` exists).
- `enrich-unit` writes dialogues relationally (single emitter); `generate-exercises` emits the new types; backfill legacy manifest dialogues.

### Phase 1.4 — `grammar_rules` (real table)
Today grammar is JSONB-derived and conditionally wired (only connects if enriched data carries `error_examples`/`transformation_pairs`). Make `grammar_rules(id, unit_id, rule, explanation, examples jsonb)` the canonical source feeding `objectives(type='grammar')`.

### Phase 1.5 — `unit_media` + extended `assets` (vault backbone)
`unit_media(unit_id, asset_id, role, order_index)` many-to-many (replaces single `assets.unit_id` FK). Extend `assets`: `owner_id`, `book_id`, `kind`, `source_url`, `tags`, `is_deleted` (advisor §6.1). Song/video become media references here.

### Phase 1.6 — Emission consolidation
Single emitter per category (kill the JSONB-writer/relational-projector split). `activity_type_registry(learning_object_type, activity_type, generator_key)`. Read contract: `get_unit_bundle(unit_id)` view/RPC. Retire `units.manifest` for migrated categories (feature-flag via `migrated_categories`).

### Phase 2 — Unified Unit Studio (F2, decided D3)
One component, route `/teacher/unit/:id`, tabs Content + Plan. Retires `LessonTimelineBuilder` (the mock), `LessonStudio`'s KG toggle, and folds `AssetWorkshop`/`UnitContentVault` in. Mobile: read-only Content tab. This is where the **polished UI** (richer character cards, etc.) lands.

### Phase 3 — Subsystem polish
Vault UI (`ResourceLibrary.tsx` wired to `assets`), media-picker modal (`<MediaPickerModal>`), character picker polish + Book/Cast screen (advisor §7.8), song/video path (incl. a 10-min spike: does `<iframe>` embed work despite the YouTube *Data API* being region-blocked? — advisor §5.4/§6.5), KG cast/story map panel.

---

## 5. Critical conventions (follow EXACTLY — they prevent real bugs)

### Region-safe AI (HARD RULE)
**Never** use OpenAI/Google/Anthropic in any AI call. Canonical models (set as Supabase edge-function secrets AND Vercel env): `AI_MODEL_NAME=moonshotai/kimi-k2.6`, `FALLBACK_MODEL_NAME=deepseek/deepseek-chat`, `VISION_MODEL_NAME=qwen/qwen3-vl-235b-a22b-instruct`, `FALLBACK_VISION_MODEL_NAME=qwen/qwen2.5-vl-72b-instruct`. See `AGENTS.md` §5.

### Migrations
- Live in `supabase/migrations/`, named `YYYYMMDDNNNNNN_snake.sql`, **idempotent** (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` before create, `ADD COLUMN IF NOT EXISTS`).
- **69 now exist** (latest `20260729000004`). The next one is `20260730000001`.
- RLS pattern: enable RLS + policies using `EXISTS (SELECT 1 FROM units u WHERE u.id = X.unit_id AND u.teacher_id = auth.uid()) OR (SELECT public.is_teacher_or_admin())`. `service_role` bypasses RLS (edge functions use it). `GRANT ALL ... TO authenticated, anon, service_role`. Mirror the existing `objectives`/`pool_items`/`story_pages` policies.

### Edge functions (Deno, `supabase/functions/`)
- Wrapped by `_shared/edgeHandler.ts`. Auth via `_shared/authMiddleware.ts` (`authenticateRequest` → `{userId, role, supabase}`).
- **Ownership:** every content function MUST use `_shared/assertOwnership.ts` `assertUnitOwnership(unit.teacher_id, {callerId: auth.userId})`. Strict (rejects NULL owner). Do NOT loosen.
- AI JSON parsing in `enrich-unit`: use the `extractBalancedJson` + `repairTruncatedJson` helpers (they fixed the vocab truncation crash). `max_tokens: 5000` (NOT higher — 9000 exceeded model caps and broke vocab).
- Shared modules are **duplicated** edge↔client (e.g. `_shared/manifest.ts` ↔ `services/manifest.ts`, `_shared/exerciseTypes.ts` ↔ `types/exercise.ts`) because Deno and the browser can't share a module root. **Keep them in sync.**

### The generation→pool contract (don't break it)
`generate-exercises` builds `objectives` (one per skill node) → `pool_items` (typed exercises, `exercise_type` + `difficulty` + `content` JSONB). Board games read `pool_items` via `apps/board/useBoardPool.ts`; student app via `services/poolService.ts`. Exercise types live in `_shared/exerciseTypes.ts` (edge) + `types/exercise.ts` (client) — **both must list any new type** (added `STORY_COMPREHENSION` in 1.2; 1.3 adds dialogue types).

### TypeScript
- `npx tsc --noEmit -p tsconfig.json` — ignore the `Cannot find name 'Deno'` / `esm.sh` errors (they're the edge functions under the Node tsconfig; expected noise). Real errors = anything else.
- Build: `npx vite build` (must succeed before deploy).

---

## 6. How to deploy (from `AGENTS.md` §7)

All commands from `professor-0.1 (1)/`. The PAT (`SUPABASE_ACCESS_TOKEN`) auths both the CLI and the Management API.

### DB migrations / SQL (PRIMARY path — no local DB connection needed)
The direct Postgres host has a TLS-EOF blocker in this env. Use the **Management API** instead:
```bash
# Apply a migration's SQL (works, server-side):
curl -s -X POST "https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -A "supabase-cli/2.78.1" \
  --data-binary @<(python3 -c "import json; print(json.dumps({'query': open('supabase/migrations/NEW.sql').read()}))")
# Then register the version so the CLI knows it's applied:
curl -s -X POST "https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -A "supabase-cli/2.78.1" \
  -d '{"query":"INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('\''20260730NNNNNN'\'') ON CONFLICT DO NOTHING;"}'
```
> ⚠️ **Gotcha hit during this work:** `curl -d '{"query": "..."}'` mangles SQL quotes via shell escaping. Use the `--data-binary @<(python3 ...)` form (build the JSON in Python) — it's the reliable path. Empty `[]` response = success.

### Edge functions
```bash
supabase functions deploy <name> --no-verify-jwt --project-ref xsdnzijketjnzhakqtit
# redeploy any function whose _shared imports changed too (the bundler inlines them)
```

### Frontend (Vercel)
```bash
npx vite build && vercel --prod --yes
```
Push to `master` also auto-deploys. **PWA gotcha (AGENTS.md §8.1):** `registerType: 'prompt'`, so already-open tabs keep old JS until the user clicks "Reload" or hard-refreshes (Ctrl/Cmd+Shift+R). After a deploy, hard-refresh once to see changes.

### Verify a deploy
- Tables: `GET https://xsdnzijketjnzhakqtit.supabase.co/rest/v1/<table>` → expect 401 (exists) not 404.
- Function: `GET .../functions/v2/<name>` → expect 401 (deployed) not 404.
- DB counts via the Management API query path (above) — e.g. confirm `pool_items` has rows for a freshly-orchestrated unit.

---

## 7. Git state — READ THIS

- Branch `master`. Last commit `5a729ef` ("docs: LIVE_GAME_LIFECYCLE.md").
- **ALL Phase 0/1.1/1.2 work is UNCOMMITTED.** Modified: `apps/teacher/{AssetWorkshop,LessonStudio,TeacherDashboard,UnitContentVault,UnitList,UploadTextbook}.tsx`, `services/SupabaseService.ts`, `supabase/functions/_shared/{exerciseTypes,tts}.ts`, `supabase/functions/{enrich-unit,generate-exercises,orchestrate-lesson}/index.ts`. New (untracked): `apps/teacher/CharacterPickerModal.tsx`, `services/{BookService,CharacterService}.ts`, `supabase/functions/_shared/{assertOwnership,characterLook}.ts`, `docs/brainstorming/`, 4 new migrations (`supabase/migrations/20260729*`).
- **There is a junk untracked file** with a mangled name (`\\enriched_content...`) — an artifact of a shell-escaping mistake. Safe to delete. (This is why the onboarding §6 warns about SQL-quote shell-escaping — the reliable pattern is `--data-binary @<(python3 ...)`.)
- **Recommendation for Qoder:** before starting Phase 1.3, commit this work (`git add -A && git commit`) so there's a rollback point. Branch first if you prefer. The owner has not asked for commits yet, so ASK before committing/pushing.

---

## 8. The 4 locked decisions (do NOT re-litigate)

| # | Decision | Implication |
|---|---|---|
| **D1 / F1** | Hybrid data model: relational skill-node tables for anything edited/played/tracked (vocab, grammar, story, dialogue, characters); media-reference for song/video; `books` is the anchor entity above units. Build incrementally. | Don't propose keeping everything JSONB; don't propose a Curriculum/Universe layer above books. |
| **D2** | Phase 0 = unblock + foundation together. | Done. |
| **D3 / F2** | One unified Unit Studio (Content + Plan tabs); AssetWorkshop folded in as first-run state. | Phase 2. |
| **D4** | Full character system this round (tables + picker + look_prompt + voice_id + generation). | Done in 1.1. |
| **L1** | Characters are cross-unit, **book-level** (course books have recurring characters). | Implemented. |
| **L2** | Educational-AI level/target-age differentiation is **DEFERRED**. | Don't fold it into foundation work. Hook point noted for later: `books.target_age_range` / `books.cefr_level` (advisor §8) — no schema change needed now. |

---

## 9. Quick-reference: the data model as it stands now

```
units (id, teacher_id, book_id, status, flow, manifest, scanned_assets, migrated_categories, ...)
  ├─ book_id → books (id, owner_id, title, cover_asset_id, target_age_range, cefr_level)
  │
  ├─ objectives (id, unit_id, type ∈ vocabulary|grammar|phonics|story|dialogue, target_value)  [SKILL NODES]
  │     └─ pool_items (id, unit_id, objective_id, exercise_type, difficulty, content)            [EXERCISES]
  │
  ├─ srs_items (id, unit_id, student_id, word, translation, objective_id, +FSRS cols)           [LEARNER STATE]
  │
  ├─ characters (id, book_id, name, role, personality, look_prompt, voice_id, ref_image_asset_id)  [book-level CAST]
  │     └─ unit_characters (unit_id, character_id)                                                  [join]
  │
  ├─ story_pages (id, unit_id, page_number, text, speaker, speaker_character_id→characters, image_prompt, ...)
  │     └─ story_comprehension_questions (id, unit_id, story_page_id, question, options, answer_index, order_index)
  │
  ├─ assets (id, unit_id, type, prompt, prompt_hash, public_url, ...)  [generated-media dedup; Phase 1.5 extends w/ owner_id, book_id, kind, tags, is_deleted]
  │     └─ unit_media (Phase 1.5 — many-to-many, replaces assets.unit_id)
  │
  ├─ generation_jobs (id, unit_id, stage, status, error, attempt, ...)  [pipeline observability]
  └─ character_ledger (UNUSED by content pipeline — avatar cosmetics only; do NOT repurpose)
```

Exercise types (`_shared/exerciseTypes.ts`): IMAGE_SELECT, MEANING_MATCH, AUDIO_L1_SELECT, LISTEN_SELECT, SPELL_CLOZE, WORD_BANK_BUILD, ERROR_SPOT, TRANSFORM, DICTATION, MINIMAL_PAIR_SWIPE, TYPE_TRANSLATE, SPEAK_SENTENCE, **STORY_COMPREHENSION** (new in 1.2). Phase 1.3 adds DIALOGUE_ROLEPLAY / WHO_SAID_IT.

---

## 10. How to verify your work (the pattern used throughout)

After any generation/pool change, query the DB to confirm end-to-end:
```bash
# Did the new unit populate objectives + pool_items + the new exercise type?
curl -s -X POST "https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -A "supabase-cli/2.78.1" \
  --data-binary @<(python3 -c "
import json
q = \"SELECT (SELECT count(*) FROM objectives WHERE unit_id='<UNIT>') AS obj, (SELECT count(*) FROM pool_items WHERE unit_id='<UNIT>') AS pool, (SELECT count(*) FILTER (WHERE exercise_type='STORY_COMPREHENSION') FROM pool_items WHERE unit_id='<UNIT>') AS story, (SELECT status FROM generation_jobs WHERE unit_id='<UNIT>' AND stage='generate-exercises') AS job;\"
print(json.dumps({'query': q}))
")
```
The owner tests uploads through the live app; you verify the DB side. Report numbers plainly (X objectives, Y pool items, Z of the new type).

---

## 11. Your first task: Phase 1.3 (`dialogue_lines`)

Start by reading `07_IMPLEMENTATION_PLAN.md` §1.3 and `ADVISOR_RECOMMENDATION.md` §2.3 (dialogue row) + §4 (new flow/exercise types). Then:
1. Write migration `20260730000001_dialogue_lines.sql` (table + RLS mirroring story_pages).
2. Add `DIALOGUE_ROLEPLAY` + `WHO_SAID_IT` to BOTH `_shared/exerciseTypes.ts` and `types/exercise.ts`.
3. `enrich-unit`: write dialogues relationally (resolve speakers → characters); keep the manifest write for now.
4. `generate-exercises`: emit the new types from the table.
5. Backfill legacy manifest dialogues.
6. Deploy (migration via Management API; both functions) + ask the owner to upload a test unit; verify the new pool items appear.

Match the Phase 1.1/1.2 patterns exactly — they're the template.

---

*Authored 2026-07-29 as a handoff from a ZCode (GLM-5.2) session. All claims verified against the live cloud DB at handoff time.*
