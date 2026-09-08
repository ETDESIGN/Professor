// wheelChoreography — the single source of truth for the carnival picker wheel's
// spin/reveal timeline (spec: docs/superpowers/specs/2026-09-09-carnival-wheel-choreography-design.md).
//
// The authoritative deadline is live_state.revealAt (stamped by beginTurn as
// pick-time + SPIN_REVEAL_MS). Everything else derives from it on every tab:
//
//   pick ──SPIN_MS──▶ landAt (= revealAt − REVEAL_HOLD_MS) ──REVEAL_HOLD_MS──▶ revealAt
//                     wheel stops, winner card, confetti        overlay exits, turn starts
//
// Because components sample wall-clock against these deadlines, a tab that
// mounts mid-spin clamps straight to the correct phase instead of replaying a
// fake spin — cross-tab consistency with zero extra plumbing.

/** Pick → wheel stops. Includes the anticipation wind-back and the settle
 *  overshoot, which are baked into the curve below. Tuned against Stitch's
 *  4.5s cubic-bezier spin; 4.0s balances classroom pace. */
export const SPIN_MS = 4000;

/** Winner card on screen after the wheel stops (owner: the old ~500ms reveal
 *  was unreadably fast). Tap-anywhere-to-skip covers pace-sensitive teachers. */
export const REVEAL_HOLD_MS = 3000;

/** Pick → overlay dismisses + turn starts. This is what beginTurn stamps into
 *  live_state.revealAt — the E2.4 derived-reveal deadline. */
export const SPIN_REVEAL_MS = SPIN_MS + REVEAL_HOLD_MS;

/** The moment the wheel stops and the winner is revealed, for a given revealAt. */
export function landAtFor(revealAt: number): number {
  return revealAt - REVEAL_HOLD_MS;
}

/**
 * Normalized wheel rotation for spin progress `t ∈ [0,1]`: returns 0 → 1 with
 *   - an anticipation wind-back (dips below 0 during the first ANTICIPATION_T),
 *   - an ease-out-quart-style main travel (fast launch, long crawling tail so
 *     the last segments tick past the flapper one by one),
 *   - a settle overshoot past 1.0 (default ≈ +0.6% of travel, i.e. ~11° of a
 *     1800° spin) peaking near t≈0.9 and returning to EXACTLY 1.0 at t=1.
 *
 * The caller multiplies by the per-spin travel angle. Overshoot is a parameter
 * so callers can shrink it when the winner's segment is narrow (the pointer
 * must never wiggle across a divider into a neighbour's slice).
 */
const ANTICIPATION_T = 0.08;

export function spinAngle(
  t: number,
  opts: { overshoot?: number; windBack?: number } = {},
): number {
  const overshoot = opts.overshoot ?? 0.006;
  const windBack = opts.windBack ?? -0.006; // ≈ −10° of a 1800° spin
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  if (t < ANTICIPATION_T) {
    // Ease into the wind-back so the takeoff reads as a deliberate pull-back.
    const k = t / ANTICIPATION_T;
    return windBack * (1 - (1 - k) * (1 - k)); // easeOutQuad toward windBack
  }

  // Main travel from the wind-back position. u ∈ (0, 1].
  const u = (t - ANTICIPATION_T) / (1 - ANTICIPATION_T);
  // Map u onto the eased range [windBack → 1] then add the settle spring on top.
  const eased = windBack + (1 - windBack) * (1 - Math.pow(1 - Math.min(u, 1), 4));

  // Damped one-wiggle settle: peaks at u = 0.9, exactly 0 at u ∈ {0.8, 1}.
  // Only active in the final fifth so it never fights the launch.
  let settle = 0;
  if (u > 0.8) {
    const s = (u - 0.8) / 0.2; // 0 → 1 across the tail
    settle = overshoot * Math.sin(Math.PI * s);
  }
  return eased + settle;
}

/** Tick schedule helper (testing/inspection): approximate normalized angles at
 *  which a boundary crossing listener should expect motion to still be active.
 *  Not used by the runtime (the rAF loop derives crossings from the live
 *  angle); exported so the curve's character can be asserted cheaply. */
export function spinAngleSamples(n: number, opts?: { overshoot?: number; windBack?: number }): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(spinAngle(i / n, opts));
  return out;
}
