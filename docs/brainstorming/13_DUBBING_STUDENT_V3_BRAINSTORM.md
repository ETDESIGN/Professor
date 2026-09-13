# Dubbing — student-app-v3 brainstorm (2026-09-13)

Owner ask: "finish to implement the dubbing game, but brainstorm it a bit — check what we got already, what the functionality and interaction will look like." This doc is the recon + proposal. Nothing is designed or built until the owner answers §4.

## 1. What we already have (recon 2026-09-13 — everything verified in code)

The module is **~90% built end-to-end and deployed** — it is NOT a mock anymore; it is flag-gated OFF (`VITE_ENABLE_DUBBING`, checked in 4 files).

**Student side** (`apps/student/DubbingStudio.tsx`, 680 ln):
- **Pick**: clip list scoped to the child's class enrollments (`DubbingService.listMyClips`), "New" badges on un-dubbed clips, empty state.
- **Watch**: signed video URL, active-line subtitle tracking via `onTimeUpdate` + line windows, then "Start dubbing".
- **Record pass** (`dubbing/useDubRecorder.ts`, tested window engine): the video plays MUTED while the mic records; each line has a 1.5s countdown lead → capture window (validated non-overlapping, clamped to duration); live waveform (AnalyserNode); transcript captured client-side per line; per-line INSTANT scoring via the `evaluate-dubbing` edge; per-line REDO buttons; "Pass complete" review.
- **Result**: `DubPlayer` plays the video with the child's line-audio mixed over it; per-line bands (great/almost/try again + word-match % + feedback); Save (private) / Share with class; Try again.
- **Economy (already exactly-once, reviewed)**: 10 XP on private save, +5 top-up on publish (=15 published); DUBBING_TAKE quest; one dubbing row per take (re-publish reuses the row); score-pending path when AI is down.

**Class gallery** (`ClassDubs.tsx`): classmates' published dubs per clip, hearts/likes with optimistic toggle.

**Teacher side**: `apps/teacher/DubbingClips.tsx` (clip manager), `ClipScriptEditor.tsx` (line timing editor), `DubbingReview.tsx` (listen to takes) — same flag.

**Backend (live)**: 6 migrations applied (clips/lines/takes tables + RLS + parent read + Sunday-03:00 retention cron + classmate names); `evaluate-dubbing` edge deployed 2026-08-28 (LLM-as-judge: bag-of-words F1 vs the line text + lenient bands, STT optional, transcript fallback); storage bucket with line-audio upload; e2e suite (`e2e/dubbing.spec.ts`, skips unless flagged).

**Known defects/debt** (from our audits):
- Theme is slate-900 dark — off the new Wonder Atlas × Duolingo light language.
- Studio exit path awards hardcoded fake stats (`StudentApp.tsx:226` — `{xp:5, accuracy:95}`) — must go.
- No sounds; score-pending UX is text-only; no Chinese support chips.
- Where real clips come from TODAY is a teacher upload workflow (DubbingClips) — clip *supply* is the operational bottleneck, not code.
- AGENTS.md still calls it "a mock (audit P1-5)" — stale; the code is real.

## 2. What finishing it means (proposed scope)

**A. v3 reskin + polish (mechanical, no product change)** — port the 4 phases to the light token system, big mic FAB + volume visualizer (match Speak Sentence v3), per-line result pills, sounds (playCue reveal/correct/wrong + a "recording" tick), honest exit (kills the fake stats), Chinese support chips, tap targets ≥48px. ~1 implementation run.

**B. Interaction upgrades (proposals — owner picks)**:
1. **Karaoke-style record UI**: instead of only bottom-panel text, show the CURRENT line big with a shrinking window bar (like Spelling Bee's clock) so kids feel the timing; next line preview dimmed below.
2. **Practice mode before the real take**: rehearse a line with the original audio, then record — lowers the scare factor for shy kids.
3. **Duet mode**: play the character's original voice for OTHER lines and only the kid's lines are silent — closer to "acting" than full overwrite.
4. **Star/band celebration**: 3-star result card (match app's star language) + share gate ("Great" band unlocks Share, others can still share but marked "practiced").
5. **Gallery hearts → kind reactions only** (owner preference?) — hearts vs stars vs emoji reactions for classmates.

**C. Product decisions needed (§4 questions)**.

## 3. Proposed v3 flow (for discussion)

Pick (clip cards w/ New badges + progress "2/5 dubbed") → Watch once (subtitles) → optional Practice → Record pass (countdown + karaoke line + waveform + instant per-line band chip) → Result (DubPlayer playback + 3-star card + per-line pills + redo any line) → Save/Share → Gallery. Teacher assigns clips from scanned story scenes or uploads; review stays in DubbingReview.

## 4. Questions for the owner (the brainstorm gate)

1. **Enable when?** Flip `VITE_ENABLE_DUBBING=true` in Vercel after reskin, or run it dark for a test class first (flag is all-or-nothing across teacher/student/parent)?
2. **Which interaction upgrades** from §2.B (1-5) go in v1 of the relaunch?
3. **Scoring honesty**: current bands are lenient LLM-judged F1 — good enough for kids, or tighten/loosen?
4. **Sharing rules**: anyone can publish? Only "great" takes? Teacher moderation before classmates see (DubbingReview exists)?
5. **Reactions in the gallery**: keep hearts, or switch to stars/emoji?
6. **Clip supply**: is the teacher upload flow the intended source, or should students eventually dub STORY scenes auto-generated from their units (auto-clip creation from story pages + TTS timing)?
7. **Rewards**: keep 10/15 XP + quest, or tie a gem to a "great" published dub?

Once answered: AG designs the screens (approval gate like tabs), then one implementation run + gauntlet + deploy.


---

## 5. OWNER DECISIONS (2026-09-13) — all 7 recommendations ADOPTED

> "your suggestions are good, i follow, but for not going too fast i want you and Anti-Gravity to brainstorm the dubbing functionality and create the stitch screen first, or the already existing UI if there is one."

Locked: (1) reskin → flip flag for everyone; (2) v1 upgrades = **karaoke timing bar + star-banded results** (practice mode v2, duet later); (3) keep lenient bands; (4) anyone publishes, teacher can unpublish; (5) gallery keeps hearts; (6) teacher uploads v1, auto-clips from story scenes v2; (7) 10/15 XP + quest stay, **+1 gem for a 'great'-band published dub**. PROCESS: ZCode spec (§6) → AG brainstorm/critique + Stitch screens → **owner approves designs BEFORE implementation**.

## 6. ZCode interaction spec v3 (designed FROM the existing UI — the flow is real, only the surface changes)

Existing phases kept 1:1 (pick → watch → record → result → gallery); each gets the light reskin + the two approved upgrades:

- **P1 Pick** (existing list upgraded): paper clip cards with thumbnail/title/lines-count, `New` chip, per-clip progress dots ("2/5 takes"), class-scoped. Empty state explains teacher assigns clips.
- **P2 Watch**: video with active-line subtitle band (existing), CTA "Start dubbing" beveled teal. No change structurally.
- **P3 Record — KARAOKE UPGRADE**: muted video on top; below, the CURRENT LINE in large type with a **shrinking window bar** (the line's time window draining like Spelling Bee's clock), next line dimmed beneath; mic FAB + live waveform strip; per-line band chips appear the instant each line is captured (great=emerald/almost=amber/try=red); pass-done review list with per-line redo stays.
- **P4 Result — STAR-BAND UPGRADE**: DubPlayer (video + child's voice) as hero; 3-star card from the overall band (great=3★+gem badge, almost=2★, try=1★); per-line pills with word-match %; Try again / Share with class; "great + published = +1 gem" surfaced on the share button.
- **P5 Gallery**: classmate dubs per clip, heart reactions (kept), name chips, play inline.
- Sounds: playCue reveal on line capture, correct/wrong per band chip, win on result; TTS reads the line during countdown as a cue option (muted by default).
- **Economy guardrails (existing, kept)**: exactly-once XP refs, one row per take, score-pending path, retention untouched. New: single conditional gem on publish when band==='great' (pattern-A style latch).

---

## 7. Anti-Gravity brainstorm (2026-09-13)

### (a) Child-Experience Critique of the §6 Spec (Ages 6–12 Solo ESL)
1. **Flow Friction**:
   - *Watch → Record Transition*: In the existing UI, tapping "Start dubbing" moves to the record phase, which still requires an explicit tap on "Tap to record" (due to iOS/WebKit `getUserMedia` audio gesture requirements). If not handled transparently, children perceive this as a broken double-click. **Critique**: The Record screen must visually position the initial mic interaction as a clear, tactile "Ready? Tap Mic to Begin" stage rather than a generic replay button.
   - *Review Gate Fatigue*: After the pass finishes, presenting children with an overly dense, text-heavy table of line scores before they can hear their dub delays emotional payoff. The hero must always be listening to their completed creation in `DubPlayer`.
2. **Timing Pressure & Cognitive Load**:
   - A rapid shrinking progress bar can trigger panic or rushed pronunciation if styled aggressively (e.g. flashing red countdowns). For 6–12 ESL learners, rushed speech degrades intelligibility and F1 score.
   - **Critique**: The karaoke timing bar must drain smoothly in calming Duolingo sky blue (`#1CB0F6`), preceded by an Amber 1.5s countdown lead-in pill ("3... 2... 1... Speak!"). Visual rhythm must feel musical, not punitive.
3. **Shy-Kid Safety & Affective Filter**:
   - Speaking aloud into a phone in a second language is terrifying for shy kids. Harsh red "Try Again" indicators create emotional shutdown.
   - **Critique**: Scoring feedback must never use red error banners. Instead: Emerald (`#10B981`) for "Great! 🌟", Amber (`#F59E0B`) for "Almost there! 👍", and soft coral/rose (`#FB7185`) for "Keep practicing! 💪".
   - Per-line redo buttons (`RefreshCw`) must remain easily accessible in both the review phase and result star card so a child can fix a single misspoken word without re-doing the whole scene.
   - Sharing must remain voluntary: 10 XP is banked immediately upon private save, so shy kids are fully rewarded even if they never share to the class gallery.
4. **Failure Modes & Edge Cases**:
   - *Mic Permission Denied / Browser Incompatible*: Must present a comforting, illustrated recovery card with a direct button back to the unit path instead of an ominous error dialog.
   - *Silent / Whispered Takes*: When the child speaks too quietly and STT captures no words, display a helpful hint: "We couldn't hear your voice clearly — check your microphone and speak up!" with a one-tap redo.
   - *AI Evaluation Latency / Offline Edge*: When `evaluate-dubbing` times out, gracefully award the private take XP and show "Score pending — your teacher will listen!" while preserving full video/audio playback in `DubPlayer`.

### (b) Interaction Refinements (Within Approved Owner Scope)
- **Rhythmic Karaoke Record Stage**:
  - Top: Muted story video playing smoothly in 16:9 frame.
  - Middle: Prominent current subtitle line in 22px Fredoka font. Above it, a rhythmic 1.5s countdown cue ("Get ready... 3, 2, 1"). Below it, a smooth horizontal draining window bar (`endMs - startMs`) in Duolingo sky blue `#1CB0F6`.
  - Next Line Preview: Positioned below at 40% opacity in muted slate so children can anticipate the next phrase without distraction.
  - Floating Mic HUD: Tactile circular Mic FAB with animated acoustic soundwave ring + live green canvas waveform strip.
- **Star-Band Celebration Result Card**:
  - Hero `DubPlayer` with synchronized playback of the child's recorded lines over muted video.
  - 3-Star Badge: 3 golden stars for `great`, 2 stars for `almost`, 1 star for `try_again`.
  - Gem Latch: For `great` band takes, a sparkling cyan Gem chip (`+1 Gem Bonus! 💎`) highlights the "Share with Class" button.
  - Per-line breakdown pills showing word-match percentage and instant line replay/redo.
- **Warm & Safe Class Gallery**:
  - Filterable by assigned clip tabs.
  - Privacy-preserving student cards: First names only (`firstName(studentName)`), take timestamp, and optimistic heart reaction counter with bouncing pink heart toggle.
  - Inline DubPlayer modal for listening to classmates' voice acting.
- **Empathetic Empty / Unsupported State**:
  - When no clips are assigned: Warm paper card explaining that the teacher will assign story scenes soon, with a reassuring CTA to explore the Study Map.
  - When mic access is blocked: Clear visual permission guide with retry button.

### (c) Final Screen List to Design (Stitch Project 6865954475041880496)
1. **Screen 1 — Pick**: Clip selection library with thumbnail cards, line counts, duration, "New" status chips, progress indicators ("2/5 Takes Dubbed"), and Class Gallery link.
2. **Screen 2 — Watch**: Receptive listening phase with synchronized subtitle band tracking active character lines, video controls, and beveled teal "Start Dubbing 🎙️" CTA.
3. **Screen 3 — Record KARAOKE**: Active recording pass with muted video, large active line, 1.5s countdown lead, smooth draining time-window bar, dimmed next-line preview, pulsing Mic FAB, live waveform strip, and instant line band chips.
4. **Screen 4 — Result STAR CARD**: Hero `DubPlayer` with synchronized child audio playback, 3-Star achievement card, +1 Gem celebration chip, per-line accuracy pills, and Share/Try-Again actions.
5. **Screen 5 — Class Gallery**: Community showcase featuring classmate dubs per clip, privacy-safe first name chips, optimistic heart likes with counter, and instant inline playback.
6. **Screen 6 — Empty / Unsupported State**: Friendly empty state when no clips are assigned by the teacher, and supportive mic permission guidance with return action.

