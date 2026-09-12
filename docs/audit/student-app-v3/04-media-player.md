# Media Player — Video & Song Step — v3 Quality Audit (`MEDIA_PLAYER (passive)`)

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

- **Surface / route:** MEDIA_PLAYER step inside `/student/solo-lesson` — inline `SoloLessonPlayer.renderMediaPlayer` (SoloLessonPlayer.tsx:443-568)
- **Exercise types consumed:** none
- **Data sources:** flow block data: videoUrl / audioUrl / lyrics[{time,text}] (mediaResolver-written fields on warm-up blocks)
- **Scoring & data writes:** none
- **Reachability:** warm-up song blocks in the unit flow
- **Theme today:** dark slate/indigo gradient, ReactPlayer w/ YouTube (controls:0), 0.6-opacity video + 50% scrim, karaoke current/next line, pink progress

## §1 How the game works today

*(Screenshots pending.)*

The warm-up song/video step, rendered inline by SoloLessonPlayer (:443-568). Reads `videoUrl/audioUrl/lyrics` from the block. Video (ReactPlayer/YouTube, `controls:0`) sits absolutely at `opacity: 0.6` behind a 50% scrim; lyrics show current line (text-2xl) + dimmed next line, tracked from `onProgress` (:454-461,522-534). Controls: mute, 48-56px play/pause circle, restart, and a tappable seek bar with time labels (:536-565). Empty state when no media and no lyrics (:469-479). No writes. Exit/continue via the shell footer.

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … The home screen for the student will not be changed … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/SoloLessonPlayer.tsx` (inline renderer).

- **F1 · P2 — Video dimmed to 60% + 50% black scrim** (:498, :508) — on a phone in a bright room the actual TTR modeling is hard to see. The board's v3 media player fixed exactly this (full-bleed, uncropped, undimmed); port that thinking.
- **F2 · P2 — No volume control** — mute toggle only (:552-554); headphone kids may need volume, speaker kids definitely do.
- **F3 · P3 — Seek bar is a 6px-tall tap target** (`h-1.5`, :539) with tiny time labels — hard for kids to scrub.
- **F4 · P3 — Audio-only steps show a bare "Press play to start"** (:530-532) — no artwork/title card moment.
- **F5 · P3 — No caption/lyrics toggle** — lyrics render only if the block carries them; when absent there's no fallback display of the song text.
- **F6 · P3 — No error recovery if the embed fails to load** (board v3 added `onError` + candidate fallback; this surface has none).

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Dark scrim and 60% opacity blind visual language modeling.** (Evidence: §1, §3 F1, `SoloLessonPlayer.tsx:498,508`). The video container applies `opacity: 0.6` behind a 50% black scrim overlay to make karaoke text pop. This darkens the singer's mouth, facial expressions, and contextual illustrations. In EFL education, visual modeling of lip movement and action context is essential for comprehension. *Recommendation: Render video at 100% full opacity with no global darkening scrim. Position karaoke lyrics inside a semi-transparent subtitle card at the bottom of the screen.*
- **F2 · P3 — Scrubbing seek-bar is an unusable 6px target.** (Evidence: §1, §3 F3, `SoloLessonPlayer.tsx:539`). The scrubber bar is only 6px tall (`h-1.5`) with tiny timestamp labels. A child trying to drag back 10 seconds to hear a tricky chorus will almost certainly miss the bar, triggering browser navigation or scrolling gestures. *Recommendation: Expand the scrubber touch target to 48px height with a visible circular thumb scrubber (`w-4 h-4 wa-terracotta`) and bold legible timestamps (≥14px).*
- **F3 · P3 — Visual identity mismatch with the rest of the light app.** (Evidence: §0, §1). The media player plunges into a dark indigo/slate void that feels disconnected from the warm Wonder Atlas cream/paper theme. *Recommendation: Encase the video in a warm paper card frame (`#FDFBF7`) with rounded corners (20px) and warm teal/terracotta transport controls.*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F4 · P1 — Unhandled video embed failure leaves an unrecoverable black void.** (Evidence: §3 F6). When a YouTube or external video URL fails to load (very common in Mainland China due to network restrictions or CDN timeouts), ReactPlayer does not trigger an error recovery state. The child is stuck looking at a blank black rectangle with no fallback. *Recommendation: Implement an `onError` handler that automatically falls back to: (1) unit `audioUrl` if available with an illustrated music card, or (2) a illustrated lyric-reading slide with a friendly "Audio unavailable" notice, unlocking the Continue button so the child is never blocked.*
- **F5 · P2 — Missing "Song Complete" state leaves child stranded.** (Evidence: §1, `SoloLessonPlayer.tsx:522-565`). When media playback reaches the end, the player pauses on the final frame without any celebratory conclusion or visual cue directing the child to the footer Continue button. *Recommendation: On playback finish, display a warm end-card overlay ("Great listening! ⭐") and pulse the bottom Continue button to smoothly guide the child into the next lesson step.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F6 · P2 — Lack of independent volume control.** (Evidence: §3 F2, `SoloLessonPlayer.tsx:552-554`). The player only provides a binary mute/unmute toggle. Children listening on headphones often experience ear-splitting volume jumps when switching from quiet teacher speech to loud upbeat songs. *Recommendation: Add a simple 3-stage kid-friendly volume control (Low / Medium / High) alongside the mute toggle.*
- **F7 · P3 — Disjointed audio-only fallback experience.** (Evidence: §3 F4, `SoloLessonPlayer.tsx:530-532`). When a lesson step provides an audio file instead of a video, the screen displays a plain text label "Press play to start" inside an empty container. *Recommendation: Present a rich animated vinyl/gramophone illustration or textbook unit theme artwork during audio-only playback to maintain engagement.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F8 · P2 — Autoplay blocking on mobile devices creates tap ambiguity.** (Evidence: §1). Mobile Safari and Chrome restrict unmuted autoplay. If the video fails to autoplay on mount, the screen sits motionless without a clear pulsating play button, leading young kids to assume the app is frozen. *Recommendation: Render a large, pulsating 64px play button centered over the video whenever playback is paused or blocked by browser policy.*

### 4.e Top-5 prioritized recommendations
1. **[P1] Implement network error recovery fallback:** Add `onError` detection that gracefully switches to audio or lyric cards when external video embeds fail to load in China.
2. **[P2] Remove 50% scrim and restore 100% video opacity:** Let children see full-color visual phonics and mouth modeling without murky darkening overlays.
3. **[P2] Enlarge seek bar to 48px touch floor:** Provide a generous touch target and visible drag handle for kid-friendly song scrubbing.
4. **[P2] Add "Song Finished" end-state celebration:** Prompt the child clearly when the song ends and highlight the Continue button.
5. **[P3] Harmonize container design with Wonder Atlas tokens:** Frame the player with warm paper cards and clear transport buttons.

### 4.f Stitch design log (AG fills as it generates)
*(Phase 1 audit complete. Stitch designs will be generated in Phase 2 for the light-themed media player frame and video error fallback card.)*

## §5 ZCode design verification (inside Stitch)

<ZCode fills after AG reports designs done: list_screens result, title verification against §4.f, export paths (`stitch/<NN>-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

<Owner's verdict per screen: approved / revise (what to change). No implementation starts before an explicit go on THIS game's designs.>

## §7 Implementation notes & design-fidelity log

<AG implements (after §6 go); ZCode records: the diff scope, scoring-writes-verbatim check, gauntlet results (tsc / vitest / build), before→after screenshots, commit hash, deploy + verification, and a **design-fidelity log per Stitch screen: Followed / Adapted + why / Deviated + why**. Deviations are owner-reviewable decisions — never silent.>
