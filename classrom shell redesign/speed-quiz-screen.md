# Speed Quiz Screen (ASSESS Phase)
### Research → Redesign → Google Stitch Prompt

Fifth screen in the same shell (Prompt 01), following Vocabulary Presentation (02), Story Stage (03), and Listen & Tap (04). Same touch-tap distinction as Listen & Tap: the answer tiles here are physically tapped on the board by the picked student or the teacher, while the rest of the frame remains a passive readout controlled from the Remote.

---

## PART A — Research: Timed Assessment, Game-Show Drama, and Low-Anxiety Testing

### A1. The testing effect — why timed retrieval is worth the pedagogical weight
The core justification for running an assessment at all, rather than just more practice, is the testing effect itself: <cite index="27-1">a middle-school intervention found students scored a full grade higher on material they'd been quizzed on than material they hadn't</cite>, and <cite index="22-1">a comprehensive review of the testing effect found that practicing retrieval enhances students' ability to retain and transfer knowledge across contexts, not just perform on the immediate test</cite>. Retrieval under mild time pressure isn't just measurement — it's itself a powerful learning event, which reframes what Speed Quiz is *for*: it's not simply grading what INPUT/PRACTICE already taught, it's actively strengthening it.

### A2. Low-stakes framing matters as much as game-show energy
The literature is consistent that <cite index="20-1">the testing effect works best when anxiety is low, and students who are regularly quizzed at low stakes dramatically outperform those who only study</cite>. Encouragingly, contrary to the intuitive worry that testing stresses kids out, <cite index="21-1">classroom-based retrieval practice has been shown to reduce exam anxiety and give learners a confidence boost</cite> — but this benefit depends on *how* the test is framed: <cite index="22-1">assessments should avoid messaging that frames them as judgments of ability rather than opportunities to demonstrate learning, since when anxiety is treated as a design consideration rather than a deficit, students are better positioned to demonstrate what they know under pressure</cite>.

**Design consequence:** "high-stakes energy" in the visual language (drama, timer, tension) has to stay purely aesthetic/game-show, never carry real social risk. The gentle-wrong-answer treatment established in Listen & Tap needs to hold here even more firmly, since this is the screen explicitly labeled "assessment" — the one place a kid could reasonably feel judged. Celebrating effort and participation (not just correctness) in the results screen is a pedagogical requirement, not just a nice-to-have.

### A3. Kahoot's frame-by-frame drama — the anatomy of a question
Kahoot's proven structure separates a question into distinct beats: a brief "get ready" pause, the question text and options revealed together, a large visible countdown that everyone in the room can track, immediate color-coded resolution, and a running score before the next question. The shapes (triangle/diamond/circle/square) paired with colors exist specifically so options are describable without reading — "the red one," "the blue diamond" — which matters when some players are still building English literacy.

**Takeaway:** shape+color-coded tiles aren't just decoration here — for young ELLs who may still be building sight-reading speed in English, being able to identify an answer by shape/color as well as text is a genuine accessibility win, not just a stylistic choice borrowed from Kahoot.

### A4. Podiums and results screens — the payoff needs its own ritual
TV game-show finales (and Kahoot's own podium screen) treat the results reveal as a distinct emotional beat from the gameplay that preceded it — different pacing, different music/motion, a clear "we made it, here's how we did" moment. This works because it gives the whole session closure and lets effort be recognized publicly and positively, which is exactly the moment to shift emphasis from "who got the most right" toward "look how much the whole class learned."

**Takeaway:** the results screen should foreground collective and individual *effort* (top contributors framed as "who tried hardest / grew the most," not strictly "who scored highest") alongside the score, consistent with A2's anxiety-reduction goal.

### A5. Boss-battle / checkpoint framing (Duolingo-style)
Checkpoint-style assessments in language apps often frame the test as a "boss battle" — a distinct, bounded challenge with its own visual identity, separate from ordinary practice, that resolves with a clear pass/near-miss/retry framing rather than a flat score. The emotional arc (tension → resolution → reward) is the actual product, more than the specific score number.

**Takeaway:** ASSESS's phase-color shift (to intense red/orange) is doing real work here — it's the visual signal that says "this is the boss-battle chapter of today's lesson," distinct from PRACTICE's calmer green, and that distinction should be leaned into rather than softened.

### Synthesis — five rules for the redesign
1. **Drama is aesthetic, not emotional stakes.** Big timer, big reveal — but the actual failure mode stays gentle, exactly like Listen & Tap, maybe gentler.
2. **Shape + color + text on every tile** — a genuine reading-load accessibility win for this specific audience, not just Kahoot cosplay.
3. **Explain the answer, don't just grade it.** Every reveal should teach something in one line, converting the test itself into a learning event (A1).
4. **Results = collective ritual, not a scoreboard.** Foreground participation and growth, keep the score as one element among several, not the headline.
5. **Own the phase-color shift.** ASSESS should feel visibly, unmistakably different from PRACTICE — that contrast IS the "boss battle" framing.

---

## PART B — Redesign: Speed Quiz Screen (three sub-screens)

### B0. Sequence
```
QUESTION + TIMER  →  REVEAL + FEEDBACK  →  (repeat for each question)  →  RESULTS / PODIUM
```

### B1. Sub-screen 1 — Question + Timer

**Reveal beat (before the timer starts):**
A brief "Ready?" pulse-in (question counter + a short beat, ~500-800ms) before the question and tiles land — matching Kahoot's proven "get ready" pause per A3. This isn't just decoration; it gives the class (and the picked student) a half-second to focus before the clock starts, which matters for the low-anxiety framing in A2 — nobody should feel ambushed by a sudden countdown.

**Question header:** "Question 3 of 8" small and top-of-stage, with the running score beside it, low-key: "5 correct so far."

**Question text:** large, centered, e.g. "What does elephant mean? · elephant是什么意思？" — the target word itself rendered extra-large within the sentence so it's unmistakable which word is being tested.

**Circular countdown timer:** a prominent ring (not a generic bar) positioned near the question, draining clockwise, color-shifting green → amber → red as time runs low, with a gentle pulse in the final 3 seconds — visible enough that the whole room tracks it, but the pulse is a soft glow-pulse, not a jarring flash (keeping tension exciting rather than alarming, per A2).

**Answer tiles:** 4 tiles below the question, each pairing a distinct **shape + color** (red triangle / blue diamond / yellow circle / green square, per A3) with the Chinese meaning option in large text inside the tile — shape+color lets the room track "which one" even before finishing reading. Tiles carry the same tactile/pressable styling established in Listen & Tap (soft shadow, rounded, press-down on tap), since this is again a screen where a student physically taps.

**Whose-turn banner:** pinned as always, "Now answering: Leo 🦁."

**Class-whisper cue:** same pattern as Listen & Tap — a soft, fading prompt inviting the rest of the class to whisper their guess.

**Team scores (if formed):** small persistent corner readout, Red vs Blue, consistent with the shell's Team Score Rail — visible during the quiz so team stakes build across questions, not just at the end.

### B2. Sub-screen 2 — Reveal + Feedback

**Timer freeze:** the ring simply stops where it is (no snap-to-zero), signaling the moment has resolved.

**Correct tile:** bright green burst, scale-up, localized confetti, a big ✓ — same celebratory language as Listen & Tap's correct state, scaled slightly bigger since this is the higher-stakes phase.

**Incorrect selected tile (if applicable):** brief gentle shake + soft dim (not a hard red flood), consistent with the anxiety-minimizing principle from A2 — if anything, this state should be *calmer* here than in Listen & Tap, precisely because this is the screen most likely to be perceived as "the real test."

**Answer revealed:** "Elephant = 大象 🐘" — English, Chinese, and a friendly emoji anchor together, reinforcing the same word across all three of its representations one more time.

**One-line explanation:** a short, plain-language teaching note beneath the answer ("A big gray animal with a trunk and big ears.") — this is what turns the reveal into a learning event per A1, not just a grade.

**Streak counter:** same tiered escalation logic as Listen & Tap (quiet at x1-2, flourish at x3, bigger at x5, biggest at x10+) — visual continuity between the two practice-adjacent screens reinforces that they're part of the same game-show "universe."

**Hold + transition:** a brief pause (~2s) on the resolved state before the board transitions to the next question — enough time for the teacher to grade via the Baton and narrate the explanation aloud if they choose, without the board rushing ahead of the room.

### B3. Sub-screen 3 — Results / Podium

**Opening beat:** a confetti wash across the full stage, the phase's red/orange theme brightening momentarily toward a warmer celebratory tone (borrowing a touch of WRAP-UP's gold) to mark this as the "we made it" moment described in A4.

**Score display:** large, central — "7/10 Correct! 🎉" with accuracy % shown just beneath it, clearly legible but not the single largest element on screen (per A4/A2, this is deliberately *not* framed as the headline of the whole results screen).

**Star rating:** ⭐⭐⭐ / ⭐⭐ / ⭐, scaled to accuracy thresholds (≥80% / ≥50% / attempted) — importantly, even the single-star tier reads as a genuine, positively-framed acknowledgment ("You tried your best today!"), never as a visible "failure" tier.

**Top contributors:** a short list framed around participation and effort as much as raw correctness — e.g. "Leo — 3 correct 🌟", "Mia — 2 correct, biggest improvement! 📈" — deliberately mixing a "most correct" note with an effort/growth note where possible, so the spotlight isn't purely a leaderboard of the highest scorers (per A2/A4).

**Team result (if teams formed):** "🟥 Red Team wins! 450 vs 380" with a trophy glyph — kept as its own distinct element, separate from individual scores, so team pride and individual effort are celebrated as two different, coexisting wins rather than competing narratives.

**"Practice at home →" prompt:** styled consistently with the "Start Practice →" and "Comprehension Check →" prompts from earlier screens — a calm, non-interactive signpost/plaque, teacher-advanced from the Remote, closing the ASSESS phase and handing off toward WRAP-UP.

### B4. Visual identity — ASSESS phase
Inherits the shell's intense red/orange theme in full: deep red-slate background wash (`#2E0F14`), red accent glow (`#EF4444`/`#F87171`) on the content panel border and timer's "danger" state — deliberately the most visually intense phase in the whole app, per A5's "boss battle" framing. Shape/color tile palette (red triangle/blue diamond/yellow circle/green square) stays a separate system from the phase accent, same principle as every prior screen — tiles need to pop distinctly against the red wash rather than blending into "the phase is red so everything is reddish." The results screen is the one moment within ASSESS allowed to warm toward gold/celebratory tones, marking the tonal shift from "tension" to "relief and pride" described in A4.

### B5. Bilingual design
- Question text: English primary (the target word emphasized), small Chinese gloss of the *question framing* only (e.g. "是什么意思？") — the actual answer options are the Chinese meanings themselves (per the content spec: options are Chinese meanings), so Chinese is functionally central to this screen's task, not just a secondary gloss.
- Reveal explanation: English primary with the Chinese translation anchored alongside, consistent with every other reveal moment across the app.

### B6. Motion / animation language
- Ready-beat: quick scale/fade pulse (~500-800ms) before timer starts.
- Timer ring: continuous smooth drain, color interpolates green→amber→red across its remaining-time range, gentle pulse (not flash) in the final 3 seconds.
- Tile tap: same press-down + resolve pattern as Listen & Tap.
- Correct/incorrect reveal: scaled-up versions of Listen & Tap's language — bigger confetti burst on correct, still-gentle shake on incorrect.
- Question-to-question transition: quick slide-out/slide-in (~400-500ms), faster-paced than the Story Stage's page-turn, matching the "quick-fire" energy the brief calls for.
- Results screen entrance: a distinct, slightly slower "curtain rise" (~600-800ms) — confetti wash, score/stars/contributors staggering in one after another rather than all at once, giving the finale its own unhurried ritual pacing per A4, in contrast to the snappy pace of the questions themselves.

---

## PART C — Google Stitch Prompt

Same touch-tap note as Listen & Tap: the 4 answer tiles here are physically tapped on the board (student or teacher), so they should read as tactile, pressable objects; everything else on the frame (banners, counters, timer ring) is a passive readout.

```
Design a high-fidelity UI mockup for the "Speed Quiz" screen — a timed,
game-show-style assessment rendering inside a classroom projector display
(ClassroomBoard), during the ASSESS phase of an English lesson for
Chinese-speaking K-12 students. Landscape 16:9, 1920x1080 reference canvas,
viewed from 5-10 meters away. Show THREE separate views/frames within the
same design: (1) Question + Timer, (2) Reveal + Feedback, (3) Results /
Podium — laid out as three distinct screens/panels.

CRITICAL — TOUCH VS DISPLAY: the 4 answer tiles in views 1 and 2 ARE
physically tapped on the board by a student, so style them as clearly
tactile, pressable objects (soft shadow/elevation, rounded, satisfying
"big button" feel). Every other element (question header, timer ring,
whose-turn banner, streak counter, team scores, results screen contents)
is a passive, non-interactive readout — the teacher controls pacing and
grading from a separate remote device, not by tapping chrome on this
screen.

BACKGROUND (all three views): deep red-slate gradient wash, approx
#2E0F14 to #1A0A0C (the "ASSESS" phase theme) — intense, high-stakes mood,
distinctly more dramatic than a calmer practice screen. Subtle red glow
around the content stage border.

VIEW 1 — QUESTION + TIMER:
- Top of stage, small text: "Question 3 of 8" beside "5 correct so far."
- Centered large question text: "What does elephant mean?" with the word
  "elephant" emphasized in a brighter accent color within the sentence,
  and small Chinese gloss "elephant是什么意思？" beneath it.
- A prominent circular countdown timer ring positioned near the question,
  about 60% depleted, colored amber/yellow (mid-countdown, shifting from
  green toward red as time runs out), with "7" as the number inside the
  ring.
- Below the question, 4 large answer tiles in a row or 2x2 grid, each a
  distinct shape+color pairing with Chinese text inside: a red
  triangle-framed tile with "老虎", a blue diamond-framed tile with "狮子",
  a yellow circle-framed tile with "豹", a green square-framed tile with
  "猫" — each tile large, rounded, with a soft drop shadow suggesting it's
  pressable.
- Bottom-center: a glowing "Now answering: Leo" banner with a circular
  lion-avatar character, Chinese subtext "现在轮到：Leo" beneath.
- A small, soft, semi-transparent prompt near the bottom: "Class: whisper
  your answer! 全班：小声说答案！"
- Top-right corner: team score readouts, "Team Red 450" and "Team Blue
  380" as two small glowing plaques, plus a flame-icon streak counter
  showing "🔥 2" nearby.

VIEW 2 — REVEAL + FEEDBACK:
- Same overall layout as View 1, but the timer ring is frozen/stopped.
- The red-triangle tile ("老虎") is bursting with bright green glow, a
  scale-up effect, a big checkmark icon, and small confetti particles —
  indicating this was the correct answer and it was selected correctly.
- Beneath the tiles, a revealed answer line: "Tiger = 老虎 🐯" in large
  bold text, with a one-line explanation beneath in smaller text: "A big
  wild cat with orange and black stripes."
- The streak counter now shows "🔥 3" with a slightly bigger glow/flourish
  than in View 1, indicating a small milestone.

VIEW 3 — RESULTS / PODIUM:
- Full-stage celebratory takeover: background brightens slightly with a
  warm gold undertone blended into the red wash, confetti particles
  scattered across the whole frame.
- Large centered score text: "7/10 Correct! 🎉" with accuracy "70%"
  displayed just beneath it.
- A row of 3 star icons, 2 filled/glowing gold and 1 outlined (representing
  a 2-star tier result), positioned above or below the score.
- A short "Top Contributors" list: "Leo — 3 correct 🌟" and "Mia — 2
  correct, biggest improvement! 📈", styled as small glowing plaques, not
  a ranked leaderboard table.
- A team-result banner: "🟥 Red Team wins! 450 vs 380" with a small trophy
  icon, styled as its own distinct plaque separate from the individual
  score.
- Near the bottom, a calm, clearly non-interactive signpost/plaque
  reading "Practice at home →" with Chinese "回家继续练习" beneath — an
  informational readout, not a button, since the teacher advances from
  their remote device.

TYPOGRAPHY: question text and score numbers extremely large and bold;
Chinese answer-tile text large and highly legible (this is the primary
answer content on this specific screen, unlike other screens where
Chinese is secondary); explanation and contributor text smaller but still
well above normal UI body-text size given the 5-10m viewing distance.

STYLE: high-energy, dramatic, "boss battle" game-show mood for Views 1-2 —
tense, urgent, vivid — softening into a warmer, celebratory "podium" mood
for View 3. Rounded corners, soft glows rather than harsh shadows except
where tile elevation is intentional, bilingual typography throughout, no
third-party logos or branded IP, no button/tab/menu chrome anywhere beyond
the tactile answer tiles explicitly called out above.
```

---

If useful, I can also draft a standalone Stitch prompt for the "Ready?" pre-timer beat (the drum-roll moment before a question fully reveals) as its own scene.
