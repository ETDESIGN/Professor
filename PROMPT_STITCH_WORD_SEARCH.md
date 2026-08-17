# Word Search — Google Stitch UI Design Prompt

> Usage: paste the prompt below into Google Stitch (https://stitch.withgoogle.com) as the
> FIRST message of a new chat. Stitch will brainstorm several design directions and render
> the gameplay screen for each. Pick ONE direction, then ask Stitch to produce the remaining
> screens with the follow-up message included at the bottom of this file. When the screens
> are done, export/copy them back so they can be ported into `BoardWordSearch.tsx` (Tailwind).

---

## The prompt (paste this first)

You are designing the UI for **"Word Search"** — a vocabulary game inside **"Professor"**,
an ESL classroom app for kids aged 6–12. The design will be displayed on a **projected
classroom board (16:9 landscape)** that the whole class sees from several meters away, and
that children tap directly on an interactive whiteboard. Design at desktop/web scale, single
screen, landscape orientation.

**How the game works:**

- 3 rounds. Each round hides 5 English vocabulary words inside a letter grid (8×8 up to 10×10).
- Before each round, a **preview screen** shows the 5 target words as cards (illustration +
  the word) so the class learns them, with a big "Start Round" button.
- The **gameplay screen** has: the letter grid in the center; **5 "clue cards"** arranged as
  flanks (3 on the left, 2 on the right), each showing only an illustration — tapping a card
  reveals the word and plays its pronunciation; and a bottom **HUD** with: a found-words
  counter (e.g. "3/5 found"), a misses counter, a clues counter, a draining horizontal time
  bar with a mm:ss readout, and 3 round-progress dots.
- The child selects a word by tapping its first letter then its last letter (or dragging): a
  **translucent pill highlight** spans the selected letters. A correct word locks with a
  colored pill, its clue card gets a gold checkmark, and the word is spoken aloud.
- A **"Clue" button** briefly circles the first letter of an unfound word (penalty: that
  word's points are halved — show a small "½" badge on its clue card).
- When all 5 words are found, a **round summary overlay** appears: words found, time taken,
  misses, clues used, plus an animated "time bonus" award line, and a "Next Round" button.
- After round 3, a **final screen** shows a 1–5 star rating for the class (stars fill one by
  one), the totals (words found / misses / clues), and "Play Again" + "Next" buttons.
- Also needed: a **"Who found it?" overlay** — a modal with the class roster as big avatar
  chip buttons (student avatar + name), used by the teacher to credit the child who spotted
  the word, plus a "No credit" option.

**WHAT I WANT FROM YOU — BRAINSTORM FIRST, DO NOT JUMP TO FINAL DESIGNS.**

Step 1: Propose **4 distinct visual design directions**. Each direction must have:
- a short memorable **name**,
- a **mood description** (color palette, shape language, typography feel, illustration
  style, motion personality — how things pop, bounce, celebrate),
- one sentence on **why it suits a projected classroom game for kids**.

Make the directions genuinely different from each other — for example a cozy magical
night-sky theme, a bold arcade/candy theme, a clean modern educational theme, and an
adventure/expedition theme — or better ideas of your own.

Step 2: For EACH direction, design the **gameplay screen only** (letter grid + 5 clue cards
+ HUD). Keep the layout structure identical across all four — center grid, 3 clue cards on
the left flank, 2 on the right, HUD along the bottom — so I can compare the styling, not
the layout. Use placeholder illustrations (simple animals/objects: bird, nurse, pilot,
dancer, farmer) and real-looking letters in the grid with one word found (locked pill) and
one word being selected (yellow pill).

**Hard constraints for every direction:**

- 16:9 landscape, projector-friendly: **dark or deep-saturated backgrounds**, very high
  contrast, large grid letters readable from the back of a classroom.
- Big, rounded, forgiving touch targets — 6–12 year olds tap this board.
- The grid letters and the 5 clue-card images are the visual heroes; everything else
  (HUD, counters) stays calm and secondary so a teacher can read the game state at a glance.
- Playful and alive, but never chaotic or cluttered.
- No text smaller than ~18px, no thin light fonts, no low-contrast pastels on light
  backgrounds.
- For each direction, also list its **design tokens**: exact color palette (hex), font
  pairing suggestion, corner-radius scale, and the motion personality in 2–3 words.

After showing the 4 directions, **STOP and wait for me to pick one.**

---

## Follow-up message (send this AFTER you pick a direction)

I pick direction **[NAME]**. Now produce the remaining screens in this direction, same
design tokens, 16:9 landscape:

1. **Round preview** — "ROUND 2 / 3" title, the 5 word cards (image + word), "Start Round" button.
2. **Round summary overlay** — over a dimmed gameplay screen: stats tiles (words found, time,
   misses, clues), the time-bonus award line, "Next Round" button.
3. **Final screen** — "THE END", 1–5 stars (3 filled), class result totals, "Play Again" +
   "Next" buttons.
4. **"Who found it?" overlay** — modal over the gameplay screen: the word + points at top,
   a grid of student avatar chips (avatar + name), "No credit" link at the bottom.
5. One **variant state** of the gameplay screen: round 3, clue-card mode where the English
   word is HIDDEN (image only, "tap to hear it"), one card showing the "½ pts" clue badge,
   and the clue ring pulsing around a grid letter.
