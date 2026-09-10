# Comic — Rebuild the Story — v3 Quality Audit (`COMIC_PANELS`)

> **Status:** **cowork-done** — §4 co-work quality audit complete (Anti-Gravity 2026-09-10). Ready for §5 Stitch prompt.
> **Screenshots:** `screenshots/28-comic-panels-idle.png` — empty state (comics need book scans) — cropping findings are code-anchored.

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

- **Flow type:** `COMIC_PANELS` ("Rebuild the Story" — comic sequencing from the book's own panel art)
- **Component:** `apps/board/templates/BoardComicPanels.tsx`
- **Phase:** PRACTICE (server composer: `supabase/functions/orchestrate-lesson/index.ts:323`; ⚠️ PlanComposer's `PHASE_FOR_BLOCK` omits the type — see §3 F6)
- **Remote-control group:** shared `ScoredShellControls` with Check (the UNSCRAMBLE/SCRAMBLE/STORY_SEQUENCING/COMIC_PANELS case) — Check Answer / Hint / Mark Correct / Skip / Next / End (`apps/teacher/live/panels/ContextualControls.tsx:134-141,42-73`); the baton mirrors all of these plus Reset (`apps/remote/TeacherRemote.tsx:373-404`)
- **Data sources:** frozen per-comic panel cards from the orchestrate-lesson relational override — `page_structures` (confirmed comic structures) joined with `assets` pool `'panel'` crops (enrich-unit output); no `useBoardPool`, no live pool
- **Mode:** picked student rebuilds the comic (scored); `quickWheelWinner = null` = choral/class rebuild (zero writes)

## §1 How the game works today

**Data shape (frozen at compose time).** Each slide is ONE comic: `data.panels[]` of `{ id: "<structure_id>:<panel_index>", order: <true reading order 0-based>, image_url?: <panel crop URL>, narration?: <verbatim narration box>, texts: [<verbatim bubble texts>] }` (`BoardComicPanels.tsx:37-48`; produced in `orchestrate-lesson/index.ts:533-546`). Speaker names are deliberately absent (doc-12 audit: ~60% mis-attributed by the scanner); panels without a crop render a 📖 placeholder; comics with <3 panels are dropped entirely (absence = absence, `orchestrate-lesson/index.ts:548`) and the board needs ≥2 to render (`BoardComicPanels.tsx:312`). **No aspect ratio or dimensions travel with the panel** — the crop's bbox is known server-side but only the URL survives into the block data.

**Deal.** On mount, on `panels` change, on `NEW_TURN` (keyed `state.currentTurnId`), and on RESET: the tray is `seededShuffle(panels, makeRng(seedBase, currentTurnId, 'comic-panels'))` and the slot row starts empty (`:134-146,266-275`) — deterministic per turn so all tabs deal identically.

**The loop.** A shuffled **tray** (art only — no text, per owner decision) sits under a row of numbered **slots**. Tapping a tray panel places it in the first empty slot; tapping a placed panel returns it to the tray (`:287-309`). **Reveal-on-place:** the moment a panel lands in a slot its narration (amber box) + verbatim bubble texts appear beneath the image (`revealedText`, `:322-331`) — the story literally assembles as the class reorders it, which is the whole mechanic.

**Check (LCS partial credit).** The teacher presses Check Answer (board button `:351-356` or `CHECK_ANSWER`); all slots must be filled. The placed id sequence is graded against the true order by `computeLCSPartialCredit` (longest-common-subsequence ratio, shared with BoardUnscramble, `BoardUnscramble.tsx:49-52`) at `PASS_THRESHOLD = 0.5`, difficulty fixed at 2 (the documented sequencing-shell override — constrained production, `:57-58`):
- **Pass (ratio ≥ 0.5):** `awardedRef` latches (one payment per turn), streak bumps (cue + confetti at 3/5), `scoreForAttempt(mistakes, 2, ratio, streak)` (floor 1, cap 5), outcome = correct (ratio ≥ 1) or partial; correct slots ring green, wrong slots ring yellow; after 2200ms the slide completes — win cue + `SLIDE_COMPLETE` broadcast (`:185-205`).
- **Fail:** mistake + live −1, streak reset, wrong cue, analytics `incorrect` + remediation push; the FIRST clearly-misplaced panel pulses red for 1200ms, then all misplaced panels return to the tray while correctly-placed ones stay (`:206-224`) — targeted feedback sized for panel counts where a full diff is noise.

**Overrides.** Mark Correct = full-credit pass at ratio 1.0 (`:227-237`). Hint highlights the first misplaced placed panel (warning pulse, nothing moves, `:239-243`). Skip and Next BOTH just end the slide (`SKIP_ROUND`/`NEXT_ROUND` → `finishSlide()`, `:253-254`); RESET_GAME re-deals the same comic. The completion overlay auto-dismisses after 6s and re-deals (`:279-284`).

**Scoring writes (picked mode only).** `addPoints` + `recordAttempt` (`exerciseType: 'comic_sequencing_attempt'`, difficulty 2) + `gradeObjective` against the unit's STORY objective row (looked up live from `objectives` where `type = 'story'` — the real objective, not a literal string; `:105-120,149-171`); fails push the story objective to remediation. Choral mode: everything renders, nothing writes.

**The layout that causes the §2 squeeze (all in `BoardComicPanels.tsx:360-413`):**
- **Slots:** ONE horizontal row, every slot `flex-1 max-w-[17%]` inside a `max-h-[52%]` container (`:362,368`). A 6-panel comic = six equal-width boxes of at most 17% stage width each. Inside a slot the image is `object-contain` in the leftover height after the revealed-text block (`:377`) — so a WIDE comic panel letterboxes down to slot width (~230–260px on a 1080p stage, less with the leaderboard rail) and renders a fraction of its natural height. The bubbles printed in the art become unreadable; the class cannot judge which panel is which.
- **Tray:** buttons are fixed `h-28` (112px) with `w-auto min-w-16 max-w-40` and **`overflow-hidden`** (`:401`), image `h-full w-auto object-contain` (`:405`). A wide panel at 112px tall wants ~200–220px of width; the button clips at `max-w-40` (160px) — **the tray literally CUTS wide panels in half**. This is the exact "text and image are cut out" in §2.
- **Revealed text renders at `text-[11px]`** (`:325,328`) — invisible from the back of a classroom even when revealed.
- **Where panel-native aspect would adopt:** (1) carry the crop's aspect (bbox w/h is already in `page_structures` at compose time) into the panel card in `orchestrate-lesson/index.ts:533-546`, or measure `naturalWidth/naturalHeight` on load in the board; (2) let slots size from the panel's own aspect (a horizontal film-strip / 2-row mosaic instead of six forced equal columns) with `object-contain` only as a safety, never a squeeze; (3) tray items must be height-constrained but width-auto with NO `max-w` + `overflow-hidden` clip; (4) adding `COMIC_PANELS` to `FULL_BLEED_TYPES` (`apps/board/BoardShell.tsx:41`) reclaims the 240px leaderboard rail this game badly needs.

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> The game logic is good, but the UI is bad. Right now, we have to put the comic images in the right order. The thing is, the comic images are all rectangular (horizontal/wide), and the boxes where we need to place them are vertical. When we play, we cannot see correctly — I cannot really determine if it's the right one or not, because they don't fit properly; text and image are cut out.

**Clarified with the owner (2026-09-09):**
- ["Rebuild History" = Comic — Rebuild the Story.] Stitch proposes the exact slot layout; HARD CONSTRAINT = wide panels fully readable (text + image), never cropped or squashed.

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardComicPanels.tsx` unless noted.

- **F1 · P1 — Tray items physically CROP wide panels.** The tray button clips at `max-w-40` (160px) with `overflow-hidden` while the image sizes itself `h-full w-auto` at fixed `h-28` (`:401,405`). Any panel wider than ~1.43:1 — i.e. most comic panels — is cut mid-art. The tray is the CHOOSING surface: the owner's "I cannot really determine if it's the right one or not" is this line. Fix: height-constrained, width-auto tray chips with no max-width clip (or a horizontally scrollable tray).
- **F2 · P1 — Slots force six equal vertical-ish boxes; wide panels squeeze to postcard size.** One row of `flex-1 max-w-[17%]` slots (`:362,368`) with `object-contain` images (`:377`) letterboxes a ~2:1 panel into ~230×115px on a 1080p stage — with the 240px leaderboard rail active (see F4) it's worse. The class judges sequencing by reading panel art; at that scale the art carries no information. This is the slot half of the §2 squeeze: slots must adopt each panel's NATIVE aspect (data hook documented in §1) — e.g. a film-strip row or 2-row mosaic — instead of imposing equal columns.
- **F3 · P2 — Reveal-on-place text renders at 11px.** The mechanic's payoff — narration + verbatim bubbles appearing as the story assembles — is set in `text-[11px]` with `min-h-[3.5rem]` (`:323,325,328`). Illegible at 5–8 m; the mechanic effectively doesn't exist for the room. Any redesign should project-scale this text (≥24–28px equivalents) and probably move it beside/below the strip rather than inside each squeezed slot.
- **F4 · P2 — Not full-bleed: the leaderboard rail steals ~15% of the stage from an art-reading game.** `COMIC_PANELS` is absent from `FULL_BLEED_TYPES` (`apps/board/BoardShell.tsx:41`), so the 240px right rail renders during a game whose entire challenge is seeing book art. FOCUS_CARDS was added to the set for exactly this reason (2026-09-10).
- **F5 · P2 — Panel aspect is known server-side but dropped from the data.** `orchestrate-lesson` reads each panel's normalized bbox (it uses it for crop matching) yet emits only `image_url` (`supabase/functions/orchestrate-lesson/index.ts:533-546`); `ComicPanelCard` has no aspect field (`:37-48`). Every robust layout fix needs the ratio either carried in the block data or measured at img-load — a `naturalWidth/naturalHeight` measure-on-load is the zero-migration path.
- **F6 · P3 — PlanComposer-saved comic slides lose their phase.** `PHASE_FOR_BLOCK` (`apps/teacher/PlanComposer.tsx:530-541`) omits `COMIC_PANELS`, so blocks saved from the composer carry no `phase` and BoardShell falls back to a WARMUP badge (`BoardShell.tsx:51`) — the server path says PRACTICE (`orchestrate-lesson/index.ts:323`). Cosmetic today (phase gates nothing here), but the two composers disagree.
- **F7 · P3 — "Next" ends the slide, and Skip and Next do the same thing.** Both `SKIP_ROUND` and `NEXT_ROUND` collapse to `finishSlide()` → `SLIDE_COMPLETE` (`:253-254`): the only re-deal path from the remote is Reset. A teacher pressing "Next" expecting a fresh shuffle gets the lesson roadmap advancing instead. The baton labels them Skip/Next with identical behavior (`TeacherRemote.tsx:386-393`).
- **F8 · P3 — Hint is a no-op until at least one panel is misplaced.** `revealHint` only highlights an existing wrong placement (`:239-243`); on an empty board or before Check it does nothing — fine as designed, but worth a disabled state or a "place this one first" affordance so the button never feels dead (the classic dead-button gotcha this codebase audits for).
- **F9 · P3 — A partial pass ends the slide with wrong panels only yellow-ringed for 2.2s.** Ratio 0.5–0.99 awards and completes (`:201-205`); the class sees which slots were wrong for under two seconds with no chance to fix them. Defensible (partial = pass, one scored attempt per turn) but the teaching beat is thin — a "here's the true order" flash before the overlay would cost nothing.

**What already works well (context — don't re-litigate):** the game logic the owner explicitly endorsed — LCS partial credit with the shared 0.5 threshold, the return-misplaced-to-tray targeted feedback (sized for 6-panel comics), `awardedRef` one-payment latch, reveal-on-place as the story-assembles mechanic, deterministic seeded deal per turn, absence=absence gating (≥3 panels server-side, ≥2 board-side), grading against the real story objective row, full baton parity including Reset, and the no-speaker-names discipline (verbatim text only until scan-v8 proves attribution).

## §4 ⬜ ChatGPT Co-Work quality audit

### 4.a UI & visual design
- **Tray buttons physically chop comic panels in half (F1, §2):** In the source tray, panel buttons have fixed `h-28` (112px) paired with `max-w-40` (160px) and `overflow-hidden` (`:401,405`). Standard comic book panels are wide landscape rectangles (~16:9 or 2:1 ratio). At 112px height, a 16:9 panel needs ~200px width; the `max-w-40` clamp abruptly amputates the right third of the artwork. This directly causes the owner's frustration: *"text and image are cut out... I cannot really determine if it's the right one or not"*. The tray must support height-constrained, auto-width cards with zero clipping.
- **Slot row compresses wide panels to vertical postcard slits (F2, §2):** Target slots are forced into a single horizontal row where every slot has `flex-1 max-w-[17%]` (`:362,368`). Squeezing 5 or 6 panels into a single row forces wide illustrations to letterbox inside tall vertical boxes, shrinking them down to ~230×115px. At 5–8 meters, students cannot see facial expressions, visual action, or in-scene speech bubbles.
- **Stage width stolen by persistent 240px leaderboard rail (F4):** `COMIC_PANELS` is missing from `FULL_BLEED_TYPES` in `BoardShell.tsx:41`. Dedicating 240px to an idle leaderboard rail severely pinches horizontal real estate on a game that is 100% reliant on wide visual artwork. Comic Panels must be full-bleed.
- **Illegible 11px reveal-on-place text (F3):** When a panel is slotted, its narrative text and dialogue bubbles appear in microscopic `text-[11px]` (`:325,328`). The core pedagogical reward — seeing the story text assemble — is completely invisible to children in a live classroom.
- **Incorrect WARM-UP phase badge on board shell (F6, screenshot):** `PHASE_FOR_BLOCK` in `PlanComposer.tsx:530-541` omits `COMIC_PANELS`, causing it to default to a WARM-UP badge instead of PRACTICE.

### 4.b Workflow & user flow (teacher's path: start → turns → end)
- **Placement & Reordering interaction:** Students or teachers tap a tray card to move it into the next available numbered slot; tapping a slotted card returns it to the tray (`:287-309`). This tap-to-place model works well on classroom smartboards. However, reordering two already-placed cards is cumbersome (requires clearing cards back to tray). A direct slot-to-slot swap interaction would make live corrections effortless.
- **Check Answer & LCS partial credit:** The teacher triggers Check Answer via the board button or remote baton. The engine's Longest Common Subsequence (`computeLCSPartialCredit`, $\ge 0.5$ threshold) awards partial credit (difficulty 2) when the general narrative arc is recognized (`:185-205`), which prevents punishing students who made an isolated inversion.
- **Targeted mistake feedback works well:** On a failed check, the first clearly misplaced panel pulses red for 1200ms before returning to the tray, while correctly placed anchor panels remain in place (`:206-224`). This targeted feedback keeps the class motivated to fix errors.
- **Skip vs. Next semantic collision (F7):** Both `SKIP_ROUND` and `NEXT_ROUND` call `finishSlide()` (`:253-254`). "Next" on the remote unexpectedly terminates the slide rather than dealing a new turn.

### 4.c Pedagogical practice (ESL ages 6–12)
- **Visual narrative sequencing as reading comprehension:** Ordering comic panels tests temporal and causal discourse comprehension (e.g., *first*, *then*, *after that*, *finally*). For young EFL learners (ages 6–12), visual storytelling provides an essential scaffold before pure text reading.
- **Art readability is a pedagogical prerequisite:** In comic comprehension, kids rely on visual continuity cues (character position, lighting, gaze direction, cause-and-effect props). When panels are chopped or shrunken, these visual cues are destroyed, reducing a higher-order reading task to random guessing.
- **Story assembly reward:** As panels are slotted, the story should "come alive". Displaying large, high-contrast narrative text (at least 20–24px) beneath the placed panels allows the teacher to lead a choral reading of the emerging comic strip.
- **Authentic book scan integration:** Generating comics directly from scanned curriculum textbook pages (`page_structures` + `assets` panel crops) bridges physical textbook study with interactive classroom projection.

### 4.d Game interaction (mechanic, pacing, fairness, fun)
- **Adaptive layout architecture (Strip vs. 2-Row Comic Page):**
  - **3 to 4 Panels:** Display in a single horizontal widescreen film-strip (`1×4`).
  - **5 to 6 Panels:** Display in an authentic **2-Row Comic Strip Page** (e.g., Panels 1–3 on top row, 4–6 on second row). This doubles the size of every panel, maintains wide landscape proportions, and eliminates vertical squishing.
- **Tray panel labeling:** Each tray panel should carry a prominent letter tag (`A`, `B`, `C`, `D`, `E`, `F`). In classroom dynamics where a student is answering from their desk, they can shout: *"Put D in Slot 1, then B in Slot 2!"* without needing to physically walk to the screen.
- **Choral & Picked Mode balance:** Scored attempts write to the unit's `story` objective (`:105-120`), while choral mode lets the entire class participate in rebuilding the comic without scoring stress.

### 4.e Top-5 prioritized recommendations
1. **P1 — Eliminate Tray Panel Cropping & Support Native Landscape Aspect (F1, §2):** Remove `max-w-40` and `overflow-hidden` from tray items (`BoardComicPanels.tsx:401,405`). Implement height-constrained, width-auto tray cards so wide artwork is never chopped.
2. **P1 — Adopt a 2-Row Comic Layout for 5–6 Panel Stories (F2, §2):** Replace the rigid single row of vertical slots with an authentic 2-row comic layout (e.g. 3 panels top, 3 panels bottom), doubling panel size and preserving native landscape ratios.
3. **P2 — Add `COMIC_PANELS` to `FULL_BLEED_TYPES` (F4):** Reclaim the 240px right leaderboard rail in `BoardShell.tsx:41` to give maximum stage width to book artwork.
4. **P2 — Scale Reveal-on-Place Narrative Text to Classroom Legibility (F3):** Replace `text-[11px]` with large, projected narrative subtitles ($\ge 20$–24px) so the assembled story can be read chorally from 8 meters.
5. **P3 — Add Tray Letter Badges (A–F) for Back-Row Student Calling (4.d):** Stamp clear letter tags on tray panels to facilitate verbal classroom direction.

### 4.f Design direction for Stitch
- **Mood and visual theme:** "Graphic Novel Studio" / "Illustrated Comic Workshop". Warm editorial cream/slate background (`#0F172A` / `#1E293B`), bold comic-book ink borders (`#334155`), bright cyan placement halos (`#00F0FF`), and cheerful golden speech bubbles (`#F59E0B`).
- **Mock up these four screens/states (16:9 projector, no scrolling):**
  1. **Screen 1 — Initial Stage (Unassembled Story, 5 Panels):**
     - Full-bleed 16:9 stage. Top HUD: Challenger badge `[📖 Alice's Turn — Rebuild the Comic!]` + Check Answer button.
     - Center Stage (Target Slots): A 2-row comic grid with 5 empty numbered panels (Panels 1, 2, 3 on top; Panels 4, 5 on bottom), styled with clean dashed comic borders and watermark numbers `[1]`, `[2]`, `[3]`, `[4]`, `[5]`.
     - Bottom Tray: Shuffled tray of 5 wide, uncropped comic panels labeled with large badges `[A]`, `[B]`, `[C]`, `[D]`, `[E]`.
  2. **Screen 2 — Partially Assembled Comic with Readable Text:**
     - Panels 1 and 2 placed.
     - Each placed panel displays its wide illustration + a bold, readable dialogue/narration box beneath (`text-lg font-bold text-amber-300`).
     - Slot 3 highlighted with a cyan glow awaiting the next selection.
  3. **Screen 3 — Targeted Mistake Correction State:**
     - Check Answer pressed. Slot 1 and 2 ring green (`✓`).
     - Slot 3 pulses in warning red (`✗`) with a hint banner: *"Check Panel 3 — what happens next?"*. Misplaced panel animates back to the tray.
  4. **Screen 4 — Story Complete Full Reading Showcase:**
     - All panels locked in correct order with radiant emerald borders.
     - Full narrative displayed in sequence for whole-class reading, accompanied by celebratory confetti and score award (`+3 Points for Alice!`).
- **What to KEEP from current design:** The LCS partial credit algorithm, targeted mistake return, story objective grading, and absence=absence gating.

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

## §5 note — wave-2 design pass SUBMITTED 2026-09-11 (ZCode → Stitch, autonomous)

Two key screens per game per the §4 brief (briefs in `prompts/wave2-stitch.json`, submitted into project 17415096891547227013; all 26 accepted by the API). Screens materialize asynchronously in Stitch's generation queue — ZCode verifies against the QA list, exports to `stitch/28-comic-panels/`, then implements with the wave-2 logic fixes (already deployed `bfd78ab`).

## §6 ⬜ Stitch output & implementation notes

*(Owner drops the Stitch export into `stitch/<NN>-<game>/`; ZCode records implementation + deploy.)*
