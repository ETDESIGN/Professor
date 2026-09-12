# Choice Exercise — The 10 MCQ Types — v3 Quality Audit (`IMAGE_SELECT, MEANING_MATCH, AUDIO_L1_SELECT, LISTEN_SELECT, SPELL_CLOZE, ERROR_SPOT, TRANSFORM, GRAMMAR_FILL, STORY_COMPREHENSION, WHO_SAID_IT`)

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

- **Surface / route:** rendered by ExerciseRunner (file 12) for 10 pool types — `apps/student/exercises/ChoiceExercise.tsx` (202 ln) + `exercises/shared.tsx` (AudioButton/FeedbackBanner/optionClasses/useElapsedMs)
- **Exercise types consumed:** the 10 types above, each mapping to a prompt shape (audio-button large / prompt+audio / sentence+blank / instruction variants; image options 2-col grid when present)
- **Data sources:** PoolItem.content discriminated union (`types/exercise.ts`)
- **Scoring & data writes:** one tap → reveal → `onComplete({success, time_taken_ms, attempts:1})` after 1100ms — the runner (file 12) owns all writes
- **Reachability:** the most common challenge screen in the app
- **Theme today:** white/slate options (optionClasses: blue selected / green correct / red picked-wrong / grey others), explanation line post-reveal

## §1 How the game works today

*(Screenshots pending.)*

The single MCQ renderer for 10 pool types (`exercises/ChoiceExercise.tsx`): IMAGE_SELECT, MEANING_MATCH, AUDIO_L1_SELECT, LISTEN_SELECT, SPELL_CLOZE, ERROR_SPOT, TRANSFORM, GRAMMAR_FILL, STORY_COMPREHENSION, WHO_SAID_IT. Each type maps to a prompt shape in a switch (:56-128): audio-first types render a large AudioButton + instruction; IMAGE_SELECT/LISTEN_SELECT use a 2-col image-option grid with optional labels under images (:169-192); sentence types show the sentence + rule instruction; explanation appears post-reveal (:194-196). One tap selects + reveals (green correct / red picked / grey others via shared `optionClasses`), then `onComplete({success, time_taken_ms, attempts: 1})` fires after 1100ms (:130-138) — all writes belong to the runner (file 12).

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/exercises/ChoiceExercise.tsx` unless noted.

- **F1 · P2 (verified 2026-09-13 vs `supabase/functions/generate-exercises/index.ts:118-126`) — LISTEN_SELECT mixed-option modality leak.** Generator options are `{text: word, image_url}`; the renderer shows image-only when `image_url` exists (`opt.label` is never set, so no caption leaks) (:177-189) — BUT when some distractors lack images, the set renders MIXED: image options are matchable by picture, imageless options print the English `text` (:188) — the listening task becomes solable by sight/odd-one-out, and difficulty is uneven within one question. All-text sets are legitimate (listen→word recognition). **Fix shape: render a uniform modality per question — imageless options get a picture placeholder or the question degrades to text-only for ALL options.**
- **F2 · P2 — The explanation window is ~1.1s.** Feedback + explanation render, then auto-complete fires (:135-137) — a young reader cannot finish the explanation; no tap-to-continue override, no pause.
- **F3 · P2 — No in-component retry teaching beat** — wrong answers advance away after the flash; the runner's single re-queue comes later, detached from the moment (compare Word Bank's in-place correction).
- **F4 · P3 — Image-onError fades to 0.2 opacity** (:183) with no fallback glyph — a dead image option becomes a ghost card the kid might still tap.
- **F5 · P3 — Text options are comfortable but unlabeled** — no A/B/C/D badges (board v3 style) and no keyboard shortcuts; fine on touch, thin on tablets-with-keyboard.
- **F6 · P3 — SPELL_CLOZE blank renders as raw underscores in the sentence** (:164) — no styled gap/letter-count affordance.

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
### 4.b Workflow & user flow (the child's own path: open → play → reward)
### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)

*(For each finding: severity P1/P2/P3, the evidence grounding it — §1, §3, or a named screenshot — and a concrete recommendation. If you need information not in this file, list it under "Information needed" instead of guessing.)*

### 4.e Top-5 prioritized recommendations

### 4.f Stitch design log (AG fills as it generates)
<Which screens were requested (tool + prompt summary), expected async materialization, and the per-screen intent: states shown, actions available.>

## §5 ZCode design verification (inside Stitch)

<ZCode fills after AG reports designs done: list_screens result, title verification against §4.f, export paths (`stitch/<NN>-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

<Owner's verdict per screen: approved / revise (what to change). No implementation starts before an explicit go on THIS game's designs.>

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
