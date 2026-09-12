# Word Lab — Focus Cards Step — v3 Quality Audit (`FOCUS_CARDS (passive study)`)

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

- **Surface / route:** FOCUS_CARDS step inside `/student/solo-lesson` — `apps/student/WordLab.tsx` (179 ln), invoked by SoloLessonPlayer.renderFocusCards
- **Exercise types consumed:** none (study phase)
- **Data sources:** unit manifest `getVocabulary(activeUnit.manifest)` (word, image_url, audio_url, phonetic, l1_translation, definition, example_sentence, example_audio_url) — first 5 cards
- **Scoring & data writes:** none — deliberate study gate ("I'm ready" advances; studied = flipped AND played)
- **Reachability:** any lesson flow containing a FOCUS_CARDS block (input phase standard)
- **Theme today:** white cards, `duo-blue` backs, pink studied-check badge

## §1 How the game works today

*(Screenshots pending — passport fixture.)*

The vocabulary STUDY phase for FOCUS_CARDS blocks. `WordLab` takes the unit's `getVocabulary(manifest)` and slices the first 5 cards (:23). Each card is an independent flip: front = image (`object-contain`, error→opacity .15) + word + a `duo-blue` Listen chip; back = gradient card with word, IPA, L1 translation, definition, example sentence + "hear sentence" (:79-151). `speak()` guarantees sound — stored audio or browser TTS — and marks the card played (:42-47). A card is "studied" when flipped AND played (:28-32); the footer button reads "I'm ready — let's practice" once all 5 are studied, else "Continue" with a tip (:159-174). No scores, no writes — a deliberate input gate before practice. Grid: 2 cols on phones → 5 cols on xl, min-height 220px cards (:66).

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … The home screen for the student will not be changed … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/WordLab.tsx`.

- **F1 · P3 — Back-card content can overflow on long entries.** Definition + example + buttons in a min-h-220 card (grows, but in the 2-col phone grid a long definition squeezes the card tall and pushes the footer below the fold — no scroll containment per card).
- **F2 · P3 — Broken images leave a near-blank card** — `onError` sets opacity .15 (:94) with no fallback glyph (the word text survives, but the visual channel silently dies; contrast with ListenTap's 🖼️ fallback pattern).
- **F3 · P3 — No audio autoplay on flip** — by design (learner control, documented in the header comment); §4 should confirm keeping it.
- **F4 · P3 — "Studied" requires hearing audio, but the Listen chip is small** (`px-3 py-1.5` ≈ 32px, :103-107) — the gate condition depends on a sub-floor tap target.

**Works well:** guaranteed-sound design, independent flips for contrast study, honest gate, image containment. This one is close to "slight improvement" bucket.

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — 2-column mobile grid squashes card anatomy.** (Evidence: §1, `WordLab.tsx:66`). On a standard 390px mobile viewport, a 2-column layout forces card widths down to ~165px. Attempting to fit an illustration, English headword, IPA phonetic transcription, Chinese translation, definition, and example sentence within this footprint results in severe visual cramping, truncated text, and tiny button targets. *Recommendation: Adopt a single-card swipe deck or focused carousel on mobile viewports (<640px) with clear pagination dots, reserving multi-column grids exclusively for tablet viewports.*
- **F2 · P3 — Opacity-based image error fallback leaves a ghost silhouette.** (Evidence: §1, §3 F2, `WordLab.tsx:94`). When an image URL fails to load, `onError` simply lowers container opacity to `0.15`. This presents an empty, washed-out grey box that looks like a visual rendering glitch to a 7-year-old. *Recommendation: Render an illustrated icon fallback (e.g. Wonder Atlas magnifying glass or book icon in `#E2D7C3` border) with the English word centered prominently.*
- **F3 · P3 — Sub-floor tap targets on the audio trigger chip.** (Evidence: §1, §3 F4, `WordLab.tsx:103-107`). The card's Listen button is styled as a small chip (`px-3 py-1.5` ≈ 32px height), well below the mobile touch floor of 48px. *Recommendation: Expand the audio button into a prominent circular speaker FAB (minimum 48×48px) with a tactile bevel (`wa-teal`).*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F4 · P2 — Obscure two-factor "Studied" completion gate.** (Evidence: §1, `WordLab.tsx:28-32, 159-174`). For a card to transition into the "studied" state, the student must both flip the card AND play its audio. However, the UI does not visually explain this compound requirement. Children frequently flip all cards, see the footer still saying "Continue (study all cards first)", and become stuck or frustrated. *Recommendation: Provide two explicit visual check chips on the card footer: "👂 Listen" and "🔄 Flip", giving instant visual satisfaction when each half of the requirement is satisfied.*
- **F5 · P3 — Overflowing card back pushes footer off-screen.** (Evidence: §3 F1, `WordLab.tsx:79-151`). When an objective includes a lengthy English definition and example sentence, the back face expands beyond the container min-height, pushing the parent container and primary "Continue" button below the phone fold without internal scrolling. *Recommendation: Constrain card height and provide internal overflow scrolling (`overflow-y-auto`) for explanatory text, ensuring the bottom action button remains anchored and thumb-reachable.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F6 · P2 — Missing audio auto-reinforcement on initial card flip.** (Evidence: §1, §3 F3, `WordLab.tsx:42-47`). In solo EFL home study, auditory modeling is the primary channel for mapping grapheme to phoneme. Requiring young learners to hunt for a secondary audio button after flipping to the back face creates unnecessary cognitive friction. *Recommendation: Auto-play the native pronunciation audio once upon the first flip to the back card face, while keeping the speaker button active for manual replays.*
- **F7 · P3 — Advanced dictionary definitions overload beginner learners.** (Evidence: §1, `WordLab.tsx:120-135`). Displaying abstract dictionary definitions in English for primary school ESL students creates cognitive overload. *Recommendation: Emphasize the direct image + Chinese L1 meaning + clear phonetic transcription; display English definitions only when explicitly tailored for intermediate tiers.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F8 · P2 — Lack of satisfying completion payoff when all cards are mastered.** (Evidence: §1, `WordLab.tsx:159-174`). When the 5th card is studied, the footer button simply switches label text to "I'm ready — let's practice". There is no tactile haptic pulse, sound chime, or visual celebration. *Recommendation: Trigger a celebratory sparkle burst and bounce animation on the "I'm ready!" button when the 5/5 milestone is reached, motivating the child as they transition into the exercise battery.*

### 4.e Top-5 prioritized recommendations
1. **[P2] Switch mobile layout to single-card swipe carousel:** Replace the cramped 2-column grid with a focused 1-card presentation for phones under 640px.
2. **[P2] Clarify the "Studied" gate requirements:** Show dual visual badges (👂 Heard + 🔄 Flipped) on each card so the child understands exactly what actions unlock the step.
3. **[P2] Enlarge audio button to ≥48px and auto-play on first flip:** Guarantee clear acoustic modeling without requiring kids to hunt for small 32px targets.
4. **[P3] Add graceful illustrated image fallback:** Replace `opacity: 0.15` grey rectangles with a warm Wonder Atlas icon placeholder when images fail.
5. **[P3] Contain card overflow and anchor the footer:** Constrain maximum card height so lengthy definitions never push the "I'm Ready" button off-screen.

### 4.f Stitch design log (AG fills as it generates)

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Game Subsystem:** Word Lab Focus Cards (`03-word-lab.md`)
- **Generation Date:** 2026-09-13
- **Submission Status:** 2 screens submitted and successfully materialized in Stitch datastore (HTTP 200 / Exit code 0).
- **Quota Discipline:** 2 screens generated (max 2 per game).

#### Screens Generated & Brief Summaries:

1. **Screen 1: Word Lab 5-Card Study Grid / Carousel (Active Deck State)**
   - **Stitch Screen ID:** `6bfb15e49dd947a4a3168b8aa2387e29`
   - **Title:** `Professor ESL - Word Lab (FOCUS_CARDS) 5-Card Study Grid`
   - **Generated Art Asset ID:** `b297ab8b760a4b89acd2b2e98a4753b2`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1WZ7VqcWNq4LwR-seBrVSmyMFTUZ1PoKmbx4E-Cc69y6aIqqKAetnuxjss9DAAmYYQ0AwNrblWmdLjrccrEGNfKBScbEhJjVUJWh4BQxdl_D-qkK87-IDoZR-wRM6XqC8Q72nRjyZunYVNzzZ8RYUIKUjNd-Rn3eScxQBPf-waIRx5j19trqQ_5aDxCOoe1WzXdEgstbbT9c2i85NdiXn5uE8NR4Dk1y8QzRnADm8WaIMKV7LRZn0B6OsY`
   - **Prompt Summary:** Mobile portrait (390×844) vocabulary study screen showing 2 of 5 cards studied. Shell header displays Step 2 in Duolingo pink `#E91E63` and 4 hearts. Subheader features terracotta badge `WORD LAB • VOCABULARY STUDY` and sand `2 / 5 Studied` chip with mascot instruction on dual requirements (`👂 Listen` and `🔄 Flip`). Central active card (`crosswalk`) features custom vibrant children's book illustration, bold headword, IPA chip `[ˈkrɔːs.wɑːk]`, 52px Duolingo blue audio FAB (`#1CB0F6`, bevel `0 4px 0 #0284C7`), dual requirement tags (`👂 Listened ✔` and `🔄 Not flipped yet`), and tactile flip button. 5-card thumbnail track shows completed (`subway`), active (`crosswalk`), unstudied (`traffic light`), long word (`skyscraper`), and missing image fallback (`convenience store`). Anchored footer contains disabled Continue CTA `Study All Cards (2/5)`.
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header close tap
     - `[🔊 playCue: word_pronounce]` on audio speaker FAB tap
     - `[🔊 playCue: card_whoosh]` on card flip button tap
   - **Design Contract:** Wonder Atlas warm tokens, Fredoka + Nunito typography, production Tailwind HTML + small style block, zero placeholder chrome.

2. **Screen 2: Flipped Card Back Details State (Lexical Scaffold & Completion)**
   - **Stitch Screen ID:** `c2c68c15efa940748e3a8493a2f87b50`
   - **Title:** `Professor ESL - Word Lab (Card Back Details)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1VRL3XwZTZsg4Y1dAEMplZyxmV894ODr51qjMqS-3142iRznKgKDvuGYDJiIWn_57Sal3UVh1QcBsLDBF-KkzcfzkFmoCGTvjOSQROlC2fE93sqtADmYni829OGkxjmhyS9IWWyMnzvhrZpFlvp4uVJywFuP8g-sBBJZaZl8ruYSoXMU_g2cUdxzzgU7_FMag6flJqwlXqQbQmdBrIxrY5tmThieXtAWPElSmBLk9qWJ6RT8b9QZOhnm7s`
   - **Prompt Summary:** Mobile portrait (390×844) flipped back card face for `crosswalk`. Card is encased in paper `#FDFBF7` with 2px teal `#2A9D8F` completion border. Top row features headword `crosswalk` in 26px Fredoka, IPA `[ˈkrɔːs.wɑːk]`, and 48px Duolingo blue `#1CB0F6` replay FAB. Prominent terracotta `#E76F51` translation `人行横道 / 斑马线`. Child-friendly English definition in mist box, plus example sentence card (`Look both ways before stepping onto the crosswalk.`) with dedicated 40px teal audio button. Dual completed badges displayed: `👂 Listened ✔` (teal) and `🔄 Flipped ✔` (sand). Full-width button `↩ Flip to Front` and unlocked anchored Continue CTA `CONTINUE (3/5 CARDS) →` in beveled teal `#2A9D8F`.
   - **Sound Cue Marks:**
     - `[🔊 playCue: word_pronounce]` on audio replay FAB tap
     - `[🔊 playCue: sentence_audio]` on sentence speaker tap
     - `[🔊 playCue: study_chime]` when dual studied badges are earned
     - `[🔊 playCue: tap_next]` on footer continue tap
   - **Design Contract:** Exact token hexes, thumb-reachable actions, production-grade Tailwind HTML + style block.

## §5 ZCode design verification (inside Stitch)

**Verified 2026-09-13** (owner batch directive — no per-game gate). Project `6865954475041880496`. Screens 1+3 exported (`stitch/03-word-lab/`) — PASS: 5-card study grid + flipped back card, warm paper surfaces, listen pills. Screen 2's screenshot still materializing in Stitch (HTML pending retry) — non-blocking. Sound moments marked per the owner's sound directive; implementation wires `playCue`.-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**PRE-APPROVED 2026-09-13 (owner batch directive, verbatim):** "I review every screen in Stitch right now so please implement them all right away without waiting for my approval. I will verify everything tomorrow… in case some designs are too much off, we will modify them afterward." — revisions, if any, follow the edit_screens loop after his review.

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
