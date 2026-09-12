# Exercise Battery Runner — In-Lesson Core — v3 Quality Audit (`EXERCISE_RUNNER (pool shell)`)

> **Current status:** ag-audit-done

## SHARED PRELUDE (read first — identical in every game file)

**Product.** "Professor" — an ESL/EFL English product for children aged **6–12** (primary market: China; L1 is Simplified Chinese, used for translations and meaning options). Teachers build game-lessons from scanned textbooks and run them in class on a projector. **This app is the STUDENT app** (`/student`, `student.html` entry, `apps/student/**`): the single child's own **personal phone/tablet** for home practice and homework — solo study, no teacher present, no classmates. The kid taps directly; nobody is watching over their shoulder.

**Solo model (hard constraint — never propose teacher input or a second screen).** One child, one device. The child is the only user; every interaction must be reachable by that child's own fingers. There is NO remote control, NO commander, NO board. Audio may go through **headphones** (private sound is fine; audio is often the exercise) or the speaker. The device may be **portrait or landscape, phone first** (small screens dominate; tablets second; desktop browser rare).

**Kid-alone failure modes (audit for these in every game):**
- **Dead-ends when content is missing** — no teacher in the room to fix it; the child must always have a visible way forward (skip/continue/empty-state button).
- **Unfair timeouts** — clocks cost nothing for 6–12 y/o; a countdown must never end a run punitively without warning, and timeout should teach (reveal) rather than punish.
- **Sight-reading leaks** — when the skill being trained is LISTENING or recall, the answer must not be readable on screen (English text visible = leak; L1 support chips allowed only where the audit specifies).
- **Stale audio vs display desyncs** — audio replays, TTS fallbacks, and the word shown must always match the CURRENT item.
- **Scoring that writes wrong data** — this corrupts the FSRS memory model (the worst class of bug). Every write path is sacred (see below).
- **Phone-floor layout breaks** — content clipped, buttons under the thumb's dead zone, accidental taps, horizontal scroll. Portrait ~390 px wide is the primary floor; landscape small-height second.

**Unified scoring & data-write model (SACRED — survives any redesign verbatim).**
- **Session-local (per lesson run):** `useSoloSession()` → `addPoints` (session score → lesson XP once at the end), `recordAnswer` (session accuracy → stars).
- **Persisted learning data:**
  - `Engine.recordAttempt(studentId, objective_id, grade, …)` — **FSRS LearnerState** (mastery/scheduling). The memory model. Written by ExerciseRunner per exercise attempt.
  - **Hearts economy** — `Engine.getHearts / loseHeart / restoreHeart` (productive errors cost 1 heart; receptive errors warn only; never decrement an unread balance).
  - `GamificationService` — `awardXP`, `awardGems`, `updateQuestProgress`, `checkAndUpdateStreak`.
  - `stageProgressService.completeStage` — Student-Path node stars (best kept, replays counted).
- **Award patterns (exactly once, never double):** the lesson pipeline awards at `finalizeLesson` (XP + 5-star gems + quests); ExerciseRunner awards per-correct XP during play; standalone practice games self-award ONCE at the end (pattern A); SRS review awards capped XP + REVIEW_WORDS quest on done.
- **Client-graded speech passes are practice-only** (`record: false`) — green UX and advance, but NO learner-state/hearts/XP credit (browser Web Speech is unverifiable). Never a free productive success.

**Shared game engines.** The board's tested pure engines are reused on the student side: `components/games/fastVocab/*`, `components/games/spellingBee/*` (keyboard narrowing, deterministic per seed), `apps/board/templates/wordSearch/gridEngine.ts` + `content.ts`. Same math (`scoreForAttempt` + streak, −1 per mistake), local-only writes.

**Design language for the redesign (mobile targets — NOT board rules):**
- NO 8-meter legibility rule, NO `pl-40` phase-pill clearance, NO landscape-cards-on-stage rule — those were board constraints. This is a phone in a child's hands.
- **Thumb-reachable controls** (primary actions in the bottom half), **generous tap targets ≥ 48 px**, no text under ~14 px, forgiving hit areas.
- The **v3 visual language where it fits**: night navy `#070C18`, surfaces `#0B132B` / `#111C3D` / `#16234D`, single hot-pink `#FF2E79` accent, sky `#38BDF8` for audio/time, emerald correct, amber hints, Fredoka (display) / Sora (body) / JetBrains Mono (letters/numbers). **But Stitch proposes per-game personality** (like the board's Grammar Forge dark-cyber or Spelling Bee honeycomb amber) — each export's own tokens win over the generic block; per-game personality is encouraged. ⚠️ OPEN QUESTION for the owner: the current app is a LIGHT theme (`wa-*` cream/paper/teal/terracotta + `duo-*` accents) — the light-vs-dark decision for the student app is an owner call recorded in `_CROSS-CUTTING.md` before implementation begins.
- Kid-friendly but not infantile (6–12 band); calm focus — one thing at a time; celebrations juicy but never chaotic.
- CJK tolerance: Chinese characters appear on support surfaces (translations, meanings) — layouts must not break on them.

**The pipeline for THIS game (v3.2, one game at a time):**
```
ZCode: §0–§3 of NN-<game>.md (code audit + owner comments + screenshots)      file-ready
  ↓
Anti-Gravity: fills §4 (its own quality audit) + generates Stitch designs
  (MOBILE project, its own Stitch MCP/CLI access)                            ag-audit-done / stitch-designed
  ↓
ZCode: verifies designs INSIDE Stitch, exports to stitch/<NN>-<game>/,
  QA per screen, writes §5 verdicts                                          zcode-verified
  ↓
OWNER: personal approval of the designs — HARD GATE, no implementation
  without explicit go                                                        owner-approved
  ↓
Anti-Gravity: implements the approved design (one component file per game,
  boundaries in prompts/antigravity-handover.md)
  ↓
ZCode: reviews diff (scoring verbatim, no forbidden files), re-runs gauntlet
  (tsc 0 errors, vitest ≥ 803, clean build), screenshots, commits per game,
  pushes, redeploys touched edge functions, verifies per AGENTS.md §8        implemented/deployed
```

---

## §0 Identity

- **Surface / route:** every PRACTICE/ASSESS pool step inside `/student/solo-lesson` AND the standalone wrappers (files 22–23) — `apps/student/exercises/ExerciseRunner.tsx` (265 ln) + `services/gameRouting.ts` (routing table: SOUND_LAB, LISTEN_TAP, PHONICS_ARENA, WORD_DETECTIVE, VOCAB_BLITZ, SENTENCE_LAB, GRAMMAR_LAB, SPEAKING, DIALOGUE_STAGE, STORY_QUEST, SPEED_QUIZ, UNIT_REVIEW)
- **Exercise types consumed:** ALL 16 registry types via `getExerciseRegistry()`, restricted per family by gameRouting `types` + signature-first ordering + UNIT_REVIEW interleave
- **Data sources:** `prepareUnitForStudent(unitId, studentId)` then `selectLessonItems(unitId, studentId, 14, {types, signature, interleave, seed})` — FSRS-aware selection, variety seed re-rolled per step
- **Scoring & data writes (SACRED — the heart of the learner loop):** per attempt: `Engine.recordAttempt` (**FSRS**) + `gradeFromResult`; hearts: productive error → `Engine.loseHeart` (skip when balance unread — heartsUnavailable guard), 0 → out-of-hearts screen; correct → `GamificationService.awardXP(CORRECT_ANSWER)` + Q EARN_XP + toast; productive success→familiar/mastered → Q REACH_FAMILIAR once/objective/session; finish → XP LESSON_COMPLETE + `Engine.restoreHeart`; P-D retry: missed word re-queued ONCE (`retried` ref); `record:false` results (engagement-only) skip everything.
- **Reachability:** most practice blocks in every lesson + SRS/Phonics standalone
- **Theme today:** slate-50 light shell: X + pink progress + hearts (—/n) header, title chip, per-exercise component below, trophy summary (correct/accuracy/mastered)

## §1 How the game works today

*(Screenshots pending — passport fixture; this surface + file 13 are where kids spend most of their time.)*

The runner behind every pool-driven practice block in lessons AND the standalone Phonics/SRS surfaces (`exercises/ExerciseRunner.tsx`). Items arrive as PoolItems (typed via `toPoolItem`) selected by `selectLessonItems` with the family's type restrictions + signature-first ordering (`services/gameRouting.ts` GAME_CONTENT). The runner maintains a mutable queue; renders one exercise component at a time by `exercise_type` from the registry (:227-253). On each `onComplete` (:86-160): if `record !== false` — `Engine.recordAttempt` (**FSRS/LearnerState**) with the grade; hearts: a productive ERROR costs 1 (`Engine.loseHeart`, skipped when the balance couldn't be read — `heartsUnavailable` guard :112-118); correct → `awardXP(CORRECT_ANSWER)` + EARN_XP quest + "+1 XP" toast; a productive success lifting the objective to familiar/mastered counts the REACH_FAMILIAR quest once per session (:130-137); a missed item is re-queued ONCE at the end (:144-148); advance after 100ms (:151-157). Hearts balance loads on mount (:65-71, shows "—" when unread). Finish → summary screen (correct/accuracy/mastered tiles + re-queue note) → `finish()` = XP LESSON_COMPLETE + `restoreHeart` + onDone (:76-84, :175-212). Out of hearts → explanation + "Finish session" (:214-225). Unknown exercise types render a Skip that completes with `success: true` (:249-262). Empty items → "no practice content yet" + Continue (:162-172).

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/exercises/ExerciseRunner.tsx` unless noted.

- **F1 · P2 — The unknown-type Skip writes a false success into FSRS.** `UnknownType`'s skip calls `handleComplete({ success: true, … })` (:251) with `record` defaulting true → `recordAttempt` grades an objective the child never answered as correct. Rare (only v2-era unknown types), but it's the prelude's worst bug class — should be `record: false` or `success: false, record: false`.
- **F2 · P2 — Out-of-hearts is an advice dead-end.** The screen says "complete a review to restore one" but offers only "Finish session" (:214-225) — no review button, no heart-refill path; a kid alone at 0 hearts mid-lesson can't act on the advice (kid-alone dead-end rule).
- **F3 · P2 — Re-queueing visibly rewinds the progress bar.** The retry appends to `queue` (:146) and progress = index/queue.length (:74) — when a missed item re-queues, the bar denominator grows and progress jumps backward at the exact moment the kid just answered.
- **F4 · P2 — Unreadable hearts render as a bare "—" with no explanation** (:238-241) — the child sees a dash heart with no why (and parents reviewing won't either).
- **F5 · P3 — XP toast on every correct answer** (:124) — juice vs noise; one toast per answer may desensitize (§4 should weigh against a streak-based celebration).
- **F6 · P3 — Summary "Mastered" tile counts familiar+mastered** (`familiarSeen`, :178-199) — label overstates.
- **F7 · P3 — X-exit has no confirmation** (:233) — battery progress + FSRS-adjacent streak state lost on accidental tap (same class as shell F2).
- **F8 · P3 — 100ms advance beat relies on components' internal 1.1-1.2s feedback holds** — the runner itself imposes no minimum teaching beat, so any future component that completes instantly will flash.

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Regressive progress bar jumps backwards when missed items re-queue.** (Evidence: §1, §3 F3, `ExerciseRunner.tsx:74, 146`). When an exercise item is answered incorrectly, it appends to the queue array (`queue.push(item)`). Because progress is calculated as `index / queue.length`, the visible progress bar shrinks backwards from ~80% down to ~72% at the exact moment of failure. For a 7-year-old child, seeing their hard-earned progress bar physically rewind induces acute frustration and feelings of punishment. *Recommendation: Lock the progress bar denominator to the initial queue length (e.g. 10 items) and fill it progressively. When initial items finish, transition into a dedicated, encouraging "Review Round" phase (e.g. amber badge: "Master 2 Tricky Words! 💪") with its own mini-progress bar.*
- **F2 · P2 — Cryptic "—" dash heart counter looks like a software crash.** (Evidence: §1, §3 F4, `ExerciseRunner.tsx:238-241`). If the hearts balance cannot be read immediately from the database, the header displays a broken-looking heart icon alongside a raw dash symbol (`—`). Children and watching parents assume the app is glitching. *Recommendation: When hearts balance is unread or pending, display an animated loading heart pulse or a neutral gold shield icon, accompanied by a polite retry handler.*
- **F3 · P3 — Summary screen misrepresents mastery metrics.** (Evidence: §3 F6, `ExerciseRunner.tsx:178-199`). The victory summary card presents a "Mastered" badge that aggregates both familiar and mastered items (`familiarSeen`). In pedagogical tracking, familiar and mastered represent distinctly different cognitive retention tiers. *Recommendation: Label the metric clearly as "Words Practiced" or "Words Strengthened" to maintain honesty in learner reporting.*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F4 · P1 — Out-of-hearts screen is a dead-end maze.** (Evidence: §1, §3 F2, `ExerciseRunner.tsx:214-225`). When a student depletes their hearts, the screen advises: "Complete a review to restore one". However, the only interactive button provided is "Finish session", which abruptly dumps the child back to the HomeMap with zero guidance on how or where to conduct this review. The child cannot continue their homework and does not know what to click next. *Recommendation: Provide an explicit, high-priority CTA on the out-of-hearts modal: "Quick Heart Practice (+1 ❤️)" that immediately launches a 3-item low-stakes vocabulary review, refilling one heart and seamlessly returning the child to their lesson.*
- **F5 · P2 — Unconfirmed X-exit discards full battery session.** (Evidence: §1, §3 F7, `ExerciseRunner.tsx:233`). Accidental taps on the top-left X unmount the battery instantly, throwing away the child's session score, accuracy, and streak. *Recommendation: Connect the X-exit button to the universal lesson exit confirmation modal.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F6 · P1 — Skipping unknown exercise types writes corrupt false successes into FSRS.** (Evidence: §1, §3 F1, `ExerciseRunner.tsx:249-262`). When an unknown exercise type is encountered, `UnknownType` renders a skip button that invokes `handleComplete({ success: true })` with `record` defaulting to `true`. This writes a spurious `Engine.recordAttempt` entry claiming the student mastered an objective they never answered! This corrupts the FSRS spaced repetition scheduling algorithm. *Recommendation: Ensure unknown-type skips strictly pass `{ success: false, record: false }` so learner state is protected.*
- **F7 · P3 — Desensitizing XP toast spam on every answer.** (Evidence: §1, §3 F5, `ExerciseRunner.tsx:124`). Popping a generic "+1 XP" toast after every single question creates visual noise that children quickly tune out. *Recommendation: Suppress individual question XP toasts; instead, celebrate combo streaks (3x, 5x, 10x) with escalating celebratory audio-visual badges, and display total accumulated XP in the battery summary screen.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F8 · P2 — Flashy 100ms transition cuts off component-level learning reflection.** (Evidence: §1, §3 F8, `ExerciseRunner.tsx:151-157`). The runner triggers next-item transition just 100ms after `onComplete` is called, relying entirely on child components to manage their own delay holds. If any child component resolves slightly early, the screen abruptly cuts to the next item before the child can register their error. *Recommendation: Enforce a guaranteed minimum 1.2s teaching/consolidation hold inside `ExerciseRunner` whenever an attempt is marked incorrect.*

### 4.e Top-5 prioritized recommendations
1. **[P1] Fix FSRS false-success corruption on unknown types:** Pass `record: false` on all skip and fallback handlers to protect spaced repetition memory integrity.
2. **[P1] Fix out-of-hearts dead-end:** Add a "Quick Heart Review (+1 ❤️)" action directly on the out-of-hearts modal to allow immediate recovery without app abandonment.
3. **[P2] Stop rewinding the progress bar on re-queued items:** Keep the main progress bar moving forward and isolate retries into an encouraging "Review Round".
4. **[P2] Add exit-confirmation dialog:** Intercept the header X button to prevent accidental data loss.
5. **[P2] Reskin ExerciseRunner into Wonder Atlas × Duolingo hybrid:** Clean paper card header `#FDFBF7`, warm terracotta accents, animated heart loss effects, and combo streak celebrations.

### 4.f Stitch design log (AG fills as it generates)
*(Phase 1 audit complete. Stitch designs will be generated in Phase 2 for the unified Exercise Battery runner header, out-of-hearts recovery sheet, and session summary screen.)*

## §5 ZCode design verification (inside Stitch)

<ZCode fills after AG reports designs done: list_screens result, title verification against §4.f, export paths (`stitch/<NN>-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

<Owner's verdict per screen: approved / revise (what to change). No implementation starts before an explicit go on THIS game's designs.>

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
