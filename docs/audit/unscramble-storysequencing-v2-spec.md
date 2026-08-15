# BoardUnscramble + BoardStorySequencing v2 — Implementation Spec

> Response to Prompt 4. Builds on `professor-live-architecture-design.md` §1.1, §1.3, §2.2, §2.4, §3, §4.1/§4.3. Audit references: `§G` (both current implementations), `§H4` (StorySequencing's literal-string objective bug; unconsumed `STORY_COMPREHENSION` content).
>
> **Correction 2026-08-05 (field names — significant):** the original draft invented content fields for both `WORD_BANK_BUILD` (`targetSentence`, `word`) and `TRANSFORM` (`original`, `transformed`, `ruleId`). Verified against `types/exercise.ts`:
> - **`WordBankBuildContent`** real shape: `{ target_sentence, word_bank: string[], translation?, audio_url? }`. There is no `word` field — the vocab word being exercised isn't on the content; if needed it must come from the parent objective's `target_value`. Field rename: `targetSentence` → `target_sentence`. The `word_bank` is the shuffled candidate tile set (already provided by the generator, no client-side shuffle needed).
> - **`TransformContent`** real shape: `{ prompt_sentence, instruction, options: string[], correct_index }`. This is an **MCQ**, not an `original→transformed` open pair. The draft treated it as a free-form transform-into-tiles task, but the pool stores 4 discrete correction options with one correct. **Design implication:** the "TRANSFORM round as tile assembly" idea in §A2 doesn't match the stored shape. Two resolution paths: (a) render TRANSFORM as a choose-the-correct-version MCQ (matches the pool, loses the tile-assembly metaphor), or (b) treat the *correct option* (`options[correct_index]`) as the target and split *it* into tiles, with `prompt_sentence` shown as the reference line — this preserves the tile metaphor using only the correct option's text. Path (b) is recommended to keep the spec's UX intact; the code below is corrected to path (b). Flag this back to Claude for the remaining grammar-strand prompts, which likely have the same mismatch.

## Architecture fix carried by this prompt (not scoped to one shell)

```ts
const LADDER_CEILING: Record<ObjectiveType, number> = {
  vocabulary: 5,
  grammar: 4,
  story: 3,
  dialogue: 3,
};

function nextRungForObjective(objective: Objective, srsState: SrsItem | null): number {
  const raw = rawMasteryToRung(srsState);   // new→1, learning→2-3, familiar→4, mastered→5, decaying→3 (Prompt 0, unchanged)
  return Math.min(raw, LADDER_CEILING[objective.type]);
}
```

Without the clamp, a `mastered` grammar objective would compute rung 5 — a rung that doesn't exist on the grammar ladder — and any shell reading it (this one, and `BoardGrammarForge`) would either error or silently misbehave. This is a one-line fix to a function every escalating shell already calls; worth landing centrally rather than working around it per-shell.

---

# Part A — BoardUnscramble

## A0. Round-eligibility model for a two-ladder shell

Because `WORD_BANK_BUILD` (vocab rung 5) and `TRANSFORM` (grammar rung 3) sit on different ladders, `rungRange: [3,5]` doesn't mean one escalating track climbing 3→5 within a slide. It means two independent eligibility floors:

```
vocabEligible(objective)   = nextRungForObjective(objective, srsFor(objective)) >= 5   // WORD_BANK_BUILD
grammarEligible(objective) = nextRungForObjective(objective, srsFor(objective)) >= 3   // TRANSFORM
```

A round mixes whichever objectives from the lesson clear their own ladder's threshold — exactly the mixed-type-board pattern already established for `FlashMatch` (Prompt 1), just spanning two content domains instead of one. A vocab objective only reaches `WORD_BANK_BUILD` once it's essentially mastered (rung 5 is deliberately the hardest vocab rung — free use in context); a grammar objective reaches `TRANSFORM` once it's past recognition (rung 3, matching `BoardGrammarForge`'s own rung 3, architecture doc §5.2).

## A1. LCS partial credit — the algorithm

```ts
function lcsLength(a: string[], b: string[]): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
    }
  }
  return dp[a.length][b.length];
}

function computeLCSPartialCredit(placedTiles: string[], targetTiles: string[]): number {
  return lcsLength(placedTiles, targetTiles) / targetTiles.length;
}

const UNSCRAMBLE_PASS_THRESHOLD = 0.5;   // below this, scored as a full miss, not a low partial
```

LCS (not bag-of-words overlap) is the right comparison because it credits *order-preserving* runs specifically — "right words, wrong order" only pays for however much of the original order survived, not just for having all the right words present somewhere. A single adjacent-tile swap loses relatively little LCS length; a fully reversed sentence loses much more — the algorithm naturally grades the *severity* of the scramble, not just whether it's wrong.

**Targeted feedback — the diff algorithm.** Tile sets are assumed to be an exact anagram of the target (no distractor tiles) — "Unscramble" as a mechanic is reordering, not selection. That means most real classroom mistakes are transpositions, and the most common, most explainable one is two adjacent tiles swapped:

```ts
function detectSwappedPair(placed: string[], target: string[]): [number, number] | null {
  const diffPositions = target.map((_, i) => i).filter(i => placed[i] !== target[i]);
  if (diffPositions.length === 2) {
    const [a, b] = diffPositions;
    if (b === a + 1 && placed[a] === target[b] && placed[b] === target[a]) return [a, b];
  }
  return null;
}
```

If it finds a clean adjacent swap, highlight exactly those two tiles with a "swap these!" cue — genuinely targeted feedback. For anything messier (non-adjacent, multiple errors), don't try to explain the whole diff — fall back to highlighting just the first wrong position, same "narrowed hint" spirit as `§3.3` elsewhere, just not overclaiming precision it can't deliver.

## A2. Varying the task — two round types, one tile UI

```ts
// REAL shapes from types/exercise.ts:
//   WordBankBuildContent { target_sentence: string, word_bank: string[], translation?, audio_url? }
//   TransformContent     { prompt_sentence: string, instruction: string, options: string[], correct_index }
//   StoryComprehensionContent { prompt, options: string[], correct_index, story_page_id? }

interface AssemblyRound {
  id: string;
  objectiveId: string;
  exerciseType: 'WORD_BANK_BUILD' | 'TRANSFORM';
  difficulty: 1 | 2 | 3;
  promptText?: string;      // undefined for WORD_BANK_BUILD; = content.prompt_sentence for TRANSFORM (the reference line)
  instruction?: string;     // TRANSFORM only (e.g. "Make it negative")
  targetTiles: string[];    // target sentence split into word tiles
  trayTiles: string[];      // the candidate tiles (from word_bank for WBB; shuffled target for TRANSFORM path b)
}

function normalizeToAssemblyRound(item: PoolItem): AssemblyRound {
  const base = { id: item.id, objectiveId: item.objective_id, exerciseType: item.exercise_type, difficulty: item.difficulty };
  const c = item.content as any;
  if (item.exercise_type === 'WORD_BANK_BUILD') {
    // target_sentence is the assembly target; word_bank already carries the shuffled candidate set
    const target = c.target_sentence.split(' ');
    return { ...base, targetTiles: target, trayTiles: c.word_bank ?? shuffle(target) };
  }
  // TRANSFORM (path b): the CORRECT option is the assembly target; prompt_sentence is the reference line.
  // The student sees prompt_sentence + instruction, and assembles the correct option from tiles.
  const correctOption = String(c.options?.[c.correct_index] ?? '');
  const target = correctOption.split(' ');
  return { ...base, promptText: c.prompt_sentence, instruction: c.instruction, targetTiles: target, trayTiles: shuffle(target) };
}
```

The tile-tap UI itself doesn't change between types — tap tiles into an ordered row, same as today. What changes is the framing above the tray: `WORD_BANK_BUILD` shows just the vocab word being tested (bold, for context); `TRANSFORM` shows the original sentence as a fixed reference line above the tray, so the student is visibly transforming something rather than assembling from nothing.

## A3. Lifecycle + scoring

Sequential, one assembly attempt per turn — standard unmodified 4-must-dos:

```ts
const mistakesRef = useRef(0);
const awardedRef = useRef(false);
useEffect(() => { mistakesRef.current = 0; awardedRef.current = false; }, [state.currentTurnId]);

function onSubmit(round: AssemblyRound, placedTiles: string[]) {
  if (awardedRef.current) { showChip('🔁 already scored this turn'); return; }
  const ratio = computeLCSPartialCredit(placedTiles, round.targetTiles);

  if (ratio >= UNSCRAMBLE_PASS_THRESHOLD) {
    awardedRef.current = true;
    const points = scoreForAttempt(mistakesRef.current, round.difficulty, ratio);
    addPoints({
      studentId: pickedStudent.id, delta: points,
      metadata: { correctness: ratio === 1 ? 'correct' : 'partial', objectiveId: round.objectiveId, exerciseType: round.exerciseType },
    });
    showSuccessToast(ratio === 1 ? `Nice one, ${pickedStudent.name}!` : `So close, ${pickedStudent.name}!`);
    checkSlideComplete();
  } else {
    mistakesRef.current += 1;
    addPoints({
      studentId: pickedStudent.id, delta: -MISTAKE_PENALTY,
      metadata: { correctness: 'incorrect', objectiveId: round.objectiveId, exerciseType: round.exerciseType },
    });
    const swap = detectSwappedPair(placedTiles, round.targetTiles);
    swap ? highlightSwap(swap) : highlightFirstWrongPosition(placedTiles, round.targetTiles);
  }
}
```

## A4. Controls, `SLIDE_COMPLETE`, empty-state

```ts
const UNSCRAMBLE_CONTROLS: ContextualControlsSpec = {
  shellType: 'UNSCRAMBLE',
  controls: {
    skip:         { label: 'Skip', enabled: true, onTrigger: skipCurrentRound },
    revealHint:   { label: 'Hint', enabled: true, onTrigger: () => { const s = detectSwappedPair(currentPlaced, currentTarget); s ? highlightSwap(s) : highlightFirstWrongPosition(currentPlaced, currentTarget); } },
    forceCorrect: { label: 'Mark Correct', enabled: hasSubmitted, onTrigger: forceCorrectCurrentRound },
    nextRound:    { label: 'Next', enabled: true, onTrigger: advanceToNextRound },
    endSlide:     { label: 'End', enabled: true, onTrigger: () => broadcast('SLIDE_COMPLETE', { forced: true }) },
  },
};
```

`SLIDE_COMPLETE` on last round's submit resolving. Empty-state: minimum 3 rounds recommended (fewer makes the "escalation" meaningless); if `TRANSFORM`-eligible or `WORD_BANK_BUILD`-eligible objectives run short, fall back to whichever track has content rather than forcing a 50/50 mix every time — an all-vocab or all-grammar slide is fine, an empty slide isn't.

---

# Part B — BoardStorySequencing

## B0. A structural note before the fixes

Sequencing's round 1 (arrange panels) isn't sourced from `pool_items` at all — it operates on the story's own manifest/panel data (`slot.order`), which sits outside the `exercise_type` taxonomy entirely. That's fine — not everything needs to run through the typed-pool system, and story manifests are already a legitimate content source per the audit — but it means this shell's `SHELL_CAPABILITIES` declaration only covers round 2, since round 1 isn't `useEscalatingPool`-driven:

```ts
SHELL_CAPABILITIES.STORY_SEQUENCING = { consumes: ['STORY_COMPREHENSION'], rungRange: [1,1] };
```
No declaration was given for this shell in the prompt — proposing this one, since round 2 is the only part that needs one.

## B1. Fixing the objective_id

Today's literal-string bug (`§H4`: grading against `'story_sequencing'` rather than a real `objective_id`) is worse than a cosmetic mislabel: **every story in the unit collides into one shared fake `srs_items` row.** A class's Cinderella sequencing performance and their Red Riding Hood sequencing performance currently blend into the same fabricated mastery record — meaning no story ever gets real per-story tracking. Fix:

```ts
// before: gradeObjective(student, 'story_sequencing', attempt)
// after:
gradeObjective(student, story.objective_id, { exerciseType: 'story_sequencing_attempt', ...attempt });
```

`story.objective_id` is the real row from `objectives` (`type='story'`) — the exercise-type-ish tag moves into the attempt's metadata, not the identifier itself.

## B2. Two-round structure: sequence → comprehend

**Round 1 — sequencing (unchanged mechanic, now partial-credit + correctly attributed).** Reuses `computeLCSPartialCredit` from Part A — panel IDs stand in for tiles, same algorithm, same reasoning (order-preserving credit, not just "all panels present"). No natural `pool_item.difficulty` exists here (it's manifest-driven, not pool-driven); use a documented shell-level override, **difficulty = 2** (constrained production — understanding narrative causality is more than pure recognition, less than free production), same category of exception as `WhatsMissing`'s produce-mode override in Prompt 3.

**Rounds 2..N — comprehension.** After sequencing resolves, pull the story's `STORY_COMPREHENSION` pool items (recommend capping at **4 questions** to keep pacing tight for a live class) — this is the fix for `§H4`'s specific complaint that this content type exists and nothing consumes it. Sequential, one question per round, standard MCQ — binary scoring, `item.difficulty` used directly, no partial credit (`§3.2` — MCQ stays binary).

## B3. Lifecycle + scoring

```ts
const mistakesRef = useRef(0);
const awardedRef = useRef(false);
useEffect(() => { mistakesRef.current = 0; awardedRef.current = false; }, [state.currentTurnId]);

// Round 1 — sequencing
function onSequenceSubmit(placedOrder: string[], targetOrder: string[]) {
  if (awardedRef.current) { showChip('🔁 already scored this turn'); return; }
  const ratio = computeLCSPartialCredit(placedOrder, targetOrder);
  if (ratio >= 0.5) {
    awardedRef.current = true;
    const points = scoreForAttempt(mistakesRef.current, 2 /* documented override */, ratio);
    gradeObjective(pickedStudent, story.objective_id, { exerciseType: 'story_sequencing_attempt', correctness: ratio === 1 ? 'correct' : 'partial' });
    addPoints({ studentId: pickedStudent.id, delta: points, metadata: { correctness: ratio === 1 ? 'correct' : 'partial', objectiveId: story.objective_id, exerciseType: 'story_sequencing_attempt' } });
  } else {
    mistakesRef.current += 1;
    addPoints({ studentId: pickedStudent.id, delta: -MISTAKE_PENALTY, metadata: { correctness: 'incorrect', objectiveId: story.objective_id, exerciseType: 'story_sequencing_attempt' } });
  }
}

// Rounds 2..N — comprehension (fresh mistakesRef/awardedRef per question, standard turn model)
function onComprehensionAnswer(item: PoolItem, submitted: string) {
  const correct = submitted === item.content.correctAnswer;
  const points = correct ? scoreForAttempt(mistakesRef.current, item.difficulty, 1.0) : 0;
  if (correct) {
    addPoints({ studentId: pickedStudent.id, delta: points, metadata: { correctness: 'correct', objectiveId: story.objective_id, exerciseType: 'STORY_COMPREHENSION' } });
  } else {
    mistakesRef.current += 1;
    addPoints({ studentId: pickedStudent.id, delta: -MISTAKE_PENALTY, metadata: { correctness: 'incorrect', objectiveId: story.objective_id, exerciseType: 'STORY_COMPREHENSION' } });
  }
}
```

Both rounds write to the *same* `story.objective_id` — sequencing and comprehension are different operations on the same underlying objective, exactly the "same objective, multiple activities across the ladder" pattern the whole architecture is built on.

## B4. Controls, `SLIDE_COMPLETE`, feedback, empty-state

```ts
const STORY_SEQUENCING_CONTROLS: ContextualControlsSpec = {
  shellType: 'STORY_SEQUENCING',
  controls: {
    skip:         { label: 'Skip', enabled: true, onTrigger: skipCurrentRound },
    revealHint:   { label: 'Hint', enabled: true, onTrigger: revealHintForCurrentRound },   // sequencing: highlight one correctly-placed vs. one misplaced panel; comprehension: eliminate 1 distractor
    forceCorrect: { label: 'Mark Correct', enabled: hasSubmitted, onTrigger: forceCorrectCurrentRound },
    nextRound:    { label: 'Next', enabled: true, onTrigger: advanceToNextRound },
    endSlide:     { label: 'End', enabled: true, onTrigger: () => broadcast('SLIDE_COMPLETE', { forced: true }) },
  },
};
```

`SLIDE_COMPLETE` fires after the last comprehension question resolves (or after sequencing alone, if the story has zero `STORY_COMPREHENSION` items — see empty-state). Feedback loop: sequencing's 1st miss highlights one clearly-misplaced panel (not a full diff — panel counts are usually higher than sentence word counts, so a full diff algorithm is less useful here than for Unscramble); comprehension follows the standard MCQ hint (eliminate one distractor on 1st miss). End of slide pushes `story.objective_id` to the `remediationQueue` if either round was missed.

**Empty-state:** if the story has fewer than 2 `STORY_COMPREHENSION` items, run round 1 (sequencing) alone and skip straight to `SLIDE_COMPLETE` rather than padding with too few comprehension questions to feel like a real check — this is the one shell where "no comprehension round at all" is an acceptable, clean degradation rather than a broken state, since sequencing alone is still a complete, scoreable activity.

---

## Acceptance criteria — checked

- **LCS partial credit + targeted feedback (Unscramble):** algorithm specified precisely, adjacent-swap detection for genuinely targeted hints, generic fallback otherwise (A1).
- **Variety of assembly tasks incl. TRANSFORM bridge:** two types, one shared UI, two-ladder eligibility model resolved explicitly (A0, A2). `SPELL_CLOZE` declined with reasoning.
- **StorySequencing real objective_id + comprehension round:** fixed, with the actual consequence of the old bug stated, not just the fix (B1, B2).
- **Coherent controls:** both shells, full specs (A4, B4).
- **Sound pedagogy:** two-ladder eligibility for Unscramble; sequence-then-comprehend as two operations on one objective for StorySequencing (A0, B2).
- **Full lifecycle/scoring spec with partial-credit math:** both games, correctness metadata incl. `'partial'` on every relevant `addPoints` call (A3, B3).
