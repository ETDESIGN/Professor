# Spelling Bee — v3 Quality Audit (`SPELLING_BEE`)

> **Status:** **cowork-done** — §4 co-work quality audit complete (Anti-Gravity 2026-09-10). Ready for §5 Stitch prompt.
> **Screenshots:** `screenshots/27-spelling-bee-idle.png`.

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

- **Flow type:** `SPELLING_BEE`
- **Component:** `apps/board/templates/BoardSpellingBee.tsx` (surface) + shared engine `components/games/spellingBee/` (`useSpellingBeeTurn`, `useSpellingBeeClock`, `keyboardEngine`, `contentBuilder`, `SpellingBeeStage`) — the same engine also drives the student solo app
- **Phase:** PRACTICE
- **Remote-control group:** custom — Hint / Correct / Skip Word / Redo / End (`apps/teacher/live/panels/ContextualControls.tsx:302-324`; baton parity at `apps/remote/TeacherRemote.tsx:659-685`)
- **Data sources:** `useBoardPool` (pool_items `IMAGE_SELECT` + `MEANING_MATCH` + `DICTATION`, seeded per session+unit) → `vocabulary_items` manifest → frozen flow-block `data.words` (3-tier fallback ladder)
- **Mode:** picked student — N words per turn (default 3) under a per-word countdown; `quickWheelWinner = null` = choral practice (game feel, zero score writes)

## §1 How the game works today

**Turn structure.** Each picked student gets one "wave" of `wordsPerTurn` words (default 3, clamp 1–10) dealt from a cursor that is deliberately NOT reset per turn — student 2 gets the NEXT words, so a pool is consumed across the class (`BoardSpellingBee.tsx:111,128-135,262`). `RESET_GAME` rewinds the cursor to 0 and re-deals wave 0 (`:279-289`). `NEW_TURN` (keyed on `state.currentTurnId`, never `lastAction`) zeroes the turn's points/mistakes, freezes the wave's owner name (so the score screen can never land on the next kid, `:117-126,261`), and deals the next wave (`:252-264`).

**Settings come from the plan block.** `BoardSpellingBee` reads `data.wordsPerTurn` (1–10, default 3), `data.timerSeconds` (0–120 clamp, **default 15**; 0 = untimed), and `data.letterRemoval` (default on) — `BoardSpellingBee.tsx:90-92`. These are edited at plan time in the PlanComposer inspector (`apps/teacher/PlanComposer.tsx:795-868`): a number input for words, a **select with only Off/10/15/20/25** for seconds (`:823-837`), and a toggle for key-dropping. New blocks are created with `wordsPerTurn: 3, timerSeconds: 15, letterRemoval: true` (`PlanComposer.tsx:182-188`).

**The word lifecycle — there is NO preview beat.** This is the heart of the §2 complaint:

1. **Word appears → clock already running.** The word card (a white card with the word's IMAGE, or a speaker icon fallback when no image) slides in over 0.25s (`BoardSpellingBee.tsx:398-419`), and the per-word countdown starts the SAME instant — the clock's `running` is just `status === 'typing'` (`useSpellingBeeTurn.ts:148-153`). There is no constant, effect, or phase that shows the word before the timer arms. The full budget (default 15s) must cover: see the image, (optionally) hear the word, and spell every letter.
2. **Audio is NOT auto-played at word start.** The word's TTS plays only when someone taps the card / the replay button (`SpellingBeeStage.tsx:53-57,127-136`) or AFTER the word resolves (`BoardSpellingBee.tsx:177,201`). The board does not listen for `PLAY_AUDIO`, so the commander/baton cannot replay the word either — hearing the word is board-tap-only.
3. **The word text is never shown during typing.** Letter slots stay transparent until each letter is typed (`SpellingBeeStage.tsx:99-122` — kids spell from the image + memory). The L1 `meaning` field is collected by the content builder (`contentBuilder.ts:75,106`) but never rendered anywhere on the board.
4. **Solved flash = 900ms; revealed flash = 1600ms** — the ONLY moments the complete spelling text is visible. Constants `SOLVE_HOLD_MS = 900` and `REVEAL_HOLD_MS = 1600` (`useSpellingBeeTurn.ts:46-47`); the green/amber letter slots, the audio, and the 0.25s slide-out of the word all share that window. At projection distance the class reads the word for under a second on success.
5. **Wrong letters burn the clock AND the score.** A wrong key flashes red + shakes for 600ms (`WRONG_FLASH_MS`, `useSpellingBeeTurn.ts:48,265-266`), drops the clock by 1s (`clock.penalize()`, `useSpellingBeeClock.ts:75-78`), and costs the picked student −1 live point (`BoardSpellingBee.tsx:158-169`).

**Typing surface.** An on-screen QWERTY (the kid at the board taps; `SpellingBeeStage.tsx:139-181`) plus a physical-keyboard listener for a–z (`useSpellingBeeTurn.ts:280-288`). Gameplay freezes while the wheel overlay is up so the spin window can never charge the incoming student (`BoardSpellingBee.tsx:243-249`).

**Adaptive scaffolding (the original game's signature).** With `letterRemoval` on, distractor keys drop off the keyboard as the clock burns and mistakes mount — budget = `mistakes + floor(elapsedRatio × 4) + hints × 3` (`keyboardEngine.ts:105-112`), a letter the word still needs is NEVER removed, removals are monotonic within a word, and the whole removal order is deterministic per `hashString(unitId|wordId)` so every tab agrees (`keyboardEngine.ts:119-145`, `useSpellingBeeTurn.ts:291-301`). **Hint** (remote) sheds 3 more keys via the same deterministic plan, or pulses the next needed letter once the keyboard is nearly narrow (`useSpellingBeeTurn.ts:319-346`, `keyboardEngine.ts:152-157`).

**Scoring (unified model).** Per SOLVED word: `scoreForAttempt(mistakes, word.difficulty, 1.0, streak)` (1–3 base + streak bonus, floor 1) **+1 speed bonus** if ≥50% of the clock remained, hard-capped at 5 (`BoardSpellingBee.tsx:180-182`); `addPoints` + `logAttempt` (analytics + FSRS + remediation) per word (`:186-196`) — deliberately NOT per wrong letter, to avoid flooding mastery for struggling spellers. **Timeout**: reveal + advance, zero penalty, but logged incorrect for FSRS/remediation (`:198-217`) — the clock-anxiety house rule. **Skip**: revealed, never scored. **Mark Correct**: force-solves, fills the untyped tail so the class sees the full spelling (`useSpellingBeeTurn.ts:181-186`), scored as solved. Streak 3/5 fire the streak cue + confetti (`:173-176`). Choral mode (`quickWheelWinner = null`): full game feel, zero writes.

**Turn summary.** Natural completion of the wave → win cue + confetti + a `SLIDE_COMPLETE` broadcast, and a modal: 0–5 stars (`starsForRun`: 5 = all solved + ≤0 mistakes … `contentBuilder.ts:188-196`), pts this turn, best streak, solved/attempted, the frozen owner's name ("X nailed it!") (`BoardSpellingBee.tsx:220-230,424-503`). Tap dismisses; in choral mode the tap rolls straight into the next wave (`:431-445`). A teacher-forced End settles silently via `forceComplete()` (no summary event, `useSpellingBeeTurn.ts:369-375`).

**Controls (commander + baton, full parity):** Hint / Correct / Skip Word / Redo / End (`ContextualControls.tsx:302-324`, `TeacherRemote.tsx:659-685`). Hint and Skip/Correct double as "advance" when pressed during a solved/revealed hold (`useSpellingBeeTurn.ts:349-366`). There is **no timer control and no audio control** in either set.

**Where the timing fixes hook (§2).** Three precise spots:
- **Longer default:** `BoardSpellingBee.tsx:91` (`clampInt(data?.timerSeconds, 0, 120, 15)` — the `15` fallback) and the PlanComposer select options at `PlanComposer.tsx:823-837` (add 30/45; the board already accepts up to 120 — the ceiling is plan-time UI, not code).
- **In-class +Ns:** add an `ADD_TIME_10`-style action string to the SPELLING_BEE control sets and handle it in the board's `lastAction` switch (`BoardSpellingBee.tsx:267-309`), bumping a local override that feeds `settings.timerSeconds` into `useSpellingBeeTurn`. Precedent: WORD_SEARCH's `ADD_TIME_30` (button `ContextualControls.tsx:276-278`, baton `TeacherRemote.tsx:632-636`, handler `BoardWordSearch.tsx:832`).
- **Clock semantics caveat:** `useSpellingBeeClock` re-arms to the FULL new value whenever `seconds` changes (`useSpellingBeeClock.ts:50-55`) — a mid-word 15→25 bump gives the student a fresh 25s clock (acceptable), but a true additive `timeRemaining + 10` needs a small positive twin of `penalize()` (same file).

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> First, the same UI issue — we cannot properly see the word/flash/sound. Maybe the timing is also a little bit short — the timing needs a few seconds more, or maybe it should be configurable as a game setting.

**Clarified with the owner (2026-09-09):**
- ["Failing B" = Spelling Bee, confirmed by owner.] The specific problem confirmed: the per-word COUNTDOWN is too tight. Timing fix = longer defaults + a quick in-class adjust (+10s style). Word/flash/sound readability also flagged in the original comment — include in the UI audit.

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardSpellingBee.tsx` unless noted; engine refs are `components/games/spellingBee/*`.

- **F1 · P1 — No presentation beat: the countdown starts the instant the word appears, and audio never auto-plays.** The clock arms on `status === 'typing'` with zero lead-in (`useSpellingBeeTurn.ts:148-153`); the word's TTS plays only on a board tap or at resolution (`BoardSpellingBee.tsx:177,201,416`). So the default 15s must cover look + listen-on-demand + spell, and every wrong letter shaves another second (`useSpellingBeeClock.ts:75-78`). This is the mechanical core of the §2 complaint: a slow reader at 5–8 m from the board can lose a third of the clock before the first keypress. Fix shape: a "word intro" sub-state (image + auto-audio, clock paused — teacher or kid confirms/taps to start spelling), which also gives the flash/sound their own moment instead of sharing the solve hold.
- **F2 · P2 — The only full-word flash is 0.9s (solved) / 1.6s (revealed).** `SOLVE_HOLD_MS = 900` / `REVEAL_HOLD_MS = 1600` (`useSpellingBeeTurn.ts:46-47`) is the entire window in which the complete spelling is visible AND the audio plays AND the slide-out animation runs. The class cannot actually read the word they just tried — the teaching moment (see the correct spelling) is gone in a blink. These constants need to be settings (or at minimum ~1.5×–2× longer).
- **F3 · P2 — Play surface capped at 768px on a 16:9 stage; everything is phone-sized.** `SpellingBeeStage` wraps in `max-w-3xl` (`SpellingBeeStage.tsx:51`): image card `h-36 lg:h-44` (144–176px), key glyphs `text-lg lg:text-2xl` (~20–24px) on `min-h-11 lg:min-h-14` keys, letter slots `w-9 h-12 sm:w-11 sm:h-14` (`:47-48,107,165`). On a 1080p projection the whole QWERTY occupies a centered ~40%-width column with ~44px keys — small for a teacher tapping accurately, let alone an excited 7-year-old. Same pattern as the FOCUS_CARDS audit's fixed-size finding.
- **F4 · P2 — The plan-time timer ceiling is 25s and there is no in-class adjust.** The PlanComposer select offers Off/10/15/20/25 only (`PlanComposer.tsx:823-837`) even though the board clamps to 0–120 (`:91`); neither the commander nor the baton has any timer button (`ContextualControls.tsx:302-324`), while WORD_SEARCH already ships the `+30s` pattern (`ADD_TIME_30`, `ContextualControls.tsx:276-278`). The §2 "quick +10s" ask has a clean precedent to copy — see the hook map in §1.
- **F5 · P2 — Audio has no remote path.** The board never handles `PLAY_AUDIO` (absent from the `lastAction` switch, `:267-309`), so neither commander nor baton can replay the word; the "Listen" moment depends on the kid/teacher tapping the projected card. FOCUS_CARDS just gained exactly this control (`PLAY_AUDIO`, `ContextualControls.tsx:105`) — the same button belongs here.
- **F6 · P3 — The collected L1 meaning is never shown.** `contentBuilder` harvests `meaning` from MEANING_MATCH options and manifest translations (`contentBuilder.ts:75,106`) but no surface renders it — for imageless words (speaker fallback card) the meaning would be the only additional cue channel.
- **F7 · P3 — Timer legibility rides on a 56px ring.** The countdown appears as a circular ring in `FastVocabHud` (56px, red only at ≤3s, `components/games/fastVocab/FastVocabHud.tsx:38-46`) shown only while typing (`BoardSpellingBee.tsx:391`) — a number-first countdown at stage scale would communicate urgency to the whole room, not just the kid at the board.
- **F8 · P3 — Header duplicates settings the class can't use.** The sub-line advertises "N words per turn · Xs per word · keys drop as you go" (`:369-371`) — teacher-facing metadata occupying prime board real estate (same class of issue as FOCUS_CARDS F8); on the untimed setting it correctly shows "untimed".
- **F9 · P3 — Vocabulary-fallback words always score at difficulty 1** (`contentBuilder.ts:101`), so until pools are generated the whole game under-awards vs the unified model's difficulty axis. Consistent with the WordSearch fallback convention; fleet-wide pool generation is the real fix.

**What already works well (context — don't re-litigate):** the engine split (pure deterministic `keyboardEngine` with unit-tested never-drop-a-needed-letter/monotonic/same-seed guarantees; StrictMode-safe clock with the render-phase reset; per-surface scoring) — the 2026-08-31 refactor is clean; wheel-overlay pause so the spin window can't charge the wrong kid (`:243-249`); turn-owner freezing so the summary never lands on the next student (`:117-126`); timeout-is-free (clock-anxiety rule) while still feeding FSRS/remediation; per-WORD analytics instead of per-letter flood; wrap-around pool coverage via the cursor + RESET rewind; the 3-tier content ladder with a Retry button on fetch failure; skip-never-scores; Mark Correct filling the untyped tail so the class still sees the full spelling.

## §4 ⬜ ChatGPT Co-Work quality audit

### 4.a UI & visual design
- **Severe letterbox image distortion (screenshot `27-spelling-bee-idle.png`):** The prompt image is constrained to `h-36 lg:h-44` within a narrow container (`:398-419`), squishing normal 4:3 and 16:9 vocabulary illustrations into ultra-wide horizontal letterbox strips. The forest illustration in the idle screenshot is cut in half vertically, destroying visual context.
- **Phone-sized keyboard crammed into center 40% of 16:9 stage (F3):** The entire typing interface wraps inside `max-w-3xl` (~768px). On a 1080p projection screen, this creates tiny `min-h-11 lg:min-h-14` (~44px) keyboard keys with `text-lg` labels. For a 7–10 year old standing at the interactive smartboard, tapping these miniature keys reliably is nearly impossible, causing accidental mis-taps that trigger punitive red flashes and score deductions. The keyboard should expand across the widescreen stage with massive 72–80px arcade-style letter plates.
- **Microscopic 56px timer ring lacks classroom visibility (F7):** The timer renders as a tiny 56px circular ring inside the sub-HUD (`FastVocabHud.tsx:38-46`), only turning red at $\le 3$s. In a bright classroom viewed from 5–8 meters, students cannot see the remaining time. It should be a bold, glowing stadium countdown gauge mounted prominently at the top of the stage.
- **Developer settings cluttering the header (F8):** The sub-header advertises technical parameters: *"3 words per turn · 15s per word · keys drop as you go"* (`:369-371`). This internal metadata clutters the board surface. It should be replaced with a clean learner prompt: *"Listen and spell the word!"*.
- **Ephemeral 0.9s solved flash destroys orthographic consolidation (F2, §2):** When a word is solved, it holds for a mere 900ms (`SOLVE_HOLD_MS = 900`), and a timeout reveal holds for only 1600ms (`REVEAL_HOLD_MS = 1600`). Before the student or class can read the completed spelling or connect the letters to the spoken word, the card slides off-screen.

### 4.b Workflow & user flow (teacher's path: start → turns → end)
- **The Core Pacing Flaw: Zero presentation beat & silent start (F1, §2):** The countdown timer begins running the exact millisecond the word mounts (`useSpellingBeeTurn.ts:148-153`). Audio does **not** auto-play. The student must simultaneously: look at a cropped image, deduce what English word is intended, notice that audio is silent, reach up to tap the small speaker icon, wait for audio playback, and then spell the word — all within a breathless 15-second budget! A slow reader at distance loses 5–6 seconds before typing their first letter.
  - **The Solution — Two-Beat Presentation:**
    - **Beat 1: "Listen & Look" (Presentation hold):** Word mounts, image displays cleanly, audio auto-plays once, target meaning renders, and the clock remains PAUSED. A 2-second lead-in or teacher remote press transitions to the spelling phase.
    - **Beat 2: "Spell It!" (Active typing):** Clock arms, letter slots highlight, and the arcade keyboard activates.
- **Missing in-class time extensions & rigid 25s plan ceiling (F4, §2):** The default 15s timer is too punitive for younger EFL spellers (ages 6–8), yet the PlanComposer select caps timer options at only 25s (`PlanComposer.tsx:823-837`). Neither the commander nor the baton remote provides an in-class time extension button. Adding an `ADD_TIME_10` (+10 seconds) action button (mirroring Word Search's `ADD_TIME_30` precedent) gives teachers immediate control when a student needs thinking time.
- **Audio lacks remote-control path (F5):** The board does not handle `PLAY_AUDIO` in its action switch (`:267-309`). If a student needs to hear the word again, the teacher cannot trigger audio from the phone remote or commander desktop; someone must walk to the board and tap the speaker icon.
- **Wave cursor and turn persistence work cleanly:** Consecutive students receive fresh vocabulary items across the unit via `cursorRef`, and turn-owner freezing prevents score screen misattribution (`:117-126`).

### 4.c Pedagogical practice (ESL ages 6–12)
- **Image ambiguity without audio leads to unfair failure (F1, F6):** An illustration of trees could represent *"forest"*, *"wood"*, *"trees"*, *"green"*, *"plant"*, or *"nature"*. Expecting a child to guess which word the 5 blank boxes represent without hearing the word first is not a spelling test — it is a mind-reading exercise. Auto-playing the audio at word start immediately grounds the task in phonology. Displaying the collected L1 translation (`meaning`, harvested in `contentBuilder.ts:75,106` but never displayed) eliminates ambiguity for struggling spellers.
- **Cognitive overload from triple-punishment on typos:** A single wrong keypress triggers: (1) a 600ms red freeze, (2) shaves 1 second off the timer (`useSpellingBeeClock.ts:75-78`), and (3) deducts −1 live point from the student (`:158-169`). For a 7-year-old learning English orthography, this severe penalty induces immediate panic and keyboard mashing. Penalizing score per-word rather than per-letter typo is a much healthier pedagogical posture.
- **Orthographic consolidation requires hold time (F2):** The primary educational value of a spelling bee is orthographic mapping (reinforcing the letter sequence in memory). Extending the solved hold to 2.5–3 seconds with full audio pronunciation allows the teacher to lead a choral reading ("F-O-R-E-S-T, forest!") before advancing.
- **Brilliant adaptive scaffolding (`letterRemoval`):** Progressively eliminating distractor keys as time passes or mistakes occur (`keyboardEngine.ts:105-112`) is an outstanding instructional scaffold that prevents total impasse while keeping the target letters available.

### 4.d Game interaction (mechanic, pacing, fairness, fun)
- **Arcade keyboard ergonomics:** Rather than a dense QWERTY layout that mimics office desktop typing, the keys should be styled as vibrant, chunky letter pads arranged with generous spacing. As distractor keys vanish, the remaining target letters should glow, creating an exciting "narrowing the field" game feel.
- **Speed bonus mechanics:** The +1 speed bonus for finishing with $\ge 50\%$ of the clock remaining (`:180-182`) provides great gamification for confident spellers, while the **timeout-costs-nothing rule** protects slower students from negative scoring.
- **Choral participation:** In choral mode (`quickWheelWinner = null`), the whole class can spell aloud while the teacher enters keys from the commander or physical keyboard.

### 4.e Top-5 prioritized recommendations
1. **P1 — Introduce a "Listen & Look" Presentation Beat with Auto-Play Audio (F1, §2):** Split the word lifecycle into a 2-second presentation hold (image displays, pronunciation auto-plays, clock paused) before the active typing phase begins.
2. **P1 — Extend Solved and Revealed Hold Times to 2.5s–3.0s (F2, §2):** Increase `SOLVE_HOLD_MS` and `REVEAL_HOLD_MS` to allow sufficient time for whole-class reading, phonics reinforcement, and audio replay.
3. **P2 — Add In-Class `+10s` Quick-Add & Remote `Play Audio` Controls (F4, F5, §2):** Wire `ADD_TIME_10` and `PLAY_AUDIO` to commander and remote baton panels, enabling remote time extensions and audio replays. Expand PlanComposer timer options to include 30s, 45s, and 60s.
4. **P2 — Widescreen 16:9 Stage Layout with Massive Touchplates (F3, 4.a):** Break out of the `max-w-3xl` container. Render large 4:3 image cards and massive 72–80px arcade letter keys accessible on interactive smartboards.
5. **P3 — Display Collected L1 Meaning Subtitle to Resolve Ambiguity (F6):** Render the harvested `meaning` string as a subtle secondary cue beneath the image to prevent misinterpretation of illustrations.

### 4.f Design direction for Stitch
- **Mood and visual theme:** "Arcade Spelling Stadium" / "Golden Honeycomb Hive". Deep stadium navy background (`#0B132B`), radiant honeycomb amber/gold (`#F59E0B`), electric cyan letter slots (`#00F0FF`), and vibrant emerald success illumination (`#10B981`). Keys should feel like tactile, 3D mechanical arcade buttons.
- **Mock up these four screens/states (16:9 projector, no scrolling):**
  1. **Screen 1 — Beat 1: "Listen & Look" (Presentation Phase):**
     - Top HUD: Picked speller badge: `[🐝 Alice's Turn]` + word counter: `[Word 1 of 3]`.
     - Center Stage: High-resolution uncropped illustration (`FOREST`) with an active cyan sonic ripple animation (*"Listen... 🔊"*).
     - Subtitle: Subtle L1 meaning cue (`森林`). Letter slots show empty glowing frames. Countdown clock is paused with a gentle "Ready..." pulse.
  2. **Screen 2 — Beat 2: Active Spelling Arena:**
     - Top HUD: Central glowing gold digital countdown clock (`12s`).
     - Center: 6 chunky glowing cyan letter slots (`[ F ] [ O ] [ R ] [ _ ] [ _ ] [ _ ]`).
     - Bottom: Full widescreen arcade keyboard. 8 distractor keys have vanished; the remaining valid letter keys glow with golden rim lighting.
     - Right rail: Compact live leaderboard.
  3. **Screen 3 — Solved Celebration Beat (2.5s Hold):**
     - Completed word `FOREST` glowing in radiant emerald green.
     - Audio speaker icon pulsing with audio waves.
     - High-energy celebratory banner: `"+3 Points + ⚡ SPEED BONUS!"` with gold star particles.
  4. **Screen 4 — Wave Summary Modal:**
     - Full-stage victory honeycomb: *"Spelling Champion: Alice!"*, 5 glowing stars, accuracy stats, and countdown to next student pick.
- **What to KEEP from current design:** The deterministic `keyboardEngine` with adaptive letter removal, timeout-costs-nothing fairness rule, wheel-overlay clock freeze, and per-word analytics logging.

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

## §5 note — wave-2 design pass SUBMITTED 2026-09-11 (ZCode → Stitch, autonomous)

Two key screens per game per the §4 brief (briefs in `prompts/wave2-stitch.json`, submitted into project 17415096891547227013; all 26 accepted by the API). Screens materialize asynchronously in Stitch's generation queue — ZCode verifies against the QA list, exports to `stitch/27-spelling-bee/`, then implements with the wave-2 logic fixes (already deployed `bfd78ab`).

## §6 ⬜ Stitch output & implementation notes

*(Owner drops the Stitch export into `stitch/<NN>-<game>/`; ZCode records implementation + deploy.)*
