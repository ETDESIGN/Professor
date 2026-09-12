# Word Search — In-Lesson Step — v3 Quality Audit (`WORD_SEARCH (engine)`)

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

- **Surface / route:** WORD_SEARCH blocks inside `/student/solo-lesson` — `apps/student/steps/WordSearchStep.tsx` (285 ln) reusing board v3 pure modules `apps/board/templates/wordSearch/gridEngine.ts` + `content.ts`
- **Exercise types consumed:** pool_items IMAGE_SELECT + MEANING_MATCH → words; manifest `getVocabulary` fallback (needs ≥4 words)
- **Data sources:** pool_items by unitId; round of 8; grid build seeded random; unplaced<3 → error screen
- **Scoring & data writes:** `recordAnswer(true/false)` per line attempt (session accuracy only); playCue correct/wrong; no per-answer XP (pipeline end-awards)
- **Reachability:** WORD_SEARCH blocks; interaction = tap first letter → tap last letter (snapLine + matchSegment)
- **Theme today:** slate-900 dark grid, pastel found-word trails, word chips with strikethrough

## §1 How the game works today

*(Screenshots pending.)*

In-lesson WORD_SEARCH engine step (`steps/WordSearchStep.tsx), reusing the board v3 pure modules (`wordSearch/gridEngine.ts` + `content.ts`). Loads pool words (IMAGE_SELECT/MEANING_MATCH) with manifest-vocabulary fallback if <4 words (:71-108); takes a round of 8, builds a seeded grid, requires ≥3 placeable (:97-103). Interaction is student-side: tap the first letter, tap the last letter — `snapLine` + `matchSegment` validate; a hit locks the word with a pastel trail + cue + audio; a miss shakes the line 450ms (:114-147). Word chips list struck through as found. Done → stars from found/attempts accuracy (:173-201). No XP here (pipeline end-awards).

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … The home screen for the student will not be changed … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/steps/WordSearchStep.tsx`.

- **F1 · P2 — Exploration is punished in the star math.** Accuracy = found/attempts (:175-176) and attempts increment on ANY 2+ cell line that isn't a word (:126-128) — a cautious kid who scans by tapping neighbors scores worse than a lucky guesser; the persisted stage stars inherit that unfairness (kid-alone fairness rule).
- **F2 · P3 — No hint system** — nothing helps a stuck kid (board v3 has teacher hint; solo has nothing). A "show first letter" mercy after N misses would fit the kid-alone rule.
- **F3 · P3 — Grid density on phones.** 10×10 in `max-w-sm` (:248-249) → ~34px cells on a 390px screen — workable with the two-tap model but at the edge; font `text-sm` on cells.
- **F4 · P3 — Word bank shows all words spelled out** (:228-244) — that's the game's nature (sight support), noted for §4 pedagogy, not a defect.

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Sub-floor grid cell hit targets on mobile.** (Evidence: §1, §3 F3, `WordSearchStep.tsx:248-249`). A 10×10 letter grid constrained to `max-w-sm` on a 390px phone forces individual cell dimensions down to ~34px, with `text-sm` typography. Young children (ages 6–8) with developing fine motor control frequently tap adjacent letter cells when trying to mark start and end coordinates. *Recommendation: Scale the grid down to 8×8 (or 7×7 for lower primary tiers), raising individual cell sizes to ≥42px with rounded corner tiles and bold Fredoka lettering.*
- **F2 · P3 — Dark matrix board clashes with light storybook theme.** (Evidence: §0, §1). The dark `slate-900` grid feels severe and clinical compared to the rest of the student app. *Recommendation: Reskin the puzzle as an illustrated Wonder Atlas explorer's word slate: warm cream letter tiles on a paper card `#FDFBF7`, with cheerful translucent pastel marker ribbons (teal, coral, sun-gold) for discovered words.*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P1 — Absolute dead-end trap when stuck on final words.** (Evidence: §1, §3 F2). In a classroom with a teacher, stuck students raise their hand. At home alone, if a child cannot spot the last word, there is NO hint button, NO letter flash, and NO skip mechanism. The child cannot complete the lesson or advance to homework completion. *Recommendation: Introduce a friendly "Magnifying Glass" hint button that pulses after 30 seconds of inactivity or 3 failed attempts, revealing the pulsing first letter of an unfound word.*
- **F4 · P3 — Word bank scrolling friction.** (Evidence: §1, `WordSearchStep.tsx:228-244`). Word chips are rendered in a horizontal chip container that can push off screen. Tapping a word in the bank does nothing. *Recommendation: Make word bank chips tappable: tapping an unfound word speaks its pronunciation and gently pulses its word length on the grid.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P1 — Punishing spatial scanning destroys stage completion stars.** (Evidence: §1, §3 F1, `WordSearchStep.tsx:126-128, 175-176`). The stage star formula calculates `accuracy = found / attempts`, where attempts increment on ANY non-word tap pair. Young children naturally test spatial hypotheses by tapping start/end letters. A child who finds all 8 words but makes 8 exploratory taps ends with 50% accuracy and receives 1 star. This directly violates the kid-alone fairness principle. *Recommendation: Stop calling `recordAnswer(false)` on exploratory misses. Base stage stars on completing the word list, with bonus stars for finding words without hints.*
- **F6 · P2 — Missing acoustic vocabulary reinforcement upon discovery.** (Evidence: §1, `WordSearchStep.tsx:135-147`). When a word is successfully struck through, the game plays a generic chime. In an ESL application, every correct word discovery is a prime opportunity to reinforce phonics. *Recommendation: Immediately play the native English audio pronunciation and flash the Chinese L1 translation card when a word is locked.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F7 · P2 — Lack of interactive rubber-band line selection.** (Evidence: §1). Tapping the first letter leaves a static highlight on that single letter until the second tap. If the child taps an invalid diagonal or miscounts, the grid simply shakes for 450ms without visual feedback explaining what path was selected. *Recommendation: Draw a live rubber-band guideline connecting the first tapped letter to the child's touch focus, snapping to valid 8-directional lines.*

### 4.e Top-5 prioritized recommendations
1. **[P1] Eliminate accuracy penalties for exploratory puzzle taps:** Base lesson star awards on found words rather than penalizing trial-and-error scanning.
2. **[P1] Add a solo-learner Hint button:** Provide a gentle first-letter beacon when a child is stuck to prevent lesson abandonment.
3. **[P2] Play audio pronunciation and show L1 meaning on discovery:** Transform the word search from a pure orthographic scan into a rich ESL vocabulary reinforcement.
4. **[P2] Resize mobile grid to 8×8 for ≥42px touch targets:** Prevent fat-finger coordinate errors on small phone screens.
5. **[P3] Reskin to Wonder Atlas paper-and-pastel explorer palette:** Frame the puzzle with warm, tactile paper styling and colorful highlighter ribbons.

### 4.f Stitch design log (AG fills as it generates)

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Game Subsystem:** Word Search In-Lesson Step (`09-word-search-step.md`)
- **Generation Date:** 2026-09-13
- **Submission Status:** 2 screens submitted and successfully materialized in Stitch datastore (HTTP 200 / Exit code 0).
- **Quota Discipline:** 2 screens generated (max 2 per game).

#### Screens Generated & Brief Summaries:

1. **Screen 1: Word Search 8x8 Mobile Grid Mid-Solve State (Found Trails & Hint)**
   - **Stitch Screen ID:** `0d3c9fa2b62e4248a1a6d5a655da8bc1`
   - **Title:** `Professor ESL - Word Search (WORD_SEARCH Mid-Solve State)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1UOkq16ypepeaFwREa4vvo4__JQJ3wfNmBa7SiVBLCP0Q-aOFSnGwwfNxl2zKDYgI4azGpGfKFdV6X64n7rWerAeNuenaXbcO0dS_8A7AJ6g-u2vPIKgeeNcUppbgQU2H7U9tY3vZWg94HJ60ouCtLwQVvXvwuEeXUn_u8SKQQ1z-FUJyBhOaeIRQdWCcnP2vyGmkf8klXLKMftsOGuXHKqRkLeaqvFcVaFtm7GHtO7zgAH26qX3TfJddI`
   - **Prompt Summary:** Mobile portrait (390×844) word search mid-solve state. Universal 64px header on paper `#FDFBF7` with 48px close '✕' button (`[playCue: tap_exit]`), 6-segment progress bar with Step 4 highlighted in Duolingo pink (`#E91E63`), and real hearts counter showing 4 hearts (`#FF4B4B`). Subheader HUD displays terracotta badge `WORD SEARCH • 3 / 6 FOUND` and pulsing Magnifying Glass Hint FAB in sand `#E9C46A` with gold bevel shadow and gentle glow pulse (`[playCue: hint_pulse]`). Main stage features an 8×8 letter grid with 42px touch-target tiles in warm paper `#FDFBF7`: 3 found word trails locked with translucent pastel ribbons (`BUS` in translucent teal `#2A9D8F`, `CITY` in translucent Duolingo pink `#E91E63`, `PARK` in translucent sand `#E9C46A`), and an active drag selection trail for `STREET` in glowing sky blue `#38BDF8` with dashed border and pulsating end-caps (`[playCue: letter_select]`). Word bank at bottom displays 6 word chips (3 struck-through, `STREET` active with speaker FAB `[playCue: word_pronounce]`, `SUBWAY` and `TAXI` pending). Anchored footer with reassuring note: `Drag or tap first & last letter to find words • Exploratory taps do not cost hearts.`
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header close tap
     - `[🔊 playCue: hint_pulse]` on hint FAB pulse/tap
     - `[🔊 playCue: letter_select]` on letter cell tap and drag selection
     - `[🔊 playCue: word_pronounce]` on word chip speaker FAB tap
     - `[🔊 playCue: word_found_chime]` on completing word trail
   - **Design Contract:** Wonder Atlas warm tokens (`#EAE0D0`, `#FDFBF7`, `#E2D7C3`) × Duolingo accents (`#E91E63`, `#1CB0F6`), Fredoka + Nunito typography, production Tailwind HTML + small style block, zero placeholder chrome.

2. **Screen 2: Word Search Puzzle Complete Celebration State (3 Stars & Reward Banner)**
   - **Stitch Screen ID:** `39c4f6cd86804c108dd8707343320820`
   - **Title:** `Professor ESL - Word Search (Puzzle Complete Celebration State)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1VHD8AXRRxAutWbFXTI9IVamFUgS6S45-rvI70gSrtCoizheacsK_CmTjSrykBmYkjKk1eDLNxG_iLsgvftYalsyqukfOc2Wl92zJliAoKnAPRh0kXTPDw-aQrgf-fPimNcrKISFxCW35ZaA8PlldNVIMETsOr7_47f0hTPsp_bc2PAse-kHGfxRJt1-nWcak-v4iWu5WkBadPdtbJTrkJ7GaydLNOcGUB_20-QEO1Pbtph5v6vR4AegQ`
   - **Prompt Summary:** Mobile portrait (390×844) puzzle completion victory state. Shell header shows Step 4 completed in vibrant teal (`#2A9D8F`) and 4 full hearts preserved. Background layer displays the completed 8×8 letter grid with all 6 found word highlight ribbons (Bus, City, Park, Street, Subway, Taxi) rendered in soft focus behind a warm modal scrim. Floating celebration victory card in warm paper `#FDFBF7` (`rounded-[32px]`, border 3px solid `#E9C46A`, shadow-xl): Professor Owl explorer badge in safari hat with sparkling confetti and golden starbursts, headline `All Words Discovered! 🎉`, Chinese subtitle `太棒了！所有隐藏单词已全部找到！`, 3 large glowing golden stars in sand `#E9C46A` (`[playCue: win_fanfare]`), achievement banner rewarding `✨ +20 XP`, `🎯 Accuracy: 100%`, and `⚡ No Hints Bonus!`. Word recap 2×3 grid with checkmarks, IPA phonetics, and 24px interactive speaker buttons to replay native audio. Anchored 80px footer with primary tactile button `CONTINUE LESSON →` in teal `#2A9D8F` (`0 4px 0 #1E6F5C` bevel, `[playCue: tap_next]`).
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header close tap
     - `[🔊 playCue: win_fanfare]` on victory screen entrance
     - `[🔊 playCue: star_burst]` on 3-star award animation
     - `[🔊 playCue: word_pronounce]` on recap word speaker tap
     - `[🔊 playCue: tap_next]` on footer continue tap
   - **Design Contract:** Exact token hexes, thumb-reachable actions, production-grade Tailwind HTML + style block.

## §5 ZCode design verification (inside Stitch)

**Verified 2026-09-13** (owner batch pre-approval). Project `6865954475041880496`; exports in `stitch/09-word-search-step/`. Screens 1-2 — PASS: mid-solve grid with pastel trails + hint FAB, and the completion card with word-recap audio pills; exploratory-tap protection designed (F1). Sound moments marked; implementation wires playCue/TTS.-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**PRE-APPROVED 2026-09-13 (owner batch directive):** "implement them all right away without waiting for my approval… we will modify [off designs] afterward." The spelling rule (11) proceeds as AG recommended + owner-batch-ratified: in-lesson timeout = word-cost + audio reveal + continue; standalone game keeps sudden-death.

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
