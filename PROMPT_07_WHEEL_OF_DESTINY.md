# PROMPT 07 — Wheel of Destiny Screen (WHEEL_OF_DESTINY — the student picker)

> This continues the same conversation. You know the project, the Live Board
> model, the Shell (Prompt 01), Vocab Presentation (02), Story Stage (03),
> Listen & Tap (04), Speed Quiz (05), and Team Battle (06). Now we design the
> **Wheel of Destiny** — the "fortune wheel" that picks which student answers
> next. This is the **single most exciting micro-moment** in the live board:
> the wheel spins, the class holds its breath, and it lands on someone.

---

## The screen: Wheel of Destiny (student picker — used across all phases)

This isn't a standalone "game" — it's a **transitional device** that appears
whenever the teacher needs to pick a student. It can be triggered:
- Before any individual round ("Who answers this question?").
- As a standalone step in the lesson flow (a "picker" step).
- From the Teacher Baton (the "Spin" button) at any time.

**Think of it as the Price is Right big wheel + a classroom lottery** — the
anticipation, the slow-down, the reveal, the cheering. For 10-year-olds, this
is pure dopamine. The wheel itself IS the game — even though it's "just" picking
a name.

### What we want (the redesign goal):

A **spectacle** — the wheel is a hero moment, not a utility:

1. **The wheel itself:**
   - A **large, colorful wheel** (fills 60-70% of the screen) divided into
     slices — one per student. Each slice has the student's **name + avatar/emoji**
     + a distinct color (alternating from a vibrant palette).
   - The wheel has a **3D depth** (perspective tilt, drop shadow, rim lighting)
     — it looks like a physical object, not a flat CSS circle.
   - A **ticker/pointer** at the top (the "flapper" that clicks as slices pass).
   - **LED-style lights** around the rim that chase/pulse during the spin (like
     a prize wheel at a carnival).

2. **The spin:**
   - Triggered by the teacher (Baton "Spin" or remote "SPIN").
   - The wheel **accelerates, spins fast, then decelerates** (cubic-bezier easing,
     4-5 seconds total).
   - As it spins: **ticking sound cue** (visual representation — the ticker
     physically bounces as each slice passes). The LED lights chase faster.
   - The class sees names blurring past — building anticipation.
   - **Slow-motion in the final second** — the wheel crawls, the class screams
     the name of whoever it's approaching.

3. **The landing (the reveal):**
   - The wheel stops. The pointer rests on the winning slice.
   - **That slice lights up** (glow + scale-up + color burst).
   - **Confetti** in the winner's slice color.
   - The winner's name + avatar **zoom to center screen** in a dramatic reveal:
     "🎉 LEO! 🦁" (huge text + avatar + their team color if assigned).
   - A **"Your Turn!"** badge appears.
   - Brief hold (2-3 seconds) → the wheel fades → the actual exercise begins
     (the game/quiz loads with Leo as the active responder).

4. **Fair-play indicator (transparency):**
   - After the spin, a subtle **"Round-robin: 3/8 students had a turn this
     exercise"** progress indicator appears briefly. This shows the class (and
     the teacher) that the system is fair — everyone gets a turn. The wheel
     ENFORCES round-robin (locked decision 0.1.1): it's weighted to land on
     students who haven't gone yet (but the visual spin looks random/exciting).

5. **Idle state (before a spin):**
   - The wheel sits **slowly idling** (barely rotating, like a record player) —
     alive, waiting. A prompt: "Teacher, tap SPIN to pick a student!" (or
     "Waiting to spin..." if no teacher action yet).
   - The student roster is visible around or beside the wheel (so the class can
     see who's been picked and who hasn't — checked/unchecked visual).

6. **Alternate pickers (Quick-pick + Manual — NOT the wheel, but related):**
   - **Quick-pick**: a rapid random flash of names (like a slot machine) that
     stops on one — faster, less dramatic, for when the teacher wants to move
     quickly.
   - **Manual**: the teacher taps a name from the roster list — no animation.
   - These are **style variants** of the same "pick a student" action. The wheel
     is the spectacle; quick-pick is the utility; manual is the override.

### Current state (what exists today):
- A flat SVG wheel (600×600px) with student names on slices.
- Spin animation: CSS rotate transition (4 seconds, cubic-bezier).
- Landing: the winning student's name shows in a modal overlay ("The Chosen One"
  + their avatar + "+50 XP" + "Turn Active").
- SPIN_WHEEL action (broadcast) + GAME_WIN (confetti) after 4 seconds.
- Remote: SPIN button (selectNextStudent).
- **Missing:** no 3D depth, no LED rim lights, no ticker bounce, no slow-mo
  finale, no confetti at landing, no "Your Turn!" transition, no round-robin
  transparency indicator, no idle animation, no Quick-pick variant, no checked/
  unchecked roster display, the modal feels disconnected (pops over the wheel
  rather than emerging from it).

### Problems:
1. **Flat and lifeless** — it's a 2D CSS circle with text. No depth, no lights,
   no physicality. Doesn't feel like a prize wheel.
2. **No sound/ticker cue** — the spin is silent (no visual "click click click" as
   slices pass). The anticipation is lost.
3. **Landing is anticlimactic** — a modal pops up with the name. No burst, no
   zoom, no "YOUR TURN!" energy. The most exciting moment falls flat.
4. **No slow-mo** — the wheel stops at full speed; no dramatic deceleration in
   the final second where the class screams.
5. **No idle state** — when not spinning, the wheel is completely static. Dead.
6. **No fairness indicator** — the class can't see who's been picked / who hasn't.
   No transparency that the system is fair.
7. **The modal is disconnected** — "The Chosen One" modal pops OVER the wheel
   instead of the reveal emerging FROM the wheel (the winning slice should zoom
   out, not a separate modal appear).
8. **No Quick-pick variant** — always the full 4-second spin; can't skip quickly
   when the teacher wants pace.

### The interaction model:
- The teacher triggers a spin (Baton "Spin" / remote "SPIN" / QuickSpinModal).
- The system has ALREADY decided who will be picked (round-robin: prefers
  students who haven't gone this exercise). The wheel's job is to make the
  reveal exciting — the outcome is pre-determined (fair), the animation is the
  show.
- After the reveal: the picked student's ID is set as `quickWheelWinner` →
  all games + the Baton show them as the active responder.
- The teacher can override (Manual pick from the roster) at any time.

---

## What I need from you (Claude)

### Part A — Research
Research **prize wheels / fortune wheels in games + TV** + **fair-selection UX**:
- **The Price is Right Big Wheel** — the gold standard: the physicality, the
  ticking, the slow-mo, the audience reaction, the lights.
- **Spinner wheels in digital games** — Wheel of Names, ClassDojo randomizer,
  Blooket spinner — how they translate the physical wheel to screen.
- **Slot machine UX** — the anticipation build, the near-miss, the slow stop,
  the celebration. How casinos design the "almost there" feeling (ethically).
- **Fair/transparent selection** — how to communicate "everyone gets a turn" while
  keeping the excitement of randomness. The round-robin-with-spectacle pattern.
- **Celebration/reveal design** — how TV shows + sports broadcasts reveal a
  result (zoom, slow-mo, burst, confetti, sound sting).
- **Carnival / fair aesthetics** — the visual language of prize wheels (LED
  lights, bold colors, ticker sounds, the "step right up" energy).

### Part B — Redesign the Wheel of Destiny screen
Design the new screen with:

1. **The wheel (hero element):**
   - **3D-perspective wheel** — tilted slightly (CSS transform: perspective +
     rotateX) so it has depth. Not flat.
   - **Vibrant slice colors** — alternating from a palette (red, blue, green,
     yellow, purple, orange — high saturation, kid-friendly).
   - **Student names + emoji avatars** on each slice (large, readable from across
     the room; rotated to follow the slice angle).
   - **LED rim lights** — small dots around the circumference that chase/pulse
     during the spin (CSS animation or SVG). Like a carnival wheel.
   - **Center hub** — a decorative center (the app logo or a star) with a subtle
     glow.

2. **The ticker (pointer):**
   - A **physical-looking flapper** at the top (12 o'clock position) that
     **bounces** as each slice passes during the spin (visual "click"). This is
     the key tactile feedback that makes a wheel feel real.

3. **The spin animation:**
   - **Phase 1 (acceleration, 0.5s):** wheel ramps up to full speed. LED lights
     chase rapidly. Ticker bounces fast.
   - **Phase 2 (full speed, 2s):** names blur. LED lights streak. Ticker is a
     continuous blur. The class sees colors flashing.
   - **Phase 3 (deceleration, 1.5s):** wheel slows. Names become readable again.
     Ticker bounces slower + louder (visually bigger bounces). **The final 0.5s
     is dramatic slow-mo** — the wheel crawls past 2-3 slices, the class screams.
   - **Total: ~4 seconds.**

4. **The landing (reveal):**
   - The winning slice **glows** (radial burst of light from the slice).
   - The slice **scales up slightly** (pops forward).
   - **Confetti** in the slice's color bursts from the wheel center.
   - The winner's **name + avatar zoom from the wheel to center screen** (not a
     modal — an emergent animation FROM the wheel). "🎉 LEO! 🦁" in huge text.
   - **"Your Turn!"** badge stamps on.
   - **2-3 second hold** → fade → the exercise begins.

5. **Idle state:**
   - Wheel **slowly rotates** (0.5 RPM — barely moving, like a lazy Susan).
   - Subtle LED pulse (breathing effect).
   - Prompt text: "👆 Teacher: tap SPIN to pick!" (or "Waiting..." if the system
     is between rounds).

6. **Fairness panel (sidebar or bottom strip):**
   - Shows the roster with **checkmarks** (✓ had a turn) / **dots** (○ waiting).
   - "Round-robin: 3/8 had a turn this exercise."
   - This is informational (read-only) — proves fairness to the class.

7. **Visual identity:**
   - The wheel is **phase-agnostic** (it appears in any phase). Use a **neutral
     but energetic** palette — dark background (for contrast) + vibrant slice
     colors + warm gold accents (the "carnival" feel).
   - The energy is **anticipation + celebration** — not calm (input) or intense
     (assess). It's its own thing: the "drum roll" moment.

### Part C — Google Stitch prompt
Write a single detailed prompt for Google Stitch to prototype this screen.
Include:
- **Three views to prototype:** (a) the idle wheel (slowly rotating, LED
  breathing, "Tap SPIN" prompt, fairness panel showing 3/8 checked), (b) the
  mid-spin (blurred names, chasing LEDs, bouncing ticker, motion streaks), and
  (c) the landing reveal (winning slice glowing + zooming to center: "🎉 LEO!
  🦁" + confetti + "Your Turn!" badge).
- Example content: 8 students (Leo 🦁, Mia 🦊, Ben 🐻, Jenny 🦋, Sam 🐧, Ada 🦉,
  Tom 🐯, Zoe 🦓). Winner: Leo. Round-robin: 3/8 checked (Leo ✓, Mia ✓, Ben ✓,
  Jenny ○, Sam ○, Ada ○, Tom ○, Zoe ○).
- The 3D perspective, the LED rim, the ticker, the slice colors, the fairness
  panel, the zoom-from-wheel reveal (not a modal).
- Layout: wheel center (60-70% of screen), fairness strip at bottom.

Format the Stitch prompt as a single copy-pasteable block.

## Constraints (same as before)
- Pure visual (teacher triggers the spin from Commander/Remote; students watch
  the board). No student devices.
- Region-safe, bilingual (student names in English; the fairness panel can show
  English names), huge text, high contrast, React/Tailwind/framer-motion.
- The board is landscape 16:9, viewed from 5–10m away.
- The wheel outcome is **pre-determined** (round-robin fairness) — the animation
  is the show. The design must make a pre-determined result feel genuinely
  exciting + random.

---

**Now begin.** Research → redesign → Stitch prompt. Make me feel the class
holding its breath as the wheel slows, the ticker clicking, the lights
blurring — and then the EXPLOSION when it lands on their friend's name. This
is the moment that makes a kid say "I love English class."
