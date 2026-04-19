import { create } from 'zustand';

interface AppState {
  userProfile: any | null;
  setUserProfile: (profile: any) => void;
  clearUserProfile: () => void;
}

export const useAppStore = create<AppState>()((set) => ({
  userProfile: null,
  setUserProfile: (profile) => set({ userProfile: profile }),
  clearUserProfile: () => set({ userProfile: null }),
}));
