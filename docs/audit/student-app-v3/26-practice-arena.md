# Practice Arena — v3 Quality Audit (`SURFACE: /student/practice`)
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

- **Surface / route:** `/student/practice` — `apps/student/PracticeMenu.tsx` (202 ln)
- **Exercise types consumed:** none (menu)
- **Data sources:** `Engine.fetchSRSItems()` for the SRS due-count badge (error → badge hidden)
- **Scoring & data writes:** none
- **Reachability:** Home floating LayoutGrid FAB (disabled when no units) + map "cracked" chip
- **Theme today:** slate-50 grid: Listening (disabled "Soon"), Speaking→/pronounce, Reading→/reading, Phonics Fly→/phonics, Fast Vocab, Spelling Bee, SRS (badge), "Grammar · Soon" disabled; footer note

## §1 How the game works today

*(Screenshots pending.)*

PracticeMenu (`PracticeMenu.tsx`): header + 2-col grid of tiles — Listening (DISABLED "Soon" :63-74), Speaking → /pronounce, Reading → /reading, Phonics Fly → /phonics, Fast Vocab, Spelling Bee, SRS Review (red due-count badge from `Engine.fetchSRSItems`, error → badge silently hidden :18-30), "Grammar · Soon" disabled, footer note. Navigation only; no writes.

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/PracticeMenu.tsx`.

- **F1 · P3 — Two dead tiles with no timeline** — "Soon" placeholders with no content plan attached (listening has no route — audit P0-6 legacy).
- **F2 · P3 — SRS badge error is silent** (:24-26) — a fetch failure just hides the count; acceptable, note only.
- **F3 · P3 — No per-tile unit context** — tiles don't indicate which unit Phonics will use (ties to file 22 F1's invisible activeUnit precondition).
- **F4 · P3 — Tile subtitles are English-only small text** — fine for most; verify ≥14px after redesign.

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P1 — Unclickable "Coming Soon" dead cards occupy prime screen real estate.**
  - *Evidence:* `PracticeMenu.tsx:63-74, 91-102` (`F1`). The first and third cards in the 2-column grid are "Listening" and "Grammar", both permanently disabled with greyed-out opacity and tiny "Soon" chips. On mobile screens (~390px wide), half the immediately visible viewport consists of unclickable buttons. For young learners, tapping disabled buttons creates immediate confusion and the perception that the app is broken.
  - *Recommendation:* Remove unbuilt tiles from the primary active grid. Relocate them to a subtle "In the Workshop 🚧" footer drawer or hide them entirely until routes are functional.
- **F2 · P2 — Misleading "Feather" icon and obsolete "Phonics Fly" naming.**
  - *Evidence:* `PracticeMenu.tsx:127-129` renders a `Feather` icon for a tile labeled "Phonics Fly". This is dead legacy nomenclature from an abandoned flying-bird mechanic. The underlying route now trains minimal-pair acoustic discrimination.
  - *Recommendation:* Retitle to "Phonics Lab" (or "Sound Detective") and replace the feather with acoustic perception iconography (`Headphones` / `Volume2` / `Ear`).

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P1 — Invisible active unit context leads to blind navigation.**
  - *Evidence:* `PracticeMenu.tsx:60-178` (`F3`). Tiles like Phonics, Reading, and Speaking depend on `state.activeUnit`. However, the Practice Menu displays no indicator of which unit is active. A student tapping into "Reading" has no idea what story they are about to read or if the active unit even has content.
  - *Recommendation:* Place a persistent "Active Unit: Unit X — Title" banner at the top of the Arena with a quick-switch dropdown, allowing children to intentionally direct their practice.
- **F4 · P2 — Missing content-readiness badges on non-SRS tiles.**
  - *Evidence:* `PracticeMenu.tsx:168-172`. Only the SRS Review card displays a due-count badge. Phonics, Speaking, and Reading display no item counts or progress signals, forcing children to tap blindly only to encounter empty states.
  - *Recommendation:* Display live readiness badges on all tiles (e.g. `8 pairs ready`, `1 story available`, `5 speaking cards`).

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P1 — Unstructured menu taxomony conflates daily habit, skill gym, and arcade play.**
  - *Evidence:* `PracticeMenu.tsx:60-178`. The 2-column grid presents an undifferentiated soup of activities: memory maintenance (SRS), receptive skills (Reading), productive skills (Speaking), and arcade games (Fast Vocab, Spelling Bee). Children aged 6–12 lack the executive function to structure a balanced practice session from a flat grid.
  - *Recommendation:* Organize the Practice Arena into three clear pedagogical tiers:
    1. **Daily Habit (Top Priority):** SRS Spaced Review & Phonics Lab (streak & memory maintenance).
    2. **Skill Studio:** Speaking Coach & Storybook Reader (deep literacy).
    3. **Arcade Zone:** Fast Vocab & Spelling Bee (speed, reflexes, high-score chase).

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F6 · P2 — Absence of Arena XP incentives or daily practice milestones.**
  - *Evidence:* `PracticeMenu.tsx:43-55`. The screen acts as a plain folder list with no gamification, streak indicators, or daily practice rewards.
  - *Recommendation:* Introduce a "Daily Training Bonus" banner (e.g., *"Train 2 skills today for +20 XP and a Mystery Chest!"*) to stimulate proactive solo practice outside homework assignments.

### 4.e Top-5 prioritized recommendations
1. **Remove / Relocate "Coming Soon" Dead Cards (P1):** Clear the primary grid of unclickable Listening and Grammar tiles so every visible button works.
2. **Pedagogical Tiering (P1):** Reorganize the flat grid into Daily Habit (SRS/Phonics), Skill Studio (Speaking/Reading), and Arcade Zone (Vocab/Spelling).
3. **Active Unit Context & Quick-Switch (P1):** Add an active unit banner showing current unit content and allowing one-tap switching.
4. **Update Phonics Branding & Iconography (P2):** Change "Phonics Fly" and the feather icon to "Phonics Lab" with headphones/soundwave visuals.
5. **Content Readiness Badges (P2):** Show card/story counts on all tiles so learners know what is playable before tapping.

### 4.f Stitch design log (AG fills as it generates)
*Stitch mobile screens for Practice Arena will be generated in the design phase following owner approval.*

## §5 ZCode design verification (inside Stitch)

<ZCode fills after AG reports designs done: list_screens result, title verification against §4.f, export paths (`stitch/<NN>-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

<Owner's verdict per screen: approved / revise (what to change). No implementation starts before an explicit go on THIS game's designs.>

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
