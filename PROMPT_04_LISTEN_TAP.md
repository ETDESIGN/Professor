# PROMPT 04 — Listen & Tap Screen (LISTEN_TAP — the first PRACTICE drill)

> This continues the same conversation. You know the project, the Live Board
> model, the Shell (Prompt 01), Vocab Presentation (Prompt 02), and Story Stage
> (Prompt 03). Now we design the **first practice game** — Listen & Tap — where
  the class transitions from passive learning to active retrieval.

---

## The screen: Listen & Tap (PRACTICE phase — recognition drill)

This is the **first controlled-practice step**. The vocabulary has been
presented (INPUT) and contextualized in a story (OUTPUT). Now the class
**practices recognizing** the words: the board plays the audio of a word, and
2–4 image/word options appear. The picked student (or the class chorally) taps
the correct one.

**Think of it as a game-show "identify the item" round** — the audio plays
("elephant!"), options appear (4 cartoon images), and the student taps the
elephant. Immediate feedback: correct = green flash + celebratory sound; wrong =
red shake + the correct one highlights. The teacher then grades the student
(Correct/Wrong via the Baton) and the system picks the next student (round-robin).

### What we want (the redesign goal):

A **fast-paced, high-energy recognition game** that feels like a mini game-show
round:

1. **Audio-first presentation:**
   - The board shows a **large speaker icon** pulsing + the instruction "Listen!"
   - The TTS audio plays the target word (e.g., "elephant").
   - After the audio, **2–4 option tiles** slide in (images or words, depending
     on the exercise variant).
   - The student (picked by the system — whose-turn banner shows their name) taps
     the correct option — either on the board (teacher hands the mouse / student
     comes up) or the teacher taps on their behalf.

2. **Option tiles:**
   - Each tile is **large, square, with a big illustration** (or the English word
     in huge text if it's a word-based variant).
   - On tap: **immediate visual feedback** — correct tile glows green + scales
     up; wrong tile shakes red; the correct one then reveals.
   - Tiles have a **3D press-down effect** (scale + shadow) — tactile feel.

3. **Round flow (teacher-controlled, system-assisted):**
   - System picks a student (round-robin) → "Now up: Leo 🦁" banner.
   - Audio plays → options appear → student taps → feedback.
   - Teacher grades (Baton: Correct/Wrong) → writes to Leo's LearnerState.
   - System picks next student → next word → repeat.
   - **Round ends** when all students have had a turn (or the teacher advances).

4. **Class engagement during individual turns:**
   - While one student is answering, the rest of the class sees the same content
     (they can mentally answer too — passive participation).
   - A subtle **"class, you can whisper the answer"** prompt (so non-turn
     students stay engaged without shouting).

5. **Variant modes (the same screen, different difficulty):**
   - **Image mode** (easiest): audio plays → tap the correct IMAGE (4 cartoon
     illustrations).
   - **Word mode** (medium): audio plays → tap the correct WORD (4 English words).
   - **Mixed mode** (hardest): audio plays → tap the correct image, but the
     options include confusables (e.g., ship vs sheep).

6. **Streak / combo counter** — a fun visual that builds as consecutive correct
   answers happen (🔥 x3, x4, x5). Resets on a wrong answer. Adds game-show
   energy + motivates the class to root for the student.

7. **Sound design cues** (described visually — the board can show sound icons):
   - Correct: a green checkmark burst + confetti particles.
   - Wrong: a red X + gentle shake (not punishing — kids).
   - Streak milestone (x5): a flame icon + "Amazing!" text burst.

### Current state (what exists today):
- Plays TTS audio of the target word.
- Shows 2–4 image options (from pool LISTEN_SELECT items).
- On tap: correct = green border + checkmark; wrong = red border + shake.
- Per-student capture: if a student is picked (quickWheelWinner), grades them via
  `gradeStudent`.
- Class-weak ordering: pulls from the pool, weakest words first.
- Round advance on RESET_GAME (remote).
- **Missing:** no "whose turn" integration (round-robin), no streak counter, no
  variant modes (image/word/mixed), no class-engagement prompt, no sound-design
  cues, no celebratory bursts, options are small/basic.

### Problems:
1. **No round-robin integration** — the game doesn't automatically cycle through
   students; the teacher must manually pick each time via the Baton.
2. **No streak/combo** — no gamification energy during the drill.
3. **Options are small** — hard to see from across the room; need big tiles.
4. **No variant modes** — always image-based; no word-recognition or
   confusable-discrimination variants.
5. **No "Listen!" cue** — the audio just plays without a visual "listen now"
   prompt; students may not be ready.
6. **Feedback is subtle** — a green border isn't exciting enough for a class of
   10-year-olds. Needs bursts, sounds, motion.
7. **No class engagement layer** — when one student answers, the rest disengage.

### The content (what each round holds):
From pool_items (exercise_type = LISTEN_SELECT):
- `audio_url` — TTS audio of the target word.
- `prompt_text` — the target word (for display after the answer).
- `options[]` — 2–4 options, each `{text, image_url}`.
- `correct_index` — which option is correct.
- Sibling words (same unit) provide distractor images/words.

---

## What I need from you (Claude)

### Part A — Research
Research **recognition-drill games for young ELLs** + **game-show UI patterns**:
- **Receptive vocabulary practice** — the "hear → identify" retrieval cycle;
  why recognition precedes recall (Nation's framework); the testing effect at
  the recognition level.
- **Kahoot-style answer tiles** — big, colorful, tappable, with immediate
  feedback animations (the gold standard for kid engagement).
- **Blooket / Gimkit game modes** — how they make a simple MCQ feel exciting
  (streaks, combos, power-ups, sound cues, screen shake).
- **Sound design for kids' games** — how visual + audio feedback (bursts,
  chimes, dings) reinforces correct/wrong without being punishing.
- **Choral + individual hybrid** — how to keep the whole class engaged while
  one student answers (whisper-answer, thumbs-up, think-pair-share).
- **Minimal pair / confusable discrimination** — how to present ship vs sheep
  visually + audibly for young learners.

### Part B — Redesign the Listen & Tap screen
Design the new screen with:

1. **"Listen!" phase** (before options appear):
   - A large pulsing speaker icon + "Listen!" text (big, animated).
   - The audio plays. The class is cued to listen.
   - After audio: a brief "Tap the answer!" prompt → options slide in.

2. **Option tiles** (big, game-show style):
   - 2×2 or 1×4 grid (depending on option count). Each tile ~300×300px minimum.
   - Image tiles: full-bleed illustration + subtle label on tap.
   - Word tiles: huge English text (48px+) on a colored background.
   - **3D press effect** on hover/tap (scale 1.05 + shadow lift).
   - **Color-coded** (like Kahoot: red/blue/yellow/green shapes — but here use
     the illustrations as the primary visual, with a colored frame).

3. **Feedback animation:**
   - **Correct**: tile explodes with green particles + a big ✓ + celebratory text
     ("Yes!" / "Correct!" / the word spelled out). Confetti burst.
   - **Wrong**: tile shakes red briefly + the **correct** tile glows green.
     Gentle, not punishing. "Almost! The answer is: elephant 🐘".
   - **Streak counter**: a flame icon 🔥 + count, top corner. Builds on
     consecutive corrects. Bursts at x3, x5, x10.

4. **Round-robin integration:**
   - The "whose turn" banner (from the Shell) shows the picked student.
   - After feedback: a brief "Next: Mia 👧" preview (the system's next pick).
   - The teacher taps "Next Round" (remote) → system picks next student + loads
     the next word.

5. **Variant mode selector** (teacher-controlled, via remote — NOT on the board):
   - Image mode / Word mode / Mixed mode.
   - The board just renders whatever variant is active.

6. **Class engagement cue:**
   - A subtle, non-intrusive prompt at the bottom: "Class: whisper your answer!"
     (appears when a student is picked, fades after 3s).

7. **Visual identity** — this is the PRACTICE phase. Use the shell's PRACTICE
   theme (green/active). High energy, fast-paced, colorful. The feel should be
   "quick-fire game-show round" — not slow or academic.

### Part C — Google Stitch prompt
Write a single detailed prompt for Google Stitch to prototype this screen.
Include:
- **Two views to prototype:** (a) the "Listen!" phase (pulsing speaker + big text
  + no options yet), and (b) the options phase (4 large image tiles + whose-turn
  banner + streak counter + class-whisper prompt).
- Example content: word = "elephant" (audio playing). Options: elephant 🐘,
  zebra 🦓, tiger 🐯, giraffe 🦒 (cartoon illustrations). Whose turn: "Leo 🦁".
  Streak: 🔥 x3. Phase: PRACTICE (green theme).
- Layout zones, colors, typography, the feedback animation description.
- The streak counter, the class-whisper prompt.

Format the Stitch prompt as a single copy-pasteable block.

## Constraints (same as before)
- Pure visual (teacher controls from Commander/Remote; students see only content).
- Region-safe, bilingual (English on the board; Chinese available on tap-a-word
  after the answer), huge text, high contrast, React/Tailwind/framer-motion.
- The board is landscape 16:9, viewed from 5–10m away.
- **No student devices** — answers are tapped on the board (by the teacher or a
  student who comes up to the computer).

---

**Now begin.** Research → redesign → Stitch prompt. Make this feel like the most
exciting 30 seconds of the lesson — the moment a kid walks up to the board,
hears "elephant!", and slaps the right picture while the whole class cheers.
