/**
 * The icon rail down the left edge — the app's top-level navigation.
 */

import { motion } from 'framer-motion'
import {
  Blocks,
  FolderTree,
  Inbox,
  LayoutGrid,
  Settings,
  History,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '../ui/primitives'
import { useUi, type SideView } from '../../state/ui'
import { useProject } from '../../state/project'

interface RailItem {
  view: SideView
  icon: LucideIcon
  label: string
  hint: string
}

const ITEMS: RailItem[] = [
  { view: 'content', icon: Blocks, label: 'Content', hint: 'Everything in this add-on' },
  { view: 'files', icon: FolderTree, label: 'Files', hint: 'The generated pack tree' },
  { view: 'presets', icon: LayoutGrid, label: 'Presets', hint: 'Ready-made content to drop in' },
  { view: 'inbox', icon: Inbox, label: 'Preset inbox', hint: 'Presets waiting to be applied' },
  { view: 'versions', icon: History, label: 'Versions', hint: 'Save slots, backups and history' },
]

export function ActivityBar() {
  const { sideView, sidebarOpen, setSideView } = useUi()
  const nodeCount = useProject((s) => s.project.nodes.length)

  return (
    <nav className="flex w-12 shrink-0 flex-col items-center border-r border-ink-800 bg-ink-950 py-2">
      {ITEMS.map((item) => {
        const active = sideView === item.view && sidebarOpen
        const Icon = item.icon
        return (
          <button
            key={item.view}
            type="button"
            onClick={() => setSideView(item.view)}
            title={`${item.label} — ${item.hint}`}
            aria-label={item.label}
            aria-current={active}
            className={cn(
              'group relative flex size-11 items-center justify-center rounded-lg transition-colors duration-150',
              active ? 'text-ink-50' : 'text-ink-400 hover:text-ink-100',
            )}
          >
            {active ? (
              <motion.span
                layoutId="rail-active"
                transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-accent-500"
              />
            ) : null}
            <Icon size={19} strokeWidth={1.6} />
            {item.view === 'content' && nodeCount > 0 ? (
              <span className="absolute right-1.5 top-1.5 min-w-3 rounded-full bg-accent-500/85 px-1 text-[9px] font-semibold leading-3 text-ink-950">
                {nodeCount > 99 ? '99+' : nodeCount}
              </span>
            ) : null}
          </button>
        )
      })}

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => setSideView('settings')}
        title="Settings"
        aria-label="Settings"
        className={cn(
          'flex size-11 items-center justify-center rounded-lg transition-colors duration-150',
          sideView === 'settings' && sidebarOpen
            ? 'text-ink-50'
            : 'text-ink-400 hover:text-ink-100',
        )}
      >
        <Settings size={19} strokeWidth={1.6} />
      </button>
    </nav>
  )
}
