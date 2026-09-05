/**
 * The preset inbox.
 *
 * This is the hand-off point for work done elsewhere: another tool writes a
 * `.json` preset into `preset/` in the project repo, and it shows up here.
 * Nothing is applied automatically — a preset sits in the inbox until you press
 * Apply, and only then is it merged into the active save and archived.
 */

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, Download, Inbox, RefreshCw } from 'lucide-react'

import { Badge, Button, EmptyState, Spinner, cn } from '../../app/ui/primitives'
import { validatePreset } from '../../core/presets/format'
import type { PresetFile } from '../../core/presets/format'
import { allKinds } from '../../core/registry/types'
import type { PresetFile as RepoPresetFile } from '../../integrations/github/projectRepo'
import { projectRepo } from '../../state/services'
import { useProject } from '../../state/project'
import { useSettings, repoConfigured } from '../../state/settings'

interface InboxEntry {
  file: RepoPresetFile
  preset: PresetFile | null
  errors: string[]
  warnings: string[]
}

export function PresetInbox() {
  const settings = useSettings()
  const configured = repoConfigured(settings)
  const { applyPresetFile, toast } = useProject()

  const [entries, setEntries] = useState<InboxEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!configured) return
    setLoading(true)
    setError(null)
    try {
      const kinds = new Set(allKinds().map((k) => k.id))
      const files = await projectRepo.listPresets()
      const loaded: InboxEntry[] = []
      for (const file of files) {
        try {
          const raw = await projectRepo.readPreset(file.path)
          const validation = validatePreset(raw, kinds)
          loaded.push({
            file,
            preset: validation.ok ? (raw as PresetFile) : null,
            errors: validation.errors,
            warnings: validation.warnings,
          })
        } catch (failure) {
          loaded.push({
            file,
            preset: null,
            errors: [failure instanceof Error ? failure.message : String(failure)],
            warnings: [],
          })
        }
      }
      setEntries(loaded)
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
          icon={<Inbox size={22} />}
          title="No project repository yet"
          detail="The inbox reads preset/ from your project repo. Fill in the GitHub settings and it will start listing what is waiting there."
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ink-800 px-2 py-1.5">
        <span className="flex-1 text-xs uppercase tracking-[0.14em] text-ink-300">
          preset/ · {settings.githubOwner}/{settings.githubRepo}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void refresh()}
          disabled={loading}
          title="Refresh"
        >
          {loading ? <Spinner /> : <RefreshCw size={12} />}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {error ? (
          <div className="flex gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs leading-relaxed text-rose-500">
            <AlertTriangle size={14} className="mt-px shrink-0" />
            {error}
          </div>
        ) : null}

        {!loading && entries.length === 0 && !error ? (
          <EmptyState
            icon={<Inbox size={22} />}
            title="Inbox is empty"
            detail="Ask Claude Code (or any other tool) to write a preset JSON into preset/ in the project repo, then refresh. docs/AI_ASSIST.md describes the format."
          />
        ) : null}

        <AnimatePresence initial={false}>
          {entries.map((entry) => (
            <motion.article
              key={entry.file.path}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className={cn(
                'mb-2 rounded-lg border p-2.5',
                entry.errors.length > 0
                  ? 'border-rose-500/40 bg-rose-500/5'
                  : 'border-ink-700 bg-ink-850',
              )}
            >
              <header className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-xs font-medium text-ink-50">
                    {entry.preset?.label ?? entry.file.name}
                  </h4>
                  <p className="truncate font-mono text-xs text-ink-300">{entry.file.path}</p>
                </div>
                {entry.preset ? (
                  <Badge tone="accent">{entry.preset.nodes.length} nodes</Badge>
                ) : (
                  <Badge tone="danger">invalid</Badge>
                )}
              </header>

              {entry.preset?.description ? (
                <p className="mt-1.5 text-xs leading-relaxed text-ink-300">
                  {entry.preset.description}
                </p>
              ) : null}

              {entry.errors.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {entry.errors.map((message) => (
                    <li key={message} className="text-[10.5px] leading-relaxed text-rose-500">
                      {message}
                    </li>
                  ))}
                </ul>
              ) : null}

              {entry.warnings.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {entry.warnings.map((message) => (
                    <li key={message} className="text-[10.5px] leading-relaxed text-amber-500">
                      {message}
                    </li>
                  ))}
                </ul>
              ) : null}

              {entry.preset ? (
                <footer className="mt-2.5 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={applying !== null}
                    icon={applying === entry.file.path ? <Spinner /> : <Download size={12} />}
                    onClick={async () => {
                      setApplying(entry.file.path)
                      try {
                        const report = await applyPresetFile(entry.preset!)
                        // Archiving happens after the merge, so a failure here
                        // never leaves the inbox claiming work that was not done.
                        await projectRepo.archivePreset(
                          entry.file,
                          `Applied to the active save: ${report.changes
                            .map((c) => `${c.action} ${c.kind}:${c.name}`)
                            .join(', ')}`,
                        )
                        toast({
                          tone: 'success',
                          title: `Applied ${entry.preset!.label}`,
                          detail: `${report.changes.length} pieces of content · moved to preset/applied/`,
                        })
                        await refresh()
                      } catch (failure) {
                        toast({
                          tone: 'error',
                          title: 'Could not finish applying the preset',
                          detail: failure instanceof Error ? failure.message : String(failure),
                        })
                      } finally {
                        setApplying(null)
                      }
                    }}
                  >
                    Apply to active save
                  </Button>
                  <span className="text-xs text-ink-300">
                    Moves the file to preset/applied/
                  </span>
                </footer>
              ) : null}

              {entry.preset?.notes && entry.preset.notes.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1 border-l border-ink-700 pl-2">
                  {entry.preset.notes.map((note) => (
                    <li key={note} className="flex gap-1.5 text-[10.5px] leading-relaxed text-ink-300">
                      <Check size={10} className="mt-0.5 shrink-0" />
                      {note}
                    </li>
                  ))}
                </ul>
              ) : null}
            </motion.article>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
