# Memory Lab — v3 Quality Audit (`MEMORY_LAB`)

> **Status:** **file-ready** — §0–§3 audited (agent-parallel 2026-09-10) + §2 confirmed + screenshots captured. Ready for Anti-Gravity §4.
> **Screenshots:** `screenshots/23-memory-lab-idle.png`.

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

- **Flow type:** `MEMORY_LAB`
- **Component:** `apps/board/templates/BoardMemoryLab.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** custom — SKIP_ITEM ("Skip Round") / MARK_CORRECT ("Correct") / RESET_GAME ("Redo") / SLIDE_COMPLETE forced ("End") (`apps/teacher/live/panels/ContextualControls.tsx:232-240`)
- **Data sources:** `useBoardPool({ exerciseTypes: ['IMAGE_SELECT'], classWeak: true, roster })` → `cardPool` (correct-option image + word per item); `useSpeech` reference audio; `useSpeechRecognition` for produce rounds; `preloadRoundSpeech` TTS warm-up
- **Mode:** picked student

## §1 How the game works today

**A "what's missing" memory game in rounds: memorize a grid of picture cards, one disappears, recall it — by tapping its picture (rounds 1–2) or by speaking the English word (round 3, + round 4 when the pool is big).** Each round runs a fixed phase machine: `memorize → choral → recall → feedback`, then the next (bigger, faster) round.

**Round ladder (the current growth curve).** Three base rounds — 4 cards / 10s memorize, 6 / 8s, 8 / 6s — plus a 10-card / 5s "tension round" appended only when the pool has ≥10 distinct illustrated cards (`ROUNDS` + `TENSION_ROUND`, `:51-60`; composed in the `rounds` memo `:127-130`). Rounds 1–2 are `recognize` mode, rounds 3–4 are `produce` mode. Every round-count surface (progress dots, "Round x of y", advance guard) reads the composed ladder.

**Round setup (deterministic, coverage-first).** Cards are dealt from the unit's IMAGE_SELECT pool (class-weak first), shuffled with the shared per-turn seed so every tab shows the identical grid (E1.5). The removed ("tested") card is picked from words *not yet probed in earlier rounds* (`testedCardsRef` coverage set, `:150-156`) — no word gets re-tested while the rest of the pool was never probed; the cycle restarts when exhausted. Candidates = the missing card + 3 distractors that are *not in the grid*.

**Memorize phase.** The grid deals with a flip-in animation; an 80px countdown ring runs the memorize clock with an audible tick per second that doubles (500ms) under 4s left (tension ramp, `:214-218`). **Choral callout:** a ~1.5s full-screen pulsing "Everyone — point at the missing card!" beat with a reveal cue bridges memorize → recall (`:225-233`). **Recall phase:** the grid re-shows with the missing slot as a dashed ❓ gap. In *recognize* rounds the student taps the missing card among 4 image candidates below. In *produce* rounds the student presses "Tap to Speak" and says the English word — browser speech recognition scores it (transcript + % score shown); if speech isn't supported the game falls back to four English-word buttons (a word-MCQ). **Wrong answers:** wrong cue, streak reset, live −1 mistake penalty, `logAttempt(incorrect)`; after a 2nd miss the round auto-resolves as a miss — and, as a deliberate MemoryLab exception, the missing card is *never revealed* (that would defeat the mechanic); only "Missed it — moving on…" shows.

**Scoring.** A successful recall (tap, spoken pass, or the remote's **Correct** override — honored also during the choral callout, `:409-415`) → `scoreForAttempt(mistakes, difficulty, partialRatio, streak)` points to the picked student + `logAttempt` (modality `productive` on speech rounds, `receptive` otherwise). **Feedback phase** is a 2.2s teaching card: the missing image + its English word + "+N points" + a "Hear it" audio button (stored audio or reference TTS). Then `advanceRound` deals the next round (guarded: a bigger round only runs if the pool can fill it) or completes the game ("Memory Lab Complete! Elephant memory! 🐘" + idempotent natural `SLIDE_COMPLETE` broadcast).

**Turn & controls.** New wheel pick → full rewind to round 1 with fresh stats. **Skip Round** (SKIP_ITEM) advances immediately — stale auto-advance timers are generation-guarded (`roundGenRef`, `:74-75`, `:317-322`) so a skip racing a pending timeout can't double-advance. **Redo** restarts from round 1 and clears the coverage cycle. **End** (forced) jumps to the complete card. TTS for the round's words is pre-warmed in the background when the pool lands.

**Empty/loading states:** "Loading memory items…" while the pool fetches; if fewer than 4 distinct illustrated cards exist, an explicit card tells the teacher to run the exercise generator (with images) or skip to the next slide.

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> The memory game is quite good, but the problem is we just memorize cards — we don't really memorize the English word. So we need this kind of memory game, but instead of picking up the matching card, we need to pick up the matching word (or something like this). 4 up to 6 cards is the maximum — because if the next levels keep getting more and more difficult, we get like 10 or 12 cards, which is just not necessary. But the main point is: it's not a memory class, it's an English memory class. So we need a way to have to remember the English: either we see the word and have to pick up the matching visual, or we have a visual and need to pick up the right word. That's something to think about.

**Clarified with the owner (2026-09-09):**
- Matching must train ENGLISH: alternate directions across rounds — see IMAGE → pick the matching WORD, then see WORD → pick the matching IMAGE.
- Grid hard cap 4–6 cards (the current 10-card round 4 goes away).
- "It's not a memory class, it's an English memory class."

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardMemoryLab.tsx` unless noted.

- **F1 · P1 — Recognize rounds train picture memory, not English.** The recall challenge is image↔image identity: the missing thing is an IMAGE and the candidates render `card.imageUrl` only (`:607-627`, img at `:623`) — the English word never appears before resolution; it surfaces only on the post-answer feedback card (`:710`). §2's core complaint ("we just memorize cards — we don't really memorize the English word") is exactly this: rounds 1–2 are a pure visual-memory task with English bolted on after the fact.
- **F2 · P2 — Grid cap breached: the ladder grows 4→6→8→10.** `ROUNDS` (`:51-55`) plus `TENSION_ROUND` 10/5s staged when the pool has ≥10 cards (`:60`, `:127-130`). Owner cap is 4–6; the 8-card round 3 and the whole tension round must go. The cap change lands in exactly two places: the `ROUNDS`/`TENSION_ROUND` constants and the `advanceRound` pool guard (`:432-440`) — every other surface reads the composed `rounds` memo, so nothing else hardcodes a count.
- **F3 · P2 — The §2 direction mechanic already exists in embryo, and the seam for alternation is clean.** Every `MemoryCard` carries both halves (`word` + `imageUrl` + audio, `:36-43`); the speech-unsupported produce fallback already renders English-word buttons against the image grid (`:638-648`) — i.e. see-images→pick-word. The redesign's natural seam: add a `direction: 'image→word' | 'word→image'` field to `RoundConfig` (`:45-49`), render word-pods or image-pods for the candidates in the recall block (`:607-627`), and (for word→image) swap which side of the pair the grid/candidates show — candidate construction (`:162-166`) and `handleCandidateSelect`'s id-compare (`:423`) need no change.
- **F4 · P2 — The memorize clock cannot be paused or re-run from the teacher controls.** The countdown starts the instant a round sets up (`:193-206`); the remote group is Skip Round / Correct / Redo / End only (`ContextualControls.tsx:232-240`) — there is no "Show Again"/pause like WHATS_MISSING's replay control, so a teacher still introducing the round either burns the clock or skips the round wholesale.
- **F5 · P2 — 8/10-card grids are undersized and cramped on projection.** Cards are fixed `aspect-square w-40 md:w-44` (`:536`, `:591`) in a hard `grid-cols-4` when `gridSize > 4` (`:529`, `:587`): 8 cards = two rows of ~160–176px images inside `max-w-5xl`; the 10-card round squeezes a third row. At 5–8m these are small, and there is no responsive reflow. (Partially self-resolves under the §2 4–6 card cap — keep as sizing guidance for the redesign.)
- **F6 · P3 — Produce rounds silently depend on the board tab's mic.** Speech recognition requires board-tab permission + a supporting browser (`:630-683`); a denied/unsupported board degrades every produce round to the word-button MCQ with no teacher-facing signal (MARK_CORRECT remains the documented manual path).
- **F7 · P3 — Countdown ring and prompts are small at distance.** The ring is a `w-20 h-20` svg with a `text-3xl` number (`:515-526`); "Memorize the cards!" is `text-xl text-gray-600` (`:512`) — below the projection legibility bar the prelude sets.
- **F8 · P3 — Double-miss path shows no teaching content.** By exception the missing card is never revealed (`:396-404`, correct for the mechanic), but the word itself is also never shown — the round ends on "Missed it — moving on…" (`:581-583`) with no word/audio beat; the missed word's only remediation is the background `logAttempt` push.
- **F9 · P3 — Chrome duplication + palette clash.** In-game picked-student footer (`:737-746`) duplicates the BoardShell whose-turn banner; light cyan-on-white palette vs the shell's dark PRACTICE wash; the 240px leaderboard rail stays up (`BoardShell.tsx:41,112` — MEMORY_LAB not in FULL_BLEED_TYPES); the terminal card is generic (no per-student rounds/words summary despite the stats existing in state, `:725-733`).

**What already works well (context — don't re-litigate):** coverage-first tested-card selection (`testedCardsRef`), seeded identical deals on every tab (E1.5), generation-guarded advance timers (skip races can't double-advance), the choral callout beat, the tension tick loop with airtight cleanup on every exit path, the never-reveal memory exception, MARK_CORRECT honored even during the choral callout (dead-button avoidance), background TTS pre-warm, and honest empty/loading states with a fix path.

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
