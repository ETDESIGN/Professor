# BoardFlashMatch v2 — Implementation Spec

> Response to Prompt 1 of the per-game design series. Builds on `professor-live-architecture-design.md` §1.1 (vocab ladder), §2.2 (`SHELL_CAPABILITIES`), §2.3 (`useEscalatingPool`), §3 (scoring/feedback), §4.1/§4.3 (controls/advance). Audit references: `§G` (current implementation), `§H2` (the "one-mechanic-forever" critique this fixes), `§H3` (the dead-control-bar bug this fixes).
>
> **Resolved capability set for this shell:** `consumes: ['IMAGE_SELECT', 'MEANING_MATCH', 'AUDIO_L1_SELECT']`, `rungRange: [1,3]`. Rung 2 (audio discrimination) is explicitly out of scope for FlashMatch — see the note above the fold. This spec designs to that resolved set.
>
> **Correction 2026-08-05:** the original draft's `normalizeToMatchPair` used invented content field names (`.word`, `.meaning`, `.correctImageUrl`, `.audioUrl`, `.correctL1Text`). Verified against `types/exercise.ts` — the real fields are `prompt` / `options[correct_index]` / `audio_url`. The normalizer in §1 below is corrected; the design (three payloads → one `MatchPair`) is unchanged. All future per-game specs must cite `types/exercise.ts` field names verbatim.

---

## 1. The match metaphor across three payload types

FlashMatch's UI is a two-column tile board (left tile ↔ right tile, tap-tap to pair). Today only `MEANING_MATCH` feeds it, and that type's content is already native pair data. The other two types aren't natively pair data — `IMAGE_SELECT` and `AUDIO_L1_SELECT` are single-item MCQ shapes (one prompt, one correct answer, several distractors). The normalizer's job is converting all three into the same `MatchPair` shape without touching the existing board-rendering code.

```ts
type TileKind = 'text' | 'image' | 'audio';

interface MatchTile {
  id: string;            // stable key for drag/tap targeting
  kind: TileKind;
  display: string;       // word text | image URL | audio URL
}

interface MatchPair {
  id: string;             // = pool_item.id
  objectiveId: string;
  exerciseType: 'MEANING_MATCH' | 'IMAGE_SELECT' | 'AUDIO_L1_SELECT';
  difficulty: 1 | 2 | 3;  // read straight off the pool item, never computed here
  left: MatchTile;
  right: MatchTile;
}

// NOTE: field names verified 2026-08-05 against types/exercise.ts (the canonical
// ExerciseContent union). The earlier draft of this spec invented `.word` /
// `.meaning` / `.correctImageUrl` / `.audioUrl` / `.correctL1Text` — none of
// those exist. The shapes below are the real ones:
//   MeaningMatchContent  { prompt, prompt_audio?, options: string[], correct_index }
//   ImageSelectContent   { prompt, prompt_audio?, prompt_translation?, options: SelectableImageOption[], correct_index }
//   AudioL1SelectContent { audio_url, prompt_text?, options: string[], correct_index }
// where SelectableImageOption = { image_url, label? }.
// Going forward, every per-game spec MUST cite types/exercise.ts field names
// verbatim — do not infer them from naming conventions.
function normalizeToMatchPair(item: PoolItem): MatchPair {
  const base = { id: item.id, objectiveId: item.objective_id, exerciseType: item.exercise_type, difficulty: item.difficulty };
  const c = item.content as any;
  switch (item.exercise_type) {
    case 'MEANING_MATCH': {
      // c.prompt = L2 word; c.options[c.correct_index] = the correct L1 meaning
      const meaning = c.options?.[c.correct_index];
      return { ...base,
        left:  { id: `${item.id}-L`, kind: 'text', display: c.prompt },
        right: { id: `${item.id}-R`, kind: 'text', display: String(meaning ?? '') } };
    }
    case 'IMAGE_SELECT': {
      // c.prompt = L2 word; c.options[c.correct_index].image_url = the correct image
      const correctImg = c.options?.[c.correct_index]?.image_url;
      return { ...base,
        left:  { id: `${item.id}-L`, kind: 'text', display: c.prompt },
        right: { id: `${item.id}-R`, kind: 'image', display: String(correctImg ?? '') } };
    }
    case 'AUDIO_L1_SELECT': {
      // c.audio_url = L2 utterance audio; c.options[c.correct_index] = the correct L1 meaning
      const meaning = c.options?.[c.correct_index];
      return { ...base,
        left:  { id: `${item.id}-L`, kind: 'audio', display: c.audio_url },
        right: { id: `${item.id}-R`, kind: 'text', display: String(meaning ?? '') } };
    }
    default:
      throw new Error(`FlashMatch cannot render exercise_type ${item.exercise_type}`);
  }
}
```

**A deliberate, non-obvious design decision:** each item's non-correct `options[]` entries (the distractors authored for single-item MCQ rendering) are **not used** by the normalizer. In a matching board of K pairs assembled from K different objectives, the other K−1 objectives' correct tiles already serve as the distractor set — that's what makes it a matching game rather than K separate MCQs. Those distractor options were authored for single-item MCQ rendering (e.g. in `LISTEN_TAP` or a future `SPEED_QUIZ` round using the same item) and are simply irrelevant here. (Note: `MEANING_MATCH` and `AUDIO_L1_SELECT` carry `options: string[]` + `correct_index`; `IMAGE_SELECT` carries `options: SelectableImageOption[]` + `correct_index`. There are no separate `distractor*` arrays on the content — the distractors are simply `options` minus the correct one.) One consequence worth flagging, not solving now: distractor *difficulty* in a matching board is whatever the round's other objectives happen to be, not curated near-misses — if `buildRound` ever selects two visually or phonetically near-identical objectives into the same round (e.g. two similar animals), the board gets accidentally harder than the item's own `difficulty` field implies. Not a blocker for v1; worth a `buildRound` refinement later (avoid pairing known-confusable objectives in one board), not required to ship this shell.

**Mixed-type boards are expected, not an edge case.** Because `nextRungForObjective` is computed per-objective, a single round can legitimately contain some pairs sourced from `IMAGE_SELECT` (an objective still at rung 1) sitting next to pairs sourced from `MEANING_MATCH` (an objective already at rung 3) on the *same board*. The normalizer handles this for free — it operates per-item, not per-round — and it's a real pedagogical win: one board differentiates instruction across the roster's actual mastery spread instead of forcing the whole class through one uniform difficulty.

Rendering notes for the two new tile kinds: an `image` tile renders the image directly (no text label — matching purely on recognition). An `audio` tile renders a play-button affordance; **tapping it both plays the clip and acts as the pairing selection** — there's no separate "preview" mode, since the class needs to hear it before the teacher taps a pairing partner, and re-tapping to replay is always allowed (does not consume a mistake or re-trigger scoring).

---

## 2. Round escalation sequence

Round-to-rung mapping, clamped to this shell's `rungRange: [1,3]` and skipping rung 2 entirely (per the resolution above):

```
function flashMatchRoundBaseline(roundIndex, totalRounds):
  // rounds 1..ceil(totalRounds/2) target rung 1, the rest target rung 3
  midpoint = ceil(totalRounds / 2)
  return roundIndex <= midpoint ? 1 : 3
```

Per-pair rung is still capped by mastery, exactly per §1.3:

```
targetRung(objective, roundIndex) = min(
  flashMatchRoundBaseline(roundIndex, totalRounds),
  nextRungForObjective(objective, srsFor(objective))
)
```

So a brand-new objective never gets pulled into a rung-3 (meaning-recall) pair even in round 5 — it stays at rung 1 (`IMAGE_SELECT`) until its own mastery earns the climb, exactly as `§1.3`'s worked example specifies.

At rung 3, both `MEANING_MATCH` and `AUDIO_L1_SELECT` are valid — prefer whichever the objective has more of in the pool (variety); if both exist, alternate per-objective by a stable hash of `objective_id + roundIndex` so the same objective doesn't always resolve to the same rung-3 type across a session.

Call shape into `useEscalatingPool` (Prompt 0):

```ts
const { pairs, roundComplete } = useEscalatingPool({
  unitId,
  shellType: 'FLASH_MATCH',
  roster,
  roundIndex,
  totalRounds,
});
// pairs: PoolItem[] already filtered to this round's target rung(s) per objective,
// via buildRound + SHELL_CAPABILITIES.FLASH_MATCH.consumes
const matchPairs = pairs.map(normalizeToMatchPair);
```

---

## 3. Lifecycle + scoring

**Adapting the 4-must-dos to a multi-pair board — the documented replacement constraint 2 allows for.** The lifecycle contract as written (one `mistakesRef` scalar, one `awardedRef` flag) assumes one attempt-object per turn. A FlashMatch board has K independent pairs live at once, so the adaptation is: **per-pair** mistake tracking and award-latching, both cleared wholesale on `currentTurnId` change.

```ts
const mistakesByPairRef = useRef<Record<string, number>>({});
const awardedPairsRef = useRef<Set<string>>(new Set());

useEffect(() => {
  mistakesByPairRef.current = {};
  awardedPairsRef.current = new Set();
}, [state.currentTurnId]);

function onPairAttempt(pair: MatchPair, chosenRightTileId: string) {
  const correct = chosenRightTileId === pair.right.id;

  if (correct) {
    if (awardedPairsRef.current.has(pair.id)) return;   // duplicate event guard (realtime footgun)
    awardedPairsRef.current.add(pair.id);
    const mistakes = mistakesByPairRef.current[pair.id] ?? 0;
    const points = scoreForAttempt(mistakes, pair.difficulty, 1.0);  // no partial credit — see below
    addPoints({
      studentId: pickedStudent.id,
      delta: points,
      metadata: { correctness: 'correct', objectiveId: pair.objectiveId, exerciseType: pair.exerciseType },
    });
    lockTilePair(pair.id);
    showSuccessToast(`Nice one, ${pickedStudent.name}!`);   // usePickedStudent()
    checkRoundComplete();
  } else {
    mistakesByPairRef.current[pair.id] = (mistakesByPairRef.current[pair.id] ?? 0) + 1;
    addPoints({
      studentId: pickedStudent.id,
      delta: -MISTAKE_PENALTY,
      metadata: { correctness: 'incorrect', objectiveId: pair.objectiveId, exerciseType: pair.exerciseType },
    });
    shakeTiles(pair.left.id, chosenRightTileId);
    maybeShowNarrowedHint(pair);   // §3.3 — see §6 below
  }
}
```

**Partial credit: N/A for this shell.** All three consumed types (`MEANING_MATCH`, `IMAGE_SELECT`, `AUDIO_L1_SELECT`) are binary match-or-not per `§3.2` — none are on the LCS or pronunciation partial-credit list. `partialCreditRatio` is always `1.0` here; `scoreForAttempt` is called with only `mistakes` and `difficulty` varying.

`difficulty` for each call comes straight off `pair.difficulty` (the pool item's own field) — never recomputed by the shell, per the prompt's own instruction.

---

## 4. Contextual controls — fixes the dead-bar bug (`§H3`)

```ts
const FLASH_MATCH_CONTROLS: ContextualControlsSpec = {
  shellType: 'FLASH_MATCH',
  controls: {
    skipPair:     { label: 'Skip', enabled: hasSelectedPair, onTrigger: skipCurrentPair },        // no penalty, not pushed to remediationQueue (not a wrong attempt, just unattempted)
    revealHint:   { label: 'Hint', enabled: hasSelectedLeftTile, onTrigger: glowCorrectRightTile }, // brief highlight of the correct partner, doesn't auto-complete
    forceCorrect: { label: 'Mark Correct', enabled: hasAmbiguousPair, onTrigger: forceCorrectPair }, // teacher override for defensible-but-flagged-wrong oral answers
    nextRound:    { label: 'Next Round', enabled: true, onTrigger: advanceRoundManually },          // unmatched pairs in the current round are logged as skipped, not wrong
    endSlide:     { label: 'End', enabled: true, onTrigger: () => broadcast('SLIDE_COMPLETE', { forced: true }) },
  },
};
```

`forceCorrectPair` routes through the same `onPairAttempt(pair, pair.right.id)` success branch — it's a normal correct-scored event, just triggered by the teacher's judgment call instead of a tap match, exactly the kind of case the contract's `Force-Correct` control exists for (oral responses the app can't itself verify).

---

## 5. `SLIDE_COMPLETE`

Two triggers, both broadcast the same event:
- **Natural:** the final round's board has all pairs locked (`awardedPairsRef.current.size === matchPairs.length` on the last round).
- **Forced:** the teacher's `endSlide` control.

Round-to-round advance *within* the slide (round 2 finishing → round 3 starting) is **not** gated by this — per `§4.3`'s distinction, that's within-slide pacing and can auto-advance on round completion. Only the slide-to-slide macro loop stays manual; a completed round here simply loads the next round's `matchPairs` automatically.

---

## 6. Error-driven feedback (`§3.3`), applied per-pair

- **1st wrong attempt on a pair:** `glowCorrectRightTile` for ~1.5s (the same visual as the manual Hint control, triggered automatically) — a narrowed hint, not a giveaway; the pair still requires a correct tap to lock.
- **2nd wrong attempt on the same pair:** a micro-explanation card overlays briefly — word + meaning shown large, plus an example sentence if the objective's content carries one. *Dependency flag:* this assumes vocab objectives carry an `exampleSentence` field somewhere in their content/metadata. If they don't today, fall back to just re-displaying the word + meaning pairing large and bold rather than fabricating an example sentence.
- **End of slide:** any pair that was ever wrong at least once (regardless of eventual success) pushes `{ objectiveId, missedBy: [pickedStudent.id at time of miss], lastMissedAt }` to the `SessionContext`-level `remediationQueue` (Prompt 0). Pairs skipped via the `skipPair` control are **not** pushed — "didn't get to it" isn't the same signal as "got it wrong," and conflating them would pollute the next WRAPUP/REVIEW slide's remediation round with objectives nobody actually struggled with.

---

## 7. Empty-pool state

If `useEscalatingPool` can't fill a round to a minimum viable size (recommend **3 pairs**) at the target rung for enough objectives — because the unit's pool is still generating, or a specific objective genuinely has no `IMAGE_SELECT`/`AUDIO_L1_SELECT` content — degrade gracefully in this order:
1. Fall back to any *other* consumed type at the *same* rung for that objective (e.g. `MEANING_MATCH` instead of `AUDIO_L1_SELECT` at rung 3).
2. Fall back to a lower rung within `rungRange` for that objective only (still respecting the mastery cap — never fall back to a *higher* rung).
3. If still short of the minimum board size after (1)–(2) across all lesson objectives, render a "Content isn't ready for this round yet" state with a single **Skip Round** control for the teacher — never render a broken or sub-minimum board.

---

## 8. Grammar — N/A

All three consumed types (`IMAGE_SELECT`, `MEANING_MATCH`, `AUDIO_L1_SELECT`) are vocab-builder-emitted (audit `§C`). FlashMatch's `SHELL_CAPABILITIES` entry has no grammar types in its `consumes` list and shouldn't — grammar's escalation lives entirely in `BoardGrammarForge` (`§5`). No handling needed here.

---

## Acceptance criteria — checked

- **Variety delivered:** 3 payload types, mastery-gated per pair, mixed-type boards supported natively (§1–§2).
- **Coherent teacher controls:** full `ContextualControlsSpec` registered, no dead bar (§4).
- **Sound pedagogy stated per rung:** rung 1 = recognize (image↔word), rung 3 = recall meaning via text or audio prompt (§2).
- **Full lifecycle/scoring spec with correctness metadata:** per-pair adaptation of the 4 must-dos, documented as a replacement per constraint 2, all `addPoints` calls carry `correctness` (§3).
- **Feedback loop wired:** 1st/2nd-miss escalation + remediation queue push, scoped to actual misses not skips (§6).
- **Grammar N/A:** noted (§8).
