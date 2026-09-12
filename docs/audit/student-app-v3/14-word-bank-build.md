# Word Bank Build — Sentence Builder — v3 Quality Audit (`WORD_BANK_BUILD (productive)`)

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

- **Surface / route:** ExerciseRunner child — `apps/student/exercises/WordBankBuild.tsx` (96 ln)
- **Exercise types consumed:** WORD_BANK_BUILD {target_sentence, word_bank[], translation?, audio_url?}
- **Data sources:** PoolItem.content
- **Scoring & data writes:** single Check → token-sequence compare (normalizeForCompare + stripPunct) → onComplete (runner writes)
- **Reachability:** SENTENCE_LAB signature type; grammar families
- **Theme today:** dashed build area + `duo-blue` placed tiles, white bank tiles, pink Check

## §1 How the game works today

*(Screenshots pending.)*

WORD_BANK_BUILD (`exercises/WordBankBuild.tsx`): optional L1 translation prompt + audio button, a dashed build area, and shuffled word-bank tiles. Tap a bank tile to append it to the build area; tap a placed tile to remove it (:25-33). Check compares the built token sequence to the target via punctuation/case-insensitive normalization (:34-41); feedback shows the target sentence + banner, then completes. All writes via the runner.

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/exercises/WordBankBuild.tsx`.

- **F1 · P2 — Tile tap targets sit under the 48px floor.** Placed/bank tiles are `px-3 py-2` (~40px tall) (:57, :67) — dense word sequences with small targets is exactly the mis-tap profile for young fingers (and a mis-tap REMOVES a placed word).
- **F2 · P3 — No per-tile TTS** — tapping a word is silent; hearing each tile would support phonological assembly (the board v3 Sentence Lab speaks the sentence on resolve).
- **F3 · P3 — Sentence audio doesn't autoplay** — the AudioButton exists only when `audio_url` is present (:46) and waits for a tap.
- **F4 · P3 — Wrong check wipes nothing but also teaches nothing in place** — feedback swaps the Check button for the answer text (:85-91); correctly placed words aren't distinguished from wrong ones (board v3 Sentence Lab keeps correct placements green).
- **F5 · P3 — No length mismatch guard** — kid can Check a half-built sentence and burn the attempt; a gentle "2 words left" nudge would fit kid-alone rules.

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Sub-floor tile dimensions cause mis-taps during sentence construction.** (Evidence: §1, §3 F1, `WordBankBuild.tsx:57,67`). Placed and bank tiles are styled with `px-3 py-2` (~40px height). In tight sentence flows on a 390px phone, words are closely packed. Tapping an adjacent word accidentally removes it from the build area, forcing the child to reconstruct the entire phrase. *Recommendation: Expand tile minimum height to 48px with chunky Duolingo-style bevels (`wa-paper` `#FDFBF7`, 0 3px 0 `#CBD5E1`, rounded-xl, 16px bold Fredoka font).*
- **F2 · P3 — Disjointed build slot presentation.** (Evidence: §1, `WordBankBuild.tsx:54`). The sentence build target is rendered as a bare dashed container box. *Recommendation: Provide visual word-slot guidelines or an underlined baseline ribbon so children clearly perceive where words will snap.*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P1 — Unprotected Check button burns hearts on half-built sentences.** (Evidence: §1, §3 F5, `WordBankBuild.tsx:34-41`). The bottom "Check" button is permanently active even when only 1 out of 6 words has been placed. Because `WORD_BANK_BUILD` is a productive exercise, an accidental early tap on Check counts as a productive failure and decrements a real database heart (`Engine.loseHeart`). *Recommendation: Disable the Check button until either all bank tiles are placed or the placed count matches the target word count, displaying a subtle prompt: "Place all words to check".*
- **F4 · P2 — Cumbersome middle-insertion editing friction.** (Evidence: §1, `WordBankBuild.tsx:25-33`). If a child realizes they forgot the second word of a 6-word sentence, they must tap and eject words 3, 4, 5, and 6 in reverse order to insert the missing token. *Recommendation: Allow tapping between placed words to insert a tile, or support touch-drag reordering of placed tokens.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P2 — Silent tile tapping lacks acoustic reinforcement.** (Evidence: §1, §3 F2). Tapping words from the bank into the build area is completely silent. In ESL language development, auditory modeling during assembly reinforces the mental phonological loop. *Recommendation: Vocalize individual word pronunciation via TTS as each tile is tapped and placed.*
- **F6 · P2 — Missing sentence-level fluency playback upon success.** (Evidence: §1, §3 F3, `WordBankBuild.tsx:46`). When the sentence is completed successfully, the game shows green borders but does not automatically read the full fluent sentence aloud. *Recommendation: Auto-play the complete sentence with natural native intonation upon correct assembly to model fluent syntax.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F7 · P2 — All-or-nothing error feedback hides partial success.** (Evidence: §1, §3 F4, `WordBankBuild.tsx:85-91`). If 5 out of 6 words are placed in correct order, a single misplaced word turns the entire build area red. Children cannot identify where their syntactic error occurred. *Recommendation: Keep correctly placed tokens highlighted in emerald, highlight the misplaced token in terracotta/amber, and display the intended sentence in the feedback drawer.*

### 4.e Top-5 prioritized recommendations
1. **[P1] Disable Check button until sentence is fully constructed:** Protect children from burning hearts on accidental premature submissions.
2. **[P2] Upgrade tiles to ≥48px Duolingo-style 3D tactile buttons:** Prevent frustrating mis-taps with generous hit zones and bouncy press physics.
3. **[P2] Auto-play full sentence audio upon correct assembly:** Reinforce native sentence rhythm and prosody.
4. **[P2] Add per-tile audio playback on tap:** Speak each word as it is selected from the bank.
5. **[P3] Isolate syntactic errors with partial-match highlights:** Keep correctly positioned tokens green and highlight misplaced words in terracotta.

### 4.f Stitch design log (AG fills as it generates)
*(Phase 1 audit complete. Stitch designs will be generated in Phase 2 for the tactile sentence tile builder and the Duolingo-style success drawer.)*

## §5 ZCode design verification (inside Stitch)

<ZCode fills after AG reports designs done: list_screens result, title verification against §4.f, export paths (`stitch/<NN>-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

<Owner's verdict per screen: approved / revise (what to change). No implementation starts before an explicit go on THIS game's designs.>

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
