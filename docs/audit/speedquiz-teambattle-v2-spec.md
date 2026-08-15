# BoardSpeedQuiz + BoardTeamBattle v2 — Implementation Spec

> Response to Prompt 6. Builds on `professor-live-architecture-design.md` §1.1, §1.3 (incl. `LADDER_CEILING`, Prompt 4), §2.2, §3, §4.1/§4.3, §6.1. Audit references: `§G` (both current implementations), `§F` (TeamBattle's legacy flat +15).
>
> **⚠ Correction note 2026-08-06 (field-name footgun).** §B1's `onAnswer` uses `question.correctAnswer` (line 88) — this is a **derived** field on the `QuizQuestion` wrapper, NOT a field on any `ExerciseContent` variant. The implementer MUST compute it correctly per content type, because the real pool-item content shapes are all index-based MCQs (verified in `types/exercise.ts`):
> - `MEANING_MATCH`: `prompt` + `options[correct_index]`
> - `SPELL_CLOZE`: `sentence_with_blank` + `options[correct_index]`
> - `LISTEN_SELECT`: `audio_url` + `options[correct_index].image_url` (image MCQ — `correctAnswer` is an image URL here, not text)
> - `ERROR_SPOT`: `sentence` + `options[correct_index]`
> - `STORY_COMPREHENSION`: `prompt` + `options[correct_index]`
> - `WORD_BANK_BUILD`: `target_sentence` + `word_bank[]` (no `correct_index` — this one uses LCS partial credit, handled separately in the spec's WORD_BANK branch)
>
> Recommend building a `correctAnswerFor(item: PoolItem): string` helper that switches on `exercise_type` and returns the right value, rather than hand-writing the extraction inline. The `LISTEN_SELECT` case (image URL, not text) is the one most likely to silently break a naive `=== options[correct_index]` comparison if the implementer assumes all options are strings.

## What each question type actually assesses (the pedagogy ask, stated once, used throughout)

| Type | Ladder / rung | Assesses |
|---|---|---|
| `MEANING_MATCH` | vocab, rung 3 | recall of meaning from the written L2 form |
| `SPELL_CLOZE` | vocab, rung 3 | recall of meaning/form via a fill-in-context cue |
| `LISTEN_SELECT` | vocab, rung 2 | auditory recognition, independent of spelling |
| `WORD_BANK_BUILD` | vocab, rung 5 | free use in context — the only productive item in the mix |
| `ERROR_SPOT` | grammar, rung 2 | rule recognition — can the class tell correct from incorrect usage |
| `STORY_COMPREHENSION` | story, rung 1 | narrative understanding, independent of vocab/grammar mechanics |

Six types, three domains, four vocab rungs represented (2, 3, 3, 5) — an assessment slide that samples *across* the vocab ladder rather than pinning everything to one rung is itself a design goal here: it's diagnostic precisely because it reveals *where* on the ladder each objective's mastery sits, not just whether the class knows a fixed set of words at a fixed difficulty.

---

# Part A — Question composition (shared by both games)

## A1. The composition algorithm

Proportional-to-unit-distribution as the baseline, mastery-weighted within each slice — the prompt's two candidate approaches aren't actually alternatives, they answer different questions:

```ts
function buildQuizComposition(lessonObjectives: Objective[], totalQuestions: number, roster: Student[]): QuizQuestion[] {
  // Step 1 — how many slots per objective TYPE, proportional to what this lesson actually taught
  const distribution = countByType(lessonObjectives);   // e.g. { vocabulary: 12, grammar: 3, story: 1 }
  const typeSlots = allocateProportionally(distribution, totalQuestions, { minSlotsIfPresent: 1 });

  // Step 2 — WITHIN each type's slots, which objectives, via existing weak-ordering
  const questions: QuizQuestion[] = [];
  for (const [type, slots] of Object.entries(typeSlots)) {
    const eligible = lessonObjectives.filter(o => o.type === type);
    const ranked = classWeakObjectives(eligible, roster);        // existing helper — weakest first
    const chosen = ranked.slice(0, slots);
    questions.push(...chosen.map(o => buildQuestionForObjective(o, roster)));
  }
  return shuffle(questions);   // don't block by type — mix the order
}
```

**Why proportional-to-distribution matters, not just weak-first:** if a unit taught 80% vocabulary and a quiz came back 80% grammar because grammar objectives happened to be weaker, the assessment would be measuring something the class barely practiced, not what the lesson actually covered. Weak-ordering decides *which* objectives *within* a type get tested; the type proportions themselves track what was actually taught.

## A2. Fixing "every question is MEANING_MATCH" — the vocab type-cycling rule

Vocabulary objectives have **four** eligible types in this mix (`MEANING_MATCH`, `SPELL_CLOZE`, `LISTEN_SELECT`, `WORD_BANK_BUILD`) — this is the direct fix for the audit's specific complaint. Which one a given vocab question uses isn't random or fixed; it follows the same mastery-to-rung logic already established for `FlashMatch`/`ListenTap`, reused rather than reinvented:

```ts
function buildQuestionForObjective(objective: Objective, roster: Student[]): QuizQuestion {
  if (objective.type !== 'vocabulary') return buildFixedTypeQuestion(objective);  // grammar→ERROR_SPOT, story→STORY_COMPREHENSION, no choice to make

  const rung = nextRungForObjective(objective, srsFor(objective));   // already clamped via LADDER_CEILING
  const vocabTypeForRung: Record<number, ExerciseType> = { 1: 'LISTEN_SELECT', 2: 'LISTEN_SELECT', 3: 'MEANING_MATCH', 4: 'SPELL_CLOZE', 5: 'WORD_BANK_BUILD' };
  return buildQuestionOfType(objective, vocabTypeForRung[rung]);
}
```

A quiz now genuinely samples the ladder — a newly-introduced word gets asked receptively, a near-mastered one gets asked productively — rather than every vocabulary question being the identical "what does X mean" operation regardless of how well the class actually knows it.

## A3. Rendering `WORD_BANK_BUILD` inside an MCQ-shaped shell

The one non-MCQ type in the mix needs its own interaction, reusing `BoardUnscramble`'s machinery directly (Prompt 4, Part A) rather than rebuilding it: same tile-tap UI, same `computeLCSPartialCredit`/`detectSwappedPair`. The timer still runs underneath it — this shell's whole identity is time pressure, so the mechanism doesn't get suspended for one question type, but if the timer expires mid-assembly, score whatever was placed via LCS rather than an automatic zero. A partially-assembled sentence at timeout is a more informative diagnostic signal than a hard fail — and diagnostic signal is this shell's actual job.

---

# Part B — BoardSpeedQuiz

## B1. Lifecycle + scoring — why the standard retry loop doesn't apply here

Unlike every prior shell, `SpeedQuiz` is genuinely one-shot per question — a tapped MCQ answer is final, there's no retry within the 15s window. That means `mistakesRef` isn't tracking "attempts before eventual success" the way it does everywhere else; it collapses to a boolean.

```ts
const awardedRef = useRef(false);
useEffect(() => { awardedRef.current = false; }, [state.currentTurnId]);

function onAnswer(question: QuizQuestion, submitted: unknown) {
  if (awardedRef.current) return;
  awardedRef.current = true;

  if (question.type === 'WORD_BANK_BUILD') {
    const ratio = computeLCSPartialCredit(submitted as string[], question.targetTiles);
    const points = scoreForAttempt(0, question.difficulty, ratio);
    addPoints({ studentId: pickedStudent.id, delta: points, metadata: { correctness: ratio === 1 ? 'correct' : ratio >= 0.5 ? 'partial' : 'incorrect', objectiveId: question.objectiveId, exerciseType: 'WORD_BANK_BUILD' } });
  } else {
    const correct = submitted === question.correctAnswer;
    const points = correct ? scoreForAttempt(0, question.difficulty, 1.0) : 0;
    addPoints({ studentId: pickedStudent.id, delta: correct ? points : -MISTAKE_PENALTY, metadata: { correctness: correct ? 'correct' : 'incorrect', objectiveId: question.objectiveId, exerciseType: question.exerciseType } });
  }
}

function onTimeout(question: QuizQuestion) {
  if (awardedRef.current) return;
  if (question.type === 'WORD_BANK_BUILD') { onAnswer(question, currentPlacedTiles); return; }  // score whatever's placed
  awardedRef.current = true;
  addPoints({ studentId: pickedStudent.id, delta: -MISTAKE_PENALTY, metadata: { correctness: 'incorrect', objectiveId: question.objectiveId, exerciseType: question.exerciseType } });
}
```

**`§3.3`'s granular 1st-miss/2nd-miss feedback loop doesn't apply here, deliberately** — same category of exception as `BoardGrammarForge`'s rung 4 (Prompt 5): there's no retry to narrow a hint into. Feedback is coarser by design: each question briefly reveals the correct answer after resolving (standard quiz-show reveal), and the *real* feedback loop is the end-of-slide `remediationQueue` handoff (Part D).

## B2. Controls, `SLIDE_COMPLETE`, empty-state

```ts
const SPEED_QUIZ_CONTROLS: ContextualControlsSpec = {
  shellType: 'SPEED_QUIZ',
  controls: {
    skip:         { label: 'Skip', enabled: true, onTrigger: skipCurrentQuestion },
    revealHint:   { label: 'Hint', enabled: true, onTrigger: (q) => q.type === 'WORD_BANK_BUILD' ? highlightOneCorrectlyPlacedTile() : eliminateOneDistractor() },
    forceCorrect: { label: 'Mark Correct', enabled: hasAnswered, onTrigger: forceCorrectCurrentQuestion },
    nextQuestion: { label: 'Next', enabled: true, onTrigger: advanceToNextQuestion },
    endSlide:     { label: 'End', enabled: true, onTrigger: () => broadcast('SLIDE_COMPLETE', { forced: true }) },
  },
};
```

`SLIDE_COMPLETE` fires after the last question resolves (answered or timed out). **Empty-state:** if `buildQuizComposition`'s slot allocation for a type comes up short (no eligible objectives), redistribute those slots proportionally across the remaining types rather than leaving gaps — never render fewer than the requested `totalQuestions` unless the *entire* lesson lacks enough objectives, in which case shrink the quiz length and say so rather than padding with repeats.

---

# Part C — BoardTeamBattle

## C1. Team math — resolving "per-team-point or per-student-cognition"

Not an either/or: **the computation is per-student-cognition; the credit is dual-ledger.**

```ts
function onCellClaimed(cell: Cell, respondingStudent: Student, question: QuizQuestion, mistakes: number, partialCreditRatio: number) {
  const points = scoreForAttempt(mistakes, question.difficulty, partialCreditRatio);   // identical formula, no team multiplier

  // Ledger 1 — team aggregate, drives the tic-tac-toe win condition
  addTeamPoints(respondingStudent.teamId, points);

  // Ledger 2 — individual, unaffected by team framing
  addPoints({ studentId: respondingStudent.id, delta: points, metadata: { correctness: partialCreditRatio === 1 ? 'correct' : partialCreditRatio > 0 ? 'partial' : 'incorrect', objectiveId: question.objectiveId, exerciseType: question.exerciseType } });
  gradeObjective(respondingStudent, question.objectiveId, { exerciseType: question.exerciseType, outcome: partialCreditRatio });   // FSRS stays individual — constraint 6, two tracks

  cell.ownerTeamId = respondingStudent.teamId;
}
```

`scoreForAttempt`'s output is computed exactly as any solo game would — same formula, same difficulty multiplier, **no competitive bonus stacked on top.** The tic-tac-toe win condition already supplies the competitive stakes; adding a second multiplier on top of the unified formula would make this shell's point economy diverge from every other shell's for no pedagogical reason, undermining the "unified" part of unified scoring.

**Stealing doesn't claw back the previous owner's points.** If Team A steals a cell Team B previously claimed, Team A scores normally and ownership flips — Team B's earlier award, already paid out at the time, isn't retroactively removed. Retroactive deduction would violate the same fairness/visibility principle `§3.4` already establishes for the floor-at-zero display: don't create confusing after-the-fact penalties for something that already resolved.

## C2. Beyond MCQ-steal — the one production mechanic

Tic-tac-toe stays as the meta-structure; it's a clear, proven competitive frame and doesn't need reinventing. What changes: cells sourced from `WORD_BANK_BUILD` become **Race Cells** 🏁 — instead of an instant tap-to-claim, both teams' picked representatives get the same tile-assembly challenge simultaneously; whichever team reaches the higher LCS ratio within the shared timer claims the cell (ties favor whoever's board was placed first). Every other cell (the five MCQ-shaped types) stays the existing steal-to-claim mechanic. This gives `TeamBattle` its first genuine production task without discarding what already works, and without inventing a "grammar duel" the declared payload mix (`ERROR_SPOT` only, no `TRANSFORM`) doesn't actually support.

## C3. Controls, `SLIDE_COMPLETE`, empty-state

```ts
const TEAM_BATTLE_CONTROLS: ContextualControlsSpec = {
  shellType: 'TEAM_BATTLE',
  controls: {
    skip:         { label: 'Skip Cell', enabled: true, onTrigger: skipCurrentCell },
    revealHint:   { label: 'Hint', enabled: true, onTrigger: revealHintForCurrentCell },
    forceCorrect: { label: 'Mark Correct', enabled: hasActiveAttempt, onTrigger: forceCorrectCurrentCell },
    nextCell:     { label: 'Next Cell', enabled: true, onTrigger: advanceToNextCell },
    endSlide:     { label: 'End', enabled: true, onTrigger: () => broadcast('SLIDE_COMPLETE', { forced: true }) },
  },
};
```

`SLIDE_COMPLETE` fires on a tic-tac-toe win (3-in-a-row), a full board with no winner (draw), or the teacher's forced end. **Empty-state:** if fewer than 9 eligible questions exist across the mix to fill a 3×3 board, shrink to the largest odd grid the content supports (a smaller board is a legitimate degrade; a broken/partially-empty board isn't).

---

# Part D — Assessment → learning handoff

## D1. The `remediationQueue` push, and why severity matters here specifically

Same mechanism as every other shell (`§3.3`) — any objective answered `incorrect` or `partial` pushes to the session's `remediationQueue`. One addition specific to *assessment*-sourced misses: attach the difficulty the miss occurred at, so the next practice block can weight by how diagnostic the miss actually is.

```ts
interface RemediationEntry {
  objectiveId: string;
  missedBy: string[];
  lastMissedAt: number;
  missedAtDifficulty?: 1 | 2 | 3;   // new field, assessment-sourced entries only
}
```

**Why:** a miss on a difficulty-1 `LISTEN_SELECT` question is a much stronger signal of a real gap than a miss on a difficulty-3 `WORD_BANK_BUILD` question — the latter might just reflect a student appropriately being tested at the edge of their ability, not a fundamental hole. When the next `PRACTICE`-phase round-builder is choosing which weak objectives to prioritize and slots are limited, it should weight low-difficulty assessment misses above high-difficulty ones — a low-difficulty miss says "this isn't solid at all"; a high-difficulty miss says "this is nearly there." Practice and warmup shells reading from `remediationQueue` (Prompt 0's original shape didn't carry this field) should treat its absence as neutral — this is additive, not a breaking change to the existing consumers.

---

## Acceptance criteria — checked

- **Question-type variety, not just `MEANING_MATCH`:** the vocab type-cycling rule (A2) is the direct fix, tied to actual mastery rather than randomized for its own sake.
- **TeamBattle on unified scoring, legacy +15 retired:** dual-ledger model, same formula as every other shell, no competitive bonus stacked on (C1).
- **Assessment feeds `remediationQueue`:** specified with a severity-aware addition, not just a bare push (D1).
- **Coherent controls:** both shells, full specs (B2, C3).
- **Sound pedagogy, what each type assesses:** stated once, upfront, used to justify the composition algorithm rather than left implicit.
- **Grammar variety included:** `ERROR_SPOT` in the mix, correctly scoped to what's actually declared (no invented `TRANSFORM` duel).
