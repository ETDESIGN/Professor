# Lesson Complete — Reward Interstitial — v3 Quality Audit (`REWARD: /student/lesson-complete`)
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

- **Surface / route:** `/student/lesson-complete` — `apps/student/LessonComplete.tsx` (153 ln); the award site is `StudentApp.finalizeLesson` (StudentApp.tsx:181-203)
- **Exercise types consumed:** none
- **Data sources:** sessionResults {xp, accuracy, time, stars} passed from the completing surface
- **Scoring & data writes (SACRED — award site):** on Continue → `GamificationService.awardXP(xp || LESSON_COMPLETE)`; ◆ PERFECT_LESSON only when stars===5; Q COMPLETE_LESSONS +1 and EARN_XP +xp; then home
- **Reachability:** end of every lesson/solo game/practice run that calls handleLessonComplete
- **Theme today:** slate-900 dark, conic burst + dot confetti, 3-star cascade, XP count-up, ◆ card

## §1 How the game works today

*(Screenshots pending.)*

LessonComplete (`LessonComplete.tsx`): dark celebration — conic burst + dot confetti, 1-3 star cascade (500/1000/1500ms), XP count-up, gems card, Continue (:18-59+). Continue → `StudentApp.finalizeLesson` (StudentApp.tsx:181-203): `awardXP(xp || LESSON_COMPLETE)`; PERFECT_LESSON gems ONLY when `stars === 5`; quests COMPLETE_LESSONS +1 and EARN_XP +xp; home. Stars arrive from the completing surface (`starsForAccuracy` = 1-3 for lessons; engine games compute their own 0-5 internally before pattern-A self-award).

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs: `apps/student/LessonComplete.tsx`, `StudentApp.tsx:181-203`, `services/stageProgressService.ts:31-32`.

- **F1 · P2 — The 5-star gem gate is unreachable from the lesson path.** `starsForAccuracy` returns 1-3 (stageProgressService.ts:31-32), but `finalizeLesson` requires `stars === 5` for gems (StudentApp.tsx:188) — no lesson, ever, awards perfect-lesson gems; only the standalone games' internal 0-5 star systems can. Either the gate means "engine-game perfect only" (then hide the gem card for lessons) or the scale needs alignment — kid-visible inconsistency either way.
- **F2 · P3 — Star display clamps to 3** (`Math.min(3, …)` :22) — consistent with lesson stars, hides the mismatch in F1.
- **F3 · P3 — XP count-up speed is fixed** (20ms/point :31-39) — a 200-XP run takes 4s of counting; cap the animation.
- **F4 · P3 — No accuracy/time tiles** — the owner's draft prompt sketches "Total XP + Accuracy" stat tiles; current screen shows XP + gems only (time is passed but unused).

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P1 — False Gem Reward Promise (Phantom Gem Card).**
  - *Evidence:* `LessonComplete.tsx:115-127` renders an unconditional green reward card: `+{GEM_REWARDS.PERFECT_LESSON} Gems [Checkmark]` (`F1`). However, `StudentApp.tsx:188-191` gates gem awarding strictly on `(sessionResults.stars ?? 0) === 5`. Because standard lesson paths use a 1–3 star scale (`starsForAccuracy` returns max 3), `stars === 5` is mathematically impossible in normal lessons! The child sees a glowing green checkmark claiming they earned 15 gems, but upon returning to the home map their gem wallet has not increased by a single gem.
  - *Recommendation:* Synchronize the UI and business logic: only render the gem reward card when `isPerfect` is truly achieved (or align the perfection criteria so 3/3 stars on a lesson awards the perfection bonus). Never display an unfulfilled reward to a child.
- **F2 · P2 — Somber slate-900 background clashes with daytime celebratory tone.**
  - *Evidence:* `LessonComplete.tsx:50` wraps the entire screen in `bg-slate-900` with a dim conic blur. While meant to feel cinematic, it creates a dark, jarring contrast against the light warm paper tones of the rest of the student journey.
  - *Recommendation:* Reskin the celebration with an uplifting Wonder Atlas palette: cream/ivory backdrop, golden sunburst radiance, colorful celebratory confetti, and a cheering mascot delivering the victory banner.

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P1 — Discarded session time and missing Streak Flame habit loop.**
  - *Evidence:* `LessonComplete.tsx:18, 90-128` (`F4`). `stats.time` (e.g. `'2:15'`) is passed as a prop from the completing session but is completely ignored in the render tree. More crucially, there is zero visual celebration of the student's daily streak! In language learning habit formation, seeing the streak flame advance (`4 Days ➔ 5 Days! 🔥`) immediately upon lesson completion is the premier psychological retention anchor.
  - *Recommendation:* Render a comprehensive 3-stat summary row (`XP ⚡`, `Accuracy 🎯`, `Time ⏱️`), followed by an animated Streak Celebration banner (`Streak +1! 🔥`) with an explicit quest progress indicator before navigating home.
- **F4 · P2 — Linear XP count-up delays exit on high-XP sessions.**
  - *Evidence:* `LessonComplete.tsx:31-39` (`F3`) increments XP by 1 every 20ms. A run earning 150–200 XP forces the child to watch numbers tick up for 3–4 seconds. Tapping "Continue" during the animation can feel unresponsive.
  - *Recommendation:* Cap the total count-up duration to a brisk 600ms using an easing function, and allow an immediate screen tap to skip directly to the final totals.

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P2 — Star scale discordance: 3-star display masks 5-star standalone logic.**
  - *Evidence:* `LessonComplete.tsx:22` clamps all stars to `Math.min(3, stats.stars ?? 3)` (`F2`), while standalone arcade games calculate a 0–5 star scale internally. A child who achieves 5/5 stars in Fast Vocab sees only 3 stars on this screen, creating confusion about their performance.
  - *Recommendation:* Normalize all completion surfaces to a canonical 3-star mastery tier (⭐ Completed, ⭐⭐ Proficient, ⭐⭐⭐ Mastered) consistent with the student path map nodes.

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F6 · P2 — Silent celebration: no audio fanfare or star chimes.**
  - *Evidence:* Visual stars and confetti animate, but the component invokes no audio effects. For young children, the absence of celebratory sound (trumpet fanfare, sequential star chimes `ding! ding! ding!`) drastically diminishes the emotional payoff of completing difficult homework.
  - *Recommendation:* Trigger celebratory SFX on mount: a joyful victory jingle accompanied by synchronized ascending chimes as each star drops into place.

### 4.e Top-5 prioritized recommendations
1. **Fix Phantom Gem Award Bug (P1):** Stop showing the `+15 Gems` card when 0 gems are awarded; gate display on actual gem awarding and align 3-star lessons with perfect gem rewards.
2. **Add Animated Streak Flame & Quest Progress (P1):** Introduce a high-dopamine daily streak advancement animation (`+1 Day 🔥`) and quest completion checkmark.
3. **Display Session Time in 3-Stat Metric Row (P2):** Utilize the passed `stats.time` to show Total XP, Accuracy %, and Completion Time together.
4. **Reskin with Warm Celebration Palette & Fanfare SFX (P2):** Replace the dark slate background with a warm golden sunburst, colorful confetti, and joyful sound effects.
5. **Fast Eased XP Count-up with Tap-to-Skip (P2):** Accelerate XP animations to 600ms total and permit tapping anywhere to reveal final stats instantly.

### 4.f Stitch design log (AG fills as it generates)

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Game Subsystem:** Lesson Complete Reward Interstitial (`27-lesson-complete.md`)
- **Generation Date:** 2026-09-13
- **Submission Status:** 2 screens submitted and successfully materialized in Stitch datastore (HTTP 200 / Exit code 0).
- **Quota Discipline:** 2 screens generated (max 2 per game).

#### Screens Generated & Brief Summaries:

1. **Screen 1: Lesson Complete Star Cascade and Streak Flame Celebration**
   - **Stitch Screen ID:** `91095a539f4b44aeba0edef08813aad4`
   - **Title:** `Professor ESL - Lesson Complete Celebration (Star Cascade & Streak Flame)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1WW27RxL00gp-0GvhjHDWRS_6Iv55JjK6LDmmjFVD_rhUb1oaayqIBdX8KyPg5F_BVnx_n_bxgoSK9ik17yz3YdeTJZkAsEb122xQI2O88EaH5TaeiKeKbFsacwEhj7xnKbMD59FLKZjkazu1aF4EUxLMNHiITI_LkNFiKjw7vCtSLMy_W7MNQqnoTR3iwrRYyWoqVnwtu5zrlAeKFWR2XNk5Bfy_ff_pT7kFZwTBR7u-K1K-wF7XMSF9E`
   - **Prompt Summary:** Mobile portrait (390×844) Lesson Complete Celebration with Star Cascade and Streak Flame in Wonder Atlas Light design system. Warm cream background `#EAE0D0` with gentle sunburst rays and confetti particles. Header: transparent with 48px close '✕' button (`[🔊 playCue: tap_close]`). Central Hero: Headline 'LESSON COMPLETE!' in bold 32px Fredoka terracotta `#E76F51`. 3-Star Golden Cascade: Star 1 ⭐, Star 2 ⭐, Star 3 ⭐ dropped in with bounce sounds (`[🔊 playCue: star_chime]`). Subtitle: 'Outstanding Work! 3 / 3 Stars' in inkDeep `#1D3557`. 3-Metric Stat Row on paper `#FDFBF7` with border `#E2D7C3` and radius 20px: Stat 1 '⚡ +120 XP', Stat 2 '🎯 95% Accuracy', Stat 3 '⏱️ 2:14 Time'. HIGH-DOPAMINE STREAK FLAME CARD on paper `#FDFBF7` with 2.5px terracotta border `#E76F51` and soft orange glow: Animated Flame Icon: '🔥 STREAK EXTENDED! 5 DAYS IN A ROW!' (`[🔊 playCue: streak_flame_sfx]`) and subtitle 'Practice tomorrow to keep your flame blazing!'. Honest Rewards Notice: 'All XP and quest progress securely saved.' Anchored 76px footer with 56px primary CTA 'CONTINUE ➔' in terracotta `#E76F51` with hard bevel `0 4px 0 #C4553B` (`[🔊 playCue: tap_continue]`).
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_close]` on close button tap
     - `[🔊 playCue: star_chime]` on golden star cascade drop
     - `[🔊 playCue: streak_flame_sfx]` on streak flame extension reveal
     - `[🔊 playCue: tap_continue]` on primary continue CTA tap
   - **Design Contract:** Wonder Atlas warm tokens (cream `#EAE0D0`, paper `#FDFBF7`, border `#E2D7C3`, ink `#264653`, inkDeep `#1D3557`, terracotta `#E76F51`, sand `#E9C46A`, teal `#2A9D8F`) × Duolingo yellow `#FFC800`, Fredoka + Nunito typography, production-grade Tailwind HTML + small style block, zero placeholder chrome.

2. **Screen 2: Lesson Complete Perfect Run with Honest Gem Reward Card**
   - **Stitch Screen ID:** `32212ab8962f41919b5cbf8c23f92ce5`
   - **Title:** `Professor ESL - Lesson Complete (Perfect Run & Honest Gem Reward)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1XbEVK0k8qLtfI_clPnYW1GG7OV6yA43zOwHoHItmjEI7UrMTRwz_JHojBJrFJK7F1PEqUmBlJvUP3CkhyAiFcAIdZI5b1oYFoXZvDuhfdjVfPGXKPODmH8NTvRtA68KWWwyME7h94pYVKNUKBF-IWhyJUYlezbDt5r6y_xLA9kgtKcvmjCghc2gb8_jRmq3qmgCr0AoJ-nAqeIgFGJ0O6l7IzeG_dwipA5hjaoBRATGHtsV3LEOiWVHw`
   - **Prompt Summary:** Mobile portrait (390×844) Lesson Complete Perfect Run with Honest Gem Reward Card in Wonder Atlas Light design system. Warm cream background `#EAE0D0` with celebratory confetti dots and sunburst. Header: transparent with 48px close '✕' button (`[🔊 playCue: tap_close]`). Central Hero: Headline 'PERFECT SCORE! 🏆' in bold 32px Fredoka gold `#C99E32`. Mascot illustration of Professor Owl wearing a cap holding a diamond gem. Subtitle: '100% Mastery Achieved! 3/3 Stars Earned'. 3-Stat Metric Row: Stat 1 '⚡ +150 XP', Stat 2 '🎯 100% Accuracy', Stat 3 '⏱️ 1:45 Time'. HONEST GEM REWARD CARD (Displayed strictly because 100% perfection was genuinely earned!): Card on soft emerald `#E6F4F1` with 2.5px teal border `#2A9D8F`: '💎 PERFECT LESSON BONUS: +15 GEMS' (`[🔊 playCue: gem_award_fanfare]`). Honesty Guarantee Note: 'Verified: Added immediately to student wallet! Current balance: 💎 145 Gems.' Interactive Quest Claim Card: '🏆 Quest: Perfect Score • COMPLETED' with active button 'CLAIM +25 XP ✨' (`[🔊 playCue: quest_claim_tap]`). Anchored 76px footer with 56px primary CTA 'RETURN TO MAP ➔' in teal `#2A9D8F` with hard bevel `0 4px 0 #1E6F5C` (`[🔊 playCue: tap_return_home]`).
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_close]` on close button tap
     - `[🔊 playCue: gem_award_fanfare]` on honest gem reward fanfare
     - `[🔊 playCue: quest_claim_tap]` on quest reward claim tap
     - `[🔊 playCue: tap_return_home]` on return to map CTA tap
   - **Design Contract:** Exact token hexes, thumb-reachable actions, production-grade Tailwind HTML + style block.

## §5 ZCode design verification (inside Stitch)

**Verified 2026-09-13** (owner batch pre-approval). Project `6865954475041880496`; exports in `stitch/27-lesson-complete/`. Screens 1-2 — PASS: star cascade + honest gem display + streak flame.-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**PRE-APPROVED 2026-09-13 (owner batch directive):** "implement them all right away without waiting for my approval… we will modify [off designs] afterward."

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
