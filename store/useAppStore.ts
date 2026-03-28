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
      units: [
        {
          id: 'u1',
          title: 'Unit 1: Jungle Safari',
          level: 'Beginner',
          status: 'Active',
          lessons: 4,
          coverImage: 'https://api.dicebear.com/7.x/shapes/svg?seed=jungle&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be',
          lastUpdated: '2d ago',
          flow: MOCK_LESSON_FLOW,
          topic: 'Animals',
          scannedAssets: []
        },
        {
          id: 'u2',
          title: 'Unit 2: My Family',
          level: 'Beginner',
          status: 'Draft',
          lessons: 3,
          coverImage: 'https://api.dicebear.com/7.x/shapes/svg?seed=family&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be',
          lastUpdated: '5d ago',
          flow: [],
          topic: 'Family',
          scannedAssets: []
        }
      ],
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
      name: 'app-storage',
      partialize: (state) => ({
        units: state.units,
        students: state.students,
        // CRITICAL: Exclude userProfile from persistence to ensure it's always fetched fresh from database
        // and doesn't get trapped in a stale missing-profile state.
      }),
    }
  )
);
