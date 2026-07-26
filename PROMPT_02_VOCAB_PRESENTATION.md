# PROMPT 02 — Vocabulary Presentation Screen (FOCUS_CARDS / Word Lab on the board)

> This continues the same conversation. You already know the project, the Live
> Board model (pure-visual projector, no student devices, teacher = conductor),
> the locked decisions (round-robin, unified points, teams, 3 response modes),
> and the ClassroomBoard Shell from Prompt 01. Now we design the **first
> pedagogical step** that renders inside that shell: the **Vocabulary
> Presentation** (the INPUT phase — where the teacher introduces new words to
> the class).

---

## The screen: Vocabulary Presentation (INPUT phase)

This is the **first teaching step** in a live lesson. The teacher presents the
unit's ~5–10 vocabulary words to the class so they can **see the image, hear the
word, see the spelling + IPA, see the Chinese meaning, and hear the example
sentence** — all bound together at the moment of learning (dual-coding theory).
The class repeats aloud (choral) after the audio.

### What we want (the redesign goal):

**Two modes, teacher-controlled:**

1. **Overview Grid** — show **5 cards at once** in a grid (responsive 2×3 or
   3×2). Each card shows: **image + the English word** (big). This gives the
   class a visual overview of the full vocabulary set. The teacher can point to
   each and say "Today we'll learn these words."

2. **Drill View** — the teacher **taps a card** → it **enlarges to full screen**
   (a "stage moment"). The enlarged card shows:
   - **Image** (large, prominent — the visual anchor).
   - **English word** (huge, projector-legible).
   - **Speaker button** ("Listen" — plays the TTS audio of the word; class repeats).
   - On **flip** (teacher taps or remote Flips): **IPA phonetic** + **Chinese
     translation (Simplified Chinese)** + **definition** + **example sentence**
     + a second speaker ("Hear sentence" — plays the sentence audio).
   - A **checkmark** appears when the card is "studied" (flipped + audio played).

The teacher advances card-by-card (Prev/Next from the remote), the class echoes
each word, and when all cards are studied → a **"Start Practice →"** prompt
signals the transition to the next phase (controlled by the teacher).

### Current state (what exists today):
- A **single** 3D flip card (one word at a time — NO grid overview).
- Front: image + word + Listen button.
- Back: IPA + Chinese L1 + example sentence + Hear Sentence button.
- Remote controls: Prev / Flip / Next.
- **Missing:** no grid overview, no "5 cards at once," no progress checkmarks,
  no "Start Practice" transition prompt, no choral-repeat cue.

### Problems:
1. **One card at a time** — the class can't see the full set; no comparison/
   contrast between words (important for confusables like ship/sheep).
2. **No overview** — the teacher can't show "here are today's 5 words" as a set.
3. **No progress tracking** — no visual indication of which words have been
   studied.
4. **No choral-repeat cue** — no visual prompt for the class to "repeat after
   the audio" (a wave/sound icon that pulses during playback).
5. **Flip is a binary state** — the meaning is either hidden or shown; no
   staged reveal (image → word → audio → meaning → sentence).

### The content (what each card holds):
From the enriched unit manifest:
- `word` (English) — the target vocabulary word.
- `image_url` — a generated illustration (Pollinations Flux, child-friendly).
- `phonetic` — IPA transcription (e.g., /ˈelɪfənt/).
- `l1_translation` — Simplified Chinese meaning (e.g., 大象).
- `definition` — simple English definition.
- `example_sentence` — a sentence using the word.
- `audio_url` — TTS audio of the word.
- `example_audio_url` — TTS audio of the example sentence.
- `confusables` — words easily confused (for later drill games).

---

## What I need from you (Claude)

### Part A — Research
Research **classroom vocabulary presentation** best practices:
- **Flashcard teaching for young ELLs** (YL/ESL): multi-modal presentation,
  choral repetition, staggered reveal, the "listen → repeat → recall" cycle.
- **Visual word walls / picture dictionaries** — how to present a SET of words
  visually (grid layouts, color coding, grouping).
- **Presentation tools** (Nearpod, Quizlet Live, ClassDojo) — how they present
  vocabulary on a big screen for a class.
- **Choral repetition techniques** — call-and-response, echo drilling, how to
  visually cue "everyone repeat" on screen.
- **Dual-coding theory (Mayer/Paivio)** — binding image + word + sound at the
  moment of learning for maximum retention.

### Part B — Redesign the Vocabulary Presentation screen
Design the new screen with:

1. **Overview Grid** layout:
   - 5 cards visible (responsive grid). Each card = image + word.
   - Studied cards have a subtle checkmark/dim.
   - The teacher taps any card → enters Drill View.

2. **Drill View** (full-screen single card):
   - **Staged reveal** (not binary flip): the teacher controls what's visible:
     - Stage 1: **image + word** only (visual binding).
     - Stage 2: + **Listen** button (audio binding; class repeats).
     - Stage 3: + **IPA** + **Chinese meaning** (meaning binding).
     - Stage 4: + **example sentence** + Hear Sentence (context binding).
   - Each stage is a teacher-controlled step (remote: "Reveal More").
   - **Choral-repeat cue**: when audio plays, a visual pulse/ripple radiates from
     the speaker icon + the text "Repeat!" appears briefly.

3. **Progress** — a row of dots/icons at the bottom showing which words are
   studied (✓) vs pending (○). Clickable by the teacher to jump.

4. **Transition** — when all studied: a prominent **"Start Practice →"** prompt
   (teacher-controlled, not auto-advancing).

5. **Visual identity** — this is the INPUT phase. Use the shell's INPUT color
   theme (calm blue). Big, clear, focused. One word at a time in Drill View
   (no clutter). The image dominates; text is secondary.

6. **Bilingual design** — English word is large/primary; Chinese is smaller/
   secondary (revealed at stage 3). IPA is mono-spaced, smaller.

### Part C — Google Stitch prompt
Write a single detailed prompt for Google Stitch to prototype this screen.
Include:
- **Two views to prototype:** (a) the Overview Grid (5 cards), and (b) the
  Drill View (one card enlarged, stage 3: image + word + IPA + Chinese +
  Listen button + example sentence).
- Example content: words = elephant, zebra, tiger, giraffe, monkey. Images =
  child-friendly cartoon illustrations. IPA = /ˈelɪfənt/ etc. Chinese = 大象,
  斑马, 老虎, 长颈鹿, 猴子.
- The phase context (INPUT — calm blue theme).
- Layout zones, colors, typography, the staged reveal.
- The progress dots at the bottom (✓✓○○○).
- The "Start Practice →" transition prompt.

Format the Stitch prompt as a single copy-pasteable block.

## Constraints (same as before)
- Pure visual (no teacher controls visible on the board; teacher operates from
  the Commander/Remote).
- Region-safe, bilingual (English + Simplified Chinese), huge text, high
  contrast, React/Tailwind/framer-motion.
- The board is landscape 16:9, viewed from 5–10m away.

---

**Now begin.** Research → redesign → Stitch prompt. Be visual + specific.
