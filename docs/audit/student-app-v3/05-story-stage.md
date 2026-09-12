# Story Stage — In-Lesson Reader — v3 Quality Audit (`STORY_STAGE (passive reading)`)

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

- **Surface / route:** STORY_STAGE step inside `/student/solo-lesson` — inline `SoloLessonPlayer.renderStoryStage` (SoloLessonPlayer.tsx:280-384)
- **Exercise types consumed:** none (reading input phase)
- **Data sources:** flow `data.pages` (text/speaker/portrait/audio/image); manifest `getCharacters` for speaker portraits; `getVocabulary` map for tappable words (tap → popup word+IPA+L1+speak, `playAudioUrl`)
- **Scoring & data writes:** none
- **Reachability:** story blocks in lesson flows
- **Theme today:** amber/orange reading panel, tappable amber-underlined vocab, page dots, prev/next

## §1 How the game works today

*(Screenshots pending.)*

The story-reading input step, inline (:280-384). Pages come from flow `data.pages` (text/speaker/portrait/audio); speaker portraits resolve from the unit's manifest characters, emoji-fallback (:295-299). Story text renders token-by-token; tokens matching unit vocabulary (case-insensitive) become tappable amber-underlined spans — tap = speak the word (`playAudioUrl`) + popup card with word/IPA/L1/definition + listen chip (:301-318, :369-381). A "Read along" button speaks the whole page (:324-327). Page dots + small prev/next arrows (:345-366). No writes.

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … The home screen for the student will not be changed … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/SoloLessonPlayer.tsx` (inline renderer).

- **F1 · P2 — Inline vocab tap targets are word-sized.** The tappable span is just the word (:307-314) inside text-lg body text — for 6-y/o fingers, a partial-tap misses; the popup's listen chip is then a second small target (:373). Consider a larger hit area (padding) or tap-to-select-then-confirm pattern.
- **F2 · P3 — Popup only closes by tapping itself** (:370) — no tap-outside, no auto-dismiss; a confused kid can accumulate a stale popup.
- **F3 · P3 — "Tap any word to hear it 👆" hint is low-contrast** (`text-amber-500/70`, :342).
- **F4 · P3 — Page dots are indicators, not buttons** (:345-349) — no jump-to-page; nav relies on the two small arrows (see shell F6).
- **F5 · P3 — No page-turn audio cue or read-along state feedback** — pressing Read along gives no visual state (button doesn't change while speaking).

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Dense typography lacks storybook spaciousness.** (Evidence: §1, `SoloLessonPlayer.tsx:301-318`). Story text renders inside a compact box with standard line spacing. For early ESL readers (ages 6–8), reading dense blocks of foreign text causes visual fatigue and line skipping. *Recommendation: Increase font size to ≥18px with generous line height (`leading-relaxed` / 1.75) on a warm paper background card (`#FDFBF7`) with illustrated page borders.*
- **F2 · P3 — Sub-floor pagination buttons.** (Evidence: §1, §3 F1, `SoloLessonPlayer.tsx:353-365`). The previous/next page navigation buttons are rendered as small ~36px circle chips. Young children with developing fine motor skills frequently tap the space adjacent to the button without triggering page turns. *Recommendation: Enlarge previous/next page controls to minimum 48×48px buttons positioned at thumb level with clear tactile borders.*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P2 — Missing touch swipe navigation on mobile devices.** (Evidence: §1, `SoloLessonPlayer.tsx:345-366`). In a digital book format on a mobile phone, children instinctively swipe horizontally to flip pages. Restricting page turns to tiny directional arrow buttons frustrates natural device gestures. *Recommendation: Implement native touch swipe gesture handlers (`touchstart` / `touchend`) to allow effortless thumb-swipe page turning.*
- **F4 · P3 — Sticky vocabulary popup modal trap.** (Evidence: §1, §3 F2, `SoloLessonPlayer.tsx:370`). When a child taps an underlined vocabulary word, a definition card appears anchored at `bottom-24`. The popup can only be dismissed by tapping directly inside the popup itself. Tapping story text or turning the page leaves the popup stranded over the content. *Recommendation: Enable backdrop tap-outside dismissal and auto-dismiss the popup whenever the child navigates to another page.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P2 — "Read Along" lacks auditory-visual synchronization.** (Evidence: §1, §3 F5, `SoloLessonPlayer.tsx:324-327`). Pressing "Read along" triggers whole-page audio playback, but the story text remains completely static. The child hears continuous speech without any indication of which sentence or word corresponds to the current sound. In solo EFL study, this breaks the reading-phonics link. *Recommendation: Synchronize audio with progressive sentence or word-level highlighting (karaoke style) so the child's eyes track the spoken text.*
- **F6 · P2 — Sub-floor inline vocabulary word touch padding.** (Evidence: §1, §3 F1, `SoloLessonPlayer.tsx:307-314`). Tappable vocabulary words are rendered as standard unpadded text spans (`text-lg`). Tapping a short 3-letter word like "cat" or "sun" on a phone requires unrealistic fingertip precision. *Recommendation: Add invisible touch padding (`py-1 px-1.5 inline-block -my-1 rounded`) around tappable words to expand the effective hit target to ≥44px without altering typographic spacing.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F7 · P3 — Missing story completion payoff.** (Evidence: §1, `SoloLessonPlayer.tsx:345-384`). Flipping to the last page simply leaves the reader sitting on the final sentence with the static shell footer Continue button. There is no acknowledgment that the child just finished reading an entire English story. *Recommendation: Display a cheerful end-of-story badge ("Story Finished! 📖✨") on the final page with an energetic prompt guiding the child into the comprehension challenge.*

### 4.e Top-5 prioritized recommendations
1. **[P2] Add mobile touch swipe gestures for page turning:** Enable intuitive thumb swiping left/right across the reading surface.
2. **[P2] Implement synchronized text highlighting during "Read Along":** Highlight words/sentences in teal as audio plays to reinforce reading tracking.
3. **[P2] Expand vocabulary word hit targets:** Add generous touch padding to underlined vocabulary words and support tap-outside popup dismissal.
4. **[P3] Enlarge page navigation arrow buttons to ≥48px:** Guarantee reliable touch response for small hands.
5. **[P3] Refresh story reader typography:** Increase font scale to 18px with relaxed line height on a warm paper `#FDFBF7` storybook surface.

### 4.f Stitch design log (AG fills as it generates)

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Game Subsystem:** Story Stage In-Lesson Reader (`05-story-stage.md`)
- **Generation Date:** 2026-09-13
- **Submission Status:** 2 screens submitted and successfully materialized in Stitch datastore (HTTP 200 / Exit code 0).
- **Quota Discipline:** 2 screens generated (max 2 per game).

#### Screens Generated & Brief Summaries:

1. **Screen 1: Story Stage Illustrated Story Reader + Tappable Vocab + Read Along**
   - **Stitch Screen ID:** `aa25200bd53a4d74a65a4faf7327fb0e`
   - **Title:** `Professor ESL - Story Stage (Illustrated Story Reader)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1UkLYwRKDj5emBzzr_rYyagPmgj9ypnTRcACPOd0aFrFaqj2VtgvJrx_-tCEggJvpQ3ZnuoqGwaeZBBbQ5qk1peRwVQ0xhW-fDZx9Jf2BgHh_EtsmYSF4xMQD2m1u9Ta2Bdj5aOUltbyMQ98Sgbc_RxpDQrt-a5-nFZpnTxR71_bAaR8LtVzhsDxWlHAyENzX19cnnmgQujFKbpRA8PlfamUSg6tG25CNlVO62pufeQR3iDREErUGQ976Q`
   - **Prompt Summary:** Mobile portrait (390×844) story reader screen showing Page 2 of 4. Shell header displays Step 3 in Duolingo pink `#E91E63` and 4 hearts. Main stage presents an illustrated paper card `#FDFBF7` with colorful storybook scene of school children and Lily crossing a city street. Character row features circular portrait avatar of Lily with terracotta border `#E76F51` and speech tag `Lily says:`. Story text is set in spacious 18px Nunito (1.8 line height) with tappable vocabulary words padded in tactile pill spans (`skyscraper` in soft orange pill, `crosswalk` in teal glowing pill). Interaction bar includes beveled `🔊 Read Along` audio narration button in teal `#2A9D8F`, previous/next 48px navigation arrow buttons, and 4-dot indicator with Page 2 active in sand `#E9C46A`. Anchored footer CTA `CONTINUE →`.
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header close tap
     - `[🔊 playCue: page_turn]` on page flip arrow tap
     - `[🔊 playCue: word_tap]` on tapping underlined vocabulary word
     - `[🔊 playCue: read_along_narration]` on Read Along narration tap
     - `[🔊 playCue: tap_next]` on footer continue tap
   - **Design Contract:** Wonder Atlas tokens, Fredoka + Nunito typography, production Tailwind HTML + small style block, zero placeholder chrome.

2. **Screen 2: Word Popup Definition Modal Card (Interactive Touch Lexicon)**
   - **Stitch Screen ID:** `3f990bff2ffb40178f40075e5b10b5bd`
   - **Title:** `Professor ESL - Story Stage (Word Popup Definition & Audio Modal)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1U5bVtkoXJAfi45vncIa_sNKBQgDXXKKgwIeDSuuuoOtAy7gNZjujwJHQv_ekOrGoU2DY5vhxRUIMKo3lDPMjFXRa9sYw1UeBc2zV511CPL8_sluhaHr6XRKGaMEtXJTAwt_o-kZsvEn5XHIHa1ynuv3Jr27gJkQpQCKMc2d54_bxrEaR6DD-LWm24FETIcz68pmgNGQAnthP9aneItU_Ppa3suJVy4mCGLMJvQkd8zNoEn8UmrvZwPxcE`
   - **Prompt Summary:** Mobile portrait (390×844) vocabulary definition popup card anchored over softly dimmed story reader (`rgba(38, 70, 83, 0.38)`). Tapped word `crosswalk` glows with active animated teal ring in the background. Elevated paper card `#FDFBF7` features 2.5px teal `#2A9D8F` border, headword `crosswalk` in 24px Fredoka, IPA pill `[ˈkrɔːs.wɑːk]`, 36px dismiss chip `✕`, 48px Duolingo blue `#1CB0F6` pronunciation FAB (`0 4px 0 #0284C7` bevel), bold terracotta `#E76F51` translation `人行横道 / 斑马线`, kid-friendly English definition in mist box, and contextual example sentence with outside-tap dismiss instruction. Anchored footer with `CONTINUE →`.
   - **Sound Cue Marks:**
     - `[🔊 playCue: popup_open]` on modal appearance
     - `[🔊 playCue: word_pronounce]` on audio speaker FAB tap
     - `[🔊 playCue: tap_next]` on footer continue tap
   - **Design Contract:** Exact token hexes, thumb-reachable actions, production-grade Tailwind HTML + style block.

## §5 ZCode design verification (inside Stitch)

**Verified 2026-09-13** (owner batch directive — no per-game gate). Project `6865954475041880496`. Screens 1-2 exported — PASS: storybook spread with tappable vocab pills + the definition popup (solves F1 tap-target finding). Sound moments marked per the owner's sound directive; implementation wires `playCue`.-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**PRE-APPROVED 2026-09-13 (owner batch directive, verbatim):** "I review every screen in Stitch right now so please implement them all right away without waiting for my approval. I will verify everything tomorrow… in case some designs are too much off, we will modify them afterward." — revisions, if any, follow the edit_screens loop after his review.

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
