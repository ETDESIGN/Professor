# Story Stage — v3 Quality Audit (`STORY_STAGE`)

> **Status:** `pending` — §2 owner comments confirmed 2026-09-09; §0 identity stub; §1/§3 code audit pending (batch phase).
> **Screenshots:** pending (batch phase).

## §0 Identity (stub — completed at code-audit time)

- **Flow type:** `STORY_STAGE`
- **Component:** `apps/board/templates/BoardStoryStage.tsx`
- **Phase:** OUTPUT
- **Remote-control group:** Next Page / Hint / Correct / Skip / End (custom)
- **Data sources:** story pages + STORY_COMPREHENSION pool items
- **Mode:** picked or choral

## §1 How the game works today

*(pending — ZCode batch code audit; the shared prelude will be embedded here when the file reaches `file-ready`.)*

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> On the story stage game, we have basically a big screen of the comics cell with an overlay badge with the conversation, with the dialogues. Actually, I would like to change this a little bit. Let's make the main image in the center, and on one side — maybe the left or the right, but the left side would make more sense — have the dialogues written there.

**Clarified with the owner (2026-09-09):**
- Main story image CENTERED; dialogues in a side panel — left preferred by the owner.
- Exact panel treatment (always visible vs collapsible, sizing) = design decides via Co-Work/Stitch.

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
