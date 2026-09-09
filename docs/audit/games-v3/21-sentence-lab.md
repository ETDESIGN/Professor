# Sentence Lab — v3 Quality Audit (`SENTENCE_LAB`)

> **Status:** **file-ready** — §0–§3 audited (agent-parallel 2026-09-10) + §2 confirmed + screenshots captured. Ready for Anti-Gravity §4.
> **Screenshots:** `screenshots/21-sentence-lab-idle.png`.

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

- **Flow type:** `SENTENCE_LAB`
- **Component:** `apps/board/templates/BoardSentenceLab.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** Skip (`SKIP_ITEM`) / Hint (`REVEAL_HINT`) / Check (`CHECK_ANSWER`) / Force ✓ (`MARK_CORRECT`) / Redo (`RESET_GAME`) / End (`SLIDE_COMPLETE`) — custom set, `ContextualControls.tsx:202-212`
- **Data sources:** `useEscalatingPool` (shell `SENTENCE_LAB`, 3 escalating rounds × 2 items) over `pool_items` of type `WORD_BANK_BUILD` / `TRANSFORM`; word banks seeded identically on every tab via `useSeedBase`
- **Mode:** picked student, per-item scored attempts, LCS partial credit

## §1 How the game works today

**Three escalating rounds × 2 sentence-building items; each item is one scored productive attempt for the picked student.** Pool via `useEscalatingPool` (`:89-97`), played from a per-round snapshot with a "Level up!" interstitial between rounds (`:103-122`, `:403-413`). Two item types are normalized (`:125-166`):

- **WORD_BANK_BUILD** — the common case (the owner's screenshot): target = the vocab word's `example_sentence` split into tiles; bank = those tokens **+ 2 distractor words** injected at generation time (random sibling unit words, `generate-exercises:143-148`). The prompt area gets only `translation` (the word's Chinese `l1_translation`) and a **Listen button that plays the word's audio** (`audio_url` = the word audio, not the sentence) — `:130-139`, `:479-495`.
- **TRANSFORM** — target = the pair's `transformed` sentence; the board re-derives 2 distractor words from the item's OTHER options at render time (seeded, `:140-163`); the prompt shows the rule instruction plus the original sentence, unstruck (`:482-484`).

**The build loop.** The bank renders as shuffled `text-xl` tiles with unique per-tile ids (duplicate words stay independently tappable, `:173-176`); tapping a tile appends it to the build area, tapping a placed tile removes it. **Check** scores `computeLCSPartialCredit(placed, target)` — ≥0.5 passes (`PARTIAL_PASS_THRESHOLD`, `scoringUtils.ts:23`) (`:304-353`). Pass → `succeed`: triple-write with the partial ratio, streak bonuses, confetti at 3/5, a ≤900 ms "… built it perfectly!" card with an optional **"Hear the sentence"** button (manual), then advance (`:270-302`, `:595-633`). Fail → −1 live penalty; placed tiles get **per-position LCS feedback** (green = right slot, amber = wrong slot) for a 1.5 s "Not quite right. Try again!" beat that then **wipes all placed tiles** (`:337, :344-350`); the 2nd consecutive miss triggers the **reveal**: the full correct sentence as amber tiles ("The correct sentence:"), ~2.4 s teaching hold, advance — no audio, no translation on the reveal (`:338-343`, `:572-590`).

**Hints are time-based and exact.** After 5 s of inactivity the hint level rises to 1, at 10 s to 2; each tile tap resets the clock (`:199-214`). Hint level >0 highlights the bank tile holding the **next needed word** (`targetTiles[placed.length]`); level 2 also pulses it (`:437-441`, `:526-540`). The remote Hint bumps the level on demand (`:241-242`). A partial build therefore has its next word literally lit — a strong giveaway by design.

**Remote controls:** Skip (next item, no penalty) / Hint (bump hint level) / Check (same as the board's Check) / Force ✓ (teacher override → clean success) / Redo (full reset to round 1) / End. Full `currentTurnId` reset (`:179-196`); natural completion → trophy card + `SLIDE_COMPLETE` broadcast (`:358-364`).

**Empty state:** "No sentence items ready for this unit yet. Run the exercise generator for this unit, or skip to the next slide." — English-only (`:421-432`).

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> We need to put the words in the right order. Same comment as Word Detectives: right now we just have on the top the word in Chinese, and also a button to listen. It's just writing "ground", but we need to complete the sentence — so we don't really know what we have to do, what kind of sentence we need to build. There is, in the sentence, a big difficulty because there are some words we obviously will not use (distractors). So we need to rethink/reorder this exercise in detail.

**Clarified with the owner (2026-09-09):**
- The build-prompt (currently a lone Chinese word + audio) is inadequate — Co-Work/Stitch to PROPOSE the prompt design (must make the task clear without revealing the answer; English-first rule refined 2026-09-09 (avoid Chinese when possible — a small Chinese instruction line is acceptable when the task otherwise is not clear)).
- Reveal-on-resolve confirmed: full sentence + audio + translation appear after the attempt; wrong attempts get progressive hints (word count / first letters).
- Distractor words are part of the difficulty by design — keep, but make the task frame clear.

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardSentenceLab.tsx` unless noted.

- **F1 · P1 — The build prompt under-defines the task: a lone Chinese word + word-audio cannot specify WHICH sentence to build.** For WORD_BANK_BUILD the prompt area renders exactly `translation` (the vocab word's Chinese `l1_translation`) and a Listen button playing the **word's** audio (`:479-495`; generation stamps `translation: meaning, audio_url: audio` — `generate-exercises:147`). The target is the word's `example_sentence` — but the board never shows the sentence length, a context line, or any picture, and nothing distinguishes *the* sentence to build from any other plausible sentence about that word. The owner's "we don't really know what we have to do, what kind of sentence we need to build" is structurally true: the information isn't in the content contract (no image, no sentence-length cue, no first-letters field) nor in the UI. This is the redesign's grounding fact — a task frame (image + "Build: N words" + optional first-word cue) needs new content fields or derived-from-target UI state, not a reskin.
- **F2 · P2 — Chinese is the ONLY prompt language, inverting the English-first rule.** Where Grammar/Word Detective sprinkle L1 alongside English, here the challenge frame is 100% Chinese (`:479-481`) — the strongest form of the problem the owner flagged across games. §2's refined rule (English-first, small Chinese instruction line acceptable when the task is otherwise unclear) suggests the inverse arrangement: an English task line ("Build the sentence — N words") with the Chinese word demoted to a supporting cue.
- **F3 · P2 — The reveal lacks everything §2 confirmed for it: no audio, no translation, no self-correction window.** The 2nd-miss reveal shows the amber target tiles for ~2.4 s and advances (`:572-590`); the success path's "Hear the sentence" is a manual button on the feedback card only (`:618-630`). Nothing auto-plays the sentence audio, nothing shows the L1 translation after the attempt, and there is no re-try window against the revealed answer — the §2 spec ("full sentence + audio + translation appear after the attempt") is entirely unimplemented. Note the sentence audio itself often doesn't exist: WORD_BANK_BUILD stores only the word's `audio_url`; the sentence would need the reference-based `useSpeech` path the listening games already use.
- **F4 · P2 — A failed check wipes the whole attempt, defeating self-correction.** The per-position green/amber feedback (`:337`) shows for only 1.5 s before `setBuildTiles([])` clears everything (`:344-350`). The kid never gets to fix just the amber slots — the scaffolding the per-position coloring promises is discarded, and rebuilding from scratch costs time and (on another fail) another −1. §2's progressive-hints/self-correct direction wants the amber slots preserved for editing.
- **F5 · P2 — Hint level 1 already lights the exact next word — no graded ladder.** The 5 s/10 s timers both resolve to the same highlight-the-next-needed-tile action, differing only in a pulse animation (`:437-441`, `:526-540`). §2's progressive-hint design (word count → first letters → tile highlight) would demote today's level-1 behavior to the LAST rung; today the strongest hint arrives after 5 seconds regardless, which also drains the difficulty the distractors are supposed to add.
- **F6 · P3 — Distractor words are random siblings, not sentence-aware decoys.** WORD_BANK_BUILD banks get 2 arbitrary sibling unit words (`generate-exercises:146`); TRANSFORM gets words from the item's other options (`:147-155`). They reliably read as "obviously not used" (the owner's observation) because they're topically random — harder would be inflected/positional variants (e.g. wrong tense of a target word). Keep-by-design per §2, but the redesign can tune difficulty here without touching fairness.
- **F7 · P3 — TRANSFORM items show the full original sentence as the prompt** (`:482-484`) — a much stronger task frame than WORD_BANK_BUILD gets, which makes the shell inconsistent: two item types with near-opposite prompt quality alternate inside one game skin.
- **F8 · P3 — English-only empty state + sub-projection chrome.** Same teacher-jargon empty card as the other labs (`:421-432`); `text-xl` bank tiles and `text-2xl` Check in a fixed `max-w-3xl` card (`:476`) — no responsive reflow, small for 5–8 m.
- **F9 · P3 — Bare `setTimeout` advances** (succeed/reveal/checking holds, `:301, :343, :346-350`) — not cancellable via ref like Grammar Lab's `advanceTimerRef`, so a Redo/Skip racing a hold can double-advance.

**What already works well (context — don't re-litigate):** per-tile unique ids (duplicate words independently tappable), next-needed-tile hint (a real fix over the old random-position hint), LCS partial credit with per-position coloring concept, seeded identical banks across tabs, 3-round escalation from snapshots, reveal-on-wrong as a teaching beat, full lifecycle latches, and the most complete remote set of the five games (Skip/Hint/Check/Force ✓/Redo/End).

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
