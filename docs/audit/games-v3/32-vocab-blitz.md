# Vocab Blitz — v3 Quality Audit (`VOCAB_BLITZ`)

> **Status:** `pending` — §2 owner comments confirmed 2026-09-09; §0 identity stub; §1/§3 code audit pending (batch phase).
> **Screenshots:** pending (batch phase).

## §0 Identity (stub — completed at code-audit time)

- **Flow type:** `VOCAB_BLITZ`
- **Component:** `apps/board/templates/BoardVocabBlitz.tsx`
- **Phase:** ASSESS
- **Remote-control group:** Skip / Correct / Steal / Redo / End (custom)
- **Data sources:** useEscalatingPool — adaptive timer recognition/production items
- **Mode:** picked student

## §1 How the game works today

*(pending — ZCode batch code audit; the shared prelude will be embedded here when the file reaches `file-ready`.)*

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> The system, before each question, asks "how confident are you?" and offers you to choose between a 1× bet or a 2× bet. This is good. But, for example, when we are in a series of three questions, the system should ask only one time — not ask again on every question. So if the student picks a 1× bet, we go through the 1× bet for the whole series of questions; a 2× bet will be through the whole series of questions.

**Clarified with the owner (2026-09-09):**
- The 1×/2× confidence bet is asked ONCE per picked student's TURN (however many questions the wheel's 1/3/full setting gives) and locks for that whole series.

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
