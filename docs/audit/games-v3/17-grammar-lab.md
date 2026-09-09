# Grammar Lab — v3 Quality Audit (`GRAMMAR_LAB`)

> **Status:** `pending` — §2 owner comments confirmed 2026-09-09; §0 identity stub; §1/§3 code audit pending (batch phase).
> **Screenshots:** pending (batch phase).

## §0 Identity (stub — completed at code-audit time)

- **Flow type:** `GRAMMAR_LAB`
- **Component:** `apps/board/templates/BoardGrammarLab.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** Skip / Hint / Correct / Steal / Redo / End (custom)
- **Data sources:** useEscalatingPool — ERROR_SPOT / TRANSFORM / GRAMMAR_FILL
- **Mode:** picked student

## §1 How the game works today

*(pending — ZCode batch code audit; the shared prelude will be embedded here when the file reaches `file-ready`.)*

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> It's writing "no practice items available yet — grammar objectives unlock after the class has been introduced to the rules during the grammar presentation, so keep to the next slide". But okay, on the next slide I can see "subject" + "verb". Maybe this explanation should be in the language of the student. In this case, right now we're just starting with Chinese, but later there will be more languages. So right now the explanation of the grammar maybe should have some Chinese, or a more complete explanation. / After we get to the next screen ("Penguins living in the jungle — which fix is correct?"), we have options like: "snake and climb", "penguin living in the jungle", "the monkey do eat fish", and "whales live in the river". Obviously the answer is exactly the same as the original sentence — it's exactly the same, all just talking about animals or something. So this system has something wrong in its terms, and the answer is too obvious in a way, and plus there is nothing to correct exactly. For example, we could have "penguins don't live in the jungle" / "penguins live in the jungle" / "penguins something something something". But we need to make it more robust — we need to understand this material/content generation and how to make it better.

**Clarified with the owner (2026-09-09):**
- Empty-state explanation shown BILINGUAL: Chinese + English (pattern must extend to more languages later).
- ERROR_SPOT content is broken: the "correct" option is identical to the original sentence and distractors are nonsense ("snake and climb", "the monkey do eat fish").
- Fix direction: AUDIT THE CONTENT GENERATION FIRST (root-cause why such items are emitted), then decide the fix (owner decision 2026-09-09).

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
