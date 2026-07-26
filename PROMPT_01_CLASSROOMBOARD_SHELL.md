# PROMPT 01 — Classroom Board Shell (the projector-screen UI framework)

> **Copy this entire document into a fresh Claude session.** It is fully
> self-contained — Claude needs no other context.

---

You are a senior product designer + pedagogy consultant. I need you to deeply
research, brainstorm, and redesign **one screen** of a live-classroom teaching
tool, then produce a **Google Stitch prompt** to prototype the new UI.

## 1. The product

**"Professor"** is a K-12 English-learning platform for the Chinese market
(learners' native language is Simplified Chinese). It has two separate surfaces:

- **Student app (home):** self-paced solo practice on a phone/computer —
  flashcard study, spaced-repetition exercises, mastery tracking. Not relevant
  to this task.
- **Live Board (school):** a **single projector screen** the teacher drives
  in-person with **5–15 students** in the room. **Students have NO devices.**
  The teacher teaches vocabulary, grammar, stories; runs interactive games; and
  grades individual students or teams. **This is what you're redesigning.**

## 2. Hardware & roles

- **Hardware:** one projector/TV showing the Live Board (a web app). The teacher
  also has a phone/tablet running a **Teacher Remote** (a companion control app
  that sends commands to the board). Students have **zero devices** — they watch
  the board and answer aloud or come up to the teacher's computer.
- **Teacher = conductor:** controls pacing (next/prev/redo), picks who answers
  (wheel spin / quick-pick / manual), grades (Correct/Wrong), forms teams,
  awards points, shows the leaderboard.
- **Students = audience + participants:** watch the board, answer when called,
  compete individually or by team. They never touch a device.
- **Bridge to home:** the teacher's grades write to each student's LearnerState
  (FSRS spaced-repetition model), which shapes their **home** practice. Same
  learner model, two separate contexts, **no live device sync**.

## 3. Locked design decisions (already confirmed)

1. **Turn rotation = strict round-robin:** every kid gets one turn per exercise
   before anyone repeats. The system enforces this; the teacher can override.
2. **Picking = Spin (wheel) / Quick-pick / Manual-tap:** the teacher chooses per
   round. The "Wheel of Destiny" is one exciting option, not mandatory.
3. **Points = unified total:** class points + home XP roll into one per-student
   total. A **leaderboard** all kids see for competition.
4. **Teams:** teacher forms 2+ balanced teams (Red/Blue/etc.); team scores =
   sum of member points.
5. **Three response modes per round (explicit):**
   - **Choral** — whole class answers aloud; teacher hears; **no per-student write.**
   - **Individual** — one named student answers; teacher grades Correct/Wrong →
     writes to that student's mastery.
   - **Team** — a team confers; a representative answers; teacher grades the rep.

## 4. The pedagogical model (the teaching arc)

A live lesson follows a **teacher-paced arc** (Gradual Release of Responsibility):
```
WARM-UP (hook, switch to English) →
INPUT (present vocab/grammar: big cards, story, audio) →
PRACTICE (controlled drills: match, listen, spell, build) →
PRODUCE (say it / type it) →
ASSESS (timed quiz, team competition) →
WRAP (XP, leaderboard, "practice at home")
```
Each step has a **phase** tag (WARMUP/INPUT/PRACTICE/OUTPUT/ASSESS/WRAPUP) shown
on the board so the teacher always knows where they are in the arc.

## 5. The screen you're redesigning: the ClassroomBoard Shell

**CRITICAL ARCHITECTURE — two separate surfaces:**

| Surface | Who sees it | What's on it |
|---|---|---|
| **Teacher Commander** (teacher's laptop/tablet) | Teacher only | Tabs, sidebar, unit/chapter picker, all interactive controls (next/prev/flip/reveal/spin/pick/grade/teams/rank). This is the teacher's "cockpit." It EXISTS and is functional — do NOT redesign it. |
| **Live Board** (projector / TV) | Students + teacher | **PURE VISUAL — display only.** NO tabs, NO navigation, NO clickable control buttons. Students see only the content (the game, the vocabulary, the story) + read-only context elements (phase indicator, team scores, whose-turn banner, progress). The board is like a **TV screen in a game-show studio** — the audience watches, the host (teacher) controls from off-screen. |

**The Live Board must NOT have any teacher-control UI** (no menus, no tabs, no
"Next/Flip/Reveal" buttons visible to students). The teacher operates entirely
from the Commander/Remote (a separate device). The board is a pure presentation +
game-interaction surface where answers may be tapped (by the teacher or a student
who comes up to the computer), but it has no navigation chrome.

**What IS on the Live Board (display-only, non-interactive):**
- **Phase indicator** (WARMUP/INPUT/PRACTICE/etc.) — styled, large, read-only context for the class.
- **Team scores** (Red vs Blue + totals) — always visible once teams are formed.
- **"Whose turn" banner** — the picked student's name + avatar, prominent.
- **Round-mode badge** (Choral / Individual / Team) — so the class knows the format.
- **Progress dots/timeline** — visual representation of the lesson arc (not clickable).
- **The content/game area** — where the actual exercise renders (vocab cards, quiz, story, etc.). This IS interactive (tap answers) but has no navigation chrome.

**What is NOT on the Live Board (lives on the Commander/Remote instead):**
- All controls (next/prev/flip/reveal/check/spin/pick/grade/teams/rank/redo).
- Tabs, sidebars, menus, unit picker.
- Teacher notes, lesson roadmap.

### What it currently has (the existing implementation):
- **Header:** phase badge (WARMUP/INPUT/PRACTICE/etc.) + a clock, top-right.
- **Content area:** renders the current step's template (vocab cards, quiz,
  story, game, etc.) via a render switch on `currentStep.type`.
- **Bottom:** a progress bar showing position in the lesson flow.
- **Overlays (toggleable):** a leaderboard (full-screen), a class-weak-words
  banner (during practice), a wheel (student picker), confetti.
- **Transitions:** framer-motion cinematic slide between steps.
- **Persistent background:** dark slate (#0f172a) with subtle dot pattern.

### Known problems (what the teacher sees today):
1. **Visually flat/unpolished** — looks like a prototype, not a classroom tool
   kids would be excited by. No "game-show" energy.
2. **Phase badge is tiny** — hard to read from across the room. The teacher + 
   students can't quickly tell which phase they're in.
3. **No team score persistence** visible during non-team steps — teams are formed
   but you can't see the running score unless you open the leaderboard overlay.
4. **No "whose turn" indicator** visible on the board — when a student is picked
   (via the wheel), there's no persistent "Now answering: Leo" banner.
5. **Progress bar is generic** — doesn't show the phase arc (warm-up→input→etc.)
   visually; just a percentage fill.
6. **No round-mode indicator** — the teacher + class can't see whether the
   current round is Choral / Individual / Team at a glance.
7. **Dark theme is monotonous** — every step looks the same; phases don't have
   distinct visual identity (warm-up = warm colors, assess = intense/red, etc.).
8. **Overlays feel disconnected** — the leaderboard/wheel appear as popups over
   the content rather than integrated into the stage.

### The ~20 step types that render inside the shell (for context):
- **Presentation:** INTRO_SPLASH, FOCUS_CARDS (vocab), GRAMMAR_SANDBOX,
  STORY_STAGE, MEDIA_PLAYER (song/video).
- **Practice:** LISTEN_TAP, FLASH_MATCH, UNSCRAMBLE, WHATS_MISSING,
  I_SAY_YOU_SAY (choral drill), MAGIC_EYES, STORY_SEQUENCING.
- **Assess:** SPEED_QUIZ, TEAM_BATTLE, WHEEL_OF_DESTINY, GAME_ARENA.
- **Wrap:** POLL, UNIT_SELECTION.

## 6. The Teacher Remote (the phone control — for context, NOT redesigning now):
The remote has per-step controls (Flip card / Reveal / Check / Spin), the
Teacher Baton (Spin/Pick/Class/Redo/Rank/Teams/Correct-Wrong), and God Mode tools
(camera, soundboard, drawing/annotation, voice commands). It sends actions to the
board via Supabase Realtime broadcast.

## 7. What I need from you (Claude)

### Part A — Research + brainstorm
Research the best **live-classroom presentation tools** and **game-show UIs**:
- **Kahoot** (big, bold, colorful, high-energy quiz UI; the gold standard for
  kid engagement on a projector).
- **Nearpod** (teacher-paced interactive slides; phase progression).
- **Blooket / Gimkit** (game-show economy + team modes).
- **ClassDojo** (positive-reinforcement avatars + class management).
- **TV game shows** (Jeopardy, Wheel of Fortune, Family Feud — the set design,
  scoreboards, turn indicators, "whose turn" lights).

Synthesise what makes them work on a **big screen seen from across a room**:
legibility (huge text, high contrast), energy (color, motion, sound cues), clear
turn/score indicators, and phase-progression visibility.

### Part B — Redesign the ClassroomBoard Shell
Design a new shell that:
1. Has a **phase-colored theme** that changes with the pedagogical arc (warm-up =
   warm/amber; input = blue/calm; practice = green/active; assess = red/intense;
   wrap = celebratory).
2. Shows a **visible phase progression bar** along the top or bottom (like a
   timeline with icons for each phase + the current position highlighted).
3. Has a **persistent "whose turn" indicator** — when a student is picked (via
   the wheel), their name + avatar appears in a prominent banner ("Now up: Leo 🦁")
   that stays until the round ends.
4. Shows **team scores persistently** in a corner/sidebar (Red vs Blue + their
   point totals), always visible once teams are formed.
5. Shows the **round mode** (Choral / Individual / Team) as a clear badge.
6. Has **huge, high-contrast typography** readable from 10m away.
7. Integrates the leaderboard/wheel as **stage elements** (not popup overlays) —
   e.g., a leaderboard rail on the side, a wheel that's part of the set.
8. Feels like a **polished game-show set** a class of 10-year-olds would be
   excited to see — not a corporate dashboard.

Define:
- The layout zones (header / content / sidebar / footer / overlays).
- The color system per phase.
- The typography scale (sizes for projector legibility).
- The animation/motion language (transitions, reveals, celebrations).
- The responsive considerations (the board is always landscape, 16:9 or wider).

### Part C — Produce a Google Stitch prompt
After the redesign, write a **single, detailed prompt** I can paste into
**Google Stitch** (Google's AI UI prototyping tool) to generate a high-fidelity
prototype of the new ClassroomBoard Shell. The prompt should specify:
- The screen dimensions (landscape 16:9, projector).
- The layout zones + their content.
- The color palette + typography.
- The specific elements (phase bar, whose-turn banner, team scores, round-mode
  badge, content area placeholder).
- The visual style (game-show, energetic, kid-friendly, high-contrast).
- Any example content to populate (e.g., "Vocabulary: elephant, zebra, tiger;
  Phase: INPUT; Team Red: 450 pts; Team Blue: 380 pts; Now up: Leo").

Format the Google Stitch prompt as a single copy-pasteable block at the end.

## 8. Constraints
- **Region-safe:** no Google/OpenAI/Anthropic branding or dependencies in the
  design (the product runs in China). Use generic, original visuals.
- **No student devices:** every interaction is teacher-mediated. The board is
  display + teacher-control only.
- **Chinese L1:** Simplified Chinese translations appear alongside English words
  (the learners' native language). Design for bilingual text (English large +
  Chinese smaller).
- **Accessibility:** huge text, high contrast, color-blind-safe palettes.
- **Tech stack:** React + Tailwind CSS + framer-motion. The design should be
  implementable in these. Mention Tailwind class names where helpful.

---

**Now begin.** Start with Part A (research), then Part B (the redesign), then
Part C (the Google Stitch prompt). Be thorough, specific, and visual in your
descriptions — I should be able to see the screen in my mind's eye from your
words alone.
