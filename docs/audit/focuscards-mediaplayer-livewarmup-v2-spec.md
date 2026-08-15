# BoardFocusCards + BoardMediaPlayer + BoardLiveClassWarmup v2 — Implementation Spec

> Response to Prompt 9. Builds on `professor-live-architecture-design.md` §1.2 (`WARMUP`/`INPUT` envelopes), §2.2, §4.3. Audit references: `§G`, `§I`.
>
> **⚠ Correction 2026-08-07 (verified against `services/boardLearner.ts` + `types/exercise.ts`).** Three issues — the designs hold, but two of them require new infrastructure that doesn't exist yet, and one signature is wrong:
>
> 1. **`boardLearner.recordExposure()` and `boardLearner.recordChoralReview()` DO NOT EXIST.** Verified: `boardLearner.ts` exports only `teacherGradeToFsrs`, `profileIdsForClassWeak`, `gradeStudentWeakest`, `gradeObjective`, `gradeStudent`, `classWeakObjectives`. The three-tier FSRS write model in §0 is a *proposal* for new functions, not a description of existing ones. **Both `recordExposure` (Tier 2) and `recordChoralReview` (Tier 3) must be built** in `boardLearner.ts` before FocusCards §1.1, FocusCards §1.2 (choral mode), and LiveClassWarmup §3 can work. They write to `srs_items` (columns: `student_id`, `objective_id`, `mastery_state` ∈ `'new'|'learning'|'familiar'|'mastered'|'decaying'`, `next_review`). **Decision for the implementer:** either build these two functions (small — they're upserts with no FSRS grade computation, lighter than `gradeObjective`), OR fall back to existing primitives: `recordExposure` ≈ a no-op or a `recordAttempt` with `correctness:'correct'` (engagement-only); `recordChoralReview` ≈ skip the FSRS write entirely and just use `recordAttempt` for analytics. Building them properly is the better path (the spec's intent — a lighter-than-graded write — is sound), but it's real new code, not a rename.
>
> 2. **`gradeObjective` signature is wrong.** Spec §0 Tier 1 shows `gradeObjective(student, objectiveId, {exerciseType, outcome})`. **Real signature:** `gradeObjective(studentId, unitId, objectiveId, correct, modality)` — takes the student ID (not object), the unit ID, a boolean `correct`, and a `'receptive'|'productive'` modality string. There is no `{exerciseType, outcome}` object param. All callers across Prompts 1–8 already use the real signature correctly (verified during Batch 1/2 integration); the FocusCards spec's Tier-1 example is the only place this wrong shape appears.
>
> 3. **The three-tier model itself is a sound addition.** The distinction (individual-graded / roster-exposure / roster-choral) is genuinely missing from the current portfolio and the spec's reasoning for it is correct. The correction is only that §0 presents these as if they exist; they're new work to build.

## The three-tier FSRS write model (new, completes something the portfolio was missing)

Every FSRS write so far in this series has been `gradeObjective` — one picked student, one graded outcome. This prompt needs two lighter-weight writes that don't fit that shape, so defining all three together, once, rather than inventing each ad hoc:

```ts
// Tier 1 — existing, individual, graded. Every scored shell in Prompts 1–8 uses this.
gradeObjective(student: Student, objectiveId: string, outcome: { exerciseType: string; outcome: 'correct'|'partial'|'incorrect' }): void;

// Tier 2 — new, roster-wide, no outcome. "The whole class was just shown this."
boardLearner.recordExposure(objectiveId: string, roster: Student[]): void;
// For each student without an srs_items row for this objective: create one at mastery_state='learning' (skipping 'new' —
// exposure already happened), reps=0, next_review set to a short initial interval. For students who already have a row
// at 'learning' or beyond: no-op (or touch a last_seen_at field only) — presentation never downgrades existing mastery.

// Tier 3 — new, roster-wide, holistic outcome. "The class collectively seemed to know/not know this."
boardLearner.recordChoralReview(objectiveId: string, roster: Student[], outcome: 'strong' | 'weak'): void;
// A light nudge to every student's srs_items row — lower-confidence than an individual graded attempt (Tier 1),
// but more informative than pure exposure (Tier 2). Used by LiveClassWarmup (§4) and FocusCards' optional
// choral comprehension check (§1.2).
```

*(Light assumption, lower-stakes than the grammar correction since these are pure additions, not fixes to something already wrong: this assumes `boardLearner` is the right module for both new functions, per the file reference used in the per-game prompts series. Worth a quick confirm alongside the other open verification items, not urgent.)*

---

# 1. `BoardFocusCards`

## 1.1 The real "studied" signal

```ts
function onReachStage4(objectiveId: string, roster: Student[]) {
  boardLearner.recordExposure(objectiveId, roster);   // Tier 2 — not gradeObjective, no correct/incorrect exists here
}
```

This is deliberately the *lightest* possible write — `new → learning`, no reps, no ease-factor change. It answers "has this been introduced" for scheduling purposes, not "does the student know it." Reaching stage 4 of the reveal is the trigger, not any tap or attempt, since none exists in pure presentation.

## 1.2 Optional comprehension check — included, but genuinely optional

Yes, include it — but as a teacher-toggleable addition, not a mandatory stage, and that distinction matters. Every other presentation-adjacent shell in this series (`StorySequencing`, `DialogueStage`, `StoryStage`) got a mandatory follow-up check because checking comprehension is *part of what that shell is for* — it's already framed as an activity, not pure presentation. `FocusCards` is different: its entire job is a fast, clean introduction, and some classes/paces genuinely don't need or want an extra step tacked on every single time. Forcing it would blur a shell whose value is its simplicity.

```ts
interface FocusCardsCheck { mode: 'off' | 'choral' | 'picked'; }
```

- **`off`** (default): stage 4 fires `recordExposure` and the slide is done.
- **`choral`**: after stage 4, a quick "which one did we just learn?" tap among 2–3 image options, whole class points, teacher taps on their behalf, feeds `recordChoralReview(objectiveId, roster, outcome)` (Tier 3) — teacher judges "strong"/"weak" holistically, no individual `addPoints`.
- **`picked`**: same MCQ, but the wheel picks one student first — standard individual `IMAGE_SELECT` scoring, difficulty 1, binary, `gradeObjective` (Tier 1), exactly like every other receptive MCQ in this portfolio.

---

# 2. `BoardMediaPlayer`

## 2.1 Two roles, neither one writes FSRS

```ts
type MediaPlayerRole = 'warmup_song' | 'context_video';
interface MediaPlayerConfig { role: MediaPlayerRole; url: string; relatedObjectiveId?: string; }
```

**`warmup_song`** — `WARMUP` phase, an English song to open class and signal the language switch. Doesn't reference any objective; it's atmosphere, not content delivery.

**`context_video`** — `INPUT` phase, a video that sets a scene or theme before the content it precedes (an animation of the story being taught, a short clip introducing a topic). `relatedObjectiveId` is optional metadata used only by `orchestrate-lesson` for placement/sequencing ("show this before that story's input block") — it is **not** a write target. Watching a video isn't a drillable exposure to one discrete item the way `FocusCards` is; it doesn't map cleanly to a single objective's presented-timestamp, so this role stays outside the FSRS model entirely, by design, not by omission.

## 2.2 `SLIDE_COMPLETE` — the one shell here with a natural completion signal

```ts
mediaElement.onEnded = () => broadcast('SLIDE_COMPLETE', { forced: false });
```

Unlike the other two shells in this prompt, media playback has a real browser-native "finished" event — use it. The manual `Continue →` control (§5) still exists alongside it as a teacher override (skip early), same relationship every scored shell has between auto-completion and a manual force-end.

---

# 3. `BoardLiveClassWarmup` — real, not retired

Following through on what the architecture doc already committed to (§6.1 lists this as a redesigned portfolio entry, not a retirement candidate) — retiring it now would contradict a decision already made, not revisit new evidence.

```ts
function buildWarmupRound(roster: Student[], priorUnitObjectives: Objective[]): PoolItem[] {
  const due = priorUnitObjectives.filter(o => isDue(srsFor(o)));       // next_review <= now
  const ranked = classWeakObjectives(due, roster);
  return ranked.slice(0, WARMUP_ROUND_SIZE).map(o => poolItemAtRung(o, 1));   // rung 1 only — retrieval, not new escalation
}
```

**Deliberately no choral/picked toggle here — a real departure from the pattern used everywhere else in this series, worth stating why.** Every `OUTPUT`-phase production task (grammar rung 4, dialogue role-read) benefits from the option of individual scoring — that's the point of those tasks. `WARMUP`'s whole purpose is the opposite: fast, low-stakes reactivation of prior knowledge before the lesson proper starts. Putting a specific student on the spot with graded pressure in the first two minutes of class works against that purpose. So this shell is **choral-only**, full stop — no `picked` mode exists for it, unlike every other choral/picked shell in this series.

```ts
function onWarmupItemResolved(objectiveId: string, roster: Student[], classResponse: 'strong' | 'weak') {
  boardLearner.recordChoralReview(objectiveId, roster, classResponse);   // Tier 3, same function as FocusCards' choral check
}
```

Reuses the exact `recordChoralReview` function from §0/§1.2 — same write, same reasoning, different trigger.

---

# 4. Contextual controls (all three)

```ts
const FOCUS_CARDS_CONTROLS: ContextualControlsSpec = {
  shellType: 'FOCUS_CARDS',
  controls: {
    prev: { label: '← Back', enabled: true, onTrigger: prevStage },
    next: { label: 'Next →', enabled: true, onTrigger: nextStage },
    // If check mode is 'choral' or 'picked': the standard MCQ controls apply to that one final stage only
    revealHint: { label: 'Hint', enabled: (stage) => stage === 'check' && checkMode !== 'off', onTrigger: eliminateOneDistractor },
    continueSlide: { label: 'Continue →', enabled: true, onTrigger: () => broadcast('SLIDE_COMPLETE', { forced: true }) },
  },
};

const MEDIA_PLAYER_CONTROLS: ContextualControlsSpec = {
  shellType: 'MEDIA_PLAYER',
  controls: {
    playPause: { label: 'Play / Pause', enabled: true, onTrigger: togglePlayback },
    replay: { label: 'Replay', enabled: true, onTrigger: restartMedia },
    skip: { label: 'Skip', enabled: true, onTrigger: () => broadcast('SLIDE_COMPLETE', { forced: true }) },
    continueSlide: { label: 'Continue →', enabled: true, onTrigger: () => broadcast('SLIDE_COMPLETE', { forced: true }) },
  },
};

const LIVE_WARMUP_CONTROLS: ContextualControlsSpec = {
  shellType: 'LIVE_WARMUP',
  controls: {
    classGotIt: { label: 'Class Got It', enabled: true, onTrigger: () => onWarmupItemResolved(currentObjectiveId, roster, 'strong') },
    classStruggled: { label: 'Class Struggled', enabled: true, onTrigger: () => onWarmupItemResolved(currentObjectiveId, roster, 'weak') },
    nextItem: { label: 'Next', enabled: true, onTrigger: advanceToNextWarmupItem },
    continueSlide: { label: 'Continue →', enabled: true, onTrigger: () => broadcast('SLIDE_COMPLETE', { forced: true }) },
  },
};
```

---

# 5. Slide-complete affordance — consistent, with one stated exception

Per `§4.3`: presentation shells with no natural completion signal get a persistent `Continue →` control. Applied here:

- **`FocusCards`**: persistent `Continue →`, manual only — no natural completion signal (a 4-stage reveal has no "resolved" state, and even the optional check, when present, doesn't gate advance).
- **`LiveClassWarmup`**: persistent `Continue →`, manual only — same reasoning as `WARMUP` generally (§3): no scored attempts, nothing to auto-detect.
- **`MediaPlayer`**: **the one exception** — gets both the manual `Continue →`/`Skip` (teacher override) *and* an automatic `SLIDE_COMPLETE` on natural media-end (§2.2). This mirrors how scored shells keep a manual "End Slide" force-button even though they usually auto-complete — the automatic path is the common case, the manual control is the override, not a replacement for it.

---

## Acceptance criteria — checked

- **FocusCards produces a real, modest learning signal:** `recordExposure` (Tier 2), explicitly not conflated with a graded attempt (§1.1).
- **MediaPlayer has a defined role:** two roles, neither writing FSRS, with an explicit statement of why not (§2.1).
- **LiveClassWarmup real, justified:** built per the architecture's own prior commitment; the choral-only (no picked mode) departure from the established toggle pattern is explained, not just asserted (§3).
- **Slide-complete signals specified:** all three, with `MediaPlayer`'s natural-signal exception stated explicitly rather than silently applying the same rule to all three (§5).
- **Coherent controls:** all three, full specs (§4).
- **Sound pedagogy, PPP role stated:** `WARMUP` reactivates prior knowledge at minimal cognitive load; `FocusCards`/`INPUT` introduces new form-meaning pairs receptively before any production is expected; `MediaPlayer` serves either function depending on role, never both at once.
