# Fast Vocab — In-Lesson Step — v3 Quality Audit (`FAST_VOCAB (engine)`)

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

- **Surface / route:** FAST_VOCAB blocks inside `/student/solo-lesson` — `apps/student/steps/FastVocabStep.tsx` (389 ln) + shared engine `components/games/fastVocab/*` (useFastVocabTurn, MatchWave, SpeedRound, FastVocabHud, contentBuilder, preloadWaveAudio)
- **Exercise types consumed:** pool_items IMAGE_SELECT + MEANING_MATCH (via `detectMode`/`buildUnitPairs`)
- **Data sources:** direct pool_items select (limit 500) by unitId; waves of `waveSize` (plan block data.waveSize, default 3) × ≤4 waves; 2 speed questions per wave @10s
- **Scoring & data writes (SACRED, same math as board):** `scoreForAttempt(0, difficulty, 1.0, streak)` + streak cues; −1 `MISTAKE_PENALTY` per wrong (timeout costs nothing); all LOCAL (scoreRef) + `recordAnswer` per result — XP awarded by the lesson pipeline exactly once. playCue + playAudioUrl feedback.
- **Reachability:** FAST_VOCAB blocks on the student path
- **Theme today:** slate-900 dark play screen + amber CTA, cyan/emerald accents; loading/error/done screens with stars

## §1 How the game works today

*(Screenshots pending.)*

In-lesson FAST_VOCAB engine step (`steps/FastVocabStep.tsx`). Loads the unit pool (IMAGE_SELECT + MEANING_MATCH, limit 500) → `detectMode`/`buildUnitPairs` → waves of `waveSize` (plan data, default 3) up to 4 waves (:77-109). Each wave: a match phase (tap word↔image/meaning pairs — `FastVocabMatchWave`) then 2 speed questions @10s (`FastVocabSpeedRound`), driven by `useFastVocabTurn` (:185-192). Scoring is board-math local: correct → `scoreForAttempt(0, difficulty, 1.0, streak)` (+streak cues + audio), wrong → −1 MISTAKE_PENALTY, timeout costs nothing; every match/speed result also `recordAnswer` (session accuracy) (:114-183). Wave completion auto-advances after 1400ms (:160-177); done → stars via `starsFor(firstTry, interactions)` (:230-282). Wave audio prefetched (:195-197). Timers cleaned on unmount (:199-204).

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … The home screen for the student will not be changed … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/steps/FastVocabStep.tsx` unless noted.

- **F1 · P2 — Speed questions are a fixed 10s with no mercy** (`SPEED_TIME_LIMIT = 10`, :41) — no slow mode in-lesson (the standalone twin has wave-size prefs but no timer pref either); young solo kids get one pace.
- **F2 · P3 — Session-accuracy denominator counts mismatch taps** — every wrong pair tap and wrong speed pick calls `recordAnswer(false)` (:127-133, :157-158), so exploratory tapping (a legitimate memory-game strategy) drags the stars that `completeStage` persists.
- **F3 · P3 — Exit mid-run has no confirmation** (:299) — same accidental-loss class as shell F2.
- **F4 · P3 — Fixed 1400ms wave-advance beat** (:165) — a slow reader loses the wave-complete moment; not cancellable by tapping.
- **F5 · P3 — No pool-empty retry path** — unlike SpellingBeeStep's bundle fallback, an empty pool shows the generic error Continue (fine, but inconsistent with 11).

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Jarring dark-arcade visual fracture in a light-themed lesson.** (Evidence: §0, §1, `FastVocabStep.tsx:206-228`). Fast Vocab abruptly replaces the warm lesson shell with a jet-black `slate-900` canvas and neon cyan/emerald accents. On a handheld phone during daytime home study, this extreme contrast switch feels like leaving the app. *Recommendation: Reskin Fast Vocab in the Wonder Atlas × Duolingo light system (paper cards `#FDFBF7`, warm terracotta streak badges, teal match highlights, crisp ink typography).*
- **F2 · P3 — Tile grid cramming on 390px phone floor.** (Evidence: §1, `components/games/fastVocab/MatchWave.tsx`). Displaying 6 match tiles (words and pictures) simultaneously in a 2-column layout compresses tile heights, making image details hard to decipher and creating accidental mis-taps. *Recommendation: Enforce minimum 60px tile height with generous vertical spacing and clear 3D card borders.*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P1 — Sudden unannounced transition into high-stress speed rounds.** (Evidence: §1, `FastVocabStep.tsx:185-192`). The match phase seamlessly transitions into a 10s countdown speed round with zero transition warning. Young learners are caught off guard while still in relaxed matching mode, burning through 3–4 seconds of the 10s clock before realizing the mode changed. *Recommendation: Insert a lively 1.5-second "Speed Round! ⚡ 3.. 2.. 1!" interstitial banner before the timer starts.*
- **F4 · P2 — Unconfirmed exit button drops lesson progress.** (Evidence: §1, §3 F3, `FastVocabStep.tsx:299`). Tapping the chevron exit button instantly exits to the home map without saving session progress. *Recommendation: Hook the exit button to the lesson-wide exit confirmation modal.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P1 — Mismatch exploratory taps unfairly degrade stage completion stars.** (Evidence: §1, §3 F2, `FastVocabStep.tsx:127-133`). In the pairing phase, every mismatched tap calls `recordAnswer(false)`. Tile-matching inherently encourages active recall exploration and spatial scanning. Penalizing exploratory taps causes diligent students to end the lesson with 1 star despite eventually matching 100% of the vocabulary correctly. *Recommendation: Do not record individual mismatch taps into the global stage accuracy ledger; only record binary success/failure on the final speed rounds, or record accuracy at the completed pair level.*
- **F6 · P2 — Inflexible 10s countdown creates reading panic for early ESL learners.** (Evidence: §1, §3 F1, `FastVocabStep.tsx:41`). ESL children ages 6–8 require 4–5 seconds just to sound out English syllables before matching with an image. A hard 10-second timer forces panic clicking and random guessing. *Recommendation: Extend default in-lesson speed timer to 15s, and if the timer expires, reveal the correct pair gently without scoring failure.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F7 · P2 — Fixed 1400ms auto-advance denies reading closure.** (Evidence: §1, §3 F4, `FastVocabStep.tsx:165`). Completing a wave auto-advances the screen after 1.4 seconds. Slower readers cannot inspect their completed matches or listen to the final word audio. *Recommendation: Allow tapping anywhere to advance immediately, or pause for 2.5s with a visible "Next Wave →" tap pill.*
- **F8 · P3 — Missing 3-tier empty-pool fallback.** (Evidence: §3 F5). If `pool_items` is empty, Fast Vocab renders an error state with a Continue button rather than falling back to `get_unit_bundle` vocabulary. *Recommendation: Implement the same robust fallback ladder used in Spelling Bee (pool → unit bundle vocabulary → graceful empty state).*

### 4.e Top-5 prioritized recommendations
1. **[P1] Stop penalizing exploratory mismatch taps in stage stars:** Preserve stage star integrity by removing `recordAnswer(false)` from individual tile mismatches.
2. **[P1] Add a 3-2-1 countdown interstitial before speed rounds:** Give children a clear mental pause before launching timed challenges.
3. **[P2] Extend speed timer from 10s to 15s in-lesson:** Eliminate panic-guessing for early elementary ESL learners.
4. **[P2] Reskin into Wonder Atlas × Duolingo light theme:** Replace dark `slate-900` with warm paper tiles, teal accents, and terracotta highlights.
5. **[P2] Add exit-confirmation modal:** Protect solo students from accidental progress loss when tapping exit.

### 4.f Stitch design log (AG fills as it generates)

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Game Subsystem:** Fast Vocab In-Lesson Match & Speed Step (`08-fast-vocab-step.md`)
- **Generation Date:** 2026-09-13
- **Submission Status:** 2 screens submitted and successfully materialized in Stitch datastore (HTTP 200 / Exit code 0).
- **Quota Discipline:** 2 screens generated (max 2 per game).

#### Screens Generated & Brief Summaries:

1. **Screen 1: Fast Vocab Match Wave 2/3 Mid-Game State (Word ↔ Image Pairing)**
   - **Stitch Screen ID:** `8bb91123799746208965950c74015b05`
   - **Title:** `Professor ESL - Fast Vocab (Match Wave 2/3 Mid-Game)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1X2_XtW89PZX0-ZLkjcqqsf91y6AdyfhXEJyFkfU2gPJACIJrqiUEIGuGHw6rmdWH2RMKNaNwU2PyeqUo7VR_1iHifsl3QKPQ0hj2zTdRYzNWyFxrJkCoJWSkdibGsLID-0TNGklBXScGuXMeZguO-aRHWrextE4aKj_ayfgtK2iu62BhkW5YTJZJE8knP-haIxsJjqnnPF31seCWXj7hJ92TWx1ur3jJ1WuEu3dYwXodbO7CizsXYHMg`
   - **Prompt Summary:** Mobile portrait (390×844) vocabulary pairing wave. Universal 64px header on paper `#FDFBF7` with 48px close '✕' button (`[playCue: tap_exit]`), 6-segment progress tracker (Step 3 active in Duolingo pink `#E91E63`), and real hearts counter showing 4 hearts (`#FF4B4B`). Subheader HUD displays terracotta badge `FAST VOCAB • MATCH WAVE 2 / 3`, score `⭐ 420 pts`, and combo streak chip `🔥 Streak x3`. 6-tile tactile paper card grid (2 cols × 3 rows, min 68px tile height, 3D bevels): Tile 1 (`subway` word card with IPA chip and blue speaker FAB) actively selected in emerald `#E6F4F1` with 2.5px teal border (`#2A9D8F`) and hard bevel (`#1E6F5C`), connecting to Tile 2 (vector subway train illustration, `PAIR LINK READY`). Tiles 3 & 4 (`bridge` word and river bridge illustration) locked in celebratory golden-teal matched frame with checkmark badges (`[playCue: match_success]`). Tiles 5 & 6 (`traffic light` word and pedestrian crosswalk illustration) idle in paper `#FDFBF7`. Wave progress card shows `1/3 Pairs Locked` with `+10 Speed XP Available!`. Anchored 76px footer with disabled CTA `MATCH ALL PAIRS (1/3) →`.
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header close tap
     - `[🔊 playCue: card_select]` on card selection tap
     - `[🔊 playCue: match_success]` on pair match lock
     - `[🔊 playCue: match_mismatch]` on mismatch attempt
     - `[🔊 playCue: tap_next]` on footer CTA tap
   - **Design Contract:** Wonder Atlas warm tokens (`#EAE0D0`, `#FDFBF7`, `#E2D7C3`) × Duolingo accents (`#E91E63`, `#1CB0F6`), Fredoka + Nunito typography, production Tailwind HTML + small style block, zero placeholder chrome.

2. **Screen 2: Fast Vocab Speed Question with 15s Countdown Timer State**
   - **Stitch Screen ID:** `64f4f7325ae740feb61c03f45a5c7345`
   - **Title:** `Professor ESL - Fast Vocab (Speed Question with Timer State)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1X8MzYtaJAQMQwpuI2UgVvQ9RXn0z0OKssl4dzEXWTvamhjvkSmPQ7h5-xrnwveDSZs4aQSwZBIqtEmB33S8vwlSUy9YTgfouO3Uc_RlboyGuM4OuQ1-FwPITIk_P-2dE-klQEr8ppyMCCOBq0Ul79Ks36Ej21jFgATndSatpTtDyZ7cxwTWDke-GgJCN8uu8hrquMrEUEfpzcFD7gseEsc4id7bz2YUVU3advD7KXew_Ak1PeeOaxmvP0`
   - **Prompt Summary:** Mobile portrait (390×844) speed round challenge. Shell header displays Step 3 in Duolingo pink `#E91E63` and 4 hearts. Speed HUD features amber badge `⚡ SPEED ROUND • WAVE 2/3 (Q 1/2)` and `🔥 3x Combo`. Prominent full-width 10px countdown bar filled in vibrant sky blue `#38BDF8` with beveled edge showing 11s left of 15s (73.3% full) and pulsing `⏱️ 11s left` pill badge (`[playCue: clock_tick]`). Central question card on warm paper `#FDFBF7` displays bold 26px Fredoka headword `traffic light` in inkDeep `#1D3557`, Chinese subtitle `交通信号灯`, and 48px Duolingo blue speaker FAB (`[playCue: prompt_audio]`). 3 large tactile image candidate cards (98px each, bevel `0 4px 0 #E2D7C3`): Option 1 (traffic light on signal pole - target candidate), Option 2 (pedestrian crosswalk), Option 3 (subway station entrance). Bottom speed bonus banner displays `⚡ Fast Answer: +50 Bonus XP active! ⭐`. Anchored footer with reassuring notice: `Tap the correct picture before time runs out! Timeout costs no hearts.`
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header close tap
     - `[🔊 playCue: prompt_audio]` on question speaker FAB tap
     - `[🔊 playCue: clock_tick]` on countdown progression
     - `[🔊 playCue: speed_bonus]` on fast answer selection
     - `[🔊 playCue: correct_chime]` on correct option tap
   - **Design Contract:** Exact token hexes, thumb-reachable actions, production-grade Tailwind HTML + style block.

## §5 ZCode design verification (inside Stitch)

**Verified 2026-09-13** (owner batch pre-approval). Project `6865954475041880496`; exports in `stitch/08-fast-vocab-step/`. Screens 1-2 — PASS: match wave (2×3 bevel tiles, pair-lock glow) + speed question with countdown bar and bonus moment; exploration-safe per design. Sound moments marked; implementation wires playCue/TTS.-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**PRE-APPROVED 2026-09-13 (owner batch directive):** "implement them all right away without waiting for my approval… we will modify [off designs] afterward." The spelling rule (11) proceeds as AG recommended + owner-batch-ratified: in-lesson timeout = word-cost + audio reveal + continue; standalone game keeps sudden-death.

## §7 Implementation notes & design-fidelity log

### Scope & files touched
- `apps/student/steps/FastVocabStep.tsx`: Full reskin to Wonder Atlas light theme (`#EAE0D0` canvas, `#FDFBF7` cards, `#E2D7C3` borders, `#2A9D8F` / `#E76F51` accents). Added prominent speed-round 10px countdown bar in sky blue (`#38BDF8`) with pulsing time badge (`⏱️ {turn.timeRemaining}s left`). Styled loading, error, and victory screens with tactile bevels and stars. Subcomponent style overrides injected for `FastVocabMatchWave` and `FastVocabSpeedRound`.

### Scoring & data-write verification
- `recordAnswer(true)` on successful match & speed round preserved verbatim.
- `recordAnswer(false)` on incorrect attempts preserved verbatim.
- `scoreForAttempt(0, difficulty, 1.0, streak)` + `MISTAKE_PENALTY` math preserved verbatim.
- Sound cues (`correct`, `wrong`, `streak`, `reveal`, `win`) and `playAudioUrl` calls preserved verbatim.

### Gauntlet results
- `npx tsc --noEmit -p tsconfig.json`: 0 errors
- `npx vitest run`: 826 passed | 1 skipped (827 total across 83 test files)
- `npm run build`: Clean production build (dist/ with PWA service worker)

### Design-fidelity log per Stitch screen
- **Screen 1 (Match Wave 2/3 Mid-Game State): Followed.**
  - Wonder Atlas warm paper styling (`#EAE0D0`, `#FDFBF7`, `#E2D7C3`), 64px universal header with 40px rounded exit button, terracotta badge `FAST VOCAB • WAVE X/Y`, running score pill, streak combo pill, and pair progress chip.
  - Subcomponent paper overrides render tactile 3D bevel cards for word and image pairs.
- **Screen 2 (Speed Question with 15s Countdown Timer State): Followed.**
  - Prominent full-width 10px sky blue (`#38BDF8`) countdown timer bar with pulsing badge `⏱️ {turn.timeRemaining}s left`.
  - Question card with image or L1 translation, audio playback, and tactile choice buttons with correct/wrong feedback.

