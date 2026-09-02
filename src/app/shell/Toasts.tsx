/**
 * Transient notifications. Errors stay longer and are dismissible; everything
 * else fades on its own.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

import { cn } from '../ui/primitives'
import { useProject } from '../../state/project'

const TONE = {
  info: { icon: Info, className: 'border-ink-600 text-ink-100', accent: 'text-accent-500' },
  success: { icon: CheckCircle2, className: 'border-mint-500/40 text-ink-50', accent: 'text-mint-500' },
  warning: { icon: AlertTriangle, className: 'border-amber-500/40 text-ink-50', accent: 'text-amber-500' },
  error: { icon: XCircle, className: 'border-rose-500/50 text-ink-50', accent: 'text-rose-500' },
} as const

/** Spoken prefix, so "error" and "success" do not depend on the icon's colour. */
const TONE_LABEL = {
  info: 'Note',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
} as const

export function Toasts() {
  const { toasts, dismissToast } = useProject()

  return (
    /*
     * One persistent live region, mounted whether or not it holds anything:
     * a region created at the same moment as its first message is often
     * missed entirely by screen readers.
     */
    <div
      role="region"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-12 right-4 z-40 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const tone = TONE[toast.tone]
          const Icon = tone.icon
          return (
            <motion.div
              key={toast.id}
              // Errors interrupt; everything else waits for a gap in speech.
              role={toast.tone === 'error' ? 'alert' : 'status'}
              aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 460, damping: 36 }}
              className={cn(
                'pointer-events-auto flex gap-2.5 rounded-lg border bg-ink-850/95 p-3 shadow-float backdrop-blur',
                tone.className,
              )}
            >
              <Icon size={16} aria-hidden="true" className={cn('mt-px shrink-0', tone.accent)} />
              <div className="min-w-0 flex-1">
                {/* Spoken before the title so the tone is not carried by colour alone. */}
                <span className="sr-only">{TONE_LABEL[toast.tone]}: </span>
                <p className="text-sm font-medium">{toast.title}</p>
                {toast.detail ? (
                  <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-ink-300">
                    {toast.detail}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label={`Dismiss: ${toast.title}`}
                className={cn(
                  'tap-target grid size-6 shrink-0 place-items-center self-start rounded text-ink-300',
                  'transition-colors [transition-duration:var(--duration-state)]',
                  'hover:bg-ink-700 hover:text-ink-50',
                )}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
