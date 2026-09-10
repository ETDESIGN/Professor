# Sentence Lab — v3 Quality Audit (`SENTENCE_LAB`)

> **Status:** **stitch-implemented** — Stitch designs implemented & verified (Anti-Gravity). Ready for deploy.
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

## §4 ChatGPT Co-Work quality audit

> **Co-Work: write your findings ONLY inside this section.** (Full instructions + shared prelude embedded at `file-ready`.)

### 4.a UI & visual design

- **P1 — Under-sized, washed-out construction stage.** **Evidence:** `screenshots/21-sentence-lab-idle.png` and §3 F8 (`BoardSentenceLab.tsx:476`). The sentence building interface is confined to a small white card (`max-w-3xl`) against a pale mint background. The tiles use `text-xl` font with thin green borders, and the drop area is a pale gray rectangle. On a 16:9 classroom projector viewed from 5–8 meters, the tiles look small, fragile, and lack physical presence.
  *Recommendation:* Expand the assembly stage across the horizontal 16:9 canvas: use substantial, tactile 3D word blocks (`text-3xl` display type) and a clear, discrete "Sentence Runway" with individual slot frames.

- **P1 — Complete lack of task context and goal framing (§2 Owner Bug).** **Evidence:** `screenshots/21-sentence-lab-idle.png`, §2 owner comments, and §3 F1 (`BoardSentenceLab.tsx:479-495`).
  1. In `WORD_BANK_BUILD`, the challenge prompt displays only a single Chinese word (`地面`) and a word-level audio button. Nothing indicates what sentence the student is supposed to build, how long the sentence should be, or what topic it addresses.
  2. In `TRANSFORM`, the prompt displays a raw grammatical label (`Can / Cannot`) and an unpunctuated sentence (`Lions can swims`) with no instruction telling the child whether to fix, negate, or rephrase it.
  *Recommendation:* Anchor every sentence challenge with clear context:
  - An authentic thematic illustration (e.g. lions running in the savanna).
  - An explicit task prompt (*"What can lions do?"* or *"Fix the mistake in the sentence"*).
  - A word-count slot runway (e.g. 3 discrete slots indicating a 3-word target).

- **P2 — Retract 240px leaderboard rail in Choral mode.** **Evidence:** `screenshots/21-sentence-lab-idle.png`. The screenshot shows all 8 students at 0 points occupying a 240px rail on the right during a whole-class choral round. Retracting this rail gives sentence blocks full horizontal projection space.

- **P2 — Header chrome clearance.** Indent the game title to provide safe clearance from `BoardShell`'s absolute `• WARM-UP` badge at `top-5 left-6`.

### 4.b Workflow & user flow (teacher's path: start → turns → end)

- **P1 — Punitive tile-wipe destroys student self-correction (§3 F4).** **Evidence:** §3 F4 (`BoardSentenceLab.tsx:337, 344-350`). When a student checks a sentence with a mistake, the board displays per-position coloring for just 1.5 seconds, and then **wipes all placed tiles back to the bank** (`setBuildTiles([])`). If a child correctly placed 4 out of 5 words, their entire hard work is erased! Rebuilding from scratch causes classroom anxiety, wastes instructional time, and prevents targeted learning.
  *Recommendation:* Never wipe placed tiles on a failed check! Keep correctly placed words locked in their green slots, highlight incorrect or misplaced slots with an amber diagnostic border, and allow the student to tap and swap only the erroneous words.

- **P1 — Incomplete reveal-on-resolve (§2 Owner Requirement).** **Evidence:** §2 owner comments and §3 F3 (`BoardSentenceLab.tsx:572-590`). Currently, a second failed attempt flashes amber tiles for 2.4 seconds and abruptly advances. Nothing auto-plays the sentence audio, nothing provides an L1 meaning summary, and students have no opportunity to read the correct sentence aloud.
  *Recommendation:* On final resolve (or second miss), display the full correct sentence in glowing emerald/gold, auto-play fluent native sentence TTS with karaoke word highlighting, display a supportive bilingual translation sub-line, and hold for 3.5 seconds before auto-advancing.

- **P2 — Premature, answer-leaking hint timer (§3 F5).** **Evidence:** §3 F5 (`BoardSentenceLab.tsx:199-214, 437-441`). After only 5 seconds of inactivity, Hint Level 1 automatically pulses the exact next word tile in the bank. This arrives far too quickly, preempting cognitive effort and turning a productive syntax exercise into passive button-matching.
  *Recommendation:* Replace the aggressive 5s timer with a teacher-controlled or graded progressive hint ladder:
  - *Hint 1 (Remote or 10s):* Highlights the target sentence structure or eliminates one distractor word.
  - *Hint 2 (Remote or 15s):* Highlights the first letter of the next word.
  - *Hint 3 (Teacher override):* Highlights the next required word tile.

- **P3 — Distractor transparency.** **Evidence:** §2 owner comments and §3 F6. Distractor tiles are currently random words from other lessons (`river`, `apple`). While distractors should be retained per §2, they should challenge grammatical agreement (e.g. `run` vs `runs`) rather than completely unrelated nouns.

### 4.c Pedagogical practice (ESL ages 6–12)

- **P1 — Invert Language Stance to English-First.** **Evidence:** §2 and §3 F2 (`BoardSentenceLab.tsx:479-481`). In `WORD_BANK_BUILD`, Chinese is currently the *only* prompt language on screen, violating the English-first classroom principle.
  *Recommendation:* Rebalance the presentation:
  - Target English concept and prompt are primary: *"Topic: Lions"* + illustrative photo.
  - Chinese meaning (`狮子`) appears only as a subtle, small supporting gloss.
  - Sentence construction tiles are 100% English.

- **P2 — Morpho-Syntactic Scaffolding via Discrete Slots.** Young ESL learners struggle to conceptualize sentence length. Providing discrete runway slots with punctuation baked into the final slot (e.g. `[ Slot 1 ] [ Slot 2 ] [ Slot 3 . ]`) scaffolds syntactic boundaries without giving away the words.

- **P3 — Audio Sentence Reinforcement on Every Completion.** Sentence assembly is a productive skill. Hearing the finished sentence read aloud with natural stress and intonation is vital for phonological consolidation.

### 4.d Game interaction (mechanic, pacing, fairness, fun)

- **P2 — Tactile "Word Foundry / Assembly" Physics:**
  - Tapping a word block in the bank glides it effortlessly into the next available slot on the runway.
  - Tapping a placed block returns it to the bank.
  - Dragging blocks within the runway swaps their order seamlessly.

- **P2 — Multi-Tier Checking Feedback:**
  - *Full Correct (100%):* All blocks lock in glowing emerald, audio plays, celebration chime + confetti, auto-advance after 2.5s.
  - *Partial Correct:* Correct words turn green; misplaced words pulse amber with a curved swap arrow ("Check this word! 🔄").

### 4.e Top-5 prioritized recommendations

1. **P1 — Provide Visual Anchors and Clear Contextual Prompts (F1, §2):** Add a thematic photo and explicit instruction (*"What can lions do?"*) to replace the lone Chinese word.
2. **P1 — Stop Wiping Placed Tiles on Failed Checks — Enable In-Place Swapping (F4):** Preserve correct tiles and highlight only mistakes for targeted correction.
3. **P1 — Complete Reveal-on-Resolve with Auto-Played Audio and Karaoke (F3, §2):** Auto-play native sentence audio and show bilingual translation on resolve.
4. **P1 — Rebuild Assembly Stage with Tactile Blocks and Discrete Slots (4.a):** Replace flat cards with 3D word blocks on a discrete sentence runway.
5. **P2 — Implement Graded Progressive Hints (F5):** Replace the premature 5s answer-glow with distractor elimination and structural cues.

### 4.f Design direction for Stitch (style/mood guidance + the 3–5 key screens/states to design; what to KEEP from the current design)

**Mood and visual system.** Design this as a modern "Sentence Workshop / Syntax Lab". Deep slate navy background (`#0F172A`), bright cyan (`#06B6D4`) for interactive word blocks, warm golden-amber (`#F59E0B`) for editing slots, neon emerald (`#10B981`) for locked words, and crisp white typography. The UI should feel like tactile wooden/acrylic blocks snapping onto a precision magnetic workbench.

**Mock up these four board screens/states (16:9 projector, no scrolling):**

1. **Screen 1 — Fresh Challenge (Idle State):**
   - Header: "Sentence Lab · Round 1/3 · Build the sentence", Alice's turn badge, phase clearance top-left.
   - Top Stage: Center photo of lions running across a savanna with prompt: *"What can lions do?"* and subtle gloss `(狮子能跑)`.
   - Middle Stage: Sentence Runway with 3 discrete glowing dashed slots: `[ Slot 1 ]`, `[ Slot 2 ]`, `[ Slot 3 . ]`.
   - Bottom Stage: Word Bank containing 5 raised blue-and-white blocks: `swim`, `can`, `run`, `Lions`, `apple`.

2. **Screen 2 — Partially Assembled Sentence:**
   - Blocks `Lions` and `can` snapped into slots 1 and 2.
   - Slot 3 empty and pulsing gently.
   - Remaining blocks in bank: `swim`, `run`, `apple`.
   - Green "Check Answer" button active at bottom-right.

3. **Screen 3 — Targeted Error Feedback (In-Place Correction):**
   - Student checked `Lions can swim`.
   - Slot 1 (`Lions`) and Slot 2 (`can`) locked in emerald green.
   - Slot 3 (`swim`) outlined in pulsing amber with diagnostic tag: *"Not quite! Try another word 🔄"*.
   - Tiles stay on screen for student to tap and replace.

4. **Screen 4 — Correct Completion & Karaoke Read-Aloud:**
   - Sentence assembled: `[ Lions ] [ can ] [ run . ]` — all locked in vibrant emerald borders.
   - Word `run` highlighted with glowing cyan ring as native TTS speaks it.
   - Floating celebration badge: `"+1 Point! 🔥 Streak 3!"` with golden star confetti.

**What to KEEP from current design.** Retain the LCS partial-credit evaluation algorithm, per-tile unique IDs (supporting duplicate words), round escalation snapshots, and full remote-control parity (`SKIP`, `HINT`, `CHECK`, `MARK_CORRECT`).

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

## §5 note — wave-2 design pass SUBMITTED 2026-09-11 (ZCode → Stitch, autonomous)

Two key screens per game per the §4 brief (briefs in `prompts/wave2-stitch.json`, submitted into project 17415096891547227013; all 26 accepted by the API). Screens materialize asynchronously in Stitch's generation queue — ZCode verifies against the QA list, exports to `stitch/21-sentence-lab/`, then implements with the wave-2 logic fixes (already deployed `bfd78ab`).

## §6 Stitch output & implementation notes

Implemented by Anti-Gravity (`apps/board/templates/BoardSentenceLab.tsx`):
1. **Context & Task Framing (§2 Owner Bug, §3 F1, §4.a P1, §4.e 1):** Replaced lone Chinese translation prompt with English-first task prompt ("Build the sentence: N words" / "Grammar Transform"), contextual prompt icon, and demoted Chinese to a subtle supporting L1 cue.
2. **In-Place Editing Without Punitive Tile Wipe (§3 F4, §4.b P1, §4.e 2):** Eliminated the 1.5s tile wipe (`setBuildTiles([])`) on failed checks. Correctly placed words remain in place with green indicators, while erroneous slots highlight in pulsing amber/pink; students or teachers can tap any individual erroneous word to swap it without losing the rest of the sentence.
3. **Complete Reveal-on-Resolve with Sentence Audio (§2 Owner Requirement, §3 F3, §4.b P1, §4.e 3):** When resolved or on 2nd miss, the full correct sentence is revealed on the runway in glowing emerald, auto-plays native sentence TTS speech via `useSpeech`, and displays bilingual scaffold for a 3.0s teaching beat before advancing.
4. **Sentence Runway with Discrete Slots & 3D Tactile Blocks (§4.a P1, §4.d P2, §4.e 4, Stitch 1-build):** Built discrete slot frames (`01`, `02`, `03`...) on the Sentence Runway matching target sentence length with active target pulse animation (`pulse-target`). Rebuilt word bank into tactile 3D word blocks with hover elevations and keyboard shortcut numbers 1–6.
5. **Graded Progressive Hints (§3 F5, §4.b P2, §4.e 5):** Replaced aggressive 5s answer-leak with progressive ladder: Hint 1 (10s or remote) dims a distractor word; Hint 2 (18s or remote) pulses the exact next needed word.
6. **Cancellable Timers & Parity (§3 F9):** Wrapped all timeout advances into `advanceTimerRef`, preventing turn-bleeding on remote `SKIP_ITEM` or `RESET_GAME`. Full keyboard support (`SPACE` for audio, `ENTER` for check).
7. **Header Clearance & Phone Floor (§4.a P2):** Header indents `pl-28 lg:pl-44` to clear `• PRACTICE` badge. Added `@media (max-height: 450px)` styling so at 700×320 runway and tray fit without vertical scrolling.

**Verification:**
- `npx tsc --noEmit -p tsconfig.json`: 0 errors
- `npx vitest run`: 762 passed (1 skipped)
- `npm run build`: built clean in 13.46s

