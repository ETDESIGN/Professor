import React, { createContext, useState, ReactNode, useEffect } from 'react';
import { Engine, LessonUnit } from '../services/SupabaseService';
import { SessionContextType } from './SessionContext';
import { supabase } from '../services/supabaseClient';
import { createClientLogger } from '../services/logger';
import { resolveUnitPath } from '../services/stageProgressService';
import type { StudentStage } from '../types/stage';

const log = createClientLogger('SoloSessionContext');

type SessionStatus = 'IDLE' | 'LIVE' | 'PAUSED';

interface StudentProgress {
  completedUnitIds: string[];
  currentUnitId: string;
  xp: number;
  streak: number;
}

interface SoloSessionState {
  status: SessionStatus;
  currentStepIndex: number;
  activeSlideData: any;
  activeUnit: LessonUnit | null;
  /** The student-path node in play, when launched from a map node. Null = full-flow lesson. */
  activeStage: StudentStage | null;
  students: any[];
  pointsLog: any[];
  selectionHistory: string[];
  selectionMode: 'RANDOM' | 'FAIR' | 'ELIMINATION';
  isConnected: boolean;
  liveSnapImage: string | null;
  lastAction: any | null;
  drawings: any[];
  confettiTrigger: number;
  activeOverlay: 'NONE' | 'QUICK_WHEEL';
  quickWheelWinner: string | null;
  quietModeActive: boolean;
  noiseLevel: number;
  units: LessonUnit[];
  unitsLoading: boolean;
  unitsError: string | null;
  score: number;
  totalCorrect: number;
  totalAttempts: number;
  studentProgress: StudentProgress;
}

const initialState: SoloSessionState = {
  status: 'IDLE',
  currentStepIndex: 0,
  activeSlideData: null,
  activeUnit: null,
  activeStage: null,
  students: [],
  pointsLog: [],
  selectionHistory: [],
  selectionMode: 'FAIR',
  isConnected: true,
  liveSnapImage: null,
  lastAction: null,
  drawings: [],
  confettiTrigger: 0,
  activeOverlay: 'NONE',
  quickWheelWinner: null,
  quietModeActive: false,
  noiseLevel: 0,
  units: [],
  unitsLoading: true,
  unitsError: null,
  score: 0,
  totalCorrect: 0,
  totalAttempts: 0,
  studentProgress: { completedUnitIds: [], currentUnitId: '', xp: 0, streak: 0 },
};

export const SoloSessionContext = createContext<SessionContextType | undefined>(undefined);

export const SoloSessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<SoloSessionState>(initialState);

  useEffect(() => {
    loadUnits();
    loadStudentProgress();
  }, []);

  const loadStudentProgress = async () => {
    try {
      const progress = await Engine.getStudentProgress();
      setState(prev => ({ ...prev, studentProgress: progress }));
    } catch (error) {
      log.warn('error_loading_progress', { error: error instanceof Error ? error.message : String(error) });
    }
  };

  const loadUnits = async () => {
    setState(prev => ({ ...prev, unitsLoading: true, unitsError: null }));
    try {
      const units = await Engine.fetchUnits();
      setState(prev => ({ ...prev, units, unitsLoading: false }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn('error_loading_units', { error: message });
      setState(prev => ({ ...prev, unitsLoading: false, unitsError: message }));
    }
  };

  const setActiveUnit = async (unitId: string, stageId?: string) => {
    // Prefer the FRESHEST copy from the DB — the boot-time state.units list
    // can be a stale snapshot from before a unit's media/flow was healed
    // (external audit 2026-09-05, finding #4; mirrors the teacher GO-LIVE
    // path). Fall back to the cached list entry when the fetch fails.
    let unit = state.units.find(u => u.id === unitId);
    try {
      const fresh = await Engine.getUnitById(unitId);
      if (fresh) unit = fresh;
    } catch {
      // keep the cached unit if the fresh fetch fails (offline resilience)
    }
    if (unit) {
      // C.4: attach the relational bundle (get_unit_bundle) to the manifest so the
      // student-side getVocabulary/getStory normalizers read relational content.
      // Non-enumerable so it is never persisted; mirrors SessionContext.
      try {
        const { data: bundle } = await supabase.rpc('get_unit_bundle', { p_unit_id: unitId });
        if (bundle && unit.manifest && typeof unit.manifest === 'object') {
          Object.defineProperty(unit.manifest, '_relational', { value: bundle, enumerable: false, configurable: true });
        }
      } catch {
        // normalizers fall back to the manifest if the bundle is unavailable
      }
      // Student-path node: scope the played flow to this stage's blocks (the
      // unit object is copied — the stored unit.flow is never mutated).
      // Without a stageId, the full flow plays (legacy / fallback behavior).
      let activeStage: StudentStage | null = null;
      let flowToPlay = unit.flow && unit.flow.length > 0 ? unit.flow : [];
      if (stageId) {
        const path = resolveUnitPath(unit as any);
        activeStage = path.find(s => s.id === stageId) || null;
        if (activeStage && activeStage.blocks.length > 0) {
          flowToPlay = activeStage.blocks;
        }
      }
      setState(prev => ({
        ...prev,
        activeUnit: activeStage ? { ...unit, flow: flowToPlay } : unit,
        activeStage,
        activeSlideData: flowToPlay[0],
        currentStepIndex: 0,
        score: 0,
        totalCorrect: 0,
        totalAttempts: 0,
      }));
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

  // startSession/endSession/loadStudents removed (2026-08-17): live-class
  // session control is teacher-side only and loadStudents queried
  // getTeacherStudents with the student's own id — dead/incorrect code.

  const getFlow = () => {
    if (state.activeUnit?.flow?.length) return state.activeUnit.flow;
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
        activeOverlay: 'NONE',
      }));
    }
  };

  const nextSlide = () => goToSlide(state.currentStepIndex + 1);
  const prevSlide = () => goToSlide(state.currentStepIndex - 1);

  const addPoints = (studentId: string, amount: number) => {
    setState(prev => ({
      ...prev,
      score: prev.score + Math.max(0, amount),
      pointsLog: [...prev.pointsLog, { studentId, amount, timestamp: new Date() }],
      confettiTrigger: amount > 0 ? Date.now() : prev.confettiTrigger,
      lastAction: { type: 'POINTS_AWARDED', payload: { studentId, amount }, timestamp: Date.now() },
    }));
  };

  const deductAllPoints = (amount: number) => {
    setState(prev => ({
      ...prev,
      score: Math.max(0, prev.score - amount),
      lastAction: { type: 'MASS_PENALTY', payload: { amount }, timestamp: Date.now() },
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
    setState(prev => ({ ...prev, lastAction: action }));
    if (type === 'WINNER_DECLARED' || type === 'GAME_WIN') {
      triggerConfetti();
    }
  };

  const setSelectionMode = (mode: 'RANDOM' | 'FAIR' | 'ELIMINATION') => {
    setState(prev => ({ ...prev, selectionMode: mode }));
  };

  const closeOverlay = () => {
    setState(prev => ({ ...prev, activeOverlay: 'NONE', quickWheelWinner: null }));
  };

  const selectNextStudent = (_filterTeam?: string, _useOverlay?: boolean) => {};
  const magicSelectStudent = (_studentId: string) => {};

  const startDrawing = (_x: number, _y: number, _color?: string) => {};
  const addDrawingPoint = (_x: number, _y: number) => {};
  const endDrawing = () => {};
  const clearDrawings = () => {
    setState(prev => ({ ...prev, drawings: [] }));
  };

  const triggerConfetti = () => {
    setState(prev => ({ ...prev, confettiTrigger: Date.now() }));
  };

  const setQuietMode = (active: boolean) => {
    setState(prev => ({ ...prev, quietModeActive: active }));
  };

  const updateNoiseLevel = (level: number) => {
    setState(prev => ({ ...prev, noiseLevel: level }));
  };

  const unlockNextLevel = async (currentUnitId: string) => {
    await Engine.unlockNextUnit(currentUnitId);
    await loadUnits();
  };

  const contextValue: SessionContextType = {
    state,
    loadUnits,
    setActiveUnit,
    saveUnit,
    nextSlide,
    prevSlide,
    goToSlide,
    addPoints,
    deductAllPoints,
    toggleConnection,
    setLiveSnap,
    triggerAction,
    selectNextStudent,
    magicSelectStudent,
    setSelectionMode,
    closeOverlay,
    startDrawing,
    addDrawingPoint,
    endDrawing,
    clearDrawings,
    triggerConfetti,
    setQuietMode,
    updateNoiseLevel,
    unlockNextLevel,
    __recordAnswer: (correct: boolean) => {
      setState((prev: SoloSessionState) => ({
        ...prev,
        totalCorrect: prev.totalCorrect + (correct ? 1 : 0),
        totalAttempts: prev.totalAttempts + 1,
      }));
    },
  } as any;

  return (
    <SoloSessionContext.Provider value={contextValue}>
      {children}
    </SoloSessionContext.Provider>
  );
};

export const useSoloSession = () => {
  const context = React.useContext(SoloSessionContext);
  if (!context) throw new Error('useSoloSession must be used within SoloSessionProvider');
  return {
    ...context,
    state: context.state as unknown as SoloSessionState,
    recordAnswer: (correct: boolean) => {
      (context as any).__recordAnswer?.(correct);
    },
  };
};
