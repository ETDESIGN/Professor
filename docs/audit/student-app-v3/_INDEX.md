# student-app-v3 — Per-Game Quality Audit & Redesign Pipeline (2026-09-13)

Round 3 of the game redesign loop, applied to the **STUDENT app** — the successor of the classroom-board effort in `docs/audit/games-v3/` (24/24 board games shipped, ~803 tests green, tree clean on master — both preserved). Same discipline, different surface: `apps/student/**`, the `/student` portal, `student.html` entry — the personal-device app a single child uses at home or in solo study.

## The loop (per game) — v3.2 process with owner approval gate

```
ZCode: §0–§3 of NN-<game>.md (code audit + owner comments + screenshots)      status: file-ready
  ↓
ANTI-GRAVITY: §4 quality audit (writes INTO the file) + generates Stitch
  designs ITSELF (MOBILE project, its own Stitch key)                       ag-audit-done → stitch-designed
  ↓
ZCode: verifies designs inside Stitch (list_screens vs §4.f), exports to
  stitch/<NN>-<game>/ (HTML + PNG), QA per screen, §5 verdicts              zcode-verified
  ↓
OWNER: personal approval of the designs — HARD GATE. No implementation
  without his explicit go on that game's designs                            owner-approved
  ↓
Anti-Gravity: implements the approved design (one component file per game,
  boundaries per prompts/antigravity-handover.md)
  ↓
ZCode: reviews diff (scoring verbatim, no forbidden files), re-runs the
  gauntlet (tsc 0 errors · vitest ≥ 803 · clean build), before/after shots,
  commits per game (explicit paths only), pushes, redeploys touched edge
  functions by hand, verifies per AGENTS.md §8                             implemented/deployed
```

One game at a time. The owner tests live between games.

## Design targets (owner-set — differ from the board)

- **Mobile-first, kid's own hands**: thumb-reachable controls (primary actions bottom-half), tap targets **≥ 48 px**, no text under ~14 px, forgiving hit areas, portrait ~390 px primary floor + small-height landscape second.
- **NO board rules**: no 8-meter legibility, no `pl-40` phase-pill clearance, no landscape-cards-on-stage.
- **v3 visual language where it fits**: night navy `#070C18`, surfaces `#0B132B`/`#111C3D`/`#16234D`, hot-pink `#FF2E79` accent, sky `#38BDF8` audio/time, emerald correct, amber hints, Fredoka/Sora/JetBrains Mono — **but Stitch proposes per-game personality** exactly like the board (Grammar Forge dark-cyber, Spelling Bee honeycomb). Per-game tokens beat the generic block.
- ⚠️ **OPEN owner decision — light vs dark**: the current app is a LIGHT theme on two systems — `wa-*` (cream/paper/teal/terracotta, `tailwind.config` "Wonder Atlas") for the shell + `duo-*`/slate Duolingo-style for lesson content. The board's v3 identity is dark navy. Whether the student app goes dark-navy, stays light, or gets its own direction is THE cross-cutting call before implementation (see `_CROSS-CUTTING.md` #1 and the owner's own draft prompts at repo root).
- CJK tolerance everywhere Chinese appears (translations, meanings, card backs).

## Files

- `NN-<game>.md` — one per surface, numbered in the child's journey order (home → lesson steps → exercises → practice games → rewards → chrome)
- `_TEMPLATE.md` — the per-game file structure with the STUDENT prelude (solo model, kid-alone failure modes, sacred data-write map)
- `_CROSS-CUTTING.md` — themes spanning multiple surfaces + open owner decisions
- `prompts/antigravity-handover.md` — AG's instruction pack (Phase C deliverable)
- `screenshots/` — ZCode's captures of the current app (phone viewport first)
- `stitch/` — design exports, one subfolder per game (`<nn>-<game>/1-*.html|png`)

## Status legend

`pending` (file created, §0 only) · `file-ready` (§0–§3 filled) · `ag-audit-done` (§4 filled) · `stitch-designed` (AG generated, pending ZCode verify) · `zcode-verified` (§5 QA passed) · `owner-approved` (§6 explicit go) · `implemented` (code + gauntlet green) · `deployed`

## Inventory & status board (30 files — the complete surface map)

Legend for "Writes": `FSRS` = Engine.recordAttempt (memory model) · `♥` = hearts · `XP` = GamificationService.awardXP · `◆` = gems · `Q` = quests · `⭐` = stage stars · `local` = session-local score/accuracy only.

### The child's home (shell)

| # | File | Surface | Component(s) | Route | Data sources | Writes | Status |
|---|---|---|---|---|---|---|---|
| 01 | `01-home-map.md` | Home / Learn tab (winding path map, territory intro, quests header, join-class) | `HomeMap.tsx` + `atlas/TerritoryIntro.tsx`, `atlas/territory.ts`, `atlas/tokens.ts`, `CodeInput.tsx` (join modal in StudentApp) | `/student` | units via `Engine.fetchUnits`, mastery via `Engine.getUnitMasterySummary`, stage progress `getAllStageProgress`, student progress | read-only (navigation) | pending |
| 26 | `26-practice-arena.md` | Practice Arena menu | `PracticeMenu.tsx` | `/student/practice` | `Engine.fetchSRSItems` (due count badge) | read-only | pending |
| 27 | `27-lesson-complete.md` | Lesson-complete reward interstitial | `LessonComplete.tsx` + `StudentApp.finalizeLesson` | `/student/lesson-complete` | sessionResults passed in | XP `◆`(5★) `Q` (award site) | pending |
| 28 | `28-tab-screens.md` | Rank / Quests / Shop / Profile tabs + AvatarBuilder + Settings + Help (grouped chrome) | `Leaderboard.tsx`, `Quests.tsx`, `Shop.tsx`, `Profile.tsx`, `AvatarBuilder.tsx`, `Settings.tsx`, `HelpCenter.tsx` | `/student/leaderboard` `/quests` `/shop` `/profile` `/avatar` `/settings` `/help` | GamificationService, shop catalog, avatar v2 RPCs | XP/◆/Q per tab logic | pending |

### The lesson player (SoloLessonPlayer steps, `/student/solo-lesson`)

| # | File | Surface | Component(s) | Step type(s) | Data sources | Writes | Status |
|---|---|---|---|---|---|---|---|
| 02 | `02-lesson-shell.md` | Player shell: header/progress/5 hearts placeholder, footer nav, step routing, INTRO_SPLASH, empty states | `SoloLessonPlayer.tsx` | shell + `INTRO_SPLASH` | activeUnit flow via SoloSessionContext; gameRouting table | `⭐` completeStage at finish; XP via onComplete→finalizeLesson | pending |
| 03 | `03-word-lab.md` | Word Lab — vocabulary flip-card study phase | `WordLab.tsx` | `FOCUS_CARDS` | unit manifest `getVocabulary` (image/IPA/L1/definition/example + audio) | none (study gate) | pending |
| 04 | `04-media-player.md` | Song / karaoke step | inline in `SoloLessonPlayer.tsx` | `MEDIA_PLAYER` | flow block data (videoUrl/audioUrl/lyrics) | none | pending |
| 05 | `05-story-stage.md` | Story reader step (tappable vocab, read-along) | inline in `SoloLessonPlayer.tsx` | `STORY_STAGE` | flow `data.pages` + manifest `getCharacters` portraits | none | pending |
| 06 | `06-grammar-sandbox.md` | Grammar rule presentation step | inline in `SoloLessonPlayer.tsx` | `GRAMMAR_SANDBOX` | flow block data (rule/explanation/examples) | none | pending |
| 07 | `07-speed-quiz.md` | Quiz MCQ step (legacy in-shell battery) | inline in `SoloLessonPlayer.tsx` | `SPEED_QUIZ`/`GAME_ARENA` | flow `data.questions` | local (addPoints 'solo') | pending |
| 08 | `08-fast-vocab-step.md` | Fast Vocab engine step | `steps/FastVocabStep.tsx` (+ shared `components/games/fastVocab/*`) | `FAST_VOCAB` | pool_items IMAGE_SELECT+MEANING_MATCH | local (recordAnswer; XP at pipeline end) | pending |
| 09 | `09-word-search-step.md` | Word Search engine step (tap first/last letter) | `steps/WordSearchStep.tsx` (+ board `wordSearch/gridEngine.ts`) | `WORD_SEARCH` | pool_items → manifest vocab fallback | local (recordAnswer) | pending |
| 10 | `10-memory-match-step.md` | Memory Match engine step (embeds FlashMatch) | `steps/MemoryMatchStep.tsx` + `steps/memoryPairs.ts` + `FlashMatch.tsx` (embedded) | `MEMORY_LAB` (+legacy `FLASH_MATCH`) | manifest `getVocabulary` (word↔L1 pairs) | local (1 correct per pair — documented simplification) | pending |
| 11 | `11-spelling-bee-step.md` | Spelling Bee engine step (timeout ENDS run) | `steps/SpellingBeeStep.tsx` (+ shared `components/games/spellingBee/*`) | `SPELLING_BEE` | pool_items IMAGE_SELECT/MEANING_MATCH/DICTATION → `get_unit_bundle` vocab fallback | local (recordAnswer) | pending |
| 12 | `12-exercise-battery.md` | Exercise battery runner — the shell every pool-game family renders through (Sound Lab, Listen & Tap, Phonics, Word Detective, Vocab Blitz, Sentence Lab, Grammar Lab, Speaking, Dialogue, Story Quest, Speed Quiz, Unit Review) + gameRouting map | `exercises/ExerciseRunner.tsx` + `services/gameRouting.ts` | all `pool`/`pool-all` routed types | `prepareUnitForStudent` + `selectLessonItems` (FSRS-driven selection, seed per step) | **FSRS** per attempt · `♥` · XP per correct · Q EARN_XP/REACH_FAMILIAR · XP LESSON_COMPLETE + heart restore at finish | pending |

### Exercise components (ExerciseRunner children — the actual challenge screens)

| # | File | Surface | Component(s) | Exercise type(s) | Modality | Writes (via runner) | Status |
|---|---|---|---|---|---|---|---|
| 13 | `13-choice-exercise.md` | The one flexible MCQ renderer | `exercises/ChoiceExercise.tsx` | IMAGE_SELECT, MEANING_MATCH, AUDIO_L1_SELECT, LISTEN_SELECT, SPELL_CLOZE, ERROR_SPOT, TRANSFORM, GRAMMAR_FILL, STORY_COMPREHENSION, WHO_SAID_IT | receptive | FSRS/♥/XP per attempt | pending |
| 14 | `14-word-bank-build.md` | Sentence assembly from tiles | `exercises/WordBankBuild.tsx` | WORD_BANK_BUILD | productive | FSRS/♥/XP | pending |
| 15 | `15-dictation.md` | Type what you hear | `exercises/Dictation.tsx` | DICTATION | productive | FSRS/♥/XP | pending |
| 16 | `16-type-translate.md` | L1→L2 typing | `exercises/TypeTranslate.tsx` | TYPE_TRANSLATE | productive | FSRS/♥/XP | pending |
| 17 | `17-minimal-pair-swipe.md` | Confusable-pair 2-option audio choice | `exercises/MinimalPairSwipe.tsx` | MINIMAL_PAIR_SWIPE | receptive | FSRS/♥/XP | pending |
| 18 | `18-speak-sentence.md` | Speak-the-sentence (mic, tiered lenient scoring) | `exercises/SpeakSentence.tsx` | SPEAK_SENTENCE | productive (speech) | practice-only when client-graded (record:false) | pending |
| 19 | `19-dialogue-roleplay.md` | Line-by-line dialogue performance | `exercises/DialogueRoleplay.tsx` | DIALOGUE_ROLEPLAY | productive (speech) | practice-only when client-graded | pending |

### Standalone practice games (Practice Arena → full-screen)

| # | File | Surface | Component(s) | Route | Data sources | Writes | Status |
|---|---|---|---|---|---|---|---|
| 20 | `20-fast-vocab-solo.md` | Fast Vocab standalone (unit picker, longer-cycle pref, personal best) | `FastVocabGame.tsx` (+ shared engine) | `/student/fast-vocab` | pool_items by unit | local + **XP/◆/Q self-awarded once at end** (pattern A) | pending |
| 21 | `21-spelling-bee-solo.md` | Spelling Bee standalone (settings, timer/slow/removal prefs, personal best) | `SpellingBeeGame.tsx` (+ shared engine) | `/student/spelling-bee` | pool_items → get_unit_bundle fallback | local + XP/◆/Q self-awarded once (pattern A) | pending |
| 22 | `22-phonics-practice.md` | Phonics practice (minimal-pair battery wrapper) | `PhonicsPhlyer.tsx` | `/student/phonics` | pool_items MINIMAL_PAIR_SWIPE of active unit | via ExerciseRunner (FSRS/♥/XP) | pending |
| 23 | `23-daily-practice.md` | Daily Practice / SRS review (due+weak across all units) | `SpacedRepetition.tsx` | `/student/srs` | `selectPracticeItems` (FSRS due+weak) | via ExerciseRunner + capped XP + Q REVIEW_WORDS at done | pending |
| 24 | `24-reading-reader.md` | Reading reader + comprehension quiz | `ReadingReader.tsx` | `/student/reading` | manifest `getStory` pages + comprehension questions | session summary → XP via onSessionEnd | pending |
| 25 | `25-pronunciation-coach.md` | Pronunciation Coach (mic + waveform + similarity) | `PronunciationCoach.tsx` | `/student/pronounce` | none (fixed default sentence!) | XP via onSessionEnd (server-verified only) | pending |

### Legacy / flag-gated (document, don't redesign by default)

| # | File | Surface | Component(s) | Status today | Notes |
|---|---|---|---|---|---|
| 29 | `29-legacy-dead-code.md` | Dead-route runner + embedded trio | `LessonSession.tsx` (+`ListenTap.tsx`, `SentenceScramble.tsx`, PronunciationCoach/FlashMatch embedded modes) | **dead** — `/student/lesson` has no navigation path; ListenTap/SentenceScramble unreachable | Fake HUD hearts (hardcoded 5/4), Spanish-era patterns. Recommend delete-or-archive decision; do NOT redesign. FlashMatch lives on via file 10. |
| 30 | `30-dubbing-studio.md` | Dubbing Studio + Class gallery | `DubbingStudio.tsx`, `ClassDubs.tsx` (+`dubbing/useDubRecorder.ts`) | flag-gated OFF (`VITE_ENABLE_DUBBING`) | Real scans + scoring exist (edge `evaluate-dubbing`); keep parked unless owner unblocks. |

## Registry facts (for reference)

- **Entry**: `studentEntry.tsx` → `AuthGate portal="student"` → `StudentApp.tsx` (route table above). Phone-frame shell: `max-w-md mx-auto` + fixed 5-tab bottom bar (Learn/Rank/Quests/Shop/Profile) on tab screens; full-screen flows hide the bar.
- **Lesson pipeline**: HomeMap node tap → `startLesson(unitId, stageId)` → `setActiveUnit` (fresh unit fetch + `get_unit_bundle` relational attach + stage scoping with stale-id recovery) → `/student/solo-lesson` → SoloLessonPlayer (step routing via `services/gameRouting.ts`) → `onComplete` → LessonComplete → `finalizeLesson` (XP + 5★ gems + quests) → home.
- **The pool-game families → battery routing** (file 12 owns this table): FAST_VOCAB/SPELLING_BEE/WORD_SEARCH/MEMORY_LAB = engines; SOUND_LAB & LISTEN_TAP = audio MCQ; PHONICS_ARENA = minimal pairs; WORD_DETECTIVE/VOCAB_BLITZ = vocab MCQ families; SENTENCE_LAB/GRAMMAR_LAB = construction; SPEAKING/DIALOGUE_STAGE = speech; STORY_QUEST = comprehension; UNIT_REVIEW = interleaved everything. Signature-first ordering per family (v2, owner 2026-09-10).
- **Student eligibility gate**: `STUDENT_ELIGIBLE_TYPES` + `EXTRA_ELIGIBLE_TYPES` (`types/stage.ts`, `services/gameRouting.ts:48-52`) — classroom-only types (CLASS_RALLY etc.) never reach the student map.
- **Hearts**: real DB-backed balance for the battery (`HEARTS_MAX`, productive errors only, unavailable-balance guard); the SoloLessonPlayer shell's "5 hearts" header is a LOCAL placeholder that never gates anything (finding parked for §3 of file 02).
- **Screenshot tooling**: games-v3 pattern (Playwright, dev server, fixture login) is reusable, but **student auth differs**: students are teacher-minted passports (`student-passports` edge fn, `@passport.local` emails, AES-GCM creds) — Phase B fixture = mint a throwaway passport for the pipeline account's class, log in as that student, walk `/student`. Screenshots land in `screenshots/`, phone viewport 390×844 @2x first, landscape 700×320 second.
- **Test baseline**: 803 vitest green on master at `student-app-v3-phase-a-start` (tag pushed). Gauntlet = `npx tsc --noEmit -p tsconfig.json` 0 errors · `npx vitest run` ≥ 803 · `npm run build` clean.

## Cross-cutting open questions (parked in `_CROSS-CUTTING.md`, owner decides)

1. **Light vs dark** — current `wa-*`/`duo-*` light theme vs board v3 night-navy vs a fresh direction. The owner's own draft prompts (untracked, repo root: `PROMPT_STITCH_STUDENT_APP_UI.md`, `PROMPT_STITCH_STUDENT_SCREENS.md` — 28-screen checklist, "brainstorm 4 directions" approach) predate the v3 dark language and lean Duolingo-evolution. **Ask before any design generation.**
2. The two untracked PROMPT_STITCH files are owner WIP — never commit without asking; are they superseded by this pipeline?
3. Dead code (file 29): delete LessonSession/ListenTap/SentenceScramble or leave parked?
4. Dubbing (file 30): stays flag-off?
5. Hearts: the shell's fake hearts (file 02) vs the battery's real hearts — unify?

## Change log

- 2026-09-13 — **PHASE A COMPLETE.** Folder + student prelude template + this index created; 30 per-game files generated with §0 identity filled from a full code read of `apps/student/**` (~10.4k lines: shell, player, 4 engine steps, runner, 7 exercise components, 6 standalone games, legacy + dubbing). Tag `student-app-v3-phase-a-start` pushed. Screenshots deferred to per-game §0–§3 prep (passport fixture required — first capture lands with the pilot game, same as games-v3). **Next: owner comments intake → pilot game selection.**
