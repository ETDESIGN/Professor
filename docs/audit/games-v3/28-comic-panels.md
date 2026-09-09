# Comic — Rebuild the Story — v3 Quality Audit (`COMIC_PANELS`)

> **Status:** **file-ready** — §0–§3 audited (agent-parallel 2026-09-10) + §2 confirmed + screenshots captured. Ready for Anti-Gravity §4.
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

> **Co-Work: write your findings ONLY inside this section.** (Full instructions + shared prelude embedded at `file-ready`.)

### 4.a UI & visual design
### 4.b Workflow & user flow (teacher's path: start → turns → end)
### 4.c Pedagogical practice (ESL ages 6–12)
### 4.d Game interaction (mechanic, pacing, fairness, fun)
### 4.e Top-5 prioritized recommendations
### 4.f Design direction for Stitch

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

## §6 ⬜ Stitch output & implementation notes

*(Owner drops the Stitch export into `stitch/<NN>-<game>/`; ZCode records implementation + deploy.)*
