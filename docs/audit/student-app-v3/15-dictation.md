# Dictation — Listen & Type — v3 Quality Audit (`DICTATION (productive)`)

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

- **Surface / route:** ExerciseRunner child — `apps/student/exercises/Dictation.tsx` (67 ln)
- **Exercise types consumed:** DICTATION {audio_url, correct_text, hint?}
- **Data sources:** PoolItem.content; audio via `playAudioUrl` (generated or TTS fallback)
- **Scoring & data writes:** textMatches (case/punct-insensitive, CJK-aware) → onComplete; runner writes (productive → hearts at risk)
- **Reachability:** spelling/dictation family items in pools
- **Theme today:** large AudioButton + input (autoFocus only on fine pointers — keyboard-avoidance) + pink Check

## §1 How the game works today

*(Screenshots pending.)*

DICTATION (`exercises/Dictation.tsx`): large AudioButton ("tap to listen, then type"), a text input (autofocus only on fine pointers so touch keyboards don't jump the layout :10-12,36-44), Enter/Check submit, case/punctuation-insensitive comparison incl. CJK (:21-26 via shared `textMatches`). Hint text appears only after feedback (:45). Runner writes apply.

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/exercises/Dictation.tsx`.

- **F1 · P3 — Unlimited free replays** — kid-friendly, keep (board Sound Lab meters replays with a point cost; solo app should NOT copy that cost).
- **F2 · P3 — No pre-answer scaffolding** — no letter-count slots, no first-letter hint (the board's Spelling Bee shows dashed slot counts); hardest exercise type gets the least support.
- **F3 · P3 — Wrong feedback shows only the answer** — no character-level diff (which letters were right); a near-miss ("tractr" vs "tractor") reads as total failure.
- **F4 · P3 — Input + keyboard occupy the lower screen** — thumb-reach is fine; no issue found beyond the shell's general floor pass.

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Cold generic input field lacks playful scaffolding.** (Evidence: §1, `Dictation.tsx:36-44`). Dictation renders as a raw HTML text `<input>` on a bare background, looking like a login form. For a child, typing into an unformatted box provides zero visual feedback on word structure. *Recommendation: Style the input as a tactile Wonder Atlas writing slate (`wa-paper` `#FDFBF7`, 2px solid `#E2D7C3`, rounded-2xl, generous 24px Fredoka typography) with subtle letter-slot dashes below the cursor.*
- **F2 · P3 — Virtual keyboard squishes mobile play area.** (Evidence: §1, §3 F4). When the software keyboard deploys on mobile devices, vertical viewport height shrinks dramatically (<360px). The large audio button, input field, and Check button can collide or scroll. *Recommendation: Ensure compact vertical stacking when keyboard is open: reduce audio button to 44px pill and anchor the input field directly above the keyboard.*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P1 — Missing audio auto-play on exercise mount.** (Evidence: §1, `Dictation.tsx:10-20`). When dictation loads, the screen sits silent waiting for the child to realize they must tap the speaker button. In dictation, the prompt IS the sound. *Recommendation: Automatically play the target audio prompt once upon mount (respecting browser autoplay rules with a clear pulsating speaker fallback).*
- **F4 · P2 — Premature empty submissions burn hearts.** (Evidence: §1, `Dictation.tsx:21-34`). Tapping the Check button while the input field is empty immediately scores an incorrect attempt, penalizing the student with a heart deduction (`Engine.loseHeart`). *Recommendation: Disable the Check button until at least 1 character is typed.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P1 — Lack of "Slow Audio" toggle traps struggling listeners.** (Evidence: §1, §3 F1). Primary ESL learners frequently struggle to separate connected speech in native-speed audio clips (e.g., "pick it up" sounding like one word). Without a slow-speed playback option, they cannot isolate individual phonemes. *Recommendation: Add a dedicated "Turtle / Slow 🐢" audio button that replays the clip at 0.75x speed with pitch preservation.*
- **F6 · P2 — Flat failure banner conceals character-level accuracy.** (Evidence: §1, §3 F3, `Dictation.tsx:45`). When a child types "elefant" instead of "elephant", the component marks the attempt as a complete failure and displays the target word. The child does not see which letters they got right. *Recommendation: Render a character-by-character diff in the feedback card: show correctly spelled letters in emerald and misspelled/missing letters in terracotta with corrective letter indicators.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F7 · P2 — Letter-count slot scaffolding for primary tiers.** (Evidence: §3 F2). Young kids frequently drop silent letters ("lamb" -> "lam"). Displaying subtle letter-count placeholder dashes (`_ _ _ _`) gives solo learners the necessary structural boundary to check their own spelling before submitting. *Recommendation: Provide an optional letter-count slot scaffold based on objective difficulty.*

### 4.e Top-5 prioritized recommendations
1. **[P1] Auto-play target audio on mount with a Slow Audio 🐢 (0.75x) toggle:** Ensure acoustic modeling is immediate and accessible to early listeners.
2. **[P2] Disable Check button when input is blank:** Prevent accidental loss of database hearts from empty submissions.
3. **[P2] Provide character-level visual feedback on spelling errors:** Highlight correct letters green and typos terracotta so children learn from near-misses.
4. **[P2] Add letter-count slot guidance:** Display subtle letter-count guides below the input field to scaffold word length.
5. **[P3] Reskin to Wonder Atlas writing slate with keyboard-adaptive layout:** Prevent input collision and viewport squishing when the mobile virtual keyboard is active.

### 4.f Stitch design log (AG fills as it generates)

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Game Subsystem:** Dictation Spelling Slate (`15-dictation.md`)
- **Generation Date:** 2026-09-13
- **Submission Status:** 2 screens submitted and successfully materialized in Stitch datastore (HTTP 200 / Exit code 0).
- **Quota Discipline:** 2 screens generated (max 2 per game).

#### Screens Generated & Brief Summaries:

1. **Screen 1: Audio-First Listen & Slate State**
   - **Stitch Screen ID:** `58e13b782c6044ecb09dbf651ee7517f`
   - **Title:** `Professor ESL - Dictation (Audio-First State)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1VhqjHB_7mex7Z80oT74hufYphD6QkkRD9Gm-w7ab0WcgF4jWINFT7fa7L2w5RrmBT3wm3W_hgJyCgE8B-T3JEHKMRvGFGXAsBQGpKoWHjxWEEhqAws76J519Mz9hSJ5AB4xrjhMK4lYbLtLI1i8v0adPaK31aNSxfjOU00XxqqKL3e9sQMsvQlhkHjUzauXZpDA-fDQBc1r5XbwwB1sOxUZI2FJyrJoSY12k9cQfd7K7rUKG2-5sxdtlo`
   - **Prompt Summary:** Mobile portrait (390×844) spelling dictation exercise in audio-first state. Universal 64px header on paper #FDFBF7 with close button, Step 5 active in Duolingo pink #E91E63 (55%), and 4 hearts. Central audio deck on paper #FDFBF7 features 76px glowing Duolingo blue speaker FAB (#1CB0F6, bevel 0 5px 0 #0284C7) with 3 animated cyan acoustic ripple waves showing live auto-play on mount ([playCue: prompt_audio] [TTS: elephant]). Dedicated "Slow Audio 🐢" 48px pill button in sand #E9C46A (0.75x speed) addressing audit P1 F5. Letter-count slot scaffold ("8 Letters: E _ _ _ _ _ _ _") provides structural word boundaries per audit P2 F7. Tactile writing slate with 24px Fredoka typography and blinking cursor. Anchored bottom dock features disabled Check CTA ("TYPE TO CHECK ➔") preventing blank heart loss per audit P2 F4.
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header close tap
     - `[🔊 playCue: prompt_audio]` + `[TTS: elephant]` on auto-play and speaker tap
     - `[🔊 playCue: audio_slow]` + `[TTS: elephant at 0.75x]` on Slow Turtle tap
   - **Design Contract:** Wonder Atlas warm tokens (`#EAE0D0`, `#FDFBF7`, `#E2D7C3`) × Duolingo accents (`#E91E63`, `#1CB0F6`), Fredoka + Nunito typography, production Tailwind HTML + small style block, zero placeholder chrome.

2. **Screen 2: Near-Miss Character-Level Diff Feedback**
   - **Stitch Screen ID:** `f4a122fffd1a4efa8aa6bbc477851be8`
   - **Title:** `Professor ESL - Dictation (Near-Miss Character Diff State)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1VV7JUWRQFQm0SWOuG9Dcy1IQpOlX11b7gwdXKsl53YEDYjyfuXXVFsSKUINXvCc8PTwpN2DD_PnSSQEGiVcIO6YBbdXVFvArMQjlVasLxoHDGVDRRk3SP-89nSHdlnZwSlgEP_zfgGsi4V17kMtR8XnJ-Th_ZNZU3UuEPl-RKPkOvgcndI9Jeuqkp_7emIaloAqo241WBAfyeIlKNbFjl3FXyCCExIQrOaOZivasDf_YgEGH_UsghPJHs`
   - **Prompt Summary:** Mobile portrait (390×844) spelling dictation in near-miss diagnostic feedback state. Header shows heart loss (❤️ 3 remaining, 1 broken heart pill). Main slate displays child's submitted spelling "elefant" with character-by-character diff per audit F3 & F6: correct letters ('e', 'l', 'e', 'a', 'n', 't') rendered in emerald green (#10B981) boxes with checkmarks, while typo 'f' is rendered in terracotta (#FF4B4B) with strikethrough and corrective floating 'ph' badge in Duolingo pink. Feedback drawer on warm paper #FDFBF7 features Professor Owl explanation ("In English, the /f/ sound in elephant is spelled with ph!"), target word card with IPA chip "[ˈel.ə.fənt]", Chinese meaning "大象", 44px blue audio replay button, and 54px beveled CTA "GOT IT, TRY AGAIN ➔" in terracotta #E76F51 (bevel 0 4px 0 #C4553B).
   - **Sound Cue Marks:**
     - `[🔊 playCue: prompt_audio]` + `[TTS: elephant]` on model audio replay
     - `[🔊 playCue: tap_retry]` on Got It Try Again CTA tap
   - **Design Contract:** Exact token hexes, thumb-reachable actions, production-grade Tailwind HTML + style block.

## §5 ZCode design verification (inside Stitch)

**Verified 2026-09-13** (owner batch pre-approval). Project `6865954475041880496`; exports in `stitch/15-dictation/`. Screens 1-2 — PASS: auto-play ripple + 0.75x slow-audio pill + letter-count dashes; near-miss character-level diff.-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**PRE-APPROVED 2026-09-13 (owner batch directive):** "implement them all right away without waiting for my approval… we will modify [off designs] afterward."

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
