# Daily Practice — SRS Review — v3 Quality Audit (`PRACTICE: /student/srs`)
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

- **Surface / route:** `/student/srs` (Practice Arena + red-due badge on the tile) — `apps/student/SpacedRepetition.tsx` (139 ln)
- **Exercise types consumed:** ALL types — `selectPracticeItems(userId, 18)` (due + weak across ALL units, FSRS-driven)
- **Data sources:** poolService practice selection
- **Scoring & data writes (SACRED):** per item via ExerciseRunner (FSRS/♥/XP); at done: xp = min(5, max(1, correct)) (rescaled 2026-09-04) + Q REVIEW_WORDS(correct) → onComplete → StudentApp treats as lesson-complete (XP award at finalize)
- **Reachability:** Practice Arena → SRS Review; "Today's Menu" start card
- **Theme today:** indigo/orange start card then battery shell

## §1 How the game works today

*(Screenshots pending.)*

SpacedRepetition (`SpacedRepetition.tsx`): loads 18 due+weak items across ALL units via `selectPracticeItems` (:26-42), shows a "Today's Practice" start card, then runs ExerciseRunner ("Daily Practice"). On done: capped XP `min(5, max(1, correct))` (rescaled 2026-09-04) + REVIEW_WORDS quest progress, then `onComplete` (:115-124). Router note: StudentApp's route passes `onComplete={() => navigate('/student')}` (StudentApp.tsx:234) — the runner's own summary screen is the only celebration; no LessonComplete interstitial.

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs: `apps/student/SpacedRepetition.tsx`, `StudentApp.tsx:234`.

- **F1 · P3 — The computed xp in `handleDone` is dead code** — the router discards the result object and navigates home; XP actually comes from the runner's per-correct + LESSON_COMPLETE awards. Confusing but not double-awarding (verified once during implementation review anyway).
- **F2 · P3 — No reward interstitial for daily practice** — every other flow ends on LessonComplete; SRS ends on the in-runner summary then home. Consistency/juice question for §4.
- **F3 · P3 — Fixed 18 items** — no session-length choice for a tired kid (a "half for today" mercy would fit kid-alone rules).
- **F4 · P3 — Retry/error states solid** (Retry + Back on failure :46-60; caught-up empty state :70-80) — good.

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Clinical "RotateCcw" iconography and sterile card aesthetic.**
  - *Evidence:* `SpacedRepetition.tsx:97-99` uses an orange `RotateCcw` browser-refresh icon inside an orange circle. In a child's eyes, a circular reload arrow signals "undo" or "reset", not an exciting daily memory challenge.
  - *Recommendation:* Replace the refresh icon with a gamified "Memory Brain" or "Sprout / Garden" motif (e.g. `Sparkles`, `Brain`, or `Zap`). Reskin the start card with a vibrant progress ring and playful mascot art celebrating daily habit formation.
- **F2 · P2 — Palette fragmentation between launcher and runner.**
  - *Evidence:* `SpacedRepetition.tsx:87-105` mixes orange header text, an orange circle, an `indigo-500` start button, and then transitions into the standard exercise runner which uses blue/emerald/rose accents.
  - *Recommendation:* Harmonize the daily review palette into the Wonder Atlas warm paper / vibrant amber & purple theme (`wa-cream`, deep navy, amber star/streak highlights).

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P1 — Fixed 18-item marathon creates pacing fatigue for younger children.**
  - *Evidence:* `SpacedRepetition.tsx:35` hardcodes `selectPracticeItems(user.id, 18)` (`F3`). For ages 6–8, working through 18 multi-step exercise battery items (dictation, word building, listening) takes 10–14 minutes of intense cognitive focus. When children get tired, their only option is the top-left `X` button, which aborts the session without a sense of closure.
  - *Recommendation:* Introduce selectable session size pills on the start card: `Quick (6 cards • ~3m)`, `Standard (12 cards • ~6m, Recommended)`, and `Challenge (18 cards • ~10m)`.
- **F4 · P2 — Disconnected completion flow with discarded reward payload.**
  - *Evidence:* `SpacedRepetition.tsx:115-124` calculates `{ xp, accuracy, time }` and updates the `REVIEW_WORDS` quest, but `StudentApp.tsx:234` immediately executes `() => navigate('/student')`, discarding the result object. The runner's internal summary is bypassed or abruptly exited with no streak celebration or quest-claim ceremony.
  - *Recommendation:* Route `handleDone` through the flagship `LessonComplete` celebration or present a dedicated "Daily Goal Complete!" modal highlighting: XP gained, streak flame extended (+1 day), words strengthened, and quest completed with an interactive `[Claim Reward]` button.
- **F5 · P3 — Caught-up empty state offers no alternative practice for eager students.**
  - *Evidence:* `SpacedRepetition.tsx:70-80` displays "You're all caught up! No words to review right now" with only a "Back to Map" button. A child who logged in specifically wanting to practice is turned away.
  - *Recommendation:* Add secondary actions in the empty state: `[Practice Recent Words Anyway]` or `[Try Phonics Lab]`, turning a passive dead-end into proactive self-directed learning.

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F6 · P1 — Depleting hearts in Daily Practice breaks the core retention & recovery loop.**
  - *Evidence:* `SpacedRepetition.tsx:128-134` delegates directly to `ExerciseRunner`, which subjects the child to standard heart loss on errors. In language learning economies, Spaced Review is supposed to be the *safe haven* where students review weak items to *recover* hearts. Punishing a child who is intentionally reviewing their weakest words by locking them out when hearts hit zero causes rage-quitting.
  - *Recommendation:* Disable heart deduction in Daily Practice (treat errors as formative review with immediate acoustic correction and end-of-session repeat), and award `+1 Heart Restored` upon completing the daily session!
- **F7 · P2 — Schema disorientation from cross-unit item jumps without context tags.**
  - *Evidence:* `selectPracticeItems` selects due items across all completed units. A child might encounter an animal word, then a kitchen verb, then a classroom question with zero schema priming.
  - *Recommendation:* Display a subtle top unit chip (e.g., `From Unit 2: At the Zoo`) above each prompt. Activating the relevant situational context reduces retrieval interference for ESL children.

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F8 · P2 — Missing "Word Strengthened" memory-state feedback.**
  - *Evidence:* The child answers an exercise correctly, but receives only standard XP/emerald feedback. They do not see that this specific word has been strengthened in their memory.
  - *Recommendation:* Show a satisfying "+1 Memory Shield" or "Word Mastered! 🌱 ➔ 🌿" visual tag on the success drawer, reinforcing the value of spaced repetition.

### 4.e Top-5 prioritized recommendations
1. **Disable Heart Loss & Enable Heart Restoration in Practice (P1):** Ensure daily review is a safe learning zone where errors do not deplete hearts, and completing practice restores +1 heart.
2. **Session Length Selector on Start Card (P1):** Provide 6-card (Quick), 12-card (Standard), and 18-card (Challenge) options to prevent kid cognitive overload.
3. **Dedicated Daily Practice Celebration & Quest Pop (P2):** Celebrate daily streak advancement, display words strengthened, and show quest progress rather than abruptly navigating home.
4. **Reskin Start Card with Mascot / Memory Theme (P2):** Replace the mechanical `RotateCcw` reload icon with a vibrant brain/sparkle memory motif and warm palette.
5. **Context Breadcrumb Pill on Exercises (P2):** Display the origin unit/theme on each question to activate relevant situational schema during mixed-topic recall.

### 4.f Stitch design log (AG fills as it generates)

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Game Subsystem:** Daily Practice Spaced Repetition (`23-daily-practice.md`)
- **Generation Date:** 2026-09-13
- **Submission Status:** 2 screens submitted and successfully materialized in Stitch datastore (HTTP 200 / Exit code 0).
- **Quota Discipline:** 2 screens generated (max 2 per game).

#### Screens Generated & Brief Summaries:

1. **Screen 1: Daily Practice Start Card with Session-Length Choices**
   - **Stitch Screen ID:** `7c2a04ae3b104b2f9fbeba33b7a2bd6e`
   - **Title:** `Professor ESL - Daily Practice Spaced Repetition Start Card`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1VS-Plh0RzkWWdPT4G_nXsirI2nsbDbx1adAGuqDGpFHszwwUg1Piq_AfqNJUjQ7ZThxAeZ7MIPNZYyoP4VXytSq5_w2j9AEBXbYYShJ2jALCCOdNpr6JUYeL99b52nNJI-ry1dudwoYvjrqfXpKgccRfYxmoMD8fnKEKA73QxzHx1RO-nMA0SewLBtJEeblPHStOccNTmNBvvl5UcZRtkNwuijD_jxQVmakkvayY9VkgjNuCguwuVARA`
   - **Prompt Summary:** Mobile portrait (390×844) Daily Practice Spaced Repetition start card with session-length choices in Wonder Atlas Light design system. Universal 64px header on paper `#FDFBF7` with 48px back button (`[🔊 playCue: tap_back]`), title 'Daily Practice' in bold 20px Fredoka inkDeep `#1D3557`, and streak badge '🔥 4-Day Streak'. Center Stage: Daily Memory Workout Hero Card on warm paper `#FDFBF7` with 2.5px border `#E2D7C3` and radius 24px: Top badge '🧠 SPACED REPETITION • MEMORY WORKOUT'. Mascot illustration of Professor Owl nurturing a glowing green memory sprout. Due items headline: '18 Words Due for Review' in 22px Fredoka inkDeep `#1D3557`. Heart Haven Reassurance Banner on soft emerald `#E6F4F1` with teal border `#2A9D8F`: '❤️ Heart Haven: Reviewing weak words costs 0 hearts! Finishing practice RESTORES +1 Heart!' Session Length Selector (tactile cards with half-session mercy): Option 1: '⚡ Quick (6 cards • ~3 min)' - Half-session mercy for tired days, paper `#FDFBF7` (`[🔊 playCue: session_size_select]`). Option 2 (Active Selected): '⭐ Standard (12 cards • ~6 min)' - Recommended daily balance, selected with 2.5px teal border `#2A9D8F` and checkmark (`[🔊 playCue: session_size_select]`). Option 3: '🔥 Challenge (18 cards • ~10 min)' - Full sweep (+20 Bonus XP), paper `#FDFBF7`. Anchored 76px footer with 56px primary CTA 'START REVIEW (12 CARDS) 🚀' in teal `#2A9D8F` with hard bevel `0 4px 0 #1E6F5C` (`[🔊 playCue: start_game]`).
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_back]` on header back button tap
     - `[🔊 playCue: session_size_select]` on session length pill tap
     - `[🔊 playCue: start_game]` on start review launch tap
   - **Design Contract:** Wonder Atlas warm tokens (cream `#EAE0D0`, paper `#FDFBF7`, border `#E2D7C3`, ink `#264653`, inkDeep `#1D3557`, teal `#2A9D8F`, terracotta `#E76F51`, sand `#E9C46A`) × Duolingo accents (`#1CB0F6`, `#E91E63`), Fredoka + Nunito typography, production-grade Tailwind HTML + small style block, zero placeholder chrome.

2. **Screen 2: Daily Practice Battery Summary with Heart-Restore Reward**
   - **Stitch Screen ID:** `97e1abe38e0b4a18be7d407ccb1bec06`
   - **Title:** `Professor ESL - Daily Practice Review Complete (Heart Restore)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1VPhkk4sU-s0sB1iISA5zG0-ftqryjl7mfXci-3H1bUIPhyw25gee_SQic53Xk8T8L8phYskS8tnYdXzghZfUT_P8w3DtVgMsGtjZDU4BwSmYz-Ro2u6IS9dMcoGziygpTGwCKNquNddrX5DknszV-wgk-1rczzroKegC5vGaKctD4g3cJqX0xragdv7op62cVxEzQZGj6w8g1LBY9DXVbmHEXJ9Qcp8tJUb7kLNkGSex5IFPSfAj0wVg`
   - **Prompt Summary:** Mobile portrait (390×844) Daily Practice Spaced Repetition Completion Summary Screen with Heart Restore in Wonder Atlas Light design system. Universal 64px header on paper `#FDFBF7` with 48px close '✕' button (`[🔊 playCue: tap_exit]`), title 'Review Complete!' in bold 20px Fredoka inkDeep `#1D3557`, and glowing streak flame badge '🔥 5 Days!'. Central Hero Celebration Card on warm paper `#FDFBF7` with 2.5px border `#E2D7C3`: Victory badge '🎉 DAILY GOAL ACHIEVED!' in terracotta `#E76F51`. Mascot illustration of Professor Owl holding a golden heart and flourishing memory tree. Headline 'Memory Workout Complete!' with Chinese '每日复习完成！'. 3-Metric Stat Row: Stat 1 '⚡ +35 XP', Stat 2 '🌿 12 Words Strengthened', Stat 3 '🎯 92% Accuracy'. PROMINENT HEART-RESTORE REWARD BANNER (Soft emerald `#E6F4F1` card with 2.5px teal border `#2A9D8F`): Glowing Heart Icon: '❤️ +1 Heart Restored!' (`[🔊 playCue: heart_restore_chime]`). Restorative copy: 'Practice replenishes your energy! Heart balance is now 5/5 ❤️. Safe review pays off!' Quest Progress Card: '🏆 Quest: Review Words • COMPLETED (+10 Gems)'. Anchored 76px footer with 56px primary CTA 'CLAIM REWARDS & GO HOME ➔' in terracotta `#E76F51` with hard bevel `0 4px 0 #C4553B` (`[🔊 playCue: claim_reward]`).
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header close tap
     - `[🔊 playCue: heart_restore_chime]` on heart restore reward fanfare
     - `[🔊 playCue: claim_reward]` on claim rewards and go home CTA tap
   - **Design Contract:** Exact token hexes, thumb-reachable actions, production-grade Tailwind HTML + style block.

## §5 ZCode design verification (inside Stitch)

**Verified 2026-09-13** (owner batch pre-approval). Project `6865954475041880496`; exports in `stitch/23-daily-practice/`. Screens 1-2 — PASS: session-length mercy + heart-restore messaging.-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**PRE-APPROVED 2026-09-13 (owner batch directive):** "implement them all right away without waiting for my approval… we will modify [off designs] afterward."

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
