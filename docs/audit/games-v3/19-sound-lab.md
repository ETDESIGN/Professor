# Sound Lab — v3 Quality Audit (`SOUND_LAB`)

> **Status:** **cowork-done** — §4 audited (Anti-Gravity). Ready for Stitch prompt §5.
> **Screenshots:** `screenshots/19-sound-lab-idle.png`.

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

- **Flow type:** `SOUND_LAB`
- **Component:** `apps/board/templates/BoardSoundLab.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** Skip Phase (`SKIP_PHASE`) / Correct (`MARK_CORRECT`) / Redo (`RESET_GAME`) / End (`SLIDE_COMPLETE`) — custom set, `ContextualControls.tsx:183-191` (no Hint, no audio control)
- **Data sources:** `useEscalatingPool` (shell `SOUND_LAB`, single round of up to 12 items) → phase 1 `LISTEN_SELECT` ×4, phase 2 `DICTATION` ×3 (sibling sentences as distractors), phase 3 `SPEAK_SENTENCE` ×3; audio is reference-based (`useSpeech` + round pre-warm), phase 3 uses browser speech recognition on the board tab
- **Mode:** picked student, per-item scored attempts (receptive → receptive → productive)

## §1 How the game works today

**A fixed 3-phase listening ladder, played item by item for the picked student.** The pool comes from `useEscalatingPool` (`:77-85`) and is bucketed by exercise type (`:88-147`):

- **Phase 1 "Listen & Tap" (recognition, ×4):** a big purple **Listen** button, then a **2×2 grid of square images** with their English word captions; the kid taps the image matching the spoken word (`:520-583`).
- **Phase 2 "Listen & Match" (discrimination, ×3):** Listen button, then 3 sentence options — the correct `DICTATION` sentence plus up to 2 sibling dictation sentences as real distractors, shuffled with a per-item seed (`:109-129`); the kid taps the sentence they heard.
- **Phase 3 "Hear & Say" (production, ×3):** the target word/sentence is displayed large with a "Listen first" button, then a **mic button on the board** — the picked kid speaks; `useSpeechRecognition` scores Levenshtein similarity against the target, ≥60% passes (`SPEECH_PASS_THRESHOLD`, `scoringUtils.ts:67`); pass → success with partial credit = similarity (clamped 0.6–1), transcript + score card holds ~2 s; fail → item failure (`:179-198`, `:642-712`).

**Audio flow today — strictly manual, metered.** Nothing plays when an item appears; every play requires tapping the board's Listen button (`playAudio :256-265`). A `replayCount` state increments on every play; from the **second play onward each play costs the picked student −1** via `addPoints(picked, -MISTAKE_PENALTY)` (`:260-263`) — in choral mode (no picked student) the count is tracked but nothing is charged. The counter resets on every item advance (`:396, :404, :415, :421`). A small gray hint under the button reads "Replay: N left (−1 pt each)" but only while exactly one replay has been used (`:469-472`). The round's speech is pre-warmed in the background so replays are instant (`:162-164`).

**Attempt flow.** Correct tap: `itemSuccess` — streak++ (confetti at 3/5), `scoreForAttempt` triple-write, 900 ms hold, advance (`:268-296`, `:354-369`). Wrong tap: −1 live, streak reset, red flash 800 ms; 2nd consecutive miss → reveal-on-wrong (amber ring on the correct option + `explanation` when present, ~2.2 s teaching hold) then advance (`:320-331`, `:366-367`). MARK_CORRECT scores a clean success and doubles in phase 3 as "accept that pronunciation" (`:346-352`). Phases 1→2→3 chain automatically; empty phases are skipped by an effect that can never cascade into a fake completion (`:170-176`); all three done → complete card + `SLIDE_COMPLETE` broadcast (`:336-342`).

**Remote controls:** Skip Phase (jump the whole current phase) / Correct / Redo (full reset) / End. There is **no per-item skip, no hint, and no Listen control** on the commander or remote — see F3.

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> I have the same comment about the UI as the previous detective game (vertical-style layout wasting space on a horizontal screen). / Another comment: this is the one where we need to click on "listen" and pick the right image. I think it would be nice if, when the image appears, we automatically listen to the sound one time. And if the kid wants to listen a second time, we can keep the listen button for that — but you lose one point if you use it for a second time, or even a third time, losing one point each time.

**Clarified with the owner (2026-09-09):**
- Same horizontal-space redesign as Word Detective.
- Audio AUTO-PLAYS once when the question appears (keep the manual listen button).
- Each replay after the free first play costs the CURRENT picked student −1 point (choral mode: track the count only).

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardSoundLab.tsx` unless noted.

- **F1 · P2 — No auto-play on item appear (§2's headline ask).** Nothing triggers `playCurrentSpeech()` when an item enters the board — the kid sits in silence until someone taps the board button (`:256-265` is the only play path). The hook point is an effect keyed on `currentItem` (the same key the `useSpeech` resolver and the skip-empty effect use, `:155-176`) that plays once and sets `replayCount` to 1, so the existing `replayCount >= 1` charge makes the first manual replay cost −1 with zero changes to the penalty code. Care points: suppress re-fire on resolve/feedback phases and on the remote's Redo, and respect browser autoplay policies (the board tab has user gesture history from the teacher's earlier taps — the same policy `playCue` already relies on).
- **F2 · P2 — The replay meter exists (already −1/replay) but its copy lies and its budget is fake.** `playAudio` (`:256-265`) already implements exactly §2's rule — first play free, each subsequent play −1 to the picked student, count-only in choral mode. But the hint "Replay: {2 − replayCount} left (−1 pt each)" renders only at `replayCount === 1` (`:469-472`): it implies a 2-replay budget that doesn't exist (replays are unlimited and silently keep costing after the hint disappears), and it never shows at replay 0 ("1 free listen, then −1") where it would actually inform the kid's choice. A redesign should surface the meter honestly on the button itself (e.g. free/−1 badges) and decide whether to cap or keep metering infinitely.
- **F3 · P2 — The teacher cannot play the audio from the commander or the phone.** The contextual set is Skip Phase / Correct / Redo / End only (`ContextualControls.tsx:183-191`) — for a *listening* game the single most-used action (replay the audio) exists only as a board tap. Same parity gap Focus Cards had before v3 added `PLAY_AUDIO`; a `PLAY_AUDIO` action routed into `playAudio()` (which already meters replays) gives the remote path §2's design constraints require.
- **F4 · P2 — Phase 1's 2×2 square grid wastes the 16:9 stage and leaks the answer into reading.** Same geometry as Word Detective F2: `grid grid-cols-2` + `aspect-square` images inside a `max-w-3xl` card (`:518`, `:543`, `:558`). Compounding it, every image carries its English word as a visible caption (`:565-567`) — a literate kid matches the *heard* word to the *written* label, converting the listening task into reading. For a listening phase the captions should be hidden (or revealed only after the attempt); the owner's horizontal redesign applies to the grid itself.
- **F5 · P2 — Phase 2 options collapse when DICTATION items are scarce.** Distractors are sibling `correct_text` sentences, `slice(0, 2)` (`:114-118`): with 2 dictation items the kid gets a 2-option MCQ; with 1, a single-option MCQ (tap the only sentence). There is no minimum-option guard and no synthetic fallback — the phase silently becomes free points.
- **F6 · P2 — Phase 3 has no failure exit on the board.** A failed speech attempt calls `itemFailure` (−1) but neither reveals nor advances (`:188-197`); the recognition hook keeps listening, so a kid who can't produce the sound bleeds −1 per attempt until the teacher intervenes via Correct/Skip Phase. Phases 1–2 reveal on the 2nd miss (`:366, :383`) — the same mercy rule was never wired for production. Browser-unsupported mics render a static "not supported" note whose only exit is also the remote (`:667-671`).
- **F7 · P3 — Phase-3 advance skips the per-item resets.** `advancePhase3` resets the attempt refs but not `replayCount`/`selectedOption` (`:425-435`) — the replay meter (and the F2 hint) carries stale state into the next production item.
- **F8 · P3 — Phase dots and labels are sub-projection and English-only.** The 3 phase pips are `w-3 h-3` (12 px — invisible at 5–8 m, `:488-497`); the phase captions ("Listen & Tap" / "Listen & Match" / "Hear & Say") are `text-sm` English (`:498-500`). The empty state is the same English-only teacher-jargon card as the other labs (`:451-462`).
- **F9 · P3 — Fixed `max-w-3xl` card, no responsive reflow** (`:518`) — no phone-landscape floor.

**What already works well (context — don't re-litigate):** the receptive→productive 3-phase ladder is pedagogically sound and correctly difficulty-tagged (productive fallback 3, `:279, :312`); the replay-cost mechanic the owner wants already exists and charges the picked student only; per-item resolve latches stop stale speech results and double remote taps; reveal-on-wrong teaching beats in phases 1–2; seeded sibling-sentence distractors; round speech pre-warm; empty-phase skipping that can't fake a completion; MARK_CORRECT doubling as pronunciation acceptance.

## §4 ChatGPT Co-Work quality audit

> **Co-Work: write your findings ONLY inside this section.** (Full instructions + shared prelude embedded at `file-ready`.)

### 4.a UI & visual design

- **P1 — Off-screen clipping of bottom image row in 2×2 vertical stack.** **Evidence:** `screenshots/19-sound-lab-idle.png`, §2 owner comments, and §3 F4 (`BoardSoundLab.tsx:518, 543, 558`). In Phase 1 ("Listen & Tap"), four square images are rendered in a 2×2 grid underneath stacked headers, duplicate subheadings, and a large purple "Listen" button within a constrained card. On standard 16:9 projection, the bottom container border slices directly through the first row of images; **the bottom two images (options 3 and 4) are completely cut off and invisible**. Students cannot see half the available choices.
  *Recommendation:* Redesign for 16:9 horizontal projection: arrange the 4 image choices in a single horizontal row across the stage (1×4 landscape card layout, ~4:3 aspect ratio per card) beneath an acoustic wave visualizer, or split the screen into an audio control panel on the left and a 2×2 grid on the right.

- **P1 — Duplicate phase subheadings.** **Evidence:** `screenshots/19-sound-lab-idle.png`. The subtitle "Phase 1: Listen & Tap" renders twice in immediate succession—once directly beneath the "Sound Lab" header card and again inside the challenge card above "Which image matches the word?". This redundancy clutters the vertical layout.
  *Recommendation:* Replace duplicate text with a single, elegant 3-step progress bar across the top of the board: `👂 1. Listen & Tap → 🎧 2. Listen & Match → 🗣️ 3. Hear & Say`.

- **P2 — Text captions convert listening challenge into a reading task.** **Evidence:** §3 F4 (`BoardSoundLab.tsx:565-567`). In Phase 1, each image displays its English vocabulary word as a visible caption below the photo. Literate children bypass auditory discrimination entirely by matching the spoken word to the printed caption.
  *Recommendation:* Suppress written captions during the active listening phase so children rely purely on acoustic recognition. Reveal the English word caption only after a selection is made as part of the feedback celebration.

- **P2 — Retract 240px leaderboard rail in Choral mode.** **Evidence:** `screenshots/19-sound-lab-idle.png`. The screenshot shows 8 students at 0 points occupying a 240px rail on the right during a whole-class choral round. Retracting this rail gives the 4 image cards the horizontal width needed for high-resolution projection.

### 4.b Workflow & user flow (teacher's path: start → turns → end)

- **P1 — Missing auto-play on question appearance (§2 Owner Headline Ask).** **Evidence:** §2 owner comments and §3 F1 (`BoardSoundLab.tsx:155-176, 256-265`). Currently, when a new item appears, the board is silent. The class must wait for the teacher to physically walk to the screen and tap the "Listen" button.
  *Recommendation:* Trigger `playCurrentSpeech()` automatically once whenever an item mounts on the board (first play free). The teacher and student hear the sound immediately without manual intervention.

- **P1 — Transparent replay metering with −1 penalty (§2 Owner Rule).** **Evidence:** §2 owner comments and §3 F2 (`BoardSoundLab.tsx:469-472`). The engine already implements −1 per replay for the picked student after the first play, but the current UI hides this: a tiny note only appears on the second play and misleadingly claims "Replay: 1 left".
  *Recommendation:* Clearly communicate audio metering on the Listen button itself:
  - On Mount (Auto-Played): Display *"Playing audio... 🔊 (Free)"*.
  - After Auto-Play: Display *"Replay Audio 🔊 (−1 pt)"* for picked students, or *"Replay Audio 🔊"* in choral mode.

- **P1 — Missing remote audio control for teacher.** **Evidence:** §3 F3 (`ContextualControls.tsx:183-191`). In a listening-centered game, neither the phone Remote Baton nor Commander contextual controls provide an audio replay button. The teacher cannot trigger replays while circulating among student desks.
  *Recommendation:* Wire a dedicated `PLAY_AUDIO` action to the Remote Baton and Commander, connecting directly to `playAudio()`.

- **P2 — Phase 3 (Speech Production) lacks a 2-miss mercy exit.** **Evidence:** §3 F6 (`BoardSoundLab.tsx:188-197`). In Phase 3, if a student mispronounces a sentence or background noise prevents speech recognition from passing, the item loops indefinitely, deducting −1 per attempt.
  *Recommendation:* Wire the standard 2-miss teaching scaffold: after 2 consecutive failed attempts, display the model sentence, play the correct audio, award 0 points, and auto-advance. Ensure `MARK_CORRECT` remains available on the remote as an instant teacher pronunciation override.

- **P3 — Reset replay counter on Phase 3 item advances.** **Evidence:** §3 F7 (`BoardSoundLab.tsx:425-435`). `advancePhase3` omits resetting `replayCount`, leaking penalty counts into subsequent items. Ensure clean state resets across all phase transitions.

### 4.c Pedagogical practice (ESL ages 6–12)

- **P1 — The 3-Tier Listening Ladder (Receptive $\rightarrow$ Discriminative $\rightarrow$ Productive).** The progression across Sound Lab's three phases is an exemplary ESL pedagogical structure:
  1. *Phase 1 (Recognition):* Maps auditory input directly to concrete visual meaning without reading mediation.
  2. *Phase 2 (Discrimination):* Distinguishes subtle grammatical differences in spoken sentences.
  3. *Phase 3 (Production):* Active oral reproduction reinforcing phonetic articulation.
  Preserving this structured ladder is vital for comprehensive speech acquisition.

- **P2 — Acoustic Focus and Distractor Integrity.** In Phase 2 dictation matching, ensure distractors feature minimal phonological or grammatical contrasts (e.g. *"The lion runs fast"* vs *"The lion ran fast"*), training students to listen for inflectional morphemes.

- **P2 — Positive Reinforcement in Speech Recognition.** For Chinese EFL learners aged 6–12, speaking into an automated system can be intimidating. Feedback should celebrate effort: display a colorful similarity meter (e.g. *"85% Match! Clear voice! ⭐"*) rather than binary failure prompts.

### 4.d Game interaction (mechanic, pacing, fairness, fun)

- **P2 — High-Tech Sound Wave Visualizer.** Replace the static button with a responsive sound wave visualizer:
  - Concentric glowing ripples emit during audio playback.
  - An animated bouncing waveform visualizes speech input during Phase 3.
  - A tactile circular replay button with clear cost badges gives teachers precise control.

- **P2 — Level-Up Interstitial Between Phases.** Transitioning between Phase 1, 2, and 3 should feel like an achievement. Display a 1.2s celebratory interstitial card (*"Phase 1 Complete! Level Up to Sentence Listening! 🚀"*) with chimes.

### 4.e Top-5 prioritized recommendations

1. **P1 — Auto-Play Audio on Item Mount (F1, §2):** Auto-play sound once for free upon item deal.
2. **P1 — Rebuild Board Layout to a Horizontal 1×4 Row to Eliminate Image Clipping (F4, §2):** Ensure all 4 images are 100% visible on 16:9 projection displays without scrolling.
3. **P1 — Wire Remote & Commander `PLAY_AUDIO` Action (F3):** Allow handheld audio replays from the phone remote.
4. **P1 — Honest Replay Metering on Button (−1 pt after first play) (F2, §2):** Surface the replay cost badge directly on the Listen button.
5. **P2 — Add 2-Miss Mercy Scaffold to Phase 3 Speech Production (F6):** Prevent indefinite point bleeding on speech recognition failures.

### 4.f Design direction for Stitch (style/mood guidance + the 3–5 key screens/states to design; what to KEEP from the current design)

**Mood and visual system.** Design this as a high-tech "Acoustic Laboratory / Sound Wave Arena". Deep sonic navy background (`#0B132B`), electric cyan (`#38BDF8`) for dynamic audio waveforms, radiant violet (`#8B5CF6`) for primary audio controls, neon emerald (`#10B981`) for correct matches, and amber (`#F59E0B`) for metered replays. The UI should feature clean acoustic oscilloscope lines and tactile arcade response cards.

**Mock up these four board screens/states (16:9 projector, no scrolling):**

1. **Screen 1 — Phase 1: Listen & Tap (Auto-Playing):**
   - Top Header: 3-step progress pill: `[👂 Listen & Tap (Active)] → [🎧 Listen & Match] → [🗣️ Hear & Say]`, Alice's turn badge.
   - Center Stage: Sleek glowing cyan oscilloscope soundwave actively animating with caption *"Listen carefully... 👂"*.
   - Bottom Stage: 4 large, landscape photo cards (~4:3 aspect ratio) arranged in a horizontal row (Coast, Forest, Mountain, Desert). No text captions.

2. **Screen 2 — Replay State (Metered):**
   - Oscilloscope idle.
   - Center Button: Sleek purple pill: `"Replay Audio 🔊"` with a glowing amber badge: `"-1 pt"`.
   - Cards active and pulsing softly, waiting for student selection.

3. **Screen 3 — Phase 2: Listen & Match (Discrimination):**
   - Header: Step 2 active.
   - Center Audio Player with replay badge.
   - Stage: 3 stacked horizontal sentence cards with clear typography:
     - `A. The animal plays in the jungle.`
     - `B. The animal sleeps in the jungle.`
     - `C. The animal runs in the jungle.`

4. **Screen 4 — Phase 3: Hear & Say (Voice Production):**
   - Header: Step 3 active.
   - Center: Target sentence `"The lion runs fast."` in massive bold type.
   - Microphone status: Pulsing cyan recording ring with audio wave meter and prompt *"Your turn! Speak now 🎤"*.
   - Bottom: Teacher override chip `"Tap to Accept / Mark Correct"`.

**What to KEEP from current design.** Retain the 3-tier listening ladder progression, the replay-penalty calculation engine for picked students, the background speech pre-warming, and empty-phase skipping logic.

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

## §6 ⬜ Stitch output & implementation notes

*(Owner drops the Stitch export into `stitch/<NN>-<game>/`; ZCode records implementation + deploy.)*
