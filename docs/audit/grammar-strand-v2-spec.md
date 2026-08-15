# The Grammar Strand v2 — Implementation Spec (rev. 2)
### BoardGrammarSandbox v2 + BoardGrammarForge

> Revised per GLM 5.2's repo-verified schema correction (2026-08-06): `TRANSFORM` is a stored MCQ (`{prompt_sentence, instruction, options, correct_index}`), not an open pair; `pattern_template`/`transformation_pairs`/`error_examples` all live on `grammar_rules`, read directly for Sandbox rather than via pool items. Builds on `professor-live-architecture-design.md` §5, §1.1–§1.3, §2.2, §3, §4.1/§4.3, and the Unscramble/StorySequencing precedents (Prompt 4). Audit references: `§H1`, `§G`, `§C`.

## Content source map (answers the correction's explicit ask)

| Stage | Reads | Path |
|---|---|---|
| Sandbox Card 1 (pattern) | `grammar_rules.pattern_template` | direct, unit bundle |
| Sandbox Cards 2–N (transform demo) | `grammar_rules.transformation_pairs[0..2]` — the raw `{original, transformed}` shape | direct, unit bundle |
| Sandbox final card (teaser) | `grammar_rules.error_examples[0]` | direct, unit bundle |
| Forge rung 2 (`ERROR_SPOT`) | `pool_items` where `exercise_type='ERROR_SPOT'` | `useEscalatingPool` — built from `error_examples` at generation time |
| Forge rung 3 (`TRANSFORM`) | `pool_items` where `exercise_type='TRANSFORM'` | `useEscalatingPool` — built from `transformation_pairs` (minus the reserved one) at generation time |
| Forge rung 4 (produce) | `grammar_rules.pattern_template` + `grammar_rules.transformation_pairs[last]` | direct, unit bundle — **not** the pool, since this pair is deliberately never built into a pool item |

Two consequences worth stating up front because they change earlier claims:

**Sandbox's transform-demo cards are unaffected by the MCQ correction.** They read the raw `{original, transformed}` pair straight off `grammar_rules` — the MCQ shape only exists on pool items, which Sandbox never touches. The `diffTokens`/reveal mechanic from the original spec is still exactly right for Sandbox.

**Forge rung 3 is the part that actually changes**, because it's the only stage reading the MCQ-shaped pool item.

---

## 1. `BoardGrammarSandbox` v2 — unchanged from the original spec

Card 1 (pattern skeleton), cards 2–N (transform demo, capped at 3 pairs, diff-highlighted reveal), final card (`error_examples[0]` as an unanswered teaser) — all as originally spec'd, since none of it touches the corrected shape. One addition: the teaser **must** use `error_examples[0]` specifically, not an arbitrary entry, for the coordination reason in §2.

---

## 2. `BoardGrammarForge` — the three rungs, corrected

```ts
type ForgeRound =
  | { rung: 2; kind: 'ERROR_SPOT'; correctText: string; distractorTexts: string[]; item: PoolItem }
  | { rung: 3; kind: 'TRANSFORM';  assembly: AssemblyRound }
  | { rung: 4; kind: 'PRODUCE';    objectiveId: string; patternTemplate: string; promptOriginal: string; targetTransformed: string; scoringMode: 'choral' | 'picked' };
  // rung 4 no longer carries `item: PoolItem` — there is no pool item backing it
```

**Rung 2 — unchanged mechanically**, but now explicit about coordination with Sandbox: round 1's correct-answer option should be the `ERROR_SPOT` pool item built from `error_examples[0]` — the same entry Sandbox teased unanswered — with distractors from other entries' `wrong` sentences (the resolution from the original spec, still valid). This is what makes "the rule, then the rule in action" actually hold: Sandbox and Forge read from different paths (direct vs. pool) but a stable index convention (`[0]`) keeps them pointing at the same sentence without needing new stored linkage.

**Rung 3 — the corrected normalizer.** The pool item is an MCQ; per the recommended resolution, take the correct option's text and split *it* into tiles, with `prompt_sentence` as the reference line. Everything downstream — the tile UI, `computeLCSPartialCredit`, `detectSwappedPair` — is unchanged from the original spec and from `BoardUnscramble` (Prompt 4); only the mapping from pool-item content to `AssemblyRound` changes:

```ts
interface TransformContent { prompt_sentence: string; instruction: string; options: string[]; correct_index: number; }

function normalizeTransformToAssembly(item: PoolItem<TransformContent>): AssemblyRound {
  const targetText = item.content.options[item.content.correct_index];
  const target = targetText.split(' ');
  return {
    id: item.id, objectiveId: item.objective_id, exerciseType: 'TRANSFORM', difficulty: item.difficulty,
    promptText: item.content.prompt_sentence,
    targetTiles: target,
    trayTiles: shuffle(target),
  };
}
```

The item's `options`/`correct_index` distractors are unused past this normalization (same "distractor fields intentionally unused" pattern as `FlashMatch` and `WhatsMissing`) — they exist so `buildGrammarItems` can construct a well-formed MCQ item, not because the student ever sees them.

**Rung 4 — the corrected source and the corrected scoring override.**

```ts
function loadRung4Round(rule: GrammarRuleBundle, objectiveId: string): ForgeRound & { rung: 4 } {
  const pairs = rule.transformation_pairs;
  const reserved = pairs[pairs.length - 1];   // same "last-index reserved" convention buildGrammarItems uses server-side (§4)
  return {
    rung: 4, kind: 'PRODUCE', objectiveId,
    patternTemplate: rule.pattern_template,
    promptOriginal: reserved.original,
    targetTransformed: reserved.transformed,
    scoringMode: currentToggleState,
  };
}

function onRung4Rating(round: ForgeRound & { rung: 4 }, rating: 'correct' | 'partial' | 'incorrect') {
  if (round.scoringMode === 'choral') { revealForComparison(round.targetTransformed); return; }  // no score, no FSRS write — same reasoning as the original spec
  const ratio = rating === 'correct' ? 1.0 : rating === 'partial' ? 0.6 : 0;
  const points = scoreForAttempt(mistakesRef.current, 3 /* documented override — no pool item, no item.difficulty to read */, ratio);
  addPoints({
    studentId: pickedStudent.id, delta: points,
    metadata: { correctness: rating, objectiveId: round.objectiveId, exerciseType: 'TRANSFORM' },
  });
  gradeObjective(pickedStudent, round.objectiveId, { exerciseType: 'productive', outcome: rating });   // FSRS written regardless of outcome, incl. a lapse on 'incorrect'
}
```

The 3-way rating UI, the choral/picked toggle, and the choral-mode FSRS trade-off are all unchanged from the original spec — only *where the round's data comes from* changed.

---

## 3. Rung 4 input toggle — unchanged

Same as the original spec: a `Commander`-only control, visible only on the rung-4 round. No changes from the schema correction.

---

## 4. Option A held-out-pairs mechanism — corrected: a builder convention, not selection-time

**This is the substantive fix.** The original spec's claim that Option A needs zero `generate-exercises` changes was wrong — it assumed the reservation could happen client-side by excluding a pool item after the fact. Since `transformation_pairs` only exists on `grammar_rules` and pool items are *constructed* from it, the reservation has to happen inside the construction step itself, or the "reserved" pair would still leak into rung 3 as a normal, fully-buildable `TRANSFORM` item.

```
// inside buildGrammarItems, per rule:
pairs = rule.transformation_pairs
reservedIndex = pairs.length - 1        // deterministic — last index, both server (builder) and client (rung 4 loader) apply the same rule independently, no new stored flag needed
buildablePairs = pairs.slice(0, reservedIndex)   // everything except the reserved pair

for each pair in buildablePairs:
  correctOption = pair.transformed
  distractorOptions = otherPairsIn(buildablePairs).map(p => p.transformed)   // reserved pair's `transformed` text never appears as a distractor either — keeps rung 4's answer from leaking early
  emit TRANSFORM pool item { prompt_sentence: pair.original, options: shuffle([correctOption, ...distractorOptions.slice(0,2)]), correct_index: <index of correctOption> }
```

**Content sufficiency, reconsidered under the real constraint.** The bar isn't just "enough pairs to hold one out" — it's "enough *remaining* pairs, after reservation, to each get at least one distractor from the others," since `buildGrammarItems` needs to construct valid MCQ items:

```
totalPairs = rule.transformation_pairs.length
if totalPairs >= 5:  healthy — 1 reserved, 4+ remaining, good distractor variety across multiple rung-3 rounds
if totalPairs == 4:  workable — 1 reserved, 3 remaining, each item draws from the other 2 (tight but functional)
if totalPairs == 3:  thin — 1 reserved, 2 remaining, each item has exactly 1 distractor available (minimally valid, not robust)
if totalPairs <= 2:  do NOT reserve — buildGrammarItems can't construct a valid post-reservation MCQ.
                      Build normally from all pairs (no held-out one), and this objective simply skips
                      rung 4 for this session — capped at rung 3 until more content exists.
```

One nuance worth being precise about: since rung 3's *student-facing* task (path b) never shows the MCQ options at all — it only uses `options[correct_index]`'s text for tiles — thin distractors don't hurt what the student experiences. They only constrain whether `buildGrammarItems` can construct a well-formed item in the first place. That's a real bar, just a lower one than "the demo needs to look good," which matters for the verification check below.

**The verification check, still honestly unrun by me.** Same limitation as before — I don't have repo/DB access in this conversation. GLM does, and already ran the schema check; the remaining check is a data-distribution one:

```sql
SELECT rule_id, jsonb_array_length(transformation_pairs) AS pair_count
FROM grammar_rules;
```
If the median `pair_count` is ≥5, Option A is safe as the default MVP path with the per-rule fallback above catching the thin tail. If it's well below that, most rules would skip rung 4 under the fallback. **If thin: try bumping `enrich-unit`'s target pair-count per rule first** (a prompt-only change) before investing in Option B — same recommendation as the original spec, still the right order of operations.

---

## 5. Option B (`PATTERN_FILL`) — unchanged, still marked v2

The 5-step recipe from the original spec stands unchanged: new `exercise_type`, new `PatternFillContent` variant (`{pattern_template, promptWord, exampleFilled}`), new builder branch, registry row, and a renderer that's mostly rung 4's existing UI with `promptOriginal` swapped for `promptWord`. `enrich-unit`'s grammar prompt gains a small addition (3–5 prompt words per rule). Nothing about the schema correction changes this section — it was already correctly scoped as new content, not a reinterpretation of existing content.

---

## 6. Registration — corrected rung range, corrected precedent

```ts
SHELL_CAPABILITIES.BOARD_GRAMMAR_FORGE = { consumes: ['ERROR_SPOT', 'TRANSFORM'], rungRange: [2, 3] };
// rung 4 is NOT in this declaration — it doesn't go through useEscalatingPool/pool items at all.
```

**This is a hybrid shell, same pattern as `BoardStorySequencing` (Prompt 4), not the "interaction-mode reuse" pattern I originally claimed.** That framing assumed rung 4 read a reserved *pool item* under a different interaction mode — it doesn't; it reads `grammar_rules` directly, structurally outside the pool system, exactly like `StorySequencing`'s round 1 (panel sequencing) sits outside it. `SHELL_CAPABILITIES` covers the pool-sourced rungs (2–3); rung 4 is real content the shell renders, just not through this declaration — worth stating precisely since it's a different (and now correctly-precedented) situation than my first pass claimed.

Everything else from the original registration spec stands: add to `SUPPORTED_FLOW_TYPES`, both current render switches (Phase 8 collapses them later, no rework needed), `PHASE_ENVELOPE` as `PRACTICE` throughout (unchanged reasoning — `PRACTICE`'s envelope has no rung ceiling beyond mastery, and this is one slide with three internal rounds, not split flow blocks).

---

## 7. Lifecycle, controls, `SLIDE_COMPLETE`, feedback, empty-state — unchanged except rung 4's data shape

The dispatcher, round counts (2/2/1), controls spec, `SLIDE_COMPLETE` trigger, and the rung-4-specific feedback exception (reveal-and-move-on instead of the standard miss-escalation loop, since it's a one-shot rating not a retry loop) are all unchanged from the original spec — only `ForgeRound`'s rung-4 variant lost its `item: PoolItem` field (§2), which the dispatcher and controls code should reference as `round.objectiveId` directly rather than `round.item.objective_id`.

**Empty-state, extended:** in addition to the original spec's `error_examples` (≥4) and pair-count thresholds, add the `totalPairs <= 2` case from §4 explicitly — that objective runs rungs 2–3 only, no rung 4 round scheduled for it this session, same graceful per-objective degradation already established for `WhatsMissing`'s produce-mode and `Unscramble`'s two-ladder eligibility.

---

## 8. Backend changes — corrected list

- **`enrich-unit` for Option A: still no changes.** This part of the original answer holds — the reservation is a *builder* concern, not a generation-prompt concern.
- **`generate-exercises` for Option A: YES, a change is needed — this corrects the original spec's "probably not."** `buildGrammarItems` needs the reservation logic in §4: reserve the last-indexed pair, exclude it from both item construction and other items' distractor pools. Small, contained, but real — not zero as originally claimed.
- **`enrich-unit` for Option B:** unchanged from original — add a 3–5 prompt-words-per-rule ask to the existing grammar prompt.
- **`generate-exercises` for Option B:** unchanged from original — new `buildPatternFillItem` branch, per the 5-step recipe.
- **`orchestrate-lesson`:** unchanged from original — the Sandbox→Forge back-to-back placement rule, keyed to shared `objective_id`.

---

## Acceptance criteria — checked against the corrected schema

- **Real student production:** unchanged — rung 3 (tile assembly, now correctly sourced) and rung 4 (judged production) both require genuine attempts.
- **Discarded fields used, correctly sourced:** `pattern_template` and `error_examples` — Sandbox reads `grammar_rules` directly; `transformation_pairs` — Sandbox demo cards read raw pairs directly, Forge rung 3 reads the pool's MCQ-converted form, Forge rung 4 reads the reserved raw pair directly (§ content source map).
- **Receptive→productive, mastery-driven:** unchanged.
- **Scoring difficulty/modality-aware, rung 4 via 3-way rating + toggle:** unchanged, with rung 4's difficulty now explicitly flagged as a full override (no backing item at all, not just a mismatched one).
- **Held-out-pairs MVP + thin-pair fallback:** re-spec'd correctly as a builder convention with the real distractor-availability constraint, not the original (wrong) selection-time version.
- **Registered everywhere, correct rung range:** `[2,3]`, not `[2,4]` — hybrid-shell framing corrected.
- **Backend changes precisely listed:** now accurately states Option A needs a small `generate-exercises` change, correcting the original's wrong "probably not."
