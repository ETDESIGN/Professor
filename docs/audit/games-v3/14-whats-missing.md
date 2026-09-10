# What's Missing — v3 Quality Audit (`WHATS_MISSING`)

> **Status:** **cowork-done** — §0–§4 complete (Anti-Gravity quality audit). Ready for ZCode §5 Stitch prompt.
> **Current status:** cowork-done
> **Pilot:** no
> **Screenshots:** Pending ZCode live capture; analysis grounded in `apps/board/templates/BoardWhatsMissing.tsx`.

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

- **Flow type:** `WHATS_MISSING`
- **Component:** `apps/board/templates/BoardWhatsMissing.tsx` (mode `whats_missing`)
- **Phase:** PRACTICE
- **Remote-control group:** `WHATS_MISSING_CONTROLS` (`ScoredShellControls` with `replay: true` + `WhatsMissingProduceInput` in `ContextualControls.tsx:120-129`): Skip (`SKIP_ROUND`), Hint (`REVEAL_HINT`), Mark Correct (`MARK_CORRECT`), Show Again (`SHOW_AGAIN`), Next (`NEXT_ROUND`), End (`SLIDE_COMPLETE`), Produce Submit (`WM_SUBMIT_ANSWER`).
- **Data sources:** `useEscalatingPool({ exerciseTypes: ['IMAGE_SELECT'], roundSize: 8 })`, frozen fallback `data.items [{image, name}]`.
- **Mode:** picked student (with wheel rotation) or choral practice when `quickWheelWinner = null`.

## §1 How the game works today

**Concept & loop:** What's Missing is a classic classroom ESL memory and retrieval-practice game. A set of target vocabulary cards is shown to the class for memorization, one card vanishes, and students must identify and produce the missing word.

1. **Round structure:** 4 rounds total (`TOTAL_ROUNDS = 4`).
2. **Phase 1 — Memorize (10s):** A grid of 4 to 8 vocabulary cards (`aspect-[4/3]` white cards with large illustration and bold English word label) is displayed against an indigo background. An emerald timer bar counts down from 10 seconds.
3. **Phase 2 — Recall:** At timer expiry (or manual advance), the game transitions to `recall`. One item (`missingIndex`) is removed from the grid, replaced by an empty dashed container with a bouncing question mark icon (`HelpCircle`). The remaining items stay on screen, but their text labels are hidden.
4. **Interaction Escalation (Recognize vs. Produce):**
   - **Rounds 1–2 (Recognize mode):** Below the grid, a candidate tray renders 3–4 image cards (correct image + distractors from `PoolItem.content.options`). The picked student points or says the missing item, and the teacher taps the corresponding candidate card.
   - **Rounds 3–4 (Produce mode, if rung $\ge 4$):** The candidate tray is hidden. A prominent banner prompts: *"What's missing? Say it!"*. The student must recall and pronounce the word orally. The teacher types the spoken word into an input box on the Remote Baton (`WhatsMissingProduceInput`), broadcasting `WM_SUBMIT_ANSWER`. The answer is evaluated via Levenshtein edit distance against the target prompt with a 0.6 similarity pass threshold.
5. **Phase 3 — Reveal & Feedback:**
   - **Correct:** Emerald check banner displays *"Nice one, [Student]!"* or *"Correct!"* along with the target word and image. Triggers `playCue('correct')` and triple-write scoring (`addPoints`, `logAttempt`, FSRS `gradeObjective`). Auto-advances after 900ms.
   - **Incorrect:** Rose shake animation, −1 mistake penalty, distractor eliminated in recognize mode or first-letter hint shown in produce mode (*"Hint: starts with 'T'"*). A 2nd mistake triggers a 2.5s modal card displaying the answer.
6. **Phase 4 — Terminal Slide Completion:** After round 4, a large celebration card mounts (*"Great memory, [Student]!"*), auto-dismissing after 6 seconds.

## §2 Owner comments (verbatim)

> *(No individual Phase B comment recorded specifically for What's Missing; the game was implemented during the August engine consolidation and is governed by the owner's global cross-cutting rules confirmed 2026-09-09.)*

**Governing cross-cutting directives (from `_CROSS-CUTTING.md`):**
- **#1 — Responsive live screen / phone-landscape floor:** All content must reflow without vertical or horizontal scrollbars at 700×320.
- **#3 — Next exercise bounce-back:** Prevent hydration/state desync when advancing slides.
- **#25 — Arrive-finished bug:** Ensure new turn arrives in clean `memorize` phase, not in `slideComplete`.
- **Language rule (refined 2026-09-09):** English-first on challenge surfaces. No Chinese answers. Hints over answers.
- **Classroom model:** Teacher handles all input. No student devices. Smooth wheel rotation without mandatory clicks between answers.

## §3 ZCode code-level findings

- **F1 · P1 — Produce mode requires live teacher typing on mobile baton (`:372-409`):** In produce mode (rounds 3–4), the component waits for `WM_SUBMIT_ANSWER`. This requires the teacher to take out their phone, open an input field, type the English word that a 7-year-old shouted across a noisy room, and hit submit. This creates dead air, disrupts classroom pace, and introduces teacher typing typos that penalize students via Levenshtein rejection.
- **F2 · P1 — Severe layout blowout on phone-landscape floor (~700×320):** Stacking the header, a 4–8 card grid, and a candidate tray of `w-36 h-28` buttons (`:746-751`) overflows vertically by over 180px at 320px screen height, forcing scrolling or cutting off candidate buttons completely.
- **F3 · P2 — Superficial deduction loophole on frozen/fallback data (`:264`):** When running on frozen unit data without rich distractors, `cands` is populated directly from the grid: `roundGrid.map(g => ({ image: g.image, isCorrect: g.image === entry.image }))`. The student does not need to know any English: they simply look at which image in the candidate tray is missing from the board grid, reducing the task to a visual difference puzzle.
- **F4 · P2 — 900ms auto-advance is too abrupt for classroom choral digestion (`:326-337`):** Once an answer is correct, `checkSlideComplete` advances in 900ms. In a live classroom, 900ms is too brief for the teacher to conduct a whole-class choral repetition of the revealed missing word (*"Lions! Everyone say: Lions!"*).
- **F5 · P2 — Rigid 10s countdown timer ignores classroom dynamics (`:62-63`, `:281-288`):** 10 seconds is hardcoded. If students memorize in 4 seconds, the teacher must wait awkwardly; if the class needs a prompt, the timer runs out without a pause control.
- **F6 · P3 — Skip button bypasses learning analytics (`:442-445`):** Skipping a round marks no attempt and pushes nothing to remediation, creating blind spots in student tracking.

---

## §4 Anti-Gravity UX & Pedagogical Audit

### 4.a UI & visual design
- **Grid density and visual clutter at 8 items (5–8m visibility):** An 8-item grid (4×2) using white cards on an indigo background (`bg-indigo-950`) creates a high-contrast checkerboard effect. At distance, when one card disappears, the empty dashed container (`border-indigo-500/50`) lacks visual punch. The missing slot needs a dramatic, high-energy glowing aperture or silhouette placeholder rather than a faint dashed outline.
- **Candidate tray collision with stage grid (F2):** In recognize mode, mounting 4 candidate buttons (`w-36 h-28`) directly below the grid compresses the main stage. The candidate tray should be styled as an integrated horizontal "Selection Dock" with tactile landscape tabs rather than a clunky cluster of floating cards.
- **Missing item reveal animation:** When the item is revealed in Phase 3, it pops in abruptly with an emerald border. It needs an energetic "materialization" animation (e.g. beam of light or particle burst) to reward the kids' memory feat.
- **Phone floor reflow (700×320):** At 700×320, the grid must dynamically reflow to a single horizontal row or 2×2 compact matrix, with the selection dock sliding into a compact bottom pill tray so all targets remain 100% visible without scrollbars.

### 4.b Workflow & user flow (teacher's path: start → turns → end)
- **Eliminate baton typing in produce mode (F1):** The teacher should NEVER be required to type words during a live lesson. Produce mode should follow the proven classroom protocol:
  1. The board asks: *"What's missing? Say it!"*.
  2. The picked student speaks the word aloud.
  3. The teacher presses **✓ Correct** (or **✗ Try Again**) directly on the remote baton or commander.
  4. Optionally, the teacher can tap **"Show Answer"** to reveal the card and model pronunciation.
- **Teacher-controlled memory pacing (F5):** Introduce a "Ready! / Hide Now" button on remote and board so the teacher can cut the 10s countdown short when the class is energized, or pause it if kids are still reviewing.
- **Choral repetition beat on reveal (F4):** Extend the reveal hold to 2.5s (or make it teacher-advancing via the Remote Baton), giving the teacher an explicit "Choral Callout" prompt on the screen: *"Class: say TRACTOR!"*.

### 4.c Pedagogical practice (ESL ages 6–12)
- **Strengthen active vocabulary retrieval over visual matching (F3):** In recognize mode, the options in the candidate dock should present **Word + Image** or **Word Only** (for higher rungs) to force phonological/orthographic association, rather than image-only cards that allow purely non-verbal visual matching.
- **Spoken production ladder:** The transition from Recognize (Rounds 1–2) to Produce (Rounds 3–4) is pedagogically sound (receptive $\rightarrow$ productive). However, without oral scaffolding, shy 6–8 year olds freeze. Adding an optional audio clue button (*"Listen to the first sound"*) scaffolds pronunciation without giving the spelling away.
- **L1 interference prevention:** No Chinese characters appear during challenge phases (honoring the English-first rule). When the item is revealed, the English word and high-quality photo are reinforced together.

### 4.d Game interaction (mechanic, pacing, fairness, fun)
- **Gamification feel ("The Disappearing Act"):** Rebrand the aesthetic as "The Mystery Vault" or "Vanishing Vault". During the 10s memorize phase, a playful spotlight sweeps the cards. When the timer hits zero, lights momentarily dim, a whoosh sound plays (`playCue('swipe')`), and the missing card vanishes into thin air with a mystery smoke poof.
- **Streak & team energy:** Correctly identifying the missing word on the first try contributes to the student's streak bonus (+1 at streak 3). In choral mode, it builds a class "Eagle Eye" streak meter.

### 4.e Top-5 prioritized recommendations
1. **P1 — Replace Baton Typing with 1-Tap Oral Verification in Produce Mode (F1):** Deprecate live typing in `WM_SUBMIT_ANSWER`. In produce mode, display the target word on the teacher's remote with large **✓ Correct** / **✗ Incorrect** buttons, allowing instant oral scoring with zero lesson drag.
2. **P1 — Rebuild Layout for 700×320 Phone Landscape Floor (F2):** Implement a responsive layout where the card grid and selection dock scale proportionally, guaranteeing no vertical scrollbars on mobile projection setups.
3. **P1 — Expand Reveal Hold to 2.5s with Choral Callout Prompt (F4):** Replace the rushed 900ms auto-advance with a 2.5s celebration and choral echo beat (*"Say it together: [WORD]!"*).
4. **P2 — Add Word Labels to Selection Dock to Prevent Pure Visual Matching (F3):** Ensure options require vocabulary recognition rather than visual difference deduction.
5. **P2 — Add Teacher "Ready / Hide Now" Early Countdown Trigger (F5):** Allow the teacher to instantly trigger the recall phase when students are ready.

### 4.f Design direction for Stitch
- **Mood and visual theme:** "Mystery Vault / Illusionist Stage". Deep midnight indigo (`#0A0E27`), mystical violet accents (`#8B5CF6`), neon cyan card frames (`#06B6D4`), warm amber timer bar (`#F59E0B`), and emerald correct pulses (`#10B981`). Cards look like physical lacquered plaques floating in an illuminated gallery.
- **Mock up these four screens/states (16:9 projector, no scrolling):**
  1. **Screen 1 — Memorize Phase (Gallery Spotlight):**
     - Top HUD: `[Round 1/4]` + Amber countdown bar (10s) with eye icon + Alice's turn badge.
     - Center Stage: 6 landscape cards (3×2) displaying authentic photos with crisp white English labels.
     - Ambient spotlight effect sweeping across the gallery.
  2. **Screen 2 — Recall Phase (Recognize Mode):**
     - Center Stage: 5 cards remain visible (labels hidden). The 3rd slot is a dark pulsing violet aperture with a glowing question mark.
     - Bottom Dock: 4 landscape option pills (`A: TRACTOR`, `B: HELICOPTER`, `C: SUBWAY`, `D: BICYCLE`) awaiting teacher tap.
  3. **Screen 3 — Recall Phase (Produce Mode):**
     - Center Stage: Same grid with missing slot.
     - Bottom: High-energy banner: *"What's missing? Say it loud!"* with microphone icon and first-letter hint badge: *"Starts with: T___"*.
  4. **Screen 4 — Materialization & Choral Reveal:**
     - Missing card bursts back into its slot with glowing emerald borders and particle flares.
     - Bottom banner: *"✓ Nice one, Alice! Everyone say: TRACTOR!"* with pronunciation speaker wave.

## §5 ⬜ Google Stitch prompt

*(ZCode writes this downstream.)*

## §6 ⬜ Stitch output & implementation notes

*(ZCode records implementation downstream.)*
