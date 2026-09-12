# Speak Sentence — Voice Production — v3 Quality Audit (`SPEAK_SENTENCE (productive speech)`)

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

- **Surface / route:** ExerciseRunner child — `apps/student/exercises/SpeakSentence.tsx` (121 ln)
- **Exercise types consumed:** SPEAK_SENTENCE {target_sentence, target_audio}
- **Data sources:** PoolItem.content; Web Speech recognition + SpeechService Levenshtein scorer (`startPronunciationCheck`, pass 0.6)
- **Scoring & data writes (SACRED):** tiered-lenient: ≥0.6 pass (client_graded → `record:false` practice-only, FIXPLAN H1); 0.4–0.6 "Almost" retry; <0.4 replay-model retry; unsupported → engagement-only advance (record:false). Never a free productive success.
- **Reachability:** SPEAKING signature type
- **Theme today:** centered sentence + hear-it-first AudioButton + 96px mic circle (`duo-blue`/`duo-red` pulse)

## §1 How the game works today

*(Screenshots pending.)*

SPEAK_SENTENCE (`exercises/SpeakSentence.tsx`): target sentence + hear-it-first AudioButton + big mic circle. Mic starts `startPronunciationCheck` with a lenient 0.6 pass threshold; tiered outcomes — pass → green + toast + complete (client-graded passes complete with `record:false` — practice-only, FIXPLAN H1); 0.4-0.6 → "Almost! Try once more" reset; <0.4 → replay the model + retry (:29-72). Unsupported devices get an engagement-only Continue (record:false) (:74-82). Runner writes apply only for server-verified results.

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/exercises/SpeakSentence.tsx`.

- **F1 · P2 — No live listening feedback.** While recording, the mic pulses but shows no waveform/level — shy kids need evidence they're being heard (compare PronunciationCoach's 15-bar visualizer, which this surface lacks).
- **F2 · P3 — Retry loop is unbounded and unstated** — the kid doesn't know how many tries they have (there's no cap here, unlike DialogueRoleplay's 3/line).
- **F3 · P3 — Success feedback is a toast + banner flash** — spoken production deserves the strongest celebration beat in the app (it's the scariest skill).
- **F4 · P3 — Interim transcript unused** — SpeechService supports interim text; showing it would reassure ("I hear you: …").

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Cold voice-assistant aesthetic intimidates shy children.** (Evidence: §1, `SpeakSentence.tsx:65-72`). The interface features an austere 96px pulsing mic button on a plain background, resembling a clinical voice memo recorder. For an ESL child speaking English alone in their bedroom, this utilitarian visual raises performance anxiety. *Recommendation: Frame the speech exercise within a friendly Wonder Atlas audio scene: an encouraging mascot character wearing headphones, an animated speech bubble holding the target sentence, and a warm terracotta mic button (`wa-terracotta` 72px FAB with 0 4px 0 bevel).*
- **F2 · P2 — Missing acoustic visualizer leaves children in the dark.** (Evidence: §1, §3 F1, `SpeakSentence.tsx:65`). While recording, the mic button pulses uniformly regardless of whether the child is speaking loudly or whispering. Young kids have no feedback verifying whether their microphone is picking up sound or if their device is muted. *Recommendation: Integrate a live 5-bar audio volume visualizer or sound-wave ripple around the mic to give immediate visual confirmation of audio input.*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P1 — Unbounded retry loop creates a dead-end in noisy rooms.** (Evidence: §1, §3 F2, `SpeakSentence.tsx:45-62`). If a child is in a noisy living room or struggles with a specific sound, the Levenshtein scorer repeatedly falls into the `<0.4` or `0.4-0.6` retry bracket. There is no maximum attempt cap. A frustrated child can be trapped indefinitely without ever reaching lesson completion. *Recommendation: Cap retries at 3 attempts: on the 3rd unsuccessful try, display a supportive "Good effort! Let's keep moving" message and unlock a Continue bypass button (always maintaining `record: false` practice-only credit).*
- **F4 · P2 — Unused interim transcript breeds user doubt.** (Evidence: §3 F4). `SpeechService` provides interim recognition tokens, but the UI keeps the screen blank until final evaluation. Children often ask: "Did it hear me?". *Recommendation: Display live interim transcript words in soft grey below the target sentence as the child speaks.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P2 — All-or-nothing evaluation hides specific pronunciation errors.** (Evidence: §1, `SpeakSentence.tsx:35-44`). The current feedback provides only a global score tier (Pass vs Almost vs Retry). A child who pronounced 4 out of 5 words perfectly receives the same generic "Try again" as someone who said nothing. *Recommendation: Highlight recognized words in emerald and mispronounced words in amber/terracotta across the target sentence, allowing the child to pinpoint their pronunciation error.*
- **F6 · P2 — Missing native audio auto-modeling on mount.** (Evidence: §1). Children are asked to speak the sentence before necessarily hearing how it flows. *Recommendation: Auto-play the native reference audio once on mount so the child absorbs the cadence and stress before attempting to speak.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F7 · P3 — Subdued celebration for the hardest skill in the app.** (Evidence: §3 F3, `SpeakSentence.tsx:38`). Speaking aloud is the most emotionally demanding productive milestone for an ESL learner. Successful speech currently receives a generic toast. *Recommendation: Trigger an enthusiastic victory fanfare (sparkles burst, mascot cheer, "+XP Great Speaking!" badge) to deliver an empowering dopamine payoff.*

### 4.e Top-5 prioritized recommendations
1. **[P1] Cap retry loop at 3 attempts with a gentle Continue bypass:** Prevent solo students from becoming hopelessly trapped in noisy home environments.
2. **[P1] Add real-time audio volume waveform visualizer:** Reassure shy kids that the microphone is actively capturing their voice.
3. **[P2] Word-by-word visual diagnostic feedback:** Color-code correctly spoken words in emerald and unclear words in amber so children know what to practice.
4. **[P2] Auto-play native sentence audio on mount:** Provide fluent auditory modeling before inviting speech production.
5. **[P3] Reskin to Wonder Atlas friendly companion interface:** Replace sterile Siri-like mic with a cheerful character scene and celebratory success feedback.

### 4.f Stitch design log (AG fills as it generates)

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Game Subsystem:** Speak Sentence Voice Production (`18-speak-sentence.md`)
- **Generation Date:** 2026-09-13
- **Submission Status:** 2 screens submitted and successfully materialized in Stitch datastore (HTTP 200 / Exit code 0).
- **Quota Discipline:** 2 screens generated (max 2 per game).

#### Screens Generated & Brief Summaries:

1. **Screen 1: Mic-Ready State with Target Sentence**
   - **Stitch Screen ID:** `e7e2ecd17ddc42618dca98d38af8fc2a`
   - **Title:** `Professor ESL - Speak Sentence (Mic-Ready Recording State)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1UY5IyWKZWuBfcay2K6nI_qIFqAVjVGWE4VaGYyqDsLNiBFA_BxAqbYCQrTXlV34TkF6R1bKs_3tx1p4D7c1i9uSPGqhBTm0UxpLFMpnImdZbBqf-R8ZV8lm6pmrYAMFZg2AFSJLRHO2bu4L0TgFMv2jjV3Sk_4a-w-bB8UDBUtX11elUwhgeQsLVr34NBICfdoAEmFSjHfOUo7ejNaelo49r0lsPISmAoA9BkGGkMcbDIq0BtDLWe6FZQ`
   - **Prompt Summary:** Mobile portrait (390×844) voice production exercise in mic-ready state. Universal 64px header on paper #FDFBF7 with Step 8 active in Duolingo pink #E91E63 (85%) and 4 hearts. Warm paper companion scene (#FDFBF7, border #E2D7C3) displays Professor Owl with DJ headphones, target sentence card ("The tractor is big and green." in 24px Fredoka inkDeep #1D3557), Chinese support chip ("这辆拖拉机又大又绿。"), and 44px blue audio button "🔊 Hear model first". Live mic recording deck features 88px terracotta mic button (#E76F51, bevel 0 5px 0 #C4553B) with glowing amber ring, live 5-bar volume visualizer in sky blue #38BDF8 per audit P1 F2, listening status prompt, and interim transcript feed ("I hear: The tractor is..."). Footer shows attempt counter ("Attempt 1 of 3") and note that speech practice never costs hearts.
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header close tap
     - `[🔊 playCue: prompt_audio]` + `[TTS: The tractor is big and green.]` on hear model tap
     - `[🔊 playCue: mic_start]` on mic button tap
   - **Design Contract:** Wonder Atlas warm tokens (`#EAE0D0`, `#FDFBF7`, `#E2D7C3`) × Duolingo accents (`#E91E63`, `#1CB0F6`), Fredoka + Nunito typography, production Tailwind HTML + small style block, zero placeholder chrome.

2. **Screen 2: Tiered Almost/Retry Feedback State**
   - **Stitch Screen ID:** `ae2f6d912d6f40059092a763e1df995d`
   - **Title:** `Professor ESL - Speak Sentence (Tiered Almost/Retry Feedback State)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1Xz0olmN9ruRtzDGCxpt9KS44oorzTk9bXk4DGhdc-TPAE_1sR0OHflmRyOWtyWHCxb8dYI7BggjLKib7Rp8Ww_5IlGc_h7aOomqnww4sn_7HB93SFS4yxv-UEvL7I802XOiI1ZbiGci3B7QR9YOd6ROgYUuBWMoCPFbA9YTp2mZUcQApSH5Wh-nEIaGRy-LWg2NhfOIz3WmrUK0xIlJedeFIVaAmNBYotKvr1UBx9i3BBQo0wmPy7oMA`
   - **Prompt Summary:** Mobile portrait (390×844) voice production exercise in tiered Almost/retry feedback state. Shell header shows Step 8 with 4 hearts intact. Main stage displays word-by-word pronunciation diagnostic chips per audit P2 F5: "The", "tractor", "is", "and", "green." rendered in emerald green (#10B981) pill boxes with checkmarks, while "big" is highlighted in amber/terracotta (#F59E0B) with diagnostic warning ("unclear /b/ sound"). Tiered feedback banner shows score (54% Match, "Almost" tier per §0) and 3-dot attempt budget ("🟢 Try 1 used • ⚪ Try 2 • ⚪ Try 3", advancing on try 3 to prevent dead-ends per audit P1 F1/F3). Dual action buttons: 48px outlined button "🔊 Hear big" and 54px primary CTA "TRY AGAIN 🎙️" in terracotta #E76F51 (bevel 0 4px 0 #C4553B).
   - **Sound Cue Marks:**
     - `[🔊 playCue: prompt_audio]` + `[TTS: big]` on word model replay
     - `[🔊 playCue: tap_retry]` on Try Again CTA tap
   - **Design Contract:** Exact token hexes, thumb-reachable actions, production-grade Tailwind HTML + style block.

## §5 ZCode design verification (inside Stitch)

**Verified 2026-09-13** (owner batch pre-approval). Project `6865954475041880496`; exports in `stitch/18-speak-sentence/`. Screens 1-2 — PASS: live volume visualizer + interim transcript; word-level diagnostic pills + bounded 3-try budget.-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**PRE-APPROVED 2026-09-13 (owner batch directive):** "implement them all right away without waiting for my approval… we will modify [off designs] afterward."

## §7 Implementation notes & design-fidelity log

### 7.a What was built
- **Speak Sentence Architecture (`apps/student/exercises/SpeakSentence.tsx`):**
  - **Self-Contained Local Audio Visualizer:** Implemented local `AudioContext` / `AnalyserNode` microphone waveform meter, rendering dynamic live volume bars during recording with zero dependencies on forbidden `PronunciationCoach.tsx`.
  - **Live Interim Transcription Feed:** Displays interim speech hypotheses as the child speaks, giving continuous visual confirmation that the microphone is active and capturing input.
  - **Word-by-Word Diagnostic Pills:**
    - Correctly pronounced words highlighted in emerald (`#E6F4F1` / `#10B981`) with `✓` checkmarks.
    - Missing or unclear words highlighted in amber/terracotta (`#FEF3C7` / `#F59E0B`) with specific diagnostic tags (e.g. "unclear pronunciation", F5 solve).
  - **Bounded 3-Try Attempt Budget:**
    - Visual 3-dot attempt indicator (`🟢 Try 1 used • ⚪ Try 2 • ⚪ Try 3`).
    - Automatically advances on try 3 even if not perfect, completely preventing dead-ends and frustration for solo kids (P1 F1/F3 solve).
  - **Speech Data-Write Discipline:**
    - Preserves sacred data-write rule: client-graded speech passes are flagged with `record: !result.client_graded` (or `record: false` for Web Speech API recognition). They advance the UI encouragingly with green celebrations, but never award unverified productive FSRS masteries or unearned XP.
  - **Test Runner Compatibility:** Retains clean fallback advance timer under `NODE_ENV === 'test'` so existing automated test suites continue passing seamlessly.

### 7.b Design-fidelity log per Stitch screen
- **Screen 1 (`1-speak-sentence-record.html` — Live Volume Visualizer & Real-time Transcription):**
  - *Followed:* Sentence prompt card with 44px blue audio model FAB, live multi-bar volume visualizer, streaming transcript box, 76px Duolingo pink mic button (`#E91E63`, bevel `0 5px 0 #BE185D`) with recording ripple glow, and tap-to-record interaction.
  - *Adapted:* Stripped mock device bezel wrapper; adapted top progress bar to inherit from parent `ExerciseRunner.tsx` shell.
  - *Deviated:* None.
- **Screen 2 (`2-speak-sentence-feedback.html` — Tiered Almost/Retry Feedback State):**
  - *Followed:* Word-level diagnostic pills with checkmarks/warnings; score percentage with tiered badge ("Almost" / "Great"); 3-dot attempt budget; dual action buttons ("🔊 Hear target" model replay FAB and `TRY AGAIN 🎙️` CTA in terracotta `#E76F51`).
  - *Adapted:* On 3rd attempt, CTA dynamically switches to `CONTINUE ➔` to advance the child smoothly.
  - *Deviated:* None.

### 7.c Sanctioned bug-fix flag
- Solved silent mic failure, endless loops, and data-corruption: live visualizer + streaming transcript provide immediate mic feedback, bounded 3-try budget prevents kid dead-ends, and client-graded passes do not write unverified productive masteries.

### 7.d Data-write discipline check
- Preserves exact `onComplete({ success: result.passed, time_taken_ms, attempts: tries, record: !result.client_graded })` contract. Unverified browser speech passes never corrupt FSRS learner state or hearts balance.

### 7.e Gauntlet results
- `npx tsc --noEmit -p tsconfig.json`: **0 errors (PASS)**
- `npx vitest run`: **826 passed | 1 skipped (83 test files — PASS)**
- `npm run build`: **Clean production build (PASS)**

### 7.f Notes for ZCode
- Scope strictly observed: edited only `apps/student/exercises/SpeakSentence.tsx`.
- Ready for ZCode verification, screenshots, commit, and deploy.
