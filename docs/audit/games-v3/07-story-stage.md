# Story Stage — v3 Quality Audit (`STORY_STAGE`)

> **Status:** **file-ready** — §0–§3 audited (agent-parallel 2026-09-10) + §2 confirmed + screenshots captured. Ready for Anti-Gravity §4.
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
### 4.b Workflow & user flow (teacher's path: start → turns → end)
### 4.c Pedagogical practice (ESL ages 6–12)
### 4.d Game interaction (mechanic, pacing, fairness, fun)
### 4.e Top-5 prioritized recommendations
### 4.f Design direction for Stitch

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

## §6 ⬜ Stitch output & implementation notes

*(Owner drops the Stitch export into `stitch/<NN>-<game>/`; ZCode records implementation + deploy.)*
