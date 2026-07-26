# Vocabulary Presentation Screen (INPUT Phase)
### Research → Redesign → Google Stitch Prompt

This is the first pedagogical step that renders inside the ClassroomBoard Shell from Prompt 01. Same rules apply: pure display, no student devices, teacher drives everything from the Commander/Remote, board shows read-only content.

---

## PART A — Research: How Vocabulary Should Be Presented to a Room

### A1. Dual-coding theory — why image + word + sound must bind together
Dual coding theory holds that <cite index="16-1">memory and cognition are served by two separate systems, one specialized for verbal information and one for non-verbal information</cite>, and combining them produces stronger retention than either alone — <cite index="19-1">everyone benefits from combining verbal and visual representations because the two encoding systems are universal features of human cognition, not a matter of individual "learning style."</cite> Critically, <cite index="15-1">aural recognition requires learners to store a phonological representation of a word — knowing what it sounds like — and this auditory dimension is often the most overlooked in conventional classrooms.</cite>

**Design consequence:** the drill card can't just be image+text. Audio needs to be a first-class, unmissable step in the sequence — not a secondary icon a teacher might forget to press.

### A2. Staged reveal beats binary flip
Classroom dual-coding guidance recommends introducing new terms by pairing the word with a visual first, then building outward — <cite index="20-1">when introducing new terms, write the word on the board alongside a simple diagram or icon</cite> before adding further explanation. Presenting everything at once (word + IPA + translation + sentence in a single flip) creates cognitive overload right at the moment a learner is still binding the image to the sound.

**Design consequence:** the current single flip (front/back) collapses four distinct bindings into two states. It should become a **4-stage reveal** — image+word → +audio → +meaning → +context — each stage a deliberate teacher action, matching how <cite index="17-1">breaking new information into small steps helps students retain it</cite>.

### A3. Flashcard-as-set, not flashcard-as-singleton
Traditional ESL flashcard practice treats the deck as a *visible set* the class can scan, point to, and compare, not one card in isolation — <cite index="14-1">flashcards are attached to the board so all students can see the images clearly, and the class practices identifying and pronouncing the word associated with each image the teacher points to.</cite> A worked classroom example has students physically holding up the matching card when a term is named, which only works because the *whole set* stays visible and referenceable throughout the lesson, not just one term at a time.

**Design consequence:** the overview grid isn't a "menu" — it's the actual pedagogical object the teacher points at and narrates ("today's words are..."), and it needs to remain reachable (not just a one-time splash) so the teacher can jump back to compare confusable words side by side.

### A4. Choral / echo drilling needs a visible cue, not just an audio cue
Echo-drilling activities depend on a shared, externally-visible rhythm — the class watches the teacher/board for the beat, not just listens. In practice this is done physically (teacher points, flashes the card, the class chants in unison). On a screen with no teacher gesture visible to a projector-only surface, the "repeat now" moment needs its own visual signal so 10 kids repeat *together*, not staggered.

**Design consequence:** an on-screen pulse/ripple synced to audio playback, with a brief "Repeat! 跟读！" prompt, replaces the physical point-and-flash cue a teacher would use with paper cards.

### A5. Progress-as-set-completion (word wall logic)
Picture-dictionary and word-wall practice treats "today's words" as a checklist the class collectively works through and can see completing — reinforcing that the INPUT phase has a clear finish line before moving to PRACTICE. This matters pedagogically as much as visually: kids know how many words are left, which manages attention and anticipation in a room of 5-15 children.

**Design consequence:** progress needs to be visible in *both* views — as checkmarks fading into overview cards, and as a dot rail in Drill View — and it should double as navigation the teacher can use to jump between words.

### Synthesis — five rules for this screen
1. **Show the set before you drill into it.** Overview Grid always comes first; Drill View is a zoom-in, not a replacement.
2. **Reveal in stages, teacher-paced.** Never dump IPA + translation + sentence in one flip.
3. **Audio is a step, not a decoration.** Every audio play gets a visible "repeat now" cue the whole room can follow.
4. **Progress is always visible and always reversible.** Checkmarks + dots the teacher can tap to jump back for comparison (e.g., ship vs. sheep).
5. **Image dominates; text is a caption, not a co-lead** — especially in Stage 1, where the visual-to-word binding is the whole point.

---

## PART B — Redesign: Vocabulary Presentation Screen

### B0. Two views, one flow
```
OVERVIEW GRID  ──(teacher taps a card)──▶  DRILL VIEW (Stage 1)
     ▲                                           │
     │                                    (teacher: Reveal More)
     │                                           ▼
     │                                     DRILL VIEW (Stage 2: +Listen)
     │                                           │
     │                                    (teacher: Reveal More)
     │                                           ▼
     │                                     DRILL VIEW (Stage 3: +IPA +中文)
     │                                           │
     │                                    (teacher: Reveal More)
     │                                           ▼
     │                                     DRILL VIEW (Stage 4: +sentence)
     │                                           │
     │                              (teacher: Next word, or back to grid)
     └───────────────(teacher: back to grid)─────┘

All words studied → "Start Practice →" prompt appears (teacher advances phase)
```
Both views live inside the shell's existing content-panel frame (INPUT blue theme, phase rail already shows INPUT active). Nothing here duplicates or replaces shell chrome — this is what renders *inside* the stage.

### B1. Overview Grid

**Layout:** a responsive grid, 5 cards for a typical unit (3×2 with one empty/placeholder slot, or 2×3 depending on card aspect ratio — design for 5 as the common case, scale gracefully to up to ~10 for larger units by shrinking card size before wrapping to a 3rd row).

**Each card:**
- Large square/portrait image filling the top ~70% of the card (child-friendly illustration, consistent style/palette across the set).
- English word beneath, bold, large enough to read from across the room even at grid scale (this is smaller than Drill View hero text, but still oversized relative to normal UI — think large marquee text, not label text).
- A small checkmark badge (top-right corner of the card) once studied; unstudied cards have no badge and sit at slightly lower opacity/saturation than the "today's focus" framing — but never so dim they're unreadable, since the class needs to see the whole set clearly from the start.
- No Chinese, no IPA, no sentence at this stage — the grid is pure image+word binding (Stage 1 of dual coding, applied to the whole set at once).

**Header context inside the panel:** a small caption row above the grid, e.g. "Today's Words · 今天的单词" — signals this is the full set for the unit, framed as content, not navigation.

**Selection state:** when the teacher has a card "focused" (about to drill into, or just returned from), that card gets a soft glow ring — matching the shell's existing glow language — so the class can see which word is currently "live" even before the zoom transition happens.

**Transition into Drill View:** the selected card scales up and re-centers to fill the stage (a "zoom into the card" motion, ~400-500ms, easing so it feels like stepping *into* the card rather than a hard cut) — reinforcing that Drill View is the same object, just enlarged, not a different screen.

### B2. Drill View — staged reveal

Full-stage single card, centered, generous padding. The **image is always the dominant visual element** at every stage — large, roughly 40-45% of stage height, never shrinking to make room for text; text areas below/beside it grow instead.

**Stage 1 — Image + Word**
- Large image (hero-scale).
- English word beneath in hero typography (this is the biggest text on the whole screen, bigger than anything in the shell chrome).
- Nothing else. No buttons, no IPA, no Chinese — pure visual-verbal binding, matching dual coding's first pairing.
- A quiet ambient state; this is the "look at this" moment.

**Stage 2 — + Audio cue**
- A speaker glyph appears near the word (styled as a static icon indicating audio is associated with this stage — since teacher controls playback from the Remote, this is a *state indicator*, not a pressable button).
- When audio plays (triggered by the teacher's Remote), a soft ripple/pulse animates outward from the speaker glyph in sync with playback, and the words "Repeat! 跟读！" appear briefly beneath the word in a bright, friendly callout, then fade after the ripple completes — this is the choral-cue from A4, timed to the actual audio duration so the whole room repeats together.

**Stage 3 — + Meaning**
- IPA phonetic appears in a monospaced, medium-sized text directly under the English word (e.g. `/ˈelɪfənt/`), styled distinctly from the word itself so it reads as pronunciation guidance, not a second word.
- Simplified Chinese translation appears beside or beneath the IPA, in a secondary (but still very legible) size — large enough to read from the back of the room, but clearly subordinate to the English hero word.
- A simple English definition may appear here too, smallest of the three, positioned last in reading order.

**Stage 4 — + Context**
- The example sentence appears in a lower panel/strip, with the target word visually emphasized within the sentence (bold or accent-colored), plus a second, distinct speaker glyph for the sentence audio — visually differentiated from the word's speaker glyph (e.g. paired with a small "sentence" icon or a slightly different color) so the class can tell which audio is about to play.
- Sentence audio triggers the same ripple + "Repeat!" cue pattern as Stage 2, so the choral-repeat rhythm is consistent throughout.
- Once Stage 4's audio has played, the card is marked **studied** — this is what lights the checkmark back on the Overview Grid and fills the corresponding progress dot.

**Stage indicator:** a minimal row of 4 small dots directly below the card (distinct from the word-progress dots at the very bottom of the stage) shows which of the 4 reveal stages is active — small enough not to compete with content, present enough that the teacher and class always know "how much more is coming" for this word.

### B3. Progress rail (bottom of stage, both views)

A row of dots/thumbnails, one per vocabulary word in the unit — ✓ (filled, checked) for studied words, ○ (outline) for pending, and the currently-active word's dot enlarged/glowing. This rail persists across both Overview Grid and Drill View so position in the set is never ambiguous. Visually it's a read-only progress strip (matches the shell's phase-rail visual language), and functionally the teacher can jump to any word from the Remote — but the board itself only *displays* the state, it doesn't invite taps.

### B4. "Start Practice →" transition prompt
Once every word's progress dot is filled, a prompt appears in the stage — replacing the "current word" framing with a calm, celebratory micro-moment: a checkmark-filled progress rail, a short affirming line ("Great! You've learned 5 new words · 太棒了！你学会了5个新单词"), and a clearly-labeled but non-interactive "Start Practice →" indicator (styled as a signpost/plaque, not a button — the teacher advances the phase from the Remote; this is a readout confirming the board is *ready* to move on, not something students would tap).

### B5. Visual identity
Inherits the shell's INPUT phase theme in full: deep blue-slate background wash (`#0F1B2E`), blue accent glow (`#3B82F6`/`#60A5FA`) on the content panel border and active-state elements, near-white text (`#F8FAFC`). No new phase colors are introduced — this screen should feel like it's clearly living *inside* the INPUT chapter of the lesson, consistent with whatever else appears during that phase.

Card surfaces themselves sit slightly lighter than the pure background (a soft dark-blue card fill, e.g. `#16233B`) so cards read as distinct objects on the stage rather than blending into the wash.

### B6. Bilingual typography
- English word (Drill View hero): largest text on screen, bold, rounded geometric sans, ~120-140px equivalent.
- English word (Grid cards): same family, much smaller but still oversized relative to normal UI (~36-48px equivalent).
- IPA: monospaced, medium weight, ~32-40px, always paired directly with the English word so pronunciation reads as "attached" to the word, not a separate fact.
- Chinese translation: clean neutral sans (PingFang SC or similar), ~40-56px in Drill View — noticeably smaller than the English hero word but still legible from the back of the room, reinforcing "English is primary, Chinese is support" per the bilingual design goal.
- Definition / example sentence: smallest reveal-stage text, ~28-32px, but still well above ordinary UI body-text size given the viewing distance.

### B7. Motion language
- Grid → Drill zoom-in: ~450ms, card scales/re-centers into full stage.
- Stage reveals (2→3→4): each new element enters with a soft upward fade+slide (~300ms), not a jump-cut — reinforces "adding," not "replacing."
- Audio ripple: radial pulse synced to actual audio duration, 2-3 concentric rings, fades as audio ends; "Repeat!" callout fades in fast (150ms) and lingers slightly past the ripple before fading out.
- Checkmark completion: small celebratory pop (scale-bounce) on both the Drill View corner badge and the corresponding Overview Grid card/progress dot, so completing a word feels rewarding without needing full-screen confetti (that's reserved for bigger moments per the shell's motion language).
- Start Practice prompt: gentle rise-and-settle entrance, calmer than a phase-change transition since this is a soft internal milestone, not a full phase shift.

---

## PART C — Google Stitch Prompts

Both views share the same display-only rule from the ClassroomBoard Shell: this is a projector surface students watch, not a UI they touch. Every element must read as a readout/content object, never as a button, tab, or clickable control — the teacher's actual controls (advance, reveal, play audio, jump between words) live on a separate Teacher Remote device and never appear on this screen.

### C1. Overview Grid prompt

```
Design a high-fidelity UI mockup for the "Vocabulary Overview Grid" — a
screen that renders inside a classroom projector display (ClassroomBoard),
during the INPUT phase of an English lesson for Chinese-speaking K-12
students. Landscape 16:9, 1920x1080 reference canvas, viewed from 5-10
meters away by a class with no devices of their own — huge, high-contrast,
glanceable.

CRITICAL — DISPLAY-ONLY: This is a passive projector surface. Students never
touch it. There are no buttons, tabs, menus, or clickable controls anywhere
on screen — the teacher controls everything from a separate remote device.
Every element here (cards, checkmarks, progress dots) is a read-only content
readout, not app UI chrome.

BACKGROUND: deep blue-slate gradient wash, approx #0F1B2E to #0A1220
(matching the "INPUT" phase of the parent app), subtle and calm.

CONTENT: a small caption near the top reads "Today's Words · 今天的单词" in
clean white text. Below it, a grid of 5 large vocabulary cards (arrange as
3 cards top row, 2 cards bottom row, centered), each card:
- A large square image filling most of the card (simple, friendly,
  colorful cartoon animal illustrations: elephant, zebra, tiger, giraffe,
  monkey — one per card, consistent flat-illustration style across all 5),
  rendered on a soft rounded card surface slightly lighter than the
  background (#16233B).
- The English word in large bold rounded sans-serif text beneath the image
  (e.g. "Elephant", "Zebra", "Tiger", "Giraffe", "Monkey").
- Two of the five cards (elephant, zebra) show a small glowing checkmark
  badge in the top-right corner, indicating they've already been studied;
  the other three (tiger, giraffe, monkey) have no badge yet.
- The "tiger" card has a soft blue glow ring around its edge, indicating
  it's the currently-focused word (about to be studied next) — this is a
  passive highlight, not a hover/pressed button state.

BOTTOM: a slim horizontal progress rail with 5 small dots, 2 filled/checked
(matching the studied cards), 3 outlined/pending, the 3rd dot slightly
enlarged and glowing to match the focused "tiger" card.

STYLE: energetic but calm and focused (this is the INPUT phase, not a
competitive game moment) — kid-friendly, warm, polished, rounded corners,
soft glows instead of hard drop shadows, bilingual typography (English
large/primary, Chinese smaller/secondary), no third-party logos or branded
IP, no button or tab styling anywhere.
```

### C2. Drill View prompt (Stage 3: image + word + IPA + Chinese + Listen indicator)

```
Design a high-fidelity UI mockup for the "Vocabulary Drill View" — a
full-stage single-word teaching moment inside the same ClassroomBoard
projector display, INPUT phase, immediately following the Overview Grid.
Landscape 16:9, 1920x1080 reference canvas, viewed from 5-10 meters away.

CRITICAL — DISPLAY-ONLY: passive projector surface, no buttons, tabs, or
clickable controls of any kind. The teacher advances reveal stages and
plays audio from a separate remote device — this screen only displays the
resulting state. Any icon shown (like a speaker) is a static state
indicator, not a pressable button.

BACKGROUND: same deep blue-slate wash as the Overview Grid (#0F1B2E to
#0A1220), consistent INPUT phase theme.

CONTENT — this is the word "Tiger" (老虎) at its third reveal stage
(image + word are already shown, audio has already played once, and the
meaning stage has just been added):
- A large, prominent illustration of a friendly cartoon tiger, centered in
  the upper-middle of the stage, dominant in scale — roughly 40% of the
  stage height.
- Beneath the image, the English word "Tiger" in extremely large, bold,
  rounded sans-serif text — the single biggest text element on the screen.
- Directly under the word, the IPA phonetic "/ˈtaɪɡər/" in a smaller
  monospaced font, visually distinct from the word itself (clearly a
  pronunciation guide, not a second word).
- Beside or just below the IPA, the Simplified Chinese translation "老虎"
  in a clean, warm neutral sans-serif, sized clearly smaller than the
  English word but still large and easily legible — English is visually
  primary, Chinese is a clear secondary support.
- A static speaker glyph icon positioned near the word, indicating audio
  is associated with this word (styled as a simple icon badge, not a
  button — no border suggesting it's clickable).
- Below the main card content, a small horizontal row of 4 tiny dots
  representing the 4 reveal stages for this word — the first 3 filled/lit
  to indicate "image+word," "audio," and "meaning" have already been
  revealed, the 4th (context/sentence) still outlined as pending.
- At the very bottom of the full stage, the unit-wide progress rail (same
  as Overview Grid): 5 small dots, with "elephant" and "zebra" checked,
  "tiger" enlarged/glowing as current, "giraffe" and "monkey" pending.

STYLE: focused, calm, dual-coding-driven presentation — the image and word
dominate the composition, IPA and Chinese are clearly supporting
information, not competing for attention. Warm and kid-friendly but calmer
in energy than a competitive game screen (this is a teaching moment, not a
quiz). Rounded corners, soft glows, generous padding, no clutter, no
button/tab/menu chrome anywhere, no third-party brand marks.
```

---

If it's useful, I can also draft the Stage-4 (image+word+IPA+meaning+example sentence) Drill View prompt and the "Start Practice →" transition-prompt scene as additional Stitch prompts.
