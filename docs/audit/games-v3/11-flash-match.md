# Flash Match — v3 Quality Audit (`FLASH_MATCH`)

> **Status:** `pending` — §2 owner comments confirmed 2026-09-09; §0 identity stub; §1/§3 code audit pending (batch phase).
> **Screenshots:** pending (batch phase).

## §0 Identity (stub — completed at code-audit time)

- **Flow type:** `FLASH_MATCH`
- **Component:** `apps/board/templates/BoardFlashMatch.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** Skip / Hint / Correct / Next Round / End (custom)
- **Data sources:** useEscalatingPool — IMAGE_SELECT / MEANING_MATCH / AUDIO_L1_SELECT (rungs 1–3)
- **Mode:** picked student

## §1 How the game works today

*(pending — ZCode batch code audit; the shared prelude will be embedded here when the file reaches `file-ready`.)*

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> The first is the UI: some part of the screen UI is invisible, so we cannot see the bottom question. Also, it looks like we have a bunch of images to connect with the vocabulary words, so a better use of the screen space would be better. We need to keep in mind it's a horizontal screen. / Another issue: I have a few images — a fox, a rhino, a frog, a giraffe. But if I click "toucan" and click on the fox, it says "correct". When I click "frog" and click on the rhino, it also says "correct". So there is a big issue there — we need to find out what the issue is (wrong image/word pairs are being accepted as correct).

**Clarified with the owner (2026-09-09):**
- Responsive bug: part of the UI (the bottom question) is INVISIBLE — off-screen/clipped; layout must work on horizontal screens.
- Better use of horizontal space for the image/word matching board.
- Wrong-pair bug CONFIRMED as real validation failure: the board LOCKED the wrong pair as matched (toucan→fox locked as a correct match) — root-cause in the code audit (pairing key or correct-index mapping).

## §3 ZCode code-level findings

*(pending — ZCode batch code audit)*

## §4 ⬜ ChatGPT Co-Work quality audit

> **Co-Work: write your findings ONLY inside this section.** (Full instructions + shared prelude embedded at `file-ready`.)

### 4.a UI & visual design
### 4.b Workflow & user flow (teacher's path: start → turns → end)
### 4.c Pedagogical practice (ESL ages 6–12)
### 4.d Game interaction (mechanic, pacing, fairness, fun)
### 4.e Top-5 prioritized recommendations
### 4.f Design direction for Stitch

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

## §6 ⬜ Stitch output & implementation notes

*(Owner drops the Stitch export into `stitch/<NN>-<game>/`; ZCode records implementation + deploy.)*
