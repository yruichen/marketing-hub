import { create } from 'zustand';

export type AppSection =
  | 'brainstorm'
  | 'dashboard'
  | 'projects'
  | 'content'
  | 'builder'
  | 'assets'
  | 'review'
  | 'community'
  | 'profile'
  | 'billing'
  | 'admin'
  | 'config'
  | 'copy'
  | 'image'
  | 'storyboard'
  | 'audio'
  | 'video';

interface UiState {
  rightPanelOpen: boolean;
  darkMode: boolean;
  setRightPanelOpen: (open: boolean) => void;
  setDarkMode: (enabled: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  rightPanelOpen: false,
  darkMode: localStorage.getItem('mh_darkMode') === 'true',
  setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
  setDarkMode: (darkMode) => set({ darkMode }),
}));
