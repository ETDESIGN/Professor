# Focus Cards (vocab presentation) — v3 Quality Audit (`FOCUS_CARDS`)

> **Status:** **stitch-in-flight** — §4 validated; §5 design pass submitted to Stitch (4 screens, landing ~10–20 min).
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

**Owner addendum (2026-09-10, Stitch review):** the concept screens came out with PORTRAIT cards — owner correction: **all cards on the board must be LANDSCAPE orientation** (the stage is horizontal 16:9). This is now a v3 design-system rule for every game: media/flashcards are landscape (~4:3), grids reflow to 3×2. Edit pass submitted to Stitch (screen "Vocabulary Focus Cards — Input Phase"). The three concept screens the owner reviewed live in the pilot Stitch project alongside the Word Search screens (duplicates from parallel attempts — owner may delete the extra).

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

- **P1 — Severe visual collisions between BoardShell chrome and in-game navigation/headers.** **Evidence:** `05-grid.png` and `05-drill-stage1.png`. In the Overview Grid, the "Today's Words" header (`BoardFocusCards.tsx:188`) collides directly with the BoardShell's absolute-positioned `• INPUT` phase badge (`BoardShell.tsx:117-120`), rendering the text illegible ("Today's" is visually occluded by the pill badge). In the Drill view, the top-left `< Grid` return button (`BoardFocusCards.tsx:248`, positioned at `top-3 left-4`) is rendered directly underneath and clipped by the `top-5 left-6` phase badge. On a physical interactive whiteboard or projection surface, the teacher cannot cleanly read or reliably tap the back navigation. **Recommendation:** Establish a dedicated, protected top-bar safe zone across both views. Inset the game header below the phase badge or adopt the unified v3 top-bar pattern (from `26-word-search.md`), placing the game title, batch indicator ("Words 1–6 of 12"), and a high-contrast, touch-padded `< Grid` exit button in distinct, collision-free layout slots.

- **P2 — Leaderboard rail consumes ~25% of screen width during a non-scored presentation phase.** **Evidence:** `05-grid.png` and `05-drill-stage1.png` show the 240px wide right-hand leaderboard rail displaying 8 students all at 0 points (`BoardShell.tsx:112, 126-141`). `BoardShell.tsx:41` excludes `FOCUS_CARDS` from `FULL_BLEED_TYPES`. In an INPUT phase activity where no individual or team points are awarded, displaying an active leaderboard of 0-point student avatars provides zero educational utility, creates competitive distraction during initial teaching, and severely compresses the vocabulary cards into narrow columns. **Recommendation:** Add `FOCUS_CARDS` to `FULL_BLEED_TYPES` in `BoardShell.tsx` so the stage expands to full 16:9 width. Reclaim that 240px of projection width to render larger, high-impact card imagery and generous typography readable from 8 meters.

- **P2 — Visual elements and typography are undersized for 5–8 meter classroom projection.** **Evidence:** `05-grid.png` cards use fixed `w-20 h-20` (80×80 px) images (`:216`) inside large, mostly empty dark slate boxes. `05-drill-stage1.png` uses a `max-w-lg` container with a `w-40 h-40` (160×160 px) image (`:269`). Drill stage indicators are `w-2 h-2` (8 px) dots (`:255`), grid progress indicators are `w-2.5 h-2.5` (10 px) dots (`:235`), and teacher instruction prompts are rendered in `text-xs text-slate-500` (`:334`). At 5–8 meters in a typical 30-student Chinese primary classroom, 8–10 px dots and 12 px text are completely invisible, and 80 px images force children to squint. **Recommendation:** Projection-scale all visual anchors. In the 6-card grid, card illustrations must fill 60–70% of the card body (minimum 180×180 px at 1080p). In the detail drill, expand imagery to 280×280 px. Replace microscopic dots with tactile progress pills (minimum 28 px height) and remove teacher-targeted micro-text ("Teacher: tap Flip...") from the kid-facing board entirely.

- **P2 — Sixth slot is wasted by a static instructional placeholder instead of displaying vocabulary.** **Evidence:** `05-grid.png` and `:224-229` show the 6th slot occupied by a dashed border card: "Tap a card to learn / 点击卡片学习". Concurrently, §3 F1 and §2 note that words 6+ in an 11–12 word unit are completely omitted from the overview. Sacrificing 16.7% of the presentation grid for a static instructional label that the teacher already knows is a major misuse of board space. **Recommendation:** Dedicate all 6 slots in the 3×2 grid to actual vocabulary cards. Move instructional hints into the teacher's Commander/Remote screens, and add a crisp pagination control ("Cards 1–6" / "Cards 7–12") to browse larger unit vocabularies.

- **P2 — Lack of responsive reflow for phone-landscape floor (~700×320).** **Evidence:** §3 F8 and `_CROSS-CUTTING.md` #1. The grid is hardcoded to `grid-cols-3 grid-rows-2` (`:198`) with fixed gaps and paddings; in the drill view, `max-w-lg` with multiple vertical blocks (`:266-320`) overflows vertically on a 320 px high mobile landscape screen. **Recommendation:** Implement responsive flex/grid layouts: at 16:9 projection, display 3×2 large cards; at the ~700×320 phone-landscape floor, reflow into a compact 3×2 or a single-row horizontal swipe/page set with reduced paddings, maintaining touch targets at ≥44×44 px with zero vertical scrolling during presentation.

- **P3 — Somber visual tone lacks age-appropriate appeal for 6–12 learners.** **Evidence:** `05-grid.png` displays dark slate boxes (`border-white/10 bg-white/5`) with flat, monochrome text, resembling a technical dashboard rather than a lively learning stage. **Recommendation:** Use tactile, physical card styling with rounded corners (r-24), rich card-back textures/patterns, warm cream or crisp white card faces, and playful elevation shadows that engage 6–8 year olds without feeling juvenile to 11–12 year olds.

### 4.b Workflow & user flow (teacher's path: start → turns → end)

- **P1 — No Commander or Remote route to select a specific word or flip an individual card in the grid.** **Evidence:** §3 F5. `ContextualControls.tsx:98-101` and `TeacherRemote.tsx:359-369` provide only `PREV_CARD`, `FLIP_CARD`, and `NEXT_CARD`. To open or flip a specific word from the grid overview, the teacher is forced to walk to the projected board and tap the screen (`BoardFocusCards.tsx:205`). In a 30-student classroom where the teacher stands among desks holding the phone remote, this destroys physical mobility and classroom management. **Recommendation:** Upgrade Commander and Remote controls for grid mode: (1) provide active card cursor navigation (`PREV` / `NEXT` to cycle card focus with a visible glowing halo on the board); (2) `FLIP` toggles the focused card in-place; (3) `FLIP ALL` flips the entire 6-card set for rapid choral checking; and (4) `DETAIL` / `ZOOM` opens the plus-icon deep-dive modal.

- **P2 — Missing in-place flip: clicking a card abruptly destroys the grid context.** **Evidence:** §2 (Owner comment #4) and §3 F3. Tapping any card in the grid immediately replaces the entire 6-card overview with the single-word drill view (`setView('drill')`). The owner's explicit requirement is that cards flip *in place* within the grid (front image ↔ back word + audio) so the teacher can run rapid, whole-class retrieval drills across the entire set without losing visual context. **Recommendation:** Implement 3D in-place card flipping in grid view. Tapping a card (or pressing `FLIP` on the remote) flips that card in place. Only tapping the explicit plus (+) icon on the back zooms into the full-screen detail drill.

- **P2 — Batch pagination is missing for units with 6+ words.** **Evidence:** §2 (Owner comment #5) and §3 F1. In an 11–12 word unit, cards 6+ are completely hidden from the overview. The teacher has no visible way to advance to the next set of words from the grid. **Recommendation:** Group unit vocabulary into batches of maximum 6 cards. Render a clear pagination indicator on the board ("Set 1 of 2 · Words 1–6"), with a prominent "Next 6 Words →" button on the board and matching `NEXT_BATCH` / `PREV_BATCH` buttons on the Commander and Remote.

- **P2 — Dead-end completion state with unwired button and missing slide transition.** **Evidence:** §3 F6. When all words are marked studied, `BoardFocusCards.tsx:175-178` renders a styled `div` labeled "Start Practice → / 开始练习", but it has no `onClick` handler and never emits `SLIDE_COMPLETE` or advances the lesson. The teacher is stranded in front of the class and must manually find the small slide-advance chevron in the Commander header. **Recommendation:** Convert "Start Practice →" into an active button that emits `SLIDE_COMPLETE` to smoothly advance to the next lesson step (e.g. Practice phase). Mirror this transition in the Commander and Remote with a prominent "Finish Presentation → Start Practice" primary action.

- **P3 — Pronunciation audio is unreachable from Commander/Remote.** **Evidence:** §3 F5. The board component listens for `PLAY_AUDIO` (`:82`), but `ContextualControls.tsx` omits an audio trigger for `FOCUS_CARDS`. In drill view, the teacher must physically touch the board's "Listen" button to trigger pronunciation. **Recommendation:** Add a prominent `Audio / 播放发音` button to the Commander contextual panel and Remote baton.

### 4.c Pedagogical practice (ESL ages 6–12)

- **P1 — Exposing the English word on card fronts eliminates active retrieval practice.** **Evidence:** §2 (Owner comment #4), §3 F2, and `05-grid.png` / `05-drill-stage1.png`. Card fronts currently display both the image and the written word ("tractor", "leaf", etc.). Presenting the word immediately turns the task into passive reading/decoding rather than active vocabulary recall from memory. **Recommendation:** Enforce the owner's rule strictly: Card front = IMAGE ONLY. When students see the image, the teacher prompts: "What's this? 1, 2, 3—" and the class shouts the word from memory. Flipping the card reveals the written English word and plays native audio, providing immediate corrective feedback and reinforcement (dual coding: visual concept → spoken retrieval → orthographic confirmation).

- **P2 — 44-click requirement to register FSRS exposure across a unit.** **Evidence:** §3 F7 and F9. `recordExposure` is strictly gated behind reaching stage 4 in the drill view (`:98`). In a 12-word unit, recording exposure for all words requires 48 discrete clicks. In real classroom practice, teachers will flip through cards rapidly in the grid and rarely execute 4 full drill stages per word, leaving the FSRS spaced-repetition model with zero exposure data for the lesson. **Recommendation:** Decouple `recordExposure` from stage 4 drill. Trigger `recordExposure` automatically when a card's back is revealed in the grid (or when the batch is completed). Initial presentation represents exposure; practice games will evaluate retention and mastery.

- **P2 — Chinese translation placement must scaffold comprehension without becoming a cognitive crutch.** **Evidence:** §2 clarifications, §3 F4, and the owner's refined language rule (avoid Chinese on challenge surfaces when possible; instructions/descriptions may use Chinese; never make answers trivially visible). In the current drill view stage 3 (`:300`), the Chinese translation is rendered in massive amber text (`text-4xl font-cn text-amber-200`), dominating the visual hierarchy. **Recommendation:** Keep the card front (image) and card back (English word + audio) strictly English-only. Place Chinese translations exclusively inside the plus (+) detail view. This forces direct concept-to-English association during class drills, while preserving instant L1 access when a child or teacher needs clarification.

- **P3 — Choral repetition cue lacks teacher pacing control.** **Evidence:** `BoardFocusCards.tsx:153-154`. The "Repeat! 跟读！" cue is triggered by audio playback and automatically clears after a hardcoded 2.5-second timeout. In a live classroom of 30 children, 2.5 seconds is often too brief for the teacher to signal, conduct, and listen to the choral response. **Recommendation:** Let the repetition cue pulse visibly during and immediately after audio playback (e.g. 4 seconds) with an animated audio-wave indicator, and provide a quick `Replay Audio` tap on the remote to repeat the choral cycle if the class response was ragged.

- **Information needed — Image pipeline semantic consistency.** `05-drill-stage1.png` shows an unrelated stock photo of a person looking at a lake representing the vocabulary word "tractor". While the WS4 manifest heal (`:46-67`) prioritizes word-library images over placeholders, verify that the asset pipeline strictly validates semantic match before units reach the live classroom. An ambiguous or incorrect image completely derails visual vocabulary presentation.

### 4.d Game interaction (mechanic, pacing, fairness, fun)

- **P2 — The core mechanic is a rapid-fire whole-class review, but current navigation feels sluggish and fragmented.** **Evidence:** §2: "the idea here is to have the teacher very quickly review the vocabulary: make the kids scream the name; if they cannot remember the name, we can flip the card, read the name again, listen to the sound it makes, and flip it back to click on the other card." Today's architecture requires clicking into a modal drill, clicking 4 times to advance stages, clicking back to grid, and repeating for each word. A 12-word review becomes an exhausting multi-minute ordeal. **Recommendation:** Streamline into an energetic 3-beat rhythm:
  1. *Prompt:* Teacher points to Card 1 (Image front) -> Class shouts the English word.
  2. *Check:* Teacher taps card -> Card flips with a crisp 3D spring to Back (English word + auto-audio) -> Visual checkmark awards a class "Word Mastered" badge.
  3. *Advance:* Remote `NEXT` moves the cursor to Card 2 immediately. If the class hesitates, teacher taps "+" to open the deep drill; otherwise, they burn through all 6 cards in 45 seconds.

- **P2 — Clear visual states for Front vs Back vs Studied cards.** **Evidence:** In a 6-card grid with in-place flipping, students sitting 8 meters away must instantly perceive which cards are unrevealed, which are flipped, and which are mastered. **Recommendation:** 
  - *Front (Unrevealed):* Crisp white card with colorful centered illustration, subtle 3D lift, no text.
  - *Back (Revealed):* Deep indigo card face, radiant bold white English typography, glowing blue audio speaker button, and an amber "+" icon in the top corner.
  - *Studied State:* When flipped back to front (or marked done), the card gains an emerald border, a prominent green checkmark badge (✓), and slightly dimmed elevation so focus shifts naturally to remaining unstudied cards.

- **P3 — "Flip All" mechanic for rapid reverse drills.** **Evidence:** Experienced EFL teachers frequently use two review modalities: (1) Image -> Say Word (deductive), and (2) Word -> Say Meaning/Action (inductive). **Recommendation:** Provide a "Flip All" toggle on the Commander/Remote. With one tap, all 6 cards flip simultaneously to word-backs, allowing the teacher to run a fast sight-reading drill ("Read them as fast as you can!") before advancing to the practice games.

### 4.e Top-5 prioritized recommendations

1. **P1 — Rebuild the Overview Grid with 6 real cards, image-only fronts, and in-place 3D flipping.** Replace the 5-card slice + dummy 6th slot with a true 6-card layout. Card fronts display image ONLY to enforce active retrieval. Tapping flips the card in place to reveal the English word and native audio glyph.
2. **P1 — Move the 4-stage deep drill behind an explicit plus (+) icon on the card back.** Keep the grid as the primary rapid-review surface. Reserve full-screen modal zoom (IPA, Chinese definition, example sentence, sentence audio) exclusively for when the teacher taps the plus icon on an individual card back.
3. **P1 — Add complete Commander and Remote controls for grid navigation and audio.** Implement card cursor navigation (`PREV` / `NEXT`), `FLIP` focused card, `FLIP ALL`, `PLAY AUDIO`, and `BATCH NEXT` so the teacher can orchestrate the entire presentation without touching the projector board.
4. **P2 — Eliminate BoardShell collisions and retract the leaderboard rail (Full-Bleed presentation).** Add `FOCUS_CARDS` to `FULL_BLEED_TYPES` in `BoardShell.tsx` to hide the 240px zero-points leaderboard rail. Set a protected top-bar safe zone so game headers and back navigation never collide with the `• INPUT` phase badge.
5. **P2 — Implement batch pagination (Cards 1–6 / 7–12) and an actionable lesson-advancing completion state.** Automatically partition unit vocabularies into sets of up to 6 cards with clean pagination indicators. Wire the final "Start Practice →" button to emit `SLIDE_COMPLETE` so the presentation smoothly transitions into the practice phase.

### 4.f Design direction for Stitch (style/mood guidance + the 3–5 key screens/states to design; what to KEEP from the current design)

**Mood and visual system.** Design this as a tactile, high-energy "Curiosity Stage / Flashcard Showcase", not a worksheet or database table. Deep midnight-navy background (`#0A1422` with a subtle sapphire radial wash), crisp warm-cream card fronts with vivid, high-resolution imagery, and rich royal-indigo card backs with luminous white typography. Use hot pink (`#EC4899`) sparingly for primary progression actions ("Start Practice", "Next 6 Words"), sky blue (`#38BDF8`) for audio controls, emerald (`#10B981`) for studied checkmarks, and warm amber (`#F59E0B`) for the plus (+) deep-dive button. Motion should feel physical and snappy: 350ms 3D Y-axis card flips with spring dampening, subtle card hover lifts, and clean modal zoom-ins. At 5–8 meters, the image, revealed word, and studied checkmark must be instantly recognizable.

**Mock up these four board screens/states:**

1. **Screen 1 — Grid Overview: Challenge State (Card Fronts):** 16:9 full-bleed screen. Clean top header with game title "Focus Cards", batch pill "Words 1–6 of 12", and a hot-pink "Next 6 Words →" button. Center stage: a 3×2 grid of 6 large, tactile cards. All 6 show vivid, colorful illustrations/photos only (no text). Active card has a soft golden focus halo. No leaderboard rail.
2. **Screen 2 — Grid Overview: In-Place Flipped & Studied State:** Same 3×2 grid showing mixed states: 3 cards showing image fronts; 2 cards flipped in-place showing deep-indigo backs with large white English words ("TRACTOR", "RIVER"), a sky-blue speaker glyph, and a neat amber "+" button in the top-right corner; 1 card flipped back with an emerald border and a bold green checkmark badge (Studied ✓).
3. **Screen 3 — Deep-Dive Modal (Plus Icon Drill View):** Focused full-screen overlay (background dimmed to 70%). Center: large portrait card with high-res illustration, massive English word, clean phonetic transcription (`/ˈtræktər/`), warm amber Chinese translation, and a highlighted example sentence card ("The green **tractor** is on the farm.") with a "Hear sentence" button. Top-left: a clear `< Back to Words` button.
4. **Screen 4 — Completion & Practice Transition:** "All 12 Words Explored! / 太棒了！" celebration screen. Displays a neat ribbon of mini-tokens representing all 12 studied vocabulary items, a buoyant star burst, and a prominent, pulsing hot-pink button: "Start Practice Phase →" with a forward arrow.

**What to KEEP from current design.** Retain the dual-coding pedagogy (pairing clear visual imagery with spoken sound and orthography), the target-word highlighting in example sentences, the runtime image heal prioritizing rich manifest word-library assets over generic placeholders, and the underlying FSRS exposure tracking (refactored to trigger on card reveal). Keep the choral repeat cue concept, refining it into a teacher-paced visual rhythm.

**ZCode reconciliation of §4 (2026-09-10): audit VALIDATED — all findings accepted.** Line references spot-verified against the code (header collision :188, back-button under the phase badge :248, leaderboard rail + FULL_BLEED_TYPES gap, 80px image caps, wasted 6th slot, stage-4 exposure gate). Implementation notes:
- The FULL_BLEED_TYPES change is a BoardShell-level edit (retracts the leaderboard rail for presentation phases) — safe and small; the phase-badge collision still needs the game-header safe-zone fix regardless (same pattern as the Word Search v3.2 fix).
- recordExposure fires on FIRST FLIP of each card (grid), not at drill stage 4 — kills the 48-click barrier and matches the new interaction.
- 4.f's palette folds into the v3 system: warm-cream fronts + royal-indigo backs sit fine on the night stage; hot pink stays the single primary (Start Practice); all cards LANDSCAPE ~4:3 per the owner's 2026-09-10 rule.
- The 3-beat loop (prompt → check/flip → advance) is adopted as the interaction spec.

## §5 Google Stitch design pass (submitted)

> **ZCode drives Stitch directly (v3.1 process).** Four screens submitted 2026-09-10 via the Stitch CLI into the pilot project (`projects/17415096891547227013`); results land in ~10–20 min, then verified against the QA list and exported to `stitch/05-focus-cards/`.

**Shared design brief (baked into every generation):** 16:9 projector board, night-expedition stage #070C18 with subtle radial washes, surfaces #0B132B, rounded-2xl/3xl, soft dark shadows + 1px white/8 edges; hot pink #FF2E79 reserved for the ONE primary action (soft glow); sky #38BDF8 audio buttons; emerald #10B981 studied; amber #F59E0B the "+" deep-dive trigger; warm-cream (#FFF8EC) card fronts with rich imagery; royal-indigo (#2C3E8F) card backs with luminous white type. ALL CARDS LANDSCAPE ~4:3 (owner rule 2026-09-10). No Chinese on challenge faces (grid + fronts); Chinese lives only inside the deep-dive modal. Header clears the top-left phase-pill zone (~180px).

**Screen 1 — Grid overview, all fronts (challenge):** full-bleed 16:9, 3×2 grid of six LANDSCAPE cards, image-only fronts filling the warm-cream frames, one card wearing a sky-blue active halo ("the class shouts this one"), header "Focus Cards · Words 1–6 of 12", slim bottom rail: 12 tactile progress pills (6 filled) + one hot-pink "Next 6 words →" primary.

**Screen 2 — Grid overview, flipped & studied (mixed state):** same layout; two cards flipped to indigo backs (huge white word + sky speaker glyph + amber "+" button), one card emerald-bordered with ✓ "Studied", three still image-only fronts, active halo on the next card.

**Screen 3 — Deep-dive modal (the plus drill):** centered large modal over a dimmed grid: high-res landscape illustration, huge word + phonetics + sky audio buttons (word / sentence), L1 translation line (Chinese allowed here — instruction/detail context), example sentence with the target word highlighted, close button; one hot-pink "Back to cards" primary.

**Screen 4 — Completion & transition:** celebration: "All 12 words explored!", the word tokens as a wrap of small emerald chips, confetti energy, and one pulsing hot-pink "Start Practice Phase →" primary button.

**QA checklist (ZCode, on export):** landscape cards everywhere; image-only fronts on screens 1–2; zero Chinese outside the modal; single pink primary per screen; header clear of the phase-pill zone; progress rail ≥28px tokens; no scrolling at 16:9.
