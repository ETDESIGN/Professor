# Word Detective — v3 Quality Audit (`WORD_DETECTIVE`)

> **Status:** `pending` — §2 owner comments confirmed 2026-09-09; §0 identity stub; §1/§3 code audit pending (batch phase).
> **Screenshots:** pending (batch phase).

## §0 Identity (stub — completed at code-audit time)

- **Flow type:** `WORD_DETECTIVE`
- **Component:** `apps/board/templates/BoardWordDetective.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** Skip / Hint / Correct / Redo / End (custom)
- **Data sources:** useEscalatingPool — vocab-in-context items (rungs 1–3)
- **Mode:** picked student

## §1 How the game works today

*(pending — ZCode batch code audit; the shared prelude will be embedded here when the file reaches `file-ready`.)*

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> We have a screen where the 4 images are set up in a square. This UI seems more adequate for a vertical screen, not horizontal. So we need to rethink the UI a bit to have better use of the space.

**Clarified with the owner (2026-09-09):**
- Horizontal-arrangement redesign (4-across row vs 2×2 + side prompt) = design decides via Co-Work/Stitch; constraint = images big, horizontal space used well.

> Basically we have four images, and we have a word written in English and in Chinese, as well as the sound (audio). First, the Chinese word shouldn't be there. The English word can be there, and the sound icon can be there, but definitely not the Chinese — otherwise it's too easy for the kids.

**Clarified with the owner (2026-09-09):**
- Remove the Chinese from the challenge — NOT just from the board: remove it EVERYWHERE during challenges, including the teacher's commander screen (owner decision 2026-09-09). English word + audio icon stay. (Note: the global rule was later softened to "avoid when possible" — this per-game decision stands for the answer-giving Chinese word; instructions elsewhere may still use Chinese when needed.)

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
