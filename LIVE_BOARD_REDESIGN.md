# Live Board & Live-Classroom — Deep Audit & Redesign

> Grounded in the **actual code** (audit dated below), not assumptions. Companion
> to `PEDAGOGICAL_REDESIGN.md` (Track B). This document covers **Track A — the live
> board / live class session** only: every exercise/game/interaction, the user
> flows (teacher, teams, class), the design, and the pedagogy.

## 0. Hardware & usage model (read first — the foundation of every decision)
The product has **two separate usage contexts** that must never be conflated:

| Context | Hardware | Surface | What happens |
|---|---|---|---|
| **At home** | student's own phone/computer | **Student app** (Track B) | Self-paced solo reinforcement loop: Word Lab, FSRS practice, mastery, daily quests. **No live board.** |
| **At school (live class)** | **ONE screen** (projector) driven by the teacher; **students have NO devices** | **Live Board** (Track A) | Teacher leads 5–15 students in person: teaches material, tells stories, runs games. Students participate **one-by-one or by team — aloud / at the board**. |

**Consequences that drive the whole design:**
- The live board is a **single, teacher-controlled screen**. It must **never assume student devices**. There is no student-device live sync, no student "response pad," no per-student on-device answering during a live class.
- **The teacher is the only operator** (board + remote). Students answer **aloud** or **come up to the board**; the teacher grades them from the remote (Baton Correct/Wrong).
- **Teams/groups are physical**, not device-based: the teacher forms teams on-screen, students sit/compete together, a representative answers, the teacher grades.
- **The bridge between the two contexts is the shared LearnerState** (not a live session): a teacher grading a student in class → writes their FSRS/mastery state → reshapes that student's **home** practice (weak/cracked words resurface). Same model, two contexts, **no realtime coupling between board and student devices**.
- ⟹ The earlier "F1 — student-device live sync" assumption was **wrong and is removed**. The student-app "Join Live" path is a legacy/hybrid misunderstanding and should be **removed or left dormant** — it does not belong in the classroom model.

## 0.1 Locked design decisions (confirmed with the owner)
1. **Turn rotation = strict round-robin.** Every kid gets exactly **one turn per
   exercise** before anyone repeats. The system enforces this (the picker prefers
   not-yet-picked students). The **teacher can override** the next pick anytime.
   Per-exercise coverage of the whole roster is the goal.
2. **Picking = Spin / Quick-pick / Manual-tap (teacher chooses per round).** The
   Wheel of Destiny is **one** (exciting) option, not mandatory every round.
   Whichever is used, the round-robin fairness still applies behind it.
3. **Per-student tracking = a class roster of home-account-linked students.**
   Students are **definitely** linked to their home account (not optional): class
   material and home reinforcement are coupled through the **shared LearnerState**.
   The teacher's class roster = the enrolled students for that class.
4. **Points = a UNIFIED per-student total (class + home combined)** that all kids
   see on a leaderboard to compete against each other — not two separate systems.
   Class activities and home practice both contribute to one running total per
   student (gamification/competition); FSRS mastery remains the real learning
   state driving home practice. (The teacher may run the board/remote across any
   combination of laptop/desktop/tablet/phone — already synced via SessionContext.)
5. **Operating modes.** The teacher clicks the answer, **or** hands the
   mouse/keyboard to the student who comes up. Either way the answer is attributed
   to the **picked student** (the system always knows whose turn it is).
6. **Competition = individual (kid-vs-kid, leaderboard) OR team-based.** Both
   supported; team games need the F2 teams model.

## Executive summary — the real state
The board *looks* like a live-classroom tool but several of its core pipes are
**broken or decorative**. Before any game-by-game upgrade, four foundations must
be fixed, or the upgrades sit on sand:

1. **The student-app "live" path is a legacy misunderstanding, not a gap.**
   Students have **no devices in class**, so there is nothing to "join live" on a
   device. `SoloSessionContext` has no realtime subscription and the "Join Now"
   banner / `LessonSession` live branch are unreachable — which is **fine for the
   classroom model**. Action: remove that dormant path (or leave it) and ensure the
   board never assumes student devices. (The home student app is the only student
   surface; it is **not** live-coupled to the board — see §0.)
2. **Teams & groups are cosmetic.** `student.team` is never assigned; TeamBattle /
   GameArena / IntroSplash red/blue panels are **always empty (score 0)**. The
   Group-Maker broadcasts `GROUPS_UPDATED` that **no game consumes**.
3. **The command bus (`lastAction`) is unsafe + racey.** No id/idempotency →
   actions coalesce/duplicate; the `classroom_live` broadcast channel is
   **unauthenticated + global** (cross-class data leak).
4. **Most games capture nothing.** Only 3–4 templates write to the LearnerState;
   ~17 activities are engagement-only with no measure. And the exercise **pool is
   fire-and-forget** — if `generate-exercises` hasn't finished, competitive games
   show empty states.

Plus: `BoardPoll` is non-functional (votes never increment), `BoardLiveClassWarmup`
is a fake simulation, `BoardISayYouSay` has no audio, `BoardMagicEyes` isn't
pool-driven, and the lesson **orders practice/assess before grammar input**.

---

## Part 1 — Foundational fixes (do these first)

### F1. Confirm the no-device classroom model + remove the dormant student-live path
- Per §0, students have **no devices in class**. The board is a single,
  teacher-controlled screen. **No realtime coupling between board and student
  devices is required** (and must not be assumed).
- Remove (or explicitly retire) the student-app "Join Live" banner and the live
  branch of `LessonSession` — they are a legacy/hybrid misunderstanding, not a
  feature gap. The home student app stays the **only** student surface and is
  **not** live-synced to the board.
- The **only** link between a live class and a student's home practice is the
  **shared LearnerState**: teacher grades a student in class (Baton
  Correct/Wrong) → `recordAttempt` → that student's home practice adapts. No live
  session connects them.

### F2. A real Teams & Groups model
- Persist `team` on `class_enrollments` (or a `class_teams` table). A **Team
  Builder** step (teacher-controlled) assigns students to red/blue (or N groups)
  before competitive games.
- Fix the empty-panel bug: `BoardIntroSplash`/`BoardGameArena` filter on
  `s.team` which is never set → wire it to the real assignment.
- Make `GROUPS_UPDATED` actually consumed (or remove it).

### F3. Safe, idempotent command bus
- Add an **id (uuid) + sequence** to every `lastAction`; templates ignore already-
  seen ids (kills duplicate/coalesce bugs under Strict Mode + reconnects).
- Scope `classroom_live` to the class: filter by `teacher_id`/session, or move
  sensitive payloads (points, grades) to the authenticated `postgres_changes`
  path / an RPC, not open broadcast.

### F4. Pool readiness + phase-correct ordering
- Make `generate-exercises` **awaited or verified** at publish (today it's
  detached fire-and-forget). The board should gracefully show a "preparing…"
  state, not an empty game, when the pool isn't ready.
- Fix `transformManifestToFlow` ordering: emit in **warm-up → input (cards,
  grammar) → controlled practice → production → assess**, not LISTEN_TAP/
  TEAM_BATTLE before grammar.

---

## Part 2 — The live-classroom pedagogy (how a real lesson flows)

A live class is **teacher-paced, group-response**, fundamentally different from
the self-paced student-app loop. The proven model (Kahoot / Nearpod / Gradual
Release of Responsibility — "I do, we do, you do"):

```
TEACHER-PACED LIVE LESSON (the conductor arc)
1. WARM-UP  (switch to English, hook)            — choral, low-stakes
2. PRESENT  (board cards: image+word+audio)      — input, teacher narrates
3. CHECK-1  (choral recognition: everyone answers) — whole-class, no shame
4. CHECK-2  (individual recognition: 1 student)  — accountability, graded
5. PRACTICE (controlled: build/spell/transform)   — pairs/groups → individual
6. PRODUCE  (say it / type it)                    — individual, hearts OK
7. ASSESS   (timed quiz / team round)            — measure + leaderboard
8. WRAP     (XP, crowns, "review these at home") — sets up the solo loop
```

**Three response modes** every game must support explicitly (the missing concept):
- **Choral** — whole class answers aloud/holds-up; teacher hears; **no per-student
  write** (engagement).
- **Group/team** — a group confers then answers; team score; **optional** member
  write (one rep graded).
- **Individual** — one named student answers; teacher marks Correct/Wrong;
  **writes to that student's LearnerState** (the only mode that feeds mastery).

Today these modes exist only implicitly. The redesign makes the **mode a first-
class control** on the Teacher Baton (so the teacher always knows "is this
round measuring anyone?") — and every game honors it.

---

## Part 3 — Exercise-by-exercise audit & redesign

Status key: 🔴 broken · 🟡 shallow · 🟢 solid. Capture: ✓ writes progress · ✗ none.

### Presentation (INPUT)
| Game | Status | Current reality | Redesign |
|---|---|---|---|
| **BoardFocusCards** | 🟢 | Richest template now (IPA+Chinese+audio, manifest-enriched). Single big card. | Keep single-card (projector). Add **choral "everyone repeat after the audio"** cue + a tap-to-reveal-class-weak-word highlight. Good. |
| **BoardGrammarSandbox** | 🟡 | Rule+examples, often empty; no drill. | Guided discovery: show 2 unit-sentence examples with the pattern highlighted; learner/class infers rule before reveal. Pair with GrammarPractice. |
| **BoardStoryStage** | 🟡 | Pages, emoji fallback, **no audio**. | Add **per-line read-along audio** + tappable words (mirror student-app story). Dialogue between characters → real voice. |
| **BoardMediaPlayer / LiveWarmup** | 🔴 | Lyrics always empty; warmup is a **fake** simulation. | Either generate real warmup content (a song/video) or **remove** these from the flow until real assets exist. Don't ship placeholders. |

### Recognition drills (controlled practice)
| Game | Status | Current | Redesign |
|---|---|---|---|
| **BoardListenTap** | 🟢✓ | Real audio + capture + class-weak + round-advance. The gold-standard template. | **The pattern to clone.** Add explicit choral/individual mode badge. |
| **BoardFlashMatch** | 🟡✗ | Word↔meaning match; no capture. | Add capture in **individual** mode (grade the picked student's matches). |
| **BoardWhatsMissing** | 🟡✗ | Memory grid; no capture. | Keep as choral warm-recall; in individual mode, the picked student names the missing word → grade. |
| **BoardMagicEyes** | 🔴 | Not pool-driven; empty without hand-authored image. | Make pool-driven (use a unit image + a generated "describe it" prompt) or **remove**. |
| **BoardUnscramble** | 🟡✗ | Sentence builder; redundant self-broadcast. | Add capture in individual mode; simplify the move broadcast. |
| **BoardISayYouSay** | 🔴 | **No audio button**, fake waveform, no capture. | Add real model-audio + echo; in individual mode, use the device mic (if synced) for pronunciation. |
| **BoardStorySequencing** | 🟡✗ | Order story panels; empty without story. | Pool/manifest-driven; individual mode grades the picked student. |

### Production + assessment
| Game | Status | Current | Redesign |
|---|---|---|---|
| **BoardSpeedQuiz** | 🟢✓ | Timed MCQ + capture. Good. | Keep; add a **leaderboard/round results** screen (Kahoot-style) + team mode. |
| **BoardTeamBattle** | 🔴 | **Fake teams** (no membership), tic-tac-toe, no capture. | Needs **F2 (real teams)**: assign members, a team answers together (confers), reps graded. Without teams this is not a team game. |
| **BoardGameArena / WheelOfDestiny** | 🔴🟡 | Red/blue panels always empty (team bug); Wheel is a **selector only**, duplicated math. | Fix team panels (F2). Consolidate the two wheels into one. Wheel → **always** followed by a graded individual task (today it just shows the winner + XP). |
| **BoardGrammarPractice** | 🟢✓ | Error-spot/transform + capture — but **no remote control** (teacher must tap the board). | Add remote controls (Reveal / Credit student) so the teacher can run it from the phone. |
| **BoardPoll** | 🔴 | **Non-functional** (votes never increment; QR static). | Either implement real voting (student devices vote via F1 sync) or **remove**. |

---

## Part 4 — User-flow redesign (teacher-led, single screen, no student devices)

**Start (teacher):** LessonStudio → "Start Class" → board shows on the projector; remote on the teacher's phone/tablet; students are in the room (no devices).

**During a step (teacher-mediated, three modes on the Baton):**
- **Present** — board shows the material (cards, story, video); teacher narrates / tells the story.
- **Choral** — teacher asks the whole class; students answer **aloud** (or hold up / come up); teacher hears; **no per-student write**.
- **Individual** — teacher **picks a student** (Wheel or Pick on the Baton); that student answers **aloud**; teacher taps **Correct/Wrong** → writes to that student's LearnerState (the only thing that feeds mastery).
- **Team** — teacher assigns teams (Team Builder, on-screen); a team confers in person; a representative answers; teacher grades the rep.

The Baton's mode badge ("graded / practice / team") makes it explicit which rounds measure anyone. **No student device is ever involved** — answers are spoken/physical; the teacher is the sole operator.

**Grade → home bridge:** an individual/team-rep Correct/Wrong → `gradeStudent`/`gradeStudentWeakest` → updates that student's FSRS/mastery. Later, **at home**, that student's app surfaces weaker/cracked words in their solo practice. The two contexts share the model; they are **never live-coupled**.

**End:** Wrap step → per-student XP/crowns shown on the board → "these words cracked — practice at home tonight."

### Team formation flow (on-screen, physical)
A **Team Builder** as the first competitive step (or pre-session): teacher picks 2 teams (or N groups), engine assigns the roster (balanced by level/XP, optional), `class_enrollments.team` persisted. Students physically group accordingly. All team games read the real assignment (fixes the empty red/blue panels). No devices.

---

## Part 5 — UI / design issues (per game + global)
- **Fake scoreboards:** every red/blue panel is 0 because teams aren't set → looks broken. Fix with F2 or hide until teams exist.
- **Empty-state spam:** pool-not-ready shows "Generate the exercise pool" mid-lesson. Replace with a graceful "preparing…" or skip the step.
- **No feedback on capture:** when a teacher grades (Correct/Wrong), there's no board-level confirmation. Add a flash ("Leo: ✓ +5") so the class sees the grade.
- **Baton discoverability:** the Baton is buried below per-step controls. Promote it; the responder mode (choral/individual/team) is the most-used control.
- **No round/leaderboard screens:** SpeedQuiz/TeamBattle jump to next with no recap. Add Kahoot-style round results.
- **Dead controls:** the remote's center "Action" button is a non-functional placeholder; GrammarPractice has no remote controls. Wire or remove.
- **BoardRenderer (commander preview)** maps `GAME_ARENA → BoardSpeedQuiz` (wrong) and omits several types → commander preview is inaccurate.

---

## Part 6 — Implementation roadmap (foundations → games; classroom-centric)

**Phase 0 — Foundations (no-device classroom model)**
- **F4** Lesson ordering + pool readiness (the board is THE teaching tool — it must
  flow warm-up→input→practice→assess and never show empty/broken games mid-class).
- **F2** Real teams/groups model + on-screen Team Builder (team games are core to
  engagement; the empty red/blue panels must be fixed).
- **F1** Remove/retire the dormant student-app "Join Live" path; confirm the board
  never assumes student devices (cleanup, low risk).
- **F3** Idempotent + scoped command bus (board↔remote robustness; idempotency
  matters most here — duplicate/coalesced actions break live play).

**Phase 1 — Make every game honest**
- Remove or content-fill the placeholders (Poll non-functional, LiveWarmup fake,
  MagicEyes empty) so no game ships "empty/fake" in front of a class.
- Fix the team-scoreboard empties (F2).
- Add capture to the **individual** mode of FlashMatch/WhatsMissing/Unscramble/
  StorySequencing (clone the BoardListenTap pattern: teacher picks → grades).
- Wire GrammarPractice remote controls (Reveal / Credit student).

**Phase 2 — Pedagogical upgrades (teacher-mediated)**
- Explicit **Choral / Individual / Team** mode on the Baton, honored by every game.
- Round/leaderboard recap screens (Kahoot-style) for SpeedQuiz/TeamBattle.
- Real audio on StoryStage + ISayYouSay.
- Wheel → always followed by a graded individual task.
- Board vocab as a studyable grid for the class (the 5-card treatment, board-side).

**Priority order:** **F4** (lesson correctness + readiness) and **F2** (real teams)
are the highest-value classroom fixes — a teacher must be able to run a clean,
pedagogically-ordered, never-empty lesson with working team games. (The earlier
"F1 student sync" priority was based on the wrong device assumption and is dropped.)

---

## What this changes vs. today
The board stops being "a bag of disconnected games with fake teams and dormant
student-device paths" and becomes a **coherent, single-screen, teacher-led live
classroom tool**: a pedagogically-ordered lesson, real teams, every round
explicitly choral/individual/team, individual rounds feeding each student's
mastery (which then shapes their **home** practice) — with **no assumption of
student devices** in the room.

> Next step: confirm the no-device model, then implement **F4 (lesson ordering +
> readiness) and F2 (real teams)** first.
