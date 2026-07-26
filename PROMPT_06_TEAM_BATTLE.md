# PROMPT 06 — Team Battle Screen (TEAM_BATTLE — the team ASSESS phase)

> This continues the same conversation. You know the project, the Live Board
> model, the Shell (Prompt 01), Vocab Presentation (02), Story Stage (03),
> Listen & Tap (04), and Speed Quiz (05). Now we design **Team Battle** — the
> team-based competitive game that turns assessment into a high-stakes,
> whole-class event.

---

## The screen: Team Battle (ASSESS phase — team competition)

This is the **team assessment step** — the most socially intense moment of the
lesson. The class is split into teams (Red vs Blue, formed by the teacher via
the Team Builder). Teams take turns answering questions; a correct answer lets
the team **claim a cell** on a tic-tac-toe / connect-4 style grid; the first
team to line up 3-in-a-row (or the team with the most cells when the board fills)
wins. It combines **knowledge retrieval** with **strategy + social pressure** —
the perfect climax of a live lesson.

**Think of it as Jeopardy meets tic-tac-toe meets a classroom tug-of-war.** The
whole class is invested: your team cheers when you get it right, groans when you
miss, and strategizes about which cell to claim. The teacher is the referee.

### What we want (the redesign goal):

A **strategic, high-stakes team game show** with these phases:

1. **Pre-game setup (automatic, brief):**
   - The board shows: **Team Red roster** (names + avatars, left) vs **Team Blue
     roster** (right). Team scores from the leaderboard carry in as starting
     points.
   - A **"Battle Start!"** countdown (3, 2, 1 — dramatic).
   - The **tic-tac-toe grid** (3×3 or 4×4 for longer games) appears center-stage.

2. **Round flow (repeating):**
   - **System picks a student** from the active team (round-robin WITHIN the team
     — so every kid on the team gets a turn before anyone repeats). The whose-turn
     banner shows: "🔴 Red Team — Now up: Leo 🦁."
   - A **question** appears (vocab meaning, grammar correction, or listen-and-
     identify — pulled from the pool, class-weak first). Format: same as Speed
     Quiz tiles (4 shaped options).
   - A **countdown timer** (15 seconds — more generous than Speed Quiz since it's
     a team effort; teammates can whisper hints).
   - The student answers (teacher taps or student comes up).
   - **If correct**: the student's team gets to **claim a cell** — the grid lights
     up, the student (or teacher) taps an empty cell, it fills with their team
     color (Red fills red, Blue fills blue). A satisfying **"stamp" animation**
     (like placing a flag).
   - **If wrong**: the turn passes to the other team ("🔁 Blue Team's turn!").
     The other team gets the SAME question (chance to steal).
   - **Teacher grades** (Baton: Correct/Wrong) → writes to the student's
     LearnerState regardless of team outcome.

3. **Strategy layer:**
   - When claiming a cell, the team must **choose strategically** — block the
     opponent's line, or build their own. This adds a metacognitive layer (the
     team discusses: "Block their diagonal!").
   - The **claiming student** taps the cell — giving them agency + a physical
     action at the board.

4. **Win condition:**
   - **3-in-a-row** (horizontal, vertical, diagonal) = instant win → big
     celebration.
   - OR the board fills → team with the most cells wins.
   - The winning team gets a **bonus** (e.g., +50 XP each member, written to
     their LearnerState + leaderboard).

5. **Victory screen:**
   - The **winning line glows** + the grid bursts with the team's color.
   - **"🟥 Red Team Wins!"** with confetti in red.
   - **MVP**: the student who claimed the most cells / answered the most correctly.
   - **Team score comparison**: Red 650 vs Blue 580 (updated with bonuses).
   - **"Next →"** transition (teacher-controlled).

6. **Between-round engagement:**
   - When one team is answering, the **other team sees a "Your team is up next!"
     prompt** — keeps them engaged.
   - **Team chat-bubble** — a subtle thought-bubble appears above each team's
     roster showing their "strategy" (pre-set fun phrases: "Block their line!"
     "Go for the corner!" "We can win this!") — adds personality + humor.

### Current state (what exists today):
- A tic-tac-toe grid (3×3) + MCQ questions.
- Red/Blue take turns (alternating activeTurn).
- Correct answer → claim a cell. Wrong → switch turn.
- Team rosters shown (names under the score) — **recently added** (Phase A.3).
- Team scores = claimed cells × 100.
- 15-second timer per question.
- Pool-driven: pulls MEANING_MATCH items (class-weak first).
- Per-student capture: NOT currently wired (no gradeStudent in TeamBattle — only
  BoardListenTap and BoardSpeedQuiz capture).
- **Missing:** no "steal" mechanic (wrong answer passes to other team), no
  strategy layer (no cell-choice), no victory celebration beyond a basic winner,
  no MVP, no team-score bonus to LearnerState, no pre-game countdown, no team
  engagement prompts, no "block/build" strategy visualization, questions are
  plain text (not Kahoot-shaped tiles).

### Problems:
1. **No strategy** — cells are claimed automatically (first available); the
   student/team doesn't choose WHERE to place. No blocking, no thinking. It's
   just a scoreboard dressed as tic-tac-toe.
2. **No steal** — a wrong answer just switches the turn; the other team doesn't
   get to answer the same question. Missed teaching moment.
3. **No victory drama** — the win is anticlimactic (just a winner flag). No
   celebration, no MVP, no confetti.
4. **No team-score bonus** — winning doesn't give the team members any points
   (the score is just cells × 100, not connected to the leaderboard).
5. **Plain tiles** — same as Speed Quiz: text on dark, not shaped/colorful.
6. **No pre-game** — the game starts abruptly; no team showcase, no countdown.
7. **No engagement for the non-answering team** — they just wait.
8. **No per-student capture** — the student who answers isn't graded (their
   LearnerState isn't updated from this game).

### The content (what each round holds):
From pool_items (exercise_type = MEANING_MATCH):
- Same as Speed Quiz: prompt (English word), options (Chinese meanings),
  correct_index.
- The tic-tac-toe grid is 3×3 (9 cells) — up to 9 rounds.
- Teams: state.students filtered by `team === 'red'` / `'blue'`.

---

## What I need from you (Claude)

### Part A — Research
Research **team-based classroom games** + **strategic game-show mechanics**:
- **Tic-tac-toe / connect-4 as a teaching game** — how the strategy layer
  (blocking, building) adds engagement beyond simple Q&A; the "claim a cell"
  mechanic in educational games.
- **Jeopardy / Family Feud team dynamics** — how team competition + turn-taking +
  "steal" mechanics create social engagement; the buzz-in / confer mechanic.
- **Blooket team modes** — how Blooket wraps a quiz in a team vs team format;
  the team roster UI; the team-score visualization.
- **Classroom gamification research** — the positive effects of team competition
  on motivation + retention for young learners; managing anxiety (collaborative
  teams reduce individual pressure).
- **Game theory for kids** — how to present strategic choices (block vs build) in
  a way 8-12 year olds can grasp visually.
- **Victory / celebration design** — how sports broadcasts + game shows celebrate
  a team win (podium, MVP, confetti, slow-mo replay of the winning moment).

### Part B — Redesign the Team Battle screen
Design the new screen with:

**Layout (landscape):**
- **Left column (20%)**: Team Red roster — members listed (avatar + name), team
  color (red), running score. The active team pulses/glows.
- **Center (60%)**: The **battle grid** (3×3) — big, prominent, the focus. Each
  cell is large enough to see from across the room. Empty cells = neutral
  (dark/shimmering). Claimed cells = filled with the team color + a subtle
  pattern (red flames / blue ice — or simple solid + team emoji).
- **Right column (20%)**: Team Blue roster — mirror of Red. Score + members.
- **Top center**: Question + timer + answer tiles (overlay the grid or sit above
  it). Shaped tiles (red triangle / blue diamond / yellow circle / green square)
  with answer text.
- **Bottom**: progress ("Round 4 of 9") + whose-turn banner + class-whisper.

**Pre-game (brief):**
- Team rosters slide in from left + right. Grid appears center. "Battle Start!"
  countdown (3-2-1). The class's team color themes the screen briefly.

**Round flow:**
1. System picks a student from the active team (round-robin within team).
   Banner: "🔴 Red — Leo's turn!"
2. Question + 4 tiles appear (timer starts).
3. Student answers. Teacher taps tile or student comes up.
4. **Correct**: tiles clear → the **grid lights up** ("Choose your cell!"). Empty
   cells pulse invitingly. The student taps a cell → it stamps with their team
   color + a satisfying animation. Check for 3-in-a-row.
5. **Wrong**: "🔁 Blue Team — steal the point!" The same question re-shows, Blue's
   student answers. If they get it right → they claim a cell. If also wrong →
   round ends, no one claims, next round.
6. Teacher grades both attempts (Baton Correct/Wrong) → LearnerState.

**Victory:**
- 3-in-a-row detected → the **winning line glows + traces** (animated line draws
  through the 3 cells). Grid bursts with the winner's color.
- **"🟥 Red Team Wins!"** big text + confetti (red-themed).
- **MVP card**: "⭐ Leo — 3 cells claimed, 2 correct answers!"
- **Bonus**: each winning-team member gets +50 XP (visual: "+50" floats up next
  to each name).
- **Team score update**: shows the new totals.
- **"Next →"** prompt.

**Team engagement (non-answering team):**
- The waiting team sees: "🔵 Blue — you're up next!" with a subtle pulse.
- A **strategy thought-bubble**: fun pre-set phrases cycling above the roster
  ("Block their diagonal!" "Go for the corner!" "We've got this!"). Adds humor +
  keeps the waiting team engaged.

**Visual identity** — ASSESS phase, but team-themed. The base is the ASSESS
red/orange, but each side of the screen takes its team color (Red = warm
red/amber, Blue = cool blue/cyan). The grid is the neutral battleground. The
energy is **competitive + dramatic** — like a sports match, not a quiz.

### Part C — Google Stitch prompt
Write a single detailed prompt for Google Stitch to prototype this screen.
Include:
- **Three views to prototype:** (a) the main battle view (grid center + Red
  roster left + Blue roster right + question/tiles above + whose-turn banner +
  team scores), (b) the "Choose your cell!" moment (grid pulsing, empty cells
  glowing, student about to tap), and (c) the Victory view (winning line traced
  + "Red Team Wins!" + MVP + confetti + bonus +50 floating).
- Example content: 3×3 grid, 4 cells claimed (3 Red, 1 Blue). Question: "What
  does **giraffe** mean?" Options: 长颈鹿 (red triangle), 斑马 (blue diamond),
  大象 (yellow circle), 老虎 (green square). Whose turn: "🔴 Red — Mia's turn!"
  Timer: 12s. Scores: Red 320, Blue 180. Phase: ASSESS. Round 5 of 9.
- Layout zones, team colors, grid styling, tile shapes, animation descriptions.
- The strategy thought-bubbles, the MVP card, the bonus animation.

Format the Stitch prompt as a single copy-pasteable block.

## Constraints (same as before)
- Pure visual (teacher controls from Commander/Remote; students see only content).
- Region-safe, bilingual (English question + Chinese options), huge text, high
  contrast, React/Tailwind/framer-motion.
- The board is landscape 16:9, viewed from 5–10m away.
- **No student devices** — answers are tapped on the board by the teacher or a
  student who comes up. Cell claims are also tapped on the board.
- **Team formation** happens BEFORE this screen (teacher uses the Team Builder /
  Baton "Teams" button). This screen assumes teams are already assigned.

---

**Now begin.** Research → redesign → Stitch prompt. Make me feel like I'm
watching the final minutes of a classroom World Cup — two teams leaning forward,
a kid walks up to tap the winning cell, and the room explodes.
