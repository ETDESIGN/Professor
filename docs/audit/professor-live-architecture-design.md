# Professor — Redesigned Live-Class + Exercise Architecture

> **Status.** Architecture spine only. No individual game is fully designed here except the grammar strand (§5), which the brief explicitly calls out as a required exception. Everything else in §6 is a one-line portfolio entry, not a design.
> **Input.** `GAMES_AUDIT.md`, prepared 2026-08-04. All citations below (`§A`–`§J`) refer to that document's section anchors.
> **Author's stance.** Where the audit's evidence points clearly at one answer, this doc takes a position and says so. Where it's a genuine judgment call, 2–3 options are given with a recommendation, per the brief.

---

## Table of contents

1. [Pedagogical model](#1-pedagogical-model)
2. [Content → Activity mapping grammar](#2-content--activity-mapping-grammar)
3. [Scoring & feedback philosophy](#3-scoring--feedback-philosophy)
4. [Teacher-flow model](#4-teacher-flow-model)
5. [The grammar strand (H1)](#5-the-grammar-strand-h1)
6. [Game portfolio & sequencing plan](#6-game-portfolio--sequencing-plan)
7. [Risks, trade-offs, and open questions](#7-risks-trade-offs-and-open-questions)
8. [Addendum — comparison with an alternative proposal](#8-addendum--comparison-with-an-alternative-proposal)

---

## 1. Pedagogical model

### 1.1 The model: a receptive→productive spiral, gated by phase

The audit is explicit that PPP phase tags exist but do nothing (`§H4`: *"the tags are decorative"*). The fix isn't a new pedagogical philosophy — PPP is already the right shape for a 6–12 y/o live class — it's making each phase **own an explicit modality/difficulty envelope** that the content pulled into it must satisfy, and making the *sequence of rounds within a slide* the mechanism that actually escalates a student from recognizing something to producing it.

Concretely: every learning objective (a vocab word, a grammar rule, a story, a dialogue) has a **ladder** — an ordered set of rungs from pure recognition to free production. A rung is not a new concept; it's just a name for a point on the existing `exercise_type` × `difficulty` space the schema already has (`§D`: pool_items.difficulty is documented as *"1=receptive, 2=constrained, 3=free production"* — the schema already encodes this ladder, no games climb it).

**Vocabulary ladder** (5 rungs, uses the exact `RECEPTIVE_TYPES`/productive split from `§B`):

| Rung | Operation | Exercise type(s) | Modality (`§B`) | Difficulty |
|---|---|---|---|---|
| 1 | Recognize (image↔word) | `IMAGE_SELECT` | receptive | 1 |
| 2 | Discriminate (audio, near-sounds) | `LISTEN_SELECT`, `MINIMAL_PAIR_SWIPE` | receptive/productive-gesture | 1–2 |
| 3 | Recall meaning | `MEANING_MATCH`, `AUDIO_L1_SELECT`, `SPELL_CLOZE` | receptive | 1–2 |
| 4 | Produce the form | `TYPE_TRANSLATE`, `DICTATION` | productive | 2 |
| 5 | Use in context | `WORD_BANK_BUILD`, `SPEAK_SENTENCE` | productive | 3 |

**Grammar ladder** (4 rungs — this is the strand that's entirely missing today; full design in `§5`):

| Rung | Operation | Content source | Difficulty |
|---|---|---|---|
| 1 | Notice the rule demonstrated | `pattern_template` + `transformation_pairs` (presentation, unscored) | — |
| 2 | Recognize correct usage | `ERROR_SPOT` (from `error_examples`) | 1–2 |
| 3 | Apply in a controlled frame | `TRANSFORM` (from `transformation_pairs`) | 2 |
| 4 | Produce freely | held-out `transformation_pairs` / new `PATTERN_FILL` (see `§5`) | 3 |

**Story/dialogue ladder** (3 rungs):

| Rung | Operation | Exercise type | Difficulty |
|---|---|---|---|
| 1 | Comprehend | `STORY_COMPREHENSION` | 1 |
| 2 | Identify | `WHO_SAID_IT` | 1 |
| 3 | Produce (role-play) | `DIALOGUE_ROLEPLAY` | 2–3 |

**Phonics** — flagged, not designed. `objectives.type` allows `'phonics'` (`§D`) but `enrich-unit`'s six categories (`§C`: vocabulary/grammar/characters/story/media/dialogues) and the four `generate-exercises` builders (`§C`) never produce phonics content. `MINIMAL_PAIR_SWIPE` (vocab-builder-emitted) covers *some* sound-discrimination need, but true grapheme-phoneme phonics has no pipeline today. This is scope, not a bug — flagged as an open question in `§7`, not designed here.

### 1.2 Mapping the ladder onto the seven phase tags

This is the enforcement mechanism the audit says is missing (`§H4`). Each phase gets a declared **envelope** — an allowed rung range and a scoring posture — instead of being a free-floating label:

| Phase | Rung range | Scoring posture | Typical shells |
|---|---|---|---|
| **WARMUP** | 1 (retrieval only, prior unit) | none / optional choral | Redesigned `LIVE_WARMUP` (rapid mixed review, pulls FSRS-due items from prior units) |
| **INPUT** | 0 (presentation, pre-rung) | none | `FOCUS_CARDS`, `GRAMMAR_SANDBOX` v2, `STORY_STAGE`, `DIALOGUE_STAGE` |
| **PRACTICE** | escalates within-slide, floor 1 → ceiling set by class mastery | per-turn, full lifecycle contract | `FLASH_MATCH`, `LISTEN_TAP`, `UNSCRAMBLE`, `BoardGrammarForge` rungs 2–3, `WHATS_MISSING` |
| **OUTPUT** | 2–3 (must include at least one rung-3 round) | per-turn, partial credit active | `BoardGrammarForge` rung 4, `DIALOGUE_STAGE` role-play, `SPEAK_SENTENCE` rounds |
| **ASSESS** | mixed, weighted class-weak-first, cross-objective | per-question, summative | `SPEED_QUIZ` v2, `TEAM_BATTLE` v2 |
| **WRAPUP** | 1–2, celebratory, low-stakes | optional | Lightning mixed-review round, leaderboard reveal |
| **REVIEW** | driven by FSRS `next_review <= now`, any rung the objective's mastery supports | per-turn | Any escalation-capable shell, cross-unit |

**Enforcement, concretely.** Today nothing stops a `PRACTICE` slide from silently only ever pulling rung-1 content forever — that's exactly the current bug (`§H2`). The fix is a small new piece of config-level infrastructure, **not** a rewrite of the pipeline:

- A `PHASE_ENVELOPE` map (phase → allowed rung range + scoring posture), colocated with `flowTypes.ts`.
- The escalation hook (`§2.3`) reads the current slide's phase, clamps the round's target rung into that phase's envelope, and — in dev builds only — **warns** (not blocks) if a shell requests content outside its phase's envelope. Start as a lint-level signal, not a hard runtime gate (see `§7` on why a hard gate is risky while the pool is still thin).
- This is additive: no existing table, edge function, or the `flow[].phase`/`pool_items.difficulty` fields need to change shape. It's a new small config object plus a guard in the pull hook.

### 1.3 How one objective moves through a lesson

Walking a single vocabulary word ("apple") through one lesson:

1. **INPUT** — `FOCUS_CARDS` presents it (rung 0, no score).
2. **PRACTICE, round 1–2** — `FLASH_MATCH` pulls it at rung 1 (`IMAGE_SELECT`) if `srs_items.mastery_state` is `new`/absent; if the class already has a prior `srs_items` row at `familiar`, the same round can start the word at rung 3 instead — see `nextRungForObjective` below.
3. **PRACTICE, round 3–4** — as the round index climbs, the same slide (or the next `PRACTICE` slide) pulls the word at rung 3–4 (`MEANING_MATCH` → `TYPE_TRANSLATE`), but never above what the word's own mastery supports (a brand-new word is never asked productively just because the round counter is high).
4. **OUTPUT** — if the word reached rung 4+ this lesson, an `OUTPUT`-phase slide (e.g. `UNSCRAMBLE` / `SPEAK_SENTENCE`) asks the class to use it in a sentence.
5. **ASSESS** — the word is one of several mixed into a summative round, weighted toward it if any student missed it earlier this session (the same-session remediation queue, `§3.4`).
6. **Next lesson's WARMUP/REVIEW** — once `srs_items.next_review` comes due (independent of this lesson), the word resurfaces at whatever rung its (possibly decayed) mastery state now supports.

**`nextRungForObjective` — the mastery→rung function** (pseudocode; this is the "concretely, not hand-wavily" ask):

```
function nextRungForObjective(objective, srsState):
  if srsState is null or srsState.mastery_state == 'new':
      return rung 1            // never start a brand-new item above receptive recognition
  if srsState.mastery_state == 'learning':
      return rung 2-3          // discrimination / recall
  if srsState.mastery_state == 'familiar':
      return rung 4            // productive form
  if srsState.mastery_state == 'mastered':
      return rung 5            // free use, or route to spaced REVIEW only
  if srsState.mastery_state == 'decaying':
      return rung 3            // remediation: drop back to recall, don't re-punish with rung 1
```

**Round-building — how a slide picks *which* objectives, at *which* rung** (this is what `useBoardPool`'s existing `weakOrder` should be doing and currently isn't fully exploited for, `§D`):

```
function buildRound(roundIndex, objectivesInLesson, roster, phaseEnvelope):
  roundBaseline = scaleRungToRound(roundIndex, totalRounds, phaseEnvelope)   // round # sets the ceiling attempt
  eligible = objectivesInLesson.filter(o =>
      nextRungForObjective(o, srsFor(o)) >= phaseEnvelope.floor)
  targetRung = for each o: min(roundBaseline, nextRungForObjective(o, srsFor(o)))
                                                  // mastery caps how far a round can push an objective
  ranked = classWeakObjectives(eligible, roster)  // existing helper, §D
  chosen = ranked.slice(0, roundSize)
  return poolItems.filter(i => i.objective_id in chosen
                             && exerciseTypeForRung(targetRung[i.objective_id]).includes(i.exercise_type))
```

The key property: **the round number is a ceiling on ambition, mastery is the actual floor/cap.** A round-5 slide never forces a brand-new word into free production; a well-known word can be asked productively even in round 1 if its own mastery supports it. This directly answers the brief's own example (*"round 1 pulls IMAGE_SELECT items for objectives with avg FSRS retrievability <0.4, round 4 pulls TYPE_TRANSLATE for objectives with mastery_state='familiar'"*) — that's exactly what `targetRung = min(roundBaseline, masteryRung)` produces.

### 1.4 The Lesson Director, and an assessment-gated recovery loop

Everything in `§1.2`–`§1.3` — the phase envelope, `nextRungForObjective`, `buildRound`, `useEscalatingPool` (`§2.3`) — has one conceptual owner: call it the **Lesson Director**. This isn't new infrastructure; it's a name for the machinery already specified above, so it can be talked about, and implemented, as one coherent thing rather than four scattered pieces. Its contract with a shell is exactly `useEscalatingPool`'s: given a slide, a phase, and a roster, hand back the objective set and rung for the current round. Shells stay dumb renderers of that answer — *objective → stage → activity → shell*, not *shell → hardcoded payload* — which is already what `§2`'s `SHELL_CAPABILITIES` decoupling delivers once a shell can pull more than one exercise type.

One addition worth making concrete: the **ASSESS→OUTPUT gate**. Today a lesson's phases run in a fixed line regardless of how the class actually did (`§H4`). Add one branch: after an `ASSESS`-phase slide, compute per-objective session confidence (correct ÷ attempts *this session*, the same signal `§4.4` needs for real analytics) for whatever the next `OUTPUT`-phase slide is about to test. If confidence for an objective is below a threshold (recommend **70%**, tunable) the Lesson Director doesn't silently branch the lesson — it surfaces a **teacher-visible suggestion** on the commander and remote ("Past Tense — 5 students uncertain. Insert a quick practice round?") with an accept/skip control. Accepting inserts one short `PRACTICE`-phase round pulling exactly the weak objectives at their current rung before the class proceeds to `OUTPUT`.

Two things this deliberately does **not** do, both for the same reason — the teacher is the only input device in this classroom model (constraint 1), and stays the one making the call throughout the pick→play→score→next loop (`§E`): it never inserts the recovery round automatically, and it never blocks the teacher from skipping straight to `OUTPUT` regardless of confidence. This turns the phase tags from decorative into *behaviorally* meaningful (`§H4`'s own complaint) without adding new realtime infrastructure — it's a read of existing per-session attempt data plus one new commander/remote affordance, not a new sync channel. (This mechanism is not yet assigned to a sequencing phase in `§6.3` — see `§8.2` for why, and treat it as unscheduled until confirmed wanted.)

---

## 2. Content → Activity mapping grammar

### 2.1 The declared mapping

The ladders in `§1.1` **are** the declared mapping — restated here as the artifact the brief asks for: an explicit, data-driven table instead of an implicit one buried per-component (`§B`: *"the actual content a game sees is decided by a hardcoded list inside each `Board*.tsx`"*).

| Learning-object type | Rung 1 (recognize) | Rung 2 (discriminate) | Rung 3 (recall/apply) | Rung 4 (produce) | Rung 5 (use freely) |
|---|---|---|---|---|---|
| Vocabulary | `IMAGE_SELECT` | `LISTEN_SELECT`, `MINIMAL_PAIR_SWIPE` | `MEANING_MATCH`, `AUDIO_L1_SELECT`, `SPELL_CLOZE` | `TYPE_TRANSLATE`, `DICTATION` | `WORD_BANK_BUILD`, `SPEAK_SENTENCE` |
| Grammar | presentation only | `ERROR_SPOT` | `TRANSFORM` | held-out `TRANSFORM` / `PATTERN_FILL` | — |
| Story | `STORY_COMPREHENSION` | `WHO_SAID_IT` | — | — | — |
| Dialogue | `WHO_SAID_IT` | — | — | `DIALOGUE_ROLEPLAY` | `DIALOGUE_ROLEPLAY` (unscaffolded) |
| Phonics | *(no pipeline — see `§1.1`, `§7`)* | | | | |

### 2.2 Registry-as-driver vs. shell-capability declaration

The brief asks directly: extend `activity_type_registry` into a real driver, or keep the deterministic builders and add a shell-capability declaration?

**Option A — Registry-as-driver.** `generate-exercises` consults `activity_type_registry` at build time to decide what to emit; a non-engineer could toggle activity types per unit without a deploy.
*Against:* the audit is explicit that the pool builder is *"extensible by code, not by prompt"* (`§C`) and that the registry today is *"a filter, not a driver — the builders are hardcoded... the registry is permissive"* (`§D`). Making it a driver adds a runtime data dependency to a pipeline whose entire design point is determinism, right after its one real defect (the ownership-check bug, `§C`) just got fixed. Higher regression risk for a benefit (non-engineer toggling) nobody asked for.

**Option B — Shell-capability declaration (recommended).** A small static map, colocated in code, declaring what each *shell* can consume:

```
SHELL_CAPABILITIES = {
  FLASH_MATCH:  { consumes: ['MEANING_MATCH','IMAGE_SELECT','AUDIO_L1_SELECT'], rungRange: [1,3] },
  LISTEN_TAP:   { consumes: ['LISTEN_SELECT','MINIMAL_PAIR_SWIPE','DICTATION'], rungRange: [1,4] },
  UNSCRAMBLE:   { consumes: ['WORD_BANK_BUILD','TRANSFORM'],                    rungRange: [3,5] },
  ...
}
```
This is exactly "lean into the decoupling, don't collapse it" (constraint 3): one shell now legitimately consumes multiple payload types across rounds. Builders (`generate-exercises`) are untouched — zero risk to the part of the pipeline that just started working. Cost: adding a new shell↔payload combination is still a code change, not a DB toggle — but the audit already establishes that's the accepted extension model (`§C`'s 5-step recipe for adding an exercise type).

**Option C — Hybrid (cheap add-on, not a separate track).** Keep `activity_type_registry` exactly as-is (harmless, documentation-grade today) but add a **build-time lint** that checks every `SHELL_CAPABILITIES` entry only references `exercise_type` values the registry actually knows about — catches typos, costs almost nothing.

**Recommendation: B, with C layered on top.** No pipeline risk, and it's the minimum change that actually delivers the decoupling the architecture already promises.

### 2.3 How a shell escalates its payload within a session

Mechanically, this is the `useEscalatingPool` hook referenced in `§1.3`'s pseudocode — a thin wrapper around the existing `useBoardPool` (`§D`) that:

1. Reads the current slide's `SHELL_CAPABILITIES` entry and `phase` envelope.
2. On each round, calls `buildRound(...)` (`§1.3`) to get the target rung(s) and objective set.
3. Calls the existing `useBoardPool({ unitId, exerciseTypes: <rung-mapped types>, classWeak: true, roster, limit })` — **no change to `useBoardPool`'s own contract needed except accepting a per-round `exerciseTypes` value instead of one static list for the whole slide's lifetime** (today every caller passes one fixed array at mount; this needs to become settable per round — a real but small change, flagged in `§7`).

This is the mechanism behind the brief's own worked example (round 1 `IMAGE_SELECT` → round 4 `TYPE_TRANSLATE`) — it isn't a new example, it's what `§1.3`'s `buildRound` produces when driven by `SHELL_CAPABILITIES`'s rung range.

### 2.4 Shell rotation as a variety lever (no new mechanism)

One more implication of `SHELL_CAPABILITIES` being many-to-many, worth stating explicitly as a design lever rather than leaving as an implicit data-model property: the same activity (say, `MEANING_MATCH` at rung 3) can be assigned to `FLASH_MATCH` this lesson and `SPEED_QUIZ` next lesson by the flow assembler, with zero change to the underlying pedagogy. To a class of 6–12 year-olds this reads as "a new game"; to the Lesson Director it's the identical cognitive operation. This costs nothing beyond what `§2.2`'s Option B already builds — it's a scheduling choice `orchestrate-lesson`'s deterministic flow assembler can make (e.g., round-robin which registered shell renders a given activity across lessons), not a new engine. Worth keeping in mind when the flow assembler's rules are written; it doesn't change anything in `§6`'s sequencing.

---

## 3. Scoring & feedback philosophy

### 3.1 One model

Retire Model 2 (`pointsForCorrect`/`CORRECT_ANSWER_POINTS`) outright — it's dead code today except `BoardTeamBattle`'s own hardcoded `+15`, which doesn't even call the map (`§F`, `§I`). Migrate `TeamBattle` onto Model 1. The unified function:

```
CLEAN_SCORE_BASE = 30
MISTAKE_PENALTY  = 5
DIFFICULTY_MULTIPLIER = { 1: 1.0, 2: 1.4, 3: 2.0 }   // receptive / constrained / free production

function scoreForAttempt(mistakes, difficulty, partialCreditRatio = 1.0):
    base    = CLEAN_SCORE_BASE * DIFFICULTY_MULTIPLIER[difficulty]
    raw     = max(0, base - mistakes * MISTAKE_PENALTY)
    return round(raw * partialCreditRatio)
```

**A useful fact this reconciles:** `pool_items.difficulty` is *already* documented as "1=receptive, 2=constrained, 3=free production" (`§D`) — the same axis as `§B`'s receptive/productive `RECEPTIVE_TYPES` split. So a single difficulty-aware multiplier **is** modality-aware scoring; no separate modality lookup is needed. The schema already anticipated this fix (`§H4`: *"scoring doesn't reflect difficulty... the difficulty field on pool items is ignored by scoring"*) — only the scoring function needs to catch up to data that already exists.

### 3.2 Partial credit — scoped, not universal

Partial credit only makes sense where "almost right" is a coherent idea. Pure MCQ receptive types (`MEANING_MATCH`, `IMAGE_SELECT`, `LISTEN_SELECT`, `STORY_COMPREHENSION`, `WHO_SAID_IT`) stay binary — there's no meaningful partial answer to a 4-option MCQ. Where it applies:

| Exercise type | "Almost right" signal | `partialCreditRatio` |
|---|---|---|
| `WORD_BANK_BUILD` / grammar `TRANSFORM` | Longest-common-subsequence of placed tiles vs. target, not exact-match | `LCS_length / target_length` |
| `SPEAK_SENTENCE` | `evaluate-pronunciation`'s existing Levenshtein score (`§C`) — currently computed and **discarded** (*"Returns to client only (does NOT persist)"*) | the returned score, used directly instead of thrown away |
| `ERROR_SPOT` with multiple sub-picks | Fraction of correctly identified errors | `correct_subpicks / total_subpicks` |

This directly answers `§H4`'s two named examples ("almost-right sentence order, right phoneme wrong stress") with concrete formulas rather than leaving them as an aspiration.

### 3.3 Error-driven feedback loop

Today a wrong attempt only deducts points and writes an FSRS lapse (`§E` step 6) — no re-presentation, no hint, no cycling back (`§H4`). New loop:

1. **1st miss on an item:** re-present the same item with a narrowed hint (MCQ: eliminate one wrong distractor; `WORD_BANK_BUILD`: highlight the first misplaced tile).
2. **2nd miss on the same item:** surface a corrective micro-explanation card (vocab: L1 gloss + example sentence; grammar: the `pattern_template` restated) before a 3rd attempt is allowed.
3. **End of slide:** any objective missed by ≥1 student this turn is pushed into a session-scoped `remediationQueue` (in-memory, `SessionContext`-level — not a new table). The next `WRAPUP`- or `REVIEW`-phase slide's round-builder prioritizes this queue before falling back to normal class-weak ordering.
4. This is deliberately **separate** from FSRS `next_review` — the remediation queue is same-session ("we just got this wrong, circle back before the bell"), FSRS scheduling is cross-lesson spaced repetition. Conflating them was not a bug in the current system (it simply doesn't exist yet) but is worth stating explicitly so it isn't accidentally merged later.

### 3.4 Visibility fixes

- **Points-clamp-at-zero (`§F` item 1).** Recommend *keeping* the floor-at-zero display (a negative running total on a projector in front of 6–12 y/os is more discouraging than clarifying) but fixing the actual bug, which is that the deduction is invisible at the floor. Add a per-turn "mistakes: •••" tally directly under the active roster chip during play, and make the "−5" toast persist ~3s instead of an instant popup that a low scorer's clamped total swallows.
- **Re-pay indication (`§F` item 2).** When the `awardedRef` latch blocks a second correct answer in the same turn from paying again, surface a small "🔁 already scored this turn" chip instead of a silent no-op.
- **Wheel's permanent "+? XP" placeholder (`§H3`).** Don't try to compute a fake preview — the amount genuinely isn't known until the turn resolves. Replace with a neutral "Let's see how you do!" state at spin-time; the real "+N pts" appears only once the turn actually resolves, via the existing overlay.

---

## 4. Teacher-flow model

### 4.1 Consistent contextual controls

Define a `ContextualControlsSpec` per shell (same declaration site as `SHELL_CAPABILITIES`, `§2.2`) covering: Skip/Pass, Reveal Hint, Force-Correct (manual teacher override — needed for oral-response judgment calls), Next Round, End Slide. Every scored shell registers one; `FLASH_MATCH` and `LISTEN_TAP` — currently falling through to the dead "Presenter Mode Active" default (`§H3`) — get filled in using this same shape, not a bespoke fix.

To stop this drifting again: type `ContextualControls.tsx`'s switch (and `TeacherRemote.tsx`'s `renderActivityControls`) so they exhaustively handle `SUPPORTED_FLOW_TYPES` via a TypeScript `never`-check — a new flow type or a missed one becomes a compile error, not a silent fallthrough. The same fix applies to the **two parallel render switches** noted as drift-prone in `§I` (`ClassroomBoard.tsx` vs. `BoardRenderer.tsx`'s `BOARD_MAP`, already caught drifting once with `DIALOGUE_STAGE`) — collapse to one canonical map both consumers import.

### 4.2 Selection-mode reconciliation

`§H3`: sidebar exposes `FAIR`/`RANDOM` only; the actual default (`ROUND_ROBIN`) is invisible; `ELIMINATION` is set nowhere. Recommend:

- Expose all three *meaningful* modes with teacher-facing (not enum) labels: **"Everyone Gets a Turn"** (`ROUND_ROBIN`, labeled as the default), **"Random"** (`RANDOM`), **"Cold-Call Fairness"** (`FAIR`, least-recently-picked).
- Don't invent a use for `ELIMINATION` — the audit finds zero current use of it (`§I`). Either retire it or ask the owner if there's a specific game format in mind (`§7`, open question).

### 4.3 Slide-complete signal and advance policy

- Every scored shell broadcasts a `SLIDE_COMPLETE` signal on its natural end condition (all pairs matched, roster exhausted, timer expired) — the missing signal `§H3` calls out.
- Presentation-only shells (no natural end condition) get an explicit, persistent "Continue →" control rather than the current hidden bottom-deck arrow.
- **Advance stays manual, always.** `SLIDE_COMPLETE` only triggers a visual affordance (a glow/highlight on the "Next" control in commander + remote) and logs a completed-vs-abandoned flag for analytics — it never auto-navigates the projector. Auto-advancing on a live class of 6–12 y/os risks cutting off a teacher mid-sentence.
- This is a distinct question from `BoardListenTap`'s own internal timer-driven phase pacing (options appearing after 3s, `§G`) — that's presentational pacing *within* a slide and is fine as-is; the inconsistency the audit flags is at the slide-to-slide level, which this makes uniformly teacher-gated.

### 4.4 Real analytics

Replace the hardcoded "85%" and the `points < 50` heuristic (`§H3`):

- **Class Accuracy** = correct attempts ÷ total attempts, for the current session. This needs a real per-attempt correct/incorrect signal — `point_transactions` deltas alone can't supply it (a −5 could be a wrong attempt *or* a low partial-credit success under `§3`'s model; a positive delta doesn't distinguish clean vs. partial). Flagged as new (small) infrastructure in `§7`, not a pure component fix.
- **Struggling Students** = students with `attempts_this_session ≥ 2 AND accuracy_this_session < 60%`, sorted ascending. This both fixes the false-positive the audit names (*"a quiet correct kid has few points"*) and avoids flagging students who simply haven't been picked yet.

---

## 5. The grammar strand (H1)

This is the single highest-leverage fix in the whole redesign — the audit calls it *"the top priority"* and *"the single biggest pedagogical hole."*

### 5.1 Presentation — `BoardGrammarSandbox` v2, "Rule in Action"

Today: static rule/explanation/example flip-cards; `pattern_template` and `transformation_pairs` are generated by `enrich-unit` and never shown (`§H1`, `§G`). Redesign, still teacher-paced (nav dots, prev/next — same interaction model, no new input surface):

- **Card 1 — the pattern.** The rule stated in plain language, plus `pattern_template` rendered as a visual slot skeleton (e.g. "Subject + do/does + not + verb" as tiles), not prose.
- **Cards 2…N — the transform, demonstrated.** Step through `transformation_pairs`: show `original`, then (teacher tap) reveal `transformed` with the *changed tokens visually highlighted* — the student sees the rule apply, not two static sentences to compare themselves.
- **Final card — the hook.** One or two `error_examples` shown as an unanswered "spot what's wrong?" teaser. These are **not** decorative — they are the literal content the practice game's first round consumes (§5.3), so Sandbox and Practice share context by construction, not by convention.

### 5.2 The game: `BoardGrammarForge` (replaces `BoardGrammarPractice`)

One shell, three escalating rounds — following the same multi-rung pattern as `§1`/`§2` rather than three separate components, to reuse the polished tile-tap interaction the audit already praises in `BoardUnscramble` (`§G`) and to minimize new lifecycle-contract surface area.

**Rung 2 — Recognize (`ERROR_SPOT`, difficulty 1–2).** Built from `error_examples`: the correct sentence (`error.correct`) plus 2–3 wrong variants (`error.wrong` + synthetic distractors sharing the same error category). Teacher relays the class's oral pick; student never sees a device (constraint 1 respected). Binary scoring under `§3`.

**Rung 3 — Apply in a controlled frame (`TRANSFORM`, difficulty 2).** Original sentence shown; word-bank tiles (same tap-to-place interaction as `Unscramble`) assemble the `transformed` form. Checked against the target with LCS-based partial credit (`§3.2`) instead of `Unscramble`'s current binary exact-match — right words, wrong order now pays *something*.

**Rung 4 — Produce freely (difficulty 3).** The first genuinely free-production grammar task in the system. Given the `pattern_template` and a fresh prompt, a student (teacher-relayed, or a representative student speaking if the class's choral culture supports it) applies the rule with no scaffolding. Teacher scores via a **3-way rating** (correct / partial / incorrect) rather than a binary tap, feeding `partialCreditRatio` directly. `gradeObjective(..., 'productive')` writes FSRS exactly as `BoardGrammarPractice` does today (`§F`) — the write path doesn't change, only what triggers it.

**Content shape — does the pool need anything new?**

Rungs 2–3 need **nothing new** — `ERROR_SPOT` and `TRANSFORM` are already built by `buildGrammarItems` (`§C`); this is precisely `§H1`'s own framing: *"the pool already generates ERROR_SPOT, TRANSFORM... the games to consume it don't."* Rung 4 is the interesting case — two options:

- **Option A — reserved pairs (recommended MVP).** `enrich-unit` already generates multiple `transformation_pairs` per rule. Reserve one pair per rule as held-out (never shown at rung 3); at rung 4, show only its `original` and ask the student to produce `transformed` freely, unscaffolded. **Zero pipeline changes** — this is a selection-time convention, not new content or a new exercise type. Ships fastest, de-risks the mechanic before investing further.
- **Option B — a new `PATTERN_FILL` exercise type.** `{pattern_template, promptWord, exampleFilled}`, requiring: `enrich-unit`'s grammar prompt to emit a small "prompt words" list per rule (a small addition to an existing prompt, not a new pipeline stage), plus the standard 5-step extension recipe the audit already documents (`§C`: union + content variant + builder branch + registry row + renderer). This gives genuinely novel prompts instead of held-out pairs, at the cost of new content generation and a builder change.

**Recommend Option A for the first ship, Option B as a deliberate v2** once the mechanic is validated — this is exactly the kind of low-risk-first sequencing the plan in `§6` follows generally. One caveat: Option A only works if `enrich-unit` currently produces *enough* `transformation_pairs` per rule to hold one out without starving rung 3 — worth confirming actual pair-counts before committing (`§7`).

### 5.3 Shared context, explicitly

`GRAMMAR_SANDBOX` and the following `GRAMMAR_PRACTICE`(`BoardGrammarForge`) block for the same rule share a `grammarRuleId`/`objective_id` in their slide `data`. `orchestrate-lesson`'s deterministic flow assembler places them back-to-back for the same rule, and `GrammarForge`'s round-1 pull prioritizes that specific `objective_id` before falling back to class-weak ordering — so the exact `error_examples` teased unanswered at the end of Sandbox are what round 1 of Forge asks about. "See the rule, then see the rule in action" is a data-flow contract between two adjacent flow blocks, not a new subsystem.

---

## 6. Game portfolio & sequencing plan

### 6.1 Portfolio

| Shell | Skill(s) | Exercise types consumed | Scored? | Phase | Why it's sound |
|---|---|---|---|---|---|
| `BoardIntroSplash` | — | — | no | WARMUP | Sets the stage; no cognitive load expected |
| `LIVE_WARMUP` (redesigned) | cross-skill | any, rung 1, FSRS-due from prior units | optional/choral | WARMUP | Retrieval practice, not new-content presentation |
| `BoardMediaPlayer` | — | — | no | WARMUP/INPUT | Pure input, unchanged |
| `BoardFocusCards` | vocab | — | no | INPUT | Presentation stage of the vocab ladder |
| `BoardGrammarSandbox` v2 | grammar | `pattern_template`, `transformation_pairs`, `error_examples` (preview) | no | INPUT | Demonstrates the rule instead of stating it (`§5.1`) |
| `BoardStoryStage` | story | `STORY_COMPREHENSION` (closer, newly wired) | promoted → yes | INPUT→OUTPUT | Comprehension finally tied to real content, not a generic prompt |
| `BoardDialogueStage` | dialogue | `WHO_SAID_IT`, `DIALOGUE_ROLEPLAY` | promoted → yes | OUTPUT | Role assignment + optional pronunciation capture makes "Your Turn!" real |
| `BoardFlashMatch` | vocab | `MEANING_MATCH`, `IMAGE_SELECT`, `AUDIO_L1_SELECT` (escalating) | yes | PRACTICE | Same mechanic, now climbs the vocab ladder instead of one rung forever |
| `BoardListenTap` | vocab | `LISTEN_SELECT`, `MINIMAL_PAIR_SWIPE`, `DICTATION` (escalating) | yes | PRACTICE | Escalates audio discrimination → production |
| `BoardUnscramble` | vocab/grammar | `WORD_BANK_BUILD`, `TRANSFORM` (+ LCS partial credit) | yes | PRACTICE | Shared interaction reused by grammar rung 3 |
| `BoardGrammarForge` (replaces `BoardGrammarPractice`) | grammar | `ERROR_SPOT`, `TRANSFORM`, held-out pairs | yes | PRACTICE/OUTPUT | The flagship H1 fix — first real grammar game (`§5`) |
| `BoardWhatsMissing` | vocab | `IMAGE_SELECT` | promoted → yes | PRACTICE | Scoring wired; absorbs `MagicEyes` (below) |
| `BoardMagicEyes` | vocab | content-provided | consolidated into `WhatsMissing` | PRACTICE | Mechanically near-identical flash/recall — one component, two modes |
| `BoardISayYouSay`/`SPEAKING` | speaking | `SPEAK_SENTENCE` | promoted → yes (per-picked-student mode added) | PRACTICE/OUTPUT | Choral mode kept for warmup; per-student capture via `evaluate-pronunciation` for graded turns |
| `BoardStorySequencing` | story | story manifest + `STORY_COMPREHENSION` (added round) | yes | PRACTICE→ASSESS | Now tests understanding, not just page order; `objective_id` fixed from literal string |
| `BoardSpeedQuiz` | cross-skill | `MEANING_MATCH`, `ERROR_SPOT`, `STORY_COMPREHENSION` (mixed) | yes | ASSESS | Same polish, no longer one repeated question type |
| `BoardTeamBattle` | cross-skill | same mix as SpeedQuiz | yes (unified scoring) | ASSESS | Off the legacy flat `+15`, onto `scoreForAttempt` |
| `BoardWheelOfDestiny` | — (picker) | — | — | picker | Canonical picker; `BoardGameArena` retired in its favor |
| `BoardUnitSelection` | — | — | — | pre-session | Unchanged |

### 6.2 Retire / consolidate

- **`BoardGameArena`** — retire. Older duplicate of `BoardWheelOfDestiny`; its "+50 XP Bonus" is decorative, not awarded (`§I`).
- **`POLL`** — formally remove from `SUPPORTED_FLOW_TYPES`. No component, no render entry anywhere (`§I`) — it's dead weight that silently falls through to "Unknown Slide Type" today. If the owner wants a real poll later, that's a student-device architecture decision (constraint 1) requiring explicit buy-in, not a resurrection of this type.
- **`BoardMagicEyes` → `BoardWhatsMissing`** — consolidate into one component with a mode flag. Both are flash-then-recall memory mechanics (`§G`); maintaining two thin, unscored scaffolds for the same underlying idea is exactly the kind of chrome-without-substance the audit flags elsewhere.
- **`pointsForCorrect`/`CORRECT_ANSWER_POINTS`** — delete. Dead code, one real caller (`TeamBattle`), which doesn't even use it correctly (`§F`, `§I`).

### 6.3 Sequencing plan

**Phase 0 — Bug fixes (near-zero risk, do first).**
Fix `DIALOGUE_STAGE`'s missing registration in `BOARD_MAP`/`SUPPORTED_FLOW_TYPES` (`§I`); formally retire `POLL`; retire `BoardGameArena`; delete the dead scoring map. None of this depends on anything else and unblocks nothing risky.

**Phase 1 — Scoring core.**
Ship the unified `scoreForAttempt(mistakes, difficulty, partialCreditRatio)` (`§3.1`); fix the three visibility bugs (`§3.4`); migrate `TeamBattle` off its flat `+15`. *Why first:* every later escalation/partial-credit change depends on this signature existing — building escalating games against the old binary scorer means redoing the scoring call site twice.

**Phase 2 — Shell-capability + escalation engine.**
Build `SHELL_CAPABILITIES` (`§2.2`), `useEscalatingPool` (`§2.3`), and the `PHASE_ENVELOPE` dev-warning guard (`§1.2`). *Why second:* this is the reusable machinery every subsequent "evolve this shell" task plugs into — build it once, not bespoke per game.

**Phase 3 — Evolve the two reference games.**
`BoardFlashMatch` and `BoardListenTap` get multi-rung escalation. *Why these first among real games:* the audit calls them the cleanest, most polished existing implementations (`§G`) — least legacy debt to fight while validating the new escalation engine. Also fixes the dead-contextual-controls bug (`§H3`) as a side effect of touching them.

**Phase 4 — H1: the grammar strand.**
`BoardGrammarSandbox` v2 + `BoardGrammarForge`, Option A (reserved pairs) MVP. *Why fourth and not first, despite being the top priority:* it depends on Phase 1's partial credit (rung 3–4 scoring) and Phase 2's escalation engine both being solid. Building grammar's own bespoke scoring/escalation logic first and generalizing it afterward is higher risk than landing grammar on proven infrastructure. This is a genuine trade-off between stated priority and engineering leverage — flagged explicitly for owner sign-off in `§7`, not a quiet deprioritization.

**Phase 5 — Promote the unscored games.**
`BoardWhatsMissing` (scored, absorbs `MagicEyes`); `BoardISayYouSay` (per-student pronunciation capture, wiring `evaluate-pronunciation` to persist — it currently doesn't, `§C`).

**Phase 6 — Story/dialogue as output.**
`BoardStoryStage` comprehension wiring; `BoardStorySequencing` objective-id fix + comprehension round; `BoardDialogueStage` role assignment + optional pronunciation capture.

**Phase 7 — Cross-skill assess games.**
`BoardSpeedQuiz` and `BoardTeamBattle` multi-payload mixing.

**Phase 8 — Teacher-flow polish (parallelizable with 3–7).**
`ContextualControls` exhaustiveness typing; collapse the two render switches; selection-mode UI reconciliation; real analytics (depends on the `§7` logging decision); `LIVE_WARMUP` redesign (depends on Phase 2's engine to pull cross-objective content sensibly).

---

## 7. Risks, trade-offs, and open questions

### 7.1 Hardest parts to implement

- **Phase-envelope enforcement (`§1.2`) is genuinely new infrastructure** with no current analogue in the codebase. Real risk of over-building it. Start as a dev-time warning, not a hard build-time gate — see the open question below on why.
- **Real analytics needs a new correctness signal**, not just a new UI. `point_transactions` deltas can't distinguish "wrong attempt" from "low-partial-credit success" once `§3`'s partial credit ships — some form of per-attempt correct/incorrect logging is required. This is schema-adjacent work, not a component fix (`§4.4`).
- **`evaluate-pronunciation` doesn't persist today** (`§C`). Wiring it into `BoardISayYouSay`/`BoardDialogueStage` for graded turns means adding a persistence path and probably increases STT call volume (once per picked student on speaking turns, not just on-demand) — a real cost/latency question, not just plumbing.
- **Option A for grammar rung 4 (`§5.2`) assumes enough `transformation_pairs` per rule to hold one out.** If `enrich-unit` typically produces only 2–3 pairs per rule today, reserving one may starve rung 3. Worth checking actual pair-counts in current manifest data before committing — if thin, `PATTERN_FILL` (Option B) may need to be the day-one path instead of a v2 enhancement.
- **`useBoardPool`'s `exerciseTypes` param needs to become per-round**, not a single static list set at mount (`§2.3`). Small but real — every existing caller currently passes one fixed array for the slide's whole lifetime.
- **Consolidating `MagicEyes` into `WhatsMissing`** touches two components in one change, a slightly larger blast radius than the single-component evolutions elsewhere in the plan — worth splitting into two commits even if scoped as one phase.

### 7.2 Decisions needed from the owner before per-game design starts

1. **Free-production scope.** In OUTPUT-phase rounds (grammar rung 4, "use in a sentence" vocab rounds), should *any* student respond, or only the wheel-picked student? The audit's "choral cop-out" critique (`§H4`) leans toward narrowing to one student, but this should be an explicit call, not inferred.
2. **New analytics infrastructure.** Is a small new per-attempt log (e.g. a `session_attempts` table, or a `correct: boolean` field added to `point_transactions` metadata) acceptable, or must "Class Accuracy" be derived only from tables that exist today? This gates how honest `§4.4`'s analytics can actually be.
3. **Pronunciation capture cost.** Is persisting `evaluate-pronunciation` results, and calling it more often (per picked student on speaking games, not just on-demand as today), acceptable from a cost/latency standpoint for a live class?
4. **Grammar rung-4 scoring input.** Is a teacher-operated 3-way rating (correct/partial/incorrect) acceptable as the scoring mechanism, or is there appetite to eventually explore student-side capture for free production — which would be the flagged student-device architecture decision from constraint 1, not a default?
5. **`ELIMINATION` selection mode.** Retire it outright (zero current use per `§I`), or is there a specific classroom format (e.g. a knockout round) in mind that should shape whether it's kept and how it's exposed?
6. **Phase-envelope enforcement strength.** Dev-time warning (safe, but easy to ignore) or a hard build-time gate that blocks publishing a lesson whose content doesn't fit its phase's envelope (stronger, but risky while the pool is only now starting to be populated for the first time — `§C` — and content is still thin)?
7. **`MagicEyes`/`WhatsMissing` consolidation.** Fine to merge into one component with two modes, or is keeping them visually distinct (even though mechanically similar) valued for classroom variety on its own terms?

---

## 8. Addendum — comparison with an alternative proposal

The owner separately ran the same audit past ChatGPT, which produced a parallel proposal reframing the redesign around a "Learning Engine"/"Lesson Director" abstraction, the same *Objective → Stage → Activity → Shell* inversion as `§1`–`§2` above, and a recommendation to write six separate architecture documents (Vision, Learning Engine, Activity Engine, Classroom Engine, Game Bible, Technical Blueprint) with formal version-control governance before any individual game is redesigned. This section records what from that proposal was folded into the spine above, and what wasn't, so the reasoning survives past the conversation it happened in.

### 8.1 Integrated

| Idea | Where it landed |
|---|---|
| Objective → Stage → Activity → Shell as the guiding inversion | Already the substance of `§1`–`§2`; adopted the framing/naming explicitly |
| "Lesson Director" as one named owner of the escalation machinery | `§1.4` — packaging of `useEscalatingPool`/`SHELL_CAPABILITIES`/`PHASE_ENVELOPE`/`buildRound`, not new mechanism |
| Assessment-gated recovery loop before OUTPUT | `§1.4` — a concrete, teacher-visible ASSESS→OUTPUT gate with a defined threshold |
| Same activity, rotating shell, as an explicit variety lever | `§2.4` |
| "Presentation never owns pedagogy" / "teacher stays in control" as stated principles | Woven through `§1.4` and `§4.3` (manual-advance-always), consistent with constraint 1 |

### 8.2 Not integrated, and why

- **The six-document "Architecture Bible" with version governance.** The brief scoped one spine document plus a per-game sequencing plan ("one at a time"). Deferring every concrete decision — including ones already made in this document — behind a 50–70-page "Learning Engine Specification" that doesn't exist yet trades a bounded, evidence-grounded fix for an open-ended spec-writing project. The audit itself is the cautionary tale here: it's precise and short *because* every claim is tied to a file:line. A document written before that grounding exists risks becoming the abstract, ungrounded kind of guidance the brief explicitly warned against.
- **New top-level "engines" (Curriculum Engine, Knowledge Graph Engine, Assessment Engine as a separate system).** None of these are evidenced anywhere in the audit — they're imported from a generic adaptive-learning-platform template, not derived from Professor's actual schema or failure modes. `§2`'s decision (extend `activity_type_registry` vs. shell-capability declaration) already covers the ground a "Knowledge Graph Engine" would, using tables that exist today.
- **"Instruction Beats" as a new synchronized primitive.** Real pedagogical value in the vocabulary (Notice/Compare/Predict/Practice/Reflect), but as a *cross-tab-synchronized* concept it's new realtime-channel surface area, and the audit is explicit about how expensive that footgun already is (`§E`: forgetting the optimistic `setState` half of `broadcast:{self:false}` costs real debugging time). Several shells (`FocusCards`, `SpeedQuiz`, `ListenTap`) already implement internal staged reveals as local component state, successfully — that's the beat concept, already shipping, without a new sync channel. Recommend keeping it there.
- **Persisted `recommended_activity`/`recommended_shell`/`current_stage` fields on the objective.** Risks a second source of truth alongside `srs_items`, which already carries everything `nextRungForObjective` (`§1.3`) needs. Kept computed-on-demand for v1; revisit only if per-round computation becomes an actual performance problem, not preemptively.
- **The 8-stage mastery narrative (Exposure→…→Transfer→Long-term Retention).** A reasonable teaching story, but it doesn't map cleanly onto the 5-value `mastery_state` enum that exists in `srs_items` today (`§D`: `'new'|'learning'|'familiar'|'mastered'|'decaying'`). Treating it as a conceptual gloss over the existing enum is free; migrating the schema to add granularity is not, and nothing in the audit asks for that migration.

### 8.3 Bottom line

The alternative proposal's diagnosis is the same as this document's — *"the platform lacks a learning engine"* is the same finding this doc opens with, stated a different way — and its central inversion is correct and already load-bearing in `§1`–`§2`. Where it goes further — new engines, a documentation program, a new sync primitive — it stops citing the audit and starts designing the platform ChatGPT thinks a best-in-class adaptive-learning product should be, independent of what Professor's actual code and schema support today. The two load-bearing gaps in that proposal, for something meant to be an implementable spec: it never touches the lifecycle contract (`currentTurnId` reset, `mistakesRef`/`awardedRef`, `usePickedStudent`) or the realtime broadcast model (`§E`) that everything ships inside of — any "Lesson Director" has to live inside `SessionContext`'s existing reducer or it breaks the sync model the audit spent a full section on, and that integration point isn't addressed anywhere in it.

---

*End of design doc. Sequencing plan in `§6.3` is intended to drive the per-game redesign prompts in the next phase.*
