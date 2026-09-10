# Magic Eyes — v3 Quality Audit (`MAGIC_EYES`)

> **Status:** **cowork-done** — §0–§4 complete (Anti-Gravity quality audit). Ready for ZCode §5 Stitch prompt.
> **Current status:** cowork-done
> **Pilot:** no
> **Screenshots:** Pending ZCode live capture; analysis grounded in `apps/board/templates/BoardWhatsMissing.tsx` (mode `magic_eyes`).

---

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

- **Flow type:** `MAGIC_EYES`
- **Component:** `apps/board/templates/BoardWhatsMissing.tsx` (mode `magic_eyes`, consolidated from legacy `BoardMagicEyes.tsx`)
- **Phase:** PRACTICE (fast-paced energizer / visual retention drill)
- **Remote-control group:** `ScoredShellControls` with `opts={{ replay: true }}` (`ContextualControls.tsx:130-133`): Skip (`SKIP_ROUND`), Hint (`REVEAL_HINT`), Mark Correct (`MARK_CORRECT`), Show Again (`SHOW_AGAIN`), Next (`NEXT_ROUND`), End (`SLIDE_COMPLETE`).
- **Data sources:** `useEscalatingPool({ exerciseTypes: ['IMAGE_SELECT'] })` with single-item slice per round, or legacy slide data (`data.image`, `data.question`, `data.answer`).
- **Mode:** Fast choral energizer or rapid picked-student sprint (always `recognize` mode — no typed produce step, preserving high-cadence game feel).

## §1 How the game works today

**Concept & loop:** Magic Eyes is an observation and rapid visual discrimination energizer. An authentic image is flashed for 3 seconds, then heavily blurred or hidden. Students must shout out or identify what they saw from a candidate tray.

1. **Round structure:** 4 rounds (`TOTAL_ROUNDS = 4`), cycling through 4 distinct vocabulary items from the pool.
2. **Phase 1 — Flash (3s):** A single central hero card (`w-full max-w-3xl aspect-video`) mounts with an authentic photo and bold English word label. An emerald progress bar runs down from 3 seconds.
3. **Phase 2 — Recall (Blur & Question):** When the 3s timer expires:
   - The central image transitions to an extreme blur (`blur-[80px] opacity-40 scale-110`).
   - The header updates to: *"What did you see?"*.
   - A candidate tray mounts below with 3–4 shuffled option cards (correct target + distractors from `content.options`).
   - Students point or shout the word; teacher taps the chosen candidate.
4. **Phase 3 — Reveal:**
   - On correct tap: The central image instantly unblurs (`blur-0 opacity-100`) and is highlighted with a gold border (`border-8 border-yellow-400`). A feedback toast announces: *"Nice one, [Student]!"* alongside the word and image. Audio cue `playCue('correct')` plays.
   - On mistake: Rose shake animation, −1 penalty point, distractor eliminated from tray.
   - After 900ms, the game advances to the next round.
5. **Phase 4 — Victory / End:** After round 4, the slide completes with a celebratory modal (*"Great memory, everyone!"*).

## §2 Owner comments (verbatim)

> *(No individual Phase B comment recorded specifically for Magic Eyes; the game was consolidated into BoardWhatsMissing in August and is governed by cross-cutting directives confirmed 2026-09-09.)*

**Governing cross-cutting directives (from `_CROSS-CUTTING.md`):**
- **#1 — Responsive live screen / phone-landscape floor:** Must reflow without scrolling at 700×320.
- **#3 & #25 — Lifecycle stability:** Arrive in clean initial flash state; no bounce-backs.
- **Language rule:** English-first. No Chinese clues on challenge surface.
- **Classroom model:** Teacher handles all input; no student devices. Fast pacing.

## §3 ZCode code-level findings

- **F1 · P1 — Blur leak (`blur-[80px]`) trivializes candidate selection (`:688`):** CSS gaussian blur at 80px does not mask dominant color masses or broad silhouettes. If the target is a red strawberry and the distractors are a green turtle, a brown dog, and a grey car, students simply match the blurred red blob to the red strawberry card without recalling the English word.
- **F2 · P1 — Auto-flash starts the exact millisecond slide mounts (`:281-288`):** The 3-second countdown starts immediately upon component mount. In a live classroom, students take 3–5 seconds to redirect their eyes to the board when a slide changes. The image frequently blurs before students have even looked at it.
- **F3 · P2 — 900ms reveal is too fast for classroom energizer celebration (`:326-337`):** When the student correctly identifies the item, the 900ms auto-advance snaps the screen to the next round before the class can enjoy the unblurred image and chorally repeat the English word.
- **F4 · P2 — Large text label during 3s flash undermines visual memory (`:667`):** The flash screen renders `<h3 className="text-4xl font-display font-bold text-slate-800">{grid[0]?.word}</h3>`. Kids who can read English focus entirely on reading the text rather than observing the visual details of the image.
- **F5 · P2 — Severe vertical collision on 700×320 phone floor:** The hero card (`aspect-video max-w-3xl`) combined with candidate buttons (`w-36 h-28`) exceeds 320px, pushing the buttons off-screen.
- **F6 · P3 — Legacy slide fallback has no interactive options or scoring (`:568-600`):** In legacy mode, it only renders passive text with no candidate tray.

---

## §4 Anti-Gravity UX & Pedagogical Audit

### 4.a UI & visual design
- **Camera Aperture / Shutter Metaphor:** Replace the generic CSS blur with a high-energy camera shutter or "Magic Lens" mechanic:
  - Phase 1: Camera lens opens wide (iris expansion animation), bright flash sound effect (`playCue('shutter')`), image is crisp and vibrant for 3 seconds.
  - Phase 2: Shutter snaps shut or a frosted frosted-glass frost shield drops over the lens. Instead of a color-leaking gaussian blur, the image should be replaced by a dark mystery silhouette or frosted silhouette with glowing question marks.
- **Hero Image Sizing:** Magic Eyes is about intense visual observation. The image should occupy at least 60% of the 16:9 vertical height, centered with high-contrast cinematic framing.
- **Phone floor reflow (700×320):** Reflow the layout horizontally: Hero card on the left (50% width), compact 2×2 option pills on the right (50% width). Zero vertical scrolling.

### 4.b Workflow & user flow (teacher's path: start → turns → end)
- **Teacher-Gated Flash ("Ready... GO!"):** Eliminate the instantaneous auto-flash on mount (F2).
  - Mount state: Board displays *"Magic Eyes! Look at the board!"* with a big pulsing **"FLASH IMAGE (3s)"** button (also mirrored on the teacher's remote).
  - The teacher ensures all 30 children are looking at the screen, then triggers the flash.
  - After 3 seconds, it automatically snaps to recall mode.
- **Replay control ("Peek"):** The "Show Again" button (`SHOW_AGAIN` / `REPLAY`) allows the teacher to flash the image for an additional 1.5-second "peek" if the class is stumped, docking 1 point.
- **Choral echo on reveal (F3):** Hold the unblurred reveal for 2.5–3.0 seconds, auto-playing native pronunciation audio so the whole class chorally chants the word together.

### 4.c Pedagogical practice (ESL ages 6–12)
- **Separate Image Observation from Word Recognition:**
  - During the 3-second flash: Display the **image only** (hide the text label). This forces authentic visual encoding (noticing colors, actions, objects).
  - During the recall phase: Display options with **bold English text + small image thumbnail**. This forces the child to map their visual mental image to the correct English vocabulary word.
- **High-energy pacing:** Pacing should feel like a lightning round: 3s flash $\rightarrow$ 5s recall $\rightarrow$ 3s choral echo $\rightarrow$ Next round. 4 rounds take ~60 seconds total, making it the perfect mid-lesson energizer.

### 4.d Game interaction (mechanic, pacing, fairness, fun)
- **Eliminate blur color leakage (F1):** Use a frosted mist veil or mystery aperture that obscures hue and internal detail, preventing children from guessing based purely on color patches.
- **Excitement & sound design:** Camera shutter click on flash $\rightarrow$ tension hum during recall $\rightarrow$ camera flash chime + crowd cheer on unblur.

### 4.e Top-5 prioritized recommendations
1. **P1 — Implement Teacher-Gated "Ready... Flash!" Trigger (F2):** Never start the 3-second countdown automatically upon slide arrival. Require teacher trigger (or 3-2-1 visual countdown) so kids don't miss the flash.
2. **P1 — Replace Gaussian Blur with Frosted Mystery Lens to Stop Color Leaks (F1):** Prevent students from guessing via blurred color blobs; use a frosted silhouette or iris shutter.
3. **P1 — Hide Text Label During Flash, Require Word Recognition in Recall (F4, 4.c):** Show image only during flash; show English words in candidate tray to test vocabulary retrieval.
4. **P1 — Rebuild 700×320 Floor as Split Screen (Left Image, Right Options) (F5):** Prevent candidate buttons from falling off the bottom of the screen on phone/iPad projection.
5. **P2 — Extend Reveal Hold to 2.5s with Native Audio Pronunciation (F3):** Play audio upon unblur and hold for choral class repetition.

### 4.f Design direction for Stitch
- **Mood and visual theme:** "Magic Camera / Cyber Shutter". High-tech obsidian darkroom (`#070A14`), neon cyan shutter rings (`#00F0FF`), bright flash highlights (`#FFFFFF`), energetic amber countdown gauge (`#F59E0B`), and emerald focus lock (`#10B981`).
- **Mock up these four screens/states (16:9 projector, no scrolling):**
  1. **Screen 1 — Ready State (Gate):**
     - Top HUD: `[Round 1/4]` + Alice's turn chip.
     - Center: Shuttered camera lens with glowing cyan aperture.
     - Big CTA: *"👀 Watch closely! Tap to Flash (3s)"*.
  2. **Screen 2 — Flash State (3s Active):**
     - Aperture wide open: Gorgeous, full-bleed landscape photo of target vocabulary (e.g. `DOLPHIN`), no text label.
     - Top: Radiant circular 3-second countdown gauge draining rapidly.
  3. **Screen 3 — Recall State (Mystery Frost):**
     - Center: Image covered by frosted geometric cyber-shutter with glowing question mark.
     - Bottom Dock: 4 crisp option cards with English words and subtle silhouettes (`A: SHARK`, `B: DOLPHIN`, `C: WHALE`, `D: SEAL`).
  4. **Screen 4 — Unblur & Choral Echo:**
     - Shutter dissolves with emerald particle flash. Unblurred photo displayed proudly with massive word banner `DOLPHIN`.
     - Audio soundwave animating with prompt: *"Class: say DOLPHIN!"*.

## §5 ⬜ Google Stitch prompt

*(ZCode writes this downstream.)*

## §5 note — Stitch design pass SUBMITTED 2026-09-12 (ZCode, while AG recharges)

Two key screens per the §4 brief (Mystery Vault / Magic Camera directions). Accepted by the Stitch API — baking in the generation queue; ZCode exports to `stitch/15-magic-eyes/` when materialized.

## §6 ⬜ Stitch output & implementation notes

*(ZCode records implementation downstream.)*
