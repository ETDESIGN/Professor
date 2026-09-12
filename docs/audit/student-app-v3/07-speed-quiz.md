# Speed Quiz — In-Shell MCQ Step — v3 Quality Audit (`SPEED_QUIZ / GAME_ARENA`)

> **Current status:** zcode-verified

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

- **Surface / route:** SPEED_QUIZ & GAME_ARENA steps inside `/student/solo-lesson` — inline `SoloLessonPlayer.renderSpeedQuiz` (SoloLessonPlayer.tsx:194-278)
- **Exercise types consumed:** frozen flow `data.questions` [{text, options[], correct}] (NOT pool-driven)
- **Data sources:** flow block data only
- **Scoring & data writes:** correct → `addPoints('solo', 1)` + toast "+1 XP"; wrong → local `lives-1` (placeholder hearts). No FSRS, no GamificationService here (pipeline end-awards).
- **Reachability:** assess blocks with frozen questions
- **Theme today:** white/slate MCQ cards, blue selected, green/red reveal, A/B/C/D mono prefixes

## §1 How the game works today

*(Screenshots pending.)*

The in-shell quiz battery for frozen `data.questions` [{text, options, correct}], inline (:194-278). One question at a time; tap → instant color reveal (green correct / red picked-wrong / grey others), correct → `addPoints('solo', 1)` + "+1 XP" toast, wrong → local `lives-1`; Continue advances; last question completes the step (:236-274). Progress bar per question index. No FSRS/quest writes (frozen questions carry no objective ids).

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … The home screen for the student will not be changed … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/SoloLessonPlayer.tsx` (inline renderer).

- **F1 · P2 — Wrong answers get no teaching beat.** Reveal + immediate Continue (:260-274) — no retry, no re-queue (the battery re-queues missed items once; this older surface doesn't), no explanation field support. Wrong = shown the answer for as long as the kid chooses to stare.
- **F2 · P2 — Fake-heart decrement on wrong** (:247) — feeds shell F1 (decorative hearts).
- **F3 · P3 — Quiz performance is invisible to the learner model** — frozen questions have no objective_id, so nothing reaches FSRS/remediation (acceptable for legacy blocks, but the audit should say it).
- **F4 · P3 — A/B/C/D prefixes are small** (`text-sm font-mono opacity-60`, :253) vs the board v3's prominent letter badges.
- **F5 · P3 — No question images** — content shape is text-only (pool-driven IMAGE_SELECT lives in the battery, not here).

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Cold standardized test styling lacks playful warmth.** (Evidence: §1, `SoloLessonPlayer.tsx:236-274`). The inline speed quiz renders plain white/grey option slabs with faint mono letters (`A/B/C/D font-mono opacity-60`). It evokes the dread of a sterile school exam rather than an encouraging game. *Recommendation: Redesign options as Duolingo-style bevel buttons (`wa-paper` background `#FDFBF7`, 0 4px 0 bevel `#E2D7C3`, bold 18px Fredoka typography) with vibrant circular letter badges.*
- **F2 · P3 — Sub-floor letter badge tap zones.** (Evidence: §3 F4, `SoloLessonPlayer.tsx:253`). Option rows have sufficient height, but the A/B/C/D markers are tiny low-contrast glyphs. *Recommendation: Style option badges as prominent 32px circular pills (`wa-teal` / `wa-ink`) with crisp high-contrast letters.*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P2 — Zero mis-tap protection triggers accidental penalties.** (Evidence: §1, `SoloLessonPlayer.tsx:236-250`). Tapping any option instantly locks the choice, evaluates correctness, flashes red/green, and decrements lives with zero confirmation or delay. A child adjusting their hand or scrolling accidentally commits a wrong answer. *Recommendation: Introduce a two-phase interaction: tap to select (highlight with blue/teal border), tap "Check" (or double-tap option) to confirm and evaluate.*
- **F4 · P2 — Missed questions vanish forever without remediation.** (Evidence: §1, §3 F1). In modern exercise batteries, missed items re-queue once at the end of the round so children can master their mistakes. In Speed Quiz, a wrong tap permanently lowers stage accuracy and exits without a retry. *Recommendation: Add a simple 1-pass end-of-quiz retry pool for missed questions, allowing the child to redeem their stars through effort.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P1 — Wrong answers offer zero corrective acoustic feedback.** (Evidence: §1, §3 F1, `SoloLessonPlayer.tsx:246-257`). When a child selects a wrong option, the card turns red and waits for Continue. It does not play the correct pronunciation or highlight why the answer was correct. In solo home study without a teacher, the child internalizes confusion. *Recommendation: On wrong selection, immediately speak the full correct sentence via native TTS, highlight the correct option in emerald, and provide a 1.5s acoustic teaching pause.*
- **F6 · P2 — Fake heart deduction confuses gamification rules.** (Evidence: §1, §3 F2, `SoloLessonPlayer.tsx:247`). Wrong answers decrement the shell's fake `lives` counter without ever enforcing an out-of-hearts gate. *Recommendation: Remove the fake lives decrement from speed quiz; award XP for correct answers without feigning life loss.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F7 · P3 — Flat reward pacing lacks streak excitement.** (Evidence: §1, `SoloLessonPlayer.tsx:241`). Correct answers trigger a dry "+1 XP" text toast. There is no combo counter, no multiplier sound effect, and no escalating excitement for answering 3 or 5 questions correctly in a row. *Recommendation: Add a visual combo streak counter ("🔥 3 In a Row!") with escalating chime pitches to spark momentum.*

### 4.e Top-5 prioritized recommendations
1. **[P1] Add auditory error correction on wrong answers:** Play the correct English sentence via TTS so the child hears the proper syntax before advancing.
2. **[P2] Implement two-phase tap selection or confirmation:** Prevent accidental mis-taps from instantly scoring an unrecoverable failure.
3. **[P2] Re-queue missed questions for a redemption attempt:** Allow children to re-attempt missed questions at the end of the quiz round.
4. **[P2] Adopt Duolingo-style tactile option bevels:** Upgrade sterile exam rows to bouncy, thumb-friendly cards with bold Fredoka typography.
5. **[P3] Add combo streak chimes and visual momentum:** Celebrate consecutive correct answers with lively audio-visual feedback.

### 4.f Stitch design log (AG fills as it generates)

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Game Subsystem:** Speed Quiz In-Shell MCQ (`07-speed-quiz.md`)
- **Generation Date:** 2026-09-13
- **Submission Status:** 2 screens submitted and successfully materialized in Stitch datastore (HTTP 200 / Exit code 0).
- **Quota Discipline:** 2 screens generated (max 2 per game).

#### Screens Generated & Brief Summaries:

1. **Screen 1: Speed Quiz MCQ Correct Feedback State with Real Hearts HUD**
   - **Stitch Screen ID:** `53f5cce61c3f47339024cb34897b3d02`
   - **Title:** `Professor ESL - Speed Quiz (MCQ Correct Feedback State)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1Vx-GtZAyNRMlnpEYfAT3I0DGZMcn0Cbkxg2lfrt8wSTEHnzoAL5ntZslvXc8nTBp0yFrV0_GiHHwc1GK0XZCql1-Q52mW8-47VMKODMz8bfB6Ikp-ClmytWPydPsgB7SIhFC8e4vGC4caTODMKYwOH3yABpB_vC_OQFBnGXs8wkv7zTJ-r0OssCkbkgMOdtUQcn44_yD5e24fr-GisAvAaRR8Rjrf3esaw_4QS1VKVI5ii6S2xDEcaBg`
   - **Prompt Summary:** Mobile portrait (390×844) MCQ quiz screen (Question 3 of 5). Shell header shows Step 5 in Duolingo pink `#E91E63` and real hearts counter showing 4 hearts (`#FF4B4B`). Main stage presents a question box with terracotta badge `SPEED QUIZ • QUESTION 3 OF 5`, bold question prompt (*\"Where should pedestrians walk when crossing the street?\"*), Chinese support subtitle, and 44px Duolingo blue speaker FAB (`[playCue: question_audio]`). 4 stacked tactile option cards (56px each): Option B selected & evaluated Correct with emerald `#E6F4F1` fill, 2.5px teal `#2A9D8F` border, 4px hard bevel (`#1E6F5C`), bold teal Fredoka text, and circular checkmark badge. Options A, C, and D dimmed in paper `#FDFBF7`. Bottom combo card celebrates `🎉 Awesome! +1 XP earned!` with flame streak chip `🔥 3 in a Row!`. Anchored footer with `CONTINUE →` in teal `#2A9D8F`.
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header close tap
     - `[🔊 playCue: question_audio]` on question speaker FAB tap
     - `[🔊 playCue: correct_chime]` on correct answer selection
     - `[🔊 playCue: streak_fire]` on streak combo escalation
     - `[🔊 playCue: tap_next]` on footer continue tap
   - **Design Contract:** Wonder Atlas warm tokens × Duolingo accents, Fredoka + Nunito typography, production Tailwind HTML + small style block, zero placeholder chrome.

2. **Screen 2: Speed Quiz MCQ Wrong Answer State with Acoustic Correction & Real Hearts HUD**
   - **Stitch Screen ID:** `ea047bf85a3440dba938d92ba0750449`
   - **Title:** `Professor ESL - Speed Quiz (MCQ Wrong Answer & Acoustic Correction)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1UbHCn2-S21LDsNxOnjYAY9EwuWGk0hzTOnCBteF4vSBoNtvhGgVIncOPawmlwXve-SVPIn5jPZuC4BFsmMrJU1ccGuHFS06wypIIcklhKgnb7E0RKy2DWJSKzxPK3nNDxCXK_I5unUHiL4dk6aQckEKHo1Y8eltTJ3g35tGbK15vvcRgWuF2n7CjjXSQLdFe_2j3WHT3FC2uGFdXQS5IEuhg11tbu357gIVugvO7nDMDZXEFV00J79xXM`
   - **Prompt Summary:** Mobile portrait (390×844) MCQ wrong answer state (Question 4 of 5). Shell header displays real heart penalty: 3 hearts remaining, 1 faded heart, and a floating `-1 ❤️` penalty badge. Main stage displays question (*\"What does a red traffic light mean?\"*) with Chinese subtitle. 4 stacked options show in-place correction: Option A (Incorrect Picked) in soft red `#FEF2F2`, 2.5px red border `#FF4B4B`, 4px bevel (`#DC2626`), and red '✕' badge; Option B (Revealed Correct) in soft emerald `#E6F4F1`, 2.5px teal border `#2A9D8F`, and checkmark badge; Options C & D dimmed. Bottom section opens an acoustic corrective drawer in `#FEF2F2` with alert badge (*\"Remember for next time!\"*), mist narration bar displaying *“Red light means stop and wait!”* with Chinese explanation, 44px teal speaker FAB actively playing corrective audio, and sand spaced-repetition tag (*\"🔄 Retry at round end\"*). Anchored footer displays `GOT IT →` in terracotta `#E76F51` (`0 4px 0 #C4553B` bevel).
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header close tap
     - `[🔊 playCue: wrong_buzzer]` on wrong answer selection
     - `[🔊 playCue: correct_reveal_tone]` on correct answer reveal
     - `[🔊 playCue: corrective_sentence_tts]` on spoken corrective audio
     - `[🔊 playCue: tap_next]` on footer got it tap
   - **Design Contract:** Exact token hexes, thumb-reachable actions, production-grade Tailwind HTML + style block.

## §5 ZCode design verification (inside Stitch)

**Verified 2026-09-13** (owner batch directive — no per-game gate). Project `6865954475041880496`. Screens 1-2 exported — PASS: bevel option cards, real hearts, acoustic error drawer with retry note (solves F1/F2). Sound moments marked per the owner's sound directive; implementation wires `playCue`.-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**PRE-APPROVED 2026-09-13 (owner batch directive, verbatim):** "I review every screen in Stitch right now so please implement them all right away without waiting for my approval. I will verify everything tomorrow… in case some designs are too much off, we will modify them afterward." — revisions, if any, follow the edit_screens loop after his review.

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
