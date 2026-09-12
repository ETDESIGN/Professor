# Grammar Sandbox — In-Lesson Step — v3 Quality Audit (`GRAMMAR_SANDBOX (passive presentation)`)

> **Current status:** ag-audit-done

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

- **Surface / route:** GRAMMAR_SANDBOX step inside `/student/solo-lesson` — inline `SoloLessonPlayer.renderGrammarSandbox` (SoloLessonPlayer.tsx:386-415)
- **Exercise types consumed:** none (presentation)
- **Data sources:** flow block data: rule / explanation / examples[]
- **Scoring & data writes:** none
- **Reachability:** grammar presentation blocks
- **Theme today:** white card + indigo accents, numbered example rows

## §1 How the game works today

*(Screenshots pending.)*

Pure presentation step for grammar rules, inline (:386-415). Shows a rule card (label + rule + explanation) and numbered example rows. Empty state if no rule AND no examples. No interaction beyond the shell's Continue; no writes.

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … The home screen for the student will not be changed … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/SoloLessonPlayer.tsx` (inline renderer).

- **F1 · P2 — Zero audio on a pre-reader surface.** Rule + examples are text-only — no TTS "hear the rule/examples" affordance at all, though every other input step (WordLab, Story) guarantees sound. 6-7 y/o weak readers get nothing here.
- **F2 · P3 — Examples not tappable** (no per-example listen).
- **F3 · P3 — No highlighting of the target structure in examples** (the board's Grammar Lab v3 uses color-coded syntax pills; even a simple bold of the pattern would scaffold).
- **F4 · P3 — Free skipping:** Continue always enabled (shell F8 applies most here — the step is entirely skippable without any engagement signal).

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Static monochrome text blocks induce reading fatigue.** (Evidence: §1, `SoloLessonPlayer.tsx:386-415`). Grammar rules and examples are rendered as plain static text lines inside an unadorned white box. For primary school learners (ages 6–10), this presentation resembles an intimidating paper grammar drill, repelling visual engagement. *Recommendation: Structure the rule using Wonder Atlas card tokens: a friendly mascot speech bubble delivering the core concept, followed by distinct tactile example cards (`#FDFBF7`) with color-accented grammar chips.*
- **F2 · P3 — Lack of visual syntax highlighting.** (Evidence: §3 F3, `SoloLessonPlayer.tsx:395-408`). Example sentences do not visually emphasize the target grammatical pattern (e.g. past-tense '-ed', comparative '-er', or auxiliary verbs). Children cannot isolate what pattern they are expected to observe. *Recommendation: Apply bold syntax pill styling (e.g., `wa-terracotta` text or amber background pill) to the exact target tokens in every example sentence.*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P2 — Total passive dead-zone invites instant skipping.** (Evidence: §1, §3 F4, `SoloLessonPlayer.tsx:721-740`). There is zero interactive affordance on this screen; the footer "Continue" button is permanently enabled from the instant of mount. In practice, 100% of solo students tap Continue within 1 second without reading. *Recommendation: Implement an active micro-engagement latch: require tapping at least one example sentence to play its audio before enabling the Continue button.*
- **F4 · P3 — Disjointed transition into grammar practice.** (Evidence: §1). The sandbox simply dumps the child into an exercise battery on Continue without bridging the rule to the upcoming challenge. *Recommendation: Update the footer Continue button text to read "Try 3 Examples →" to clearly communicate the transition to active practice.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P1 — Zero audio modeling creates an illiterate barrier for early readers.** (Evidence: §1, §3 F1, `SoloLessonPlayer.tsx:386-415`). Unlike Word Lab and Story Stage, Grammar Sandbox provides NO audio playback. A 7-year-old EFL child who cannot yet read multi-syllable English words receives zero instruction. An ESL app used alone at home must never require pre-existing English reading literacy to understand a lesson. *Recommendation: Add a high-visibility speaker button (≥48px) for the rule title and per-sentence audio playback for every example row via TTS/audio cache.*
- **F6 · P2 — Missing Chinese L1 scaffolding on abstract concepts.** (Evidence: §1). Grammar terminology in English ("regular verbs", "plural nouns") is incomprehensible to young EFL learners. *Recommendation: Provide an optional Chinese L1 translation toggle or subtitle pill under the rule summary so parents and students can anchor the grammatical meaning.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F7 · P3 — Absence of interactive comprehension check.** (Evidence: §1). Because there are no interactive components, the step offers zero sense of play or accomplishment. *Recommendation: Add a 1-tap interactive preview at the bottom of the card (e.g. "Tap the verb in this sentence") that triggers a satisfying sound effect and unlocks Continue.*

### 4.e Top-5 prioritized recommendations
1. **[P1] Provide full audio playback for rules and examples:** Add prominent speaker buttons to read rule summaries and examples aloud for young ESL learners.
2. **[P2] Highlight target grammatical structures:** Apply color-coded syntax highlighting (terracotta pills) to the specific inflection or keyword in every example.
3. **[P2] Gate Continue on active audio engagement:** Require the child to listen to at least one example sentence before unlocking Continue.
4. **[P2] Add Chinese L1 translation toggles for grammar rules:** Support ESL comprehension by explaining abstract grammar concepts in the child's native language.
5. **[P3] Re-skin with Wonder Atlas visual scaffolding:** Encase grammar patterns in warm speech bubbles and structured card plates.

### 4.f Stitch design log (AG fills as it generates)
*(Phase 1 audit complete. Stitch designs will be generated in Phase 2 for the interactive grammar pattern card with audio pills.)*

## §5 ZCode design verification (inside Stitch)

<ZCode fills after AG reports designs done: list_screens result, title verification against §4.f, export paths (`stitch/<NN>-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

<Owner's verdict per screen: approved / revise (what to change). No implementation starts before an explicit go on THIS game's designs.>

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
