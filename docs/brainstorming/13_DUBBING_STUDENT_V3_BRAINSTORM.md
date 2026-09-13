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
