# Choice Exercise — Universal MCQ — v3 Quality Audit (`10 POOL EXERCISE TYPES`)

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
- **F1 · P2 — Flat desktop-style option cards lack tactile mobile affordance.** (Evidence: §1, `ChoiceExercise.tsx:169-192`, `exercises/shared.tsx`). Options render as flat rectangular panels with standard 1px borders that simply change border color on selection. In a kid-focused mobile app, option cards should be chunky, tactile, and fun to press. *Recommendation: Redesign option cards into Duolingo-style 3D bevel buttons (`wa-paper` background `#FDFBF7`, 0 4px 0 bottom bevel `#E2D7C3`, active:translate-y-1, active:shadow-none, bold Fredoka typography).*
- **F2 · P3 — Raw underscore blanks in cloze exercises.** (Evidence: §1, §3 F6, `ChoiceExercise.tsx:164`). In `SPELL_CLOZE` and `GRAMMAR_FILL`, the sentence gap is rendered as literal underline text (`___`). It looks like unrendered source code. *Recommendation: Render the gap as an inviting dashed slot pill (`min-w-16 h-8 border-2 border-dashed border-wa-terracotta/60 rounded-lg inline-flex items-center justify-center bg-wa-cream/30`).*
- **F3 · P3 — Ghost card image error state.** (Evidence: §3 F4, `ChoiceExercise.tsx:183`). When an option image fails, setting container opacity to 0.2 creates a ghostly blank card. *Recommendation: Render a clean illustrated placeholder icon (e.g. Wonder Atlas picture frame icon) so the option retains physical presence.*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F4 · P1 — Fleeting 1.1s explanation window auto-advances before reading.** (Evidence: §1, §3 F2, `ChoiceExercise.tsx:130-138`). Upon tapping an answer, feedback and explanation text appear, but `onComplete` automatically fires after a fixed 1100ms timer. A 7-year-old child who got the answer wrong cannot even read the first three words of the explanation before the screen is whisked away. *Recommendation: Replace the automatic 1.1s timer with a Duolingo-style anchored bottom feedback drawer (emerald for correct, terracotta/red for wrong) displaying the full explanation and requiring the child to tap a large "Continue →" button to proceed.*
- **F5 · P2 — Instant commit on single tap causes accidental mis-taps.** (Evidence: §1, `ChoiceExercise.tsx:130`). For sentence-level grammar and comprehension questions, tapping any option instantly locks the choice. Children resting their fingers or scrolling accidentally score errors. *Recommendation: For complex text-based MCQs, adopt a two-step pattern: tap option to select, tap bottom "Check" button to evaluate.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F6 · P1 — Mixed-modality leak bypasses listening comprehension in LISTEN_SELECT.** (Evidence: §1, §3 F1, `ChoiceExercise.tsx:177-189`, `generate-exercises/index.ts:118-126`). In `LISTEN_SELECT`, when some distractors lack images, the generator outputs a mixed set where 3 options show pictures and 1 option shows plain English text (`text: word`). Children immediately spot the text as the odd-one-out or read the English word directly, completely bypassing the auditory listening task. *Recommendation: Enforce strict modality uniformity per question: if any distractor lacks an image, degrade all options to text-only recognition, or provide an illustrated placeholder card for imageless items.*
- **F7 · P2 — Missing auditory reinforcement on option selection.** (Evidence: §1). In vocabulary choice exercises, hearing the candidate options spoken aloud aids ESL learners who have not yet mastered orthographic decoding. *Recommendation: Add a small speaker icon on candidate text options allowing the child to hear options before or after answering.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F8 · P2 — Absence of in-place error correction.** (Evidence: §1, §3 F3). When an answer is wrong, the card turns red and disappears into the runner's end-of-session retry queue. The learning moment is severed. *Recommendation: On wrong answers, shake the incorrect card, highlight the correct card in emerald, play its native pronunciation, and show the explanation in the bottom drawer.*

### 4.e Top-5 prioritized recommendations
1. **[P1] Eliminate LISTEN_SELECT mixed-modality leaks:** Enforce 100% uniform option presentation (all-image or all-text) to protect listening comprehension integrity.
2. **[P1] Replace 1.1s auto-advance with anchored bottom feedback drawer:** Keep explanations visible until the child taps "Continue" so errors actually teach.
3. **[P2] Upgrade options to tactile Duolingo-style 3D bevel buttons:** Provide chunky, responsive buttons with clear Fredoka typography and tap-down haptic feel.
4. **[P2] Format cloze gaps as styled slot pills:** Replace raw `___` underlines with inviting dashed slot containers.
5. **[P2] Add in-place corrective audio modeling on wrong choices:** Vocalize the correct English answer before advancing.

### 4.f Stitch design log (AG fills as it generates)

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Pilot Game Design System:** Exercise Battery Runner Shell (`12-exercise-battery.md`) & Universal Choice MCQ (`13-choice-exercise.md`)
- **Generation Date:** 2026-09-13
- **Submission Status:** All 4 screens submitted and accepted by Stitch (HTTP 200 / Exit code 0).
- **Expected Async Arrival:** Screens materialize asynchronously into Stitch project datastore over ~10 minutes to hours. (Per handover rules, do not re-submit duplicates).

#### Screens Requested & Brief Summaries:

1. **Screen 1: Active Exercise Battery Shell with Audio Prompt (`LISTEN_SELECT`)**
   - **Stitch Screen ID:** `4927bd6cc1b546fea5ae311773abd5d5`
   - **Title:** `Professor ESL - Exercise Battery Runner (LISTEN_SELECT)`
   - **Prompt Summary:** Mobile portrait (390×844) ExerciseRunner shell. Full HUD with 48px X close button, 45% progress bar in Duolingo pink (`#E91E63`) with gloss highlight, live hearts counter showing 4 hearts (`#FF4B4B` SVG + bold `4` in Fredoka `#264653`), and `SOUND LAB • UNIT 3` context pill chip. Paper prompt card (`#FDFBF7`) with tactile 72×72px Duolingo blue (`#1CB0F6`) audio button (0 4px 0 `#0284C7` bevel), prompt headline `Listen and choose the picture` with Chinese support subtitle `听录音，选择对应的图片`. 2×2 option grid testing long-word variant (`caterpillar`), active selected state (`butterfly` in `#F7F3E8` with `#2A9D8F` border & `#1E6F5C` bevel), and missing image fallback card (`dragonfly`). Sticky lower action bar with 54px full-width `CHECK` button in teal (`#2A9D8F`).
   - **Design Contract:** Wonder Atlas warmth (`#EAE0D0`, `#FDFBF7`, `#E2D7C3`) × Duolingo accents (`#E91E63`, `#1CB0F6`, `#FF4B4B`), Fredoka + Nunito typography, production-grade Tailwind HTML + CSS style block, zero placeholder chrome.

2. **Screen 2: Choice Exercise - Correct Feedback State (Anchored Drawer)**
   - **Stitch Screen ID:** `53300edb85a44332a12cb302f9e2eed3`
   - **Title:** `Professor ESL - Choice Exercise Correct Feedback State`
   - **Prompt Summary:** ChoiceExercise sentence cloze challenge (`The clever fox jumped [ over ] the fence.`) inside runner shell (50% progress, 4 hearts). 4 stacked vertical cards with Option B (`over`) selected and revealed correct (emerald `#E6F4F1` fill, `#2A9D8F` border, `0 4px 0 #1E6F5C` bevel, checkmark badge); distractors dimmed. Anchored bottom feedback drawer in `#E8F8F5` with teal top border, 40px emerald check circle, `Nicely done! +1 XP` headline, pedagogical explanation with Chinese support line (`跨越障碍物上方时使用 over`), and full-width 54px `CONTINUE →` CTA in teal (`#2A9D8F`, bevel `#1E6F5C`).
   - **Design Contract:** Reusable Tailwind HTML + small style block, exact token hexes, thumb-reachable actions.

3. **Screen 3: Choice Exercise - Wrong Answer & In-Place Correction State**
   - **Stitch Screen ID:** `6d4092c0d4784263bb06b05d55a1ce7f`
   - **Title:** `Professor ESL - Choice Exercise (Wrong Answer & Correction State)`
   - **Prompt Summary:** Vocabulary meaning match (`ancient` with audio speaker button) inside runner shell. Top HUD shows heart decrement: 3 hearts remaining, cracked heart icon, floating `-1 ❤️` penalty chip. 4 stacked options with Option A incorrectly picked (`very modern` in soft red `#FEF2F2`, border `#FF4B4B`, bevel `#DC2626`, red X badge) and Option B revealed correct (`very old, from long ago` in `#F0FDFA`, border `#2A9D8F`, check badge). Anchored bottom feedback drawer in `#FEF2F2` with red top border, `-1 ❤️` chip, prominent correct solution display, dual-language explanation (`“Ancient” means belonging to the very distant past. (古代的 / 远古的)`), retrieval cue (`🔄 Re-queued for Review Round at end of lesson`), and full-width `GOT IT →` CTA in terracotta (`#E76F51`, bevel `#C4553B`).
   - **Design Contract:** Reusable Tailwind HTML + style block, exact token hexes, pedagogical learning hold.

4. **Screen 4: Battery Runner Summary Screen - Round Complete Recap**
   - **Stitch Screen ID:** `c8c44b1207144994bc3abdc3ad8b8c96`
   - **Title:** `Professor ESL - Exercise Battery Runner Summary Screen`
   - **Prompt Summary:** Session-end celebration card on warm cream canvas (`#EAE0D0`). Floating paper card (`#FDFBF7`, border `#E2D7C3`) with 88×88px golden trophy hero (`#FEF3C7`, `#E9C46A`) and pink/teal confetti sparkles. Headline `Round Complete!` (Fredoka 32px `#1D3557`) and subtitle `Excellent effort! +15 XP earned 🎉` (terracotta `#E76F51`). 3 honest summary metric tiles (grid-cols-3): `10/12` (Correct), `83%` (Accuracy in teal), `4` (Strengthened in Duolingo pink - honest mastery label addressing audit F3). Retrieval note banner (`🔄 2 tricky words mastered in the Review Round!`) and heart economy recovery chip (`+1 Heart Restored ❤️` in `#E8F8F5`). Full-width 56px primary CTA button `CONTINUE TO LESSON MAP →` in teal (`#2A9D8F`, bevel `#1E6F5C`).
   - **Design Contract:** Wonder Atlas × Duolingo tokens, reusable Tailwind HTML + style block, kid-friendly honest metrics.

## §5 ZCode design verification (inside Stitch)

**Project:** `6865954475041880496` (MOBILE). Verified 2026-09-13 via direct `get_screen` fetches.

- **Screen 2 — `stitch/13-choice-exercise/2-choice-correct.html|png`** (CORRECT state) — **PASS.** Mobile portrait; MEANING_MATCH prompt (Chinese meaning → English options — Chinese on the prompt is the task itself; options clean); full-width stacked options ≥56px; emerald bottom feedback sheet "CORRECT! +1 XP" with CONTINUE — the anchored bottom-sheet pattern solves the 1.1s-flash finding; palette on-brief (37 hits). **Notes:** eyebrow chip 11px (bump); phone-frame wrapper to strip.
- **Screen 3 — `stitch/13-choice-exercise/3-choice-wrong.html|png`** (WRONG state) — **PASS.** Wrong pick red-outlined with animated cracked-heart badge (hearts lose made VISIBLE — solves the silent-heart-drain finding); correct answer highlighted green with check (in-place correction); coral "NOT QUITE!" sheet with encouraging copy; no Chinese on options. **Notes:** eyebrow chips 10–11px (bump); phone-frame wrapper to strip.

**Go/no-go: GO to owner approval.**

## §6 Owner approval (HARD GATE)

<Owner's verdict per screen: approved / revise (what to change). No implementation starts before an explicit go on THIS game's designs.>

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
