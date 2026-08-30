# 12 — Comics Workstream: OCR Audit, Panel Pool, and the First Comics LiveBoard Game

> **Status:** Panel pool implemented + deployed 2026-08-30. Game design APPROVED
> by the owner 2026-08-30 (decisions below) and **built + deployed same day** —
> see §4.5 as-built. Scan-v8 comic fixes deployed to scan-page 2026-08-30
> (re-scans run when the owner next uploads, per their test plan — the existing
> 26-page unit is deliberately NOT re-enriched/re-scanned).
> **Locked principles carried from doc 10:** verbatim fidelity, book panels (never AI
> art), teacher sovereignty, absence = absence, no quotas.
> **Scope guard:** per the parallel-session agreement, only the *comic* blocks of
> `_shared/prompts/bookScan.ts` / `_shared/bookScan.ts` were touched.

---

## 1. Comic OCR audit (data half — no AI credits spent)

Audited the owner's 26-page Power Up 2 sample across its scanned units
(`25471a44` scan-v5, `d3ad2ac7`/`5e269755` scan-v4 — identical book content) by
comparing `page_structures` (structure_type `comic`) against the actual page images
in `book_pages.public_url`.

### 1.1 What the book actually has

| Printed page | Detected | Verdict |
|---|---|---|
| 5 (physical 2) | comic, 6 panels | **Real comic** ("Meet the family" photo-album story) |
| 8 (physical 5) | comic, 6 panels | **Real comic** (farm visit, present continuous — matches doc 10 Appendix A) |
| 15 (physical 12) | **two** comics, 1 panel each | **False positives** — both are empty husks (1 panel, no bbox, no bubbles, no narration) on the Review page |
| 20 (physical 17) | comic, 6 panels | **Real comic** (Fred the school fish, "How often…?") |

Doc 10's appendix predicted 2 comics (p8, p20); the real count on this sample is **3
real comics** (welcome-spread comic on p5 included) + 2 empty false positives.

### 1.2 Quality per contract field (doc 10 §7.2)

| Contract field | Quality | Evidence |
|---|---|---|
| Panel order (`order_index`) | ✅ correct | All 3 real comics: 0–5 in true reading order (left column top→bottom, then right) |
| Panel count | ✅ correct | 6/6/6 panels, none missed, none invented |
| Bubble text (verbatim) | 🟡 near-verbatim | p5: every bubble matches the book word-for-word (13/13 compared). p20: minor jitter — "Fred" vs "Freddy" in one bubble, "It …" truncation where the book prints "It's a fish!", "does the fish" vs "does this fish" |
| Narration vs bubbles | 🟡 misrouted | p20's yellow narration box ("Jim and Jenny have got a new pet…") landed in `bubbles` instead of the per-panel `narration` field (which is empty everywhere) |
| Speaker attribution | ❌ systematically wrong | p5: bubbles are labeled with the **addressee**, not the speaker ("Look, Harry…" → speaker "Harry", actually Rocky speaking; "Oh, sorry! I like eating paper" → "Goat", actually Gracie). 8/13 wrong on p5; p8/p20 left speaker `null` |
| Panel bboxes | ❌ mostly missing | 5 of 20 panels have bboxes (scan-v5 geometry loss — the known v5/v6 regression). Bubble bboxes: ~⅓ present |
| Empty-comic suppression | ❌ | The two p15 husks were stored as confirmed structures |

### 1.3 Consequences for the pool + game (what v1 must not rely on)

1. **Speaker labels cannot be displayed to children in v1.** The verbatim bubble
   TEXT is trustworthy; the speaker NAME is not. The game reveals narration + bubble
   text only. Speaker repair is a scan-prompt fix (§5) + re-scan.
2. **Panel crops need a re-scan for full geometry.** The pool crops the 5 panels
   that have bboxes today and heals automatically after re-scan (crop dedupe keys
   include the bbox, so improved bboxes produce fresh crops; old ones just stop
   being referenced).
3. **Contentless comics must be skipped** by pool + game + flow gate (a comic with
   < 2 panels carrying any text/bbox is not playable material).
4. The two p15 husks can be ✕-removed by the teacher in the existing review UI
   today; the scan fix (§5) stops new ones.

---

## 2. Panel pool (work order 2 — implemented 2026-08-30, no AI involved)

**Where:** `enrich-unit` `buildBasketStory()` — the comics loop, mirroring the
reading-passage scene-crop path exactly:

- For each basket comic, one `cropBookImages()` batch call (single page fetch +
  decode per comic page) under the SAME 45s crop deadline as passages — text never
  blocks on art.
- Each panel with a bbox → crop with `pool: 'panel'`, `structureId` = the comic
  structure id. `cropBookImages` already writes the full provenance chain
  (unit → page → structure → bbox → pool) into `assets.metadata`, the
  `unit_media` role link, and the SHA-256 dedupe cache.
- The panel's story page (comic panels already become `story_pages` rows at
  enrichment) now carries `image_asset_id` + `image_url_book_crop` — the same
  fields the passage path uses — so every existing story consumer (Story Stage,
  Story Sequencing cards, AssetWorkshop) picks the book's own panel art up with
  zero further changes.
- Panels without bboxes land text-only (pre-re-scan state) — nothing fails.

**Review UI:** the "From the book" panel's Comics section now shows real panel
thumbnails (queried from `assets` by `metadata->>pool = 'panel'`, grouped by
structure, ordered by bbox position) instead of only "N panels" + a text excerpt.

**Backfill for already-enriched units:** re-run the *story* enrichment category —
crop calls are deterministic and dedupe-cached (passage scene crops re-hit the
cache byte-identically), and comprehension-question AI calls fail soft while
credits are down (questions are optional derived content; the verbatim pages +
crops always land). No separate script needed at this scale.

---

## 3. Game brainstorm — approaches considered

**Concept (owner, locked):** "slide-the-panels storytelling — panels shuffled,
class reorders them by tapping/drags (live, not per-student), narration + bubbles
revealed per panel as it's placed; verbatim text only."

Three candidate shapes:

### A. Free-build + Check (recommended) — StorySequencing's proven loop, book-panel edition
The board shows numbered slots + a shuffled tray of the book's panel crops. The
class (picked student at the board / teacher tapping) places panels tap-to-place;
**every placement immediately reveals that panel's narration + verbatim bubble
text beneath it** — the story literally assembles as the class reorders it.
"Check" grades the arrangement with LCS partial credit (≥ 0.5 passes), returns
misplaced panels to the tray on a miss.

- ✅ Reuses the battle-tested `BoardStorySequencing` interaction + scoring skeleton
  (slots/tray, `computeLCSPartialCredit`, seeded per-turn shuffle, hint = highlight
  one misplaced panel, remote controls) — lowest risk, fastest to ship, matches
  every `LIVE_GAME_LIFECYCLE.md` must-do by construction.
- ✅ "Reveal as placed" works naturally: text is per-panel, shown where the panel
  sits, right or wrong — storytelling first, order-check second.
- ✅ 6 panels fit the projector grid (StorySequencing already lays out 6 slots).
- ⚠️ Distinguishing it from Story Sequencing on the slide list needs a clear title
  ("Comic: rebuild the story").

### B. Sequential what-happens-next (per-slot multiple choice)
Panels 1…k−1 pre-placed; the class picks panel k from the tray (distractors =
later panels). Each pick is instantly right/wrong.

- ✅ Tighter per-turn scoring rhythm; natural difficulty ramp.
- ❌ Loses the "class reorders the whole story" feel the owner described; the
  reordering challenge collapses into n−1 MCQs. This is doc 10 §9's
  *what-happens-next* mechanic — better as the FOLLOW-UP game (work order 4),
  which is exactly how the work order lists it.

### C. Bubble-mask reveal first, order second
Panels placed correctly unlock a masked-bubble tap game on each panel (per-bubble
bboxes → tap to uncover verbatim text).

- ✅ Most theatrical use of the comic contract's per-bubble geometry.
- ❌ Depends on bubble bboxes + reliable speakers, which the audit showed we don't
  have yet (§1.2). Ship after the scan-v8 re-scan. Also doc 10 §8 lists it as its
  own mechanic — follow-up #2.

**Recommendation: A now; B and C as the queued follow-ups** (both already reserved
in doc 10 §8/§9 — no design work lost).

---

## 4. Game design (for approval) — `COMIC_PANELS` ("Rebuild the Story")

### 4.1 Content + gating
- New flow type `COMIC_PANELS` in `_shared/flowTypes.ts` `SUPPORTED_FLOW_TYPES`.
- `orchestrate-lesson` deterministic transformer: when the unit has ≥ 1 playable
  comic (confirmed/edited `page_structures` with ≥ 3 panels that carry text or a
  bbox — skips the p15-style husks), push one `COMIC_PANELS` step right after the
  story strand (`STORY_STAGE`/`STORY_QUEST`), phase `PRACTICE`, **not** pool-driven
  (finite book material, frozen into the block data like StorySequencing round 1).
  Absence of comics = no step (absence = absence).
- Slide data frozen by the transformer from fresh reads (it already re-reads
  `story_pages`/`dialogue_lines`): the unit's **richest** comic (most panels with
  crops; ties → latest upload_order) as
  `{ title, panels: [{ order, image_url (crop), image_asset_id, page_id, structure_id, narration, texts[] }] }`.
  Multi-comic rotation on `NEXT_ROUND` is a v2 nicety — v1 plays the richest one,
  `RESET_GAME` re-deals a new shuffle.

### 4.2 Play loop (all four `LIVE_GAME_LIFECYCLE.md` must-dos)
- **Entry (choral/practice):** slots + shuffled tray, no scoring.
- **NEW_TURN** (keyed on `currentTurnId`): fresh seeded shuffle
  (`makeRng(seedBase, turnId, 'comic')` — per-turn variety rule), mistakes/awarded
  refs reset, revealed-text state cleared.
- **Place:** tap tray panel → fills first empty slot → its narration + verbatim
  bubble texts (NO speaker names — audit §1.2) appear under it. Tap a placed panel
  → back to tray (its text goes with it).
- **Check (`CHECK_ANSWER` or the board button):** LCS over placed ids vs
  `order_index`. ≥ 0.5 → success (confetti, `"[Name] rebuilt the story!"`), score
  `scoreForAttempt(mistakesRef, difficulty 2, ratio, streak)` via `addPoints`
  gated on `quickWheelWinner`, `awardedRef` latch, attempt recorded with
  exerciseType `comic_sequencing_attempt` against the unit's real `story`
  objective (StorySequencing B1 pattern). < 0.5 → `mistakesRef++`, −1, one
  misplaced panel pulses red, misplaced panels return to the tray after 1.2s.
- **Teacher controls:** `CHECK_ANSWER`, `REVEAL_HINT` (highlight one misplaced
  panel), `MARK_CORRECT`, `SKIP_ROUND`, `RESET_GAME` (new deal, all refs reset).
  Exported `ContextualControlsSpec` mirrors `STORY_SEQUENCING_CONTROLS`.
- **Missing crops:** 📖 numbered placeholder + text (game stays playable pre
  re-scan; crops appear after re-scan + re-enrich + re-orchestrate).

### 4.3 Wiring checklist (post-approval)
1. `apps/board/templates/BoardComicPanels.tsx` (skeleton = BoardStorySequencing).
2. `boardMap.tsx` `BOARD_MAP` entry (auto-registers both render surfaces).
3. `flowTypes.ts` type + transformer push + `PHASE_FOR_TYPE` entry.
4. `ContextualControls.tsx`/`TeacherRemote.tsx` button set for the type.
5. Two-tab verification per `LIVE_GAME_LIFECYCLE.md` §7 step 7, on the owner's
   26-page unit.

### 4.4 Owner decisions (locked 2026-08-30)

1. **Comic selection lives in the unit plan composer** (owner's own words:
   "we should be able to select in the unit plans, the different comic games,
   in the option we should be able to select the different comics present in
   the unit"). As built: the PlanComposer library shows ONE selectable item
   PER comic (each labeled with panel count + first-bubble excerpt), tracked
   per-comic in the "In plan" badge. The server-side flow (orchestrate-lesson)
   defaults to ONE step playing the richest comic — injected post-normalization
   so BOTH composer paths (AI flow + deterministic transformer) get it.
2. **Tray = art only** — narration + verbatim text reveal on placement.
3. **Speaker names hidden** until a scan-v8 re-scan proves attribution.
4. **scan-v8 deployed to scan-page 2026-08-30** so the owner's next upload
   exercises the comic fixes (they test on the next upload; the existing
   26-page unit is not re-processed).

### 4.5 As built (2026-08-30)

| Piece | Where |
|---|---|
| Game template | `apps/board/templates/BoardComicPanels.tsx` (slots + art-only tray, reveal-on-place, LCS check, 4 must-dos, `COMIC_PANELS_CONTROLS` spec) |
| Registration | `apps/board/templates/boardMap.tsx` `BOARD_MAP` (both render surfaces) |
| Flow type | `SUPPORTED_FLOW_TYPES` in `supabase/functions/_shared/flowTypes.ts` |
| Flow injection | `orchestrate-lesson` — fresh read of confirmed comic structures + panel-crop assets (matched by the same structure+bbox dedupe key enrich-unit uses), injects one `COMIC_PANELS` step (richest comic) after the story strand when the flow lacks one; absence = absence (≥3 panels required, husks skipped) |
| Remote controls | `ContextualControls.tsx` + `TeacherRemote.tsx` — same button group as Story Sequencing (Check / Hint / Mark Correct / Skip / Next / End / Reset) |
| Composer selection | `PlanComposer.tsx` — per-comic library items from `get_unit_baskets` + panel assets; `buildBlockData('COMIC_PANELS', ec, comic)` freezes that comic's cards |
| Tests | `test/BoardComicPanels.test.tsx` — 7 tests (art-only tray, reveal, choral no-score, picked-student scoring + latch, miss penalty + return-to-tray, RESET re-deal, empty state) |

Verification on the owner's NEXT upload test (their plan): scan-v8 comic
extraction → confirm → story enrichment crops panels (pool 'panel') →
FromTheBookPanel thumbnails → PlanComposer comic items → live session with the
class reordering the book's panels.

---

## 5. Scan remediation (comic blocks only; re-scan AFTER credits return)

`scan-v8` comic-block changes (implemented on disk, **not deployed** — re-scans
wait for credits and the parallel session's rebuild-unit work):

1. **Speaker discipline:** speaker is the character WHO SPEAKS the bubble — infer
   from the bubble tail/pointer and conversation logic (a greeting like "Look,
   Harry" means Harry is the ADDRESSEE). If not visually certain, emit `null` —
   never guess.
2. **Narration routing:** rectangular non-speech text boxes (narration/caption
   boxes) go to the panel's `narration` field, never to `bubbles`.
3. **Every panel MUST carry a bbox** (best estimate when unsure) — mirrors the
   scene-illustration rule that fixed story crops; without geometry the panel
   cannot show the book's artwork.
4. **No empty comics:** if a detected comic yields no panels with any content,
   return an empty `panels` array (the review UI and gates already treat that as
   absent).
5. **Name consistency:** use printed/known character names when identifiable
   (Gracie, Rocky, Harry, Shelly, Cameron — not "Chicken"/"Goat").

After credits return: deploy `scan-page`, re-scan the owner's unit (or
"Rebuild from pages"), re-run story enrichment (crops heal via §2), re-run
orchestrate, verify end-to-end.

---

## 6. Panel crop precision (owner report 2026-08-31: "cut in the middle of the image") — FIXED

Diagnosed on the owner's scan-v8 test unit ("Countryside"): the scan's panel
boxes have accurate x/y/width but **heights bleed into the next row** (e.g.
panel 0's box covered rows 1–2, slicing mid-artwork), and **4 of 6 panels had
no bbox at all**. The cropper took those boxes as-is → crops cut through
panels.

**Fix — deterministic gutter refinement, no AI** (`_shared/panelGeometry.ts`,
pure + unit-tested; integrated into `bookCrop.cropBookImages`):

1. The page is decoded once per comic (existing batch crop) and downsampled
   into a binary ink grid (adaptive background threshold from the page frame).
2. Every scan box is clamped to the comic's structure bbox, then each edge
   **snaps to the whitespace gutter bands** around its panel: a dirty edge
   (mid-artwork) contracts to the first gutter toward the box center; a clean
   edge holds at its gutter's middle (or hugs the content side of a wide band).
   A span guard stops any edge from collapsing the box below 40% of its span.
3. A **same-column row-height prior** collapses boxes spanning 2+ rows to one
   row (re-anchored at top + median height, locally snapped).
4. **Missing panels are seeded**: mirrored across the detected center gutter
   from their same-row sibling, or stacked below the last known row (split at
   the center gutter for 2-column comics) — then snapped like any other box.
5. Refined crops write `metadata.panel_index` + `refined` + `bbox_scan`, and
   their dedupe key carries a refine version (`g2v1`) so they never collide
   with pre-refinement crops. Consumers (orchestrate-lesson, PlanComposer,
   FromTheBookPanel) match crops by `structure_id + panel_index`, newest wins.

**Verified against the owner's actual page pixels** (offline harness):
from 2 imprecise boxes → all 6 panels land within ~1–2% of their true cells
(rows 0.146–0.374 / 0.372–0.605 / 0.615–0.877; columns 0.06–0.50 /
0.50–0.94 vs measured truth 0.15–0.37 / 0.37–0.60 / 0.60–0.86 and
0.06–0.50 / 0.51–0.95). Tests: `test/panelGeometry.test.ts` (7).

**To heal an existing unit:** re-run the Story enrichment category (crops
re-generate under the new refine keys; comprehension AI stays soft-failed
while credits are down). Future uploads get precision automatically.

---

## 7. Verification (owner's 26-page unit)

- [x] Audit table above (§1) — panel order/count/text verified against page images
- [ ] Panels cropped with provenance: `assets` rows `kind='book_extract'`,
      `metadata.pool='panel'`, linked `unit_media.role='panel'`, story pages carry
      `image_asset_id` (5 bbox-having panels immediately; all after re-scan)
- [ ] FromTheBookPanel comics section shows the book's own panel thumbnails
- [ ] (post game approval + build) comics game playable end-to-end in a live
      session: class reorders panels, book artwork on the board, scoring loop
      respected, verbatim text only
