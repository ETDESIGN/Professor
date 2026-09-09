# Comic — Rebuild the Story — v3 Quality Audit (`COMIC_PANELS`)

> **Status:** `pending` — §2 owner comments confirmed 2026-09-09; §0 identity stub; §1/§3 code audit pending (batch phase).
> **Screenshots:** pending (batch phase).

## §0 Identity (stub — completed at code-audit time)

- **Flow type:** `COMIC_PANELS`
- **Component:** `apps/board/templates/BoardComicPanels.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** ScoredShellControls (Check / Hint / Mark Correct / Skip / Next / End)
- **Data sources:** frozen per-comic panel crops (book art)
- **Mode:** picked/class rebuild

## §1 How the game works today

*(pending — ZCode batch code audit; the shared prelude will be embedded here when the file reaches `file-ready`.)*

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> The game logic is good, but the UI is bad. Right now, we have to put the comic images in the right order. The thing is, the comic images are all rectangular (horizontal/wide), and the boxes where we need to place them are vertical. When we play, we cannot see correctly — I cannot really determine if it's the right one or not, because they don't fit properly; text and image are cut out.

**Clarified with the owner (2026-09-09):**
- ["Rebuild History" = Comic — Rebuild the Story.] Stitch proposes the exact slot layout; HARD CONSTRAINT = wide panels fully readable (text + image), never cropped or squashed.

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
