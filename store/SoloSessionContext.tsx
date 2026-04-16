import React, { createContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { Engine, LessonUnit } from '../services/SupabaseService';
import { SessionContext, SessionContextType } from './SessionContext';
import { getTeacherStudents, StudentWithProgress } from '../services/DataService';
import { supabase } from '../services/supabaseClient';

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
  score: 0,
  totalCorrect: 0,
  totalAttempts: 0,
  studentProgress: { completedUnitIds: [], currentUnitId: '', xp: 0, streak: 0 },
};

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
      console.error('SoloSession: Error loading progress:', error);
    }
  };

  const loadUnits = async () => {
    try {
      const units = await Engine.fetchUnits();
      setState(prev => ({ ...prev, units }));
    } catch (error) {
      console.error('SoloSession: Error loading units:', error);
    }
  };

  const loadStudents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const students = await getTeacherStudents(user.id);
      const mappedStudents = students.map((s: StudentWithProgress) => ({
        id: s.id,
        name: s.full_name || s.email || 'Unknown',
        avatar: s.avatar_url || '',
        email: s.email,
        student_id: s.student_id,
        xp: s.xp,
        streak: s.streak,
        points: s.xp,
      }));
      setState(prev => ({ ...prev, students: mappedStudents }));
    } catch (error) {
      console.error('SoloSession: Error loading students:', error);
    }
  };

  const setActiveUnit = async (unitId: string) => {
    let unit = state.units.find(u => u.id === unitId);
    if (!unit) {
      unit = await Engine.getUnitById(unitId);
    }
    if (unit) {
      const initialFlow = unit.flow && unit.flow.length > 0 ? unit.flow : [];
      setState(prev => ({
        ...prev,
        activeUnit: unit,
        activeSlideData: initialFlow[0],
        currentStepIndex: 0,
        score: 0,
        totalCorrect: 0,
        totalAttempts: 0,
      }));

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await Engine.ensureStudentSRSItems(unitId, user.id);
        }
      } catch (err) {
        console.error('SoloSession: SRS clone error:', err);
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

  const startSession = () => {
    setState(prev => ({ ...prev, status: 'LIVE', currentStepIndex: 0, selectionHistory: [] }));
  };

  const endSession = () => {
    setState(prev => ({ ...prev, status: 'IDLE', currentStepIndex: 0, activeOverlay: 'NONE', drawings: [] }));
  };

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

  const recordAnswer = (correct: boolean) => {
    setState(prev => ({
      ...prev,
      totalCorrect: prev.totalCorrect + (correct ? 1 : 0),
      totalAttempts: prev.totalAttempts + 1,
    }));
  };

  const deductAllPoints = (amount: number) => {
    setState(prev => ({ ...prev }));
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

  const selectNextStudent = (filterTeam?: string, useOverlay: boolean = true) => {};
  const magicSelectStudent = (studentId: string) => {};

  const startDrawing = (x: number, y: number, color: string = '#ef4444') => {};
  const addDrawingPoint = (x: number, y: number) => {};
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
    loadStudents,
    setActiveUnit,
    saveUnit,
    startSession,
    endSession,
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
  };

  return (
    <SessionContext.Provider value={contextValue}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSoloSession = () => {
  const sessionCtx = React.useContext(SessionContext);
  if (!sessionCtx) throw new Error('useSoloSession must be used within SoloSessionProvider');
  const soloState = sessionCtx.state as SoloSessionState;
  return {
    ...sessionCtx,
    state: soloState,
    recordAnswer: (sessionCtx as any).recordAnswer,
  };
};
