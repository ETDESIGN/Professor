# Fast Vocab Solo — Standalone Practice — v3 Quality Audit (`PRACTICE ARENA / STANDALONE`)

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

- **Surface / route:** `/student/fast-vocab` (Practice Arena) — `apps/student/FastVocabGame.tsx` (561 ln) + shared engine (same as file 08)
- **Exercise types consumed:** pool_items IMAGE_SELECT + MEANING_MATCH
- **Data sources:** unit picker (screen 'select') → pool by unitId; "Longer cycle" pref (5-pair waves) in localStorage `fastvocab-longwaves`; personal best per unit `fastvocab-best-<unitId>`
- **Scoring & data writes (SACRED, pattern A):** same engine math locally (scoreForAttempt/−1) + `recordAnswer`; at run end `awardedRef`-latched ONE-TIME GamificationService award (XP + ◆ streak/star gems + Q) — parent never re-awards
- **Reachability:** Practice Arena → Fast Vocab tile
- **Theme today:** slate-900 dark; unit select grid; same HUD/wave UI as file 08

## §1 How the game works today

*(Screenshots pending.)*

The standalone Fast Vocab (`FastVocabGame.tsx`) — same shared engine as file 08 plus a unit-picker screen, a persisted "Longer cycle" preference (5-pair waves, localStorage `fastvocab-longwaves` :46-105), and a per-unit personal best (`fastvocab-best-<unitId>`). Pool load per unit (IMAGE_SELECT/MEANING_MATCH) with inline load-error message (:118-140+). Scoring: identical board math kept local + `recordAnswer`; at run end an `awardedRef`-latched ONE-TIME GamificationService award (XP + gems + quests — pattern A, header :1-10) so the parent never double-awards. Results screen: stars, score roll-up, best streak, accuracy, personal best.

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/FastVocabGame.tsx`.

- **F1 · P3 — Unit list is unfiltered and unsearchable** — every enrolled unit in one grid; long classes scroll.
- **F2 · P3 — Exit mid-run has no confirmation** (same accidental-loss class as shell F2 — pattern A means an abandoned run awards nothing).
- **F3 · P3 — The "Longer cycle" toggle lives on the picker** (:89-105) — discoverable only before a run; no mid-run wave-size escape.
- **F4 · P3 — Speed phase 10s fixed** (same as file 08 F1 — one pace for all ages).
- **F5 · P3 — Personal best is per-device (localStorage)** — device switches lose it; acceptable, note only.

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Disconnected dark canvas from Practice Arena hub.** (Evidence: §0, §1, `FastVocabGame.tsx`). Entering Fast Vocab from the warm, paper-themed Practice Arena (`/student/practice`) abruptly launches a pitch-black `slate-900` canvas. This jarring transition severs thematic harmony. *Recommendation: Reskin Fast Vocab Standalone in the Wonder Atlas arcade language: warm cream canvas (`#EAE0D0`), paper match cards (`#FDFBF7`), terracotta streak gauges (`#E76F51`), and crisp teal feedback highlights.*
- **F2 · P3 — Dense, unstructured unit picker grid.** (Evidence: §1, §3 F1, `FastVocabGame.tsx:46-88`). The unit selector lists all enrolled units in a single unfilterable grid. For students in multi-term classes with 15+ units, finding the desired unit requires extensive vertical scrolling. *Recommendation: Add a horizontal category filter (e.g. "Current Unit", "Recent", "All") and display each unit's personal best star/accuracy badge directly on its card.*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P2 — Unconfirmed exit completely forfeits pattern A reward payout.** (Evidence: §1, §3 F2). In standalone mode, XP, gems, and quests are self-awarded strictly upon run completion via an `awardedRef` latch. If a child accidentally taps the back arrow during wave 3 or 4, the entire session is discarded without saving any score or awards. *Recommendation: Guard the exit arrow with an explicit confirmation modal: "Leave practice? Progress will be lost!"*
- **F4 · P2 — Abrupt jump into 10s speed round creates anxiety.** (Evidence: §1, §3 F4). Like the in-lesson twin, the transition from matching to speed questions happens without a pause or countdown, disorienting young players. *Recommendation: Insert a 1.5s visual interstitial ("Speed Round! ⚡ Ready?") before the timer initiates.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P2 — Rigid 10s timer excludes struggling readers from voluntary practice.** (Evidence: §1, §3 F4). Standalone practice should be an encouraging space for lower-confidence learners to build fluency. A mandatory, unadjustable 10s timer causes anxiety and turns away slow decoders. *Recommendation: Add a "Pacing" toggle on the start screen allowing children to select between "Standard (10s)", "Relaxed (20s)", or "No Timer (Untimed)".*
- **F6 · P3 — LocalStorage personal best locks progress to a single device.** (Evidence: §3 F5). High scores do not sync if a child switches from a phone to a family tablet. *Recommendation: Store personal bests in the student profile metadata or learner state table when network is available, using localStorage purely as an offline fallback.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F7 · P3 — Subdued celebration for beating personal best.** (Evidence: §1). When a student achieves a new personal high score, the results screen simply updates the text label. *Recommendation: Trigger an ecstatic high-score fanfare with a golden trophy animation and celebratory gem shower to make breaking records feel extraordinary.*

### 4.e Top-5 prioritized recommendations
1. **[P1] Add a 3-2-1 countdown interstitial before speed rounds:** Ensure children are mentally ready before the countdown begins.
2. **[P2] Add exit-confirmation modal to protect pattern A awards:** Prevent accidental loss of earned XP and gems.
3. **[P2] Introduce a "Relaxed Mode" timer setting:** Allow solo learners to practice at their own pace without panic.
4. **[P2] Reskin into Wonder Atlas arcade light palette:** Unify the standalone game with the warm paper aesthetic of the Practice Arena.
5. **[P3] Enhance unit selector with personal best badges and category filtering:** Make choosing practice units intuitive and rewarding.

### 4.f Stitch design log (AG fills as it generates)

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Game Subsystem:** Fast Vocab Solo Standalone Practice (`20-fast-vocab-solo.md`)
- **Generation Date:** 2026-09-13
- **Submission Status:** 2 screens submitted and successfully materialized in Stitch datastore (HTTP 200 / Exit code 0).
- **Quota Discipline:** 2 screens generated (max 2 per game).

#### Screens Generated & Brief Summaries:

1. **Screen 1: Fast Vocab Solo Unit Picker & Preferences Lobby**
   - **Stitch Screen ID:** `dde10eb682324c7f808307b5cc20b751`
   - **Title:** `Professor ESL - Fast Vocab Solo Unit Picker`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1Ulfz_UMdS_nofszbiMRhsHiAdc_MABxSiudisgkBP6FWygJfr574gkNhXLhxj0LA2uA-NANhQWz-7F97zrQdomKWFn3EVOeFktUGJObK4P7g6YQprF8KouCU54_Nl2NCPk0Ig9FaAQY0XjDqgO8ekoaqsuFmieRS2ZhBKgD61M3IZ0SrVPsSpceJ4IrPb2_dLTdF26jOwlbp51czLMkyho9RF7RJRmI6YUXqm55EKp_d4WP_MXN5K9As`
   - **Prompt Summary:** Mobile portrait (390×844) Fast Vocab Solo standalone unit picker screen in Wonder Atlas Light design system. Universal 64px header on paper `#FDFBF7` with 48px rounded beveled back button (`[🔊 playCue: tap_back]`), title 'Fast Vocab Solo' in bold 20px Fredoka inkDeep `#1D3557`, and personal star tally `⭐ 184 Stars`. Subheader on cream `#EAE0D0` featuring segmented horizontal category pill selector with 'Current Unit (Active)' selected in teal `#2A9D8F` (`0 3px 0 #1E6F5C` bevel, `[🔊 playCue: tab_switch]`), plus 'Recent Units' and 'All Units'. Preferences card on paper `#FDFBF7` with tactile toggle for 'Longer Waves (5 pairs instead of 3)' and 'Pacing: Standard 10s' pill. Tactile Unit Card Stack (min 80px card height): Active Card 1 displays 'Unit 3: City Adventures & Transport', 12 vocab words, personal best badge `🏆 Best: 680 pts • ⭐⭐⭐`, 2.5px teal border, and 'READY TO PLAY' chip (`[🔊 playCue: card_select]`). Cards 2 & 3 show Units 2 and 1 with respective high score badges. Anchored 76px footer with 56px primary CTA 'START FAST VOCAB (UNIT 3) ⚡' in terracotta `#E76F51` with hard bevel `0 4px 0 #C4553B` (`[🔊 playCue: start_game]`).
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_back]` on header back button tap
     - `[🔊 playCue: tab_switch]` on category filter pill tap
     - `[🔊 playCue: card_select]` on unit card selection
     - `[🔊 playCue: start_game]` on primary CTA launch tap
   - **Design Contract:** Wonder Atlas warm tokens (cream `#EAE0D0`, paper `#FDFBF7`, border `#E2D7C3`, ink `#264653`, inkDeep `#1D3557`, teal `#2A9D8F`, terracotta `#E76F51`) × Duolingo accents (`#E91E63`, `#1CB0F6`), Fredoka + Nunito typography, production-grade Tailwind HTML + small style block, zero placeholder chrome.

2. **Screen 2: Fast Vocab Solo Mid-Game Match Wave 2/4 (Reusing Step's Light Identity)**
   - **Stitch Screen ID:** `00eb94502f4a43adae8e1ae4b08fde43`
   - **Title:** `Professor ESL - Fast Vocab Solo Mid-Game Wave 2/4`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1WfTHRVaYQjr3XrJY1uxnm6AddK7B41WjGgWos-VNbj-lxpL1OqAk5NbtoQ0Z7xriJWQ8Xkku2CDJmYu_lMsiDyervfCsFC6DwOOlitoM77oIvsmKA7yQ7F3ahTXEEdZFEajQ9DhD_kZBGoNlILPD-0B7pYw-ITEth4otDGGntKW_eEZmuvE0NpcEDNUuXFElqPdB84HmTb-IwzaaNg4Bk_EzY8dvlY4h_aB2dLcdm8xkmakgYG2KgQMW8`
   - **Prompt Summary:** Mobile portrait (390×844) Fast Vocab Solo mid-game match wave state in Wonder Atlas Light design system. Universal 64px header on paper `#FDFBF7` with 48px exit button (`[🔊 playCue: tap_exit]`), exit confirmation guard hint ('Safe Exit: Pattern A awards save on completion'), running score badge `⭐ 540 pts` in terracotta `#E76F51`, and combo streak chip `🔥 Streak x4`. Subheader HUD on cream `#EAE0D0`: amber badge `⚡ FAST VOCAB SOLO • WAVE 2/4` and wave pair counter `2/4 Pairs Locked`. 6-tile tactile paper card grid (2 cols × 3 rows, min 72px height, 3D bevel `0 4px 0 #E2D7C3`): Tile 1 ('traffic light' word card with IPA `[ˈtræfɪk laɪt]`) actively selected with emerald tint `#E6F4F1`, 2.5px teal border `#2A9D8F` (`[🔊 playCue: card_select]`). Tile 2 (vector traffic light illustration with glowing signal lamps) with pulsing connection glow ready to pair. Tiles 3 & 4 ('subway' word and subway train illustration) locked in celebrating golden-teal matched frames with checkmark chips (`[🔊 playCue: match_success]`). Tiles 5 & 6 ('bicycle' word and city bicycle illustration) idle in warm paper `#FDFBF7`. Speed bonus banner: '⚡ Fast Pair Bonus: +30 XP Active!'. Anchored footer with 56px disabled CTA 'MATCH REMAINING PAIRS (2/4) →' in teal `#2A9D8F`.
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header exit tap
     - `[🔊 playCue: card_select]` on card selection tap
     - `[🔊 playCue: match_success]` on pair match lock
   - **Design Contract:** Exact token hexes, thumb-reachable actions, production-grade Tailwind HTML + style block.

## §5 ZCode design verification (inside Stitch)

**Verified 2026-09-13** (owner batch pre-approval). Project `6865954475041880496`; exports in `stitch/20-fast-vocab-solo/`. Screens 1-2 — PASS: unit picker + light-identity mid-game.-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**PRE-APPROVED 2026-09-13 (owner batch directive):** "implement them all right away without waiting for my approval… we will modify [off designs] afterward."

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
