# Cross-Cutting Comments & Findings (not game-specific)

> Owner comments that apply to the **whole live-classroom experience** rather than one game: the Commander shell, Remote Baton, roster/wheel flow, session lifecycle, scoring feel across games, audio, avatars, etc.
> Each entry gets mapped to the owning subsystem; game-specific comments live in the per-game files.

## §1 Owner comments (verbatim — confirmed 2026-09-09)

> **#1 — Gamification system: live screen must be fully responsive.** "This first comment applies to the whole gamification system. It seems in the UI, in the live screen, whatever we do — move, reduce, or enlarge the size of the window — the content changes size. It's very important that the content resizes properly depending on the size of the screen, because the teacher may decide to connect it to an iPad, to a phone, and connect this iPad or this phone or the laptop to the projector through HDMI. So it's very important that even on some small screen, all the elements fit inside the screen."

**Clarified with the owner (2026-09-09):**
- Smallest screen that must be fully usable: **phone landscape** (~700×320 CSS px) — the board tab runs in a phone browser mirrored to the projector.
- Adaptation strategy: **reflow allowed** — panels stack, grids shrink, side rails collapse; layouts may reorganize so everything stays visible, nothing overlaps.
- Scrolling: **never** — everything fits one screen at every supported size.

> **#3 — "Next exercise" button needs two clicks.** "Another bug I noticed: when I click on the next game / next exercise button, we go to the next exercise, and automatically, after the system loads the next exercise, it comes back to the previous one. So I need to press the button a second time to effectively be on the next exercise."

**Clarified with the owner (2026-09-09):** happens **sometimes** (not every slide change); the control involved is the **commander's Next button**.

> **#25 — Many games: arriving at a new game shows it already in "finished" state.** "When I switch to the next screen, I arrive at the new game, and actually the game is in a finished state. Meaning, when I open it, there is a screen saying 'we have successfully finished the game', and I need to click on 'redo' to be able to play."

**Clarified with the owner (2026-09-09):** **several games** (unsure which exactly); occurs **on arrival via Next** — likely related to #3's bounce-back (suspect: stale slide/hydration state letting the arriving game mount with completed-round state).

**Global priorities stated by the owner (apply to every game):**
- Live screen is **horizontal** (projector via HDMI from laptop/iPad/phone) — use landscape space properly, scale down to small screens.
- **English-first rule (REFINED by the owner 2026-09-09, later same day): avoid Chinese on challenge surfaces WHEN POSSIBLE — it is NOT a strict ban.** Instructions, tips, rules, and exercise descriptions MAY be described in Chinese when the kids otherwise wouldn't understand the task. What stays hard: never make the ANSWER trivially visible (e.g., don't show the Chinese meaning of the very word being asked), and give hints/tips rather than answers. (The earlier same-day confirmation for Word Detective — remove the Chinese word from that challenge everywhere incl. commander — still stands for that game; it's the strong end of the preference, not a global law.)
- Games must flow smoothly with the **wheel student-picking system** (1 / 3 / full set per student) — **no mandatory teacher clicks between every single answer**.

## §2 ZCode findings (cross-cutting)

*(pending — batch code audit. Known anchors: the Word Search F0 finding (grid 0–13 px) is the extreme case of the responsive problem; #3/#25 point at the slide-advance/hydration path — `applySessionRow` staleness guard and `computeSlideState` are the first places to look.)*

## §3 Co-Work observations (if any)

- **Leaderboard rail persistence in non-scored presentation phases:** Observed in `05-focus-cards.md` (and relevant to `06-grammar-sandbox.md`, `01-intro-splash.md`, etc.). `BoardShell.tsx` currently only retracts the 240px leaderboard rail for `FULL_BLEED_TYPES = new Set(['STORY_STAGE', 'DIALOGUE_STAGE', 'MEDIA_PLAYER', 'INTRO_SPLASH', 'TEAM_SPLASH', 'LIVE_WARMUP'])`. In non-scored INPUT and WARMUP presentation activities, displaying 8–30 student avatars all sitting at 0 points adds zero pedagogical value, creates competitive distraction during initial teaching, and robs the presentation stage of ~25% of 16:9 projection width. Recommendation: Expand `FULL_BLEED_TYPES` or introduce an explicit phase-level rule (`phase === 'INPUT' || !isScoredStep`) so non-scored presentation games automatically gain the full 16:9 canvas.

- **Top-left chrome collisions (BoardShell phase badge vs in-game headers/navigation):** Observed in `05-focus-cards.md` and `26-word-search.md` (prior to v3 fix). `BoardShell.tsx` places an absolute-positioned phase pill at `top-5 left-6`. Templates placing page headers (e.g. "Today's Words") or back navigation (e.g. `< Grid` at `top-3 left-4`) collide directly with this badge, visually corrupting the title and breaking touch targets on interactive projection boards. Recommendation: Standardize an in-stage header safe zone across all board templates (minimum 180px left clearance) or unify the top bar so the phase pill is part of the template's layout flow rather than an absolute-positioned overlay.

- **Wheel auto-rotate vs. multi-interaction turn collision (The Turn-Boundary Collision):** Observed in `25-fast-vocab.md` and `24-class-rally.md`. The commander's auto-rotate wheel (`EVERY_1` or `EVERY_3`) counts positive `addPoints` calls as question boundaries (`rotationAwardCountRef`). When a game emits multiple scoring awards per student turn (e.g., Fast Vocab awarding points per matched pair and per speed question = 5 awards/turn), the wheel spins mid-turn after the very first match, violently re-dealing cards, aborting the student's turn, and erasing the learn$\rightarrow$recall retrieval arc. Recommendation: Establish a standardized `multiStepTurn: true` contract or emit a distinct `TURN_COMPLETE` event so the auto-rotate engine rotates only upon full turn completion.

- **The Baton Parity Gap (Roaming teacher stranded without remote triggers):** Observed across `32-vocab-blitz.md` (missing Steal, Bet 1x/2x, Correct), `27-spelling-bee.md` (missing +10s Time extension and Replay Audio), `23-memory-lab.md` (missing Pause/Peek timer controls), and `13-i-say-you-say.md` (dead Replay action). In live classrooms, teachers hold their mobile phone (`/remote`) while circulating among desks. When marquee game mechanics (like Vocab Blitz's Steal or Spelling Bee's time extension) exist only on the desktop commander or on the projected board surface, roaming teachers are effectively crippled. Recommendation: Enforce mandatory baton parity for all game-specific actions in `TeacherRemote.tsx`.

- **Square-crop distortion on widescreen vocabulary artwork (`aspect-square object-cover`):** Observed across `24-class-rally.md`, `28-comic-panels.md`, `20-story-quest.md`, `18-word-detective.md`, `19-sound-lab.md`, and `32-vocab-blitz.md`. Curriculum illustrations and comic panels are created in landscape formats (~4:3 or 16:9). Forcing images into square containers with `object-cover` amputates speech bubbles, character expressions, and focal narrative elements. Recommendation: Mandate widescreen containers (`~4:3` or `16:9`) with `object-contain` or balanced cover across all board templates.

- **The "Silent Start" / Missing Presentation Beat on Timed Games:** Observed in `27-spelling-bee.md`, `23-memory-lab.md`, and `19-sound-lab.md`. Countdown clocks begin ticking the exact millisecond a round mounts before pronunciation audio has played or students have oriented to the screen. For young EFL learners (ages 6–12), this creates cognitive panic and hasty guessing. Recommendation: Standardize a two-beat lifecycle across timed games: Beat 1 (Look & Listen, auto-play audio, clock paused) $\rightarrow$ Beat 2 (Active challenge, clock running).

## §4 Disposition

*(What we decided to do about each theme, and where the fix landed.)*
