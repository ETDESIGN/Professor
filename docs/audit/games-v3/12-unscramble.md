# Unscramble — v3 Quality Audit (`UNSCRAMBLE (alias SCRAMBLE)`)

> **Status:** **file-ready** — §0–§3 audited (agent-parallel 2026-09-10) + §2 confirmed + screenshots captured. Ready for Anti-Gravity §4.
> **Screenshots:** `screenshots/12-unscramble-idle.png`.

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

- **Flow type:** `UNSCRAMBLE` (legacy alias `SCRAMBLE`, mapped to the same template in `apps/board/templates/boardMap.tsx:70-71`)
- **Component:** `apps/board/templates/BoardUnscramble.tsx`
- **Phase:** PRACTICE (reads `activeSlideData.phase`, falls back to PRACTICE)
- **Remote-control group:** `ScoredShellControls` with Check — Check (`CHECK_ANSWER`) / Hint (`REVEAL_HINT`) / Mark Correct (`MARK_CORRECT`) / Skip (`SKIP_ROUND`) / Next (`NEXT_ROUND`) / End (`SLIDE_COMPLETE`), plus `RESET_GAME` (remote) and the board-emitted `UNSCRAMBLE_MOVE` tile sync. Emitted from `apps/teacher/live/panels/ContextualControls.tsx:134-141` (bar at `:42-73`) + `apps/remote/TeacherRemote.tsx:373-404`.
- **Data sources:** `useEscalatingPool` — `SHELL_CAPABILITIES.UNSCRAMBLE` consumes `WORD_BANK_BUILD` (vocab rung 5) + `TRANSFORM` (grammar rung 3), rungRange [3,5]; `roundSize: 3` over-pull, `TOTAL_ROUNDS = 4`; frozen slide `data.words` + `data.targetSentence` fallback.
- **Mode:** picked student (`quickWheelWinner`); choral playable (scoring guards on `picked`).

## §1 How the game works today

**Two round kinds, one tile UI.** **WORD_BANK_BUILD** (vocabulary rung 5): assemble the word's example sentence from a word bank that deliberately contains **2 extra distractor words** drawn from sibling vocabulary (`supabase/functions/generate-exercises/index.ts:144-148`). **TRANSFORM** (grammar rung 3): a purple "Original" reference line shows the prompt sentence (`prompt_sentence`) and the correct MCQ option is the assembly target; the grammar rule rides as `instruction` and appears in the header sub-line. The unit's first normalizable pool item for the round becomes `round` (`:202-209`); a frozen legacy fallback exists for slides that still carry `data.words`/`data.targetSentence`.

**Board.** A dashed drop zone ("DROP WORDS HERE"), a downward arrow, and a row of blue Duolingo-style word-bank tiles. Tap a bank tile to place it; tap a placed tile to return it. Every move is broadcast as `UNSCRAMBLE_MOVE` so commander/remote/projector mirror the board. A green **Check Answer** button enables once the placed count reaches the target length (`:503`).

**Checking.** LCS partial credit over punctuation-stripped tiles (`:338-339`): ratio ≥ 0.5 passes (1.0 = correct; 0.5–0.99 = partial with a "N% in the right order" overlay and partial points); below 0.5 = a miss (live −1, streak reset, red shake) plus **targeted feedback** — a clean adjacent swap highlights exactly those two tiles ("Swap these two!"), anything messier highlights the first wrong position ("Check this spot…"). A **2nd failed check** triggers the designed reveal: the target sentence in order, each tile colored green (position was right) or amber (misplaced/missing), ~2.4 s hold, then auto-advance (`:369-376`).

**Lifecycle & scoring.** Standard 4 must-dos: full rebuild on new pick (`:474-481`), `mistakesRef`/`awardedRef` latches with an "already scored this turn" chip on re-checks, award = `scoreForAttempt(difficulty, ratio, streak)` (floor 1, cap 5), dual-write incl. `gradeObjective(…, 'productive')` and remediation push on misses. Correct answers auto-advance after 2.4 s; round 4 completion shows "Great building, ⟨name⟩!" and broadcasts `SLIDE_COMPLETE`.

**Controls.** Commander and remote expose the same set: Check, Hint (re-runs the swap/position highlight on the current placement), Mark Correct (force-award full points + streak), Skip (advance silently), Next, End, Reset (re-deals with a new seed).

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> We have a screen where it's written "original draft" — e.g. "…have got spots" — and then we have a few words, e.g. "sheriff", "have got stripes" — and we should put those words in the right order. But the design is a little bit not very clear about what we need to write — we need to make it clearer, because basically I don't know what I should write right now. (First example: the sentence was "Lions can swim but…" and the answer was "Lions cannot swim" — it was an example, not exactly the exercise, but basically we don't know what we should write — there are not enough instructions.) / Also remember it's an application for learning English, so we can give tips explaining what we should do, but not giving right away the answer. That's something we need to audit properly.

**Clarified with the owner (2026-09-09):**
- The task frame is unclear (what sentence to build, what "original draft" means) — needs an explicit, kid-readable instruction design.
- Instruction language (English-only vs English + small Chinese line) = Co-Work decides under the refined English-first rule (owner, 2026-09-09: avoid Chinese when possible — NOT a strict ban; instructions may use it when needed for clarity; never make the answer trivially visible).
- Hints/tips may explain HOW, but must never reveal the answer.

> If the student cannot get it right, there is no button for the teacher to show the answer and make the kid not get his point. But we need a way to pass a question when we are blocked.

**Clarified with the owner (2026-09-09):**
- The commander's Skip button WAS VISIBLE but did nothing when clicked — dead-button bug, root-cause in the code audit (emitter/receiver action-string mismatch suspected).
- Ideal blocked-question flow: a working way to reveal the answer, award nothing, and move on.

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardUnscramble.tsx` unless noted.

- **F1 · P1 — Skip "does nothing" (§2 bug #2, root-caused).** The suspected action-string mismatch is **not** the cause: the commander (`ContextualControls.tsx:63` via the UNSCRAMBLE case `:134-141`) and the remote (`TeacherRemote.tsx:391`) both emit `SKIP_ROUND`, and the board handles it (`:433` → `skipRound :421-423` → `advanceRound({silent:true}) :296-307`). The deadness is downstream — two compounding causes plus one alternate manifestation:
  - **(a) Thin pool re-serves the SAME item.** UNSCRAMBLE-consumable items only exist where content supports them: WORD_BANK_BUILD needs an example sentence (`generate-exercises/index.ts:144-148`) and TRANSFORM comes only from grammar `transformation_pairs` (`:223-232`). On the owner's unit the pool evidently held ~1 consumable item, so after the skip the same item is selected again (the round is simply the first normalizable item, `:202-209`).
  - **(b) The re-deal is pixel-identical.** The tray shuffle is seeded `makeRng(seedBase, r.id, 'tray')` (`:244`) and `seedBase` = `session|unit|step|turn|reset` contains **no roundIndex** (`store/SessionContext.tsx:2038-2047`) — the same item re-deals the *same tile order*. Same "Original" line, same tiles, same positions: Skip visibly does nothing. (Reset DOES reshuffle, because `resetCount` rides the seed — a useful diagnostic: if Reset moves the tiles but Skip doesn't, this is the cause.)
  - **(c) Alternate manifestation:** the coverage ledger marks the item's objective served after round 1 (`apps/board/useEscalatingPool.ts:188-191`); if no other objective has consumable items, the next round's `filteredItems` is empty and the board flips to "Content isn't ready… Generate the exercise pool / Skip Slide" (`:484-498`) — which also reads as "the game broke".
- **F2 · P1 — Task frame unclear (§2 bug #1, root-caused to three mechanical causes).**
  - **(a) The build target is never stated.** WORD_BANK_BUILD shows **no reference line at all** (only an optional Chinese translation chip `:522-526`); TRANSFORM shows the prompt under a tiny uppercase "ORIGINAL" label (`:535-540`) with the instruction buried in the header sub-line at `text-sm` (`:516`). Nothing on the board asks a question ("Make it negative", "Build: …") — the owner's "I don't know what I should write".
  - **(b) The word bank deliberately contains 2 distractor words** from sibling vocabulary (`generate-exercises/index.ts:146-147`, `pickFrom(siblingWords, 2)`) — the "sheriff" / "have got stripes" tiles the owner saw — and the board gives **zero indication that some tiles don't belong**.
  - **(c) Check stays disabled until `placed.length >= targetTiles.length`** (`:503`, `:334`) — with distractors in the tray the kid must discover "use only some tiles" by trial and error.
- **F3 · P2 — No "reveal answer, award nothing, move on" control (§2 bug #2's actual ask).** The designed reveal fires ONLY on the 2nd failed CHECK with ≥1 tile placed (`:333-334`, `:369-376`); with an empty placement, Check (`:334`) and Hint (`:398`) both return early — in the truly-blocked state every teaching control is dead and Skip (F1) reveals nothing. MARK_CORRECT awards FULL points + streak (`:404-419`) — the opposite of the owner's "show the answer, kid gets no point". A "Show answer (0 pts) → next" path is missing.
- **F4 · P2 — Hint walks the answer.** Each press highlights the first wrong position or a clean swap (`:395-402`); repeated presses walk every position — collectively reconstructing the target with no award cost, violating the owner's tips-never-reveal rule.
- **F5 · P3 — Strict normalization penalizes valid variants.** `strip` removes only `[.,!?;:]` (`:338`) — case differences ("Lions" vs "lions") and apostrophe forms ("can't" vs "cannot") count as wrong positions in the LCS, downgrading grammar-transform answers that are orthographically fine.
- **F6 · P3 — Placed-tile hover implies destructive.** Placed tiles hover red (`hover:bg-red-50 :564`) though tapping just returns the tile to the bank — the affordance reads as "danger" and discourages reordering, the core mechanic.
- **F7 · P3 — Inconsistent difficulty framing between round kinds.** TRANSFORM's tray is just the shuffled target (`:126`, no distractors) while WORD_BANK_BUILD carries 2 distractors — the same UI, two hidden rule sets.
- **F8 · P3 — The outcome overlay reveals the full sentence immediately after one pass** (correct *or* partial, `:615-635` with the answer at `:631`) — fine as a teaching beat, but combined with F3 the reveal timing is all-or-nothing: automatic after checks the teacher doesn't control, unavailable when the teacher wants it.
- **F9 · P3 — `TOTAL_ROUNDS = 4` is fixed** (`:132`) regardless of pool depth — thin pools replay (F1a) or empty out (F1c) before 4 real rounds exist; the counter promises content the unit may not have.

**What already works well (context — don't re-litigate):** LCS partial credit + the targeted swap/first-wrong-position feedback (spec A1); the 2nd-miss designed reveal with per-position green/amber coloring; productive-mode FSRS writes + remediation pushes; the `awardedRef` latch + "already scored this turn" chip; `UNSCRAMBLE_MOVE` cross-tab mirroring; seeded deterministic tray deals per turn/reset.

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
