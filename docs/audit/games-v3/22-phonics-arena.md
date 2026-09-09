# Phonics Arena — v3 Quality Audit (`PHONICS_ARENA`)

> **Status:** `pending` — §2 owner comments confirmed 2026-09-09; §0 identity stub; §1/§3 code audit pending (batch phase).
> **Screenshots:** pending (batch phase).

## §0 Identity (stub — completed at code-audit time)

- **Flow type:** `PHONICS_ARENA`
- **Component:** `apps/board/templates/BoardPhonicsArena.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** Next / Correct / Redo / End (custom)
- **Data sources:** useEscalatingPool — phonics discrimination/identify/produce
- **Mode:** picked student

## §1 How the game works today

*(pending — ZCode batch code audit; the shared prelude will be embedded here when the file reaches `file-ready`.)*

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> Same as for the previous listening game: every time we need to press the button. We can keep the button (we can press it), but when the screen appears, we should automatically hear the word we should click.

**Clarified with the owner (2026-09-09):**
- Target audio AUTO-PLAYS once when the question appears; the manual replay button stays.
- Replays follow Sound Lab's rule: −1 point each to the current picked student after the free first play.

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
