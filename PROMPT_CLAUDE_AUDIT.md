# PROMPT FOR CLAUDE — Deep Audit of the Live Board Module

> Copy this entire prompt into Claude. It asks Claude to do a thorough code audit
> of the live board against the design docs + the real architecture, and produce
> a prioritized fix plan.

---

## Git repo
```
https://github.com/ETDESIGN/Professor.git
```
Clone it. The app is in the repo root. Key paths:
- `apps/board/` — all board templates + BoardShell + ClassroomBoard.
- `store/SessionContext.tsx` — the live session state + realtime.
- `apps/remote/TeacherRemote.tsx` — the teacher's phone controls.
- `supabase/functions/orchestrate-lesson/index.ts` — the flow generator.
- `classrom shell redesign/` — Claude's design docs (7 .md files) + Hermes
  HTML prototypes + PRODUCTION_NOTES.md.

## Project context
"Professor" is a K-12 ESL teaching platform. The **Live Board** is a single
projector screen the teacher drives in-person with 5-15 students. **Students
have NO devices.** The teacher controls via a phone/tablet remote (a separate
web app route). The board is **display-only** (no teacher controls visible to
students).

## What happened
I (another AI agent) rebuilt 7 board screens from **static HTML prototypes**
produced by Hermes — **WITHOUT studying Claude's design research documents**
(the 7 .md files in `classrom shell redesign/`). This is the core problem:

- The **Hermes HTML prototypes** are simplified visual mockups — they capture
  the *look* but NOT the architecture, workflows, interaction logic, staged
  reveals, state management, data flows, or pedagogical sequencing.
- **Claude's design docs** (the .md files) contain the FULL design: research
  (Kahoot/Nearpod/Blooket analysis), interaction architecture (state machines,
  staged reveals, transitions), data flow requirements, remote-control mapping,
  bilingual typography specs, color-blind-safe palettes, pedagogical logic.
- My implementation only translated the HTML visual → React. It missed:
  - The **staged reveal system** (e.g., vocab drill has 4 stages, not a binary flip).
  - The **state-transition flows** (grid → drill stage 1 → 2 → 3 → 4 → next).
  - The **"Start Practice →" transition prompts**.
  - The **progress rails** with studied-marking.
  - The **zoom-into-card transitions** (card scales up from grid).
  - The **audio state indicators** (speaker as state, not button).
  - The **choral-repeat cues** ("Repeat! 跟读！" in sync with audio).
  - The **collapsible side rails** (retract during story/media).
  - The **phase-coded background washes** (not just border colors).
  - The **color-blind-safe verification**.
  - The **specific typography sizes** for projector legibility.
  - The **remote-control mapping** (every action the teacher sends must have a handler).

The audit MUST compare the implementation against the **full design docs**, not
just the visual prototypes. The gap between "what Claude designed" and "what was
implemented" is the primary finding.

## What I need you (Claude) to do

### Step 1 — Read the design docs
Read all 7 design docs in `classrom shell redesign/`:
- `classroomboard-shell-redesign.md`
- `vocabulary-presentation-screen.md`
- `story-stage-screen.md`
- `listen-and-tap-screen.md`
- `speed-quiz-screen.md`
- `team-battle-screen.md`
- `wheel-of-destiny-screen.md`
Also read `classrom shell redesign/classroomboard-prototypes/PRODUCTION_NOTES.md`.

### Step 2 — Audit the implementation
For EACH of these files, compare the implementation against the design doc +
the actual app architecture:

| File | Design doc |
|---|---|
| `apps/board/BoardShell.tsx` | `classroomboard-shell-redesign.md` |
| `apps/board/templates/BoardFocusCards.tsx` | `vocabulary-presentation-screen.md` |
| `apps/board/templates/BoardStoryStage.tsx` | `story-stage-screen.md` |
| `apps/board/templates/BoardListenTap.tsx` | `listen-and-tap-screen.md` |
| `apps/board/templates/BoardSpeedQuiz.tsx` | `speed-quiz-screen.md` |
| `apps/board/templates/BoardTeamBattle.tsx` | `team-battle-screen.md` |
| `apps/board/templates/BoardWheelOfDestiny.tsx` | `wheel-of-destiny-screen.md` |

For each, report:

**A. Layout/sizing** — Does the template fill its container? (The Shell wraps
children in `<div className="flex-1 overflow-hidden">`. Templates need `h-full`
or equivalent to fill it.) Does the content overflow? Are elements positioned
correctly?

**B. Data flow** — Where does the template get its data? (a) from
`currentStep.data` (the flow block — what shape does orchestrate-lesson produce?),
(b) from `useBoardPool` (pool_items — what if the pool isn't generated?), (c)
from the unit manifest (`getVocabulary`/`getStory`). Is the data consistently
available? What happens when data is missing?

**C. Remote controls** — Does the template handle `state.lastAction` events from
the TeacherRemote? Check `apps/remote/TeacherRemote.tsx` `renderActivityControls`
for each step type. Does every action the remote sends have a corresponding
handler in the template? Are there missing handlers?

**D. Feature completeness** — Does the template implement all the features
described in the design doc? (e.g., Team Battle should have quiz questions +
answering + scoring — not just a static roster.) What features are missing?

**E. State management** — Are there hooks violations (conditional hooks, hooks
after early returns)? Are state updates correct? Does the template interact
correctly with `SessionContext` (team scores, quickWheelWinner, points)?

**F. Integration with SessionContext** — Does the template read/write the right
session state? (e.g., `state.students` for rosters, `state.quickWheelWinner` for
whose turn, `state.turnsThisExercise` for round-robin, `state.activeUnit.flow`
for the lesson.)

**G. Pool integration** — For pool-driven templates (using `useBoardPool`): what
happens when pool_items is empty (pool not generated)? Is there a graceful
fallback? Does the template show a loading state?

**H. Bugs/non-sense** — Any obvious bugs, dead code, unreachable branches,
incorrect logic, or features that don't make sense pedagogically.

### Step 3 — Audit the Shell integration
Check `apps/board/ClassroomBoard.tsx` + `apps/board/BoardShell.tsx`:
- Does the Shell correctly wrap the game templates?
- Does the Shell's center area give templates proper height/width?
- Do the overlays (ClassLeaderboard, ClassWeakBanner, ConfettiSystem,
  DrawingLayer, BoardOverlayLayer) layer correctly ON TOP of the Shell?
- Does the phase arc rail compute correctly from the flow?
- Are team scores + leaderboard + whose-turn banner reading the right state?

### Step 4 — Audit the TeacherRemote
Check `apps/remote/TeacherRemote.tsx`:
- Does `renderActivityControls` have a case for EVERY step type that the board
  renders? (Compare against ClassroomBoard's render switch.)
- Do the Baton controls (Spin/Pick/Class/Redo/Rank/Teams/Correct-Wrong) work
  with the current SessionContext API?
- Are there action types sent by the remote that no template handles?

### Step 5 — Produce a prioritized fix plan
Rank all issues by severity:
- 🔴 **Critical** (breaks the game / blank screen / crash).
- 🟡 **Major** (feature missing / wrong behavior / poor UX).
- 🟢 **Minor** (polish / edge case / optimization).

For each issue, specify:
- File + line number.
- What's wrong.
- What the fix is (concrete, implementable).
- Which design doc section it relates to.

Format the fix plan as a checklist I can hand to an engineer.

## Constraints
- The board is React + Tailwind CSS + framer-motion.
- No student devices (board is display-only).
- Region-safe (no Google/OpenAI/Anthropic dependencies).
- Chinese L1 (Simplified Chinese translations alongside English).
- The existing `SessionContext` API (triggerAction, lastAction, selectNextStudent,
  addPoints, assignTeams, gradeStudent, etc.) is the control layer — don't
  redesign it, just make the templates use it correctly.

## Output format
Produce a single markdown document with:
1. **Executive summary** (how bad is it?).
2. **Per-template audit** (sections A-H for each of the 7 templates).
3. **Shell integration audit**.
4. **Remote audit**.
5. **Prioritized fix plan** (the checklist).

Be thorough, specific, and honest. If something is fundamentally broken, say so.
If something works well, acknowledge it. I need the full picture before fixing.
