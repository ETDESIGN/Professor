# Fast Vocab — v3 Quality Audit (`FAST_VOCAB`)

> **Status:** **cowork-done** — §4 co-work quality audit complete (Anti-Gravity 2026-09-10). Ready for §5 Stitch prompt.
> **Screenshots:** `screenshots/25-fast-vocab-idle.png`.

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

- **Flow type:** `FAST_VOCAB`
- **Component:** `apps/board/templates/BoardFastVocab.tsx` (live-board surface of the shared engine in `components/games/fastVocab/` — `useFastVocabTurn` controller, `contentBuilder` pure builders, `FastVocabMatchWave`, `FastVocabSpeedRound`, `FastVocabHud`, `useTapDragPairing`, `useFastVocabTimer`, `preloadWaveAudio`)
- **Phase:** PRACTICE
- **Remote-control group:** custom — SKIP_ITEM ("Skip") / REVEAL_HINT ("Hint") / MARK_CORRECT ("Correct") / RESET_GAME ("Redo") / SLIDE_COMPLETE forced ("End") (`apps/teacher/live/panels/ContextualControls.tsx:251-263`)
- **Data sources:** `useBoardPool({ exerciseTypes: ['IMAGE_SELECT', 'MEANING_MATCH'] })` → `detectMode` (≥3 real-image items ⇒ image mode, else word↔L1 meaning mode) → `buildUnitPairs` (one pair per objective); wave served by a per-slide pool cursor (`cursorRef`)
- **Mode:** picked student with a per-turn pool cursor (each student consumes the NEXT words — pool coverage); choral practice when no pick (zero scoring writes)

## §1 How the game works today

**One lightning turn per picked student: a 3-pair match wave followed by 2 timed speed-recall questions on the SAME words** (a learn→recall arc). The engine (`components/games/fastVocab/`) owns all game-feel state and emits result events; the board component implements scoring; the student solo app reuses the same engine.

**Match wave (phase 1).** Two rows of pods: source pods on top (the word's image in image mode; the English word in meaning mode) and target pods below (the English word / the L1 meaning), in a stable seeded shuffle so no pair sits vertically aligned and every tab shows the identical layout (E1.6). The student pairs them by tap-pod-then-tap-match **or** press-drag-release (`useTapDragPairing` hybrid). A correct match: correct cue (+ streak cue/confetti at 3 and 5), the word's audio plays, the pair locks green with a ✓. A wrong match: wrong cue, shake; escalation ladder — 1st miss on a pair glows its correct counterpart for 1.5s, 2nd miss reveals a micro-explanation card (word + image + meaning) for 3s. When all pairs clear, a 900ms wipe transitions to the speed phase.

**Speed round (phase 2).** 2 questions × 10s: one large prompt card (the image, or the L1 meaning) + three English word choices, single-shot — the timer is the retry pressure. Correct → cue + advance after 0.9s; wrong → shake + reveal + advance after 1.8s (−1 live); **timeout costs nothing** (the clock-anxiety house rule) and reveals with the word's audio. Hint eliminates one wrong choice; Skip jumps the question.

**Scoring is per-interaction and immediate.** Every correct pair and every correct speed answer calls `addPoints(scoreForAttempt(0, difficulty, 1.0, streak))` + `logAttempt`; every wrong tap/click applies −1 `MISTAKE_PENALTY`. A full 3-pair turn therefore emits 3–5 positive awards. Choral practice (no picked student) gets full game feel with zero writes.

**Turn completion.** `onComplete` fires once: a turn summary overlay (1–5 stars from first-try accuracy, "pts this turn", best streak, first-try ratio — the student's name frozen at completion, never the live pick) + win cue + confetti + a natural `SLIDE_COMPLETE` broadcast, which the commander deliberately ignores (`LiveCommander.tsx:49-62` — the teacher decides when a finished game moves on). Picked mode: the overlay dismisses on click and waits for the teacher's Next Student. Choral mode: clicking rolls straight into the next wave.

**Turn boundaries — the pool cursor.** The wave cursor is deliberately NOT reset per turn: a new wheel pick (`currentTurnId`) deals the NEXT words in the pool (`buildWave(cursorRef.current)`) so consecutive students cover different words; the initial seed and unit switches rewind to 0. The actions that accompany a pick (`SPIN_WHEEL`/`GAME_WIN`/`CLEAR_RESPONDER`) instantly drop the previous score screen. **Redo** (RESET_GAME) rewinds the cursor to 0 and re-deals wave 0 for the whole slide. **End** (forced SLIDE_COMPLETE) settles into complete without the summary.

**Empty/loading states:** "Content isn't ready for this round yet." with a Skip Round button (emits forced SLIDE_COMPLETE) when the pool yields no pairs; "Loading…" otherwise.

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> The game is very good in many ways, but we have an issue. On one screen, we need to connect the right card with the right word. For example, if the Quick Picker is set up on one question, the kid will connect the first word with the first card, and then the system will automatically reset the three cards to another set. When the next student comes, it can reset or go to the next card — sometimes it's only one card. Anyway, this interaction with the automatic one-question/three-question rotation system has some issues, so we need to audit it properly to fix.

**Clarified with the owner (2026-09-09):**
- ["Quick Picker" = Fast Vocab, confirmed by owner.]
- Card set must stay STABLE during one student's turn; when their questions are done the board auto-readies (fresh deal) for the next wheel pick — no confusing mid-turn resets.
- The exact composition of a 1-question turn (match wave vs speed-recall) = audit the current design first, then propose.

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardFastVocab.tsx` unless noted.

- **F1 · P1 — The §2 "cards reset to another set mid-turn" is the award-count wheel rotation colliding with per-interaction scoring. Full trace:** the sidebar wheel's auto-rotate modes "1 Q" (EVERY_1) / "3 Q" (EVERY_3) (`apps/teacher/live/sidebar/SidebarPanel.tsx:98-108`) count **positive `addPoints` awards to the current responder** — `store/SessionContext.tsx:1565-1581` bumps `rotationAwardCountRef` on every positive award and calls `nextStudent()` the moment the cadence is met. `nextStudent → beginTurn` (`store/SessionContext.tsx:1784-1819`) broadcasts `SPIN_WHEEL` immediately (wheel overlay spins over the half-played board) and stamps `revealAt`; at reveal the E2.4 chain broadcasts `NEW_TURN`, setting `currentTurnId` to a fresh token (`store/SessionContext.tsx:581-588`). Fast Vocab's `[turnId]` effect (`:239-248`) then calls `buildWave(cursorRef.current)` — the NEXT 3 words — and the new `wavePairs` identity triggers the engine's reset effect (`components/games/fastVocab/useFastVocabTurn.ts:145-147` → `resetTurn()`), snapping the phase back to 'match' with a completely different card set. Because Fast Vocab awards points **per pair and per speed answer** (`:135-136`, `:185-186` — 3–5 positive awards per turn), **EVERY_1 re-deals after the FIRST correct match** — the owner's exact symptom ("the kid will connect the first word with the first card, and then the system will automatically reset the three cards to another set") — and EVERY_3 re-deals at the wave-clearing match or the first speed answer. Nothing in the rotation knows about turn boundaries: the rotation counts awards; the game awards per interaction. Fix direction (matches §2 clarification): the rotation must defer to turn completion (e.g. the game exposes a turn-boundary signal / FAST_VOCAB batches per-turn scoring / the rotation waits out multi-award games), so the card set stays stable for one student's whole turn and the fresh deal lands only when the next pick arrives.
- **F2 · P2 — "Sometimes it's only one card."** When the cadence lands during the speed phase, the board is showing the single prompt card + 3 word choices (`:391-413`) — one card — when the wheel spins and the re-deal replaces it; likewise the 900ms wave→speed wipe (`useFastVocabTurn.ts:200-205`) can be interrupted mid-transition by the re-deal, flashing a near-empty stage. The phase structure is never explained on screen, so a mid-phase rotation reads as a random reset to "one card".
- **F3 · P2 — The completing student's summary is cut or skipped under rotation.** The `SPIN_WHEEL`/`GAME_WIN`/`CLEAR_RESPONDER` handlers `setShowSummary(false)` instantly (`:255-262`) so the next student's name never lands on the old screen — correct in isolation, but under EVERY_1/EVERY_3 the star/points summary of the student who just played appears for under a second or never (their turn was chopped at the first/second award, before `onComplete` could even fire). The celebration + "pts this turn" reconciliation is systematically lost.
- **F4 · P2 — The learn→recall arc is truncated.** Under EVERY_1 the student matches one pair and loses the speed-recall half for those words entirely (the wave is re-dealt under the next pick); FSRS receives receptive 'correct' writes for matched pairs (`:139-149`) but the recall reinforcement and its analytics never run for that student — the pedagogical payoff of the two-phase design silently disappears exactly when the rotation is on.
- **F5 · P2 — RESET_GAME rewinds the word queue to 0 for the whole slide** (`:263-271`): "Redo" re-serves the earliest pool words to every subsequent student, and a mid-turn Redo press re-deals instantly — the same visible "cards reset to another set" symptom, teacher-initiated. The board's header reset button advertises this only in a hover tooltip.
- **F6 · P3 — Destructive reset control is an unlabeled icon button in the header.** The RefreshCcw button (`:346-352`) sits one stray tap from the game area; its scope (whole-slide word-queue rewind + instant re-deal, per F5) is communicated only via `title`.
- **F7 · P3 — A floor of 1 star for any played turn.** `starsFor` returns ≥1 star whenever anything was played (`components/games/fastVocab/contentBuilder.ts:174-177`) — an all-wrong turn still celebrates a star on the summary. Deliberate ("≥1 star whenever anything was played") but worth revisiting if the summary becomes the rotation's turn-boundary moment (F1 fix).
- **F8 · P3 — Whose-turn is a small HUD label only.** The picked student's name appears solely inside the HUD progress label ("Match 1/3 — NAME" / "Speed 1/2 — NAME", `:322-327`); the in-game surface has no large picked-student moment (the BoardShell footer banner carries it) — at 5–8m the label is small, and under F1's churn it is the only place the rotating names appear inside the game.

**What already works well (context — don't re-litigate):** the engine/surface split (board + solo app share one controller), deterministic seeded deals identical on every tab (E1.5/E1.6 — wave, speed questions, pod order), the pool cursor giving consecutive students different words (coverage), the escalation ladder (glow → micro-explanation), the timeout-costs-nothing rule, `object-contain` image pods (no cropping — contrast with Story Quest), audio prefetch during the match phase, the frozen-at-completion summary name, choral practice with zero writes, and full remote parity with phase-appropriate semantics (skip/hint/correct behave differently in match vs speed).

## §4 ⬜ ChatGPT Co-Work quality audit

### 4.a UI & visual design
- **Low-contrast dark-on-dark container (screenshot `25-fast-vocab-idle.png`):** The main board container is a dark navy box (`#0a1128`) resting against the pitch-black BoardShell background. On typical classroom projectors with ambient light, the container boundary disappears, leaving floating elements without structural framing.
- **Accidental destructive reset button in header (F5, F6):** A bare circular `RefreshCcw` icon sits directly at the top right of the game card (`:346-352`), right next to the active game area. In touch-screen projection environments, an inadvertent finger press rewinds the entire word cursor to 0 for the whole slide and instantly wipes the board mid-turn. Destructive resets belong solely on the teacher's remote.
- **Illegible whose-turn badge at 5–8m (F8):** The picked student's identity is buried inside a muted HUD string ("MATCH 0/3 — Alice", `:322-327`). At distance, neither the active student nor their peers can tell who is on the spot. Fast Vocab needs a bold, energetic "CHALLENGER: ALICE" badge with their avatar prominently displayed.
- **Pod layout and connection affordance:** The 3 image cards and 3 word pills are arranged in two stacked horizontal rows separated by a faint "MATCH" rule. While the layout is clean, the interactive pairing affordance lacks tactile feedback: selecting a top card needs a prominent glowing selection beam or magnetic tethering so students physically see which item is awaiting a partner.
- **Phase transition disorientation (F2):** The transition between Phase 1 (3-pair match) and Phase 2 (timed speed recall) is a rapid 900ms wipe. Because there is no clear phase header, children and teachers are often surprised when the screen suddenly reduces to "only one card" with 3 buttons.

### 4.b Workflow & user flow (teacher's path: start → turns → end)
- **The Core Architectural Collision: Wheel auto-rotate vs. Multi-award turn scoring (F1, §2):**
  - The teacher activates auto-rotate on the sidebar wheel set to "1 Question" (`EVERY_1`) or "3 Questions" (`EVERY_3`).
  - The system counts *every positive `addPoints` call* as a question answered (`SessionContext.tsx:1565-1581`).
  - Fast Vocab emits an `addPoints` award **on every single matched pair (3 awards) and every speed question (2 awards)** — totaling 5 positive awards in one turn!
  - Under `EVERY_1`, the picked student matches their very first pair $\rightarrow$ `addPoints` fires $\rightarrow$ wheel auto-rotate triggers immediately $\rightarrow$ wheel spins $\rightarrow$ `NEW_TURN` broadcasts $\rightarrow$ Fast Vocab's `turnId` effect fires $\rightarrow$ the board fetches `buildWave(cursorRef.current)` and re-deals brand new cards! The student's turn is violently aborted after 5 seconds, exactly as the owner observed: *"the kid will connect the first word with the first card, and then the system will automatically reset the three cards to another set"*.
  - Under `EVERY_3`, the turn is chopped immediately after the 3rd match, discarding the speed-recall phase entirely!
  - **The Fix:** Fast Vocab must define a clear **Turn Boundary**. The wheel rotation cadence must listen for turn completion (`onTurnComplete`), OR Fast Vocab must batch turn scoring into a single unified payout at the end of the turn summary. The card set must remain completely stable until the student finishes their full turn.
- **Lost summary celebration under rotation (F3):** Because `SPIN_WHEEL` instantly calls `setShowSummary(false)` (`:255-262`), the turn summary screen (stars, accuracy, points earned) is instantly bypassed or flashes for less than 500ms, depriving the student of celebratory closure.
- **Remote control parity:** The remote group (`SKIP_ITEM`, `REVEAL_HINT`, `MARK_CORRECT`, `RESET_GAME`, `SLIDE_COMPLETE`) works cleanly, but needs an explicit "Next Student" advance cue after the turn summary completes.

### 4.c Pedagogical practice (ESL ages 6–12)
- **Destruction of the Learn $\rightarrow$ Recall pedagogical arc (F4):** Fast Vocab's design has a brilliant pedagogical premise: Phase 1 (3-pair match) provides receptive cross-modal encoding (connecting visual concept to English word); Phase 2 (speed recall) immediately tests retrieval practice on the *exact same three vocabulary words*. When the auto-rotate wheel aborts the turn after 1 or 3 awards, Phase 2 is systematically erased. Fixing the turn boundary restores this high-impact retention loop.
- **Pool cursor ensures wide classroom vocabulary coverage:** The persistent cursor (`cursorRef`) advances through the unit's vocabulary across consecutive student turns, ensuring that all 12–20 words in a unit get explored rather than repeating the first 3 words.
- **Low-anxiety speed challenge:** The speed round's 10-second timer creates excitement, but crucially applies the **timeout-costs-nothing rule** (timeout reveals the correct answer and plays audio without deducting a point). This prevents emotional freezing and clock panic for younger EFL learners (ages 6–8).
- **Phonological reinforcement:** Audio auto-plays upon every successful match and upon speed-round resolution, anchoring pronunciation to the printed text.

### 4.d Game interaction (mechanic, pacing, fairness, fun)
- **Tap vs. Drag smartboard usability:** While `useTapDragPairing` supports drag-and-drop, drag gestures on classroom interactive projectors frequently drop packets or stick. The primary interaction must be **Tap-to-Select $\rightarrow$ Tap-to-Match**, featuring large, tactile target pods with prominent active states and glowing connection lines.
- **Escalation scaffolding ladder:** Fast Vocab features an excellent built-in mistake hierarchy: 1st miss highlights the correct target pod for 1.5s; 2nd miss presents a 3-second micro-explanation card (word + image + meaning). This ensures struggling students are scaffolded rather than abandoned.
- **Turn summary scoring (F7):** The summary awards 1–5 stars based on first-try accuracy. While guaranteeing at least 1 star encourages participation, the summary screen should hold for 3 seconds with joyful sound effects before the wheel automatically spins for the next student.

### 4.e Top-5 prioritized recommendations
1. **P1 — Decouple Wheel Auto-Rotate from Per-Pair Awards & Enforce Turn Stability (F1, §2):** Ensure a student's card set remains 100% stable until their entire turn (3-pair match + 2 speed questions) is finished. Either batch score payouts at turn completion or emit a dedicated `TURN_COMPLETE` event that the rotation engine awaits before triggering `nextStudent()`.
2. **P2 — Preserve the Full Learn $\rightarrow$ Recall Arc (Match Wave $\rightarrow$ Speed Round) (F4):** Guarantee that every picked student experiences both the 3-pair match and the 2 speed-recall questions on the same words, securing retrieval consolidation.
3. **P2 — Remove Destructive In-Game Reset Button from Board Header (F5, F6):** Eliminate the bare `RefreshCcw` icon from `BoardFastVocab.tsx:346-352` to prevent disastrous accidental slide-level queue wipes. Restrict reset capabilities to teacher controls.
4. **P2 — Build Distinct, High-Energy Visual Stages for Phase 1 and Phase 2 (4.a, F2):** Replace the sudden wipe with an unmistakable phase banner (e.g., *"STAGE 1: POWER MATCH"* $\rightarrow$ *"STAGE 2: SPEED SPRINT"*), eliminating the perception of a random reset to "one card".
5. **P3 — Elevate Active Challenger Identity on Projection HUD (F8):** Replace the tiny HUD text with a prominent, glowing student avatar and turn badge (*"⚡ CHALLENGER: ALICE"*) visible from 8 meters.

### 4.f Design direction for Stitch
- **Mood and visual theme:** "Lightning Vocab Arena" / "Cyber Circuit Relay". Deep electric obsidian background (`#070B19`), high-voltage neon yellow/amber accents (`#F59E0B`), energetic cyan circuit tethers (`#00F0FF`), and radiant emerald match locks (`#10B981`). Elements should look like high-tech power chips and illuminated circuit nodes.
- **Mock up these four screens/states (16:9 projector, no scrolling):**
  1. **Screen 1 — Stage 1: Power Match (Active Pairing):**
     - Top HUD: Picked challenger badge: `[⚡ Alice's Turn]` + round tracker: `[Stage 1: Power Match (1/3 Pairs)]`.
     - Stage: 3 landscape image plates on top row, 3 English word pills below.
     - Center interaction: Card 1 (`TRACTOR`) is selected, emitting a pulsing cyan laser tether awaiting selection of the matching word pill below.
     - Right rail: Streamlined live leaderboard.
  2. **Screen 2 — Stage 2: Speed Sprint (Rapid Retrieval):**
     - Top HUD: Dynamic amber banner: `[🔥 STAGE 2: SPEED SPRINT (1/2)]` + central glowing circular 10s countdown gauge (`7s`).
     - Center Stage: Massive prompt plate displaying the target image (`HELICOPTER`).
     - Bottom: 3 large horizontal option bars (`A: AIRPLANE`, `B: HELICOPTER`, `C: SUBWAY`) with bold, punchy typography.
  3. **Screen 3 — Mistake Escalation Scaffold:**
     - A missed attempt triggers the micro-explanation modal: target image + highlighted English word + audio speaker wave + gentle hint cue.
  4. **Screen 4 — Turn Summary Celebration:**
     - Full-stage victory pod: *"⚡ Turn Complete, Alice!"*, 5 glowing gold stars bursting onto the screen, `+5 Points Earned`, streak stats, and a prominent countdown bar: *"Next Student in 3... 2... 1..."*.
- **What to KEEP from current design:** The two-stage learn$\rightarrow$recall engine, deterministic seeded deals (`E1.6`), persistent pool cursor for broad unit coverage, timeout-costs-nothing fairness rule, and 2-tier escalation ladder.

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

## §6 ⬜ Stitch output & implementation notes

*(Owner drops the Stitch export into `stitch/<NN>-<game>/`; ZCode records implementation + deploy.)*
