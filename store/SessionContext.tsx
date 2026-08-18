import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
import { Engine, LessonUnit } from '../services/SupabaseService';
import { supabase } from '../services/supabaseClient';
import { getTeacherStudents, getSessionRoster, awardClassPoints, StudentWithProgress } from '../services/DataService';
import { mergePresence, filterPresent } from '../services/attendanceLogic';
import { getOrCreateActiveOccurrence, endOccurrence, getAttendanceForOccurrence } from '../services/AttendanceService';
import { createClientLogger } from '../services/logger';

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
  type: string;
  payload?: any;
  timestamp: number;
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

interface SessionState {
  status: SessionStatus;
  currentStepIndex: number;
  activeSlideData: any;
  activeUnit: LessonUnit | null;
  /** The class currently "live" — drives the roster-first student list. Null = legacy
   *  fallback (all teacher students). */
  activeClassId: string | null;
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
  /** Same-session remediation queue (architecture §3.3): objectives missed
   *  by ≥1 student this session, prioritized by the next WRAPUP/REVIEW slide's
   *  round-builder. Deliberately separate from FSRS cross-lesson scheduling. */
  remediationQueue: RemediationEntry[];
  /** Timestamp (ms) the current session started — scopes analytics queries. */
  sessionStartedAt?: number | null;
}

/** A missed objective on the same-session remediation queue. */
export interface RemediationEntry {
  objectiveId: string;
  /** Roster student ids who missed it (for the struggling-students view). */
  missedBy: string[];
  lastMissedAt: number; // Date.now()
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
  setActiveUnit: (unitId: string) => Promise<void>;
  /** Ensure an attendance occurrence exists for the live class (for opening the
   *  attendance modal before go-live). Returns the occurrence id or null. */
  ensureAttendanceOccurrence: () => Promise<{ id: string | null; error: string | null }>;
  saveUnit: (unitId: string, updates: Partial<LessonUnit>) => Promise<void>;
  startSession: () => void;
  endSession: () => void;
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
    remediationQueue: [],
    sessionStartedAt: null,
  });

  const [currentStrokeId, setCurrentStrokeId] = useState<string | null>(null);
  const channelRef = useRef<any>(null);
  const activeUnitRef = useRef<LessonUnit | null>(null);
  // ── Spin-cycle guard rails ────────────────────────────────────────────────
  // One physical spin = one SPIN_WHEEL → (2.5s) → GAME_WIN/NEW_TURN/DISMISS_
  // WHEEL chain. Without the in-flight guard a double-tap on "Next Student"
  // ran the whole chain twice (cursor skipped a full wave, round-robin
  // bookkeeping double-appended); without timer cancellation a slide change
  // mid-spin still fired NEW_TURN/confetti onto whatever slide came next.
  const spinInFlightRef = useRef(false);
  const spinTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const turnSeqRef = useRef(0);
  /** Last step index this tab synced via applySessionRow (slide-change detection). */
  const lastSyncedStepRef = useRef<number | null>(null);
  const cancelSpinTimers = () => {
    spinTimeoutsRef.current.forEach(clearTimeout);
    spinTimeoutsRef.current = [];
    spinInFlightRef.current = false;
  };

  // Class-points ledger accumulator (debounced flush). Keyed by roster student id.
  const pendingPointsRef = useRef<Record<string, number>>({});
  const activeClassIdRef = useRef<string | null>(null);
  useEffect(() => { activeClassIdRef.current = state.activeClassId; }, [state.activeClassId]);
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
            .catch((err: any) => log.warn('ledger_flush_failed', { error: err instanceof Error ? err.message : String(err) }))
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

    channel
      .on('broadcast', { event: 'classroom_action' }, ({ payload: action }) => {
        setState(prev => {
          const newState = { ...prev, lastAction: action };

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
          } else if (action.type === 'SHOW_LEADERBOARD') {
            // Flash the unified class leaderboard (locked decision 0.1.4).
            newState.activeOverlay = newState.activeOverlay === 'LEADERBOARD' ? 'NONE' : 'LEADERBOARD';
          } else if (action.type === 'CLEAR_RESPONDER') {
            // Teacher Baton "Class" — clear the selected responder for a choral/group round.
            newState.quickWheelWinner = null;
            newState.currentTurnId = null;
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
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      // Kill any pending spin chain too — a pending GAME_WIN/NEW_TURN must
      // never fire into an unmounted provider.
      cancelSpinTimers();
    };
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

    // Propagate the live-class binding to every tab (board/commander/remote) so
    // each loads the correct roster-first student list — even before a unit is set.
    if (row.class_id !== undefined && row.class_id !== null) {
      setState(prev => (prev.activeClassId === row.class_id ? prev : { ...prev, activeClassId: row.class_id }));
    }

    if (!row.unit_id) return;

    let unit = activeUnitRef.current;
    if (!unit || unit.id !== row.unit_id) {
      const fresh = await Engine.getUnitById(row.unit_id);
      if (!fresh) return;
      unit = fresh;
      activeUnitRef.current = fresh;
    }

    const flow = unit.flow || [];
    const idx = Math.min(Math.max(0, row.current_index ?? 0), Math.max(0, flow.length - 1));
    // Slide-change side effects live OUTSIDE the setState updater (updaters
    // must stay pure — StrictMode double-invokes them): kill any in-flight
    // spin chain so its 2.5s timers can't fire GAME_WIN/NEW_TURN/confetti
    // onto the slide the class just moved to.
    if (lastSyncedStepRef.current !== null && lastSyncedStepRef.current !== idx) {
      cancelSpinTimers();
    }
    lastSyncedStepRef.current = idx;
    setState(prev => {
      const slideChanged = idx !== prev.currentStepIndex;
      return {
        ...prev,
        activeUnit: unit!,
        sessionId: row.id,
        currentStepIndex: idx,
        activeSlideData: flow[idx] ?? null,
        status: (row.status as SessionStatus) || prev.status,
        // Step changed via realtime sync → reset per-exercise round-robin so the
        // remote's picker matches the board (locked decision 0.1.1).
        turnsThisExercise: slideChanged ? [] : prev.turnsThisExercise,
        // Mirror goToSlide: clear the picked responder + current turn when the
        // slide actually changes. This is the BOARD tab's path — without it, a
        // student picked on slide N stayed "picked" on slide N+1 on the board
        // (the commander cleared its own via goToSlide, but the board receives
        // slide changes here, not via goToSlide). Same-index sync preserves the
        // pick so a realtime re-broadcast doesn't drop a mid-slide responder.
        quickWheelWinner: slideChanged ? null : prev.quickWheelWinner,
        currentTurnId: slideChanged ? null : prev.currentTurnId,
        // Same mirror for the overlays/ink: without this a LEADERBOARD overlay
        // (and accumulated drawings) persisted over the NEXT slide on the
        // projector — "the screen is stuck".
        activeOverlay: slideChanged ? 'NONE' : prev.activeOverlay,
        drawings: slideChanged ? [] : prev.drawings,
      };
    });
  }, []);

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
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [applySessionRow, getTeacherId]);

  const persistSessionIndex = useCallback(async (index: number) => {
    const userId = await getTeacherId();
    if (!userId) return;
    try {
      await supabase
        .from('classroom_sessions')
        .update({ current_index: index, updated_at: new Date().toISOString() })
        .eq('teacher_id', userId);
    } catch {
      // Best-effort: local state already updated optimistically.
    }
  }, [getTeacherId]);

  const persistSessionStatus = useCallback(async (status: SessionStatus) => {
    const userId = await getTeacherId();
    if (!userId) return;
    const patch: any = { status, updated_at: new Date().toISOString() };
    if (status === 'IDLE') patch.current_index = 0;
    try {
      await supabase
        .from('classroom_sessions')
        .update(patch)
        .eq('teacher_id', userId);
    } catch {
      // Best-effort: local state already updated optimistically.
    }
  }, [getTeacherId]);

  const broadcastAction = (action: SessionAction) => {
    channelRef.current?.send({ type: 'broadcast', event: 'classroom_action', payload: action });
  };

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
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeClassId]);

  const setActiveUnit = async (unitId: string) => {
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
      const initialFlow = unit.flow && unit.flow.length > 0 ? unit.flow : [];
      setState(prev => ({
        ...prev,
        activeUnit: unit,
        activeSlideData: initialFlow[0],
        currentStepIndex: 0
      }));

      // Persist so the projector board / remote follow this unit.
      const userId = await getTeacherId();
      if (userId) {
        try {
          await supabase
            .from('classroom_sessions')
            .upsert(
              { teacher_id: userId, class_id: activeClassIdRef.current, unit_id: unitId, current_index: 0, status: 'LIVE', updated_at: new Date().toISOString() },
              { onConflict: 'teacher_id' },
            );
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
      activeOccurrenceId: null,
      currentTurnId: null,          // turn lifecycle
      quickWheelWinner: null,
      remediationQueue: [],         // Prompt 0 — session-scoped remediation
      turnsThisExercise: [],
      sessionStartedAt: null,       // analytics scope
    }));
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
    if (state.activeUnit && state.activeUnit.flow && state.activeUnit.flow.length > 0) {
      return state.activeUnit.flow;
    }
    return [];
  };

  const goToSlide = (index: number) => {
    const flow = getFlow();
    if (index >= 0 && index < flow.length) {
      const slideChanged = index !== state.currentStepIndex;
      setState(prev => ({
        ...prev,
        currentStepIndex: index,
        activeSlideData: flow[index],
        drawings: [],
        activeOverlay: 'NONE',
        // New exercise → reset the per-exercise round-robin so every kid is
        // eligible again (locked decision 0.1.1: one turn each before any repeat).
        turnsThisExercise: index === prev.currentStepIndex ? prev.turnsThisExercise : [],
        // Bug fix: clear the picked responder when navigating to a DIFFERENT
        // slide. Previously quickWheelWinner leaked across slides, so a student
        // picked on slide N stayed "picked" on slide N+1 — games started with
        // a pre-selected student instead of in practice/choral mode. Same-index
        // re-entry preserves the pick (so a refresh mid-slide doesn't drop it).
        quickWheelWinner: slideChanged ? null : prev.quickWheelWinner,
        currentTurnId: slideChanged ? null : prev.currentTurnId,
      }));
      // Persist so the projector board / remote follow the teacher.
      persistSessionIndex(index);
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
    setState(prev => ({ ...prev, activeOverlay: 'NONE', quickWheelWinner: null, currentTurnId: null }));
  };

  const magicSelectStudent = (studentId: string) => {
    // B4.1: guard against an invalid/empty selection. Previously a magic pick
    // with a falsy id (e.g. caller bug) would broadcast SPIN_WHEEL with an
    // undefined target and the board's spinTo() would crash.
    if (!studentId) return;
    if (spinInFlightRef.current) return; // a spin chain is already running
    const spinAction = { type: 'SPIN_WHEEL', payload: { targetId: studentId, magic: true, overlay: true }, timestamp: Date.now() };
    broadcastAction(spinAction);

    // Optimistic update. A manual pick ALSO counts as a turn this exercise
    // (strict round-robin coverage — locked decision 0.1.1).
    setState(prev => ({
      ...prev,
      selectionHistory: [...prev.selectionHistory, studentId],
      turnsThisExercise: prev.turnsThisExercise.includes(studentId)
        ? prev.turnsThisExercise
        : [...prev.turnsThisExercise, studentId],
      activeOverlay: 'QUICK_WHEEL',
      quickWheelWinner: studentId,
      lastAction: spinAction
    }));

    // After the wheel reveal (~2s animation + 0.5s to read the winner), do ALL
    // the post-spin work in one place so the picking tab and other tabs converge:
    //   • GAME_WIN → confetti
    //   • set currentTurnId locally + broadcast NEW_TURN → games reset for this
    //     student (RC#1 fix: previously currentTurnId only updated via the
    //     broadcast reducer, which broadcast:{self:false} suppressed on the
    //     sender — so games never reset on the teacher's own screen).
    //   • dismiss the QUICK_WHEEL overlay (RC#2 fix: previously the overlay
    //     never auto-dismissed, hiding the freshly-reset game underneath).
    // Unique per-turn token: games key their reset on currentTurnId CHANGING —
    // re-picking the same student must still produce a new value.
    const turnToken = `${studentId}::${++turnSeqRef.current}`;
    spinInFlightRef.current = true;
    spinTimeoutsRef.current.push(
      setTimeout(() => {
        spinInFlightRef.current = false;
        triggerAction('GAME_WIN', { winnerId: studentId });
        const turnAction = { type: 'NEW_TURN', payload: { studentId, turnToken }, timestamp: Date.now() };
        broadcastAction(turnAction);
        // Broadcast DISMISS_WHEEL (not just a local setState) so the board
        // projector tab also hides its overlay — while KEEPING quickWheelWinner
        // so the picked student stays live for scoring + the whose-turn footer.
        broadcastAction({ type: 'DISMISS_WHEEL', timestamp: Date.now() });
        setState(prev => ({
          ...prev,
          currentTurnId: turnToken,
          activeOverlay: 'NONE',
          lastAction: turnAction,
        }));
      }, 2500),
    );
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

    const spinAction = { type: 'SPIN_WHEEL', payload: { targetId: selectedId, overlay: useOverlay }, timestamp: Date.now() };
    if (spinInFlightRef.current) return; // a spin chain is already running
    broadcastAction(spinAction);

    // Optimistic update (record the turn for strict round-robin coverage).
    setState(prev => ({
      ...prev,
      selectionHistory: [...prev.selectionHistory, selectedId],
      turnsThisExercise: prev.turnsThisExercise.includes(selectedId)
        ? prev.turnsThisExercise
        : [...prev.turnsThisExercise, selectedId],
      activeOverlay: useOverlay ? 'QUICK_WHEEL' : 'NONE',
      quickWheelWinner: selectedId,
      lastAction: spinAction
    }));

    // Unique per-turn token: games key their reset on currentTurnId CHANGING —
    // re-picking the same student must still produce a new value.
    const turnToken = `${selectedId}::${++turnSeqRef.current}`;
    spinInFlightRef.current = true;
    spinTimeoutsRef.current.push(
      setTimeout(() => {
        // After the wheel reveal (~2s animation + 0.5s to read the winner), do
        // ALL the post-spin work in one place so the picking tab and other tabs
        // converge. See magicSelectStudent for the full rationale (RC#1 + RC#2).
        spinInFlightRef.current = false;
        triggerAction('GAME_WIN', { winnerId: selectedId });
        const turnAction = { type: 'NEW_TURN', payload: { studentId: selectedId, turnToken }, timestamp: Date.now() };
        broadcastAction(turnAction);
        // Broadcast DISMISS_WHEEL (not just a local setState) so the board
        // projector tab also hides its overlay — while KEEPING quickWheelWinner
        // so the picked student stays live for scoring + the whose-turn footer.
        broadcastAction({ type: 'DISMISS_WHEEL', timestamp: Date.now() });
        setState(prev => ({
          ...prev,
          currentTurnId: turnToken,
          // Dismiss the overlay so the freshly-reset game is visible/interactive.
          // Keep quickWheelWinner so scoring still targets this student.
          activeOverlay: 'NONE',
          lastAction: turnAction,
        }));
      }, 2500),
    );
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
      startSession, endSession, nextSlide, prevSlide, goToSlide, addPoints, deductAllPoints,
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
