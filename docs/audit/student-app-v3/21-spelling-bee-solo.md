# Spelling Bee Solo — Standalone Practice — v3 Quality Audit (`PRACTICE ARENA / STANDALONE`)

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

- **Surface / route:** `/student/spelling-bee` (Practice Arena) — `apps/student/SpellingBeeGame.tsx` (621 ln) + shared engine (same as file 11)
- **Exercise types consumed:** pool_items IMAGE_SELECT/MEANING_MATCH/DICTATION → get_unit_bundle vocab fallback
- **Data sources:** unit picker → pool; solo settings in localStorage `spellingbee-settings` {timer on/off, slow (25s vs 15s), removal}; personal best `spellingbee-best-<unitId>`
- **Scoring & data writes (SACRED, pattern A):** same math locally; **timeout ENDS THE RUN** (split fail rule); ONE-TIME end award via GamificationService (awardedRef latch)
- **Reachability:** Practice Arena → Spelling Bee tile
- **Theme today:** slate-900 dark; settings panel on unit select; same stage as file 11

## §1 How the game works today

*(Screenshots pending.)*

The standalone Spelling Bee (`SpellingBeeGame.tsx`) — same shared engine as file 11 plus: unit picker, persisted solo settings (timer on/off, slow mode 25s vs normal 15s, letter removal — localStorage `spellingbee-settings` :46-121), per-unit personal best, and pattern-A one-time end award. The SPLIT fail rule applies here too: **a timeout ends the run** (header :12-13). Presentation beat + holds inherited from the shared engine.

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/SpellingBeeGame.tsx`.

- **F1 · P1 (owner decision) — Timeout ends the run, with mitigations available but off by default.** Timer-on + 15s is the default (`DEFAULT_SETTINGS` :55); slow-25s and timer-off exist but a kid (or parent) must find Settings. If the tension rule stays here (reasonable for the arcade standalone), the defaults are still the kid-alone question — see file 11 F1: **the rule decision is delegated to AG (owner 2026-09-13); the solo game may end harder than the lesson step.**
- **F2 · P3 — Settings panel is text-toggles** — fine functionally; ensure the redesigned surface keeps them reachable pre-run (thumb zone).
- **F3 · P3 — Same no-exit-confirm and unit-list findings as file 20 (F1/F2).**
- **F4 · P3 — Keyboard narrowing is deterministic per unit** (inherited) — replays narrow identically; consider per-run seeds in solo for freshness (board re-seeds per turn).

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Dark honeycomb board clashes with Practice Arena paper theme.** (Evidence: §0, §1, `SpellingBeeGame.tsx`). Plunging from the light Practice Arena into a black `slate-900` canvas jars the child's visual experience. *Recommendation: Reskin the standalone honeycomb board into Wonder Atlas light tokens: warm cream canvas (`#EAE0D0`), golden honey letter tiles (`#E9C46A`), paper card keyboard keys (`#FDFBF7`), and emerald/teal feedback states.*
- **F2 · P3 — Hidden text-based settings toggles.** (Evidence: §1, §3 F2, `SpellingBeeGame.tsx:50-121`). Settings (timer on/off, slow mode, letter removal) are buried inside an unobtrusive text-toggle panel on the unit select screen. Most kids never notice them. *Recommendation: Elevate gameplay modes into prominent tactile mode pills on the pre-game lobby: "⚡ Arcade Run (15s)", "🐢 Relaxed (25s)", and "🧘 Untimed Practice".*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P1 — Evaluation of Standalone Tension Rule vs In-Lesson Rule.**
  - **Context:** In standalone mode, `timeout ENDS THE RUN` (F1). Unlike the in-lesson homework step (file 11) where run termination is destructive, in standalone practice, Sudden Death is an accepted arcade survival mechanic for competitive high-score chasing.
  - **Verdict & Recommendation:** Retain Sudden Death for the standalone game's "Arcade Run" mode, BUT:
    1. Do not default unsuspecting 6–8 year olds into an unforgiving 15s Sudden Death run without warning.
    2. Make the pre-game lobby explicitly allow selecting "Arcade Run (Sudden Death)" vs "Practice Mode (Continue on Timeout)".
- **F4 · P2 — Unconfirmed back navigation wipes pattern A rewards.** (Evidence: §1, §3 F3). Tapping exit during round 2 or 3 discards all earned XP, gems, and quests without warning. *Recommendation: Intercept the back button with a confirmation modal.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P2 — Deterministic keyboard narrowing eliminates replay variety.** (Evidence: §3 F4). Narrowed keyboard distractor keys are seeded deterministically by `unitId`. Every replay of Unit 3 produces the exact same layout of keyboard letters. Children memorize spatial button taps rather than reading the letters. *Recommendation: Seed keyboard distractor selection using a random per-game session seed so replays remain cognitively fresh.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F6 · P3 — Underwhelming personal best celebration.** (Evidence: §1). Beating a high score only updates text values. In an arcade spelling game, breaking a record should feel momentous. *Recommendation: Trigger a golden honeycomb victory fanfare with flying honey drops, coin particles, and a proud mascot trophy animation.*

### 4.e Top-5 prioritized recommendations
1. **[P1] Expose prominent pre-game mode pills (Arcade 15s vs Relaxed 25s vs Untimed):** Let kids consciously choose their tension level before launching the game.
2. **[P2] Add exit-confirmation modal:** Protect solo players from accidental session aborts and lost pattern A rewards.
3. **[P2] Re-seed keyboard distractor narrowing per game session:** Prevent spatial muscle-memory memorization on replays.
4. **[P2] Reskin into Wonder Atlas golden honeycomb light palette:** Cream canvas `#EAE0D0`, warm honey tiles `#E9C46A`, and paper card keys `#FDFBF7`.
5. **[P3] Celebrate new personal bests with animated trophy and gem fanfare:** Maximize intrinsic pride and motivation in voluntary practice.

### 4.f Stitch design log (AG fills as it generates)
*(Phase 1 audit complete. Stitch designs will be generated in Phase 2 for the standalone pre-game mode lobby and the light Wonder Atlas honeycomb game board.)*

## §5 ZCode design verification (inside Stitch)

<ZCode fills after AG reports designs done: list_screens result, title verification against §4.f, export paths (`stitch/<NN>-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

<Owner's verdict per screen: approved / revise (what to change). No implementation starts before an explicit go on THIS game's designs.>

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
