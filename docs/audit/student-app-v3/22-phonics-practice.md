# Phonics Practice — v3 Quality Audit (`PRACTICE: /student/phonics`)
> **Current status:** deployed

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

- **Surface / route:** `/student/phonics` (Practice Arena) — `apps/student/PhonicsPhlyer.tsx` (88 ln) — thin wrapper
- **Exercise types consumed:** pool_items MINIMAL_PAIR_SWIPE of the ACTIVE unit (state.activeUnit)
- **Data sources:** direct pool select; empty state explains minimal pairs come from enrichment
- **Scoring & data writes:** all via ExerciseRunner (file 12: FSRS/♥/XP per item; LESSON_COMPLETE XP + heart restore at finish)
- **Reachability:** Practice Arena → Phonics tile. NOTE: depends on activeUnit being set (needs a unit opened from the map first — empty-state covers it)
- **Theme today:** slate-50 wrapper around the battery shell

## §1 How the game works today

*(Screenshots pending.)*

PhonicsPhlyer (`PhonicsPhlyer.tsx`) is a thin wrapper: loads the ACTIVE unit's MINIMAL_PAIR_SWIPE pool items (:27-41) and runs them through ExerciseRunner with the title "Phonics — Minimal Pairs" (:83). Empty state explains minimal pairs are generated during enrichment (:62-77). All writes are the runner's (FSRS/hearts/XP).

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/PhonicsPhlyer.tsx`.

- **F1 · P2 — Depends on a previously-opened unit with no picker.** `state.activeUnit` (:17-18) is whatever the kid last opened on the map — a fresh app launch straight to Practice → Phonics hits the "open a unit from the map" empty state (:70-73). Inconsistent with files 20/21 which have pickers; a kid alone doesn't know the invisible precondition.
- **F2 · P3 — No due-count / progress signal on entry** (compare SRS's badge on the Practice menu).
- **F3 · P3 — Wrapper adds no phonics identity** — title chip only; the experience is 17's component repeated (see 17's findings).

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P1 — Acoustic discrimination mislabeled with a Microphone icon.**
  - *Evidence:* `PhonicsPhlyer.tsx:65-67` renders a large `Mic` icon in the empty state (`<Mic size={40} className="text-duo-blue" />`) and the practice arena uses mic iconography. MinimalPairSwipe is an acoustic *listening and auditory discrimination* exercise, not speech recording or speech recognition. Displaying a microphone triggers immediate child anxiety ("Do I have to speak? My mic doesn't work! My environment is noisy!") and sets incorrect cognitive expectations.
  - *Recommendation:* Replace `Mic` with acoustic perception iconography (`Headphones`, `Ear`, or `Volume2`). Introduce dedicated "Phonics Sound Lab" visual branding with soundwave ripples and phoneme tag chips (e.g. `[ /l/ vs /r/ ]`).
- **F2 · P2 — Barren slate-50 wrapper with zero sonic identity.**
  - *Evidence:* `PhonicsPhlyer.tsx:82` renders a bare `<div className="h-full bg-slate-50">` passing through directly to `ExerciseRunner`. There is no visual warmth, sound-wave theme, or gamified frame.
  - *Recommendation:* Wrap the phonics runner in a vibrant "Sound Lab" container with friendly sky/amber accent borders, clear speaker indicators, and playful sound-bubble visual motifs matching the Wonder Atlas / Duolingo hybrid aesthetic.

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P1 — Invisible precondition trap: dead-end empty state on cold entry.**
  - *Evidence:* `PhonicsPhlyer.tsx:18, 62-76` (`F1`). If a child opens Practice Arena directly from the bottom tab after launching the app, `state.activeUnit` is empty or whatever was touched last. The user gets trapped in an empty state: "Open a unit from the map to practise its phonics minimal pairs" with a single "Back" button. The child has no way to choose a unit from here, and the button sends them back to Practice rather than guiding them to the map.
  - *Recommendation:* Add an explicit Unit Selector dropdown/carousel (identical to `FastVocabSolo` and `SpellingBeeSolo`), defaulting to the highest unlocked unit that contains phonics items. If no unit has been played yet, change the empty state CTA from a dead "Back" button to a primary action: `[Explore Map & Unlock Phonics]` which navigates directly to the Home Map.
- **F4 · P2 — Practice Arena tile lacks item-count / availability badge.**
  - *Evidence:* `PhonicsPhlyer.tsx:86` (`F2`). In `PracticeMenu.tsx`, SRS displays a clear due-count badge, while Phonics displays no badge. The child taps into Phonics blindly, only to discover there may be 0 items.
  - *Recommendation:* Compute and display an available pair count badge (e.g. "8 pairs ready") on the Practice Menu Phonics card so children know there is real content waiting before they tap.

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P1 — Single-unit scoping results in micro-sessions that fail to build phonemic mastery.**
  - *Evidence:* `PhonicsPhlyer.tsx:31-35` queries only `unit_id = unitId`. Standard ESL curriculum units typically introduce only 1 or 2 minimal pairs (e.g. *ship / sheep*). A practice session with only 2 items lasts under 20 seconds and terminates, giving the learner virtually no auditory consolidation.
  - *Recommendation:* Introduce an "All Mastered Phonics" practice mode option that pools minimal pairs across all unlocked units up to a standard 8–10 item session. Allow children to drill critical L1-confusable contrasts (/l/ vs /r/, /s/ vs /θ/, /b/ vs /v/, short vs long vowels) in comprehensive succession.
- **F6 · P2 — Missing target phoneme pre-flight contrast header.**
  - *Evidence:* `PhonicsPhlyer.tsx:83` launches `ExerciseRunner` with generic title "Phonics — Minimal Pairs". The child is immediately thrown into swiping words without knowing what sound contrast is being trained.
  - *Recommendation:* Display a prominent contrast badge on the screen header or pre-exercise splash (e.g., `Focus Sounds: /iː/ vs /ɪ/ • "sheep" vs "ship"`). For 6–12 ESL learners, explicit phonetic awareness drastically accelerates acoustic discrimination.

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F7 · P2 — Premature heart depletion on acoustic perception exploration.**
  - *Evidence:* `PhonicsPhlyer.tsx:83` routes through `ExerciseRunner`, which treats every wrong swipe as a productive heart-costing failure. In phonemic ear-training, subtle acoustic discrimination requires exploratory listening; penalizing an initial subtle distinction with heart loss discourages kids from attempting tricky vowel distinctions.
  - *Recommendation:* Allow an acoustic retry with visual phoneme highlight before docking a heart, or implement a "Hear Both" contrast audio comparison immediately upon a misidentification so the child learns the acoustic difference instantly.

### 4.e Top-5 prioritized recommendations
1. **Add Unit Selector & Cross-Unit Practice Pool (P1):** Provide a unit picker in PhonicsPhlyer and an "All Unlocked Sounds" option to eliminate empty-state dead ends and provide full 8–10 item drill sessions.
2. **Fix Iconography & Branding (P1):** Replace the misleading `Mic` icon with `Headphones` / `Ear` / `Volume2` acoustic perception motifs to eliminate speaking anxiety.
3. **Smart Empty State with Actionable Map CTA (P1):** If no units have phonics items, provide an active `[Go to Map]` button rather than a passive `Back` button.
4. **Phoneme Contrast Pre-flight Pill (P2):** Display the active sound contrast (e.g. `/iː/ vs /ɪ/`) so learners know what subtle acoustic features to listen for.
5. **Acoustic Feedback on Misidentification (P2):** When a child chooses the wrong word in the pair, play both sounds back-to-back with highlighted phonemes so the error becomes an instant learning moment.

### 4.f Stitch design log (AG fills as it generates)

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Game Subsystem:** Phonics Practice Acoustic Lab (`22-phonics-practice.md`)
- **Generation Date:** 2026-09-13
- **Submission Status:** 2 screens submitted and successfully materialized in Stitch datastore (HTTP 200 / Exit code 0).
- **Quota Discipline:** 2 screens generated (max 2 per game).

#### Screens Generated & Brief Summaries:

1. **Screen 1: Phonics Sound Lab Unit Context Selector Lobby**
   - **Stitch Screen ID:** `9afd7ff634ec481aa4ea977be9076c02`
   - **Title:** `Professor ESL - Phonics Sound Lab Lobby (390x844)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1X5DT0Sq3SRe9qmtMXQ_aywStFWW69G3eP-AGdBOCPrz-Ff2bzNUFbubMnOCUdaf_TuIJEu7QSyg3m2Jxlxr8YEpzvZLLB7DMJxLoBBXNwcWO-nEGqqrpmouj7OcwRH07gba9cN_nyXem0n5IWEfg4O8TYZtDGJjJ0hBrMqrpTLWVTRG6BQ4-zpMC3bGlaYlo7xL6yUGNt05iYNNiasJwZpheWp4H3G70aU5JbfWcIxFboMapMI2dxPKfo`
   - **Prompt Summary:** Mobile portrait (390×844) Phonics Sound Lab lobby with unit context selector solving cold-launch empty state in Wonder Atlas Light design system. Universal 64px header on paper `#FDFBF7` with 48px back button (`[🔊 playCue: tap_back]`), title 'Phonics Sound Lab' in bold 20px Fredoka inkDeep `#1D3557`, and acoustic headphones icon (replacing misleading mic!). Active Unit Context Banner on paper `#FDFBF7` with 2.5px teal border `#2A9D8F`: 'Active Unit: Unit 3 - City & Transport' with readiness badge '🎧 8 Sound Pairs Ready' and one-tap 'Switch Unit ▾' button with options for 'Unit 2', 'Unit 1', and 'All Unlocked Sounds (Mix)'. Phonemic Focus Preview Card on mist `#F7F3E8`: Phoneme contrast chips `[ /iː/ vs /ɪ/ ]` and `[ /l/ vs /r/ ]` with audio sample FABs 'Hear /iː/ (sheep)' vs 'Hear /ɪ/ (ship)' (`[🔊 playCue: phoneme_sample]`). Pedagogical reassurance chip: 'Ear Training Focus: Listen carefully to subtle vowels. Errors do not cost hearts.' Anchored 76px footer with 56px primary CTA 'START SOUND LAB (8 PAIRS) 🎧' in teal `#2A9D8F` with hard bevel `0 4px 0 #1E6F5C` (`[🔊 playCue: start_game]`).
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_back]` on header back button tap
     - `[🔊 playCue: phoneme_sample]` on phoneme contrast preview audio FAB
     - `[🔊 playCue: start_game]` on primary CTA launch tap
   - **Design Contract:** Wonder Atlas warm tokens (cream `#EAE0D0`, paper `#FDFBF7`, mist `#F7F3E8`, border `#E2D7C3`, ink `#264653`, inkDeep `#1D3557`, teal `#2A9D8F`, sand `#E9C46A`) × Duolingo blue `#1CB0F6`, Fredoka + Nunito typography, production-grade Tailwind HTML + small style block, zero placeholder chrome.

2. **Screen 2: Phonics Minimal-Pair Acoustic Discrimination Play**
   - **Stitch Screen ID:** `000733554d284b03b6fd8e3571dd3fd5`
   - **Title:** `Professor ESL - Phonics Minimal Pair Acoustic Play (sheep vs ship)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1Uzyq6VyIVEaxx6_NNQCAX17Mvxym3zCyMgjbrUN16Mbyvcppo2goRbkHZdcLBdf3JfJqUuFbivdfc4TCLHJkhcGxyKFsSOw9ttGZ_ZyLaX7lQgmJwj5n8VfTw4fppI9v-QCLDZroLyRpl65XsOTuWla2vKk-vSs9yCbjD5HHoyzaybghhNEjgQ9sDo2wMQtETywLqWI8P3_pe28cLrwlVJaFW8UHqme-2BUzg43NEY5uhXLPhv39w5vZg`
   - **Prompt Summary:** Mobile portrait (390×844) Phonics Practice minimal-pair acoustic play screen in Wonder Atlas Light design system. Universal 64px header on paper `#FDFBF7` with 48px exit button (`[🔊 playCue: tap_exit]`), 8-segment progress tracker (Pair 3/8 active in Duolingo blue `#1CB0F6`), and active unit chip 'Unit 3: City • Phonics Lab'. Focus Phoneme Contrast HUD: `🎧 Minimal Pair: /iː/ vs /ɪ/` with interactive 'Hear Contrast 🔊' audio chip (`[🔊 playCue: hear_contrast]`). Center stage: Large Prominent Audio Target Card on warm paper `#FDFBF7` with 2.5px border `#E2D7C3`: Big 68px circular Audio Replay FAB in sky blue `#1CB0F6` with hard bevel `0 5px 0 #0284C7` and animated acoustic soundwave ripples (`[🔊 playCue: target_audio]`). Prompt text: 'Tap the word you hear!' with supportive Chinese subtitle '点击你听到的单词'. Two Large Tactile Minimal Pair Choice Cards (min 110px height each, 3D bevel `0 5px 0 #E2D7C3`): Card A: 'sheep' with IPA `[ʃiːp]` and vector illustration of a friendly sheep in paper `#FDFBF7` (`[🔊 playCue: option_select]`). Card B: 'ship' with IPA `[ʃɪp]` and vector illustration of a cargo ship in paper `#FDFBF7` (`[🔊 playCue: option_select]`). Formative Ear-Training Safeguard Pill: '🛡️ Formative Practice: Acoustic retries cost no hearts! Ear training builds listening fluency.' Anchored 76px footer with assistance button 'Slow Audio (0.8x) 🐢' in sand `#E9C46A` and disabled CTA 'SELECT YOUR ANSWER ➔'.
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header exit tap
     - `[🔊 playCue: hear_contrast]` on audio contrast chip tap
     - `[🔊 playCue: target_audio]` on central acoustic replay FAB tap
     - `[🔊 playCue: option_select]` on minimal pair card tap
   - **Design Contract:** Exact token hexes, thumb-reachable actions, production-grade Tailwind HTML + style block.

## §5 ZCode design verification (inside Stitch)

**Verified 2026-09-13** (owner batch pre-approval). Project `6865954475041880496`; exports in `stitch/22-phonics-practice/`. Screens 1-2 — PASS: unit-context header/picker solving cold-launch.-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**PRE-APPROVED 2026-09-13 (owner batch directive):** "implement them all right away without waiting for my approval… we will modify [off designs] afterward."

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
