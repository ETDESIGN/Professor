# Focus Cards (vocab presentation) — v3 Quality Audit (`FOCUS_CARDS`)

> **Status:** **file-ready** — §0–§3 + prelude embedded + §2 confirmed. Ready for Anti-Gravity §4.
> **Screenshots:** `screenshots/05-*.png` (grid + drill views; staged reveals beyond stage 1 need the commander — see F5).

## SHARED PRELUDE (read first — identical in every game file)

**Product.** "Professor" — a teacher-facing ESL/EFL tool for **live, in-classroom** English instruction to children aged **6–12** (primary market: China; L1 is Simplified Chinese, used for translations and meaning options).

**Classroom model (hard constraint — never propose student-device interaction).** A live class runs on three browser tabs converging via Supabase Realtime; students have **no devices**:

| Tab | Route | Who | Role |
|---|---|---|---|
| **Commander** | `/teacher/live` | Teacher, desktop | Control room: lesson roadmap, roster chips, the per-game buttons, sidebar (wheel/teams/analytics) |
| **Remote Baton** | `/remote` | Teacher, phone | Handheld remote: spin/pick, correct–wrong, next student |
| **Board** | `/board` | **Projected 16:9** — the only screen kids see | Renders the current game/slide |

The teacher performs **all input**. Kids answer orally, point, or come to the front.

**Live loop.** Pick a student (wheel) → play a turn → score → next. `quickWheelWinner = null` means choral/practice mode (no individual scoring).

**Unified scoring model.** `scoreForAttempt(mistakes, difficulty)`: difficulty 1/2/3 (receptive / constrained / free-production) → 1–3 base points; −1 live per mistake; streak bonus (+1 at streak 3, +2 at streak 5); cap 5, floor 1 on success. Every scored event triple-writes: `addPoints` (leaderboard) + `recordAttempt` (analytics) + `gradeObjective` (FSRS memory model).

**Lifecycle contract — the 4 must-dos every scored game obeys:**
1. Full reset on `currentTurnId` change (new picked student ⇒ fresh board).
2. `mistakesRef` + `awardedRef` latches (no double-payment, no cross-turn leakage).
3. Score via `addPoints` + `scoreForAttempt` on the picked student.
4. Personalized message with the picked student's name.

**Turn dealing.** Deterministic per `(session, unit, shell, round, turnToken, resetCount)` — a new pick or reset re-deals; class-wide coverage tracked by a ledger so every objective gets its turn.

**Phases.** WARMUP / INPUT / OUTPUT / PRACTICE / ASSESS / WRAPUP — each game belongs to one phase envelope (allowed difficulty rungs + scoring posture).

**Design constraints for any redesign (applies to the Stitch prompt):**
- Board surface only, **16:9 projector**, viewed from 5–8 meters — large type, high contrast, punchy states.
- Kid-friendly but not infantile (ages 6–12 band).
- Must always be legible: the current challenge, the feedback state (correct/wrong/partial), the picked student's identity, and the score moment.
- Teacher-driven: every interaction must have a remote-control path; nothing can require a student device.


---

## §0 Identity

- **Flow type:** `FOCUS_CARDS`
- **Component:** `apps/board/templates/BoardFocusCards.tsx`
- **Phase:** INPUT
- **Remote-control group:** PREV_CARD / FLIP_CARD / NEXT_CARD (custom)
- **Data sources:** unit manifest vocabulary (all words)
- **Mode:** teacher-paced presentation, no scoring

## §1 How the game works today

**Two views, one state machine:** GRID → DRILL (4-stage reveal) → next word → … → all-studied completion.

**Grid view (the default):** header "Today's Words / 今天的单词 · 点读跟练" + a words-count chip; a **3×2 grid of exactly 5 cards** (`cards.slice(0,5)` + a dashed 6th "Tap a card to learn" helper slot). Each card shows the **image + the English word**; studied cards get a green border + ✓ badge. Clicking a card zooms into the Drill view. Below: a progress rail of dots (one per word — green = studied, blue = current).

**Drill view (staged reveal, teacher-paced from the remote):** the big card shows image + word at stage 1; the remote's **Flip Card** advances the reveal: stage 2 adds a **Listen** button (+ a "Repeat! 跟读！" choral cue synced to playback), stage 3 adds **IPA + Chinese meaning + English definition**, stage 4 adds the **example sentence** with the target word highlighted + a "Hear sentence" button. Reaching stage 4 marks the word **studied** and fires a light FSRS `recordExposure` for the whole roster (creates srs_items at 'learning' — presentation never downgrades mastery). PREV/NEXT card move between words; the board also has a "Next Word" button at stage 4 and a "Grid" back-link.

**Completion:** when every word is studied, the grid is replaced by "Great! You've learned N new words / 太棒了…" with a decorative "Start Practice →" prompt (no action wired). `RESET_GAME` returns to the grid at stage 1.

**Content merge:** frozen `data.cards` fields lose to the manifest's richer vocab (real images beat dicebear/pollinations placeholders — WS4 heal).

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

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardFocusCards.tsx` unless noted.

- **F1 · P2 — Only 5 of the unit's words are ever shown in the grid** (`:240`, `cards.slice(0, 5)`). A unit with 11–12 words (owner's §2) never surfaces words 6+ in the overview — the teacher can only reach them by blind dot-tapping the progress rail or NEXT-ing past card 5 in the drill. This is the mechanical half of owner comment #5 (all words must be reviewable in series of max 6).
- **F2 · P2 — Card fronts show the English word** (grid `:263`, drill stage-1 `:308`). Owner comment #4: fronts should be IMAGE-ONLY — kids shout the word from the picture, and the flip reveals it. The current design hands the answer at first glance (string-binding instead of recall).
- **F3 · P2 — No in-place flip.** Clicking a grid card navigates to a separate full-screen drill (`:135-139`). The owner's redesign: the card flips IN the grid (back = word + audio), and a small plus icon on the back opens the full detail card (today's drill content) — see §2.
- **F4 · P3 — Chinese appears at multiple presentation points** (header sub-line `:205`, helper card `:272`, "Repeat! 跟读！" `:296`, stage-3 L1 meaning `:322`). INPUT/pre-teach is where Chinese is most defensible under the refined English-first rule — not a violation, but the §2 redesign restructures it (details incl. Chinese behind the plus icon; backs English + audio only).
- **F5 · P3 — Half-dead control wiring.** The board listens for `PLAY_AUDIO` (`:79`) but the commander's FOCUS_CARDS set is only PREV/FLIP/NEXT (`ContextualControls.tsx:95-101`) — "Listen" is unreachable from the commander; and picking a SPECIFIC word requires walking to the board (grid click) — no commander path to word N.
- **F6 · P3 — The completion screen's "Start Practice →" is decorative** (no onClick, `:187-196`) and the game never emits `SLIDE_COMPLETE` — ending the slide relies on the global next control.
- **F7 · P3 — "All studied" is expensive to reach:** every word needs 4 stage-flips in the drill (11 words = 44 remote presses) before the completion state exists; most real runs will never see it.
- **F8 · P3 — Fixed 3×2 grid, no responsive design** (`:238`) — no phone-floor reflow; the drill's `max-w-lg` card also isn't projection-scaled.
- **F9 · P3 — The FSRS exposure write silently no-ops when the objective row is missing** (ilike lookup `:112-118` returns nothing on units whose objectives weren't generated) — acceptable degradation, but it makes "presentation feeds scheduling" unreliable fleet-wide.
- **F10 · P3 — Audio only appears from stage 2** — under the §2 redesign, the back of the card exposes audio immediately.

**What already works well (context — don't re-litigate):** the staged-reveal pedagogy (dual coding, choral repeat cue synced to playback), studied tracking + persistent progress rail, target-word highlighting in the example sentence, the placeholder-image heal (dicebear/pollinations → manifest word-library URL), grid faces carrying no Chinese.

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
