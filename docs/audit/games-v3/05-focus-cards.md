# Focus Cards (vocab presentation) — v3 Quality Audit (`FOCUS_CARDS`)

> **Status:** `pending` — §2 owner comments confirmed 2026-09-09; §0 identity stub; §1/§3 code audit pending (batch phase).
> **Screenshots:** pending (batch phase).

## §0 Identity (stub — completed at code-audit time)

- **Flow type:** `FOCUS_CARDS`
- **Component:** `apps/board/templates/BoardFocusCards.tsx`
- **Phase:** INPUT
- **Remote-control group:** PREV_CARD / FLIP_CARD / NEXT_CARD (custom)
- **Data sources:** unit manifest vocabulary (all words)
- **Mode:** teacher-paced presentation, no scoring

## §1 How the game works today

*(pending — ZCode batch code audit; the shared prelude will be embedded here when the file reaches `file-ready`.)*

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> When we open the exercise, we get a screen with only three vocabulary cards — it looks like five or six would be better. But anyway, we have three cards with an image and the vocabulary word. Actually, for starters, we should only have the image. / Then, when we click on one of the cards, we get a full screen of the image plus the vocabulary word. Which is not bad — we keep it. But actually, when we click on the card, what I want is only the card to flip, and to have the information which is in the full screen right now on the back of the card — just a click, flip, and then you can see this information: the vocabulary, the pronunciation, etc. / Now, we can keep on the back of the card a little focus button — when you click on it, we get the full-screen single card like it is right now, with all the information. But the idea here is to have the teacher very quickly review the vocabulary: make the kids scream the name; if they cannot remember the name, we can flip the card, read the name again, listen to the sound it makes, and flip it back to click on the other card.

**Clarified with the owner (2026-09-09):**
- Card FRONT = image only (no word text).
- Tap anywhere on the card TOGGLES the flip (front ↔ back).
- Card BACK = the English word + its audio ("sound and audio only" per owner).
- A small **plus icon** on the back opens the full-screen detail card (kept from today's design) — full details INCLUDING the Chinese live there.
- Purpose: rapid teacher-paced review — kids shout the word; flip to re-teach; flip back; next card.

> Still on the Focus Card exercise. As I said, we only have three words in the exercise, but the unit has about 11–12 words — real words — and all those words should be reviewed. My point is: if there are 11 words, we should see on the main screen a series of maximum six cards, with a button to click to see the six next cards.

**Clarified with the owner (2026-09-09):**
- ALL unit vocabulary words must be reviewable (a unit with 11–12 words currently shows only 3).
- Main screen shows a series of MAX 6 cards; a teacher-paced "next 6" button advances to the next series (no auto-advance).

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
