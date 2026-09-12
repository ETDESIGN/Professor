# App Flow & UX — the Whole-Journey Critic Audit (`ALL SURFACES`)

> **Status:** audit-only file (no Stitch screens)
> **Current status:** ag-audit-done
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

### 4.a The child's journey (first run → daily loop → weekly loop): friction, confusion, dead-ends

The student app is a solo, unassisted home environment for 6–12 year olds in China. A child studying at 8pm on a smartphone has no teacher looking over their shoulder and minimal patience for adult UX friction. Auditing the end-to-end user journey reveals critical structural traps:

1. **First Run & Onboarding Trap:**
   - *Empty State Barrier:* When a new student signs in via passport or credentials without an active class assignment, the Home Map (`01`) renders an empty state with a "Join Class" 6-character code modal. If the code is mistyped or the teacher has not yet generated a class, the app provides zero fallback, zero demo curriculum, and zero onboarding tour. The child is stranded at a brick wall before learning a single word.
   - *Missing Pre-flight Audio Check:* Language learning requires functioning headphones/speakers and microphone permissions. Today, the app never tests audio output or microphone access during onboarding; the child discovers mic permission failures only inside the high-stakes productive exercise battery (`18`) or pronunciation coach (`25`).

2. **The Daily Loop (Home Map ➔ SoloLessonPlayer ➔ Exercises ➔ Rewards ➔ Home):**
   - *The Instant-Exit Disaster:* Tapping the top-left `X` button during any lesson (`02`), exercise battery (`12`), or solo arcade session (`20`, `21`) immediately exits without confirmation. A slight slip of a child's thumb on a mobile screen permanently aborts the lesson, wiping all in-flight points and progress.
   - *Split-Brain Hearts Economy:* The lesson shell (`02`) renders a fake top HUD displaying 5 hardcoded hearts that never decrease during the first 5 steps (WordLab, Media, Story, Grammar, Mini-games). At step 6 (`12-exercise-battery`), the engine suddenly switches to real persisted hearts from `Engine.getHearts()`. When a struggling child drains their hearts, `ExerciseRunner` mounts an "Out of Hearts" screen stating *"Review in practice arena to restore hearts"* — yet provides **no button, no deep link, and no navigation path**! The child is completely dead-ended.
   - *The Phantom Gem Award:* Upon completing a lesson, `27-lesson-complete` unconditionally displays an emerald reward card: `+{GEM_REWARDS.PERFECT_LESSON} Gems [Checkmark]`. However, `StudentApp.finalizeLesson` strictly gates gem distribution on `stars === 5`. Because standard lesson paths use a 1–3 star scale (`starsForAccuracy` returns max 3), `stars === 5` is mathematically impossible! The screen explicitly promises 15 gems with a checkmark, but deposits zero gems into the child's account. This directly damages child trust.

3. **The Weekly Loop (Practice Arena, Quests, Leagues):**
   - *The Practice Arena Precondition Blindness:* Entering the Practice tab (`26`) directly from the bottom bar and tapping Phonics (`22`) or Reading (`24`) hits an invisible precondition trap: both games read `state.activeUnit`. If the student has not opened a unit on the map during the current session, they are met with a dead empty state ("Open a unit from the map") and a back button. There is no unit selector.
   - *Anti-Recovery Spaced Repetition Loop:* In `23-daily-practice`, practicing weak and due items routes through `ExerciseRunner`, which subtracts hearts on errors! In language learning psychology, spaced review must be the safe haven where struggling students rebuild confidence and *recover* hearts. Locking a child out of the app because they failed a word in daily review completely breaks retention.
   - *Demotivating Leaderboards:* The weekly league (`28`) ranks students purely by gross accumulated weekly XP. A child who logs in on Thursday and practices a healthy 15 minutes a day sees peers with 3,500 XP and feels defeated before starting.

---

### 4.b Orientation & wayfinding: does the child always know where they are, what just happened, what's next?

1. **In-Lesson Phase Blindness:**
   - The lesson shell (`02`) shows a single horizontal progress bar that advances incrementally across 6–7 disparate steps. A 7-year-old child cannot tell whether they are in the introductory vocabulary phase, watching a story, playing a mini-game, or taking a high-stakes graded test. When an exercise battery item appears, the child doesn't know if they have 3 questions left or 15 questions left.
   - *Recommendation:* Replace the monolithic progress bar with a 3-phase visual stage indicator: `1. Explore (Words & Story)` ➔ `2. Practice (Mini-games)` ➔ `3. Challenge (Quiz Battery)`.

2. **Cracked-Node Discovery Disconnect:**
   - On `01-home-map`, map nodes that have decayed in FSRS memory render with a "cracked" visual effect and a floating review chip. However, tapping the chip does not provide an immediate targeted review drill for that specific unit's decayed words; it routes generically to the Practice Arena, severing the spatial connection between the cracked node on the map and the repair action.

3. **Sub-screen Navigation Traps:**
   - In `28-tab-screens`, tapping Settings or Help Center from the Profile screen completely strips the bottom navigation bar and mounts a fullscreen overlay with only a small `<ChevronLeft>` icon. Young learners instinctively look for the bottom tabs to navigate back home; when the tab bar vanishes, they feel trapped.

4. **Sight-Reading Leaks (Masked Listening):**
   - In `13-choice-exercise`, questions marked as `LISTEN_SELECT` display full English text choices alongside the audio prompt. Children naturally take the path of least cognitive resistance: they read the written English text and ignore the audio entirely. This fundamentally undermines auditory word recognition.

---

### 4.c Motivation economy: XP / gems / streaks / quests / hearts / stars / crowns — one coherent system or competing ones?

Today, the app presents **seven competing, uncoordinated reward mechanisms** created across different development eras:
1. **Hearts (Survival Economy):** Disconnected. Fake in the lesson shell (5/5 static), real in the battery (DB balance), punitive in daily review, and dead-ending on 0 balance.
2. **Stars (Performance Rating):** Two conflicting mathematical scales. Lesson nodes score 1–3 stars based on accuracy (`stageProgressService.ts`). Standalone games (`20`, `21`) calculate 0–5 stars. `LessonComplete` clamps the visual display to 3 stars, but gates gem awards on 5 stars.
3. **XP (Effort Currency):** Inflationary and inconsistent. Standalone games self-award XP; daily review awards 1–5 XP; lessons award 5–15 XP; dead code paths still reference 50 XP.
4. **Gems (Aspirational Currency):** Broken promises. Promised on `LessonComplete` but withheld by logic gates. Can only be spent on avatar cosmetics in `Shop.tsx`; zero educational power-ups exist.
5. **Streaks (Retention Anchor):** The single most powerful psychological habit driver in child education is completely omitted from the lesson victory celebration (`27-lesson-complete`)! The child finishes a 15-minute lesson, but never sees their streak flame leap from Day 4 to Day 5.
6. **Quests (Daily Habits):** Quests run as background database tallies, but complete silently with no celebration. Quests are misattributed (e.g. `PERFECT_SPEAKING` awarded for silent reading in `24`).
7. **Crowns / Mastery Levels (Long-term Progression):** Map nodes feature crown levels (1–5), but there is zero explanation of what crowns represent or how they relate to FSRS memory stability.

#### The Unified Economic Model (Anti-Gravity Framework)
To create an intuitive, encouraging reward ecosystem, consolidate these currencies into three distinct psychological layers:
- **Layer 1: Session Feedback (Hearts & Stars)**
  - *Stars (1–3 Standard):* 1 Star = Completed; 2 Stars = Good (≥70% accuracy); 3 Stars = Mastered (≥90% accuracy). Apply universally across lessons and arcade games.
  - *Hearts (Generous & Restorative):* Hearts apply only to productive challenges in the exercise battery. Practice Arena and Daily SRS *restore* +1 heart upon completion. Formative exploration (word search, fast vocab) never drains hearts.
- **Layer 2: Daily Habit Loop (Streak Flame & Daily Quests)**
  - Completing the first lesson or practice of the day immediately triggers an animated **Streak Flame (+1 Day! 🔥)** celebration directly on the `LessonComplete` screen.
  - Completing all 3 daily quests triggers a juicy 3D chest-opening ceremony with gems and sound.
- **Layer 3: Long-Term Aspiration (XP & Gems)**
  - XP tracks weekly league progression with cohort-based 20-student brackets.
  - Gems earned from 3-star lessons and quests can purchase both avatar gear and educational power-ups: `Streak Freeze 🧊`, `Bonus Mystery Stories 📖`, and `Sound Packs 🎙️`.

---

### 4.d Pedagogic arc across a session: input→practice→review rhythm, cognitive load, pacing

An optimal ESL learning session for a 6–12 year old child solo at home must follow a carefully graduated cognitive arc: **Input (Comprehensible Exposure) ➔ Guided Exploration ➔ Fluency Drill ➔ Productive Retrieval ➔ Dopamine Consolidation**. Auditing the current lesson sequence reveals severe pedagogic bottlenecks:

1. **Input Phase (WordLab `03`, MediaPlayer `04`, StoryStage `05`, GrammarSandbox `06`):**
   - *Cognitive Cramping:* WordLab displays vocabulary in a 2-column card grid on mobile portrait, cramming images, phonetics, and English text into tiny cards. Cards must be presented as a focused 1-card swipeable carousel.
   - *Visual Suppression:* MediaPlayer places an unnatural 50% dark overlay and 60% opacity on educational video embeds, dimming cartoon illustrations and reducing child engagement.
   - *Passive Gating:* WordLab and StoryStage allow children to tap "Continue" without ever playing audio or interacting with vocabulary words. Dual-coding theory requires hearing and seeing the word together.

2. **Fluency & Guided Drill Phase (FastVocab `08`, WordSearch `09`, MemoryMatch `10`, SpellingBee `11`):**
   - *Penalizing Child Exploration:* Fast Vocab and Word Search dock stage accuracy stars whenever a child taps an incorrect tile while searching. In early visual scanning games, exploratory tapping is part of learning. Penalizing exploration encourages paralyzed hesitation rather than playful fluency.
   - *Punitive Timers:* The Spelling Bee step in lessons originally featured a hard timeout that ended the run mid-lesson. In solo home learning, clocks should provide urgency without destructive penalties (addressed via the timeout-costs-word model).

3. **Productive Retrieval Phase (Exercise Battery `12`–`19`):**
   - *Incomplete Checking:* `14-word-bank-build` allows clicking the primary "Check" button when a sentence is only half-assembled, instantly triggering an error sound and deducting a heart. The button should remain disabled until all required slots are filled.
   - *Audio Omission in Dictation:* `15-dictation` does not auto-play audio upon mounting, leaving the child staring at a blank text prompt until they realize they must find and tap a small speaker icon.
   - *Speech Recognition Deadlock:* `18-speak-sentence` in noisy home rooms can trap children in an infinite retry loop when browser STT fails to recognize their voice. A 3-attempt safety valve with a "Continue Anyway" bypass is mandatory.

4. **Consolidation & Dopamine Payoff (`27-lesson-complete`):**
   - The current completion screen plays no audio fanfare, hides the completion time, counts XP at a sluggish linear speed, omits the streak flame, and presents phantom gem cards. The finish line fails to provide the dopamine payoff necessary to make homework feel rewarding.

---

### 4.e Theme coherence: wa-* home × duo-* lessons — how the owner's MIX should behave at every boundary

The app is currently fractured into three conflicting visual design systems:
- **World 1: Wonder Atlas (`wa-*`):** Home Map (`01`), Quests, Shop (`28`). Warm cream/ivory background (`#FDFBF7`), muted forest greens, warm terracotta accents, delicate borders.
- **World 2: Duolingo Flat (`duo-*`):** Lesson Shell (`02`), Exercise Battery (`12`–`19`), Solo Arcade (`20`, `21`). Sterile slate-50 backgrounds, flat white cards, neon hot-pink `#FF2E79` buttons, harsh emerald green borders.
- **World 3: Dark Studio:** Pronunciation Coach (`25`), Lesson Complete (`27`). Pitch-black `bg-slate-900` backgrounds, neon laser audio bars, glowing blur effects.

Crossing these boundaries feels like launching three completely different apps. In accordance with the owner's explicit mandate (*"a mix between both Wonder Atlas + Duolingo white/pink"*), the redesign must enforce a unified hybrid design language across all 31 surfaces:

#### The Wonder Atlas + Duolingo Hybrid Design System
1. **The Canvas (Wonder Atlas Warmth):**
   - Abolish all pitch-black `bg-slate-900` screens.
   - All top-level screens (Home, Hubs, Quests, Lesson Shell, Completion) use a warm, inviting canvas: Warm Ivory/Cream (`#FDFBF7` / `#F8F6F0`). This eliminates eye strain and gives the entire product a storybook adventure feel.
2. **Interactive Elements (Duolingo Tactile 3D Affordances):**
   - All interactive buttons and answer tiles adopt tactile 3D beveled styling: `border-2`, solid bottom bevel shadow (`shadow-[0_4px_0_0_#...]`), and physical press feedback (`active:translate-y-1 active:shadow-none`).
   - Primary action buttons ("Check", "Continue") use vibrant Duolingo action pink (`#FF2E79` with shadow `#BE185D`).
   - Touch targets must strictly adhere to the mobile kid standard: **minimum 48px height**, generous padding, and legible typography (≥14px body, ≥18px headings).
3. **Feedback Surfaces (Duolingo Bottom Drawers):**
   - Every interactive exercise check must anchor to a full-width bottom feedback drawer:
     - **Success Drawer:** Soft emerald background (`#ECFDF5`), bold green border (`#10B981`), cheerful mascot celebration icon, and a crisp "+15 XP" reward tag.
     - **Error / Teaching Drawer:** Soft rose/amber background (`#FFF1F2`), red border (`#F43F5E`), native English audio replay button, and clear Simplified Chinese (L1) explanatory support.
4. **Color Hierarchy:**
   - **Base Canvas:** Warm Cream (`#FDFBF7`) / Soft Paper (`#F3EFE6`).
   - **Primary Brand / Adventure:** Wonder Atlas Teal (`#0D9488`) / Night Navy (`#0F172A`).
   - **Primary Action Accent:** Duolingo Hot Pink (`#FF2E79`).
   - **Audio & Time Controls:** Bright Sky Blue (`#0284C7` / `#38BDF8`).
   - **Success & Progression:** Emerald Green (`#10B981`).
   - **Hints, Streaks & Stars:** Warm Honey Amber (`#F59E0B`).

---

### 4.f Top-10 prioritized journey fixes (cross-game, naming the games affected)

| Rank | Severity | Issue & Journey Impact | Games Affected | Concrete Redesign Fix |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **P1** | **Split-Brain Hearts & Out-of-Hearts Dead End** | `02`, `12`, `23` | Sync Lesson Shell HUD to real hearts balance; add a direct `[Go to Practice Arena]` button on the Out-of-Hearts screen; disable heart depletion during Daily Spaced Review so practice *restores* hearts. |
| **2** | **P1** | **Phantom Gem Reward on Lesson Completion** | `27`, `StudentApp` | Eliminate false promises: align perfection logic so achieving 3/3 stars on a lesson awards gem bonuses, and conditionally render the gem reward card only when gems are truly deposited. |
| **3** | **P1** | **Instant-Exit Accidental Abandonment Trap** | `02`, `12`, `20`, `21` | Intercept top-left `X` taps with a friendly kid-sized modal: *"Leave lesson? Your current progress will be lost! [Stay & Play] / [Quit]"*. |
| **4** | **P1** | **Sight-Reading Leaks in Listening Tasks** | `13`, `17` | In `LISTEN_SELECT` and Minimal Pair Swipe, hide written English text distractors behind audio/picture cards so students must rely on listening discrimination rather than reading. |
| **5** | **P1** | **Practice Arena Active-Unit Precondition Trap** | `22`, `24`, `25`, `26` | Add an active unit banner and quick-switch selector at the top of Practice Arena; allow cross-unit pooling for Phonics and Spaced Review so learners never encounter empty-state dead ends. |
| **6** | **P1** | **Static Single Sentence in Pronunciation Coach** | `25` | Replace the hardcoded sentence (*"Let's practice English conversation!"*) with a dynamic 5-card speaking deck pulled from active unit vocabulary and `SPEAK_SENTENCE` pool items, featuring word-level color diagnostics. |
| **7** | **P2** | **Synchronized Audio & Karaoke Text Modeling** | `05`, `06`, `24` | Add a floating "Read to Me 🔊" player with word/sentence karaoke highlighting to StoryStage, Grammar Sandbox, and Reading Reader to ensure solo ESL learners hear native pronunciation. |
| **8** | **P2** | **Decouple Exploratory Taps from Stage Accuracy Stars** | `08`, `09`, `10` | In Word Search, Fast Vocab, and Memory Match, calculate completion stars based on completion time and match efficiency rather than penalizing initial exploratory taps. |
| **9** | **P2** | **Enforce or Remove Decorative Settings Toggles** | `28`, `Settings` | Connect the "Sound Effects" and "Speaking Exercises" toggles to global audio services and exercise runners, or remove them to eliminate deceptive illusion-of-control UI. |
| **10** | **P2** | **High-Dopamine Streak Flame & Chest Celebrations** | `23`, `27`, `28` | Integrate an animated Streak Flame advancement (`+1 Day 🔥`) directly onto the Lesson Complete screen, and replace flat quest toasts with an interactive 3D chest-opening celebration. |

## §5 Not used (audit-only file — no Stitch screens)

—>

## §6 Not used (audit-only file)

—>

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
