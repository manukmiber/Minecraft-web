/**
 * The preset inbox.
 *
 * This is the hand-off point for work done elsewhere: another tool (Claude
 * Code, a script, a friend) writes a `.json` preset, you drop the file here,
 * and it waits. Nothing is applied automatically — a preset sits in the inbox
 * until you press Apply, and only then is it merged into the open project and
 * marked applied.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, Download, Inbox, RefreshCw, Trash2, Upload } from 'lucide-react'

import { Badge, Button, EmptyState, Spinner, cn } from '../../app/ui/primitives'
import { validatePreset } from '../../core/presets/format'
import type { PresetFile } from '../../core/presets/format'
import { allKinds } from '../../core/registry/types'
import type { InboxPreset } from '../../integrations/local/workspace'
import { workspace } from '../../state/services'
import { useProject } from '../../state/project'

interface InboxEntry {
  stored: InboxPreset
  preset: PresetFile | null
  errors: string[]
  warnings: string[]
}

function describe(stored: InboxPreset): InboxEntry {
  const kinds = new Set(allKinds().map((k) => k.id))
  const validation = validatePreset(stored.raw, kinds)
  return {
    stored,
    preset: validation.ok ? (stored.raw as PresetFile) : null,
    errors: validation.errors,
    warnings: validation.warnings,
  }
}

export function PresetInbox() {
  const { applyPresetFile, toast } = useProject()

  const [entries, setEntries] = useState<InboxEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setEntries((await workspace.listPresets()).map(describe))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const accept = async (files: FileList | File[] | null) => {
    const list = [...(files ?? [])].filter((file) => file.name.endsWith('.json'))
    if (list.length === 0) {
      toast({ tone: 'warning', title: 'Presets are .json files', detail: 'Nothing was added.' })
      return
    }
    setBusy('adding')
    try {
      for (const file of list) await workspace.addPreset(file)
      await refresh()
      toast({
        tone: 'success',
        title: `Added ${list.length} preset${list.length === 1 ? '' : 's'} to the inbox`,
        detail: 'Review it, then apply it to the open project.',
      })
    } catch (failure) {
      toast({
        tone: 'error',
        title: 'Could not read that preset',
        detail: failure instanceof Error ? failure.message : String(failure),
      })
    } finally {
      setBusy(null)
    }
  }

  const pending = entries.filter((entry) => !entry.stored.appliedAt)
  const applied = entries.filter((entry) => entry.stored.appliedAt)

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        void accept(event.dataTransfer.files)
      }}
    >
      <div className="flex items-center gap-2 border-b border-ink-800 px-2 py-1.5">
        <span className="flex-1 text-[10px] uppercase tracking-[0.14em] text-ink-300">
          preset inbox · local
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => inputRef.current?.click()}
          title="Add preset .json files"
        >
          <Upload size={12} />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Spinner /> : <RefreshCw size={12} />}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          multiple
          className="hidden"
          onChange={(event) => {
            // The FileList is emptied by resetting the input, so the File
            // objects have to be taken out of it first.
            const files = [...(event.target.files ?? [])]
            event.target.value = ''
            void accept(files)
          }}
        />
      </div>

      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto p-2 transition-colors',
          dragging && 'bg-accent-500/8',
        )}
      >
        {!loading && pending.length === 0 ? (
          <EmptyState
            icon={<Inbox size={22} />}
            title="Inbox is empty"
            detail="Drop preset .json files here — or use the upload button. Ask Claude Code (or any other tool) to write one; docs/AI_ASSIST.md describes the format."
          />
        ) : null}

        <AnimatePresence initial={false}>
          {pending.map((entry) => (
            <motion.article
              key={entry.stored.id}
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
                    {entry.preset?.label ?? entry.stored.name}
                  </h4>
                  <p className="truncate font-mono text-[10px] text-ink-400">{entry.stored.name}</p>
                </div>
                {entry.preset ? (
                  <Badge tone="accent">{entry.preset.nodes.length} nodes</Badge>
                ) : (
                  <Badge tone="danger">invalid</Badge>
                )}
              </header>

              {entry.preset?.description ? (
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-300">
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

              <footer className="mt-2.5 flex items-center gap-2">
                {entry.preset ? (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy !== null}
                    icon={busy === entry.stored.id ? <Spinner /> : <Download size={12} />}
                    onClick={async () => {
                      setBusy(entry.stored.id)
                      try {
                        const report = applyPresetFile(entry.preset!)
                        // Marking happens after the merge, so a failure here
                        // never leaves the inbox claiming work that was not done.
                        await workspace.markPresetApplied(
                          entry.stored.id,
                          `Applied to the open project: ${report.changes
                            .map((c) => `${c.action} ${c.kind}:${c.name}`)
                            .join(', ')}`,
                        )
                        toast({
                          tone: 'success',
                          title: `Applied ${entry.preset!.label}`,
                          detail: `${report.changes.length} piece${
                            report.changes.length === 1 ? '' : 's'
                          } of content · save the project to keep it`,
                        })
                        await refresh()
                      } catch (failure) {
                        toast({
                          tone: 'error',
                          title: 'Could not finish applying the preset',
                          detail: failure instanceof Error ? failure.message : String(failure),
                        })
                      } finally {
                        setBusy(null)
                      }
                    }}
                  >
                    Apply to this project
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  icon={<Trash2 size={11} />}
                  onClick={async () => {
                    await workspace.removePreset(entry.stored.id)
                    await refresh()
                  }}
                >
                  Discard
                </Button>
              </footer>

              {entry.preset?.notes && entry.preset.notes.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1 border-l border-ink-700 pl-2">
                  {entry.preset.notes.map((note) => (
                    <li
                      key={note}
                      className="flex gap-1.5 text-[10.5px] leading-relaxed text-ink-400"
                    >
                      <Check size={10} className="mt-0.5 shrink-0" />
                      {note}
                    </li>
                  ))}
                </ul>
              ) : null}
            </motion.article>
          ))}
        </AnimatePresence>

        {applied.length > 0 ? (
          <section className="mt-3 border-t border-ink-800 pt-3">
            <div className="flex items-center gap-2 px-1 pb-2">
              <span className="flex-1 text-[10px] uppercase tracking-[0.14em] text-ink-300">
                applied · {applied.length}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await workspace.clearAppliedPresets()
                  await refresh()
                }}
              >
                Clear
              </Button>
            </div>
            <ul className="flex flex-col gap-1 px-1">
              {applied.map((entry) => (
                <li
                  key={entry.stored.id}
                  className="flex items-center gap-1.5 text-[10.5px] text-ink-400"
                >
                  <Check size={10} className="shrink-0 text-mint-500" />
                  <span className="truncate font-mono">{entry.stored.name}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {dragging ? (
          <div className="pointer-events-none mt-2 flex items-center gap-2 rounded-md border border-dashed border-accent-500/50 p-2.5 text-[11px] text-accent-400">
            <AlertTriangle size={12} />
            Drop .json presets to add them to the inbox
          </div>
        ) : null}
      </div>
    </div>
  )
}
