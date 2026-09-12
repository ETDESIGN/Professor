# Spelling Bee — In-Lesson Step — v3 Quality Audit (`SPELLING_BEE (engine)`)

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

- **F1 · P1 — Timeout ends the entire run for a child alone.** The SPLIT rule (:170-174) is the standalone original's tension knob, but here it sits inside a LESSON: one expired clock kills all remaining rounds/words of the step and jumps to results. The board twin reveals + advances (teaching beat). For a 6-8 y/o at home this is the harshest single interaction in the app. **OWNER DECISION 2026-09-13: delegated to Anti-Gravity — AG studies both modes (hard end vs reveal+continue, plus hybrids: timeout costs the word but not the run, mercy extensions, age-linked defaults) and recommends the best solo-app tension rule in this file's §4 with rationale. The standalone game (file 21) may legitimately keep a harder rule than the lesson step.**
- **F2 · P2 — 15s default clock with no solo mercy.** Plan-time setting only (:42,74); the standalone twin has timer-off + 25s slow mode (localStorage), the lesson step takes whatever the teacher planned — a plan defaulting to 15s is tight for young home spellers (each wrong letter also burns 1s).
- **F3 · P3 — Round interstitial badge row assumes `wordsPerRound` slots** (:283-299) — fine, but badges truncate long words (`w-12 truncate`).
- **F4 · P3 — Exit mid-round no confirmation** (:384).
- **F5 · P3 — Empty-pool error screen text is teacher-flavored** ("continue with the lesson for now" — OK in-lesson; just noting copy tone).

**Works well:** the shared engine already carries the board v3 fixes (presentation beat, consolidation holds, deterministic narrowing, StrictMode-safe clock) — this surface inherits them for free.

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Saturated dark honeycomb board breaks continuity with light lesson shell.** (Evidence: §0, §1, `SpellingBeeStep.tsx:266-372`). Spelling Bee switches the display into a pitch-black `slate-900` canvas. While the amber honeycomb theme has strong personality, the heavy black container jars against the warm Wonder Atlas lesson world. *Recommendation: Translate the honeycomb motif into the Wonder Atlas light palette: warm cream canvas (`#EAE0D0`), honey-amber active letter tiles (`#E9C46A`), paper card keyboard keys (`#FDFBF7`), and crisp teal feedback badges.*
- **F2 · P2 — Keyboard key hit targets dip below 44px on compact phones.** (Evidence: §1, `components/games/spellingBee/keyboardEngine.ts`). Although the adaptive keyboard engine narrows the key pool, lines with 8+ keys compress key widths to ~38px on a 390px viewport. Young kids tapping rapidly make frequent adjacent-key typos. *Recommendation: Enforce minimum 44px key touch targets with 2-row staggered layouts and generous vertical spacing.*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P1 — Special Assignment: Evaluation of the In-Lesson Timeout Tension Rule (F1).**
  - **Context & Problem:** The current in-lesson step executes the "SPLIT fail rule" (`SpellingBeeStep.tsx:170-174`): if the timer expires on ANY single word, it triggers `forceComplete -> finishRun(true)` after 1.8s. A child who hesitates for 15 seconds on Word 2 of Round 1 immediately sees all remaining words and rounds canceled, receiving a humiliating 1-star lesson failure. In solo study at home, this is devastating and causes immediate tears and abandonment.
  - **Evaluation of Alternatives:**
    1. *Hard-End (Current Code):* Catastrophic for solo home homework. Destroys planned vocabulary exposure, corrupts stage completion stars, and penalizes typing hesitation with total failure. **Verdict: Completely unacceptable for in-lesson steps.**
    2. *Reveal + Continue (Board Model):* When the clock hits 0:00, the word is marked missed (`recordAnswer(false)`), the correct spelling is revealed with audio playback for 2.0s, and the game automatically advances to the next word in the round. **Verdict: Pedagogically sound, guarantees full unit exposure, and eliminates dead-ends.**
    3. *Hybrids (Mercy Extensions / Re-queue):*
       - *Mercy Overtime:* Clock pulses amber at 0s, giving +5s overtime with no speed bonus.
       - *End-of-Round Re-queue:* Words missed via timeout re-enter a 1-chance un-timed redemption queue at the end of the round.
  - **Anti-Gravity Concrete Recommendation:** **Adopt "Timeout Costs Word + Audio Reveal + Continue" for the in-lesson step, while reserving Hard-End / Sudden Death for the standalone practice game (file 21).**
    - *In-Lesson Rule:* A timeout NEVER terminates the lesson step. It costs that specific word (0 score, `recordAnswer(false)`), triggers an acoustic pronunciation and visual spelling reveal hold (2.2s), and advances to the next word.
    - *Rationale:* Lessons are curricular instruction and homework completion; practice games are arcade skill challenges. A child doing homework must never be locked out of seeing their vocabulary words because of a typing delay.
- **F4 · P3 — Truncated word badges on round completion interstitial.** (Evidence: §3 F3, `SpellingBeeStep.tsx:283-299`). Completed word chips in the round summary use `w-12 truncate`, rendering words like "elephant" as "eleph...". *Recommendation: Allow badge chips to size dynamically to word length with `px-3 min-w-14`.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P2 — Double penalty: wrong letters burn both points and clock time.** (Evidence: §1, §3 F2, `SpellingBeeStep.tsx:42,74`). When a child taps an incorrect letter, they are penalized with `-MISTAKE_PENALTY` points AND the countdown clock is reduced by 1 second. For a 7-year-old child typing on a touchscreen, a simple typo creates compounding panic. *Recommendation: Remove the -1s clock penalty in-lesson; penalize mistakes only in score points, giving the child the full clock duration to self-correct.*
- **F6 · P2 — Default 15s timer is too tight for beginning typists.** (Evidence: §1, §3 F2). Finding letters on an on-screen keyboard is a separate cognitive skill from knowing how to spell the word. *Recommendation: Extend default in-lesson timer to 20s, and allow teachers or students to enable "Relaxed Mode" (timer off or 30s).*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F7 · P3 — Unconfirmed exit drops all stage progress.** (Evidence: §1, §3 F4, `SpellingBeeStep.tsx:384`). Tapping the chevron exit button instantly unmounts the player and discards all completed rounds. *Recommendation: Intercept with the standard exit confirmation modal.*

### 4.e Top-5 prioritized recommendations
1. **[P1] Abolish the in-lesson hard-end timeout rule:** Replace catastrophic run termination with the "Timeout Costs Word + Reveal + Continue" rule so no solo child is locked out of their homework.
2. **[P2] Relax default in-lesson timer to 20s and eliminate the 1s mistake time penalty:** Decouple typing motor friction from time penalties.
3. **[P2] Reskin honeycomb board into Wonder Atlas light theme:** Warm cream background `#EAE0D0`, honey-amber tiles `#E9C46A`, and clean paper card keys `#FDFBF7`.
4. **[P2] Enforce ≥44px keyboard touch targets on mobile:** Ensure reliable, frustration-free letter tapping for young fingers.
5. **[P3] Fix round badge word truncation and add exit confirmation:** Allow full word spelling visibility on victory cards and protect against accidental exits.

### 4.f Stitch design log (AG fills as it generates)
*(Phase 1 audit complete. Stitch designs will be generated in Phase 2 for the light Wonder Atlas honeycomb board and the timeout teaching reveal state.)*

## §5 ZCode design verification (inside Stitch)

<ZCode fills after AG reports designs done: list_screens result, title verification against §4.f, export paths (`stitch/<NN>-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

<Owner's verdict per screen: approved / revise (what to change). No implementation starts before an explicit go on THIS game's designs.>

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
