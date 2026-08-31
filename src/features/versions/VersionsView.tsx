/**
 * Save slots and the changelog.
 *
 * A slot is a complete project model stored in this browser, so switching
 * between them is switching between whole versions of the add-on rather than
 * diffing a single file. Because that storage is local and only local, this
 * panel is also where backups go in and out.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Archive,
  Boxes,
  Download,
  History,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'

import { Badge, Button, EmptyState, Spinner, cn } from '../../app/ui/primitives'
import type { SaveSlot } from '../../core/model/types'
import { downloadBlob } from '../../core/export/mcaddon'
import type { ChangelogEntry } from '../../integrations/local/workspace'
import { workspace } from '../../state/services'
import { useProject } from '../../state/project'
import { deleteSlot, loadSlot } from '../save-export/actions'
import { downloadProjectBackup, downloadSlotBackup, importBackup } from '../save-export/backup'

function relative(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(delta / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function VersionsView() {
  const { project, activeSlot, dirty, toast } = useProject()

  const [slots, setSlots] = useState<SaveSlot[]>([])
  const [log, setLog] = useState<ChangelogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSlots(await workspace.listSlots())
      setLog((await workspace.readChangelog()).slice(0, 12))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const report = (failure: unknown, title: string) =>
    toast({
      tone: 'error',
      title,
      detail: failure instanceof Error ? failure.message : String(failure),
    })

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ink-800 px-2 py-1.5">
        <span className="flex-1 truncate text-[10px] uppercase tracking-[0.14em] text-ink-300">
          saved in this browser
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => importRef.current?.click()}
          title="Import a backup .zip"
        >
          <Upload size={12} />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Spinner /> : <RefreshCw size={12} />}
        </Button>
        <input
          ref={importRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            setPending('import')
            try {
              const result = await importBackup(file)
              await refresh()
              toast({
                tone: result.missing.length > 0 ? 'warning' : 'success',
                title: `Imported into "${result.slot}"`,
                detail:
                  result.missing.length > 0
                    ? `${result.assetCount} textures restored; missing: ${result.missing.join(', ')}`
                    : `${result.project.nodes.length} piece${
                        result.project.nodes.length === 1 ? '' : 's'
                      } of content · ${result.assetCount} textures`,
              })
            } catch (failure) {
              report(failure, 'Could not import that backup')
            } finally {
              setPending(null)
            }
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {error ? (
          <div className="mb-2 flex gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 p-2.5 text-[11px] leading-relaxed text-rose-500">
            <AlertTriangle size={14} className="mt-px shrink-0" />
            {error}
          </div>
        ) : null}

        {!loading && slots.length === 0 && !error ? (
          <EmptyState
            icon={<Archive size={22} />}
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
                'mb-2 rounded-lg border p-2.5',
                isActive ? 'border-accent-500/40 bg-accent-500/8' : 'border-ink-700 bg-ink-850',
              )}
            >
              <div className="flex items-center gap-2">
                <Boxes size={14} className={isActive ? 'text-accent-500' : 'text-ink-400'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-ink-50">{slot.name}</p>
                  <p className="truncate text-[10px] text-ink-400">
                    {relative(slot.updatedAt)} · {slot.nodeCount} content · {slot.assetCount}{' '}
                    textures
                  </p>
                </div>

                {isActive ? (
                  <Badge tone={dirty ? 'warn' : 'accent'}>{dirty ? 'unsaved' : 'open'}</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="subtle"
                    disabled={pending !== null}
                    onClick={async () => {
                      if (
                        dirty &&
                        !window.confirm(
                          `You have unsaved changes in "${activeSlot}". Opening "${slot.name}" will discard them. Continue?`,
                        )
                      ) {
                        return
                      }
                      setPending(slot.name)
                      try {
                        await loadSlot(slot.name)
                      } catch (failure) {
                        report(failure, `Could not open ${slot.name}`)
                      } finally {
                        setPending(null)
                      }
                    }}
                  >
                    {pending === slot.name ? <Spinner /> : 'Open'}
                  </Button>
                )}
              </div>

              {slot.changelog ? (
                <p className="mt-1.5 line-clamp-2 border-l border-ink-700 pl-2 text-[10.5px] leading-relaxed text-ink-300">
                  {slot.changelog}
                </p>
              ) : null}

              <div className="mt-2 flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending !== null}
                  icon={<Download size={11} />}
                  title="Download a backup .zip of this slot"
                  onClick={async () => {
                    setPending(`backup:${slot.name}`)
                    try {
                      const result = await downloadSlotBackup(slot.name)
                      toast({
                        tone: 'success',
                        title: `Backed up ${slot.name}`,
                        detail: `${result.fileName} · ${result.assetCount} textures · ${(
                          result.bytes / 1024
                        ).toFixed(0)} KB`,
                      })
                    } catch (failure) {
                      report(failure, `Could not back up ${slot.name}`)
                    } finally {
                      setPending(null)
                    }
                  }}
                >
                  Backup
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending !== null}
                  icon={<Trash2 size={11} />}
                  title="Delete this slot from local storage"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `Delete "${slot.name}"? It is stored only in this browser, so this cannot be undone — download a backup first if you may want it back.`,
                      )
                    ) {
                      return
                    }
                    setPending(`delete:${slot.name}`)
                    try {
                      await deleteSlot(slot.name)
                      await refresh()
                    } catch (failure) {
                      report(failure, `Could not delete ${slot.name}`)
                    } finally {
                      setPending(null)
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </motion.div>
          )
        })}

        <div className="mt-3 flex items-center gap-2 border-t border-ink-800 px-1 pt-3">
          <History size={12} className="text-ink-400" />
          <span className="flex-1 text-[10px] uppercase tracking-[0.14em] text-ink-300">
            changelog
          </span>
          <Button
            size="sm"
            variant="ghost"
            title="Download CHANGELOG.md"
            disabled={log.length === 0}
            onClick={async () => {
              const markdown = await workspace.changelogMarkdown()
              downloadBlob(new Blob([markdown], { type: 'text/markdown' }), 'CHANGELOG.md')
            }}
          >
            <Download size={12} />
          </Button>
        </div>

        {log.length === 0 ? (
          <p className="px-1 py-2 text-[11px] leading-relaxed text-ink-400">
            Every Save and Export writes an entry here.
          </p>
        ) : (
          <ol className="flex flex-col gap-2 px-1 py-2">
            {log.map((entry) => (
              <li key={entry.id} className="border-l border-ink-700 pl-2">
                <p className="text-[11px] font-medium text-ink-100">{entry.title}</p>
                <p className="text-[10px] text-ink-400">{relative(entry.at)}</p>
                <p className="mt-0.5 line-clamp-3 text-[10.5px] leading-relaxed text-ink-300">
                  {entry.body}
                </p>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-2 rounded-lg border border-ink-700 bg-ink-850 p-2.5">
          <p className="text-[10.5px] leading-relaxed text-ink-300">
            Saves live in this browser's storage. Clearing site data deletes them — keep a backup
            .zip of anything you care about.
          </p>
          <Button
            size="sm"
            variant="subtle"
            className="mt-2"
            disabled={pending !== null}
            icon={<Download size={11} />}
            onClick={async () => {
              setPending('backup:open')
              try {
                const result = await downloadProjectBackup(activeSlot, project)
                toast({
                  tone: 'success',
                  title: 'Backed up the open project',
                  detail: `${result.fileName} · ${result.assetCount} textures`,
                })
              } catch (failure) {
                report(failure, 'Could not build the backup')
              } finally {
                setPending(null)
              }
            }}
          >
            Back up what is open
          </Button>
        </div>
      </div>
    </div>
  )
}
