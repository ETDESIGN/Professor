# Live Board — Fixed 16:9 Stage Design (2026-09-15)

Owner-approved 2026-09-15 (approach A + "true replica" commander preview). Supersedes the implicit "responsive reflow" model for the classroom board.

## Problem

On iPad mini, iPhone, and narrow desktop windows, live-board elements clip out of the canvas (half or more of an element invisible). The board is a **projection surface**: it is always shown on (or mirrored to) a big 16:9 screen, so its job is to keep one identical composition at every size — like a presentation slide — not to reflow like a website.

Three compounding root causes (audit 2026-09-15, all 35 templates + shell + overlays read):

1. **The canvas never scales.** `ClassroomBoard.tsx:86` wraps content in `aspect-video w-full max-h-screen`; everything inside is fixed-px for a ~1280×720 design point (BoardShell: 240px rail, 100px footer, 108px bottom pad, 280px footer right-pad). At 1133px (iPad mini landscape) or 390px (iPhone) those chunks are proportionally huge and the rest clips. `max-h-screen` also lets the "16:9" box deform on short-wide viewports.
2. **No design width anywhere — the same game renders at different logical sizes per surface.** The Commander preview renders games through `w-[200%] transform scale-50` (`LiveCommander.tsx:358`) ≈ 2048 logical px, where nothing ever clips. Fine-in-preview / broken-on-projector is the same disease pointing the other way.
3. **Two template generations with an unhandled middle band.** 22 games-v3 templates are fluid with a phone floor keyed to `@media (max-height:450px)` of the *browser viewport*; 13 legacy screens have zero adaptivity and hard px minimums (GameArena ≈1240px wide, OverlayLayer `text-[10rem]` popups and 500px quiet gauge, SpeedQuiz, StorySequencing…). iPad-mini and half-size desktop windows sit between the phone floor and the 1280 design point: no compact mode fires, fixed chrome eats ~350–470px, content clips. All responsive code keys off the viewport, never the actual canvas box.

## Decision

**The board is a fixed 1280×720 logical stage, uniformly scaled (presentation model).** One composition, rendered identically on every device, letterboxed inside any viewport via a single CSS transform. Nothing inside the stage is "responsive" anymore.

- `/board` renders the stage fullscreen.
- The Commander preview renders the **exact same stage** (true replica incl. BoardShell chrome) — owner choice 2026-09-15. The Commander's own layout/controls/responsiveness are **untouched** (controls correctly stay responsive; only the preview picture changes).
- Rejected: container-query fluid board (weeks of redesign × 35 templates, every future game designed twice, and layout would *vary by device* — variance between teacher and class screens is a bug for a projected classroom tool, not a feature).
- Deferred: an explicit phone-direct compact variant (`stageVariant='compact'`) if "teacher reads the board on the phone itself" ever becomes a real need. One composition for now.

## Design

### 1. `components/shared/BoardStage.tsx` — the scaling primitive

- Props: `children`, optional `className`. Exports `STAGE_W = 1280`, `STAGE_H = 720`.
- Renders a full-size letterbox container (black) + centered inner div sized exactly `1280×720` with `transform: scale(k)`, `k = min(w/1280, h/720)` — measured from the container via `ResizeObserver` (initial measure synchronously in `useLayoutEffect`, no flash). No upscale cap: a 1920×1080 projector renders k = 1.5, text stays vector-crisp under transform.
- Inner div sets `container-type: size; container-name: stage;` and exposes `--stage-scale: k`. Consequence: container queries and `cqw/cqh` units inside the stage always evaluate at 1280×720 → deterministic across all devices, and available to future templates (BoardWordSearch already uses this pattern on its own grid — unaffected).
- At exactly 1280×720, k = 1 → the stage is a **no-op**: existing desktop appearances and e2e at Playwright's default viewport are pixel-identical.

### 2. `apps/board/BoardCanvas.tsx` — the shared content tree

Extract exactly what lives inside today's `aspect-video` box (`ClassroomBoard.tsx:86-131`) into one component: `ConfettiSystem`, non-interactive `DrawingLayer`, `BoardOverlayLayer`, `ClassWeakBanner`, `ClassLeaderboard` overlay, live-snap overlay, `BoardShell` + the `AnimatePresence` game renderer.

- `ClassroomBoard` keeps its NO SIGNAL / Initializing / empty-flow states (fullscreen, responsive — utility screens, not classroom content). The live view becomes: fullscreen black centering div → `BoardStage` → `BoardCanvas`.
- **Portrait hint**: when the viewport is portrait (`aspect < 1`), show a small dismissible "Rotate for the big classroom view" banner over the letterbox. The stage still renders (geometrically correct, just small).

### 3. Commander preview → true replica (`LiveCommander.tsx:335-380`)

Replace the `w-[200%] h-[200%] origin-top-left transform scale-50` + `BoardRenderer` block with `BoardStage` + `BoardCanvas`. The preview now shows precisely what the class sees: game + leaderboard rail + whose-turn footer + phase badge, at projector scale.

- The Commander's own LIVE/PEN badges, pen/color controls, and interactive `DrawingLayer` stay as overlays **outside/above** the stage — untouched.
- Drawing coincidence: strokes are stored in SessionContext as 0–1 ratios and rendered as SVG percentage coords (`DrawingLayer.tsx:33,75-77`), so the commander's interactive layer and the replica's non-interactive layer coincide exactly at any scale. Pen-width note (decided at implementation): both layers draw the same ratio-based strokes, so they coincide exactly. The Commander's overlay stroke renders at viewport px while the replica's renders scale-multiplied — the same harmless difference that exists between the two surfaces today, so `DrawingLayer` is deliberately left untouched.

### 4. Template sweep — mechanical, no redesigns

Rule (also added to `LIVE_GAME_LIFECYCLE.md` as a wiring constraint): **nothing inside a Board* template may key off the browser viewport.** No viewport media queries, no `vh/vw/vmin`, no `window.innerWidth/innerHeight`. Size in stage px, or `cqw/cqh` against the stage container. The stage is always 1280×720, so all existing desktop-branch values are the truth.

- **Remove** the 19 `@media (max-height:450px)` phone-floor blocks — under the stage they evaluate against the *device* viewport and would mutate a fixed-size stage unpredictably.
- **Collapse** `sm:/md:/lg:` variants to their `lg` branch (e.g. `pl-32 lg:pl-48` → `pl-48`; `grid-cols-2 md:grid-cols-4` → `grid-cols-4`; `flex-col sm:flex-row` → `flex-row`).
- **Replace viewport units** (exhaustive list from audit): `BoardMediaPlayer.tsx:255` `max-h-[calc(100vh-100px)]` → `max-h-full`; `BoardWhatsMissing` `70vh/55vh` caps → stage px (≈504/396) or `max-h-full`; `BoardDialogueStage.tsx:586` `max-h-[60vh]` → stage px; `QuickWheelOverlay.tsx:226,264,388` `94vw/56vmin/92vw` → the px caps they already intend (860/480/720).
- **`ConfettiSystem.tsx`**: size the canvas from its container (`offsetWidth/offsetHeight`, ResizeObserver) instead of `window.innerWidth/innerHeight` — the only overlay hard-wired to the window.
- **`ClassLeaderboard.tsx`**: add `max-h` + `overflow-y-auto` to the ranked list — a real bug at any size (rosters > ~6 students overflow; the shell's rail already scrolls, the overlay doesn't).
- **Keep as-is**: legacy fixed-px templates (GameArena, IntroSplash, SpeedQuiz, OverlayLayer popups/gauge, etc.) — they were *designed* for 1280×720 and the stage restores that; `BoardWordSearch` container queries (container-relative = stage-stable); `BoardWheelOfDestiny` JS wheel size (roster-count-based, not viewport).
- Sweep gate: a tiny npm script (`npm run board:stage-check`) that fails on viewport-keyed patterns (`vh|vw|vmin|@media|max-height:450|innerWidth`) under `apps/board/` outside BoardStage — run in CI with the existing test step; spot-check every `position: fixed` usage (a transformed ancestor makes them stage-relative — desired, e.g. ClassRally's milestone overlay) and any framer-motion `layout`-prop usage inside templates.

### 5. What deliberately does NOT change

Commander layout/controls/responsiveness; `/remote`; BoardShell chrome proportions at stage scale; DrawingLayer storage protocol; the "Live Screen" popup button (`window.open('/board', width=1280,height=720)` now lands at exactly k = 1). Backend untouched — **frontend-only, Vercel deploy, no edge functions, no migrations.**

## Testing

- **Unit** (vitest): the scale computation as a pure function (letterbox math, portrait/landscape, k=1 at 1280×720, upscale 1.5 at 1920×1080).
- **Playwright viewport matrix** on `/board`: 1280×720, 1133×744 (iPad mini landscape), 744×1133 (portrait), 844×390 (iPhone landscape), 390×844 (portrait), 900×800 (narrow desktop). For representative games (GAME_ARENA — worst legacy, SPEED_QUIZ, WORD_SEARCH, TEAM_BATTLE, STORY_STAGE_AG) and overlays (points popup, quiet gauge, leaderboard overlay): assert the stage box fits the viewport (no document overflow) and screenshot.
- Screenshot parity at 1280×720 pre/post change (stage is a no-op there).
- Owner manual pass: iPad mini → projector mirror, and desktop half-window resize.

## Risks

- **Framer-motion under transform**: transforms are GPU-composited; only `layout`-prop animations measure post-transform — the sweep spot-checks the (few) usages.
- **iOS Safari**: transform-scaled text renders crisp at device pixel ratio; ResizeObserver handles the dynamic viewport (URL bar) better than the current `w-full max-h-screen`.
- **Double DrawingLayer in the replica**: coincide by ratio geometry; only stroke-width needs the `--stage-scale` multiplier noted above.
- **Hit-testing**: clicks pass through CSS transforms correctly; board templates' `onClick` handlers keep working (targets get physically smaller on small screens — acceptable, the board is display-first; control lives in the Commander/Remote).

## Rollout

Single frontend PR → push to master → Vercel auto-deploy. No feature flag needed: k = 1 is a no-op at desktop sizes; behavior changes only where it was broken. Owner verifies on real hardware before class use.
