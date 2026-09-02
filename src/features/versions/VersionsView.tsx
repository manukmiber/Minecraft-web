/**
 * Save slots.
 *
 * Each slot is a folder in the project repo holding a complete project.json,
 * so switching between them is switching between whole versions of the add-on
 * rather than diffing a single file.
 */

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, FolderGit2, RefreshCw, Upload } from 'lucide-react'

import { Badge, Button, EmptyState, Spinner, cn } from '../../app/ui/primitives'
import type { SaveSlot } from '../../core/model/types'
import { projectRepo } from '../../state/services'
import { useProject } from '../../state/project'
import { useSettings, repoConfigured } from '../../state/settings'
import { loadSlot } from '../save-export/actions'

export function VersionsView() {
  const settings = useSettings()
  const configured = repoConfigured(settings)
  const { activeSlot, dirty, toast } = useProject()

  const [slots, setSlots] = useState<SaveSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!configured) return
    setLoading(true)
    setError(null)
    try {
      setSlots(await projectRepo.listSaveSlots())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setLoading(false)
    }
  }, [configured])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!configured) {
    return (
      <div className="p-3">
        <EmptyState
          icon={<FolderGit2 size={22} />}
          title="No project repository yet"
          detail="Save slots live in saves/ in your project repo. Add the GitHub settings and your versions will appear here."
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ink-800 px-2 py-1.5">
        <span className="flex-1 truncate text-xs uppercase tracking-[0.14em] text-ink-300">
          saves/ · {settings.githubOwner}/{settings.githubRepo}@{settings.githubBranch}
        </span>
        <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Spinner /> : <RefreshCw size={12} />}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {error ? (
          <div className="mb-2 flex gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs leading-relaxed text-rose-500">
            <AlertTriangle size={14} className="mt-px shrink-0" />
            {error}
          </div>
        ) : null}

        {!loading && slots.length === 0 && !error ? (
          <EmptyState
            icon={<Upload size={22} />}
            title="No saved versions yet"
            detail="Press Save in the title bar to create the first one. The slot name is yours to choose — main, experiment, v2, whatever fits."
          />
        ) : null}

        {slots.map((slot, index) => {
          const isActive = slot.name === activeSlot
          return (
            <motion.div
              key={slot.name}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03, duration: 0.2 }}
              className={cn(
                'mb-2 flex items-center gap-2 rounded-lg border p-2.5',
                isActive ? 'border-accent-500/40 bg-accent-500/8' : 'border-ink-700 bg-ink-850',
              )}
            >
              <FolderGit2 size={14} className={isActive ? 'text-accent-500' : 'text-ink-300'} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-ink-50">{slot.name}</p>
                <p className="truncate text-xs text-ink-300">{slot.path}</p>
              </div>

              {isActive ? (
                <Badge tone={dirty ? 'warn' : 'accent'}>{dirty ? 'unsaved' : 'open'}</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="subtle"
                  disabled={opening !== null}
                  onClick={async () => {
                    if (
                      dirty &&
                      !window.confirm(
                        `You have unsaved changes in "${activeSlot}". Opening "${slot.name}" will discard them. Continue?`,
                      )
                    ) {
                      return
                    }
                    setOpening(slot.name)
                    try {
                      await loadSlot(slot.name)
                    } catch (failure) {
                      toast({
                        tone: 'error',
                        title: `Could not open ${slot.name}`,
                        detail: failure instanceof Error ? failure.message : String(failure),
                      })
                    } finally {
                      setOpening(null)
                    }
                  }}
                >
                  {opening === slot.name ? <Spinner /> : 'Open'}
                </Button>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
