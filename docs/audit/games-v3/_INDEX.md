# games-v3 — Per-Game Quality Audit Pipeline (2026-09-09)

Round 3 of the game redesign loop. Predecessors: `docs/audit/GAMES_AUDIT.md` + `docs/audit/PER_GAME_PROMPTS.md` (August wave, produced the current "v2" games). This round adds the owner's fresh comments, a **ChatGPT Co-Work** quality audit, and a **Google Stitch** UI redesign step.

## The loop (per game) — v3.1 process (2026-09-10)

```
ZCode: §0–§3 of NN-<game>.md (code audit + owner comments + screenshots)   status: file-ready
  ↓
Google ANTI-GRAVITY (replaces ChatGPT Co-Work): fills §4 (UI / workflow /
  pedagogy / interaction audit) — owner pastes prompts/antigravity-master-prompt.md
  ↓                                                                        status: cowork-done
ZCode: reconciles §4, then drives STITCH DIRECTLY (MCP reads + CLI generation,
  key in the ZCode config) — designs, iterates, exports to stitch/<NN>-<game>/
  ↓                                                                        status: stitch-returned
ZCode: implements + fidelity log + gauntlet + deploy                      status: implemented
```

**Stitch tooling status (2026-09-10):** MCP read path (list/get/download) works; generation via the MCP tool times out at the 30s layer — the working path is the CLI (`STITCH_API_KEY=… npx -y @_davideast/stitch-mcp tool generate_screen_from_text -d '{…}'`, minutes-long, returns a design narrative + suggestions). **Persistence CONFIRMED (owner, 2026-09-10):** generations DO land in the Stitch project — they simply take ~10–20 min to appear in the API/UI. All three parallel Focus Cards attempts persisted (2 screens + auto-generated card photos). `edit_screens` also works via the same CLI path (landscape-cards correction submitted). Workflow: submit → expect the result on a ~15-min delay → verify via list_screens before exporting. **New design rule (owner): cards on the horizontal stage are LANDSCAPE (~4:3), grids 3×2 — applies to every game.** A dedicated batch project exists (`projects/2027598662287239005`) but generation into the pilot project (`projects/17415096891547227013`, TEXT_TO_UI_PRO) is the proven target type.

## The loop (v3.0 — historical)

```
ZCode: §0–§3 of NN-<game>.md (code audit + owner comments + screenshots)   status: file-ready
  ↓
ChatGPT Co-Work: fills §4 (UI / workflow / pedagogy / interaction audit)   status: cowork-done
  ↓
ZCode: reconciles §4, writes §5 (self-contained Stitch prompt, board 16:9) status: stitch-prompt-ready
  ↓
Owner: runs §5 in Google Stitch, drops export into stitch/<NN>-<game>/     status: stitch-returned
  ↓
ZCode: implements into apps/board/templates/Board*.tsx, tests, deploys     status: implemented
```

**Pilot:** `26-word-search.md` runs the full loop first. Batch begins after the owner validates the pilot.

## Files

- `NN-<game>.md` — one per game, numbered in lesson order (WARMUP → WRAPUP)
- `_TEMPLATE.md` — the per-game file structure (copy for new files)
- `_CROSS-CUTTING.md` — comments/themes spanning multiple games
- `prompts/cowork-master-prompt.md` — what the owner pastes into ChatGPT Co-Work
- `screenshots/` — ZCode's captures of the current board UI
- `stitch/` — owner drops Stitch exports here, one subfolder per game

## Status legend

`pending` (file not created) · `file-ready` (§0–§3 filled, waiting for Co-Work) · `cowork-done` (§4 filled) · `stitch-prompt-ready` (§5 written) · `stitch-returned` (§6 has export) · `implemented` (deployed)

## Inventory & status board (34 games — 36 flow types minus 2 pure aliases)

| # | File | Game | Flow type(s) | Component | Phase | Status |
|---|---|---|---|---|---|---|
| 01 | `01-intro-splash.md` | Unit Intro | `INTRO_SPLASH` | BoardUnitIntro.tsx | WARMUP | pending |
| 02 | `02-team-splash.md` | Team Splash | `TEAM_SPLASH` | BoardIntroSplash.tsx | WARMUP | pending |
| 03 | `03-media-player.md` | Media Player (song/video) | `MEDIA_PLAYER` | BoardMediaPlayer.tsx | WARMUP | §2 comments in — code audit pending |
| 04 | `04-live-warmup.md` | Live Class Warmup | `LIVE_WARMUP` | BoardLiveClassWarmup.tsx | WARMUP | pending |
| 05 | `05-focus-cards.md` | Focus Cards (vocab presentation) | `FOCUS_CARDS` | BoardFocusCards.tsx | INPUT | **stitch-in-flight — §4 validated, 4 designs submitted** |
| 06 | `06-grammar-sandbox.md` | Grammar Sandbox | `GRAMMAR_SANDBOX` | BoardGrammarSandbox.tsx | INPUT | pending |
| 07 | `07-story-stage.md` | Story Stage | `STORY_STAGE` | BoardStoryStage.tsx | OUTPUT | §2 comments in — code audit pending |
| 08 | `08-dialogue-stage.md` | Dialogue Stage | `DIALOGUE_STAGE` | BoardDialogueStage.tsx | OUTPUT | pending |
| 09 | `09-grammar-forge.md` | Grammar Forge | `GRAMMAR_PRACTICE` (+legacy `SCRAMBLE` sibling uses BoardUnscramble) | BoardGrammarForge.tsx | PRACTICE | pending |
| 10 | `10-listen-tap.md` | Listen & Tap | `LISTEN_TAP` | BoardListenTap.tsx | PRACTICE | §2 comments in — code audit pending |
| 11 | `11-flash-match.md` | Flash Match | `FLASH_MATCH` | BoardFlashMatch.tsx | PRACTICE | §2 comments in — code audit pending |
| 12 | `12-unscramble.md` | Unscramble | `UNSCRAMBLE` (alias `SCRAMBLE`) | BoardUnscramble.tsx | PRACTICE | §2 comments in — code audit pending |
| 13 | `13-i-say-you-say.md` | I Say You Say | `I_SAY_YOU_SAY` (alias `SPEAKING`) | BoardISayYouSay.tsx | PRACTICE | §2 comments in — code audit pending |
| 14 | `14-whats-missing.md` | What's Missing | `WHATS_MISSING` | BoardWhatsMissing.tsx | PRACTICE | pending |
| 15 | `15-magic-eyes.md` | Magic Eyes | `MAGIC_EYES` | BoardWhatsMissing.tsx (mode `magic_eyes`) | PRACTICE | pending |
| 16 | `16-story-sequencing.md` | Story Sequencing | `STORY_SEQUENCING` | BoardStorySequencing.tsx | PRACTICE | pending |
| 17 | `17-grammar-lab.md` | Grammar Lab | `GRAMMAR_LAB` | BoardGrammarLab.tsx | PRACTICE | §2 comments in — code audit pending |
| 18 | `18-word-detective.md` | Word Detective | `WORD_DETECTIVE` | BoardWordDetective.tsx | PRACTICE | §2 comments in — code audit pending |
| 19 | `19-sound-lab.md` | Sound Lab | `SOUND_LAB` | BoardSoundLab.tsx | PRACTICE | §2 comments in — code audit pending |
| 20 | `20-story-quest.md` | Story Quest | `STORY_QUEST` | BoardStoryQuest.tsx | PRACTICE | §2 comments in — code audit pending |
| 21 | `21-sentence-lab.md` | Sentence Lab | `SENTENCE_LAB` | BoardSentenceLab.tsx | PRACTICE | §2 comments in — code audit pending |
| 22 | `22-phonics-arena.md` | Phonics Arena | `PHONICS_ARENA` | BoardPhonicsArena.tsx | PRACTICE | §2 comments in — code audit pending |
| 23 | `23-memory-lab.md` | Memory Lab | `MEMORY_LAB` | BoardMemoryLab.tsx | PRACTICE | §2 comments in — code audit pending |
| 24 | `24-class-rally.md` | Class Rally (co-op) | `CLASS_RALLY` | BoardClassRally.tsx | PRACTICE | §2 comments in — code audit pending |
| 25 | `25-fast-vocab.md` | Fast Vocab | `FAST_VOCAB` | BoardFastVocab.tsx | PRACTICE | §2 comments in — code audit pending |
| 26 | `26-word-search.md` | Word Search — **PILOT** | `WORD_SEARCH` | BoardWordSearch.tsx | PRACTICE | **IMPLEMENTED 2026-09-10 — full loop validated (audit → Co-Work → Stitch → code → deploy)** |
| 27 | `27-spelling-bee.md` | Spelling Bee | `SPELLING_BEE` | BoardSpellingBee.tsx | PRACTICE | §2 comments in — code audit pending |
| 28 | `28-comic-panels.md` | Comic — Rebuild the Story | `COMIC_PANELS` | BoardComicPanels.tsx | PRACTICE | §2 comments in — code audit pending |
| 29 | `29-team-battle.md` | Team Battle (tic-tac-toe) | `TEAM_BATTLE` | BoardTeamBattle.tsx | ASSESS | pending |
| 30 | `30-speed-quiz.md` | Speed Quiz | `SPEED_QUIZ` | BoardSpeedQuiz.tsx | ASSESS | pending |
| 31 | `31-wheel-of-destiny.md` | Wheel of Destiny (picker) | `WHEEL_OF_DESTINY` | BoardWheelOfDestiny.tsx | ASSESS | pending |
| 32 | `32-vocab-blitz.md` | Vocab Blitz | `VOCAB_BLITZ` | BoardVocabBlitz.tsx | ASSESS | §2 comments in — code audit pending |
| 33 | `33-game-arena.md` | Game Arena (winner celebration) | `GAME_ARENA` | BoardGameArena.tsx | WRAPUP | pending |
| 34 | `34-unit-selection.md` | Unit Selection dashboard | `UNIT_SELECTION` | BoardUnitSelection.tsx | WRAPUP | pending |

Registry facts (for reference): `BOARD_MAP` in `apps/board/templates/boardMap.tsx` is the single render map for both the projector board (`apps/board/ClassroomBoard.tsx`) and the commander preview (`apps/teacher/live/panels/BoardRenderer.tsx`). Supported types are validated in `supabase/functions/_shared/flowTypes.ts` (`SUPPORTED_FLOW_TYPES`); unknown types get dropped, index 0 is always `INTRO_SPLASH`. Teacher per-game buttons live in `apps/teacher/live/panels/ContextualControls.tsx`; the phone remote mirrors a subset in `apps/remote/TeacherRemote.tsx`. Scoring/lifecycle contract: `LIVE_GAME_LIFECYCLE.md`.

## Change log

- 2026-09-09 — folder + template + cowork master prompt created; pilot (26-word-search) in progress.
- 2026-09-09 — **Phase B intake COMPLETE.** Owner's 26 voice-transcribed comments processed through the per-comment precision loop (one at a time, owner-confirmed). All mapped: 23 comment-items into 19 game files (§2 verbatim + clarifications), 3 into `_CROSS-CUTTING.md` (#1 responsive, #3 next-bounce, #25 arrive-finished). Two transcription corrections from the owner: #22 "Quick Picker" = **Fast Vocab**, #24 "Failing B" = **Spelling Bee**. Key confirmed decisions: phone-landscape responsive floor / reflow allowed / never scroll; Chinese removed from challenges EVERYWHERE incl. commander; audio auto-play-once + −1-per-replay (Sound Lab + Phonics Arena); wheel 1/3/full per-student question counts with auto-advance (no forced clicks); Memory Lab word↔image alternate directions, 4–6 card hard cap; Flash Match wrong-pair locking confirmed real (validation bug); Unscramble Skip = seen but dead button. **26-word-search is `file-ready` → Co-Work pilot run is NEXT.**
- 2026-09-09 — **pilot code audit + live board capture done.** Two live-verified findings: **F0 (P1) the word-search letter grid renders 0–13 px on the projector board at every tested size — game unplayable on /board** (0×0 at ≥1280 px, 13×13 below), and **F15 (P2) the board blanks/sticks on "Loading…"** during pool refetches (no error handling in the fetch effect). 6 screenshots captured via throwaway fixtures (created + fully torn down). Screenshot tooling kept in `scripts/testing/games-v3-*.ts` for the batch phase.
- 2026-09-09 — **Word Search Co-Work pilot complete.** §4 now contains the grounded UI, teacher-flow, ESL/EFL pedagogy, and interaction audit; priority is the responsive grid rebuild, followed by recovery-safe teacher controls, deliberate English-only scaffolding, and fairer scoring/celebration. Status: `cowork-done`.
- 2026-09-09 — **PILOT: Co-Work §4 done + ZCode reconciliation + §5 Stitch prompts written (status: stitch-prompt-ready).** Co-Work accepted in full (16 findings, incl. the round-2 Chinese-clue violation the code audit missed). Two behavior changes flagged for owner sign-off at implementation: per-child/team streaks + class meter in open mode; first-miss-warns-instead-of-penalizes. Owner next: run the 6 Stitch prompts (§5) in one Stitch project, export to `stitch/26-word-search/`.
- 2026-09-09 — **Owner refined the language rule**: English-first, avoid Chinese on challenge surfaces WHEN POSSIBLE — not a strict ban; instructions/tips/rules/exercise descriptions may use Chinese when needed for clarity. Hard parts remain: never make the answer trivially visible, hints over answers. Updated: `_CROSS-CUTTING.md` (global rule), `26-word-search.md` (reconciliation + §5 Stitch prompts + QA checklist), `12-unscramble.md`, `21-sentence-lab.md`, `18-word-detective.md` (notes), `prompts/cowork-master-prompt.md` (rule #5 for all future Co-Work runs).

- 2026-09-10 — **PILOT COMPLETE: Word Search v3 implemented + deployed.** Full loop validated end-to-end: 26 comments → per-game files → Co-Work §4 → Stitch §5 (owner ran 6 prompts) → implementation (4 files, 16 findings fixed incl. F0 grid 0–13 px → 775 px @1080p, gate-verified at 4 sizes) → tsc/vitest/build green → pushed to master. The loop is ready for the batch (18 remaining commented games + cross-cutting). Owner note: BoardShell leaderboard rail is the next responsive blocker (phone floor).

- 2026-09-10 — **Owner design review → preview-screen fidelity fix + process upgrade.** The owner caught the round-preview shipping small cards instead of the Stitch big-portrait-card design (my silent engineering shortcut). Fixed to Stitch fidelity (big photo cards, huge title, difficulty chip — `26-v3-preview.png`), and a **design-fidelity log is now mandatory in every §6** (per Stitch screen: Followed / Adapted / Deviated + why). Principle recorded: Stitch is the design source of truth; deviations are owner-reviewable decisions, never silent.

- 2026-09-10 — **Process v3.1: Anti-Gravity replaces Co-Work (§4 audits); ZCode drives Stitch directly** (MCP + CLI, per owner). Anti-Gravity master prompt written (`prompts/antigravity-master-prompt.md` — same rules/quality bar as Co-Work, first-game vs batch run modes). `05-focus-cards.md` is **file-ready** (§0–§3 + prelude + 2 screenshots) — the first Anti-Gravity target. Stitch: batch project created; MCP reads proven; generation works via CLI but persistence pending verification (see tooling status above).
- 2026-09-10 — **Focus Cards (05) Anti-Gravity audit COMPLETE.** §4 filled with grounded UI, workflow, ESL pedagogy, and interaction findings. Status: `cowork-done`. Key priorities: in-place 3D card flip with image-only fronts (active retrieval), separating rapid grid review from deep drill (+ icon), batch pagination for 6+ words, Commander/Remote control parity, and BoardShell full-bleed retraction of the 0-points leaderboard rail.

- 2026-09-10 — **Stitch autonomy proven end-to-end** (owner confirmed the generated Focus Cards screens in the UI) + first `edit_screens` correction submitted (portrait → landscape cards, per owner rule). Anti-Gravity started on 05-focus-cards §4.
