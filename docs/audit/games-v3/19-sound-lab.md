# Sound Lab — v3 Quality Audit (`SOUND_LAB`)

> **Status:** `pending` — §2 owner comments confirmed 2026-09-09; §0 identity stub; §1/§3 code audit pending (batch phase).
> **Screenshots:** pending (batch phase).

## §0 Identity (stub — completed at code-audit time)

- **Flow type:** `SOUND_LAB`
- **Component:** `apps/board/templates/BoardSoundLab.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** Skip Phase / Correct / Redo / End (custom)
- **Data sources:** useEscalatingPool — recognition / discrimination / production (rungs 2–5)
- **Mode:** picked student

## §1 How the game works today

*(pending — ZCode batch code audit; the shared prelude will be embedded here when the file reaches `file-ready`.)*

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> I have the same comment about the UI as the previous detective game (vertical-style layout wasting space on a horizontal screen). / Another comment: this is the one where we need to click on "listen" and pick the right image. I think it would be nice if, when the image appears, we automatically listen to the sound one time. And if the kid wants to listen a second time, we can keep the listen button for that — but you lose one point if you use it for a second time, or even a third time, losing one point each time.

**Clarified with the owner (2026-09-09):**
- Same horizontal-space redesign as Word Detective.
- Audio AUTO-PLAYS once when the question appears (keep the manual listen button).
- Each replay after the free first play costs the CURRENT picked student −1 point (choral mode: track the count only).

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
