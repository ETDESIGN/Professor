# Listen & Tap — v3 Quality Audit (`LISTEN_TAP`)

> **Status:** **stitch-in-flight (wave 1)** — §4 audited (Anti-Gravity). Ready for Stitch prompt §5.
> **Screenshots:** `screenshots/10-listen-tap-idle.png`.

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

- **Flow type:** `LISTEN_TAP`
- **Component:** `apps/board/templates/BoardListenTap.tsx`
- **Phase:** PRACTICE (reads `activeSlideData.phase`, falls back to PRACTICE)
- **Remote-control group:** custom set — Skip (`SKIP`) / Hint (`REVEAL_HINT`) / Correct (`MARK_CORRECT`) / Next (`NEXT_ROUND`) / End (`SLIDE_COMPLETE`), plus `RESET_GAME`, `PLAY_AUDIO` (listened-for, unreachable — §3 F4) and `SUBMIT_DICTATION` (remote-only Dictation input). Emitted from `apps/teacher/live/panels/ContextualControls.tsx:152-161` + `apps/remote/TeacherRemote.tsx:490-515`.
- **Data sources:** `useEscalatingPool` — `SHELL_CAPABILITIES.LISTEN_TAP` consumes `LISTEN_SELECT` / `MINIMAL_PAIR_SWIPE` / `DICTATION` (rungRange [2,4]); hook inputs pinned to `roundIndex: 1, totalRounds: 1, roundSize: 20` (§3 F1); frozen slide `data.options` fallback when present.
- **Mode:** picked student (`quickWheelWinner`); playable choral when no pick (scoring guards on `picked`).

## §1 How the game works today

**Round engine.** One listening question at a time, labeled "Round N · <type>" (top-left chip). Content flows through the escalation pipeline: `lessonDirector.buildRound` selects up to 20 objectives weakest-first behind a session coverage ledger → `useBoardPool` fetches the unit's `pool_items` of the shell's consumed types → the selection is filtered to those objectives → `dealForTurn` re-arranges per `(session, unit, shell, round, turnToken, resetCount)` so commander/remote/projector all deal identically and each picked student faces a different order. The shell then walks that dealt list with a local round counter **modulo the list length** (`BoardListenTap.tsx:91`) — see F1. Three round kinds share one UI: LISTEN_SELECT (audio → tap the matching image/word), MINIMAL_PAIR_SWIPE (audio → left/right of near-sounds), DICTATION (audio → teacher types on the Remote).

**The 4-beat loop** — `listen → options → feedback → preview`:
1. **LISTEN** — big pulsing green speaker; audio auto-plays ~0.6 s in (stored audio or TTS of the prompt); options auto-appear after 3 s (2 s for minimal pairs). The speaker button re-plays.
2. **OPTIONS** — 2–4 colored tiles (image, or a large first letter when no image). The kid answers orally; the teacher taps the tile on the board (or presses Correct on the remote).
3. **FEEDBACK** — correct: green glow + ✓, class-streak counter (flame at 3, confetti at 3/5), award = `scoreForAttempt(difficulty, ratio, streak)` (floor 1, cap 5). Wrong 1st: red shake + retry + live −1. Wrong 2nd: a white micro-explanation card shows the correct option + "You heard: …" (~2.2 s) then auto-advances.
4. **PREVIEW** — "Well done!" + a "Next: ⟨student⟩" chip + a green **Next Round** button. This beat only exits on a click (board button or remote Next) — the forced-click flow the owner flagged (§3 F2).

**DICTATION rounds** (only dealt at rung 4, i.e. 'familiar'+ objectives): the Remote shows a Dictation input; the teacher types what the class spelled; Levenshtein similarity ≥ 0.6 passes; the board compares typed vs target with a match %; partial ratios pay partial points.

**Scoring & writes.** Standard dual-write per event: `addPoints` + `logAttempt` (recordAttempt analytics + `gradeObjective` FSRS + remediation push on misses). Mistake cost is live (−1 per wrong tap); `scoreForAttempt` no longer double-deducts. Mistake/award latches reset per item and per new pick (4 must-dos honored).

**Controls (commander `ContextualControls.tsx:152-161`, remote `TeacherRemote.tsx:490-515`):** Skip (deal next item — no reveal), Hint (glow the correct tile 1.5 s, or replay audio on minimal pairs), Correct (force-award + streak), Next, End; remote adds the Dictation input. RESET_GAME bumps `resetCount` → the seeded deal re-arranges.

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> It's quite all right, but it only asks me one question: "animal". I did it five times, and five times it just asks me "animal" — there are a bunch of vocabulary words in the enrichment vocabulary. / Another comment: after answering, we get to a new screen which writes "well done" and asks to click "next round". Because there is only one question, a round should be somewhere like a few words, and the teacher shouldn't have to click after each answer to go to the next. Remember that we have the wheel-run picking system, so we need it to work smoothly with the picking system.

**Clarified with the owner (2026-09-09):**
- Word-variety bug: the same word ("animal") was served 5 turns in a row — the unit's other vocabulary must rotate in (audit the pool/deal path).
- After a correct answer: short celebration (~1–2 s) then AUTO-ADVANCE to the next word within the same student's turn — no forced "well done → next round" click.
- Words per picked student follow the wheel's 1/3/full-set rotation setting.

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardListenTap.tsx` unless noted.

- **F1 · P1 — "animal" five times in a row (§2 bug #1, root-caused).** The shell serves `poolItems[round % Math.max(1, poolItems.length)]` (`:91`). If the pool for LISTEN_TAP's consumed types holds **one item, every round is that item, forever** — no minimum-pool guard, no variety warning. Three compounding code paths collapse the pool despite a full enrichment vocabulary:
  - **(a) Generation gate:** `generate-exercises` emits LISTEN_SELECT only when the word has distractors with **real** images (`supabase/functions/generate-exercises/index.ts:118-127`; sibling image filter `:95`) — on units where most enrichment words still carry placeholder images, most words get **no listening item at all**. MINIMAL_PAIR_SWIPE needs `confusables` (`:161-164`); DICTATION only enters the fetch at rung 4.
  - **(b) Class-plan scope:** a class session drills only the plan's `content_index.objective_ids` (`apps/board/useEscalatingPool.ts:86-89`) — a plan scoped to a subset silently pins this shell's pool to that subset.
  - **(c) Frozen override:** if the slide's legacy `data.options` exists it takes precedence and serves **one frozen item every round** (`:94-102`).
  **Amplifiers:** the shell pins `roundIndex: 1, totalRounds: 1` (`:62-65`) so the coverage ledger never re-deals fresh words for this shell — the same dealt list is cycled by modulo indefinitely; and there is **no objective-level dedupe** (contrast `BoardFlashMatch.tsx:129-137`), so multiple variants of one objective can legitimately sit adjacent in the deal.
- **F2 · P1 — Forced "well done → Next Round" click (§2 bug #2).** After a correct answer the celebration lasts 900 ms (`:287`) then parks on the preview screen whose only exit is the Next Round button (`:565-568`) or the remote's Next — no auto-advance timer exists. The "Next: ⟨student⟩" chip (`:559-564`) is decorative (derived `:379-382`, never triggers a pick), and the game has no concept of the wheel's 1/3/full-set words-per-student setting — each pick gets exactly one question, which is why "a round = a few words per student" can't be expressed today.
- **F3 · P2 — Exhaustion edge fires every question on thin pools.** `advanceRound` checks `round >= poolItems.length - 1` (`:261-264`) — with a 1-item pool that is `round >= 0`, so **every** advance plays the win cue and broadcasts `SLIDE_COMPLETE`. Nothing in the app consumes `SLIDE_COMPLETE` to advance the lesson (only board templates listen), so the board just sits there — matching the owner's "stuck asking the same thing" experience.
- **F4 · P2 — No audio replay from commander/remote.** The board listens for `PLAY_AUDIO` (`:160-162`) but neither control surface has an audio button for LISTEN_TAP (`ContextualControls.tsx:152-161`, `TeacherRemote.tsx:490-515`) — replaying the prompt means walking to the projector (same parity gap Focus Cards had, audit 05 F5).
- **F5 · P2 — Skip skips silently.** `SKIP` (`:168-170`) deals the next item without revealing the current answer and without any "passed" record — the blocked-question flow the owner wants (reveal answer → award nothing → move on; §2 of 12-unscramble, same ask) does not exist here either.
- **F6 · P3 — Hint IS the answer.** For LISTEN_SELECT, `REVEAL_HINT` glows the **correct** tile for 1.5 s (`:171-174`) — a hint that hands over the answer, contrary to the owner's tips-never-reveal rule.
- **F7 · P3 — Dictation: unreachable content, always-on input.** DICTATION items only enter the fetch when objectives sit at rung 4 (`lessonDirector.ts:154-160` — fresh classes never get them), yet the Remote permanently shows the Dictation input (`TeacherRemote.tsx:513`); typing during a LISTEN_SELECT round broadcasts `SUBMIT_DICTATION` which the board drops unless `kind === 'DICTATION'` (`:163-167`) — a dead input most of the time.
- **F8 · P3 — Projection sizing.** Fixed 160×200 tiles (`:478`), "Type the answer on the Remote" at `text-sm text-slate-500` (`:448-450`), round chip `text-sm` (`:426`) — under-scaled for 5–8 m viewing; no responsive reflow for the phone-floor.
- **F9 · P3 — Scoring posture needs a decision alongside §2's multi-word turns.** Each question is its own scored attempt (latches reset per item, `:257-258`) — one picked student can bank several awards per pick. That aligns with the owner's "a few words per student" direction, but it drifts from the "one scored exercise per picked responder" note in `scoringDefaults.ts:8` and should be stated deliberately in the v3 spec.

**What already works well (context — don't re-litigate):** the escalation plumbing itself (weak-first selection, coverage-ledger rotation, per-turn seeded deals) is correct whenever the pool is healthy; dual-write scoring incl. FSRS `gradeObjective` + remediation pushes on every event; the 2nd-miss teaching reveal card; Levenshtein partial credit for dictation; streak mechanics with audio cues + confetti; deterministic cross-tab dealing.

## §4 ⬜ ChatGPT Co-Work quality audit

> **Co-Work: write your findings ONLY inside this section.** (Full instructions + shared prelude embedded at `file-ready`.)

### 4.a UI & visual design

- **P1 — Top-left badge collision with BoardShell chrome.** **Evidence:** `screenshots/10-listen-tap-idle.png`. The round chip ("Round 1 · LISTEN SELECT", `BoardListenTap.tsx:425`) is positioned at `top-3 left-4`, directly beneath the BoardShell's absolute-positioned `• PRACTICE` phase badge (`BoardShell.tsx:117-120`, positioned at `top-5 left-6`). The badge borders and text collide directly, producing a scrambled, illegible overlay. **Recommendation:** Shift the in-game header to start at `left-[180px]` or adopt the unified v3 top-bar pattern, displaying "Listen & Tap", the round counter ("Question 1 of 3"), and the active student pill in clean, collision-free slots.

- **P2 — Fixed 160×208px option tiles are undersized for 5–8m classroom projection.** **Evidence:** §3 F8 and `BoardListenTap.tsx:478`. Option tiles are fixed at `w-40 h-52` (160×208px) in a narrow horizontal row. From 5–8 meters in a 30-student room, the 120px square image container inside each card is too small for children to discriminate subtle visual or phonics cues. **Recommendation:** Scale option tiles dynamically to dominate the center stage: for 2-option minimal pairs, render large 320×380px cards; for 3–4 options, render 240×300px cards with generous internal padding and bold, high-contrast imagery.

- **P2 — 3-second empty screen delay during audio playback creates dead classroom time.** **Evidence:** `screenshots/10-listen-tap-idle.png` and `BoardListenTap.tsx:219`. When audio plays, options are completely hidden for 3000ms. Students sit staring at an isolated green speaker icon on an empty board. While intended to encourage auditory focus, 3 seconds of dead space in a live primary classroom causes attention drift. **Recommendation:** Display option card silhouettes immediately with an animated "Listening… 👂" pulse, and flip/reveal the image choices the moment audio playback completes (~1.2s), transforming dead wait time into active visual anticipation.

- **P2 — Missing live projection feedback during Dictation input.** **Evidence:** §3 F7 and `BoardListenTap.tsx:448-450`. In Dictation rounds, the board renders a tiny `text-sm text-slate-500` instructional note: "Type the answer on the Remote", while the teacher types on their phone. Children looking at the board see zero feedback until the final submission. **Recommendation:** Render a prominent, projector-scaled letter-box display on the board that reflects characters in real time as the teacher types on the remote baton.

- **P3 — Color tile scheme introduces accidental negative cues.** **Evidence:** `BoardListenTap.tsx:43-48`. Hardcoded pastel colors (red, teal, yellow, purple) are assigned cyclically to option tiles. Tile 0 defaults to `#FF6B6B` (red). In primary ESL pedagogy, red strongly denotes "wrong", creating an unintended negative bias against the first option. **Recommendation:** Use uniform, neutral warm-cream or deep-slate card backgrounds, utilizing color strictly for active hover/selection (blue/yellow) and correctness feedback (emerald/rose).

### 4.b Workflow & user flow (teacher's path: start → turns → end)

- **P1 — Single-word modulo loop locks the game into repeating the same question.** **Evidence:** §2 (Owner comment #1) and §3 F1. The owner reported "animal" repeated 5 turns in a row. Root causes identified: (1) legacy frozen `data.options` takes precedence over `poolItems` (`:95-103`), serving a single orchestrator card indefinitely; (2) `generate-exercises` requires real images for all distractors, failing to generate items for vocabulary with placeholder images; and (3) `roundIndex: 1, totalRounds: 1` pins the pool to round 1 with modulo cycling and no objective deduplication. **Recommendation:** Deprecate frozen slide options when `useEscalatingPool` is available; enforce graceful fallback distractors (text/audio tiles) when images are unavailable; and enforce objective deduplication across turns so all unit vocabulary items rotate fairly through the pool.

- **P2 — Forced "Well done → Next Round" click stalls the live lesson.** **Evidence:** §2 (Owner comment #2) and §3 F2 (`BoardListenTap.tsx:548-570`). After a correct answer, the board celebrates for 900ms and then locks on an intermediate preview screen requiring a manual click on "Next Round" (`:565`). The wheel's 1/3/full-set rotation is completely blocked because every single question demands an explicit teacher click. **Recommendation:** Implement the owner's auto-advance rotation rule:
  - *Within a turn (e.g. Questions 1 & 2 of 3):* Celebrate for 1.2s (green glow, chime, "+1"), then **auto-advance** immediately to the next question with zero teacher clicks required.
  - *End of turn (Question 3 of 3):* Hold a 2-second turn summary ("Alice scored 3/3! 🎉") before auto-returning to the wheel spin.

- **P2 — Missing Audio Replay button on Commander and Remote.** **Evidence:** §3 F4. The board listens for `PLAY_AUDIO` (`:160-162`), but neither `ContextualControls.tsx` nor `TeacherRemote.tsx` provides an audio trigger for `LISTEN_TAP`. When classroom noise masks the prompt, the teacher cannot replay without walking to the board. **Recommendation:** Add a prominent `Replay Audio / 重新播放` button to both Commander and Remote Baton.

- **P2 — Skip advances silently without learning or record.** **Evidence:** §3 F5 (`BoardListenTap.tsx:168-170`). Pressing `SKIP` advances to the next question without revealing the answer or logging the item. If a student is stumped, skipping provides no corrective value. **Recommendation:** When `SKIP` is triggered, briefly outline the correct tile in amber (~1.5s) so the class sees the answer, log a skipped attempt, and auto-advance.

- **P3 — Hint hands over the answer.** **Evidence:** §3 F6 (`BoardListenTap.tsx:171-174`). For `LISTEN_SELECT`, `REVEAL_HINT` glows the correct tile for 1.5s. Highlighting the target option in an ESL listening game gives away the answer rather than scaffolding recall. **Recommendation:** Change the hint mechanic to: (1) eliminate one incorrect distractor (50/50), or (2) replay the audio prompt at 0.85x speed.

### 4.c Pedagogical practice (ESL ages 6–12)

- **P1 — Phonological Discrimination to Visual-Semantic Binding.** `LISTEN_SELECT` is a vital receptive practice game: children hear the acoustic signal, isolate the target lexical item, and map it to visual meaning. For 6–8s, concrete image association is paramount; for 9–12s, minimal pair discernment (/b/ vs /p/, /ʃ/ vs /s/) develops critical phonemic awareness.

- **P2 — Two-miss scaffold provides effective corrective feedback.** **Evidence:** `BoardListenTap.tsx:293-311`. Miss 1 triggers a brief red shake with a live −1 deduction, keeping the options active for a retry. Miss 2 reveals a clean micro-explanation card ("You heard: 'tiger'") with the correct image and audio hold (~2.2s). This reinforces error recovery without frustrating the child. Retain this structure in the redesign.

- **P2 — Multi-word turn scoring structure.** **Evidence:** §3 F9. With the adoption of 3 questions per picked student, scoring should reward consistent performance: 1 base point per correct answer, with a bonus (+2) if the student clears all 3 questions without mistakes.

### 4.d Game interaction (mechanic, pacing, fairness, fun)

- **P2 — High-momentum turn pacing.** A 3-question turn should execute in under 30 seconds:
  1. *Audio Prompt (1s):* Clear native speech.
  2. *Response (2–3s):* Picked student shouts the answer or points $\rightarrow$ teacher taps.
  3. *Feedback & Advance (1.2s):* Green flash + chime $\rightarrow$ auto-advance to question 2.
  4. *Turn Wrap-Up (2s):* Star badge $\rightarrow$ next student.

- **P2 — Audio repeat policy.** In accordance with `_CROSS-CUTTING.md` §1: audio auto-plays once on item mount. The first manual replay is free; subsequent replays incur a −1 hint penalty in competitive modes.

### 4.e Top-5 prioritized recommendations

1. **P1 — Resolve the Word-Variety Collapse:** Deprecate frozen legacy slide options; provide text/fallback tiles when distractor images are missing; ensure a rotating pool of at least 6–10 unit vocabulary items.
2. **P1 — Implement Seamless Auto-Advance for Wheel Turns:** Auto-advance between questions within a student's 3-question turn after a 1.2s celebration beat; eliminate the forced "Next Round" click screen.
3. **P1 — Add Audio Replay Controls to Remote and Commander:** Provide a dedicated `Replay Audio` button across all teacher interfaces.
4. **P2 — Relocate Header Badges to Clear BoardShell Chrome:** Move the round and mode chips to provide safe left clearance from the `• PRACTICE` phase badge.
5. **P2 — Pedagogical Hints (Distractor Elimination, Never Answer Reveal):** Replace the correct-tile glow with a 50/50 distractor removal or slow audio replay.

### 4.f Design direction for Stitch (style/mood guidance + the 3–5 key screens/states to design; what to KEEP from the current design)

**Mood and visual system.** Design this as an electric, high-energy "Sound Stage / Audio Arena". Deep acoustic-navy stage (`#0A121E`), vibrant sonic accents (electric emerald `#10B981` for correct answers, sky blue `#38BDF8` for audio visualizers and duration, warm amber `#F59E0B` for streak flames, hot pink `#EC4899` for primary action buttons). Response cards should feel like physical, tactile arcade pads with bold imagery, clean typography, and snappy micro-animations.

**Mock up these four board screens/states:**

1. **Screen 1 — Listen Phase (Anticipation):** Full-bleed 16:9 stage. Center: a glowing emerald-and-blue audio speaker visualizer emitting dynamic concentric sound waves, captioned "Listen carefully! 👂". Below: 4 outlined card slots glowing softly in anticipation. Top bar: "Listen & Tap · Question 1 of 3 · Alice's Turn", streak counter "🔥 2".
2. **Screen 2 — Options Phase (Choice):** Center stage: 4 large, tactile response cards (2×2 or 1×4 layout) featuring high-resolution photos (e.g. Tiger, Lion, Monkey, Elephant) and clear English word labels. The picked student's name badge glows at top-right.
3. **Screen 3 — Correct Feedback & Auto-Advance:** Selected card ("Tiger") locks with an electric emerald border and bold checkmark. A floating celebration toast: "+1 Point! 🔥 Streak 3!". Bottom: a sleek 1.2-second countdown bar indicating automatic progression to Question 2.
4. **Screen 4 — Teaching Reveal (2nd Miss):** Dimmed background with a centered white card: "You heard: TIGER", accompanied by a high-res photo, a speaker icon, and a 2-second countdown before auto-advancing.

**What to KEEP from current design.** Retain the two-miss teaching reveal ladder, Levenshtein distance evaluation for dictation, class-streak celebration triggers with confetti at tiers 3 & 5, and deterministic turn dealing.

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

**§5 wave-1 design pass — SUBMITTED 2026-09-10 (ZCode → Stitch, autonomous):** two key screens per the §4.f brief: **L1 options-phase (tactile 2x2 cards)** and **L2 correct + 1.2s auto-advance bar**. Landing in the Stitch project (~15 min); ZCode verifies against the QA list, exports to `stitch/10-listen-tap/`, then implements (with the §3 root-cause fixes) in implementation wave 1.

## §6 ⬜ Stitch output & implementation notes

*(Owner drops the Stitch export into `stitch/<NN>-<game>/`; ZCode records implementation + deploy.)*
