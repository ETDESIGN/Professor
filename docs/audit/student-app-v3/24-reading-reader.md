# Reading Reader — v3 Quality Audit (`PRACTICE: /student/reading`)
> **Current status:** deployed

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

- **Surface / route:** `/student/reading` (Practice Arena) — `apps/student/ReadingReader.tsx` (216 ln)
- **Exercise types consumed:** none pool-driven — manifest story pages + flattened `comprehension_questions` per page
- **Data sources:** `getStory(activeUnit.manifest)` pages (image/speaker/text) + `getVocabulary` tappable-word map
- **Scoring & data writes:** quiz picks counted locally; `onSessionEnd({correct, total})` at finish → StudentApp awards XP (max(1, correct×XP)) + Q PERFECT_SPEAKING if perfect (note: quest type is speaking-named — parked for §3)
- **Reachability:** Practice Arena → Reading tile; read pages → quiz phase
- **Theme today:** slate-50; aspect-video page art + large text + tappable blue vocab + quiz cards

## §1 How the game works today

*(Screenshots pending.)*

ReadingReader (`ReadingReader.tsx`): manifest story pages (aspect-video art + speaker chip + large centered text with tappable blue vocab → popover with definition/L1 :187-196) → page dots footer (:199-211) → quiz phase over flattened `comprehension_questions` (:31-41): one question at a time, tap-to-reveal (green correct / red picked), Next → finish → `onSessionEnd({correct, total})` (:89-112). Empty state when the unit has no story (:52-65).

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs: `apps/student/ReadingReader.tsx`, `StudentApp.tsx:232`.

- **F1 · P2 — Missing-image fallback leaks the raw AI prompt to kids.** `{page.image_prompt || 'No image'}` renders the generation prompt text ("A watercolor illustration of…") in the art slot (:132-137) — an internal artifact on a child-facing surface; needs a friendly placeholder.
- **F2 · P3 — PERFECT_SPEAKING quest credited for perfect READING** (StudentApp.tsx:232) — quest-type mislabel; reading perfection should feed its own (or a comprehension) quest.
- **F3 · P3 — Quiz has no explanations and no retry** — reveal → Next; wrong answers pass by untaught (battery re-queue doesn't apply here).
- **F4 · P3 — Vocab popover has no tap-outside close** (:188) and no audio button (definition/L1 only — inconsistent with the Story step's speak-enabled popup).
- **F5 · P3 — No page TTS/read-along control** — the Story step has Read-along; Reading mode (the dedicated reading surface!) doesn't.

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P1 — Internal AI generation prompts leak into the child's storybook picture frame.**
  - *Evidence:* `ReadingReader.tsx:136` renders `{page.image_prompt || 'No image'}` directly inside the image placeholder when an image URL is missing or failing to load (`F1`). Children see raw system prompt text (e.g., *"A watercolor illustration of a puppy finding a lost key in an enchanted park, storybook style, soft lighting"*), exposing backend generation metadata and ruining the narrative magic.
  - *Recommendation:* Never display prompt text to students. Replace with a beautiful storybook cover placeholder featuring a warm pastel palette, a gentle book illustration, and an ambient chapter vignette tag.
- **F2 · P2 — Vocabulary popup traps clicks and lacks tap-outside dismissal.**
  - *Evidence:* `ReadingReader.tsx:188` attaches `onClick={() => setSelectedWord(null)}` directly to the popup box itself (`F4`). Tapping the text inside the popup immediately dismisses it, and there is no backdrop scrim to dismiss it when clicking outside. Crucially, unlike the in-lesson `StoryStage`, this popup lacks a speaker button to hear the vocabulary pronounced.
  - *Recommendation:* Render the vocabulary details inside a clean bottom-sheet drawer with a subtle backdrop scrim, tap-outside dismissal, clear phonetic pronunciation, and a prominent `[🔊 Hear Word]` button.

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P1 — Incorrect quest awarded: PERFECT_SPEAKING credited for reading a silent book.**
  - *Evidence:* `StudentApp.tsx:232` checks `if (correct === total) GamificationService.updateQuestProgress(QUEST_TYPES.PERFECT_SPEAKING, 1)` (`F2`). The child read silently and tapped multiple-choice buttons without ever activating a microphone or uttering a sound, yet unlocks a speaking quest.
  - *Recommendation:* Disconnect the speaking quest and correctly credit reading habit loops: award `QUEST_TYPES.READ_STORY` (or `PERFECT_LESSON`) and log reading time toward daily literacy milestones.
- **F4 · P2 — Unit-bound dead-end prevents exploring other storybooks.**
  - *Evidence:* `ReadingReader.tsx:52-65` checks `state.activeUnit`. If the active unit has no story, the child is stranded with a "No story in this unit" message and a simple "Back" button.
  - *Recommendation:* Upgrade the launcher into a "Storybook Library" shelf where the child can select and re-read stories across all unlocked units.

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P1 — Dedicated reading mode lacks Read-Aloud audio and phonetic modeling.**
  - *Evidence:* `ReadingReader.tsx:130-143` (`F5`). While the in-lesson `StoryStage` contains a read-along feature, this dedicated practice reading mode is completely silent. For ESL children aged 6–12 reading alone at home, lack of native audio modeling makes decoding unfamiliar vocabulary impossible and promotes fossilized mispronunciation.
  - *Recommendation:* Add a prominent floating "Read to Me 🔊" player toolbar with natural TTS playback, speed control (0.8x / 1.0x), and synchronized sentence or word-by-word karaoke highlighting.
- **F6 · P2 — Unassisted comprehension quiz leaves struggling readers stranded.**
  - *Evidence:* `ReadingReader.tsx:151-175`. Comprehension questions and options are pure written English with no audio support. If a child cannot decode the written question, they guess randomly, defeating comprehension assessment.
  - *Recommendation:* Include a speaker button next to every quiz question and answer option so learners can listen to the comprehension prompts.

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F7 · P2 — Punitive wrong-answer reveals with no ability to reference the story text.**
  - *Evidence:* `ReadingReader.tsx:156-175` (`F3`). When a student selects an incorrect option, the tile turns red and immediately enables the "Next" button. The student is not given an explanation, cannot view the original page where the answer was stated, and missed questions are never re-tested.
  - *Recommendation:* Add a "Peek at Story 📖" button during the quiz that opens a slide-over view of the relevant story page, and re-queue missed questions at the end of the quiz so the child achieves true comprehension before finishing.

### 4.e Top-5 prioritized recommendations
1. **Sanitize Missing Image Fallback (P1):** Replace raw AI prompt text (`page.image_prompt`) with an illustrated storybook bookplate placeholder.
2. **Add "Read to Me" Audio & Karaoke Highlighting (P1):** Add an ambient read-along player with native TTS audio modeling to support solo ESL readers.
3. **Fix Quest Misattribution (P1):** Stop awarding `PERFECT_SPEAKING` for silent reading; credit `READ_STORY` and literacy quest milestones instead.
4. **Interactive Vocab Drawer with Pronunciation Audio (P2):** Modernize the word popover into a dismissible bottom drawer equipped with phonetic guide and pronunciation audio.
5. **Add "Peek at Story" & Re-queue on Comprehension Quiz (P2):** Allow students to reference the story when answering questions and re-queue missed items to guarantee understanding.

### 4.f Stitch design log (AG fills as it generates)

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Game Subsystem:** Reading Reader Story & Comprehension (`24-reading-reader.md`)
- **Generation Date:** 2026-09-13
- **Submission Status:** 2 screens submitted and successfully materialized in Stitch datastore (HTTP 200 / Exit code 0).
- **Quota Discipline:** 2 screens generated (max 2 per game).

#### Screens Generated & Brief Summaries:

1. **Screen 1: Reading Reader Story Page with Read-to-Me & Sanitized Art Bookplate**
   - **Stitch Screen ID:** `96d3496ccfcc4571b7e1530dc0cd383b`
   - **Title:** `Professor ESL - Reading Reader (The Great Bridge Adventure)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1UDOiM7Hkh1hBMxPr1rks8DzjCl-GRaxjlh0X0ZFxhmQay4zvFEpKBNJLQiJTNdL-OgKAZGzG9u3QYZDII8dJddV8NnA2EATQJxQzgWvW04ndjtlqDexfIZD4mIFvK0VgXntpr5EhR0FdJP77391lkjZ4sYEVRhuHhec9TXZbtbxXOKFjl4HB5bdBqJhoxM_Rk727GHdfBcvAAr9oLSXYzPGyzyIj1S-2keXrllR64eUnTwOJOkXKCUl6w`
   - **Prompt Summary:** Mobile portrait (390×844) Reading Reader illustrated storybook page with Read-to-Me player in Wonder Atlas Light design system. Universal 64px header on paper `#FDFBF7` with 48px exit button (`[🔊 playCue: tap_exit]`), story title 'The Great Bridge Adventure', and page progress indicator 'Page 2 of 4'. Center Stage: Storybook Page Card on warm paper `#FDFBF7` with subtle border `#E2D7C3` and radius 20px: Top Section: Friendly Storybook Bookplate Placeholder (replacing any raw AI image prompt leaks!) - stylized vector bookplate with golden book icon, chapter title 'Chapter 2: The Crossing', and soft watercolor bridge vignette, with badge '📖 Storybook Art • City Bridge'. Floating 'Read-to-Me 🔊' Player Toolbar (in soft cream `#EAE0D0` with 2px teal border `#2A9D8F`): Play/Pause FAB in Duolingo blue `#1CB0F6` (`[🔊 playCue: read_to_me_play]`), audio progress scrubber, and '0.8x Turtle 🐢' speed toggle. Story Narrative Text (18px Lexend in inkDeep `#1D3557`): 'Every morning, Toby and his sister walk across the tall stone bridge to reach school. Under the bridge, the river flows toward the sea.' Active sentence highlighted in soft yellow `#FEF3C7` karaoke sync. Tappable vocabulary word 'bridge' has subtle dashed teal underline (`[🔊 playCue: vocab_pop]`). Footer Navigation: Page dots `[ ○ ● ○ ○ ]`, Previous button, and 52px CTA 'NEXT PAGE ➔' in terracotta `#E76F51` with hard bevel `0 4px 0 #C4553B` (`[🔊 playCue: next_page]`).
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header exit tap
     - `[🔊 playCue: read_to_me_play]` on Read-to-Me toolbar play tap
     - `[🔊 playCue: vocab_pop]` on tapping underlined vocabulary word
     - `[🔊 playCue: next_page]` on next page CTA tap
   - **Design Contract:** Wonder Atlas warm tokens (cream `#EAE0D0`, paper `#FDFBF7`, border `#E2D7C3`, ink `#264653`, inkDeep `#1D3557`, teal `#2A9D8F`, terracotta `#E76F51`, sand `#E9C46A`) × Duolingo accents (`#1CB0F6`, `#E91E63`), Fredoka + Nunito typography, production-grade Tailwind HTML + small style block, zero placeholder chrome.

2. **Screen 2: Reading Reader Comprehension Quiz with Peek at Story Utility**
   - **Stitch Screen ID:** `ff8d8b588bc54cbe9ef6c91ef1f27c3d`
   - **Title:** `Professor ESL - Reading Reader Comprehension Quiz`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1XDJvI5Yq7Aip5uL1Yr3erc2MEjlEGsQ2BW60NEiUSNnlfULMiBAZw1NwUNv_glszuGVkDvq1bfUhRak_gT-KrNLQK0N-DTwiolBXpoFQ8etwMUWBEfcmmLMTUfAQFu1W_ixY6DsaPTaF5K10BGXIzXo7wHdnzIwxhjUL8AXXjXaYWybfcf7IJyND__dqQPETpvfGLJlOnXBWPNcY12DYIiom7a0A2RW2TSpvgLRpAfQhnlPPqXtI7SaZE`
   - **Prompt Summary:** Mobile portrait (390×844) Reading Reader Comprehension Quiz screen in Wonder Atlas Light design system. Universal 64px header on paper `#FDFBF7` with 48px exit button (`[🔊 playCue: tap_exit]`), title 'Story Quiz: Bridge Adventure', and question tracker 'Question 2 of 3'. Top Utility Row: '📖 Peek at Story' slide-over button in paper `#FDFBF7` (lets child verify facts in text) (`[🔊 playCue: peek_story]`). Center Question Card on warm paper `#FDFBF7` with 2.5px border `#E2D7C3` and radius 20px: Question with 44px blue audio speaker FAB: 'Where do Toby and his sister walk every morning?' (`[🔊 playCue: question_audio]`) and Chinese '托比和妹妹每天早上走过哪里？'. 3 Tactile Option Cards (min 68px height, 3D bevel `0 4px 0 #E2D7C3`): Option A (Active Correct Selected): 'Across the tall stone bridge' in soft emerald `#E6F4F1` with 2.5px teal border `#2A9D8F`, checkmark badge, and audio FAB (`[🔊 playCue: correct_chime]`). Option B: 'Through the dark subway station', paper `#FDFBF7`. Option C: 'Around the city hospital', paper `#FDFBF7`. Feedback card: 'Great comprehension! +10 XP earned.' Re-queue note: 'Missed questions return at the end to guarantee mastery.' Anchored 76px footer with 56px primary CTA 'CONTINUE TO QUESTION 3 ➔' in terracotta `#E76F51` with hard bevel `0 4px 0 #C4553B` (`[🔊 playCue: next_question]`).
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header exit tap
     - `[🔊 playCue: peek_story]` on Peek at Story button tap
     - `[🔊 playCue: question_audio]` on question speaker FAB tap
     - `[🔊 playCue: correct_chime]` on correct choice tap
     - `[🔊 playCue: next_question]` on continue CTA tap
   - **Design Contract:** Exact token hexes, thumb-reachable actions, production-grade Tailwind HTML + style block.

## §5 ZCode design verification (inside Stitch)

**Verified 2026-09-13** (owner batch pre-approval). Project `6865954475041880496`; exports in `stitch/24-reading-reader/`. Screens 1-2 — PASS: Read-to-Me + quiz + friendly missing-image placeholder.-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**PRE-APPROVED 2026-09-13 (owner batch directive):** "implement them all right away without waiting for my approval… we will modify [off designs] afterward."

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
