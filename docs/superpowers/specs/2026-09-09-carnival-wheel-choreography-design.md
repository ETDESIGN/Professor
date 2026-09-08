# Carnival Wheel — Spin & Reveal Choreography (2026-09-09)

Rebuild of the student picker wheel (QUICK_WHEEL overlay) and the picked-student
reveal. Owner complaints: the wheel animation was "ugly"; the winner-name reveal
lasted only ~0.5s. Goal: Duolingo-grade choreography with Stitch-produced art.

## Sources

- **Visual contract**: Google Stitch output in `/Users/ET/Documents/DEV/teacher app/stitch redesign wheel/stitch_classroom_spinner_game_screen/`
  — `who_s_next_student_picker_wheel_carnival_stage_style/` (spin screen: HTML+PNG),
  `winner_reveal_emma_s_turn/` (reveal screen: HTML+PNG),
  `carnival_quest_stage/DESIGN.md` (full design system: palette, Rubik/Nunito type,
  push-lip elevation, marquee bulbs). The Stitch markup is pure SVG/CSS — ported to
  React directly, **no pixel assets**.
- **Prior art in repo**: `BoardWheelOfDestiny.tsx` (in-slide wheel, framer-motion),
  `BoardOverlayLayer.tsx` (old QUICK_WHEEL bottom-sheet — replaced),
  `classroomboard-prototypes/07-wheel-reveal.html` (older keyframe ideas, superseded).

## Root causes being fixed

1. `SPIN_REVEAL_MS = 2500` dismissed the overlay while the wheel's local 2000ms spin
   had just shown the winner card → **500ms of winner**, hard-cut unmount.
2. Confetti fired at **dismissal** (E2.4 reveal setState) — celebration started as
   the winner card died.
3. Overlay wheel spun as color-only SVG slices (no names/avatars), one flat ease.
4. In-slide `BoardWheelOfDestiny` tweened 4s but was unmounted at 2.5s — spin never
   completed.
5. Remote `QuickSpinModal` / `LiveCommander` hardcoded their own 2000ms spin timers.

## Timeline (single source of truth: `services/wheelChoreography.ts`)

| Constant | Value | Meaning |
|---|---|---|
| `SPIN_MS` | 4000 | pick → wheel stops (incl. 300ms anticipation wind-back and settle overshoot baked into the curve) |
| `REVEAL_HOLD_MS` | 3000 | winner card on screen |
| `SPIN_REVEAL_MS` | 7000 | pick → overlay dismisses, turn starts (stamped as `live_state.revealAt`) |

Milestones:

- **landAt = revealAt − REVEAL_HOLD_MS** (derived; zero new plumbing). Wheel stops,
  winner modal slams in, **confetti fires here** (derived effect in SessionContext,
  once per turn token).
- **revealAt** — existing E2.4 derived reveal fires unchanged: overlay exits
  (animated), `currentTurnId` starts, compat `GAME_WIN`/`NEW_TURN`/`DISMISS_WHEEL`
  broadcasts from the turn-writer tab.
- **Tap anywhere = skip**: `skipWheelReveal()` → `updateLiveTurn({ revealAt: now })`
  → row CAS + realtime converge every tab; the original writer tab still emits the
  compat broadcasts when its re-scheduled E2.4 timer fires.

Cross-tab consistency: spin phase is sampled from wall-clock (`landAt − SPIN_MS`),
so a board refreshing mid-spin clamps to the correct phase instead of restarting a
fake spin. The stop-angle jitter is **deterministic per turn token** (`makeRng`) so
every tab lands identically.

## Spin curve (`spinAngle(t)`)

Pure, unit-tested. `t∈[0,1]` → normalized rotation (0→1), shaped like Stitch's
`cubic-bezier(0.15, 0.95, 0.35, 1)`: ~8% anticipation window dips negative
(wind-back ≈ −10° of travel), then ease-out-quart-style main travel, a settle
overshoot peaking past 1.0 near t≈0.9 and returning to exactly 1.0 at t=1.
Overshoot magnitude scales with segment angle (clamped 2–11°) so the pointer always
stays inside the winner's segment.

The overlay drives rotation via **rAF + direct DOM style writes** (no per-frame
React state): wedge index under the flapper is computed each frame; every crossing
kicks the flapper (Web Animations API wiggle) and plays a synthesized tick.

## `QuickWheelOverlay.tsx` (new; replaces BoardOverlayLayer's QUICK_WHEEL branch)

**Spin state** (Stitch spin screen): navy `#0a1030` backdrop + glow blobs +
floating SVG confetti (`float-subtle`); marquee card (6px gold border, carnival
glow, faint sunburst ≤15%); badge "WHO'S NEXT? • 谁来下一个？"; wheel =
gold-gradient rim + 16 alternating LED bulbs (chase while spinning), SVG candy
wedges (`#e11d48 #0ea5e9 #10b981 #eab308 #a855f7 #ec4899 #6366f1 #f97316`) with
4px white dividers, real `<Avatar/>` per wedge + first name (names ≤12 students,
avatars only above; avatar size scales down with count), layered gold hub + star,
gold flapper SVG at 12 o'clock.

**Reveal state** (Stitch reveal screen, at landAt): wheel assembly dims/blurs/
scales behind (opacity-40 / blur-3px / scale-65, 700ms CSS transition) + gold
winner arrow; vignette; winner modal with bouncing "👑 SELECTED!" crown badge,
avatar in gold-gradient ring with 4 bulb rivets + winner-segment-color inner +
segment corner badge, name "⭐ NAME ⭐" tilted −2.5° (Rubik 900, white, gold
`-webkit-text-stroke`, `0 6px 0 #92400e` drop), "Your Turn! 轮到你了！" pill.
Framer-motion entrance: container spring; avatar scale 0.2→1 rotate −180°→0
(delay .1); name slam `cubic-bezier(.34,1.56,.64,1)` (delay .22); badge spring
(delay .4). Exit via `AnimatePresence` fade+scale 300ms (no hard cut).

Mute chip (top-right) — persisted `localStorage`.

## Sound (`apps/board/wheelSound.ts`, new)

WebAudio-synthesized (no assets/network): quiet square-wave tick per segment
crossing (pitch wobbles ±), triangle-wave rising arpeggio pop at land. Muted by
`localStorage` flag; AudioContext resume-on-first-interaction; silent no-op when
suspended or `window` undefined (tests).

## SessionContext changes

- Import constants (delete local `SPIN_REVEAL_MS = 2500`).
- New derived **land effect**: at `revealAt − REVEAL_HOLD_MS` set
  `confettiTrigger` once per token (celebrated-tokens ref Set, trimmed). Fires on
  late mounts inside the hold window; skipped if mounted after the reveal deadline.
- E2.4 reveal setState: **remove** `confettiTrigger` line (confetti now at land).
- New context method `skipWheelReveal()` (guarded on pending turn) → CAS-patches
  `revealAt = now`.
- Everything else (pick fairness, CAS machinery, live_state schema) untouched.

## Peripheral alignment

- `BoardWheelOfDestiny` (in-slide): tween duration → `SPIN_MS`; idle-rotation
  gated while awaiting GAME_WIN (stops the post-landing creep); local
  `triggerConfetti()` removed from the GAME_WIN handler (land effect owns it).
  Deliberately NOT restyled to Stitch in this pass.
- `QuickSpinModal` + `LiveCommander`: hardcoded 2000 → `SPIN_MS`.
- Fonts: Rubik (400–900) + Nunito Sans added to `index.html` + `teacher.html`
  Google Fonts links; `rubik` key in the **effective** (second) `fontFamily`
  block of `tailwind.config.js` — the first block is dead (duplicate key).
- `BoardOverlayLayer`: QUICK_WHEEL branch delegates to
  `<AnimatePresence><QuickWheelOverlay/></AnimatePresence>`; point/penalty/quiet
  popups untouched.

## Tests

- New `test/wheelChoreography.test.ts`: curve endpoints (0→0, 1→1 exact), early
  dip < 0, monotonic after anticipation, overshoot > 1 then settle, constants
  sum, `landAtFor`.
- `test/LiveSyncTwoTab.test.tsx`: import `SPIN_REVEAL_MS`; replace `2500`
  assertion and `settle(2600)` waits with constant-derived values.

## Deploy & PWA

Pure frontend — push to master (Vercel auto-deploy), no Supabase changes. After
deploy, hard-reload the board once (stale service worker masks the change);
after that, the update prompt handles it (AGENTS.md §8.1).
