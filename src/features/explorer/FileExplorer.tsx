/**
 * The generated pack tree.
 *
 * Read-only in the sense that nothing here is a source file — it is all output.
 * Opening one puts it in the code editor, where a hand-edit becomes a tracked
 * override rather than a silent divergence.
 */

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, FileCode2, FileJson, Folder, FolderOpen, Image, PenLine } from 'lucide-react'

import { cn } from '../../app/ui/primitives'
import { buildTree, type FsTreeNode } from '../../core/vfs/types'
import { useProject } from '../../state/project'

export function FileExplorer() {
  const { files, openFile, tabs, activeTabId } = useProject()
  const tree = useMemo(() => buildTree(files.values()), [files])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const activePath = activeTab?.type === 'file' ? activeTab.path : null

  return (
    <div className="h-full overflow-y-auto py-1">
      {tree.children?.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={0}
          collapsed={collapsed}
          onToggle={(path) => setCollapsed((prev) => ({ ...prev, [path]: !prev[path] }))}
          onOpen={openFile}
          activePath={activePath}
        />
      ))}
    </div>
  )
}

function iconFor(name: string) {
  if (name.endsWith('.png')) return Image
  if (name.endsWith('.js')) return FileCode2
  if (name.endsWith('.json')) return FileJson
  return FileCode2
}

function TreeNode({
  node,
  depth,
  collapsed,
  onToggle,
  onOpen,
  activePath,
}: {
  node: FsTreeNode
  depth: number
  collapsed: Record<string, boolean>
  onToggle(path: string): void
  onOpen(path: string): void
  activePath: string | null
}) {
  const indent = { paddingLeft: `${depth * 12 + 8}px` }

  if (node.kind === 'dir') {
    const isCollapsed = collapsed[node.path]
    const FolderIcon = isCollapsed ? Folder : FolderOpen
    return (
      <div>
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          style={indent}
          className="flex h-6 w-full items-center gap-1 pr-2 text-xs text-ink-200 transition-colors hover:bg-ink-800"
        >
          <motion.span
            animate={{ rotate: isCollapsed ? 0 : 90 }}
            transition={{ duration: 0.15 }}
            className="text-ink-300"
          >
            <ChevronRight size={11} />
          </motion.span>
          <FolderIcon size={12} className="text-accent-500/80" />
          <span className="truncate">{node.name}</span>
        </button>

        <AnimatePresence initial={false}>
          {!isCollapsed ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              {node.children?.map((child) => (
                <TreeNode
                  key={child.path}
                  node={child}
                  depth={depth + 1}
                  collapsed={collapsed}
                  onToggle={onToggle}
                  onOpen={onOpen}
                  activePath={activePath}
                />
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    )
  }

  const Icon = iconFor(node.name)
  const active = node.path === activePath
  const overridden = node.file?.overridden

  return (
    <button
      type="button"
      onClick={() => onOpen(node.path)}
      style={indent}
      title={`${node.path}${overridden ? ' — hand-edited' : ''}`}
      className={cn(
        'flex h-6 w-full items-center gap-1.5 pr-2 text-xs transition-colors',
        active ? 'bg-accent-500/12 text-ink-50' : 'text-ink-200 hover:bg-ink-800',
      )}
    >
      <span className="w-[11px]" />
      <Icon size={12} className={overridden ? 'text-amber-500' : 'text-ink-300'} />
      <span className="truncate">{node.name}</span>
      {overridden ? <PenLine size={10} className="ml-auto shrink-0 text-amber-500" /> : null}
    </button>
  )
}
