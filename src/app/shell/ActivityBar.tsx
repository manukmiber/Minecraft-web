/**
 * The icon rail down the left edge — the app's top-level navigation.
 */

import { motion } from 'framer-motion'
import {
  Blocks,
  FolderTree,
  Inbox,
  LayoutGrid,
  Palette,
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
  { view: 'textures', icon: Palette, label: 'Textures', hint: 'Draw and edit pixel art' },
  { view: 'presets', icon: LayoutGrid, label: 'Presets', hint: 'Ready-made content to drop in' },
  { view: 'inbox', icon: Inbox, label: 'Preset inbox', hint: 'Presets waiting in the project repo' },
  { view: 'versions', icon: History, label: 'Versions', hint: 'Save slots and history' },
]

export function ActivityBar() {
  const { sideView, sidebarOpen, setSideView } = useUi()
  const nodeCount = useProject((s) => s.project.nodes.length)

  return (
    <nav
      aria-label="Workspace panels"
      className="flex w-12 shrink-0 flex-col items-center border-r border-ink-800 bg-ink-950 py-2"
    >
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
            // Announces which panel is showing; `undefined` rather than
            // `false` so the attribute disappears when it does not apply.
            aria-current={active ? 'page' : undefined}
            aria-expanded={active}
            className={cn(
              'tap-target group relative flex size-11 items-center justify-center rounded-lg',
              'transition-colors [transition-duration:var(--duration-state)]',
              'hover:bg-ink-900 active:bg-ink-850',
              active ? 'bg-ink-900 text-ink-50' : 'text-ink-300 hover:text-ink-100',
            )}
          >
            {active ? (
              <motion.span
                layoutId="rail-active"
                transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-accent-500"
              />
            ) : null}
            <Icon size={19} strokeWidth={1.6} aria-hidden="true" />
            {item.view === 'content' && nodeCount > 0 ? (
              <span
                className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-accent-500 px-1 py-px text-center text-xs font-semibold leading-4 text-ink-950"
                // The number alone is meaningless out of context.
                aria-label={`${nodeCount} items`}
              >
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
        aria-current={sideView === 'settings' && sidebarOpen ? 'page' : undefined}
        aria-expanded={sideView === 'settings' && sidebarOpen}
        className={cn(
          'tap-target relative flex size-11 items-center justify-center rounded-lg',
          'transition-colors [transition-duration:var(--duration-state)]',
          'hover:bg-ink-900 active:bg-ink-850',
          sideView === 'settings' && sidebarOpen
            ? 'bg-ink-900 text-ink-50'
            : 'text-ink-300 hover:text-ink-100',
        )}
      >
        {sideView === 'settings' && sidebarOpen ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-accent-500"
          />
        ) : null}
        <Settings size={19} strokeWidth={1.6} aria-hidden="true" />
      </button>
    </nav>
  )
}
