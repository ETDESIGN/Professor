# Listen & Tap — v3 Quality Audit (`LISTEN_TAP`)

> **Status:** `pending` — §2 owner comments confirmed 2026-09-09; §0 identity stub; §1/§3 code audit pending (batch phase).
> **Screenshots:** pending (batch phase).

## §0 Identity (stub — completed at code-audit time)

- **Flow type:** `LISTEN_TAP`
- **Component:** `apps/board/templates/BoardListenTap.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** Skip / Hint / Correct / Next / End (custom)
- **Data sources:** useEscalatingPool — LISTEN_SELECT / MINIMAL_PAIR_SWIPE / DICTATION (rungs 2–4)
- **Mode:** picked student

## §1 How the game works today

*(pending — ZCode batch code audit; the shared prelude will be embedded here when the file reaches `file-ready`.)*

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> It's quite all right, but it only asks me one question: "animal". I did it five times, and five times it just asks me "animal" — there are a bunch of vocabulary words in the enrichment vocabulary. / Another comment: after answering, we get to a new screen which writes "well done" and asks to click "next round". Because there is only one question, a round should be somewhere like a few words, and the teacher shouldn't have to click after each answer to go to the next. Remember that we have the wheel-run picking system, so we need it to work smoothly with the picking system.

**Clarified with the owner (2026-09-09):**
- Word-variety bug: the same word ("animal") was served 5 turns in a row — the unit's other vocabulary must rotate in (audit the pool/deal path).
- After a correct answer: short celebration (~1–2 s) then AUTO-ADVANCE to the next word within the same student's turn — no forced "well done → next round" click.
- Words per picked student follow the wheel's 1/3/full-set rotation setting.

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
