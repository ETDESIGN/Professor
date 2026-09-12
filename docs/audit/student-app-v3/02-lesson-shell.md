# Solo Lesson Player Shell — v3 Quality Audit (`PLAYER SHELL + INTRO_SPLASH`)

> **Current status:** implemented

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

- **Surface / route:** `/student/solo-lesson` — `apps/student/SoloLessonPlayer.tsx` (755 ln)
- **Exercise types consumed:** none directly — ROUTES every step: engine steps (files 08–11), pool battery (file 12), passive steps (03–07). Inline renders: INTRO_SPLASH, FOCUS_CARDS→WordLab, SPEED_QUIZ/GAME_ARENA, STORY_STAGE, GRAMMAR_SANDBOX, MEDIA_PLAYER, generic fallback.
- **Data sources:** activeUnit flow via SoloSessionContext (stage-scoped blocks with stale-id recovery); `services/gameRouting.ts` `contentForStep`; battery via `prepareUnitForStudent` + `selectLessonItems(unitId, studentId, 14, {types/signature/interleave/seed})` re-seeded per step; `MediaService.preloadUnitAssets`.
- **Scoring & data writes (SACRED):** `addPoints('solo', n)` (session score→XP); speed-quiz wrong = local `lives-1` (never gates); at last step → `completeStage(studentId, unitId, stage.id, accuracy)` (⭐ best-kept, fire-and-forget) + `onComplete({xp: max(1, score+3)+stage.xpReward, accuracy, stars: starsForAccuracy(accuracy)})` → LessonComplete → `finalizeLesson` (XP + 5★◆ + Q COMPLETE_LESSONS/EARN_XP).
- **Reachability:** every HomeMap node tap; "listen"/"scramble" legacy views route here too.
- **Theme today:** slate-50 light + `duo-pink` accents; header shows X + progress bar + 5-hearts placeholder (LOCAL `lives` state — decorative, never gates).

## §1 How the game works today

*(Screenshots pending — passport fixture.)*

The router + chrome of every lesson. `SoloLessonPlayer` takes the stage-scoped flow from SoloSessionContext and classifies each step via `services/gameRouting.ts` `contentForStep`: **engine** steps (FAST_VOCAB/WORD_SEARCH/MEMORY_LAB/SPELLING_BEE) render full-screen game steps (:615-641); **pool** steps (PRACTICE/ASSESS or routed families) render the ExerciseBattery (:589-610, loads via `prepareUnitForStudent` + `selectLessonItems(…, 14, {types, signature, interleave, seed})` :97-113, variety seed re-rolled per step :93,139); everything else renders inline passive steps — INTRO_SPLASH (:417-441), FOCUS_CARDS→WordLab (:185-192), SPEED_QUIZ/GAME_ARENA (:194-278), STORY_STAGE (:280-384), GRAMMAR_SANDBOX (:386-415), MEDIA_PLAYER (:443-568), generic placeholder (:570-584). Passive steps share the shell: X-exit + progress bar + a hearts counter (:686-704) and a Back/Continue footer (:721-740). Speed quiz: tap option → instant reveal, correct → `addPoints('solo', 1)` + "+1 XP" toast, wrong → local `lives-1` (:236-257). Lesson end: `handleNext` on the last step computes elapsed time, accuracy from `state.totalCorrect/totalAttempts`, XP = `max(1, state.score + 3) + stage.xpReward`, fires `completeStage` (stars best-kept, fire-and-forget) and calls `onComplete` → LessonComplete → `finalizeLesson` awards (:142-168). Battery/engine steps replace the whole screen (own headers with real HUDs) (:665-684). Unit vocab/images preloaded on mount (:115-129).

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … The home screen for the student will not be changed … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Refs are `apps/student/SoloLessonPlayer.tsx` unless noted.

- **F1 · P2 — The shell's "5 hearts" are fake and coexist with the battery's real hearts.** `lives` is local state (:41), decremented only by speed-quiz wrongs (:247), never gates anything — a child can sit at 0 hearts and continue forever. Meanwhile ExerciseRunner shows the REAL DB-backed balance in its own header (ExerciseRunner.tsx:238-241). One lesson, two heart systems, one of them decorative — dishonest UI (see `_CROSS-CUTTING.md` #4).
- **F2 · P2 — X-exits instantly with no confirmation.** The header X (:689) and the engine steps' chevron exits drop the whole lesson — stage stars, session accuracy, everything — with one accidental tap (completeStage only fires on natural completion :156-160). For a 6-y/o alone, an accidental exit is a data-loss dead-end.
- **F3 · P2 — MEDIA_PLAYER dims and crops the video** — player at `opacity: 0.6` over a 50% black scrim (:498, :508). This is the same TTR-degradation the board's v3 explicitly fixed (uncropped, undimmed video for visual modeling); the student app kept the old pattern.
- **F4 · P3 — Every lesson pays minimum XP regardless of performance** — `max(1, score + 3)` (:152): a zero-correct run still banks ≥3 XP (+ stage reward). Small, but the floor is generous.
- **F5 · P3 — Speed-quiz `addPoints('solo', 1)` writes a phantom student id** (:244) into pointsLog — harmless locally, hygiene only.
- **F6 · P3 — Story step tap targets are small** — prev/next page buttons are `p-2` icon buttons ≈36px (:353-365), under the 48px floor; the tapped-word popup requires a precise second tap on the 🔊 chip (:373).
- **F7 · P3 — Story popup can collide at short viewports** — absolutely positioned `bottom-24` (:370) with no clamp; the story text reserves `pr-24` for the Read-along button (:341).
- **F8 · P3 — Passive steps can be skipped without interacting** — the footer Continue is always enabled (no answer-ready gate, unlike the dead legacy runner's pattern); deliberate learner control vs. free-skipping is a pedagogy call to confirm in §4.
- **F9 · P3 — No small-height landscape pass on any inline step** (only the engine steps were compact-tested); the shell itself reflows but the inline step bodies were never floor-verified.

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Three incompatible HUD design languages across one lesson session.** (Evidence: §1, `SoloLessonPlayer.tsx:665-704` vs `ExerciseRunner.tsx:238-241` vs `steps/SpellingBeeStep.tsx`). During a single 6-step lesson, the child experiences three distinct headers: (1) passive steps render a light slate-50 bar with fake hearts, (2) battery steps swap in an exercise HUD with real DB hearts and SRS progress segments, and (3) engine steps (Spelling Bee, Word Search) completely replace the shell with dark or saturated standalone arcade banners. This visual fragmentation destroys continuity. *Recommendation: Unify all lesson steps under a single Wonder Atlas × Duolingo header shell (warm paper surface `#FDFBF7`, Fredoka typography, consistent progress segment indicator, unified heart counter).*
- **F2 · P2 — Video player visual degradation via dark scrim and lowered opacity.** (Evidence: §1, §3 F3, `SoloLessonPlayer.tsx:498,508`). The `MEDIA_PLAYER` component embeds video at `opacity: 0.6` over a 50% dark overlay. In classroom board v3, this was identified as severe pedagogical degradation because students could not clearly see mouth shapes or illustrated lyrics. In home solo study, this makes video lessons look disabled or broken. *Recommendation: Remove the dark scrim and `opacity: 0.6` style entirely, displaying media videos in full vibrant color with an unobtrusive play/pause HUD overlay.*
- **F3 · P3 — Sub-48px touch targets in story navigation controls.** (Evidence: §3 F6, `SoloLessonPlayer.tsx:353-365`). In the inline `STORY_STAGE`, page turning buttons are rendered as `p-2` icon chips (~36px square). On a 390px phone held in small hands, this causes frequent mis-taps and frustrates young children trying to turn the page. *Recommendation: Expand story page navigation targets to minimum 48×48px with clear tactile bevels (`wa-terracotta` / `wa-teal`).*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F4 · P1 — Catastrophic instant lesson abort without confirmation.** (Evidence: §1, §3 F2, `SoloLessonPlayer.tsx:689`). Tapping the top-left 'X' immediately unmounts the player and navigates back to HomeMap. All accumulated stage accuracy, stars, and session points are permanently wiped. Because young children frequently tap near the top of the phone screen or experience thumb slips, this causes devastating accidental progress loss. *Recommendation: Intercept the exit action with a friendly modal sheet: "Leave lesson? Progress will be lost!" featuring two prominent buttons: "Keep Playing" (large primary action) and "Leave" (secondary text button).*
- **F5 · P2 — Frictionless skip-through on passive presentation steps.** (Evidence: §1, §3 F8, `SoloLessonPlayer.tsx:721-740`). The footer "Continue" button is permanently active on `FOCUS_CARDS`, `STORY_STAGE`, and `GRAMMAR_SANDBOX`. A child can rapidly tap "Continue" 5 times in under 3 seconds to skip all learning content without listening to a single word or flipping a card. *Recommendation: Implement an interaction latch on presentation steps: require at least one meaningful student action (e.g. playing audio, flipping 2 flashcards, or advancing one story page) before unlocking the Continue button.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F6 · P1 — Dishonest hearts split-brain teaches learned cynicism.** (Evidence: §1, §3 F1, `SoloLessonPlayer.tsx:41,247` vs `ExerciseRunner.tsx:238-241`). The shell displays a 5-heart icon that decrements on inline speed-quiz errors but never gates the child; at 0 hearts, the child continues effortlessly. Minutes later, the child enters an `ExerciseBattery` step where mistakes cost genuine database-backed hearts and can trigger an out-of-hearts exit. Showing a fake penalty in step 1 undermines trust in the app's real game rules. *Recommendation: Remove the decorative heart counter from passive presentation steps; display hearts only when entering genuine graded practice (ExerciseRunner), and ensure the displayed count reflects real learner state.*
- **F7 · P2 — Superficial feedback on inline speed-quiz errors.** (Evidence: §1, `SoloLessonPlayer.tsx:236-257`). When a child selects a wrong answer in the inline speed quiz, the card turns red and immediately proceeds without showing the correct English meaning or playing the correct audio pronunciation. In an EFL solo context with no teacher present, this leaves the child without error correction. *Recommendation: On wrong answers, freeze for 1.2s, highlight the correct option in emerald with an audio pronunciation playback, then allow the child to proceed.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F8 · P2 — Missing milestone pacing between lesson phases.** (Evidence: §1, `SoloLessonPlayer.tsx:142-168`). Transitions between distinct pedagogical phases (e.g., from Word Lab vocabulary study into Exercise Battery challenge) occur instantly as an unannounced screen flip. Children have no awareness of shifting from low-stakes exploration to high-stakes graded practice. *Recommendation: Introduce a brief 1-second micro-interstitial between major stage blocks (e.g., "Ready for the Quiz?", "Story Time!") with a lively mascot cheer to reset mental focus.*
- **F9 · P3 — Generous zero-effort XP floor.** (Evidence: §3 F4, `SoloLessonPlayer.tsx:152`). Final lesson XP is computed as `max(1, score + 3) + stage.xpReward`. A student who enters, skips every step, and scores 0% still receives 3+ XP. *Recommendation: Require at least 40% accuracy or completed participation in at least half the steps to trigger the full stage XP bonus, preserving gamification integrity.*

### 4.e Top-5 prioritized recommendations
1. **[P1] Add exit-confirmation modal:** Intercept the header 'X' with a warm confirmation dialog to prevent catastrophic progress loss from accidental taps.
2. **[P1] Eliminate dishonest fake hearts:** Remove local decorative hearts from the passive shell header; display hearts exclusively during real graded challenge batteries where DB state is actively tracked.
3. **[P2] Gate the Continue button on presentation steps:** Require minimal active engagement (listening to audio or tapping a card) before enabling Continue on Word Lab, Story, and Grammar steps.
4. **[P2] Restore full brightness and clarity to Media Player:** Remove dark scrims and `opacity: 0.6` from video song playback so children can clearly observe visual phonics and modeling.
5. **[P2] Harmonize header shell typography and token palette:** Align passive, engine, and battery step headers to the Wonder Atlas × Duolingo light system (paper card `#FDFBF7`, ink text, crisp progress segments).

### 4.f Stitch design log (AG fills as it generates)

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Game Subsystem:** Lesson Player Shell & INTRO_SPLASH (`02-lesson-shell.md`)
- **Generation Date:** 2026-09-13
- **Submission Status:** 2 screens submitted and successfully materialized in Stitch datastore (HTTP 200 / Exit code 0).
- **Quota Discipline:** 2 screens generated (max 2 per game).

#### Screens Generated & Brief Summaries:

1. **Screen 1: Shell + INTRO_SPLASH (Unit Intro Moment + Shell Header/Footer System)**
   - **Stitch Screen ID:** `b2f964b164444aceb5f595b120e7d245`
   - **Title:** `Professor ESL - Solo Lesson Player Shell (Intro Splash)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1Wlw9izTHRh8DXl6h1UmV7NToyys7wfIEMBjjnSHIDGWHQzPumFE1eJGgvzUlgewufQTZRNZWe-VPXVxk3wzgIPPXijYmbDCQIHg1_NP78nVOg5CASwmP81U9gp1M6X5eMm6JQUEnh7BGUQltN31RcdMRTODA7GflLuF5R_RtE5MMFc-UCRSg6WJs424XkMdyV2s2UQ8ipsNpO_6VBBEml5I5jvnypKTn1zofK1tNZKg2k5VVNATZRqMQ`
   - **Prompt Summary:** Mobile portrait (390×844) lesson player shell with unit intro splash card. Universal 64px header on paper `#FDFBF7` with 48px close '✕' button, 6-segment progress tracker (Step 1 active in Duolingo pink `#E91E63`), and real hearts counter (4 hearts in `#FF4B4B`). Main stage features central hero card on cream `#EAE0D0` with Unit 3 badge (`UNIT 3 • LESSON 1`), headline `In the City`, Chinese subtitle `城市探索 • 探索城市中的新单词与故事`, custom SVG illustration of Professor Owl in safari hat with magnifying glass, and 3 learning roadmap chips (5 New Words, Story, Speed Quiz). Anchored 80px footer with disabled Back button and 54px tactile CTA `START LESSON →` in teal `#2A9D8F` (`0 4px 0 #1E6F5C` bevel).
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header close tap
     - `[🔊 playCue: intro_fanfare]` on unit splash entrance
     - `[🔊 playCue: tap_start]` on Start Lesson tap
   - **Design Contract:** Wonder Atlas warm tokens (`#EAE0D0`, `#FDFBF7`, `#E2D7C3`) × Duolingo accents (`#E91E63`, `#1CB0F6`), Fredoka + Nunito typography, production Tailwind HTML + small style block, zero placeholder chrome.

2. **Screen 2: Shell Exit Confirmation Sheet / Modal (Accidental Data Loss Protection)**
   - **Stitch Screen ID:** `30610c4d8de141689c0bd8e0637e64e2`
   - **Title:** `Professor ESL - Solo Lesson Player Shell (Exit Confirmation)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1UlIzAbzV5FvmHcFFMJa4pq-Mm1kXQGFkslF3TJb1CqsyVSpy9od5CvCPXA6qyNa6O8j5lLlqAgkIveXys1rlCG9YOFadk7-MyffIRNZVUXSdyyu95UovRYZnQxmLoEOAmooDyT8Mbm8H2Nt8Axpu2N8l5SwDmLc4ZBRP8QhvEsXgtYylUyWvSQxrji5iqrbwyfbIzXW63PutgOAydTUjhzcfeVcmRBj27ZC86zixe5Dlt2RXKl4q6mMw`
   - **Prompt Summary:** Mobile portrait (390×844) exit confirmation sheet anchored over dimmed/blurred active lesson stage (`rgba(38, 70, 83, 0.55)`). Shell header visible behind scrim with 3/6 progress and 4 hearts. Warm paper `#FDFBF7` sheet with rounded-t-[36px] dialog, top grab-handle, and caring Professor Owl mascot with moist eyes asking the child to stay. Headline `Leave lesson already?` in Fredoka inkDeep `#1D3557`, body warning in ink `#264653`, and Chinese subtitle `现在退出将丢失本次课时的所有星星和进度哦！`. Loss prevention chip displays `⭐ 2 Stars earned so far` and `✨ +15 XP pending bonus`. Vertical thumb-zone button stack: Primary 54px tactile `KEEP LEARNING` button in teal `#2A9D8F` (`0 4px 0 #1E6F5C` bevel) and secondary 54px `Quit Lesson` button in paper `#FDFBF7` (`0 3px 0 #D5C7B0` bevel).
   - **Sound Cue Marks:**
     - `[🔊 playCue: prompt_warning]` on modal display
     - `[🔊 playCue: tap_resume]` on Keep Learning tap
     - `[🔊 playCue: tap_exit]` on Quit Lesson tap
   - **Design Contract:** Exact token hexes, thumb-reachable actions, production-grade Tailwind HTML + style block.

## §5 ZCode design verification (inside Stitch)

**Verified 2026-09-13** (owner batch directive — no per-game gate). Project `6865954475041880496`. Screens 1-2 exported to `stitch/02-lesson-shell/` — PASS: shell+intro system and the exit-confirm flow per §4.f log; mobile portrait, token palette, ≥48px targets, Chinese on support surfaces only. Sound moments marked per the owner's sound directive; implementation wires `playCue`.-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**PRE-APPROVED 2026-09-13 (owner batch directive, verbatim):** "I review every screen in Stitch right now so please implement them all right away without waiting for my approval. I will verify everything tomorrow… in case some designs are too much off, we will modify them afterward." — revisions, if any, follow the edit_screens loop after his review.

## §7 Implementation notes & design-fidelity log

- **Implementation Date:** 2026-09-13
- **Component Touched:** `apps/student/SoloLessonPlayer.tsx`
- **Diff Scope:**
  - Integrated universal 64px player shell header on paper `#FDFBF7` with 48px tactile close button (`<X />`), multi-segment progress bar with active step highlighted in Duolingo pink `#E91E63`, and real hearts HUD via `Engine.getHearts(studentId)` (graceful fallback to `—`, non-blocking).
  - Implemented accidental exit confirmation modal (02 F2): caring Professor Owl illustration, earned stars/XP loss-prevention stats, primary teal CTA "KEEP LEARNING" (`#2A9D8F`), and secondary paper CTA "Quit Lesson". Bypassed on INTRO_SPLASH so initial exit is instant without confirmation friction.
  - Implemented INTRO_SPLASH unit showcase: custom vector illustration of Professor Owl explorer with city backdrop, unit badge, Chinese subtitle support, 3 learning roadmap chips (Vocabulary, Story, Speed Quiz), and beveled teal `START LESSON →` CTA with `playCue('win')`.
  - All sound moments wired via `playCue` (`tap_exit`, `tap_start`, `win`, `reveal`).
- **Scoring & Data Writes Verbatim Check:**
  - `addPoints`, `onComplete`, `stageProgressService.completeStage` signatures and calling contracts preserved exactly.
- **Gauntlet Results:**
  - `npx tsc --noEmit -p tsconfig.json`: 0 errors.
  - `npx vitest run`: 826 passed | 1 skipped (0 failures).
  - `npm run build`: Clean build in 17.07s.
- **Design-Fidelity Log per Stitch Screen:**
  - **Screen 1 (Shell + INTRO_SPLASH): Followed.** Implemented 64px header, 6-segment progress bar with `#E91E63` active indicator, hearts HUD, Professor Owl explorer hero illustration, roadmap chips, and anchored beveled footer CTA.
  - **Screen 2 (Exit Confirmation Sheet): Followed.** Implemented centered/sheet loss-prevention modal with caring owl vector, stars/XP retention preview, and dual thumb-friendly buttons. Bypassed safely on INTRO_SPLASH where 0 progress has been made.
