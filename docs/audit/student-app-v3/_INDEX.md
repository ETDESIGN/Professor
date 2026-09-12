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

## Design targets (owner-set 2026-09-13 — see `_CROSS-CUTTING.md` §0 for the verbatim direction)

- **Mobile-first, kid's own hands**: thumb-reachable controls (primary actions bottom-half), tap targets **≥ 48 px**, no text under ~14 px, forgiving hit areas, portrait ~390 px primary floor + small-height landscape second.
- **NO board rules**: no 8-meter legibility, no `pl-40` phase-pill clearance, no landscape-cards-on-stage, **and NOT the board's dark-navy identity**.
- **Design language = a MIX of the app's two current light systems** (owner decision): "Wonder Atlas" warmth (cream/paper/teal/terracotta, Fredoka display — the home-page world) × "Duolingo white + pink" (clean white cards, `duo-pink` accents — the lesson world). Per-game personality welcome within that light mix.
- **Student HOME page design is FROZEN** — functionality audit only (file 01); no Stitch redesign.
- **Screens already good stay as implemented** — redesigns are surgical, per-game, sized by the audits (big vs slight improvement).
- **AG recreates screens as reusable code** (production-grade Tailwind HTML adapted nearly verbatim); the **owner validates every screen before implementation** and may iterate himself inside Stitch.
- CJK tolerance everywhere Chinese appears (translations, meanings, card backs).

## Files

- `NN-<game>.md` — one per surface, numbered in the child's journey order (home → lesson steps → exercises → practice games → rewards → chrome)
- `_TEMPLATE.md` — the per-game file structure with the STUDENT prelude (solo model, kid-alone failure modes, sacred data-write map)
- `_CROSS-CUTTING.md` — themes spanning multiple surfaces + open owner decisions
- `prompts/antigravity-handover.md` — **AG's mission pack (written 2026-09-13)** — works for manual paste OR headless `agy` launch. Contains the critic mandate, §4 rules, Stitch tooling + traps, the Wonder Atlas × Duolingo token block, the reusable-code design briefing, and implementation boundaries
- `screenshots/` — ZCode's captures of the current app (phone viewport first)
- `stitch/` — design exports, one subfolder per game (`<nn>-<game>/1-*.html|png`)

## Status legend

`pending` (file created, §0 only) · `file-ready` (§0–§3 filled) · `ag-audit-done` (§4 filled) · `stitch-designed` (AG generated, pending ZCode verify) · `zcode-verified` (§5 QA passed) · `owner-approved` (§6 explicit go) · `implemented` (code + gauntlet green) · `deployed`

## Inventory & status board (30 files — the complete surface map)

Legend for "Writes": `FSRS` = Engine.recordAttempt (memory model) · `♥` = hearts · `XP` = GamificationService.awardXP · `◆` = gems · `Q` = quests · `⭐` = stage stars · `local` = session-local score/accuracy only.

### The child's home (shell)

| # | File | Surface | Component(s) | Route | Data sources | Writes | Status |
|---|---|---|---|---|---|---|---|
| 01 | `01-home-map.md` | Home / Learn tab (winding path map, territory intro, quests header, join-class) | `HomeMap.tsx` + `atlas/TerritoryIntro.tsx`, `atlas/territory.ts`, `atlas/tokens.ts`, `CodeInput.tsx` (join modal in StudentApp) | `/student` | units via `Engine.fetchUnits`, mastery via `Engine.getUnitMasterySummary`, stage progress `getAllStageProgress`, student progress | read-only (navigation) | **ag-audit-done** |
| 26 | `26-practice-arena.md` | Practice Arena menu | `PracticeMenu.tsx` | `/student/practice` | `Engine.fetchSRSItems` (due count badge) | read-only | **ag-audit-done** |
| 27 | `27-lesson-complete.md` | Lesson-complete reward interstitial | `LessonComplete.tsx` + `StudentApp.finalizeLesson` | `/student/lesson-complete` | sessionResults passed in | XP `◆`(5★) `Q` (award site) | **ag-audit-done** |
| 28 | `28-tab-screens.md` | Rank / Quests / Shop / Profile tabs + AvatarBuilder + Settings + Help (grouped chrome) | `Leaderboard.tsx`, `Quests.tsx`, `Shop.tsx`, `Profile.tsx`, `AvatarBuilder.tsx`, `Settings.tsx`, `HelpCenter.tsx` | `/student/leaderboard` `/quests` `/shop` `/profile` `/avatar` `/settings` `/help` | GamificationService, shop catalog, avatar v2 RPCs | XP/◆/Q per tab logic | **ag-audit-done** |

### The lesson player (SoloLessonPlayer steps, `/student/solo-lesson`)

| # | File | Surface | Component(s) | Step type(s) | Data sources | Writes | Status |
|---|---|---|---|---|---|---|---|
| 02 | `02-lesson-shell.md` | Player shell: header/progress/5 hearts placeholder, footer nav, step routing, INTRO_SPLASH, empty states | `SoloLessonPlayer.tsx` | shell + `INTRO_SPLASH` | activeUnit flow via SoloSessionContext; gameRouting table | `⭐` completeStage at finish; XP via onComplete→finalizeLesson | **ag-audit-done** |
| 03 | `03-word-lab.md` | Word Lab — vocabulary flip-card study phase | `WordLab.tsx` | `FOCUS_CARDS` | unit manifest `getVocabulary` (image/IPA/L1/definition/example + audio) | none (study gate) | **ag-audit-done** |
| 04 | `04-media-player.md` | Song / karaoke step | inline in `SoloLessonPlayer.tsx` | `MEDIA_PLAYER` | flow block data (videoUrl/audioUrl/lyrics) | none | **ag-audit-done** |
| 05 | `05-story-stage.md` | Story reader step (tappable vocab, read-along) | inline in `SoloLessonPlayer.tsx` | `STORY_STAGE` | flow `data.pages` + manifest `getCharacters` portraits | none | **ag-audit-done** |
| 06 | `06-grammar-sandbox.md` | Grammar rule presentation step | inline in `SoloLessonPlayer.tsx` | `GRAMMAR_SANDBOX` | flow block data (rule/explanation/examples) | none | **ag-audit-done** |
| 07 | `07-speed-quiz.md` | Quiz MCQ step (legacy in-shell battery) | inline in `SoloLessonPlayer.tsx` | `SPEED_QUIZ`/`GAME_ARENA` | flow `data.questions` | local (addPoints 'solo') | **ag-audit-done** |
| 08 | `08-fast-vocab-step.md` | Fast Vocab engine step | `steps/FastVocabStep.tsx` (+ shared `components/games/fastVocab/*`) | `FAST_VOCAB` | pool_items IMAGE_SELECT+MEANING_MATCH | local (recordAnswer; XP at pipeline end) | **ag-audit-done** |
| 09 | `09-word-search-step.md` | Word Search engine step (tap first/last letter) | `steps/WordSearchStep.tsx` (+ board `wordSearch/gridEngine.ts`) | `WORD_SEARCH` | pool_items → manifest vocab fallback | local (recordAnswer) | **ag-audit-done** |
| 10 | `10-memory-match-step.md` | Memory Match engine step (embeds FlashMatch) | `steps/MemoryMatchStep.tsx` + `steps/memoryPairs.ts` + `FlashMatch.tsx` (embedded) | `MEMORY_LAB` (+legacy `FLASH_MATCH`) | manifest `getVocabulary` (word↔L1 pairs) | local (1 correct per pair — documented simplification) | **ag-audit-done** |
| 11 | `11-spelling-bee-step.md` | Spelling Bee engine step (timeout ENDS run) | `steps/SpellingBeeStep.tsx` (+ shared `components/games/spellingBee/*`) | `SPELLING_BEE` | pool_items IMAGE_SELECT/MEANING_MATCH/DICTATION → `get_unit_bundle` vocab fallback | local (recordAnswer) | **ag-audit-done** |
| 12 | `12-exercise-battery.md` | Exercise battery runner — the shell every pool-game family renders through (Sound Lab, Listen & Tap, Phonics, Word Detective, Vocab Blitz, Sentence Lab, Grammar Lab, Speaking, Dialogue, Story Quest, Speed Quiz, Unit Review) + gameRouting map | `exercises/ExerciseRunner.tsx` + `services/gameRouting.ts` | all `pool`/`pool-all` routed types | `prepareUnitForStudent` + `selectLessonItems` (FSRS-driven selection, seed per step) | **FSRS** per attempt · `♥` · XP per correct · Q EARN_XP/REACH_FAMILIAR · XP LESSON_COMPLETE + heart restore at finish | **deployed** |

### Exercise components (ExerciseRunner children — the actual challenge screens)

| # | File | Surface | Component(s) | Exercise type(s) | Modality | Writes (via runner) | Status |
|---|---|---|---|---|---|---|---|
| 13 | `13-choice-exercise.md` | The one flexible MCQ renderer | `exercises/ChoiceExercise.tsx` | IMAGE_SELECT, MEANING_MATCH, AUDIO_L1_SELECT, LISTEN_SELECT, SPELL_CLOZE, ERROR_SPOT, TRANSFORM, GRAMMAR_FILL, STORY_COMPREHENSION, WHO_SAID_IT | receptive | FSRS/♥/XP per attempt | **deployed** |
| 14 | `14-word-bank-build.md` | Sentence assembly from tiles | `exercises/WordBankBuild.tsx` | WORD_BANK_BUILD | productive | FSRS/♥/XP | **ag-audit-done** |
| 15 | `15-dictation.md` | Type what you hear | `exercises/Dictation.tsx` | DICTATION | productive | FSRS/♥/XP | **ag-audit-done** |
| 16 | `16-type-translate.md` | L1→L2 typing | `exercises/TypeTranslate.tsx` | TYPE_TRANSLATE | productive | FSRS/♥/XP | **ag-audit-done** |
| 17 | `17-minimal-pair-swipe.md` | Confusable-pair 2-option audio choice | `exercises/MinimalPairSwipe.tsx` | MINIMAL_PAIR_SWIPE | receptive | FSRS/♥/XP | **ag-audit-done** |
| 18 | `18-speak-sentence.md` | Speak-the-sentence (mic, tiered lenient scoring) | `exercises/SpeakSentence.tsx` | SPEAK_SENTENCE | productive (speech) | practice-only when client-graded (record:false) | **ag-audit-done** |
| 19 | `19-dialogue-roleplay.md` | Line-by-line dialogue performance | `exercises/DialogueRoleplay.tsx` | DIALOGUE_ROLEPLAY | productive (speech) | practice-only when client-graded | **ag-audit-done** |

### Standalone practice games (Practice Arena → full-screen)

| # | File | Surface | Component(s) | Route | Data sources | Writes | Status |
|---|---|---|---|---|---|---|---|
| 20 | `20-fast-vocab-solo.md` | Fast Vocab standalone (unit picker, longer-cycle pref, personal best) | `FastVocabGame.tsx` (+ shared engine) | `/student/fast-vocab` | pool_items by unit | local + **XP/◆/Q self-awarded once at end** (pattern A) | **ag-audit-done** |
| 21 | `21-spelling-bee-solo.md` | Spelling Bee standalone (settings, timer/slow/removal prefs, personal best) | `SpellingBeeGame.tsx` (+ shared engine) | `/student/spelling-bee` | pool_items → get_unit_bundle fallback | local + XP/◆/Q self-awarded once (pattern A) | **ag-audit-done** |
| 22 | `22-phonics-practice.md` | Phonics practice (minimal-pair battery wrapper) | `PhonicsPhlyer.tsx` | `/student/phonics` | pool_items MINIMAL_PAIR_SWIPE of active unit | via ExerciseRunner (FSRS/♥/XP) | **ag-audit-done** |
| 23 | `23-daily-practice.md` | Daily Practice / SRS review (due+weak across all units) | `SpacedRepetition.tsx` | `/student/srs` | `selectPracticeItems` (FSRS due+weak) | via ExerciseRunner + capped XP + Q REVIEW_WORDS at done | **ag-audit-done** |
| 24 | `24-reading-reader.md` | Reading reader + comprehension quiz | `ReadingReader.tsx` | `/student/reading` | manifest `getStory` pages + comprehension questions | session summary → XP via onSessionEnd | **ag-audit-done** |
| 25 | `25-pronunciation-coach.md` | Pronunciation Coach (mic + waveform + similarity) | `PronunciationCoach.tsx` | `/student/pronounce` | none (fixed default sentence!) | XP via onSessionEnd (server-verified only) | **ag-audit-done** |

### Legacy / flag-gated (document, don't redesign by default)

| # | File | Surface | Component(s) | Status today | Notes |
|---|---|---|---|---|---|
| 29 | `29-legacy-dead-code.md` | Dead-route runner + embedded trio | `LessonSession.tsx` (+`ListenTap.tsx`, `SentenceScramble.tsx`, PronunciationCoach/FlashMatch embedded modes) | **dead** — `/student/lesson` has no navigation path; ListenTap/SentenceScramble unreachable | Fake HUD hearts (hardcoded 5/4), Spanish-era patterns. Recommend delete-or-archive decision; do NOT redesign. FlashMatch lives on via file 10. |
| 30 | `30-dubbing-studio.md` | Dubbing Studio + Class gallery | `DubbingStudio.tsx`, `ClassDubs.tsx` (+`dubbing/useDubRecorder.ts`) | flag-gated OFF (`VITE_ENABLE_DUBBING`) | Real scans + scoring exist (edge `evaluate-dubbing`); keep parked unless owner unblocks. |

### The app-level critic file (audit-only)

| # | File | Surface | Owner mandate | Status |
|---|---|---|---|---|
| 31 | `31-app-flow-ux.md` | The whole child journey (login → home → lesson → practice → rewards) | AG's flagship §4: user flow / UX / functionality / pedagogic flow / UI critique of the app IN GENERAL | **ag-audit-done** |

## Registry facts (for reference)

- **Entry**: `studentEntry.tsx` → `AuthGate portal="student"` → `StudentApp.tsx` (route table above). Phone-frame shell: `max-w-md mx-auto` + fixed 5-tab bottom bar (Learn/Rank/Quests/Shop/Profile) on tab screens; full-screen flows hide the bar.
- **Lesson pipeline**: HomeMap node tap → `startLesson(unitId, stageId)` → `setActiveUnit` (fresh unit fetch + `get_unit_bundle` relational attach + stage scoping with stale-id recovery) → `/student/solo-lesson` → SoloLessonPlayer (step routing via `services/gameRouting.ts`) → `onComplete` → LessonComplete → `finalizeLesson` (XP + 5★ gems + quests) → home.
- **The pool-game families → battery routing** (file 12 owns this table): FAST_VOCAB/SPELLING_BEE/WORD_SEARCH/MEMORY_LAB = engines; SOUND_LAB & LISTEN_TAP = audio MCQ; PHONICS_ARENA = minimal pairs; WORD_DETECTIVE/VOCAB_BLITZ = vocab MCQ families; SENTENCE_LAB/GRAMMAR_LAB = construction; SPEAKING/DIALOGUE_STAGE = speech; STORY_QUEST = comprehension; UNIT_REVIEW = interleaved everything. Signature-first ordering per family (v2, owner 2026-09-10).
- **Student eligibility gate**: `STUDENT_ELIGIBLE_TYPES` + `EXTRA_ELIGIBLE_TYPES` (`types/stage.ts`, `services/gameRouting.ts:48-52`) — classroom-only types (CLASS_RALLY etc.) never reach the student map.
- **Hearts**: real DB-backed balance for the battery (`HEARTS_MAX`, productive errors only, unavailable-balance guard); the SoloLessonPlayer shell's "5 hearts" header is a LOCAL placeholder that never gates anything (finding parked for §3 of file 02).
- **Screenshot tooling**: games-v3 pattern (Playwright, dev server, fixture login) is reusable, but **student auth differs**: students are teacher-minted passports (`student-passports` edge fn, `@passport.local` emails, AES-GCM creds) — Phase B fixture = mint a throwaway passport for the pipeline account's class, log in as that student, walk `/student`. Screenshots land in `screenshots/`, phone viewport 390×844 @2x first, landscape 700×320 second.
- **Test baseline**: 803 vitest green on master at `student-app-v3-phase-a-start` (tag pushed). Gauntlet = `npx tsc --noEmit -p tsconfig.json` 0 errors · `npx vitest run` ≥ 803 · `npm run build` clean.

## Cross-cutting open questions (parked in `_CROSS-CUTTING.md`, owner decides)

1. ~~Light vs dark~~ **RESOLVED 2026-09-13** — redesigns mix Wonder Atlas × Duolingo white/pink; home design frozen (see `_CROSS-CUTTING.md` §0 + §1).
2. ~~The owner's root PROMPT_STITCH files~~ — content checklists useful, process superseded; still owner WIP, never commit.
3. Dead code (file 29): delete LessonSession/ListenTap/SentenceScramble or leave parked? — recommendation: delete, owner confirms.
4. Hearts: the shell's fake hearts (file 02 F1) vs the battery's real hearts — unify? (battery model is the honest one)
5. Spelling Bee SPLIT rule in-lesson (file 11 F1): timeout ends the run — **DELEGATED to Anti-Gravity (owner 2026-09-13)** to evaluate hard-end vs reveal+continue vs hybrids and recommend with rationale in 11's §4; owner ratifies at design approval.
6. Gems gate unreachable from lessons (file 27 F1) — intended or fix?
7. Dubbing (file 30): stays flag-off (parked).

## Change log

- 2026-09-13 — **PHASE A COMPLETE.** Folder + student prelude template + this index created; 30 per-game files generated with §0 identity filled from a full code read of `apps/student/**` (~10.4k lines: shell, player, 4 engine steps, runner, 7 exercise components, 6 standalone games, legacy + dubbing). Tag `student-app-v3-phase-a-start` pushed. Screenshots deferred to per-game §0–§3 prep (passport fixture required — first capture lands with the pilot game, same as games-v3). **Next: owner comments intake → pilot game selection.**
- 2026-09-13 — **FULL BATCH COMPLETE (owner's autonomous mandate): 24 of 24 redesign-target games IMPLEMENTED + DEPLOYED overnight.** Groups: I3 lesson surfaces 02-07 (`38f78ae`), I2 engines 08-11 w/ the new in-lesson spelling rule (`eed8161`), I4 exercises 14-19 (`ea13fa6`), I5 standalones+arena+reward 20-27 (`548a847`). Sounds (playCue) shipped across every surface (pilot `295d7a0`). Sanctioned surgical fixes: UnknownType record:false; heartSafe runner prop (SRS = heart-restore haven); reading-quest mislabel deleted; honest gems display. Every group passed the full gauntlet (826 tests, tsc clean — owner's untracked planComposer WIP excluded, build clean) with diff-review + verbatim data-write verification by ZCode. Owner's concurrent plan-library/content-groups WIP untouched throughout. AG CLI hit its individual quota at the very end of I5 (resets ~1h43m) — all work had landed; ZCode fixed one post-cutoff reference (selectUnit). REMAINING: 01 home (FROZEN by owner), 28 tabs (chrome — next round), 29 legacy (delete decision parked), 30 dubbing (flag-off). Awaiting owner's morning verification; off-design screens revise via edit_screens loop.
- 2026-09-13 — **PILOT IMPLEMENTED + DEPLOYED (files 12/13 → `deployed`, commit `c1d06e2`, Vercel live 04:20 local).** AG implemented from the approved Stitch HTML into ExerciseRunner/ChoiceExercise/shared (bottom feedback drawers w/ Continue-tap advance, real-hearts header states, honest summary tiles + re-queue note + heart-restore chip, missing-image locked card, A/B/C/D badges, cloze slot pills, NODE_ENV-test advance fallback); UnknownType skip → record:false (false-FSRS-write killed). ZCode review: data-write paths verbatim-verified; gauntlet green (tsc pilot-clean — 4 pre-existing errors live only in the owner's UNTRACKED planComposer WIP; vitest 826 passed/1 skipped, one load-flake re-verified green isolated; build clean). Working tree discipline: ONLY the 5 pilot files committed — the owner's concurrent plan-library/content-groups WIP (blockScope, useBoardPool, PlanComposer, SessionContext, generate-media, enrich-unit + untracked planComposer/, contentGroups.*) left untouched and uncommitted. **WORKFLOW PROVEN END-TO-END: audit → AG §4 → AG Stitch designs → ZCode verify/export → owner approval → AG implementation → ZCode review + gauntlet + deploy — all autonomous except the owner's single approval. The batch can now proceed one game at a time.**
- 2026-09-13 — **OWNER APPROVED THE PILOT DESIGNS (§6 recorded in files 12/13 → `owner-approved`)** — "lets implement them and see the result to fullproof our workflow." AG Phase 3 implementation launched (tag `student-app-v3-pre-impl-pilot` pushed). The 5th screen the owner sees in Stitch UI = the project's auto-created default screen, not a pilot screen.
- 2026-09-13 — **PILOT DESIGNS GENERATED + ZCODE-VERIFIED (files 12/13 → `zcode-verified`).** AG (headless) created Stitch project `6865954475041880496` "Professor Student App v3" (MOBILE) and generated 4 screens, all accepted: battery shell (LISTEN_SELECT active), choice CORRECT (emerald bottom sheet +1 XP), choice WRONG (red outline + cracked-heart badge + green correct highlight + in-place correction), round-complete summary (stat tiles + re-queue note). ZCode exported all to `stitch/12-exercise-battery/` + `stitch/13-choice-exercise/` (HTML+PNG; programmatic CLI fetch — one hand-copied URL 400'd) and QA'd each: mobile-portrait ✓, palette on-brief (23-45 token hits/file) ✓, no lorem ✓, no Chinese on challenge options ✓, targets ≥48px ✓; minor items logged in §5 (garbled hint copy on screen 1, blue drift #2F7BE8→#1CB0F6, 10-11px eyebrow chips →≥12px, strip phone-frame wrappers). **AWAITING OWNER APPROVAL (checkpoint 2) — no implementation until his go.**
- 2026-09-13 — **PHASE 1 COMPLETE — AG's §4 critic audits done across ALL 31 files, autonomously via `agy` headless (skip-permissions; scope verified: only docs/audit/student-app-v3 touched; owner WIP hash-verified intact).** Spelling tension rule RECOMMENDED by AG (ratification pending): in-lesson timeout = costs the word + audio reveal + continue; standalone Spelling Bee keeps sudden-death; default timer 20s; drop the −1s mistake clock penalty in-lesson. AG's top-10 cross-app priorities recorded in each file + headline in this log: hearts split-brain fix incl. making SRS a heart-RESTORE haven (it currently DEPLETES them — contradicting the out-of-hearts advice), phantom gem card (shows +15 gems, backend pays 0), universal exit-confirm, listening-leak masking, practice-arena unit context + real content for Pronunciation Coach, read-to-me audio, exploration de-penalized from stars, dead settings toggles wired-or-removed, streak celebration, light hybrid theme everywhere (abolish slate-900 screens). NOTE: owner's parallel content-groups work (commits c20dbca/cb4c529 + uncommitted enrich-unit/index.ts + untracked _shared/contentGroups.ts & test) detected and left untouched.
- 2026-09-13 — **PHASE C PACK WRITTEN + ANTIGRAVITY CLI WIRED.** Owner delegated the spelling tension rule to AG and sharpened AG's role: CRITIC of user flow / UX / functionality / pedagogic flow / UI, app-general as well as per-game → new audit-only file `31-app-flow-ux.md` (31 files total). `prompts/antigravity-handover.md` written (mission, read-first, §4 rules incl. the spelling assignment, Stitch CLI + traps + MOBILE project, reusable-code briefing with the real wa-*/duo-* token block from `atlas/tokens.ts`, Phase-3 implementation boundaries + gauntlet). **Antigravity CLI (`agy` v1.2.2) installed at `~/.local/bin/agy` and verified headless-authed** (keychain session reuse, `agy -p` round-trip OK) — ZCode can now drive AG autonomously; owner's paste step is optional.
- 2026-09-13 — **OWNER DIRECTION RECORDED + PHASE B (ZCode §1–§3) COMPLETE for ALL 30 surfaces.** Owner: full functionality audit of everything; theme = Wonder Atlas × Duolingo white/pink mix; home design FROZEN (functionality audit only); AG recreates screens as reusable code with owner validation before implementation; pilot game first to prove the flow. All 30 files now carry §1 verbatim mechanics + §3 numbered findings → **file-ready**. Headline findings: **P1 ×2** — Spelling Bee in-lesson timeout ends the run (11 F1, owner decision), Pronunciation Coach has NO content source — one hardcoded sentence forever (25 F1); **P2 highlights** — LISTEN_SELECT mixed-option modality leak (13 F1, verified vs generator), fake shell hearts vs real battery hearts (02 F1), no exit-confirm anywhere (02 F2/08 F3/12 F7), unknown-type Skip writes a FALSE FSRS success (12 F1), out-of-hearts advice dead-end (12 F2), Memory Match records perfect accuracy regardless of mismatches (10 F1), AI-prompt leak in Reading's missing-image fallback (24 F1), N+1 home-load queries + lifetime-units quest bar (01 F1/F2), 5★ gem gate unreachable from lessons (27 F1). **Next: pilot game selection → AG §4 + Stitch pack (Phase C).**
