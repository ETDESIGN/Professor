# Vocab Blitz — v3 Quality Audit (`VOCAB_BLITZ`)

> **Status:** **cowork-done** — §4 co-work quality audit complete (Anti-Gravity 2026-09-10). Ready for §5 Stitch prompt.
> **Screenshots:** `screenshots/32-vocab-blitz-idle.png` — captured at the confidence-bet screen — the §2 per-question re-ask.

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

- **Flow type:** `VOCAB_BLITZ` (the reformed speed quiz — built to replace the anxiety-inducing BoardSpeedQuiz one-shot)
- **Component:** `apps/board/templates/BoardVocabBlitz.tsx`
- **Phase:** ASSESS
- **Remote-control group:** custom — Skip / Correct / Steal / Redo / End on the commander (`apps/teacher/live/panels/ContextualControls.tsx:222-231`); ⚠️ the baton carries only Skip / Redo (shared with MEMORY_LAB/CLASS_RALLY, `apps/remote/TeacherRemote.tsx:598-609` — see §3 F3)
- **Data sources:** `useBoardPool` (`MEANING_MATCH` + `IMAGE_SELECT` + `SPELL_CLOZE` + `ERROR_SPOT`, seeded per session+unit), deduped to ONE question per objective
- **Mode:** picked student; the bet/steal mechanics are per picked student, all taps land on the projected board

## §1 How the game works today

**Phase machine.** `bet → question → feedback → (advance) → bet → … → complete` — the confidence bet is a distinct screen BEFORE every question, not an overlay. Questions come from the pool deduped per objective (a 10–15-word unit yields 10–15 distinct questions; the pool shuffle decides which exercise type represents each word, `:138-171`); the component reads the flow block's `data` prop for NOTHING — every knob below is hardcoded.

**The bet flow (§2 focus).** The bet screen shows "How confident are you?" with two board-tap buttons — **1x Bet** (blue) / **2x Bet** (orange) — plus the one-line rule "2x bet = double points if correct, but double penalty if wrong" (`:622-655`). `handleBetSelect` locks `bet` (default resets to 1), arms the 15s clock and enters the question phase (`:295-301`). **Where it is asked today:** before EVERY question — `advanceToNext()` resets `setPhase('bet'); setBet(1)` after each resolution (`:533-535`) — AND on every new turn (`NEW_TURN` effect, `:196-197`). There is no remote/comander path to place the bet; only the projected board is tappable.

**How the multiplier applies.** On a correct answer: `basePoints = scoreForAttempt(mistakes, difficulty, retryUsed ? 0.5 : 1.0, streak)` — which returns the unified 1–5 (floor 1, **cap 5 applied INSIDE**) — then `points = basePoints * bet` (`:330-331`). So the 2× multiplier is applied AFTER the cap: a difficulty-3 clean answer is 3→6, with a 3-streak 4→8, with a 5-streak 5→10. On a miss the downside doubles symmetrically: `addPoints(picked, -MISTAKE_PENALTY * bet)` → −1 or −2 (`:359`). `MARK_CORRECT` also multiplies by the bet (`:497`). Steals ignore bets entirely (below).

**The timer.** A single hardcoded `QUESTION_TIME_LIMIT = 15` seconds (`:50-51`) — the file header still advertises "adaptive timer (15s recognition, 25s production)" (`:5-6`) but the 25s production tier was removed when the pool went MCQ-only; the countdown is a plain interval (StrictMode-safe pure decrement) with a green/yellow/red bar (green >5s, yellow >3s, red ≤3s, `:231-243,683-690`). It is not configurable at plan time.

**Answer flow.** Options are a fixed 2×2 grid — image cards for IMAGE_SELECT (`aspect-square`, `object-cover`), text rows otherwise (`:701-736`). Correct: streak bumps (cue + confetti at 3/5), points = base × bet, `addPoints` + `logAttempt` (`awardedRef` latch, one payment per question), feedback screen "X nailed it! +N points (2x bet!)" for 900ms, advance (`:317-349`). Wrong: −penalty × bet, streak reset, analytics write; **one retry allowed at 50%** — the wrong pick clears after 800ms and `retryUsed` arms (a "Retry used (50% points)" chip shows; a retry-correct passes ratio 0.5 into `scoreForAttempt`, `:374-379,330,681`). Second miss OR timeout → **reveal**: the correct option rings amber with the explanation text, 2200ms teaching hold, advance (`:380-388,739-748`). Timeout is deliberately NOT a points penalty (clock-anxiety rule for 6–12s) but is logged incorrect for FSRS/remediation (`:439-469`).

**STEAL_OFFER (2026-08-17 mechanic).** The steal window opens ONLY at the reveal moment — after the retry is exhausted by a 2nd miss, or after a timeout (a 1st miss keeps the student's own retry live; the tap is a no-op elsewhere, `:282-292`). On offer: the pending auto-advance is cancelled, the countdown freezes, and the per-turn reset is suppressed so the stealer pick's `NEW_TURN` can't wipe the question (`:116-134,176-184`). The teacher spins; a `quickWheelWinner` change (≠ the previous student) locks the stealer (`:211-225`); a banner narrates offer → active → stolen. The stealer answers the SAME question UNTIMED: correct = **half of base** via the ratio arg (`scoreForAttempt(mistakes, difficulty, 0.5)` — bets ignored, no streak credit, `:398-423`); wrong = reveal + advance, no penalty for the stealer (the first student already paid). One steal per question — `stealPhaseRef` stays latched until the advance funnel (`advanceToNext`, `:519-543`) clears it. `MARK_CORRECT` during an active steal resolves the steal at half price, never a full override (`:479-482`).

**Turn boundaries and the bet-lock hook (§2 want).** Turn boundaries are observed via `const turnId = state.currentTurnId` + the effect at `:176-202`: `NEW_TURN` is broadcast by the wheel at reveal time (`store/SessionContext.tsx:581-588`, payload `turnToken`), which resets mistakes/awarded/streak/selection/`bet`/phase — but deliberately NOT `currentQIdx` (pool coverage: every student continues the question stream instead of replaying q0, `:189-193`). **A turn today is an indefinite series of questions that ends only at the next pick** — the "wheel's 1/3/full questions-per-turn setting" in the §2 clarification does not exist in code. Where a per-TURN bet lock would hook:
1. **`advanceToNext()` `:533-535`** — replace the unconditional `setPhase('bet'); setBet(1)` with: if a turn-level bet latch is set, keep `bet` and go straight to `setPhase('question')` + `setTimeRemaining(QUESTION_TIME_LIMIT)`.
2. **The `NEW_TURN` effect `:196-197`** — this stays the place the gate RE-OPENS: clear the latch + `setBet(1)` + `setPhase('bet')` so the FIRST question of each turn asks once.
3. **`RESET_GAME` `:259-273`** — clears the latch too (fresh run).
4. The latch itself is a `betLockedRef` mirroring `awardedRef` (reset in 2 and 3, set in `handleBetSelect` `:295`). If a 1/3/full question count is later added, its exhaustion would re-open the gate through the same two reset sites.

**Complete.** After the last question resolves, the advance funnel emits the trophy screen + a natural `SLIDE_COMPLETE` (`:538-542`); a forced End from the controls settles silently (`:278-281`). The picked student's name rides a footer chip through every phase (`:798-807`).

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> The system, before each question, asks "how confident are you?" and offers you to choose between a 1× bet or a 2× bet. This is good. But, for example, when we are in a series of three questions, the system should ask only one time — not ask again on every question. So if the student picks a 1× bet, we go through the 1× bet for the whole series of questions; a 2× bet will be through the whole series of questions.

**Clarified with the owner (2026-09-09):**
- The 1×/2× confidence bet is asked ONCE per picked student's TURN (however many questions the wheel's 1/3/full setting gives) and locks for that whole series.

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardVocabBlitz.tsx` unless noted.

- **F1 · P1 — The bet is re-asked before EVERY question instead of once per turn.** `advanceToNext()` resets to the bet phase after each resolution (`:533-535`), so a student playing N questions answers the confidence gate N times — exactly the §2 complaint. The fix is small and fully mapped in §1 (turn-level `betLockedRef`; keep-bet through `advanceToNext`, re-open in the `NEW_TURN` effect and `RESET_GAME`). Note the count part of the owner's model (wheel 1/3/full questions per turn) does not exist in code — a turn is currently unbounded until the next pick; if that setting is added, it should also end the bet lock through the same hook.
- **F2 · P2 — The 2× multiplier is applied AFTER scoreForAttempt's cap — awards reach 10, contradicting the documented model.** `points = basePoints * bet` (`:331`, also `:497`) where `basePoints` is already the capped 1–5 (`scoringDefaults.ts` `scoreForAttempt` returns `Math.min(MAX_QUESTION_POINTS, …)`). `scoringDefaults.ts` explicitly claims the cap "also caps BoardVocabBlitz's double-or-nothing ×2 bet (3 × 2 → 5, not 6)" — the code does the opposite: difficulty 3 clean ×2 = 6, 5-streak ×2 = 10. Either clamp after the multiply (`Math.min(5, base * bet)` + keep the doubled penalty) or update the documented model to sanction 10-point moments — today the leaderboard economy silently disagrees with its own spec.
- **F3 · P2 — Baton parity gap: Steal, Correct and End do not exist on the phone.** The commander set is Skip / Correct / Steal / Redo / End (`ContextualControls.tsx:222-231`), but the baton routes VOCAB_BLITZ through the shared MEMORY_LAB/CLASS_RALLY case — only Skip and Redo (`TeacherRemote.tsx:598-609`). The steal — this game's marquee comeback mechanic — is unreachable from the handheld remote the teacher actually holds during class. (Same class of gap as the historical dead-button audit items; the FOCUS_CARDS v3 pass just fixed its equivalent.)
- **F4 · P2 — The bet itself has no remote path.** The 1×/2× buttons exist only on the projected board (`:633-648`); neither commander nor baton can place or lock a bet. Under the classroom model the confidence ritual should at minimum have commander/baton triggers (BET 1× / BET 2×) so the teacher can drive it, and a visible "locked" state once F1 lands.
- **F5 · P2 — The "adaptive timer" is gone and nothing is configurable: hardcoded 15s, `data` prop never read.** `QUESTION_TIME_LIMIT = 15` (`:50-51`); the header's "adaptive timer (15s recognition, 25s production)" (`:5-6`) is stale — the 25s tier was removed with the MCQ-only pool. SPELLING_BEE demonstrates the intended pattern (plan-block `timerSeconds` + PlanComposer select + clamp); Vocab Blitz has no per-class timer or question-count knob at all.
- **F6 · P3 — Retry-arming race leaks onto the next question.** The 800ms `setTimeout` that clears the wrong pick and sets `retryUsed` (`:376-379`) is a raw timeout, outside the cancellable `scheduleAdvance` funnel; a SKIP_ITEM or RESET_GAME inside that window advances/resets first, then the timer fires and marks the NEXT question `retryUsed = true` — halving its award and showing a false "Retry used (50% points)" chip. Route it through `advanceTimerRef` (the steal machinery already provides the cancellation).
- **F7 · P3 — Mark Correct is dead on the bet and feedback screens.** The guard `phase !== 'question'` returns early (`:473`), so the teacher's most-used rescue button no-ops exactly when the class is staring at a screen the teacher may want to skip past. Either let it force-resolve the bet (lock 1×, advance) or hide it contextually.
- **F8 · P3 — Modest projection sizing and a hard 2×2 grid.** Prompt `text-2xl`, options `text-xl`, timer digits `text-2xl`, retry chip `text-sm` (`:679-681,697,708`) — small for 5–8 m; the fixed `grid-cols-2` assumes 4 options (pools with 2–3 options get stretched rows); IMAGE_SELECT options are `aspect-square` + `object-cover` (`:709,727`), center-cropping vocab images.

**What already works well (context — don't re-litigate):** the steal machinery is genuinely well-engineered — a single cancellable advance funnel every path funnels through, clock freeze, NEW_TURN suppression while the steal lives, a latched one-steal-per-question rule, half-of-base via the ratio arg (no parallel scoring path), and MARK_CORRECT resolving an active steal at half price; the StrictMode-safe timer (pure decrement + guarded zero-dispatch, born from a real double-penalty bug); timeout-without-penalty pedagogy with the miss still feeding FSRS; `awardedRef` one-payment latch; per-objective question dedupe; `currentQIdx` continuity across turns (pool coverage without replays); and the explanation-carrying reveal beat.

## §4 ⬜ ChatGPT Co-Work quality audit

### 4.a UI & visual design
- **Disruptive full-screen bet modal halts game momentum (screenshot `32-vocab-blitz-idle.png`):** The current confidence bet is rendered as an isolated white dialog box ("How confident are you? 1x Bet / 2x Bet") that obliterates the entire game stage before every single question. In a game named "Vocab Blitz", forcing a full visual stop between items destroys the high-energy arcade tempo. The bet should feel like an exciting game-show power-up sequence at the start of a turn, with the locked multiplier remaining prominently pinned in the HUD.
- **Phase tag mismatch on board shell:** The top-left tag in the idle screenshot shows an amber "WARM-UP" badge, whereas §0 correctly identifies `VOCAB_BLITZ` as the marquee ASSESS flow type.
- **Modest typography and cramped 2×2 options grid (F8):** Options are set in `text-xl`, prompts in `text-2xl`, and retry badges in tiny `text-sm` (`:679-681,697`). On a 1080p projection screen viewed from 5–8 meters, these elements look like standard desktop web form controls rather than a thrilling arena quiz. Options should be massive, border-lit widescreen plates labeled with distinct badges (`A`, `B`, `C`, `D`).
- **Anemic timer presentation (F5):** The 15-second timer renders as a thin horizontal progress bar (`:683-690`). An assessment speed challenge needs an electric, high-visibility digital clock gauge with color-coded urgency (cyan $\rightarrow$ amber $\rightarrow$ flashing red at $\le 3$s) and acoustic tension cues.
- **Steal state needs dramatic visual takeover:** When a steal is triggered, the board needs an unmistakable arena siren overlay (*"🚨 STEAL ALERT! Steal the points!"*) to instantly capture the entire classroom's attention.

### 4.b Workflow & user flow (teacher's path: start → turns → end)
- **The Core Architectural Flaw: Bet re-asked before EVERY question instead of once per turn (F1, §2):**
  - In `advanceToNext()`, the code unconditionally calls `setPhase('bet'); setBet(1)` after every resolution (`:533-535`).
  - If a picked student plays a 3-question sprint, the teacher and student must tap through the "How confident are you?" gate three separate times. This creates frustrating stop-and-go pacing, exactly as the owner reported: *"when we are in a series of three questions, the system should ask only one time — not ask again on every question"*.
  - **The Fix:** Introduce a `betLockedRef` latch. At `NEW_TURN`, the student chooses their multiplier once (`1x Safe` vs. `2x Double or Nothing`). This bet locks for their entire question sprint (`advanceToNext` stays in `phase === 'question'`). The latch only resets when the next student is picked or the game is reset.
- **Severe baton parity gap: Steal, Correct, and End missing from phone remote (F3):**
  - On the teacher's desktop commander, controls include Skip, Correct, Steal, Redo, and End (`ContextualControls.tsx:222-231`).
  - On the handheld phone baton, `VOCAB_BLITZ` is lumped into the shared fallback case, providing **only Skip and Redo** (`TeacherRemote.tsx:598-609`)!
  - The Steal mechanic — the signature comeback feature of Vocab Blitz — is completely unreachable from the teacher's handheld remote! If a student misses and a steal opens, the teacher cannot trigger the steal without walking across the room to the computer. The baton remote must have a dedicated `STEAL` button, along with `MARK_CORRECT` and `END`.
- **Confidence bet lacks remote control triggers (F4):** The 1x/2x bet buttons exist purely on the projected board surface (`:633-648`). The teacher holding a phone remote cannot select or confirm the bet on behalf of a student calling out from their desk.
- **Dead `MARK_CORRECT` on bet screen (F7):** The override function exits early if `phase !== 'question'` (`:473`). If a teacher presses Correct while the bet modal is up, nothing happens. Pressing Correct on the bet screen should default-lock 1x and jump straight into the question.

### 4.c Pedagogical practice (ESL ages 6–12)
- **Metacognitive risk assessment as active learning:** Asking students to evaluate their own mastery (*"Do I know this well enough to bet 2x?"*) engages metacognitive monitoring. Locking the bet once per turn establishes high psychological investment for the entire 3-question sprint.
- **Formative assessment with low anxiety:** As an ASSESS-phase activity, Vocab Blitz evaluates vocabulary retrieval across mixed formats (definition matching, image identification, spelling cloze). Crucially, the **timeout-costs-nothing rule** protects slower EFL learners from negative scoring trauma, while logging the miss for FSRS spaced-repetition scheduling.
- **Classroom-wide alertness via the Steal mechanic:** In traditional one-student-at-a-time quizzes, non-picked students tune out. The Steal mechanic (unlocked only after a student exhausts their retry or times out) keeps every student on the edge of their seat, ready to jump in and claim half-points.
- **50% Second-Chance Retry:** Allowing a single retry at 50% value (`retryUsed`, `:374-379`) encourages self-monitoring and error correction rather than immediate penalization.

### 4.d Game interaction (mechanic, pacing, fairness, fun)
- **True "Blitz" rhythm:** With the bet locked upfront, questions should fire in rapid succession with punchy 900ms win holds, giving students an exhilarating 45-second sprint.
- **Leaderboard economy calibration (F2):** Currently, the 2x multiplier applies *after* the unified scoring cap (`basePoints * bet`, `:331`), allowing single-question payouts up to 10 points (5-streak base 5 $\times 2 = 10$). While high-rolling 10-point bursts are thrilling in an arcade ASSESS game, the economy model must explicitly sanction this tier (or clamp it to a maximum of 6–8 points) to prevent runaway score inflation.
- **Steal balance:** Steals award 50% of base points with zero mistake penalties for the stealer (`:398-423`), which perfectly incentivizes peer rescue without risk.

### 4.e Top-5 prioritized recommendations
1. **P1 — Lock Confidence Bet Once Per Turn Across the Question Sprint (F1, §2):** Ask "1x Safe vs. 2x Double" once at `NEW_TURN`. Maintain the locked bet across all questions in the student's turn and reset only when a new student is picked.
2. **P1 — Close the Baton Remote Parity Gap (Add Steal, Bet 1x/2x, Correct) (F3, F4):** Add dedicated `STEAL`, `BET_1X`, `BET_2X`, and `MARK_CORRECT` actions to `TeacherRemote.tsx:598-609` so teachers can run the game entirely from their phone.
3. **P2 — Harmonize 2x Bet Economy with Unified Scoring Model (F2):** Align the double-or-nothing payout curve with documented leaderboard rules, capping maximum single-turn score spikes at 6–8 points.
4. **P2 — Overhaul UI into a Widescreen Arena Quiz (4.a, F8):** Enlarge option cards into widescreen touchplates with clear `A/B/C/D` badges, replace the thin line with a bold stadium countdown clock, and display the active multiplier badge in the top HUD.
5. **P3 — Fix Dead `MARK_CORRECT` on Bet Screen & Guard Against Retry State Leakage (F6, F7):** Ensure `MARK_CORRECT` auto-advances the bet phase, and route the retry timeout through `advanceTimerRef` to prevent 50% penalties from bleeding into subsequent questions.

### 4.f Design direction for Stitch
- **Mood and visual theme:** "High-Stakes Cyber Game Show" / "Neon Quiz Arena". Deep midnight obsidian background (`#0A0E27`), neon electric orange for 2x High-Roller multipliers (`#FF6B00`), vibrant laser cyan for 1x Safe Play (`#00F0FF`), glowing emerald for correct hits (`#10B981`), and flashing siren scarlet for Steals (`#EF4444`).
- **Mock up these four screens/states (16:9 projector, no scrolling):**
  1. **Screen 1 — Turn Start: The Confidence Gate (Once Per Turn):**
     - Top HUD: `[⚡ Alice's Turn — Choose Your Stakes!]` + Question preview: `[3-Question Sprint]`.
     - Center Stage: Two massive, glowing arcade choice pods:
       - Left Pod (`1x SAFE PLAY`): Cyan border, description: `"+1x Standard Points · Normal -1 Penalty"`.
       - Right Pod (`2x HIGH ROLLER`): Blazing orange neon border with lightning effects, description: `"🔥 DOUBLE POINTS · DOUBLE PENALTY!"`.
  2. **Screen 2 — Active Blitz Sprint (Locked 2x Multiplier):**
     - Top HUD: Picked challenger badge `[Alice]` + pinned glowing orange badge: `[🔥 2X MULTIPLIER ACTIVE]` + prominent circular 15s stadium countdown gauge (`9s`).
     - Center Stage: Prompt plate displaying target sentence/word (`"TRACTOR"`).
     - Bottom: 4 widescreen, border-lit option plates (`A`, `B`, `C`, `D`) with bold typography.
     - Right rail: Compact live leaderboard.
  3. **Screen 3 — Steal Opportunity State ("STEAL ALERT!"):**
     - Alice has missed twice or timed out.
     - Screen flashes with red/amber emergency beacon lighting: *"🚨 STEAL ALERT! Who can steal the points?"*.
     - Quick-spin wheel indicator prompting the teacher to pick a stealer.
  4. **Screen 4 — Sprint Summary Celebration:**
     - Celebration card: *"Alice's Blitz Complete!"*, 3/3 correct, `🔥 2x Multiplier Bonus Applied`, total points splash (`+12 Points!`), and auto-advance timer for next student.
- **What to KEEP from current design:** The StrictMode-safe timer, timeout-costs-nothing fairness rule, cancellable advance funnel with NEW_TURN suppression during steals, and per-objective pool deduplication.

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

## §6 ⬜ Stitch output & implementation notes

*(Owner drops the Stitch export into `stitch/<NN>-<game>/`; ZCode records implementation + deploy.)*
