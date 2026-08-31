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

export function Toasts() {
  const { toasts, dismissToast } = useProject()

  return (
    <div className="pointer-events-none fixed bottom-9 right-4 z-40 flex w-80 flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const tone = TONE[toast.tone]
          const Icon = tone.icon
          return (
            <motion.div
              key={toast.id}
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
              <Icon size={15} className={cn('mt-px shrink-0', tone.accent)} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">{toast.title}</p>
                {toast.detail ? (
                  <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-relaxed text-ink-300">
                    {toast.detail}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss"
                className="h-fit rounded p-0.5 text-ink-400 transition-colors hover:bg-ink-700 hover:text-ink-50"
              >
                <X size={12} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
