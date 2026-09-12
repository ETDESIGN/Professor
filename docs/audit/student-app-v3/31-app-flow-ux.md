# App Flow & UX — the Whole-Journey Critic Audit (`ALL SURFACES`)

> **Status:** audit-only file (no Stitch screens)
> **Current status:** file-ready
> **Owner priority (2026-09-13):** AG's §4 here is the flagship deliverable of the audit phase — the app-general user-flow/UX critique.

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

- **Surface / route:** THE WHOLE STUDENT APP — the end-to-end child journey: login → home (01) → lesson loop (02–19) → practice arena (26) + games (20–25) → rewards (27) + tabs (28)
- **Exercise types consumed:** all (this file audits FLOW, not content)
- **Data sources:** n/a — the journey across them
- **Scoring & data writes:** n/a — but every award-pattern boundary in the journey is in scope (see _CROSS-CUTTING #5)
- **Reachability:** the child's real life with the app: first login, daily return, homework, lesson, practice, reward, next day
- **Theme today:** wa-* home world → duo-* lesson world (the mix the owner wants designed)

- **Surface / route:** `<route + component path>`
- **Exercise types consumed:** `<pool exercise types / manifest fields / none>`
- **Data sources:** `<pool_items / unit manifest via getVocabulary/getStory / get_unit_bundle / localStorage …>`
- **Scoring & data writes:** `<exact write calls with file:line — SACRED>`
- **Reachability:** `<how a child reaches this surface>`
- **Theme today:** `<wa-* light | slate/duo mix | dark>`

## §1 How the game works today

*(ZCode's map of the journey — AG audits AGAINST and BEYOND this.)*

**First run:** login (passport username/password or QR) → possibly Join Class (6-char code modal, atlas/CodeInput) → HomeMap empty state → join → units appear.
**Daily loop:** Home (quests header, homework cards, unit path w/ locked/active/completed nodes) → tap active node → SoloLessonPlayer (INTRO_SPLASH → input steps (WordLab/Media/Story/Grammar) → practice steps (engines or battery) → …) → LessonComplete → finalize (XP/gems/quests) → home (node now starred).
**Practice side-track:** floating Practice FAB → PracticeMenu → 6 standalone modes (Speaking/Reading/Phonics/FastVocab/SpellingBee/SRS) → own flows → mostly back to practice/menu; SRS exits straight home (no reward interstitial — 23 F2).
**Reward loop:** Quests tab (claim), Shop (spend gems, avatar studio), Profile (stats), Leaderboard (weekly league).
**State boundaries a child crosses:** battery real-hearts vs shell fake-hearts (02 F1); exit-anywhere-without-confirm (02 F2); stage stars only on natural completion; streak checked at app open; mastery/cracked computed at home load (01 F1).
**Known journey gaps from my audit:** out-of-hearts advice has no action (12 F2); SRS no celebration (23 F2); Phonics needs an invisible precondition (22 F1); Pronunciation has no content (25 F1); gem gate unreachable from lessons (27 F1).

## §2 Owner comments (verbatim)

> **(2026-09-13)** "Anti-Gravity's job is really to work as a critic, especially on the user flow / user experience part of the audit … focus very much on user flow, user experience of the app in general in terms of functionality, user flow, pedagogic flow and user interface." — the owner, defining this file's §4 mandate.

## §3 ZCode code-level findings

ZCode's cross-cutting findings live in `_CROSS-CUTTING.md` (owner decisions + discipline rules) and per-game in each file's §3. For THIS file, do not restate per-game bugs — audit the JOURNEY: onboarding clarity, orientation ("where am I?"), recovery from failure/interruption, pacing across a session, the motivation economy (XP/gems/streaks/quests/hearts/stars/crowns — one coherent system or seven competing ones?), the handoffs between the wa-* home world and duo-* lesson world, portrait/landscape and one-handed realities, and what a tired 6-y/o at 8pm experiences versus a sharp 11-y/o.

## §4 ⬜ Anti-Gravity quality audit

> **AG: this file is your APP-LEVEL critic surface — the owner's explicit priority (2026-09-13). No Stitch screens are generated from this file; it is audit-only.**
>
> ### 4.a The child's journey (first run → daily loop → weekly loop): friction, confusion, dead-ends
> ### 4.b Orientation & wayfinding: does the child always know where they are, what just happened, what's next?
> ### 4.c Motivation economy: XP / gems / streaks / quests / hearts / stars / crowns — one coherent system or competing ones?
> ### 4.d Pedagogic arc across a session: input→practice→review rhythm, cognitive load, pacing
> ### 4.e Theme coherence: wa-* home × duo-* lessons — how the owner's MIX should behave at every boundary
> ### 4.f Top-10 prioritized journey fixes (cross-game, naming the games affected)
>
> Ground every finding in the per-game §1/§3 and the journey map above; mark anything you could not verify as "Information needed". Markdown only, no code.>

## §5 Not used (audit-only file — no Stitch screens)

—>

## §6 Not used (audit-only file)

—>

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
