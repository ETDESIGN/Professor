# BoardWhatsMissing v2 (absorbs BoardMagicEyes) — Implementation Spec

> Response to Prompt 3 of the per-game design series. Builds on `professor-live-architecture-design.md` §1.1, §2.2, §3, §4.1/§4.3, §6.2 (the consolidation decision). Audit references: `§G` (both current implementations, both unscored), `§H4` (the "student never inputs" critique this fixes).
>
> **Capability change from the prompt's stated declaration:** `rungRange` widened from `[1,1]` to `[1,4]`, `consumes` unchanged (`['IMAGE_SELECT']`). Justified in §3 — this is the one shell where rung tracks *interaction mode*, not payload type, and doing that properly (rather than inventing a parallel gating mechanism) requires the wider declared range so `nextRungForObjective`'s mastery cap actually protects the produce-mode round the way it protects every other shell's rung-4 content.
>
> **Correction 2026-08-05 (field names):** the original draft invented `content.correctImageUrl`, `content.distractorImageUrls`, and `content.word`. Verified against `types/exercise.ts` — `ImageSelectContent` has no such fields. The real fields are `prompt` (the L2 word), `options: SelectableImageOption[]` (each `{image_url, label?}`), and `correct_index`. The correct image is `options[correct_index].image_url`; distractors are simply the other `options[]` entries — there is no separate distractor array. Code below is corrected; the design is unchanged.

---

## 0. The pedagogical case for this shell (as asked)

Both modes are retrieval-practice games: something is shown, then hidden, and the class has to reconstruct it from memory rather than re-recognize it in front of them. That's a materially different — and for retention purposes, stronger — operation than most of the portfolio's recognition tasks (`IMAGE_SELECT` in `FlashMatch`, for instance, keeps the correct answer visible on the board the whole time). Forcing active recall of something no longer visible is closer to what the class will actually need at home between lessons, when the flashcard isn't there either. Pairing that with the produce-mode escalation (§3–§4) — recall *and* spell it — pushes the same retrieval act one step further toward what free use actually requires. This is worth stating because it's the justification for promoting these two games to scored at all: an unscored memory game teaches nothing the app can verify happened; a scored one is direct evidence for `srs_items`.

---

## 1. Mode flag — what differs, what's shared

```ts
type WhatsMissingMode = 'whats_missing' | 'magic_eyes';
type InteractionMode = 'recognize' | 'produce';   // rung 1 vs. rung 4 — see §3

interface WhatsMissingRoundConfig {
  mode: WhatsMissingMode;
  interactionMode: InteractionMode;
  gridItems: PoolItem<ImageSelectContent>[];  // whats_missing: 4–8 items forming the grid; magic_eyes: exactly 1
  testedIndex: number;                        // which gridItems entry is hidden (whats_missing) / the single flashed item (magic_eyes)
}
```

| | `whats_missing` | `magic_eyes` |
|---|---|---|
| Presentation | Grid of 4–8 images, memorize ~10s, one tile visually removed | Single image, flash ~3s, then blurred/obscured |
| What's being tested | "Which one is gone?" (relational memory across a set) | "What did you just see?" (single-item recall under time pressure) |
| Pacing | Slower, deliberate | Fast, energizer-style |
| Interaction modes used | Both `recognize` and `produce`, escalating across rounds (§3) | `recognize` only, every round — see justification below |
| Question source | `IMAGE_SELECT` pool content (unchanged) | **Reframed to pull from `IMAGE_SELECT` pool content too** (resolves the prompt's open question) — no custom teacher-authored question needed |

**MagicEyes' question, resolved in favor of pool content, reframed.** Today's "ask a question about what you saw" implies open-ended comprehension questions this shell has no content pipeline for — that's `STORY_COMPREHENSION`'s territory (`§C`), and reaching for it here would mean inventing new content requirements for a consolidation task that's supposed to be about scoring, not content expansion. Reframe the question to something `IMAGE_SELECT` already answers cleanly: after the flash, "which of these was it?" — same recognition operation as `whats_missing`, just under flash-then-blur pacing instead of grid-then-hide pacing. Two modes that look and feel different but share one underlying pool contract.

**Why `magic_eyes` doesn't also get the produce-mode escalation.** Its whole identity is fast, reactive pacing — a warm-up energizer, not a deliberate memory test. Bolting a slower typed-recall step onto it would both undercut that pacing and make it functionally identical to `whats_missing`'s late rounds, which would remove the actual reason to keep two selectable modes rather than one. Keeping `magic_eyes` recognition-only, always rung 1, preserves a real distinction between the modes instead of two skins on the same game.

---

## 2. Making the student actually input something

The audit's critique isn't "give the student a device" — that would violate constraint 1. It's that today there's **no app-tracked answer submission at all**: the teacher just narrates a reveal and judges correctness entirely outside the app. Every other shell in this portfolio already solves this the same way — the student answers orally or by pointing at the projector, and the **teacher taps on their behalf**. `WhatsMissing`/`MagicEyes` are the two games that never adopted that pattern. Fix: give them the same one.

**Recognize mode:** after the hide/blur moment, a **candidate tray** of 3–4 image tiles appears below the grid — the tested item's full `content.options[]` set (which already includes the correct image at `options[correct_index].image_url` plus its distractors as the other `options[]` entries), shuffled. No cross-item aggregation needed (unlike `FlashMatch`'s board in Prompt 1) — every `IMAGE_SELECT` item already carries its own candidate set in `options[]`. The picked student names/points at their answer; the teacher taps the matching candidate tile. That tap (the chosen `image_url`) is the real, scoreable input event.

**Produce mode:** same as `DICTATION`'s design in Prompt 2 — a text field on the Remote-Baton (never the projector), teacher types what the picked student says the missing word was, submits. Scored via Levenshtein against `content.prompt` (the L2 word, §3).

---

## 3. Scoring, and the difficulty override

```ts
const mistakesRef = useRef(0);
const awardedRef = useRef(false);

useEffect(() => {
  mistakesRef.current = 0;
  awardedRef.current = false;
}, [state.currentTurnId]);

// The flagged exception: don't trust item.difficulty verbatim in produce mode.
// The IMAGE_SELECT item was authored assuming receptive use; produce mode asks
// a genuinely different, harder question of the same content.
function effectiveDifficulty(item: PoolItem, interactionMode: InteractionMode): 1 | 2 | 3 {
  return interactionMode === 'produce' ? 2 : item.difficulty;   // 2 matches TYPE_TRANSLATE/DICTATION's typical difficulty
}

function onAnswer(round: WhatsMissingRoundConfig, submitted: string) {
  if (awardedRef.current) { showChip('🔁 already scored this turn'); return; }
  const testedItem = round.gridItems[round.testedIndex];
  const difficulty = effectiveDifficulty(testedItem, round.interactionMode);

  let correct: boolean, partialCreditRatio = 1.0;
  const c = testedItem.content as any;
  if (round.interactionMode === 'recognize') {
    // submitted = the image_url the teacher tapped; compare to the correct option's image_url
    correct = submitted === c.options?.[c.correct_index]?.image_url;
  } else {
    // produce mode: typed recall vs. the L2 word (c.prompt)
    const dist = levenshtein(submitted, c.prompt);
    const maxLen = Math.max(submitted.length, c.prompt.length);
    const ratio = clamp(1 - dist / maxLen, 0, 1);
    correct = ratio >= 0.6;
    partialCreditRatio = ratio;
  }

  if (correct) {
    awardedRef.current = true;
    const points = scoreForAttempt(mistakesRef.current, difficulty, partialCreditRatio);
    addPoints({
      studentId: pickedStudent.id, delta: points,
      metadata: { correctness: partialCreditRatio < 1 ? 'partial' : 'correct', objectiveId: testedItem.objective_id, exerciseType: 'IMAGE_SELECT' },
    });
    showSuccessToast(`Nice one, ${pickedStudent.name}!`);
    checkSlideComplete();
  } else {
    mistakesRef.current += 1;
    addPoints({
      studentId: pickedStudent.id, delta: -MISTAKE_PENALTY,
      metadata: { correctness: 'incorrect', objectiveId: testedItem.objective_id, exerciseType: 'IMAGE_SELECT' },
    });
    maybeShowHint(round, mistakesRef.current);
  }
}
```

Partial credit applies only in produce mode (Levenshtein, same 0.6 pass floor as `DICTATION` in Prompt 2, for the same reason: consistency of "what counts as close enough" across every typed-recall round in the portfolio). Recognize mode stays binary — a candidate tray is an MCQ, no partial credit applies (`§3.2`).

---

## 4. Variety across rounds — the escalation

Only `whats_missing` mode escalates; `magic_eyes` stays rung 1 every round (§1).

```
function whatsMissingRoundBaseline(roundIndex, totalRounds):
  return roundIndex <= ceil(totalRounds / 2) ? 1 : 4   // recognize early, produce late

targetInteractionMode(objective, roundIndex) =
  min(whatsMissingRoundBaseline(roundIndex), nextRungForObjective(objective, srsFor(objective))) >= 4
    ? 'produce' : 'recognize'
```

A brand-new objective (mastery `new` → rung 1) never gets pulled into a produce-mode round even in the slide's final round — same mastery-cap guarantee every escalating shell in this portfolio gets, which is the whole reason this shell's `rungRange` needed widening rather than inventing a separate ad hoc gate.

---

## 5. Contextual controls, `SLIDE_COMPLETE`, feedback, empty-state

```ts
const WHATS_MISSING_CONTROLS: ContextualControlsSpec = {
  shellType: 'WHATS_MISSING',
  controls: {
    skip:         { label: 'Skip', enabled: true, onTrigger: skipCurrentRound },
    revealHint:   { label: 'Hint', enabled: true, onTrigger: revealHintForRound },  // eliminate 1 candidate (recognize) / reveal first letter (produce)
    forceCorrect: { label: 'Mark Correct', enabled: hasSubmittedAnswer, onTrigger: forceCorrectCurrentRound },
    replay:       { label: 'Show Again', enabled: beforeAnswerSubmitted, onTrigger: replayMemorizeOrFlashPhase },  // one re-run of the memorize/flash beat, teacher discretion
    nextRound:    { label: 'Next', enabled: true, onTrigger: advanceToNextRound },
    endSlide:     { label: 'End', enabled: true, onTrigger: () => broadcast('SLIDE_COMPLETE', { forced: true }) },
  },
};
```

**`SLIDE_COMPLETE`** fires when the last round's answer resolves — sequential, one memorize-then-recall cycle per round, same completion model as `ListenTap` (Prompt 2), not a simultaneous board like `FlashMatch` (Prompt 1).

**Feedback loop:** 1st miss → eliminate one candidate tile (recognize) or reveal the first letter (produce); 2nd miss → micro-explanation card (word + image shown clearly, memory-game framing: "here's what it was!"); end of slide → missed (not skipped) objectives push to the `remediationQueue`.

**Empty-pool state:** `whats_missing` needs a real grid to be meaningful — recommend a **floor of 4 items** (2×2); below that the "what's missing" task degenerates into near-binary guessing and isn't worth running. Degrade grid size (8→6→4) before failing. `magic_eyes` needs only 1 item per round, so its empty-state risk is just "not enough distinct objectives for the requested round count," handled by the standard shrink-round-count fallback. Below the floor for either mode: "Content isn't ready for this round yet" + Skip Slide control, never a sub-floor or broken round.

---

## Acceptance criteria — checked

- **Both modes score:** yes, unified model, correctness metadata on every `addPoints` call (§3).
- **Variety in recall modality:** `whats_missing` escalates recognize→produce; `magic_eyes` justified as recognition-only by pacing/identity, not a scoring shortcut (§1, §4).
- **Coherent controls:** full spec, shared across both modes, plus a mode-agnostic `Show Again` (§5).
- **Sound pedagogy stated:** retrieval practice / active recall vs. passive recognition, and why that justifies the scoring promotion (§0).
- **Full lifecycle/scoring spec:** standard unmodified 4-must-dos (sequential shell), the difficulty-override exception flagged and justified, not silently applied (§3).
- **MagicEyes no longer a separate component:** one shell, `mode` flag, shared candidate-tray/input machinery (§1–§2).
