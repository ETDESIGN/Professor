import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
import { Engine, LessonUnit } from '../services/SupabaseService';
import { supabase } from '../services/supabaseClient';
import { getTeacherStudents, StudentWithProgress } from '../services/DataService';
import { GamificationService } from '../services/GamificationService';
import { createClientLogger } from '../services/logger';

const log = createClientLogger('SessionContext');

type SessionStatus = 'IDLE' | 'LIVE' | 'PAUSED';
type SelectionMode = 'RANDOM' | 'FAIR' | 'ELIMINATION';

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
  students: any[];
  pointsLog: any[];
  selectionHistory: string[];
  selectionMode: SelectionMode;
  isConnected: boolean;
  liveSnapImage: string | null;
  lastAction: SessionAction | null;
  drawings: DrawingStroke[];
  confettiTrigger: number;
  activeOverlay: 'NONE' | 'QUICK_WHEEL';
  quickWheelWinner: string | null;
  quietModeActive: boolean;
  noiseLevel: number;
  units: LessonUnit[];
  score?: number;
  totalCorrect?: number;
  totalAttempts?: number;
  sessionId?: string | null;
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
});

export interface SessionContextType {
  state: SessionState;
  loadUnits: () => Promise<void>;
  loadStudents: () => Promise<void>;
  setActiveUnit: (unitId: string) => Promise<void>;
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
  closeOverlay: () => void;
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
}

export const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<SessionState>({
    status: 'IDLE',
    currentStepIndex: 0,
    activeSlideData: null,
    activeUnit: null,
    students: [],
    pointsLog: [],
    selectionHistory: [],
    selectionMode: 'FAIR',
    isConnected: false,
    liveSnapImage: null,
    lastAction: null,
    drawings: [],
    confettiTrigger: 0,
    activeOverlay: 'NONE',
    quickWheelWinner: null,
    quietModeActive: false,
    noiseLevel: 0,
    units: [],
    sessionId: null,
  });

  const [currentStrokeId, setCurrentStrokeId] = useState<string | null>(null);
  const channelRef = useRef<any>(null);
  const activeUnitRef = useRef<LessonUnit | null>(null);

  useEffect(() => {
    loadUnits();
    loadStudents(); // Load students for the teacher

    // Initialize Supabase Realtime channel
    const channel = supabase.channel('classroom_live');

    channel
      .on('broadcast', { event: 'classroom_action' }, ({ payload: action }) => {
        setState(prev => {
          const newState = { ...prev, lastAction: action };

          if (action.type === 'WINNER_DECLARED' || action.type === 'GAME_WIN') {
            newState.confettiTrigger = Date.now();
          } else if (action.type === 'END_SESSION') {
            newState.status = 'IDLE';
            newState.currentStepIndex = 0;
            newState.activeOverlay = 'NONE';
            newState.drawings = [];
          } else if (action.type === 'CLOSE_OVERLAY') {
            newState.activeOverlay = 'NONE';
            newState.quickWheelWinner = null;
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
    };
  }, []);

  // ---- Authoritative classroom session (Phase 1, audit P0-1) ----
  // The projector board, teacher remote and commander are separate React roots.
  // They converge on this teacher's classroom_sessions row via Realtime instead
  // of relying on local-only state that never crossed tabs.
  const applySessionRow = useCallback(async (row: any) => {
    if (!row || !row.unit_id) return;

    let unit = activeUnitRef.current;
    if (!unit || unit.id !== row.unit_id) {
      const fresh = await Engine.getUnitById(row.unit_id);
      if (!fresh) return;
      unit = fresh;
      activeUnitRef.current = fresh;
    }

    const flow = unit.flow || [];
    const idx = Math.min(Math.max(0, row.current_index ?? 0), Math.max(0, flow.length - 1));
    setState(prev => ({
      ...prev,
      activeUnit: unit!,
      sessionId: row.id,
      currentStepIndex: idx,
      activeSlideData: flow[idx] ?? null,
      status: (row.status as SessionStatus) || prev.status,
    }));
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

  const setActiveUnit = async (unitId: string) => {
    let unit = state.units.find(u => u.id === unitId);
    if (!unit) {
      unit = await Engine.getUnitById(unitId);
    }
    if (unit) {
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
              { teacher_id: userId, unit_id: unitId, current_index: 0, status: 'LIVE', updated_at: new Date().toISOString() },
              { onConflict: 'teacher_id' },
            );
        } catch {
          // Best-effort: local state already updated optimistically.
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
    setState(prev => ({ ...prev, status: 'LIVE', currentStepIndex: 0, selectionHistory: [] }));
    persistSessionStatus('LIVE');
  };

  const endSession = () => {
    const action = { type: 'END_SESSION', timestamp: Date.now() };
    broadcastAction(action);
    setState(prev => ({ ...prev, status: 'IDLE', currentStepIndex: 0, activeOverlay: 'NONE', drawings: [] }));
    persistSessionStatus('IDLE');
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
      setState(prev => ({
        ...prev,
        currentStepIndex: index,
        activeSlideData: flow[index],
        drawings: [],
        activeOverlay: 'NONE'
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

    if (amount > 0) {
      GamificationService.awardXP(amount, 'classroom_points').catch(err => {
        log.warn('xp_persist_failed', { error: err instanceof Error ? err.message : String(err) });
      });
    }
  }, [broadcastAction]);

  // Per-student board capture (Phase 3.3): writes a teacher grade into the shared
  // LearnerState for the active unit. Non-fatal; logged on failure.
  const gradeStudent = useCallback(async (studentId: string, word: string, correct: boolean) => {
    const unitId = state.activeUnit?.id || '';
    if (!unitId || !studentId || !word) return;
    try {
      const { gradeStudent: grade } = await import('../services/boardLearner');
      await grade(studentId, unitId, word, correct);
    } catch (err) {
      log.warn('grade_student_failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, [state.activeUnit?.id]);

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
    setState(prev => ({ ...prev, selectionMode: mode }));
  };

  const closeOverlay = () => {
    const action = { type: 'CLOSE_OVERLAY', timestamp: Date.now() };
    broadcastAction(action);

    // Optimistic update
    setState(prev => ({ ...prev, activeOverlay: 'NONE', quickWheelWinner: null }));
  };

  const magicSelectStudent = (studentId: string) => {
    const spinAction = { type: 'SPIN_WHEEL', payload: { targetId: studentId, magic: true, overlay: true }, timestamp: Date.now() };
    broadcastAction(spinAction);

    // Optimistic update
    setState(prev => ({
      ...prev,
      selectionHistory: [...prev.selectionHistory, studentId],
      activeOverlay: 'QUICK_WHEEL',
      quickWheelWinner: studentId,
      lastAction: spinAction
    }));

    setTimeout(() => {
      triggerAction('GAME_WIN', { winnerId: studentId });
    }, 4000);
  };

  const selectNextStudent = (filterTeam?: string, useOverlay: boolean = true) => {
    let pool = state.students;

    if (filterTeam) {
      pool = pool.filter(s => s.team === filterTeam);
    }

    let selectedId: string;

    if (state.selectionMode === 'RANDOM') {
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
    broadcastAction(spinAction);

    // Optimistic update
    setState(prev => ({
      ...prev,
      selectionHistory: [...prev.selectionHistory, selectedId],
      activeOverlay: useOverlay ? 'QUICK_WHEEL' : 'NONE',
      quickWheelWinner: selectedId,
      lastAction: spinAction
    }));

    setTimeout(() => {
      triggerAction('GAME_WIN', { winnerId: selectedId });
    }, 4000);
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
    setState(prev => ({ ...prev, quietModeActive: active }));
  };

  const updateNoiseLevel = (level: number) => {
    setState(prev => ({ ...prev, noiseLevel: level }));
  };

  return (
    <SessionContext.Provider value={{
      state, loadUnits, loadStudents, setActiveUnit, saveUnit, unlockNextLevel,
      startSession, endSession, nextSlide, prevSlide, goToSlide, addPoints, deductAllPoints,
      toggleConnection, setLiveSnap, triggerAction,
      selectNextStudent, magicSelectStudent, setSelectionMode, closeOverlay,
      startDrawing, addDrawingPoint, endDrawing, clearDrawings,
      triggerConfetti, setQuietMode, updateNoiseLevel, gradeStudent
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
