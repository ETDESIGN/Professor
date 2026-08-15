# Per-Game Design Prompts — Professor (v2, post-architecture)

> **What changed in v2.** The holistic architecture (`professor-live-architecture-design.md`) is now agreed, and the owner has resolved the open decisions. These prompts now:
> - **Embed the architecture as fixed context** (the new shared prelude) so each prompt references the agreed mechanisms by name (`SHELL_CAPABILITIES`, `useEscalatingPool`, the vocab/grammar/story ladders, unified scoring, `BoardGrammarForge`, the remediation queue, phase envelopes).
> - **Carry the 4 owner decisions + 3 minor defaults** as constraints (not options) — see "Owner decisions" below.
> - **Follow the architecture's phase sequencing** (§6.3): foundational infrastructure (Prompt 0) → scoring core → escalation engine → reference games → grammar strand → unscored promotions → story/dialogue → assessment → teacher-flow polish.
> - **Lead with a new Prompt 0** (Phases 0–2 of the architecture: bug fixes, unified scoring, shell-capability + escalation engine) — everything else depends on it.
>
> **How to use.** Run the prompts **in order**. Each is self-contained — paste it into a fresh Claude conversation with `GAMES_AUDIT.md` **and** `professor-live-architecture-design.md` attached. Claude does not need prior per-game conversations. Within a prompt, copy everything between the `═══════` markers.
>
> **Scope note.** Some prompts are now "design + spec," others are "spec against an already-agreed design." Prompt 5 (grammar) and Prompt 0 (infra) are the most design-heavy; the game prompts are mostly "spec the implementation of the architecture's §6.1 portfolio entry for this shell."

---

## Owner decisions (LOCKED — apply to every prompt, not negotiable)

These were resolved by the owner after the architecture doc. Treat them as hard constraints, not options to re-litigate.

1. **Analytics correctness signal — RESOLVED 2026-08-05 (separate write path).** The original framing ("add a correctness flag to `point_transactions.metadata`") does NOT work: `addPoints` is debounced (1500ms) — a `+30` success and a `-5` mistake in the same window coalesce into one ledger row, so a single `metadata.correctness` value is meaningless. Resolution: **keep the debounced points flush exactly as-is** (it works; don't touch it), and add a **separate, non-debounced write** for the per-attempt correctness signal. Implementation choice: a dedicated `recordAttempt(studentId, {objectiveId, exerciseType, correctness: 'correct'|'incorrect'|'partial', difficulty})` helper that writes a `point_transactions` row with `amount=0` and `metadata.correctness` set (or a small `session_attempts`-style lightweight log — to be finalized in Phase 1, but separate from the points flush either way). Analytics reads filter to the correctness-bearing rows. **No change to `addPoints`' signature or the points flush.** Game code calls BOTH: `addPoints(id, delta)` for the leaderboard AND `recordAttempt(...)` for analytics — they're two concerns, two paths.
2. **Pronunciation capture is DEFERRED.** `evaluate-pronunciation` results are **not persisted** this phase, and STT is **not called per picked student**. The speaking strand stays **choral/engagement-only** this phase. Pure speaking drill (`ISayYouSay`) does not score. **Important reconciliation:** *teacher-judged* scoring (the teacher's binary or 3-way rating) is fine everywhere — it respects the projector model. Only *automated pronunciation* scoring is deferred. So dialogue role-play and grammar free-production CAN still be scored — by the teacher, not by STT.
3. **Grammar free-production (rung 4 of BoardGrammarForge) is scored by a teacher-operated 3-way rating** (correct / partial / incorrect), feeding `partialCreditRatio` directly. Do not propose student-device capture.
4. **OUTPUT-phase free-production rounds use a per-round teacher toggle:** choral (class attempts, nobody scored) OR picked-student (full lifecycle scoring). The shell exposes the toggle. Default is up to the designer; justify it.
5. **`ELIMINATION` selection mode is retired** (zero current use — audit §I). Remove it from the type and the UI.
6. **Phase-envelope enforcement is a dev-time warning first**, not a hard build-time gate (the pool is only now starting to populate; a hard gate would block legitimate lessons). Design the warning hook; do not build the gate.
7. **`BoardMagicEyes` is merged into `BoardWhatsMissing`** as one component with two modes (the architecture §6.2 already calls this). No separate MagicEyes prompt.

---

## ═══════ SHARED PRELUDE (embedded verbatim in every prompt below) ═══════

> Shown here once for reference. Each prompt reproduces a compressed version so it stands alone.

**You are designing for "Professor"** — a teacher-facing ESL/EFL tool for live, in-classroom English instruction to children aged 6–12 (primary market: China; L1 is Simplified Chinese). Authoritative context: **`GAMES_AUDIT.md`** (the audit). Agreed architecture: **`professor-live-architecture-design.md`** (the design doc — read it; its §1–§7 are the spec you implement against).

**Classroom model (hard constraint).** Three browser tabs converge via Supabase Realtime: Commander (teacher desktop), Remote-Baton (teacher phone), Board (projected to the whole class). Students have NO device; the teacher performs all input. Realtime uses `broadcast: { self: false }` — every sender must also optimistically `setState`.

**The agreed architecture (fixed — implement, don't redesign):**
- **Pedagogical model:** a receptive→productive spiral. Each objective climbs a **ladder of rungs** (vocab: 5 rungs; grammar: 4; story/dialogue: 3). Rung = a point on the existing `exercise_type × difficulty` space. See design doc §1.1 for the exact ladders.
- **Phase envelopes (§1.2):** each `Phase` (WARMUP/INPUT/PRACTICE/OUTPUT/ASSESS/WRAPUP/REVIEW) owns an allowed rung range + scoring posture. `PHASE_ENVELOPE` map colocated with `flowTypes.ts`. Enforcement = dev-time warning (decision 6), not a hard gate.
- **`nextRungForObjective(objective, srsState)` (§1.3):** the mastery→rung function. `new→rung1, learning→2-3, familiar→4, mastered→5, decaying→3`. Round number is a ceiling on ambition; mastery is the actual cap: `targetRung = min(roundBaseline, masteryRung)`.
- **`SHELL_CAPABILITIES` (§2.2):** a static map declaring what each shell consumes and its rung range, e.g. `FLASH_MATCH: { consumes: ['MEANING_MATCH','IMAGE_SELECT','AUDIO_L1_SELECT'], rungRange: [1,3] }`. Chosen over registry-as-driver (§2.2 Option B+C).
- **`useEscalatingPool` (§2.3):** a thin wrapper around the existing `useBoardPool` that, per round, calls `buildRound(...)` → `useBoardPool({ exerciseTypes: <rung-mapped types>, classWeak: true, ... })`. **Note:** `useBoardPool`'s `exerciseTypes` param must become settable per round, not once at mount (design doc §7.1 flags this).
- **Unified scoring (§3.1):**
  ```
  CLEAN_SCORE_BASE = 30; MISTAKE_PENALTY = 5
  DIFFICULTY_MULTIPLIER = { 1: 1.0, 2: 1.4, 3: 2.0 }   // receptive/constrained/free-production
  scoreForAttempt(mistakes, difficulty, partialCreditRatio = 1.0):
      base = CLEAN_SCORE_BASE * DIFFICULTY_MULTIPLIER[difficulty]
      raw  = max(0, base - mistakes * MISTAKE_PENALTY)
      return round(raw * partialCreditRatio)
  ```
  `pool_items.difficulty` already encodes 1=receptive/2=constrained/3=free-production (audit §D) — no separate modality lookup. Retire `pointsForCorrect`/`CORRECT_ANSWER_POINTS` (dead code). `BoardTeamBattle` migrates off its flat +15 onto this model.
- **Partial credit (§3.2):** scoped — pure MCQ stays binary; `WORD_BANK_BUILD`/`TRANSFORM` use LCS-based `LCS_length/target_length`; `ERROR_SPOT` with multiple sub-picks uses `correct_subpicks/total_subpicks`. (Pronunciation partial credit is deferred per decision 2.)
- **Error-driven feedback loop (§3.3):** 1st miss → re-present with narrowed hint; 2nd miss → corrective micro-explanation card; end-of-slide → missed objectives pushed to an in-memory `remediationQueue` (SessionContext-level, NOT a new table) that the next WRAPUP/REVIEW slide prioritizes. Separate from FSRS cross-lesson scheduling.
- **Visibility fixes (§3.4):** keep points floor-at-zero display, but add a per-turn "mistakes: •••" tally under the active roster chip + persist the "−5" toast ~3s; show "🔁 already scored this turn" chip when `awardedRef` blocks a re-pay; replace the wheel's "+? XP Waiting…" with a neutral "Let's see how you do!" at spin-time (the real +N appears on turn resolution).
- **Teacher flow (§4):** every scored shell registers a `ContextualControlsSpec` (Skip/Pass, Reveal Hint, Force-Correct, Next Round, End Slide) and a `SLIDE_COMPLETE` broadcast on its natural end condition. Advance stays **manual, always** (`SLIDE_COMPLETE` only glows the Next control). Exhaustively type the render switches (`ClassroomBoard.tsx` + `BoardRenderer.tsx` BOARD_MAP → collapse to **one canonical map** both import) via a `never`-check. Selection modes exposed honestly: "Everyone Gets a Turn" (ROUND_ROBIN, default), "Random" (RANDOM), "Cold-Call Fairness" (FAIR). `ELIMINATION` retired (decision 5).
- **Analytics (§4.4):** Class Accuracy = correct attempts ÷ total attempts (from the new `point_transactions.metadata.correctness` flag, decision 1). Struggling Students = `attempts_this_session ≥ 2 AND accuracy_this_session < 60%`.

**The lifecycle contract (sacred for any scored game — audit §E).** Four must-dos: (1) reset on `state.currentTurnId` change; (2) track mistakes with `useRef` + an `awardedRef` latch; (3) score via the unified `scoreForAttempt` above; (4) personalize via `usePickedStudent()`.

**Region-safe AI only.** OpenRouter gateway; Moonshot/Qwen/DeepSeek/Meta/NVIDIA. Never OpenAI/Google/Anthropic.

---

## ═══════ PROMPT 0: Foundational infrastructure (Phases 0–2 of the architecture) ═══════

> **Run this FIRST.** Everything else depends on it. This is the only prompt besides Prompt 5 with real design work; the rest are specs against what this establishes.

You are a senior front-end architect. Implement **Phases 0, 1, and 2** of the agreed architecture (`professor-live-architecture-design.md` §6.3). The shared prelude applies in full. Attachments: `GAMES_AUDIT.md` + the architecture doc.

### What this prompt delivers (the foundation every later prompt assumes)

**Phase 0 — Bug fixes (zero-risk, unblock nothing risky).**
- Fix `DIALOGUE_STAGE`'s missing registration in `BoardRenderer.tsx` `BOARD_MAP` AND `supabase/functions/_shared/flowTypes.ts` `SUPPORTED_FLOW_TYPES` (audit §I).
- Formally remove `POLL` from `SUPPORTED_FLOW_TYPES` (dead type, no component — audit §I). Remove any references.
- Retire `BoardGameArena` (older duplicate of `BoardWheelOfDestiny`; its "+50 XP Bonus" is decorative — audit §I). Decide: delete the file + remove its render entries, or keep as an alias. Recommend.
- Delete `pointsForCorrect` / `CORRECT_ANSWER_POINTS` from `scoringDefaults.ts` (dead code — audit §F, §I). Audit every caller first.

**Phase 1 — Scoring core.**
- Ship the unified `scoreForAttempt(mistakes, difficulty, partialCreditRatio = 1.0)` per §3.1 (full code). Keep the old signature available temporarily ONLY if needed for a migration shim — recommend whether a shim is needed given TeamBattle is the only caller of the old model.
- Add the **per-attempt correctness write path** (decision 1, resolved 2026-08-05: separate from the debounced points flush). Spec a `recordAttempt(studentId, {objectiveId, exerciseType, correctness: 'correct'|'incorrect'|'partial', difficulty})` helper that writes a `point_transactions` row with `amount=0` + `metadata.correctness` (non-debounced — every attempt gets its own row). **Do NOT change `addPoints`' signature or the points flush** — the debounced `awardClassPoints` path stays exactly as-is. Game code calls both: `addPoints(id, delta)` for the leaderboard AND `recordAttempt(...)` for analytics.
- Migrate `BoardTeamBattle` off its flat `+15` onto the unified model.
- Implement the three visibility fixes (§3.4): per-turn "mistakes: •••" tally under the active roster chip; persistent "−5" toast (~3s); "🔁 already scored this turn" chip when `awardedRef` blocks; replace the wheel's "+? XP Waiting…" with "Let's see how you do!" at spin-time.
- Add the `remediationQueue` to `SessionContext` (in-memory, SessionContext-level — NOT a table) per §3.3: push objectives missed by ≥1 student this turn; expose a `getRemediationQueue()` the next WRAPUP/REVIEW slide consumes. Specify the queue's data shape (`{objective_id, missed_by: studentId[], last_missed_at}`).

**Phase 2 — Shell-capability + escalation engine.**
- Define `SHELL_CAPABILITIES` (§2.2) — the static map. Populate it for **every shell in the portfolio** (architecture §6.1) with its `consumes` list and `rungRange`, derived from the ladders in §1.1. This is the contract every game prompt assumes.
- Define `PHASE_ENVELOPE` (§1.2) — phase → `{rungRange, scoringPosture}`.
- Implement `nextRungForObjective(objective, srsState)` (§1.3) — the mastery→rung function. Specify where it reads SRS state from (the existing `classWeakObjectives` / FSRS path in `services/boardLearner.ts`).
- Implement `useEscalatingPool({ unitId, shellType, roster, roundIndex, totalRounds })` (§2.3) — the wrapper around `useBoardPool`. **This requires changing `useBoardPool`'s `exerciseTypes` param from a static-mount value to a per-round settable value** (design doc §7.1 flags this). Specify the change precisely and audit every existing caller of `useBoardPool` for breakage.
- Implement `buildRound(roundIndex, objectivesInLesson, roster, phaseEnvelope)` (§1.3) — the round-builder. Uses `classWeakObjectives` (existing) + `nextRungForObjective` + the shell's `SHELL_CAPABILITIES`.
- Implement the dev-time phase-envelope warning (decision 6): when a shell requests content outside its phase's envelope, `console.warn` in dev builds only. No hard gate.

### Acceptance criteria
- All Phase 0 items done with caller audits.
- The unified scorer compiles, is difficulty/modality/partial-aware, and `addPoints` persists correctness metadata. TeamBattle migrated.
- The three visibility fixes are real (not just spec — describe the UI placement and the realtime broadcast each needs).
- `SHELL_CAPABILITIES`, `PHASE_ENVELOPE`, `nextRungForObjective`, `useEscalatingPool`, `buildRound`, the dev warning, and the `remediationQueue` are all specified concretely (TS interfaces + pseudocode) and the `useBoardPool` per-round change is audited for caller breakage.
- Nothing here violates a hard constraint.

Output: a structured implementation spec per item, with TS interfaces, the precise `useBoardPool` signature change + caller audit, and the migration path for TeamBattle. Where a decision is genuinely still open (e.g. shim vs big-bang for the scorer signature), present options with a recommendation.

---

## ═══════ PROMPT 1: BoardFlashMatch (vocabulary — reference escalation game) ═══════

You are a senior instructional designer + front-end architect. Spec the **redesigned `BoardFlashMatch`**, the vocabulary matching game — now an escalation game per the agreed architecture.

**Shared prelude applies in full.** Attachments: `GAMES_AUDIT.md` + architecture doc.

### This game today (audit §G)
Match word→definition pairs; correct locks in, wrong shakes & −5. Welded to `MEANING_MATCH` forever. ~330 lines, the cleanest reference implementation. No escalation. The audit (§H2) calls this "the canonical one-mechanic-forever problem."

### What the architecture already decides for this shell (don't redesign — implement)
- `SHELL_CAPABILITIES.FLASH_MATCH = { consumes: ['MEANING_MATCH','IMAGE_SELECT','AUDIO_L1_SELECT'], rungRange: [1,3] }` (§6.1).
- It uses `useEscalatingPool` (Prompt 0) to climb the vocab ladder across rounds (rung 1 IMAGE_SELECT → rung 2 listen/discriminate → rung 3 MEANING_MATCH recall) — see vocab ladder §1.1.
- It scores under the unified model with the per-attempt correctness metadata.

### What you must design/spec
1. **The match metaphor across three payload types.** `MEANING_MATCH` is naturally left/right tiles. Specify how `IMAGE_SELECT` and `AUDIO_L1_SELECT` render as a *matching* interaction (e.g. word-tile ↔ image-tile; word-tile ↔ audio-button-tile). Define the normalizer that maps each `ExerciseContent` variant into the left/right tile model the existing UI expects — minimize visual rewrite.
2. **Round escalation sequence** for this shell: which rung each round pulls, gated by `nextRungForObjective` (don't push a brand-new word to rung 3). Specify the round-to-rung mapping and how `useEscalatingPool` is called.
3. **Lifecycle + scoring:** the `mistakesRef`/`awardedRef` pattern, the `currentTurnId` reset, the wrong (−MISTAKE_PENALTY, `correctness:'incorrect'`) / success (`scoreForAttempt(mistakes, difficulty)`, `correctness:'correct'`) branches. Note: difficulty comes from the pool item.
4. **Contextual controls:** register the `ContextualControlsSpec` for FLASH_MATCH (Prompt 0 / §4.1) — this **fixes the dead-control-bar bug** (audit §H3). Map each control to its `triggerAction`.
5. **`SLIDE_COMPLETE`** broadcast when all pairs matched.
6. **Error-driven feedback (§3.3):** 1st wrong pair → narrowed hint (eliminate one distractor); 2nd → micro-explanation; end-of-slide → push missed objective to `remediationQueue`.
7. **Empty-pool state** (pool may not be generated yet).

### Acceptance criteria
- Variety delivered (3 payload types across rounds, mastery-gated). Coherent teacher controls (no dead bar). Sound pedagogy (state the skill per rung). Full lifecycle/scoring spec with correctness metadata. Feedback loop wired. Grammar N/A — note it.

Output: structured implementation spec — TS data shapes (the normalizer), round-escalation pseudocode, scoring branches with correctness flags, `ContextualControlsSpec`, `SLIDE_COMPLETE` trigger, feedback integration, empty-state.

---

## ═══════ PROMPT 2: BoardListenTap (vocabulary — listen & choose, escalating) ═══════

You are a senior instructional designer + front-end architect. Spec the **redesigned `BoardListenTap`**, the listen-and-choose game — now escalating per the agreed architecture.

**Shared prelude applies in full.** Attachments: `GAMES_AUDIT.md` + architecture doc.

### Today (audit §G)
Audio auto-plays, options appear after 3 s, tap the matching image. Streaks (🔥), bilingual cues. Welded to `LISTEN_SELECT`. Streaks are decorative. ~383 lines.

### Architecture-decided for this shell
- `SHELL_CAPABILITIES.LISTEN_TAP = { consumes: ['LISTEN_SELECT','MINIMAL_PAIR_SWIPE','DICTATION'], rungRange: [1,4] }` (§6.1).
- Escalates audio discrimination (rung 1–2) → production (rung 4 DICTATION = "type what you hear").

### Spec
1. **The three payload types as listen-tap rounds:** `LISTEN_SELECT` (audio→image, current), `MINIMAL_PAIR_SWIPE` (audio→discriminate near-sounds, rung 2), `DICTATION` (audio→type the word, rung 4 productive). Specify each round's UI and how DICTATION's free-text input works on the projector model (teacher types the student's oral answer? student comes to the front? — be explicit, decision 4 applies: free-production rounds are teacher-toggled choral/picked).
2. **Make streaks meaningful:** a 3-/5-/10-streak escalates the rung or narrows options. Specify exactly what changes.
3. **Lifecycle + scoring** (unified model, correctness metadata). Note DICTATION uses partial credit? — decide: DICTATION is free-text, near-misses (right phonemes wrong stress) could use Levenshtein, but **pronunciation/STT is deferred (decision 2)**. Clarify: DICTATION here is *typing*, not speaking — Levenshtein on typed text is fine and NOT the deferred pronunciation path. Confirm this distinction.
4. **Contextual controls** (fixes dead bar — audit §H3), `SLIDE_COMPLETE`, feedback loop, empty-state.
5. **Auto-advance subtlety (audit §F/§H3):** the internal 3-s phase pacing stays; clarify the one-scored-attempt-per-pick rule and how the UI communicates the "🔁 already scored this turn" state.

### Acceptance criteria
- Multi-type listen rounds + a productive (typing) round. Meaningful streaks. Coherent controls. Sound pedagogy. Clear distinction between typed-text Levenshtein (in scope) and STT pronunciation (deferred). Full lifecycle/scoring spec.

Output: structured spec — TS shapes, round/streak algorithm, scoring branches with correctness flags, controls, `SLIDE_COMPLETE`, feedback, empty-state.

---

## ═══════ PROMPT 3: BoardWhatsMissing (+ absorbed BoardMagicEyes) — memory, now scored ═══════

You are a senior instructional designer + front-end architect. Spec the **redesigned `BoardWhatsMissing`**, which **absorbs `BoardMagicEyes`** as a second mode (decisions 7 + architecture §6.2). Both are currently **unscored** (audit §G, §H4) — fix that.

**Shared prelude applies in full.** Attachments: `GAMES_AUDIT.md` + architecture doc.

### Today (audit §G)
- **WhatsMissing:** 4×2 image grid, 10 s memorize, one hidden, student recalls, teacher taps "Reveal Answer." `IMAGE_SELECT` pool. **No scoring.** Recall is teacher-verified — student never inputs.
- **MagicEyes:** flash image N s, blur, ask question, teacher reveals. Content-provided. **No scoring.**

### Architecture-decided
- One component, two modes (`mode: 'whats_missing' | 'magic_eyes'`).
- `SHELL_CAPABILITIES.WHATS_MISSING = { consumes: ['IMAGE_SELECT'], rungRange: [1,1] }` (§6.1) — receptive recognition.
- Promoted to scored (§6.1).

### Spec
1. **Mode flag** — the two modes share the flash/recall core; specify what differs (WhatsMissing = grid + hide-one; MagicEyes = single image + comprehension question). Decide whether MagicEyes pulls its question from pool content or stays teacher-authored.
2. **Make the student input.** The audit's core critique: the student never inputs. Spec how the picked student indicates their recall — tap the missing card from a recalled set? type/say it (teacher-relayed)? Recommend a projector-model-respecting input.
3. **Scoring:** bring it into the lifecycle (unified model, correctness metadata). WhatsMissing at difficulty 1 (receptive).
4. **Variety across rounds:** recall the missing *image* (rung 1), then recall the missing *word* (productive — a TYPE_TRANSLATE-style round?). Decide if WhatsMissing escalates or stays rung-1.
5. **Contextual controls, `SLIDE_COMPLETE`, feedback loop, empty-state.**

### Acceptance criteria
- Both modes score (or one mode is justified as presentation-only). Variety in recall modality. Coherent controls. Sound pedagogy (state the role of memory games in ESL — active recall, working memory). Full lifecycle/scoring spec. MagicEyes no longer a separate component.

Output: structured spec — mode flag, TS shapes, input model, scoring branches, controls, `SLIDE_COMPLETE`, feedback, empty-state.

---

## ═══════ PROMPT 4: BoardUnscramble + BoardStorySequencing (production, partial credit) ═══════

You are a senior instructional designer + front-end architect. Spec the **redesigned `BoardUnscramble` and `BoardStorySequencing`** — the production/assembly games, now with partial credit and comprehension.

**Shared prelude applies in full.** Attachments: `GAMES_AUDIT.md` + architecture doc.

### Today (audit §G)
- **Unscramble:** tap tiles to build the target sentence; binary exact-match. `WORD_BANK_BUILD`. ~284 lines. Scored.
- **StorySequencing:** arrange story panels; check `slot.order === index`. Grades a literal `'story_sequencing'` objective string (not a real objective_id). ~231 lines. Scored.

### Architecture-decided
- `SHELL_CAPABILITIES.UNSCRAMBLE = { consumes: ['WORD_BANK_BUILD','TRANSFORM'], rungRange: [3,5] }` — note it now also consumes `TRANSFORM` (bridges to grammar).
- Partial credit via LCS for `WORD_BANK_BUILD`/`TRANSFORM` (§3.2).
- StorySequencing ties to `STORY_COMPREHENSION` (§6.1).

### Spec
1. **Unscramble — LCS partial credit.** Specify the comparison/scoring algorithm precisely: `partialCreditRatio = LCS_length(placed, target) / target_length`. How "right words, wrong order" pays. Targeted feedback ("these two tiles are swapped") — specify the diff algorithm.
2. **Unscramble — vary the task:** assemble (`WORD_BANK_BUILD`), transform (a `TRANSFORM` variant — bridges to grammar), fill-blank (`SPELL_CLOZE`?). Specify which types per round and how the tile UI adapts.
3. **StorySequencing — fix the objective_id** (it currently grades a literal string — audit §G). Use the real story objective_id.
4. **StorySequencing — tie to comprehension:** after sequencing, present a `STORY_COMPREHENSION` round (these pool items exist but no board game consumes them — audit §H4). Specify the two-round structure (sequence → comprehend).
5. **Lifecycle + scoring** (unified, with partial credit), controls, `SLIDE_COMPLETE`, feedback, empty-state.

### Acceptance criteria
- LCS partial credit + targeted feedback for Unscramble. Variety of assembly tasks incl. the TRANSFORM bridge. StorySequencing uses real objective_id + a comprehension round. Coherent controls. Sound pedagogy. Full lifecycle/scoring spec with partial-credit math.

Output: structured spec per game — TS shapes, LCS/diff algorithms in pseudocode, scoring branches with correctness flags (incl. `'partial'`), controls, `SLIDE_COMPLETE`, feedback, empty-state.

---

## ═══════ PROMPT 5: THE GRAMMAR STRAND — BoardGrammarSandbox v2 + BoardGrammarForge (the flagship) ═══════

> **Highest-priority game prompt.** The audit (§H1) calls grammar "the single biggest pedagogical hole." The architecture (§5) designs the strand in detail — your job is to turn §5 into an implementation spec, including the held-out-pairs MVP (Option A) and the precise conditions for escalating to Option B (`PATTERN_FILL`).
>
> **⚠ Correction 2026-08-06 (verified against `types/exercise.ts` + `supabase/migrations/20260730000003_grammar_rules.sql` + `generate-exercises/index.ts` `buildGrammarItems`).** The architecture doc §5.2 and the original Prompt 5 below contain TWO factual errors about the grammar content shapes that must be corrected before designing:
>
> 1. **TRANSFORM is an MCQ, not an open `original→transformed` pair.** Verified: `TransformContent = { prompt_sentence, instruction, options: string[], correct_index }`. `buildGrammarItems` builds TRANSFORM items from `grammar_rules.transformation_pairs` by taking each pair's `original` as `prompt_sentence`, the pair's `transformed` as the correct option, and OTHER pairs' `transformed` values as distractor options. So rung 3 ("Apply — TRANSFORM, word-bank tiles assemble the transformed form") **cannot** be a free tile-assembly of `original→transformed` — the pool stores 4 discrete options, one correct. Two resolution paths for rung 3's UX: (a) render it as an honest MCQ (choose the correctly-transformed version — matches the pool, loses the tile metaphor), or (b) take the CORRECT option's text (`options[correct_index]`) and split IT into tiles for assembly, with `prompt_sentence` shown as the reference line (preserves the tile metaphor using only the correct option). **Path (b) is recommended** for consistency with the Unscramble spec (Prompt 4), which resolved the same mismatch the same way. State your choice explicitly in the spec.
>
> 2. **`transformation_pairs` lives on `grammar_rules`, NOT on the pool item.** Verified: `grammar_rules.transformation_pairs JSONB` (`[{original, transformed}]`) is the canonical source; `buildGrammarItems` reads it. So the "Option A held-out-pairs" mechanism is a **builder convention in `buildGrammarItems`** (reserve one pair per rule — don't emit a TRANSFORM item for it, but DO remember it for a free-production item), not a selection-time convention on pool items. The held-out pair's `original` is shown at rung 4 as the prompt; the student produces the `transformed` form unscaffolded. **Verify the assumption** (architecture §5.2 caveat): does `enrich-unit` produce enough `transformation_pairs` per rule to hold one out without starving rung 3? Spec a quick check of actual manifest data; if pairs are typically thin (e.g. only 2 per rule), escalate Option B (`PATTERN_FILL`) to the day-one path.
>
> 3. **`error_examples` and `pattern_template` are on `grammar_rules` too** — same table, columns `error_examples JSONB ([{wrong, correct}])` and `pattern_template TEXT`. Sandbox v2 reads them directly from `grammar_rules` (via the unit bundle RPC), NOT from the pool. `ERROR_SPOT` pool items ARE built from `error_examples` (so rung 2 reads the pool), but the Sandbox teaser card (§5.1 final card) reads `grammar_rules.error_examples` directly. State which source each stage reads.

You are a senior instructional designer + front-end architect. Spec the **complete grammar strand**: `BoardGrammarSandbox` v2 (presentation) + `BoardGrammarForge` (the new game replacing `BoardGrammarPractice`).

**Shared prelude applies in full.** Attachments: `GAMES_AUDIT.md` + architecture doc (read §5 in full).

### Today (the hole — audit §G, §H1)
- **BoardGrammarSandbox** (~155 lines): passive flip-cards of `{rule, explanation, examples[]}`. **Ignores `pattern_template` and `transformation_pairs`** (generated, never shown).
- **BoardGrammarPractice** (~231 lines): teacher-operated reveal-and-credit. Student never attempts. Wrong-credit branch unreachable. Bypasses `useBoardPool`.

### Architecture-decided (§5 — implement this)
- **Sandbox v2 (§5.1):** Card 1 = pattern (rule + `pattern_template` as visual slot skeleton); Cards 2…N = `transformation_pairs` demonstrated (original → tap → transformed with changed tokens highlighted); Final card = `error_examples` as an unanswered teaser that Forge's round 1 consumes.
- **`BoardGrammarForge` (§5.2):** one shell, three escalating rungs:
  - Rung 2 — Recognize (`ERROR_SPOT`, difficulty 1–2): correct sentence + wrong variants; teacher relays the class's oral pick. Binary scoring.
  - Rung 3 — Apply (`TRANSFORM`, difficulty 2): per the correction above, the pool stores TRANSFORM as an MCQ (`{prompt_sentence, instruction, options, correct_index}`); use path (b) — split the correct option's text into tiles for assembly, `prompt_sentence` as reference. LCS partial credit.
  - Rung 4 — Produce freely (difficulty 3): given `pattern_template` + a fresh prompt, student applies the rule unscaffolded. **Scored by teacher-operated 3-way rating (decision 3)** feeding `partialCreditRatio`. `gradeObjective(..., 'productive')` writes FSRS.
- **Content (§5.2):** Rungs 2–3 need nothing new. Rung 4 = **Option A (MVP):** held-out pair from `grammar_rules.transformation_pairs` (per correction #2 above — this is a builder convention in `buildGrammarItems`: reserve one pair per rule, show only its `original` at rung 4, ask to produce `transformed`). Option B (v2): new `PATTERN_FILL` type.
- **Shared context (§5.3):** Sandbox + Forge for the same rule share `grammarRuleId`/`objective_id` in slide `data`; `orchestrate-lesson` places them back-to-back; Forge round 1 prioritizes that `objective_id`.

### Spec
1. **Sandbox v2 — full spec:** the three card types, the data shape consumed (which `grammar_rules` fields), the slot-skeleton rendering of `pattern_template`, the transform demo interaction (tap to reveal transformed + highlight changed tokens), the `error_examples` teaser. Teacher-paced (nav dots, prev/next). No scoring.
2. **`BoardGrammarForge` — full spec:** the three rungs as rounds. For each: the UI, the input model (rung 2 = teacher-relayed oral pick respecting no-student-device; rung 3 = tile-tap like Unscramble; rung 4 = teacher 3-way rating per decision 3), the scoring branch (binary / LCS-partial / `partialCreditRatio` from the 3-way rating), the `gradeObjective` write.
3. **Rung 4 free-production input:** decision 4 applies — a per-round teacher toggle (choral / picked-student). Specify the toggle and how choral-vs-picked changes scoring (choral = no score; picked = full lifecycle).
4. **Option A held-out-pairs mechanism:** how `enrich-unit`'s `transformation_pairs` are split (one reserved per rule), how Forge rung 4 reads the reserved pair, how to handle rules with too few pairs (escalate to Option B? degrade gracefully?). **Verify the assumption:** does `enrich-unit` produce enough pairs? Spec a quick check (read a few manifests) and the fallback if thin.
5. **Option B (`PATTERN_FILL`) — spec it but mark v2:** the new exercise type + content variant + builder branch + registry row + renderer (audit §C's 5-step recipe). What `enrich-unit` grammar prompt must add (a "prompt words" list per rule).
6. **`SHELL_CAPABILITIES.BOARD_GRAMMAR_FORGE`** (it's a new flow type — register it: add to `SUPPORTED_FLOW_TYPES`, the canonical BOARD_MAP, `flowTypes.ts`).
7. **Lifecycle + scoring, contextual controls, `SLIDE_COMPLETE`, feedback loop, empty-state.**
8. **Backend changes list:** precisely — does `enrich-unit` need changes for Option A? (Probably not.) For Option B? (Yes — list them.) Does `generate-exercises` need a new builder for Option B? (Yes — spec it.) Does `orchestrate-lesson` need the back-to-back placement logic? (Yes — spec it.)

### Acceptance criteria (highest bar)
- A real grammar game where the student produces/transforms, not a teacher reveal.
- The discarded fields (`pattern_template`, `transformation_pairs`, `error_examples`) are put to use.
- Receptive→productive escalation, mastery-driven.
- Scoring is difficulty/modality-aware; rung 4 uses the teacher 3-way rating (decision 3) and the choral/picked toggle (decision 4).
- Held-out-pairs MVP fully spec'd with the thin-pair fallback.
- `BoardGrammarForge` registered as a new flow type everywhere.
- All four owner emphasis areas addressed — especially "grammar games & reinforcement."
- Backend changes precisely listed.

Output: a structured spec per deliverable (Sandbox v2, Forge rungs 2/3/4, Option A mechanism, Option B v2 spec, registration, backend changes), TS data shapes, escalation algorithm, scoring branches with correctness flags, controls, `SLIDE_COMPLETE`, feedback, empty-state.

---

## ═══════ PROMPT 6: BoardSpeedQuiz + BoardTeamBattle (assessment, mixed-payload) ═══════

You are a senior instructional designer + front-end architect. Spec the **redesigned `BoardSpeedQuiz` and `BoardTeamBattle`** — the assessment games, now mixed-payload and on unified scoring.

**Shared prelude applies in full.** Attachments: `GAMES_AUDIT.md` + architecture doc.

### Today (audit §G)
- **SpeedQuiz:** timed MCQ, 15 s/question, streaks, stars. Every question is "What does X mean?" (`MEANING_MATCH`). ~327 lines.
- **TeamBattle:** team tic-tac-toe + quiz, steal mechanic. ONLY team game. Flat +15 (legacy). `MEANING_MATCH`. ~387 lines.

### Architecture-decided (§6.1)
- Both pull a **mixed** payload: `MEANING_MATCH, ERROR_SPOT, SPELL_CLOZE, WORD_BANK_BUILD, LISTEN_SELECT, STORY_COMPREHENSION`.
- TeamBattle migrates to unified scoring (Phase 1 / Prompt 0).
- Assessment feeds back into learning via the `remediationQueue` (§3.3).

### Spec
1. **Mixed-question composition:** how the question-type mix is built per round — proportional to the unit's objective-type distribution? mastery-weighted via `classWeakObjectives`? Specify the algorithm.
2. **TeamBattle team mechanics for production:** beyond MCQ steal, consider a team sentence-build race or team grammar duel (uses `WORD_BANK_BUILD`/`TRANSFORM`). Decide if tic-tac-toe stays or evolves.
3. **Unified scoring for assessment:** does the team model need different math than solo? (TeamBattle is still excluded from the per-pick `scoreForAttempt` model per audit §F — clarify how the unified model applies to team scoring: per-team-point? per-student-cognition?) Does difficulty weight the award?
4. **Assessment → learning feedback:** an assessment result identifies weak objectives and feeds the next practice block via `remediationQueue`. Specify the handoff (which objectives, weighted how).
5. **Lifecycle + scoring, contextual controls, `SLIDE_COMPLETE`, feedback, empty-state.**

### Acceptance criteria
- Question-type variety (not just MEANING_MATCH) in both. TeamBattle on unified scoring (legacy +15 retired). Assessment feeds `remediationQueue`. Coherent controls. Sound pedagogy (state what each question type assesses). Grammar variety included.

Output: structured spec per game — TS shapes, question-composition algorithm, scoring model (incl. team math), `remediationQueue` handoff, controls, `SLIDE_COMPLETE`, feedback, empty-state.

---

## ═══════ PROMPT 7: BoardStoryStage + BoardDialogueStage (narrative output, NO pronunciation) ═══════

You are a senior instructional designer + front-end architect. Spec the **redesigned `BoardStoryStage` and `BoardDialogueStage`** — the narrative output stage. **Pronunciation/STT capture is deferred (decision 2)** — score by teacher judgment only.

**Shared prelude applies in full.** Attachments: `GAMES_AUDIT.md` + architecture doc.

### Today (audit §G)
- **StoryStage** (~210 lines): storybook reader; "comprehension closer" not wired to real questions. No scoring.
- **DialogueStage** (~142 lines): read-along; "Your Turn!" doesn't assign roles or capture. No scoring. ⚠ Missing from `BOARD_MAP`/`SUPPORTED_FLOW_TYPES` (audit §I — fix in Prompt 0).
- Unused pool types: `STORY_COMPREHENSION`, `WHO_SAID_IT`, `DIALOGUE_ROLEPLAY`.

### Architecture-decided (§6.1)
- StoryStage: wire `STORY_COMPREHENSION` as a scored closer. Promoted to scored.
- DialogueStage: role assignment + scored role-read (by **teacher judgment**, NOT STT — decision 2). Promoted to scored. Uses `WHO_SAID_IT` + `DIALOGUE_ROLEPLAY`.

### Spec
1. **StoryStage — scored comprehension:** after/during the story, present `STORY_COMPREHENSION` items as scored MCQs (picked student answers via teacher relay). Data shape, scoring (unified, difficulty 1), how it ties to the story objective.
2. **DialogueStage — role assignment + teacher-judged role-read:**
   - Role assignment model: round-robin among picked students? volunteer? Specify.
   - The "Your Turn!" card actually assigns roles (Student A = character X).
   - **Scoring by teacher judgment (decision 2):** the teacher marks the role-read correct/partial/incorrect (3-way rating, like grammar rung 4 — decision 3 pattern). NOT automated STT. Specify the Baton control ("Rate Role: ✓ / ~ / ✗") and how it feeds `scoreForAttempt(..., difficulty, partialCreditRatio)` + `gradeObjective`.
   - Free-production toggle (decision 4): choral read-through (no score) vs picked-student scored role-read.
3. **Consume the unused pool types:** `STORY_COMPREHENSION` (StoryStage), `WHO_SAID_IT` + `DIALOGUE_ROLEPLAY` (DialogueStage).
4. **Registration fix** (if Prompt 0 didn't fully cover it): DIALOGUE_STAGE in BOARD_MAP + SUPPORTED_FLOW_TYPES.
5. **Lifecycle + scoring, contextual controls, `SLIDE_COMPLETE`, feedback, empty-state.**

### Acceptance criteria
- Stories/dialogues become scored output stages (teacher-judged, not STT). Unused pool types consumed. Role assignment specified. Registration fixed. Coherent controls. Sound pedagogy (state why narrative output matters). Full lifecycle/scoring spec. **No pronunciation/STT** — confirm the deferral is respected.

Output: structured spec per game — TS shapes, scoring branches (teacher 3-way rating for dialogue), role-assignment algorithm, controls (incl. the Rate Role buttons), `SLIDE_COMPLETE`, feedback, empty-state.

---

## ═══════ PROMPT 8: BoardISayYouSay (speaking — CHORAL ONLY this phase) ═══════

You are a senior instructional designer + front-end architect. Spec the **redesigned `BoardISayYouSay`** speaking drill. **Per decision 2, this stays choral/engagement-only this phase** — no per-student STT capture, no scoring.

**Shared prelude applies in full.** Attachments: `GAMES_AUDIT.md` + architecture doc.

### Today (audit §G)
Choral listen/repeat drill. Toggle Listen/Repeat. Fake waveform. `SPEAK_SENTENCE`. **Scores nobody.** The audit (§H4) calls this the "choral cop-out."

### The decision (locked — decision 2)
Speaking stays choral this phase. `evaluate-pronunciation` is NOT wired (no persistence, no per-pick STT). So this game remains **unscored** this phase — but the audit's critique still must be addressed honestly.

### Spec
1. **Defend or evolve the choral model.** Decision 2 accepts choral-for-now. But the audit's critique stands: a listen-repeat with no capture is weak. Spec what `BoardISayYouSay` should be *given* it can't score this phase: a polished choral drill with real pedagogical scaffolding (model audio → choral repeat → isolated target word → choral repeat → embedded in sentence → choral repeat), clear teacher cues, and an honest "engagement only — no scoring" state.
2. **Set up the future scored phase.** Design the component so that when pronunciation capture is later un-deferred, the wiring point is clean (a clear "capture" hook, a place for the per-student score). Don't build it — just don't paint yourself out of it.
3. **`MINIMAL_PAIR_SWIPE` consideration:** should the speaking strand include a minimal-pair discrimination round (phonics)? Audit notes phonics has no pipeline. Decide: include a discrimination round (receptive, scoreable via tap — NOT STT) or defer. If included, it CAN score (it's a tap, not speech).
4. **Contextual controls, `SLIDE_COMPLETE` (choral completion = teacher-judged), empty-state.** No lifecycle scoring this phase (state explicitly why — decision 2).

### Acceptance criteria
- Honest about the choral limitation (no fake scoring). Real pedagogical scaffolding for the choral drill. Clean future wiring point for pronunciation capture. Coherent controls. Sound pedagogy (state the role of choral drilling in ESL — it IS legitimate for warmup/choral repetition; the critique was that it was the *only* speaking mode and captured nothing). If a scoreable discrimination round is added, full lifecycle/scoring spec for THAT round only.

Output: structured spec — the choral scaffolding, TS shapes, the future-capture hook, controls, `SLIDE_COMPLETE`, and (if included) the minimal-pair discrimination round's full scoring spec.

---

## ═══════ PROMPT 9: BoardFocusCards + BoardMediaPlayer + BoardLiveClassWarmup (presentation/warmup) ═══════

You are a senior instructional designer + front-end architect. Spec the **redesigned presentation/warmup templates.**

**Shared prelude applies in full.** Attachments: `GAMES_AUDIT.md` + architecture doc.

### Today (audit §G, §I)
- **FocusCards** (~305 lines): 4-stage staged reveal. "Studied" = binary flag, no learning signal.
- **MediaPlayer** (~241 lines): karaoke player / YouTube. No scoring.
- **LiveClassWarmup** (~113 lines): low-polish scaffold (fake video bar, unused imports).

### Architecture-decided (§6.1)
- `LIVE_WARMUP` redesigned: rapid mixed-review, pulls FSRS-due items from prior units (uses the Phase 2 escalation engine — rung 1 retrieval only, §1.2 WARMUP envelope).
- FocusCards marks `mastery_state: 'new' → 'learning'` in FSRS (a "presented" signal, not mastery).
- Slide-complete signals for all presentation shells (§4.3).

### Spec
1. **FocusCards — make "studied" a real signal:** on reaching stage 4, write an FSRS "presented" timestamp / move `mastery_state` `new→learning`. Specify the `boardLearner` call (NOT a full `gradeStudent` — it's presentation, not a correct/incorrect attempt).
2. **FocusCards — optional comprehension check:** a quick "which word did we just learn?" choral tap at the end (receptive, could score lightly). Decide yes/no.
3. **MediaPlayer — pedagogical role:** define when (warmup song = switch to English; context video). Whether it connects to any objective. Slide-complete signal.
4. **LiveClassWarmup — real or remove:** the architecture (§6.1) wants it as a rapid cross-unit FSRS-due review. Spec that (uses `useEscalatingPool` with the WARMUP envelope, rung 1, prior-unit objectives whose `next_review <= now`). OR recommend retirement with justification. Pick one.
5. **Slide-complete affordance** consistent across all three (the persistent "Continue →" for presentation shells per §4.3).
6. **Contextual controls.**

### Acceptance criteria
- FocusCards produces a real (modest) learning signal. MediaPlayer has a defined role. LiveClassWarmup is real or removed (justified). Slide-complete signals specified. Coherent controls. Sound pedagogy (PPP presentation/warmup role).

Output: structured spec per template (or consolidation/retirement), TS shapes, FSRS signal integration, controls, slide-complete affordance.

---

## ═══════ PROMPT 10: BoardWheelOfDestiny + the live loop + teacher-flow polish ═══════

> **Final prompt.** The loop all games live in + the teacher-flow polish (architecture Phase 8).

You are a senior instructional designer + front-end architect. Spec the **coherent live-class loop**: the picker (`BoardWheelOfDestiny`), the pick→play→score→next flow, and the teacher-flow polish items.

**Shared prelude applies in full.** Attachments: `GAMES_AUDIT.md` + architecture doc.

### Today (audit §E, §G, §H3, §I)
- **BoardWheelOfDestiny** (~226 lines): the picker. Fairness panel display-only.
- **BoardGameArena** — retire (Prompt 0).
- Loop: `selectNextStudent` → SPIN_WHEEL → 2500ms → GAME_WIN+NEW_TURN+DISMISS_WHEEL → play → score → nextStudent.
- UX problems (§H3): selection-mode toggle broken, wheel "+? XP" placeholder, `endSession` doesn't clear `activeClassId`, dead controls, no slide-complete, manual/auto inconsistency.

### Architecture-decided (§4)
- One picker (WheelOfDestiny); GameArena retired.
- Selection modes exposed honestly: "Everyone Gets a Turn" (ROUND_ROBIN, default), "Random", "Cold-Call Fairness". `ELIMINATION` retired (decision 5).
- Wheel placeholder → "Let's see how you do!" (Phase 1 / Prompt 0).
- `SLIDE_COMPLETE` broadcast; advance stays manual.
- Collapse the two render switches to one canonical map (Prompt 0 / §4.1).
- Real analytics from `point_transactions.metadata.correctness` (decision 1 / Prompt 0).

### Spec
1. **WheelOfDestiny:** make the fairness panel enforce (or document why display-only with a clear recommendation). Evolve or keep — justify.
2. **Selection modes:** implement the honest UI (three modes, teacher-facing labels, ROUND_ROBIN flagged as default). Remove `ELIMINATION` from the type (decision 5).
3. **Loop invariants:** one-scored-attempt-per-pick (UI-communicated via the "🔁 already scored" chip from Prompt 0), `SLIDE_COMPLETE` → glow Next (never auto-advance), what `endSession` clears (fix `activeClassId`).
4. **Real analytics queries (SQL):** Class Accuracy and Struggling Students from `point_transactions.metadata.correctness` (decision 1). Specify the queries precisely.
5. **`ContextualControls` exhaustiveness typing** + the single canonical BOARD_MAP (if Prompt 0 didn't finish it).
6. **Per-shell `ContextualControlsSpec` contract:** the TS interface every scored shell implements (Prompt 0 establishes the registry; here define the contract games satisfy).

### Acceptance criteria
- One picker (or justified evolution). Selection modes honest + ELIMINATION removed. Loop invariants defined. Real analytics (SQL). Control-bar contract satisfied. Coherent teacher flow. Sound pedagogy (the loop is the pedagogy's delivery vehicle).

Output: structured spec — picker decision, selection-mode model + UI, loop invariants, analytics SQL, the `ContextualControlsSpec` TS interface, specific SessionContext/UI fixes.

---

## After all prompts

You'll have:
- `GAMES_AUDIT.md` — the shared context.
- `professor-live-architecture-design.md` — the agreed architecture.
- One spec doc per prompt (Prompt 0's infra spec is the foundation; the game specs depend on it).

Implementation should follow the architecture's phase sequencing (§6.3): **Prompt 0 (Phases 0–2) → Prompts 1–2 (Phase 3 reference games) → Prompt 5 (Phase 4 grammar) → Prompts 3, 8 (Phase 5 promotions) → Prompts 4, 7 (Phase 6 story/dialogue) → Prompt 6 (Phase 7 assessment) → Prompts 9, 10 (Phase 8 polish, parallelizable)**. Each spec is its acceptance contract. Do not start a phase's implementation until its prerequisites land.

— *End of per-game prompts v2.*
