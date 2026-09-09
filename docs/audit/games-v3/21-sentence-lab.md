# Sentence Lab — v3 Quality Audit (`SENTENCE_LAB`)

> **Status:** `pending` — §2 owner comments confirmed 2026-09-09; §0 identity stub; §1/§3 code audit pending (batch phase).
> **Screenshots:** pending (batch phase).

## §0 Identity (stub — completed at code-audit time)

- **Flow type:** `SENTENCE_LAB`
- **Component:** `apps/board/templates/BoardSentenceLab.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** Skip / Hint / Check / Force ✓ / Redo / End (custom)
- **Data sources:** useEscalatingPool — sentence-build items (rungs 3–5) with distractors
- **Mode:** picked student

## §1 How the game works today

*(pending — ZCode batch code audit; the shared prelude will be embedded here when the file reaches `file-ready`.)*

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> We need to put the words in the right order. Same comment as Word Detectives: right now we just have on the top the word in Chinese, and also a button to listen. It's just writing "ground", but we need to complete the sentence — so we don't really know what we have to do, what kind of sentence we need to build. There is, in the sentence, a big difficulty because there are some words we obviously will not use (distractors). So we need to rethink/reorder this exercise in detail.

**Clarified with the owner (2026-09-09):**
- The build-prompt (currently a lone Chinese word + audio) is inadequate — Co-Work/Stitch to PROPOSE the prompt design (must make the task clear without revealing the answer; English-first rule refined 2026-09-09 (avoid Chinese when possible — a small Chinese instruction line is acceptable when the task otherwise is not clear)).
- Reveal-on-resolve confirmed: full sentence + audio + translation appear after the attempt; wrong attempts get progressive hints (word count / first letters).
- Distractor words are part of the difficulty by design — keep, but make the task frame clear.

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
