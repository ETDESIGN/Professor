import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LessonUnit } from '../services/SupabaseService';

interface AppState {
  units: LessonUnit[];
  students: any[];
  userProfile: any | null;
  setUnits: (units: LessonUnit[]) => void;
  addUnit: (unit: LessonUnit) => void;
  updateUnit: (id: string, updates: Partial<LessonUnit>) => void;
  setStudents: (students: any[]) => void;
  setUserProfile: (profile: any) => void;
  clearUserProfile: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      units: [],
      students: [],
      userProfile: null,
      setUnits: (units) => set({ units }),
      addUnit: (unit) => set((state) => ({ units: [...state.units, unit] })),
      updateUnit: (id, updates) => set((state) => ({
        units: state.units.map((u) => u.id === id ? { ...u, ...updates } : u)
      })),
      setStudents: (students) => set({ students }),
      setUserProfile: (profile) => set({ userProfile: profile }),
      clearUserProfile: () => set({ userProfile: null }),
    }),
    {
      name: 'app-storage-v2',
      version: 2,
      partialize: (state) => ({
        units: state.units,
        students: state.students,
      }),
      migrate: (persistedState: any, version) => {
        if (version < 2) {
          return { units: [], students: [] };
        }
        return persistedState;
      },
    }
  )
);
