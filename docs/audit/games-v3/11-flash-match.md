# Flash Match — v3 Quality Audit (`FLASH_MATCH`)

> **Status:** **stitch-in-flight (wave 1)** — §4 audited (Anti-Gravity). Ready for Stitch prompt §5.
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

## §4 ChatGPT Co-Work quality audit

> **Co-Work: write your findings ONLY inside this section.** (Full instructions + shared prelude embedded at `file-ready`.)

### 4.a UI & visual design

- **P1 — Off-screen clipping of bottom tiles (The Invisible Pairs).** **Evidence:** `screenshots/11-flash-match-idle.png`, §2 owner comment, and §3 F2 (`BoardFlashMatch.tsx:486, 512`). On a standard 16:9 projector, the board renders two vertical flex columns of 6 items (`gap-4`) inside an `overflow-hidden` container. Because the 240px leaderboard rail squishes horizontal width and `pr-[280px]` offsets the layout, the vertical budget is severely truncated. As clearly shown in the live capture, **only 3.5 rows are visible**; rows 5 and 6 ("apple", "tractor", "rock", "garden" shown; remaining 2 words completely cut off) render below the viewport. One-third of the active learning objectives are physically inaccessible to the teacher and students.
  *Recommendation:* Redesign the board using the owner's horizontal mandate: replace the two tall vertical lists with a 2-column or 3×2 matching grid of landscape cards (~4:3 aspect ratio), ensuring zero vertical clipping at all projector resolutions and scaling gracefully down to phone-landscape (~700×320).

- **P1 — Sub-thumbnail imagery inside giant, barren pill buttons.** **Evidence:** `screenshots/11-flash-match-idle.png` and §3 F8 (`BoardFlashMatch.tsx:524`). The answer tiles on the right are wide rectangular bars (`w-[45%]`), but the image inside is constrained to an infinitesimal `w-16 h-16` (64×64px) square floating in empty dark space. From 5–8 meters back in a bright classroom, children cannot distinguish detailed visual features (e.g. telling a fox from a cat, or discerning the landscape photo shown in tile 4). The design wastes 85% of each tile's surface area.
  *Recommendation:* Make the image the hero of the right-hand card. In a landscape card format, the image should occupy at least 60–75% of the card area (minimum 160×120px on 1080p projection), giving students clear, unambiguous visual cues.

- **P2 — Top-left chrome collision with BoardShell phase pill.** **Evidence:** `screenshots/11-flash-match-idle.png`. The `BoardShell` system component injects an absolute-positioned `• WARM-UP` badge at `top-5 left-6`. In `BoardFlashMatch.tsx`, the game header card sits directly underneath, causing the yellow dot and "WARM-UP" text to collide with the top border of the "Flash Match" title banner.
  *Recommendation:* Indent the game header to `left-24` or pad `pt-16` across the board stage to provide an unobstructed safe zone for all global chrome badges.

- **P2 — Misleading positional connector column.** **Evidence:** `screenshots/11-flash-match-idle.png` and §3 F7 (`BoardFlashMatch.tsx:503-509`). The central column between the left and right tiles renders static gray arrows (`→`) that swap to green checkmarks (`✓`) strictly from top to bottom based on `i < matchedCount`. If a student matches pair #4 first, row #1's arrow turns into a checkmark! This cosmetic lie contradicts what the children just solved and causes cognitive dissonance.
  *Recommendation:* Remove the central positional arrows entirely. Represent connection through synchronized tile states: when Left #3 is tapped, it pulses electric blue; when Right #3 is tapped to complete the match, both tiles animate into emerald lock together, accompanied by a dynamic SVG connection beam or matching color glow.

- **P2 — Leaderboard rail consumes 25% of the canvas in Choral/Warm-up.** **Evidence:** `screenshots/11-flash-match-idle.png` and `_CROSS-CUTTING.md` §3. The screenshot shows all 8 students with 0 points on the right rail while the game runs in "Whole class — choral round" mode. This static rail deprives the matching canvas of critical width needed for larger cards.
  *Recommendation:* When `quickWheelWinner` is null (choral mode), retract the leaderboard rail to give Flash Match full 16:9 canvas bleed.

### 4.b Workflow & user flow (teacher's path: start → turns → end)

- **P1 — Tautological validation bug accepts and locks ANY pairing (§2 Bug #2).** **Evidence:** §2 owner comments and §3 F1 (`BoardFlashMatch.tsx:336-341, 430`). In `handleMatch`, the check `pairId === pair.id && rightItem.pairId === pair.id` is fundamentally broken when clicking Left-then-Right because `handleRightClick` passes `item!.pairId` as `pairId`. The comparison tests `rightItem.pairId === rightItem.pairId`, which is ALWAYS TRUE. Any word matches any picture: "toucan" locks with "fox", "frog" locks with "rhino".
  *Blast Radius:* Invalid pairings lock emerald; points, streak bonuses, and spaced-repetition FSRS writes post to the right tile's objective while the left word is never credited; and the entire remediation ladder (hint / micro-explanation) is dead code.
  *Recommendation:* Refactor `handleMatch` to compare the two selected entities directly: `leftItem.pairId === rightItem.pairId`. Ensure validation is symmetric regardless of whether the teacher/child taps the left or right tile first.

- **P2 — Pool re-fetches trigger mid-round rebuilds and erase active progress.** **Evidence:** §3 F3 (`BoardFlashMatch.tsx:190`). A reactive `useEffect` triggers `rebuild()` whenever `matchPairs` reference changes. If student progress or roster data syncs asynchronously over Supabase Realtime mid-game, the entire board resets, clearing already-matched pairs and frustrating the student.
  *Recommendation:* Decouple pool updates from the active round. Once a round deals its pairs, lock the active state; only allow pool changes to apply when `currentTurnId` changes or when the round formally advances.

- **P2 — Remote and Commander Hint/Skip controls fail when pressed cold.** **Evidence:** §3 F5 (`BoardFlashMatch.tsx:217, 232`). If a teacher presses `HINT` or `SKIP` on the handheld Remote Baton or Commander without first having tapped a tile on the board, the handler silently aborts (`if (!selectedLeft) return;`). The buttons feel dead. In a live classroom where the teacher stands among the desks holding a phone, they cannot assist a stuck child without physically walking to the board.
  *Recommendation:* Add sensible fallbacks: if no left tile is selected, `HINT` should highlight the first unmatched left tile and its corresponding mate; `SKIP` should cleanly auto-match the first unmatched pair without score penalty and display an amber pass badge.

- **P2 — `MARK_CORRECT` forces match on wrong pair.** **Evidence:** §3 F6 (`BoardFlashMatch.tsx:246-248`). When the teacher taps `MARK_CORRECT` on the remote (because a child verbally said "garden is the park photo"), the code unconditionally matches the *first unmatched pair* in array order (e.g. "apple"), regardless of what the child solved.
  *Recommendation:* If a tile is currently selected on the board, `MARK_CORRECT` must complete *that* selected item's true pair. If nothing is selected, display a quick prompt or match the first pair with an explicit visual callout.

- **P3 — Repetitive boards across Rounds 2–4.** **Evidence:** §3 F4 (`BoardFlashMatch.tsx:172-175`). In units with 6 or fewer vocabulary items, rounds 2, 3, and 4 re-serve identical pairs in the exact same right-column shuffle order because `seedBase` omits `roundIndex`. The game feels like a broken loop.
  *Recommendation:* Incorporate `roundIndex` into the shuffle seed (`makeRng(seedBase + roundIndex, currentTurnId, 'right')`) and vary the presentation (e.g. alternating between Word ↔ Image and Audio ↔ Image).

### 4.c Pedagogical practice (ESL ages 6–12)

- **P1 — Direct Semantic-Visual Association vs. Translation Crutches.** **Evidence:** §1 and §3 F9 (`BoardFlashMatch.tsx:56-60, 75-77`). In ESL instruction for ages 6–12, pairing an English word directly with an authentic photograph (`IMAGE_SELECT`) builds direct lexical-semantic neural pathways without the cognitive detour of translation. While Chinese text is currently rendered for `MEANING_MATCH`, the v3 English-first rule dictates avoiding L1 on challenge surfaces whenever pictorial representation is possible.
  *Recommendation:* Prioritize high-quality image pairs (`IMAGE_SELECT`) for vocabulary units. Restrict Chinese meaning text strictly to abstract grammatical terms where no clear visual representation exists.

- **P2 — Revitalize the Two-Miss Remediation Ladder.** **Evidence:** `BoardFlashMatch.tsx:388-403`. The existing code architecture contains a brilliant pedagogical remediation flow:
  1. *First Miss:* Triggers a crimson card shake, plays an error sound, deducts 1 live point, and applies a gentle golden glow to the correct matching mate (scaffolding recall).
  2. *Second Miss:* Automatically pauses the board, displays a clean micro-explanation card with the word and image together for 3 seconds, and locks the pair.
  Because of the F1 validation bug, this entire scaffold has been dormant. Fixing F1 will instantly restore this rich learning loop.

- **P3 — Immediate Audio Reinforcement on Correct Match.** In oral ESL classes, visual matching must always be accompanied by phonological reinforcement. Currently, audio only plays on tile tap for `AUDIO_L1_SELECT`.
  *Recommendation:* Whenever ANY pair is successfully matched (whether word-to-image or word-to-word), trigger an immediate, crisp TTS/audio playback of the target English word. This cements the auditory form alongside the visual match.

### 4.d Game interaction (mechanic, pacing, fairness, fun)

- **P2 — Tactile Arcade Feedback and Card Physics.** Matching tiles in live classrooms should feel exciting and tactile.
  - *Unselected:* Sleek dark-slate card with subtle border glow.
  - *Selected:* High-voltage electric-blue ring with a soft floating elevation effect.
  - *Matched:* Synchronized emerald pulse, a satisfying chime, confetti burst at streaks 3 & 5, and the cards locking in an elegant dimmed-complete state.
  - *Mismatch:* 400ms crimson vibration with a soft "bonk" sound, immediately resetting the selection ring so the child can try again without awkward delays.

- **P2 — Calibrated Cognitive Load (4 vs 6 Pairs).** On a 16:9 projection screen viewed from across a classroom, scanning 6 words against 6 images creates visual clutter. For younger students (ages 6–8, Beginner/A1), 4 pairs (a 2×2 or 4-pair layout) provides optimal focus and rapid turn completion. For older students (9–12), 6 pairs in a clean 3×2 grid works well.
  *Recommendation:* Make pair count responsive to unit difficulty rung: 4 pairs for difficulty 1, 6 pairs for difficulty 2/3.

- **P3 — Preserve the 900ms Round Auto-Advance.** **Evidence:** §1 and §3 "What already works well". Flash Match automatically advances to the next round 900ms after the final pair is matched. This zero-click transition is praised in class because it maintains lesson flow, contrasting sharply with games that force dead clicks. Retain this mechanic.

### 4.e Top-5 prioritized recommendations

1. **P1 — Fix the Tautology Validation Bug (`handleMatch`):** Replace the broken right-item self-comparison with a strict `leftItem.pairId === rightItem.pairId` check so wrong matches are properly rejected and scored.
2. **P1 — Rebuild Board Layout to Eliminate Bottom Clipping:** Replace the vertical flex list with a horizontal-first 2-column or 3×2 matching grid; ensure all tiles are 100% visible on 16:9 displays without scrolling.
3. **P1 — Enlarge Image Size from 64px to Hero Status:** Expand image display within matching cards (minimum 160×120px) so visual content is instantly recognizable from 8 meters away.
4. **P2 — Add Cold-Button Remote/Commander Fallbacks for Hint and Skip:** Allow the teacher to trigger hints and skips from the handheld remote without requiring an active left-tile board selection.
5. **P2 — Audio Pronunciation on Every Match:** Auto-play native English pronunciation immediately upon every successful pair match to reinforce phonetic memory.

### 4.f Design direction for Stitch (style/mood guidance + the 3–5 key screens/states to design; what to KEEP from the current design)

**Mood and visual system.** Design this as a high-tech, kinetic "Arcade Circuit / Cyber Lab". Deep midnight navy background (`#0B1120`), glowing electric blue (`#38BDF8`) for active selections, neon emerald (`#10B981`) for locked matches, vibrant coral (`#F43F5E`) for error shakes, and warm arcade gold (`#FBBF24`) for streak counters. Cards should feel like substantial physical tablets with rounded corners, subtle glassmorphic gradients, and crisp high-contrast typography.

**Mock up these four board screens/states (16:9 projector, no scrolling):**

1. **Screen 1 — Idle / Fresh Deal (Round 1 of 4):**
   - Header: "Flash Match · Round 1/4 · Match the words to the pictures" with a sleek matched pill `0 / 6` and Alice's avatar badge ("Alice's Turn").
   - Main Stage: Two balanced columns. Left column: 6 English word cards (e.g. "TIGER", "TOUCAN", "GIRAFFE", etc.) styled as bold interactive buttons. Right column: 6 shuffled landscape photo cards (~4:3 aspect ratio, clear animals).
   - Safe margin top-left clearing the `• PRACTICE` badge.

2. **Screen 2 — Active Selection & Connection:**
   - Left card "TOUCAN" is selected: surrounded by an electric-blue pulsing neon ring.
   - Right card with Toucan photo is hovered/tapped: glowing connection path links the two cards across the center stage.

3. **Screen 3 — Emerald Match Lock & Streak Celebration:**
   - Word "TOUCAN" and the matching photo card both lock with an emerald-green border and a glowing checkmark badge.
   - A floating score pill toasts "+1 Point! 🔥 Streak 3!" with subtle particle confetti.
   - Matched counter updates to `1 / 6`.

4. **Screen 4 — Remediation Scaffold (Second Miss Micro-Explanation):**
   - Background tiles dimmed slightly.
   - Center modal card: "Let's Check! 💡", showing the word "GIRAFFE" alongside its authentic photo, with an audio soundwave icon and a 2.5s auto-dismiss progress bar.

**What to KEEP from current design.** Retain the dual-write scoring (`addPoints` + `recordAttempt` + FSRS), per-pair mistake latching, seeded right-column shuffling across tabs, and the snappy 900ms auto-advance between rounds.

## §5 ✅ Google Stitch prompt — RETURNED

*(ZCode writes this AFTER §4 is filled.)*

**§5 STITCH-RETURNED + QA 2026-09-10** — exported `stitch/11-flash-match/{1-fresh-deal,2-connection}.{png,html}`. QA verdict: **#1 FAILED the gate — REVISION SUBMITTED** (it reproduced the owner's core complaint: 6th row clipped by the bottom bar, square photos, decorative clutter). `edit_screens` correction (session 8223030384017350829): compress header/footer, 6 rows fully visible, LANDSCAPE 3:2 photo tiles, strip teacher-panel clutter. **#2 connection screen: PASS** (HTML clean, electric connection path, selection states). Implementation of this game waits for the revised #1 to land + re-export.

*(history: submitted 2026-09-10 via Stitch CLI into project 17415096891547227013.)*
## §6 ⬜ Stitch output & implementation notes

*(Owner drops the Stitch export into `stitch/<NN>-<game>/`; ZCode records implementation + deploy.)*
