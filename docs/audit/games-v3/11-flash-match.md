# Flash Match — v3 Quality Audit (`FLASH_MATCH`)

> **Status:** **file-ready** — §0–§3 audited (agent-parallel 2026-09-10) + §2 confirmed + screenshots captured. Ready for Anti-Gravity §4.
> **Screenshots:** `screenshots/11-flash-match-idle.png`.

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

- **Flow type:** `FLASH_MATCH`
- **Component:** `apps/board/templates/BoardFlashMatch.tsx`
- **Phase:** PRACTICE (reads `activeSlideData.phase`, falls back to PRACTICE)
- **Remote-control group:** custom set — Skip (`SKIP_PAIR`) / Hint (`REVEAL_HINT`) / Correct (`MARK_CORRECT`) / Next Round (`NEXT_ROUND`) / End (`SLIDE_COMPLETE`), plus `RESET_GAME`. Emitted from `apps/teacher/live/panels/ContextualControls.tsx:142-151` + `apps/remote/TeacherRemote.tsx:470-489`.
- **Data sources:** `useEscalatingPool` — `SHELL_CAPABILITIES.FLASH_MATCH` consumes `IMAGE_SELECT` / `MEANING_MATCH` / `AUDIO_L1_SELECT` (rungRange [1,3]); `TOTAL_ROUNDS = 4`, `MAX_PAIRS = 6`; frozen slide `data.pairs` fallback only when the pool yields nothing.
- **Mode:** picked student (`quickWheelWinner`); per-pair adaptation of the 4 must-dos (mistake/award latches keyed by pair id).

## §1 How the game works today

**Board.** Two columns and a center connector: **left** = prompts (an English word as a text tile, or a "Tap to hear" audio tile for AUDIO_L1_SELECT), **right** = answers (an image tile for IMAGE_SELECT, or a text tile carrying the Chinese meaning). Up to 6 pairs per round (`MAX_PAIRS`), 4 rounds (`TOTAL_ROUNDS`), header shows "Round N/4 — Match word pairs" + a matched counter + progress bar.

**Content.** Pool items are normalized into pairs (`normalizeToMatchPair`, `:43-82`): IMAGE_SELECT → word ↔ `options[correct_index].image_url`; MEANING_MATCH → word ↔ the correct Chinese meaning; AUDIO_L1_SELECT → audio ↔ the Chinese meaning. Selection dedupes by objective (first item wins) and caps at 6 (`:129-143`); pool content always wins over the frozen legacy `data.pairs` (pool-coverage fix). The right column is shuffled with a turn-seeded RNG so every tab lays the tiles out identically (`:172-175`).

**Play.** Tap a left tile (audio tiles play on tap), then a right tile — or the reverse order; when one of each is selected, `handleMatch` validates the pair. **Correct:** both tiles lock emerald, streak +1, award = `scoreForAttempt(per-pair mistakes, difficulty, streak)` (floor 1, cap 5), dual-write (`addPoints` + recordAttempt + `gradeObjective` FSRS), correct cue; streaks 3/5 add confetti. **Wrong:** shake + live −1 + remediation tracking; 1st miss auto-glows the correct right tile (narrowed hint); 2nd miss shows the pair on a white micro-explanation card (~3 s). Matching all pairs completes the round → "Round N Complete!" overlay that **auto-advances after 900 ms** (click to skip); round 4 completion → "nailed it" celebration + `SLIDE_COMPLETE` broadcast (auto-dismisses after 6 s).

**Controls.** Commander (`ContextualControls.tsx:142-151`) and remote (`TeacherRemote.tsx:470-489`): Skip (locks the selected left pair + its true mate without penalty), Hint (glow the correct right tile for the selected left), Correct (force-match the first unmatched pair, full award + streak), Next Round, End; RESET_GAME rebuilds the board (and bumps `resetCount`, re-seeding the deal).

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> The first is the UI: some part of the screen UI is invisible, so we cannot see the bottom question. Also, it looks like we have a bunch of images to connect with the vocabulary words, so a better use of the screen space would be better. We need to keep in mind it's a horizontal screen. / Another issue: I have a few images — a fox, a rhino, a frog, a giraffe. But if I click "toucan" and click on the fox, it says "correct". When I click "frog" and click on the rhino, it also says "correct". So there is a big issue there — we need to find out what the issue is (wrong image/word pairs are being accepted as correct).

**Clarified with the owner (2026-09-09):**
- Responsive bug: part of the UI (the bottom question) is INVISIBLE — off-screen/clipped; layout must work on horizontal screens.
- Better use of horizontal space for the image/word matching board.
- Wrong-pair bug CONFIRMED as real validation failure: the board LOCKED the wrong pair as matched (toucan→fox locked as a correct match) — root-cause in the code audit (pairing key or correct-index mapping).

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardFlashMatch.tsx` unless noted.

- **F1 · P1 — Wrong pairs accepted and locked as correct (§2 bug #2, root-caused).** `handleMatch`'s correctness test is `pairId === pair.id && rightItem.pairId === pair.id` (`:341`), where `pair = matchPairs.find(p => p.id === pairId)` (`:336`) — the first clause is a **tautology** (the pair was found *by that id*), so the whole test reduces to `rightItem.pairId === pairId`. The killer: `handleRightClick` passes the **clicked right tile's own pairId** into that argument (`:430`: `handleMatch(item!.pairId, selectedLeft, id)`) — the validation compares the right tile against **itself** and is always true. Selecting any left tile, then any right tile, locks as "correct": exactly the owner's "click toucan → click fox → says correct". The reverse order (right tile first, then left) routes through `handleLeftClick` (`:421`), which passes the **left** tile's pairId — there the reduced test is the real check, so the bug is click-order-dependent and feels random in class. Blast radius: wrong tiles lock (`:348-349`); points, streak and the FSRS write post to the **right tile's objective** (`:352` → `doDualWrite :309-332`) while the left word's objective is never credited; `matchedCount` inflates so rounds/slide complete on garbage (`:359-369`); and the wrong-branch teaching ladder (auto-hint `:388-396`, micro-explanation `:397-403`) almost never fires because left-first clicks cannot be wrong. Note `MARK_CORRECT` (`:246-253`) and `SKIP_PAIR` (`:216-228`) call `handleMatch` with the left pair's id + the true right tile, so they behave correctly — the fix is to validate `leftItem.pairId === rightItem.pairId` (or always derive the pair from the left tile), not to touch the callers that already pass a left-derived id.
- **F2 · P2 — Bottom rows of the board are invisible (§2 bug #1).** The two tile columns are fixed `flex flex-col gap-4` lists at `w-[45%]` (`:486`, `:512`); at `MAX_PAIRS = 6` each column needs ~600 px+ of height, but the stage is `flex-1 overflow-hidden` (`apps/board/BoardShell.tsx:122`), FLASH_MATCH is **not** in `FULL_BLEED_TYPES` (`BoardShell.tsx:41`) so the 240 px leaderboard rail and `pr-[280px]` footer reserve (`:187`) eat the width/height budget — the last 1–2 tile rows render below the fold and are hard-clipped (no overflow scroll, no grid reflow, no responsive floor). This is the owner's "part of the UI is invisible / cannot see the bottom question": on a 16:9 projector the bottom of both columns simply doesn't exist.
- **F3 · P2 — Mid-round rebuilds wipe progress.** `useEffect(() => { if (matchPairs.length > 0) rebuild(); }, [rebuild])` (`:190`) fires whenever `matchPairs` changes identity — pool re-fetches (roster changes, async class-weak/SRS states landing) rebuild the board and erase matched pairs mid-round.
- **F4 · P2 — Rounds 2–4 can replay the identical board.** `TOTAL_ROUNDS = 4`, but a unit with ≤6 pool objectives re-serves the same pairs every round (coverage ledger wraps), and the right-column shuffle is seeded `makeRng(seedBase, currentTurnId, 'right')` (`:172-175`) where `seedBase` has **no roundIndex** (`store/SessionContext.tsx:2038-2047`) — identical right-column order each round. Repeat rounds read as "the game glitched and reset".
- **F5 · P3 — Skip and Hint need a selected left tile** (`:217`, `:232`) — pressed cold they do nothing (dead-feeling buttons, no toast, no fallback to the first unmatched pair).
- **F6 · P3 — MARK_CORRECT force-matches the FIRST unmatched pair** (`:246-248`) with a full award + streak — not necessarily the pair the kid actually answered orally; attribution drifts when several tiles are open.
- **F7 · P3 — Center-connector ticks are positional.** `i < matchedCount ? '✓' : '→'` (`:503-509`) fills checkmarks top-down regardless of *which* pair matched — a cosmetic lie about progress.
- **F8 · P3 — Task statement and tiles under-sized.** The only task text is the header sub-line "Match word pairs" at `text-sm` (`:463`); image tiles render at `w-16 h-16` (64 px, `:524`) — hard to identify from 5–8 m even when visible. `MIN_PAIRS` (`:88`) is a dead constant, never used.
- **F9 · P3 — Chinese meaning tiles sit on the challenge surface** (MEANING_MATCH/AUDIO_L1_SELECT right tiles, `:56-60`, `:75-77`) — defensible for meaning-matching, but the v3 English-first pass should confirm L1 only appears where it IS the tested content.

**What already works well (context — don't re-litigate):** per-pair mistake latches + duplicate-award guard (`:344-345`); objective dedupe + pool-first over frozen legacy data (`:129-143`); the 1st-miss narrowed hint → 2nd-miss micro-explanation teaching ladder (when validation actually fails); seeded cross-tab right-column shuffles; dual-write + FSRS + remediation on every event; the 900 ms round auto-advance (exactly the dead-time pattern LISTEN_TAP is missing).

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
