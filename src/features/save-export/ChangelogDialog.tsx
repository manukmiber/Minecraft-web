/**
 * The changelog modal shared by Save and Export.
 *
 * Free-form on purpose — a textarea, not a form of Added/Fixed/Changed boxes.
 * The one rule is that it cannot be empty.
 */

import { useEffect, useId, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, GitCommit, Package, X } from 'lucide-react'

import { Button, Spinner, cn } from '../../app/ui/primitives'
import { useModalA11y } from '../../app/ui/useModalA11y'

export type ChangelogIntent = 'save' | 'export'

/** Mac shows ⌘, everything else shows Ctrl. */
const IS_APPLE =
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)

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

  const fieldId = useId()
  const slotId = `${fieldId}-slot`
  const noteId = `${fieldId}-note`
  const errorId = `${fieldId}-error`
  const titleId = `${fieldId}-title`
  const descriptionId = `${fieldId}-description`

  // Escape, a contained Tab cycle, and focus handed back on close. Blocked
  // while a save or export is in flight, so the dialog cannot vanish mid-write.
  const dialogRef = useModalA11y<HTMLDivElement>(open, () => {
    if (!busy) onCancel()
  })

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
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.985 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="w-full max-w-lg overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-float"
          >
            <header className="flex items-center gap-2.5 border-b border-ink-700 px-4 py-3">
              {intent === 'save' ? (
                <GitCommit size={18} aria-hidden="true" className="text-accent-500" />
              ) : (
                <Package size={18} aria-hidden="true" className="text-amber-500" />
              )}
              <div className="flex-1">
                <h2 id={titleId} className="text-base font-semibold text-ink-50">
                  {intent === 'save' ? 'Save this version' : 'Export .mcaddon'}
                </h2>
                <p id={descriptionId} className="text-xs text-ink-300">
                  {intent === 'save'
                    ? 'Commits the model, its textures and this note to the project repo.'
                    : 'Builds the archive in your browser and records it in the changelog.'}
                </p>
              </div>
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className={cn(
                  'tap-target grid size-8 shrink-0 place-items-center rounded text-ink-300',
                  'transition-colors [transition-duration:var(--duration-state)]',
                  'hover:bg-ink-750 hover:text-ink-100 disabled:pointer-events-none disabled:opacity-45',
                )}
                aria-label="Close without saving"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>

            <div className="flex flex-col gap-3 px-4 py-4">
              {intent === 'save' ? (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={slotId} className="text-xs font-medium text-ink-100">
                    Save slot
                  </label>
                  <input
                    id={slotId}
                    value={slot}
                    onChange={(event) => onSlotChange(event.target.value)}
                    placeholder="main"
                    aria-describedby={`${slotId}-help`}
                    className="h-9 w-full rounded-md border border-edge bg-ink-900 px-2.5 font-mono text-sm text-ink-50 placeholder:text-ink-300 focus:border-accent-500 focus:outline-none focus:shadow-[0_0_0_3px_var(--color-accent-glow)]"
                  />
                  <span id={`${slotId}-help`} className="text-xs leading-relaxed text-ink-300">
                    Saving to a new name creates a separate version you can switch between.
                  </span>
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <label htmlFor={noteId} className="text-xs font-medium text-ink-100">
                  What changed?
                </label>
                <textarea
                  id={noteId}
                  autoFocus
                  required
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
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
                  className={cn(
                    'w-full resize-y rounded-md border bg-ink-900 px-2.5 py-2 text-sm leading-relaxed',
                    'text-ink-50 placeholder:text-ink-300 focus:outline-none',
                    error
                      ? 'border-rose-500 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-rose-500)_28%,transparent)]'
                      : 'border-edge focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--color-accent-glow)]',
                  )}
                />
              </div>

              {intent === 'export' ? (
                <label className="tap-target flex min-h-9 cursor-pointer items-center gap-2.5 text-sm text-ink-200">
                  <input
                    type="checkbox"
                    checked={commitExport}
                    onChange={(event) => onCommitExportChange(event.target.checked)}
                    className="size-4 shrink-0 accent-[var(--color-accent-500)]"
                  />
                  Also commit the .mcaddon to the project repo
                </label>
              ) : null}

              {error ? (
                <div
                  id={errorId}
                  role="alert"
                  className={cn(
                    'flex gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-2',
                    'text-xs leading-relaxed text-rose-500',
                  )}
                >
                  <AlertTriangle size={15} aria-hidden="true" className="mt-px shrink-0" />
                  <span className="whitespace-pre-wrap">{error}</span>
                </div>
              ) : null}
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-ink-700 bg-ink-900/60 px-4 py-3">
              <span className="text-xs text-ink-300">
                <kbd className="font-mono">{IS_APPLE ? '\u2318' : 'Ctrl'}</kbd> +{' '}
                <kbd className="font-mono">Enter</kbd> to confirm
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onCancel} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={submit}
                  disabled={busy}
                  // Says the work started, for anyone who cannot see the spinner.
                  aria-busy={busy}
                  icon={busy ? <Spinner /> : undefined}
                >
                  {busy
                    ? intent === 'save'
                      ? 'Saving…'
                      : 'Building…'
                    : intent === 'save'
                      ? 'Save version'
                      : 'Build & export'}
                </Button>
              </div>
            </footer>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
