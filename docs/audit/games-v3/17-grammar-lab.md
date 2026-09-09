# Grammar Lab — v3 Quality Audit (`GRAMMAR_LAB`)

> **Status:** **file-ready** — §0–§3 audited (agent-parallel 2026-09-10) + §2 confirmed + screenshots captured. Ready for Anti-Gravity §4.
> **Screenshots:** `screenshots/17-grammar-lab-idle.png` — captured in the empty state — the §2 symptom itself (bilingual fix point in §3).

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

- **Flow type:** `GRAMMAR_LAB`
- **Component:** `apps/board/templates/BoardGrammarLab.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** Skip (`SKIP_ITEM`) / Hint (`REVEAL_HINT`) / Correct (`MARK_CORRECT`) / Steal (`STEAL_OFFER`) / Redo (`RESET_GAME`) / End (`SLIDE_COMPLETE`) — custom set, `ContextualControls.tsx:162-172`
- **Data sources:** `useEscalatingPool` (shell `GRAMMAR_LAB`, 3 escalating rounds × 2 items) over `pool_items` rows of type `ERROR_SPOT` / `TRANSFORM` / `GRAMMAR_FILL`, built deterministically by the `generate-exercises` edge function from the unit's `grammar_rules` manifest (enrich-unit output)
- **Mode:** picked student, per-item scored attempts; steal variant (stealer re-answers for half points)

## §1 How the game works today

**Three escalating rounds × 2 items, each item its own scored attempt.** The pool comes from `useEscalatingPool` (`:151-159`) which asks `lessonDirector.buildRound` for mastery-gated objectives and rungs; round 1 pulls lower rungs, rounds 2–3 escalate (`TOTAL_ROUNDS = 3`, `roundSize: 2`). Items are played from a per-round snapshot so a refetch can't blank the board mid-item; between rounds a "Round N — Level up!" interstitial holds until the higher-rung items land, and if the higher rung has no content the slide ends (`:586-596`).

**Per item: a 2-second "pattern" beat, then the answer phase in the item's rung shape.** The pattern card shows the rule's `instruction` (e.g. "Subject + Verb + Object") plus `explanation` if present (`:699-717`). The three shapes render as:

- **ERROR_SPOT (rung 2, receptive MCQ):** the wrong sentence is shown and "Which fix is correct?" offers the correction options (`:730-763`). The stem is `content.sentence` (the `wrong` text), the options are `content.options` with `correct_index` — all generated upstream (see F2).
- **TRANSFORM (rung 3, productive tile assembly):** the instruction + the struck-through original sentence; the student builds the transformed sentence by tapping tiles from a bank = target words + 2–3 real distractor words drawn from the item's other options, seeded identically on every tab (`:203-221`). "Check" scores via LCS partial credit (`computeLCSPartialCredit`, pass ≥ 0.5).
- **GRAMMAR_FILL (rung 4, receptive MCQ):** a pattern-with-blank stem ("Which sentence uses the rule correctly?") over sentence options (`:835-870`).

**Attempt flow.** Correct → `scoreForAttempt` on the picked student (difficulty from `poolItem.difficulty`, streak bonus at 3/5, confetti + sound cues) + a ≤900 ms feedback card with the picked student's name ("… cracked the grammar!") → auto-advance (`:351-395`). Wrong → −1 live via `addPoints`, streak reset, wrong-tap flashes red 700 ms; the **second consecutive miss triggers the reveal-on-wrong teaching beat** — the correct option/tiles get an amber ring, the explanation shows, ~2.2 s hold, then advance with no further attempts (`:423-431`, `:508`). Every outcome triple-writes points + `logAttempt` analytics + remediation push.

**Steal mechanic (unique to this game).** During the 2nd-miss reveal hold, the commander's **Steal** button (`ContextualControls.tsx:168`) opens a steal window: the reveal timer is cancelled, the item freezes (the stealer pick's `NEW_TURN` is suppressed so the board isn't wiped), and after the teacher spins for a stealer, that student re-answers the SAME item for half points via the 0.5 partial-credit ratio — no streak credit; a wrong steal goes straight to the reveal (`:112-148`, `:250-273`, `:438-477`). One steal per item, latched until the item advances.

**Remote controls:** Skip (advance item, no penalty) / Hint (MCQ shapes eliminate one wrong option — dim + strikethrough, never paints the answer; TRANSFORM highlights the next-needed tile) / Correct (teacher override → forced full success) / Steal / Redo (full reset to round 1) / End (forced complete). The board also handles inbound `SLIDE_COMPLETE` idempotently (`:325-329`).

**Empty state:** when the pool resolves with nothing usable (the unit has no grammar objectives / their pool items weren't generated), the board shows a centered card: "Grammar Lab — No practice items ready yet. Grammar objectives unlock here after the class has been introduced to the rule (run the Grammar presentation first) — or skip to the next slide." (`:604-615`) — English-only (see F5). Natural completion (all 3 rounds) → trophy card + confetti + `SLIDE_COMPLETE` broadcast (`:482-490`).

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> It's writing "no practice items available yet — grammar objectives unlock after the class has been introduced to the rules during the grammar presentation, so keep to the next slide". But okay, on the next slide I can see "subject" + "verb". Maybe this explanation should be in the language of the student. In this case, right now we're just starting with Chinese, but later there will be more languages. So right now the explanation of the grammar maybe should have some Chinese, or a more complete explanation. / After we get to the next screen ("Penguins living in the jungle — which fix is correct?"), we have options like: "snake and climb", "penguin living in the jungle", "the monkey do eat fish", and "whales live in the river". Obviously the answer is exactly the same as the original sentence — it's exactly the same, all just talking about animals or something. So this system has something wrong in its terms, and the answer is too obvious in a way, and plus there is nothing to correct exactly. For example, we could have "penguins don't live in the jungle" / "penguins live in the jungle" / "penguins something something something". But we need to make it more robust — we need to understand this material/content generation and how to make it better.

**Clarified with the owner (2026-09-09):**
- Empty-state explanation shown BILINGUAL: Chinese + English (pattern must extend to more languages later).
- ERROR_SPOT content is broken: the "correct" option is identical to the original sentence and distractors are nonsense ("snake and climb", "the monkey do eat fish").
- Fix direction: AUDIT THE CONTENT GENERATION FIRST (root-cause why such items are emitted), then decide the fix (owner decision 2026-09-09).

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardGrammarLab.tsx` unless noted.

- **F1 · P1 — ERROR_SPOT distractors are other items' answers, not plausible fixes of the stem.** The board shows `content.sentence` (the `wrong` text) and asks "Which fix is correct?" over `content.options` (`:730-763`) — but those options are built in `supabase/functions/generate-exercises/index.ts:198-206`: for each error example, `distractors = errors.filter(x => x.correct !== correct).map(x => x.correct)` — i.e. the **`correct` sentences of the OTHER error examples under the same grammar objective**, shuffled with the real fix by `buildChoices`. Since error examples within one objective are unrelated unit-themed sentences (all animals in the owner's example), the option set becomes "snake and climb" / "the monkey do eat fish" / "whales live in the river" while the real fix shares ~90% of the stem. Mechanically this produces BOTH owner symptoms at once: (a) nonsense distractors — fragments/still-wrong sentences lifted verbatim from sibling items; (b) a trivially identifiable answer — the only option that resembles the stem, findable by word-matching with zero grammar. The exercise tests similarity-spotting, not error correction.
- **F2 · P1 — No generation-time validation of the `{wrong, correct}` pairs, so degenerate items pass straight through.** `enrich-unit` prompts the model for `error_examples: pairs {wrong, correct}` (`supabase/functions/enrich-unit/index.ts:645,697`) and `generate-exercises` guards only against empty strings (`:199-202`). Nothing checks `wrong !== correct`, edit distance, that `correct` is itself grammatical (the owner's "the monkey do eat fish" was some example's `correct` field verbatim), or that a fix actually differs in the drilled rule. When the model emits a near-identical pair, the "correct" option renders as a copy of the displayed sentence — the owner's "there is nothing to correct exactly". This is the root cause the owner asked to audit; the fix belongs in enrich-unit's prompt/schema constraints AND generate-exercises validation (reject or regenerate pairs where the normalized edit distance is 0 or the pair doesn't exercise the rule).
- **F3 · P2 — Single-error objectives collapse to a 1-option MCQ.** With one usable error example, `buildChoices(correct, [], Math.min(4, 0+1))` returns exactly one option (`supabase/functions/_shared/exerciseTypes.ts:69-73` never pads or duplicates). The board renders a single tappable option (`:738-760` has no minimum-option guard) — tap the only button, collect points. Same thinning applies when several examples share one `correct` string (the exact-string filter at `generate-exercises:203` drops duplicates from the distractor pool).
- **F4 · P2 — The distractor design is structurally wrong for the task even with good content.** A "which fix is correct?" MCQ wants distractors that are *plausible wrong fixes of THIS sentence* (the owner's proposal: "penguins don't live in the jungle" / "penguins live in the jungle" / minimal variants). Sibling `correct` sentences can never be that. Any content-side fix must generate per-stem distractors (perturb the fix on the drilled rule: wrong agreement, wrong auxiliary, word order) rather than reusing sibling rows — a `generate-exercises` build change, not a board change.
- **F5 · P2 — Empty-state card is English-only, teacher-jargon, and under-sized for projection** (`:604-615`). The copy "No practice items ready yet. Grammar objectives unlock here after the class has been introduced to the rule (run the Grammar presentation first) — or skip to the next slide." is the exact fix point for §2's bilingual ask: it speaks to the teacher about app concepts ("grammar presentation", "slide") in English at `text-xl text-gray-500` on a kid-facing projected screen. The bilingual pattern (Chinese first at this market stage, English secondary, extensible to more languages later) needs a shared empty-state component, because the same English-only card exists in Word Detective (`:371-382`), Sound Lab (`:451-462`), Sentence Lab (`:421-432`) and Phonics Arena (`:423-434`).
- **F6 · P2 — The pattern/teaching beats are English-only too.** The pattern card (`:707-715`) and the reveal explanation (`:872-884`) render `instruction`/`explanation` with zero L1 support, while §2 explicitly wants the grammar explanation "in the language of the student… some Chinese, or a more complete explanation". The pattern is also set in `font-mono` ("Subject + Verb + Object") — a developer aesthetic on a kids' board. Note: enrich-unit's grammar schema (`grammar_rules.explanation`) has no bilingual field today, so this is a manifest-schema + generation gap, not just markup.
- **F7 · P3 — Dead "Hear it" button in the feedback card.** The button renders for every non-TRANSFORM item with options (`:911-918`) but its onClick is `content.audio_url && playAudioUrl(...)` — and grammar pool items are pushed with no audio field (`generate-exercises:205,231,252`). It looks tappable and does nothing.
- **F8 · P3 — GRAMMAR_FILL's stem is a pattern template, not a sentence.** `sentence_with_blank` is filled with `g.pattern_template` (`generate-exercises:254`), so rung 4 shows "Subject + ___ + Object" above "Which sentence uses the rule correctly?" — the two lines read as unrelated puzzles.
- **F9 · P3 — The Steal window is invisible and easy to miss.** `STEAL_OFFER` is only honored during the ~2.2 s reveal hold (`phase === 'answer' && revealed`, `:336`); everywhere else the commander's Steal tap is a silent no-op. Nothing on the commander tells the teacher the window is open — the mechanic depends on reaction timing during a teaching beat. Also ~230 lines of steal plumbing (freeze, latches, banners) exist for this one game; any v3 redesign should decide whether steal survives before re-skining it.
- **F10 · P3 — Fixed `max-w-3xl` card, no responsive reflow** (`:728`) — same phone-landscape floor gap as the other PRACTICE templates; MCQ option rows are `text-xl` which is at the low end for 5–8 m projection.

**What already works well (context — don't re-litigate):** the lifecycle discipline (per-item `mistakesRef`/`awardedRef`/`resolvedRef` latches, cancellable advance timers, steal freeze on `NEW_TURN`, pure advance updater), LCS partial credit + real distractor words on TRANSFORM banks, the reveal-on-wrong teaching beat with explanation, seeded deterministic tile banks (identical on every tab), streak bonuses with confetti/sound cues, round escalation from snapshots with an interstitial, and full remote parity (Skip/Hint-eliminates-wrong/Correct/Steal/Redo/End). The board side of this game is solid — the P1s live upstream in content generation.

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
