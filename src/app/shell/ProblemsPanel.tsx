/**
 * The problems panel — the output of the last generation pass.
 *
 * Errors block an export; warnings do not. Clicking one jumps to whatever
 * produced it.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, TriangleAlert, X } from 'lucide-react'

import { cn } from '../ui/primitives'
import { useProject } from '../../state/project'
import { useUi } from '../../state/ui'

export function ProblemsPanel() {
  const { problems, project, openNode, openFile } = useProject()
  const { panelOpen, panelHeight, togglePanel, setPanelHeight } = useUi()

  if (!panelOpen) return null

  const startResize = (event: React.MouseEvent) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = panelHeight
    const onMove = (move: MouseEvent) => setPanelHeight(startHeight - (move.clientY - startY))
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <motion.section
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: panelHeight, opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 38 }}
      className="relative flex shrink-0 flex-col border-t border-ink-800 bg-ink-900"
    >
      <div
        onMouseDown={startResize}
        className="absolute inset-x-0 -top-0.5 h-1 cursor-row-resize hover:bg-accent-500/40"
      />

      <header className="flex h-8 shrink-0 items-center gap-2 px-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-300">
          Problems
        </h3>
        <span className="text-[10px] text-ink-400">{problems.length}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => togglePanel(false)}
          aria-label="Close panel"
          className="rounded p-1 text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100"
        >
          <X size={13} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {problems.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-mint-500">
            <CheckCircle2 size={14} />
            No problems. The pack generates cleanly.
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {problems.map((problem, index) => {
            const node = problem.nodeId
              ? project.nodes.find((n) => n.id === problem.nodeId)
              : undefined
            const clickable = Boolean(node || problem.path)
            const Icon = problem.severity === 'error' ? AlertTriangle : TriangleAlert
            return (
              <motion.button
                key={`${problem.message}-${index}`}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                type="button"
                disabled={!clickable}
                onClick={() => {
                  if (node) openNode(node.id)
                  else if (problem.path) openFile(problem.path)
                }}
                className={cn(
                  'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-[11px] leading-relaxed transition-colors',
                  clickable && 'hover:bg-ink-800',
                )}
              >
                <Icon
                  size={13}
                  className={cn(
                    'mt-px shrink-0',
                    problem.severity === 'error' ? 'text-rose-500' : 'text-amber-500',
                  )}
                />
                <span className="flex-1 text-ink-200">{problem.message}</span>
                {node ? (
                  <span className="shrink-0 font-mono text-[10px] text-ink-400">
                    {node.displayName}
                  </span>
                ) : problem.path ? (
                  <span className="shrink-0 font-mono text-[10px] text-ink-400">{problem.path}</span>
                ) : null}
              </motion.button>
            )
          })}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}
