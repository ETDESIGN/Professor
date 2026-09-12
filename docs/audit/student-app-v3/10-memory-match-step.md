# Memory Match — In-Lesson Step — v3 Quality Audit (`MEMORY_LAB (engine)`)

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

- **Surface / route:** MEMORY_LAB blocks inside `/student/solo-lesson` — `apps/student/steps/MemoryMatchStep.tsx` (138 ln) + `steps/memoryPairs.ts` (pure, tested) + `FlashMatch.tsx` in embedded mode (file 29 notes its standalone shell is dead)
- **Exercise types consumed:** none — pairs built from manifest `getVocabulary` (word ↔ L1 meaning), ≥2 pairs required
- **Data sources:** active unit manifest only (no pool query)
- **Scoring & data writes:** on completion `recordAnswer(true)` × pairs.length (ONE correct per pair — documented simplification: FlashMatch reports completion only, mismatches internal); no XP here (pipeline end-awards)
- **Reachability:** MEMORY_LAB blocks; tap-left-tap-right matching with 800ms error shake
- **Theme today:** slate-50 light; FlashMatch columns cyan selected / slate matched / red error

## §1 How the game works today

*(Screenshots pending.)*

In-lesson MEMORY_LAB step (`steps/MemoryMatchStep.tsx`). Builds word↔L1-meaning pairs from the unit manifest via `buildMemoryPairs` (pure, capped at 6, drops words without translation/definition — memoryPairs.ts:19-47) and embeds the legacy `FlashMatch` engine in embedded mode: two shuffled columns, tap one from each; match → both lock grey; mismatch → 800ms red shake then reset (FlashMatch.tsx:45-66). On completion the step fires `recordAnswer(true)` once per pair — the documented simplification (mismatches are internal) — plays a cue, shows "All Matched!" with 3 stars + Play again/Continue (:50-56, :82-108). No XP here (pipeline).

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … The home screen for the student will not be changed … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs: `apps/student/steps/MemoryMatchStep.tsx`, `steps/memoryPairs.ts`, `apps/student/FlashMatch.tsx`.

- **F1 · P2 — Scoring simplification inflates stage stars.** `recordAnswer(true)` × pairs regardless of how many mismatches happened (:54) — a kid who brute-forces every pair scores the same 100% session accuracy as a perfect first-pass run; those answers feed `starsForAccuracy` → persisted node stars. Documented, but it's wrong-data-adjacent (the §0 prelude's worst class).
- **F2 · P2 — Text-only pairs waste the multimodal unit data.** Pairs are English word ↔ Chinese text (memoryPairs.ts:31-32); `audioUrl` is collected (:39) but FlashMatch never plays it, and images are unused — on a phone this is a wall of small text where word↔image would be both more kid-friendly and more discriminative (see board Memory Lab v3's cross-modal alternation).
- **F3 · P3 — Six pairs = 12 tiles in two vertical columns** (FlashMatch max-w-md layout, :135-175) — on a phone the columns can exceed the viewport and scroll mid-game; no compact grid mode.
- **F4 · P3 — No audio feedback at all** — no match chime, no word pronunciation on match (the engine has none; the step adds one cue at completion only).
- **F5 · P3 — Matched pairs fade to opacity-50 with no reward moment** (:111) — matches feel like removal, not achievement (compare board v3's celebratory locks).

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — 12-tile vertical layout induces view scrolling and breaks spatial memory.** (Evidence: §1, §3 F3, `FlashMatch.tsx:135-175`). In embedded mode, 6 pairs render as two vertical columns of 6 tall cards each. On a 390px mobile viewport, the 12 tiles exceed 650px in height, forcing the screen to scroll vertically. Spatial memory games rely critically on a stable visual field; forcing a 7-year-old to scroll up and down to find pairs fundamentally breaks the mechanic. *Recommendation: Cap mobile rounds to 4 pairs (8 tiles total) arranged in a neat 2×4 or 4×2 grid that fits 100% within the mobile viewport without scrolling.*
- **F2 · P3 — Depressing disabled appearance for matched tiles.** (Evidence: §3 F5, `FlashMatch.tsx:111`). When a pair matches, both tiles simply fade to `opacity-50` with slate borders. Matching feels like an erasure rather than an achievement. *Recommendation: Style matched tiles with a vibrant golden/teal frame, a lively bounce animation, and a clear celebratory checkmark.*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P2 — 800ms touch lockout on mismatch feels unresponsive.** (Evidence: §1, `FlashMatch.tsx:45-66`). When an incorrect match is tapped, both cards shake red for 800ms while all screen touches are strictly blocked. In children's rapid play, this brief freeze is interpreted as device lag, causing repeated frustrated tapping. *Recommendation: Reduce mismatch shake to 400ms and allow immediate selection of a new card without hard input locks.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F4 · P1 — Complete acoustic silence during vocabulary pairing.** (Evidence: §1, §3 F4, `MemoryMatchStep.tsx:50-56`, `steps/memoryPairs.ts:39`). Although `audioUrl` is extracted for every vocabulary item in `memoryPairs.ts`, FlashMatch never invokes audio playback! A child matches an English word to Chinese in total silence without hearing the target pronunciation. In solo EFL study, this squanders a crucial learning touchpoint. *Recommendation: Instantly trigger native audio pronunciation playback whenever an English word card is tapped or matched.*
- **F5 · P2 — Monochromatic text-only cards ignore visual memory.** (Evidence: §1, §3 F2, `steps/memoryPairs.ts:31-32`). Pairs are strictly English text ↔ Chinese text. Early primary school learners (ages 6–8) are still developing Chinese reading fluency. Matching text to text turns a fun game into a dry translation exam. *Recommendation: Support image↔word pairs utilizing the unit manifest illustrations, providing multimodal visual scaffolding.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F6 · P2 — Synthetic 100% accuracy corrupts stage star integrity.** (Evidence: §0, §1, §3 F1, `MemoryMatchStep.tsx:54`). Upon round completion, the step invokes `recordAnswer(true)` once for every pair, regardless of how many failed attempts or mismatches occurred. A child who randomly brute-forces 20 wrong taps receives a perfect 100% session score and 3 stars. This trivializes the gamification economy and distorts student progress tracking. *Recommendation: Compute honest session accuracy based on match efficiency (e.g. `perfect_matches / total_attempts` or first-try match ratio), rewarding true concentration with 3 stars while giving 1–2 stars for persistent trial-and-error.*

### 4.e Top-5 prioritized recommendations
1. **[P1] Play native audio pronunciation on every card tap and match:** Restore acoustic language modeling to what was previously a completely silent game.
2. **[P1] Eliminate vertical scrolling by capping mobile rounds to 4 pairs (8 tiles):** Ensure all cards remain simultaneously visible within the phone viewport.
3. **[P2] Incorporate unit illustrations for image↔word matching:** Allow young learners to connect English words directly to concept pictures rather than raw Chinese text.
4. **[P2] Report honest match efficiency instead of synthetic 100% accuracy:** Calculate stage stars from actual attempt efficiency rather than unconditionally writing all-true answers.
5. **[P3] Upgrade matched card states to celebratory Wonder Atlas tokens:** Replace `opacity-50` grey-outs with joyful golden borders, chimes, and checkmark badges.

### 4.f Stitch design log (AG fills as it generates)

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Game Subsystem:** Memory Match In-Lesson Step (`10-memory-match-step.md`)
- **Generation Date:** 2026-09-13
- **Submission Status:** 2 screens submitted and successfully materialized in Stitch datastore (HTTP 200 / Exit code 0).
- **Quota Discipline:** 2 screens generated (max 2 per game).

#### Screens Generated & Brief Summaries:

1. **Screen 1: Memory Match Multimodal 2x4 Grid State (Cross-Modal IMAGE x WORD)**
   - **Stitch Screen ID:** `cee90ce922b64c21b58c74be16d2c5e9`
   - **Title:** `Professor ESL - Memory Match (Multimodal 2x4 Grid)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1WewwYRFf7pusPki6v5bcthLkL8ZlVKhhDFqfU-M2KBEPSxfh5zyKdIyOa85R1G0hmtg17HxBolqfSeNCxeZjeUWdylqpoW1ZMplek5_ERRns4H5ON0KyJkmR8azfO_Jhnolb082jMn0Bh23-BGe6S1fzTKSmHR2UH96dfLVpopUimXB0l9g_8SrGCGEJ5OMVu3MJeevCCndtMygFYyDDZ3xAfrtJ4Hu4p2hRLQbERQOzyizhQT_0Edk_o`
   - **Prompt Summary:** Mobile portrait (390×844) cross-modal memory grid. Universal 64px header on paper `#FDFBF7` with 48px close '✕' button (`[playCue: tap_exit]`), 6-segment progress tracker (Step 3 active in Duolingo pink `#E91E63`), and real hearts counter showing 4 full hearts (`#FF4B4B`). Subheader HUD features terracotta badge `MEMORY MATCH • 1 / 4 PAIRS FOUND`, sand attempt chip `🎯 1st Try Bonus Active`, and bilingual instruction banner (`Find matching word & picture cards! / 匹配单词与图片`). Main stage presents a 2-column × 4-row grid (8 tiles total, 100% viewport fit with zero scrolling): Card 1 (`bridge` word tile with Chinese subtitle `桥梁`) and Card 2 (vector illustration of stone arch river bridge) locked in golden-teal celebrating frame with checkmark badges (`[playCue: match_success]`). Card 3 (`crosswalk` word tile) actively selected in emerald `#E6F4F1` with 2.5px teal border (`#2A9D8F`), 32px Duolingo blue audio FAB playing target pronunciation (`[playCue: word_pronounce]`). Card 5 (pedestrian crosswalk vector illustration) idle face-up. Cards 4, 6, 7, 8 face down with Wonder Atlas compass star pattern on warm paper `#FAF5EC`. Bottom banner displays progress `1 / 4 Pairs Complete` with reassurance note `🛡️ Taps do not cost hearts!`. Anchored 76px footer with disabled CTA `FIND ALL PAIRS (1/4) →`.
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header close tap
     - `[🔊 playCue: card_flip]` on card selection tap
     - `[🔊 playCue: word_pronounce]` on word card audio FAB tap
     - `[🔊 playCue: match_success]` on successful pair match
     - `[🔊 playCue: tap_next]` on footer continue tap
   - **Design Contract:** Wonder Atlas warm tokens (`#EAE0D0`, `#FDFBF7`, `#E2D7C3`) × Duolingo accents (`#E91E63`, `#1CB0F6`), Fredoka + Nunito typography, production Tailwind HTML + small style block, zero placeholder chrome.

2. **Screen 2: Memory Match Mismatch Shake & Immediate Corrective Acoustic Feedback State**
   - **Stitch Screen ID:** `0a9be879142c4e3694def3ae78782148`
   - **Title:** `Professor ESL - Memory Match (Mismatch Shake & Acoustic Correction)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1WEdwuWNmoP4iQnAPSfjSVYow52EK0ydOrUbgsWU_fLIlesq8N6377rdEOwgJGf8qJQH0uQvEksiIAo-Lf9fqwXRVwctGJDpvbfASiEVnDioR16qk3Mxgf9rnVdbCWXfMEkDePK4CeJjTXWaozCgEaNjRo8200EdrQZDEFcpaiN7ZOc69VszOFiXNAB3VzYKMkxlWM58EOZbHr41hlSgYJab6334K1bmZiWpvd7_y8UEboSe1UilqZEgoU`
   - **Prompt Summary:** Mobile portrait (390×844) mismatch feedback state. Shell header shows Step 3 in Duolingo pink `#E91E63` and 4 hearts fully intact (no heart penalty for memory exploration). Subheader HUD shows terracotta badge `MEMORY MATCH • 1 / 4 PAIRS FOUND` and sand chip `🎯 Attempt 2`. 2×4 grid shows active 400ms mismatch shake: Card 1 (`crosswalk` word tile) and Card 2 (traffic signal pole illustration) rendered in soft red `#FEF2F2` with 2.5px solid red border (`#FF4B4B`), hard bevel (`#DC2626`), and corner red '✕' badges. Speaker FAB actively plays acoustic feedback (`[playCue: mismatch_buzz] → [playCue: word_pronounce]`). Cards 3 & 4 remain locked in teal matched frame; Cards 5–8 face down. Corrective feedback drawer below grid features Professor Owl with feathered quill providing bilingual educational guidance clarifying *crosswalk* vs *traffic light*, with explicit zero-lockout safeguard indicator (`🛡️ Free exploration: no stars or hearts lost • 0s Lockout`). Anchored footer CTA `TRY ANOTHER CARD ↩` in terracotta `#E76F51` (`0 4px 0 #C4553B` bevel).
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header close tap
     - `[🔊 playCue: mismatch_buzz]` on mismatch attempt
     - `[🔊 playCue: word_audio]` on acoustic corrective pronunciation
     - `[🔊 playCue: card_flip]` on selecting next card
     - `[🔊 playCue: tap_next]` on footer try another card tap
   - **Design Contract:** Exact token hexes, thumb-reachable actions, production-grade Tailwind HTML + style block.

## §5 ZCode design verification (inside Stitch)

**Verified 2026-09-13** (owner batch pre-approval). Project `6865954475041880496`; exports in `stitch/10-memory-match-step/`. Screens 1-2 — PASS: cross-modal 2×4 image×word grid (no scroll, no text-wall — F2 solved) + mismatch shake with acoustic correction and 0 hearts lost. Sound moments marked; implementation wires playCue/TTS.-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**PRE-APPROVED 2026-09-13 (owner batch directive):** "implement them all right away without waiting for my approval… we will modify [off designs] afterward." The spelling rule (11) proceeds as AG recommended + owner-batch-ratified: in-lesson timeout = word-cost + audio reveal + continue; standalone game keeps sudden-death.

## §7 Implementation notes & design-fidelity log

### Scope & files touched
- `apps/student/steps/memoryPairs.ts`: Extended to prefer `image_url` from unit vocabulary (`right: image_url || l1_translation || definition`, `rightType: imageUrl ? 'image' : 'text'`), defaulted `max = 4` for a responsive 2×4 grid.
- `apps/student/FlashMatch.tsx`: Converted into responsive 2-column × 4-row grid with Wonder Atlas styling (`#FDFBF7` cards, `#E2D7C3` borders, `#2A9D8F` matched frames, 400ms mismatch shake reset with acoustic correction, zero heart decrement).
- `apps/student/steps/MemoryMatchStep.tsx`: Full reskin to Wonder Atlas light theme shell with universal header, 2×4 grid badge, instructions banner, and celebratory completion card.

### Scoring & data-write verification
- `recordAnswer(true)` per completed pair preserved verbatim.
- Hearts are never decremented on mismatches (exploration-safe memory game contract).
- Sound cues (`win`, `playCue`) and `playAudioUrl` calls preserved verbatim.

### Gauntlet results
- `npx tsc --noEmit -p tsconfig.json`: 0 errors
- `npx vitest run`: 826 passed | 1 skipped (827 total across 83 test files)
- `npm run build`: Clean production build (dist/ with PWA service worker)

### Design-fidelity log per Stitch screen
- **Screen 1 (Cross-Modal 2×4 Memory Grid): Followed.**
  - 2 columns × 4 rows (8 cards total, 100% viewport fit without scrolling).
  - Cross-modal word ↔ image / L1 translation matching on warm paper cards with 3D bevels.
  - Active card selection in teal `#E6F4F1` with audio pronunciation button.
  - Matched cards locked in golden-teal celebratory frames with checkmark badges.
- **Screen 2 (Mismatch Shake & Acoustic Correction): Followed.**
  - Fast 400ms mismatch shake animation with acoustic error cue (`[playCue: wrong]`), zero hearts lost, and immediate face-down flip reset without punitive lockout.

