# 10 — Book-Fidelity Extraction & Basket Pool System (Brainstorm & Decisions)

> **Status:** Design decisions locked (brainstorm 2026-08-26). Not yet implemented.
> **Sources:** Live audit of the generation pipeline (edge functions + frontend + schema + git history), and a page-by-page analysis of a real textbook sample: *Power Up 2* Pupil's Book (Cambridge), Units 1–2 (26 scanned pages, no text layer).
> **Companion docs:** `03_SUBSYSTEM_GENERATION_PIPELINE.md` (current pipeline map), `02_FOUNDATION_DEEPDIVE.md` (B1/B1b history), `ADVISOR_RECOMMENDATION.md` (relational spine rationale).

---

## 0. TL;DR

Today the pipeline **generates categories unconditionally with fixed quotas** — every uploaded page yields 6–8 vocabulary words, 1–3 grammar rules, 2–4 invented characters, a 3–5-page story, songs and dialogues, regardless of what the page actually contains. The new model inverts this:

1. **Understand before generating.** Each page is scanned for *which structures are actually present* (vocab set, comic panels, grammar box, song sheet, reading passage, printed activities…), each with bounding boxes.
2. **Reproduce, don't invent.** Every present structure is extracted **verbatim** — exact words, exact dialogue lines, exact grammar box text, exact lyrics, original artwork crops.
3. **Baskets, not quotas.** Extracted material lands in per-type baskets with **no size limits**; whatever the book has (15–30+ words, 6 panels, 2 grammar boxes) is what the system has.
4. **Absence = absence.** No story on the page → no story. No grammar box → no mandatory grammar. AI generation of absent categories becomes an **explicit, labeled teacher action**, never automatic.
5. **Teacher sovereignty.** The teacher decides which page belongs to which unit, removes/edits anything at review, and the system never fights those decisions. Books without clean unit structures are first-class citizens.

This is a return to the project's founding design ("Professor Architecture 2.0", Jan 2026), which was abandoned for security and free-tier-model-reliability reasons that no longer apply (§2).

---

## 1. The observations (owner, 2026-08-26)

- Uploading a book image always produces vocabulary + grammar + personages + story etc., even for pages that contain *only* vocabulary. The first OCR pass should differentiate what exercises/content the page actually holds.
- Extraction must capture **all** the pedagogical content of the page, and **only** the content of the page — never a hallucinated one. **Reproduction is the goal.**
- No limits: a page with 15–30+ vocabulary words must land all of them in the pool. The pool should behave like a **basket**: drop any amount in; the exercise system later picks from what is there.
- Dialogues must be the **exact text** from the book — not AI-regenerated text "relative to the topic".
- The cast/personage goal: extract descriptions precise enough to regenerate similar characters later (**parked as its own workstream**, §10.3 — but its extraction side is in scope, §7.9).
- Comics pages: **crop the original panels** from the photographed page and use the book's exact artwork in LiveBoard/student app (slide-the-panels storytelling) — AI regeneration of comic art is the wrong path (fidelity AND consistency loss).

---

## 2. Current-state root causes (audit, with references)

| # | Root cause | Where |
|---|---|---|
| R1 | Extraction prompt is a flat, unconditional "extract everything" schema (vocabulary 6–12, exercises, objectives, visual context). It never asks *"what is on this page?"* and has no fields for grammar/dialogue/story as page content. | `_shared/prompts/index.ts:43-77` (`extract-v3`) |
| R2 | Enrichment prompts order each category **unconditionally with fixed quotas**: "Extract 1-3 core grammar rules", "Create exactly 2-4 fun characters", "Write exactly 3-5 story pages", "Suggest exactly 2-3 REAL songs", "Write exactly 1-2 realistic dialogues". Vocab enrichment is the only grounded one ("enrich EXACTLY the words provided"). | `enrich-unit/index.ts:495-567` |
| R3 | Frontend always invokes all six enrichment categories on approve, 1.5 s apart. | `hooks/useEnrichment.ts:194-198, 186-188` |
| R4 | Extracted `exercises[]` (instruction/content/type) are display-only in the review pane; `enrich-unit` reads only `extractedText` + `vocabulary` from scans — the page's real exercises never reach generation. | `enrich-unit/index.ts:84-103`; `UploadTextbook.tsx:171-180` |
| R5 | Downstream gates are mere non-empty-array checks (a category exists iff the LLM was ordered to fill it). | `orchestrate-lesson/index.ts:81,178,198,230`; `generate-exercises/index.ts:405-423` |
| R6 | Extraction failures are masked as success client-side ("Text extraction is being updated…" placeholder) — a "missing vocabulary" result may be a *failed* extraction, not an empty page. | `UploadTextbook.tsx:342-356` |
| R7 | There is **no per-page persistence** — pages exist only inside `units.scanned_assets` JSONB; no page table, no classification, no geometry. | schema audit |

**Git history — this is a return, not a novelty:**

- **Jan 11, 2026** — founding design "Professor Architecture 2.0" (`migrated_prompt_history/prompt_2026-01-11*.json`): sequential 5-agent pipeline; Agent 1 "Vision Scanner" maps pages into typed zones (`VISUAL_PUZZLE | COMIC_STRIP | GRAMMAR_TABLE | SONG_SHEET | VOCAB_LIST | READING_PASSAGE | ILLUSTRATION` — still sitting unused at `types/pipeline.ts:3`). Its stated failure reason is verbatim today's complaint: *"tried to do everything (OCR, Design, Planning) in one step, resulting in hallucinations and low-quality data."*
- **Mar 31 (`5f2a07d`)** — the only implementation (client-side Gemini, API key in browser) deleted for security; types orphaned.
- **Apr 7 (`9c86ce4`)** — server-side revival: `extract-page` v0 classified pages (`COMIC|VOCABULARY|GRAMMAR|EXERCISES|READING`) with per-type content. **Abandoned after one day** (`196128b`, Apr 8: `page_type: "MIXED"`, extract everything) because flat prompts were more reliable with that era's free-tier vision models. The dead `scan.data?.page_type` read (`UploadTextbook.tsx:40`) is leftover from this era.
- **Apr 16 (`86b99f8`)** — zone-specific **verbatim** extraction existed briefly (`comic_panels` "EXACT extracted text", `grammar_boxes`) before the May flattening (extract-v2/v3, `7208760` / `eabd541` / `123096b`).
- **Why retrying is reasonable now:** the pipeline runs `qwen3-vl-235b` with fallback chains — a different class of vision model than what defeated classification in April.
- **Salvage list:** zone detection heuristics (prompt-history JSONs), `VisualZone.coordinates_hint` (becomes literal bboxes, §8), the `comic_panels`/`grammar_boxes` verbatim pattern, the already-returned-but-unwired `exercises[]` data (R4).

---

## 3. Principles (locked)

1. **Reproduction fidelity** — all of the page's pedagogical content, only the page's content, nothing invented.
2. **Teacher sovereignty** — the system detects content but never imposes organization. Teacher decisions about page→unit assignment are never overridden; printed unit numbers on pages are metadata, never authority.
3. **Absence = absence** — a category with no source material on the uploaded pages simply does not exist in the unit.
4. **No quotas** — any hard number in an extraction/enrichment prompt is a bug.
5. **Baskets, not pools-with-limits** — extraction drops any amount of any present structure; consumers pick from what is there.

---

## 4. Target architecture (locked)

```
upload (photo / PDF page)
   │
   ▼
[0] intake: deskew / perspective correction attempt (flag failure → retake prompt)
   │
   ▼
[1] STRUCTURE INVENTORY (vision call)
    "Which structures are present on this page, and where?"
    → list of structures + bounding boxes (+ per-bubble / per-label boxes)
    NO page-level typing: a page is a bag of structures (mixed pages are the norm)
   │
   ▼
[2] PER-STRUCTURE VERBATIM EXTRACTION (vision call(s))
    each detected structure extracted with its own schema (§7)
    dialogues/lyrics/grammar-box text transcribed word-for-word
   │
   ▼
[3] VERIFICATION PASS (deterministic, cheap — structural checks only)
    required fields per structure present; boxes valid (non-overlapping, in-page);
    confidence signals flagged; unsuitable crops flagged; NO second vision opinion
   │
   ▼
[4] TEACHER OCR REVIEW  (new step — ✕ remove / ➕ add / ✎ adjust crop)
    hosted in the extraction review pane; per-item; low-confidence items highlighted
   │  (teacher confirms the batch)
   ▼
[5] BASKETS (per-type, set-labeled, additive across the unit's pages, no quotas)
   │
   ▼
[6] GROUNDED ENRICHMENT — runs ONLY after batch confirm, ONLY for non-empty baskets
    (per-word IPA/L1/audio/images; comprehension questions for actual stories; etc.)
   │
   ▼
[7] exercise generation picks from baskets (deterministic, unchanged for now)
```

Key deltas vs today: stage 1 replaces nothing-asks-what's-there (R1); stage 2's verbatim per-structure schemas replace category-generation prompts (R2); basket-driven enrichment replaces the fixed six-category loop (R3); printed activities become structured data feeding future mechanics (R4); the fake-success fallback is removed (R6 — errors surface honestly).

---

## 5. Decision log (all rounds, 2026-08-26)

| Topic | Decision |
|---|---|
| Pipeline shape | Two-stage (structure inventory → per-structure extraction) + verification pass. |
| Verification | Structural checks only (presence/shape/box validity + confidence flags). No second vision opinion (keeps cost flat). |
| Page typing | **None.** Pages are bags of detected structures; the book's pedagogical rhythm is deliberately not modeled (it only mattered for auto-split suggestions, which are optional). |
| Teacher review | Two points: new lightweight post-OCR review (✕ remove / ➕ add, plus ✎ crop handles) **and** the existing AssetWorkshop enrichment review, unchanged. |
| Enrichment trigger | Only after the teacher confirms the reviewed batch — no per-word spending while pages are still being added. |
| Baskets | Per-type, set-labeled, additive; dedupe by verbatim text; prior ✕/➕ decisions preserved on unaffected items when pages are added later. |
| Partial units | Adapt to baskets (vocab + song but no grammar → no grammar games). Nothing invented. |
| Grammar | Two tiers: **box = mandatory verbatim**; structure obvious from the page's own exercises/dialogues = **optional**, teacher can remove/keep (badge: BOX vs INFERRED). |
| Dialogues | Verbatim transcription of book text, always. |
| Media slot | Exactly **1 topic-matched song + 1 video suggestion** (YouTube), teacher-removable. |
| Book's own song | A **separate content item** (title + lyrics verbatim), teacher-removable independently of the suggestion. **Future direction (marked, not priority):** AI audio generation from the lyrics via external services/MCP once not difficult. |
| L1 | Per-teacher (or class) native-language setting drives translations/L1 audio/instructions; extraction stays language-agnostic. First value: zh-CN (current behavior). |
| Non-unit pages (welcome, class rules, indexes) | Recorded on the book (a "class setup" area — the class-rules chant stays usable); never feed units or pools. |
| Quiet pages within units (opener/mission, review, exam prep, consolidation) | **Recorded, not drilled**: mission → unit narrative; "I can…" → objectives; exam formats → metadata; consolidation dialogue bubbles → dialogues. Future: material for LiveBoard presentation boards. |
| PDF uploads | Auto-split proposal (unit-opener detection) with teacher confirmation by default; **manual assignment mode always available**; both stay permanent. |
| Page→unit authority | Printed unit numbers on pages are metadata only. A page saying "Unit 5" added to the system's "Unit 2" is recorded, never blocked/warned beyond a neutral note. Books without clean unit structures fully supported. |
| Old units (~87) | Rebuilt from stored page images (`materials` bucket) via a per-unit rebuild action + bulk backfill; per-unit dialog chooses **fresh rebuild (old manifest archived)** vs **preserve matched edits**. |
| AI generation of absent categories | Kept as an **explicit, clearly-labeled teacher action** ("AI-added, not from the book"). Never automatic. |
| Image default | Book crop is the default illustration **when a suitable crop exists**; AI generation is always available alongside; verification flags unsuitable crops (too small/blurry/badly framed) and suggests AI instead — teacher decides per item. |
| Image fidelity tiers | Vocab imagery: normal prompting (a word like "dog" doesn't need the book's exact dog). Characters: **exhaustive visual descriptions** extracted at scan time (appearance/features/clothing/colors/species/age/art style) so later generation reproduces *that* character with maximum fidelity; character-appearance crops pair with descriptions as references. |
| Image pools | All six reserved from day one (§8). |
| Unit titles | Default to the opener's printed title when present; teacher renames anytime. |
| Vocab items | Multi-word lexical items are first-class ("have a shower", "hide and seek"). |
| Extractor versioning | Every extracted page/basket records an extractor version stamp, so future prompt improvements can selectively re-run old extractions. |

---

## 6. Baskets (the pool model)

| Basket | Contents | Notes |
|---|---|---|
| `vocabulary` | items grouped in named sets (set label from the page's lesson header; derived+editable when absent) | no size cap; multi-word items; per-item enrichment: IPA, L1 translation, audio, image (crop default / AI optional), distractors |
| `grammar` | rules with tier (BOX / INFERRED) | BOX: rule text verbatim + page ref. INFERRED: structure + evidence, teacher-removable. Enrichment: pattern template, transformation pairs, error examples — derived from the actual rule |
| `dialogues` | verbatim lines with speaker + panel/order context | includes comic speech bubbles and consolidation dialogue bubbles |
| `story` | verbatim passages/panels (reading stories, comics) with panel order | comprehension questions generated only from the actual text |
| `media` | (a) 1 topic-matched song + 1 video suggestion; (b) the book's own songs (lyrics verbatim) as separate items | §5 media decisions |
| `objectives` | "I can…" statements verbatim from review pages | the book's own mastery definition; future gate material |
| `narrative` | mission text, opener art refs | intro-splash material; never drilled |
| `exam_formats` | exam-prep task descriptions (A1 Movers etc.) | metadata for a future exam-alignment workstream |
| `activities` | every printed activity as structured data `{instruction verbatim, verb, content, source zone}` | §9: the instruction-verb → mechanic backlog |
| `clil` | Our World passages + their vocab sets (which also enter `vocabulary` with a CLIL tag) | today's system misses CLIL words entirely |
| image pools | §8 | geometry-backed |

---

## 7. Per-structure extraction contracts (stage-2 schemas)

1. **Vocabulary set** — every labelled word-picture pair: word (exact spelling, multi-word allowed), bbox of the picture (→ word-image crop), set label, lesson header if present.
2. **Comic** — panel order; per panel: bbox (→ panel crop), narration, speech bubbles (per-bubble bbox + speaker + verbatim text). Per-bubble boxes enable the mask-and-reveal mechanic.
3. **Grammar box** — rule text verbatim, example sentences verbatim, bbox (→ snapshot crop), tier = BOX.
4. **Song sheet** — title verbatim, full lyrics verbatim, per-line/numbered action illustrations (bboxes → karaoke cards).
5. **Reading passage** — title, passage text verbatim, scene illustrations (bboxes), comprehension activities as structured data.
6. **Printed activity** — instruction verbatim, verb (listen/point/stick/count/match/order/choose/describe/say/colour/find/ask…), content, source bbox. Extracted **regardless of whether a mechanic exists** (§9).
7. **Review statements** — "I can…" lines verbatim.
8. **Mission/opener** — mission text, printed unit number/title (metadata only), opener art bbox.
9. **Character appearance** — character identity (name if present), exhaustive visual description (appearance, features, clothing, colors, species, age, art style), bbox (→ appearance crop). This is the extraction side of the cast workstream — generation/persona work stays parked.
10. **CLIL passage** — as reading passage + CLIL tag; its word set → vocabulary basket.

---

## 8. Image pools & the geometry layer

Stage 1 returns **bounding boxes** for every detected structure (and sub-elements: bubbles, labels, boxes, strips, scenes). A deterministic server-side cropper writes crops to Storage as `assets` rows with `kind: 'book_extract'` and metadata linking `unit → page asset → structure → bbox` (full traceability).

| Pool | Cropped from | Consumers (later, at their own pace) |
|---|---|---|
| Panels | comic panels, reading scene illustrations | LiveBoard slide-the-panels storytelling; panel ordering; what-happens-next; bubble-mask reveal; dubbing |
| Word-images | labelled vocab pictures | flashcards with book art; tap-the-picture / image-select; drag-label sticker game |
| Snapshots | grammar boxes, song strips, opener mission art | "show the book's own grammar box" LiveBoard moment; karaoke line cards; intro splash |
| Scenes | exam describe-the-picture scenes, CLIL scenes | describe-the-picture speaking (scored by existing `evaluate-pronunciation`); CLIL display |
| Character appearances | recurring characters wherever they appear | cast workstream references; who-said-it portraits; avatars |
| Stickers/cards | photographed sticker sheets / cut-out pages | digital stickers for drag-and-place |

**Caveats handled in-contract:** photo quality is load-bearing — intake attempts deskew/perspective correction and flags failures with a retake prompt; verification flags low-resolution crops (LiveBoard zoom needs decent res) and unsuitable crops (AI suggested instead); teacher review includes ✎ crop-handle editing.

---

## 9. Reserved fuel — future exercise mechanics (NOT built now; extraction must not discard the inputs)

The book's activities are built from standardized instruction verbs; each verb maps to a candidate digital mechanic (the founding design's zone→engine routing, applied to activities):

| Book material | Future mechanic |
|---|---|
| Panel/event order | Order-the-story (shuffle & resequence) |
| Song lyrics with target words | Karaoke gap-fill (blanks = unit vocab, TTS playback) |
| Listen-and-point activities | Tap-the-picture (audio → tap the image) |
| Sticker activities | Drag-and-place labels on image zones |
| Ask-and-answer substitution drills (grammar box Q/A patterns) | Q&A builder conversation drill |
| Describe-the-picture (exam prep, There is/are) | Speaking exercise via `evaluate-pronunciation` |
| Life Skills choose-what-happens-next | Branching decision game (social-emotional differentiator) |
| CLIL passages | Generalized reading comprehension |
| "I can…" statements | Mastery checkpoint / unit-complete gate |
| Chants (welcome pages) | Listen-and-repeat / chant-along |

Unknown instruction verbs accumulate as a data-driven backlog — the book itself becomes the roadmap for future exercise types. The **comics slide-the-panels LiveBoard game** gets its own dedicated brainstorm later.

---

## 10. Parked workstreams

1. **Exercise system mechanics** (§9) — untouched by design; this doc only guarantees their future inputs are captured.
2. **Comics LiveBoard game details** — later brainstorm.
3. **Cast/personage generation** — extraction-side descriptions in scope now (§7.9); persona/voice/generation work parked.
4. **AI audio generation for book songs** — marked future direction.
5. **Quiet pages as LiveBoard presentation boards** — future.

---

## 11. Open items (unresolved, non-blocking)

- Multi-book edge cases (mixing pages from different books into one unit) — expected to "just work" under teacher sovereignty; verify during implementation.
- Exact character-description schema fields — draft during implementation, validate against the fixture.
- Where the new pipeline lives (new edge function(s) vs in-place rewrite of `extract-page`) — implementation-planning decision; transition must keep `extract-page` alive until parity.
- Adjacent fixes to fold in: remove the fake-success extraction fallback (`UploadTextbook.tsx:342-356`); reconsider manifest-nulling on approve (`:269`); parallelize sequential page processing (`:435-437`); clean up the dead `page_type` read (`:40`) and the dormant `VisualZoneType` block (`types/pipeline.ts:3`) — the latter becomes the seed of the new structure contract.

---

## Appendix A — Power Up 2 ground-truth fixture (regression reference)

Sample: 26 image-only PDF pages, printed pages 4–29 (physical PDF order is jumbled vs printed numbers — publisher sample; two page-number reads fuzzy, marked ~). This map defines what a correct extraction must return per page.

**Welcome (4–5):** p4 "Meet the family" — family labels (Grandpa, Jim, Jenny, Dad, Mum) + listen-and-point. p5 "Class Rules" — chant lyrics, 10 colour words (red, yellow, blue, green, pink, orange, purple, brown, black, white), name-card craft.

**Unit 1 "A day on the farm" (6–17):**

| Printed | Structures present |
|---|---|
| 6 | Opener/mission (daily-routine chart project); no drillable structures |
| 7 | VOCAB set "Countryside" (11): mountain, lake, river, forest, ground, grass, leaves, leaf, field, tractor, rock + listen-point/stick/say activities |
| 8 | COMIC 6 panels; present continuous in context |
| 9 | GRAMMAR BOX (LP1): "Are you reading a book? No, I'm not. I'm doing my homework.…" |
| 10 | SONG "Wake up, get up" + routines set (wake up, get up, have a shower, towel, get dressed, toothpaste, toothbrush…) |
| 11 | GRAMMAR BOX (LP2): "What time…?" + routines set (get up, go to school, have lunch, go home, do your homework, have a shower, go to bed) + poster project |
| 12 | READING story + prediction + comprehension MCQ |
| 13 | Life Skills branching scenario |
| 14 | CLIL "Our World": weather set (summer, winter, sunny, cloudy, rainy, windy, snowy) |
| 15 | Review: "I can…" statements + mixed exercises |
| 16 | Exam prep: A1 Movers Speaking Pt 1 (describe picture, There is/are; 5 words) |
| 17 | Consolidation: project completion, closing text |

**Unit 2 "My week" (18–29):** opener/mission + "watch the video" (18–19, likely spread) · free-time/sports set (ping pong, badminton, football, basketball, run away, tell jokes, hide and seek…) (19) · COMIC drilling "How often…?" adverbs (20) · GRAMMAR BOX: "How often do you clean your teeth? I always clean them after breakfast…" + always/often/sometimes/never (21) · SONG + free-time set (listen to music, write an email, go skating, read a comic, go shopping, watch films…) (22) · GRAMMAR BOX: "What must I do? You mustn't wear your skates in the house. You must put them in the cupboard." (23) · READING "The gecko's big day" (24) · Life Skills (25) · CLIL (26) · Review (27, ~) · A1 Movers Reading & Writing prep (28) · mission-in-action consolidation with dialogue bubbles (29).

**Load-bearing facts:** Unit 1 carries ~35–40 target words in four named sets (vs today's 6–8 enriched cap); exactly 2 explicit grammar boxes per unit; 1 comic + 1 reading story + 1 song per unit; every vocab lesson pairs its set with 2–3 standardized activities; CLIL and review pages carry vocab/objectives today's system discards.

## Appendix B — Suggested phasing (non-binding, for the later implementation plan)

- **P1 — Extraction contract:** structure-inventory + per-structure schemas + verification + version stamps; honest error surfacing (fix R6). New edge function(s); `extract-page` kept alive during transition.
- **P2 — Baskets & review:** basket persistence + post-OCR ✕/➕ review UI + basket-driven enrichment (replaces six-category loop) + L1 setting.
- **P3 — Geometry layer:** bboxes + cropper + image pools + ✎ crop editing + deskew intake.
- **P4 — Migration:** rebuild-from-pages action (fresh vs preserve dialog) + bulk backfill.
- **P5 — Later brainstorms:** exercise mechanics (§9), comics LiveBoard game, cast generation, AI song audio.
