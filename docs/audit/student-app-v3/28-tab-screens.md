# Tab Screens — Rank / Quests / Shop / Profile + Settings & Help — v3 Quality Audit (`CHROME (grouped)`)
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

- **Surface / route:** `/student/leaderboard` `/quests` `/shop` `/profile` (+ fullscreen `/avatar` `/settings` `/help`) — `Leaderboard.tsx` (162), `Quests.tsx` (316), `Shop.tsx` (308), `Profile.tsx` (117), `AvatarBuilder.tsx` (281), `Settings.tsx` (165), `HelpCenter.tsx` (125)
- **Exercise types consumed:** none
- **Data sources:** GamificationService (league/quests/economy), avatar v2 catalog + RPCs (equip/set_body/compose), help FAQ
- **Scoring & data writes:** quest claim ◆/XP; shop spend ◆; avatar equip RPCs — all GamificationService/DB
- **Reachability:** bottom-nav tabs + profile gear
- **Theme today:** mixed — Leaderboard/Quests slate-light, Shop/Profile `wa-*`; audited as ONE file for coherence, redesigned only if the owner prioritizes chrome

## §1 How the game works today

*(Screenshots pending. Grouped functionality audit — chrome, not a game.)*

Five tab screens + fullscreen chrome: Leaderboard (weekly league podium + rows), Quests (daily goal + claimable quest cards + chest), Shop (characters/wardrobe/power-ups, gem spend, "no real money" footer), Profile (avatar + level + stats + Customize), AvatarBuilder (slot tabs + equip/buy grids + Save → equip RPCs + compose), Settings (account card, sound-effects + speaking-exercises toggles, reminder, sign-out), HelpCenter (searchable FAQ). Data via GamificationService + avatar v2 catalog/RPCs + react-query.

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Grouped audit (verify per-screen during any redesign):

- **F1 · P2(verify) — Settings toggles' enforcement is unclear.** "Sound effects" and "Speaking exercises" toggles exist, but no reader of those settings was found in the audio paths audited (`playCue`/`playAudioUrl` don't consult them) — possibly decorative toggles. Verify before redesign; if dead, wire or remove.
- **F2 · P3 — Theme is split across tabs** (Leaderboard/Quests slate-light vs Shop/Profile wa-*) — the owner's mix directive makes this the natural place to define the blended language.
- **F3 · P3 — Quest claim / chest flows depend on GamificationService progress calls** — audit claim double-tap safety during implementation.
- **F4 · P3 — AvatarBuilder Save → navigate only** (handleAvatarSave ignores config/url — react-query cache is truth) — fine; keep.

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P1 — Severe visual split across bottom tabs (Slate-50 utility vs Wonder Atlas).**
  - *Evidence:* `Leaderboard.tsx` and `Profile.tsx` use sterile `slate-50` / `slate-100` styling with standard Tailwind borders, whereas `Quests.tsx` and `Shop.tsx` use the custom Wonder Atlas design system (`wa-mist`, `wa-ink`, `wa-cream`, `btn-atlas-green`). As a child taps across the bottom navigation bar, the visual identity, typography, button shapes, and background colors jarringly flip back and forth between two completely different apps.
  - *Recommendation:* Harmonize all tab surfaces under the owner's chosen hybrid aesthetic: warm cream background (`#FDFBF7`), tactile 3D pill cards with crisp borders, expressive icons, and a unified bottom navigation bar with active tab bounce.
- **F2 · P2 — Sub-screens strip the bottom navigation bar and create navigation traps.**
  - *Evidence:* Opening Settings or Help Center from Profile removes the bottom tab bar and presents a fullscreen view with only a tiny top-left `<ChevronLeft>` button. Young children accustomed to persistent thumb-level tab navigation get disoriented and struggle to find their way back to the home map.
  - *Recommendation:* Maintain the bottom navigation bar across all top-level surfaces or provide prominent bottom-docked exit controls.

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P1 — Disconnected Settings toggles (decorative sound & speaking controls).**
  - *Evidence:* `Settings.tsx:16-19, 90-100` (`F1`). The Settings screen offers user-facing toggles for "Sound Effects" and "Speaking Exercises", saving them to `localStorage['student-settings']`. However, neither `audioCueService`, `ExerciseRunner`, `SpeakSentence`, nor `PronunciationCoach` ever consults this key! Disabling "Speaking exercises" does not suppress speaking exercises in lessons, and disabling sound effects does not mute audio cues. This is a severe illusion-of-control bug that breaks trust with parents and children (e.g. studying in a library or quiet vehicle).
  - *Recommendation:* Wire these preferences into the global state: when "Speaking exercises" is toggled off, `ExerciseRunner` must automatically bypass speech tasks (or substitute them with listening tasks), and sound effect triggers must honor the sound mute flag.
- **F4 · P2 — Quests chest unlock lacks celebratory opening payoff.**
  - *Evidence:* `Quests.tsx:90-95`. When a student completes all daily quests and reaches 100% on the Mystery Chest, claiming it triggers a plain text toast message (`+15 XP, +10 Gems!`). The biggest daily habit milestone in the app ends with a whimper.
  - *Recommendation:* Implement a high-delight interactive chest-opening modal: a wobbling golden chest that bursts open on tap with sparkling confetti, spinning gems, and fanfare sound effects.

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P2 — Raw weekly XP leaderboard alienates slower or newly enrolled students.**
  - *Evidence:* `Leaderboard.tsx:40-70`. The leaderboard ranks learners purely by gross accumulated weekly XP. A child who logs in midweek or practices a modest 10 minutes a day sees peers with 3,000+ XP and feels immediately defeated.
  - *Recommendation:* Implement tiered league brackets (e.g. Explorer ➔ Pioneer ➔ Champion) with 20–30 peer cohorts, alongside a "Personal Daily Best" flame streak, ensuring every student has an achievable weekly promotion goal.
- **F6 · P2 — Shop catalog lacks pedagogical utility items.**
  - *Evidence:* `Shop.tsx:110-180`. The shop currently sells only avatar clothing and cosmetics. While fun, it misses the opportunity to reward learning diligence with educational agency.
  - *Recommendation:* Introduce learning perks purchasable with gems: `Streak Freeze 🧊` (preserves flame if homework is missed for one day), `Secret Storybook Unlocks 📚`, and `Special Mascot Voice Packs 🎙️`.

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F7 · P2 — Avatar Builder save latency causes temporary visual desync.**
  - *Evidence:* `AvatarBuilder.tsx:80-120`. When a child buys and equips new gear, the component initiates an asynchronous server compose RPC. If the child navigates back immediately, the home map and profile avatar temporarily flicker or revert to old equipment until the query cache refetches.
  - *Recommendation:* Apply immediate optimistic UI updates to the local avatar state so new gear is reflected instantly across the entire application upon pressing Save.

### 4.e Top-5 prioritized recommendations
1. **Wire or Fix Settings Toggles (P1):** Ensure "Speaking Exercises" and "Sound Effects" actually mute audio and bypass speech exercises across the app, eliminating decorative toggles.
2. **Unify Tab Aesthetics to Wonder Atlas + Duolingo Hybrid (P1):** Eliminate the jarring slate vs warm-paper split across tabs, bringing Leaderboard, Quests, Shop, and Profile into one cohesive design language.
3. **Interactive Daily Quest Chest Opening Ceremony (P2):** Replace flat toast messages with an exciting animated 3D chest burst when claiming the daily quest goal.
4. **Cohort-Based Tiered Leagues (P2):** Replace the demoralizing global XP leaderboard with small 20-student weekly leagues to motivate regular learners.
5. **Add Educational Power-ups to Shop (P2):** Allow students to spend hard-earned gems on Streak Freezes and unlockable bonus story chapters.

### 4.f Stitch design log (AG fills as it generates)
*Stitch mobile screens for Tab Screens (Leaderboard, Quests, Shop, Profile) will be generated in the design phase following owner approval.*

## §5 ZCode design verification (inside Stitch)

<ZCode fills after AG reports designs done: list_screens result, title verification against §4.f, export paths (`stitch/<NN>-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

<Owner's verdict per screen: approved / revise (what to change). No implementation starts before an explicit go on THIS game's designs.>

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
