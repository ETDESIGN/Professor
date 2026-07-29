/**
 * Shared unit-ownership check for content edge functions.
 *
 * WHY THIS EXISTS (Bug B1):
 * The three content functions previously had THREE different ownership checks:
 *   - enrich-unit / orchestrate-lesson:  `if (unit.teacher_id && unit.teacher_id !== auth.userId)`
 *     → tolerant of NULL owner (short-circuits), so textbook-created (NULL-owner)
 *       units could be enriched and orchestrated.
 *   - generate-exercises:                `if (!unit.teacher_id || unit.teacher_id !== auth.userId)`
 *     → strict, REJECTS NULL owner.
 * The asymmetry meant enrichment + orchestration SUCCEEDED for textbook units
 * while the fire-and-forget generate-exercises call was silently rejected — so
 * the exercise pool was never written (0 rows in objectives/pool_items for all
 * units, verified 2026-07-29). Any new emitter copy-pasting either pattern
 * could reintroduce the same class of bug.
 *
 * RESOLUTION:
 *  - The ROOT cause (NULL-owner units) is fixed at creation: UploadTextbook now
 *    stamps teacher_id (matching Engine.createUnit), and existing NULL-owner
 *    units are backfilled.
 *  - All content functions use THIS helper so there is exactly one ownership
 *    policy. The policy is STRICT (owner must match; NULL owner is rejected),
 *    matching generate-exercises — this is the guard that prevents an
 *    authenticated caller from triggering paid generation on a unit they don't
 *    own. Do NOT loosen it; fix NULL owners at the source instead.
 */

export interface OwnershipContext {
  /** The authenticated caller's user id (from authenticateRequest). */
  callerId: string | undefined;
}

export interface OwnershipResult {
  /** true if the caller is allowed to act on this unit. */
  ok: boolean;
  /** Human-readable reason when ok === false (safe to return to the client). */
  reason?: string;
}

/**
 * Assert that `callerId` may act on a unit owned by `ownerId`.
 *
 * Policy (strict — matches the original generate-exercises guard):
 *   - ownerId must be non-null AND equal callerId.
 *   - A NULL ownerId is REJECTED (legacy/unknown-owner units must be backfilled
 *     to a real teacher_id before they can drive paid generation).
 *
 * Returns { ok: false, reason } instead of throwing, so callers can surface a
 * clean error response.
 */
export function assertUnitOwnership(
  ownerId: string | null | undefined,
  ctx: OwnershipContext,
): OwnershipResult {
  if (!ctx.callerId) {
    return { ok: false, reason: 'Authentication required' };
  }
  if (!ownerId) {
    return { ok: false, reason: 'Unit has no owner (teacher_id is null)' };
  }
  if (ownerId !== ctx.callerId) {
    return { ok: false, reason: 'You do not own this unit' };
  }
  return { ok: true };
}
