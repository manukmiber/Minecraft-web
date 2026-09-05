/**
 * The workspace layout.
 *
 * Activity rail, a resizable sidebar, the editor area, and a problems panel
 * along the bottom — the arrangement anyone who uses an editor already knows,
 * so nothing here needs explaining.
 */

import { useCallback, useEffect } from 'react'
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
import { CompanionDock } from '../../features/companion/CompanionDock'
import { CompanionPanel } from '../../features/companion/CompanionPanel'
import { CompatibilityView } from '../../features/compatibility/CompatibilityView'
import { ReleasesView } from '../../features/releases/ReleasesView'
import { PresetInbox } from '../../features/presets/PresetInbox'
import { PresetLibrary } from '../../features/presets/PresetLibrary'
import { SettingsView } from '../../features/settings/SettingsView'
import { TextureMakerHost } from '../../features/texture-maker/TextureMakerHost'
import { TextureStudio } from '../../features/texture-maker/TextureStudio'
import { VersionsView } from '../../features/versions/VersionsView'
import { cn } from '../ui/primitives'
import { useProject } from '../../state/project'
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useUi,
  type SideView,
} from '../../state/ui'

const TITLES: Record<SideView, string> = {
  content: 'Content',
  files: 'Generated files',
  textures: 'Textures',
  presets: 'Preset library',
  inbox: 'Preset inbox',
  versions: 'Versions',
  compatibility: 'Compatibility',
  releases: 'Releases',
  companion: 'Companion',
  settings: 'Settings',
}

function SidePanelBody({ view }: { view: SideView }) {
  switch (view) {
    case 'content':
      return <ContentExplorer />
    case 'files':
      return <FileExplorer />
    case 'textures':
      return <TextureStudio />
    case 'presets':
      return <PresetLibrary />
    case 'inbox':
      return <PresetInbox />
    case 'versions':
      return <VersionsView />
    case 'compatibility':
      return <CompatibilityView />
    case 'releases':
      return <ReleasesView />
    case 'companion':
      return <CompanionPanel />
    case 'settings':
      return <SettingsView />
  }
}

export function AppShell() {
  const { sideView, sidebarOpen, sidebarWidth, setSidebarWidth, toggleSidebar } = useUi()
  const { undo, redo, dirty } = useProject()

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

  // Pointer events rather than mouse events, so the splitter also works under a
  // finger or a pen; the drag is captured so it survives leaving the handle.
  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const handle = event.currentTarget
    const startX = event.clientX
    const startWidth = sidebarWidth
    handle.setPointerCapture(event.pointerId)

    const onMove = (move: PointerEvent) => setSidebarWidth(startWidth + (move.clientX - startX))
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  // The same resize from the keyboard, because a drag must never be the only
  // way to reach a setting.
  const resizeByKey = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 48 : 16
      if (event.key === 'ArrowLeft') setSidebarWidth(sidebarWidth - step)
      else if (event.key === 'ArrowRight') setSidebarWidth(sidebarWidth + step)
      else if (event.key === 'Home') setSidebarWidth(SIDEBAR_MIN_WIDTH)
      else if (event.key === 'End') setSidebarWidth(SIDEBAR_MAX_WIDTH)
      else return
      event.preventDefault()
    },
    [sidebarWidth, setSidebarWidth],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* First stop in the tab order: jump the rail and the sidebar entirely. */}
      <a className="skip-link" href="#workspace">
        Skip to the editor
      </a>

      <TitleBar />

      {/*
        `relative` so the sidebar can lift out of the row and overlay the editor
        on a narrow screen instead of squeezing it into nothing.
      */}
      <div className="relative flex min-h-0 flex-1">
        <ActivityBar />

        <AnimatePresence initial={false}>
          {sidebarOpen ? (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: sidebarWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              aria-labelledby="sidebar-title"
              className={cn(
                'relative shrink-0 overflow-hidden border-r border-ink-800 bg-ink-900',
                // Under 768px the sidebar floats over the editor at a fixed
                // width: the stored desktop width would leave no editor at all.
                // It starts at the rail's right edge (w-12), never on top of it
                // — burying the rail would leave no way back out of the panel.
                'max-md:absolute max-md:inset-y-0 max-md:left-12 max-md:z-30',
                'max-md:!w-[min(320px,calc(100vw-3rem))] max-md:shadow-float',
              )}
            >
              <div className="flex h-full flex-col max-md:!w-full" style={{ width: sidebarWidth }}>
                <header className="flex h-9 shrink-0 items-center px-3">
                  <h2
                    id="sidebar-title"
                    className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-300"
                  >
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
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize sidebar"
                aria-valuenow={Math.round(sidebarWidth)}
                aria-valuemin={SIDEBAR_MIN_WIDTH}
                aria-valuemax={SIDEBAR_MAX_WIDTH}
                tabIndex={0}
                onPointerDown={startResize}
                onKeyDown={resizeByKey}
                className={cn(
                  // Nothing to resize when the sidebar is a fixed-width overlay.
                  'max-md:hidden',
                  'absolute inset-y-0 -right-0.5 w-1 cursor-col-resize touch-none',
                  'transition-colors [transition-duration:var(--duration-state)]',
                  'hover:bg-accent-500/40 focus-visible:bg-accent-500 focus-visible:outline-none',
                  // A wider invisible grab strip on touch, where a 4px target
                  // is unhittable, without moving the visible hairline.
                  'after:absolute after:inset-y-0 after:-left-1.5 after:-right-1.5 after:content-[""]',
                )}
              />
            </motion.aside>
          ) : null}
        </AnimatePresence>

        {/* Tap-anywhere-else dismissal for the floating sidebar. */}
        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Close the sidebar"
            onClick={toggleSidebar}
            className="absolute inset-y-0 left-12 right-0 z-20 hidden bg-ink-950/60 max-md:block"
          />
        ) : null}

        <main id="workspace" tabIndex={-1} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <EditorArea />
          <AnimatePresence>
            <ProblemsPanel />
          </AnimatePresence>
        </main>
      </div>

      <StatusBar />
      <CommandPalette />
      <TextureMakerHost />
      <CompanionDock />
      <Toasts />
    </div>
  )
}
