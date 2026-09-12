# Solo Lesson Player Shell — v3 Quality Audit (`PLAYER SHELL + INTRO_SPLASH`)

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
### 4.b Workflow & user flow (the child's own path: open → play → reward)
### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)

*(For each finding: severity P1/P2/P3, the evidence grounding it — §1, §3, or a named screenshot — and a concrete recommendation. If you need information not in this file, list it under "Information needed" instead of guessing.)*

### 4.e Top-5 prioritized recommendations

### 4.f Stitch design log (AG fills as it generates)
<Which screens were requested (tool + prompt summary), expected async materialization, and the per-screen intent: states shown, actions available.>

## §5 ZCode design verification (inside Stitch)

<ZCode fills after AG reports designs done: list_screens result, title verification against §4.f, export paths (`stitch/<NN>-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

<Owner's verdict per screen: approved / revise (what to change). No implementation starts before an explicit go on THIS game's designs.>

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
