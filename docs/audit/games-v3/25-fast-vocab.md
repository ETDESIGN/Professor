# Fast Vocab — v3 Quality Audit (`FAST_VOCAB`)

> **Status:** `pending` — §2 owner comments confirmed 2026-09-09; §0 identity stub; §1/§3 code audit pending (batch phase).
> **Screenshots:** pending (batch phase).

## §0 Identity (stub — completed at code-audit time)

- **Flow type:** `FAST_VOCAB`
- **Component:** `apps/board/templates/BoardFastVocab.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** Skip / Hint / Correct / Redo / End (custom)
- **Data sources:** useEscalatingPool — shared engine components/games/fastVocab/
- **Mode:** picked student, per-turn pool cursor

## §1 How the game works today

*(pending — ZCode batch code audit; the shared prelude will be embedded here when the file reaches `file-ready`.)*

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> The game is very good in many ways, but we have an issue. On one screen, we need to connect the right card with the right word. For example, if the Quick Picker is set up on one question, the kid will connect the first word with the first card, and then the system will automatically reset the three cards to another set. When the next student comes, it can reset or go to the next card — sometimes it's only one card. Anyway, this interaction with the automatic one-question/three-question rotation system has some issues, so we need to audit it properly to fix.

**Clarified with the owner (2026-09-09):**
- ["Quick Picker" = Fast Vocab, confirmed by owner.]
- Card set must stay STABLE during one student's turn; when their questions are done the board auto-readies (fresh deal) for the next wheel pick — no confusing mid-turn resets.
- The exact composition of a 1-question turn (match wave vs speed-recall) = audit the current design first, then propose.

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
