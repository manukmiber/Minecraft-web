/**
 * Interface-only state: which panel is open, how wide it is, whether the
 * command palette is showing. Persisted so the workspace comes back the way it
 * was left.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SideView =
  | 'content'
  | 'files'
  | 'textures'
  | 'presets'
  | 'inbox'
  | 'versions'
  | 'settings'

interface UiState {
  sideView: SideView
  sidebarOpen: boolean
  sidebarWidth: number
  inspectorWidth: number
  panelOpen: boolean
  panelHeight: number
  paletteOpen: boolean

  setSideView(view: SideView): void
  toggleSidebar(): void
  setSidebarWidth(width: number): void
  setInspectorWidth(width: number): void
  togglePanel(open?: boolean): void
  setPanelHeight(height: number): void
  setPaletteOpen(open: boolean): void
}

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      sideView: 'content',
      sidebarOpen: true,
      sidebarWidth: 268,
      inspectorWidth: 320,
      panelOpen: false,
      panelHeight: 190,
      paletteOpen: false,

      setSideView: (view) => {
        // Clicking the active icon collapses the sidebar, like VS Code.
        const { sideView, sidebarOpen } = get()
        if (sideView === view && sidebarOpen) set({ sidebarOpen: false })
        else set({ sideView: view, sidebarOpen: true })
      },
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.min(520, Math.max(200, width)) }),
      setInspectorWidth: (width) => set({ inspectorWidth: Math.min(560, Math.max(260, width)) }),
      togglePanel: (open) => set({ panelOpen: open ?? !get().panelOpen }),
      setPanelHeight: (height) => set({ panelHeight: Math.min(520, Math.max(120, height)) }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
    }),
    {
      name: 'mmmmmmmmmmmmm.ui',
      partialize: (state) => ({
        sideView: state.sideView,
        sidebarOpen: state.sidebarOpen,
        sidebarWidth: state.sidebarWidth,
        inspectorWidth: state.inspectorWidth,
        panelOpen: state.panelOpen,
        panelHeight: state.panelHeight,
      }),
    },
  ),
)
