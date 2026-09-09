# Unscramble — v3 Quality Audit (`UNSCRAMBLE (alias SCRAMBLE)`)

> **Status:** **stitch-in-flight (wave 1)** — §4 audited (Anti-Gravity). Ready for Stitch prompt §5.
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

## §4 ChatGPT Co-Work quality audit

> **Co-Work: write your findings ONLY inside this section.** (Full instructions + shared prelude embedded at `file-ready`.)

### 4.a UI & visual design

- **P1 — Inverted directional cue and cavernous, dead drop space.** **Evidence:** `screenshots/12-unscramble-idle.png`. The center stage is dominated by an enormous dashed rectangle ("DROP WORDS HERE") taking up over 45% of the screen height, accompanied by a large downward arrow (`↓`) pointing directly at the word bank below. This creates severe visual confusion:
  1. Words are placed *from* the bank *into* the drop area (moving UP), yet the arrow points DOWN toward the bank.
  2. The massive empty drop zone has no slot affordances (no individual word placeholders), giving zero indication of whether the target sentence is 3 words or 7 words long.
  *Recommendation:* Invert and restructure the stage. Replace the cavernous empty box with a sleek horizontal "Sentence Runway" featuring discrete, dotted word-slot frames corresponding to the target sentence length. Replace or remove the downward arrow with an intuitive bottom-up assembly flow.

- **P1 — Glued punctuation and unannounced distractor words.** **Evidence:** `screenshots/12-unscramble-idle.png` and §3 F2b (`generate-exercises/index.ts:146-147`).
  1. The tile `fast.` has a period physically glued to the letters, while `Lions` is explicitly capitalized. This trivially gives away the first and last words of the sentence without requiring grammatical deduction.
  2. The bank includes 6 tiles (`can`, `run`, `river`, `apple`, `Lions`, `fast.`), where `river` and `apple` are completely unrelated distractors. Nothing on the screen informs the teacher or students that distractors exist or how many words should be selected (e.g. "Use 4 words").
  *Recommendation:* Separate punctuation from word tokens (or strip terminal punctuation on tiles) and provide an explicit slot count (e.g. 4 dashed slots for a 4-word sentence) so students understand that 2 tiles will remain in the bank.

- **P2 — Header chrome collision with BoardShell phase pill.** **Evidence:** `screenshots/12-unscramble-idle.png`. The `BoardShell` system component renders `• WARM-UP` at `top-5 left-6`, overlapping directly with the top border of the "Unscramble" header card.
  *Recommendation:* Apply a standard left clearance (`left-24` or `pl-20`) or pad the top stage to isolate the game title from global shell badges.

- **P2 — Alarming red hover state on placed tiles.** **Evidence:** §3 F6 (`BoardUnscramble.tsx:564`). Hovering over a tile already placed in the drop zone changes its background to red (`hover:bg-red-50`). In educational UI, red strongly connotes an error or irreversible deletion. Tapping simply returns the tile to the word bank—a normal, risk-free editing action.
  *Recommendation:* Replace the red hover with an energetic return animation or a neutral slate/blue bounce with a gentle return icon (`↩`).

- **P2 — Retract 240px leaderboard rail in Choral / Practice mode.** **Evidence:** `screenshots/12-unscramble-idle.png`. The screenshot shows all 8 students at 0 points occupying a 240px rail on the right during a whole-class choral round. Retracting this rail gives sentence tiles the full 16:9 width needed for longer sentences.

### 4.b Workflow & user flow (teacher's path: start → turns → end)

- **P1 — The "Skip Does Nothing" illusion (Identical Re-deal on Thin Pool).** **Evidence:** §2 owner comments and §3 F1 (`BoardUnscramble.tsx:244, 421-423`). When the teacher taps `SKIP_ROUND` on Commander or Remote, the board calls `advanceRound({silent: true})`. However, in units with thin exercise pools (only 1 valid `WORD_BANK_BUILD` sentence), the pool wraps and re-selects the exact same item. Furthermore, because `seedBase` omits `roundIndex`, the tile shuffle is pixel-identical! The screen does not change at all. To the teacher, the Skip button appears completely broken and unresponsive.
  *Recommendation:* Incorporate `roundIndex` and `Date.now()` into the deal seed when skipping, display a brief transition animation ("Skipping to next question..."), and if no other sentence exists in the pool, gracefully conclude the round or re-scramble the distractors.

- **P1 — Missing "Pass / Reveal (0 pts)" emergency escape control.** **Evidence:** §2 owner comments and §3 F3 (`BoardUnscramble.tsx:334, 398, 404`). If a picked student is completely blocked and cannot form the sentence, the teacher is trapped:
  1. `CHECK` and `HINT` return early if 0 tiles are placed.
  2. The automated explanation card only triggers after a *second failed check* with tiles placed.
  3. `MARK_CORRECT` force-awards full points and streak (falsifying progress).
  *Recommendation:* Add a dedicated `Pass & Show Answer / 放弃并显示答案` action to Commander and Remote. When tapped, it reveals the completed sentence on the board in gold/amber, plays the audio read-through, awards 0 points (logging a missed attempt in FSRS), and auto-advances after 3 seconds.

- **P2 — Check button disabled state blocks student feedback.** **Evidence:** §3 F2c (`BoardUnscramble.tsx:503`). The green "Check Answer" button remains strictly disabled until `placed.length >= targetTiles.length`. If a student believes a 3-word phrase is complete (e.g. "Lions can run"), the teacher cannot tap Check to trigger corrective guidance. The button remains inert with no explanation.
  *Recommendation:* Enable the Check button once at least 1 tile is placed. If fewer than the required number of words are placed, clicking Check triggers a gentle prompt: "Needs 4 words! Keep going! 🧩".

- **P2 — Hint walks the answer without cost or limit.** **Evidence:** §3 F4 (`BoardUnscramble.tsx:395-402`). Repeatedly tapping `HINT` iteratively highlights the next wrong tile or position, allowing a teacher or student to systematically solve the entire sentence without pedagogical challenge or score penalty.
  *Recommendation:* Restrict `HINT` to: (1) eliminate one incorrect distractor from the bank, or (2) place only the first missing word with a −1 point penalty.

### 4.c Pedagogical practice (ESL ages 6–12)

- **P1 — The "What Am I Building?" Contextual Crisis.** **Evidence:** §2 owner comments and §3 F2a (`BoardUnscramble.tsx:516, 535-540`). As seen in `screenshots/12-unscramble-idle.png`, `WORD_BANK_BUILD` displays zero prompt, zero context, and zero image—only the generic header "Build the correct sentence." With random distractors present (`river`, `apple`), students are forced into blind trial-and-error. For young ESL learners, sentence formation requires semantic grounding.
  *Recommendation:* Provide clear contextual anchors:
  1. For vocabulary sentences: display a relevant thematic illustration (e.g. photo of lions running in the savanna) and a prompt question: *"What can lions do?"*.
  2. For grammar transformations: clearly display the prompt sentence under an eye-catching label: *"Original: Lions can swim"* with an explicit instruction: *"Make it negative: Lions cannot..."*. A small Chinese instruction sub-line (e.g. `改为否定句`) is explicitly allowed under the owner's refined rule.

- **P2 — Pedagogical Distractor Design.** **Evidence:** §3 F2b. Current distractors are random vocabulary words (`river`, `apple`) selected from sibling unit items. In ESL syntax instruction, effective distractors target grammatical form (e.g. `runs` vs `run`, `don't` vs `doesn't`, `in` vs `on`), testing syntactic rules rather than arbitrary noun selection.
  *Recommendation:* Structure distractor generation to test grammar morphology (verb agreement, prepositions) rather than unrelated vocabulary.

- **P3 — Audio Sentence Reinforcement on Completion.** Sentence building is a productive syntax exercise. Upon successful assembly, hearing the complete sentence read aloud with natural rhythm, stress, and intonation is critical for auditory reinforcement.
  *Recommendation:* Auto-play fluent TTS upon sentence completion, with word-by-word karaoke highlighting across the placed tiles.

### 4.d Game interaction (mechanic, pacing, fairness, fun)

- **P2 — Tactile Slot-Filling and Reordering.** In live classrooms where students come to the board or teachers tap on interactive displays:
  - Tapping a word in the bank should visibly glide into the first available slot in the sentence runway.
  - Tapping a word in the runway returns it to the bank.
  - Dragging a placed tile left or right swaps its position effortlessly.

- **P2 — Multi-tier Feedback on Check:**
  - *Full Correct (100%):* All tiles illuminate emerald green, chime plays, confetti triggers at streak milestones, audio reads the sentence, auto-advance after 2.5s.
  - *Clean Swap Needed:* Highlight the two inverted tiles in amber with an animated curved swap arrow ("Swap these two!").
  - *Partial / Missing:* Pulse the incorrect slot with an amber outline, leaving correct slots locked green.

- **P3 — Tolerant Capitalization and Punctuation Matching.** **Evidence:** §3 F5 (`BoardUnscramble.tsx:338`). The string comparison should ignore case mismatches and apostrophe variants ("cannot" vs "can't") so children are not penalized for valid English contractions.

### 4.e Top-5 prioritized recommendations

1. **P1 — Provide Contextual Anchors and Explicit Task Instructions (F2):** Add an illustrative visual cue and an explicit goal prompt (*"What can lions do?"* or *"Make it negative / 改为否定句"*).
2. **P1 — Add "Pass & Reveal (0 Pts)" Emergency Control (F3):** Empower the teacher on Remote and Commander to reveal the correct sentence and advance without awarding points when a student is stuck.
3. **P1 — Fix the Skip Re-deal Variety Bug (F1):** Incorporate `roundIndex` into the shuffle seed and ensure skipping provides a clear transition even on thin pools.
4. **P1 — Replace Dotted Void with Structured Sentence Runway (4.a):** Eliminate the downward arrow; implement discrete word slots corresponding to the target sentence length.
5. **P2 — Audio Read-Aloud with Karaoke Highlighting (4.c):** Read the completed sentence aloud with synchronized word-by-word highlighting upon success.

### 4.f Design direction for Stitch (style/mood guidance + the 3–5 key screens/states to design; what to KEEP from the current design)

**Mood and visual system.** Design this as a modern "Sentence Workshop / Syntax Lab". Deep slate navy background (`#0F172A`), warm amber-gold (`#F59E0B`) for assembly slots and construction framing, electric cyan (`#06B6D4`) for interactive word tiles, neon emerald (`#10B981`) for correct locks, and crisp white typography. The UI should evoke tactile wooden or plastic building blocks snapping into place on a master workbench.

**Mock up these four board screens/states (16:9 projector, no scrolling):**

1. **Screen 1 — Fresh Challenge (Idle State):**
   - Header: "Unscramble · Round 1/4 · Build the sentence", Alice's turn badge, phase clearance top-left.
   - Upper Stage: Center visual card showing an authentic photograph of lions running across a savanna, captioned with prompt: *"What can lions do?"*.
   - Middle Stage: Horizontal Sentence Runway with 4 outlined, glowing dashed slots labeled `1`, `2`, `3`, `4`.
   - Lower Stage: Word Bank tray containing 6 tactile, raised blue word blocks: `can`, `run`, `river`, `apple`, `Lions`, `fast`.

2. **Screen 2 — Partially Assembled Sentence:**
   - 3 blocks placed in slots 1–3 (`Lions`, `can`, `run`).
   - Slot 4 remains open and pulsing gently.
   - Remaining tiles in bank: `river`, `apple`, `fast`.
   - Green "Check Answer" button active at bottom-right.

3. **Screen 3 — Correct Completion & Karaoke Read-Through:**
   - All 4 slots locked with glowing emerald borders.
   - Word "run" highlighted with a bright cyan glow as native TTS pronounces it.
   - Floating celebration banner: "+1 Point! 🔥 Streak 3!" with celebratory confetti.

4. **Screen 4 — Teacher Pass / Reveal State (0 Points):**
   - Correct sentence assembled in amber-gold outline.
   - Subtle badge: "Answer Revealed · 0 pts".
   - 2.5s countdown ring auto-advancing to the next question.

**What to KEEP from current design.** Retain the LCS partial credit algorithms, targeted two-tile swap guidance ("Swap these two!"), dual-write scoring with productive-mode FSRS tracking, and `UNSCRAMBLE_MOVE` cross-tab realtime synchronization.

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

**§5 wave-1 design pass — SUBMITTED 2026-09-10 (ZCode → Stitch, autonomous):** two key screens per the §4.f brief: **U1 clear task frame (photo + prompt + runway + distractors marked)** and **U2 partially assembled snap-fit**. Landing in the Stitch project (~15 min); ZCode verifies against the QA list, exports to `stitch/12-unscramble/`, then implements (with the §3 root-cause fixes) in implementation wave 1.

## §6 ⬜ Stitch output & implementation notes

*(Owner drops the Stitch export into `stitch/<NN>-<game>/`; ZCode records implementation + deploy.)*
