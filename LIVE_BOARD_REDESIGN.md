# Live Board & Live-Classroom — Deep Audit & Redesign

> Grounded in the **actual code** (audit dated below), not assumptions. Companion
> to `PEDAGOGICAL_REDESIGN.md` (Track B). This document covers **Track A — the live
> board / live class session** only: every exercise/game/interaction, the user
> flows (teacher, student-device, teams, class), the design, and the pedagogy.

## Executive summary — the real state
The board *looks* like a live-classroom tool but several of its core pipes are
**broken or decorative**. Before any game-by-game upgrade, four foundations must
be fixed, or the upgrades sit on sand:

1. **Students can't actually "join" live.** `SoloSessionContext` (student device)
   has **no realtime subscription** — it never sets `status='LIVE'` and never
   follows the teacher's slide. The "Join Now" banner and the entire live branch
   of `LessonSession` are **unreachable** today. (Solo/async works; live does not.)
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

### F1. Real student-device live sync (the biggest gap)
- `SoloSessionContext` must open the **same** channels as `SessionContext`:
  subscribe to `classroom_session_sync` (postgres_changes on `classroom_sessions`,
  filtered to the student's teacher's session) to follow `currentStepIndex`, and
  to `classroom_live` broadcast for live events.
- A student "joins" by knowing their teacher's session: add a lightweight
  **session-join** (class code or auto via enrollment → `class_enrollments` → the
  teacher's active `classroom_sessions` row). On join, set local `status='LIVE'`
  and hydrate `activeUnit`/`activeSlideData` from the session row.
- This unblocks the live student path AND lets games push items to student
  devices (real-time response, not just watching the board).

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

## Part 4 — User-flow redesign (teacher → students → teams → class)

**Start (teacher):** LessonStudio → "Start Class" → session row created, board shows on projector, remote on phone, students see "Join Live" (requires F1).

**Join (student):** Student app → "Join" (auto via enrollment, or class code) → device syncs to the teacher's current slide; the device either mirrors the board (passive steps) or becomes a **response pad** (active steps: tap the answer, speak, vote).

**During a step (the three-mode loop):** teacher presents → Baton mode = **Choral** (everyone answers, teacher hears) → teacher picks a student = **Individual** (Baton Correct/Wrong → writes mastery) → or assigns a **Group/Team** (team confers, rep graded). The mode is explicit on the Baton; choral never writes, individual always does.

**Grade:** Individual Correct/Wrong → `gradeStudent`/`gradeStudentWeakest` (already built). Team → one rep graded. Choral → nothing.

**End:** Wrap step → per-student XP + crowns earned shown → "these words cracked — practice at home" → hands off to the **solo reinforcement loop (Track B)**.

### Team formation flow (new)
A **Team Builder** as the first competitive step (or pre-session): teacher picks 2 teams (or N groups), engine assigns by roster (balanced by level/XP, optional). `class_enrollments.team` persisted. All team games read it. This is what makes TeamBattle/GameArena real.

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

## Part 6 — Implementation roadmap (foundations → games)

**Phase 0 — Foundations (unblocks everything; do first)**
- F1 Student-device live sync (the biggest broken pipe).
- F3 Idempotent + scoped command bus.
- F4 Pool readiness check + phase-correct lesson ordering.
- F2 Teams/groups data model + Team Builder.

**Phase 1 — Make existing games honest**
- Remove or content-fill the placeholders (Poll, LiveWarmup, MagicEyes) so no
  game ships "empty/fake".
- Fix the team-scoreboard empties (F2).
- Add capture to the individual mode of FlashMatch/WhatsMissing/Unscramble/
  StorySequencing (clone the BoardListenTap pattern).
- Wire GrammarPractice remote controls.

**Phase 2 — Pedagogical upgrades**
- Explicit **Choral / Individual / Team** mode on the Baton, honored by every game.
- Round/leaderboard recap screens (Kahoot-style).
- Real audio on StoryStage + ISayYouSay.
- Wheel → always followed by a graded task.

**Phase 3 — Student-device interactivity**
- With F1 done, turn the student device into a real **response pad** (tap-to-answer,
  speak, vote) for active steps — true live interaction, not just mirroring.

**Priority order:** F1 (students can actually join) is the single highest-value
fix — without it, "live class" is teacher-only. Then F2/F3/F4, then the game
honesty pass, then pedagogy, then device interactivity.

---

## What this changes vs. today
The board stops being "a bag of disconnected games with broken teams and dormant
student devices" and becomes a **coherent teacher-led live system**: students
really join, teams are real, every round is explicitly choral/individual/team,
individual rounds feed each student's mastery, and the lesson follows a real
pedagogical arc — handing off to the solo loop at the end.

> Next step: confirm Phase 0 priority, then I implement **F1 (student live sync)**
> first — it's the foundation that makes "live class" true.
