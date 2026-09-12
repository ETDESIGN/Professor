# Type Translate — L1 to L2 Translation — v3 Quality Audit (`TYPE_TRANSLATE (productive)`)

> **Current status:** zcode-verified

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

- **Surface / route:** ExerciseRunner child — `apps/student/exercises/TypeTranslate.tsx` (65 ln)
- **Exercise types consumed:** TYPE_TRANSLATE {prompt_l1, accepted[], hint?} (L1 Chinese → type English)
- **Data sources:** PoolItem.content
- **Scoring & data writes:** textMatches vs accepted[] → onComplete (productive)
- **Reachability:** VOCAB_BLITZ family; level-gated in selection (ages 6–8 get word-bank variant per header note)
- **Theme today:** blue "Translate to English" + big L1 prompt + input + pink Check

## §1 How the game works today

*(Screenshots pending.)*

TYPE_TRANSLATE (`exercises/TypeTranslate.tsx`): "Translate to English" label, big L1 (Chinese) prompt, text input (same fine-pointer autofocus guard), accepted-array matching via `textMatches` (:22-27). Hint line visible BEFORE answering when content provides one (:43). Runner writes apply (productive).

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/exercises/TypeTranslate.tsx`.

- **F1 · P3 — Hint is always visible pre-answer** (:43) — a free scaffold that can make the task trivial when content ships a strong hint; should be progressive (appear after a wrong try or N seconds).
- **F2 · P3 — Wrong answer displays only `accepted[0]`** (:56) — alternative valid answers unseen (minor).
- **F3 · P3 — No audio on either side** — the L1 prompt and the English answer are never spoken; a hear-the-answer beat post-reveal would close the loop for pre-readers.

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Severe exam-like visual presentation of translation prompts.** (Evidence: §1, `TypeTranslate.tsx:32-46`). The Chinese prompt text sits inside a plain box, accompanied by a flat input field and an aggressive "Translate to English" command banner. It looks like a high-stakes translation exam rather than a friendly language exercise. *Recommendation: Encase the Chinese L1 prompt inside an expressive mascot speech bubble or dialogue card, rendered in Wonder Atlas paper textures with warm rounded corners (`wa-paper` `#FDFBF7`, border `#E2D7C3`).*
- **F2 · P3 — Input field keyboard layout clipping.** (Evidence: §1, `TypeTranslate.tsx:40`). When the on-screen keyboard pops up, the distance between the L1 prompt, input box, and Check button collapses. *Recommendation: Use flex-col layout with dynamic viewport-height constraints to keep the active typing field and Check button pinned comfortably above the software keyboard.*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P1 — Pre-revealed hints bypass active retrieval.** (Evidence: §1, §3 F1, `TypeTranslate.tsx:43`). When an item content includes a hint, the hint text is displayed statically on the screen before the student even attempts an answer. If the hint contains the first letter or partial word, it turns an active recall task into a trivial copying drill. *Recommendation: Conceal hints behind a tappable "Need a hint? 💡" button that only opens on demand, or reveal hints automatically only after a first failed attempt.*
- **F4 · P2 — Unprotected Check button penalizes empty submissions.** (Evidence: §1, `TypeTranslate.tsx:22-27`). Submitting an empty input box counts as a productive failure and decrements a real database heart (`Engine.loseHeart`). *Recommendation: Disable the Check button until at least 1 letter is typed.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P1 — Zero acoustic modeling on translated English output.** (Evidence: §1, §3 F3). In an ESL learning environment, translating a Chinese prompt into English by typing should always culminate in hearing the English word spoken aloud. Currently, the screen never speaks the accepted English word! The auditory feedback loop is broken. *Recommendation: Automatically play native TTS pronunciation of the target English word/sentence upon submission (both on correct matches and error reveals).*
- **F6 · P2 — Disproportionate cognitive load for lower-primary typists.** (Evidence: §0, §1). Children aged 6–8 who are early EFL learners struggle intensely with touchscreen QWERTY keyboards. *Recommendation: For lower-tier stages (A1/A2), automatically degrade `TYPE_TRANSLATE` to a scrambled tile-bank selection model (like Word Bank Build) or provide a letter-bank keyboard.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F7 · P3 — Truncated error feedback hides alternative accepted answers.** (Evidence: §3 F2, `TypeTranslate.tsx:56`). If an objective accepts multiple valid translations (e.g. "bicycle" and "bike"), a failed attempt displays only `accepted[0]`. *Recommendation: Display all valid accepted variants in the feedback drawer ("Also accepted: bike").*

### 4.e Top-5 prioritized recommendations
1. **[P1] Automatically play native English audio upon submission:** Ensure the child hears the English pronunciation of the translated word immediately.
2. **[P1] Hide hints behind an on-demand "Hint 💡" button:** Prevent pre-revealed hints from leaking answers before the child attempts retrieval.
3. **[P2] Disable Check button on empty input:** Protect students from burning hearts on accidental taps.
4. **[P2] Add scrambled tile scaffolding for younger students:** Provide a word/letter bank for ages 6–8 to avoid keyboard typing frustration.
5. **[P3] Reskin prompt into Wonder Atlas mascot speech bubble:** Replace cold exam styling with a warm, encouraging illustrated character card.

### 4.f Stitch design log (AG fills as it generates)

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Game Subsystem:** Type Translate L1 to L2 Slate (`16-type-translate.md`)
- **Generation Date:** 2026-09-13
- **Submission Status:** 2 screens submitted and successfully materialized in Stitch datastore (HTTP 200 / Exit code 0).
- **Quota Discipline:** 2 screens generated (max 2 per game).

#### Screens Generated & Brief Summaries:

1. **Screen 1: L1 Prompt Active State**
   - **Stitch Screen ID:** `836fb75f884f47ef811257c0bec829be`
   - **Title:** `Professor ESL - Type Translate (L1 Prompt Active State)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1VRwa8xJvmTCcitYz3pYKw2y0Rf6kODcZGPFY1KfPviyy3l0S10YSus5sO-6eqWoIZFa7qj-FEXsoRw7SomD5SclLS_onZpBeQ0x78ICJkFFD_sLgI9SI9xPjZD9YATLPegVQEtM8nIQpshcGNl_Ccwu20_OQDJQDSg74oyM8DpPt6kgli-HoyUOa3lT9Glrx21NVizcegNPqegM1eFyvMC-7F7ISNexcegZJ6NBykBEpa-KlEbyzESfgg`
   - **Prompt Summary:** Mobile portrait (390×844) translation exercise in L1 prompt active state. Universal 64px header on paper #FDFBF7 with Step 6 in Duolingo pink #E91E63 (65%) and 4 hearts. Warm paper mascot prompt card (#FDFBF7, border #E2D7C3) displays friendly Professor Owl explorer gesturing to a large 28px bold Chinese prompt ("那辆红色的拖拉机非常大。"). Progressive on-demand hint button ("💡 Need a hint? (tap to peek)") in sand #E9C46A avoids pre-revealed answer leaks per audit P1 F3. Tactile typing slate shows active text input ("The red tractor is very ") with blinking cursor and character counter. Pinned 76px bottom dock features active primary CTA "CHECK TRANSLATION ➔" in teal #2A9D8F (bevel 0 4px 0 #1E6F5C).
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header close tap
     - `[🔊 playCue: hint_reveal]` on tapping hint button
     - `[🔊 playCue: tap_check]` on Check Translation tap
   - **Design Contract:** Wonder Atlas warm tokens (`#EAE0D0`, `#FDFBF7`, `#E2D7C3`) × Duolingo accents (`#E91E63`, `#1CB0F6`), Fredoka + Nunito typography, production Tailwind HTML + small style block, zero placeholder chrome.

2. **Screen 2: Success & Reveal State**
   - **Stitch Screen ID:** `3d17638818014a0bb6908772bd594f50`
   - **Title:** `Professor ESL - Type Translate (Success & Reveal State)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1XBuqOpTojMmAXZEeC_BReavZ86K7apP3GcVVS2FGRxlIXV1LM_CbsEL19wUCa9FNqHfhvdqXWqV1rDdsRcB9jd19StoOL6oaLyEWnpKBBGn72BRlgO3UC0-r7q1hPTqqypsjGf2_DrXyLJ6NgJjEegeCSXqsaj6qNtQr66bSKE81f4sbl4pCOlgBvqCoqo0PUNtmeEN7QYtgu6HhcHM-jYT04V8xzujsWNDctyXy-n3PpXAx-Hvk_maSg`
   - **Prompt Summary:** Mobile portrait (390×844) translation exercise in celebratory success and acoustic reveal state. Shell header shows Step 6 completed with sparkly progress glow and 4 hearts intact. Main stage shows Chinese prompt with emerald checkmark badge. Success drawer on paper #FDFBF7 (#2A9D8F border) features headline "🎉 Excellent Translation! 完美翻译", target English sentence ("The red tractor is very big."), auto-playing English audio waveform bar with 48px Duolingo blue speaker FAB ([playCue: match_success] [TTS: The red tractor is very big.]) solving audit P1 F5, alternative accepted translations chip ("Also accepted: 'That red tractor is really big.'") per audit F7, gamification badge "+15 XP Earned ⭐", and 54px primary CTA "CONTINUE ➔" in teal #2A9D8F (bevel 0 4px 0 #1E6F5C).
   - **Sound Cue Marks:**
     - `[🔊 playCue: match_success]` + `[TTS: The red tractor is very big.]` on success reveal
     - `[🔊 playCue: tap_continue]` on Continue CTA tap
   - **Design Contract:** Exact token hexes, thumb-reachable actions, production-grade Tailwind HTML + style block.

## §5 ZCode design verification (inside Stitch)

**Verified 2026-09-13** (owner batch pre-approval). Project `6865954475041880496`; exports in `stitch/16-type-translate/`. Screens 1-2 — PASS: hint behind on-demand peek; TTS-on-reveal with waveform + alternatives chip.-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**PRE-APPROVED 2026-09-13 (owner batch directive):** "implement them all right away without waiting for my approval… we will modify [off designs] afterward."

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
