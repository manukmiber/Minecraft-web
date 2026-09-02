/**
 * The status strip. Everything here is derived from the last generation pass,
 * so it doubles as a live check that the pack is still valid.
 */

import { motion } from 'framer-motion'
import { AlertTriangle, CircleCheck, Cpu, FileCode2, Layers, TriangleAlert } from 'lucide-react'

import { cn } from '../ui/primitives'
import { useProject } from '../../state/project'
import { useUi } from '../../state/ui'
import { getTargetProfile } from '../../core/targets/profiles'

export function StatusBar() {
  const { project, files, problems } = useProject()
  const togglePanel = useUi((s) => s.togglePanel)
  const panelOpen = useUi((s) => s.panelOpen)

  const errors = problems.filter((p) => p.severity === 'error').length
  const warnings = problems.filter((p) => p.severity === 'warning').length
  const target = getTargetProfile(project.targetProfileId)

  return (
    <footer
      aria-label="Workspace status"
      className="flex h-8 shrink-0 items-center gap-4 overflow-hidden whitespace-nowrap border-t border-ink-800 bg-ink-900 px-3 text-xs text-ink-300"
    >
      <button
        type="button"
        onClick={() => togglePanel()}
        aria-expanded={panelOpen}
        aria-controls="problems-panel"
        aria-label={
          errors === 0 && warnings === 0
            ? 'Problems: none. The pack generates cleanly.'
            : `Problems: ${errors} ${errors === 1 ? 'error' : 'errors'}, ${warnings} ${
                warnings === 1 ? 'warning' : 'warnings'
              }`
        }
        className={cn(
          'tap-target flex shrink-0 items-center gap-1.5 rounded px-1.5 py-1',
          'transition-colors [transition-duration:var(--duration-state)]',
          'hover:bg-ink-800 active:bg-ink-750',
          panelOpen && 'bg-ink-800 text-ink-100',
        )}
      >
        {errors > 0 ? (
          <>
            <AlertTriangle size={13} aria-hidden="true" className="text-rose-500" />
            {/* The count is spelled out beside the glyph rather than left to colour. */}
            <span className="text-rose-500">
              {errors} {errors === 1 ? 'error' : 'errors'}
            </span>
          </>
        ) : (
          <CircleCheck size={13} aria-hidden="true" className="text-mint-500" />
        )}
        {warnings > 0 ? (
          <>
            <TriangleAlert size={13} aria-hidden="true" className="ml-1.5 text-amber-500" />
            <span className="text-amber-500">
              {warnings} {warnings === 1 ? 'warning' : 'warnings'}
            </span>
          </>
        ) : null}
        {errors === 0 && warnings === 0 ? <span className="text-mint-500">Pack is valid</span> : null}
      </button>

      <span className="flex items-center gap-1.5 max-sm:hidden">
        <Layers size={13} aria-hidden="true" />
        {project.nodes.length} content
      </span>

      <span className="flex items-center gap-1.5 max-sm:hidden">
        <FileCode2 size={13} aria-hidden="true" />
        {files.size} files
      </span>

      <div className="flex-1" />

      <motion.span
        key={target.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-1.5 max-md:hidden"
        title={target.notes.join('\n')}
        aria-label={`Target: ${target.label}`}
      >
        <Cpu size={13} aria-hidden="true" />
        {target.label}
      </motion.span>

      <span className="font-mono text-ink-300" aria-label={`Pack version ${project.version.join('.')}`}>
        v{project.version.join('.')}
      </span>
    </footer>
  )
}
