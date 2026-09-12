# Legacy Dead Code — LessonSession + Embedded Trio — v3 Quality Audit (`DEAD: /student/lesson (unrouted)`)
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

- **Surface / route:** `/student/lesson` — `apps/student/LessonSession.tsx` (195 ln) mounts `ListenTap.tsx` (223), `SentenceScramble.tsx` (223), PronunciationCoach (embedded), FlashMatch (embedded). **NOTHING navigates to /student/lesson** — dead route (HomeMap 'listen'/'scramble' legacy views route to solo-lesson instead).
- **Exercise types consumed:** frozen flow data via parent-Check-button pattern (the pre-battery contract)
- **Data sources:** playlist from activeUnit flow (LISTEN_TAP/SCRAMBLE/SPEAKING/FLASH_MATCH block types)
- **Scoring & data writes:** correct → addPoints(currentStudentId, 1); lives=0 → toast+exit; onComplete hardcoded {xp:5, accuracy:lives/5}
- **Reachability:** NONE today (verify again at audit time)
- **Theme today:** duo-pink Duolingo-era; fake HUD hearts (hardcoded 5 / "4" in ListenTap standalone header); FlashMatch survives only via file 10
- **Disposition:** document + recommend delete/archive decision to owner. NOT a redesign target.

## §1 How the game works today

*(Documentation — not a redesign target.)*

`/student/lesson` (`LessonSession.tsx`) mounts ListenTap / SentenceScramble / PronunciationCoach(embedded) / FlashMatch(embedded) behind a parent-Check-button contract. **Nothing navigates to the route**: HomeMap's legacy view names ('lesson'|'listen'|'scramble') all call `startLesson` → solo-lesson (StudentApp.tsx:354-360); no other caller exists (grep-verified 2026-09-13). The embedded trio survives only where other live surfaces use them: FlashMatch via MemoryMatchStep (file 10); PronunciationCoach via /student/pronounce (file 25). ListenTap.tsx and SentenceScramble.tsx are fully unreachable.

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs: `apps/student/LessonSession.tsx`, `ListenTap.tsx`, `SentenceScramble.tsx`.

- **F1 · P2 — Dead code ships kid-facing defects in the bundle.** Hardcoded fake HUD hearts ("5" FlashMatch.tsx:129-131, "4" ListenTap.tsx:100-103), a dicebear mascot URL (ListenTap.tsx:113), hardcoded completion stats (`{xp:5, accuracy:(lives/5)*100}` LessonSession.tsx:87), Spanish-era comments. Unreachable today, but any future route change re-exposes them.
- **F2 · P3 — The parent-Check-button contract they implement is superseded** by the battery's self-completing contract — keeping both invites confusion in audits and onboarding.
- **Recommendation (owner decision, `_CROSS-CUTTING.md` #2):** delete LessonSession + ListenTap + SentenceScramble + the embedded-mode props of PronunciationCoach/FlashMatch, OR archive under `apps/student/legacy/` with a README. Do NOT redesign. Deletion touches no live route (verified above); the gauntlet covers it.

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a Architectural & code quality audit (Documentation Note)
- **F1 · P2 — Dead code surface: Unreachable pre-battery lesson runner and obsolete exercise trio.**
  - *Evidence:* `apps/student/LessonSession.tsx` (195 ln), `ListenTap.tsx` (223 ln), `SentenceScramble.tsx` (223 ln), and legacy embedded modes of `FlashMatch.tsx` and `PronunciationCoach.tsx` (`§1`, `§3`). Grep confirms no live route or user action navigates to `/student/lesson`. Legacy view keys (`'lesson'`, `'listen'`, `'scramble'`) in `StudentApp.tsx:354-360` explicitly redirect to the v3 `solo-lesson` (`LessonShell` / `ExerciseRunner`).
  - *Defects Preserved in Dead Code:* Hardcoded fake HUD hearts ("5" in `FlashMatch.tsx:129`, "4" in `ListenTap.tsx:100`), dead Dicebear avatar URLs, hardcoded session scores, and an obsolete parent-Check-button harness that contradicts the unified `ExerciseRunner` contract.
  - *Concrete Recommendation:* **Full Deletion / Archival.** Delete `LessonSession.tsx`, `ListenTap.tsx`, and `SentenceScramble.tsx`, and strip the dead `embedded` prop branches from `PronunciationCoach` and `FlashMatch`. If historical reference is required, archive under `apps/student/legacy/` with an explanatory `README.md`. Under no circumstances should this surface receive Stitch redesigns or engineering maintenance.

### 4.b Workflow & user flow
- Unreachable. Zero impact on live learner journeys.

### 4.c Pedagogical practice
- Superseded by the v3 `ExerciseRunner` battery (`12-exercise-battery.md`, `13-choice-exercise.md`, `14-word-bank-build.md`), which properly implements FSRS memory scheduling and real hearts economy.

### 4.d Game interaction
- Obsolete.

### 4.e Top-5 prioritized recommendations
1. **Delete Dead Code Files (P2):** Remove `LessonSession.tsx`, `ListenTap.tsx`, and `SentenceScramble.tsx` to reduce bundle weight and prevent maintenance confusion.
2. **Clean Up Unused Embedded Mode Props (P2):** Strip `embedded` props and parent-Check callbacks from `PronunciationCoach.tsx` and `FlashMatch.tsx`.
3. **Remove Dead Route from Router (P3):** Clean `/student/lesson` out of `StudentApp.tsx` router configuration.
4. **Preserve Audio / Word Bank Logic in Shared Battery (P3):** Verify that all valid exercise capabilities from legacy trio are already fully represented in `ExerciseRunner` (files 13–15).
5. **No Stitch Designs (P3):** Mark as permanently excluded from Stitch visual generation pipeline.

### 4.f Stitch design log (AG fills as it generates)
*No designs required — legacy dead code scheduled for deletion/archival.*

## §5 ZCode design verification (inside Stitch)

<ZCode fills after AG reports designs done: list_screens result, title verification against §4.f, export paths (`stitch/<NN>-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

<Owner's verdict per screen: approved / revise (what to change). No implementation starts before an explicit go on THIS game's designs.>

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
