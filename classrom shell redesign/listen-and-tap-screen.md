# Listen & Tap Screen (PRACTICE Phase)
### Research → Redesign → Google Stitch Prompt

Fourth screen in the same shell (Prompt 01), following Vocabulary Presentation (Prompt 02) and Story Stage (Prompt 03). One architectural difference from the last two screens: this step is explicitly **touch-tapped on the board itself** — a student walks up to the projector/computer (or the teacher taps on their behalf) — so the option tiles are genuinely interactive surfaces, not remote-controlled readouts. Everything else about the shell's display-only framing (no visible teacher menus/nav) still holds; the difference is narrow and specific to the answer tiles during this one game.

---

## PART A — Research: Recognition Drills, Retrieval, and Game-Show Feedback

### A1. Recognition precedes recall — why "hear it, then pick it" is the right first practice
Vocabulary research consistently separates **receptive** (recognition) knowledge from **productive** (recall) knowledge, and finds that <cite index="14-1">students often acquire receptive knowledge earlier and in greater volume than productive knowledge, which demands deeper processing and more frequent retrieval</cite>. Multiple-choice, recognition-style formats specifically suit this stage: <cite index="15-1">MCQs may be less problematic when learning focuses on the recall of word meaning — receptive word knowledge, the ability to recognize and understand foreign words when presented with them — since learners only need to discriminate and recognize the foreign word form rather than recall it precisely from memory</cite>. Retrieval practice itself matters too: <cite index="12-1">receptive retrieval practice produced significantly higher receptive vocabulary knowledge than no retrieval practice at all</cite>.

**Design consequence:** Listen & Tap is correctly positioned as the *first* practice drill precisely because it only demands recognition — the class doesn't have to produce the word, just discriminate it from distractors. This also validates keeping the "Mixed mode" (confusables) for later in a unit's practice sequence, once basic recognition is solid, since confusable discrimination is a harder recognition task, not an easier one.

### A2. Kahoot-style tiles — color + shape + immediate feedback
Kahoot's answer-tile convention pairs each option with a distinct saturated color and simple shape, tapped as large touch targets, with instant color-coded feedback (green/red flash) the moment an answer registers — this is the direct genre ancestor of "big colorful tappable tiles with a press-down feel."

**Takeaway:** keep tile size and color-coding aggressive — this is the one screen in the whole app designed to be physically touched, so tap targets need to be unambiguous and satisfying to press, not just legible from a distance.

### A3. Streaks, combos, and momentum (Blooket/Gimkit logic)
Streak/combo mechanics work because they turn a string of *individually* modest events (single correct answers) into a *compounding* one the room can watch build — the anticipation of "will it keep going" is itself the engagement hook, which is why milestone moments (x3, x5, x10) get their own escalated celebration rather than a flat "+1" every time.

**Takeaway:** the streak counter needs its own escalation tiers, not a linear counter — visually quiet at x1-x2, a small flourish at x3, a bigger one at x5, biggest at x10+.

### A4. Feedback that doesn't punish
Kids' game feedback design generally separates the *energy* of positive feedback from the *tone* of negative feedback: correct answers get maximal celebration (particles, sound, color), while incorrect answers get a brief, gentle correction cue rather than a visually "loud" failure state — since public wrong answers in front of 5-15 peers carry real social stakes for a 10-year-old.

**Takeaway:** correct = big and loud; wrong = small, quick, and immediately resolves into "here's the right answer" rather than dwelling on the miss. No harsh red flooding the screen, no negative sound sting louder than a beat.

### A5. Whisper-answer / think-pair-share — keeping 14 non-turn kids engaged
Common classroom-engagement techniques for "one kid answers, everyone else watches" moments include inviting the rest of the class to answer silently or in a whisper — giving them a task during someone else's turn instead of pure spectating, without creating chaos or pressure on the student at the board.

**Takeaway:** the "class, whisper your answer" prompt is doing real pedagogical work, not just filling space — it converts 14 spectators into 14 quiet participants, which matters for a game that by definition can only have one student touching the board at a time.

### A6. Minimal-pair / confusable discrimination
Presenting confusables (ship/sheep, elephant/... a visually similar animal) together forces genuine discrimination rather than guessing from a single obviously-different option — the harder the visual/phonetic similarity between options, the more the drill is actually testing recognition rather than elimination.

**Takeaway:** Mixed mode's distractor images should be deliberately close in visual category (e.g., all four-legged animals) so tapping the right one requires real word-image binding, not just picking "the odd one out."

### Synthesis — five rules for the redesign
1. **Recognition first, always MCQ.** No production demanded here — that's a later screen.
2. **Tiles are real touch targets.** Big, tactile, color-coded, satisfying to press — this is the one screen designed for a finger, not just eyes.
3. **Celebrate correct loudly, correct wrong gently.** Asymmetric energy protects the answering student's confidence in front of peers.
4. **Streaks escalate in tiers**, not linearly — momentum needs visible stakes.
5. **Give the other 14 kids a job.** The whisper-cue keeps the room a shared activity, not a spectator sport.

---

## PART B — Redesign: Listen & Tap Screen

### B0. Round sequence
```
WHOSE-TURN BANNER (from shell) shows picked student
        │
   "Listen!" PHASE — pulsing speaker, no options yet, audio plays
        │
   OPTIONS SLIDE IN (2-4 tiles) + "Tap the answer!" prompt +
   "Class: whisper your answer!" cue (fades after ~3s)
        │
   STUDENT/TEACHER TAPS A TILE (physical touch on the board)
        │
   FEEDBACK: correct (big celebration + streak update)
             or wrong (gentle correction, reveal correct tile)
        │
   Teacher grades via Baton (Correct/Wrong) → writes to LearnerState
        │
   Brief "Next: Mia 👧" preview → teacher advances → repeat
```

### B1. "Listen!" phase
- Center-stage: a large pulsing speaker icon (concentric ripple rings animating outward in sync with the actual audio playback duration — same ripple language established in the Vocabulary screen, for visual consistency across the app).
- Beneath it, bold text: "Listen! 听！" — big enough to anchor the room's attention before any options appear, deliberately spare (nothing else on stage) so there's no visual competition with the audio cue.
- No options are visible yet at this stage — this beat exists specifically so the class listens *before* seeing choices, preserving "hear it, then discriminate" rather than "see options, then half-listen."

### B2. Options phase
**Layout:** 2 options render side-by-side (1×2), 4 options render as a 2×2 grid, tiles sized generously (minimum ~300×300px equivalent at reference resolution) with clear gutters between them so mis-taps are unlikely.

**Tile anatomy (Image mode):**
- Full-bleed illustration filling most of the tile.
- A colored frame/border unique per tile position (not per correctness — colors are assigned before the answer, e.g., tile 1 = coral, tile 2 = teal, tile 3 = gold, tile 4 = violet) so tiles are visually distinct and describable ("tap the blue one") even before any answer is known.
- A resting-state subtle 3D lift (soft shadow beneath the tile) signaling "this is a physical, pressable object," reinforcing that this specific screen — unlike the rest of the shell — is meant to be touched.
- Small text label appears only *after* the tap resolves (so pre-answer, the class is matching purely on image recognition, consistent with A1's "recognition, not recall" framing).

**Tile anatomy (Word mode variant):** same frame/sizing convention, but the tile's dominant content is the English word in huge bold text on a solid color-tile background instead of an illustration — same interaction and feedback language applies.

**Tile anatomy (Mixed mode variant):** image tiles as above, but the 4 options are deliberately close confusables from the same visual category (per A6) rather than clearly-unrelated animals — visually, this looks identical to Image mode; the difference is entirely in which distractors the system selects, so no separate visual treatment is needed.

### B3. Feedback animations

**Correct tap:**
- The tapped tile scales up slightly and flashes bright green, with a burst of particle confetti localized to that tile (not full-screen, so it doesn't obscure the whose-turn banner or streak counter).
- A big ✓ icon and celebratory text ("Yes! 太棒了!") pop in briefly over the tile.
- The word is now revealed as a label under the tile (English + small Chinese), completing the "recognize → confirm the form" loop for that trial.
- Streak counter increments with a scale-bounce.

**Wrong tap:**
- The tapped tile does a brief, gentle red-tinted shake (not a hard flash-flood of red across the whole screen) — quick, small, over in well under a second.
- Immediately after, the *correct* tile animates a soft green glow-in with its label revealing ("The answer is: elephant 🐘 / 大象"), so the miss resolves into the right answer fast rather than lingering on the error.
- Streak counter resets to 0 with a small, undramatic fade — no negative sound sting, no screen shake, keeping the emotional weight light per A4.

**Streak escalation tiers:**
- x1-x2: no special treatment beyond the normal correct-tap celebration.
- x3: a small flame icon 🔥 appears next to the streak number for the first time, with a quick flourish.
- x5: bigger flourish — flame grows, "Amazing! 太厉害了!" text burst, brief screen-wide (but soft, not garish) particle wash.
- x10+: the biggest tier — full celebratory burst comparable in energy to a milestone moment, flame icon animated/glowing continuously while the streak holds.

### B4. Persistent elements during the round
- **Whose-turn banner** (inherited from the shell): stays pinned throughout — audio phase, options phase, and feedback — so the room always knows who's currently up.
- **Streak counter**: top corner (opposite the shell's clock), a flame + number, always visible once a streak of 1+ exists this round; resets visually (not just numerically) on a miss.
- **Class-whisper cue**: a small, soft prompt near the bottom ("Class: whisper your answer! 全班：小声说答案！") that fades in when options appear and fades out after ~3 seconds — present just long enough to cue the behavior without becoming visual clutter during the tap itself.
- **"Next: [name]" preview**: appears briefly after feedback resolves, low-key, signaling the round is about to move on before the teacher actually advances — sets expectation without rushing the current student's moment.

### B5. Visual identity — PRACTICE phase
Inherits the shell's green/active PRACTICE theme: deep green-slate background wash (`#0F2419`), green accent glow (`#22C55E`/`#4ADE80`) on the content panel border, consistent with how the shell recolors around the current phase. Tile frame colors (coral/teal/gold/violet) are a *separate* palette from the phase accent — same principle as team colors never being confused with phase colors — so tiles read as their own vivid objects against the calmer green backdrop, keeping the "quick-fire game-show round" energy the brief asks for.

### B6. Bilingual design
- During the Listen/options phases: English only, consistent with keeping the recognition task "pure" (matching sound to image/word without a translation crutch available mid-guess).
- After an answer resolves (correct or wrong): the revealed label includes both English and small Chinese, so the reinforcement moment is bilingual even though the guess itself wasn't.

### B7. Motion / animation language
- Speaker ripple (Listen phase): synced to actual audio duration, consistent with prior screens' ripple cue.
- Options slide-in: tiles enter with a slight stagger (~60-80ms between each), sliding/popping into place rather than appearing all at once — reinforces "here come your choices" as a small reveal beat.
- Tap press-down: immediate scale-down (~100ms) on touch registering, before the correct/wrong resolution animation plays — gives tactile confirmation the tap was received even before the system's response.
- Correct burst: localized confetti + scale-bounce, ~400-500ms total.
- Wrong shake: quick horizontal shake (~250ms), resolving directly into the correct-tile reveal.
- Streak milestone bursts: scale with tier — x3 is quick and light, x10+ is the biggest non-WRAP-UP celebration in the whole app, reserved specifically to make sustained streaks feel like a genuine event.

---

## PART C — Google Stitch Prompts

Note the interaction distinction for this screen: unlike the display-only remote-controlled screens in earlier prompts, the option tiles here ARE physically tapped on the board itself by a student or the teacher — so they should visually read as real, pressable, tactile touch targets (soft shadow/lift, clear affordance), not as passive readouts. Everything else on the frame (whose-turn banner, streak counter, class-whisper cue) remains a passive readout, consistent with the rest of the shell.

### C1. "Listen!" phase prompt

```
Design a high-fidelity UI mockup for the "Listen & Tap" game screen — the
first practice drill rendering inside a classroom projector display
(ClassroomBoard), during the PRACTICE phase of an English lesson for
Chinese-speaking K-12 students. Landscape 16:9, 1920x1080 reference canvas,
viewed from 5-10 meters away.

This specific view is the "Listen!" beat, before any answer options appear.

BACKGROUND: deep green-slate gradient wash, approx #0F2419 to #0A1810
(matching the "PRACTICE" phase), with a subtle glowing green border around
the content stage area.

CENTER STAGE: a large pulsing speaker icon in the middle of the screen,
with 2-3 concentric ripple rings animating outward from it (rendered as
static rings of decreasing opacity to suggest motion), styled in bright
green/white. Beneath the icon, bold text reads "Listen! 听！" in large
rounded sans-serif (English large and primary, Chinese smaller beneath).
Nothing else appears on the center stage — this moment is intentionally
sparse so all attention goes to the audio cue.

PERSISTENT UI ELEMENTS (same as other ClassroomBoard screens, styled as
passive read-only indicators, not buttons):
- Top-left or as a floating banner near the bottom-center: a glowing
  "Now up: Leo" banner with a friendly circular lion-avatar character,
  matching the app's existing whose-turn banner style, with small Chinese
  text "现在轮到：Leo" beneath.
- Top-right corner: a small flame icon with the number "2" next to it
  (streak counter, modest scale since the streak hasn't hit a milestone
  yet), styled as a glowing badge, not a button.

STYLE: energetic, fast-paced game-show mood, kid-friendly, high contrast,
rounded shapes, soft glows, no third-party logos or branded IP, no visible
button/tab/menu chrome except where noted.
```

### C2. Options phase prompt (with feedback state)

```
Using the same ClassroomBoard "Listen & Tap" screen and PRACTICE green
theme as before, design the options phase — this view shows 4 large
image-answer tiles that a student has just tapped on the board, with one
tile mid-celebration for a correct answer.

CRITICAL — THIS SCREEN IS PHYSICALLY TOUCHED: unlike other ClassroomBoard
screens (which are remote-controlled and display-only), these 4 answer
tiles ARE real touch targets a student taps directly on the board. Style
them with a clear tactile, pressable affordance — soft drop shadow
beneath each tile suggesting slight elevation, rounded corners, a
satisfying "big button" quality — while everything else on the frame
(banners, counters, prompts) remains a passive, non-interactive readout.

BACKGROUND: deep green-slate wash (#0F2419 to #0A1810), consistent with
the Listen phase.

CENTER STAGE: a 2x2 grid of 4 large square tiles, generous gutters between
them:
- Tile 1 (top-left, coral-colored frame): a cartoon elephant illustration
  — this tile is mid-celebration: bright green glow/flash overlay, a big
  checkmark icon popping over it, small confetti particles bursting
  around its edges, and a label revealed beneath the image reading
  "Elephant · 大象".
- Tile 2 (top-right, teal-colored frame): a cartoon zebra illustration, in
  its normal resting state (soft shadow, no glow).
- Tile 3 (bottom-left, gold-colored frame): a cartoon tiger illustration,
  resting state.
- Tile 4 (bottom-right, violet-colored frame): a cartoon giraffe
  illustration, resting state.

PERSISTENT UI ELEMENTS:
- Bottom-center: the "Now up: Leo" glowing banner with the lion avatar
  (same as before), still visible and pinned.
- Top-right corner: the streak counter, now showing a flame icon and the
  number "3", with a slightly bigger glow/flourish than before to
  indicate a small milestone was just reached.
- A small, soft text prompt near the bottom edge (below the tiles, above
  the whose-turn banner or beside it): "Class: whisper your answer! 全班：
  小声说答案！" in a smaller, gentle, semi-transparent style — clearly
  secondary to the main tiles and banner.

STYLE: high-energy, colorful, tactile game-show round — think big Kahoot-
style answer tiles with a physical, pressable feel. Warm celebratory
green/gold accents on the correct tile, calm resting states on the others.
Rounded corners, soft glows and shadows, bilingual labels (English
primary, Chinese secondary) revealed only after the tap. No third-party
logos, no branded IP.
```

---

If useful, I can also draft a Stitch prompt for the "wrong answer" feedback state (gentle red shake + correct-tile reveal) and the x10+ streak milestone celebration as additional scenes.
