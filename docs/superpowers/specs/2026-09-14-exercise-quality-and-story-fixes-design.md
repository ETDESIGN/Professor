# Exercise-Quality Rebuild + Student Story/Comic Fix — Design (2026-09-14)

Owner testing session 2. Source: his verbatim comments are recorded in `docs/audit/student-app-v3/` files 05, 07, 09, 11, 12, 13 (§2) with verified findings in §3 addenda. This spec records the DECISIONS; the implementation plan is `docs/superpowers/plans/2026-09-14-exercise-quality-and-story-fixes.md`.

## Problem statements (verified root causes)

1. **Ambiguous cloze questions** (Sentence Lab, Vocab Blitz phase 3, Unit Review): SPELL_CLOZE options are raw AI `confusables` with zero context-fit validation (`generate-exercises/index.ts:139-143`) — "My birthday is on ___" {Wednesday, Tuesday} is unanswerable-by-reason. "Friday vs Saturday" is a literal multi-word AI confusable.
2. **Grammar Lab garbage**: GRAMMAR_FILL pairs an abstract `pattern_template` prompt with unrelated error sentences (`:299-315`); ERROR_SPOT invents fake words by blind suffixing ("Yous", "Ewing") and ships visually-identical options (exact-string-only dedupe, no normalization).
3. **Vocab image cards leak the English word** (Vocab Blitz phase 2, Unit Review, Speed Quiz, Game Arena, Sound Lab): LISTEN_SELECT image options render the English `{text}` strip (`ChoiceExercise.tsx:333-339`; image-only gate covers IMAGE_SELECT only), and IMAGE_SELECT cards letterbox instead of filling the rounded frame.
4. **Word Search too hard + broken diagonals + dead-looking hint**: student grids default to all 8 directions (`WordSearchStep.tsx:102` → `gridEngine.ts:169` DIRECTIONS_ALL); `snapLine` projection is unnormalized so exact diagonal endpoint taps always snap to a straight line (`gridEngine.ts:114-140`) — diagonal words effectively unfindable; hint is grey/disabled until 3 misses (`:300`).
5. **Spelling Bee on-screen keyboard dead at every round start**: wave-change timer race in `useSpellingBeeTurn.ts` — the render-phase reset schedules `beginTyping`, then the `[waveWords]` effect's `clearTimeouts()` kills it → status stays `'presenting'` → all keys `disabled` (compact surfaces have no escape button; physical Space/Enter still works, masking it on desktop).
6. **Students see no story at all** ("No content for Story"): the student step reads only frozen `data.pages` (`SoloLessonPlayer.tsx:666-671`); post content-groups, orchestrate emits `STORY_STAGE_AG` (student-ineligible, no renderer) and the vault bridge write was removed — the board reads story live via `getStory(manifest, structure_ids)`, the student never got that. Comics (`COMIC_PANELS`) are board-only.

## Owner decisions (2026-09-14, this session)

1. **Generation fix = deterministic rebuild + AI validation gate** ("Rebuild + AI check"): rewrite the SPELL_CLOZE / ERROR_SPOT / GRAMMAR_FILL builders with real-grammar, same-sentence mutations + sanitized confusables + normalized dedupe, AND add ONE batched region-safe AI check per unit that verifies each MCQ has exactly one acceptable answer (ambiguous → dropped). AI failure/timeout → deterministic fallback (drop same-unit-distractor items).
2. **Regeneration scope = only units the owner tests** for now (his test unit this round: Unit 2 `7e50177c`, the days-of-week/free-time/safety unit whose questions he quoted). Fleet-wide regeneration deferred to a later batch.
3. **Story + comics = two NEW student exercises** (verbatim): "two new exercice, a story exercie and a commic ecercice, both have the goal to present the story or the commics, step by step, image by image, paragraphe by paragraphe to the student in a ludic and immersive way." → These go through the full v3 design pipeline (audit file → AG §4 + Stitch designs → owner approval → implementation). Phase 1 of this spec fixes the DATA PATH so story content reaches students in the existing reader NOW; Phase 2 is the design round for the two new immersive exercises.

## Design — Phase 1 (bug fixes + generation rebuild)

### 1a. Generation rebuild (`supabase/functions/generate-exercises/index.ts` + new pure helper)

- New pure module `supabase/functions/_shared/exerciseQuality.ts` (repo-tested, mirrors the `_shared/contentGroups.ts` + `test/contentGroups.test.ts` pattern):
  - `normalizeForDedupe(s)` — lowercase, curly→straight apostrophes, strip terminal punctuation, collapse whitespace.
  - `sanitizeConfusables(list)` — drop entries containing " vs "/" or " separators, questions, empties.
  - `grammarMutations(sentence)` — REAL-grammar wrong variants only (owner: "just by adding maybe some inversion on the place of the word would be enough. Creating fake world doesn't make sense"): frequency-adverb move (always/never/often/sometimes/usually/rarely), modal+`to` insertion, 3rd-person `-s` drop, a/an swap, don't/doesn't swap. Conservative pattern-matched; returns `[]` when nothing matches.
  - `dedupeDistinct(correct, distractors)` — normalized dedupe (distractors-vs-correct AND among themselves) → `[...]`; callers require ≥2 surviving distractors or the item is skipped (never ship identical options).
- SPELL_CLOZE: confusables sanitized; if a distractor (normalized) matches ANY unit vocab word → item flagged for the AI check (same-unit distractor is the ambiguity signature). `inflectionVariants` blind suffixes DELETED from ERROR_SPOT; its distractors = own-pair wrong-token splice + `grammarMutations(correct)` (+ other error examples' wrong tokens only when the normalized diff is a single grammar-class token). GRAMMAR_FILL rebuilt: options = the transformation pair's ORIGINAL sentence + `grammarMutations(correct)` — same stem, only grammar separates them.
- **AI validation gate** (the owner-approved addition): after deterministic build, ONE batched call (existing OpenRouter env: `AI_API_KEY`, `AI_MODEL_NAME`, fallback model; AbortController 25 s; non-fatal) — for every MCQ item built this run, ask "which options are acceptable answers" → strict JSON verdicts; items with >1 acceptable option are DROPPED (v1: drop, don't auto-repair). On AI failure → drop items flagged same-unit-distractor. Guardrail: if >30% of items drop, log a warning (data-quality signal to re-enrich).
- LISTEN_SELECT emitted only when the word + ≥3 siblings ALL have real images (mirrors the IMAGE_SELECT ≥4 gate) — kills mixed-modality sets at the source.
- `enrich-unit/index.ts` prompt tightened: confusables must be single words/short phrases, never "vs"-joined alternatives; the example sentence must be true ONLY for its word. (File is git-clean at HEAD; verified before commit.)

### 1b. Vocab cards (`apps/student/exercises/ChoiceExercise.tsx`)

- Image-option sets (IMAGE_SELECT **and** LISTEN_SELECT) render **image-only cards** — English strip hidden.
- Uniform modality: an option set renders the image grid ONLY if EVERY option has an image; otherwise the whole question renders as text cards (no mixed sets).
- Image cards fill the rounded frame edge-to-edge: `object-cover`, no letterbox padding (owner: "fit from side to side and corner to corner").

### 1c. Word Search (`apps/student/steps/WordSearchStep.tsx` + `apps/board/templates/wordSearch/gridEngine.ts`)

- Directions: `DIRECTIONS_EASY` (left→right, top→bottom) — owner decision; teacher-configurable difficulty PARKED (PlanComposer is owner WIP).
- `snapLine` fix: normalize the projection by the vector's squared length (diagonal exact taps finally select diagonal lines). Board benefits too.
- Pointer slide selection added alongside tap-first/tap-last (port the board's pointerdown/move/up pattern): press → live rubber-band snap preview → release on a different cell submits; release on the anchor keeps tap-tap mode.
- Hint always available (any unfound word), 10 s cooldown after use; label drops the "(x/3)" miss counter.

### 1d. Spelling Bee (`components/games/spellingBee/*`, `apps/student/steps/SpellingBeeStep.tsx`, `apps/student/SpellingBeeGame.tsx`)

- Race fix: the render-phase wave reset no longer schedules `beginTyping`; the `[waveWords]` effect schedules it AFTER `clearTimeouts()` (guaranteed order), guarded by status. Regression test with fake timers: wave change → PRESENT_BEAT elapses → `status === 'typing'`.
- Belt-and-suspenders: compact presenting screen gains a small "Ready to spell" tap chip (same path as physical Space).
- Layout: kill the dead vertical bands (stage container no longer centers with leftover space); keyboard keys grow toward phone-keyboard size (taller rows, wider max key width, larger glyphs); prompt block restacks image-above-text on narrow screens.

### 1e. Story data path (`types/stage.ts`, `services/gameRouting.ts`, `apps/student/SoloLessonPlayer.tsx`)

- `STORY_STAGE_AG` becomes student-eligible + titled "Story" + routed to the same inline reader.
- The reader resolves pages **relational-first** like the board: `getStory(manifest, data.structure_ids)` over the `_relational` bundle (attached in `SoloSessionContext.tsx:124-128`) with frozen `data.pages` as fallback; `EmptyStep` only when both are empty (unit truly has no story).

### 1f. Regeneration + verification

- Deploy `generate-exercises` (+ `enrich-unit`) by hand (functions never auto-deploy). Regenerate Unit 2 `7e50177c` only (owner decision 2). DB sanity check post-regen: zero options containing " vs "; ERROR_SPOT/GRAMMAR_FILL option sets normalized-distinct; SPELL_CLOZE distractors pass a manual spot read.
- Client pushes to master → Vercel auto-deploys. Owner reminded: fresh tab / hard refresh (PWA keeps old code in open tabs).

## Design — Phase 2 (separate round, full design pipeline)

Two NEW student exercises per owner direction: a **Story exercise** and a **Comic exercise** — "present the story or the comics, step by step, image by image, paragraph by paragraph, in a ludic and immersive way." New audit files `32-story-exercise.md` / `33-comic-exercise.md`; AG §4 + Stitch MOBILE designs (Wonder Atlas × Duolingo light mix, no animal mascots, kid-alone rules, read-along audio, tappable vocab); HARD GATE owner approval; then implementation (student-side readers over `story_pages` scene illustrations + comic panel crops — the Phase-1 data path is their foundation).

## Out of scope / parked

- Teacher-configurable Word Search difficulty (PlanComposer owner WIP).
- Fleet-wide pool regeneration (later batch).
- AI auto-REPAIR of ambiguous items (drop only in v1; repair if drops stay high).
- Vocab-backfill of imageless words (pre-existing parked decision).
