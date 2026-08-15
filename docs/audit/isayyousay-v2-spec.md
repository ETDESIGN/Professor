# BoardISayYouSay v2 — Implementation Spec

> Response to Prompt 8. Builds on `professor-live-architecture-design.md` §1.1, §2.2, §2.4, §3, §4.1/§4.3. Audit references: `§H4` ("the choral cop-out"), `§G`.
>
> `SHELL_CAPABILITIES.I_SAY_YOU_SAY = { consumes: ['SPEAK_SENTENCE', 'MINIMAL_PAIR_SWIPE'], rungRange: [2, 5] }` — a wide range spanning two content types with genuinely different scoring postures, explained in §1 and §3.
>
> **⚠ Correction 2026-08-07 (verified against `types/exercise.ts`).** Both content shapes in §1 and §3 used invented field names. The designs hold; the property names are wrong. Corrected below:
>
> 1. **`SpeakSentenceContent`** — spec used `{ targetWord, targetSentence, sentenceAudioUrl, wordAudioUrl }`. **Real shape:** `{ target_sentence: string, target_word?: string, target_audio?: string }`. There is only ONE audio field (`target_audio`) — no separate `sentenceAudioUrl`/`wordAudioUrl`. The choral stage cues in §1 must use `target_audio` for the sentence audio; the isolated-word stage uses `target_word` as the *text label* (no separate word audio exists — if word-level audio is needed, it must be generated or the stage replays the sentence audio). Map: `targetSentence → target_sentence`, `targetWord → target_word`, `sentenceAudioUrl → target_audio`, `wordAudioUrl → target_audio` (or drop the isolated-word audio cue).
>
> 2. **`MinimalPairSwipeContent`** — spec used `{ ... correctSide: 'A' | 'B' }`. **Real shape:** `{ pair: [string, string], audio_url: string, options: TextOption[], correct_index: number, prompt?: string }` where `TextOption = { text: string }`. There is no `correctSide` — the correct option is `options[correct_index]`. The `onMinimalPairAttempt` check in §3 must compare the submitted index against `correct_index`, not a string against `correctSide`. (This is the same correction applied to BoardListenTap in Prompt 2.)

---

## 1. The choral drill — real scaffolding, not a fake game

Reading the prompt's requested sequence closely, it's a **whole → part → whole** structure (a standard, legitimate language-teaching technique, not something invented for this spec): present the full utterance, isolate the hard part for focused practice, then return to the full utterance with that part reinforced.

```ts
// REAL shape from types/exercise.ts (verified):
// SpeakSentenceContent { target_sentence: string, target_word?: string, target_audio?: string }

type ChoralStage = 'whole_first' | 'isolated_word' | 'whole_second';

interface StageCue { icon: '🔊' | '👥'; label: string; audioUrl?: string; }

function stageCues(item: PoolItem): Record<ChoralStage, [StageCue, StageCue]> {
  const c = item.content as any;
  const sentence = c.target_sentence ?? '';
  const word = c.target_word ?? '';
  const audio = c.target_audio;   // single audio field — no separate word/sentence audio
  return {
    whole_first:    [{ icon: '🔊', label: 'Listen', audioUrl: audio },
                      { icon: '👥', label: `Everyone say: "${sentence}"`, audioUrl: audio }],
    isolated_word:  [{ icon: '🔊', label: 'Listen', audioUrl: audio },   // replays sentence audio — no separate word clip
                      { icon: '👥', label: `Everyone say: "${word}"`, audioUrl: audio }],
    whole_second:   [{ icon: '🔊', label: 'Listen again', audioUrl: audio },
                      { icon: '👥', label: `One more time: "${sentence}"`, audioUrl: audio }],
  };
}
```

Six steps, three stages, teacher-paced throughout (tap to advance, no timer, no auto-play-and-move-on) — the full sentence isn't just bookended for variety; isolating the target word in the middle and returning to the full sentence afterward is the actual pedagogical point: focused practice on the hard part, then immediate reintegration.

**The honest "no scoring" state.** A persistent banner during this portion: *"🎤 Speaking Practice — Listen & Repeat Together"* with no points display, no streak, no star — nothing implying a score exists where none does. This is a direct fix for the specific failure the audit names: the old version didn't just fail to score, it had decorative UI (a fake waveform) that implied engagement was being measured when it wasn't. The new version's silence on scoring is deliberate and visible, not an omission.

**Mastery-gating doesn't apply here, and that's fine.** Every scored shell in this portfolio caps content by `nextRungForObjective` to protect a student from being scored on something they're not ready for. Nothing here is scored — so there's no one to protect from a bad grade, and the round-builder can pull `SPEAK_SENTENCE` content for *any* objective in the lesson, not just mastery-eligible ones. This also quietly solves what would otherwise be an empty-state problem: `SPEAK_SENTENCE` sits at rung 5, the ladder's ceiling, so early in a unit very few objectives would be mastery-eligible for it under the normal cap — but choral repetition of a brand-new word is just exposure, the same thing `INPUT`-phase presentation already does. No cap needed.

---

## 2. The future-capture hook — clean wiring point, nothing built

```ts
// Not implemented this phase. When decision 2 is un-deferred, this is the entire remaining surface area.
interface PronunciationCaptureHook {
  onStudentAttempt: (student: Student, targetText: string, audioBlob?: Blob) => Promise<{ score: number; transcript?: string }>;
}

interface ISayYouSayProps {
  captureHook?: PronunciationCaptureHook;   // undefined today → pure choral, exactly as spec'd in §1
}
```

If `captureHook` is ever provided, the shell additionally offers the choral/picked toggle — the same UI pattern already built twice (`DICTATION`, Prompt 2; grammar rung 4, Prompt 5), gated purely on this prop's presence rather than requiring any component redesign. The hook's returned `score` (0–1) maps directly to `partialCreditRatio`, feeding the existing `scoreForAttempt(mistakes, difficulty, ratio)` formula — no new scoring model needed later, only the capture mechanism itself. Implementing `evaluate-pronunciation` as this hook is, concretely, the entire future task.

---

## 3. `MINIMAL_PAIR_SWIPE` — included, fully scored, reused not rebuilt

Same content shape and interaction as `BoardListenTap`'s rung-2 round (Prompt 2) — imported, not reimplemented:

```ts
// MinimalPairSwipeContent real shape: { pair: [string, string], audio_url: string, options: TextOption[], correct_index: number, prompt? }
// The swipe interaction + index-based evaluate() check: identical to Prompt 2, §1/§3 (reused, not rebuilt).
```

Runs as its own round, sequential, standard unmodified lifecycle (single `mistakesRef`/`awardedRef`, reset on `currentTurnId` change) — this is the one part of the slide that behaves like every other scored shell in the portfolio:

```ts
function onMinimalPairAttempt(item: PoolItem, submittedIndex: number) {
  if (awardedRef.current) { showChip('🔁 already scored this turn'); return; }
  const c = item.content as any;
  const correct = submittedIndex === c.correct_index;   // index-based, NOT a 'correctSide' string compare
  if (correct) {
    awardedRef.current = true;
    addPoints({ studentId: pickedStudent.id, delta: scoreForAttempt(mistakesRef.current, item.difficulty, 1.0),
      metadata: { correctness: 'correct', objectiveId: item.objective_id, exerciseType: 'MINIMAL_PAIR_SWIPE' } });
  } else {
    mistakesRef.current += 1;
    addPoints({ studentId: pickedStudent.id, delta: -MISTAKE_PENALTY,
      metadata: { correctness: 'incorrect', objectiveId: item.objective_id, exerciseType: 'MINIMAL_PAIR_SWIPE' } });
  }
}
```

**Honest scope note, not a claim to solve the bigger gap:** this gives some phonological-awareness value — whole-word sound discrimination (*ship*/*sheep*) — but it isn't phonics in the fuller grapheme-phoneme sense the architecture doc already flagged as pipeline-less (§1.1). Including this round doesn't close that gap; it's a modest, honest addition using content that already exists, not a claim to have built a phonics curriculum.

**Ordering within the slide: `MINIMAL_PAIR_SWIPE` first, choral drill second.** Receptive-before-productive, same ladder-climbing logic threaded through every other shell — discriminate the sounds, then practice saying them — even though scoring stops being possible partway through the slide.

---

## 4. Controls, `SLIDE_COMPLETE`, empty-state

```ts
const I_SAY_YOU_SAY_CONTROLS: ContextualControlsSpec = {
  shellType: 'I_SAY_YOU_SAY',
  controls: {
    // MINIMAL_PAIR_SWIPE portion — standard scored-shell controls
    skip:          { label: 'Skip', enabled: (stage) => stage === 'discrimination', onTrigger: skipCurrentPair },
    forceCorrect:  { label: 'Mark Correct', enabled: (stage) => stage === 'discrimination', onTrigger: forceCorrectCurrentPair },
    nextPair:      { label: 'Next', enabled: (stage) => stage === 'discrimination', onTrigger: advanceToNextPair },
    // Choral portion — deliberately NOT a scored control set
    replay:        { label: 'Replay Audio', enabled: (stage) => stage === 'choral', onTrigger: replayCurrentCue },
    nextCue:       { label: 'Next', enabled: (stage) => stage === 'choral', onTrigger: advanceChoralStage },
    endSlide:      { label: 'End', enabled: true, onTrigger: () => broadcast('SLIDE_COMPLETE', { forced: true }) },
  },
};
```

**No `revealHint` and no `Rate` control on the choral portion — a deliberate absence, not an oversight.** Every scored shell in this portfolio has a hint control because there's a scored attempt for it to act on. There isn't one here. The control bar's *shape* — fewer buttons during the choral portion than the discrimination portion — is itself part of communicating honestly what is and isn't being measured, the same principle as the "no scoring" banner in §1.

**`SLIDE_COMPLETE`:** fires automatically after `MINIMAL_PAIR_SWIPE`'s last pair resolves, **if** the choral portion is skipped or empty. In the normal case (choral portion runs, and it runs last per the ordering in §3), `SLIDE_COMPLETE` **never fires automatically** — there's no attempt to resolve, no completion condition to detect. The teacher's `End` control is the only way this slide finishes. This is a real, stated exception to `§4.3`'s general pattern (round-to-round advance can auto-fire on completion): when a round has no scored attempts, there's nothing for the app to auto-detect, so the always-manual fallback applies for the whole trailing portion, not just the slide-to-slide boundary every other shell already has.

**Empty-state:** `MINIMAL_PAIR_SWIPE` reuses `BoardListenTap`'s exact minimum (4–5 items) and degradation order (Prompt 2, §7). The choral portion, per §1, has no minimum-content concern worth solving for — any `SPEAK_SENTENCE` content for any lesson objective is usable, mastery-gating aside.

---

## Acceptance criteria — checked

- **Honest about the choral limitation, no fake scoring:** explicit "no scoring" banner, no decorative streaks/waveforms, no hint/rate controls where nothing is scored (§1, §4).
- **Real pedagogical scaffolding:** whole→part→whole, six steps, teacher-paced, named as a real technique rather than an arbitrary sequence (§1).
- **Clean future wiring point:** an optional hook prop; implementing it is stated as the entire remaining task, no redesign implied (§2).
- **Coherent controls:** full spec, including the deliberate absence of scoring controls on the unscored portion (§4).
- **Sound pedagogy — choral drilling's legitimate role stated:** it's real practice for warmup/repetition; the original critique was that it was the *only* speaking mode and captured nothing — both addressed without overclaiming what this phase can measure.
- **Scoreable round's full spec:** `MINIMAL_PAIR_SWIPE`, complete lifecycle and scoring, reused rather than rebuilt (§3).
