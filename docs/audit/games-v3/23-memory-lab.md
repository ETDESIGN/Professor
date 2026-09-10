# Memory Lab — v3 Quality Audit (`MEMORY_LAB`)

> **Status:** **stitch-implemented** — Stitch design (`1-memorize.html`, `2-recall.html`) implemented, 3-step verification gauntlet clean (Anti-Gravity 2026-09-11).
> **Screenshots:** `screenshots/23-memory-lab-idle.png`.

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

- **Flow type:** `MEMORY_LAB`
- **Component:** `apps/board/templates/BoardMemoryLab.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** custom — SKIP_ITEM ("Skip Round") / MARK_CORRECT ("Correct") / RESET_GAME ("Redo") / SLIDE_COMPLETE forced ("End") (`apps/teacher/live/panels/ContextualControls.tsx:232-240`)
- **Data sources:** `useBoardPool({ exerciseTypes: ['IMAGE_SELECT'], classWeak: true, roster })` → `cardPool` (correct-option image + word per item); `useSpeech` reference audio; `useSpeechRecognition` for produce rounds; `preloadRoundSpeech` TTS warm-up
- **Mode:** picked student

## §1 How the game works today

**A "what's missing" memory game in rounds: memorize a grid of picture cards, one disappears, recall it — by tapping its picture (rounds 1–2) or by speaking the English word (round 3, + round 4 when the pool is big).** Each round runs a fixed phase machine: `memorize → choral → recall → feedback`, then the next (bigger, faster) round.

**Round ladder (the current growth curve).** Three base rounds — 4 cards / 10s memorize, 6 / 8s, 8 / 6s — plus a 10-card / 5s "tension round" appended only when the pool has ≥10 distinct illustrated cards (`ROUNDS` + `TENSION_ROUND`, `:51-60`; composed in the `rounds` memo `:127-130`). Rounds 1–2 are `recognize` mode, rounds 3–4 are `produce` mode. Every round-count surface (progress dots, "Round x of y", advance guard) reads the composed ladder.

**Round setup (deterministic, coverage-first).** Cards are dealt from the unit's IMAGE_SELECT pool (class-weak first), shuffled with the shared per-turn seed so every tab shows the identical grid (E1.5). The removed ("tested") card is picked from words *not yet probed in earlier rounds* (`testedCardsRef` coverage set, `:150-156`) — no word gets re-tested while the rest of the pool was never probed; the cycle restarts when exhausted. Candidates = the missing card + 3 distractors that are *not in the grid*.

**Memorize phase.** The grid deals with a flip-in animation; an 80px countdown ring runs the memorize clock with an audible tick per second that doubles (500ms) under 4s left (tension ramp, `:214-218`). **Choral callout:** a ~1.5s full-screen pulsing "Everyone — point at the missing card!" beat with a reveal cue bridges memorize → recall (`:225-233`). **Recall phase:** the grid re-shows with the missing slot as a dashed ❓ gap. In *recognize* rounds the student taps the missing card among 4 image candidates below. In *produce* rounds the student presses "Tap to Speak" and says the English word — browser speech recognition scores it (transcript + % score shown); if speech isn't supported the game falls back to four English-word buttons (a word-MCQ). **Wrong answers:** wrong cue, streak reset, live −1 mistake penalty, `logAttempt(incorrect)`; after a 2nd miss the round auto-resolves as a miss — and, as a deliberate MemoryLab exception, the missing card is *never revealed* (that would defeat the mechanic); only "Missed it — moving on…" shows.

**Scoring.** A successful recall (tap, spoken pass, or the remote's **Correct** override — honored also during the choral callout, `:409-415`) → `scoreForAttempt(mistakes, difficulty, partialRatio, streak)` points to the picked student + `logAttempt` (modality `productive` on speech rounds, `receptive` otherwise). **Feedback phase** is a 2.2s teaching card: the missing image + its English word + "+N points" + a "Hear it" audio button (stored audio or reference TTS). Then `advanceRound` deals the next round (guarded: a bigger round only runs if the pool can fill it) or completes the game ("Memory Lab Complete! Elephant memory! 🐘" + idempotent natural `SLIDE_COMPLETE` broadcast).

**Turn & controls.** New wheel pick → full rewind to round 1 with fresh stats. **Skip Round** (SKIP_ITEM) advances immediately — stale auto-advance timers are generation-guarded (`roundGenRef`, `:74-75`, `:317-322`) so a skip racing a pending timeout can't double-advance. **Redo** restarts from round 1 and clears the coverage cycle. **End** (forced) jumps to the complete card. TTS for the round's words is pre-warmed in the background when the pool lands.

**Empty/loading states:** "Loading memory items…" while the pool fetches; if fewer than 4 distinct illustrated cards exist, an explicit card tells the teacher to run the exercise generator (with images) or skip to the next slide.

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> The memory game is quite good, but the problem is we just memorize cards — we don't really memorize the English word. So we need this kind of memory game, but instead of picking up the matching card, we need to pick up the matching word (or something like this). 4 up to 6 cards is the maximum — because if the next levels keep getting more and more difficult, we get like 10 or 12 cards, which is just not necessary. But the main point is: it's not a memory class, it's an English memory class. So we need a way to have to remember the English: either we see the word and have to pick up the matching visual, or we have a visual and need to pick up the right word. That's something to think about.

**Clarified with the owner (2026-09-09):**
- Matching must train ENGLISH: alternate directions across rounds — see IMAGE → pick the matching WORD, then see WORD → pick the matching IMAGE.
- Grid hard cap 4–6 cards (the current 10-card round 4 goes away).
- "It's not a memory class, it's an English memory class."

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardMemoryLab.tsx` unless noted.

- **F1 · P1 — Recognize rounds train picture memory, not English.** The recall challenge is image↔image identity: the missing thing is an IMAGE and the candidates render `card.imageUrl` only (`:607-627`, img at `:623`) — the English word never appears before resolution; it surfaces only on the post-answer feedback card (`:710`). §2's core complaint ("we just memorize cards — we don't really memorize the English word") is exactly this: rounds 1–2 are a pure visual-memory task with English bolted on after the fact.
- **F2 · P2 — Grid cap breached: the ladder grows 4→6→8→10.** `ROUNDS` (`:51-55`) plus `TENSION_ROUND` 10/5s staged when the pool has ≥10 cards (`:60`, `:127-130`). Owner cap is 4–6; the 8-card round 3 and the whole tension round must go. The cap change lands in exactly two places: the `ROUNDS`/`TENSION_ROUND` constants and the `advanceRound` pool guard (`:432-440`) — every other surface reads the composed `rounds` memo, so nothing else hardcodes a count.
- **F3 · P2 — The §2 direction mechanic already exists in embryo, and the seam for alternation is clean.** Every `MemoryCard` carries both halves (`word` + `imageUrl` + audio, `:36-43`); the speech-unsupported produce fallback already renders English-word buttons against the image grid (`:638-648`) — i.e. see-images→pick-word. The redesign's natural seam: add a `direction: 'image→word' | 'word→image'` field to `RoundConfig` (`:45-49`), render word-pods or image-pods for the candidates in the recall block (`:607-627`), and (for word→image) swap which side of the pair the grid/candidates show — candidate construction (`:162-166`) and `handleCandidateSelect`'s id-compare (`:423`) need no change.
- **F4 · P2 — The memorize clock cannot be paused or re-run from the teacher controls.** The countdown starts the instant a round sets up (`:193-206`); the remote group is Skip Round / Correct / Redo / End only (`ContextualControls.tsx:232-240`) — there is no "Show Again"/pause like WHATS_MISSING's replay control, so a teacher still introducing the round either burns the clock or skips the round wholesale.
- **F5 · P2 — 8/10-card grids are undersized and cramped on projection.** Cards are fixed `aspect-square w-40 md:w-44` (`:536`, `:591`) in a hard `grid-cols-4` when `gridSize > 4` (`:529`, `:587`): 8 cards = two rows of ~160–176px images inside `max-w-5xl`; the 10-card round squeezes a third row. At 5–8m these are small, and there is no responsive reflow. (Partially self-resolves under the §2 4–6 card cap — keep as sizing guidance for the redesign.)
- **F6 · P3 — Produce rounds silently depend on the board tab's mic.** Speech recognition requires board-tab permission + a supporting browser (`:630-683`); a denied/unsupported board degrades every produce round to the word-button MCQ with no teacher-facing signal (MARK_CORRECT remains the documented manual path).
- **F7 · P3 — Countdown ring and prompts are small at distance.** The ring is a `w-20 h-20` svg with a `text-3xl` number (`:515-526`); "Memorize the cards!" is `text-xl text-gray-600` (`:512`) — below the projection legibility bar the prelude sets.
- **F8 · P3 — Double-miss path shows no teaching content.** By exception the missing card is never revealed (`:396-404`, correct for the mechanic), but the word itself is also never shown — the round ends on "Missed it — moving on…" (`:581-583`) with no word/audio beat; the missed word's only remediation is the background `logAttempt` push.
- **F9 · P3 — Chrome duplication + palette clash.** In-game picked-student footer (`:737-746`) duplicates the BoardShell whose-turn banner; light cyan-on-white palette vs the shell's dark PRACTICE wash; the 240px leaderboard rail stays up (`BoardShell.tsx:41,112` — MEMORY_LAB not in FULL_BLEED_TYPES); the terminal card is generic (no per-student rounds/words summary despite the stats existing in state, `:725-733`).

**What already works well (context — don't re-litigate):** coverage-first tested-card selection (`testedCardsRef`), seeded identical deals on every tab (E1.5), generation-guarded advance timers (skip races can't double-advance), the choral callout beat, the tension tick loop with airtight cleanup on every exit path, the never-reveal memory exception, MARK_CORRECT honored even during the choral callout (dead-button avoidance), background TTS pre-warm, and honest empty/loading states with a fix path.

## §4 ⬜ ChatGPT Co-Work quality audit

### 4.a UI & visual design
- **Severe vertical clipping on 16:9 projection (F5, screenshot `23-memory-lab-idle.png`):** The current board layout places a multi-tiered header ("WARM-UP" pill, "Memory Lab" title, progress dots, round subtitle, instruction line, and an 80px circular SVG countdown timer) *above* the card grid. Even on a modest 4-card 2×2 grid, the bottom row of cards is clipped by the rounded container border and bottom edge. When the grid escalates to 6, 8, or 10 cards, cards become tiny (`w-40 md:w-44` in `grid-cols-4`) and overflow vertically off-screen, completely breaking viewing from 5–8 meters.
- **Recall phase layout collision:** In the recall phase, the board must render *both* the memory grid (with the missing card slot) and a tray of 4 candidate options below. Because the grid already consumes nearly the full vertical height, the candidate tray is crammed into the bottom bezel, requiring tiny tap targets or causing extreme visual congestion.
- **240px leaderboard rail encroaches on grid width (F9):** `MEMORY_LAB` is absent from `FULL_BLEED_TYPES` in `BoardShell.tsx:41,112`. The persistent 240px right rail severely narrows horizontal stage width. Memory Lab requires horizontal breathing room for 4–6 cards arranged in 1 or 2 tidy rows. The rail should retract during active play.
- **Microscopic timer and illegible prompts at 5–8m (F7):** The countdown timer is a tiny `w-20 h-20` circle with `text-3xl` numbers, and instructions are rendered in muted `text-xl text-gray-600`. In a bright classroom at distance, children cannot read the remaining time or instruction. The timer should be a prominent, glowing top-mounted HUD gauge with clear visual urgency.
- **Stark palette clash with PRACTICE envelope (F9):** The game mounts a light cyan/white card over the dark BoardShell background, clashing with the dark immersive palette of the PRACTICE stage.

### 4.b Workflow & user flow (teacher's path: start → turns → end)
- **Uncontrolled timer auto-start creates classroom chaos (F4):** The countdown clock starts ticking the millisecond the round mounts (`:193-206`). Teachers in live classrooms need 3–5 seconds to direct students' attention to the screen ("Look at the board! Eyes front!"). By the time students focus, 4 seconds have elapsed and the tension tick is already firing.
- **Missing remote clock controls ("Pause" / "Show Again") (F4):** Remote controls currently provide only `SKIP_ITEM`, `MARK_CORRECT`, `RESET_GAME`, and `SLIDE_COMPLETE` (`ContextualControls.tsx:232-240`). There is no "Pause Clock" or "Peek Again / Replay Memorize" button. If a student is distracted or enters late, the teacher must let the round fail or reset the entire game from round 1.
- **Choral vs. Individual turn ambiguity:** When `quickWheelWinner` is active, the board still fires the 1.5s pulsing banner: *"Everyone — point at the missing card!"* (`:225-233`). This confuses class turn-taking: whole-class shouting drowns out the picked individual. The prompt should explicitly address the active participant (e.g., *"Alice, what's missing?"* vs. *"Everyone together!"* in choral mode).
- **Post-round advance and skip mechanics work reliably:** Skip round cleanly advances using generation-guarded refs (`roundGenRef`, `:74-75`), preventing double-advances. Remote `MARK_CORRECT` is properly honored even during the transition beat.

### 4.c Pedagogical practice (ESL ages 6–12)
- **The Core Pedagogical Failure: Picture-to-picture memory without English encoding (F1, §2):** In rounds 1–2, the grid shows images, one image vanishes, and the candidate tray displays 4 images (`card.imageUrl`). The student never sees, hears, or speaks an English word during the challenge! The brain encodes purely visual shapes and colors (e.g., "the green trees are gone"). English vocabulary is relegated to a post-round passive feedback card. This violates the foundational purpose of the app: **it is an English language lesson, not a cognitive working memory test.**
- **The Solution — Multimodal Cross-Direction Alternation (F3, §2):**
  - **Round 1 (Image Grid $\rightarrow$ Word Recall):** Memorize a grid of 4 target *images* (with clear English word labels below each image). In the recall phase, one slot is empty `❓`. The candidate tray presents **4 English words** (with audio pronunciation icons). The student must recall the missing image and identify its English word!
  - **Round 2 (Word Grid $\rightarrow$ Image Recall):** Memorize a grid of 4–5 **English words** (with phonetic/audio support). In the recall phase, one word vanishes. The candidate tray presents **4 distinct images**. The student must connect the recalled lexical item to its visual meaning.
  - **Round 3 (Productive Speech / Spoken Word):** A grid of 4–6 items. The missing card must be spoken aloud in English by the student, using browser speech recognition or instant teacher remote validation (`MARK_CORRECT`).
- **Excessive cognitive load from 8- and 10-card ladders (F2, §2):** Climbing to 8 and 10 cards breaches working memory capacity for 6–12 year olds (Cowan's $4 \pm 1$ limit) and causes cognitive exhaustion and disengagement. The owner's hard cap of **4 to 6 cards** must be strictly enforced.
- **Double-miss remediation blackout (F8):** While keeping the missing card hidden during guessing is correct game theory, failing twice currently terminates the round with *"Missed it — moving on..."* without ever revealing the English word or playing its pronunciation. A double-miss must conclude with an explicit educational reveal: show the target image and English word, play the audio, and log the objective for spaced repetition.

### 4.d Game interaction (mechanic, pacing, fairness, fun)
- **Three-round streamlined progression:**
  - Round 1 (Receptive: See Images $\rightarrow$ Pick Word, 4 cards, 8s timer).
  - Round 2 (Associative: See Words $\rightarrow$ Pick Image, 5 cards, 7s timer).
  - Round 3 (Productive: Missing Item $\rightarrow$ Say the Word, 6 cards, 6s timer).
  - Elimination of the bloated 10-card "Tension Round".
- **Visual card format:** Replace tall square boxes with widescreen horizontal plates (~4:3 ratio). 4 cards arrange in a single horizontal row (`1×4`); 5–6 cards arrange in a balanced `2×3` grid, guaranteeing 40% vertical clearance for the candidate tray.
- **Candidate tray design:** 4 clearly separated, numbered pill/card options (`A`, `B`, `C`, `D`) with prominent typography and tactile hover/active states, allowing easy pointing or verbal choice ("Letter B! / 'Dolphin'!").

### 4.e Top-5 prioritized recommendations
1. **P1 — Implement Cross-Modal English Alternation (Image $\rightarrow$ Word, Word $\rightarrow$ Image, Spoken Production) (F1, F3, §2):** Transform Memory Lab from a visual recall task into an English vocabulary engine. Round 1 tests visual-to-word recognition; Round 2 tests word-to-visual recognition; Round 3 tests productive spoken recall.
2. **P1 — Enforce 4–6 Card Hard Cap & Abolish 8/10-Card Ladder (F2, §2):** Cut `TENSION_ROUND` and cap grid size strictly between 4 and 6 cards across all rounds, preserving student stamina and visual sizing.
3. **P2 — Add Teacher Clock Controls ("Pause" & "Peek Again") (F4):** Update `ContextualControls.tsx` with a `PAUSE_TIMER` toggle and a `PEEK_AGAIN` (+3s reveal) action to give teachers instructional pacing control.
4. **P2 — Re-architect 16:9 Full-Bleed Layout to Eliminate Vertical Clipping (4.a, F5, F7):** Add `MEMORY_LAB` to `FULL_BLEED_TYPES`. Streamline the header into a compact top HUD, display cards in 1×4 or 2×3 widescreen grids, and place candidate choices in a dedicated bottom shelf without scrolling.
5. **P2 — Provide Educational Reveal & Audio on Double-Miss Exit (F8):** When a turn ends on a double miss, show a 2-second learning card with the correct image, English word, and auto-played pronunciation before transitioning to the next round.

### 4.f Design direction for Stitch
- **Mood and visual theme:** "Futuristic Memory Archive" / "Quantum Hologram Lab". Deep cyber slate/indigo background (`#0B132B`), glowing cyan specimen frames (`#00F0FF`), warm amber timer conduits (`#F59E0B`), and vibrant emerald confirmation glows (`#10B981`). Cards should look like floating holographic specimen plates.
- **Mock up these four screens/states (16:9 projector, no scrolling):**
  1. **Screen 1 — Memorize Phase (Image Grid with English Subtitles):**
     - Full-bleed 16:9 stage with top HUD: `[Round 1: Image → Word]` + central glowing amber digital countdown timer (`8s`).
     - 4 wide landscape specimen cards arranged in a horizontal row: each displaying high-resolution illustration + bold English word label beneath.
     - Student turn chip: *"Alice's Turn — Memorize the specimens!"*
  2. **Screen 2 — Recall Phase (Image $\rightarrow$ Word):**
     - Grid re-displayed: 3 visible image cards, 1 card missing (rendered as a glowing cyan dashed frame with a pulsing `❓`).
     - Bottom Candidate Shelf: 4 prominent horizontal English word pills (`A: TRACTOR`, `B: HELICOPTER`, `C: SUBWAY`, `D: BICYCLE`) with high-contrast typography.
  3. **Screen 3 — Recall Phase (Word $\rightarrow$ Image):**
     - Round 2 HUD: `[Round 2: Word → Image]` (5-card 2×3 layout).
     - 4 visible English word cards, 1 slot empty (`❓`).
     - Bottom Candidate Shelf: 4 clean illustrated image cards for students to select the missing concept.
  4. **Screen 4 — Feedback & Learning Reveal:**
     - Missing card revealed in center stage with an emerald energy beam.
     - Bold English word (`TRACTOR`), phonetic pronunciation, audio replay speaker button, and celebratory score splash (`+3 Points for Alice!`).
- **What to KEEP from current design:** Seeded deterministic card deals (`E1.5`), coverage-first probe rotation (`testedCardsRef`), generation-guarded timer advancement, and teacher remote `MARK_CORRECT` instant override.

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

## §5 note — wave-2 design pass SUBMITTED 2026-09-11 (ZCode → Stitch, autonomous)

Two key screens per game per the §4 brief (briefs in `prompts/wave2-stitch.json`, submitted into project 17415096891547227013; all 26 accepted by the API). Screens materialize asynchronously in Stitch's generation queue — ZCode verifies against the QA list, exports to `stitch/23-memory-lab/`, then implements with the wave-2 logic fixes (already deployed `bfd78ab`).

## §6 ✅ Stitch output & implementation notes

Implemented 2026-09-11 by Anti-Gravity against Stitch designs `1-memorize.html` and `2-recall.html`:

1. **Cross-Modal English Alternation Across Rounds (F1, F3, §2, §4.c):**
   - Eliminated image↔image cognitive loop. Memory Lab now systematically trains English vocabulary:
     - **Round 1 (`image→word`, 4 cards):** Memorize illustrated cards with English word labels; in recall, 1 slot is missing `❓`; candidate shelf renders **4 English word pills** (`A: TRACTOR`, `B: HELICOPTER`, `C: SUBWAY`, `D: BICYCLE`).
     - **Round 2 (`word→image`, 5 cards):** Memorize large English word plates; in recall, 1 slot is missing `❓`; candidate shelf renders **4 illustrated image cards**.
     - **Round 3 (`produce`, 6 cards):** Memorize items; in recall, 1 slot missing `❓`; productive speech interface with "Tap to Speak" / browser speech recognition (or 4 English word fallback buttons if mic unsupported) and teacher remote `MARK_CORRECT` override.
2. **Strict 4–6 Card Hard Cap (F2, §2, §4.c):**
   - Abolished the bloated 10-card `TENSION_ROUND` and 8-card tiers. Grid is capped strictly between 4 and 6 cards across all rounds, respecting Cowan's working memory bounds for ages 6–12.
3. **Teacher Clock Controls (F4, §4.b):**
   - Countdown timer waits for an explicit manual trigger ("START TIMER" button in top HUD, `SPACE` bar, or remote `NEXT_ITEM`/`PLAY_AUDIO`) so the teacher can direct student attention before ticking starts.
   - Clickable timer badge pauses/resumes countdown.
   - Added **Peek Again (+3s)** button in recall phase for instructional scaffolding when students get stuck.
4. **Educational Double-Miss Learning Reveal (F8, §4.c):**
   - Replaced silent dismissal ("Missed it — moving on…") with an explicit 2.6s learning card displaying the target illustration, bold English word, and auto-played native audio via `useSpeech` before advancing to the next round.
5. **Widescreen 16:9 Layout & Clear Candidate Shelf (F5, F7, F9, §4.a, §4.d):**
   - 4-card round renders in a single horizontal row (`1×4`, `grid-cols-4`).
   - 5–6 card rounds render in a balanced `2×3` grid (`grid-cols-3 grid-rows-2`).
   - Candidate shelf occupies a dedicated bottom tray that never collides with or clips the memory grid.
   - Header clearance `pl-28 lg:pl-44` protects against `• PRACTICE` badge overlap.
   - Fully responsive `@media (max-height: 450px)` styling ensures zero vertical scrolling at 700×320.
6. **Candidate Distractor Robustness:**
   - Gracefully handles small unit pools (e.g., 4–5 cards) by selecting distractors from outside the grid first, then from non-tested cards inside the grid, guaranteeing 4 candidate options (A, B, C, D) are always available.
7. **Keyboard Shortcuts:**
   - `SPACE`: Starts/pauses memorize timer; triggers mic in produce recall; replays audio in feedback.
   - `1`–`4` / `A`–`D`: Direct candidate selection.

### Verification Gauntlet
- `npx tsc --noEmit -p tsconfig.json` → **0 errors** (clean).
- `npx vitest run` → **762/762 passing** (1 skipped).
- `npm run build` → **Clean production build** (14.51s).
