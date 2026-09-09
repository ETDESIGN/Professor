# Memory Lab — v3 Quality Audit (`MEMORY_LAB`)

> **Status:** `pending` — §2 owner comments confirmed 2026-09-09; §0 identity stub; §1/§3 code audit pending (batch phase).
> **Screenshots:** pending (batch phase).

## §0 Identity (stub — completed at code-audit time)

- **Flow type:** `MEMORY_LAB`
- **Component:** `apps/board/templates/BoardMemoryLab.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** Skip Round / Correct / Redo / End (custom)
- **Data sources:** useEscalatingPool — vocabulary cards (rungs 1–4)
- **Mode:** picked student

## §1 How the game works today

*(pending — ZCode batch code audit; the shared prelude will be embedded here when the file reaches `file-ready`.)*

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> The memory game is quite good, but the problem is we just memorize cards — we don't really memorize the English word. So we need this kind of memory game, but instead of picking up the matching card, we need to pick up the matching word (or something like this). 4 up to 6 cards is the maximum — because if the next levels keep getting more and more difficult, we get like 10 or 12 cards, which is just not necessary. But the main point is: it's not a memory class, it's an English memory class. So we need a way to have to remember the English: either we see the word and have to pick up the matching visual, or we have a visual and need to pick up the right word. That's something to think about.

**Clarified with the owner (2026-09-09):**
- Matching must train ENGLISH: alternate directions across rounds — see IMAGE → pick the matching WORD, then see WORD → pick the matching IMAGE.
- Grid hard cap 4–6 cards (the current 10-card round 4 goes away).
- "It's not a memory class, it's an English memory class."

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
