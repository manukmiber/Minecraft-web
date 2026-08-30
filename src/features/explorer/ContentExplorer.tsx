/**
 * The content list — everything in the add-on, grouped by kind.
 *
 * The groups come straight from the registry, so a new kind appears here with
 * no change to this file.
 */

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, Plus, Trash2 } from 'lucide-react'

import { ACCENT_CLASS, Badge, Button, EmptyState, cn, kindIcon } from '../../app/ui/primitives'
import { allKinds, getKind } from '../../core/registry/types'
import type { ContentKind } from '../../core/registry/types'
import { useProject } from '../../state/project'

const GROUP_LABEL: Record<ContentKind['group'], string> = {
  world: 'World',
  creatures: 'Creatures',
  crafting: 'Crafting',
  systems: 'Systems',
}

export function ContentExplorer() {
  const { project, tabs, activeTabId, openNode, addNode, deleteNode } = useProject()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [confirming, setConfirming] = useState<string | null>(null)

  const activeNodeId = tabs.find((t) => t.id === activeTabId && t.type === 'node')
  const activeId = activeNodeId && activeNodeId.type === 'node' ? activeNodeId.nodeId : null

  const kinds = allKinds()
  const groups = [...new Set(kinds.map((k) => k.group))]

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1.5 border-b border-ink-800 p-2">
        {kinds.map((kind) => {
          const Icon = kindIcon(kind.icon)
          return (
            <Button
              key={kind.id}
              size="sm"
              variant="subtle"
              onClick={() => addNode(kind.id, `New ${kind.label}`)}
              title={kind.description}
              icon={<Icon size={12} className={ACCENT_CLASS[kind.accent]} />}
            >
              <Plus size={10} className="text-ink-400" />
              {kind.label}
            </Button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {project.nodes.length === 0 ? (
          <div className="p-3">
            <EmptyState
              title="Nothing in this add-on yet"
              detail="Add a block or an item above, or open the Presets panel and drop in the whole farming batch at once."
            />
          </div>
        ) : null}

        {groups.map((group) => {
          const groupKinds = kinds.filter((k) => k.group === group)
          const groupNodes = project.nodes.filter((n) =>
            groupKinds.some((k) => k.id === n.kind),
          )
          if (groupNodes.length === 0) return null
          const isCollapsed = collapsed[group]

          return (
            <section key={group} className="mb-1">
              <button
                type="button"
                onClick={() => setCollapsed((prev) => ({ ...prev, [group]: !prev[group] }))}
                className="flex h-7 w-full items-center gap-1 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-300 transition-colors hover:text-ink-100"
              >
                <motion.span animate={{ rotate: isCollapsed ? 0 : 90 }} transition={{ duration: 0.15 }}>
                  <ChevronRight size={12} />
                </motion.span>
                {GROUP_LABEL[group]}
                <span className="ml-auto font-mono text-[10px] text-ink-400">
                  {groupNodes.length}
                </span>
              </button>

              <AnimatePresence initial={false}>
                {!isCollapsed ? (
                  <motion.ul
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    {groupNodes.map((node) => {
                      const kind = getKind(node.kind)
                      const Icon = kindIcon(kind?.icon ?? 'Box')
                      const active = node.id === activeId
                      return (
                        <motion.li key={node.id} layout className="px-1">
                          <div
                            className={cn(
                              'group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
                              active ? 'bg-accent-500/12 text-ink-50' : 'hover:bg-ink-800',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => openNode(node.id)}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              <Icon
                                size={13}
                                className={cn(
                                  'shrink-0',
                                  kind ? ACCENT_CLASS[kind.accent] : 'text-ink-400',
                                )}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs">{node.displayName}</span>
                                <span className="block truncate font-mono text-[10px] text-ink-400">
                                  {project.namespace}:{node.name}
                                </span>
                              </span>
                            </button>

                            {node.presetId ? (
                              <Badge tone="neutral" className="shrink-0 opacity-70">
                                preset
                              </Badge>
                            ) : null}

                            <button
                              type="button"
                              onClick={() =>
                                confirming === node.id
                                  ? (deleteNode(node.id), setConfirming(null))
                                  : setConfirming(node.id)
                              }
                              onBlur={() => setConfirming((id) => (id === node.id ? null : id))}
                              title={
                                confirming === node.id
                                  ? 'Click again to delete'
                                  : `Delete ${node.displayName}`
                              }
                              className={cn(
                                'shrink-0 rounded p-1 transition-all',
                                confirming === node.id
                                  ? 'bg-rose-500/20 text-rose-500 opacity-100'
                                  : 'text-ink-400 opacity-0 hover:bg-ink-700 hover:text-rose-500 group-hover:opacity-100',
                              )}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </motion.li>
                      )
                    })}
                  </motion.ul>
                ) : null}
              </AnimatePresence>
            </section>
          )
        })}
      </div>
    </div>
  )
}
