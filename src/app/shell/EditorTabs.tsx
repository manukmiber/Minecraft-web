/**
 * Editor tabs. The active tab slides its underline rather than snapping, which
 * makes it easy to follow when tabs are opened from the sidebar.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { FileJson, X } from 'lucide-react'

import { cn, kindIcon, ACCENT_CLASS } from '../ui/primitives'
import { useProject } from '../../state/project'
import { getKind } from '../../core/registry/types'

export function EditorTabs() {
  const { tabs, activeTabId, project, setActiveTab, closeTab } = useProject()

  if (tabs.length === 0) return null

  return (
    <div
      role="tablist"
      aria-label="Open editors"
      className="flex h-10 shrink-0 items-stretch overflow-x-auto border-b border-ink-800 bg-ink-900"
    >
      <AnimatePresence initial={false}>
        {tabs.map((tab) => {
          const active = tab.id === activeTabId
          let label = 'Untitled'
          let Icon = FileJson
          let accent = 'text-ink-300'

          if (tab.type === 'node') {
            const node = project.nodes.find((n) => n.id === tab.nodeId)
            const kind = node ? getKind(node.kind) : undefined
            label = node?.displayName ?? 'Missing content'
            if (kind) {
              Icon = kindIcon(kind.icon)
              accent = ACCENT_CLASS[kind.accent]
            }
          } else {
            label = tab.path.split('/').pop() ?? tab.path
          }

          return (
            <motion.div
              key={tab.id}
              layout
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 40 }}
              // The group lives on the wrapper, because the close button is a
              // sibling of the tab button rather than a child of it — hanging it
              // off the tab button meant `group-hover` never fired and the close
              // control only ever appeared on the active tab.
              className="group relative shrink-0"
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                onAuxClick={(event) => {
                  // Middle click closes, as in any editor.
                  if (event.button === 1) closeTab(tab.id)
                }}
                title={tab.type === 'file' ? tab.path : label}
                className={cn(
                  'flex h-10 items-center gap-2 border-r border-ink-800 pl-3 pr-9 text-xs',
                  'transition-colors [transition-duration:var(--duration-state)]',
                  active
                    ? 'bg-ink-850 text-ink-50'
                    : 'text-ink-300 hover:bg-ink-850/60 hover:text-ink-100',
                )}
              >
                <Icon size={14} aria-hidden="true" className={active ? accent : 'text-ink-300'} />
                <span className="max-w-44 truncate">{label}</span>
              </button>

              <button
                type="button"
                onClick={() => closeTab(tab.id)}
                aria-label={`Close ${label}`}
                className={cn(
                  'tap-target absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center',
                  'rounded text-ink-300 transition-opacity [transition-duration:var(--duration-state)]',
                  'hover:bg-ink-700 hover:text-ink-50',
                  // Always reachable by keyboard: a control that is focusable
                  // must be visible once it has focus.
                  active
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                )}
              >
                <X size={13} aria-hidden="true" />
              </button>

              {active ? (
                <motion.span
                  layoutId="tab-underline"
                  aria-hidden="true"
                  transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                  className="absolute inset-x-0 top-0 h-[2px] bg-accent-500"
                />
              ) : null}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
