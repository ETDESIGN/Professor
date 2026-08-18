// sessionActionTypes.ts — the typed core action vocabulary (FIXPLAN P3.9,
// the lightweight FIXPLAN D).
//
// One source of truth for the actions SessionContext itself emits/handles on
// the `classroom_live` bus. `SessionActionType` stays an OPEN union
// (`(string & {})`): games' pass-through control actions (REVEAL_ANSWER,
// NEXT_ROUND, WM_SUBMIT_ANSWER, …) keep compiling unchanged — the full
// discriminated-union enforcement over every emitter remains available as a
// later step if drift shows up again.
//
// Consumers get autocomplete + typo protection on the CORE vocabulary, which
// is where a wrong string silently breaks cross-tab sync (e.g. the historic
// REVEAL vs REVEAL_ANSWER dead-button bugs).

import type { LiveTurnState } from './liveTurnState';

export interface SessionActionPayloadMap {
  // ── Turn lifecycle (SessionContext-owned) ─────────────────────────────
  SPIN_WHEEL: { targetId: string; overlay?: boolean; magic?: boolean };
  NEW_TURN: { studentId?: string | null; turnToken: string };
  GAME_WIN: { winnerId?: string | null };
  CLEAR_RESPONDER: undefined;
  DISMISS_WHEEL: undefined;
  CLOSE_OVERLAY: undefined;
  LIVE_STATE: { state: LiveTurnState; seq: number };
  // ── Scoring ───────────────────────────────────────────────────────────
  POINTS_AWARDED: { studentId: string; amount: number };
  MASS_PENALTY: { amount: number };
  // ── Session / modes ───────────────────────────────────────────────────
  END_SESSION: undefined;
  SHOW_LEADERBOARD: undefined;
  QUIET_MODE_CHANGED: { active: boolean };
  SELECTION_MODE_CHANGED: { mode: 'ROUND_ROBIN' | 'RANDOM' | 'FAIR' };
  TEAMS_ASSIGNED: { assignments: Record<string, string>; count?: number };
  // ── Effects / media ───────────────────────────────────────────────────
  CELEBRATE: undefined;
  WINNER_DECLARED: undefined;
  LIVE_SNAP: { image: string | null };
  SLIDE_COMPLETE: { forced?: boolean };
  // ── Drawing bus ───────────────────────────────────────────────────────
  DRAWING_START: { id: string; x: number; y: number; color: string };
  DRAWING_POINT: { id: string; x: number; y: number };
  DRAWING_END: { id: string };
  DRAWING_CLEAR: undefined;
}

/** Closed over the core vocabulary, open for game pass-through strings. */
export type SessionActionType = keyof SessionActionPayloadMap | (string & {});

/** Payload type for a known core action (any payload for pass-throughs). */
export type SessionActionPayload<T extends SessionActionType> =
  T extends keyof SessionActionPayloadMap ? SessionActionPayloadMap[T] : any;
