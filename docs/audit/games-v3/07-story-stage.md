# Story Stage — v3 Quality Audit (`STORY_STAGE`)

> **Status:** **implemented** — §0–§7 complete. Gauntlet-verified.
> **Current status:** implemented
> **Screenshots:** `screenshots/07-story-stage-idle.png` — empty state (fixture unit has no story pages) — audit layout from code.

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

- **Flow type:** `STORY_STAGE`
- **Component:** `apps/board/templates/BoardStoryStage.tsx` (617 lines)
- **Phase:** OUTPUT (`PHASE_FOR_TYPE`, `orchestrate-lesson/index.ts:292`)
- **Remote-control group:** custom — **Next Page / Hint / Correct / Skip / End**, identical on commander (`ContextualControls.tsx:325-336`) and remote (`TeacherRemote.tsx:281-302`)
- **Data sources:** story pages via `getStory(activeUnit.manifest)` (relational `story_pages` first, frozen `data.pages` fallback) + `getCharacters` (live bundle portraits, frozen `data.characters` for names/colors) + vocabulary via `getVocabulary` (word highlighting); comprehension MCQs from `useBoardPool` (`STORY_COMPREHENSION`, class-weak ordering, capped at 4 questions) with a session-scoped asked-items ledger shared with BoardStorySequencing
- **Mode:** read-through is choral; the comprehension closer is scored on the picked student (`quickWheelWinner`), full lifecycle + dual/triple-write

## §1 How the game works today

The slide is a two-part storybook: a teacher-paced read-through, then a scored comprehension quiz. A single panel counter walks through five states: **hook card (−1) → story pages (0…N−1) → "The End" card (N) → comprehension questions (N+1…) → done overlay**. The teacher advances with the remote's Next Page; nothing on the board itself is clickable except audio buttons and answer options.

**The hook card** shows the story title and setting over a warm brown gradient, with a row of character portraits (resolved live-bundle-first: relational character images beat the frozen plan's URLs) and a "Teacher: tap Next to begin · 点击下一步开始" cue. **Each story page** is a full-bleed scene: the page's illustration stretched edge-to-edge (`object-cover`), a dark gradient over the bottom half, and a right-edge vignette. Anchored at the bottom sits the dialogue **overlay badge** — a glass card with a colored left border keyed to the speaker, the speaker's portrait in a rounded square to its left, the page text at 3xl (unit vocabulary words highlighted in amber + underline), and a small "Read Page" speaker button that plays the page's stored audio or falls back to synthesized speech of the text. Tiny dots at the bottom center show page position, and a muted "Next…" preview of the following line sits top-right.

**The comprehension closer** loads up to four `STORY_COMPREHENSION` pool items (class-weak first, deduped, shape-validated: needs `prompt`, ≥2 `options`, numeric `correct_index`). Each question shows the prompt in a glass panel and the options in a 2-column grid of large bordered buttons; the picked student's name rides in a chip next to the question counter. **Tap flow:** a correct tap (or the teacher's remote "Correct" override) locks the answer, plays the success cue, awards `scoreForAttempt(mistakes, difficulty, streak)` points via `addPoints`, and triple-writes analytics + FSRS grade through the shared `logAttempt` helper — then auto-advances after ~0.9s. A first miss deducts a −1 mistake penalty live, eliminates the tapped distractor plus one more, and lets the class retry; a second miss triggers a teaching reveal (correct option amber-ringed, explanation when the content carries one, ~2.2s hold) and moves on. The remote's **Hint** eliminates one distractor without penalty; **Skip** advances a question without scoring; each asked question is recorded in a session-scoped ledger so the sibling Story Sequencing game never re-asks it.

**Lifecycle:** a new wheel pick (`currentTurnId`) resets the mistake/awarded/streak refs; an "already scored this turn" chip guards double-payment; after the last question the board broadcasts `SLIDE_COMPLETE`, shows a "Great reading, 〈name〉!" celebration (auto-dismisses in 6s), and the lesson advances. If the unit has no comprehension items, "The End" card says so honestly — and if the unit has no story pages at all, the whole slide is an empty state ("No story pages for this unit").

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> On the story stage game, we have basically a big screen of the comics cell with an overlay badge with the conversation, with the dialogues. Actually, I would like to change this a little bit. Let's make the main image in the center, and on one side — maybe the left or the right, but the left side would make more sense — have the dialogues written there.

**Clarified with the owner (2026-09-09):**
- Main story image CENTERED; dialogues in a side panel — left preferred by the owner.
- Exact panel treatment (always visible vs collapsible, sizing) = design decides via Co-Work/Stitch.

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardStoryStage.tsx` unless noted.

- **F1 · P2 — Correct / Skip / Hint act on an UNSEEN question during the read-through.** The action listener (`:262-336`) never checks the current panel: `MARK_CORRECT` (`:304-325`) scores and advances `comprehensionItems[qIndex]` even while the class is still on the hook or a story page — awarding points for a question nobody has seen and marking it asked (burning it from the shared ledger); `SKIP_ROUND`/`NEXT_ROUND` (`:327-332`) silently consume a question the same way; `REVEAL_HINT` (`:289-303`) eliminates distractors on a future question. Because the commander and remote show these buttons for the whole slide, a teacher pressing "Correct" mid-story to reward a child's read-aloud — a natural instinct elsewhere — corrupts the quiz. Guard should be `isComprehension` (plus `NEXT_PANEL` mapping to page-advance everywhere else).
- **F2 · P2 — The layout the owner is redesigning: full-bleed crop + bottom-anchored overlay badge** (`:440-492`). Today the illustration is an `object-cover` crop stretched to 16:9 (`:445` — original art is ~4:3 or square, so a third of the picture is lost), the bottom half is darkened (`:449`), the right 12% vignetted (`:452`), and the dialogue sits in a max-w-3xl glass card ON the art (`:454-479`). Long page text pushes the card up over the image; short text leaves the image mostly dark. This is exactly the §2 complaint — the art is a backdrop instead of the centerpiece, and the dialogue has no dedicated reading zone. (The redesign: image centered, dialogue in a left panel — this finding is the "current state" anchor for that work.)
- **F3 · P2 — No remote path to replay page audio.** "Read Page" (`:475-477`) is a small on-board button only — the component has no `PLAY_AUDIO`/replay listener at all, and the control set has no audio button. Re-hearing a line for choral repetition requires walking to the projector — the same control-parity gap Focus Cards had before its v3 fix (audit `05-focus-cards.md` F5). For an OUTPUT-phase read-along, replay is a core action, not a nicety.
- **F4 · P2 — The comprehension presence is race-dependent, and the no-questions end is a dead end.** `comprehensionItems` derive from an async pool (`:82-100`), so a teacher who pages quickly reaches "The End" while the pool is still loading and sees "No comprehension questions available" (`:510-513`) — even for a unit that has questions. `NEXT_PANEL` then parks forever (`:268-272`: advancing past the end card requires `hasComprehension` to already be true), and when there genuinely are no questions the slide never emits `SLIDE_COMPLETE` — contradicting the file's own header note ("end after the read-through… is still complete", `:13-14`) and stranding the teacher on The End card until they use the global End.
- **F5 · P3 — Choral comprehension looks scored but silently isn't.** With no picked student, `doDualWrite` returns before recording (`:157-158`) — yet the board still plays the correct cue, bounces "Correct!", fires confetti at streaks, and shows the reveal flow. The teacher has no visual signal that nothing was recorded (contrast: other shells show a choral-mode badge).
- **F6 · P3 — Micro-affordances at 5–8 meters.** Page dots are 8px (`w-2 h-2`, `:483`), the "Next…" preview is `text-xs`/`text-sm` italic (`:487-490`), "Read Page" is `text-sm` (`:475`), and the hook card carries teacher-only micro-instructions (`:434`). Same at-distance class the Focus Cards audit flagged (dots/labels invisible from the back row).
- **F7 · P3 — Speaker identity degrades quietly.** `characters` comes from frozen `data.characters` only (`:105`) — the live bundle is used for portraits (`:111-116`) but not names/colors, so a renamed or missing frozen entry gives every unknown speaker the same fallback color (`getCharColor` with `idx === -1` always lands on red, `:359-363`) and a portrait-less initial bubble.
- **F8 · P3 — A mid-question new pick inherits locked question state.** The turn-change effect (`:341-348`) resets the scoring refs but not `selectedOption`/`eliminatedOptions`/`revealedAnswer` — a wheel pick landing during a answered-or-revealed question leaves the new student facing a board where the answer is already shown and taps are blocked (`handleOptionTap` gates on `selectedOption !== null`, `:203`) until the teacher Skips or the auto-advance fires. Narrow window, but it produces a "dead" board at exactly the moment a new kid is announced.

**What already works well (context — don't re-litigate):** the lifecycle discipline (refs reset per turn, awarded latch + "already scored" chip, streak tiers with confetti at 3/5), the unified triple-write through `logAttempt` (FIXPLAN P3.3 — analytics + FSRS + remediation in one seam), the two-miss teaching ladder (eliminate → reveal with explanation), the session-scoped asked-items coordination with Story Sequencing, amber vocabulary highlighting tied to the live manifest, live-bundle-first portrait resolution, and the honest empty states (no pages, no questions).

## §4 ⬜ ChatGPT Co-Work quality audit

> **Co-Work: write your findings ONLY inside this section.** (Full instructions + shared prelude embedded at `file-ready`.)

### 4.a UI & visual design

- **P1 — Implement the Owner's Two-Column Layout (Center Art + Left Dialogue Panel).** **Evidence:** §2 (Owner comment #3) and §3 F2 (`BoardStoryStage.tsx:440-492`). Currently, original story art (often 4:3 or square comic panels) is stretched and cropped using `object-cover` across the 16:9 canvas (`:445`), discarding 25–33% of the illustration. A dark 50% vertical gradient and right-edge vignette are painted directly across the image (`:449-452`), and a floating glass card sits on top of the bottom third of the artwork (`:454-479`). Long dialogue lines push the text card upward, completely obscuring the characters and actions. **Recommendation:** Redesign the story page into a dedicated two-column storybook stage:
  - **Left reading theater (38% width):** A dedicated, high-contrast narrative card featuring the active speaker's character avatar, speaker name in their signature theme color, large story dialogue (28–34px) with target vocabulary highlighted in amber underline, a tactile "Listen / Read Page" audio button, and a visual speech tail pointing toward the scene.
  - **Center/Right art stage (62% width):** The uncropped story illustration framed in a clean card container with rounded corners (r-24) and subtle elevation shadow (`object-contain`). The artwork becomes the visual star of the stage, completely free of darkening overlays and overlapping text boxes.

- **P2 — Comprehension quiz layout and projection contrast at 5–8 meters.** **Evidence:** `BoardStoryStage.tsx:516-560`. In comprehension mode, questions are presented in a 2-column grid of glass buttons (`:536-559`). Text contrast and option borders blend into the background, making it difficult for children in the back row to distinguish options A, B, C, and D. **Recommendation:** Elevate the quiz screen with high-contrast, tactile option tiles (A, B, C, D) using distinct letter badges, minimum 24px typography, bold selected states, and dimmed/crossed-out eliminated states.

- **P2 — Microscopic progress dots and navigation previews.** **Evidence:** §3 F6 (`BoardStoryStage.tsx:483-490`). Page progress is indicated by tiny 8px dots (`w-2 h-2`), and the upcoming page preview is rendered in `text-xs`/`text-sm` italic. From 5–8 meters away, students cannot gauge how much of the story remains, and the preview is unreadable. **Recommendation:** Replace microscopic dots with a clear page chip in the header: "Page 3 of 6", or a tactile horizontal pill rail (minimum height 24px). Remove tiny upcoming-page italic text from the kid-facing projector.

- **P2 — Responsive reflow for phone-landscape floor (~700×320).** **Evidence:** `_CROSS-CUTTING.md` #1. On a mobile landscape screen, a fixed two-column layout would compress text into illegible columns. **Recommendation:** Reflow gracefully: at 16:9 projection, display the canonical two-column layout (art right, text left); at the ~700×320 phone-landscape floor, adjust to an uncropped left-anchored image with an expandable right/bottom text card, ensuring touch targets remain ≥44×44px with zero vertical scrolling.

### 4.b Workflow & user flow (teacher's path: start → turns → end)

- **P1 — Teacher buttons on Remote/Commander act on UNSEEN quiz questions during the story read-through.** **Evidence:** §3 F1 (`BoardStoryStage.tsx:262-336`). The action listener does not check `isComprehension`. If a teacher presses "Correct" while on page 2 of the story (e.g. verbally praising a student who read aloud), the code scores and marks asked an unseen question from the upcoming quiz (`:304-325`), awarding points prematurely and burning that question from the shared session ledger. Pressing "Hint" or "Skip" similarly consumes future questions silently. **Recommendation:** Enforce strict phase gating: during the story read-through (hook card and pages 0…N−1), the Remote and Commander control set must only expose `NEXT_PAGE`, `PREV_PAGE`, `READ_PAGE` (Audio), and `SKIP_TO_QUIZ`. The scoring buttons (`CORRECT`, `HINT`, `SKIP`) must be hidden or disabled until the comprehension quiz phase begins (`isComprehension === true`).

- **P1 — No remote button to replay page audio.** **Evidence:** §3 F3 (`BoardStoryStage.tsx:475-477`). The "Read Page" button exists exclusively on the projector board. The component lacks a `PLAY_AUDIO` action listener, and the remote control set provides no audio button. To replay a sentence for choral repetition, the teacher is forced to walk across the room to tap the board. **Recommendation:** Add a `PLAY_AUDIO` action listener to `BoardStoryStage.tsx` and map a prominent `Read Page / 朗读本页` button to both Commander and Remote Baton.

- **P2 — Async comprehension race condition and dead-end end card.** **Evidence:** §3 F4 (`BoardStoryStage.tsx:82-100, 510-513`). `comprehensionItems` are fetched asynchronously via `useBoardPool`. If the teacher pages through a short story quickly, they reach "The End" while the pool is still resolving, triggering the fallback "No comprehension questions available". Once parked there, `NEXT_PANEL` does nothing (`:268-272`), and the slide never emits `SLIDE_COMPLETE`, stranding the teacher on "The End" card. **Recommendation:** Ensure pool items are pre-loaded on mount. When no comprehension questions exist, the "The End" card must display a clear "Finish Story →" button that emits `SLIDE_COMPLETE` to smoothly advance the lesson.

- **P2 — Mid-question student pick inherits locked question state.** **Evidence:** §3 F8 (`BoardStoryStage.tsx:341-348`). Spinning the wheel during a question resets the scoring refs but fails to reset `selectedOption`, `eliminatedOptions`, or `revealedAnswer`. If a new student is picked while an answer is highlighted, the board remains locked against further taps until auto-advance clears it. **Recommendation:** Fully clear all question selection state (`selectedOption`, `eliminatedOptions`, `revealedAnswer`) whenever `currentTurnId` changes.

- **P3 — Silent choral scoring illusion.** **Evidence:** §3 F5 (`BoardStoryStage.tsx:157-158`). When no student is picked (`quickWheelWinner === null`), `doDualWrite` returns early without saving points, yet the board still plays success chimes, bounces "Correct!", and fires streak confetti. **Recommendation:** When in choral mode, display a clear "Choral Reading / 全班跟读" badge, and award points to the shared class meter rather than silently dropping them.

### 4.c Pedagogical practice (ESL ages 6–12)

- **P1 — Storybook format supports receptive-to-productive transition.** As an OUTPUT phase activity, Story Stage serves as the narrative bridge where newly acquired vocabulary (from Focus Cards) appears in authentic communicative context. The two-column layout (art right, text left) reinforces natural reading flow (left-to-right eye movement) and strengthens visual-textual dual coding.

- **P2 — Two-miss scaffold in comprehension quiz provides genuine corrective teaching.** **Evidence:** `BoardStoryStage.tsx:215-235`. On a first miss, the tapped distractor and another incorrect option are eliminated, allowing a second attempt. On a second miss, a micro-explanation card reveals the correct answer with an audio hold. This is sound pedagogy: it avoids punitive dead-ends and turns mistakes into learning moments. Keep this mechanic intact in the redesign.

- **P2 — Target vocabulary highlighting must remain prominent.** Target vocabulary items are dynamically highlighted with amber styling (`:385-403`). This assists early readers in noticing target words within continuous text. Ensure high visual contrast against the narrative background card.

### 4.d Game interaction (mechanic, pacing, fairness, fun)

- **P2 — Story pacing and turn momentum.** A 4–6 page storybook should take roughly 3–4 minutes of class time:
  1. *Hook Card (15s):* Teacher introduces the setting and characters.
  2. *Story Read-Through (2–3 min):* Teacher plays audio line $\rightarrow$ class repeats in choral echo $\rightarrow$ Next Page.
  3. *The End Beat (5s):* Brief story conclusion.
  4. *Comprehension Quiz (1–2 min):* Wheel spins for a responder $\rightarrow$ student picks option $\rightarrow$ feedback $\rightarrow$ auto-advance.

- **P2 — Smooth transition from choral read-through to individual quiz.** The switch from whole-class choral reading to individually scored quiz questions must be visually unmistakable. Display a clean transitional bumper ("Quiz Time! Let's spin the wheel!") so the classroom energy shifts from listening to answering.

### 4.e Top-5 prioritized recommendations

1. **P1 — Rebuild into the Owner's Two-Column Story Layout:** Centered uncropped illustration on the right; dedicated reading panel on the left (speaker avatar, colored name, large text with amber vocabulary highlights, and a prominent audio button).
2. **P1 — Phase-Gate Remote and Commander Controls:** Show story navigation (`Next Page`, `Prev Page`, `Read Audio`) during the read-through; strictly gate quiz controls (`Correct`, `Hint`, `Skip`) to the comprehension phase.
3. **P1 — Add Remote and Commander Audio Replay Control:** Provide an accessible `Read Page / 朗读本页` button on the remote so the teacher can trigger model narration without touching the board.
4. **P2 — Eliminate Comprehension Pool Race Conditions & Dead-End Exits:** Guarantee pool pre-loading on mount; if no comprehension questions exist, ensure "The End" card cleanly advances via `SLIDE_COMPLETE`.
5. **P2 — Scale Reading & Quiz UI for 5–8m Projection:** Upgrade 8px dots to tactile page pills ("Page 3 of 6"); enlarge comprehension option cards with bold A/B/C/D letter badges and high-contrast text.

### 4.f Design direction for Stitch (style/mood guidance + the 3–5 key screens/states to design; what to KEEP from the current design)

**Mood and visual system.** Design this as a warm, immersive "Illustrated Storybook Theater". Deep mahogany-ink stage (`#15120A` to `#1E1B0E` with a subtle amber glow), a warm parchment-cream reading card (`#FFFDF7`) on the left, rich comic illustration centered on the right, vibrant jewel-toned speaker identity badges, glowing amber for highlighted vocabulary words, and hot pink (`#EC4899`) for primary progression actions. Typography should feel literary yet ultra-legible (rounded display serif or confident geometric sans) with 100% projection clarity from 8 meters.

**Mock up these four board screens/states:**

1. **Screen 1 — Story Page (Two-Column Reading Layout):** Full-bleed 16:9. Left 38%: Cream narrative card with rounded corners, speaker circular avatar (e.g. Leo the Lion), teal speaker name, large dialogue text ("Look at the tall green **trees**!"), glowing amber vocabulary highlights, and a sky-blue "Listen 👂" audio button. Right 62%: Centered 4:3 uncropped comic illustration in a warm framed card. Header shows a clean "Page 3 of 6" pill.
2. **Screen 2 — Story Page (Choral Echo Beat):** Same layout, but with an animated sound-wave pulse on the left panel, audio playing state, and a friendly floating banner: "Repeat together! 🗣️ 跟读！".
3. **Screen 3 — Comprehension Quiz Screen:** Transition into quiz mode. Top: clean question card with a book icon ("Where did Leo find the apple?"). Center: 4 large, tactile option tiles (A, B, C, D) with high-contrast text and colorful borders. Top-right: picked student badge ("Alice's Turn · Question 1 of 3") and sky-blue timer pill.
4. **Screen 4 — Story & Quiz Completion Screen:** "Story Complete! 📖" celebration card featuring all story character avatars cheering, celebratory star burst, and a prominent hot-pink "Next: Practice Phase →" button.

**What to KEEP from current design.** Retain target-vocabulary highlighting in story text, live bundle character avatar resolution, two-miss comprehension scaffold (distractor elimination $\rightarrow$ explanation reveal), and the shared session-scoped asked-items ledger with Story Sequencing.

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

## §5 note — wave-2 design pass SUBMITTED 2026-09-11 (ZCode → Stitch, autonomous)

Two key screens per game per the §4 brief (briefs in `prompts/wave2-stitch.json`, submitted into project 17415096891547227013; all 26 accepted by the API). Screens materialize asynchronously in Stitch's generation queue — ZCode verifies against the QA list, exports to `stitch/07-story-stage/`, then implements with the wave-2 logic fixes (already deployed `bfd78ab`).

## §6 ✅ Stitch output & implementation notes — ZCODE VERSION (head-to-head round 1)

**IMPLEMENTED 2026-09-11 (reading state of `BoardStoryStage.tsx`)** — first game under the follow-the-design rule from `_WAVE1_RETRO.md`: implementation STARTS from `stitch/07-story-stage/1-reading-theater.html`. The page state (hook / end-card / comprehension states unchanged this round) now renders the design's Reading Theater: 38/62 split, speaker halo + SPEAKING NOW + LINE n/N, 44px chant blockquote with emerald vocab underline, sky REPLAY pill, chunky 28px progress dots, uncropped object-contain art card + ambient gradient, footer Back/hot-pink Next Line (real `nextPanel`/`prevPanel`).

**Fidelity:** design colors/typography adopted verbatim (`#070C18/#0B132B/#111C3D/#16234D`, `#FF2E79`, `#38BDF8`, `#10B981`; Fredoka/Sora/JetBrains Mono via `ss-mono` + app display stack). Stripped: Console-Synced pill, system icon cluster, SPACEBAR tag, Emphasis/Mood chips (no data), response meter, projection-status footer text. Substituted: speaker avatar → `speakerPortrait`/emoji fallback in the design's halo; scene HUD → `SCENE n` (no scene-title data); watermark → story title. Anti-Gravity is implementing its own version into `BoardStoryStage.ag.tsx` (prompt: `prompts/antigravity-07-story-stage.md`) — owner compares, the winner's approach becomes the template.

**Gauntlet:** tsc clean · 762/762 vitest · build clean. Board-capture scripts ready (`scripts/testing/games-v3-ss-shots.ts`); live-session capture pending (fixture board needed an active commander connection — to re-verify in-app with the owner watching).

## §7 ✅ Anti-Gravity implementation notes (head-to-head round 1)

**IMPLEMENTED 2026-09-11 (`apps/board/templates/BoardStoryStage.ag.tsx`)** — Rebuilt the Reading Theater state directly from `stitch/07-story-stage/1-reading-theater.html`, preserving 100% of the underlying lifecycle, hooks, dual-write scoring, remote action handlers, and pool coordination verbatim.

### Fidelity to Stitch Design
- **Two-Column 38% / 62% Split**: Maintained exact layout tree with dedicated reading theater on the left and uncropped art card on the right.
- **Palette & Contrast**: Adopted exact hex values (`#070C18` night, `#0B132B` surface, `#111C3D` surface-card, `#16234D` surface-elevated, `#FF2E79` pink-accent, `#38BDF8` sky-accent, `#10B981` emerald-accent, `#F59E0B` amber).
- **Typography & Font Roles**: Applied Fredoka display font, Sora UI text, and JetBrains Mono code/HUD typography with text dialogue glow (`text-shadow: 0 2px 14px rgba(0,0,0,0.8), 0 0 20px rgba(255,255,255,0.12)`).
- **Chunky 28px Dots**: Realized with completed emerald `✓` + shadow, active luminous pink pulse ring, and upcoming outlined dots.
- **Uncropped Artwork**: Artwork container set to `object-contain` with subtle ambient gradient backlight (`from-amber-500/10 via-transparent to-sky-500/10`) and stage watermark.

### Intentional Deviations & Adaptations from Stitch Mock
1. **Stripped Mock Chrome**:
   - Stripped `TEACHER CONSOLE SYNCED` chip (sync is automatic via Supabase Realtime).
   - Stripped volume, settings, and fullscreen header icon cluster (system/projector concerns managed by BoardShell).
   - Stripped `SPACEBAR` kbd shortcut badge from the audio replay button (the projector board is touch-driven; keyboard shortcuts belong to the teacher remote).
   - Stripped secondary `speed` pronunciation drill button (no speed modulation parameter in SpeechService).
   - Stripped `Emphasis` and `Mood` badges below dialogue (manifest schema contains no emphasis/mood metadata).
   - Stripped `Class Response Meter` 4-dot graphic from art footer (no student-device hardware in classroom model; replaced with active teacher/choral cue).
   - Stripped footer projection/audio metadata (`16:9 Classroom Stage · 8m Distance Optimized` / `Studio Audio Track · 48kHz Stereo`) in favor of clear line position info.
2. **BoardShell Phase Pill Clearance**:
   - Replaced Stitch's static top-left `PHASE: STORY READ` pill with `pl-40 lg:pl-48` padding so header elements start safely clear of the live `BoardShell` phase pill.
3. **Data Bindings**:
   - Speaker avatar and halo color dynamically bound to `current.speaker` and `getCharColor()` with glowing gradient border.
   - Text rendered through `renderText(current.text)` with emerald `#10B981` target vocabulary underline.
   - Art wired to `current.imageUrl` with graceful fallback gradient.
   - Navigation actions wired to `prevPanel()` and `nextPanel()` with proper phase transition to comprehension quiz when story ends.
4. **Responsive Floor Adaptation (700×320 Phone Landscape)**:
   - Clamped dialogue blockquote typography from `text-[20px]` at the 320px height floor up to `text-[44px]` on 1080p projectors, preventing cutoffs and keeping play 100% scroll-free.
   - Scaled vertical padding and header/footer heights responsively (`p-2 sm:p-4 lg:p-6`, header `h-10 sm:h-12 lg:h-14`).
   - Progress dot strip wrapped in an overflow container for stories exceeding 6 pages.

5. **Multi-Speaker Bubble Parsing & Per-Character Audio Playback (Owner Request)**:
   - **Context**: In textbook scans, a single image page frequently contains multiple speech bubbles for different characters talking, but `story_pages.text` stores them combined in one string.
   - **`parseDialogueLines` Engine**: Parses multi-speaker text using newline boundaries, colon prefixes (`Speaker: ...`), bracketed attributions (`[Speaker] ...`), and cast list regex matches from `currentStory.characters`. Automatically strips duplicate prefixes from dialogue text while preserving character attribution and color bindings.
   - **Interactive Multi-Speaker Cards**: When multiple dialogue lines exist (`parsedLines.length > 1`), displays separate interactive speaker cards with character portraits, name badges, colored halos, and vocabulary highlighting. The currently selected speaker card receives an active glow. When a single speaker is present, retains Stitch's 44px chant blockquote format.
   - **Targeted Line-by-Line Audio**: Tapping any speaker's dialogue card directly triggers `playAudioUrl(undefined, line.text)` to read *only* that character's individual sentence via TTS. The bottom "REPLAY AUDIO LINE" button targets the currently active speaker line.
   - **Line-by-Line Stepping**: Next / Prev controls (and remote actions `NEXT_PANEL` / `PREV_PANEL`) cycle across individual speaker turns on a page before advancing to the next panel.

6. **Live-Screen Cutout Image / Book Crop Rendering (Owner Request)**:
   - **Context**: In Teacher Commander, the story illustration/cutout image rendered correctly, but on the live projector screen (`ClassroomBoard`), the image card fell back to the brown gradient title box.
   - **Root Cause**: In Teacher Commander, `setActiveUnit` attaches `_relational` via `get_unit_bundle`, which populates `p.imageUrl` via the `assets` table join. On the live screen, `applySessionRow` does not call `get_unit_bundle`, so `getStory` falls back to `normalizeManifest`, which maps the book crop/cutout to `image_url` (from `image_url_book_crop`). The template strictly checked `current.imageUrl`, causing `{current.imageUrl ? ...}` to evaluate to false.
   - **Multi-Source Key Resolution (`resolvePageImageUrl`)**: Added resolver inspecting `imageUrl`, `image_url`, `image`, `image_url_book_crop`, `cropUrl`, `crop_url`, and `url`.
   - **Live Screen Relational Recovery**: Added automatic background fetch of `get_unit_bundle` (falling back to `story_pages` joined with `assets`), attaching `_relational` to `manifest` in-memory and updating `dbPages`.
   - **Cross-Source Page Merging**: Merges `relPages`, `flowPages`, `dataPages`, and `dbPages` so all text, speakers, audio, and cutout images are guaranteed to render on both the live projector and commander surfaces.

### Verification Gauntlet
- `npx tsc --noEmit -p tsconfig.json` — clean (0 errors).
- `npx vitest run` — 762/762 passed (1 skipped).
- `npm run build` — clean production build (0 errors).


