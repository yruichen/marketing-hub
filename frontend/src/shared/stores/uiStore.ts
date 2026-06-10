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
  | 'billing'
  | 'config'
  | 'copy'
  | 'image'
  | 'storyboard'
  | 'audio';

interface UiState {
  activeSection: AppSection;
  rightPanelOpen: boolean;
  darkMode: boolean;
  setActiveSection: (section: AppSection) => void;
  setRightPanelOpen: (open: boolean) => void;
  setDarkMode: (enabled: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeSection: 'dashboard',
  rightPanelOpen: false,
  darkMode: localStorage.getItem('mh_darkMode') === 'true',
  setActiveSection: (activeSection) => set({ activeSection }),
  setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
  setDarkMode: (darkMode) => set({ darkMode }),
}));
