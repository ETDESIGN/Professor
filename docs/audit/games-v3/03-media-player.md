# Media Player (song/video) — v3 Quality Audit (`MEDIA_PLAYER`)

> **Status:** **cowork-done** — §0–§4 complete (Anti-Gravity quality audit). Ready for ZCode §5 Stitch prompt.
> **Screenshots:** `screenshots/03-media-player-idle.png` — captured in the UNRESOLVED state — the exact §2 symptom ("title shows, no media content available").

## SHARED PRELUDE (read first — identical in every game file)

**Product.** "Professor" — a teacher-facing ESL/EFL tool for **live, in-classroom** English instruction to children aged **6–12** (primary market: China; L1 is Simplified Chinese, used for translations and meaning options).

**Classroom model (hard constraint — never propose student-device interaction).** A live class runs on three browser tabs converging via Supabase Realtime; students have **no devices**:

| Tab | Route | Who | Role |
|---|---|---|---|
| **Commander** | `/teacher/live` | Teacher, desktop | Control room: lesson roadmap, roster chips, the per-game buttons, sidebar (wheel/teams/analytics) |
| **Remote Baton** | `/remote` | Teacher, phone | Handheld remote: spin/pick, correct–wrong, next student |
| **Board** | `/board` | **Projected 16:9** — the only screen kids see | Renders the current game/slide |

The teacher performs **all input**. Kids answer orally, point, or come to the front.

**Live loop.** Pick a student (wheel) → play a turn → score → next. `quickWheelWinner = null` means choral/practice mode (no individual scoring).

**Unified scoring model.** `scoreForAttempt(mistakes, difficulty)`: difficulty 1/2/3 (receptive / constrained / free-production) → 1–3 base points; −1 live per mistake; streak bonus (+1 at streak 3, +2 at streak 5); cap 5, floor 1 on success. Every scored event triple-writes: `addPoints` (leaderboard) + `recordAttempt` (analytics) + `gradeObjective` (FSRS memory model).

**Lifecycle contract — the 4 must-dos every scored game obeys:**
1. Full reset on `currentTurnId` change (new picked student ⇒ fresh board).
2. `mistakesRef` + `awardedRef` latches (no double-payment, no cross-turn leakage).
3. Score via `addPoints` + `scoreForAttempt` on the picked student.
4. Personalized message with the picked student's name.

**Turn dealing.** Deterministic per `(session, unit, shell, round, turnToken, resetCount)` — a new pick or reset re-deals; class-wide coverage tracked by a ledger so every objective gets its turn.

**Phases.** WARMUP / INPUT / OUTPUT / PRACTICE / ASSESS / WRAPUP — each game belongs to one phase envelope (allowed difficulty rungs + scoring posture).

**Design constraints for any redesign (applies to the Stitch prompt):**
- Board surface only, **16:9 projector**, viewed from 5–8 meters — large type, high contrast, punchy states.
- Kid-friendly but not infantile (ages 6–12 band).
- Must always be legible: the current challenge, the feedback state (correct/wrong/partial), the picked student's identity, and the score moment.
- Teacher-driven: every interaction must have a remote-control path; nothing can require a student device.

---

## §0 Identity

- **Flow type:** `MEDIA_PLAYER` (the controls switch also routes `LIVE_WARMUP` here, but that is a separate component — `BoardLiveClassWarmup`)
- **Component:** `apps/board/templates/BoardMediaPlayer.tsx` (294 lines)
- **Phase:** WARMUP (`PHASE_FOR_TYPE`, `orchestrate-lesson/index.ts:288`)
- **Remote-control group:** custom, minimal — Commander: **Play/Pause** only (`ContextualControls.tsx:81-87`); Remote Baton: **Play/Pause + Restart**, plus a compact quick-resolve panel (Find video / paste YouTube link) that auto-shows while the step has nothing playable (`TeacherRemote.tsx:249-269`). The commander shows the same quick-resolve panel below the contextual controls (`LiveCommander.tsx:390-394`).
- **Data sources:** frozen flow-block data only — `videoUrl` / `audioUrl` / `lyrics` / `title` / `search_query` / `candidates` — written by `orchestrate-lesson` at flow-generation time and patched at runtime by the media-resolution ladder (`generate-media` actions `resolve-media` / `apply-media` → `supabase/functions/_shared/mediaResolver.ts`, catalog → book → AI → teacher). No pool items, no manifest reads, no scoring.
- **Mode:** passive player (full-bleed type — no leaderboard rail; broadcasts `SLIDE_COMPLETE` when media ends naturally)

## §1 How the game works today

This is the warm-up slide at the top of every generated lesson: a song/video screen the class watches (and sings along with) before the input phase. The board renders a full-bleed black stage with a permanent top bar — a yellow speaker icon, the label "Warm Up Song", and the block's title (`data.title`, e.g. "Working in the Jungle") — plus a percentage chip while something is playable. There is no student interaction, no scoring, and no turn; the teacher drives playback from the remote.

**Three content states, decided by the frozen block data** (`BoardMediaPlayer.tsx:61-73`). If the block carries a `videoUrl`, a `react-player` YouTube embed fills the screen — deliberately zoomed to 150%, dimmed with a 40% black overlay at 0.8 opacity, with YouTube's own controls disabled. If it only carries an `audioUrl`, a hidden player runs over a purple/indigo gradient with a giant ghosted volume glyph. If it carries `lyrics` (book-scanned songs carry verbatim lyrics with timestamps), the center of the screen becomes a karaoke display: the current line at 8xl with a yellow fill that wipes across it in sync with playback time, and the next line below at half opacity. When the media ends, the component broadcasts `SLIDE_COMPLETE` so the lesson advances on its own (the teacher's manual End remains as override).

**The unresolved state is an "honest suggestion card", not a fake player** (design 2026-09-04 §4.5). With no video/audio but a `search_query` or `youtubeUrl` present, the center shows a "Recommended Song" badge, the title, its topic relevance, up to three **candidate chips** (thumbnail + title + channel, "Tap to use this video"), and an "Open YouTube search" link. Tapping a chip calls `applyMediaToStep` → the `apply-media` edge action, which oEmbed-validates the video server-side, patches the unit's flow, syncs the matching class-plan flow, records a reusable asset, and broadcasts `MEDIA_RESOLVED` — every tab (board, commander, remote) refreshes into the playable state. When even a search query is missing, the board falls through to the dead branch: a ghosted volume glyph and "No media content available for this step".

**Behind the board sits the resolution ladder** (shipped 2026-09-05). When a lesson flow is generated, `orchestrate-lesson` always stamps the warm-up block with at least a `search_query` (song suggestion title, or a "〈topic〉 kids song" fallback since 2026-09-07) and then tries to resolve a real video pre-save: catalog rung (189 oEmbed-verified kids' songs scored by topic/title/age-band, auto-applies on a strong match), book-songs rung, then a single region-safe AI call whose video IDs are oEmbed-validated and title-gated before being offered as candidate chips. Unresolved blocks stay as suggestion cards; the teacher can trigger the same ladder live from the commander or remote ("Find video"), or paste a YouTube link, or click a chip on the board itself. Resolution failures are non-fatal by design — the block keeps its suggestion-card shape.

**Playback controls live in a hover-reveal chrome** at the bottom (only rendered when something is playable): a clickable seek bar with a progress fill, back/play-pause/forward buttons (±10% skips), mute, and a fullscreen toggle. Because the chrome only appears on mouse hover (`group-hover`), in a projected classroom the real control surface is the remote's Play/Pause and Restart; the board chrome is a fallback for the teacher at the desk.

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> Second comment, about the media player. I'm on the lesson "Animals in the Wild". It seems on the media player I can see the title "Working in the Jungle", but it's still writing "no media content available for this step". So it seems it still doesn't work — need to check why the media player still doesn't work properly.

**Clarified with the owner (2026-09-09):**
- **Note-only, no fix this cycle** (owner decision 2026-09-09) — record the symptom; the resolution ladder (catalog → book → AI → teacher) failed or was never run for this unit's warm-up block.

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardMediaPlayer.tsx` unless noted.

- **F1 · P2 — The owner's dead screen is the no-search-query fall-through, reachable only by pre-ladder plan data.** The dead branch renders when `!hasVideo && !hasAudio && !hasLyrics && !youtubeUrl` (`:61-64`, `:70-73`, `:226-230`) — where `youtubeUrl` requires `data.youtubeUrl` or `data.search_query` (`:70-72`). The title still shows because the top bar renders `data.title` unconditionally (`:152`) — exactly the owner's "title visible + no media content available" screenshot. The current `orchestrate-lesson` **always** stamps `search_query` on the warm-up block (suggestion branch `orchestrate-lesson/index.ts:69-75`, topic fallback `:91-99`), so a freshly generated flow can never reach the dead branch — it shows the suggestion card at minimum. The observed block was frozen into a **class plan / unit flow before the 2026-09-05 media design** (or before the 2026-09-07 fallback): the board plays the class plan's frozen flow (`SessionContext.tsx:1501-1509` prefers `activeClassPlan.flow`), and old plans are never re-transformed. Healing requires "Find video" from the commander/remote panel or regenerating the lesson flow — and `resolve-media`'s class-plan sync only matches blocks by `search_query`/`title` (`mediaResolver.ts:460-465`), so legacy bare-title blocks are only healed in the single-block case. The board's dead branch itself offers zero affordance — no chips, no link (`:226-230`); only the commander/remote carry the resolve panel.
- **F2 · P2 — Lyrics count as "content", producing a fake transport with nothing playable.** `hasContent = hasVideo || hasAudio || hasLyrics` (`:64`) gates the bottom chrome (`:237`), but a **lyrics-only** block (book song whose video never resolved — a first-class state, since `orchestrate-lesson:81` stamps `lyrics` before any resolution) mounts no player: Play/Pause toggles a state nothing consumes, progress sits at 0%, the karaoke highlight never moves, and the remote's Play/Pause is equally dead. This is precisely the "fake player UX" the code comment at `:66-69` says was designed out — the gate should be `hasVideo || hasAudio`, with lyrics-only treated as an unresolved suggestion state.
- **F3 · P2 — No load-failure surface: a dead or blocked video URL shows the fake player forever.** The `ReactPlayer` has no `onError` handler (`:93-115`); if the YouTube video was deleted, is region-blocked, or the classroom network can't reach YouTube (relevant for the China primary market), the board shows the title bar, an empty black stage, and a 0% progress bar with live-looking controls. The teacher has no signal to re-resolve other than nothing happening. The resolver validates at write time (`apply-media` oEmbed-validates, `generate-media/index.ts:347-350`) but a video can die after applying, and playback failure is never surfaced.
- **F4 · P3 — The commander's contextual set is Play/Pause even when nothing is playable** (`ContextualControls.tsx:81-87`) — a dead button with no feedback, while the actual affordances (Find video / paste) sit in the conditional `MediaResolvePanel` one section below (`LiveCommander.tsx:390-394`) and on the remote (`TeacherRemote.tsx:253-259`). A first-time teacher pressing the big pink Play/Pause on an unresolved step gets silence in every sense.
- **F5 · P3 — `RESTART` is remote-only and dead without a mounted player** (`:26-29` calls `playerRef.current?.seekTo(0)` on a null ref; commander has no restart). Same for `PLAY_PAUSE` in the unresolved state — the state flips but nothing consumes it.
- **F6 · P3 — The video layer is zoomed 150% + 40% overlay + 0.8 opacity** (`:98-100`, `:92`) — a deliberate karaoke-first aesthetic that crops roughly a third of the frame and dims the rest. For action songs (the core warm-up genre — "Walking in the Jungle" is a copy-the-actions song), kids can't see the actions being cropped/dimmed. There is no undimmed mode; a redesign should make the video the hero and the lyrics the accessory.
- **F7 · P3 — Candidate-chip apply can patch the wrong block.** `applyCandidate` passes `blockSearchQuery: data.search_query` (`:81`); when that is missing (legacy block) or two warm-up blocks share a query, `apply-media` falls back to `targets[0]` — the first unresolved block in the unit flow (`generate-media/index.ts:360-363`) — which may not be the step on screen. Edge case (units rarely have two warm-up blocks), but silent when it hits.

**What already works well (context — don't re-litigate):** the honest-unresolved design (suggestion card + candidate chips instead of the old fake player), one-click apply with server-side oEmbed validation persisting both flow stores and converging all tabs via `MEDIA_RESOLVED`, natural-end `SLIDE_COMPLETE` (media is the one slide type with a real "finished" event), the catalog-first ladder with hallucination gates, resolve affordances on both commander and remote, and the always-present topic fallback so new units always have a warm-up step.

## §4 ⬜ ChatGPT Co-Work quality audit

> **Co-Work: write your findings ONLY inside this section.** (Full instructions + shared prelude embedded at `file-ready`.)

### 4.a UI & visual design

- **P1 — Header collision with BoardShell `• WARM-UP` phase badge.** **Evidence:** `screenshots/03-media-player-idle.png`. The top info bar (`BoardMediaPlayer.tsx:145-154`) places the yellow speaker icon and the label "WARM UP SONG" at the top-left (`p-8 flex justify-between items-start`). The BoardShell's absolute-positioned `• WARM-UP` badge (`BoardShell.tsx:117-120`, positioned at `top-5 left-6`) collides directly with "WARM UP SONG", producing overlapping amber/yellow text. **Recommendation:** Apply a standard 180 px left-margin clearance for the top-bar title or integrate the phase pill into the media player's top navigation bar so headers never collide.

- **P2 — Video cropped and dimmed (150% scale + 40% dark overlay + 0.8 opacity) damages action-song visibility.** **Evidence:** `BoardMediaPlayer.tsx:98-100` scales the `ReactPlayer` to `width: 150%, height: 150%` with offsets `top: -25%, left: -25%`, under an `absolute inset-0 bg-black/40` overlay and `opacity: 0.8`. For vocabulary and phonics action songs (such as "Walking in the Jungle" or "Head, Shoulders, Knees and Toes"), up to a third of the video frame is cropped out at the edges, and characters/choreography are heavily darkened. Children sitting 5–8 meters away in a standard classroom cannot see or mimic the physical actions. **Recommendation:** Switch to a fit-contain letterbox/pillarbox (100% width/height, 1.0 opacity, no global dimming overlay). Reserve dark scrims strictly for a subtle gradient bar behind lyrics at the bottom of the screen.

- **P2 — Dead-end display on unresolved steps leaves a broken classroom impression.** **Evidence:** `screenshots/03-media-player-idle.png` and `BoardMediaPlayer.tsx:227-230`. When a legacy block lacks both media URLs and a search query, the center of the board displays an empty 80 px ghosted speaker glyph with the italic text *"No media content available for this step"*. For 30 energetic children entering the room, an empty black screen reading "No content" feels like a technical failure. Even when `hasSuggestion` is true (`:183-225`), the board renders an "Open YouTube search" web link (`:217-223`) that targets `_blank`—completely inoperable from a projected board. **Recommendation:** Replace the dead-end placeholder with an engaging, illustrated "Sing & Warm Up" standby card that shows the song title and a cheerful musical mascot, while providing a clear "Tap to load song" action on the Commander and Remote.

- **P2 — Lyrics overflow and line-wrapping at 5–8m projection distance.** **Evidence:** `BoardMediaPlayer.tsx:168, 173`. Lyrics use `text-8xl` with `whitespace-nowrap`. On typical 720p/1080p projectors, longer lyric lines (more than 5–6 words) clip off-screen horizontally. **Recommendation:** Use responsive, dynamic font sizing (`clamp(2.5rem, 5vw, 4.5rem)`), allow clean two-line wrapping, and ensure high-contrast text outlines (`drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)]`).

- **P3 — Hover-only transport controls are invisible in touch/remote environments.** **Evidence:** `BoardMediaPlayer.tsx:88, 237`. The bottom transport bar is styled with `group-hover:opacity-100 opacity-0`. In classrooms using touch panels or phone remotes without a mouse cursor hovering over the canvas, the transport bar remains invisible. **Recommendation:** Provide a persistent, unobtrusive mini-scrubber at the bottom edge, expanding to full controls on any board touch or remote interaction.

### 4.b Workflow & user flow (teacher's path: start → turns → end)

- **P1 — Fake transport mounts when only lyrics are present (unplayable media trap).** **Evidence:** §3 F2 and `BoardMediaPlayer.tsx:64`. `hasContent` is defined as `hasVideo || hasAudio || hasLyrics`. When a unit song has transcribed lyrics but the video/audio failed to resolve (a common state for book-scanned units), `hasContent` evaluates to `true`, mounting the bottom transport bar (`:237`). Pressing Play/Pause toggles an internal `isPlaying` flag that controls nothing because no player is rendered (`:90-142`). The timer remains stuck at 0:00, the karaoke highlight never advances, and the remote's Play button is completely dead. **Recommendation:** Define playable content strictly as `hasPlayableMedia = Boolean(data.videoUrl || data.audioUrl)`. If only lyrics exist without audio/video, treat the step as unresolved: display a "Chant / Read Along" rhythm card and keep the suggestion/resolve panel active.

- **P1 — Missing playback error handling (blank black screen on network/YouTube block).** **Evidence:** §3 F3 and `BoardMediaPlayer.tsx:93-115`. `ReactPlayer` defines no `onError` callback. In the primary China market, YouTube embeds frequently fail due to school network firewall restrictions, deleted videos, or regional blocks. When YouTube fails to load, `ReactPlayer` remains on an empty black rectangle with 0% progress and live-looking play controls. The teacher has no indication of what failed or how to recover. **Recommendation:** Implement an explicit `onError` handler on `ReactPlayer`. Upon failure, automatically: (1) attempt playback of a fallback audio URL if available, (2) display an honest "Video blocked or unavailable" badge, and (3) surface candidate chips or an instant "Switch to Audio / Skip to Warmup" button.

- **P2 — Commander displays an active Play/Pause button for unresolved steps.** **Evidence:** §3 F4 and `ContextualControls.tsx:81-87`. On an unresolved media step, the Commander renders a prominent primary "Play / Pause" button. Clicking it does nothing because no player exists, while the actual resolution tool ("Find video") is pushed into a secondary panel below (`LiveCommander.tsx:390`). **Recommendation:** In `ContextualControls.tsx`, check if media is playable. If unresolved, replace the Play button with a high-visibility primary button: `🔍 Find Video / 匹配视频`.

- **P2 — Natural-end `SLIDE_COMPLETE` auto-advances abruptly without a wrap-up beat.** **Evidence:** `BoardMediaPlayer.tsx:103-109, 128-134`. When media finishes, `onEnded` calls `triggerAction('SLIDE_COMPLETE', { forced: false })`, which immediately navigates to the next slide (Focus Cards). In a live classroom, the song ends while children are still singing or finishing movements; an instant slide jump disorients the class. **Recommendation:** At `onEnded`, pause on a 4-second celebratory "Song Complete! 🎵" beat with a countdown timer and a teacher "Next: Today's Words →" button.

- **P3 — Remote `RESTART` action fails silently without a mounted player.** **Evidence:** §3 F5 and `BoardMediaPlayer.tsx:26-29`. The remote offers a `RESTART` button (`TeacherRemote.tsx:252`), but `playerRef.current?.seekTo(0)` throws or silently fails if the player is unmounted. **Recommendation:** Guard `seekTo(0)` with a fallback that re-triggers media playback cleanly.

### 4.c Pedagogical practice (ESL ages 6–12)

- **P1 — Total Physical Response (TPR) action songs require clear visual modeling.** **Evidence:** §1 and §3 F6. Warm-up songs for ages 6–12 (especially young learners 6–8) rely on mimicry and movement (action verbs, animal motions, greetings). Obscuring the video behind 40% black scrims and cropping limbs at 150% zoom destroys the visual modeling required for TPR. **Recommendation:** For warm-up video content, prioritize video clarity over karaoke styling. Deliver uncropped, full-color playback so young learners can mirror hand gestures, dance moves, and mouth shapes.

- **P2 — Missing choral participation prompts.** **Evidence:** `03-media-player-idle.png` shows the BoardShell footer displaying "CHORAL / Whole class — choral round". However, the board itself provides no energetic invitation to sing or move. **Recommendation:** Display an animated prompt banner at song start: "Sing along! 🎤 一起唱！" or "Do the actions! 💃 一起动起来！", fading out after 6 seconds so kids understand that this is an active physical warm-up, not passive screen time.

- **P2 — Karaoke highlighting must support early EFL decoders.** **Evidence:** `BoardMediaPlayer.tsx:59, 174`. The linear `lyricProgress` calculation assumes uniform character duration, which causes highlighting to drift out of sync with actual vocal rhythms. **Recommendation:** For book-scanned and synchronized lyrics, use word-level timestamp highlights rather than continuous percentage sweeps, providing clear rhythmic anchors for early English readers.

### 4.d Game interaction (mechanic, pacing, fairness, fun)

- **P2 — Song duration and warm-up pacing.** **Evidence:** Videos from external searches can range from 45-second nursery rhymes to 8-minute compilation videos. In a 40-minute classroom lesson, a warm-up exceeding 2.5 minutes burns excessive instructional time. **Recommendation:** In the media resolution ladder and candidate cards, flag recommended durations (ideal: 90–150 seconds). Show an elapsed/total time pill on the board (e.g. `1:15 / 2:04`).

- **P2 — Single-tap audio mute for teacher classroom management.** **Evidence:** Teachers frequently need to pause music to deliver an instruction, or mute sound while letting the video dance run in the background. **Recommendation:** Ensure the Remote Baton has both instant `Mute/Unmute` and `Pause` buttons with haptic confirmation.

### 4.e Top-5 prioritized recommendations

1. **P1 — Decouple lyrics from playable content gate (eliminate fake transport):** Gate playable state strictly on `hasVideo || hasAudio`. If a unit only has lyrics, treat it as an unresolved state and prompt the teacher to find audio/video.
2. **P1 — Add YouTube network error recovery and graceful audio fallback:** Catch `onError` in `ReactPlayer` to prevent frozen black screens in restricted school networks. Fall back automatically to cached audio or candidate options.
3. **P2 — Remove video zoom and dimming overlay (TPR action clarity):** Render video at 100% letterbox/pillarbox with full opacity so young learners can clearly see and imitate physical choreography.
4. **P2 — Clear top-left chrome collisions with BoardShell:** Shift the "Warm Up Song" title block rightward to guarantee safe clearance from the `• WARM-UP` phase badge.
5. **P2 — Add an intentional wrap-up beat at media end:** Replace abrupt instant slide advance with a 4-second "Great singing! 🎵" celebration screen featuring a manual "Next Step →" button.

### 4.f Design direction for Stitch (style/mood guidance + the 3–5 key screens/states to design; what to KEEP from the current design)

**Mood and visual system.** Design this as a vibrant, high-energy "Classroom Cinema & Sing-Along Stage". Deep theater-navy stage (`#050811`), vivid neon accents (warm amber `#F59E0B` for song badges, sky blue `#38BDF8` for duration and audio, emerald `#10B981` for completion, hot pink `#EC4899` for primary actions). Typography must be bold, friendly, and readable from 8 meters. When video plays, the video is the hero; when audio plays, energetic graphic sound waves and floating lyrics take center stage.

**Mock up these four board screens/states:**

1. **Screen 1 — Video Playback with Floating Karaoke Bar:** Full 16:9 uncropped video canvas (100% fit). Top bar cleanly offset to the right of the `• WARM-UP` phase badge: "Warm Up Song · Working in the Jungle" with a slim duration pill (`1:12 / 2:05`). Bottom: a sleek translucent dark pill hosting two lines of lyrics with a bouncy yellow highlight sweep across the singing line.
2. **Screen 2 — Audio-Only Sing-Along Stage:** For audio-only songs: centered rotating vinyl record or pulsing graphic sound-wave visualizer with the song title. Large, centered two-line lyrics card with bold yellow singing line and muted upcoming line. Floating musical notes and a "Sing together! 🗣️" badge.
3. **Screen 3 — Unresolved Song Standby (Candidate Picker):** When video is not yet attached: an attractive standby card titled "Warm-Up Song: Animals in the Jungle" with an energetic musical mascot illustration. Center: three clean candidate video cards with thumbnails, song titles, channel names, and a yellow "Tap to select on Commander" badge.
4. **Screen 4 — Song Complete / Warm-up Celebration:** 4-second hold state at song completion: dimmed video backdrop with confetti bursts, a cheerful badge: "Great Singing! Warm-up Complete! 🎶", and a prominent pulsing hot-pink button: "Start Focus Cards → (3s)".

**What to KEEP from current design.** Retain full-bleed layout (leaderboard rail retracted), verbatim synchronized lyrics highlighting, server-side oEmbed validation pipeline, and natural-end lesson progression.

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

## §6 ⬜ Stitch output & implementation notes

*(Owner drops the Stitch export into `stitch/<NN>-<game>/`; ZCode records implementation + deploy.)*
