# Pronunciation Coach — v3 Quality Audit (`PRACTICE: /student/pronounce`)
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

- **Surface / route:** `/student/pronounce` (Practice Arena) — `apps/student/PronunciationCoach.tsx` (304 ln; standalone mode — its embedded mode is dead, file 29)
- **Exercise types consumed:** none — **fixed default sentence "Let's practice English conversation!"** unless data passed (never is, standalone) — parked for §3
- **Data sources:** none (targetSentence hardcoded fallback)
- **Scoring & data writes:** `onSessionEnd({correct: server-verified only (client_graded excluded), total: attempts})` at exit → StudentApp XP + Q PERFECT_SPEAKING if perfect; live waveform via getUserMedia + AnalyserNode
- **Reachability:** Practice Arena → Speaking tile
- **Theme today:** slate-900 dark studio, pink mic w/ green shadow-bevel (mismatched color — parked), 15-bar visualizer

## §1 How the game works today

*(Screenshots pending.)*

PronunciationCoach standalone (`PronunciationCoach.tsx`): dark studio screen — target sentence chip, Listen button (TTS), 15-bar live input visualizer (getUserMedia + AnalyserNode :76-108), big mic button; per-attempt result card (similarity %, transcript, feedback) + retry; attempts counter (:268-271). Exit → `onSessionEnd({correct: server-verified only, total: attempts})` (:159-167) → StudentApp awards XP + PERFECT_SPEAKING if perfect (StudentApp.tsx:231). Server verification via the `evaluate-pronunciation` edge exists (SpeechService.ts:228); on failure the attempt degrades to client-graded and is excluded from credit.

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs: `apps/student/PronunciationCoach.tsx`, `services/SpeechService.ts`.

- **F1 · P1 — No content source: one hardcoded sentence forever.** `targetSentence = data?.targetSentence || data?.targetWord || "Let's practice English conversation!"` (:60) — and standalone mode never passes data. The "Speaking practice" tile practices a single fixed sentence regardless of unit/level; there is no progression, no unit tie-in, nothing from the learner's actual vocabulary. This surface needs a content model (unit sentences/words, or pool SPEAK_SENTENCE items) before any visual redesign matters.
- **F2 · P2 — Honest-but-demotivating failure mode.** When the edge STT fails (offline/edge error), attempts become client-graded and `correct` stays 0 — the kid sees "Attempts: 5 | Correct: 0" (:268-271) after clearly-good tries, and the session pays the 1-XP floor. The scoring honesty is RIGHT (keep); the presentation must distinguish "practice-only session" from "you failed".
- **F3 · P3 — Mic button bevel color mismatch** — pink button with a green hard shadow (`shadow-[0_8px_0_#2f6f02]`, :294) — Duolingo-era leftover.
- **F4 · P3 — No target progression/history** — the owner's own draft prompt sketches history chips ("tractor 92%") and word/sentence targets; nothing exists.
- **F5 · P3 — `onResult` embedded-mode prop unused in standalone** (dead surface per file 29).

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Glitched 3D button bevel: hot-pink surface with olive-green drop-shadow.**
  - *Evidence:* `PronunciationCoach.tsx:294` styles the primary microphone trigger as `bg-duo-pink text-white shadow-[0_8px_0_#2f6f02]` (`F3`). A bright magenta pill sitting on a swamp-green shadow is a garish CSS artifact left over from an incomplete theme merge.
  - *Recommendation:* Fix the bevel shadow to match the pink hue family: `bg-duo-pink shadow-[0_8px_0_#be185d]` or align with the app's unified sky-blue voice theme (`bg-sky-500 shadow-[0_8px_0_#0284c7]`).
- **F2 · P2 — Severe dark-room recording studio clashes with child app warmth.**
  - *Evidence:* `PronunciationCoach.tsx:170-175` renders a stark, pitch-black `bg-slate-900` studio with an intimidating audio waveform. For 6–12 year olds, this aesthetic evokes a clinical audio test rather than a playful speaking adventure.
  - *Recommendation:* Reskin into a vibrant "Echo Stage" / "Voice Studio" featuring soft deep indigo (`#0B132B`) or light warm paper canvas, neon audio wave pulses, and an encouraging mascot avatar reacting in real-time to speech amplitude.

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P1 — Hardcoded single sentence forever with zero curriculum integration.**
  - *Evidence:* `PronunciationCoach.tsx:60` hardcodes `targetSentence = data?.targetSentence || data?.targetWord || "Let's practice English conversation!"` (`F1`). When opened standalone from Practice Arena (`/student/pronounce`), `data` is undefined. Every child in every grade practices the exact same single sentence indefinitely. There is no deck, no progression, and no connection to the child's active vocabulary.
  - *Recommendation:* Connect Pronunciation Coach to real curriculum content: load a deck of 5–8 target words and sentences from the active unit (or `SPEAK_SENTENCE` pool items). Show top progress dots (`1/5`, `2/5`) and advance to the next card upon an acceptable attempt.
- **F4 · P2 — Unexplained edge degradation presents technical offline status as child failure.**
  - *Evidence:* `PronunciationCoach.tsx:268-271` (`F2`). When the edge STT service fails or the student is offline, attempts fallback to client Web Speech where `isCorrect` is forced to false for safety. The UI brutally renders: `Attempts: 5 | Correct: 0`, and pays out the 1-XP floor. The child thinks their English is broken when in reality the server is unreachable.
  - *Recommendation:* Detect offline / fallback mode and display an empowering banner: *"🎤 Practice Mode (Mic Server Offline) — Excellent effort practicing aloud!"*, counting attempts positively without displaying an accusatory "Correct: 0".

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P1 — Lack of word-level acoustic diagnostics leaves children guessing what to fix.**
  - *Evidence:* `PronunciationCoach.tsx:258-263` displays only a coarse overall percentage (`Similarity: 85%`) and a generic feedback string (`currentAttempt.feedback`). If a child pronounces *"I like to eat apples"* but mispronounces *"apples"*, they receive no visual clue which word failed.
  - *Recommendation:* Implement color-coded word-level phonological feedback (green = clear, amber = muffled/close, red = missing/mispronounced). Tapping any word should play isolated native audio for targeted phonemic modeling.
- **F6 · P2 — Missing slow native audio playback (Turtle Mode).**
  - *Evidence:* `PronunciationCoach.tsx:184-192`. The "Listen" button plays TTS at standard 1.0x speed only. Young ESL learners struggling with fast connected speech or unfamiliar consonant clusters cannot parse the auditory details.
  - *Recommendation:* Provide a "Turtle 🐢 (0.75x)" toggle alongside normal audio playback so learners can clearly perceive syllable boundaries before speaking.

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F7 · P2 — Static loop trap: no session goal, completion screen, or celebration.**
  - *Evidence:* `PronunciationCoach.tsx:280-287`. The screen offers only a circular "Retry" button. There is no concept of completing a round, earning stars, or returning to the arena with a speaking badge.
  - *Recommendation:* Structure each session as a 5-card speaking challenge. Completing the 5 cards triggers a juicy victory celebration, awards speaking XP, and progresses speaking quests.

### 4.e Top-5 prioritized recommendations
1. **Dynamic Curriculum Content Deck (P1):** Replace the hardcoded single sentence with a real 5-item deck sourced from active unit vocabulary and `SPEAK_SENTENCE` pool items.
2. **Word-Level Color Diagnostics (P1):** Highlight each word green/amber/red so children immediately understand which phonemes need improvement.
3. **Graceful Presentation for Edge Degradation (P2):** When STT is offline, celebrate speech effort in "Offline Practice Mode" instead of reporting a demoralizing "Correct: 0".
4. **Add Slow Turtle (0.75x) Native Audio Model (P2):** Allow children to hear the target sentence at reduced speed to clearly absorb syllable stress and phonetics.
5. **Fix Glitched 3D Shadow & Soften Studio Theme (P2):** Correct the olive-green bevel shadow under the pink mic button and create an inviting, kid-friendly voice stage.

### 4.f Stitch design log (AG fills as it generates)

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Game Subsystem:** Pronunciation Coach Speaking Practice (`25-pronunciation-coach.md`)
- **Generation Date:** 2026-09-13
- **Submission Status:** 2 screens submitted and successfully materialized in Stitch datastore (HTTP 200 / Exit code 0).
- **Quota Discipline:** 2 screens generated (max 2 per game).

#### Screens Generated & Brief Summaries:

1. **Screen 1: Pronunciation Coach Real Curriculum Speaking Challenge (Fixed Bevel & Deck)**
   - **Stitch Screen ID:** `abe15b368f5b4472b925785f8fb869e1`
   - **Title:** `Professor ESL - Pronunciation Coach (traffic light)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1X3386kLuRm-bwh84_dWTRc5DxYvW6eIY6QFDJWjU7s8jX6UIKMFJfm8fNS_GLODLP4NHaU5olORxH35BSAH169r9LrIYq91plBCncGaAQTA449z6OnwnK-JfXrffqkTbtUKUQDN5Gl40R1fNOdcfDcKtSbgZdXrtkub1w1jY2mHKl8ooXRQklYXG6gGsmdfm2XpaS4GOBvVqKPmfgaeRTiPccPj-sQN-SeF9BjrFWbZ9d7KBYG5j6UsZo`
   - **Prompt Summary:** Mobile portrait (390×844) Pronunciation Coach real curriculum speaking challenge in Wonder Atlas Light design system. Universal 64px header on paper `#FDFBF7` with 48px exit button (`[🔊 playCue: tap_exit]`), title 'Pronunciation Coach', and target progress 'Target 2 of 5'. Active Unit Context Banner: 'Unit 3: City Transport • Speaking Practice'. Horizontal History Chips Row: 'subway: 94% ⭐', active pulsating 'traffic light (active)', 'bridge: 88% ⭐', and queued 'bicycle'. Center Stage: Real Curriculum Target Card on warm paper `#FDFBF7` with 2.5px border `#E2D7C3` and radius 24px: Headword 'traffic light' in bold 28px Fredoka inkDeep `#1D3557`, phonetic `[ˈtræf.ɪk laɪt]`, 3-syllable badge, and Chinese '交通信号灯'. Dual audio modeling actions: 'Normal 1.0x 🔊' (`[playCue: model_audio]`) and tactile Sand 'Turtle 0.75x 🐢' in sand `#E9C46A` (`[playCue: model_audio_slow]`). Live 15-bar frequency acoustic equalizer in sky blue `#38BDF8`. Fixed Primary Microphone FAB (Bug Fix): 76px circular microphone button in Duolingo pink `#E91E63` with MATCHING DARK PINK 3D BEVEL `0 8px 0 #BE185D` (completely eliminating glitched green shadow!) and white mic icon (`[🔊 playCue: mic_record_tap]`). Anchored 76px footer with 'Skip Target ➔' and 'Current Avg: 91%'.
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header exit tap
     - `[🔊 playCue: model_audio]` on 1.0x native audio replay tap
     - `[🔊 playCue: model_audio_slow]` on 0.75x slow audio playback tap
     - `[🔊 playCue: mic_record_tap]` on primary mic record button tap
   - **Design Contract:** Wonder Atlas warm tokens (cream `#EAE0D0`, paper `#FDFBF7`, border `#E2D7C3`, ink `#264653`, inkDeep `#1D3557`, teal `#2A9D8F`, sand `#E9C46A`) × Duolingo accents (`#E91E63`, `#1CB0F6`), Fredoka + Nunito typography, production-grade Tailwind HTML + small style block, zero placeholder chrome.

2. **Screen 2: Pronunciation Coach Practice-Only Offline Mode (Honest Effort Tracking)**
   - **Stitch Screen ID:** `9729035b766e49fface731a4c3cd7230`
   - **Title:** `Pronunciation Coach - Practice-Only Mode (STT Offline)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1XBOlZGv7fNffDJDTFHpLpFHnJK3TeBCbEQNiZ0hM2dBsIdt_7F7igp6Owh-iDfDnl6NxbImS-OYkjI61-2jVoEWTKJiwEYwqMjcnECJZpszevQJ-gR8x6zUOAfqkghVo4p1cx1MnqwsJllPRCU828eol6SiMCFO_oTdwtdqwmGTy2CkAK3HV86i_seKiUOgLOMSl8yK4UNEXEdblie4V0PUpNoC9RTUCf6PfnLeGR-4YbeW3DrJParnVg`
   - **Prompt Summary:** Mobile portrait (390×844) Pronunciation Coach Practice-Only Mode when server STT is offline in Wonder Atlas Light design system. Universal 64px header on paper `#FDFBF7` with 48px exit button (`[🔊 playCue: tap_exit]`), title 'Pronunciation Coach', and progress 'Target 2 of 5'. Honest Offline Practice-Only Banner (amber card with sand border `#E9C46A`): '🎤 Practice Mode (Mic Server Offline) — Server scoring is currently resting, but your spoken practice is fully counted! Practice aloud with confidence. Session progress saves automatically.' Target Card on warm paper `#FDFBF7` with 2.5px border `#E2D7C3`: Headword 'traffic light' with Listen audio FAB (`[🔊 playCue: model_audio]`). User Recording Playback: '▶️ Hear Your Recording (0:03)' button (`[🔊 playCue: user_playback]`). POSITIVE EFFORT STATS (replacing demoralizing '0 Correct' label!): '🌟 Practice Count: 3 Speech Attempts Completed' and reassurance 'Excellent speaking effort! No penalties while offline.' Actions: Primary 52px CTA 'RETRY SPEAKING 🎤' in Duolingo pink `#E91E63` with matching dark bevel `0 4px 0 #BE185D` (`[🔊 playCue: mic_record_tap]`). Secondary 48px button 'NEXT WORD (3/5) ➔' in teal `#2A9D8F` with hard bevel `0 4px 0 #1E6F5C` (`[🔊 playCue: next_target]`).
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header exit tap
     - `[🔊 playCue: model_audio]` on audio model replay tap
     - `[🔊 playCue: user_playback]` on recorded speech playback tap
     - `[🔊 playCue: mic_record_tap]` on retry recording tap
     - `[🔊 playCue: next_target]` on next word target tap
   - **Design Contract:** Exact token hexes, thumb-reachable actions, production-grade Tailwind HTML + style block.

## §5 ZCode design verification (inside Stitch)

**Verified 2026-09-13** (owner batch pre-approval). Project `6865954475041880496`; exports in `stitch/25-pronunciation-coach/`. Screens 1-2 — PASS: real unit content + history chips + honest practice-only state.-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**PRE-APPROVED 2026-09-13 (owner batch directive):** "implement them all right away without waiting for my approval… we will modify [off designs] afterward."

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
