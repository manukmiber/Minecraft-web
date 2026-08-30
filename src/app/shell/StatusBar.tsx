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
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-ink-800 bg-ink-900 px-3 text-[11px] text-ink-300">
      <button
        type="button"
        onClick={() => togglePanel()}
        className={cn(
          'flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-ink-800',
          panelOpen && 'bg-ink-800 text-ink-100',
        )}
        title="Problems"
      >
        {errors > 0 ? (
          <>
            <AlertTriangle size={12} className="text-rose-500" />
            <span className="text-rose-500">{errors}</span>
          </>
        ) : (
          <CircleCheck size={12} className="text-mint-500" />
        )}
        {warnings > 0 ? (
          <>
            <TriangleAlert size={12} className="ml-1.5 text-amber-500" />
            <span className="text-amber-500">{warnings}</span>
          </>
        ) : null}
        {errors === 0 && warnings === 0 ? <span className="text-mint-500">Pack is valid</span> : null}
      </button>

      <span className="flex items-center gap-1.5">
        <Layers size={12} />
        {project.nodes.length} content
      </span>

      <span className="flex items-center gap-1.5">
        <FileCode2 size={12} />
        {files.size} files
      </span>

      <div className="flex-1" />

      <motion.span
        key={target.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-1.5"
        title={target.notes.join('\n')}
      >
        <Cpu size={12} />
        {target.label}
      </motion.span>

      <span className="font-mono text-ink-400">v{project.version.join('.')}</span>
    </footer>
  )
}
