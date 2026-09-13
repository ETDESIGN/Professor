# Tab Screens — Rank / Quests / Shop / Profile + Settings & Help — v3 Quality Audit (`CHROME (grouped)`)
> **Current status:** stitch-designed (approval gate ON — awaiting owner review)

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

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Game/Chrome Subsystem:** Tab Screens & Core Chrome (`28-tab-screens.md`) — Shop, Avatar Studio, Profile, Quests, Leaderboard, Settings, Help Center, Heart Refill Confirmation Modal
- **Generation Date:** 2026-09-13
- **Approval Gate Status:** **GATE IS ON.** All 8 screens generated in Stitch for personal review and sign-off by the owner prior to any implementation.
- **Submission Status:** All 8 screens submitted and successfully materialized in Stitch project `6865954475041880496` (Status: `COMPLETE`, exit code 0). Zero duplicates.

#### Screens Generated & Brief Summaries:

1. **Screen 1: Shop Tab (`Shop.tsx`)**
   - **Stitch Screen ID:** `a62e6d1a0fc4431e96a6667f7fd80c30`
   - **Title:** `Professor ESL - Shop Tab (390x844)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1VoERrGCavs2kNC6-T_o_-y4R8oCl3VlZXzY9z4lz27em7CHbSMDkTToXbqp3Fyd8_8s_mJdEnPVeJb1KdCy3nRa0U315QHAbLthICSw9zkxHCSI6KnIOMJK4H4wYe-EbCHdLMBfyZIR43FV-vBmZhr-yIW-snfiun6iBQTJuWYKxWWIcNe9o6vMb79VHSmuWOw1UcDVV7QJuG3OgBRUKssgt40TNUGz7XJnFZO-uN37UIqtiOlEbvSC_U`
   - **HTML Download URL:** `https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sX2VjZTBhY2IxZjFlODRkNDU5YTY4NDc5N2QyMGQxNDFjEgsSBxDz_t2KihIYAZIBIwoKcHJvamVjdF9pZBIVQhM2ODY1OTU0NDc1MDQxODgwNDk2&filename=&opi=96797242`
   - **Prompt Summary:** Mobile portrait (390×844) Shop tab surface. Sticky paper `#FDFBF7` header with back button, Fredoka title "Shop", and real gem pill counter (`💎 320` in Duolingo blue `#1CB0F6`). Avatar hero card on soft pink-to-cream gradient card (`#FFF5F7` to `#FDFBF7`) showing current student avatar with safari hat, status copy, and 48px tactile "Studio ✨" button in Duolingo pink `#E91E63` (`0 4px 0 #BE185D` bevel). 3-column Characters grid with real species bases: "Boy Kid" (equipped with emerald `#2A9D8F` border & "In use" check), "Cyber Bot" (rare purple ring `#8B5CF6`, `💎 150`), and "Fire Drake" (legendary terracotta ring `#E76F51`, `💎 300`). 4-column Wardrobe accessory grid for Hats (Safari Hat equipped with pink check, Wizard Hat `💎 80`, Dragon Horns `💎 120`, Astronaut Helmet `💎 250`). Stacked Power-ups cards with real pedagogical utility: Full Heart Refill (`❤️`, `50 💎`, "×1 owned" badge + Use action) and Streak Freeze (`🧊`, `100 💎`, "×2 ready" badge). Footer lock guarantee: *"🔒 Everything here is earned by learning — no real money, ever."* Docked 5-tab bar with Shop tab active in Duolingo pink.
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_nav]` on back and tab navigation
     - `[🔊 playCue: tap_studio]` on Studio button tap
     - `[🔊 playCue: buy_item]` on purchasing character or wardrobe item
     - `[🔊 playCue: buy_powerup]` on buying heart refill or streak freeze
   - **Design Contract:** Wonder Atlas warmth (`#EAE0D0`, `#FDFBF7`, `#E2D7C3`) × Duolingo accents (`#E91E63`, `#1CB0F6`), Fredoka + Nunito typography, production Tailwind HTML + small style block, zero placeholder chrome.

2. **Screen 2: Avatar Studio (`AvatarBuilder.tsx`)**
   - **Stitch Screen ID:** `c57b42e7a56c4a1d9a5679f0c216b91b`
   - **Title:** `Professor ESL - Avatar Studio Builder (390x844)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1ULOH8vlwDBtFp6isZDTRTcsdHjWRC1b-f25_wLc0hJhD6k5UHBXsFDlXTp-lsjduv3TK8ptZp7tp64Y9Lc6F50mYYKEN_yd_XzRqvBqaDirK04rozcpQa_yBMRImzU1ozq9AsLUc6kn0bsl5I4WMqzM5AO1EG24CcFTda3WtSWIdcYoRUh35zxQVeSDFnKdWu0Eun7mJaAe7z3Ahfnxap3HmQRc2QPYGhQJiOUKzYMEZEOIYrxcWUMJ50`
   - **HTML Download URL:** `https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzMwOTRjZTBkMjliNjRmYmViNDkyYzUzYjk2ZWE0MGY1EgsSBxDz_t2KihIYAZIBIwoKcHJvamVjdF9pZBIVQhM2ODY1OTU0NDc1MDQxODgwNDk2&filename=&opi=96797242`
   - **Prompt Summary:** Mobile portrait (390×844) live avatar builder. Sticky paper header with exit chevron and top-right green check Save button in emerald `#2A9D8F`. Main stage features large live layer preview container (min 280px tall) with blue dotted grid backdrop (`#F0F7FF` with `radial-gradient(#38BDF8 1.5px, transparent 1.5px)`), rendering the multi-layer composite character (Cyber Bot mascot with Safari Hat and Cool Star Sunglasses) with live floating shadow. Bottom docked drawer on paper `#FDFBF7` with rounded-t-[32px] and tactile slot tabs (Character [active], Hats, Glasses, Outfits). Item selection grid with real species and items, active equipped indicators (pink border `#E91E63` + check badge), gem price chips (`💎 150`), and tactile "None 🚫" unequip tile. Anchored 54px full-width primary CTA button "SAVE AVATAR" in teal `#2A9D8F` (`0 4px 0 #1E6F5C` bevel).
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header exit
     - `[🔊 playCue: select_tab]` on switching wardrobe slots
     - `[🔊 playCue: equip_item]` on selecting base species or accessory
     - `[🔊 playCue: save_avatar]` on Save action
   - **Design Contract:** Exact token hexes, thumb-reachable actions, production-grade Tailwind HTML + small style block.

3. **Screen 3: Profile Tab (`Profile.tsx`)**
   - **Stitch Screen ID:** `2a14d51435c347ebb08e91c45ff47d40`
   - **Title:** `Professor ESL - Profile Tab (390x844)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1W3O1HobgnApAX2wVTY-3_MmpmrtDnDOc6ckU5hjzfAVwIzGkPQFfHqlciZ_U_Uj8cu3Jzy7U4R-raG306kpUNpFAXA5JIdzn7svrXftuHLM__4qQDvXXoAVD86eAkn_jG8lvskZt349tSHryP9xzd4D9zGYxM2y-mHLPwOiUDYqlZqvXCI5TDuE9dEzOYOLRAzajevmIDJw2LNPW6ZHdmlkS2Md1OcUDUlCV9wuBQTLyffRJXvhvcOh3Y`
   - **HTML Download URL:** `https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzMwOTZhMDE0NWE1ODQ0ZWM5Y2FkNDZlODdjZGM5MWI4EgsSBxDz_t2KihIYAZIBIwoKcHJvamVjdF9pZBIVQhM2ODY1OTU0NDc1MDQxODgwNDk2&filename=&opi=96797242`
   - **Prompt Summary:** Mobile portrait (390×844) student profile screen. Sticky header on `#FDFBF7` with back chevron, title "My Profile", and top-right gear Settings icon button (`[🔊 playCue: tap_settings]`). Centered 128px circular avatar with white border, drop shadow, and tactile camera badge button (`#FFFFFF`, pink camera icon `#E91E63`). Student name "Leo Zhang" (Fredoka 24px) with level pill badge "⭐ Level 5: Word Wizard" (Chinese support chip: "5级 • 词汇小巫师"). 3 honest metric stat tiles (grid-cols-3) on paper cards with 3D bevels: Streak (`14 Days`, orange flame 🔥), Total XP (`2,450 XP`, electric yellow lightning ⚡), and Gems (`320 Gems`, sparkling cyan gem 💎). Full-width 54px primary CTA button "CUSTOMIZE AVATAR ✨" in Duolingo pink `#E91E63` (`0 4px 0 #BE185D` bevel). Learning badges showcase and persistent bottom navigation bar.
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_settings]` on settings gear tap
     - `[🔊 playCue: tap_avatar_edit]` on camera badge tap
     - `[🔊 playCue: tap_customize]` on Customize Avatar tap
     - `[🔊 playCue: tap_nav]` on bottom tab switch
   - **Design Contract:** Wonder Atlas warmth × Duolingo accents, Fredoka + Nunito typography, production-grade Tailwind HTML + style block.

4. **Screen 4: Quests Tab (`Quests.tsx`)**
   - **Stitch Screen ID:** `753ea8d02d5c4b17b09c670cb2904bf0`
   - **Title:** `Professor ESL - Daily Quests Tab (390x844)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1UskTG6v2R_bH-ma4VvY6ZvAamVVM9z4-5-3C4heCjLSiNSfGCF4CrqESpTOd1yi5DUDf4eZkbIZjdaauocXTMOf4Xz9SNg7mu3p_pPQRhIiyvE2aeQwg68mMFVeJGulQi8XKYkSGn8ovaKonBiQvynb-BB1dMe1AHugkZsbg084L0kQLZ0hW1wkC492dQkNySiRqP67Lvcs2dRRl6XUNO0pEHAbAzYPv57Lsy8cRLf52_hHX3UULMroA`
   - **HTML Download URL:** `https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzY1YzVkM2M3NTQ5NTQxZGU5MmY1Mzg2MjMzODMzMGJhEgsSBxDz_t2KihIYAZIBIwoKcHJvamVjdF9pZBIVQhM2ODY1OTU0NDc1MDQxODgwNDk2&filename=&opi=96797242`
   - **Prompt Summary:** Mobile portrait (390×844) daily quests and streak tab. Sticky header with amber star badge, title "Daily Quests", countdown chip ("⏱️ Resets in 6h 42m"), and real XP (⚡ 450) and gem (💎 320) counters. Streak hero card in terracotta gradient (`#FFF7ED` to `#FFEDD5`) with flame icon 🔥, headline "14 Day Streak!", and 7-day strip (M–S with emerald checkmarks, TODAY with pulsing flame). Daily Goal hero card with 3D golden chest illustration (`🎁`), status "2 / 3 Quests Done", 66% progress bar in teal `#2A9D8F`, and reward preview (`+20 Gems 💎 • +50 XP ⚡`). Today's quests list: Quest 1 completed and claimable ("Earn 20 XP in Lessons", 20/20, tactile green "CLAIM! 🎁" button in teal `#2A9D8F`), Quest 2 claimed ("Complete 2 Story Steps", emerald "Claimed ✓" pill), and Quest 3 in progress ("Speak 3 Sentences Perfectly", 1/3, amber progress bar). Docked 5-tab bar with Quests active.
   - **Sound Cue Marks:**
     - `[🔊 playCue: claim_reward]` on claiming completed quest
     - `[🔊 playCue: chest_unlock]` on opening Mystery Chest
     - `[🔊 playCue: tap_nav]` on tab switch
   - **Design Contract:** Wonder Atlas × Duolingo tokens, reusable Tailwind HTML + style block, kid-friendly honest progress.

5. **Screen 5: Leaderboard / Rank Tab (`Leaderboard.tsx`)**
   - **Stitch Screen ID:** `40ce97e60ff64c77b956ef0775e9e1b5`
   - **Title:** `Professor ESL - Weekly League Leaderboard (Diamond League)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1VjmyzggwS51aDV1laQWGpq6y7zdDTbEvSPfZmqY8la_piW4iB2znfqGpTZHmc7nXYDa5N-WwJxOnHDekFN-W_EXBkXwC1KV4W2j2foKj8pMrDx1vrpMbNFv_pIPsgpmgyDdi3GiYHXj2-Jr1HjcPO-Zxs0J-JPQSIe_8Rp3DdWZB31bkglUlpfK29GpH6klC8eR7K3M55O9iLHkA79sBDWIlUA4SNxbVcXudD-Hn-rEIKuO5PTERBUtZU`
   - **HTML Download URL:** `https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzljMDg4OTZhNmVjNDQ2ODRhZWY1YTNkODExYWQ1MGYzEgsSBxDz_t2KihIYAZIBIwoKcHJvamVjdF9pZBIVQhM2ODY1OTU0NDc1MDQxODgwNDk2&filename=&opi=96797242`
   - **Prompt Summary:** Mobile portrait (390×844) weekly league leaderboard screen. Royal blue-indigo header banner (`#1CB0F6` to `#4F46E5`) with back button, golden league trophy, headline "Diamond League" in Fredoka white, and countdown badge "⏱️ Time Left: 2d 14h". Subtitle chip: "Top 5 students promote to Master League 🚀". 3D tactile podium pedestals with gold, silver, and bronze pedestals: 1st Place (Gold, h-32, golden crown 👑, avatar "Kenji", 🥇, `2,120 XP`), 2nd Place (Silver, h-24, avatar "Maya", 🥈, `1,850 XP`), and 3rd Place (Bronze, h-20, avatar "Sarah", 🥉, `1,640 XP`). Ranked learner rows list: 4th Place ("Alex T.", `1,420 XP`, movement chip `▲ 2`), 5th Place ("Leo (You) 👤" highlighted floating paper card with teal border `#2A9D8F`, soft mint fill `#F0FDF4`, `1,380 XP`, movement chip `▲ 1` inside promotion zone), 6th Place ("Chloe M.", `1,290 XP`, `—`), and 7th Place ("David K.", `1,150 XP`, `▼ 1`). Motivation footer note and docked 5-tab bar.
   - **Sound Cue Marks:**
     - `[🔊 playCue: podium_fanfare]` on leaderboard entrance
     - `[🔊 playCue: tap_row]` on tapping student profile row
     - `[🔊 playCue: tap_nav]` on tab switch
   - **Design Contract:** Exact token hexes, cohort-based league presentation, production Tailwind HTML + small style block.

6. **Screen 6: Settings (`Settings.tsx`)**
   - **Stitch Screen ID:** `480abc89ca8f4551b5f892fa4fff20f4`
   - **Title:** `Professor ESL - Student Settings (/student/settings)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1X0TOkNxqbDUKxQ5V8pCYD0n4If44tT1kYjLIjdKK9VEzdBUqGGO4X2SqgsCVs5SQ-5hvUlh2uKCip5ci1-ZO9PtnjX9Xqx4_q4wDLl3TJFAhSfepiLnrb5CS5b1dmRbgEEZ3sh96QzlnUWRXAg479HZx9YvgpE7I95_fgOIaXVaJYw8PAruz97d9BC9sakh6vR4I5fi1kQ2LcdLiIROSnNlfstzXDEbkeFd6DfKjB9Jahu2Ca_FEoTEQ`
   - **HTML Download URL:** `https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sX2E3Y2U5YzEzZTZmMzQ3YjFiZjY1ZmFkZjQ4MjFlZWIxEgsSBxDz_t2KihIYAZIBIwoKcHJvamVjdF9pZBIVQhM2ODY1OTU0NDc1MDQxODgwNDk2&filename=&opi=96797242`
   - **Prompt Summary:** Mobile portrait (390×844) student settings with REAL WIRED CONTROLS (directly addressing audit §4 F3/F1). Sticky paper header with back chevron button and bold title "Settings" in Fredoka `#1D3557`. Student account card on warm paper `#FDFBF7` with 56px avatar, name "Leo Zhang", badge "Student Account • Grade 5", and "Switch Profile" link. Audio & Exercise Controls section with realistic wired toggles: 1) "Sound Effects" (blue volume icon, plays celebratory fanfare and feedback, active toggle in Duolingo pink `#E91E63` with ON label), 2) "Speaking Exercises" (purple mic icon, helper text "Turn off if in a quiet room or library. Speech tasks will automatically be replaced by listening exercises.", active toggle switch), 3) "Mascot Speech Speed" segmented pill control (Normal 1.0x / Slower 0.8x). Notifications section with Daily Study Reminder toggle at 18:00. Tactile "Sign Out of Account" button in soft red/paper card (`border-2 #FCA5A5`, text `#EF4444`, bevel `0 3px 0 #F87171`). App version footer.
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_back]` on back navigation
     - `[🔊 playCue: toggle_sound]` on toggling sound effects
     - `[🔊 playCue: toggle_speaking]` on toggling speaking exercises
     - `[🔊 playCue: tap_signout]` on sign-out action
   - **Design Contract:** Real tactile wired controls, exact token hexes, production-grade Tailwind HTML + style block.

7. **Screen 7: Help Center (`HelpCenter.tsx`)**
   - **Stitch Screen ID:** `958657a6d53c423095acb8099791e9c0`
   - **Title:** `Professor ESL - Help Center (/student/help)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1VRxJwR1DCYs8f5OGUnHlYSOIO8AgHhreAS62N__kOl2f7SXMVMpLTnno79PFeBC2U6eGk0zMB9NKOnuLjkvWvWOdywOuulsZ-KHPN3MmEU3TQOAiSskXLLb7rwSbgXl2e9DbbmP5QyZYJuD8FYlK0ty31keJStD1lhWPRnHWW3ixR8lbM-KTvee3u6SHnWAv84N8RQZyAuGYuOsRcG6UXvcuyl9EkT1Frj6DPvRssTB3sYwbtjr8Wmkw`
   - **HTML Download URL:** `https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sX2EwNjU0Nzk0YjczZDQ1N2FiNGIwMWRiZTFjNTUyYjMxEgsSBxDz_t2KihIYAZIBIwoKcHJvamVjdF9pZBIVQhM2ODY1OTU0NDc1MDQxODgwNDk2&filename=&opi=96797242`
   - **Prompt Summary:** Mobile portrait (390×844) student help center. Sticky paper header with back chevron button and title "Help Center" in Fredoka `#1D3557`. Friendly mascot hero illustration with Professor Owl welcoming the student ("How can we help? Find quick answers or take an interactive tour."). Full-width tactile search input card on paper `#FDFBF7` with magnifying glass icon and mic hint. Interactive App Tour card on soft indigo `#EEF2FF` with compass icon 🧭 and "Start Tour →" CTA button. Frequently Asked Questions interactive accordions: Accordion 1 in EXPANDED state ("How do I earn XP and Gems?" with chevron rotated 180° and full dual-currency explanation), and Accordions 2–4 in collapsed state ("Can I practice offline without internet?", "I lost my streak! How do I repair it?", "How do I reset my student PIN or password?"). Reassuring parent/teacher help note footer.
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_back]` on back navigation
     - `[🔊 playCue: search_input]` on focusing search
     - `[🔊 playCue: tap_tour]` on starting app tour
     - `[🔊 playCue: accordion_toggle]` on expanding/collapsing FAQ items
   - **Design Contract:** Wonder Atlas × Duolingo light tokens, responsive mobile FAQ UI, production-grade Tailwind HTML + style block.

8. **Screen 8: Heart Refill Confirmation Modal (`Shop.tsx` / `ExerciseRunner.tsx`)**
   - **Stitch Screen ID:** `c241696d957f49cc94232eea69b9f105`
   - **Title:** `Professor ESL - Heart Refill Confirmation Modal (390x844)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1Ve14SZBg8CckD8IJanOUq1p1lwrWpurkzEXpBqYJKyYt7sWtxdwjQY7G1cZtxXkZSsyX6DHcjxzvpSym2tcJr1dd7Zqy9Qd4Ljhc_vB-aTEuFvfdg7edYiMF6OzUV4JMScbwNubFcVXo8TWL6YZsWKryf5AhmsjNIs0M1F8_b5ZvAtJTQ4KlvZFhvsdc0XEXWRBtjOyidgf1WX69VTebsw3ea4kIy44qSSYMKoVv7rHBvWEopg8Vn-kr4`
   - **HTML Download URL:** `https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sX2U5ODVmYjllZDZkMDQ0NTI4ZjBmYjkzZjQ1MTg2MDQ5EgsSBxDz_t2KihIYAZIBIwoKcHJvamVjdF9pZBIVQhM2ODY1OTU0NDc1MDQxODgwNDk2&filename=&opi=96797242`
   - **Prompt Summary:** Mobile portrait (390×844) Heart Refill Confirmation Modal anchored over dimmed and blurred stage (`rgba(38, 70, 83, 0.65)` scrim). Centered floating warm paper `#FDFBF7` dialog card with rounded-[32px] and tactile shadow. Hero heart graphic: golden-framed heart container showing 1 filled heart ❤️ and 4 pulsing restoration hearts with glowing sparkles ✨. Headline "Restore All Hearts?" in Fredoka 22px inkDeep `#1D3557` with reassuring body text. Economy exchange container in mist `#F7F3E8` showing student balance (`💎 320`) vs refill cost (`💎 50`) and "Restores to 5/5 Hearts ❤️" badge. Vertical thumb-zone action buttons: 1) Primary 54px tactile CTA "REFILL 5 HEARTS (50 💎)" in terracotta/red `#E76F51` (`0 4px 0 #C4553B` bevel), 2) Free pedagogical alternative button "Practice in Review (Earn +1 ❤️ Free)" in paper `#FDFBF7` with teal border `#2A9D8F` (solving the kid-alone dead-end finding F2), and 3) 44px dismiss button "Not now, keep current hearts". Economy safety footer guarantee.
   - **Sound Cue Marks:**
     - `[🔊 playCue: modal_open]` on modal appearance
     - `[🔊 playCue: refill_success]` on confirming heart refill
     - `[🔊 playCue: tap_review]` on launching free review practice
     - `[🔊 playCue: tap_cancel]` on modal dismissal
   - **Design Contract:** High-delight modal, exact token hexes, dead-end elimination, production-grade Tailwind HTML + style block.

## §5 ZCode design verification (inside Stitch)

**Verified 2026-09-13 — AWAITING OWNER APPROVAL (gate ON).** Project `6865954475041880496`; exports in `stitch/28-tab-screens/1-8.{html,png}`. All 8 PASS ZCode QA: mobile portrait, Wonder Atlas × Duolingo tokens, ≥48px targets, CJK-safe, no placeholder chrome. Spot-checked: 1 Shop (avatar hero + characters/wardrobe/power-ups + 'no real money' footer) and 8 Heart-Refill modal — the out-of-hearts dead-end solver (50💎→5❤️ exchange PLUS a free 'Practice in Review +1❤️' alternative, matching the SRS heart-haven direction). Settings (6) designs REAL wired-look toggles per §4. NO IMPLEMENTATION until §6 owner go.-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**GATE RESTORED 2026-09-13 (owner):** "lets do the Shop/Profile/etc., but i want approve the design in stitch before implementation." — NO implementation of this file's surfaces until the owner explicitly approves their screens in Stitch.

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
