# BoardStoryStage + BoardDialogueStage v2 — Implementation Spec

> Response to Prompt 7. Builds on `professor-live-architecture-design.md` §1.1, §2.2, §3, §4.1/§4.3. Reuses established patterns: the 3-way rating (`BoardGrammarForge` rung 4, Prompt 5), the choral/picked toggle (Prompts 2, 5), the multi-attempt-per-turn adaptation (`FlashMatch`, Prompt 1), the sequencing→comprehension two-stage structure (`BoardStorySequencing`, Prompt 4). Audit references: `§G`, `§H4`, `§I` (registration).
>
> **⚠ Correction 2026-08-06 (verified against `types/exercise.ts` + `supabase/migrations/20260730000001_dialogue_lines.sql` + `generate-exercises/index.ts` `buildDialogueItems`).** The original spec invented content shapes for all three pool types this shell consumes. The designs hold; the field names and one structural assumption are wrong. All corrected below:
>
> 1. **`STORY_COMPREHENSION`** — spec used `{question, options, correctAnswer}`. **Real shape:** `{ prompt: string, options: string[], correct_index: number, story_page_id?: string | null }`. There is no `correctAnswer` string field — the correct answer is `options[correct_index]`. The comparison must be index-based (or compare the submitted option text to `options[correct_index]`), not a direct string equality to an invented field.
>
> 2. **`WHO_SAID_IT`** — spec used `{ line, correctCharacter, distractorCharacters }`. **Real shape:** `{ line_text: string, options: string[], correct_index: number, context_before?: string, context_after?: string }`. Again, no `correctCharacter` field — the correct speaker is `options[correct_index]`. Distractors are simply the other `options[]` entries (no separate `distractorCharacters` array). The `context_before`/`context_after` fields are a bonus the spec didn't use — worth surfacing in the comprehension-check UI (show the surrounding lines).
>
> 3. **`DIALOGUE_ROLEPLAY`** — spec used `{ characters: string[], lines: { character, text }[] }`. **Real shape:** `{ lines: { speaker: string, text: string, translation?: string }[], dialogue_index: number }`. **There is no top-level `characters` array** — the characters must be *derived* by collecting the unique `speaker` values from `lines[].speaker`. This affects §2.1's role-assignment logic: `characters = [...new Set(item.content.lines.map(l => l.speaker))]`. The field is `speaker` not `character`. Also: `lines[].translation` (the L1 gloss) is available and should be surfaced in the read-along stage for the bilingual presentation.
>
> **Standing reminder (now triggered on 4 of 7 specs):** every per-game spec must cite `types/exercise.ts` field names verbatim. The `correctAnswer` / `correctCharacter` / `characters` pattern of inventing a "convenient" derived field instead of using the real MCQ `options[correct_index]` shape is the single most repeated error across this spec series.

## Why narrative output matters (the pedagogy ask)

Every other productive activity in this portfolio operates at the sentence level or below — a single transformed sentence, a single translated word, a single assembled phrase. Dialogue role-read and story comprehension are the only places in the whole redesign where a student sustains attention and produces language across *multiple connected lines* rather than one isolated item. That's a different skill: tracking who's speaking, responding in character, holding a narrative thread — not just recalling or transforming a fact. It's also the closest thing in a live class to the actual social use of English the rest of the curriculum is building toward. Worth stating because it's the justification for scoring these at all, same as `WhatsMissing`'s retrieval-practice justification in Prompt 3.

---

## 1. `BoardStoryStage` — scored comprehension closer

```ts
// REAL shape from types/exercise.ts (verified):
interface StoryComprehensionContent { prompt: string; options: string[]; correct_index: number; story_page_id?: string | null; }
```

After the storybook read-through (existing, unchanged), present `STORY_COMPREHENSION` items sequentially as scored MCQs, picked-student-answered via teacher relay — same mechanic as `BoardStorySequencing`'s round 2 (Prompt 4, Part B2/B3), reused directly rather than redesigned:

```ts
const mistakesRef = useRef(0);
const awardedRef = useRef(false);
useEffect(() => { mistakesRef.current = 0; awardedRef.current = false; }, [state.currentTurnId]);

function onComprehensionAnswer(item: PoolItem<StoryComprehensionContent>, submittedIndex: number) {
  if (awardedRef.current) { showChip('🔁 already scored this turn'); return; }
  const correct = submittedIndex === item.content.correct_index;   // index-based comparison, real shape
  if (correct) {
    awardedRef.current = true;
    addPoints({ studentId: pickedStudent.id, delta: scoreForAttempt(mistakesRef.current, item.difficulty, 1.0),
      metadata: { correctness: 'correct', objectiveId: story.objective_id, exerciseType: 'STORY_COMPREHENSION' } });
  } else {
    mistakesRef.current += 1;
    addPoints({ studentId: pickedStudent.id, delta: -MISTAKE_PENALTY,
      metadata: { correctness: 'incorrect', objectiveId: story.objective_id, exerciseType: 'STORY_COMPREHENSION' } });
  }
}
```

Ties to `story.objective_id` — the real objective, same field `StorySequencing`'s bug fix (Prompt 4) established.

**Coordinating with `StorySequencing` over a shared item pool.** Both shells can draw from the same story's `STORY_COMPREHENSION` items. Rather than a rigid split-by-index (brittle if item counts vary per story), track a session-scoped "already asked" set, keyed by story objective:

```ts
// SessionContext-level, alongside remediationQueue — same lifetime, same reasoning
const askedComprehensionItems: Map<string /* objectiveId */, Set<string> /* poolItemIds */>;

function nextComprehensionItems(objectiveId: string, allItems: PoolItem[], count: number): PoolItem[] {
  const asked = askedComprehensionItems.get(objectiveId) ?? new Set();
  const unused = allItems.filter(i => !asked.has(i.id));
  return unused.slice(0, count);   // whichever shell runs second in the lesson naturally gets what's left
}
```

Whichever of the two shells runs first in a lesson claims items; the second automatically avoids repeats. If a story is thin on `STORY_COMPREHENSION` content (fewer items than both shells combined would want), the second shell to run simply gets fewer questions — degrade gracefully (§5), don't repeat.

---

## 2. `BoardDialogueStage` — role assignment + teacher-judged role-read

```ts
// REAL shapes from types/exercise.ts (verified):
interface DialogueRoleplayContent { lines: { speaker: string; text: string; translation?: string }[]; dialogue_index: number; }
interface WhoSaidItContent { line_text: string; options: string[]; correct_index: number; context_before?: string; context_after?: string; }
```

Three stages within one slide: **read-along** (existing, unscored) → **role assignment + role-read** (new, §2.1–§2.2) → **comprehension check** (new, `WHO_SAID_IT`, §2.3).

### 2.1 Role assignment — reusing the wheel, not inventing new machinery

**Characters are derived from the lines, not stored separately** (verified: there is no top-level `characters` array on `DialogueRoleplayContent`). Collect unique `speaker` values:

```ts
function deriveCharacters(item: PoolItem<DialogueRoleplayContent>): string[] {
  return [...new Set(item.content.lines.map(l => l.speaker))];
}

function assignRoles(item: PoolItem<DialogueRoleplayContent>): Record<string, Student> {
  const characters = deriveCharacters(item);
  const assignments: Record<string, Student> = {};
  const excluded = new Set<string>();
  for (const character of characters) {
    const student = pickStudent({ mode: activeSelectionMode, exclude: excluded });   // existing pick machinery
    assignments[character] = student;
    excluded.add(student.id);   // a student can't be assigned two roles in the same dialogue
  }
  return assignments;
}
```

The "Your Turn!" card renders the actual result: *"Character A: [name] · Character B: [name]"* — populated by this, not the current placeholder. The read-along stage surfaces `lines[].translation` (L1 gloss) for bilingual presentation.

### 2.2 Role-read scoring — one turn, per-character rating, no STT anywhere

Rated at the **whole-dialogue level per student**, not per line — asking a teacher to rate every individual line in a live class isn't practical, and the earlier games' precedent (grammar rung 4) already established whole-attempt rating as the right grain for teacher-judged production. Both characters' ratings happen within one turn, which means the standard single-`awardedRef` lifecycle doesn't fit — same adaptation `FlashMatch` needed for its multi-pair board (Prompt 1), applied here to multi-character rating instead of multi-pair matching:

```ts
const awardedByCharacterRef = useRef<Set<string>>(new Set());
useEffect(() => { awardedByCharacterRef.current = new Set(); }, [state.currentTurnId]);

function onRateRole(character: string, student: Student, rating: 'correct' | 'partial' | 'incorrect', item: PoolItem<DialogueRoleplayContent>) {
  if (awardedByCharacterRef.current.has(character)) { showChip('🔁 already scored this turn'); return; }
  awardedByCharacterRef.current.add(character);
  const ratio = rating === 'correct' ? 1.0 : rating === 'partial' ? 0.6 : 0;
  const points = scoreForAttempt(0, item.difficulty, ratio);
  addPoints({ studentId: student.id, delta: points, metadata: { correctness: rating, objectiveId: item.objective_id, exerciseType: 'DIALOGUE_ROLEPLAY' } });
  gradeObjective(student, item.objective_id, { exerciseType: 'productive', outcome: rating });
}
```

**Baton control — "Rate Role: ✓ / ~ / ✗"**, one instance per active character during this stage:

```ts
const RATE_ROLE_CONTROL: ContextualControlsSpec['controls'][string] = {
  label: 'Rate Role',
  enabled: (stage) => stage === 'role_read',
  render: (character) => ({ correct: () => onRateRole(character, assignments[character], 'correct', item),
                             partial: () => onRateRole(character, assignments[character], 'partial', item),
                             incorrect: () => onRateRole(character, assignments[character], 'incorrect', item) }),
};
```

**This is the third recurrence of "teacher rates because automated scoring is unavailable" (choral/picked toggle: Prompt 2's `DICTATION`, Prompt 5's grammar rung 4, now this).** Worth extracting the 3-way rating control and its `ratio` mapping (`correct→1.0, partial→0.6, incorrect→0`) into one shared component/function at this point rather than a third hand-written copy — flagging this as a concrete refactor opportunity for whoever implements Prompts 2/5/7 together, not a new design decision.

**Choral/picked toggle (decision 4):** choral mode skips role assignment and the rating stage entirely — there's no individual student to assign a Baton control to score, and per the established reasoning (Prompt 5), a collective read has no single attributable mastery signal, so no `addPoints`, no `gradeObjective`. Choral mode goes straight from read-along to the comprehension check (§2.3).

### 2.3 Comprehension check — `WHO_SAID_IT`

Standard sequential MCQ, unmodified 4-must-dos, binary scoring. **Index-based comparison** (real shape has `options[]` + `correct_index`, no `correctCharacter` field). Optionally surface `context_before`/`context_after` (the surrounding lines) in the question UI for richer context:

```ts
function onWhoSaidItAnswer(item: PoolItem<WhoSaidItContent>, submittedIndex: number) {
  const correct = submittedIndex === item.content.correct_index;
  // identical shape to StoryStage's onComprehensionAnswer above — same pattern, different content type
  // (mistakesRef/awardedRef/addPoints/scoreForAttempt — see §1)
}
```

**No pronunciation, no STT, anywhere in this shell.** Both scoring paths — `STORY_COMPREHENSION`'s binary MCQ and `DIALOGUE_ROLEPLAY`'s teacher-judged 3-way rating — are entirely free of audio analysis. The deferral (decision 2) is respected by construction, not by omission: there was never a point in this design where reaching for `evaluate-pronunciation` would have been the natural move, since the whole scoring model here is teacher judgment.

---

## 3. Consuming the unused pool types — summary

All three now consumed: `STORY_COMPREHENSION` (§1), `WHO_SAID_IT` (§2.3), `DIALOGUE_ROLEPLAY` (§2.2). No fourth type needed.

---

## 4. Registration — completing what Prompt 0 likely missed

```ts
// flowTypes.ts
SUPPORTED_FLOW_TYPES.push('DIALOGUE_STAGE');   // confirm present — Prompt 0 covered this

// BoardRenderer.tsx BOARD_MAP
case 'DIALOGUE_STAGE': return <BoardDialogueStage {...props} />;   // confirm present — Prompt 0 covered this

// ClassroomBoard.tsx's separate switch — the one Prompt 0 likely didn't explicitly touch
case 'DIALOGUE_STAGE': return <BoardDialogueStage {...props} />;   // add here explicitly, don't assume it's covered
```

Same temporary-duplication note as `BoardGrammarForge` (Prompt 5): Phase 8 collapses these two switches into one canonical map later; until then, both need the entry independently or `DIALOGUE_STAGE` risks being broken in exactly one of the two, which is a subtler bug than being broken in both (it half-works, making it easy to miss in testing).

---

## 5. Lifecycle, controls, `SLIDE_COMPLETE`, feedback, empty-state

**Feedback loop exception, same reasoning as grammar rung 4 (Prompt 5):** role-read's 3-way rating is one-shot, not a retry loop — `§3.3`'s 1st-miss/2nd-miss escalation doesn't apply to it. Unlike grammar, there's no "reveal the answer" moment needed on an `'incorrect'` rating either — the correct performance was already fully visible during the read-along stage that precedes it, so there's nothing new to show. `STORY_COMPREHENSION` and `WHO_SAID_IT` both follow the standard MCQ hint loop (eliminate one distractor on 1st miss).

**Controls, both shells:**

```ts
const STORY_STAGE_CONTROLS: ContextualControlsSpec = {
  shellType: 'STORY_STAGE',
  controls: {
    skip: { ... }, revealHint: { ... }, forceCorrect: { ... }, nextQuestion: { ... },
    endSlide: { label: 'End', enabled: true, onTrigger: () => broadcast('SLIDE_COMPLETE', { forced: true }) },
  },
};

const DIALOGUE_STAGE_CONTROLS: ContextualControlsSpec = {
  shellType: 'DIALOGUE_STAGE',
  controls: {
    reassignRoles: { label: 'Reassign', enabled: (stage) => stage === 'role_read', onTrigger: () => assignRoles(currentDialogueItem) },   // pass the PoolItem — deriveCharacters inside
    rateRole:      { /* §2.2 */ },
    toggleMode:    { label: 'Choral / Picked', enabled: (stage) => stage === 'pre_role_read', onTrigger: toggleScoringMode },
    skip: { ... }, revealHint: { ... }, forceCorrect: { ... }, nextStage: { ... },
    endSlide: { label: 'End', enabled: true, onTrigger: () => broadcast('SLIDE_COMPLETE', { forced: true }) },
  },
};
```

**`SLIDE_COMPLETE`:** `StoryStage` fires after the last comprehension question resolves. `DialogueStage` fires after the last `WHO_SAID_IT` question resolves — the final of its three stages regardless of whether role-read ran (choral mode) or was scored (picked mode).

**End of slide:** any comprehension miss (either shell) or any `'incorrect'` role-read rating pushes the objective to `remediationQueue`.

**Empty-state:**
- `StoryStage`: if a story has zero remaining `STORY_COMPREHENSION` items after `StorySequencing`'s claims (§1), skip the closer and end the slide after the read-through — a story read without a check is still a complete, legitimate activity, not a broken one.
- `DialogueStage`: needs ≥2 `WHO_SAID_IT` items for a meaningful check; if `DIALOGUE_ROLEPLAY` content is missing entirely for the objective, skip stage 2 (role assignment/read) and go straight from read-along to the comprehension check — same "partial activity is still a complete one" fallback as `StorySequencing`'s sequencing-without-comprehension case (Prompt 4).

---

## Acceptance criteria — checked

- **Scored output stages, teacher-judged not STT:** confirmed explicitly in §2.2's closing note — no automated pronunciation path exists anywhere in this spec.
- **Unused pool types consumed:** all three (§3).
- **Role assignment specified:** reuses existing pick machinery, one call per character, with a same-dialogue exclusion rule (§2.1).
- **Registration fixed, both switches:** explicit `ClassroomBoard.tsx` entry added, not assumed covered by Prompt 0 (§4).
- **Coherent controls incl. Rate Role:** full specs, both shells (§5).
- **Sound pedagogy stated:** narrative-level, multi-line production as a distinct skill from single-item production (above the fold).
- **Full lifecycle/scoring spec:** `StoryStage` standard, `DialogueStage`'s multi-character-per-turn adaptation documented as a replacement per constraint 2, same category as `FlashMatch`'s (§2.2).
