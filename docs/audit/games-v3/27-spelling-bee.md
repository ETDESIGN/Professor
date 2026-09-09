# Spelling Bee — v3 Quality Audit (`SPELLING_BEE`)

> **Status:** `pending` — §2 owner comments confirmed 2026-09-09; §0 identity stub; §1/§3 code audit pending (batch phase).
> **Screenshots:** pending (batch phase).

## §0 Identity (stub — completed at code-audit time)

- **Flow type:** `SPELLING_BEE`
- **Component:** `apps/board/templates/BoardSpellingBee.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** Hint / Correct / Skip Word / Redo / End (custom)
- **Data sources:** useEscalatingPool — shared engine components/games/spellingBee/
- **Mode:** picked student, per-word countdown

## §1 How the game works today

*(pending — ZCode batch code audit; the shared prelude will be embedded here when the file reaches `file-ready`.)*

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> First, the same UI issue — we cannot properly see the word/flash/sound. Maybe the timing is also a little bit short — the timing needs a few seconds more, or maybe it should be configurable as a game setting.

**Clarified with the owner (2026-09-09):**
- ["Failing B" = Spelling Bee, confirmed by owner.] The specific problem confirmed: the per-word COUNTDOWN is too tight. Timing fix = longer defaults + a quick in-class adjust (+10s style). Word/flash/sound readability also flagged in the original comment — include in the UI audit.

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
