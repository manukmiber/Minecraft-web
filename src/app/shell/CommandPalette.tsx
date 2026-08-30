/**
 * Ctrl/Cmd+K. Creating content, jumping to a file and switching panels all live
 * here, so the mouse is optional once the layout is familiar.
 */

import { useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Command } from 'cmdk'
import { FileJson, Plus, Search } from 'lucide-react'

import { cn, kindIcon, ACCENT_CLASS } from '../ui/primitives'
import { allKinds, getKind } from '../../core/registry/types'
import { useProject } from '../../state/project'
import { useUi, type SideView } from '../../state/ui'
import { BUILTIN_PRESET_PACKS } from '../../presets/farming'

const PANELS: Array<{ view: SideView; label: string }> = [
  { view: 'content', label: 'Content' },
  { view: 'files', label: 'Generated files' },
  { view: 'presets', label: 'Preset library' },
  { view: 'inbox', label: 'Preset inbox' },
  { view: 'versions', label: 'Versions' },
  { view: 'settings', label: 'Settings' },
]

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setSideView } = useUi()
  const { project, files, addNode, openNode, openFile, applyPresetFile, toast } = useProject()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(!useUi.getState().paletteOpen)
      }
      if (event.key === 'Escape') setPaletteOpen(false)
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
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/60 p-6 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
            className="w-full max-w-xl overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-float"
          >
            <Command loop className="flex flex-col">
              <div className="flex items-center gap-2 border-b border-ink-700 px-3">
                <Search size={15} className="text-ink-400" />
                <Command.Input
                  autoFocus
                  placeholder="Create content, open a file, jump to a panel…"
                  className="h-11 flex-1 bg-transparent text-sm text-ink-50 placeholder:text-ink-400 focus:outline-none"
                />
              </div>

              <Command.List className="max-h-[52vh] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-6 text-center text-xs text-ink-300">
                  Nothing matches that.
                </Command.Empty>

                <Command.Group
                  heading="Create"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-400"
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
                        <Plus size={13} className="text-ink-400" />
                        <Icon size={13} className={ACCENT_CLASS[kind.accent]} />
                        <span>New {kind.label}</span>
                        <span className="ml-auto truncate text-[11px] text-ink-400">
                          {kind.description}
                        </span>
                      </Item>
                    )
                  })}
                </Command.Group>

                {project.nodes.length > 0 ? (
                  <Command.Group
                    heading="Content"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-400"
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
                            size={13}
                            className={kind ? ACCENT_CLASS[kind.accent] : 'text-ink-400'}
                          />
                          <span>{node.displayName}</span>
                          <span className="ml-auto font-mono text-[11px] text-ink-400">
                            {project.namespace}:{node.name}
                          </span>
                        </Item>
                      )
                    })}
                  </Command.Group>
                ) : null}

                <Command.Group
                  heading="Presets"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-400"
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
                        <Plus size={13} className="text-ink-400" />
                        <span>Apply preset · {preset.label}</span>
                      </Item>
                    )),
                  )}
                </Command.Group>

                <Command.Group
                  heading="Files"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-400"
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
                      <FileJson size={13} className="text-ink-400" />
                      <span className="font-mono text-[11px]">{path}</span>
                    </Item>
                  ))}
                </Command.Group>

                <Command.Group
                  heading="Go to"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-400"
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
        'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-ink-200',
        'data-[selected=true]:bg-accent-500/15 data-[selected=true]:text-ink-50',
      )}
    >
      {children}
    </Command.Item>
  )
}
