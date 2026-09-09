# I Say You Say — v3 Quality Audit (`I_SAY_YOU_SAY (alias SPEAKING)`)

> **Status:** `pending` — §2 owner comments confirmed 2026-09-09; §0 identity stub; §1/§3 code audit pending (batch phase).
> **Screenshots:** pending (batch phase).

## §0 Identity (stub — completed at code-audit time)

- **Flow type:** `I_SAY_YOU_SAY (alias SPEAKING)`
- **Component:** `apps/board/templates/BoardISayYouSay.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** Mark Correct / Replay / Skip Pair / Next / End (custom)
- **Data sources:** MINIMAL_PAIR_SWIPE items + choral drill
- **Mode:** picked (phase 1) + choral (phase 2)

## §1 How the game works today

*(pending — ZCode batch code audit; the shared prelude will be embedded here when the file reaches `file-ready`.)*

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> First we have a penguin — the sound of the penguin is very good; it plays three times, but it's good. Then we have a sentence: "the animal living the jungle" — that's very good, the sound is also "the animal living the jungle". Then we have the "everyone" screen — everyone says the sentence — but when we play the sound, it is saying "the animal plays in the jungle" (the audio doesn't match the displayed sentence).

**Clarified with the owner (2026-09-09):**
- On the "everyone" choral screen the played audio ("the animal plays in the jungle") does not match the displayed sentence ("the animal living the jungle").
- Owner is NOT sure which one is authoritative — the code audit must trace where the display text vs the audio asset come from and which is the intended sentence.
- Penguin intro sound + triple play: fine per owner.

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
