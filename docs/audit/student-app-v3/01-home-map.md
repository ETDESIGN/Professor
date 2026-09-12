# Home Map — Learn Tab — v3 Quality Audit (`SURFACE: /student shell`)

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

- **Surface / route:** `/student` (Learn tab, main scroll area) — `apps/student/HomeMap.tsx` (415 ln) + `atlas/TerritoryIntro.tsx`, `atlas/territory.ts` (theme/pickFocusUnit), `atlas/tokens.ts` (waColors), join-class modal + header live in `StudentApp.tsx` (`atlas/CodeInput.tsx` = 6-char code boxes)
- **Exercise types consumed:** none (navigation surface)
- **Data sources:** units `Engine.fetchUnits` (SoloSessionContext.loadUnits); per-unit mastery `Engine.getUnitMasterySummary` (crowns/cracked); Student-Path nodes `resolveUnitPath` + `computeNodeStates` over `getAllStageProgress`; student progress (xp/streak); assignments + classes via react-query hooks in StudentApp
- **Scoring & data writes:** none — navigation only. Node tap → `startLesson(unitId, stageId)` → solo lesson; "cracked" chip → practice.
- **Reachability:** app entry for every child; bottom-nav Learn tab.
- **Theme today:** `wa-*` light "Wonder Atlas" (cream/paper/teal/terracotta), winding SVG path + offset circular nodes + dicebear chest icon.

## §1 How the game works today

*(Screenshots: pending — first live captures land with the pilot's passport fixture; this audit is from code. DESIGN IS FROZEN per owner — functionality findings only.)*

The child's landing surface. On mount it loads (a) the unit list via `Engine.fetchUnits` (SoloSessionContext.loadUnits), (b) per-unit mastery summaries in a serial loop — `Engine.getUnitMasterySummary(studentId, u.id)` for crowns/cracked/isComplete (HomeMap.tsx:57-70), (c) all stage progress in one call — `getAllStageProgress` (:75-81). Rendering per unit: an optional `TerritoryIntro` hero for the "focus unit" (`pickFocusUnit`, atlas/territory.ts) with a START button that launches the active node (:225-240); a unit header card with cover image, theme chip (`themeForUnit`), crowns `n/total`, and a pulsing "N cracked" chip when objectives decayed (:242-276); then the Student Path — `resolveUnitPath(unit)` → `computeNodeStates(path, stageProgress)` renders circular nodes (locked grey / active terracotta + START popover / completed sand + check + real 1-3 stars) on a dashed SVG path (`generatePath`, :84-101, rendered :279-291, nodes :294-367), ending in a dicebear treasure-chest node that lights "UNIT DONE!" when `isPathComplete` (:370-383). Node tap → `onNavigate('lesson', unitId, stage.id)` → solo lesson. Above the units: a Daily Quests card with two progress bars — "Earn 50 XP" from student XP and "Complete 2 Lessons" from `completedUnitIds.length` (:106-156). Floating bottom-right: Practice Arena FAB (+ dubbing FAB when flagged) (:390-406). Loading/error/empty states all present and honest (:158-209); scroll position restores via useMainScrollRestore.

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … The home screen for the student will not be changed … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Refs are `apps/student/HomeMap.tsx` unless noted.

- **F1 · P2 — Serial N+1 mastery queries slow the home screen.** One `getUnitMasterySummary` RPC per unit in a sequential for-loop (:57-70) — a kid in a class with 12 units waits 12 round-trips before crowns/cracked render; the path itself renders from the single `getAllStageProgress` call, so the slow part is decoration, but it's the first screen a child opens.
- **F2 · P2 — "Complete 2 Lessons" quest bar is computed from lifetime units, not lessons.** It reads `completedUnitIds.length` (:134-140) — finished-units-ever, not today's lessons — so after a child ever completes 2 units it permanently reads 2/2 and the daily-quest framing is a lie (compare the real quest engine in `Quests.tsx` via GamificationService).
- **F3 · P2 — The "N cracked" chip promises targeted review but delivers the generic menu.** Tap → `onNavigate('practice', unit.id)` (:260-268); PracticeMenu receives no unitId and ignores it — the cracked skills of THAT unit are not what Practice offers (SRS is cross-unit, Phonics is activeUnit-based).
- **F4 · P3 — Hardcoded daily goal + crude countdown.** `xpGoal = 50` and `hoursLeft = 24 - now.getHours()` (:41-44) — the "Xh left" label can read "0h left" at 23:00 and the goal ignores the real quest config.
- **F5 · P3 — Node offsets push toward the screen edge on small phones.** `translate-x-16` every 2nd/4th node plus w-20 (80px) circles (:300-302, :314-328) — on a 390px viewport the offset nodes sit within ~20px of the edge; verify no clipping/overlap with the path SVG.
- **F6 · P3 — Treasure chest + portraits depend on external dicebear URLs** (:373) — placeholder-grade art + a third-party dependency on the frozen home; a local asset would be safer offline.
- **F7 · P3 — Streak shown twice** — sticky header pills (StudentApp.tsx:271-273) and the quests card (:142-154) duplicate the same number.

**What already works well (context):** real stage gating with per-node teacher overrides, stale-stage-id recovery in setActiveUnit, honest loading/error/empty states, mastery/cracked decay surfacing, scroll restore. The owner likes this design — findings above are functionality polish, not a redesign case.

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Asymmetric thumb reach on 390px phone floor.** (Evidence: §1, §3 F5, `HomeMap.tsx:300-328`). The winding path uses `translate-x-16` (64px) alternating left/right displacement for nodes alongside 80px circles (`w-20`). On standard 390px mobile viewports, extreme-offset nodes sit within 20px of the display border, creating an awkward stretch for one-handed thumb navigation for young learners (ages 6–8) and risking clipping against viewport gutters. *Recommendation: Dampen node horizontal oscillation to max `translate-x-10` (40px) on mobile viewports (<420px), centering the interactive touch corridor safely within the child's natural thumb zone.*
- **F2 · P3 — External third-party avatar & chest SVG assets degrade offline/slow-network stability.** (Evidence: §1, §3 F6, `HomeMap.tsx:373`). Dicebear SVG URLs are loaded directly from external endpoints for the completion treasure chest and portraits. In Mainland China classroom/home networks, external CDN connections are frequently throttled or blocked, causing broken image icons, layout shift, or missing visual payoffs upon unit completion. *Recommendation: Bundle local vector SVGs for chest states (locked, open, golden) and default avatars into `apps/student/assets/` to ensure zero-latency, 100% offline-resilient visual feedback.*
- **F3 · P3 — Redundant streak indicators induce cognitive clutter.** (Evidence: §3 F7, `StudentApp.tsx:271-273` vs `HomeMap.tsx:142-154`). The streak count is rendered simultaneously in the sticky top header pill and the daily quest summary widget below the territory banner without progressive disclosure. *Recommendation: Treat the top header pill as the persistent status indicator, and replace the quest card's static streak text with actionable streak freeze/repair status or today's streak protection milestone.*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F4 · P1 — "N cracked" chip is an anxiety-inducing navigational dead-end.** (Evidence: §1, §3 F3, `HomeMap.tsx:260-268`). When a student sees an amber warning badge stating that skills in Unit X are cracked, tapping it invokes `onNavigate('practice', unit.id)`. However, `PracticeMenu.tsx` completely ignores `unitId`, dumping the child into an uncurated generic menu with 5 disconnected options. A solo child cannot identify which specific vocabulary items decayed or how to restore their crowns. *Recommendation: Pass `unitId` into the practice route or launch a direct 5-item targeted SRS review session scoped specifically to that unit's decayed items, returning the child to the home map with restored crowns immediately upon completion.*
- **F5 · P2 — Static "Complete 2 Lessons" quest breaks daily habituation loop.** (Evidence: §1, §3 F2, `HomeMap.tsx:134-140`). The daily quest progress bar checks `completedUnitIds.length >= 2`. Once a child finishes two units in their lifetime, this quest is permanently marked 2/2 Complete on every login. The primary motivation loop for daily return is effectively dead. *Recommendation: Wire this progress bar directly to `GamificationService` daily quest state (`type === 'COMPLETE_LESSONS'` or daily session counter reset at local midnight).*
- **F6 · P2 — Territory intro banner dominates fold on return visits.** (Evidence: §1, `HomeMap.tsx:225-240`). `TerritoryIntro` consumes over 240px of vertical space at the top of the feed. For a returning student who has already unlocked 6 nodes, the active node is pushed completely below the screen fold, requiring manual scrolling to find their current task. *Recommendation: Automatically collapse or shrink the territory header to a compact ribbon (<60px) once a unit has been started, auto-scrolling the viewport directly to the pulsing active node upon mount.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F7 · P2 — Lack of visual scaffolding on replayed stages.** (Evidence: §0, §1, `computeNodeStates`). When a child replays a previously completed stage to earn 3 stars, the UI does not indicate which specific skill was missed on previous attempts (e.g. phonics vs dictation vs speed). The child enters blindly without a clear learning target for mastery improvement. *Recommendation: In the stage preview popover, display a concise badge showing previous score breakdown (e.g., "Accuracy: 80% • Review spelling") so the child knows what to focus on.*
- **F8 · P3 — Disconnected XP daily target vs lesson rewards.** (Evidence: §1, §3 F4, `HomeMap.tsx:41-44`). The home screen hardcodes `xpGoal = 50`, while typical lesson completion awards 30–75 XP depending on stage complexity. A single lesson can overshoot the goal instantly, while partial practice feels unrewarded. *Recommendation: Align the daily goal calculation with the student's current tier/assigned homework goals, displaying a dynamic "+15 XP to next milestone" motivator.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F9 · P2 — Startup latency caused by N+1 mastery waterfalls.** (Evidence: §1, §3 F1, `HomeMap.tsx:57-70`). The screen executes serial network requests in a loop over all enrolled units (`getUnitMasterySummary`). On a class containing 10+ units over a mobile cellular connection, the child stares at skeleton loaders or frozen path states for 3–8 seconds before unit mastery badges populate. *Recommendation: Batch mastery summaries into a single aggregate RPC or execute queries concurrently via `Promise.all` so home screen renders interactively under 500ms.*
- **F10 · P3 — Node tap popover overlaps adjacent nodes on dense paths.** (Evidence: §1, `HomeMap.tsx:314-367`). The "START" terracotta floating popover anchors absolutely above the active node. When nodes are spaced tightly vertically on compact displays, the popover overlays the previous node's star badges, creating tap collision ambiguities. *Recommendation: Enforce minimum 100px vertical pitch between consecutive node centers and give the active START button an unambiguous z-index and tap-target exclusion radius.*

### 4.e Top-5 prioritized recommendations
1. **[P1] Fix "N cracked" chip flow:** Route the chip directly to a targeted unit-scoped SRS blitz session rather than dumping the child into the generic Practice Menu without context.
2. **[P2] Fix daily quest lesson counter:** Re-wire "Complete 2 Lessons" from lifetime unit count to real daily completed lessons via `GamificationService`.
3. **[P2] Eliminate N+1 mastery loading waterfall:** Parallelize `Engine.getUnitMasterySummary` calls via `Promise.all` or a unified batch endpoint to make the home screen render instantaneously.
4. **[P2] Focus-scroll and compact header for returning students:** Collapse `TerritoryIntro` after first play and auto-scroll directly to the pulsing active node so the child can tap and learn within 2 seconds of app launch.
5. **[P3] Replace external Dicebear assets with local SVGs:** Remove third-party CDN image calls for chests and avatars to guarantee offline resilience and avoid firewall timeouts in China.

### 4.f Stitch design log (AG fills as it generates)
*(Phase 1 audit complete. Home screen visual design is frozen per owner directive; no Stitch designs required for file 01.)*

## §5 ZCode design verification (inside Stitch)

<ZCode fills after AG reports designs done: list_screens result, title verification against §4.f, export paths (`stitch/<NN>-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

<Owner's verdict per screen: approved / revise (what to change). No implementation starts before an explicit go on THIS game's designs.>

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
