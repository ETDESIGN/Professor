# Word Search — v3 Quality Audit (`WORD_SEARCH`)

> **Status:** `pending` → `file-ready` → `cowork-done` → `stitch-prompt-ready` → `stitch-returned` → `implemented`
> **Current status:** **implemented** — Stitch v3 design shipped to production 2026-09-10 (see §6).
> **Pilot:** **YES — this game validates the whole v3 loop**
> **Screenshots (captured 2026-09-09 from the live board, 1279×719 @2x unless noted):**
> - `26-preview.png` — round preview (title, 5 clue cards, Start Round)
> - `26-play.png` — play stage **as it actually renders: the letter grid is missing** (finding F0)
> - `26-bug-grid-invisible-at-1280plus.png` — same at 1280×720 (the commander's projector-popup size)
> - `26-summary.png` — round-complete modal (stats + time bonus)
> - `26-round2-revealed.png` — round 2 after teacher reveals
> - `26-final.png` — final stars screen
> - **Not capturable:** the found-word pill/toast and the "Who found it?" credit picker — they require tapping the grid, which is invisible (F0). Placeholder fixture images are picsum photos (real unit images differ); names are fixture kids.

---

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

- **Flow type:** `WORD_SEARCH` (no aliases)
- **Component:** `apps/board/templates/BoardWordSearch.tsx` (1,074 lines) + pure engines `wordSearch/gridEngine.ts` (268) and `wordSearch/content.ts` (189)
- **Phase:** PRACTICE (pool-driven)
- **Remote-control group:** custom set in `ContextualControls.tsx` `case 'WORD_SEARCH'` — **Timer · +30s · Clue · Correct · Reveal · Skip · Redo · End** (no "Next Round" button — see finding F2)
- **Data sources:** `useEscalatingPool` (IMAGE_SELECT + MEANING_MATCH merged per objective) → `vocabulary_items` via unit manifest (de-facto primary: most production pools are empty) → frozen `data.words`
- **Modes:** `open` (default — hands up, teacher taps board) · `collaborative` (wheel-picked student taps) · `relay` (team indicator alternates per found word)
- **Default config from PlanComposer:** 3 rounds · 3–5 words/round · 120 s timer · mode `open`

## §1 How the game works today

**Setup.** The teacher inserts Word Search from the PlanComposer library ("hidden-word grid hunt"). Words come live from the unit's pool/vocabulary at runtime — nothing is frozen except the game settings. The board is an 8×8→10×10 letter grid (sized to the longest word, capped at 10) with 3–5 unit words hidden in it.

**Round loop (3 rounds by default):**

1. **Preview** — "ROUND n/3 — find these 5 words": clue cards for the round's words are shown big in the center with a pink **Start Round** button. In round 1 the English word is visible on each card; from round 2 the cards get harder (see escalation below).
2. **Play** — the grid center-flanked by the clue cards (3 left, 2 right). A timer bar counts down (120 s default; sky-blue → rose-red at ≤20%). Selection works two ways: **drag** from first to last letter (with forgiving off-axis snapping to the nearest of 8 directions), or **tap first letter, tap last letter** ("tap the last letter of the word…" hint floats at the bottom while anchored).
   - A correct selection locks the word: emerald pill over the letters, ✓ badge on its clue card, the word is spoken aloud, and the finder gets points (see scoring).
   - A wrong selection of ≥3 letters is a *miss*: grid shakes, −1 point to the picked responder (if any), streak resets. 2-letter taps are ignored as noise; re-selecting an already-found word is a silent no-op.
3. **Summary** — when every word is found, a white modal covers the board: COMPLETE! with 4 stat tiles (words found / time / misses / clues) and, if the round was beaten with time left, a **⚡ Time bonus +1..3 → last finder** banner. Button: **Next Round** (or **See Results** on the last one).
4. **Final** — "THE END", 1–5 stars pop in sequence (based on totals across all rounds: 5★ = all words, ≤1 miss, zero clues), class result line ("14/15 words found · 3 misses · 2 clues"), **Play Again** (same words, new grid) / **Next Slide →**.

**Escalation across rounds:** r1 = clue cards show the English word; words placed only → and ↓. r2 = clue cards hide the word (image mode: picture only; text mode: Chinese meaning only, "tap for English"); 6 directions; filler letters biased toward the words' own letters (decoys). r3 = all 8 directions.

**The three modes:**
- **OPEN (default):** no picked responder. Kids raise hands and *tell* the teacher; the teacher taps the word's first+last letter **on the board tab itself**, which locks the word and opens a **"Who found it?"** roster overlay (avatar chips) to credit the finder — or "No credit". The header chip reads "✋ Hands up — tell the teacher".
- **COLLABORATIVE:** the wheel picks a student ("🎯 <name> is searching") who comes to the board and taps; found words auto-score to them; their misses cost −1.
- **RELAY:** like open/collaborative play but a team banner ("🔴 Red's turn") alternates on every found word (teams come from the sidebar team builder; needs ≥2 teams).

**Scoring wiring.** Found word → `scoreForAttempt(mistakes, difficulty)` (1–3 base, streak bonus at 3/5, cap 5) → halved (min 1) if a Clue was used on that word → `addPoints` + analytics write + FSRS grade (pool words only; fallback `vocab:` ids skip FSRS). Time bonus at round end (+3 if ≥66% time left, +2 ≥33%, else +1) goes to the round-closing finder. Revealed words (teacher Reveal) lock grey, no points.

**Teacher controls (Commander buttons):** **Timer** (play/pause) · **+30s** · **Clue** (rings a random unfound word's first letter for 3.5 s; that word's award is permanently halved, min 1) · **Correct** (locks the first unfound word as if found, credited to the wheel pick or opening the picker) · **Reveal** (locks the first unfound word with no points and speaks it) · **Skip** (abandon round → next; from the last summary ends the slide) · **Redo** (full reset, round 1, new grid) · **End**. The board itself also renders Start Round / Next Round / Play Again / Clue / Reveal-a-word / timer buttons on-screen (the teacher can drive it from the projector machine if it's touch/accessible).

**Empty state:** if the unit has no vocabulary at all, a dark "Word Search — This unit has no vocabulary words yet…" screen with a Skip Slide button.

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> **#23 — Word Search: UI rendering issue — big empty space in the middle on live board.** "I think there is a UI rendering issue when I see it on the live board: I see three cards on one side of the screen, two cards on the other side, and in the middle a big empty space. I believe there was something there (in the middle), and we need to review and understand what the issue is."

**Clarified with the owner (2026-09-09):**
- Confirmed this is exactly finding **F0 (P1)** — the letter grid renders 0–13 px (invisible) at every tested board size; the owner saw the symptom live (3 cards left, 2 right, empty middle).
- The play layout gets a ground-up rebuild in the Stitch redesign (this is the pilot game for the whole v3 loop).

## §3 ZCode code-level findings

Severity: **P1** = blocks learning / would stall a live lesson · **P2** = degrades the experience · **P3** = polish. Line refs are `apps/board/templates/BoardWordSearch.tsx` unless noted. F0 and F15 were **verified live on the board** during the 2026-09-09 screenshot session (throwaway fixture teacher/class/unit on the dev project).

- **F0 · P1 — The letter grid is INVISIBLE on the projector board (game unplayable).** Measured with Playwright on the real `/board` tab: the grid renders **0×0 at 1280×720 and 1920×1080**, and **13×13 px at 1279×719** — at every size the central play surface is effectively gone; only the header, clue-card flanks and HUD render (see `26-play.png`, `26-bug-grid-invisible-at-1280plus.png`). Two stacked layout causes: **(a)** at ≥1280 CSS px (Tailwind `xl`) the main row is `xl:flex-row` + `items-center` (`:794`), so the measuring wrapper (`flex-1 w-full`, `:804`) gets its height from content — but the grid is 0×0 *before* `boxPx` is measured, a chicken-and-egg deadlock (`useEffect` measure at `:492-503` keeps reading ~0); **(b)** below 1280 the stacked column gives the two horizontal clue-card rows their natural ~128 px each and the wrapper (flex-basis 0) only the leftover ~13 px. Note the commander's projector link opens exactly 1280×720 (`LiveCommander.tsx:219`) — popup chrome usually lands it just under 1280 → case (b), a 13 px grid. **The play layout needs a ground-up rebuild (this is the core Stitch task), not a patch.**
- **F1 · P2 — No "time's up" beat.** When the timer reaches 0:00 nothing happens: no banner, no sound, no state change (`:477-479` only stops the interval). The class stares at a frozen game; the only exits are Skip/Reveal/Clue. A timed pressure game needs its terminal moment (and a natural transition to reveal-what-was-left).
- **F2 · P2 — Commander has no "Next Round" button.** The board *listens* for `NEXT_ROUND` (`:635-638`) and the summary modal shows a big "Next Round" button — but the commander's WORD_SEARCH set (`ContextualControls.tsx:257-288`) has no Next; only **Skip**, which silently advances (`advanceRound(true)`), including from the summary. From the teacher's desk the natural "continue" action is mislabeled as punitive, and the *celebratory* advance path (`advanceRound(false)` → confetti on final) is unreachable from the commander. On the final summary, "Skip" ends the whole slide silently — likely a surprise.
- **F3 · P2 — Clue can halve points of words the teacher never meant to clue.** `giveClue` (`:573`) picks a **random** unfound word, rings its first letter for only **3.5 s** (`:506-510`), and **permanently** halves that word's award (`clueUsedRef`). Pressing Clue twice in a row can burn two different words to ½ pts; if the class is still scanning after 3.5 s, the ring is gone and a re-press may target a *different* word. The teacher cannot choose which word to clue.
- **F4 · P2 — Timer keeps running behind the open-mode credit picker.** Stage stays `play` while the "Who found it?" roster overlay is up (`:1006-1028`), so in the default open mode every found word bleeds clock while the teacher hunts the roster. Also true during the floating feedback toast moments.
- **F5 · P2 — Summary slams over the last word's celebration.** The round-complete effect (`:513-529`) fires the instant the final word locks, covering the emerald pill animation, the "+N" toast and the spoken word with the white modal. The most satisfying beat of the round is truncated to ~0 s.
- **F6 · P3 — Streak is global, not per-student.** `streakRef` (`:316`) counts consecutive found words regardless of who found them; the 5th word in a chain awards streak+2 to whichever kid closed it. Fairness question for co-work: is a class-rhythm streak a feature or a bug here?
- **F7 · P3 — Reveal / Mark-Correct act on the *first* unfound word in deal order** (`:585`, `:594`) — the teacher can't choose *which* word to reveal or credit. Tolerable at 5 words, awkward at 6.
- **F8 · P3 — Relay turn advances even on teacher-revealed words** (`:346-348` runs for revealed locks too) — a no-points teacher reveal consumes a team's turn.
- **F9 · P3 — An unplaceable word makes the round unfinishable.** `buildGrid` can surrender a word (`wordSearch/gridEngine.ts:214-219`, 90 attempts + all-8 retry make it rare); the completion gate (`:514`) then never passes and Reveal can't lock it either (placement lookup `:587-589` fails). Only escape is Skip. Defensive gap, not an everyday bug.
- **F10 · P3 — Misses have no analytics write** (`:352-362`, deliberate — "no objective to attach a generic miss to"). Class-accuracy stats therefore only see correct attempts; open-mode participation is undercounted.
- **F11 · P3 — The class's shared progress state is the smallest text on screen.** The "3/5 found" chip and miss/clue counters are `text-sm` (`:867-875`); at projection distance only the teacher can read them. The *game's score state for the class* is visually de-prioritized versus decorative header text.
- **F12 · P3 — Commander "Timer" icon is always ▶️ Play** (`ContextualControls.tsx:263-265`) — never reflects running/paused.
- **F13 · P3 — `awardedThisTurnRef` is written and cleared but never read** (`:240`, `:298`, `:611`) — dead bookkeeping (the found-map is the real latch). Harmless; confusing for maintenance.
- **F14 · P3 — Text-mode clue cards without a Chinese translation show only the word's first letter** (no `meaning` → card face is `word.slice(0, 1)`, `:147`) with "tap to hear it" — the weakest clue face; if audio also fails, kids get one letter.
- **F15 · P2 — The board blanks to a dark "Word Search / Loading…" screen during pool refetch cycles — and can get stuck there.** Observed live several times during capture (the first `26-preview.png` take caught the game fully blanked mid-preview; one run never recovered within 30 s after a round advance). `useBoardPool`'s fetch effect (`useBoardPool.ts:58-116`) sets `loading=true` first and has **no try/catch** — any rejection between (`classWeakObjectives` at `:67`, the query at `:83`) leaves `loading=true` forever as an unhandled rejection. `BoardWordSearch`'s early return (`:670`) then replaces the *entire* game — even mid-play — with the Loading screen. (Related: `useEscalatingPool.ts:232` only surfaces loading while empty, but the underlying fetch still re-runs on roster/pool key changes.)

**What already works well (context for co-work — don't re-litigate):** deterministic seeded grids identical across tabs; forgiving drag snapping + tap-tap input; found-word re-tap is a no-op, 2-letter taps ignored as noise; dicebear placeholders excluded from image-clue mode (real images only); board on-screen buttons work (optimistic local apply + broadcast, verified in `SessionContext.tsx:1686-1699`); empty-state is honest with a Skip Slide escape; the preview / summary / final stages all render correctly (see screenshots) — **it is specifically the play-stage layout that is broken (F0)**.

**Capture tooling (reusable for the batch):** `scripts/testing/games-v3-board-fixtures.ts` (`--setup`/`--teardown` throwaway teacher + class + roster + unit + LIVE session row) and the `games-v3-board-shots.ts` / `games-v3-final-shots.ts` / `games-v3-preview-retake.ts` Playwright drivers. Fixtures were created and fully removed on the dev project (2026-09-09).

## §4 ⬜ ChatGPT Co-Work quality audit

> **Co-Work: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design

- **P1 — The play screen has no visible game board, so its visual hierarchy collapses.** **Evidence:** §3 F0 measures the grid at 0×0 at 1280/1920 and 13×13 at 1279; `26-play.png` and `26-bug-grid-invisible-at-1280plus.png` show clue cards surrounding a large empty centre. This exactly matches the owner comment in §2. A child cannot infer what to do, and the teacher has no usable target to tap. **Recommendation:** rebuild play around one non-negotiable, square grid region that receives its size from the available board viewport, not from its own contents. On a normal projector it should be the dominant object; clue cards become a compact, responsive word rail. Define visual acceptance checks at 1920×1080, the 1280×720 Commander popup, and the owner's 700×320 phone-landscape floor: no scrolling or overlap, and every letter cell stays visibly tappable.

- **P2 — The shared game state is visually weaker than decoration and controls.** **Evidence:** §3 F11 identifies `3/5 found`, misses and clues as `text-sm`; in `26-play.png`, the small `0/5 found`, `× 0`, and light-bulb counters sit below the clue cards and are much less legible than the title and the large timer. From 5–8 m, children cannot track whether the class is getting closer to winning. **Recommendation:** put a large, persistent progress treatment directly beside or above the grid — for example five bold word dots/tokens that fill as words are found, with a separate high-contrast timer and small but readable mistake/assist counters. Use colour *and* icons/text so progress does not rely on colour alone.

- **P2 — Completion is being signalled as success even when the teacher revealed every answer.** **Evidence:** `26-summary.png` says “COMPLETE!” while reporting `0 WORDS FOUND` and “5 words revealed by the teacher”; `26-final.png` still shows confetti and a star for `0/15 words found`. This gives a 7-year-old an unclear message about what was achieved and makes the result less meaningful to a 12-year-old. **Recommendation:** use outcome-specific language and visuals: “Round complete — let’s learn the answers” after teacher reveals, “Great search!” after class finds the target, and a quiet neutral recap for a skipped round. Reserve stars/confetti for a stated class success condition, while keeping a recovery message such as “You found the tricky words together” so a low-result round is not shaming.

- **P2 — The final-find feedback is visually interrupted rather than celebrated.** **Evidence:** §3 F5 says the summary opens as soon as the last word locks; `26-summary.png` visibly retains the “It was APPLE” toast over the modal heading. The learner sees two competing messages instead of one clear correct moment. **Recommendation:** make correct feedback a short, unobstructed beat: retain the highlighted word, animate its clue token to the found rail, speak it, and show the named scorer/choral acknowledgement for about 1.5–2 seconds before the summary enters. The summary must not render underneath the feedback toast.

- **P3 — The current visual language has a sound foundation but needs one consistent challenge surface.** **Evidence:** `26-preview.png` has a clear deep-navy board, white cards, a large pink Start Round button, and a comprehensible five-card preview; `26-play.png` shifts the cards into a floating, scattered arrangement with no central anchor. **Recommendation:** retain the navy, pink primary-action, sky-blue timing, and rounded-card vocabulary, but make the grid, word rail, and feedback chip use the same spacing scale and corner language. Avoid adding decorative objects inside the scanning area; a word-search needs visual calm more than more game chrome.

### 4.b Workflow & user flow (teacher's path: start → turns → end)

- **P1 — A teacher can start a round but cannot actually run it when the play grid disappears.** **Evidence:** §1 describes Start Round followed by first/last-letter selection; §3 F0 and `26-play.png` show that selection surface missing. The live path stops immediately in front of the class. **Recommendation:** treat the responsive grid rebuild as a release gate, then run the complete teacher path on the actual Board and Commander sizes: preview → start → select a word → attribute it → finish → advance → final. Do not ship a layout that only works at a designer's viewport.

- **P2 — The game can blank or remain stuck on Loading in the middle of a lesson.** **Evidence:** §3 F15 observed the board replacing even an active game with `Word Search / Loading…`; an unhandled pool-fetch rejection can leave it there indefinitely. **Recommendation:** preserve the already dealt round while background data refreshes, show at most a non-blocking “Updating words…” indicator, and give the teacher a visible Retry and Skip path if the first load fails. A failed refresh must never replace an active board or erase the current grid.

- **P2 — The natural commander action is missing or misleading at the round boundary.** **Evidence:** §3 F2: the board displays “Next Round,” but the Commander offers only “Skip,” which silently advances and can end the final slide without the celebratory path. In the classroom model, the teacher should not need to leave the desk/remote to use the intended continuation. **Recommendation:** add a Commander/Remote `Next Round` action whenever the summary is open; reserve `Skip round` for an explicitly destructive action with a brief confirmation or undo. On the final summary, label the transition `See class result` rather than `Skip`.

- **P2 — Open-mode attribution consumes the live timer while the teacher is choosing a child.** **Evidence:** §1 makes OPEN the default and opens “Who found it?” after each word; §3 F4 confirms the timer continues behind that picker. In a 30-child room this turns fair credit into a time penalty and pressures the teacher to choose quickly. **Recommendation:** pause the timer immediately on a valid find and show a single-purpose attribution state: the found word stays highlighted, the countdown visibly says `Paused — choose finder`, and one roster tap or `No credit` resumes. The same state needs a Commander/Remote route, not just an interaction on the projected machine.

- **P2 — A timed game has no ending beat at 0:00.** **Evidence:** §3 F1 says the interval merely stops; no banner, sound, state transition, or reveal follows. The class and teacher are left to infer what happens next. **Recommendation:** at 0:00 freeze selection, announce `Time!`, show the remaining target tokens, then offer a clear teacher-driven `Reveal remaining` / `Next round` decision. Keep the state distinct from a completed round in both copy and score handling.

- **P3 — The teacher cannot target the word they intend to support, reveal, or mark correct.** **Evidence:** §3 F3 and F7 say Clue is random and Clue/Reveal/Correct choose the first unfound word in deal order. That adds avoidable explanation and makes recovery feel arbitrary. **Recommendation:** let the teacher tap a visible unresolved word token first, then choose `Clue`, `Reveal`, or `Credit`. Keep a quick `Suggest a clue` shortcut if desired, but never silently spend support or points on another word.

### 4.c Pedagogical practice (ESL ages 6–12)

- **P2 — Round 1 tests visual string-matching more than vocabulary retrieval.** **Evidence:** §1 says each round-1 clue card displays the English word and children find the identical letter string; correct answers are then spoken aloud. This can be useful spelling exposure, but a child can succeed without linking form to meaning or producing English. **Recommendation:** set one visible spoken-language routine before each search: teacher points to a picture/meaning cue, children say the word together, then the selected child says the word before the teacher traces it. Keep the English word on the found token *after* the attempt so learners connect meaning → sound → spelling without giving away the answer in advance.

- **P2 — The proposed higher-difficulty clue exposes Chinese as the answer path during the challenge.** **Evidence:** §1 says round 2 text-mode cards show the Chinese meaning and allow “tap for English”; `_CROSS-CUTTING.md` §1 records the owner's rule that Chinese must not appear during a game challenge, including Commander. This is both a product-direction conflict and an unstable scaffold: it can turn into translation lookup rather than English retrieval. **Recommendation:** replace in-challenge Chinese cards with a meaningful image where available, a short English oral clue from the teacher/audio, or a first-sound/letter cue after a wait. Chinese may remain in pre-teach/review outside the active challenge, but not as a visible challenge answer.

- **P2 — Hints are random, fleeting, and tied to a score penalty rather than to a deliberate scaffold.** **Evidence:** §3 F3: Clue rings a random word's first letter for 3.5 seconds and permanently halves that word's award. A child who needs help may not see it, while a different word is penalised. **Recommendation:** make support progressive and targetable: (1) replay the word or give an image/English category clue, (2) hold the first letter/first sound on the chosen word until the next attempt, then (3) reveal after teacher choice. Show the reduced award only on that word’s token, and frame it as `Hint used — still worth 1 point`, not as a hidden punishment.

- **P2 — Incorrect paths provide a penalty but not a learning move.** **Evidence:** §1 says a three-or-more-letter miss shakes the grid and deducts a point; it describes no corrective prompt, and §3 F10 notes the miss does not feed learning analytics. Young learners need a recoverable next action, especially when a teacher is performing the tap. **Recommendation:** leave the attempted path briefly in amber/red, then prompt one actionable strategy such as `Look at the picture. Say the first sound.` or `Find the first letter.` Do not reveal the word automatically. Record a generic selection error/assist at round level so teachers can see when the mechanic, rather than word knowledge, caused difficulty.

- **P2 — One fixed escalation is likely to be too broad for the 6–12 range.** **Evidence:** §0 sets defaults of three rounds, 3–5 words and a 120-second timer; §1 progresses from horizontal/vertical to six then eight directions and adds decoy letters. The same jump from basic letter scanning to diagonals/reversals will not create an equally productive challenge for an early reader and an older primary learner. **Recommendation:** provide two teacher-selectable presets in PlanComposer: `Starter (6–8)` — 3 short, familiar words; horizontal/vertical; generous timer; and `Explorer (9–12)` — 4–5 words; diagonals/reversals; meaningful decoys. Preserve the existing deterministic dealing and coverage ledger within each preset.

- **Information needed — Content suitability.** §0 says the grid size is capped at 10 and words come from pools/vocabulary, but does not establish how multi-word items, hyphens, long spellings, phonics level, or image quality are filtered. Before using Word Search with 6–8 year olds, confirm that unsupported formats are excluded or transformed and that every word has an age-appropriate English-only clue.

### 4.d Game interaction (mechanic, pacing, fairness, fun)

- **P2 — The core mechanic is a promising whole-class hunt, but the default open-mode scoring makes a shared discovery feel like a delayed administrative task.** **Evidence:** §1: children call out, the teacher performs two taps, then must open a roster picker for every found word; §3 F4 confirms time runs during the picker. The excitement of “I see it!” is interrupted before the next child can join. **Recommendation:** retain open mode, but convert the word-found moment into a fast three-beat loop: teacher traces → freeze/credit → resume. Make `No credit / class point` one tap, and allow the teacher to select the finder after the round from a lightweight found-word log when immediate attribution would disrupt momentum.

- **P2 — Individual awards are not consistently attributable to individual performance.** **Evidence:** §3 F6 says streaks are global, so the child who closes a class chain earns the +2; §1 gives the whole time bonus to the last finder. This is hard to explain as fair in OPEN and can frustrate older children who contributed earlier. **Recommendation:** in collaborative/relay, maintain a streak per selected child or team; in open mode, make a streak visibly class-wide and award its bonus to a shared class meter, not the last name. Split the time bonus among credited finders or turn it into a class celebration multiplier rather than a windfall for the closer.

- **P2 — A selection slip is treated more harshly than a knowledge error, while the board's input is inherently spatial.** **Evidence:** §1 allows drag and two-tap selection with off-axis snapping; a wrong line of three or more costs the picked responder −1, while two-letter attempts are merely ignored. A child can know the word but lose points because the teacher/mouse missed the diagonal. **Recommendation:** make a wrong path an `attempt used` visual with no individual point deduction on the first miss; only apply a score consequence after a clearly defined second unsupported guess, if competitive mode is enabled. In practice/open mode, use mistakes to trigger the scaffold rather than a penalty.

- **P3 — Relay needs to preserve turns when the teacher rescues the class.** **Evidence:** §3 F8 says a teacher-revealed word still advances the team banner. A no-points rescue should not consume a team’s opportunity. **Recommendation:** advance relay only after a credited correct find; after a reveal, keep the same team active and animate the revealed token as a shared hint.

- **P3 — The rare unplaceable word has no safe in-game recovery.** **Evidence:** §3 F9: a grid-engine surrender makes completion impossible and Reveal cannot lock that word, leaving Skip as the only exit. **Recommendation:** validate that every dealt target has a placement before the round can start; if one fails, regenerate deterministically with a replacement and log the event. The teacher should never discover a broken deal through an unfinishable round.

- **P3 — The interaction already has good anti-chaos affordances worth preserving.** **Evidence:** §3's “What already works well” confirms deterministic shared grids, forgiving drag/tap-tap input, harmless two-letter noise, and harmless repeat selections. **Recommendation:** keep these protections in the redesign; express them visibly with a clear start-cell focus, a live line preview, and a short `Try a longer line` nudge instead of a confusing silent failure.

### 4.e Top-5 prioritized recommendations

1. **P1 — Rebuild the play layout around an always-visible, dominant, responsive letter grid.** Fix F0 before any further tuning; test the Board at 1920×1080, 1280×720, and 700×320 with no scroll/overlap and legible tap targets. Clues must adapt around the grid, never consume its space.
2. **P2 — Make the live loop recoverable and commander-complete.** Preserve the active round through pool refreshes (F15), add Commander/Remote `Next Round` (F2), and give 0:00 a clear Time!/reveal/advance state (F1).
3. **P2 — Stop the clock for attribution and give the teacher exact control.** On each open-mode find, pause for a fast picker; let the teacher choose the unresolved word before applying Clue, Reveal, or Correct (F3, F4, F7). Include the same route on Commander/Remote.
4. **P2 — Turn the hunt into English retrieval with progressive, English-only scaffolding.** Replace round-2 Chinese challenge cards with pictures/oral English clues; require a say-it-before-find-it routine; use selected, persistent hints and corrective first-sound prompts rather than random, punitive flashes.
5. **P2 — Make scoring and celebration reflect who learned and what happened.** Delay the last-word celebration before summary (F5); distinguish found/revealed/skipped outcomes; use per-child/team scoring in competitive modes and a class meter in open mode rather than awarding global streak/time bonuses to the final finder (F6).

### 4.f Design direction for Stitch (style/mood guidance + the 3–5 key screens/states to design; what to KEEP from the current design)

**Mood and visual system.** Design this as a focused “word-hunt expedition,” not a worksheet: calm deep navy/ink background, a high-contrast warm-white or pale-blue letter grid, confident rounded-square tiles, and one unmistakable scanning focal point. Keep hot pink for the single primary action, sky blue for time, emerald for correct/found, amber for a hint, and rose/red only for a recoverable wrong path. Use large uppercase letterforms, thick selection strokes, and short, buoyant motion — a line draws, a word token pops into the found rail, then the room moves on. At 5–8 m, the child should identify the grid, target picture/word token, found progress, timer, selected student/class mode, and feedback without reading small labels.

**Mock up these five board states.**

1. **Round preview:** a simple “Find these words” start state with 3–5 meaningful image/English oral-clue cards, a clear difficulty badge, and one Start Round action; no Chinese shown as a challenge answer.
2. **Active search — idle/running:** the grid owns the centre; a compact target/found rail and large timer surround it without competing. Show the current mode (`Whole class` / named child / team) and high-visibility class progress.
3. **Selection and feedback:** start-cell focus and line preview; a correct line locks emerald and moves its token to found, while a wrong line turns amber/rose briefly and offers a first-sound/visual hint rather than an answer. Include the time-up variation with the remaining targets.
4. **Open-mode credit micro-state:** the frozen correct word plus a simple, projector-legible roster attribution choice that makes the pause explicit. It must have a matching Commander/Remote treatment, but no student-device interaction.
5. **Round result and final result:** two honest variants — class-found success and teacher-revealed learning recap — with the final correct-answer celebration visibly complete before the recap appears. Stars/confetti correspond to stated success, not merely arriving at the end.

**Keep from the current design.** Retain the deep-navy/forest-green classroom shell, the rounded white clue cards, hot-pink Start/continue button, sky-blue timer, friendly avatar leaderboard, simple preview, and final confetti energy (`26-preview.png`, `26-final.png`). Retain the underlying game feel of forgiving drag or first/last-letter selection, deterministic shared grids, and ignored short/repeated taps; redesign the surface and the teacher flow around those strengths.

**ZCode reconciliation of §4 (2026-09-09):** All findings **accepted** — verified against §1/§3 code evidence; no factual conflicts. Notes for implementation:
- **4.c's Chinese-in-round-2 catch is confirmed real** and was missed in §3 (text-mode round-2 cards show the Chinese meaning of the very words being hunted — the "answer trivially visible" case the owner's English-first rule says to avoid). Stitch scope keeps clue faces image/English-only. **Rule refined by the owner 2026-09-09 (later same day): Chinese is avoided when possible, not banned — instructions/tips/rules/exercise descriptions may use it when needed for clarity; this game's design needs none.**
- **Two Co-Work proposals change behavior beyond UI and need the owner's explicit go at implementation time:** (1) per-child/team streaks + a shared class meter in open mode instead of global streak + last-finder time bonus (4.d); (2) first miss costs no points (amber feedback only; −1 only on a second unsupported guess) (4.d). ZCode recommends accepting both — they align with the owner's pedagogy rule — but they alter the scoring economy and will be called out in the implementation plan.
- **Starter/Explorer presets (4.c)** require PlanComposer block-data changes — in implementation scope.
- **4.c "Information needed — content suitability", answered from code:** `normalizeWord` strips spaces/hyphens silently ("ice cream" → grid letters `ICECREAM` while the card still displays "ice cream" — kids must infer the concatenation) and caps words at 10 letters; there is **no** age-band/phonics filtering today. Implementation TODO: prefer single-word items or show the joined form on the clue token.

## §5 ⬜ Google Stitch prompt

> **How to run (owner):** [stitch.withgoogle.com](https://stitch.withgoogle.com) → new project → **Web / Desktop (16:9)**. Paste **Prompt 1** first (it establishes the design system). Then generate each follow-up prompt as an additional screen **in the same project** so the style carries over. When you're happy, export → drop the files into `stitch/26-word-search/` and tell ZCode. A QA checklist is at the bottom of this section.
>
> **Responsive note:** Stitch designs the canonical 16:9 board. The phone-landscape floor (700×320) is an implementation constraint ZCode owns: the grid stays a perfect square, the right rail collapses to a top row, the HUD stays slim. Judge the Stitch output at 16:9 only.

### Prompt 1 — design system + ACTIVE SEARCH (the core screen)

> Design a 16:9 classroom projector screen for an English vocabulary word-search game played live by children aged 6–12 learning English (ESL). A teacher drives everything from a separate control screen; kids only look at this projected board from 5–8 meters away. No Chinese on challenge faces — English-first (small Chinese is acceptable ONLY for instruction clarity when truly needed; this design needs none). Style: a calm, focused "night expedition" mood — deep navy/ink background, kid-friendly but not babyish, rounded corners, soft shadows, large readable type.
>
> Layout: **CENTER — a large square letter grid** (9×9 uppercase letters) as the single dominant object, about 55% of screen width, a rounded deep-slate card with warm-white, very large letters and generous cell spacing. **RIGHT — a vertical rail of 4 vocabulary target tokens** stacked: rounded white cards, each with a colorful photo (tractor, green leaf, river, apple) and NO text on unfound ones; two tokens are in the FOUND state — emerald, showing the English word ("TRACTOR", "RIVER"), a check mark, and a small circular child avatar of the finder. **TOP-LEFT header:** a hot-pink rounded square badge "W", the title "Word Search", a small badge "Round 2 · Explorer", and a mode chip "🖐 Whole class — hands up". **TOP-RIGHT:** a large sky-blue pill timer "1:24" over a slim progress bar. **BOTTOM HUD:** five large progress tokens (2 filled emerald with tiny word labels, 3 hollow), a small amber chip "💡 Hint · ½ pt", and one hot-pink button "Clue". On the grid, a thick amber selection stroke wraps the letters T-R-A-C-T-O-R along a diagonal with a soft glow, and a floating toast above the grid reads "Alice found TRACTOR! +2". Hot pink is used ONLY for the primary action.

### Prompt 2 — ROUND PREVIEW

> Same design system. Screen: "Round preview". Center: a large friendly heading "Find these 5 words" with a sub-line "Listen, say them, then search!". Below, an arc of 5 rounded white cards, each showing ONLY a colorful photo (tractor, leaf, river, apple, rock) — no text. A difficulty badge reads "Round 1 · Starter · → ↓ only". Under the cards: a big hot-pink button "Start Round" with a play icon, and beside it a slim timer chip "2:00". Top-left header identical to the previous screen. Keep it calm and uncluttered — this is a 3-second read before action.

### Prompt 3 — SELECTION & FEEDBACK

> Same design system. Screen: "Selection and feedback", same layout as the active-search screen. Show two teaching moments at once: (1) the grid with a bright start-cell focus ring on the letter R and a live, thick amber line preview extending through I-V-E-R; (2) a second word already locked emerald with its token flying toward the found rail (motion trail). Add a feedback toast "River! Say it: /ˈrɪvər/" with a speaker icon. Include a small amber helper chip near the grid bottom: "Look at the picture. Say the first sound." — a hint, never the answer. Keep challenge faces Chinese-free.

### Prompt 4 — TIME'S UP

> Same design system. Screen: "Time's up" overlay on the frozen grid: letters dimmed to 40%, a large bold banner "Time!" with a bell icon, and the 2 remaining target tokens enlarged in a horizontal strip: "These words are still hiding — reveal them?" with two buttons: a slate "Reveal remaining" and a hot-pink "Next round". The timer pill shows 0:00 in rose red. Honest and calm, not punitive.

### Prompt 5 — WHO FOUND IT? (open-mode credit micro-state)

> Same design system. Screen: attribution micro-state. The found word stays celebrated in the background (emerald lock + glow) while the board dims to 60%; the timer pill is replaced by a sky-blue "⏸ Paused — choose the finder" pill. Center: a compact rounded card "Who found LEAF? +2 pts" with a grid of 6 large circular child-avatar chips with names (Alice, Ben, Coco, Dudu, Emma, Fang), one highlighted on hover state, plus a quiet secondary text-button "No credit — class point". Must be legible from 8 meters; nothing else competes with the choice.

### Prompt 6 — RESULTS (two honest variants)

> Same design system. Two result screens. **Variant A — class success:** a warm celebration: "Great search, class!" with 4 of 5 stars filled, confetti bursts, a row of found-word tokens each tagged with the finder's avatar, and stats tiles "12 words found · 1 miss · 2 hints" plus a hot-pink "Next round" button. **Variant B — teacher-revealed recap:** calm and encouraging, no confetti: "Let's learn these words" with the revealed words listed large (TRACTOR · RIVER · APPLE), each with a speaker icon, a friendly line "You found the tricky ones together — now you know them all!", and a "Next round" button. Same header as the other screens.

### Owner QA checklist when reviewing the Stitch output

- [ ] The letter grid is the single dominant object (~50–60% width) — not squeezed by cards
- [ ] No Chinese on challenge faces; clue faces are image or English-only (small Chinese permitted only for instruction clarity if truly needed)
- [ ] Letters and tokens readable when you step 4+ meters back from your screen
- [ ] Hot pink only on primary actions; emerald = found; amber = hint; sky blue = time
- [ ] Found tokens show the English word AFTER the attempt (never before)
- [ ] Timer + mode chip + class progress all visible without hunting
- [ ] "Who found it?" reads as a paused, single-purpose moment
- [ ] Result screens distinguish found vs revealed outcomes honestly

## §6 Stitch output & implementation notes

**Stitch export (owner, 2026-09-10):** `stitch/stitch_esl_classroom_word_search_display/` — 6 screens + DESIGN.md. ZCode normalized the states onto the main screen's night/accent token system (the screens had drifted between two class systems) and took layout/content from each.

**Implemented 2026-09-10 (v3 pilot shipped):**
- `apps/board/templates/BoardWordSearch.tsx` — full visual rebuild to the Stitch design; game logic contracts preserved (lifecycle 4 must-dos, tap-tap + drag selection, triple-write scoring, modes, deterministic dealing). **F0 killed by construction**: grid is pure-CSS square (orientation-conditional flex sizing; no measured-pixel math) and strokes are a grid-unit SVG overlay — F0-gate measured **775 px @1920×1080, 415 @1280×720, 330 @1279×719, 67 @700×320, zero scroll at all sizes** (before: 0–13 px).
- F1 Time! overlay · F2 commander Next Round button (`ContextualControls.tsx`) · F3 armed-token Clue with persistent ring · F4 timer pauses behind the picker · F5 celebration beat (two-effect split — a single effect self-cleared its timer, caught by the gate) · F6 per-student/team streaks + open-mode class combo (no global windfall) · F7 armed targeting for Reveal/Correct · F8 relay ignores reveals · F9 placement retry ladder + auto-reveal · F11 HUD progress tokens · F13 dead ref removed · F15 board never blanks mid-game (`useBoardPool` fetch now error-safe; loading gate only pre-first-deal).
- Owner decisions applied: first miss warns (amber + "say the first sound"), −1 from the second; honest result variants (Great search! vs Let's learn these words recap; stars only for real found-success); Starter/Explorer presets (`PlanComposer.tsx` writes `preset:'starter'` default).
- Verification: tsc clean · vitest 720 passed/1 skipped · production build clean · Playwright F0-gate green at 4 sizes · full reveal→summary flow probed end-to-end · after-shots `screenshots/26-v3-*.png`.

**Design-fidelity log (Stitch screen → implementation):**
| Stitch screen | Fidelity | Notes |
|---|---|---|
| Active search (main) | **Followed** | Layout, tokens, HUD, colors 1:1; mock chrome bound to real data (sync dot, game class score). |
| Round preview | **Adapted, then fixed after owner review** | v1 shipped small rail-token cards (engineering shortcut — flagged by the owner 2026-09-10); v2 follows Stitch: big portrait photo cards, huge title, difficulty chip. At the emergency phone floor the cards wrap and the preview may scroll (play stage never scrolls). |
| Selection & feedback | **Followed** | SVG glow strokes implemented as layered lines; start-cell/tap-last hint kept. |
| Time's up | **Followed** | Banner + reveal-remaining/next-round choices. |
| Attribution micro-state | **Adapted** | Stitch used a second token system (Material-style); restyled onto the night/accent system, kept the layout and paused-timer treatment. |
| Results (recap variant) | **Followed + extended** | Success variant (stars) added per the honest-results decision; recap follows Variant B. |

**Known remainder (not this game's fault):** at the 700×320 phone floor the BoardShell's leaderboard rail still consumes ~44% of width (392 px left for the game) — logged to `_CROSS-CUTTING.md` for the responsive workstream. Board-mid-game pool refetches no longer blank the game; the commander-side attribution route (Co-Work 4.b) is follow-up scope.

**Commit:** see `git log` — `BoardWordSearch v3: Stitch redesign (games-v3 pilot) — F0 grid fix + 15 audit findings`. Deploy: push to master → Vercel (verified per AGENTS.md §8).
