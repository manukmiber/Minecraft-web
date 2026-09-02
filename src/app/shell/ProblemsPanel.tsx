/**
 * The problems panel — the output of the last generation pass.
 *
 * Errors block an export; warnings do not. Clicking one jumps to whatever
 * produced it.
 */

import { useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, TriangleAlert, X } from 'lucide-react'

import { cn } from '../ui/primitives'
import { useProject } from '../../state/project'
import { PANEL_MAX_HEIGHT, PANEL_MIN_HEIGHT, useUi } from '../../state/ui'

export function ProblemsPanel() {
  const { problems, project, openNode, openFile } = useProject()
  const { panelOpen, panelHeight, togglePanel, setPanelHeight } = useUi()

  if (!panelOpen) return null

  // Pointer events so the splitter works under a finger as well as a mouse.
  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const handle = event.currentTarget
    const startY = event.clientY
    const startHeight = panelHeight
    handle.setPointerCapture(event.pointerId)

    const onMove = (move: PointerEvent) => setPanelHeight(startHeight - (move.clientY - startY))
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  // Keyboard equivalent: dragging is never the only way to resize.
  const resizeByKey = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 48 : 16
      if (event.key === 'ArrowUp') setPanelHeight(panelHeight + step)
      else if (event.key === 'ArrowDown') setPanelHeight(panelHeight - step)
      else if (event.key === 'Home') setPanelHeight(PANEL_MIN_HEIGHT)
      else if (event.key === 'End') setPanelHeight(PANEL_MAX_HEIGHT)
      else return
      event.preventDefault()
    },
    [panelHeight, setPanelHeight],
  )

  return (
    <motion.section
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: panelHeight, opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 38 }}
      id="problems-panel"
      aria-labelledby="problems-title"
      className="relative flex shrink-0 flex-col border-t border-ink-800 bg-ink-900"
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the problems panel"
        aria-valuenow={Math.round(panelHeight)}
        aria-valuemin={PANEL_MIN_HEIGHT}
        aria-valuemax={PANEL_MAX_HEIGHT}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={resizeByKey}
        className={cn(
          'absolute inset-x-0 -top-0.5 h-1 cursor-row-resize touch-none',
          'transition-colors [transition-duration:var(--duration-state)]',
          'hover:bg-accent-500/40 focus-visible:bg-accent-500 focus-visible:outline-none',
          'after:absolute after:inset-x-0 after:-top-1.5 after:-bottom-1.5 after:content-[""]',
        )}
      />

      <header className="flex h-9 shrink-0 items-center gap-2 px-3">
        <h3
          id="problems-title"
          className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-300"
        >
          Problems
        </h3>
        <span className="text-xs text-ink-300">{problems.length}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => togglePanel(false)}
          aria-label="Close the problems panel"
          className={cn(
            'tap-target grid size-7 place-items-center rounded text-ink-300',
            'transition-colors [transition-duration:var(--duration-state)]',
            'hover:bg-ink-800 hover:text-ink-100',
          )}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {problems.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-3 text-sm text-mint-500">
            <CheckCircle2 size={15} aria-hidden="true" />
            No problems. The pack generates cleanly.
          </div>
        ) : null}

        <ul className="flex flex-col">
          <AnimatePresence initial={false}>
            {problems.map((problem, index) => {
              const node = problem.nodeId
                ? project.nodes.find((n) => n.id === problem.nodeId)
                : undefined
              const clickable = Boolean(node || problem.path)
              const isError = problem.severity === 'error'
              const Icon = isError ? AlertTriangle : TriangleAlert
              const source = node?.displayName ?? problem.path

              const body = (
                <>
                  <Icon
                    size={14}
                    aria-hidden="true"
                    className={cn('mt-0.5 shrink-0', isError ? 'text-rose-500' : 'text-amber-500')}
                  />
                  {/* Severity is spoken, not left to the icon's colour. */}
                  <span className="sr-only">{isError ? 'Error: ' : 'Warning: '}</span>
                  <span className="flex-1 text-ink-200">{problem.message}</span>
                  {source ? (
                    <span className="shrink-0 font-mono text-xs text-ink-300">{source}</span>
                  ) : null}
                </>
              )

              const rowClass =
                'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs leading-relaxed'

              return (
                <motion.li
                  key={`${problem.message}-${index}`}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  {/*
                    A problem with nowhere to jump to is not a control. Rendering
                    it as plain text is honest, where a disabled button would
                    look pressable and do nothing.
                  */}
                  {clickable ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (node) openNode(node.id)
                        else if (problem.path) openFile(problem.path)
                      }}
                      className={cn(
                        rowClass,
                        'tap-target transition-colors [transition-duration:var(--duration-state)]',
                        'hover:bg-ink-800 active:bg-ink-750',
                      )}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className={rowClass}>{body}</div>
                  )}
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      </div>
    </motion.section>
  )
}
