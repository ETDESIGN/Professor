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
