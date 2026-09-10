# Grammar Forge — v3 Quality Audit (`GRAMMAR_PRACTICE`)

> **Status:** **implemented** — §0–§6 complete. Verified via 3-step gauntlet (0 tsc errors, 777/777 passing vitest tests, clean build in 15.84s).
> **Current status:** implemented
> **Pilot:** no
> **Screenshots:** Pending ZCode live capture; analysis grounded in `apps/board/templates/BoardGrammarForge.tsx`.

---

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

- **Flow type:** `GRAMMAR_PRACTICE` (legacy alias: `SCRAMBLE` sibling uses BoardUnscramble)
- **Component:** `apps/board/templates/BoardGrammarForge.tsx`
- **Phase:** PRACTICE (flagship grammar consolidation & productive transfer game)
- **Remote-control group:** Custom multi-rung controls (`ContextualControls.tsx:353-371`): Reveal (`REVEAL_ANSWER`), Check (`CHECK_ANSWER`), Mark Correct (`MARK_CORRECT`), Choral/Picked toggle (`TOGGLE_SCORING_MODE`), Rate ✗ (`RATE_INCORRECT`), Rate ~ (`RATE_PARTIAL`), Rate ✓ (`RATE_CORRECT`), Skip (`SKIP_ROUND`), Next (`NEXT_ROUND`), End (`SLIDE_COMPLETE`).
- **Data sources:** Hybrid architecture:
  - Rung 2 (`ERROR_SPOT`) & Rung 3 (`TRANSFORM`): via `useEscalatingPool`.
  - Rung 4 (`PRODUCE`): Direct read from unit manifest (`state.activeUnit.manifest`) using the reserved held-out `transformation_pair`.
- **Mode:** Multi-stage: picked student for targeted scoring, with optional choral toggle on Rung 4.

## §1 How the game works today

**Concept & loop:** Grammar Forge is the curriculum's core syntax workshop. It transitions learners through a 3-rung cognitive ladder: from recognizing syntax errors $\rightarrow$ applying sentence transformations via tactile tile assembly $\rightarrow$ producing spontaneous spoken transformations.

1. **Round composition (up to 5 rounds total):**
   - **Rung 2 — Spot the Error (2 rounds, `ERROR_SPOT`):** A large white card displays a sentence with a deliberate grammatical mistake (e.g., *"He go to school every day."*). Below, 4 multiple-choice options (`round.options`) are rendered in a 2×2 grid. Student indicates the error; teacher taps the option. Correct answers turn emerald and reveal a grammatical explanation card; incorrect answers turn rose and deduct 1 mistake point.
   - **Rung 3 — Transform the Sentence (2 rounds, `TRANSFORM`):** Presents an original sentence and a transformation rule instruction (e.g. *"Make it negative / 变为否定句: She likes apples."*). Below is a dashed sentence runway and a word bank tray of tactile shuffled word blocks. Tapping a block snaps it into the runway; tapping a placed block returns it to the tray. Pressing "Check Answer" computes `computeLCSPartialCredit`. If correct ($\ge 80\%$), locks emerald; if incorrect, highlights swapped pairs or indicates the first erroneous word index.
   - **Rung 4 — Produce Freely (1 round, `PRODUCE`):** Reads the held-out transformation pair from the manifest. Shows the original sentence and a grammar pattern template (e.g. *"Pattern: Subj + did not + verb"*). The prompt instructs: *"Have the student say the transformed sentence aloud."* The teacher listens to the student's oral production and rates it via 3 buttons: ✗ Incorrect (0), ~ Partial (0.6), ✓ Correct (1.0). Tapping any rating reveals the model answer. Can toggle between 👥 Choral and 🎯 Picked Student.
2. **Lifecycle & Scoring:** Adheres to the 4 must-dos. Mistakes reduce attempt score; `awardedRef` prevents double-credit; dual-writes to leaderboard and analytics/FSRS.

## §2 Owner comments (verbatim)

> *(No individual Phase B comment recorded specifically for Grammar Forge; the game was architected in August as the replacement for the static BoardGrammarPractice and is governed by global cross-cutting directives confirmed 2026-09-09.)*

**Governing cross-cutting directives (from `_CROSS-CUTTING.md`):**
- **#1 — Responsive live screen / phone-landscape floor:** All content must reflow without vertical or horizontal scrollbars at 700×320.
- **#3 & #25 — Lifecycle stability:** Clean mount, zero bounce-back on slide advance.
- **Language rule (refined 2026-09-09):** English-first. Grammatical rule names/instructions (e.g. "Past Simple: Add -ed") may include Chinese helper tips when necessary for comprehension, but the challenge text and answers must be English.
- **Classroom model:** Teacher handles all input; no student devices.

## §3 ZCode code-level findings

- **F1 · P1 — Ambiguous task prompt in Rung 2 Error Spot (`:498-500`):** In `ErrorSpotView`, the prompt says *"Find the mistake in this sentence"*, but options frequently present the *corrected* words rather than the *incorrect* words (depending on how the exercise was generated). Without explicit framing (*"Which word is wrong?"* vs *"Choose the correct word to fix it"*), students and teachers are frequently confused about what the buttons represent.
- **F2 · P1 — Phone landscape floor (~700×320) layout collapse in Transform and Produce:** In `TransformView` (`:534-595`), stacking the reference card, the drop-zone runway, the word bank tray, and the footer "Check Answer" button causes severe vertical overflow at 320px height. The word bank tray is clipped.
- **F3 · P2 — Teacher grades blindly in Rung 4 Produce (`:616-637`):** In produce mode, the board displays only the original sentence. The model answer is hidden until the teacher taps a rating. If the teacher is a non-native speaker or unsure of the exact irregular verb form, they must guess whether the student's oral answer was 100% correct before rating. The model answer must be visible on the teacher's remote baton *before* they rate.
- **F4 · P2 — Light pastel theme clashes with app dark mode aesthetic (`:413`):** Grammar Forge uses bright pastel backgrounds (`from-rose-50`, `from-indigo-50`, `from-purple-50`). When transitioning from dark-mode games like Phonics Arena or Focus Cards, this causes sudden projector glare in darkened classrooms.
- **F5 · P2 — 5-round sequence is excessively long for a single game slot (`:81`):** 2 Error Spot + 2 Transform + 1 Produce = 5 complex rounds. In a 40-minute live lesson, spending 8 minutes on one board template stalls pacing.
- **F6 · P3 — Lack of audio read-aloud upon sentence completion in Rung 3 (`:294-314`):** When a student completes a sentence transformation, there is no audio playback of the completed sentence, missing a vital phonological reinforcement opportunity.

---

## §4 Anti-Gravity UX & Pedagogical Audit

### 4.a UI & visual design
- **Theme unification ("The Grammar Forge"):** Rebuild with the dark "Syntax Workshop / Cyber Forge" visual language established in Unscramble v3:
  - Deep obsidian slate canvas (`#0A0F1D`).
  - Glowing laser workbench for tile assembly.
  - Consistent header with clear rung indicators: `[Rung 1: Detective] → [Rung 2: Builder] → [Rung 3: Master Speaker]`.
- **Rung 2 (Error Spot) Inline Strike-Through Affordance:** Instead of detached MCQ cards, display the sentence on the board where words act as interactive strikeable blocks. Tapping the erroneous word (e.g. `[ go ]`) highlights it in amber, and pops up a replacement tile `[ goes ]` with a satisfying "clang" hammer sound effect.
- **Phone floor reflow (700×320):** Split the stage into two horizontal columns:
  - Left column: Reference prompt + instruction.
  - Right column: Sentence runway on top, compact word tray below. Zero vertical overflow.

### 4.b Workflow & user flow (teacher's path: start → turns → end)
- **Teacher Remote Cheat Sheet (F3):** On the Remote Baton and Commander, always display the model answer prominently in an emerald pill (*"Target: She did not go to school"*), accompanied by 3 large rating buttons: **✓ Perfect (1.0)**, **~ Minor Flaw (0.6)**, **✗ Miss (0)**.
- **Streamlined 3-Round Arc (F5):** Reduce the default slide composition from 5 rounds to **3 punchy rounds** (1 Error Spot $\rightarrow$ 1 Transform $\rightarrow$ 1 Produce). This cuts duration from 8 minutes down to 3.5 minutes, maintaining high energy.
- **Remote / Commander parity:** Ensure all actions (`CHECK_ANSWER`, `RATE_CORRECT`, `RATE_PARTIAL`, `RATE_INCORRECT`, `TOGGLE_SCORING_MODE`) are accessible in 1 tap on the mobile baton.

### 4.c Pedagogical practice (ESL ages 6–12)
- **From Receptive Recognition to Productive Mastery:** Grammar Forge represents the gold standard of ESL grammar instruction (Bloom's taxonomy applied to language):
  - Rung 1 (Error Spot): Noticing hypothesis (Schmidt).
  - Rung 2 (Transform): Structural manipulation & syntagmatic alignment.
  - Rung 3 (Produce): Spontaneous spoken output (Swain's Output Hypothesis).
- **Karaoke Audio Playback on Assembly (F6):** Upon completing a transform assembly, trigger native TTS to read the sentence aloud with karaoke-style highlighting across the tiles, reinforcing prosody and sentence rhythm.
- **Scaffolded Hints on Transform:** When a student places tiles in the wrong order, highlight the two adjacent tiles that need to swap (*"↔ Swap these two"*), preserving the productive struggle without causing despair.

### 4.d Game interaction (mechanic, pacing, fairness, fun)
- **Tactile "Forging" Metaphor:** Word blocks should look and sound like heavy magnetic blocks or forged metal plates snapping into a high-tech socket (`playCue('snap')`).
- **Choral vs. Solo Balance:** Allow Rungs 1 and 2 to run as picked-student turns (awarding points to Alice or Bob), while Rung 3 defaults to a high-energy whole-class Choral Chant (*"Everyone chant the transformed sentence together!"*).

### 4.e Top-5 prioritized recommendations
1. **P1 — Provide Model Answer on Teacher Remote for Blind-Free Rating (F3):** Display the exact target sentence on the teacher's remote in Rung 4 produce mode, so teachers rate oral output with absolute confidence.
2. **P1 — Clarify Task Intent in Rung 2 Error Spotting (F1):** Standardize UI framing: *"Spot the wrong word in this sentence"* with interactive strike-through words rather than ambiguous isolated buttons.
3. **P1 — Compact 3-Round Arc (1 Spot $\rightarrow$ 1 Transform $\rightarrow$ 1 Produce) (F5):** Compress the round count to prevent lesson stall, keeping lesson momentum snappy.
4. **P1 — Rebuild for 700×320 Phone Floor (F2):** Implement horizontal split-screen layout for phone-landscape projection mirroring.
5. **P2 — Add Audio Karaoke Read-Through on Successful Assembly (F6):** Read the completed sentence aloud with synchronized glowing word tiles.

### 4.f Design direction for Stitch
- **Mood and visual theme:** "Syntax Forge / Cyber Workshop". Deep metallic graphite (`#0C101A`), glowing molten amber accents (`#F59E0B`), electric cobalt frames (`#3B82F6`), neon emerald locks (`#10B981`), and crisp white typography.
- **Mock up these four screens/states (16:9 projector, no scrolling):**
  1. **Screen 1 — Rung 1: Spot the Error (Inline Strike):**
     - Top HUD: `[⚡ Grammar Forge · Round 1/3: Spot the Error]` + Alice's turn chip.
     - Center Stage: Large prominent prompt card: *"Spot the mistake:"*. Sentence displayed in massive type: *"They [ goes ] to the park yesterday."* with interactive strike-through brackets around `goes`.
  2. **Screen 2 — Rung 2: Sentence Transform (Workbench):**
     - Top: Reference banner: *"Instruction: Make it negative"* $\rightarrow$ *"She likes ice cream."*.
     - Middle Stage: Assembly Runway with glowing dashed sockets labeled `[ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]`.
     - Lower Stage: Word bank containing tactile cyan blocks: `She`, `does`, `not`, `like`, `ice cream`, `likes`.
  3. **Screen 3 — Assembly Verified & Karaoke Audio:**
     - Sentence runway locked in radiant emerald: `[ She ] [ does ] [ not ] [ like ] [ ice cream. ]`.
     - Word `does` pulsing with bright yellow highlight as audio speaks the sentence.
     - Celebration toast: *"+2 Points! Great syntax!"*.
  4. **Screen 4 — Rung 3: Free Spoken Production (Choral Blast):**
     - Big banner: *"👥 Whole Class: Speak the transformed sentence!"*.
     - Original sentence: *"Did he play football?"* $\rightarrow$ *"Make it affirmative (+)"*.
     - Glowing microphone graphic with prompt: *"Say it together loud and clear!"*.

## §5 ⬜ Google Stitch prompt

*(ZCode writes this downstream.)*

## §6 ✅ Stitch output & implementation notes

**Implemented:** 2026-09-11
**Primary Files Modified/Created:**
- `apps/board/templates/BoardGrammarForge.tsx`
- `apps/teacher/live/panels/ContextualControls.tsx`
- `apps/teacher/LiveCommander.tsx`
- `apps/remote/TeacherRemote.tsx`
- `test/BoardGrammarForge.test.tsx`

**Resolved Audit Defects:**
1. **F1 (P1) Task Prompt Framing:** Standardized task prompt in Rung 2 Error Spot: dynamically checks whether options represent incorrect words to spot (`"Spot the wrong word in this sentence:"`) or corrections to fix (`"Sentence with mistake — choose the correct word to fix it:"`), paired with distinct A/B/C/D keycap badges and explanation card with lightbulb icon.
2. **F2 (P1) Phone-Landscape Floor:** Implemented responsive `@media (max-height: 450px)` styling with scaled padding, compact runway (`min-height: 44px`), tactile keycaps, and responsive font sizing preventing any vertical or horizontal scrollbar at 700×320.
3. **F3 (P2) Teacher Model Answer Cheat Sheet:** Exposed target model answer in ContextualControls and TeacherRemote (`"Target: ..."`), allowing the teacher to grade oral production blindly-free before rating.
4. **F4 (P2) Dark Cyber Theme Unification:** Completely rebuilt BoardGrammarForge canvas with `#0A0F1D` syntax forge dark theme, glowing laser header badges, radial gradients, dark slate prompt cards, and emerald/rose outcome accents.
5. **F5 (P2) Streamlined 3-Round Arc:** Reduced `ROUNDS_BY_RUNG` from 5 rounds down to 3 punchy rounds (1 Error Spot $\rightarrow$ 1 Transform $\rightarrow$ 1 Produce), reducing slide time to ~3.5 minutes and maintaining lesson energy.
6. **F6 (P3) Audio Read-Aloud on Sentence Completion:** Added automatic native TTS pronunciation via `browserSpeak` when sentence transform is verified correct, along with an interactive "Listen to Sentence" replay button.

**Verification:**
- `npx tsc --noEmit -p tsconfig.json`: 0 errors.
- `npx vitest run`: 777 passed across 76 test suites (including 8 tests in `test/BoardGrammarForge.test.tsx`).
- `npm run build`: built in 15.84s without errors.
