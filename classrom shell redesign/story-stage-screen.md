# Story Stage Screen (OUTPUT Phase)
### Research → Redesign → Google Stitch Prompt

Third screen in the same shell (Prompt 01), following Vocabulary Presentation (Prompt 02). Same rules: pure display, no student devices, teacher drives everything from the Commander/Remote — including, importantly, the "tap-a-word" interaction, which is teacher-initiated from the Remote and only *displayed* as a popup here on the board.

---

## PART A — Research: How Story Should Work as Comprehensible Input

### A1. Dialogic reading — the story is a conversation, not a monologue
Dialogic reading, <cite index="24-1">first described by Whitehurst (1988), is a form of shared storybook reading that promotes conversation and interaction between the reader and listener through strategic questioning and prompts</cite>, and it works by having <cite index="24-1">the adult reader and child listener change roles, with the adult participating through active listening and questioning rather than pure narration.</cite> The most widely used version of this is summarized as <cite index="27-1">PEER (prompt, evaluate, expand, repeat) and CROWD (completion, recall, open-ended questions, wh-questions, distancing)</cite> — a structured way of pausing a story to ask, react, and build on what a child says. Evidence shows dialogic reading <cite index="25-1">is effective for young learners' basic reading skills, vocabulary, oral language, and narrative skills</cite>.

**Design consequence:** the Story Stage can't just be a slideshow with a narration button — it needs natural *pause points* per page where the teacher can stop and prompt the class ("What do you think happens next? 你觉得接下来会发生什么？"), without the UI forcing a rigid auto-advance. Page transitions should always be teacher-triggered, never timer-driven.

### A2. Comprehensible input — the story is where vocabulary gets re-encountered "at i+1"
Krashen's input hypothesis is the reason this step exists at all in the lesson arc: after INPUT presents words in isolation, the story is where learners <cite index="23-1">receive comprehensible input via translation and vocabulary review embedded in a narrative context</cite> — meeting the same words again, now inside real sentences, at a level just slightly beyond what they can produce unaided.

**Design consequence:** the whole point of highlighting target words in the story text is to make this *re-encounter* visible — a student should be able to visually recognize "oh, that's the word I just learned" mid-sentence, which is exactly what the highlight + tap-a-word mechanism is for.

### A3. Digital storybooks — full-bleed image, text as an overlay, not a competing block
Modern digital storybook apps (Epic!, Vooks-style animated books) consistently use a **full-bleed illustration as the primary surface**, with text presented as a smaller, legible overlay rather than a split-screen layout — because the illustration is doing real comprehension work (dual-coding again: the scene supports the sentence), and a cramped half-image/half-text layout undercuts that.

**Design consequence:** kill the "card with an image on top and text below" layout entirely. The scene image should be the entire stage; the dialogue is a floating panel *over* it.

### A4. Visual-novel dialogue-box conventions — legible attribution at a glance
Visual-novel style dialogue UIs (the genre convention behind games like Ace Attorney/Danganronpa) solve exactly this room's legibility problem: a semi-transparent panel anchored to the bottom of the frame, a speaker portrait/avatar fixed to one side, name+text clearly attributed, and — critically — a **consistent color identity per character** so even without reading the name, the class recognizes who's talking by the panel's accent color. This convention exists because visual novels are read at a glance during fast-paced scenes, which maps closely to a classroom scanning the screen while listening to a teacher's voice.

**Design consequence:** adopt the panel-anchored-bottom, avatar-fixed-left convention directly, and make character color-coding systematic (border/accent tint keyed to each character), not just an emoji difference.

### A5. Pre/during/post reading — the story needs a beginning and an end, not just pages
The classic three-phase reading framework (activate prior knowledge → read & interact → check comprehension) maps directly onto the requested "pre-story hook" + pages + "Comprehension Check →" structure. Skipping the pre-story hook loses the anticipation-building step that primes vocabulary recall; skipping a clear post-story transition makes the story feel like it trails off rather than lands.

**Design consequence:** treat the title/character card as a real pedagogical beat (not decoration) and give the ending prompt equal visual weight to the opening one — bookending the experience.

### Synthesis — five rules for the redesign
1. **The scene is the stage, not a thumbnail.** Full-bleed image; text floats over it.
2. **Highlight = "you know this word."** Target vocab in the story text must visually pop, and re-anchoring it (tap-a-word) reinforces the INPUT→OUTPUT link.
3. **Character = color + portrait, always.** Attribution should be readable without reading.
4. **Pacing stays teacher-owned.** No auto-advance, no forced timing — dialogic reading depends on the teacher choosing when to pause.
5. **Bookend the story.** A title/character hook opens it, a comprehension-check prompt closes it — the story is a complete arc, not a stream of pages.

---

## PART B — Redesign: Story Stage Screen

### B0. Screen sequence
```
STORY HOOK (title card)  →  PAGE 1  →  PAGE 2  → ... →  PAGE N  →  COMPREHENSION CHECK PROMPT
                              ▲                                          │
                    (tap-a-word popup can appear over any page,          
                     teacher-triggered from Remote, dismisses back
                     to the same page)
```

### B1. Story Hook (pre-story title card)
A movie-title-card moment before Page 1:
- Story title, large, centered ("A Day at the Zoo" / 动物园的一天).
- Setting line beneath it, smaller ("At the city zoo, on a sunny morning...").
- A character lineup along the bottom: each character's avatar in a circle, their color accent as a ring around it, name beneath. This doubles as a cast introduction and a preview of the color-coding the class will see once dialogue starts.
- Warm amber/gold background wash establishes the OUTPUT phase's storybook mood immediately, distinct from INPUT's calm blue.
- No progress dots yet — this screen is "page 0," a beat, not part of the counted pages.

### B2. Story Page (the core screen)
**Full-bleed scene:** the page's illustration fills the entire stage edge-to-edge — no card border, no padding around it, this *is* the background for this screen. A subtle dark gradient overlay at the bottom third ensures the dialogue panel stays legible over busy artwork without needing a hard box.

**Dialogue panel** (anchored bottom, floating over the gradient):
- **Speaker avatar**, large, left-anchored, sitting slightly above the panel's top edge so it feels like it's "in" the scene rather than boxed inside the UI — a small chip below the avatar shows the character's name.
- **Panel accent border/glow** in the speaking character's assigned color (e.g. Teacher Ted = red-toned accent, Ben = blue, Mia = green) — glanceable attribution per A4.
- **Story text**, large and highly legible, positioned to the right of the avatar. Target vocabulary words appear bold + underlined in a warm gold accent color, distinct from regular dialogue text but still part of the sentence's natural reading flow (not boxed like a button).
- **Read Page indicator**: a speaker glyph near the top of the panel — a static state indicator (audio is teacher-triggered from the Remote, same convention as the Vocabulary screen). When narration plays, the story text highlights **word-by-word** in sync (karaoke-style: each word gets a brief bright/underline pulse as it's spoken, fading back to normal after), giving early readers a visible anchor to follow along with the teacher's voice or the TTS narration.

**Tap-a-word popup:** when the teacher selects a highlighted word from the Remote, a small card animates in *over* the current page (center-stage, scene dimmed slightly behind it) showing: the word's image thumbnail, the English word, IPA, Chinese translation, and a static Listen indicator — a compact version of the Vocabulary Drill View card, reinforcing "this is the same word you learned earlier." Dismissing it (teacher action) returns to the exact same page state, narration paused where it was.

**Progress indicator:** page dots along the very bottom edge of the stage (e.g. ● ● ○ ○ for Page 2 of 4), styled consistently with the shell's other progress rails — a readout the teacher can jump between from the Remote, not a tappable element on the board itself.

### B3. Page-turn transition
A cinematic page-flip/slide: the outgoing scene image slides and fades while the incoming one settles in, with the dialogue panel briefly retracting off-screen and re-entering for the new page's speaker/text — evoking a physical page turn rather than a generic app-screen swap. Duration ~500-600ms, slightly slower than the shell's default step transitions, since this phase is deliberately calmer-paced (per B5/A5) — the story should feel unhurried.

### B4. Comprehension Check transition (final page)
After the last page, instead of a new "page," the stage settles into a closing beat: the final scene stays visible but dims slightly, the dialogue panel is replaced by a centered plaque — "The End · 故事结束" with a short affirming line, and a clearly-labeled but non-interactive "Comprehension Check →" signpost (readout only, teacher advances from the Remote — this hands off into a separate quiz screen designed later). Page dots show all filled.

### B5. Visual identity — OUTPUT phase, storybook mood
Warm, narrative, calm — deliberately the emotional opposite of ASSESS's intensity:
- Background wash (visible at page edges / hook screen / behind scene gradients): warm amber-cream blend, e.g. `#3A2A16` deep warm-brown base with `#F5E6C8` cream highlights used sparingly in panel chrome — softer and warmer than the shell's other phase washes, evoking "storybook page," not "game show."
- Dialogue panel base: warm dark neutral (near-black-brown, `#241A10`) at partial opacity with blur, so it reads as glass-over-artwork rather than a flat card.
- Character accent colors are separate from the phase palette (Teacher Ted red, Ben blue, Mia green, etc.) — same principle as the shell's team colors never being confused with phase accents.
- Target-word highlight color: warm gold (`#FBBF24`-family), consistent with the shell's general amber accent usage, so highlighted vocabulary reads as "special" without introducing a brand-new hue.
- Motion and energy stay unhurried: slower transitions, gentler easing, no confetti/celebration bursts mid-story (those are reserved for ASSESS/WRAP).

### B6. Bilingual design
- Story text is presented in English only during normal reading (per Krashen's input framing — the story *is* the target-language immersion moment).
- Chinese only surfaces on demand, inside the tap-a-word popup — consistent with "Chinese is a support tool for re-checking meaning," not a permanent bilingual caption under every sentence, which would undercut the immersive comprehensible-input goal of this specific screen (this is a deliberate difference from the Vocabulary screen, where Chinese is always visible at Stage 3+).

### B7. Motion / animation language
- Page turn: 500-600ms cinematic slide+fade, described above.
- Karaoke highlight: each word's highlight pulse duration matches its actual audio timing; no fixed generic speed — feels alive rather than mechanical.
- Tap-a-word popup: quick scale-and-fade-in (~250ms) with the background scene dimming slightly (a soft vignette), popup dismiss reverses the same motion.
- Comprehension-check transition: slow, gentle settle (background dim + plaque rise), matching the "story landing" feel from A5 rather than a snappy UI transition.

---

## PART C — Google Stitch Prompts

Same display-only rule as before: this is a projector surface students watch, never touch. The Read Page speaker icon and the highlighted vocabulary words are visual state indicators the teacher controls remotely — not clickable elements on the board itself.

### C1. Main story page prompt

```
Design a high-fidelity UI mockup for the "Story Stage" screen — a cinematic
storybook page rendering inside a classroom projector display
(ClassroomBoard), during the OUTPUT phase of an English lesson for
Chinese-speaking K-12 students. Landscape 16:9, 1920x1080 reference canvas,
viewed from 5-10 meters away by a class with no devices of their own.

CRITICAL — DISPLAY-ONLY: this is a passive projector surface. Students
never touch it. There are no buttons, tabs, menus, or clickable controls
anywhere on screen — the teacher plays narration, selects words, and
advances pages from a separate remote device. Any icon shown (like the
speaker glyph) is a static state indicator, not a pressable button.
Highlighted words in the text are a visual style cue (bold + underline in
gold), not a button — they don't look clickable, they look notable.

BACKGROUND / SCENE: a full-bleed, edge-to-edge cartoon illustration filling
the entire canvas — a bright, friendly zoo scene showing a large cartoon
elephant in an outdoor habitat with trees and a blue sky, warm and
inviting, no borders or padding around the image, it IS the background. A
soft dark gradient overlay darkens the bottom third of the image so text
stays legible on top of it.

DIALOGUE PANEL (anchored to the bottom third, floating over the darkened
gradient, semi-transparent warm dark-brown glass panel with blur, NOT a
hard opaque box):
- On the left, a large circular character avatar/portrait of "Teacher Ted"
  (a friendly cartoon male teacher character, simple and warm), positioned
  so it slightly overlaps the top edge of the panel, as if standing in the
  scene. A small red-accented ring glows around the avatar (Teacher Ted's
  character color). His name "Teacher Ted" appears in a small label below
  the avatar.
- To the right of the avatar, the dialogue text in large, highly legible
  rounded sans-serif: "Look at the elephant! It has big ears and a long
  trunk. Can you say elephant?" — the word "elephant" appears TWICE in this
  sentence, both instances styled in bold warm gold text with a subtle
  underline, visually distinct from the surrounding white/cream dialogue
  text, but part of the natural sentence flow (not boxed, not pill-shaped).
- A small static speaker glyph icon sits near the top of the dialogue
  panel, indicating narration is available for this page (icon only, no
  button styling, no border).
- The panel's overall border/glow is tinted in Teacher Ted's red accent
  color, reinforcing who is currently speaking.

BOTTOM EDGE: a small horizontal row of 4 page-progress dots, the 2nd dot
filled/glowing (indicating "Page 2 of 4"), the other 3 outlined/pending —
small, unobtrusive, bottom-center or bottom-right corner.

STYLE: warm, immersive, storybook/cinematic mood — calm and inviting, NOT
high-energy like a competitive game screen. Rounded, friendly illustration
style throughout, soft warm color grading on the scene (ambers, warm
greens, soft blues), gentle glows rather than hard shadows on UI chrome,
bilingual-ready but this specific page shows English only (Chinese appears
only in a separate tap-a-word popup, not on this main page). No
third-party logos, no branded IP, no button/tab/menu chrome anywhere.
```

### C2. Tap-a-word popup overlay prompt

```
Using the same Story Stage scene and dialogue panel as the previous prompt
(full-bleed zoo scene, Teacher Ted's dialogue panel with the word
"elephant" highlighted in gold), add a "tap-a-word" popup overlay showing
on top of it — this represents the moment the teacher has selected the
highlighted word "elephant" from their remote control device to re-show
its meaning to the class.

CRITICAL — DISPLAY-ONLY: this popup is a passive readout that appeared
because the teacher triggered it remotely. It has no close button, no
interactive chrome — the teacher dismisses it from their remote device,
not by tapping anything on this screen.

BACKGROUND: the full story scene and dialogue panel from before remain
visible but dimmed/darkened behind a soft vignette overlay, so the popup
reads as clearly in front of the story, without fully hiding it (the class
should still sense they're "inside" the story, just pausing on a word).

POPUP CARD: centered on the stage, a compact rounded card (smaller than a
full Vocabulary Drill View card, sized to feel like a quick reference, not
a full new screen) containing:
- A small square illustration of an elephant (consistent style with the
  Vocabulary Presentation screen's elephant card).
- The English word "Elephant" in large bold text.
- The IPA phonetic "/ˈelɪfənt/" in smaller monospaced text directly below.
- The Simplified Chinese translation "大象" beside or beneath the IPA,
  clearly smaller than the English word but easily legible.
- A small static speaker glyph icon near the word, indicating audio is
  associated with it (icon only, no button styling).
The card has a soft warm gold glow border, tying it visually to the gold
highlight color used for target vocabulary words in the story text, so
it's clear this popup is "the same word you just saw highlighted."

STYLE: keep the same warm, storybook color mood as the main story page
(ambers, warm neutrals) but make the popup card itself feel slightly more
like a "reference card" than the cinematic scene behind it — clean,
focused, calm. No third-party logos, no branded IP, no interactive-looking
buttons anywhere including on the popup itself.
```

---

If useful, I can also draft Stitch prompts for the Story Hook (title card + character lineup) and the closing Comprehension Check transition scene.
