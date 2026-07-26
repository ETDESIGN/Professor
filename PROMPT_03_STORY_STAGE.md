# PROMPT 03 — Story Stage Screen (STORY_STAGE — the OUTPUT phase)

> This continues the same conversation. You already know the project, the Live
> Board model, the ClassroomBoard Shell (Prompt 01), and the Vocabulary
> Presentation (Prompt 02). Now we design the **Story Stage** — the screen
> where the teacher tells a story to the class using the board as a visual
> storybook / cinematic narrative.

---

## The screen: Story Stage (OUTPUT phase)

This is the **narrative/context step** in the lesson arc. After the vocabulary
has been presented (INPUT), the teacher uses the board to **tell a story** that
uses the target words in context — giving the class comprehensible input
(Krashen): they hear the words they just learned, embedded in an engaging
narrative with characters, images, and dialogue.

**Think of it as a digital storybook / picture-book on a projector** — the
teacher narrates (or plays the narration audio), the class follows along, and
target vocabulary words are highlighted so students notice them in context.

### What we want (the redesign goal):

A **cinematic, page-by-page story experience** on the projector:

1. **Page-based navigation** — the story has 3–5 pages. Each page shows:
   - A **full-bleed scene image** (the setting/illustration for that page).
   - A **dialogue panel** at the bottom (like a comic / visual-novel dialogue
     box) containing the page's text, with the **speaker's name + avatar**.
   - **Target vocabulary words highlighted** in the text (colored/underlined) so
     the class notices them in context.

2. **Read-along audio** — a prominent **"Read Page"** button that plays the
   TTS narration of the page's text. The class listens + follows along. As the
   audio plays, the text could **highlight word-by-word** (karaoke style) so
   early readers can track.

3. **Tap-a-word** — any highlighted target vocab word in the story text is
   **tappable** → pops a small card (word + image + IPA + Chinese + Listen).
   This re-binds the word's meaning in context (input reinforcement).

4. **Page navigation** — the teacher advances page-by-page (remote: Next/Prev
   Panel). A **progress indicator** (dots or page numbers) shows position. The
   last page has a **"Comprehension Check →"** transition prompt.

5. **Characters** — the story has 2–4 characters with names, roles, emojis, and
   personality. Each character's dialogue is attributed (avatar + name above the
   text). The teacher can use different voices for different characters.

6. **Cinematic transitions** between pages (slide/fade, like a picture book
   turning). The scene image changes; the dialogue panel animates in.

### Current state (what exists today):
- Page-based with an image + speaker avatar + dialogue text.
- A "Read Page" speaker button (plays TTS / speechSynthesis) — **already added**.
- NEXT_PANEL / PREV_PANEL remote controls.
- **Missing:** word-by-word karaoke highlighting, tap-a-word popups, page-turn
  animation, comprehension-check transition, character voice differentiation,
  full-bleed cinematic feel. Currently looks more like a static card than a
  storybook.

### Problems:
1. **Not cinematic** — the current layout is a basic card with text; it doesn't
   feel like a story being told. No immersion.
2. **No word highlighting** — target vocab words in the story text aren't
   visually distinct; students can't spot "elephant" in a sentence.
3. **No tap-a-word** — can't interact with a word mid-story to re-see its meaning.
4. **No karaoke tracking** — early readers can't follow along as the audio plays.
5. **No page-turn animation** — pages just swap; no "turning the page" feel.
6. **No comprehension transition** — the story ends abruptly with no prompt to
   check understanding.
7. **Characters are flat** — no visual personality (just an emoji + name); the
   class doesn't feel invested in who's speaking.

### The content (what each story holds):
From the enriched unit manifest:
- `story.title` — the story title.
- `story.setting` — where it happens.
- `story.pages[]` — array of pages, each with:
  - `text` — the narrative/dialogue text (2–3 sentences).
  - `speaker` — the character name speaking.
  - `image_prompt` / `image` — the scene illustration.
  - `comprehension_questions[]` — 1–2 questions per page (for the post-story
    check): `{question, options[], answer}`.
- `characters[]` — 2–4 characters with `{name, role, personality, emoji,
  image_prompt}`.

---

## What I need from you (Claude)

### Part A — Research
Research **storytelling in the YL/ESL classroom** + **digital storybook UIs**:
- **Shared reading / dialogic reading** (Grover J. Whitehurst) — how read-alouds
  work for young language learners; the role of prediction, elaboration, and
  vocabulary in context.
- **Comprehensible input (Krashen)** — i+1; how stories embed target vocabulary
  at a level slightly above the learner's current competence.
- **Digital storybooks / interactive picture books** — Epic!, Reading A-Z,
  Vooks (animated storybooks) — how they present text + image + narration on a
  screen.
- **Karaoke-style text highlighting** — word-by-word or phrase-by-phrase sync
  with audio; how to cue early readers to follow along.
- **Visual-novel / dialogue-box UIs** — how games (like Ace Attorney, Danganronpa)
  present character dialogue with avatars + text reveal; the "stage" feel.
- **Pre/during/post reading framework** — the three-phase reading model
  (activate prior knowledge → read + interact → check comprehension).

### Part B — Redesign the Story Stage screen
Design the new screen with:

1. **Full-bleed cinematic scene** — the page's illustration fills the screen
   (edge-to-edge), creating immersion. The dialogue panel floats over the bottom
   third (semi-transparent, blurred backdrop — like a visual novel).

2. **Dialogue panel** (the "storybook text box"):
   - **Speaker avatar** (left side, large emoji or character image) + **name +
     role** above the text.
   - **The text** rendered in large, readable type. **Target vocabulary words
     highlighted** (colored bold + subtle underline). These are tappable.
   - **"Read Page"** button (speaker icon) — plays the narration. While playing,
     the text **highlights word-by-word** (karaoke) so the class tracks.
   - **Tap-a-word popup**: tapping a highlighted word pops a small card
     (image + word + IPA + Chinese + Listen) that overlays briefly.

3. **Page-turn animation** — swiping or pressing Next triggers a **page-flip /
   slide transition** (framer-motion). The scene image + dialogue change with a
   cinematic feel (like turning a page in a picture book).

4. **Progress indicator** — page dots at the bottom (● ● ○ ○ ○) or "Page 2 of 5."
   Clickable by the teacher to jump.

5. **Character visual personality** — each character has a distinct color +
   emoji/avatar. When they speak, their avatar is prominent + their color themes
   the dialogue panel border.

6. **Comprehension transition** — on the last page: a **"Comprehension Check →"**
   prompt (teacher-controlled). This transitions to a post-story quiz
   (comprehension questions from the manifest) — but the quiz screen itself is a
   separate exercise (we'll design it later). For now, just the transition prompt.

7. **Pre-story hook** (optional, if scope allows) — before page 1: a brief
   "story preview" showing the title + setting + character lineup, building
   anticipation. Like a movie title card.

8. **Visual identity** — this is the OUTPUT phase. Use a **warm, narrative
   palette** (amber/gold + cream — like a storybook). The feel should be calm,
   immersive, focused — NOT high-energy (that's for practice/assess). Think
   "snuggle-up story time" energy.

### Part C — Google Stitch prompt
Write a single detailed prompt for Google Stitch to prototype this screen.
Include:
- **Two views to prototype:** (a) the main story page (full-bleed scene +
  dialogue panel with highlighted words + Read button + character avatar), and
  (b) the tap-a-word popup overlay (word card over the story).
- Example content: story = "A Day at the Zoo." Page 2: speaker = "Teacher Ted,"
  text = "Look at the **elephant**! It has big ears and a long trunk. Can you
  say **elephant**?" Image = a cartoon zoo scene with an elephant. Highlighted
  words: elephant (×2).
- Characters: Teacher Ted (🧑‍🏫, red), Ben (👦, blue), Mia (👧, green).
- The phase context (OUTPUT — warm amber theme).
- Layout zones, colors, typography, the dialogue panel, the karaoke cue.
- Progress: Page 2 of 4 (● ● ○ ○).

Format the Stitch prompt as a single copy-pasteable block.

## Constraints (same as before)
- Pure visual (no teacher controls visible on the board; teacher operates from
  the Commander/Remote).
- Region-safe, bilingual (English + Simplified Chinese available on tap-a-word),
  huge text, high contrast, React/Tailwind/framer-motion.
- The board is landscape 16:9, viewed from 5–10m away.

---

**Now begin.** Research → redesign → Stitch prompt. Make me feel like I'm
watching a story unfold on a big screen — not reading a textbook.
