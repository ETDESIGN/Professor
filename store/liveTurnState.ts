// liveTurnState.ts — the authoritative live-turn shape (FIXPLAN E Phase 2).
//
// Pure helpers only (no React, no Supabase) so they are unit-testable and
// importable from both SessionContext and tests. The classroom_sessions row
// carries this as `live_state` JSONB + a `seq` compare-and-swap counter; the
// broadcast channel carries the same snapshot as the fast path
// ({ type: 'LIVE_STATE', payload: { state, seq } }).
//
// What deliberately does NOT live here: game micro-state (deterministic from
// the Phase 1 seeded rng), drawings (high-frequency), points (ledger + POINTS_
// AWARDED broadcast), leaderboard flashes (transient UI).

export interface LiveTurnState {
  /** The picked responder (roster student id). Null = choral/practice mode. */
  responderId: string | null;
  /** Unique per-turn token (games key their reset on currentTurnId). */
  turnToken: string | null;
  /** Writer-clock Date.now() when the pick was made. */
  turnStartedAt: number | null;
  /** When every tab may reveal (dismiss wheel + start the turn). Derived
   *  locally on each tab — no mid-chain broadcast dependency (audit §3.4). */
  revealAt: number | null;
  /** Turn-related overlay only. LEADERBOARD is a transient flash and stays
   *  broadcast-only so a refresh can't resurrect it. */
  overlay: 'NONE' | 'QUICK_WHEEL';
  /** Deal-reset nonce (per-turn variety, 2026-08-30): bumped on every
   *  RESET_GAME and persisted here so every tab — including one mounting
   *  mid-lesson — seeds the same deal arrangement. */
  resetCount: number;
  quietMode: boolean;
  selectionMode: 'ROUND_ROBIN' | 'RANDOM' | 'FAIR' | null;
  /** studentId → team color (Phase A.3 team assignment). */
  teams: Record<string, string> | null;
}

export const EMPTY_LIVE_TURN: LiveTurnState = {
  responderId: null,
  turnToken: null,
  turnStartedAt: null,
  revealAt: null,
  overlay: 'NONE',
  resetCount: 0,
  quietMode: false,
  selectionMode: null,
  teams: null,
};

/** Key-wise merge where the PATCH always wins, including explicit nulls
 *  (null is a meaningful "clear" in this shape). Unknown incoming keys are
 *  dropped so a stale tab never injects fields the current build ignores. */
export function mergeLiveTurn(base: LiveTurnState, patch: Partial<LiveTurnState>): LiveTurnState {
  const out: LiveTurnState = { ...base };
  for (const key of Object.keys(EMPTY_LIVE_TURN) as (keyof LiveTurnState)[]) {
    if (patch[key] !== undefined) {
      (out as any)[key] = patch[key];
    }
  }
  return out;
}

/** Parse a classroom_sessions row's live columns. Tolerates pre-migration
 *  rows (no live_state / no seq) by yielding the empty state at seq 0. */
export function rowToLiveTurn(row: any): { live: LiveTurnState; seq: number } {
  const raw = row?.live_state;
  if (!raw || typeof raw !== 'object') return { live: { ...EMPTY_LIVE_TURN }, seq: Number(row?.seq ?? 0) };
  return { live: mergeLiveTurn({ ...EMPTY_LIVE_TURN }, raw), seq: Number(row?.seq ?? 0) };
}

/**
 * A turn token derived from the row's seq: globally unique per session
 * (every live-state write bumps seq), unlike the old per-tab turnSeqRef
 * counter which could repeat across commander and remote (audit §3.5 note).
 */
export function turnTokenFor(studentId: string, nextSeq: number): string {
  return `${studentId}::${nextSeq}`;
}
