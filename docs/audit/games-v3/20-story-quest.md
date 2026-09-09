# Story Quest — v3 Quality Audit (`STORY_QUEST`)

> **Status:** **cowork-done** — §4 audited (Anti-Gravity). Ready for Stitch prompt §5.
> **Screenshots:** `screenshots/20-story-quest-idle.png` — empty state (no story pages in fixture) — cropping/dialogue findings are code-anchored.

## SHARED PRELUDE (read first — identical in every game file)

**Product.** "Professor" — a teacher-facing ESL/EFL tool for **live, in-classroom** English instruction to children aged **6–12** (primary market: China; L1 is Simplified Chinese, used for translations and meaning options).

**Classroom model (hard constraint — never propose student-device interaction).** A live class runs on three browser tabs converging via Supabase Realtime; students have **no devices**:

| Tab | Route | Who | Role |
|---|---|---|---|
| **Commander** | `/teacher/live` | Teacher, desktop | Control room: lesson roadmap, roster chips, the per-game buttons, sidebar (wheel/teams/analytics) |
| **Remote Baton** | `/remote` | Teacher, phone | Handheld remote: spin/pick, correct–wrong, next student |
| **Board** | `/board` | **Projected 16:9** — the only screen kids see | Renders the current game/slide |

The teacher performs **all input**. Kids answer orally, point, or come to the front.

**Live loop.** Pick a student (wheel) → play a turn → score → next. `quickWheelWinner = null` means choral/practice mode (no individual scoring).

**Unified scoring model.** `scoreForAttempt(mistakes, difficulty)`: difficulty 1/2/3 (receptive / constrained / free-production) → 1–3 base points; −1 live per mistake; streak bonus (+1 at streak 3, +2 at streak 5); cap 5, floor 1 on success. Every scored event triple-writes: `addPoints` (leaderboard) + `recordAttempt` (analytics) + `gradeObjective` (FSRS memory model).

**Lifecycle contract — the 4 must-dos every scored game obeys:**
1. Full reset on `currentTurnId` change (new picked student ⇒ fresh board).
2. `mistakesRef` + `awardedRef` latches (no double-payment, no cross-turn leakage).
3. Score via `addPoints` + `scoreForAttempt` on the picked student.
4. Personalized message with the picked student's name.

**Turn dealing.** Deterministic per `(session, unit, shell, round, turnToken, resetCount)` — a new pick or reset re-deals; class-wide coverage tracked by a ledger so every objective gets its turn.

**Phases.** WARMUP / INPUT / OUTPUT / PRACTICE / ASSESS / WRAPUP — each game belongs to one phase envelope (allowed difficulty rungs + scoring posture).

**Design constraints for any redesign (applies to the Stitch prompt):**
- Board surface only, **16:9 projector**, viewed from 5–8 meters — large type, high contrast, punchy states.
- Kid-friendly but not infantile (ages 6–12 band).
- Must always be legible: the current challenge, the feedback state (correct/wrong/partial), the picked student's identity, and the score moment.
- Teacher-driven: every interaction must have a remote-control path; nothing can require a student device.

---

## §0 Identity

- **Flow type:** `STORY_QUEST`
- **Component:** `apps/board/templates/BoardStoryQuest.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** custom — NEXT_PANEL ("Next Page") / REVEAL_HINT ("Hint") / MARK_CORRECT ("Correct") / RESET_GAME ("Redo") / SLIDE_COMPLETE forced ("End") (`apps/teacher/live/panels/ContextualControls.tsx:192-201`)
- **Data sources:** story panels from the unit manifest's relational `story_pages` via `getStory()` (`services/manifest.ts:214`, frozen `data.pages` fallback); comprehension MCQs from `useBoardPool({ exerciseTypes: ['STORY_COMPREHENSION'], limit: 10 })`; vocab overlay from `getVocabulary()`
- **Mode:** picked student (comprehension answers scored); predictions are choral engagement, unscored

## §1 How the game works today

**One picked student reads an illustrated story with the class, page by page, with a prediction gate every page and a comprehension MCQ every 2 pages.** Four phases loop per page: `reading → prediction → (every 2nd page) comprehension → advance`, ending in a completion card.

**Reading phase.** A story-map dot rail at the top ("Page X of Y") + one white card (`max-w-4xl`) containing: the panel image, the panel text rendered as a single block, and two buttons — "Listen" (if the page carries `audioUrl`) and "What happens next? →" (plain "Continue →" on the last page). Inside the text block, every word that matches a unit-vocabulary word becomes a tappable chip (amber; green after tapping) that plays the word's audio on tap. The L1 translation exists only as a hover `title` tooltip on the chip.

**Prediction gate.** Three full-width text options: the correct one is the *actual text of the next panel*, and the two distractors are real texts lifted from other panels of the same story (no AI filler). Options are shuffled with a seed shared by every tab (FIXPLAN E1.5 — commander preview and projector show the same order). Predictions are engagement only: a correct guess earns the positive sound cue, never points or FSRS. After ~0.9s the game either enters a comprehension check (every 2nd page, while questions remain) or advances to the next page.

**Comprehension check.** An MCQ pulled sequentially from the unit's STORY_COMPREHENSION pool items (up to 10): prompt + 3–4 text options. A tap that matches `correct_index` → correct cue, streak bump (cue + confetti at 3 and 5), `scoreForAttempt(mistakes, difficulty, 1.0, streak)` points to the picked student via `addPoints`, plus `logAttempt` (analytics + FSRS + remediation queue). A wrong tap → wrong cue, streak reset, live −1 `MISTAKE_PENALTY`, `logAttempt(incorrect)`; a second miss triggers the shared reveal-on-wrong beat: the correct option takes an amber ring, an explanation card (when the item carries one) shows, and the page advances after a 2.2s teaching hold. The remote's **Hint** eliminates (dims + strikes) one wrong option; **Correct** (MARK_CORRECT) scores the open question as a clean correct and advances.

**Turn & round lifecycle.** Attempt refs (`mistakesRef`, `awardedRef`) reset per page (`advanceToNext`), so the picked student can legitimately score on several comprehension checks within one turn. A new wheel pick (`currentTurnId`) fully rewinds to page 1, phase `reading`, zeroed stats. **Redo** (RESET_GAME) does the same mid-turn. When the last page advances, a completion latch fires once: win cue, "Story Complete! / N pages read / Comprehension X/Y correct" card, and a natural `SLIDE_COMPLETE` broadcast — which the commander deliberately ignores (the teacher decides when a finished game moves on, `LiveCommander.tsx:49-62`). **End** (forced SLIDE_COMPLETE) jumps straight to the completion card.

**Empty/loading states.** A unit with no story pages once `loading` finishes shows an explicit "This unit has no story pages yet — skip to the next slide" card (instead of spinning forever); during load, "Loading story…".

**Content source.** Relational `story_pages` (per-paragraph scene crops + text, the scan/enrich pipeline's output) win; the frozen flow-block `data.pages` is the fallback. Each page may carry `speaker` (see F2 — currently dropped).

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> It's not too bad, but the UI is there to be upgraded. Right now most of the frame of each image is cut out — we cannot see the whole image; most of the text bubbles from the image are cut out as well. / And also we have the dialogue: maybe the dialogue could be better designed, to make it easier to differentiate the different dialogues and the different people talking. Right now it's just one block of text — we should separate it per speaker (e.g. "Harry", the big puppy, with the words, etc.).

**Clarified with the owner (2026-09-09):**
- Scope = FULL FLOW REDESIGN with Co-Work (owner decision 2026-09-09): full uncropped images, per-speaker dialogue presentation (names/identities), page-turn flow, narration audio.

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardStoryQuest.tsx` unless noted.

- **F1 · P1 — Every panel image is center-cropped to a 256px strip.** `<img … className="w-full h-64 object-cover" />` (`:414`): full card width × fixed `h-64` (16rem) with `object-cover` scales the art to fill and crops the overflow. Story art here is typically per-paragraph book scans / scene crops whose speech bubbles and frame sit near the edges — exactly what gets cut (§2's "frame of each image is cut out… text bubbles from the image are cut out as well"). There is no `object-contain`, letterbox, blur-fill, or aspect-preserving path anywhere in the panel. The fixed height is also not projection-scaled (no responsive variants).
- **F2 · P1 — Dialogue renders as one undifferentiated block; the per-speaker data exists but is thrown away.** The panel mapping keeps only `{id, imageUrl, text, audioUrl}` (`:69-74`), yet the story source carries a `speaker` field per page — `StoryPage.speaker` (`services/manifest.ts:198-205`), populated from relational `story_pages` as `p.speaker || p.speaker_override_name` (`services/manifest.ts:254`). The reading view then splits `text` into words for vocab-chip highlighting (`:419-442`) with zero speaker segmentation, names, or bubbles (§2's "just one block of text — separate it per speaker"). Rendering speaker-attributed lines needs no new data on relational units. ⚠️ Data-quality caveat: for book-scan-derived pages the pipeline's speaker attribution is known to be systematically wrong for comic blocks pre-scan-v8 (speakers labeled with the addressee — see the comics workstream log in AGENTS.md §9); verify per-unit before printing character names to the board.
- **F3 · P2 — Prediction options are full-text walls.** The correct option is the *entire next-panel text* and distractors are entire other panels (`:213-230`), rendered as three stacked text rows (`:499-516`). For ages 6–8 this is a heavy reading load for what should be a quick visual anticipation beat, and it front-loads the answer as text. The §2 clarification's redesign (image-led prediction) has no image options today.
- **F4 · P2 — Comprehension questions are not anchored to the page being viewed.** Questions are consumed sequentially from the pool (`comprehensionIdx`) every 2nd page (`:239-245`); nothing ties a question to the panel currently on screen, so a question about a later scene can fire after page 2. The pool items do carry per-scene anchors in their content (image_asset_id etc. per the scan pipeline) but this component ignores them.
- **F5 · P2 — Award-count wheel rotation restarts the story mid-flow.** A scored comprehension answer is a positive `addPoints` to the current responder; with the sidebar wheel's EVERY_1/EVERY_3 auto-rotate (`store/SessionContext.tsx:1565-1581` counts awards, then auto-picks the next student), a NEW_TURN lands mid-story — and the turn-reset effect (`:96-111`) rewinds `currentPanelIdx` to 0. The next student restarts the story from page 1. Same seam as 25-fast-vocab F1 (see that audit for the full trace).
- **F6 · P3 — One student owns the whole multi-page story.** By design the picked student answers every prediction and every comprehension check across all pages (turn footer `:608-617`); a ~10-page story is a long solo turn while the class watches. No per-page hand-off or choral mix exists inside the game.
- **F7 · P3 — Vocab taps write no FSRS exposure.** `handleVocabTap` (`:203-210`) plays audio and flips the chip green; the code comment documents that the word→objective_id join needed for `recordExposure` isn't available client-side, so presentation exposure from this surface never reaches the scheduler.
- **F8 · P3 — L1 translation is hover-only.** The vocab chip's Chinese meaning exists solely as the `title` attribute (`:435`) — invisible on a touch projector and at distance; effectively dead data.
- **F9 · P3 — "Next Page" bypasses the prediction gate and can abandon an open question.** NEXT_PANEL calls `advanceToNext` unconditionally (`:143-145`), which skips the prediction phase from reading and drops an in-flight comprehension question. A legitimate teacher escape hatch, but the button label reads as a plain page-turn, not "skip the question".
- **F10 · P3 — Chrome duplication + palette clash.** The in-game picked-student footer (`:608-617`) duplicates the BoardShell whose-turn banner (`BoardShell.tsx:187-218`); the light amber-on-white palette fights the shell's dark PRACTICE wash; the 240px leaderboard rail stays up during the story (`BoardShell.tsx:41,112` — STORY_QUEST is not in FULL_BLEED_TYPES); the page-map dots are `w-4 h-4` (`:385`) — small at 5–8m.

**What already works well (context — don't re-litigate):** real-content prediction distractors (never AI filler), seeded identical option order on every tab (E1.5), the shared reveal-on-wrong teaching beat with explanation, hint elimination + teacher MARK_CORRECT override, per-word vocab overlay with audio, per-page attempt-ref hygiene, the idempotent completion latch + natural-completion semantics the commander respects, and the explicit "no story pages" empty state.

## §4 ChatGPT Co-Work quality audit

> **Co-Work: write your findings ONLY inside this section.** (Full instructions + shared prelude embedded at `file-ready`.)

### 4.a UI & visual design

- **P1 — Destructive image cropping (`h-64 object-cover`) cuts out story art and speech bubbles (§2 Owner Bug).** **Evidence:** `screenshots/20-story-quest-idle.png`, §2 owner comments, and §3 F1 (`BoardStoryQuest.tsx:414`). Story illustrations are forced into a fixed 256px horizontal strip (`w-full h-64 object-cover`). In book scans and custom story illustrations, speech bubbles and character interactions typically sit near the upper and outer edges. `object-cover` scales the image and chops off the borders, mutilating character faces, narrative details, and text bubbles.
  *Recommendation:* Adopt a balanced two-column storybook layout (aligning with `07-story-stage.md`):
  - *Right Column:* Full, uncropped illustration displayed in its natural aspect ratio using `object-contain` (with a subtle blur-fill or warm cream border).
  - *Left Column:* Dedicated reading and dialogue panel with generous typographic scaling.

- **P1 — Undifferentiated wall-of-text dialogue (§2 Owner Bug).** **Evidence:** §2 owner comments and §3 F2 (`BoardStoryQuest.tsx:419-442`). Story text is currently dumped as a single continuous block of prose. Even though `story_pages` carries `speaker` metadata (`services/manifest.ts:254`), the code completely drops it. Children cannot distinguish who is speaking, destroying the narrative pacing.
  *Recommendation:* Structure story text into distinct speaker dialogue turns:
  - Character portrait / avatar chip.
  - Bold speaker name (e.g. `"Harry 🐶:"` or `"Narrator 📖:"`).
  - Distinct speech bubbles with high-contrast text and interactive vocabulary chips.

- **P2 — Retract 240px leaderboard rail (`FULL_BLEED_TYPES`).** **Evidence:** `screenshots/20-story-quest-idle.png` and §3 F10 (`BoardShell.tsx:41`). Story Quest is currently omitted from `FULL_BLEED_TYPES`. As a result, the 240px leaderboard rail stays pinned to the right side of the screen, squashing the story illustration and dialogue into a cramped space.
  *Recommendation:* Add `STORY_QUEST` to `FULL_BLEED_TYPES` in `BoardShell.tsx` so the storybook enjoys the full 16:9 projection canvas.

- **P2 — Microscopic progress dots.** **Evidence:** §3 F10 (`BoardStoryQuest.tsx:385`). The story page rail uses tiny 16px dots (`w-4 h-4`) that are virtually unreadable from 5–8 meters away. Replace with a bold chapter progress banner: *"Chapter 1 · Page 2 of 5"*.

### 4.b Workflow & user flow (teacher's path: start → turns → end)

- **P1 — Wheel auto-rotate restarts the story mid-flow (§3 F5).** **Evidence:** §3 F5 (`BoardStoryQuest.tsx:96-111, store/SessionContext.tsx:1565-1581`). When a student answers a comprehension check correctly, `addPoints` records an award. If the teacher's sidebar wheel is set to auto-rotate every 1 or 3 awards, a new student is picked (`NEW_TURN`). The turn-reset effect in `BoardStoryQuest.tsx` responds by resetting `currentPanelIdx` to 0! The story snaps back to page 1, forcing the class to re-read earlier pages.
  *Recommendation:* Decouple the story reading progress from individual student turn IDs: persist `currentPanelIdx` across turn changes so picking a new student simply transfers answering rights on the *current* page without rewinding the story.

- **P2 — Comprehension questions are unanchored to current story scenes.** **Evidence:** §3 F4 (`BoardStoryQuest.tsx:239-245`). Comprehension MCQs are pulled sequentially from the pool every second page. Nothing verifies that the question relates to the panel currently displayed on screen. A question about the story's climax can trigger on page 2.
  *Recommendation:* Filter comprehension items using the current page's scene metadata or `image_asset_id` so checks assess only what students have read so far.

- **P2 — "Next Page" silently drops in-flight comprehension checks.** **Evidence:** §3 F9 (`BoardStoryQuest.tsx:143-145`). Pressing `NEXT_PANEL` calls `advanceToNext` unconditionally, bypassing open prediction gates or comprehension checks without recording outcomes or displaying feedback.
  *Recommendation:* Update button states: when a question is active, the primary remote action should be `CHECK` or `MARK_CORRECT`; `NEXT_PANEL` should only become primary once the question is resolved.

- **P3 — Excessive reading load in prediction gates.** **Evidence:** §3 F3 (`BoardStoryQuest.tsx:499-516`). Prediction options present three full paragraphs of text lifted from other panels. For 6–8-year-old learners, this creates reading fatigue. Replace with short 1-sentence teasers or visual scene previews.

### 4.c Pedagogical practice (ESL ages 6–12)

- **P1 — Speaker Attribution Drives Oral Role-Playing.** In primary ESL classrooms, stories come alive through dramatic reading. By visually separating dialogue with character badges ("Harry", "Big Puppy"), teachers can assign reading roles across the classroom. This fosters expressive intonation, prosodic rhythm, and active listening.

- **P2 — Prediction as an Engagement Anchor (Choral & Non-Penalized).** Prediction in Story Quest is correctly structured as an engagement hook rather than a high-stakes test. Asking *"What will happen next?"* activates schema anticipation. Keep predictions choral and non-scored.

- **P2 — Scaffolding Vocabulary Chips with Audio.** The amber vocabulary chips in story text are an excellent scaffold. Ensure tapping a chip plays clear native pronunciation and displays an unobtrusive English contextual definition rather than a hover tooltip that fails on touch projectors.

### 4.d Game interaction (mechanic, pacing, fairness, fun)

- **P2 — Whole-Class Narrative Pacing.** A 5–10 page story is too long for a single student to monopolize (F6). Encourage teacher-driven turn hand-offs between pages so multiple students participate across the story arc.
- **P2 — Audio Narration with Karaoke Sentence Highlighting.** When audio is available for a story page, provide a "Listen to Story 🎧" button that highlights each dialogue bubble in sync with the audio track.

### 4.e Top-5 prioritized recommendations

1. **P1 — Eliminate Image Cropping with a Two-Column Layout (F1, §2):** Render full uncropped illustrations on the right (`object-contain`) and reading dialogue on the left.
2. **P1 — Implement Speaker-Attributed Dialogue Bubbles (F2, §2):** Format text into clear character dialogue turns with names and avatars.
3. **P1 — Prevent Wheel Auto-Rotate from Rewinding the Story to Page 1 (F5):** Maintain `currentPanelIdx` across student turn changes.
4. **P1 — Add `STORY_QUEST` to `FULL_BLEED_TYPES` in `BoardShell.tsx` (F10, 4.a):** Retract the 240px leaderboard rail for story immersion.
5. **P2 — Anchor Comprehension Questions to Current Scene Content (F4):** Ensure questions match the pages students have actually read.

### 4.f Design direction for Stitch (style/mood guidance + the 3–5 key screens/states to design; what to KEEP from the current design)

**Mood and visual system.** Design this as a warm, cinematic "Illustrated Storybook Theater". Deep midnight indigo stage (`#0F172A`), rich storybook cream cards (`#FDFBF7`), warm honey-amber (`#F59E0B`) for interactive vocab chips, electric emerald (`#10B981`) for correct comprehension answers, and crisp speech bubbles (`#FFFFFF` with `#E2E8F0` drop shadows). The interface should feel like turning the pages of an enchanted storybook.

**Mock up these four board screens/states (16:9 projector, no scrolling):**

1. **Screen 1 — Story Reading Page (Two-Column Layout):**
   - Retracted leaderboard rail (full 16:9 bleed).
   - Top Bar: Chapter Title `"The Adventure of Harry"`, Page Indicator `"Page 2 of 5"`, Audio Narration button.
   - Left Panel (Reading): Speaker-attributed dialogue:
     - Avatar: Harry 🐶 | Bubble: *"Look at the big tractor! Let's explore the farm."* (with `"tractor"` as a glowing gold vocab chip).
     - Avatar: Big Puppy 🐕 | Bubble: *"Be careful, Harry! It is very big."*.
   - Right Panel (Illustration): Full, uncropped illustration of Harry and the puppy standing before a large red farm tractor (`object-contain` on soft cream backdrop).
   - Bottom Action: Green `"What happens next? →"` button.

2. **Screen 2 — Prediction Gate ("What Happens Next?"):**
   - Illustration stays visible on the right, dimmed to 40% opacity.
   - Left Panel overlays with 3 tactile prediction cards:
     - `A. They climb up onto the big tractor.` (Correct)
     - `B. They swim across the cold river.`
     - `C. They sleep in the dark barn.`
   - Header: *"Make a guess! 🔮 What happens next?"*.

3. **Screen 3 — Comprehension Check:**
   - Scene illustration visible on the right.
   - Left Panel displays an illuminated comprehension card:
     - Question: *"Why does the puppy tell Harry to be careful?"*.
     - 3 clean options with Alice's turn badge active:
       - `A. The tractor is very big.` (Correct)
       - `B. The puppy is hungry.`
       - `C. It is raining outside.`

4. **Screen 4 — Story Complete Celebration:**
   - Full-stage victory layout: Illustrated open storybook with golden star ribbon.
   - Header: `"Story Complete! 📖 Excellent Reading!"`.
   - Badges: `"5 Pages Read"` · `"Comprehension: 2/2 Correct"` · `"+5 Stars Awarded"`.
   - Prominent `"Finish Story & Next Activity →"` button.

**What to KEEP from current design.** Retain the real-content prediction distractors (lifted from other story pages rather than AI hallucinations), per-page mistake latch hygiene, non-scored prediction engagement, and natural completion lifecycle semantics.

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

## §6 ⬜ Stitch output & implementation notes

*(Owner drops the Stitch export into `stitch/<NN>-<game>/`; ZCode records implementation + deploy.)*
