/**
 * The workspace layout.
 *
 * Activity rail, a resizable sidebar, the editor area, and a problems panel
 * along the bottom — the arrangement anyone who uses an editor already knows,
 * so nothing here needs explaining.
 */

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { ActivityBar } from './ActivityBar'
import { CommandPalette } from './CommandPalette'
import { EditorArea } from './EditorArea'
import { ProblemsPanel } from './ProblemsPanel'
import { StatusBar } from './StatusBar'
import { TitleBar } from './TitleBar'
import { Toasts } from './Toasts'
import { ContentExplorer } from '../../features/explorer/ContentExplorer'
import { FileExplorer } from '../../features/explorer/FileExplorer'
import { PresetInbox } from '../../features/presets/PresetInbox'
import { PresetLibrary } from '../../features/presets/PresetLibrary'
import { SettingsView } from '../../features/settings/SettingsView'
import { VersionsView } from '../../features/versions/VersionsView'
import { restoreLastSession } from '../../features/save-export/session'
import { useProject } from '../../state/project'
import { useUi, type SideView } from '../../state/ui'

const TITLES: Record<SideView, string> = {
  content: 'Content',
  files: 'Generated files',
  presets: 'Preset library',
  inbox: 'Preset inbox',
  versions: 'Versions',
  settings: 'Settings',
}

function SidePanelBody({ view }: { view: SideView }) {
  switch (view) {
    case 'content':
      return <ContentExplorer />
    case 'files':
      return <FileExplorer />
    case 'presets':
      return <PresetLibrary />
    case 'inbox':
      return <PresetInbox />
    case 'versions':
      return <VersionsView />
    case 'settings':
      return <SettingsView />
  }
}

export function AppShell() {
  const { sideView, sidebarOpen, sidebarWidth, setSidebarWidth } = useUi()
  const { undo, redo, dirty } = useProject()

  // Reopen whatever slot was last in use. Runs once, before any editing can
  // have happened, and gives up quietly if that slot is gone.
  useEffect(() => {
    void restoreLastSession()
  }, [])

  // Editor-style shortcuts, plus a guard against closing the tab with unsaved
  // work in it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        // Let the browser handle undo inside a focused text field.
        const target = event.target as HTMLElement | null
        if (target && /^(input|textarea)$/i.test(target.tagName)) return
        event.preventDefault()
        undo()
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const startResize = (event: React.MouseEvent) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth
    const onMove = (move: MouseEvent) => setSidebarWidth(startWidth + (move.clientX - startX))
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        <ActivityBar />

        <AnimatePresence initial={false}>
          {sidebarOpen ? (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: sidebarWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              className="relative shrink-0 overflow-hidden border-r border-ink-800 bg-ink-900"
            >
              <div className="flex h-full flex-col" style={{ width: sidebarWidth }}>
                <header className="flex h-8 shrink-0 items-center px-3">
                  <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-300">
                    {TITLES[sideView]}
                  </h2>
                </header>

                <div className="min-h-0 flex-1">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={sideView}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full"
                    >
                      <SidePanelBody view={sideView} />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <div
                onMouseDown={startResize}
                className="absolute inset-y-0 -right-0.5 w-1 cursor-col-resize transition-colors hover:bg-accent-500/40"
              />
            </motion.aside>
          ) : null}
        </AnimatePresence>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <EditorArea />
          <AnimatePresence>
            <ProblemsPanel />
          </AnimatePresence>
        </div>
      </div>

      <StatusBar />
      <CommandPalette />
      <Toasts />
    </div>
  )
}
