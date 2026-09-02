/**
 * Shared interface primitives.
 *
 * Small, unopinionated pieces that every panel builds from, so spacing, focus
 * rings and motion stay consistent across the app rather than being re-invented
 * per view.
 */

import {
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
} from 'react'
import { motion } from 'framer-motion'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  Bird,
  Box,
  Castle,
  Hammer,
  Package,
  Shuffle,
  Sprout,
  Trees,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'

export function cn(...parts: Array<string | false | null | undefined>): string {
  return twMerge(clsx(parts))
}

/** Icons referenced by name from the kind registry. */
const KIND_ICONS: Record<string, LucideIcon> = {
  Box,
  Package,
  Sprout,
  Bird,
  Hammer,
  Trees,
  Shuffle,
  Castle,
}

export function kindIcon(name: string): LucideIcon {
  return KIND_ICONS[name] ?? Box
}

export const ACCENT_CLASS: Record<string, string> = {
  accent: 'text-accent-500',
  mint: 'text-mint-500',
  amber: 'text-amber-500',
  rose: 'text-rose-500',
  violet: 'text-violet-500',
}

export const ACCENT_BG: Record<string, string> = {
  accent: 'bg-accent-500/12 border-accent-500/30',
  mint: 'bg-mint-500/12 border-mint-500/30',
  amber: 'bg-amber-500/12 border-amber-500/30',
  rose: 'bg-rose-500/12 border-rose-500/30',
  violet: 'bg-violet-500/12 border-violet-500/30',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'subtle' | 'danger'
  size?: 'sm' | 'md'
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'subtle', size = 'md', icon, className, children, ...rest },
  ref,
) {
  // An icon-only button has no text to name it, so it must carry its own label.
  const iconOnly = icon !== undefined && children === undefined
  if (import.meta.env.DEV && iconOnly && !rest['aria-label'] && !rest['aria-labelledby']) {
    console.warn('Button: icon-only buttons need an aria-label.')
  }

  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      className={cn(
        'tap-target inline-flex items-center justify-center gap-2 rounded-md border font-medium',
        // Colour and elevation only: nothing here changes the element's box,
        // so a press never nudges the toolbar around it.
        'transition-[background-color,border-color,color,box-shadow,opacity]',
        '[transition-duration:var(--duration-state)] [transition-timing-function:var(--ease-swift)]',
        // Pressed feedback lands inside 90ms without moving neighbours.
        'active:bg-ink-600/60 active:[transition-duration:var(--duration-tap)]',
        'disabled:pointer-events-none disabled:opacity-45',
        'focus-visible:focus-ring',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-3.5 text-sm',
        iconOnly && (size === 'sm' ? 'w-8 px-0' : 'w-9 px-0'),
        variant === 'primary' &&
          'border-accent-500/60 bg-accent-500/18 text-accent-400 hover:bg-accent-500/28 hover:border-accent-500',
        variant === 'subtle' &&
          'border-edge bg-ink-750 text-ink-100 hover:bg-ink-700 hover:border-ink-300',
        variant === 'ghost' &&
          'border-transparent bg-transparent text-ink-200 hover:bg-ink-750 hover:text-ink-50',
        variant === 'danger' &&
          'border-rose-500/40 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20',
        className,
      )}
      {...rest}
    >
      {/* The glyph repeats what the label already says, so screen readers skip it. */}
      {icon ? (
        <span aria-hidden="true" className="grid shrink-0 place-items-center">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  )
})

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'good'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium tracking-wide uppercase',
        tone === 'neutral' && 'border-ink-600 bg-ink-800 text-ink-200',
        tone === 'accent' && 'border-accent-500/40 bg-accent-500/10 text-accent-400',
        tone === 'warn' && 'border-amber-500/40 bg-amber-500/10 text-amber-500',
        tone === 'danger' && 'border-rose-500/40 bg-rose-500/10 text-rose-500',
        tone === 'good' && 'border-mint-500/40 bg-mint-500/10 text-mint-500',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Sidebar / panel section with a sticky heading. */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col', className)}>
      <header className="sticky top-0 z-10 flex h-8 items-center justify-between gap-2 bg-ink-900/85 px-3 backdrop-blur">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-300">
          {title}
        </h3>
        {action}
      </header>
      <div className="px-2 pb-3">{children}</div>
    </section>
  )
}

export function EmptyState({
  icon,
  title,
  detail,
  action,
}: {
  icon?: ReactNode
  title: string
  detail?: string
  action?: ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-ink-600 px-4 py-8 text-center"
    >
      {icon ? (
        <div aria-hidden="true" className="text-ink-300">
          {icon}
        </div>
      ) : null}
      {/* One clear step up from the body copy, so the eye lands on the title. */}
      <p className="text-base font-semibold text-ink-50">{title}</p>
      {detail ? (
        // Held to a readable measure rather than running edge to edge.
        <p className="max-w-[42ch] text-xs leading-relaxed text-ink-200">{detail}</p>
      ) : null}
      {action}
    </motion.div>
  )
}

/**
 * Label + control + help text, the shape every wizard field uses.
 *
 * The label is always visible — a placeholder disappears the moment someone
 * types, which leaves them with no way back to what the field was for. Help and
 * error text sit directly under the control and are wired to it with
 * `aria-describedby`, so a screen reader reads the reason without hunting for a
 * summary at the top of the form.
 */
export function FieldRow({
  label,
  help,
  error,
  children,
  htmlFor,
}: {
  label: string
  help?: string
  error?: string | null
  children: ReactNode
  htmlFor?: string
}) {
  const generated = useId()
  const base = htmlFor ?? generated
  const helpId = `${base}-help`
  const errorId = `${base}-error`
  const describedBy = error ? errorId : help ? helpId : undefined

  // Wire the description onto the control itself when it is a single element,
  // which covers every input, select and textarea in the app.
  const control =
    describedBy && isValidElement(children)
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          'aria-describedby': [
            (children.props as Record<string, unknown>)['aria-describedby'],
            describedBy,
          ]
            .filter(Boolean)
            .join(' '),
          'aria-invalid': error ? true : (children.props as Record<string, unknown>)['aria-invalid'],
        })
      : children

  return (
    <div className="flex flex-col gap-1.5 py-2">
      <label htmlFor={htmlFor} className="text-xs font-medium tracking-wide text-ink-100">
        {label}
      </label>
      {control}
      {error ? (
        // Announced on arrival, and marked by an icon as well as colour.
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-xs leading-relaxed text-rose-500"
        >
          <TriangleAlert size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : help ? (
        <p id={helpId} className="text-xs leading-relaxed text-ink-300">
          {help}
        </p>
      ) : null}
    </div>
  )
}

export const inputClass = cn(
  'h-9 w-full rounded-md border border-edge bg-ink-850 px-2.5 text-sm text-ink-50',
  'placeholder:text-ink-300 transition-colors [transition-duration:var(--duration-state)]',
  'hover:border-ink-300 focus:border-accent-500 focus:outline-none focus:shadow-[0_0_0_3px_var(--color-accent-glow)]',
  // An invalid field is outlined as well as described, so the state does not
  // rest on colour alone.
  'aria-[invalid=true]:border-rose-500 aria-[invalid=true]:focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-rose-500)_28%,transparent)]',
  'disabled:cursor-not-allowed disabled:opacity-50',
)

/**
 * Busy indicator. Pass `label` when the spinner is the only sign that work is
 * happening; leave it off when adjacent text already says so.
 */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : 'true'}
      className={cn(
        'inline-block size-3.5 animate-spin rounded-full border-2 border-ink-500 border-t-accent-500',
        className,
      )}
    >
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  )
}
