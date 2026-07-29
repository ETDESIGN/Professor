# Brainstorming Briefing Package — Professor (Teacher App)

> **This is a briefing package for an external architecture/AI advisor.** It audits how the class-generation pipeline, the unit Knowledge Graph, the live-session/game system, the media library/vault, and the character system are (and aren't) connected today — and asks the advisor to **brainstorm architecture, UI, and workflow** for the gaps. The owner will review the advisor's output and decide before any implementation plan is written.

> **STATUS (updated 2026-07-29):** Brainstorming complete; advisor recommendation received (`ADVISOR_RECOMMENDATION.md`); **decisions made and an implementation plan written** — see `07_IMPLEMENTATION_PLAN.md`. The open forks F1/F2 are now **closed** (decisions D1–D4 in §"Decisions locked" of `07`). This package is now a historical record of the audit + rationale; `07` is the active build document.
>
> ⚠️ **Note on the advisor doc:** `ADVISOR_RECOMMENDATION.md` was written against the *pre-correction* package, so it still treats "B2 cloud deploy gap" as real. That was an audit error — the layer is live (see `02` §1.2). The advisor's *architecture* is unaffected; only its Phase-0 sequencing was built on the false premise, and `07` corrects it (B2 → B1b; `generation_jobs` moved into Phase 0).

---

## How to use this package

You can hand the advisor **any of these three ways** (the package was built to support all three, per the owner's instruction):

| Mode | What to send | When |
|---|---|---|
| **Comprehensive (single doc)** | `01_COMPREHENSIVE_AUDIT.md` only | A self-contained overview; enough to give high-level direction. |
| **Foundation deep-dive** | `01` + `02_FOUNDATION_DEEPDIVE.md` | When you want a focused recommendation on the two biggest forks (data model, editor consolidation). |
| **Full package / per-subsystem** | This whole folder | Maximum depth; the advisor can drill into any subsystem. |

**Recommended reading order:** `00` (this) → `01` → `02` → the subsystem deep-dives (`03`–`06`) as needed.

---

## The product in one paragraph

**Professor** is a teacher-led English-classroom platform for primary/young-learner courses built around **physical textbooks**. A teacher scans a page; vision-AI extracts text + vocabulary; generative AI produces a full unit (vocabulary, grammar, story, song, video, dialogues, **recurring characters**). The teacher reviews/edits that content (the **Knowledge Graph**), arranges a live lesson (a **timeline** of games/activities), and runs it as a **live classroom session** projected on a board, with a remote on a second device and a companion **student app** that practises the same content with spaced repetition. English course books for young learners feature **recurring characters across an entire book**, so characters are a first-class cross-unit concept.

## The stack

| Layer | Tech |
|---|---|
| Frontend | Vite + TypeScript multi-entry SPA (teacher / student / parent / admin); Tailwind; PWA |
| Hosting | Vercel |
| Backend | Supabase — Postgres 17 + Auth + Storage + Edge Functions (Deno) |
| AI | **OpenRouter gateway, region-safe models only** (Moonshot Kimi K2.6 / Qwen3 / DeepSeek). **OpenAI/Google/Anthropic are forbidden by hard rule.** |
| TTS/media | ElevenLabs (audio); Pollinations/Dicebear fallbacks for images |
| Payments | Stripe |

> **Constraint to keep in mind:** the **YouTube Data API is region-blocked** in this deployment, so the app's song/video features degrade to returning a *YouTube search URL* rather than an embed. (`supabase/functions/generate-media/index.ts:57-66`.)

---

## The 3-stage pipeline (the spine of the whole audit)

```
Stage 1 — GENERATION             Stage 2 — KNOWLEDGE GRAPH       Stage 3 — LIVE + STUDENT
(scanned page → AI content)      (teacher reviews/edits)         (games consume KG content)
```

- **Stage 1** (`extract-page` → `enrich-unit` → `orchestrate-lesson` → `generate-exercises`) turns a scanned page into AI content and *should* turn it into playable exercises.
- **Stage 2** (the "Knowledge Graph" / review editors) is where the teacher reviews/edits generated content.
- **Stage 3** (`SessionContext` + Board game templates + Student app) *consumes* the content.

**The headline:** Stages 2 and 3 are largely *built and wired*, but **Stage 1 is silently starving them** due to one authorization bug plus an un-deployed relational layer. On top of that, Stage 2's UI only surfaces a fraction of what Stage 1 generates. Full detail in `01`.

---

## What's settled vs. what we need from the advisor

### 🔒 LOCKED decisions (do not re-litigate; we want *implementation* architecture)

| | Decision | Rationale |
|---|---|---|
| **L1** | **Characters are a cross-unit, book-level reusable entity** (a library with a picker modal). | Course books have recurring characters across the whole book; per-unit JSONB can't model this. Depth: `06_SUBSYSTEM_CHARACTERS.md`. |
| **L2** | **Educational-AI level / target-age differentiation is deferred** (out of scope this round). | It's a large educational-AI pipeline of its own. Today there's only a free-text CEFR field. Don't fold it into foundation work. |

### 🔀 OPEN forks (we want your recommendation)

| | Fork | Summary | Detailed in |
|---|---|---|---|
| **F1** | **Data model** for generated content | Almost all content lives in one JSONB blob (`units.manifest`); only vocab/grammar got the relational `objectives`→`pool_items` treatment. Story/song/video/dialogue/characters/level have no relational home. Decide per-category: relational vs media-reference vs document JSONB. | `02_FOUNDATION_DEEPDIVE.md` §2 |
| **F2** | **Authoring UI consolidation** | Four overlapping editors with inconsistent data contracts; the primary entry points route to the two that are broken/partial. Propose the target information architecture. | `02_FOUNDATION_DEEPDIVE.md` §3 |

**Sequencing the advisor should respect:** **F1 before F2** ("edit a story/character" means different things depending on whether those are rows or JSONB keys), and **both before subsystem design** (Knowledge Graph UI, Library/Vault, Characters all implement F1 and live inside F2). Pipeline integrity bugs (below) are independent and should be repaired in parallel regardless.

---

## The integrity bugs (must-fix, independent of architecture)

These starve Stage 3 and break Stage 2's images. They are **not** forks — they're concrete repairs. Detailed in `02` §1 and `01` §6.

| # | Sev | Bug |
|---|---|---|
| **B1** | 🔴 | `generate-exercises` rejects NULL-owner units while siblings tolerate them (`generate-exercises/index.ts:229-231` vs `orchestrate-lesson/index.ts:313`); textbook units are created NULL-owner (`UploadTextbook.tsx:331`) → no exercise pool. |
| **B1b** | 🔴 | `generate-exercises` has **never produced data in production** (verified 2026-07-29: `objectives`/`pool_items`/`assets`/`character_ledger` all have 0 rows for all 87 units — even owned units). The fire-and-forget trigger has never succeeded; the exercise layer is live but unfed. |
| ~~B2~~ | — | ~~"Stage-3 relational layer not on cloud"~~ — **RETRACTED (audit error, based on stale `AGENTS.md`).** Verified: all 65 migrations applied, all 12 functions deployed. Real issue is B1/B1b. |
| **B3** | 🔴 | Knowledge Graph reads `image_prompt` (text) instead of `image_url` (image) (`LessonStudio.tsx:354`). |
| **B4** | 🟠 | "Auto-generate image" stub overwrites `image_prompt` with `'Failed'`, corrupting data (`LessonStudio.tsx:177-194`). |
| **B5** | 🟠 | Plan button routes to a pure mock builder (`LessonTimelineBuilder.tsx` — Save has no onClick). |
| **B7** | 🟠 | `AssetWorkshop.tsx:350-353` drops `image_url` from the `knowledge_graph` vocab projection. |
| **B8** | 🟠 | YouTube search response-shape mismatch in vault Media tab. |

(Plus gaps G1–G8 in `01` §6: JSONB-only data model, orphaned `character_ledger`, mock Library, no media-picker, builder fragmentation, dual-manifest shape, unused columns, etc.)

---

## Folder contents

| File | Purpose |
|---|---|
| `00_README.md` | **This file.** Navigator + master question list. |
| `01_COMPREHENSIVE_AUDIT.md` | Self-contained overview; symptom→root-cause map; prioritized bug/gap list; the cross-system picture. **Start here.** |
| `02_FOUNDATION_DEEPDIVE.md` | The highest-stakes decisions: pipeline integrity (§1) + open fork **F1** data model (§2) + open fork **F2** editor consolidation (§3). |
| `03_SUBSYSTEM_GENERATION_PIPELINE.md` | Stage 1: edge-function-by-edge-function, the exact trigger path, and where each generated category lands and dies. |
| `04_SUBSYSTEM_KNOWLEDGE_GRAPH.md` | Stage 2: the 3 review screens, the image bugs in detail, what's editable vs missing, the intended editing UX. |
| `05_SUBSYSTEM_LIBRARY_VAULT.md` | The mock-library reality, the real-but-unwired backing store, the missing media-picker, and the intended vault UX. |
| `06_SUBSYSTEM_CHARACTERS.md` | The orphaned `character_ledger`, the per-unit JSONB reality, and the locked target: a cross-unit book-level character library. |
| `ADVISOR_RECOMMENDATION.md` | The external advisor's response to this package (F1/F2/subsystem architecture). *Reads the pre-correction package — its B2 sequencing is stale; see note above.* |
| `07_IMPLEMENTATION_PLAN.md` | **ACTIVE BUILD DOC.** The owner's decisions (D1–D4) after reviewing the advisor, and the phased plan (0→1→2→3). Supersedes the advisor's sequencing where the B2 correction changes the work. |

> Existing legacy docs in the repo root (`00_index.md`–`24_*`, `LIVE_GAME_LIFECYCLE.md`, `docs/FIXPLAN_*.md`, many audit reports) are **not** part of this package but may be useful reference. In particular: `LIVE_GAME_LIFECYCLE.md` (canonical Stage-3 / pick→play→score→next reference) and `docs/FIXPLAN_INDEX.md` + `docs/FIXPLAN_B_LIVEBOARD.md` (the workstream that wired live-board scoring).

---

## 🎯 Master question list for the advisor

Every open question across the package, consolidated. Each links to the deep-dive that frames it.

### Foundation
- **F1 (data model):** Per-category verdict — relational skill node vs media/asset reference vs document JSONB — for vocabulary, grammar, story, song, video, dialogue, characters, level. → `02` §2.3
- **F1:** Where do characters and media live in your model (given L1 + the vault ambition)? Are `character_ledger`/`assets` the right anchors, or do you propose a `books` table? → `02` §2.3, `06` Q1
- **F1:** What's the single read/write contract (one source of truth, not two drifting shapes)? → `02` §2.3
- **F1:** How does generation emit your model (all-relational with manifest cache? resumable pipeline vs fire-and-forget)? → `02` §2.3, `03` §5
- **F1:** Migration story for existing units (JSONB content, empty pools) without losing teacher edits. → `02` §2.3
- **F2:** Propose the authoring IA (surfaces, navigation graph; where do Plan / Edit / post-live-exit land?). → `02` §3.4
- **F2:** Are "edit content" and "arrange timeline" one surface or two? → `02` §3.4
- **F2:** What happens to `AssetWorkshop` (first-run approval vs folded in)? → `02` §3.4
- **F2:** The shared data contract so we stop having four field-name conventions. → `02` §3.4
- **F2:** Mobile recommendation (today: empty stub). → `02` §3.4

### Stage 1 — Generation
- Should generation emit relational content for ALL categories (story-comprehension, song/video assets, dialogue exercises), not just vocab/grammar? → `03` §5
- Orchestration as a resumable pipeline (with `generation_jobs` status) vs fire-and-forget? → `03` §5
- Regeneration/upgrade story for every category (not just vocab images)? → `03` §5
- Idempotency/reconcile-on-re-run for all emitters? → `03` §5
- Single emitter vs JSONB-writer + relational-projector split? → `03` §5

### Stage 2 — Knowledge Graph
- What should the KG *be*: structured editor vs true node-edge graph vs hybrid? → `04` §5
- Editing writeback design (edit → canonical store → invalidate manifest cache + downstream `pool_items`)? → `04` §5
- "Regenerate image with extra description" → where does the new asset land (vault?), how does it reach referencing exercises? → `04` §5
- Story/song/video/dialogue editors — edit instance vs drive regeneration? For song/video, given the YT region block, is upload/URL the realistic primary path? → `04` §5
- Where does "review/edit content" live in the IA, and is it the post-generation landing? → `04` §5
- Live-update vs edit-then-republish for running sessions / student app? → `04` §5

### Library / Vault
- Vault scope: per-teacher vs per-book vs per-unit? How do units reference vault assets? → `05` §5
- Tagging/search/faceting model (AI vs manual)? → `05` §5
- The single media-picker contract (input/output shapes, modal UX) every media field uses. → `05` §5
- Should all generated media auto-enter the vault; should re-generation create new assets (preserve old)? → `05` §5
- Song/video model: upload file vs paste URL, given the YT block? New bucket needed? → `05` §5
- Dedup-vs-reuse policy; quotas/cleanup. → `05` §5

### Characters (locked L1 — implementation architecture only)
- The `books` entity model (book→unit→character); backfill for book-less units; book creation/import. → `06` §4
- Reference-vs-copy when a unit uses a character; interactions with story/dialogue speakers. → `06` §4
- Character visual identity consistency across units (reference image / locked seed / look-prompt). → `06` §4
- Character voice (stable ElevenLabs voice per character; where stored; how TTS picks it). → `06` §4
- Characters as first-class in generation (story/dialogue for the book's cast) + character-driven games? → `06` §4
- Character picker modal contract (analog of the media-picker). → `06` §4
- Migration of existing per-unit characters into book-level entries (dedup/merge); fate of `character_ledger`. → `06` §4
- Character CRUD screen location (book view / library / KG). → `06` §4

### Process
- Sanity-check our repair ordering: integrity bugs (B1/B1b/B7…) → F1 → F2 → subsystems. → `02` §4

---

*Package date: 2026-07-29. All `file:line` references verified against source at audit time. Audit covered: the generation pipeline (6 edge functions + `_shared`), 65 migrations, the four authoring editors, the live session/game system (SessionContext + Board templates + student app), the library/vault, and the character system.*
