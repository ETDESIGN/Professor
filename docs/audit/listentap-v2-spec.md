# BoardListenTap v2 — Implementation Spec

> Response to Prompt 2 of the per-game design series. Builds on `professor-live-architecture-design.md` §1.1 (vocab ladder), §2.2/§2.3, §3 (scoring/feedback), §4.1/§4.3. Audit references: `§G` (current implementation, streaks called decorative), `§H3` (dead control bar).
>
> **Corrected capability set:** `consumes: ['LISTEN_SELECT','MINIMAL_PAIR_SWIPE','DICTATION']`, `rungRange: [2,4]` (not `[1,4]` — see note above the fold). No rung-1 content in this shell; `IMAGE_SELECT`/rung 1 stays FlashMatch's territory.
>
> **Correction 2026-08-05 (field names):** the original draft invented content field names (`audioUrl`, `correctImageUrl`, `distractorImageUrls`, `optionA/optionB`, `correctSide`, `targetSpelling`). Verified against `types/exercise.ts` — the real shapes are `audio_url`, `options[correct_index].image_url`, `pair`, `options[correct_index]`, `correct_text`. The normalizer/evaluate code below is corrected; the design is unchanged. All future per-game specs must cite `types/exercise.ts` verbatim.

---

## 1. Three payload types as listen-tap rounds

```ts
// REAL shapes from types/exercise.ts (do NOT invent fields — these are verbatim):
//   ListenSelectContent        { audio_url, prompt_text?, options: (SelectableImageOption & Partial<TextOption>)[], correct_index }
//   MinimalPairSwipeContent    { pair: [string, string], audio_url, options: TextOption[], correct_index, prompt? }
//   DictationContent           { audio_url, correct_text, hint? }
// where SelectableImageOption = { image_url, label? } and TextOption = { text }.

type ListenTapRound =
  | { kind: 'LISTEN_SELECT';      item: PoolItem }
  | { kind: 'MINIMAL_PAIR_SWIPE'; item: PoolItem }
  | { kind: 'DICTATION';          item: PoolItem; scoringMode: 'choral' | 'picked' };
```

**`LISTEN_SELECT` (rung 2, current mechanic, unchanged):** audio auto-plays, image options appear after the existing ~3s delay, tap the matching image. This within-slide pacing stays exactly as-is — it's presentational pacing, not the slide-advance question `§4.3` governs.

**`MINIMAL_PAIR_SWIPE` (rung 2, narrower discrimination):** audio plays one of two phonologically close words (e.g. *ship*/*sheep*); two tiles render side by side (image if available, text fallback), teacher relays the class's left/right call. Binary, no partial credit — there's no "almost right" between two options.

**`DICTATION` (rung 4, the shell's productive round) — the UI question, answered explicitly:**

Typed input happens on the **Remote-Baton only**, never the projector Board — a live-typed field on the projector would show the class an empty box mid-thought, which adds nothing. Two modes, selected by the same decision-4 per-round toggle, exposed as a Commander control specific to this round only (the receptive rounds above never need it — they're not free production, so there's no choral/picked ambiguity for them):

- **Choral:** no student is picked. The teacher solicits the class's collective spelling attempt (however they run that pedagogically — calling it out together, a volunteer proposing it, a mini-whiteboard held up — is a teaching-method choice outside this app's concern; the app only needs *some* text), types the class's attempt into the Remote field, submits. The Board shows a class-wide right/wrong/close visual. **No `addPoints` call** — per decision 4, choral means nobody's scored.
- **Picked:** the wheel picks a student first, as with any other picked-turn game. The teacher transcribes whatever that student produces and submits. Full lifecycle scoring applies (`§3` below), personalized via `usePickedStudent()`.

One architecture note worth surfacing explicitly since it isn't stated anywhere else: this slide is tagged `PRACTICE` (per `§1.2`'s typical-shells table), yet its final round reaches rung 4 — genuine free production. That's consistent with `§1.2`'s own envelope table: `PRACTICE`'s range is "floor 1 → ceiling set by class mastery," with no stated rung ceiling, unlike `OUTPUT`'s explicit "2–3." So a `PRACTICE`-tagged slide legitimately climbing to rung 4 when mastery supports it isn't a phase violation — it's exactly what an escalating shell is supposed to do. The choral/picked toggle applies specifically to the `DICTATION` round because *that* round is genuinely free-production, independent of what the containing slide's phase tag says.

**Confirming the distinction the prompt asks about:** `DICTATION`'s scoring compares two **strings** — what the teacher typed vs. `content.correct_text` — via Levenshtein edit distance. No audio, no `evaluate-pronunciation`, no STT anywhere in this path. However the word got from the student's mouth to the teacher's fingers is a classroom-method detail the app never sees. This is unaffected by decision 2's pronunciation deferral, because it was never a pronunciation-scoring path to begin with — it's pure text-distance, same category as `WORD_BANK_BUILD`'s LCS partial credit in `§3.2`, just character-level instead of tile-level.

---

## 2. Making streaks meaningful

Today's streak counter is decorative (`§G`). Two candidate mechanics were on the table — *escalate the rung* or *narrow the options* — and they aren't interchangeable, so picking one deliberately:

**Streaks escalate; misses narrow.** `§3.3` already assigns "narrow the options" a specific, opposite-direction meaning: it's the 1st-miss hint, i.e. *help after struggling*. Reusing the same mechanic as a reward for doing well would make one visual cue mean two contradictory things depending on context — confusing for a 7-year-old reading the board. Streaks instead accelerate the round schedule, which is the mechanic actually consistent with everything else in this architecture: a class blowing through items correctly is itself a same-session mastery signal, so let it pull the ladder-climb forward — still capped by the real mastery ceiling, never bypassing it.

```
function streakBonus(streakCount):
  if streakCount >= 10: return 2
  if streakCount >= 5:  return 1
  if streakCount >= 3:  return 1
  return 0

effectiveRung(objective, roundIndex, streakCount) =
  min(
    listenTapRoundBaseline(roundIndex).rung + streakBonus(streakCount),
    nextRungForObjective(objective, srsFor(objective)),   // mastery cap, never bypassed
    LISTEN_TAP.rungRange.max                               // = 4
  )
```

Streak is tracked **class-wide, not per-student** — one shared 🔥 counter on the Board, since the projector is a shared surface and the whole class feels the momentum together regardless of which student is currently picked. Resets to 0 on any wrong attempt from anyone, at any point in the slide.

---

## 3. Lifecycle + scoring

Unlike `FlashMatch` (a simultaneous K-pair board), `ListenTap` is **sequential, one item per turn** — so the lifecycle contract applies in its original, unmodified form: one `mistakesRef` scalar and one `awardedRef` boolean, both reset on `currentTurnId` change. No adaptation needed here.

```ts
const mistakesRef = useRef(0);
const awardedRef = useRef(false);
const classStreakRef = useRef(0);

useEffect(() => {
  mistakesRef.current = 0;
  awardedRef.current = false;
}, [state.currentTurnId]);

function evaluate(round: ListenTapRound, submitted: string): { correct: boolean; partialCreditRatio: number } {
  const c = round.item.content as any;
  if (round.kind === 'LISTEN_SELECT') {
    // c.options[c.correct_index].image_url is the correct image; submitted = the image_url the teacher tapped
    const correctUrl = c.options?.[c.correct_index]?.image_url;
    return { correct: submitted === correctUrl, partialCreditRatio: 1.0 };
  }
  if (round.kind === 'MINIMAL_PAIR_SWIPE') {
    // c.options[c.correct_index] is the correct option; submitted = the chosen option's index as a string ('A'|'B' or '0'|'1')
    // Convention: submit the chosen index; compare against c.correct_index.
    return { correct: Number(submitted) === c.correct_index, partialCreditRatio: 1.0 };
  }
  // DICTATION — c.correct_text is the target string
  const dist = levenshtein(submitted, c.correct_text);
  const maxLen = Math.max(submitted.length, c.correct_text.length);
  const ratio = clamp(1 - dist / maxLen, 0, 1);
  return { correct: ratio >= DICTATION_PASS_THRESHOLD /* 0.6 */, partialCreditRatio: ratio };
}

function onAttempt(round: ListenTapRound, submitted: string) {
  if (awardedRef.current) { showChip('🔁 already scored this turn'); return; }

  const { correct, partialCreditRatio } = evaluate(round, submitted);

  if (correct) {
    awardedRef.current = true;
    if (round.kind === 'DICTATION' && round.scoringMode === 'choral') {
      showClassFeedback(partialCreditRatio < 1 ? 'close' : 'correct');   // engagement only
    } else {
      const points = scoreForAttempt(mistakesRef.current, round.item.difficulty, partialCreditRatio);
      addPoints({
        studentId: pickedStudent.id, delta: points,
        metadata: { correctness: partialCreditRatio < 1 ? 'partial' : 'correct', objectiveId: round.item.objective_id, exerciseType: round.kind },
      });
      showSuccessToast(`Nice one, ${pickedStudent.name}!`);
      classStreakRef.current += 1;
    }
    checkSlideComplete();
  } else {
    mistakesRef.current += 1;
    classStreakRef.current = 0;
    if (round.kind !== 'DICTATION' || round.scoringMode === 'picked') {
      addPoints({
        studentId: pickedStudent.id, delta: -MISTAKE_PENALTY,
        metadata: { correctness: 'incorrect', objectiveId: round.item.objective_id, exerciseType: round.kind },
      });
    }
    // choral DICTATION misses: feedback only, no penalty — nobody's being scored either direction
    maybeShowHint(round, mistakesRef.current);
  }
}
```

`DICTATION_PASS_THRESHOLD = 0.6`: below this, the attempt scores as fully incorrect (no credit for a wildly wrong guess that happens to share a couple of letters) — a floor, not a sliding freebie.

---

## 4. Contextual controls, `SLIDE_COMPLETE`, empty-state

```ts
const LISTEN_TAP_CONTROLS: ContextualControlsSpec = {
  shellType: 'LISTEN_TAP',
  controls: {
    skip:         { label: 'Skip', enabled: true, onTrigger: skipCurrentItem },
    revealHint:   { label: 'Hint', enabled: (round) => round.kind !== 'MINIMAL_PAIR_SWIPE', onTrigger: revealHintForRound },
    forceCorrect: { label: 'Mark Correct', enabled: hasSubmittedAttempt, onTrigger: forceCorrectCurrentItem },
    nextRound:    { label: 'Next', enabled: true, onTrigger: advanceToNextItem },
    endSlide:     { label: 'End', enabled: true, onTrigger: () => broadcast('SLIDE_COMPLETE', { forced: true }) },
  },
};
```

`revealHint` is genuinely disabled (visible but grayed, not hidden — keeps the control bar's shape consistent across round kinds within one slide) for `MINIMAL_PAIR_SWIPE`: there's nothing to eliminate from a binary choice. Its fallback hint (below) is a re-play, not an elimination.

**`SLIDE_COMPLETE`** fires when the last round's attempt resolves — correct, incorrect-after-reveal, or skipped. This is item-count-exhausted, not "board fully matched" — a different completion condition from `FlashMatch` by design, since this shell is sequential.

**Feedback loop, per round kind:**
- `LISTEN_SELECT` 1st miss → eliminate one wrong distractor image.
- `MINIMAL_PAIR_SWIPE` 1st miss → re-play the audio (nothing to eliminate in a binary choice; flagging as an assumption that no isolated-phoneme asset exists today — if one does, use it instead, but don't block the shell on building one).
- `DICTATION` 1st miss → reveal the first letter as a scaffold.
- Any round, 2nd miss → micro-explanation card (word + image + L1 gloss for the receptive rounds; full correct spelling for `DICTATION`).
- End of slide → any objective missed at least once (not skipped) pushes to the `remediationQueue`, same shape as `§3.3`.

**Empty-pool state:** minimum viable slide size recommended at **4–5 items**. Degradation order: (1) fall back to the other rung-2 type for that objective if the preferred one is missing; (2) if `DICTATION` content is missing for an objective whose mastery supports rung 4, fall back to rung 2 for that objective rather than skipping it entirely; (3) below the minimum count after fallback, render "Content isn't ready for this round yet" with a Skip Slide control — never a sub-minimum or broken round.

---

## Acceptance criteria — checked

- **Multi-type listen rounds + a productive round:** `LISTEN_SELECT` → `MINIMAL_PAIR_SWIPE` → `DICTATION`, three real phases across the corrected `[2,4]` range (§1).
- **Meaningful streaks:** escalate the round schedule, deliberately distinct from the miss-hint mechanic, mastery-capped (§2).
- **Coherent controls:** full spec, `revealHint` honestly disabled where it doesn't apply rather than silently doing nothing (§4).
- **Sound pedagogy:** broad recognition → narrow discrimination → free production, stated explicitly (§1–§2).
- **Typed-Levenshtein vs. STT distinction:** confirmed explicitly — `DICTATION` never touches audio or `evaluate-pronunciation` (§1).
- **Full lifecycle/scoring spec:** unmodified 4-must-dos (sequential shell, no per-item adaptation needed), correctness metadata on every `addPoints` call, choral mode correctly withholds scoring (§3).
