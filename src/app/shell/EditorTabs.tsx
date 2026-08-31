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
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-ink-800 bg-ink-900">
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
              className="relative shrink-0"
            >
              <button
                type="button"
                onClick={() => setActiveTab(tab.id)}
                onAuxClick={(event) => {
                  // Middle click closes, as in any editor.
                  if (event.button === 1) closeTab(tab.id)
                }}
                title={tab.type === 'file' ? tab.path : label}
                className={cn(
                  'group flex h-9 items-center gap-2 border-r border-ink-800 pl-3 pr-8 text-xs transition-colors',
                  active
                    ? 'bg-ink-850 text-ink-50'
                    : 'text-ink-300 hover:bg-ink-850/60 hover:text-ink-100',
                )}
              >
                <Icon size={13} className={active ? accent : 'text-ink-400'} />
                <span className="max-w-44 truncate">{label}</span>
              </button>

              <button
                type="button"
                onClick={() => closeTab(tab.id)}
                aria-label={`Close ${label}`}
                className={cn(
                  'absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-400 transition-all',
                  'hover:bg-ink-700 hover:text-ink-50',
                  active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100',
                )}
              >
                <X size={12} />
              </button>

              {active ? (
                <motion.span
                  layoutId="tab-underline"
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
