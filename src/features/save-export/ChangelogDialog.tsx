/**
 * The changelog modal shared by Save and Export.
 *
 * Free-form on purpose — a textarea, not a form of Added/Fixed/Changed boxes.
 * The one rule is that it cannot be empty.
 */

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, GitCommit, Package, X } from 'lucide-react'

import { Button, Spinner, cn } from '../../app/ui/primitives'

export type ChangelogIntent = 'save' | 'export'

export interface ChangelogDialogProps {
  open: boolean
  intent: ChangelogIntent
  slot: string
  /** Extra option shown for exports. */
  commitExport: boolean
  onCommitExportChange(value: boolean): void
  onSlotChange(value: string): void
  onCancel(): void
  onConfirm(changelog: string): Promise<void>
}

export function ChangelogDialog({
  open,
  intent,
  slot,
  commitExport,
  onCommitExportChange,
  onSlotChange,
  onCancel,
  onConfirm,
}: ChangelogDialogProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setText('')
      setError(null)
      setBusy(false)
    }
  }, [open, intent])

  const submit = async () => {
    if (!text.trim()) {
      setError('Say what changed — even one line is enough.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onConfirm(text)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) onCancel()
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={intent === 'save' ? 'Save to a slot' : 'Export the add-on'}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.985 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="w-full max-w-lg overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-float"
          >
            <header className="flex items-center gap-2.5 border-b border-ink-700 px-4 py-3">
              {intent === 'save' ? (
                <GitCommit size={16} className="text-accent-500" />
              ) : (
                <Package size={16} className="text-amber-500" />
              )}
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-ink-50">
                  {intent === 'save' ? 'Save this version' : 'Export .mcaddon'}
                </h2>
                <p className="text-[11px] text-ink-300">
                  {intent === 'save'
                    ? 'Commits the model, its textures and this note to the project repo.'
                    : 'Builds the archive in your browser and records it in the changelog.'}
                </p>
              </div>
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="rounded p-1 text-ink-400 transition-colors hover:bg-ink-750 hover:text-ink-100"
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </header>

            <div className="flex flex-col gap-3 px-4 py-4">
              {intent === 'save' ? (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium text-ink-100">Save slot</span>
                  <input
                    value={slot}
                    onChange={(event) => onSlotChange(event.target.value)}
                    placeholder="main"
                    className="h-8 w-full rounded-md border border-ink-600 bg-ink-900 px-2.5 font-mono text-xs text-ink-50 focus:border-accent-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-ink-300">
                    Saving to a new name creates a separate version you can switch between.
                  </span>
                </label>
              ) : null}

              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-ink-100">What changed?</span>
                <textarea
                  autoFocus
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void submit()
                  }}
                  rows={5}
                  placeholder={
                    intent === 'save'
                      ? 'Added rice growth stages and wired the crow to avoid scarecrows…'
                      : 'First playable build with the cooking recipes…'
                  }
                  className="w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-2.5 py-2 text-xs leading-relaxed text-ink-50 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none"
                />
              </label>

              {intent === 'export' ? (
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-200">
                  <input
                    type="checkbox"
                    checked={commitExport}
                    onChange={(event) => onCommitExportChange(event.target.checked)}
                    className="size-3.5 accent-[var(--color-accent-500)]"
                  />
                  Also commit the .mcaddon to the project repo
                </label>
              ) : null}

              {error ? (
                <div
                  className={cn(
                    'flex gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-2',
                    'text-[11px] leading-relaxed text-rose-500',
                  )}
                >
                  <AlertTriangle size={14} className="mt-px shrink-0" />
                  <span className="whitespace-pre-wrap">{error}</span>
                </div>
              ) : null}
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-ink-700 bg-ink-900/60 px-4 py-3">
              <span className="text-[10px] uppercase tracking-wider text-ink-400">
                Ctrl/Cmd + Enter
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onCancel} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={submit} disabled={busy}>
                  {busy ? <Spinner /> : null}
                  {intent === 'save' ? 'Save version' : 'Build & export'}
                </Button>
              </div>
            </footer>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
