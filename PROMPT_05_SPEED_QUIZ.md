# PROMPT 05 — Speed Quiz Screen (SPEED_QUIZ — the ASSESS phase)

> This continues the same conversation. You know the project, the Live Board
> model, the Shell (Prompt 01), Vocab Presentation (02), Story Stage (03), and
> Listen & Tap (04). Now we design the **assessment game** — Speed Quiz — where
  the class's learning is measured under time pressure in a high-energy format.

---

## The screen: Speed Quiz (ASSESS phase — timed individual assessment)

This is the **measurement step**. After warm-up, input, story, and practice, the
teacher runs a **timed multiple-choice quiz** to check who has learned what.
Each question has a countdown timer; the picked student answers; the system
records correctness; and at the end, a **results screen** celebrates the class's
performance.

**Think of it as a Kahoot round meets a spelling bee** — fast-paced, timed,
individual accountability, but with the game-show energy that keeps 10-year-olds
locked in. The difference from Kahoot: students have **no devices** — the picked
student answers aloud or taps the board; the teacher grades; the class watches
+ mentally answers along.

### What we want (the redesign goal):

A **high-stakes, high-energy quiz show** with three phases per question:

1. **Question reveal** (the "drum roll"):
   - The board shows: **"Question 3 of 8"** + a **countdown** ("Ready... 3, 2, 1!").
   - The **question** appears with a dramatic reveal (scale-up + slide-in).
   - For vocab: "What does **elephant** mean?" with the word displayed large.
   - For grammar: "Which sentence is correct?" with the options.
   - **2–4 answer options** appear as big colored tiles (Kahoot-style: red triangle,
     blue diamond, yellow circle, green square — but with the answer TEXT prominent).

2. **Answer phase** (the "clock is ticking"):
   - A **circular countdown timer** (10 seconds default) shrinks/animates. The
     class can see the time draining — adds urgency + excitement.
   - The **whose-turn banner** shows the picked student ("Now answering: Leo 🦁").
   - The student answers aloud → the teacher taps the tile (or hands the mouse).
   - **Color flash** on tap: the selected tile lights up.
   - The rest of the class is prompted: "Whisper your answer!" (engagement).

3. **Reveal + feedback** (the "moment of truth"):
   - Timer stops. The **correct tile bursts green** + the wrong one dims.
   - If the student was right: **confetti + "Correct!" + the streak counter builds**.
   - If wrong: **gentle red shake + "The answer is: 大象 (elephant)" + the correct
     tile highlights**. Not punishing — "Good try!"
   - A **brief explanation** appears (1 line): e.g., "Elephant = 大象. It's a big
     animal with a trunk."
   - Teacher grades (Baton: Correct/Wrong) → writes to LearnerState.

4. **Between questions:**
   - A **1-second transition** (slide out → slide in the next question).
   - The **progress bar** updates (Question 3 of 8).
   - The **running score** is visible (correct count + accuracy %).
   - The system picks the next student (round-robin).

5. **Results screen** (the "grand finale"):
   - When all questions are answered: a **full-screen celebration**.
   - **Big score display**: "8/10 Correct!" + accuracy %.
   - **Star rating**: 3 stars for ≥80%, 2 for ≥50%, 1 for <50%.
   - **Top contributors**: the students who answered the most correctly.
   - **"Practice at home →"** transition prompt (hands off to the solo loop).
   - Confetti, celebration animation, upbeat visual energy.

6. **Class leaderboard mini-update:**
   - During the quiz, the **running team scores** update in the corner (Red vs Blue)
     so team competition adds stakes.
   - On the results screen, the **full leaderboard** flashes briefly.

### Current state (what exists today):
- Timed MCQ with a per-question countdown (10s default).
- 2–4 answer options (text-based tiles).
- On tap: correct = green, wrong = red. Score increments.
- Per-student capture: if quickWheelWinner is set, grades via gradeStudent.
- Results screen: shows score/total ("Quiz Complete!" + Trophy).
- Remote controls: Reveal Answer + Reset Timer.
- Pool-driven: pulls MEANING_MATCH items (class-weak first).
- **Missing:** no dramatic question reveal, no circular timer, no streak counter,
  no explanation after reveal, no team-score integration, no star rating, no top-
  contributors, no "practice at home" transition, no celebration animation,
  options are plain text tiles (not Kahoot-shaped/colorful).

### Problems:
1. **No drama** — questions just appear; no reveal animation, no drum roll, no
   anticipation build. It feels like a worksheet, not a game show.
2. **Timer is invisible** — the countdown runs but there's no prominent visual
   timer the class can see draining. No urgency.
3. **No streak** — no combo/streak counter to build excitement across questions.
4. **No explanation** — after the answer, there's no "why" (the correct meaning
   or a tip). Just green/red. Missed teaching moment.
5. **Plain tiles** — text on a dark background; not the colorful, shaped Kahoot
   tiles kids love.
6. **No team integration** — team scores don't update during the quiz; no team
   stakes.
7. **Results screen is bare** — just a score; no stars, no top contributors, no
   celebration, no "practice at home" call-to-action.

### The content (what each question holds):
From pool_items (exercise_type = MEANING_MATCH):
- `prompt` — the English word being tested.
- `prompt_audio` — TTS audio of the word (optional playback).
- `options[]` — 2–4 Simplified Chinese meanings (distractors from sibling words).
- `correct_index` — the correct meaning.
- The question text is auto-generated: `What does "{prompt}" mean?`

---

## What I need from you (Claude)

### Part A — Research
Research **timed assessment games for young learners** + **game-show results screens**:
- **Kahoot** — the gold standard: question reveal drama, shaped/colorful answer
  tiles, countdown music/cue, streaks, podium/results screen, the "waiting for
  answers" tension. Study their UX frame-by-frame.
- **Blooket** — game modes that wrap a quiz (Gold Quest, Tower Defense) — how
  they make assessment feel like play.
- **Gimkit** — the economy/combo system; how streaks + money + power-ups add
  excitement to a simple MCQ.
- **Duolingo checkpoint / boss battle** — the high-stakes "test" screen; how
  they use tension + relief + celebration.
- **TV game-show results** (Jeopardy Final, Wheel of Fortune bonus, Family Feud
  Fast Money) — the grand-reveal of scores; podiums; star ratings; confetti.
- **Formative assessment pedagogy** — why timed retrieval strengthens memory
  (testing effect under time pressure); how to make assessment low-anxiety for
  young learners (celebrate effort, not just correctness).

### Part B — Redesign the Speed Quiz screen
Design the new screen with three sub-screens (question → reveal → results):

**Sub-screen 1: Question + Timer**
- **Dramatic question reveal**: the question scales up from center + the answer
  tiles slide in from the sides (staggered). A brief "Ready?" beat before the
  timer starts.
- **Circular countdown timer** — a prominent ring that shrinks (or a bar that
  drains) as time passes. Changes color (green → yellow → red) as it runs low.
  Pulses in the last 3 seconds.
- **Answer tiles** — Kahoot-style: 4 tiles, each a distinct shape + color (red
  triangle, blue diamond, yellow circle, green square) with the answer TEXT large
  inside. 3D press effect on tap.
- **Whose-turn banner** (from Shell) — "Now answering: Leo 🦁."
- **Class-whisper prompt** — "Class: whisper your answer!" (engages non-turn
  students).
- **Running score + question counter** — subtle, top corner: "Q3/8 · 5 correct."
- **Team scores** (if teams formed) — Red vs Blue totals, updating live.

**Sub-screen 2: Reveal + Feedback**
- Timer freezes. **Correct tile bursts green** (particle burst + scale-up + ✓).
  Wrong selected tile dims + shakes red briefly.
- **The answer revealed**: "Elephant = 大象 🐘" (English + Chinese + emoji).
- **One-line explanation**: "A big gray animal with a trunk and big ears."
- **Streak counter** updates (🔥 x3 if 3 in a row correct).
- **Teacher grades** (Baton Correct/Wrong) — or auto-graded from the tap.
- Brief hold (2s) → transition to next question.

**Sub-screen 3: Results / Podium**
- **Confetti explosion** + upbeat visual celebration.
- **Big score**: "7/10 Correct! 🎉"
- **Star rating**: ⭐⭐⭐ (≥80%) / ⭐⭐ (≥50%) / ⭐ (attempted).
- **Accuracy %**: displayed prominently.
- **Top contributors**: "⭐ Leo (3 correct), ⭐ Mia (2 correct)" — celebrates
  individual effort.
- **Team winner** (if teams): "🟥 Red Team wins! 450 vs 380" with a trophy.
- **"Practice at home →"** prompt (teacher-controlled) → transitions to the wrap
  phase.

**Visual identity** — this is the ASSESS phase. Use the shell's ASSESS theme
(intense — red/orange/purple). High-stakes energy. The screen should feel
different from practice (green/calm) — more urgent, more dramatic. Think
"final round of a game show."

### Part C — Google Stitch prompt
Write a single detailed prompt for Google Stitch to prototype this screen.
Include:
- **Three views to prototype:** (a) the Question + Timer view (question text +
  4 shaped answer tiles + circular timer + whose-turn banner + running score +
  team scores), (b) the Reveal view (correct tile green-burst + answer revealed
  + explanation + streak), and (c) the Results/Podium view (score + stars +
  top contributors + team winner + "Practice at home").
- Example content: Q3 of 8. Question: "What does **tiger** mean?" Options: 老虎
  (red triangle), 狮子 (blue diamond), 豹 (yellow circle), 猫 (green square).
  Timer: 7 seconds remaining (yellow). Whose turn: "Leo 🦁". Running score:
  5/8 correct. Streak: 🔥 x2. Team Red: 450, Team Blue: 380. Phase: ASSESS
  (red/orange theme).
- Layout zones, colors, typography, animation descriptions.
- The shaped tiles (red triangle / blue diamond / yellow circle / green square).
- The circular timer ring.

Format the Stitch prompt as a single copy-pasteable block.

## Constraints (same as before)
- Pure visual (teacher controls from Commander/Remote; students see only content).
- Region-safe, bilingual (English question + Chinese answer options), huge text,
  high contrast, React/Tailwind/framer-motion.
- The board is landscape 16:9, viewed from 5–10m away.
- **No student devices** — answers are tapped on the board by the teacher or a
  student who comes up.

---

**Now begin.** Research → redesign → Stitch prompt. Make me feel the tension of
a ticking clock, the relief of a correct answer, and the explosion of a results
screen — all on a projector seen from across a classroom of cheering kids.
