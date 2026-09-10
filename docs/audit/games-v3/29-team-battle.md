# Team Battle — v3 Quality Audit (`TEAM_BATTLE`)

> **Status:** **cowork-done** — §0–§4 complete (Anti-Gravity quality audit). Ready for ZCode §5 Stitch prompt.
> **Current status:** cowork-done
> **Pilot:** no
> **Screenshots:** Pending ZCode live capture; analysis grounded in `apps/board/templates/BoardTeamBattle.tsx`.

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

- **Flow type:** `TEAM_BATTLE`
- **Component:** `apps/board/templates/BoardTeamBattle.tsx`
- **Phase:** ASSESS (culminating team showdown & multi-skill assessment)
- **Remote-control group:** **MISSING on Commander** (falls through to "Presenter Mode Active" in `ContextualControls.tsx`). Severely incomplete on phone remote (`TeacherRemote.tsx:270-279`, only `SWITCH_TURN` and `RESET_TIMER`).
- **Data sources:** `useQuizComposition(unitId, 12, roster)` consuming 6 exercise types (`MEANING_MATCH`, `SPELL_CLOZE`, `LISTEN_SELECT`, `ERROR_SPOT`, `STORY_COMPREHENSION`, `WORD_BANK_BUILD`).
- **Mode:** Team vs Team (Red Team vs Blue Team with balanced roster split).

## §1 How the game works today

**Concept & loop:** Team Battle is a high-stakes classroom team duel combining a 3×3 Tic-Tac-Toe strategic board with a 6-modality quiz engine. Two teams (Red vs. Blue) compete to answer curriculum questions and claim cells to achieve 3-in-a-row.

1. **Pregame Setup:** If teams have not been formed, displays a blocker prompt: *"Form teams first (Baton → Teams button)"*. Once formed, a 3-second animated countdown begins (*"3... 2... 1... GO!"*).
2. **Turn Sequence & Question Phase:**
   - Active team is indicated on their vertical side rail. A student representative is selected via round-robin draw (`pickStudent`).
   - A question is drawn from `useQuizComposition` (12 questions total across 6 exercise modalities).
   - A 15-second radial countdown ring starts.
   - For standard questions (MCQ), 4 answer tiles with geometric shapes (▲ A, ◆ B, ● C, ■ D) are presented.
   - If the student answers correctly: audio cue `playCue('correct')` plays, individual points are awarded, team score increases (+100), and the team enters Phase `choose_cell`.
   - If the student misses or the timer expires: **Steal Phase!** The waiting team gets a chance to steal. If the stealing team answers correctly, they advance to `choose_cell`. If both teams fail, the round ends with no cell claimed.
3. **Race Cells (`WORD_BANK_BUILD`):** When a sentence-building question appears, both teams race simultaneously to assemble the target sentence from a shared word bank. Winner is determined by higher LCS partial credit ratio.
4. **Grid Claim & Victory:**
   - In `choose_cell`, the active team selects an unoccupied cell on the 3×3 board (cells are 80×80px).
   - Claimed cells turn red (🔴) or blue (🔵).
   - `checkWin` evaluates for 3-in-a-row across 8 win vectors.
   - On win (or full-grid tiebreak by cell count): victory screen mounts with trophy, fanfare, confetti, and `SLIDE_COMPLETE`.

## §2 Owner comments (verbatim)

> *(No individual Phase B comment recorded specifically for Team Battle; the game was architected in August as the replacement for the legacy board and is governed by cross-cutting directives confirmed 2026-09-09.)*

**Governing cross-cutting directives (from `_CROSS-CUTTING.md`):**
- **#1 — Responsive live screen / phone-landscape floor:** All content must reflow without vertical or horizontal scrollbars at 700×320.
- **#3 & #25 — Lifecycle stability:** Clean turn resets; zero slide-advance bounces.
- **Language rule:** English-first.
- **Classroom model:** Teacher handles all input. No student devices.

## §3 ZCode code-level findings

- **F1 · P1 — Desktop Commander completely lacks contextual controls (`ContextualControls.tsx`):** `ContextualControls.tsx` has no case for `TEAM_BATTLE`. When this game is active, the teacher's control room shows only `"Presenter Mode Active"`, with zero buttons to switch turns, reset timers, reveal answers, or force correct.
- **F2 · P1 — Phone Remote Baton is severely crippled (`TeacherRemote.tsx:270-279`):** The remote provides only two buttons: `SWITCH_TURN` and `RESET_TIMER`. It lacks `MARK_CORRECT` (critical for teacher oral overrides), `REVEAL_ANSWER`, `RESET_GAME`, and `SLIDE_COMPLETE`.
- **F3 · P1 — Race Cells require physically impossible simultaneous multi-touch on single screen (`:303-319`):** In `handleRaceTilePlace`, both teams are supposed to tap the board simultaneously. Interactive projector drivers and mouse inputs cannot process two simultaneous independent touch points. This breaks the race mechanic completely.
- **F4 · P2 — 3×3 Grid is minuscule and hidden between heavy roster sidebars (`:447-451`, `:587`):** The 3×3 grid uses tiny 80×80px buttons and is only visible during the `choose_cell` phase. During questions, the grid is completely hidden! Students and teachers lose spatial awareness of the board state and cannot plan strategic moves.
- **F5 · P2 — Phone landscape floor (~700×320) severe layout compression:** Two 140px side rails leave only 420px width for center content. Stacking the timer, question text, and 4 option buttons overflows 320px height, clipping answer buttons.
- **F6 · P2 — Red team tie bias in Race Cells (`:333`):** `winnerTeam = redRatio >= blueRatio ? 'red' : 'blue'`. On ties (including both teams scoring 0), Red always wins.

---

## §4 Anti-Gravity UX & Pedagogical Audit

### 4.a UI & visual design
- **Persistent Split-Screen Arena:** The 3×3 Tic-Tac-Toe grid MUST be permanently visible throughout the entire game, not just during the cell selection phase!
  - **Left Wing:** Red Team roster + score + active challenger avatar.
  - **Center Stage:** The active Question card / Challenge zone (wide 16:9 proportion).
  - **Right Wing:** The 3×3 Tic-Tac-Toe Arena (large, illuminated cells) + Blue Team roster.
  - Having the grid visible at all times creates intense tension: students can see *exactly* which cell they need to block or claim while answering the question.
- **Punchy Neon Visual Language:** Red Team uses electric crimson (`#EF4444`) and fire amber (`#F59E0B`); Blue Team uses cyber azure (`#3B82F6`) and electric cyan (`#06B6D4`). Grid cells are large glowing tactile pads (minimum 120×120px) with radiant team crests.
- **Phone floor reflow (700×320):** Collapse side roster lists into compact top pills (`[🔴 RED: 200] vs [🔵 BLUE: 100]`), allocating full stage width to the question and 3×3 grid.

### 4.b Workflow & user flow (teacher's path: start → turns → end)
- **Full Commander & Remote Baton Control Parity (F1, F2):** Implement a comprehensive control suite:
  - `FORCE_CORRECT`: Teacher marks student's oral answer correct immediately.
  - `STEAL_TURN`: Manually offer a steal to the opposing team.
  - `SWITCH_TEAM`: Manually hand turn over.
  - `RESET_TIMER`: Add +15s if discussion is lively.
  - `CELL_CLAIM_1` through `CELL_CLAIM_9`: Allow teacher to tap cells directly from phone remote.
- **Replace Broken Multi-Touch Race with "Turn-Based Speed Duel" (F3):**
  - Instead of impossible simultaneous screen tapping, run a 2-turn speed sprint:
    - Red representative builds first (timed 10s).
    - Blue representative builds second (timed 10s).
    - The team with higher accuracy and faster time wins the cell.

### 4.c Pedagogical practice (ESL ages 6–12)
- **Collaborative Co-Op within Teams:** While one student is the official responder (`pickStudent`), encourage a 5-second "Team Huddle" before answering. This engages shy learners and turns the quiz into authentic peer scaffolding.
- **Balanced Multi-Skill Assessment:** Consuming 6 exercise types (`MEANING_MATCH`, `SPELL_CLOZE`, `LISTEN_SELECT`, etc.) provides comprehensive formative assessment across vocabulary, listening, syntax, and reading comprehension.
- **Steal Mechanic as Retention Reinforcement:** The steal mechanic keeps the non-active team hyper-focused: even when it is not their turn, they must listen actively in case the active team falters.

### 4.d Game interaction (mechanic, pacing, fairness, fun)
- **Strategic Tic-Tac-Toe Tension:** Displaying win-threat alerts (e.g. *"⚠️ RED TEAM MATCH POINT!"*) amplifies excitement and strategic cell selection.
- **Fair Tiebreak Resolution (F6):** If a race or draw occurs, award points to both teams but leave the contested cell neutral, or trigger a sudden-death single-word speed question.

### 4.e Top-5 prioritized recommendations
1. **P1 — Wire Full Control Suite into ContextualControls and TeacherRemote (F1, F2):** Add complete remote control set (`MARK_CORRECT`, `STEAL_TURN`, `SWITCH_TURN`, `RESET_TIMER`, `RESET_GAME`, `SLIDE_COMPLETE`) to both Commander and Baton.
2. **P1 — Make 3×3 Tic-Tac-Toe Grid Permanently Visible (F4):** Keep the 3×3 arena on screen at all times so teams can see tactical board positioning while answering questions.
3. **P1 — Replace Broken Simultaneous Multi-Touch Race with Turn-Based Duel (F3):** Eliminate single-screen dual-touch gesture conflict.
4. **P1 — Rebuild for 700×320 Phone Floor (F5):** Collapse vertical roster rails into sleek top banners, dedicating screen area to the challenge and grid.
5. **P2 — Add "Team Match Point" Visual Alerts (4.d):** Highlight threatening lines with pulsing amber warning borders to maximize classroom drama.

### 4.f Design direction for Stitch
- **Mood and visual theme:** "Arcade Colosseum / Cyber Clash". Deep stadium obsidian (`#080C1A`), glowing red laser team accents (`#EF4444`), vibrant blue plasma team accents (`#3B82F6`), golden trophy highlights (`#F59E0B`), and neon emerald match lines (`#10B981`).
- **Mock up these four screens/states (16:9 projector, no scrolling):**
  1. **Screen 1 — Question Phase (Permanent Grid Layout):**
     - Left Wing: Red Team sidebar with glowing avatar badges and score: `[ 🔴 200 PTS ]`.
     - Center Stage: Active Question card (`What does "helicopter" mean?`) with 4 colorful shape buttons (▲, ◆, ●, ■) and central 15s radial timer.
     - Right Wing: 3×3 Tic-Tac-Toe Grid showing claimed cells (2 Red, 1 Blue) with tactical open slots.
  2. **Screen 2 — Steal Opportunity:**
     - Center: Glowing amber lightning bolt banner: *"⚡ STEAL! Blue Team's Chance to Take the Cell!"*.
     - Timer reset to 10s.
  3. **Screen 3 — Choose Cell Phase:**
     - 3×3 Grid zooms to center stage with pulsing open cells.
     - Banner: *"Red Team! Pick your cell!"*.
     - Cell 5 pulses with golden lock preview.
  4. **Screen 4 — 3-in-a-Row Victory:**
     - Winning line illuminates with blazing emerald laser beam across cells `[ 0, 4, 8 ]`.
     - Massive banner: *"🟥 RED TEAM WINS THE BATTLE!"* with golden trophy and cascade of confetti.

## §5 ⬜ Google Stitch prompt

*(ZCode writes this downstream.)*

## §6 ⬜ Stitch output & implementation notes

*(ZCode records implementation downstream.)*
