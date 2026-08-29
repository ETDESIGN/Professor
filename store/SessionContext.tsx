import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
import { Engine, LessonUnit } from '../services/SupabaseService';
import { supabase } from '../services/supabaseClient';
import { getTeacherStudents, getSessionRoster, awardClassPoints, StudentWithProgress } from '../services/DataService';
import { mergePresence, filterPresent } from '../services/attendanceLogic';
import { getOrCreateActiveOccurrence, endOccurrence, getAttendanceForOccurrence } from '../services/AttendanceService';
import { createClientLogger } from '../services/logger';
import { toast } from 'sonner';
import {
  LiveTurnState,
  EMPTY_LIVE_TURN,
  mergeLiveTurn,
  rowToLiveTurn,
  turnTokenFor,
} from './liveTurnState';
import type { SessionActionType } from './sessionActionTypes';

const log = createClientLogger('SessionContext');

/** Tiny debounce (avoids a lodash dependency). */
function debounce<T extends (...args: any[]) => void>(fn: T, wait: number): T {
  let t: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  }) as T;
}

type SessionStatus = 'IDLE' | 'LIVE' | 'PAUSED';
// Phase 8 (Prompt 10 §2): ELIMINATION retired — zero current use (audit §I).
// The sidebar now exposes all three meaningful modes honestly with
// teacher-facing labels, ROUND_ROBIN flagged as the default.
type SelectionMode = 'ROUND_ROBIN' | 'RANDOM' | 'FAIR';

interface SessionAction {
  /** FIXPLAN P3.9 — typed over the core vocabulary (store/sessionActionTypes),
   *  open for game pass-through strings. */
  type: SessionActionType;
  payload?: any;
  timestamp: number;
  /** FIXPLAN E1.9/E1.10 — stamped by broadcastAction: who sent this (userId:surface)
   *  and a per-tab monotonic id. Old envelopes without these still apply (the
   *  staleness guard skips unattributed actions). */
  senderId?: string;
  actionId?: number;
}

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingStroke {
  id: string;
  color: string;
  width: number;
  points: DrawingPoint[];
  isComplete: boolean;
}

/** Wheel-reveal choreography constant (FIXPLAN E2.4): the picked student is
 *  revealed (overlay dismissed, turn started, games reset) this many ms after
 *  the pick. Every tab derives it from live_state.revealAt — no mid-chain
 *  broadcast from a single tab that could die mid-spin. */
const SPIN_REVEAL_MS = 2500;

interface SessionState {
  status: SessionStatus;
  currentStepIndex: number;
  activeSlideData: any;
  activeUnit: LessonUnit | null;
  /** The class currently "live" — drives the roster-first student list. Null = legacy
   *  fallback (all teacher students). */
  activeClassId: string | null;
  /** FIXPLAN I — the class plan currently being taught, when the session is a
   *  CLASS session (doc 11 #8: the board is strictly the current class's
   *  material). Null = whole-unit session (legacy behavior). The flow shown is
   *  class_plans.flow; content_index.objective_ids scopes every pool pull. */
  activeClassPlan: { id: string; unit_id: string; title: string; released_at: string | null; content_index: any; flow?: any[] } | null;
  /** The open attendance occurrence for this live session (null until go-live / ensure). */
  activeOccurrenceId: string | null;
  students: any[];
  pointsLog: any[];
  selectionHistory: string[];
  selectionMode: SelectionMode;
  /** Strict round-robin: students who have already had a turn THIS exercise.
   *  Reset when the step/exercise changes. Guarantees every kid goes once before
   *  anyone repeats (locked decision 0.1.1). */
  turnsThisExercise: string[];
  isConnected: boolean;
  liveSnapImage: string | null;
  lastAction: SessionAction | null;
  drawings: DrawingStroke[];
  confettiTrigger: number;
  activeOverlay: 'NONE' | 'QUICK_WHEEL' | 'LEADERBOARD';
  quickWheelWinner: string | null;
  /**
   * Game-lifecycle signal (workstream: pick → reset → score → next). Each time
   * a fresh responder comes up via the wheel (NEW_TURN action), this changes.
   * Game templates key a reset effect on this value so they start a clean
   * attempt for the new student. Null in choral/practice mode (no responder).
   * Cleared on CLEAR_RESPONDER / CLOSE_OVERLAY / slide change. */
  currentTurnId: string | null;
  quietModeActive: boolean;
  noiseLevel: number;
  units: LessonUnit[];
  score?: number;
  totalCorrect?: number;
  totalAttempts?: number;
  sessionId?: string | null;
  /** Coverage ledger (live board word rotation): dealt_objectives mirrored
   *  from the session row, keyed by unitId — hydrates useCoverageLedger. */
  dealtObjectives?: Record<string, string[]> | null;
  /** Same-session remediation queue (architecture §3.3): objectives missed
   *  by ≥1 student this session, prioritized by the next WRAPUP/REVIEW slide's
   *  round-builder. Deliberately separate from FSRS cross-lesson scheduling. */
  remediationQueue: RemediationEntry[];
  /** Timestamp (ms) the current session started — scopes analytics queries. */
  sessionStartedAt?: number | null;
  /** FIXPLAN E1.10 — ring of the last 20 actions this tab sent or received.
   *  `lastAction` remains the newest action (existing consumers unchanged);
   *  the ring is for desync debugging and future reliable consumers. */
  recentActions: SessionAction[];
  /** FIXPLAN E1.8 — channel-B (classroom_sessions postgres_changes) health.
   *  The board's NO SIGNAL gate requires this alongside isConnected. */
  sessionSyncHealthy: boolean;
  /** FIXPLAN E1.8 — channel-C (roster/points) health. Advisory only: a lagging
   *  roster reconciles on the next ledger event and must not blank the board. */
  rosterSyncHealthy: boolean;
  /** FIXPLAN E1.7 — set when a session-row persist failed all retries; the
   *  commander shows a "board may be behind — resync" banner until it clears. */
  syncError: 'slide-persist-failed' | null;
  /** FIXPLAN E2.4 — derived-reveal deadline for the in-flight spin (from
   *  live_state.revealAt). When Date.now() passes it, every tab applies the
   *  reveal locally (turn starts, overlay dismisses) without waiting for a
   *  broadcast from the picking tab. */
  turnRevealAt: number | null;
  /** The turn token that becomes currentTurnId at reveal time (applied by the
   *  reveal effect, NOT immediately — games must reset at reveal, not at pick). */
  pendingTurnToken: string | null;
}

/** A missed objective on the same-session remediation queue. */
export interface RemediationEntry {
  objectiveId: string;
  /** Roster student ids who missed it (for the struggling-students view). */
  missedBy: string[];
  lastMissedAt: number; // Date.now()
}

/**
 * FIXPLAN E2.5 — the ONE slide-transition computation, shared by goToSlide
 * (local navigation) and applySessionRow (realtime sync). Previously two
 * hand-mirored paths drifted (bug 028d3ce: the responder cleared on one path
 * but survived on the other). Same-index re-entry preserves the pick, ink,
 * and overlay; an actual slide change resets the per-exercise round-robin,
 * the responder/turn, and the overlays/ink.
 */
export function computeSlideState(
  prev: SessionState,
  flow: any[],
  index: number,
): SessionState {
  const slideChanged = index !== prev.currentStepIndex;
  return {
    ...prev,
    currentStepIndex: index,
    activeSlideData: flow[index] ?? null,
    turnsThisExercise: slideChanged ? [] : prev.turnsThisExercise,
    quickWheelWinner: slideChanged ? null : prev.quickWheelWinner,
    currentTurnId: slideChanged ? null : prev.currentTurnId,
    turnRevealAt: slideChanged ? null : prev.turnRevealAt,
    pendingTurnToken: slideChanged ? null : prev.pendingTurnToken,
    activeOverlay: slideChanged ? 'NONE' : prev.activeOverlay,
    drawings: slideChanged ? [] : prev.drawings,
  };
}

// Map StudentWithProgress to the format expected by components
const mapStudent = (s: StudentWithProgress) => ({
  id: s.id,
  name: s.full_name || s.email || 'Unknown',
  avatar: s.avatar_url || '',
  email: s.email,
  student_id: s.student_id,
  xp: s.xp,
  streak: s.streak,
  points: s.xp, // For compatibility with components expecting 'points'
  team: undefined as string | undefined, // Phase A.3: assigned by the Team Builder
});

// Team palette (red/blue/green/...). Phase A.3 — real team assignment.
export const TEAM_COLORS = ['red', 'blue', 'green', 'amber', 'purple', 'pink'];

export interface SessionContextType {
  state: SessionState;
  loadUnits: () => Promise<void>;
  loadStudents: () => Promise<void>;
  /** Bind the live session to a class (roster-first). Persists class_id on the
   *  classroom_sessions row and (re)loads that class's roster. */
  setActiveClass: (classId: string | null) => Promise<void>;
  /** stageId is the student-path (solo) extension: scope the lesson to one
   *  node. The live teacher implementation ignores it. */
  setActiveUnit: (unitId: string, classPlanId?: string) => Promise<void>;
  /** Ensure an attendance occurrence exists for the live class (for opening the
   *  attendance modal before go-live). Returns the occurrence id or null. */
  ensureAttendanceOccurrence: () => Promise<{ id: string | null; error: string | null }>;
  saveUnit: (unitId: string, updates: Partial<LessonUnit>) => Promise<void>;
  startSession: () => void;
  endSession: () => void;
  /** FIXPLAN E1.7 — banner action: re-persist the current slide after a
   *  failed session-row write so the board converges. */
  retrySync: () => void;
  nextSlide: () => void;
  prevSlide: () => void;
  goToSlide: (index: number) => void;
  addPoints: (studentId: string, amount: number) => void;
  deductAllPoints: (amount: number) => void;
  toggleConnection: () => void;
  setLiveSnap: (image: string | null) => void;
  triggerAction: (type: string, payload?: any) => void;
  selectNextStudent: (filterTeam?: string, useOverlay?: boolean) => void;
  magicSelectStudent: (studentId: string) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  /** Phase A.3: form N balanced teams from the roster (broadcasts to all devices). */
  assignTeams: (count?: number) => void;
  closeOverlay: () => void;
  /** Hide the wheel overlay without ending the turn (responder stays live). */
  dismissWheel: () => void;
  /** Fully cancel the current turn (hide overlay + clear responder). */
  cancelTurn: () => void;
  /** Clear the current responder and immediately spin for the next one. */
  nextStudent: () => void;
  startDrawing: (x: number, y: number, color?: string) => void;
  addDrawingPoint: (x: number, y: number) => void;
  endDrawing: () => void;
  clearDrawings: () => void;
  triggerConfetti: () => void;
  setQuietMode: (active: boolean) => void;
  updateNoiseLevel: (level: number) => void;
  unlockNextLevel: (currentUnitId: string) => Promise<void>;
  /** Per-student board capture (Phase 3.3): record a teacher Correct/Wrong grade
   * for the selected student on a vocab item into the shared LearnerState. */
  gradeStudent: (studentId: string, word: string, correct: boolean) => Promise<void>;
  /** Same-session remediation (architecture §3.3): push an objective a student
   *  just missed onto the queue the next WRAPUP/REVIEW slide will prioritize.
   *  Idempotent per (objectiveId, studentId) within a turn. */
  pushToRemediation: (objectiveId: string, studentId: string) => void;
  /** Read the current remediation queue (weakest-first, most-recent-miss tiebreak).
   *  Does NOT clear — use drainRemediation when a WRAPUP/REVIEW slide consumes it. */
  getRemediationQueue: () => RemediationEntry[];
  /** Pop + return the queued objective ids (clears the queue). Called by a
   *  WRAPUP/REVIEW slide's round-builder when it consumes the queue. */
  drainRemediation: () => string[];
}

export const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<SessionState>({
    status: 'IDLE',
    currentStepIndex: 0,
    activeSlideData: null,
    activeUnit: null,
    activeClassId: null,
    activeClassPlan: null,
    activeOccurrenceId: null,
    students: [],
    pointsLog: [],
    selectionHistory: [],
    selectionMode: 'ROUND_ROBIN',
    turnsThisExercise: [],
    isConnected: false,
    liveSnapImage: null,
    lastAction: null,
    drawings: [],
    confettiTrigger: 0,
    activeOverlay: 'NONE',
    quickWheelWinner: null,
    currentTurnId: null,
    quietModeActive: false,
    noiseLevel: 0,
    units: [],
    sessionId: null,
    dealtObjectives: null,
    remediationQueue: [],
    sessionStartedAt: null,
    recentActions: [],
    sessionSyncHealthy: false,
    rosterSyncHealthy: false,
    syncError: null,
    turnRevealAt: null,
    pendingTurnToken: null,
  });

  const [currentStrokeId, setCurrentStrokeId] = useState<string | null>(null);
  const channelRef = useRef<any>(null);
  const activeUnitRef = useRef<LessonUnit | null>(null);
  // ── Spin-cycle guard rails ────────────────────────────────────────────────
  // One physical spin = pick → (2.5s derived reveal, E2.4) → turn starts.
  // Without the in-flight guard a double-tap on "Next Student" ran the whole
  // cycle twice (round-robin bookkeeping double-appended). The reveal itself
  // is derived on every tab from live_state.revealAt — no picking-tab timer
  // chain remains, and a slide change mid-spin clears the reveal state (the
  // reveal effect's cleanup drops its pending timeout).
  const spinInFlightRef = useRef(false);
  /** Legacy timer registry — no longer populated by the pick path (E2.4);
   *  kept so cancelSpinTimers stays a safe no-op for its existing callers. */
  const spinTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Last step index this tab synced via applySessionRow (slide-change detection). */
  const lastSyncedStepRef = useRef<number | null>(null);
  const cancelSpinTimers = () => {
    spinTimeoutsRef.current.forEach(clearTimeout);
    spinTimeoutsRef.current = [];
    spinInFlightRef.current = false;
  };

  // ── FIXPLAN E1.8/E1.9/E1.10 — sync hardening refs ─────────────────────────
  /** Monotonic per-tab action id (E1.10). */
  const actionSeqRef = useRef(0);
  /** `userId:surface` stamped on every broadcast (E1.9) — the staleness guard
   *  orders per (sender, type) so cross-device clock skew can't drop fresh
   *  actions from another tab. */
  const senderIdRef = useRef('');
  const lastTsBySenderTypeRef = useRef<Map<string, number>>(new Map());
  /** Newest updated_at this tab has applied from classroom_sessions (E1.9). */
  const lastRowTsRef = useRef(0);
  /** Channel-resubscribe debouncing (≥3s between attempts per channel). */
  const resubscribeLastRef = useRef<Map<string, number>>(new Map());
  const scheduleChannelResubscribe = useCallback((channel: any, key: string) => {
    if (!channel) return;
    const now = Date.now();
    const last = resubscribeLastRef.current.get(key) ?? 0;
    if (now - last < 3000) return;
    resubscribeLastRef.current.set(key, now);
    log.warn('channel_resubscribe_scheduled', { metadata: { key } });
    // Small delay so a flapping socket doesn't get an immediate re-hit.
    setTimeout(() => { try { channel.subscribe(); } catch { /* socket gone — next status event re-schedules */ } }, 1000);
  }, []);

  // ── FIXPLAN E2 — authoritative live turn state ────────────────────────────
  /** Mirror of the current LiveTurnState (merged base for optimistic writes). */
  const liveTurnRef = useRef<LiveTurnState>({ ...EMPTY_LIVE_TURN });
  /** Last applied classroom_sessions.seq — the live-state ordering guard. */
  const liveSeqRef = useRef(0);
  /** Last applied dealt_objectives signature (coverage ledger) — dedupes
   *  postgres_changes re-deliveries so slide moves don't churn renders. */
  const dealtSigRef = useRef<string | null>(null);
  /** Last slide index whose arrival cleared the local live-turn mirror
   *  (dedupe so repeated same-index syncs don't re-clear). */
  const liveTurnSlideRef = useRef<number | null>(null);
  /** True on the tab that started the in-flight turn: only that tab emits the
   *  legacy GAME_WIN/NEW_TURN/DISMISS_WHEEL compat broadcasts at reveal. */
  const turnWriterIsLocalRef = useRef(false);
  /** FIXPLAN E2.6 — exact per-sender ordering: drop duplicate/replayed
   *  actionIds (the timestamp guard only catches same-type reordering). */
  const lastActionIdBySenderRef = useRef<Map<string, number>>(new Map());

  // Class-points ledger accumulator (debounced flush). Keyed by roster student id.
  const pendingPointsRef = useRef<Record<string, number>>({});
  const activeClassIdRef = useRef<string | null>(null);
  useEffect(() => { activeClassIdRef.current = state.activeClassId; }, [state.activeClassId]);
  /** FIXPLAN I — cache-first class-plan loader (classroom_sessions rows carry
   *  class_plan_id; every tab resolves the same plan through applySessionRow). */
  const classPlanCacheRef = useRef<Map<string, any>>(new Map());
  const fetchClassPlan = useCallback(async (id: string) => {
    const cached = classPlanCacheRef.current.get(id);
    if (cached) return cached;
    const { data, error } = await supabase
      .from('class_plans')
      .select('id, unit_id, title, released_at, content_index, flow, flow_generated_at')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    classPlanCacheRef.current.set(id, data);
    return data;
  }, []);
  // Ref mirror of loadStudents so setActiveClass (a useCallback with [] deps,
  // defined below) can call the latest loadStudents without capturing a stale
  // closure from the first render.
  const loadStudentsRef = useRef<() => Promise<void>>(async () => {});
  const activeOccurrenceIdRef = useRef<string | null>(null);
  const flushClassPoints = useRef(
    debounce(async () => {
      const snapshot = { ...pendingPointsRef.current };
      pendingPointsRef.current = {};
      const classId = activeClassIdRef.current;
      await Promise.all(
        Object.entries(snapshot).map(([rosterId, amount]) =>
          awardClassPoints(rosterId, classId, amount, 'board_points')
            .catch((err: any) => {
              // FIXPLAN H3: awardClassPoints now throws after one retry —
              // tell the teacher the points were lost instead of failing
              // silently (the award can be re-tapped).
              log.error('ledger_flush_failed', { error: err instanceof Error ? err.message : String(err) });
              toast.error('Points not saved — tap again');
            })
        )
      );
    }, 1500)
  ).current;

  useEffect(() => {
    loadUnits();
    loadStudents(); // Load students for the teacher

    // Initialize Supabase Realtime channel.
    // broadcast: { self: false } — every sender below already does an optimistic
    // setState BEFORE broadcasting, so the local tab doesn't need its own echo.
    // Without this flag, Supabase echoes each broadcast back to the sender and
    // every action (POINTS_AWARDED, SPIN_WHEEL, TEAMS_ASSIGNED, drawing, ...)
    // runs its handler TWICE on the teacher's tab: double points, double
    // confetti, and duplicate selectionHistory that corrupts FAIR mode.
    const channel = supabase.channel('classroom_live', {
      config: { broadcast: { self: false } },
    });

    // Stamp every outgoing action with who/where (E1.9). Async — the first few
    // broadcasts before it resolves simply go unattributed (guard skips those).
    (async () => {
      const uid = await getTeacherId();
      senderIdRef.current = `${uid ?? 'anon'}:${typeof window !== 'undefined' ? window.location.pathname : 'ssr'}`;
    })();

    channel
      .on('broadcast', { event: 'classroom_action' }, ({ payload: action }) => {
        // Exact per-sender ordering (E2.6): actionIds are monotonic per tab,
        // so anything ≤ the last applied id from that sender is a duplicate
        // or a realtime redelivery — drop it. This makes a future flip to
        // broadcast:{self:true} safe but, more importantly, hardens self:false
        // against redelivered messages.
        if (action?.senderId && typeof action.actionId === 'number') {
          const lastId = lastActionIdBySenderRef.current.get(action.senderId) ?? 0;
          if (action.actionId <= lastId) {
            log.warn('duplicate_action_dropped', { metadata: { sender: action.senderId, actionId: action.actionId, lastId } });
            return;
          }
          lastActionIdBySenderRef.current.set(action.senderId, action.actionId);
        }
        // Staleness guard (E1.9): drop same-sender, same-type actions that
        // arrive OUT OF ORDER (delayed/replayed realtime delivery). Strictly
        // older only — equal timestamps (rapid draws) still apply. Runs here,
        // outside the setState updater, so it executes once per message.
        if (action?.senderId && typeof action.timestamp === 'number') {
          const key = `${action.senderId}|${action.type}`;
          const last = lastTsBySenderTypeRef.current.get(key) ?? -Infinity;
          if (action.timestamp < last) {
            log.warn('stale_broadcast_dropped', { metadata: { key, ts: action.timestamp, last } });
            return;
          }
          lastTsBySenderTypeRef.current.set(key, Math.max(last, action.timestamp));
        }
        // Authoritative live-turn snapshot fast path (E2.3): newer-seq wins,
        // generic per-type handlers never see it (games' lastAction guards
        // must not be fed infrastructure events).
        if (action?.type === 'LIVE_STATE') {
          const seq = Number(action.payload?.seq ?? 0);
          if (seq > liveSeqRef.current && action.payload?.state) {
            applyLiveTurnFields(action.payload.state as LiveTurnState, seq);
            setState(prev => ({ ...prev, recentActions: [...prev.recentActions.slice(-19), action] }));
          }
          return;
        }
        setState(prev => {
          const newState = { ...prev, lastAction: action, recentActions: [...prev.recentActions.slice(-19), action] };

          if (action.type === 'WINNER_DECLARED' || action.type === 'GAME_WIN') {
            newState.confettiTrigger = Date.now();
          } else if (action.type === 'CELEBRATE') {
            // SidebarPanel "Trigger Celebration" / remote celebrations now reach
            // the board (previously only the student app consumed CELEBRATE, so
            // the projector never celebrated). Bump confettiTrigger to fire the
            // same confetti burst as a GAME_WIN.
            newState.confettiTrigger = Date.now();
          } else if (action.type === 'LIVE_SNAP') {
            // Remote camera snapshot (workstream B3.2): persist the broadcast
            // dataURL so the board's separate tab can render it. The sender does
            // an optimistic setState via setLiveSnap, so this only runs on OTHER
            // tabs (broadcast: self:false).
            newState.liveSnapImage = action.payload?.image ?? null;
          } else if (action.type === 'SELECTION_MODE_CHANGED') {
            // Workstream B5: keep selection mode in sync across commander / remote / board.
            newState.selectionMode = action.payload?.mode ?? newState.selectionMode;
          } else if (action.type === 'QUIET_MODE_CHANGED') {
            // Workstream B5: keep quiet-mode + noise level in sync across tabs.
            newState.quietModeActive = action.payload?.active ?? newState.quietModeActive;
          } else if (action.type === 'END_SESSION') {
            newState.status = 'IDLE';
            newState.currentStepIndex = 0;
            newState.activeOverlay = 'NONE';
            newState.drawings = [];
            newState.currentTurnId = null;
            newState.turnRevealAt = null;
            newState.pendingTurnToken = null;
          } else if (action.type === 'DISMISS_WHEEL') {
            // Non-destructive overlay dismiss: hide the QUICK_WHEEL popup but
            // KEEP quickWheelWinner + currentTurnId so the picked student stays
            // "live" (scoring active, whose-turn footer persists). This is the
            // post-pick auto-dismiss path — broadcasts cross tabs so the board
            // projector hides its overlay too. (CLOSE_OVERLAY below is the
            // destructive full-reset path, used only to cancel a turn entirely.)
            newState.activeOverlay = 'NONE';
          } else if (action.type === 'CLOSE_OVERLAY') {
            newState.activeOverlay = 'NONE';
            newState.quickWheelWinner = null;
            newState.currentTurnId = null;
            newState.turnRevealAt = null;
            newState.pendingTurnToken = null;
          } else if (action.type === 'SHOW_LEADERBOARD') {
            // Flash the unified class leaderboard (locked decision 0.1.4).
            newState.activeOverlay = newState.activeOverlay === 'LEADERBOARD' ? 'NONE' : 'LEADERBOARD';
          } else if (action.type === 'CLEAR_RESPONDER') {
            // Teacher Baton "Class" — clear the selected responder for a choral/group round.
            newState.quickWheelWinner = null;
            newState.currentTurnId = null;
            newState.turnRevealAt = null;
            newState.pendingTurnToken = null;
          } else if (action.type === 'NEW_TURN') {
            // Game-lifecycle signal: a fresh responder is up. Games key their
            // reset effect on `currentTurnId` changing, so they start a clean
            // attempt for this student. Emitted by selectNextStudent /
            // magicSelectStudent right after GAME_WIN. The token (not the raw
            // studentId) is the value: re-picking the SAME student must still
            // change the id, or no game resets ("wheel spun, board stayed").
            newState.currentTurnId = action.payload?.turnToken ?? action.payload?.studentId ?? null;
          } else if (action.type === 'TEAMS_ASSIGNED') {
            // Phase A.3: Team Builder assigned teams. Payload = { assignments: { studentId: team } }.
            const assignments = action.payload?.assignments || {};
            newState.students = newState.students.map(s =>
              assignments[s.id] ? { ...s, team: assignments[s.id] } : s
            );
          } else if (action.type === 'SPIN_WHEEL') {
            newState.activeOverlay = 'QUICK_WHEEL';
            newState.quickWheelWinner = action.payload.targetId;
            if (!newState.selectionHistory.includes(action.payload.targetId)) {
              newState.selectionHistory = [...newState.selectionHistory, action.payload.targetId];
            }
          } else if (action.type === 'POINTS_AWARDED') {
            newState.students = newState.students.map(s =>
              s.id === action.payload.studentId ? { ...s, points: Math.max(0, s.points + action.payload.amount) } : s
            );
            newState.confettiTrigger = action.payload.amount > 0 ? Date.now() : prev.confettiTrigger;
          } else if (action.type === 'MASS_PENALTY') {
            newState.students = newState.students.map(s => ({ ...s, points: Math.max(0, s.points - action.payload.amount) }));
          } else if (action.type === 'DRAWING_START') {
            newState.drawings = [...newState.drawings, {
              id: action.payload.id,
              color: action.payload.color,
              width: 4,
              points: [{ x: action.payload.x, y: action.payload.y }],
              isComplete: false
            }];
          } else if (action.type === 'DRAWING_POINT') {
            newState.drawings = newState.drawings.map(d =>
              d.id === action.payload.id ? { ...d, points: [...d.points, { x: action.payload.x, y: action.payload.y }] } : d
            );
          } else if (action.type === 'DRAWING_END') {
            newState.drawings = newState.drawings.map(d =>
              d.id === action.payload.id ? { ...d, isComplete: true } : d
            );
          } else if (action.type === 'DRAWING_CLEAR') {
            newState.drawings = [];
          }

          return newState;
        });
      })
      .subscribe((status) => {
        setState(prev => ({ ...prev, isConnected: status === 'SUBSCRIBED' }));
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          scheduleChannelResubscribe(channelRef.current, 'classroom_live');
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      // Kill any pending spin chain too — a pending GAME_WIN/NEW_TURN must
      // never fire into an unmounted provider.
      cancelSpinTimers();
    };
  }, []);

  // ---- Authoritative live turn state (FIXPLAN E2.2/E2.3) ----
  // Applies a LiveTurnState snapshot onto the session state. Ordering guard:
  // a snapshot whose seq is not NEWER than the last applied one is ignored —
  // this is what makes delayed/replayed broadcasts and late postgres rows
  // harmless (audit §3.5). Deliberately does NOT set currentTurnId: the turn
  // starts at revealAt (E2.4 effect), so games reset at reveal, not at pick.
  const applyLiveTurnFields = useCallback((live: LiveTurnState, seq: number) => {
    if (seq <= liveSeqRef.current) return;
    liveSeqRef.current = seq;
    liveTurnRef.current = live;
    setState(prev => ({
      ...prev,
      quickWheelWinner: live.responderId,
      turnRevealAt: live.revealAt,
      pendingTurnToken: live.turnToken,
      activeOverlay: live.overlay,
      quietModeActive: live.quietMode,
      selectionMode: live.selectionMode ?? prev.selectionMode,
      students: live.teams
        ? prev.students.map(s =>
            live.teams && live.teams[s.id] ? { ...s, team: live.teams[s.id] } : s)
        : prev.students,
    }));
  }, []);

  // ---- Authoritative classroom session (Phase 1, audit P0-1) ----
  // The projector board, teacher remote and commander are separate React roots.
  // They converge on this teacher's classroom_sessions row via Realtime instead
  // of relying on local-only state that never crossed tabs.
  //
  // ---- LIVE-UPDATE POLICY (Phase 3.4, advisor §5.6): edit-then-republish ----
  // An already-running session keeps the unit snapshot it loaded at start; it is
  // NEVER hot-patched mid-class. The unit is (re)fetched only when the session's
  // unit_id changes (below) or when a session is (re)started via setActiveUnit.
  // Teacher edits made during a session save immediately to the canonical store
  // (units.flow / relational tables), so the NEXT session and the student app
  // pick them up — but the live class the teacher is currently presenting is not
  // silently changed under them (avoids surprising the teacher mid-lesson). The
  // `classroom_action` broadcast channel syncs only transient actions (points,
  // wheel, drawing, overlays), never unit content, which is what enforces this.
  const applySessionRow = useCallback(async (row: any) => {
    if (!row) return;

    // Staleness guard (E1.9): never move BACKWARDS on a delayed/replayed
    // postgres_changes row. 2s tolerance — updated_at is written from teacher
    // devices (laptop vs phone), so sub-second skew must not drop fresh rows.
    const rowTs = row.updated_at ? Date.parse(row.updated_at) : 0;
    if (rowTs > 0 && lastRowTsRef.current > 0 && rowTs < lastRowTsRef.current - 2000) {
      log.warn('stale_session_row_dropped', { metadata: { rowTs, lastTs: lastRowTsRef.current, index: row.current_index } });
      return;
    }
    if (rowTs > 0) lastRowTsRef.current = Math.max(lastRowTsRef.current, rowTs);

    // E2.3: reconcile the live turn state BEFORE the unit/slide handling — it
    // must apply even when no unit is set (quiet mode / teams pre-go-live).
    // This is also the refresh/reconnect recovery path: a board rehydrating
    // mid-turn restores the picked student, overlay, and reveal deadline.
    {
      const { live, seq } = rowToLiveTurn(row);
      if (seq > liveSeqRef.current) applyLiveTurnFields(live, seq);
    }

    // Propagate the live-class binding to every tab (board/commander/remote) so
    // each loads the correct roster-first student list — even before a unit is set.
    if (row.class_id !== undefined && row.class_id !== null) {
      setState(prev => (prev.activeClassId === row.class_id ? prev : { ...prev, activeClassId: row.class_id }));
    }

    // FIXPLAN I — class-plan session: resolve the plan (cache-first) and use
    // ITS flow. The plan must belong to the session's unit; a mismatched or
    // missing plan falls back to the unit flow (never a blank board).
    let classPlan: any = null;
    if (row.class_plan_id) {
      classPlan = await fetchClassPlan(row.class_plan_id);
      if (classPlan && classPlan.unit_id !== row.unit_id) classPlan = null;
    }

    // Coverage ledger (live board word rotation, 2026-08-30): mirror the
    // session row's dealt_objectives into state for useCoverageLedger.
    // Sig-guarded: postgres_changes re-delivers the row on every update
    // (slide moves etc.) and setState identity would churn renders.
    const dealt = (row as any).dealt_objectives;
    if (dealt && typeof dealt === 'object' && !Array.isArray(dealt)) {
      const sig = JSON.stringify(dealt);
      if (dealtSigRef.current !== sig) {
        dealtSigRef.current = sig;
        setState(prev => ({ ...prev, dealtObjectives: dealt }));
      }
    }

    if (!row.unit_id) {
      setState(prev => (prev.activeClassPlan?.id === (classPlan?.id ?? null) ? prev : { ...prev, activeClassPlan: classPlan }));
      return;
    }

    let unit = activeUnitRef.current;
    if (!unit || unit.id !== row.unit_id) {
      const fresh = await Engine.getUnitById(row.unit_id);
      if (!fresh) return;
      unit = fresh;
      activeUnitRef.current = fresh;
    }

    const flow = (Array.isArray(classPlan?.flow) && classPlan.flow.length > 0 ? classPlan.flow : unit.flow) || [];
    const idx = Math.min(Math.max(0, row.current_index ?? 0), Math.max(0, flow.length - 1));
    // Slide-change side effects live OUTSIDE the setState updater (updaters
    // must stay pure — StrictMode double-invokes them): kill any in-flight
    // spin chain so its 2.5s timers can't fire GAME_WIN/NEW_TURN/confetti
    // onto the slide the class just moved to.
    if (lastSyncedStepRef.current !== null && lastSyncedStepRef.current !== idx) {
      cancelSpinTimers();
    }
    lastSyncedStepRef.current = idx;
    setState(prev => ({
      // E2.5: the SAME slide-transition computation goToSlide uses — one
      // behavior mirrored by construction (retires the 028d3ce bug class).
      ...computeSlideState(prev, flow, idx),
      activeUnit: unit!,
      activeClassPlan: classPlan,
      sessionId: row.id,
      status: (row.status as SessionStatus) || prev.status,
    }));
    // Keep the live-turn mirror honest on slide change (a receiver tab never
    // writes, but the writer's own applySessionRow pass must not leave a
    // stale responder for a future merge to resurrect).
    if (lastSyncedStepRef.current !== null && idx !== liveTurnSlideRef.current) {
      liveTurnSlideRef.current = idx;
      liveTurnRef.current = mergeLiveTurn(liveTurnRef.current, {
        responderId: null,
        turnToken: null,
        turnStartedAt: null,
        revealAt: null,
        overlay: 'NONE',
      });
    }
  }, [applyLiveTurnFields, fetchClassPlan]);

  // Best-effort current teacher id. Persistence is optional: if Supabase/auth
  // is unavailable (e.g. tests, misconfigured env), local state still updates and
  // the UI keeps working; the board simply won't converge until the next event.
  const getTeacherId = useCallback(async (): Promise<string | null> => {
    try {
      const res = await supabase.auth.getUser();
      return res?.data?.user?.id || null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let channel: any;
    let active = true;

    (async () => {
      const userId = await getTeacherId();
      if (!userId || !active) return;

      try {
        // Hydrate from any existing session row (e.g. board opened after teacher).
        const { data: existing } = await supabase
          .from('classroom_sessions')
          .select('*')
          .eq('teacher_id', userId)
          .maybeSingle();
        if (existing && active) await applySessionRow(existing);
      } catch {
        // Hydration is best-effort.
      }

      channel = supabase
        .channel('classroom_session_sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'classroom_sessions', filter: `teacher_id=eq.${userId}` },
          (payload: any) => {
            if (payload.new) applySessionRow(payload.new);
          },
        )
        .subscribe((status) => {
          if (!active) return;
          // E1.8: channel B carries slide position — its health gates the
          // board's NO SIGNAL screen alongside the broadcast channel.
          setState(prev => prev.sessionSyncHealthy === (status === 'SUBSCRIBED')
            ? prev
            : { ...prev, sessionSyncHealthy: status === 'SUBSCRIBED' });
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            scheduleChannelResubscribe(channel, 'classroom_session_sync');
          }
        });
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [applySessionRow, getTeacherId]);

  // Session-row persistence with retry (FIXPLAN E1.7). Previously a single
  // failed write was swallowed while local state had already moved — the
  // commander went to slide N, the board never heard, and nothing retried
  // ("board stuck behind"). Now: 3 retries with backoff; on final failure
  // syncError surfaces a resync banner on the commander.
  const persistWithRetry = useCallback(async (patch: Record<string, any>) => {
    const userId = await getTeacherId();
    if (!userId) return;
    const delays = [500, 1500, 4000];
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const { error } = await supabase
          .from('classroom_sessions')
          .update(patch)
          .eq('teacher_id', userId);
        if (!error) {
          setState(prev => (prev.syncError ? { ...prev, syncError: null } : prev));
          return;
        }
        throw error;
      } catch (err) {
        if (attempt < delays.length) {
          await new Promise((r) => setTimeout(r, delays[attempt]));
        } else {
          log.warn('session_persist_failed_all_retries', {
            error: err instanceof Error ? err.message : String(err),
            metadata: { keys: Object.keys(patch) },
          });
          setState(prev => ({ ...prev, syncError: 'slide-persist-failed' }));
        }
      }
    }
  }, [getTeacherId]);

  const persistSessionIndex = useCallback(async (index: number) => {
    await persistWithRetry({ current_index: index, updated_at: new Date().toISOString() });
  }, [persistWithRetry]);

  const persistSessionStatus = useCallback(async (status: SessionStatus) => {
    const patch: any = { status, updated_at: new Date().toISOString() };
    if (status === 'IDLE') { patch.current_index = 0; patch.class_plan_id = null; }
    await persistWithRetry(patch);
  }, [persistWithRetry]);

  /** Banner "Resync" button: re-persist the CURRENT slide (local state is the
   *  teacher's intent) and let the postgres_changes path converge the board. */
  const retrySync = useCallback(async () => {
    await persistSessionIndex(state.currentStepIndex);
  }, [persistSessionIndex, state.currentStepIndex]);

  const broadcastAction = (action: SessionAction) => {
    // E1.9/E1.10: attribute + sequence every outgoing action, and keep it in
    // this tab's ring (the sender never receives its own echo — self:false —
    // so the only record of sent actions lives here).
    action.senderId = senderIdRef.current || undefined;
    action.actionId = ++actionSeqRef.current;
    channelRef.current?.send({ type: 'broadcast', event: 'classroom_action', payload: action });
    setState(prev => ({ ...prev, recentActions: [...prev.recentActions.slice(-19), action] }));
  };

  // ---- Derived wheel reveal (FIXPLAN E2.4) ----
  // Every tab independently applies the reveal when Date.now() passes
  // revealAt: start the turn (games reset via currentTurnId), dismiss the
  // wheel, fire confetti. The picking tab dying mid-spin can no longer strand
  // the overlay — there is no cross-tab chain to break. The tab that STARTED
  // the turn also emits the legacy GAME_WIN/NEW_TURN/DISMISS_WHEEL compat
  // broadcasts (game guards key on those lastAction types).
  useEffect(() => {
    const revealAt = state.turnRevealAt;
    const token = state.pendingTurnToken;
    if (revealAt === null || token === null) return;
    const winnerId = state.quickWheelWinner;
    const timer = setTimeout(() => {
      setState(prev => {
        if (prev.pendingTurnToken !== token) return prev; // superseded by a newer pick/clear
        return {
          ...prev,
          currentTurnId: token,
          pendingTurnToken: null,
          turnRevealAt: null,
          activeOverlay: prev.activeOverlay === 'QUICK_WHEEL' ? 'NONE' : prev.activeOverlay,
          confettiTrigger: Date.now(),
        };
      });
      if (turnWriterIsLocalRef.current) {
        turnWriterIsLocalRef.current = false;
        broadcastAction({ type: 'GAME_WIN', payload: { winnerId }, timestamp: Date.now() });
        broadcastAction({ type: 'NEW_TURN', payload: { studentId: winnerId, turnToken: token }, timestamp: Date.now() });
        broadcastAction({ type: 'DISMISS_WHEEL', timestamp: Date.now() });
        // Persist the dismissal so a board refreshing mid-turn doesn't
        // resurrect an already-dismissed wheel (the reveal is derived —
        // without this write the row's overlay would stay QUICK_WHEEL).
        void updateLiveTurn({ overlay: 'NONE' });
      }
    }, Math.max(0, revealAt - Date.now()));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turnRevealAt, state.pendingTurnToken]);

  // Reveal deadline gone (slide change / cancel / superseded pick) ⇒ the
  // spin-in-flight guard must release so the teacher can pick again.
  useEffect(() => {
    if (state.turnRevealAt === null && state.pendingTurnToken === null) {
      spinInFlightRef.current = false;
    }
  }, [state.turnRevealAt, state.pendingTurnToken]);

  // ---- Authoritative live-turn writer (FIXPLAN E2.2) ----
  // Optimistic local apply + LIVE_STATE broadcast fast path, then a
  // compare-and-swap row write (pin the expected seq, write seq+1) so two
  // teacher tabs (commander + remote) can never silently overwrite each
  // other's turn state. On conflict: re-read, re-merge, retry once.
  const updateLiveTurn = useCallback(async (patch: Partial<LiveTurnState>) => {
    const merged = mergeLiveTurn(liveTurnRef.current, patch);
    const nextSeq = liveSeqRef.current + 1;
    applyLiveTurnFields(merged, nextSeq);
    broadcastAction({ type: 'LIVE_STATE', payload: { state: merged, seq: nextSeq }, timestamp: Date.now() });

    const userId = await getTeacherId();
    if (!userId) return; // no session row possible — broadcast path still ran
    const write = async (expectedSeq: number, state: LiveTurnState): Promise<boolean> => {
      const { data, error } = await supabase
        .from('classroom_sessions')
        .update({ live_state: state as any, seq: expectedSeq + 1, updated_at: new Date().toISOString() })
        .eq('teacher_id', userId)
        .eq('seq', expectedSeq)
        .select();
      if (error) throw error;
      return (data as any[])?.length > 0;
    };
    try {
      let ok = await write(nextSeq - 1, merged);
      if (!ok) {
        // CAS miss. Either another tab raced us (re-read + re-merge + retry),
        // or NO row exists yet (the teacher can spin before any class/unit is
        // bound) — in that case create the row with the turn state.
        const { data: row, error: readErr } = await supabase
          .from('classroom_sessions')
          .select('live_state, seq')
          .eq('teacher_id', userId)
          .maybeSingle();
        if (readErr) throw readErr;
        if (!row) {
          const { error: upErr } = await supabase
            .from('classroom_sessions')
            .upsert(
              { teacher_id: userId, live_state: merged as any, seq: 1, updated_at: new Date().toISOString() },
              { onConflict: 'teacher_id' },
            )
            .select();
          if (upErr) throw upErr;
          return;
        }
        const { live, seq } = rowToLiveTurn(row);
        const remerged = mergeLiveTurn(live, patch);
        ok = await write(seq, remerged);
        if (ok) {
          applyLiveTurnFields(remerged, seq + 1);
          broadcastAction({ type: 'LIVE_STATE', payload: { state: remerged, seq: seq + 1 }, timestamp: Date.now() });
        } else {
          log.warn('live_turn_cas_double_conflict', { metadata: { patch: Object.keys(patch) } });
        }
      }
    } catch (err) {
      log.warn('live_turn_write_failed', {
        error: err instanceof Error ? err.message : String(err),
        metadata: { patch: Object.keys(patch) },
      });
    }
  }, [applyLiveTurnFields, getTeacherId]);

  const loadUnits = async () => {
    const units = await Engine.fetchUnits();
    setState(prev => ({ ...prev, units }));
  };

  const loadStudents = async () => {
    try {
      // Roster-first: if a class is live, load roster_students (incl. UNCLAIMED) so
      // every kid in the room appears + is pickable, with unified points
      // (ledger sum + home XP). Falls back to legacy auth enrollment otherwise.
      if (state.activeClassId) {
        const roster = await getSessionRoster(state.activeClassId);
        const occId = activeOccurrenceIdRef.current;
        if (occId) {
          const attendance = await getAttendanceForOccurrence(occId);
          setState(prev => ({ ...prev, students: mergePresence(roster, attendance) }));
        } else {
          setState(prev => ({ ...prev, students: roster }));
        }
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        log.warn('no_authenticated_user', { metadata: { context: 'loadStudents' } });
        return;
      }
      const students = await getTeacherStudents(user.id);
      const mappedStudents = students.map(mapStudent);
      setState(prev => ({ ...prev, students: mappedStudents }));
    } catch (error) {
      log.warn('error_loading_students', { error: error instanceof Error ? error.message : String(error) });
      // Keep empty array on error
    }
  };
  // Keep the ref mirror current so setActiveClass can call the latest version.
  loadStudentsRef.current = loadStudents;

  /** Bind the live session to a class: persist class_id on the session row + reload roster.
   *  Stays IDLE here — only setActiveUnit flips the session to LIVE (a class is not "live"
   *  until the teacher starts a unit). */
  const setActiveClass = useCallback(async (classId: string | null) => {
    setState(prev => ({ ...prev, activeClassId: classId }));
    // Eagerly sync the ref too, so any code that reads activeClassIdRef
    // synchronously after this call (e.g. ensureAttendanceOccurrence right
    // after a class-picker tap) sees the new value without waiting for the
    // ref-sync effect to run.
    activeClassIdRef.current = classId;
    const userId = await getTeacherId();
    if (userId) {
      try {
        await supabase
          .from('classroom_sessions')
          .upsert(
            { teacher_id: userId, class_id: classId, status: 'IDLE', updated_at: new Date().toISOString() },
            { onConflict: 'teacher_id' },
          );
      } catch { /* best-effort */ }
    }
    // Reload the roster for the newly-bound class so the UI switches from the
    // legacy "all teacher students" fallback to this class's actual roster.
    // (Without this, picking a class from the LiveCommander banner wouldn't
    //  refresh the student list until a realtime event happened to fire.)
    await loadStudentsRef.current?.();
  }, []);

  /** Ensure an attendance occurrence exists for the live class (used when opening
   *  the attendance modal before go-live). Reuses the open occurrence if present. */
  const ensureAttendanceOccurrence = useCallback(async (): Promise<{ id: string | null; error: string | null }> => {
    if (activeOccurrenceIdRef.current) return { id: activeOccurrenceIdRef.current, error: null };
    const userId = await getTeacherId();
    const classId = activeClassIdRef.current;
    if (!userId) return { id: null, error: 'Not signed in — please reload and sign in again.' };
    if (!classId) return { id: null, error: 'No live class selected. Pick a class first.' };
    const { id: occId, error } = await getOrCreateActiveOccurrence(classId, userId, activeUnitRef.current?.id ?? null);
    if (error || !occId) return { id: null, error: error || 'Could not start the attendance session.' };
    activeOccurrenceIdRef.current = occId;
    setState(prev => ({ ...prev, activeOccurrenceId: occId }));
    await loadStudents();
    return { id: occId, error: null };
  }, [getTeacherId, loadStudents]);

  // Realtime: keep the live roster + points in sync for the active class.
  // (Membership changes reload the roster; point inserts reconcile the authoritative
  //  total — full reload avoids double-counting with the optimistic broadcast.)
  useEffect(() => {
    if (!state.activeClassId) return;
    loadStudents();
    const ch = supabase.channel(`live-class-${state.activeClassId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'roster_students', filter: `class_id=eq.${state.activeClassId}` },
        () => loadStudents())
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'point_transactions', filter: `class_id=eq.${state.activeClassId}` },
        () => loadStudents())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_records', filter: `class_id=eq.${state.activeClassId}` },
        () => loadStudents())
      .subscribe((status) => {
        // E1.8: advisory health — a lagging roster reconciles on the next
        // ledger event and must NOT blank the board, so this only reports.
        setState(prev => prev.rosterSyncHealthy === (status === 'SUBSCRIBED')
          ? prev
          : { ...prev, rosterSyncHealthy: status === 'SUBSCRIBED' });
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          scheduleChannelResubscribe(ch, `live-class-${state.activeClassId}`);
        }
      });
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeClassId]);

  // Reconnect / re-focus rehydration (FIXPLAN E1.8). When the network returns
  // or the tab becomes visible again, re-read the authoritative session row:
  // anything missed while the socket was down (or the tab was backgrounded and
  // the browser throttled it) converges without a manual refresh.
  useEffect(() => {
    let lastRun = 0;
    const rehydrate = async () => {
      const now = Date.now();
      if (now - lastRun < 3000) return; // debounce focus/network flapping
      lastRun = now;
      const userId = await getTeacherId();
      if (!userId) return;
      try {
        const { data: existing } = await supabase
          .from('classroom_sessions')
          .select('*')
          .eq('teacher_id', userId)
          .maybeSingle();
        if (existing) await applySessionRow(existing);
      } catch {
        // best-effort — the channel will deliver the next change anyway
      }
      loadStudentsRef.current?.();
    };
    const onOnline = () => { log.info('network_online_rehydrating'); void rehydrate(); };
    const onVisible = () => { if (document.visibilityState === 'visible') void rehydrate(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [applySessionRow, getTeacherId]);

  const setActiveUnit = async (unitId: string, classPlanId?: string) => {
    // Prefer the freshest copy from the DB — the cached list in state.units can
    // be stale after the teacher edits the unit in the Unit Studio (e.g. saves a
    // new lesson plan in the Plan composer). Without this, "Launch live" would
    // load the OLD flow and the freshly-saved steps wouldn't appear. Fall back
    // to the cache on fetch failure for offline resilience.
    let unit = state.units.find(u => u.id === unitId);
    try {
      const fresh = await Engine.getUnitById(unitId);
      if (fresh) unit = fresh;
    } catch {
      // keep the cached unit if the fresh fetch fails
    }
    // FIXPLAN I — optional class-plan session: the plan's flow replaces the
    // unit flow and its content_index scopes every pool pull (#8).
    let classPlan: any = null;
    if (classPlanId) {
      classPlan = await fetchClassPlan(classPlanId);
      if (!classPlan) throw new Error('Class plan not found.');
      if (classPlan.unit_id !== unitId) throw new Error('That class does not belong to this unit.');
    }
    if (unit) {
      // C.4: attach the relational bundle (get_unit_bundle) to the manifest so the
      // getVocabulary/getStory/getDialogues normalizers read relational content
      // (the read contract), called exactly once here at activeUnit load. Defined
      // NON-ENUMERABLE so it is never persisted (spread / JSON.stringify skip it)
      // — it lives only on this in-memory snapshot, which is exactly the
      // edit-then-republish snapshot the live session should hold.
      try {
        const { data: bundle } = await supabase.rpc('get_unit_bundle', { p_unit_id: unitId });
        if (bundle && unit.manifest && typeof unit.manifest === 'object') {
          Object.defineProperty(unit.manifest, '_relational', { value: bundle, enumerable: false, configurable: true });
        }
      } catch {
        // normalizers fall back to the manifest if the bundle is unavailable
      }
      activeUnitRef.current = unit;
      const initialFlow = (classPlan && Array.isArray(classPlan.flow) && classPlan.flow.length > 0
        ? classPlan.flow
        : (unit.flow && unit.flow.length > 0 ? unit.flow : []));
      setState(prev => ({
        ...prev,
        activeUnit: unit,
        activeClassPlan: classPlan,
        activeSlideData: initialFlow[0],
        currentStepIndex: 0
      }));

      // Persist so the projector board / remote follow this unit.
      const userId = await getTeacherId();
      if (userId) {
        try {
          const { data: upserted } = await supabase
            .from('classroom_sessions')
            .upsert(
              { teacher_id: userId, class_id: activeClassIdRef.current, unit_id: unitId, class_plan_id: classPlanId ?? null, current_index: 0, status: 'LIVE', updated_at: new Date().toISOString() },
              { onConflict: 'teacher_id' },
            )
            .select();
          // E1.2: capture the row id on the GO-LIVE tab too. Previously only
          // applySessionRow (realtime/hydration) set sessionId, so the tab
          // that started the class had no sessionId — and no shared seed base.
          const rowId = (upserted as any)?.[0]?.id ?? (upserted as any)?.id;
          if (rowId) setState(prev => (prev.sessionId === rowId ? prev : { ...prev, sessionId: rowId }));
        } catch {
          // Best-effort: local state already updated optimistically.
        }
      }

      // Open (or reuse) the attendance occurrence for this live session, then
      // reload the roster so presence overlays via mergePresence.
      if (userId && activeClassIdRef.current) {
        const { id: occId, error: occErr } = await getOrCreateActiveOccurrence(activeClassIdRef.current, userId, unitId);
        if (occErr || !occId) {
          log.warn('go_live_occurrence_failed', { error: occErr });
        } else {
          activeOccurrenceIdRef.current = occId;
          setState(prev => ({ ...prev, activeOccurrenceId: occId }));
          await loadStudents();
        }
      }
    }
  };

  const saveUnit = async (unitId: string, updates: Partial<LessonUnit>) => {
    await Engine.updateUnit(unitId, updates);
    await loadUnits();
    if (state.activeUnit?.id === unitId) {
      setState(prev => ({
        ...prev,
        activeUnit: { ...prev.activeUnit!, ...updates }
      }));
    }
  };

  const unlockNextLevel = async (currentUnitId: string) => {
    await Engine.unlockNextUnit(currentUnitId);
    await loadUnits();
  };

  const startSession = () => {
    setState(prev => ({ ...prev, status: 'LIVE', currentStepIndex: 0, selectionHistory: [], turnsThisExercise: [], sessionStartedAt: Date.now() }));
    persistSessionStatus('LIVE');
  };

  const endSession = () => {
    const action = { type: 'END_SESSION', timestamp: Date.now() };
    broadcastAction(action);
    // Phase 8 (Prompt 10 §3): clear ALL session-scoped state, not just status.
    // The audit (§H3) named activeClassId as the bug, but incremental feature
    // work across Prompts 0/1/7/10 added more state that would have the same
    // "stale across sessions" problem if not cleared here. Living checklist —
    // re-audit when new SessionContext state is added.
    setState(prev => ({
      ...prev,
      status: 'IDLE',
      currentStepIndex: 0,
      activeOverlay: 'NONE',
      drawings: [],
      activeClassId: null,          // the originally-named bug
      activeClassPlan: null,        // FIXPLAN I — class session ends with the session
      activeOccurrenceId: null,
      currentTurnId: null,          // turn lifecycle
      quickWheelWinner: null,
      turnRevealAt: null,           // E2.4 — release any in-flight spin
      pendingTurnToken: null,
      remediationQueue: [],         // Prompt 0 — session-scoped remediation
      turnsThisExercise: [],
      sessionStartedAt: null,       // analytics scope
    }));
    // E2.3: reset the authoritative turn state so the next session (or a
    // refresh during teardown) starts clean.
    void updateLiveTurn({
      responderId: null,
      turnToken: null,
      turnStartedAt: null,
      revealAt: null,
      overlay: 'NONE',
      quietMode: false,
      selectionMode: null,
      teams: null,
    });
    // Clear the remediationQueue ref too (mirrors the state clear above).
    remediationQueueRef.current = [];
    persistSessionStatus('IDLE');
    const occId = activeOccurrenceIdRef.current;
    if (occId) { void endOccurrence(occId); activeOccurrenceIdRef.current = null; }
    // Clear the module-level askedComprehensionItems singleton (Prompt 7 —
    // StoryStage/StorySequencing coordination). It lives in BoardStoryStage.tsx
    // (not SessionContext), so clear it via its exported reset. Non-fatal if
    // the import fails (e.g. the module isn't loaded).
    import('../apps/board/templates/BoardStoryStage').then((m) => {
      if (typeof (m as any).resetAskedComprehensionItems === 'function') {
        (m as any).resetAskedComprehensionItems();
      }
    }).catch(() => {});
  };

  const getFlow = () => {
    // FIXPLAN I — a class session plays the class plan's flow (#8).
    if (state.activeClassPlan && Array.isArray(state.activeClassPlan.flow) && state.activeClassPlan.flow.length > 0) {
      return state.activeClassPlan.flow as any[];
    }
    if (state.activeUnit && state.activeUnit.flow && state.activeUnit.flow.length > 0) {
      return state.activeUnit.flow;
    }
    return [];
  };

  const goToSlide = (index: number) => {
    const flow = getFlow();
    if (index >= 0 && index < flow.length) {
      const slideChanged = index !== state.currentStepIndex;
      // E2.5: the SAME computation applySessionRow uses — one behavior,
      // mirrored by construction (retires the 028d3ce bug class).
      setState(prev => computeSlideState(prev, flow, index));
      // Persist so the projector board / remote follow the teacher.
      persistSessionIndex(index);
      if (slideChanged) {
        // Mirror the local turn clear into the authoritative row so a board
        // refreshing mid-slide can't resurrect the previous slide's pick.
        void updateLiveTurn({
          responderId: null,
          turnToken: null,
          turnStartedAt: null,
          revealAt: null,
          overlay: 'NONE',
        });
      }
    }
  };

  const nextSlide = () => goToSlide(state.currentStepIndex + 1);
  const prevSlide = () => goToSlide(state.currentStepIndex - 1);

  const addPoints = useCallback((studentId: string, amount: number) => {
    const action = { type: 'POINTS_AWARDED', payload: { studentId, amount }, timestamp: Date.now() };
    broadcastAction(action);

    setState(prev => ({
      ...prev,
      students: prev.students.map(s =>
        s.id === studentId ? { ...s, points: Math.max(0, s.points + amount) } : s
      ),
      pointsLog: [...prev.pointsLog, { studentId, amount, timestamp: new Date() }],
      confettiTrigger: amount > 0 ? Date.now() : prev.confettiTrigger,
      lastAction: action
    }));

    if (amount !== 0) {
      // Persist class points to the unified point_transactions ledger (source of
      // truth for CLASS points; home XP stays separate per the owner decision).
      // Debounced so rapid Baton taps / game captures batch into one write.
      pendingPointsRef.current[studentId] = (pendingPointsRef.current[studentId] || 0) + amount;
      flushClassPoints();
    }
  }, [broadcastAction, state.activeClassId]);

  // Per-student board capture (Phase 3.3): writes a teacher grade into the shared
  // LearnerState for the active unit. Non-fatal; logged on failure.
  const gradeStudent = useCallback(async (studentId: string, word: string, correct: boolean) => {
    const unitId = state.activeUnit?.id || '';
    if (!unitId || !studentId || !word) return;
    // studentId is a roster_students.id; FSRS/mastery lives on the PROFILE.
    // Least-work bridge: skip unclaimed students (they still earn board points via
    // the ledger, but no cognitive data until they claim a home account).
    const roster = state.students.find((s: any) => s.id === studentId);
    const profileId = roster?.claimed_profile_id;
    if (!profileId) return;
    try {
      const { gradeStudent: grade } = await import('../services/boardLearner');
      await grade(profileId, unitId, word, correct);
    } catch (err) {
      log.warn('grade_student_failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, [state.activeUnit?.id, state.students]);

  // ── Same-session remediation queue (architecture §3.3). ────────────────
  // In-memory, SessionContext-level — NOT a new table, NOT broadcast (the
  // commander owns the queue; the board renders whatever slide the commander
  // is on via the existing session-sync channel). Deliberately separate from
  // FSRS cross-lesson scheduling.
  const remediationQueueRef = useRef<RemediationEntry[]>([]);
  // Keep state.remediationQueue in sync with the ref for component reads.
  const syncRemediation = () => setState(prev => ({ ...prev, remediationQueue: remediationQueueRef.current.slice() }));

  const pushToRemediation = useCallback((objectiveId: string, studentId: string) => {
    if (!objectiveId || !studentId) return;
    const now = Date.now();
    const queue = remediationQueueRef.current;
    const existing = queue.find((e) => e.objectiveId === objectiveId);
    if (existing) {
      // Idempotent per (objective, student) — don't double-count one student missing one item.
      if (!existing.missedBy.includes(studentId)) existing.missedBy.push(studentId);
      existing.lastMissedAt = now;
    } else {
      queue.push({ objectiveId, missedBy: [studentId], lastMissedAt: now });
    }
    // Sort: most misses first, then most-recent (so the round-builder surfaces
    // the worst objective at the top of weakOrder).
    queue.sort((a, b) => b.missedBy.length - a.missedBy.length || b.lastMissedAt - a.lastMissedAt);
    syncRemediation();
  }, []);

  const getRemediationQueue = useCallback(() => remediationQueueRef.current.slice(), []);

  const drainRemediation = useCallback(() => {
    const ids = remediationQueueRef.current.map((e) => e.objectiveId);
    remediationQueueRef.current = [];
    syncRemediation();
    return ids;
  }, []);

  const deductAllPoints = (amount: number) => {
    const action = { type: 'MASS_PENALTY', payload: { amount }, timestamp: Date.now() };
    broadcastAction(action);

    // Optimistic update
    setState(prev => ({
      ...prev,
      students: prev.students.map(s => ({ ...s, points: Math.max(0, s.points - amount) })),
      lastAction: action
    }));
  };

  const toggleConnection = () => {
    setState(prev => ({ ...prev, isConnected: !prev.isConnected }));
  };

  const setLiveSnap = (image: string | null) => {
    // Optimistic local update + broadcast so the board (separate tab) renders
    // the snapshot. B3.2: previously local-only, so the photo was trapped on
    // the remote tab and the board always saw null.
    broadcastAction({ type: 'LIVE_SNAP', payload: { image }, timestamp: Date.now() });
    setState(prev => ({ ...prev, liveSnapImage: image }));
  };

  const triggerAction = (type: string, payload?: any) => {
    const action = { type, payload, timestamp: Date.now() };
    broadcastAction(action);

    // Optimistic update
    setState(prev => ({
      ...prev,
      lastAction: action
    }));

    if (type === 'WINNER_DECLARED' || type === 'GAME_WIN') {
      triggerConfetti();
    }
  };

  const setSelectionMode = (mode: SelectionMode) => {
    // Broadcast so commander and remote agree on FAIR / RANDOM / etc.
    // B5: previously local-only, so the mode picked on one tab was invisible
    // to the others.
    broadcastAction({ type: 'SELECTION_MODE_CHANGED', payload: { mode }, timestamp: Date.now() });
    setState(prev => ({ ...prev, selectionMode: mode }));
    void updateLiveTurn({ selectionMode: mode });
  };

  /**
   * Phase A.3 — Team Builder. Shuffles the roster into `count` balanced teams
   * (round-robin by current points so teams are even) and broadcasts the
   * assignment so board + remote + all games see real team membership. Fixes the
   * always-empty red/blue panels (locked decision: real teams).
   */
  const assignTeams = (count: number = 2) => {
    const n = Math.max(2, Math.min(count, TEAM_COLORS.length));
    // Sort by points desc, then round-robin deal → balanced teams.
    const sorted = filterPresent([...state.students]).sort((a, b) => (b.points || 0) - (a.points || 0));
    const assignments: Record<string, string> = {};
    sorted.forEach((s, i) => {
      assignments[s.id] = TEAM_COLORS[i % n];
    });
    const action = { type: 'TEAMS_ASSIGNED', payload: { assignments, count: n }, timestamp: Date.now() };
    broadcastAction(action);
    setState(prev => ({
      ...prev,
      students: prev.students.map(s => (assignments[s.id] ? { ...s, team: assignments[s.id] } : s)),
      lastAction: action,
    }));
    void updateLiveTurn({ teams: assignments });
  };

  /**
   * Hide the QUICK_WHEEL overlay WITHOUT ending the turn — the picked student
   * stays live (scoring active, whose-turn footer persists). This is the
   * non-destructive dismiss used by the post-pick auto-dismiss AND by the
   * manual "Hide wheel" button. (To fully cancel a turn, use cancelTurn /
   * CLEAR_RESPONDER instead.)
   */
  const dismissWheel = () => {
    const action = { type: 'DISMISS_WHEEL', timestamp: Date.now() };
    broadcastAction(action);
    setState(prev => ({ ...prev, activeOverlay: 'NONE', lastAction: action }));
    // E2.3: keep the authoritative row in step (a refreshing board must not
    // resurrect a manually-dismissed wheel).
    void updateLiveTurn({ overlay: 'NONE' });
  };

  /**
   * Backwards-compat alias: closeOverlay now dismisses the wheel non-
   * destructively (keeping the responder). Previously it wiped the responder,
   * which killed scoring + the whose-turn indicator — a footgun. Callers that
   * genuinely need to clear the responder should use cancelTurn().
   */
  const closeOverlay = () => dismissWheel();

  /** Fully cancel the current turn: hide the overlay AND clear the responder
   *  (quickWheelWinner + currentTurnId). Use for "switch to choral mode". */
  const cancelTurn = () => {
    triggerAction('CLEAR_RESPONDER');
    setState(prev => ({
      ...prev,
      activeOverlay: 'NONE',
      quickWheelWinner: null,
      currentTurnId: null,
      turnRevealAt: null,
      pendingTurnToken: null,
    }));
    // E2.3: mirror the cancel into the authoritative row (also releases the
    // derived reveal — no timer to cancel by hand).
    void updateLiveTurn({ responderId: null, turnToken: null, turnStartedAt: null, revealAt: null, overlay: 'NONE' });
  };

  /**
   * FIXPLAN E2.2/E2.4 — start a turn: pick the student, open the wheel, and
   * stamp the authoritative live_state (responder, token, startedAt,
   * revealAt). The reveal itself is DERIVED on every tab from revealAt (see
   * the E2.4 effect) — this replaced the old picking-tab-only setTimeout
   * chain whose death mid-spin left every tab's wheel stuck open. The token
   * derives from the row's seq (globally unique per session), not the old
   * per-tab counter that could repeat across commander and remote.
   */
  const beginTurn = (studentId: string, opts: { overlay?: boolean; magic?: boolean } = {}) => {
    const now = Date.now();
    const useOverlay = opts.overlay !== false;
    const token = turnTokenFor(studentId, liveSeqRef.current + 1);
    const spinAction = {
      type: 'SPIN_WHEEL',
      payload: { targetId: studentId, magic: opts.magic || undefined, overlay: useOverlay },
      timestamp: now,
    };
    // Compat broadcast first (game guards key on SPIN_WHEEL via lastAction),
    // then the optimistic local apply — same ordering as every other sender.
    broadcastAction(spinAction as SessionAction);
    setState(prev => ({
      ...prev,
      selectionHistory: prev.selectionHistory.includes(studentId)
        ? prev.selectionHistory
        : [...prev.selectionHistory, studentId],
      turnsThisExercise: prev.turnsThisExercise.includes(studentId)
        ? prev.turnsThisExercise
        : [...prev.turnsThisExercise, studentId],
      activeOverlay: useOverlay ? 'QUICK_WHEEL' as const : 'NONE' as const,
      quickWheelWinner: studentId,
      lastAction: spinAction as SessionAction,
    }));
    spinInFlightRef.current = true;
    turnWriterIsLocalRef.current = true;
    void updateLiveTurn({
      responderId: studentId,
      turnToken: token,
      turnStartedAt: now,
      revealAt: now + SPIN_REVEAL_MS,
      overlay: useOverlay ? 'QUICK_WHEEL' : 'NONE',
    });
  };

  const magicSelectStudent = (studentId: string) => {
    // B4.1: guard against an invalid/empty selection. Previously a magic pick
    // with a falsy id (e.g. caller bug) would broadcast SPIN_WHEEL with an
    // undefined target and the board's spinTo() would crash.
    if (!studentId) return;
    if (spinInFlightRef.current) return; // a spin chain is already running
    // E2.4: pick + wheel + derived reveal (see beginTurn). A manual pick ALSO
    // counts as a turn this exercise (strict round-robin — locked 0.1.1).
    beginTurn(studentId, { magic: true });
  };

  const selectNextStudent = (filterTeam?: string, useOverlay: boolean = true) => {
    let pool = filterPresent(state.students);

    if (filterTeam) {
      pool = pool.filter(s => s.team === filterTeam);
    }

    // B4.1: empty-pool guard. Previously `pool[randomIndex].id` threw
    // TypeError when no students were loaded or a team filter matched no one.
    // Common triggers: spinning before any class is bound, or after assigning
    // a team filter that everyone's absent from.
    if (pool.length === 0) {
      log.warn('select_next_student_empty_pool', {
        metadata: { filterTeam, studentCount: state.students.length }
      });
      return;
    }

    let selectedId: string;

    if (state.selectionMode === 'ROUND_ROBIN') {
      // STRICT per-exercise round-robin (locked decision 0.1.1): prefer students
      // who have NOT had a turn this exercise; when everyone has, start a new
      // round (reset) so coverage repeats fairly. Teacher override (magicSelect)
      // still works and counts as a turn.
      const remaining = pool.filter(s => !state.turnsThisExercise.includes(s.id));
      const eligible = remaining.length > 0 ? remaining : pool; // all gone → new round
      const idx = Math.floor(Math.random() * eligible.length);
      selectedId = eligible[idx].id;
      // If we just emptied the pool (new round starting), reset the tracker.
      if (remaining.length === 0) {
        setState(prev => ({ ...prev, turnsThisExercise: [] }));
      }
    } else if (state.selectionMode === 'RANDOM') {
      const randomIndex = Math.floor(Math.random() * pool.length);
      selectedId = pool[randomIndex].id;
    } else {
      const unpicked = pool.filter(s => !state.selectionHistory.includes(s.id));

      if (unpicked.length > 0) {
        const randomIndex = Math.floor(Math.random() * unpicked.length);
        selectedId = unpicked[randomIndex].id;
      } else {
        const sortedByRecency = [...pool].sort((a, b) => {
          const indexA = state.selectionHistory.lastIndexOf(a.id);
          const indexB = state.selectionHistory.lastIndexOf(b.id);
          return indexA - indexB;
        });
        selectedId = sortedByRecency[0].id;
      }
    }

    if (spinInFlightRef.current) return; // a spin chain is already running
    // E2.4: pick + wheel + derived reveal (see beginTurn). The optimistic
    // update (selectionHistory / turnsThisExercise / overlay / winner) and the
    // reveal choreography all live there now — no picking-tab timer chain.
    beginTurn(selectedId, { overlay: useOverlay });
  };

  /**
   * Game-lifecycle helper (workstream: pick → reset → score → next). Clears the
   * current responder (back to practice/choral mode momentarily) and then
   * immediately spins for the next one. The Baton "Next Student" button calls
   * this so the teacher advances the whole loop in one tap. */
  const nextStudent = () => {
    if (spinInFlightRef.current) return; // a spin chain is already running
    triggerAction('CLEAR_RESPONDER');
    // Tiny delay so the clear renders before the spin overlay opens; otherwise
    // the overlay's winner card flickers with the old student's data.
    setTimeout(() => selectNextStudent(), 50);
  };

  // --- Drawing Logic ---
  const startDrawing = (x: number, y: number, color: string = '#ef4444') => {
    const newId = Date.now().toString();
    setCurrentStrokeId(newId);

    // Broadcast
    const action = { type: 'DRAWING_START', payload: { id: newId, x, y, color }, timestamp: Date.now() };
    broadcastAction(action);

    // Optimistic Update
    setState(prev => ({
      ...prev,
      drawings: [...prev.drawings, { id: newId, color, width: 4, points: [{ x, y }], isComplete: false }]
    }));
  };

  const addDrawingPoint = (x: number, y: number) => {
    if (!currentStrokeId) return;

    // Broadcast
    const action = { type: 'DRAWING_POINT', payload: { id: currentStrokeId, x, y }, timestamp: Date.now() };
    broadcastAction(action);

    // Optimistic Update
    setState(prev => ({
      ...prev,
      drawings: prev.drawings.map(d =>
        d.id === currentStrokeId ? { ...d, points: [...d.points, { x, y }] } : d
      )
    }));
  };

  const endDrawing = () => {
    if (!currentStrokeId) return;

    // Broadcast
    const action = { type: 'DRAWING_END', payload: { id: currentStrokeId }, timestamp: Date.now() };
    broadcastAction(action);

    // Optimistic update
    setState(prev => ({
      ...prev,
      drawings: prev.drawings.map(d =>
        d.id === currentStrokeId ? { ...d, isComplete: true } : d
      )
    }));
    setCurrentStrokeId(null);
  };

  const clearDrawings = () => {
    const action = { type: 'DRAWING_CLEAR', timestamp: Date.now() };
    broadcastAction(action);
    setState(prev => ({ ...prev, drawings: [] }));
  };

  // --- Quiet Mode & Effects ---
  const triggerConfetti = () => {
    setState(prev => ({ ...prev, confettiTrigger: Date.now() }));
  };

  const setQuietMode = (active: boolean) => {
    // Broadcast so the board (separate tab) shows the "Silence Required"
    // overlay. B5: previously local-only — only the MASS_PENALTY side-effect
    // crossed tabs, so the board never knew quiet mode was on.
    broadcastAction({ type: 'QUIET_MODE_CHANGED', payload: { active }, timestamp: Date.now() });
    setState(prev => ({ ...prev, quietModeActive: active }));
    void updateLiveTurn({ quietMode: active });
  };

  const updateNoiseLevel = (level: number) => {
    // Noise level is high-frequency (mic samples) — don't spam the channel.
    // Quiet-mode TOGGLE is what matters cross-tab (above); the needle itself
    // is local-only on each tab that has a mic.
    setState(prev => ({ ...prev, noiseLevel: level }));
  };

  return (
    <SessionContext.Provider value={{
      state, loadUnits, loadStudents, setActiveClass, setActiveUnit, ensureAttendanceOccurrence, saveUnit, unlockNextLevel,
      startSession, endSession, retrySync, nextSlide, prevSlide, goToSlide, addPoints, deductAllPoints,
      toggleConnection, setLiveSnap, triggerAction,
      selectNextStudent, magicSelectStudent, setSelectionMode, assignTeams, closeOverlay, dismissWheel, cancelTurn, nextStudent,
      startDrawing, addDrawingPoint, endDrawing, clearDrawings,
      triggerConfetti, setQuietMode, updateNoiseLevel, gradeStudent,
      pushToRemediation, getRemediationQueue, drainRemediation
    }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within SessionProvider');
  return context;
};

/**
 * FIXPLAN E1.2 — the deterministic seed base every board template shares.
 * The commander preview and the projector mount SEPARATE instances of each
 * game; content randomness keyed on this base (composed with per-turn /
 * per-round parts via `makeRng(...)`) deals the identical content on every
 * tab. Falls back to the local session-start timestamp until the session row
 * id is known (go-live tab captures it from the upsert; other tabs via
 * applySessionRow) — the fallback window is before any game is played.
 * NOTE: the classroom_sessions row id is stable per teacher (upsert updates
 * in place), so cross-SESSION variety comes from the turn/round seed parts;
 * a true per-session nonce lands with Phase 2's live_state.
 */
export function useSeedBase(): string {
  const { state } = useSession();
  const session = state.sessionId ?? (state.sessionStartedAt ? `t${state.sessionStartedAt}` : 'local');
  return `${session}|${state.activeUnit?.id ?? 'unit'}|${state.currentStepIndex}`;
}
