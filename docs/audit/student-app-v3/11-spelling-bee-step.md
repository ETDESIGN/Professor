# Spelling Bee — In-Lesson Step — v3 Quality Audit (`SPELLING_BEE (engine)`)

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

- **Surface / route:** SPELLING_BEE blocks inside `/student/solo-lesson` — `apps/student/steps/SpellingBeeStep.tsx` (444 ln) + shared engine `components/games/spellingBee/*` (useSpellingBeeTurn/useSpellingBeeClock/keyboardEngine/SpellingBeeStage/contentBuilder)
- **Exercise types consumed:** pool_items IMAGE_SELECT + MEANING_MATCH + DICTATION → words; fallback `get_unit_bundle` vocabulary (RLS-safe RPC)
- **Data sources:** pool by unitId (limit 500); 3 rounds × `wordsPerRound` (plan data, default 5); settings from plan block (timerSeconds default 15, letterRemoval default on) — NOT localStorage here (that's the standalone twin, file 21)
- **Scoring & data writes (SACRED):** solved → `scoreForAttempt(mistakes, difficulty, 1.0, streak)` +1 speed bonus @≥50% clock, cap 5, +`recordAnswer(true)`; wrong letter → −MISTAKE_PENALTY + mistakes+1; **SPLIT fail rule: timeout ENDS THE RUN** (forceComplete → finishRun(true) after 1.8s); skip = attempted, never scored. XP pipeline-only.
- **Reachability:** SPELLING_BEE blocks; adaptive keyboard narrowing (deterministic per unitId seed)
- **Theme today:** slate-900 dark, amber "Well Done" interstitials w/ per-word badges, 5-star results

## §1 How the game works today

*(Screenshots pending.)*

In-lesson SPELLING_BEE step (`steps/SpellingBeeStep.tsx`) on the shared board-tested engine (`components/games/spellingBee/*`). Loads pool words (IMAGE_SELECT/MEANING_MATCH/DICTATION) with `get_unit_bundle` vocabulary fallback (:91-134); 3 rounds × `wordsPerRound` (plan data, default 5). Word lifecycle (shared engine): 3.2s **presentation beat** (image + auto-audio, clock paused) → typing under the countdown (default 15s from plan) with adaptive keyboard narrowing (deterministic per unitId) → solved hold 2.6s / reveal 2.8s (useSpellingBeeTurn.ts:50-52,124-125). Scoring: board math local — `scoreForAttempt` + speed bonus, −1 per wrong letter; **the SPLIT fail rule: a timeout ENDS THE RUN** (forceComplete → results after 1.8s) (:170-174); skip = attempted, unscored (:175-178). `recordAnswer` per solved/timeout word feeds session accuracy (:163,169). Round interstitials ("Well Done" + badges + score roll) and a 5-star results screen (:266-372).

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … The home screen for the student will not be changed … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/steps/SpellingBeeStep.tsx` unless noted.

- **F1 · P1 — Timeout ends the entire run for a child alone.** The SPLIT rule (:170-174) is the standalone original's tension knob, but here it sits inside a LESSON: one expired clock kills all remaining rounds/words of the step and jumps to results. The board twin reveals + advances (teaching beat). For a 6-8 y/o at home this is the harshest single interaction in the app. **Owner decision needed: keep the tension (it's deliberate) or soften to reveal+continue in the lesson context** (the standalone game, file 21, can keep the hard rule).
- **F2 · P2 — 15s default clock with no solo mercy.** Plan-time setting only (:42,74); the standalone twin has timer-off + 25s slow mode (localStorage), the lesson step takes whatever the teacher planned — a plan defaulting to 15s is tight for young home spellers (each wrong letter also burns 1s).
- **F3 · P3 — Round interstitial badge row assumes `wordsPerRound` slots** (:283-299) — fine, but badges truncate long words (`w-12 truncate`).
- **F4 · P3 — Exit mid-round no confirmation** (:384).
- **F5 · P3 — Empty-pool error screen text is teacher-flavored** ("continue with the lesson for now" — OK in-lesson; just noting copy tone).

**Works well:** the shared engine already carries the board v3 fixes (presentation beat, consolidation holds, deterministic narrowing, StrictMode-safe clock) — this surface inherits them for free.

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
