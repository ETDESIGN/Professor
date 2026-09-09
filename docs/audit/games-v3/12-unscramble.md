# Unscramble — v3 Quality Audit (`UNSCRAMBLE (alias SCRAMBLE)`)

> **Status:** `pending` — §2 owner comments confirmed 2026-09-09; §0 identity stub; §1/§3 code audit pending (batch phase).
> **Screenshots:** pending (batch phase).

## §0 Identity (stub — completed at code-audit time)

- **Flow type:** `UNSCRAMBLE (alias SCRAMBLE)`
- **Component:** `apps/board/templates/BoardUnscramble.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** ScoredShellControls (Check / Hint / Mark Correct / Skip / Next / End)
- **Data sources:** useEscalatingPool — WORD_BANK_BUILD (rung 5) + TRANSFORM (rung 3)
- **Mode:** picked student

## §1 How the game works today

*(pending — ZCode batch code audit; the shared prelude will be embedded here when the file reaches `file-ready`.)*

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> We have a screen where it's written "original draft" — e.g. "…have got spots" — and then we have a few words, e.g. "sheriff", "have got stripes" — and we should put those words in the right order. But the design is a little bit not very clear about what we need to write — we need to make it clearer, because basically I don't know what I should write right now. (First example: the sentence was "Lions can swim but…" and the answer was "Lions cannot swim" — it was an example, not exactly the exercise, but basically we don't know what we should write — there are not enough instructions.) / Also remember it's an application for learning English, so we can give tips explaining what we should do, but not giving right away the answer. That's something we need to audit properly.

**Clarified with the owner (2026-09-09):**
- The task frame is unclear (what sentence to build, what "original draft" means) — needs an explicit, kid-readable instruction design.
- Instruction language (English-only vs English + small Chinese line) = Co-Work decides under the refined English-first rule (owner, 2026-09-09: avoid Chinese when possible — NOT a strict ban; instructions may use it when needed for clarity; never make the answer trivially visible).
- Hints/tips may explain HOW, but must never reveal the answer.

> If the student cannot get it right, there is no button for the teacher to show the answer and make the kid not get his point. But we need a way to pass a question when we are blocked.

**Clarified with the owner (2026-09-09):**
- The commander's Skip button WAS VISIBLE but did nothing when clicked — dead-button bug, root-cause in the code audit (emitter/receiver action-string mismatch suspected).
- Ideal blocked-question flow: a working way to reveal the answer, award nothing, and move on.

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
