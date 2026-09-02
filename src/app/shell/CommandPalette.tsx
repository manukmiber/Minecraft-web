/**
 * Ctrl/Cmd+K. Creating content, jumping to a file and switching panels all live
 * here, so the mouse is optional once the layout is familiar.
 */

import { useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Command } from 'cmdk'
import { FileJson, Plus, Search } from 'lucide-react'

import { cn, kindIcon, ACCENT_CLASS } from '../ui/primitives'
import { useModalA11y } from '../ui/useModalA11y'
import { allKinds, getKind } from '../../core/registry/types'
import { useProject } from '../../state/project'
import { useUi, type SideView } from '../../state/ui'
import { BUILTIN_PRESET_PACKS } from '../../presets/farming'

/** Shared cmdk group-heading styling, kept in one place rather than per group. */
const GROUP_CLASS = [
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5',
  '[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold',
  '[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider',
  '[&_[cmdk-group-heading]]:text-ink-300',
].join(' ')

const PANELS: Array<{ view: SideView; label: string }> = [
  { view: 'content', label: 'Content' },
  { view: 'files', label: 'Generated files' },
  { view: 'textures', label: 'Textures' },
  { view: 'presets', label: 'Preset library' },
  { view: 'inbox', label: 'Preset inbox' },
  { view: 'versions', label: 'Versions' },
  { view: 'settings', label: 'Settings' },
]

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setSideView } = useUi()
  const { project, files, addNode, openNode, openFile, applyPresetFile, toast } = useProject()

  // Escape, a contained Tab cycle, and focus handed back to whatever opened it.
  const dialogRef = useModalA11y<HTMLDivElement>(paletteOpen, () => setPaletteOpen(false))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(!useUi.getState().paletteOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPaletteOpen])

  const filePaths = useMemo(() => [...files.keys()].sort(), [files])
  const close = () => setPaletteOpen(false)

  return (
    <AnimatePresence>
      {paletteOpen ? (
        <motion.div
          // A 60% scrim over #06080c was not enough to isolate the panel from a
          // bright 3D preview behind it; measured against the real backdrop, 78%
          // keeps the dialog clearly in front.
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/[0.78] p-4 pt-[10vh] backdrop-blur-sm sm:p-6 sm:pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
            className="w-full max-w-xl overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-float"
          >
            <Command loop className="flex flex-col">
              <div className="flex items-center gap-2 border-b border-ink-700 px-3">
                <Search size={16} aria-hidden="true" className="text-ink-300" />
                <Command.Input
                  autoFocus
                  aria-label="Search commands, content and files"
                  placeholder="Create content, open a file, jump to a panel…"
                  className="h-12 flex-1 bg-transparent text-sm text-ink-50 placeholder:text-ink-300 focus:outline-none"
                />
              </div>

              <Command.List className="max-h-[52vh] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-6 text-center text-sm text-ink-300">
                  Nothing matches that.
                </Command.Empty>

                <Command.Group
                  heading="Create"
                  className={GROUP_CLASS}
                >
                  {allKinds().map((kind) => {
                    const Icon = kindIcon(kind.icon)
                    return (
                      <Item
                        key={kind.id}
                        value={`new ${kind.label} ${kind.description}`}
                        onSelect={() => {
                          addNode(kind.id, `New ${kind.label}`)
                          close()
                        }}
                      >
                        <Plus size={14} aria-hidden="true" className="text-ink-300" />
                        <Icon size={14} aria-hidden="true" className={ACCENT_CLASS[kind.accent]} />
                        {/* The name never wraps; the description gives way instead. */}
                        <span className="shrink-0">New {kind.label}</span>
                        <span className="ml-auto min-w-0 truncate pl-3 text-xs text-ink-300">
                          {kind.description}
                        </span>
                      </Item>
                    )
                  })}
                </Command.Group>

                {project.nodes.length > 0 ? (
                  <Command.Group
                    heading="Content"
                    className={GROUP_CLASS}
                  >
                    {project.nodes.map((node) => {
                      const kind = getKind(node.kind)
                      const Icon = kindIcon(kind?.icon ?? 'Box')
                      return (
                        <Item
                          key={node.id}
                          value={`${node.displayName} ${node.name} ${node.kind}`}
                          onSelect={() => {
                            openNode(node.id)
                            close()
                          }}
                        >
                          <Icon
                            size={14}
                            aria-hidden="true"
                            className={kind ? ACCENT_CLASS[kind.accent] : 'text-ink-300'}
                          />
                          <span className="truncate">{node.displayName}</span>
                          <span className="ml-auto min-w-0 shrink-0 pl-3 font-mono text-xs text-ink-300">
                            {project.namespace}:{node.name}
                          </span>
                        </Item>
                      )
                    })}
                  </Command.Group>
                ) : null}

                <Command.Group
                  heading="Presets"
                  className={GROUP_CLASS}
                >
                  {BUILTIN_PRESET_PACKS.flatMap((pack) =>
                    pack.presets.map((preset) => (
                      <Item
                        key={preset.id}
                        value={`apply preset ${preset.label} ${preset.description ?? ''}`}
                        onSelect={() => {
                          const report = applyPresetFile(preset)
                          toast({
                            tone: 'success',
                            title: `Applied ${preset.label}`,
                            detail: `${report.changes.length} pieces of content`,
                          })
                          close()
                        }}
                      >
                        <Plus size={14} aria-hidden="true" className="text-ink-300" />
                        <span className="truncate">Apply preset · {preset.label}</span>
                      </Item>
                    )),
                  )}
                </Command.Group>

                <Command.Group
                  heading="Files"
                  className={GROUP_CLASS}
                >
                  {filePaths.map((path) => (
                    <Item
                      key={path}
                      value={path}
                      onSelect={() => {
                        openFile(path)
                        close()
                      }}
                    >
                      <FileJson size={14} aria-hidden="true" className="text-ink-300" />
                      <span className="truncate font-mono text-xs">{path}</span>
                    </Item>
                  ))}
                </Command.Group>

                <Command.Group
                  heading="Go to"
                  className={GROUP_CLASS}
                >
                  {PANELS.map((panel) => (
                    <Item
                      key={panel.view}
                      value={`panel ${panel.label}`}
                      onSelect={() => {
                        setSideView(panel.view)
                        close()
                      }}
                    >
                      <span>{panel.label}</span>
                    </Item>
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function Item({
  value,
  onSelect,
  children,
}: {
  value: string
  onSelect(): void
  children: React.ReactNode
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        'relative flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 pl-3 text-sm text-ink-200',
        // The tint alone is a colour-only cue, so the selected row also gets a
        // solid accent bar down its leading edge.
        'data-[selected=true]:bg-accent-500/15 data-[selected=true]:text-ink-50',
        'before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full',
        'before:bg-transparent data-[selected=true]:before:bg-accent-500',
      )}
    >
      {children}
    </Command.Item>
  )
}
